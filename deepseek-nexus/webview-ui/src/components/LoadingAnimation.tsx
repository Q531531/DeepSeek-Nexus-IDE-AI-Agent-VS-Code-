import { cn } from '@/lib/utils';

interface LoadingAnimationProps {
  className?: string;
}

export function LoadingAnimation({ className }: LoadingAnimationProps) {
  return (
    <div className={cn("flex items-center space-x-1", className)}>
      <div className="flex space-x-1">
        <div 
          className="w-2 h-2 rounded-full animate-pulse"
          style={{ 
            backgroundColor: 'var(--vscode-editor-foreground)',
            animationDuration: '1.5s',
            animationDelay: '0s'
          }}
        />
        <div 
          className="w-2 h-2 rounded-full animate-pulse"
          style={{ 
            backgroundColor: 'var(--vscode-editor-foreground)',
            animationDuration: '1.5s',
            animationDelay: '0.2s'
          }}
        />
        <div 
          className="w-2 h-2 rounded-full animate-pulse"
          style={{ 
            backgroundColor: 'var(--vscode-editor-foreground)',
            animationDuration: '1.5s',
            animationDelay: '0.4s'
          }}
        />
      </div>
      <span className="text-xs text-foreground/60 ml-2">思考中…</span>
    </div>
  );
}

// Alternative breathing animation
export function BreathingDot({ className }: LoadingAnimationProps) {
  return (
    <>
      <style>
        {`
          @keyframes breathe {
            0%, 100% { 
              opacity: 0.3; 
              transform: scale(1); 
            }
            50% { 
              opacity: 1; 
              transform: scale(1.2); 
            }
          }
          .breathing-dot {
            animation: breathe 2s ease-in-out infinite;
          }
        `}
      </style>
      <div className={cn("flex items-center justify-center", className)}>
        <div 
          className="w-3 h-3 rounded-full breathing-dot"
          style={{ 
            backgroundColor: 'var(--vscode-focusBorder)'
          }}
        />
      </div>
    </>
  );
}
