import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { LoadingAnimation, BreathingDot } from "./LoadingAnimation";
import { useState } from "react";
import { vscode } from "@/lib/utils";

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  isStreaming?: boolean;
}

interface MessageBubbleProps {
  message: Message;
  className?: string;
  isLoading?: boolean;
  showAvatar?: boolean;
}

export function MessageBubble({ message, className, isLoading = false, showAvatar = true }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [applyRequested, setApplyRequested] = useState(false);
  const hasFileEdits = !isUser && /(^|\n)\s*FILE:\s*[^\n]+\n```/m.test(message.content || '');

  const copyContent = async () => {
    try {
      await navigator.clipboard.writeText(message.content || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  };

  const applyEdits = () => {
    vscode.postMessage({
      type: 'applyEditsFromMessage',
      content: message.content
    });
    setApplyRequested(true);
    setTimeout(() => setApplyRequested(false), 1500);
  };
  
  return (
    <div className={cn("message-row", isUser ? "user" : "", className, "fade-in-up")}>
      {showAvatar && (
        <div className={cn("avatar")}>助</div>
      )}
      <div className={cn(
        "message-bubble",
        isUser ? "user-message" : "ai-message"
      )}>
        {isLoading ? (
          <LoadingAnimation />
        ) : (
          <>
            <div className="bubble-header">
              {!isUser && <span className="name">DeepSeek 助手</span>}
              <span className="dot" />
              <span className="time">{message.timestamp.toLocaleTimeString()}</span>
              {message.isStreaming && <BreathingDot className="ml-2" />}
            </div>
            {isUser ? (
              <div className="whitespace-pre-wrap">
                {message.content}
              </div>
            ) : (
              <MarkdownRenderer content={message.content} />
            )}
            <div className="flex justify-end gap-2 mt-2">
              {hasFileEdits && (
                <button
                  type="button"
                  onClick={applyEdits}
                  className="chat-button px-2 py-0.5 text-xs rounded-md"
                >
                  {applyRequested ? '已发送' : '应用更改'}
                </button>
              )}
              <button
                type="button"
                onClick={copyContent}
                className="chat-button px-2 py-0.5 text-xs rounded-md"
              >
                {copied ? '已复制' : '复制内容'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
