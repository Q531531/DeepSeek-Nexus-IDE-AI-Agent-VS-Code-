 开发说明文档（danqingCodeAgent）
技术架构与实现方案

总体结构

该项目由两部分组成：

- VS Code 扩展（Extension Host / Node.js）：负责与 VS Code API 交互、调用模型接口、维护会话、注入上下文、执行落盘写文件等高权限操作。
- Webview UI（React）：负责聊天界面渲染、流式展示、用户交互（发送/停止/配置/复制/应用更改）。

代码目录：

- [src/](agent/deepseek-nexus/src)：扩展端 TypeScript 源码
- [webview-ui/src/](agent/deepseek-nexus/webview-ui/src)：Webview 前端源码（React + Vite + Tailwind）
- [dist/](agent/deepseek-nexus/dist)：编译产物（扩展端 JS + webview 打包产物）

扩展端：会话与流式实现

- 入口与注册
  - 激活入口：activate() 注册 WebviewViewProvider 与命令（[extension.ts](agent/deepseek-nexus/src/extension.ts)）。
  - 视图提供者：ChatViewProvider 负责 Webview 生命周期与消息收发（[chatViewProvider.ts](agent/deepseek-nexus/src/chatViewProvider.ts)）。

- 模型调用
  - 使用 `openai` SDK，通过可配置 `baseUrl` 与 `apiKey` 适配 SiliconFlow/OpenAI/OpenRouter/Moonshot（[chatProvider.ts](agent/deepseek-nexus/src/chatProvider.ts)）。
  - `streamChatCompletion()` 采用 `stream: true`，逐 chunk 回传前端进行增量渲染。

- 会话管理
  - 扩展端维护 `_conversationHistory`，存储 user/assistant（以及系统指令 system）消息。
  - Webview 重建/快速切换时，扩展端通过 `historySnapshot` 下发完整历史与当前流缓冲，避免白屏与“需要切两次”。

上下文注入策略

当前策略：默认同时注入当前文件 + 工作区摘要（前端不暴露开关）。

- 当前文件：优先读取活跃编辑器；失败则尝试可见编辑器；仍失败则提示用户打开文件。
- 工作区：在工作区根目录中筛选最多 N 个文件（排除 node_modules/dist 等），每个文件截断后拼接成“工作区上下文摘要”，避免一次性塞入全仓库导致 token 爆炸。

实现位于 [chatViewProvider.ts](agent/deepseek-nexus/src/chatViewProvider.ts) 的 `_getCurrentFileContent()` 与 `_getWorkspaceContext()`。

写代码与确认/取消方案

目标：让模型输出“按文件修改”的可执行结果，并在扩展端完成 预览 Diff → 用户确认/取消 → 写入落盘。

实现要点：

- 系统指令约束输出格式：扩展端注入 system message，要求模型在需要改代码时输出 `FILE: path` + 代码块（建议完整文件内容），以便解析与落盘。
- Webview 触发应用：助手消息若包含 `FILE:` 代码块，消息底部展示“应用更改”按钮；点击后将整条消息内容发送给扩展端处理。
- 解析与安全
  - 只接受相对工作区路径，拒绝绝对路径与 `..` 等路径穿越。
  - 支持多文件；先预览第一份文件的 diff，再进行一次性确认写入。
- 预览 Diff
  - 使用 `TextDocumentContentProvider` 注册虚拟 scheme（original/preview），通过 `vscode.diff` 打开左右对比视图。
- 确认/取消
  - 使用 `showInformationMessage(..., { modal: true }, '确认')` 实现强确认。
  - 用户取消则不写入。
- 落盘
  - 使用 `workspace.fs.writeFile()` 写入文件；文件不存在则自动创建目录与文件。

相关实现：

- Webview 侧按钮与消息发送：[MessageBubble.tsx](agent/deepseek-nexus/webview-ui/src/components/MessageBubble.tsx)
- 扩展端解析与落盘：[chatViewProvider.ts](agent/deepseek-nexus/src/chatViewProvider.ts)

功能模块详细说明

1) 聊天 UI（Webview）

- 核心组件
  - ChatContainer：消息列表与滚动（[ChatContainer.tsx](agent/deepseek-nexus/webview-ui/src/components/ChatContainer.tsx)）
  - MessageBubble：消息气泡、复制内容、应用更改入口（[MessageBubble.tsx](agent/deepseek-nexus/webview-ui/src/components/MessageBubble.tsx)）
  - MarkdownRenderer：Markdown + 代码高亮（[MarkdownRenderer.tsx](agent/deepseek-nexus/webview-ui/src/components/MarkdownRenderer.tsx)）
  - PromptInput：输入框、停止、清空等（[PromptInput.tsx](agent/deepseek-nexus/webview-ui/src/components/PromptInput.tsx)）

- 消息通道（Webview ↔ Extension）
  - Webview → Extension：
    - `sendMessage`：发送用户问题（默认携带上下文开关为 true）
    - `stopGeneration`：中断流式
    - `clearConversation`：清空会话
    - `requestSettings` / `saveSettings`：配置密钥
    - `applyEditsFromMessage`：对包含 FILE 块的助手消息执行“应用更改”
  - Extension → Webview：
    - `streamChunk` / `streamComplete`：流式渲染
    - `historySnapshot`：历史快照（解决切换/重建导致的空白）
    - `configSnapshot`：回传当前 provider/model/keys
    - `contextWarning`：上下文读取失败提示

2) 模型调用（ChatProvider）

- 多服务商统一封装：使用 `baseUrl + apiKey` 适配（[chatProvider.ts](agent/deepseek-nexus/src/chatProvider.ts)）。
- `streamChatCompletion()` 提供 chunk 回调，供 ChatViewProvider 将内容转发给 Webview。

3) 上下文收集（ChatViewProvider）

- 当前文件读取：多策略兜底（活跃/可见/工作区文件）并截断避免 payload 过大。
- 工作区摘要：基于 glob 过滤与文件截断。

4) 应用更改（按文件落盘）

- 触发：助手消息底部“应用更改”
- 解析：从 assistant 内容中提取多个 `FILE: xxx` + ```...``` 块
- 预览：vscode.diff（虚拟 document provider）
- 确认：modal confirm
- 写入：workspace.fs.writeFile（支持新建目录/文件）

配置与使用指南

VS Code 配置项

扩展配置前缀：`deepseek.`（见根目录 package.json 的 contributes.configuration）。

- `deepseek.provider`：服务商（siliconflow/openai/openrouter/moonshot）
- `deepseek.baseUrl`：接口地址（不同服务商默认不同）
- `deepseek.model`：模型 ID（不同服务商可用模型不同）
- `deepseek.apiKeys.`：各服务商 API Key（推荐使用对应 provider 的 key）
- `deepseek.apiKey`：兼容旧的 SiliconFlow key 字段（若 `apiKeys.siliconflow` 未填，会回退读取）

使用方式

- 打开侧边栏 “DeepSeek Nexus” → “DeepSeek Chat”
- 在配置面板填写对应服务商 API Key
- 提问后会自动注入当前文件 + 工作区摘要（无需手动点击）
- 若助手回复包含 `FILE:` 修改块，消息底部会出现“应用更改”
  - 点击后先预览 diff
  - 在弹窗中选择确认/取消

开发与构建

- 扩展端编译：`npm run compile`
- Webview 构建：`npm run build-webview`（产物输出到 `dist/webview/`）
- 调试：
  - 使用 VS Code 运行扩展调试（.vscode/launch.json）
  - 修改 webview-ui 后需重新 build-webview 才会反映到打包产物
