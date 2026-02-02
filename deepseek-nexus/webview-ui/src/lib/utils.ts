import { type ClassValue, clsx } from "clsx"

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

// VS Code API types for webview communication
declare global {
  interface Window {
    acquireVsCodeApi?: () => {
      postMessage: (message: any) => void;
      setState: (state: any) => void;
      getState: () => any;
    };
  }
}

export const vscode = window.acquireVsCodeApi?.() || {
  postMessage: (message: any) => console.log('Mock vscode.postMessage:', message),
  setState: (state: any) => console.log('Mock vscode.setState:', state),
  getState: () => null
};
