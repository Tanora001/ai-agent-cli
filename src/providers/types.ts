/**
 * LLM Provider 抽象层 — 类型定义
 *
 * 核心设计：所有大模型 API 都通过 LLMProvider 接口调用，
 * Provider 负责将标准化格式转换为各家 API 的原生格式。
 *
 * 支持的大模型：
 * - Claude (Anthropic 原生)
 * - ChatGPT / GPT-4 (OpenAI)
 * - ChatGLM / GLM-4 (智谱 AI) — OpenAI 兼容
 * - Kimi / Moonshot (月之暗面) — OpenAI 兼容
 * - MiniMax — OpenAI 兼容
 * - Doubao / 豆包 (字节跳动) — OpenAI 兼容
 * - DeepSeek — OpenAI 兼容
 * - Qwen / 通义千问 (阿里) — OpenAI 兼容
 * - Gemini (Google)
 * - 以及任何 OpenAI 兼容接口的大模型
 */

// ==================== 标准化消息类型 ====================

/** 文本内容块 */
export interface TextBlock {
  type: 'text'
  text: string
}

/** 工具调用块 */
export interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

/** 工具结果块 */
export interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock

/** 标准化消息 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | ContentBlock[]
  /** OpenAI 格式：assistant 消息上的 tool_calls */
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  /** OpenAI 格式：tool 消息上的 tool_call_id */
  tool_call_id?: string
}

/** 标准化工具定义（给 LLM 看的） */
export interface ChatToolDef {
  name: string
  description: string
  parameters: Record<string, unknown> // JSON Schema
}

/** 标准化响应 */
export interface ChatResponse {
  /** 内容块（文本 + 工具调用） */
  content: ContentBlock[]
  /** 停止原因 */
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop'
  /** Token 用量 */
  usage: {
    inputTokens: number
    outputTokens: number
  }
}

// ==================== Provider 接口 ====================

/** LLM 调用参数 */
export interface ChatParams {
  model: string
  messages: ChatMessage[]
  tools?: ChatToolDef[]
  maxTokens?: number
  systemPrompt?: string
  temperature?: number
  /** 是否强制使用工具 */
  toolChoice?: 'auto' | 'none' | { name: string }
}

/**
 * LLM Provider 接口
 *
 * 每个大模型 API 实现此接口。
 * QueryEngine 和 Agent 系统只与此接口交互，
 * 不直接依赖任何特定 SDK。
 */
export interface LLMProvider {
  /** Provider 名称（如 "anthropic", "openai-compatible"） */
  readonly name: string

  /** 大模型调用 */
  chat(params: ChatParams): Promise<ChatResponse>

  /** 列出可用模型 */
  listModels(): Promise<string[]>

  /** 是否支持工具调用 */
  supportsToolUse(): boolean
}

/** Provider 工厂函数 */
export type LLMProviderFactory = (config: ProviderInstanceConfig) => LLMProvider

/** 单个 Provider 实例配置 */
export interface ProviderInstanceConfig {
  apiKey: string
  baseUrl?: string
  options?: Record<string, unknown>
}

// ==================== 配置类型 ====================

/** Provider 配置（在 config.json 中） */
export interface ProviderConfig {
  type: string          // "anthropic" | "openai-compatible" | "gemini"
  apiKey: string        // 支持 "${ENV_VAR}" 语法
  baseUrl?: string      // API 基地址
  options?: Record<string, unknown>
}

/** 模型别名映射 */
export interface ModelAlias {
  provider: string      // 对应 providers 中的 key
  model: string         // 实际模型 ID
}
