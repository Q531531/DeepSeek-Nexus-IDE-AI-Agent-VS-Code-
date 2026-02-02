import * as vscode from 'vscode';
import { ChatViewProvider } from './chatViewProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('=== DeepSeek Nexus 扩展开始激活 ===');
    
    try {
        // Create webview provider
        console.log('创建ChatViewProvider...');
        const provider = new ChatViewProvider(context.extensionUri, context);
        console.log('ChatViewProvider创建成功');
        
        // Register webview provider
        console.log('注册WebviewViewProvider...');
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, provider)
        );
        console.log('WebviewViewProvider注册成功，viewType:', ChatViewProvider.viewType);
        
        // Register show chat command
        console.log('注册showChat命令...');
        const showChatCommand = vscode.commands.registerCommand('deepseek-nexus.showChat', () => {
            console.log('showChat命令被调用');
            vscode.commands.executeCommand('deepseek-nexus.chatView.focus');
        });
        
        context.subscriptions.push(showChatCommand);
        console.log('showChat命令注册成功');
        
        console.log('=== DeepSeek Nexus 扩展激活完成 ===');
    } catch (error) {
        console.error('扩展激活失败:', error);
        vscode.window.showErrorMessage(`DeepSeek Nexus 激活失败: ${error}`);
    }
}

export function deactivate() {}
