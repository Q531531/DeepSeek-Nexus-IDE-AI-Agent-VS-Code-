import * as vscode from 'vscode';
import OpenAI from 'openai';

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export class ChatProvider {
    private openai: OpenAI | null = null;
    private context: vscode.ExtensionContext;
    private currentProvider: string = 'siliconflow';

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.initializeClient();
    }

    private initializeClient() {
        const config = vscode.workspace.getConfiguration('deepseek');
        const provider = (config.get<string>('provider') || 'siliconflow').toLowerCase();
        const baseUrl = config.get<string>('baseUrl') || 'https://api.siliconflow.cn/v1';
        let apiKey = config.get<string>(`apiKeys.${provider}`) || '';
        if (!apiKey && provider === 'siliconflow') {
            apiKey = config.get<string>('apiKey') || '';
        }
        this.currentProvider = provider;

        if (!apiKey) {
            console.log(`API key not configured for provider: ${provider}`);
            return;
        }

        this.openai = new OpenAI({
            apiKey: apiKey,
            baseURL: baseUrl
        });
    }

    async streamChatCompletion(
        messages: ChatMessage[],
        onChunk: (chunk: string) => void,
        onError: (error: string) => void,
        onComplete: () => void,
        signal?: AbortSignal
    ): Promise<void> {
        if (!this.openai) {
            const provider = vscode.workspace.getConfiguration('deepseek').get<string>('provider') || this.currentProvider;
            onError(`未配置 ${provider} 的 API Key，请在设置中填写后重试`);
            return;
        }

        const config = vscode.workspace.getConfiguration('deepseek');
        const model = config.get<string>('model') || 'deepseek-ai/DeepSeek-V3';

        try {
            const stream = await this.openai.chat.completions.create({
                model: model,
                messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
                stream: true,
                temperature: 0.7,
                max_tokens: 4000
            }, { signal } as any);

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content;
                if (content) {
                    onChunk(content);
                }
            }
            
            onComplete();
        } catch (error) {
            console.error('DeepSeek API Error:', error);
            if (error instanceof Error) {
                onError(`API Error: ${error.message}`);
            } else {
                onError('An unknown error occurred while calling the API');
            }
        }
    }

    async validateApiKey(): Promise<boolean> {
        if (!this.openai) {
            this.initializeClient();
            if (!this.openai) return false;
        }

        try {
            const config = vscode.workspace.getConfiguration('deepseek');
            const model = config.get<string>('model') || 'deepseek-ai/DeepSeek-V3';
            
            // Test API key with a simple request
            await this.openai.chat.completions.create({
                model: model,
                messages: [{ role: 'user', content: 'Hello' }],
                max_tokens: 1
            });
            return true;
        } catch (error) {
            console.error('API key validation failed:', error);
            return false;
        }
    }

    refreshClient() {
        this.initializeClient();
    }
}
