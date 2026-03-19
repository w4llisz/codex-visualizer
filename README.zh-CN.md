# Codex Visualizer

[English](./README.md) | [简体中文](./README.zh-CN.md)

一个独立的 Codex 可视化面板原型，用来观察当前会话的：

- 剩余上下文长度
- 正在执行的工具
- 正在调用的子 agent
- 任务待办事项列表和进度

这个项目直接对接 `codex app-server` 的 WebSocket 接口，同时内置 `mock` 模式，离线也能演示 UI 和状态流转。

## 配置

项目的默认地址、端口、连接模式和 mock 路径都集中在：

- `codex-visualizer.config.mjs`

别人拿到仓库后，优先改这一个文件就行。

## 目录

- `protocol/`: 由 `codex app-server generate-ts` 和 `generate-json-schema` 生成的协议定义
- `src/codex-app-server-client.js`: WebSocket + JSON-RPC 客户端
- `src/store.js`: 把协议事件聚合为 UI 状态
- `src/mock-stream.js`: 离线回放数据
- `src/main.js`: 页面入口和渲染逻辑
- `codex-visualizer.config.mjs`: 全局配置

## 启动

先按需修改 `codex-visualizer.config.mjs`。

再开 Codex app-server：

```bash
cd /path/to/codex-visualizer
npm run start:codex
```

再开静态服务器：

```bash
cd /path/to/codex-visualizer
npm run serve
```

然后在浏览器打开：

```text
配置文件里的 dashboard URL
```

默认 WebSocket 地址是：

```text
配置文件里的 app-server URL
```

## 当前实现

- 自动 `initialize`
- 拉取最近线程列表
- 读取线程历史并重建已发生的 items / plan / token usage
- 接收实时通知并刷新状态
- 支持 `mock` 和 `live` 两种模式切换

## 指标说明

- 上下文剩余长度：
  `modelContextWindow - tokenUsage.total.totalTokens`
- 正在执行的工具：
  `commandExecution` / `dynamicToolCall` / `mcpToolCall` 的 `inProgress` 项
- 子 agent：
  `collabAgentToolCall` 和 `source=subAgent` 的线程
- 待办进度：
  来自 `turn/plan/updated`

## 已知限制

- 这是可视化监控面板，不负责处理审批、用户输入或工具执行回调。
- 如果你希望它成为真正可安装的 Codex marketplace 插件，还需要补充插件分发元数据和宿主集成层。
- 如果某个会话没有上报 `modelContextWindow`，剩余上下文只能显示为未知。
