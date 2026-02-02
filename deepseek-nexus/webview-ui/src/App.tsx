import { useState, useEffect } from 'react';
import { ChatContainer } from './components/ChatContainer';
import { PromptInput } from './components/PromptInput';
import { Message } from './components/MessageBubble';
import { vscode } from './lib/utils';

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState<Message | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [contextWarning, setContextWarning] = useState<string | null>(null);
  const [keys, setKeys] = useState({ siliconflow: '', openai: '', openrouter: '', moonshot: '' });
  const [bootLoading, setBootLoading] = useState(true);

  // Handle messages from VS Code extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      
      switch (message.type) {
        case 'streamChunk':
          // Handle streaming content chunks
          if (currentStreamingMessage) {
            setCurrentStreamingMessage(prev => prev ? {
              ...prev,
              content: prev.content + message.content,
              isStreaming: true
            } : null);
          } else {
            // Start new streaming message
            const newMessage: Message = {
              id: message.conversationId || Date.now().toString(),
              content: message.content,
              role: 'assistant',
              timestamp: new Date(),
              isStreaming: true
            };
            setCurrentStreamingMessage(newMessage);
          }
          break;
          
        case 'streamComplete':
          // Finish streaming and add to messages
          setIsLoading(false);
          setBootLoading(false);
          if (currentStreamingMessage) {
            setMessages(prev => [...prev, {
              ...currentStreamingMessage,
              isStreaming: false
            }]);
            setCurrentStreamingMessage(null);
          }
          break;
          
        case 'streamError':
          // Handle streaming errors
          setIsLoading(false);
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            content: `Error: ${message.error}`,
            role: 'assistant',
            timestamp: new Date()
          }]);
          setCurrentStreamingMessage(null);
          break;
          
        case 'conversationCleared':
          // Clear all messages
          setMessages([]);
          setCurrentStreamingMessage(null);
          setIsLoading(false);
          setBootLoading(false);
          break;
          
        case 'restoreHistory':
          // 简化恢复逻辑，直接替换消息
          console.log('DeepSeek Nexus: 恢复聊天历史', message.messages);
          if (message.messages && Array.isArray(message.messages)) {
            const restoredMessages = message.messages
              .filter((msg: any) => msg.type === 'userMessage' || msg.type === 'assistantMessage')
              .map((msg: any, index: number) => ({
                id: `msg-${index}-${msg.timestamp}`,
                content: msg.content,
                role: msg.type === 'userMessage' ? 'user' : 'assistant',
                timestamp: new Date(msg.timestamp)
              }));
            setMessages(restoredMessages);
            setBootLoading(false);
          }
          break;

        case 'forceRestoreAll':
          // 强制全量恢复所有历史消息
          console.log('DeepSeek Nexus: 强制全量恢复', message.messages, '时间戳:', message.timestamp);
          if (message.messages && Array.isArray(message.messages)) {
            const allMessages = message.messages
              .filter((msg: any) => msg.type === 'userMessage' || msg.type === 'assistantMessage')
              .map((msg: any, index: number) => ({
                id: `force-${index}-${msg.timestamp}`,
                content: msg.content,
                role: msg.type === 'userMessage' ? 'user' : 'assistant',
                timestamp: new Date(msg.timestamp)
              }));
            
            console.log('DeepSeek Nexus: 设置消息数组:', allMessages.length, '条消息');
            setMessages(allMessages);
          } else {
            console.log('DeepSeek Nexus: 没有历史消息，清空界面');
            setMessages([]);
          }
          break;
        case 'historySnapshot':
          {
            const restored = (message.messages || []).map((msg: any) => ({
              id: msg.id,
              content: msg.content,
              role: msg.role === 'system' ? 'assistant' : msg.role,
              timestamp: new Date(msg.timestamp || Date.now())
            })) as Message[];
            const streaming = message.streaming
              ? {
                  id: message.streaming.id,
                  content: message.streaming.content || '',
                  role: 'assistant' as const,
                  timestamp: new Date(message.streaming.timestamp || Date.now()),
                  isStreaming: true,
                } as Message
              : null;
            setMessages(restored);
            setCurrentStreamingMessage(streaming);
            setBootLoading(false);
          }
          break;
          
        // Keep legacy support for older response format
        case 'response':
          setIsLoading(false);
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            content: message.content,
            role: 'assistant',
            timestamp: new Date()
          }]);
          break;
        case 'configSnapshot':
          if (message.provider) setSelectedProvider(message.provider);
          if (message.model) setSelectedModel(message.model);
          if (message.keys) {
            setKeys({
              siliconflow: message.keys.siliconflow || '',
              openai: message.keys.openai || '',
              openrouter: message.keys.openrouter || '',
              moonshot: message.keys.moonshot || ''
            });
          }
          break;
        case 'contextWarning':
          setContextWarning(message.message || '未能获取当前文件');
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [currentStreamingMessage]);

  useEffect(() => {
    vscode.postMessage({ type: 'ready' });
  }, []);

  useEffect(() => {
    const state = vscode.getState?.();
    if (state) {
      if (state.messages) {
        const restored = (state.messages as any[]).map((m: any) => ({
          ...m,
          timestamp: new Date(
            typeof m.timestamp === 'number'
              ? m.timestamp
              : (m.timestamp ? Date.parse(m.timestamp) : Date.now())
          )
        })) as Message[];
        setMessages(restored);
      }
      if (state.currentStreamingMessage) {
        const m = state.currentStreamingMessage as any;
        setCurrentStreamingMessage({
          ...m,
          timestamp: new Date(
            typeof m.timestamp === 'number'
              ? m.timestamp
              : (m.timestamp ? Date.parse(m.timestamp) : Date.now())
          )
        } as Message);
      }
      if (state.selectedModel) setSelectedModel(state.selectedModel);
      if (state.selectedProvider) setSelectedProvider(state.selectedProvider);
      if (typeof state.autoScroll === 'boolean') setAutoScroll(state.autoScroll);
      if (typeof state.isLoading === 'boolean') setIsLoading(state.isLoading);
    }
  }, []);

  // Persist state after dependent values are declared


  const handleSendMessage = (content: string) => {
    const conversationId = Date.now().toString();
    
    // Add user message to chat
    const userMessage: Message = {
      id: conversationId + '_user',
      content,
      role: 'user',
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setCurrentStreamingMessage(null);

    // Send message to VS Code extension
    vscode.postMessage({
      type: 'sendMessage',
      content,
      conversationId,
      includeCurrentFile: true,
      includeWorkspace: true
    });
  };

  const handleClearConversation = () => {
    vscode.postMessage({
      type: 'clearConversation'
    });
  };

  const handleStop = () => {
    vscode.postMessage({
      type: 'stopGeneration'
    });
    setIsLoading(false);
    setCurrentStreamingMessage(null);
  };

  const models = [
    { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek-V3（对话）' },
    { id: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek-R1（推理）' },
    { id: 'deepseek-ai/DeepSeek-V2.5', label: 'DeepSeek-V2.5' }
  ];
  const [selectedModel, setSelectedModel] = useState(models[0].id);
  const handleChangeModel = (id: string) => {
    setSelectedModel(id);
    vscode.postMessage({ type: 'updateModel', model: id });
  };

  useEffect(() => {
    // 初始化时可以向扩展请求当前配置（可选），此处直接沿用默认
  }, []);

  const providers = [
    { id: 'siliconflow', label: 'SiliconFlow' },
    { id: 'openai', label: 'OpenAI' },
    { id: 'openrouter', label: 'OpenRouter' },
    { id: 'moonshot', label: 'Kimi (Moonshot)' }
  ];
  const [selectedProvider, setSelectedProvider] = useState(providers[0].id);
  const handleChangeProvider = (id: string) => {
    setSelectedProvider(id);
    vscode.postMessage({ type: 'updateProvider', provider: id });
    const map: Record<string, { models: { id: string; label: string }[]; default: string }> = {
      siliconflow: {
        models: [
          { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek-V3（对话）' },
          { id: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek-R1（推理）' },
          { id: 'deepseek-ai/DeepSeek-V2.5', label: 'DeepSeek-V2.5' }
        ],
        default: 'deepseek-ai/DeepSeek-V3'
      },
      openai: {
        models: [
          { id: 'gpt-4o-mini', label: 'GPT-4o-mini' },
          { id: 'gpt-4o', label: 'GPT-4o' }
        ],
        default: 'gpt-4o-mini'
      },
      openrouter: {
        models: [
          { id: 'openrouter/auto', label: 'OpenRouter Auto' },
          { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' }
        ],
        default: 'openrouter/auto'
      },
      moonshot: {
        models: [
          { id: 'moonshot-v1-32k', label: 'Moonshot v1 32k' },
          { id: 'moonshot-v1-8k', label: 'Moonshot v1 8k' }
        ],
        default: 'moonshot-v1-32k'
      }
    };
    const info = map[id] || map['siliconflow'];
    setSelectedModel(info.default);
    vscode.postMessage({ type: 'updateModel', model: info.default });
  };

  const [autoScroll, setAutoScroll] = useState(true);

  const modelsForProvider = () => {
    const map: Record<string, { id: string; label: string }[]> = {
      siliconflow: [
        { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek-V3（对话）' },
        { id: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek-R1（推理）' },
        { id: 'deepseek-ai/DeepSeek-V2.5', label: 'DeepSeek-V2.5' }
      ],
      openai: [
        { id: 'gpt-4o-mini', label: 'GPT-4o-mini' },
        { id: 'gpt-4o', label: 'GPT-4o' }
      ],
      openrouter: [
        { id: 'openrouter/auto', label: 'OpenRouter Auto' },
        { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' }
      ],
      moonshot: [
        { id: 'moonshot-v1-32k', label: 'Moonshot v1 32k' },
        { id: 'moonshot-v1-8k', label: 'Moonshot v1 8k' }
      ]
    };
    return map[selectedProvider] || map['siliconflow'];
  };

  useEffect(() => {
    vscode.setState?.({
      messages: messages.map(m => ({ ...m, timestamp: m.timestamp instanceof Date ? m.timestamp.getTime() : Date.now() })),
      currentStreamingMessage: currentStreamingMessage ? { ...currentStreamingMessage, timestamp: currentStreamingMessage.timestamp instanceof Date ? currentStreamingMessage.timestamp.getTime() : Date.now() } : null,
      selectedModel,
      selectedProvider,
      autoScroll,
      isLoading
    });
  }, [messages, currentStreamingMessage, selectedModel, selectedProvider, autoScroll, isLoading]);

  return (
    <div className="flex flex-col h-full bg-background text-foreground" style={{ borderLeft: '1px solid var(--vscode-panel-border)', borderRight: '1px solid var(--vscode-panel-border)' }}>
      {bootLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-sidebar-background border border-border rounded px-3 py-1 text-xs">正在加载对话…</div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-sm">DS</span>
          </div>
          <div>
            <h1 className="font-semibold text-sidebar-foreground">DeepSeek 助手</h1>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <select
            value={selectedModel}
            onChange={(e) => handleChangeModel(e.target.value)}
            className="chat-input text-xs rounded-md border px-2 py-1"
          >
            {modelsForProvider().map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <select
            value={selectedProvider}
            onChange={(e) => handleChangeProvider(e.target.value)}
            className="chat-input text-xs rounded-md border px-2 py-1"
          >
            {providers.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className="chat-button px-2 py-1 text-xs rounded-md"
          >
            {autoScroll ? '自动滚动: 开' : '自动滚动: 关'}
          </button>
          <button
            onClick={() => { setShowSettings(true); vscode.postMessage({ type: 'requestSettings' }); }}
            className="chat-button px-3 py-1 text-xs rounded-md"
          >
            配置
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {contextWarning && (
          <div className="mx-4 mb-2 text-xs bg-sidebar-background border border-border rounded px-2 py-1 flex items-center justify-between">
            <span>{contextWarning}</span>
            <button className="chat-button px-2 py-0.5 rounded" onClick={() => setContextWarning(null)}>知道了</button>
          </div>
        )}
        <div className="flex-1 flex flex-col overflow-hidden">
        <ChatContainer 
          messages={[...messages, ...(currentStreamingMessage ? [currentStreamingMessage] : [])]} 
          className=""
          autoScroll={autoScroll}
        />

        <PromptInput 
          onSendMessage={handleSendMessage}
          disabled={isLoading}
          onClear={handleClearConversation}
          onStop={handleStop}
        />
        </div>
      </div>

      {showSettings && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
          <div className="bg-background border border-border rounded-lg w-[560px] max-w-[90vw] p-4">
            <div className="text-sm mb-3">服务商与密钥配置</div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-28 text-xs">服务商</div>
                <select
                  value={selectedProvider}
                  onChange={(e) => handleChangeProvider(e.target.value)}
                  className="chat-input text-xs rounded-md border px-2 py-1 flex-1"
                >
                  {providers.map(p => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-28 text-xs">模型</div>
                <select
                  value={selectedModel}
                  onChange={(e) => handleChangeModel(e.target.value)}
                  className="chat-input text-xs rounded-md border px-2 py-1 flex-1"
                >
                  {modelsForProvider().map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-28 text-xs">SiliconFlow Key</div>
                <input
                  className="chat-input text-xs rounded-md border px-2 py-1 flex-1"
                  value={keys.siliconflow}
                  onChange={(e) => setKeys({ ...keys, siliconflow: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <div className="w-28 text-xs">OpenAI Key</div>
                <input
                  className="chat-input text-xs rounded-md border px-2 py-1 flex-1"
                  value={keys.openai}
                  onChange={(e) => setKeys({ ...keys, openai: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <div className="w-28 text-xs">OpenRouter Key</div>
                <input
                  className="chat-input text-xs rounded-md border px-2 py-1 flex-1"
                  value={keys.openrouter}
                  onChange={(e) => setKeys({ ...keys, openrouter: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <div className="w-28 text-xs">Moonshot Key</div>
                <input
                  className="chat-input text-xs rounded-md border px-2 py-1 flex-1"
                  value={keys.moonshot}
                  onChange={(e) => setKeys({ ...keys, moonshot: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="chat-button px-3 py-1 text-xs rounded-md" onClick={() => setShowSettings(false)}>取消</button>
              <button
                className="chat-button px-3 py-1 text-xs rounded-md"
                onClick={() => {
                  vscode.postMessage({ type: 'saveSettings', keys });
                  setShowSettings(false);
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
