# opencode-glm-usage

[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![opencode plugin](https://img.shields.io/badge/opencode-plugin-7C3AED.svg)](https://opencode.ai)

一个 [opencode](https://opencode.ai) TUI 插件，在侧栏显示**智谱（Zhipu / GLM / Z.ai / BigModel）**的配额用量。

显示内容：

- **5 小时 token 窗口**剩余 % + 重置时间（进度条）
- **月度 MCP** 调用剩余 % + 剩余次数 + 重置时间（进度条）
- **近 24 小时** token 消耗总量
- **按模型** token 明细（GLM-5.2 / GLM-4.7 / …）
- **按工具** MCP 调用次数（ZRead / 联网搜索 / …）
- 账号等级（pro 等）

## 预览

```
GLM 用量  [pro]
5h token  ████████░░ 99%
  ↻ 14:00
24h       136M tokens
  · GLM-5.2    131M
  · GLM-4.7    5M
MCP 月度  ██████░░░░ 78%
  · 剩余       776/1000
  · ZRead      41
  · 联网搜索   22
```

## 工作原理

1. 自动检测已配置的智谱 provider：
   - `options.baseURL` 含 `z.ai` / `open.bigmodel.cn` / `dev.bigmodel.cn`，**或**
   - provider `id` / `name` 含 `zhipu` / `bigmodel` / `z.ai`。
2. 复用该 provider 的 **token / baseURL**（仅来自 opencode provider 配置，**不读取任何环境变量**）。
3. 直接请求智谱监控 API：
   - `/api/monitor/usage/quota/limit` — 配额上限
   - `/api/monitor/usage/model-usage` — 24h 模型用量
   - `/api/monitor/usage/tool-usage` — 24h 工具用量
4. 每 **30 秒** 刷新一次，并在每次会话回复完成（`session.idle`）时刷新。
5. 进度条按剩余量着色：绿 > 40 % / 黄 15–40 % / 红 < 15 %。

> **隐私**：插件直接从你的机器请求智谱官方 API，不经过任何第三方；token 仅用于向智谱 API 鉴权。

## 要求

- [opencode](https://opencode.ai)（基于 Bun，运行时自动转译 TSX，无需构建步骤）
- 已配置一个智谱 provider（通过 `opencode auth` 或在配置里声明），使其 baseURL 指向：
  - `https://open.bigmodel.cn/api/anthropic`（智谱开放平台），或
  - `https://api.z.ai/api/anthropic`（Z.ai）

## 安装

### 方式一：npm（推荐）

在 opencode 的 **tui 配置**（`~/.config/opencode/tui.json`，或项目级 `.opencode/tui.json`）的 `plugin` 数组中添加：

```jsonc
{
  "plugin": ["opencode-glm-usage"]
}
```

opencode 启动时会自动 `bun install` 该包。

> TUI 插件经 **tui 配置文件**（`tui.json`）的 `plugin` 数组加载。若你的版本也支持在 `opencode.json` 的 `plugin` 数组声明，二选一即可。

### 方式二：本地文件

1. 将 [`index.tsx`](./index.tsx) 复制到全局插件目录 `~/.config/opencode/plugins/`（或项目级 `.opencode/plugins/`）。
2. 在 `~/.config/opencode/tui.json` 的 `plugin` 数组里引用它：

```jsonc
{
  "plugin": ["./plugins/index.tsx"]
}
```

> 注意：目录自动发现目前只扫描 `*.{ts,js}`，`.tsx` 需在 `plugin` 数组里显式声明。

## 显示位置

插件注册到侧栏 `sidebar_content` 插槽，仅在**会话视图**的右侧栏出现（与 files / mcp / todo 等节堆叠）。首页无侧栏，故首页不显示。

## 自定义

编辑 [`index.tsx`](./index.tsx)：

| 项目 | 位置 |
|---|---|
| 刷新间隔 | `setInterval(..., 30000)`（毫秒） |
| 着色阈值 | `colorFor()` |
| 进度条宽度 | `BarRow` 的 `width` |
| 刷新时间字段候选 | `RESET_KEYS` |

## 网络 / 代理

插件用 Bun 原生 `fetch`，自动遵循 `HTTPS_PROXY` / `HTTP_PROXY` 环境变量（与 opencode 本体一致），无需额外配置。

## License

[MIT](./LICENSE) © Zhyolo
