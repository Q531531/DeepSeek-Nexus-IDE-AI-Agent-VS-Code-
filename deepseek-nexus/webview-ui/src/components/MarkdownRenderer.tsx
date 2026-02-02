import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

interface CodeBlockProps {
  children: string;
  className?: string;
  inline?: boolean;
}

function CodeBlock({ children, className, inline }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  if (inline) {
    return (
      <code className="bg-sidebar-background text-sidebar-foreground px-1 py-0.5 rounded text-sm font-mono">
        {children}
      </code>
    );
  }

  return (
    <div className="relative group">
      <div className="flex items-center justify-between bg-sidebar-background border border-border rounded-t-md px-4 py-2">
        <span className="text-xs text-sidebar-foreground/70 font-mono">
          {language || '代码'}
        </span>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100">
          <button
            onClick={handleCopy}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-xs transition-all",
              "bg-button-background text-button-foreground hover:bg-button-hover-background"
            )}
          >
            {copied ? (
              <>
                <Check size={12} />
                已复制！
              </>
            ) : (
              <>
                <Copy size={12} />
                复制
              </>
            )}
          </button>
        </div>
      </div>
      
      <SyntaxHighlighter
        style={oneDark}
        language={language}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: '0 0 6px 6px',
          backgroundColor: 'var(--vscode-editor-background)',
          border: '1px solid var(--vscode-panel-border)',
          borderTop: 'none',
          fontSize: '13px',
          fontFamily: 'var(--vscode-editor-font-family, "Fira Code", "Cascadia Code", "JetBrains Mono", monospace)'
        }}
        codeTagProps={{
          style: {
            color: 'var(--vscode-editor-foreground)',
            fontFamily: 'inherit'
          }
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}

// Process thinking tags for DeepSeek-R1 reasoning chains
function processThinkingTags(content: string): string {
  return content.replace(
    /<thinking>([\s\S]*?)<\/thinking>/g,
    (_, thinkingContent) => {
      const processedContent = thinkingContent.trim();
      return `\n\n<details>\n<summary><strong>🤔 DeepSeek 思考过程</strong></summary>\n\n${processedContent}\n\n</details>\n\n`;
    }
  );
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  // Process content to handle thinking tags
  const processedContent = processThinkingTags(content);
  
  return (
    <div className={cn("markdown-content", className)}>
      <ReactMarkdown
        components={{
          code: ({ node, inline, className, children, ...props }: any) => (
            <CodeBlock
              inline={inline}
              className={className}
              {...props}
            >
              {String(children).replace(/\n$/, '')}
            </CodeBlock>
          ),
          p: ({ children }) => (
            <p className="mb-3 last:mb-0 leading-relaxed">
              {children}
            </p>
          ),
          h1: ({ children }) => (
            <h1 className="text-xl font-bold mb-4 text-foreground">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-semibold mb-3 text-foreground">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold mb-2 text-foreground">
              {children}
            </h3>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-3 space-y-1">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-3 space-y-1">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-foreground/90">
              {children}
            </li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-focus-border pl-4 py-2 mb-3 bg-sidebar-background/30 italic">
              {children}
            </blockquote>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-foreground/90">
              {children}
            </em>
          ),
          a: ({ children, href }) => (
            <a 
              href={href}
              className="text-focus-border underline hover:text-focus-border/80 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          )
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
