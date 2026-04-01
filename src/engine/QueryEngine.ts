/**
 * QueryEngine — 通用对话引擎
 *
 * 重构：将 Anthropic SDK 硬编码替换为 LLMProvider 接口，
 * 支持任意大模型（Claude, ChatGPT, ChatGLM, Kimi, DeepSeek, Doubao 等）
 *
 * 核心对话循环：
 * 1. 通过 LLMProvider 发送消息
 * 2. 解析工具调用（标准化的 ContentBlock）
 * 3. 执行工具
 * 4. 将结果反馈给 LLM
 * 5. 重复直到模型不再调用工具
 */

import type { LLMProvider, ChatMessage, ContentBlock as ProviderContentBlock } from '../providers/types.js'
import { findToolByName, validateToolInput, toolToApiFormat } from '../Tool.js'
import type {
  Tool,
  Message,
  ContentBlock,
  ToolUseContext,
  QueryConfig,
  QueryResult,
  QueryEvent,
} from '../types.js'

/** 扩展 QueryConfig，接受 LLMProvider */
export interface EngineConfig extends Omit<QueryConfig, 'permissionConfig'> {
  provider: LLMProvider
}

export class QueryEngine {
  private provider: LLMProvider
  private config: EngineConfig
  private messages: Message[] = []
  private totalUsage = { inputTokens: 0, outputTokens: 0 }

  constructor(config: EngineConfig) {
    this.config = config
    this.provider = config.provider
  }

  /** 提交用户消息并获取回复 */
  async submitMessage(
    userInput: string,
    onEvent?: (event: QueryEvent) => void
  ): Promise<QueryResult> {
    this.messages.push({ role: 'user', content: userInput })

    let turnCount = 0

    while (turnCount < this.config.maxTurns) {
      turnCount++

      // 1. 构建工具定义
      const toolDefs = this.config.tools
        .filter(t => t.isEnabled())
        .map(t => toolToApiFormat(t))

      // 2. 转换消息历史为 Provider 格式
      const chatMessages = this.toChatMessages()

      // 3. 通过 LLMProvider 调用大模型（任何模型都走这个接口）
      const response = await this.provider.chat({
        model: this.config.model,
        messages: chatMessages,
        tools: this.provider.supportsToolUse() ? toolDefs.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        })) : undefined,
        maxTokens: this.config.maxTokens,
        systemPrompt: this.config.systemPrompt,
      })

      // 4. 跟踪 token 使用
      this.totalUsage.inputTokens += response.usage.inputTokens
      this.totalUsage.outputTokens += response.usage.outputTokens

      // 5. 处理响应内容
      const assistantContent: ContentBlock[] = []
      const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = []

      for (const block of response.content) {
        if (block.type === 'text') {
          assistantContent.push({ type: 'text', text: block.text })
          onEvent?.({ type: 'text_delta', text: block.text })
        } else if (block.type === 'tool_use') {
          assistantContent.push({
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input,
          })
          toolUses.push({
            id: block.id,
            name: block.name,
            input: block.input,
          })
        }
      }

      this.messages.push({ role: 'assistant', content: assistantContent })

      // 6. 没有工具调用 → 完成
      if (toolUses.length === 0) {
        onEvent?.({ type: 'turn_complete', turnCount })
        break
      }

      // 7. 执行工具调用
      const toolResults = await this.executeTools(toolUses, onEvent)
      this.messages.push({ role: 'user', content: toolResults })

      onEvent?.({ type: 'turn_complete', turnCount })
    }

    return {
      messages: this.messages,
      usage: this.totalUsage,
      turnCount,
    }
  }

  /** 将内部消息转换为 ChatMessage（Provider 通用格式） */
  private toChatMessages(): ChatMessage[] {
    return this.messages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content as string | ProviderContentBlock[],
    }))
  }

  /** 执行工具调用（并发 + 串行） */
  private async executeTools(
    toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>,
    onEvent?: (event: QueryEvent) => void
  ): Promise<ContentBlock[]> {
    const context: ToolUseContext = {
      cwd: process.cwd(),
      tools: this.config.tools,
      commands: this.config.commands,
      messages: this.messages,
    }

    const concurrent: typeof toolUses = []
    const sequential: typeof toolUses = []

    for (const tu of toolUses) {
      const tool = findToolByName(this.config.tools, tu.name)
      if (tool && tool.isConcurrencySafe(tu.input)) {
        concurrent.push(tu)
      } else {
        sequential.push(tu)
      }
    }

    const results: ContentBlock[] = []

    if (concurrent.length > 0) {
      const r = await Promise.all(
        concurrent.map(tu => this.executeSingleTool(tu, context, onEvent))
      )
      results.push(...r)
    }

    for (const tu of sequential) {
      results.push(await this.executeSingleTool(tu, context, onEvent))
    }

    return results
  }

  /** 执行单个工具 */
  private async executeSingleTool(
    toolUse: { id: string; name: string; input: Record<string, unknown> },
    context: ToolUseContext,
    onEvent?: (event: QueryEvent) => void
  ): Promise<ContentBlock> {
    const tool = findToolByName(this.config.tools, toolUse.name)

    if (!tool) {
      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: `错误: 未知工具 "${toolUse.name}"`,
      }
    }

    const validation = validateToolInput(tool, toolUse.input)
    if (!validation.valid) {
      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: `输入验证失败: ${validation.error}`,
      }
    }

    const permission = await tool.checkPermissions(toolUse.input, context)
    if (permission.behavior === 'deny') {
      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: `权限拒绝: ${permission.reason ?? '操作不被允许'}`,
      }
    }

    onEvent?.({ type: 'tool_use', toolName: tool.name, input: toolUse.input })

    try {
      const result = await tool.call(toolUse.input, context)
      const formatted = tool.formatResult(result.data)

      onEvent?.({
        type: 'tool_result',
        toolName: tool.name,
        result: formatted.slice(0, 200),
      })

      return { type: 'tool_result', tool_use_id: toolUse.id, content: formatted }
    } catch (err) {
      const error = err as Error
      onEvent?.({ type: 'error', error })
      return { type: 'tool_result', tool_use_id: toolUse.id, content: `工具执行错误: ${error.message}` }
    }
  }

  getMessages(): Message[] { return [...this.messages] }
  getUsage() { return { ...this.totalUsage } }
  getProvider(): LLMProvider { return this.provider }
  getModel(): string { return this.config.model }

  reset() {
    this.messages = []
    this.totalUsage = { inputTokens: 0, outputTokens: 0 }
  }
}
