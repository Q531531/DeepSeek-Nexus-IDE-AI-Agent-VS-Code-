/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--vscode-editor-background)',
        foreground: 'var(--vscode-editor-foreground)',
        'sidebar-background': 'var(--vscode-sideBar-background)',
        'sidebar-foreground': 'var(--vscode-sideBar-foreground)',
        'input-background': 'var(--vscode-input-background)',
        'input-foreground': 'var(--vscode-input-foreground)',
        'input-border': 'var(--vscode-input-border)',
        'button-background': 'var(--vscode-button-background)',
        'button-foreground': 'var(--vscode-button-foreground)',
        'button-hover-background': 'var(--vscode-button-hoverBackground)',
        border: 'var(--vscode-panel-border)',
        'focus-border': 'var(--vscode-focusBorder)',
        'list-hover-background': 'var(--vscode-list-hoverBackground)',
        'list-active-selection-background': 'var(--vscode-list-activeSelectionBackground)',
        'list-active-selection-foreground': 'var(--vscode-list-activeSelectionForeground)'
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      }
    },
  },
  plugins: [],
}
