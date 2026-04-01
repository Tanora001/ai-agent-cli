/**
 * 核心类型定义
 * 参考 Claude Code 的 src/Tool.ts, src/types/command.ts, src/types/permissions.ts
 */

import { z } from 'zod'

// ==================== Tool 类型 ====================

/** 工具执行结果 */
export interface ToolResult<T = unknown> {
  data: T
  /** 追加到对话中的新消息 */
  newMessages?: Message[]
  /** 是否被截断 */
  isTruncated?: boolean
}

/** 权限检查结果 */
export interface PermissionResult {
  behavior: 'allow' | 'deny' | 'ask'
  reason?: string
  updatedInput?: unknown
}

/** 输入验证结果 */
export interface ValidationResult {
  valid: boolean
  error?: string
}

/** 工具进度数据 */
export interface ToolProgress {
  type: string
  data?: unknown
}

/** 工具执行上下文 */
export interface ToolUseContext {
  cwd: string
  tools: Tool[]
  commands: Command[]
  messages: Message[]
  abortSignal?: AbortSignal
}

/** 工具定义接口 — 参考 Claude Code 的 Tool<Input, Output, Progress> */
export interface Tool<Input = unknown, Output = unknown> {
  name: string
  description: string
  inputSchema: z.ZodType<Input>

  call(
    input: Input,
    context: ToolUseContext,
    onProgress?: (p: ToolProgress) => void
  ): Promise<ToolResult<Output>>

  /** 是否可并行执行 */
  isConcurrencySafe(input: Input): boolean
  /** 是否只读操作 */
  isReadOnly(input: Input): boolean
  /** 权限检查 */
  checkPermissions(input: Input, context: ToolUseContext): Promise<PermissionResult>
  /** 是否启用 */
  isEnabled(): boolean

  /** 将工具结果序列化为 API 格式 */
  formatResult(output: Output): string
}

// ==================== Command 类型 ====================

/** 命令类型 — 参考 Claude Code 的 PromptCommand / LocalCommand */
export type Command = PromptCommand | LocalCommand

interface CommandBase {
  name: string
  description: string
  isHidden?: boolean
}

/** 提示词命令：注入提示词让模型处理 */
export interface PromptCommand extends CommandBase {
  type: 'prompt'
  getPrompt(args: string, context: ToolUseContext): Promise<string>
}

/** 本地命令：直接在 CLI 中执行 */
export interface LocalCommand extends CommandBase {
  type: 'local'
  execute(args: string, context: ToolUseContext): Promise<void>
}

// ==================== Message 类型 ====================

export interface TextContent {
  type: 'text'
  text: string
}

export interface ToolUseContent {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolResultContent {
  type: 'tool_result'
  tool_use_id: string
  content: string
}

export type ContentBlock = TextContent | ToolUseContent | ToolResultContent

export interface Message {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

// ==================== Permission 类型 ====================

export type PermissionMode = 'default' | 'auto' | 'bypass'

export interface PermissionRule {
  toolName: string
  pattern?: string
  behavior: 'allow' | 'deny' | 'ask'
}

export interface PermissionConfig {
  mode: PermissionMode
  allowRules: PermissionRule[]
  denyRules: PermissionRule[]
}

// ==================== QueryEngine 类型 ====================

export interface QueryConfig {
  model: string
  maxTurns: number
  maxTokens: number
  systemPrompt: string
  tools: Tool[]
  commands: Command[]
  permissionConfig: PermissionConfig
}

export type QueryEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_use'; toolName: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolName: string; result: string }
  | { type: 'turn_complete'; turnCount: number }
  | { type: 'error'; error: Error }

export interface QueryResult {
  messages: Message[]
  usage: { inputTokens: number; outputTokens: number }
  turnCount: number
}
