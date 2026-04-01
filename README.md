# AI Agent CLI

A multi-LLM AI Agent command-line framework that supports **any LLM API** — Claude, ChatGPT, Kimi, DeepSeek, ChatGLM, Doubao, Qwen, MiniMax, Gemini, and any OpenAI-compatible endpoint.

[English](#features) | [中文](#中文说明)

## Features

- **Multi-LLM Support** — One unified interface for 10+ LLM providers. Switch models with a single config change.
- **Tool System** — Extensible tool framework with Zod validation, permission control, and concurrent execution.
- **Multi-Agent Coordination** — Coordinator/Worker architecture with cross-provider agent calling. Each agent can use a different LLM.
- **MCP Integration** — Built-in Model Context Protocol tools, extensible with custom MCP servers.
- **Interactive CLI** — REPL mode with `/commands`, single-query mode, and multi-agent mode.

## Supported LLM Providers

All providers using the OpenAI-compatible chat completions format are supported out of the box:

| Provider | Type | Base URL | Example Models |
|----------|------|----------|----------------|
| **Claude** | `anthropic` | (default) | claude-opus-4-6, claude-sonnet-4-6 |
| **ChatGPT** | `openai-compatible` | `https://api.openai.com/v1` | gpt-4o, gpt-4o-mini |
| **Kimi** | `openai-compatible` | `https://api.moonshot.cn/v1` | moonshot-v1-8k, moonshot-v1-32k |
| **DeepSeek** | `openai-compatible` | `https://api.deepseek.com` | deepseek-chat, deepseek-coder |
| **ChatGLM** | `openai-compatible` | `https://open.bigmodel.cn/api/paas/v4` | glm-4, glm-4-flash |
| **Qwen** | `openai-compatible` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | qwen-turbo, qwen-max |
| **Doubao** | `openai-compatible` | `https://ark.cn-beijing.volces.com/api/v3` | doubao-* |
| **MiniMax** | `openai-compatible` | `https://api.minimax.chat/v1` | MiniMax-Text-01 |
| **Gemini** | `openai-compatible` | `https://generativelanguage.googleapis.com/v1beta/openai` | gemini-2.0-flash |
| **Yi** | `openai-compatible` | `https://api.lingyiwanwu.com/v1` | yi-large |
| **Baichuan** | `openai-compatible` | `https://api.baichuan-ai.com/v1` | Baichuan4 |

> Any endpoint following the OpenAI `POST /chat/completions` format works — just set the `baseUrl`.

## Quick Start

### Install

```bash
git clone https://github.com/YOUR_USERNAME/ai-agent-cli.git
cd ai-agent-cli
npm install
```

### Configure

Generate an example config file:

```bash
npm run init-config
# Creates ~/.ai-agent/config.json
```

Or set the API key as an environment variable:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."    # For Claude
export OPENAI_API_KEY="sk-..."           # For ChatGPT
export MOONSHOT_API_KEY="sk-..."         # For Kimi
export DEEPSEEK_API_KEY="sk-..."         # For DeepSeek
```

### Run

```bash
# Interactive mode (default provider)
npm run dev

# Single query
npm run dev -- "explain this project structure"

# Use a specific provider and model
npm run dev -- --provider kimi --model moonshot-v1-8k

# Multi-agent mode
npm run dev
> /agent analyze this codebase and suggest improvements
```

## Configuration

Config file location: `~/.ai-agent/config.json` or `./ai-agent.config.json`

```jsonc
{
  // Default provider and model
  "defaultProvider": "claude",
  "defaultModel": "claude-sonnet-4-20250514",

  // Provider definitions
  "providers": {
    "claude": {
      "type": "anthropic",
      "apiKey": "${ANTHROPIC_API_KEY}"
    },
    "kimi": {
      "type": "openai-compatible",
      "apiKey": "${MOONSHOT_API_KEY}",
      "baseUrl": "https://api.moonshot.cn/v1"
    },
    "deepseek": {
      "type": "openai-compatible",
      "apiKey": "${DEEPSEEK_API_KEY}",
      "baseUrl": "https://api.deepseek.com"
    }
  },

  // Model aliases (optional shorthand)
  "models": {
    "smart": { "provider": "claude", "model": "claude-opus-4-6" },
    "fast":  { "provider": "kimi",   "model": "moonshot-v1-8k" },
    "code":  { "provider": "deepseek", "model": "deepseek-coder" }
  },

  // Agent definitions for multi-agent mode
  "agents": [
    {
      "name": "researcher",
      "description": "Information gathering and analysis",
      "systemPrompt": "You are a research agent...",
      "provider": "kimi",
      "model": "moonshot-v1-32k"
    },
    {
      "name": "coder",
      "description": "Code writing and modification",
      "systemPrompt": "You are a coding agent...",
      "provider": "deepseek",
      "model": "deepseek-coder"
    },
    {
      "name": "reviewer",
      "description": "Code review and quality checks",
      "systemPrompt": "You are a review agent...",
      "provider": "claude",
      "model": "claude-sonnet-4-20250514"
    }
  ]
}
```

API keys support `${ENV_VAR}` syntax — the value is resolved from environment variables at runtime, so secrets are never stored in plaintext.

## Architecture

```
                           User Input
                               |
                       +--------------+
                       |   CLI Entry   |
                       |  (index.ts)   |
                       +------+-------+
                              |
              +---------------+----------------+
              |               |                |
     +--------v------+  +----v-----+  +-------v--------+
     |  QueryEngine  |  | Commands |  |  Coordinator   |
     | (conversation |  | (/help,  |  | (multi-agent   |
     |    loop)      |  | /commit) |  |  orchestrator) |
     +--------+------+  +----------+  +-------+--------+
              |                                |
     +--------v--------+             +--------v--------+
     |  LLM Provider   |             |  Worker Agents  |
     | (abstraction)   |             | (each can use a |
     +--------+--------+             |  different LLM) |
              |                      +-----------------+
    +---------+---------+
    |         |         |
 Claude   OpenAI    Any LLM
          compat.   endpoint
```

### Core Modules

| Module | Description |
|--------|-------------|
| `providers/` | LLM abstraction layer — `anthropic.ts` + `openai-compatible.ts` cover all providers |
| `engine/` | QueryEngine: conversation loop with tool execution |
| `tools/` | Built-in tools: Bash, FileRead, FileWrite, Agent |
| `agents/` | Multi-agent: Coordinator, Worker, TaskManager |
| `mcp/` | Embedded MCP tools (calculator, file analyzer) |
| `commands/` | CLI commands: /help, /commit, /review, /agent, etc. |
| `config/` | Config loading with `${ENV_VAR}` resolution |
| `permissions/` | Tool permission control (allow/deny/ask) |

### Cross-Agent Calling

The `AgentTool` enables any agent to invoke another agent during a conversation. Each agent can use a different LLM provider:

```
User: "Analyze this project and fix the bugs"

  Coordinator (Claude) decomposes the task:
    |
    +-- Task 1 --> researcher (Kimi/32k context)
    |              "Analyze project structure"
    |
    +-- Task 2 --> coder (DeepSeek)         [depends on Task 1]
    |              "Fix identified bugs"
    |
    +-- Task 3 --> reviewer (Claude)        [depends on Task 2]
    |              "Review the fixes"
    |
    +-- Coordinator aggregates results --> Final answer
```

## Built-in Tools

| Tool | Description | Concurrent | Read-only |
|------|-------------|:----------:|:---------:|
| `Bash` | Execute shell commands | No | Depends |
| `FileRead` | Read file contents | Yes | Yes |
| `FileWrite` | Create/write files | No | No |
| `Agent` | Invoke another agent | Yes | Yes |
| `mcp__builtin__calculate` | Math calculations | Yes | Yes |
| `mcp__builtin__analyze_directory` | Directory statistics | Yes | Yes |

## CLI Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/config` | Show current provider/model configuration |
| `/models` | List available model aliases |
| `/agent <task>` | Run task in multi-agent coordinator mode |
| `/tasks` | Show agent task status |
| `/review` | Review current git changes |
| `/commit` | Generate commit message and commit |
| `/explain` | Explain project structure |
| `/clear` | Clear screen |
| `/exit` | Exit |

## Adding a New LLM Provider

Most LLMs work via the `openai-compatible` type — just add to config:

```json
{
  "providers": {
    "my-llm": {
      "type": "openai-compatible",
      "apiKey": "${MY_LLM_API_KEY}",
      "baseUrl": "https://api.my-llm.com/v1"
    }
  }
}
```

For a completely custom API format, implement the `LLMProvider` interface:

```typescript
import { registerProviderFactory } from './providers/registry.js'

registerProviderFactory('my-custom', (config) => ({
  name: 'my-custom',
  supportsToolUse: () => true,
  listModels: async () => ['model-a', 'model-b'],
  chat: async (params) => {
    // Call your custom API and return ChatResponse
  },
}))
```

## Adding a New Tool

```typescript
import { z } from 'zod'
import { buildTool } from './Tool.js'

export const MyTool = buildTool({
  name: 'MyTool',
  description: 'What this tool does',
  inputSchema: z.object({
    query: z.string().describe('The search query'),
  }),
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  async call(input, context) {
    // Tool implementation
    return { data: `Result for: ${input.query}` }
  },
})
```

Then register it in `tools/index.ts`.

## Development

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm run dev          # Run in development mode (tsx)
npm start            # Run compiled version
```

## Project Origin

This project was inspired by studying the architecture of [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — Anthropic's official CLI for Claude. Key patterns borrowed include:

- **Tool abstraction** (`buildTool` pattern with Zod validation)
- **QueryEngine** (streaming conversation loop with tool execution)
- **Multi-source command system** (built-in + skills + plugins)
- **Permission control** (allow/deny/ask chain)
- **Agent coordination** (Coordinator/Worker/TaskManager)

See the `docs/` folder in the parent directory for detailed architecture analysis.

## License

MIT

---

## 中文说明

AI Agent CLI 是一个支持**任意大模型 API**的 AI Agent 命令行框架。

### 核心特性

- **多模型支持** — 一个统一接口对接 Claude、ChatGPT、Kimi、DeepSeek、ChatGLM、豆包、通义千问、MiniMax、Gemini 等 10+ 大模型
- **工具系统** — 可扩展的工具框架，支持 Zod 校验、权限控制、并发执行
- **多 Agent 协调** — Coordinator/Worker 架构，支持跨模型的 Agent 调用。例如用 Claude 做协调器，Kimi 做研究，DeepSeek 写代码
- **MCP 集成** — 内置 Model Context Protocol 工具，可扩展自定义 MCP Server
- **交互式 CLI** — REPL 模式支持 `/命令`，也支持单次查询模式和多 Agent 模式

### 支持的大模型

所有兼容 OpenAI `POST /chat/completions` 格式的 API 均可直接使用：

| 提供商 | 类型 | Base URL | 示例模型 |
|--------|------|----------|----------|
| **Claude** | `anthropic` | (默认) | claude-opus-4-6, claude-sonnet-4-6 |
| **ChatGPT** | `openai-compatible` | `https://api.openai.com/v1` | gpt-4o, gpt-4o-mini |
| **Kimi (月之暗面)** | `openai-compatible` | `https://api.moonshot.cn/v1` | moonshot-v1-8k, moonshot-v1-32k |
| **DeepSeek (深度求索)** | `openai-compatible` | `https://api.deepseek.com` | deepseek-chat, deepseek-coder |
| **ChatGLM (智谱)** | `openai-compatible` | `https://open.bigmodel.cn/api/paas/v4` | glm-4, glm-4-flash |
| **通义千问** | `openai-compatible` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | qwen-turbo, qwen-max |
| **豆包 (字节)** | `openai-compatible` | `https://ark.cn-beijing.volces.com/api/v3` | doubao-* |
| **MiniMax** | `openai-compatible` | `https://api.minimax.chat/v1` | MiniMax-Text-01 |
| **Gemini** | `openai-compatible` | `https://generativelanguage.googleapis.com/v1beta/openai` | gemini-2.0-flash |
| **零一万物** | `openai-compatible` | `https://api.lingyiwanwu.com/v1` | yi-large |
| **百川智能** | `openai-compatible` | `https://api.baichuan-ai.com/v1` | Baichuan4 |

> 任何遵循 OpenAI `POST /chat/completions` 格式的接口都可以直接接入，只需配置 `baseUrl` 即可。

### 快速开始

#### 安装

```bash
git clone https://github.com/YOUR_USERNAME/ai-agent-cli.git
cd ai-agent-cli
npm install
```

#### 配置

生成示例配置文件：

```bash
npm run init-config
# 会在 ~/.ai-agent/config.json 创建配置文件
```

或者通过环境变量设置 API Key：

```bash
export ANTHROPIC_API_KEY="sk-ant-..."    # Claude
export OPENAI_API_KEY="sk-..."           # ChatGPT
export MOONSHOT_API_KEY="sk-..."         # Kimi
export DEEPSEEK_API_KEY="sk-..."         # DeepSeek
```

#### 运行

```bash
# 交互模式（使用默认提供商）
npm run dev

# 单次查询
npm run dev -- "解释一下这个项目的结构"

# 指定提供商和模型
npm run dev -- --provider kimi --model moonshot-v1-8k

# 多 Agent 模式
npm run dev
> /agent 分析这个代码库并提出改进建议
```

### 配置说明

配置文件位置：`~/.ai-agent/config.json` 或 `./ai-agent.config.json`

```jsonc
{
  // 默认提供商和模型
  "defaultProvider": "claude",
  "defaultModel": "claude-sonnet-4-20250514",

  // 提供商定义
  "providers": {
    "claude": {
      "type": "anthropic",
      "apiKey": "${ANTHROPIC_API_KEY}"
    },
    "kimi": {
      "type": "openai-compatible",
      "apiKey": "${MOONSHOT_API_KEY}",
      "baseUrl": "https://api.moonshot.cn/v1"
    },
    "deepseek": {
      "type": "openai-compatible",
      "apiKey": "${DEEPSEEK_API_KEY}",
      "baseUrl": "https://api.deepseek.com"
    }
  },

  // 模型别名（可选的快捷方式）
  "models": {
    "smart": { "provider": "claude", "model": "claude-opus-4-6" },
    "fast":  { "provider": "kimi",   "model": "moonshot-v1-8k" },
    "code":  { "provider": "deepseek", "model": "deepseek-coder" }
  },

  // 多 Agent 模式下的 Agent 定义
  "agents": [
    {
      "name": "researcher",
      "description": "信息收集与分析",
      "systemPrompt": "你是一个研究型 Agent...",
      "provider": "kimi",
      "model": "moonshot-v1-32k"
    },
    {
      "name": "coder",
      "description": "代码编写与修改",
      "systemPrompt": "你是一个编程 Agent...",
      "provider": "deepseek",
      "model": "deepseek-coder"
    },
    {
      "name": "reviewer",
      "description": "代码审查与质量检查",
      "systemPrompt": "你是一个代码审查 Agent...",
      "provider": "claude",
      "model": "claude-sonnet-4-20250514"
    }
  ]
}
```

API Key 支持 `${ENV_VAR}` 语法 — 运行时从环境变量读取，密钥不会明文存储在配置中。

### 架构设计

```
                           用户输入
                               |
                       +--------------+
                       |   CLI 入口    |
                       |  (index.ts)   |
                       +------+-------+
                              |
              +---------------+----------------+
              |               |                |
     +--------v------+  +----v-----+  +-------v--------+
     |  QueryEngine  |  |   命令    |  |  Coordinator   |
     | (对话循环引擎) |  | (/help,  |  | (多 Agent 编排) |
     |               |  | /commit) |  |                |
     +--------+------+  +----------+  +-------+--------+
              |                                |
     +--------v--------+             +--------v--------+
     |  LLM Provider   |             |  Worker Agents  |
     | (统一抽象层)     |             | (每个可使用不同  |
     +--------+--------+             |  的大模型)      |
              |                      +-----------------+
    +---------+---------+
    |         |         |
 Claude   OpenAI    任意大模型
          兼容接口    端点
```

### 核心模块

| 模块 | 说明 |
|------|------|
| `providers/` | 大模型抽象层 — `anthropic.ts` + `openai-compatible.ts` 覆盖所有提供商 |
| `engine/` | QueryEngine：流式对话循环 + 工具执行引擎 |
| `tools/` | 内置工具：Bash、FileRead、FileWrite、Agent |
| `agents/` | 多 Agent：Coordinator（协调器）、Worker（工作者）、TaskManager（任务管理器） |
| `mcp/` | 嵌入式 MCP 工具（计算器、文件分析器） |
| `commands/` | CLI 命令：/help、/commit、/review、/agent 等 |
| `config/` | 配置加载，支持 `${ENV_VAR}` 环境变量解析 |
| `permissions/` | 工具权限控制（允许/拒绝/询问） |

### 跨模型 Agent 协作

`AgentTool` 允许任意 Agent 在对话过程中调用其他 Agent，每个 Agent 可以使用不同的大模型：

```
用户: "分析这个项目并修复 bug"

  Coordinator (Claude) 分解任务:
    |
    +-- 任务 1 --> researcher (Kimi/32k 上下文)
    |              "分析项目结构"
    |
    +-- 任务 2 --> coder (DeepSeek)         [依赖任务 1]
    |              "修复发现的 bug"
    |
    +-- 任务 3 --> reviewer (Claude)        [依赖任务 2]
    |              "审查修复内容"
    |
    +-- Coordinator 汇总结果 --> 最终回答
```

### 内置工具

| 工具 | 说明 | 支持并发 | 只读 |
|------|------|:--------:|:----:|
| `Bash` | 执行 Shell 命令 | 否 | 视情况 |
| `FileRead` | 读取文件内容 | 是 | 是 |
| `FileWrite` | 创建/写入文件 | 否 | 否 |
| `Agent` | 调用其他 Agent | 是 | 是 |
| `mcp__builtin__calculate` | 数学计算 | 是 | 是 |
| `mcp__builtin__analyze_directory` | 目录统计分析 | 是 | 是 |

### CLI 命令

| 命令 | 说明 |
|------|------|
| `/help` | 显示可用命令 |
| `/config` | 显示当前提供商/模型配置 |
| `/models` | 列出可用的模型别名 |
| `/agent <任务>` | 以多 Agent 协调模式运行任务 |
| `/tasks` | 显示 Agent 任务状态 |
| `/review` | 审查当前 git 变更 |
| `/commit` | 生成 commit 消息并提交 |
| `/explain` | 解释项目结构 |
| `/clear` | 清屏 |
| `/exit` | 退出 |

### 添加新的大模型

大多数大模型通过 `openai-compatible` 类型即可接入 — 只需在配置中添加：

```json
{
  "providers": {
    "my-llm": {
      "type": "openai-compatible",
      "apiKey": "${MY_LLM_API_KEY}",
      "baseUrl": "https://api.my-llm.com/v1"
    }
  }
}
```

如果 API 格式完全不同，可以实现 `LLMProvider` 接口：

```typescript
import { registerProviderFactory } from './providers/registry.js'

registerProviderFactory('my-custom', (config) => ({
  name: 'my-custom',
  supportsToolUse: () => true,
  listModels: async () => ['model-a', 'model-b'],
  chat: async (params) => {
    // 调用自定义 API 并返回 ChatResponse
  },
}))
```

### 添加新工具

```typescript
import { z } from 'zod'
import { buildTool } from './Tool.js'

export const MyTool = buildTool({
  name: 'MyTool',
  description: '这个工具的功能描述',
  inputSchema: z.object({
    query: z.string().describe('搜索关键词'),
  }),
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  async call(input, context) {
    // 工具实现
    return { data: `结果: ${input.query}` }
  },
})
```

然后在 `tools/index.ts` 中注册即可。

### 开发

```bash
npm install          # 安装依赖
npm run build        # 编译 TypeScript
npm run dev          # 开发模式运行（tsx）
npm start            # 运行编译后的版本
```

### 项目灵感

本项目的架构设计参考了 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — Anthropic 官方 CLI 工具。借鉴的关键设计模式包括：

- **工具抽象**（`buildTool` 模式 + Zod 校验）
- **QueryEngine**（流式对话循环 + 工具执行）
- **多源命令系统**（内置 + 技能 + 插件）
- **权限控制**（允许/拒绝/询问链）
- **Agent 协调**（Coordinator/Worker/TaskManager）

详细的架构分析文档见上级目录的 `docs/` 文件夹。
