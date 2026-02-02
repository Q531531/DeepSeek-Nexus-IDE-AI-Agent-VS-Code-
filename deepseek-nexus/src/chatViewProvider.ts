import * as vscode from 'vscode';
import { ChatProvider, ChatMessage } from './chatProvider';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'deepseek-nexus.chatView';

    private _view?: vscode.WebviewView;
    private _chatProvider: ChatProvider;
    private _conversationHistory: ChatMessage[] = [];
    private _abortController?: AbortController;
    private _isCancelled: boolean = false;
    private _lastEditor?: { content: string; language: string; fileName: string };
    private _messageHistory: Array<{type: 'userMessage' | 'assistantMessage', content: string, timestamp: number}> = [];
    private _currentStreamBuffer: string | null = null;
    private _currentStreamConversationId: string | null = null;
    private _lastSnapshotTime: number = 0;
    private _snapshotTimer: NodeJS.Timeout | undefined;
    private _virtualDocuments = new Map<string, string>();
    private _systemInstruction: ChatMessage = {
        role: 'system',
        content:
            '你是 VS Code 内的编码助手。需要给出可落盘的代码修改时，请用以下格式输出，并尽量给出“完整文件内容”（用于覆盖写入）：\n' +
            'FILE: 相对工作区路径\n' +
            '```语言\n' +
            '...文件完整内容...\n' +
            '```\n' +
            '可以输出多个 FILE 块。若不需要改文件，不要输出 FILE 块。'
    };

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {
        console.log('ChatViewProvider构造函数开始');
        try {
            this._chatProvider = new ChatProvider(_context);
            console.log('ChatProvider创建成功');
        } catch (error) {
            console.error('ChatProvider创建失败:', error);
            throw error;
        }
        console.log('ChatViewProvider构造函数完成');
        const provider: vscode.TextDocumentContentProvider = {
            provideTextDocumentContent: (uri: vscode.Uri) => this._virtualDocuments.get(uri.toString()) ?? ''
        };
        this._context.subscriptions.push(
            vscode.workspace.registerTextDocumentContentProvider('deepseek-nexus-original', provider),
            vscode.workspace.registerTextDocumentContentProvider('deepseek-nexus-preview', provider)
        );
        this._conversationHistory = [this._systemInstruction];
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        console.log('=== resolveWebviewView开始 ===');
        this._view = webviewView;

        console.log('设置webview选项...');
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };
        console.log('webview选项设置完成');

        // 暂时移除所有持久化逻辑，先确保基本功能正常
        console.log('DeepSeek Nexus: 基本模式 - 不使用持久化');

        console.log('开始生成webview HTML...');
        try {
            webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
            console.log('webview HTML设置成功');
        } catch (error) {
            console.error('webview HTML设置失败:', error);
        }

        // 首次渲染时主动推送会话快照，避免白屏与需切换两次（加入轻微防抖）
        this._scheduleSnapshot();
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                console.log('webview可见，重新推送会话快照');
                this._scheduleSnapshot();
            }
        });

        // Handle messages from webview
        console.log('设置webview消息监听器...');
        webviewView.webview.onDidReceiveMessage(
            message => {
                console.log('收到来自webview的消息:', message.type);
                switch (message.type) {
                    case 'ready':
                        console.log('webview ready, 发送会话快照');
                        this._scheduleSnapshot();
                        break;
                    case 'hello':
                        console.log('处理hello消息');
                        vscode.window.showInformationMessage('Hello from DeepSeek Nexus!');
                        break;
                    case 'sendMessage':
                        console.log('=== 收到sendMessage消息 ===');
                        console.log('消息内容:', message.content?.substring(0, 50) + '...');
                        console.log('includeCurrentFile参数:', message.includeCurrentFile);
                        console.log('includeWorkspace参数:', message.includeWorkspace);
                        console.log('conversationId:', message.conversationId);
                        this._handleChatMessage(message.content, message.conversationId, message.includeCurrentFile, message.includeWorkspace);
                        break;
                    case 'applyCode':
                        this._applyCodeToWorkspace(message.code, message.language);
                        break;
                    case 'applyEditsFromMessage':
                        this._applyEditsFromMessage(message.content);
                        break;
                    case 'stopGeneration':
                        this._isCancelled = true;
                        this._abortController?.abort();
                        break;
                    case 'clearConversation':
                        this._clearConversation();
                        break;
                    case 'refreshApiKey':
                        this._chatProvider.refreshClient();
                        break;
                    case 'updateModel':
                        vscode.workspace.getConfiguration('deepseek').update('model', message.model, true);
                        this._chatProvider.refreshClient();
                        vscode.window.showInformationMessage(`已切换模型：${message.model}`);
                        break;
                    case 'updateProvider':
                        this._updateProvider(message.provider);
                        break;
                    case 'hello':
                        vscode.window.showInformationMessage('Hello from DeepSeek Nexus!');
                        break;
                    case 'openSettings':
                        vscode.commands.executeCommand('workbench.action.openSettings', 'deepseek');
                        break;
                    case 'requestSettings':
                        this._sendSettingsSnapshot();
                        break;
                    case 'saveSettings':
                        this._saveKeys(message.keys);
                        break;
                }
            },
            undefined,
            []
        );
    }

    private _updateProvider(provider: string) {
        const config = vscode.workspace.getConfiguration('deepseek');
        const map: Record<string, { baseUrl: string; defaultModel: string }> = {
            siliconflow: { baseUrl: 'https://api.siliconflow.cn/v1', defaultModel: 'deepseek-ai/DeepSeek-V3' },
            openai: { baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' },
            openrouter: { baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'openrouter/auto' },
            moonshot: { baseUrl: 'https://api.moonshot.cn/v1', defaultModel: 'moonshot-v1-32k' }
        };
        const info = map[provider] || map['siliconflow'];
        config.update('provider', provider, true);
        config.update('baseUrl', info.baseUrl, true);
        if (!config.get('model')) {
            config.update('model', info.defaultModel, true);
        }
        this._chatProvider.refreshClient();
        vscode.window.showInformationMessage(`已切换服务商：${provider}`);
    }

    private _saveKeys(keys: { siliconflow?: string; openai?: string; openrouter?: string; moonshot?: string }) {
        const config = vscode.workspace.getConfiguration('deepseek');
        if (typeof keys.siliconflow === 'string') config.update('apiKeys.siliconflow', keys.siliconflow, true);
        if (typeof keys.openai === 'string') config.update('apiKeys.openai', keys.openai, true);
        if (typeof keys.openrouter === 'string') config.update('apiKeys.openrouter', keys.openrouter, true);
        if (typeof keys.moonshot === 'string') config.update('apiKeys.moonshot', keys.moonshot, true);
        this._chatProvider.refreshClient();
        vscode.window.showInformationMessage('已保存密钥配置');
    }

    private _sendSettingsSnapshot() {
        if (!this._view) return;
        const config = vscode.workspace.getConfiguration('deepseek');
        const provider = (config.get<string>('provider') || 'siliconflow');
        const model = (config.get<string>('model') || 'deepseek-ai/DeepSeek-V3');
        const apiKey = (config.get<string>('apiKey') || '');
        const keys = {
            siliconflow: config.get<string>('apiKeys.siliconflow') || apiKey || '',
            openai: config.get<string>('apiKeys.openai') || '',
            openrouter: config.get<string>('apiKeys.openrouter') || '',
            moonshot: config.get<string>('apiKeys.moonshot') || ''
        };
        this._view.webview.postMessage({
            type: 'configSnapshot',
            provider,
            model,
            keys
        });
    }

    private async _handleChatMessage(content: string, conversationId: string, includeCurrentFile?: boolean, includeWorkspace?: boolean) {
        console.log('=== _handleChatMessage 开始执行 ===');
        console.log('内容:', content?.substring(0, 100) + '...');
        console.log('includeCurrentFile:', includeCurrentFile);
        console.log('includeWorkspace:', includeWorkspace);
        console.log('conversationId:', conversationId);
        
        if (!content.trim()) {
            console.log('内容为空，退出处理');
            return;
        }

        const contextParts: string[] = [];
        if (includeCurrentFile) {
            console.log('=== 开始文件读取流程 ===');
            console.log('DeepSeek Nexus: includeCurrentFile为true，正在尝试获取当前文件内容...');
            try {
                const currentFileContent = await this._getCurrentFileContent();
                console.log('_getCurrentFileContent返回结果:', currentFileContent ? '有内容' : 'null');
                
                if (currentFileContent) {
                    console.log(`DeepSeek Nexus: 成功获取文件: ${currentFileContent.fileName}, 语言: ${currentFileContent.language}, 内容长度: ${currentFileContent.content.length}`);
                    contextParts.push(
                        `文件: ${currentFileContent.fileName}\n语言: ${currentFileContent.language}\n\n参考代码:\n\`\`\`${currentFileContent.language}\n${currentFileContent.content}\n\`\`\``
                    );
                    console.log('文件内容已成功添加到上下文');
                } else {
                    console.log('DeepSeek Nexus: _getCurrentFileContent返回null - 无法获取当前文件内容');
                    if (this._view) {
                        this._view.webview.postMessage({
                            type: 'contextWarning',
                            message: '未能读取当前文件：请先打开一个文件或选择一个编辑器标签页'
                        });
                    }
                }
            } catch (error) {
                console.log('DeepSeek Nexus: 获取文件内容时发生错误:', error);
                if (this._view) {
                    this._view.webview.postMessage({
                        type: 'contextWarning',
                        message: '文件读取失败，请检查文件权限'
                    });
                }
            }
        }

        if (includeWorkspace) {
            console.log('=== 开始工作区上下文读取流程 ===');
            try {
                const ws = await this._getWorkspaceContext();
                if (ws) {
                    contextParts.push(ws);
                } else if (this._view) {
                    this._view.webview.postMessage({
                        type: 'contextWarning',
                        message: '未能读取工作区：请用“打开文件夹”打开项目，或先打开一个文件后重试'
                    });
                }
            } catch (error) {
                console.log('DeepSeek Nexus: 获取工作区上下文失败:', error);
                if (this._view) {
                    this._view.webview.postMessage({
                        type: 'contextWarning',
                        message: '工作区读取失败，请检查文件权限'
                    });
                }
            }
        }

        const contextualContent = contextParts.length
            ? `${contextParts.join('\n\n---\n\n')}\n\n用户问题: ${content}`
            : content;

        // Add user message to conversation history
        this._conversationHistory.push({
            role: 'user',
            content: contextualContent
        });

        // Start streaming response
        try {
            let assistantResponse = '';
            let hasError = false;
            this._isCancelled = false;
            this._abortController = new AbortController();
            this._currentStreamBuffer = '';
            this._currentStreamConversationId = conversationId;

            await this._chatProvider.streamChatCompletion(
                this._conversationHistory,
                // onChunk callback
                (chunk: string) => {
                    if (this._isCancelled) return;
                    assistantResponse += chunk;
                    
                    // 移除实时更新，只在流式完成时保存
                    if (this._currentStreamBuffer !== null) {
                        this._currentStreamBuffer += chunk;
                    }
                    
                    if (this._view) {
                        this._view.webview.postMessage({
                            type: 'streamChunk',
                            content: chunk,
                            conversationId: conversationId
                        });
                    }
                },
                // onError callback
                (error: string) => {
                    hasError = true;
                    this._currentStreamBuffer = null;
                    this._currentStreamConversationId = null;
                },
                // onComplete callback
                () => {
                    if (!hasError && assistantResponse.trim()) {
                        this._conversationHistory.push({
                            role: 'assistant',
                            content: assistantResponse
                        });
                    }
                    this._currentStreamBuffer = null;
                    this._currentStreamConversationId = null;
                }
            );

            // 完成流式响应
            if (this._view && !this._isCancelled) {
                this._view.webview.postMessage({
                    type: 'streamComplete',
                    conversationId: conversationId
                });
            }

        } catch (error) {
            console.error('Streaming failed:', error);
        }
    }

    private _clearConversation() {
        this._conversationHistory = [this._systemInstruction];
        if (this._view) {
            this._view.webview.postMessage({
                type: 'conversationCleared'
            });
        }
    }

    private _parseFileEditsFromMessage(content: string): Array<{ relPath: string; language?: string; code: string }> {
        const edits: Array<{ relPath: string; language?: string; code: string }> = [];
        const re = /(^|\n)\s*FILE:\s*([^\n]+)\n```([a-zA-Z0-9_+-]+)?\n([\s\S]*?)```/g;
        let match: RegExpExecArray | null;
        while ((match = re.exec(content)) !== null) {
            const relPath = (match[2] || '').trim();
            const language = (match[3] || '').trim() || undefined;
            const code = (match[4] || '').replace(/\n$/, '');
            if (!relPath || !code) continue;
            edits.push({ relPath, language, code });
        }
        return edits;
    }

    private _sanitizeRelPath(relPath: string): string | null {
        const p = relPath.trim().replace(/\\/g, '/');
        if (!p) return null;
        if (p.startsWith('/')) return null;
        const parts = p.split('/').filter(Boolean);
        if (parts.length === 0) return null;
        if (parts.some(seg => seg === '.' || seg === '..')) return null;
        return parts.join('/');
    }

    private async _applyEditsFromMessage(messageContent: string) {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            vscode.window.showWarningMessage('请先打开一个工作区文件夹');
            return;
        }
        const folder = folders[0];
        const edits = this._parseFileEditsFromMessage(messageContent)
            .map(e => ({ ...e, relPath: this._sanitizeRelPath(e.relPath) }))
            .filter((e): e is { relPath: string; language?: string; code: string } => !!e.relPath);

        if (edits.length === 0) {
            vscode.window.showInformationMessage('未找到可应用的文件更改（需要 FILE: 路径 + 代码块）');
            return;
        }

        const preview = edits[0];
        const targetUri = vscode.Uri.joinPath(folder.uri, preview.relPath);
        const leftUri = vscode.Uri.from({ scheme: 'deepseek-nexus-original', path: targetUri.path });
        const rightUri = vscode.Uri.from({ scheme: 'deepseek-nexus-preview', path: targetUri.path });

        let original = '';
        try {
            const bytes = await vscode.workspace.fs.readFile(targetUri);
            original = Buffer.from(bytes).toString('utf8');
        } catch {}
        this._virtualDocuments.set(leftUri.toString(), original);
        this._virtualDocuments.set(rightUri.toString(), preview.code);
        await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, `DeepSeek 预览: ${preview.relPath}`, { preview: true });

        const confirm = await vscode.window.showInformationMessage(
            `应用 ${edits.length} 个文件更改？`,
            { modal: true },
            '确认'
        );
        if (confirm !== '确认') return;

        try {
            for (const e of edits) {
                const fileUri = vscode.Uri.joinPath(folder.uri, e.relPath);
                let exists = true;
                try {
                    await vscode.workspace.fs.stat(fileUri);
                } catch {
                    exists = false;
                }
                if (!exists) {
                    const parts = e.relPath.split('/').filter(Boolean);
                    if (parts.length > 1) {
                        const dirUri = vscode.Uri.joinPath(folder.uri, parts.slice(0, -1).join('/'));
                        await vscode.workspace.fs.createDirectory(dirUri);
                    }
                }
                await vscode.workspace.fs.writeFile(fileUri, Buffer.from(e.code, 'utf8'));
            }
            const firstUri = vscode.Uri.joinPath(folder.uri, edits[0].relPath);
            await vscode.window.showTextDocument(firstUri, { preview: false });
            vscode.window.showInformationMessage('已应用文件更改');
        } catch (e) {
            vscode.window.showErrorMessage(`应用失败: ${e}`);
        }
    }

    private async _applyCodeToWorkspace(code: string, language?: string) {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            vscode.window.showWarningMessage('请先打开一个工作区文件夹');
            return;
        }
        const folder = folders[0];
        const activeDoc = vscode.window.activeTextEditor?.document;
        const defaultRel = activeDoc ? vscode.workspace.asRelativePath(activeDoc.uri, false) : '';
        const relPath = await vscode.window.showInputBox({
            prompt: '写入到工作区文件（相对路径）',
            value: defaultRel
        });
        if (!relPath) return;
        const targetUri = vscode.Uri.joinPath(folder.uri, relPath);

        let original = '';
        let exists = false;
        try {
            const bytes = await vscode.workspace.fs.readFile(targetUri);
            original = Buffer.from(bytes).toString('utf8');
            exists = true;
        } catch {}

        const leftUri = vscode.Uri.from({ scheme: 'deepseek-nexus-original', path: targetUri.path });
        const rightUri = vscode.Uri.from({ scheme: 'deepseek-nexus-preview', path: targetUri.path });
        this._virtualDocuments.set(leftUri.toString(), original);
        this._virtualDocuments.set(rightUri.toString(), code);

        await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, `DeepSeek 预览: ${relPath}`, { preview: true });

        const confirm = await vscode.window.showInformationMessage(`应用到 ${relPath} ?`, { modal: true }, '确认');
        if (confirm !== '确认') return;

        try {
            if (!exists) {
                const parts = relPath.split('/').filter(Boolean);
                if (parts.length > 1) {
                    const dirRel = parts.slice(0, -1).join('/');
                    const dirUri = vscode.Uri.joinPath(folder.uri, dirRel);
                    await vscode.workspace.fs.createDirectory(dirUri);
                }
            }

            const edit = new vscode.WorkspaceEdit();
            if (!exists) {
                edit.createFile(targetUri, { ignoreIfExists: true });
                edit.insert(targetUri, new vscode.Position(0, 0), code);
            } else {
                const doc = await vscode.workspace.openTextDocument(targetUri);
                const fullRange = new vscode.Range(0, 0, doc.lineCount, 0);
                edit.replace(targetUri, fullRange, code);
            }
            await vscode.workspace.applyEdit(edit);
            await vscode.window.showTextDocument(targetUri, { preview: false });
            vscode.window.showInformationMessage('已写入文件');
        } catch (e) {
            vscode.window.showErrorMessage(`写入失败: ${e}`);
        }
    }



    private async _getCurrentFileContent(): Promise<{ content: string; language: string; fileName: string } | null> {
        try {
            console.log('DeepSeek Nexus: 开始获取当前文件内容...');
            
            // 策略1: 尝试活跃编辑器
            let activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                const document = activeEditor.document;
                const content = document.getText();
                const language = document.languageId;
                const fileName = document.fileName.split('/').pop() || document.uri.path.split('/').pop() || 'untitled';
                
                if (content && content.trim().length > 0) {
                    console.log(`DeepSeek Nexus: 成功从活跃编辑器读取 ${fileName} (${language}), ${content.length} 字符`);
                    
                    const MAX_LEN = 20000;
                    const finalContent = content.length > MAX_LEN ? content.slice(0, MAX_LEN) + "\n/* ...内容已截断... */" : content;
                    
                    return {
                        content: finalContent,
                        language: language,
                        fileName: fileName
                    };
                }
            }
            
            // 策略2: 尝试所有可见编辑器
            const visibleEditors = vscode.window.visibleTextEditors;
            console.log(`DeepSeek Nexus: 检查 ${visibleEditors.length} 个可见编辑器`);
            
            for (const editor of visibleEditors) {
                try {
                    const document = editor.document;
                    const content = document.getText();
                    const language = document.languageId;
                    const fileName = document.fileName.split('/').pop() || document.uri.path.split('/').pop() || 'untitled';
                    
                    if (content && content.trim().length > 0) {
                        console.log(`DeepSeek Nexus: 成功从可见编辑器读取 ${fileName} (${language}), ${content.length} 字符`);
                        
                        const MAX_LEN = 20000;
                        const finalContent = content.length > MAX_LEN ? content.slice(0, MAX_LEN) + "\n/* ...内容已截断... */" : content;
                        
                        return {
                            content: finalContent,
                            language: language,
                            fileName: fileName
                        };
                    }
                } catch (error) {
                    console.log(`DeepSeek Nexus: 跳过编辑器 ${editor.document?.fileName}:`, error);
                    continue;
                }
            }
            
            // 策略3: 尝试工作区中的最近文件
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                try {
                    console.log('DeepSeek Nexus: 尝试从工作区查找文件...');
                    const files = await vscode.workspace.findFiles('**/*.{js,ts,jsx,tsx,py,java,cpp,c,h,cs,php,rb,go,rs,swift}', '**/node_modules/**', 1);
                    
                    if (files.length > 0) {
                        const document = await vscode.workspace.openTextDocument(files[0]);
                        const content = document.getText();
                        const language = document.languageId;
                        const fileName = document.fileName.split('/').pop() || document.uri.path.split('/').pop() || 'untitled';
                        
                        if (content && content.trim().length > 0) {
                            console.log(`DeepSeek Nexus: 成功从工作区读取 ${fileName} (${language}), ${content.length} 字符`);
                            
                            const MAX_LEN = 20000;
                            const finalContent = content.length > MAX_LEN ? content.slice(0, MAX_LEN) + "\n/* ...内容已截断... */" : content;
                            
                            return {
                                content: finalContent,
                                language: language,
                                fileName: fileName
                            };
                        }
                    }
                } catch (error) {
                    console.log('DeepSeek Nexus: 工作区文件查找失败:', error);
                }
            }
            
            console.log('DeepSeek Nexus: 所有策略都未找到可用文件');
            return null;
            
        } catch (error) {
            console.error('DeepSeek Nexus: 文件读取发生严重错误:', error);
            return null;
        }
    }

    private _scheduleSnapshot() {
        const now = Date.now();
        if (this._snapshotTimer) {
            clearTimeout(this._snapshotTimer);
        }
        const delay = now - this._lastSnapshotTime < 150 ? 150 : 0;
        this._snapshotTimer = setTimeout(() => {
            this._lastSnapshotTime = Date.now();
            this._sendHistorySnapshot();
        }, delay);
    }

    private async _getWorkspaceContext(): Promise<string | null> {
        const includeExt = new Set(['ts', 'tsx', 'js', 'jsx', 'json', 'md', 'py', 'go', 'rs', 'java', 'kt', 'cs', 'cpp', 'c', 'h', 'swift', 'php', 'rb', 'yaml', 'yml']);
        const excludeDirs = new Set(['node_modules', 'dist', 'build', 'out', '.git', '.next', '.turbo', '.vscode']);
        const maxFiles = 10;
        const maxTotal = 30000;
        const maxPerFile = 5000;

        const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

        const getActiveDirUri = () => {
            const docUri = vscode.window.activeTextEditor?.document?.uri;
            if (!docUri) return null;
            if (docUri.scheme === 'untitled') return null;
            if (!docUri.path || !docUri.path.includes('/')) return null;
            const dirPath = docUri.path.replace(/\/[^/]+$/, '');
            if (!dirPath) return null;
            return docUri.with({ path: dirPath });
        };

        const collectFilesRecursively = async (rootUri: vscode.Uri, depthLimit: number): Promise<vscode.Uri[]> => {
            const results: vscode.Uri[] = [];
            const visit = async (dir: vscode.Uri, depth: number) => {
                if (results.length >= maxFiles) return;
                if (depth > depthLimit) return;
                let entries: [string, vscode.FileType][];
                try {
                    entries = await vscode.workspace.fs.readDirectory(dir);
                } catch {
                    return;
                }
                for (const [name, type] of entries) {
                    if (results.length >= maxFiles) return;
                    if (type === vscode.FileType.Directory) {
                        if (excludeDirs.has(name)) continue;
                        await visit(vscode.Uri.joinPath(dir, name), depth + 1);
                    } else if (type === vscode.FileType.File) {
                        const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
                        if (!includeExt.has(ext)) continue;
                        results.push(vscode.Uri.joinPath(dir, name));
                    }
                }
            };
            await visit(rootUri, 0);
            return results;
        };

        let folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            for (let i = 0; i < 2; i++) {
                await sleep(300);
                folders = vscode.workspace.workspaceFolders;
                if (folders && folders.length > 0) break;
            }
        }

        let uris: vscode.Uri[] = [];
        let header = `工作区上下文（最多 ${maxFiles} 个文件摘要）:`;
        if (folders && folders.length > 0) {
            const root = folders[0];
            const include = '**/*.{ts,tsx,js,jsx,json,md,py,go,rs,java,kt,cs,cpp,c,h,swift,php,rb,yaml,yml}';
            const exclude = '**/{node_modules,dist,build,out,.git,.next,.turbo,.vscode}/**';
            uris = await vscode.workspace.findFiles(new vscode.RelativePattern(root, include), exclude, maxFiles);
        } else {
            const activeDir = getActiveDirUri();
            if (!activeDir) return null;
            header = `工作区上下文（来自当前文件所在目录，最多 ${maxFiles} 个文件摘要）:`;
            uris = await collectFilesRecursively(activeDir, 4);
        }

        const fileBlocks: string[] = [];
        let total = 0;
        for (const uri of uris) {
            if (total >= maxTotal) break;
            const doc = await vscode.workspace.openTextDocument(uri);
            const rel = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
                ? vscode.workspace.asRelativePath(uri, false)
                : uri.path.split('/').slice(-2).join('/');
            const raw = doc.getText();
            const trimmed = raw.length > maxPerFile ? raw.slice(0, maxPerFile) + '\n/* ...truncated... */' : raw;
            total += trimmed.length;
            fileBlocks.push(`文件: ${rel}\n语言: ${doc.languageId}\n\`\`\`${doc.languageId}\n${trimmed}\n\`\`\``);
        }
        if (fileBlocks.length === 0) return null;
        return `${header}\n\n${fileBlocks.join('\n\n')}`;
    }

    private _sendHistorySnapshot() {
        if (!this._view) return;
        const visibleHistory = this._conversationHistory.filter(m => m.role !== 'system');
        const messages = visibleHistory.map((m, idx) => ({
            id: `snap-${idx}-${Date.now()}`,
            content: m.content,
            role: m.role,
            timestamp: new Date().toISOString(),
        }));
        let streaming = null as null | { id: string; content: string; role: 'assistant'; timestamp: string; isStreaming: boolean };
        if (this._currentStreamBuffer && this._currentStreamConversationId) {
            streaming = {
                id: this._currentStreamConversationId,
                content: this._currentStreamBuffer,
                role: 'assistant',
                timestamp: new Date().toISOString(),
                isStreaming: true
            };
        }
        this._view.webview.postMessage({
            type: 'historySnapshot',
            messages,
            streaming
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'index.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'index.css'));

        const nonce = this.getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
                <link href="${styleUri}" rel="stylesheet">
                <title>DeepSeek Nexus</title>
            </head>
            <body>
                <div id="root"></div>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }

    private getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}
