import { useEffect, useRef } from 'react';
import { MessageBubble, Message } from './MessageBubble';
import { cn } from '@/lib/utils';

interface ChatContainerProps {
  messages: Message[];
  className?: string;
  autoScroll?: boolean;
  scrollToLatestSignal?: number;
}

export function ChatContainer({ messages, className, autoScroll = true, scrollToLatestSignal }: ChatContainerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  // Manual trigger to scroll to latest
  useEffect(() => {
    if (scrollToLatestSignal && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [scrollToLatestSignal]);

  const renderSeparatorIfNeeded = (prev: Message | null, curr: Message) => {
    if (!prev) return null;
    const prevDay = prev.timestamp.toDateString();
    const currDay = curr.timestamp.toDateString();
    if (prevDay !== currDay) {
      return (
        <div className="chat-separator" key={`sep-${curr.id}`}>
          <div className="line" />
          <div className="label">{curr.timestamp.toDateString()}</div>
          <div className="line" />
        </div>
      );
    }
    return null;
  };

  return (
    <div 
      ref={scrollRef}
      className={cn(
        "overflow-y-auto p-4 space-y-4",
        "scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border",
        "max-h-[500px]",
        className
      )}
    >
      {messages.length === 0 ? (
        <div className="flex items-center justify-center h-full text-foreground/60">
          <div className="text-center space-y-2">
            <div className="text-lg font-medium">欢迎使用 DeepSeek 助手</div>
          </div>
        </div>
      ) : (
        messages.map((message, idx) => {
          const prev = idx > 0 ? messages[idx - 1] : null;
          const showAvatar = (message.role !== 'user') && (!prev || prev.role !== message.role);
          return (
            <>
              {renderSeparatorIfNeeded(prev, message)}
              <MessageBubble key={message.id} message={message} showAvatar={showAvatar} />
            </>
          );
        })
      )}
      
      {/* 由 App 传入的流式消息负责展示加载态，这里不再重复渲染占位 */}
    </div>
  );
}
