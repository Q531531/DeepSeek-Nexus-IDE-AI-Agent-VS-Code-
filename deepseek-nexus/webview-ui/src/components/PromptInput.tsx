import { useState, KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PromptInputProps {
  onSendMessage: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  onClear?: () => void;
  onStop?: () => void;
}

export function PromptInput({ 
  onSendMessage, 
  disabled = false, 
  placeholder = "问 DeepSeek 任何问题…",
  className,
  onClear,
  onStop,
}: PromptInputProps) {
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (input.trim() && !disabled) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      e.stopPropagation();
      target.select();
      return;
    }
    if (!disabled && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={cn("border-t border-border bg-background max-h-[360px] overflow-hidden", className)}>
      <div className="p-4">
        {/* Action Bar */}
        <div className="flex items-center gap-2 mb-3">
          <button
            type="button"
            onClick={() => {
              setInput(prev => `// System Prompt\nYou are DeepSeek, a helpful coding assistant.\n\n` + prev);
            }}
            className={cn(
              "chat-button px-2 py-1 text-xs rounded-md"
            )}
          >
            插入系统提示
          </button>
          <button
            type="button"
            onClick={() => onClear && onClear()}
            className={cn(
              "chat-button px-2 py-1 text-xs rounded-md"
            )}
          >
            清空对话
          </button>
        </div>

        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={3}
              className={cn(
                "chat-input w-full resize-none rounded-md border px-3 py-2 min-h-[40px] max-h-[80px] overflow-y-auto",
                "focus:ring-2 focus:ring-focus-border/20",
              )}
              style={{
                height: 'auto',
                minHeight: '80px',
                maxHeight: '80px'
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 80) + 'px';
              }}
            />
            <div className="flex justify-end mt-1 text-[10px] opacity-70">
              {input.length} 字 | Enter 发送 · Shift+Enter 换行 · Cmd/Ctrl+A 全选
            </div>
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || disabled}
            className={cn(
              "chat-button flex items-center justify-center rounded-md p-2 h-10 w-10",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            <Send size={16} />
          </button>
          {disabled && (
            <button
              onClick={() => onStop && onStop()}
              className={cn(
                "chat-button flex items-center justify-center rounded-md px-3 h-10 text-xs"
              )}
            >
              停止
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
