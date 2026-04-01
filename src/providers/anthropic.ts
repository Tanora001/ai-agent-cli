/**
 * Anthropic (Claude) Provider
 * 将标准化接口转换为 Anthropic SDK 格式
 */

import Anthropic from '@anthropic-ai/sdk'
import type {
  LLMProvider, ChatParams, ChatResponse,
  ContentBlock, ChatMessage, ProviderInstanceConfig,
} from './types.js'

export function createAnthropicProvider(config: ProviderInstanceConfig): LLMProvider {
  const client = new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  })

  return {
    name: 'anthropic',

    supportsToolUse: () => true,

    async listModels() {
      return [
        'claude-opus-4-6',
        'claude-sonnet-4-6',
        'claude-haiku-4-5-20251001',
        'claude-sonnet-4-20250514',
      ]
    },

    async chat(params: ChatParams): Promise<ChatResponse> {
      // 1. 转换消息：将标准化格式 → Anthropic 格式
      const messages = convertToAnthropicMessages(params.messages)

      // 2. 转换工具定义
      const tools = params.tools?.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Tool.InputSchema,
      }))

      // 3. 调用 API
      const response = await client.messages.create({
        model: params.model,
        max_tokens: params.maxTokens ?? 8192,
        system: params.systemPrompt,
        messages,
        ...(tools && tools.length > 0 ? { tools } : {}),
      })

      // 4. 转换响应：Anthropic 格式 → 标准化格式
      return convertFromAnthropicResponse(response)
    },
  }
}

/** 标准化消息 → Anthropic 消息 */
function convertToAnthropicMessages(
  messages: ChatMessage[]
): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = []

  for (const msg of messages) {
    // Anthropic 不支持 system role 在 messages 中（用顶层 system 参数）
    if (msg.role === 'system') continue

    if (msg.role === 'tool') {
      // tool 消息转换为 user 消息中的 tool_result 块
      result.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: msg.tool_call_id!,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        }],
      })
      continue
    }

    if (typeof msg.content === 'string') {
      result.push({ role: msg.role as 'user' | 'assistant', content: msg.content })
    } else {
      // ContentBlock[] → Anthropic ContentBlock[]
      const blocks: Anthropic.ContentBlockParam[] = []
      for (const block of msg.content) {
        if (block.type === 'text') {
          blocks.push({ type: 'text', text: block.text })
        } else if (block.type === 'tool_use') {
          blocks.push({
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input,
          })
        } else if (block.type === 'tool_result') {
          blocks.push({
            type: 'tool_result',
            tool_use_id: block.tool_use_id,
            content: block.content,
          })
        }
      }
      result.push({ role: msg.role as 'user' | 'assistant', content: blocks })
    }
  }

  return result
}

/** Anthropic 响应 → 标准化响应 */
function convertFromAnthropicResponse(response: Anthropic.Message): ChatResponse {
  const content: ContentBlock[] = []

  for (const block of response.content) {
    if (block.type === 'text') {
      content.push({ type: 'text', text: block.text })
    } else if (block.type === 'tool_use') {
      content.push({
        type: 'tool_use',
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      })
    }
  }

  const stopReasonMap: Record<string, ChatResponse['stopReason']> = {
    'end_turn': 'end_turn',
    'tool_use': 'tool_use',
    'max_tokens': 'max_tokens',
    'stop_sequence': 'stop',
  }

  return {
    content,
    stopReason: (response.stop_reason ? stopReasonMap[response.stop_reason] : undefined) ?? 'end_turn',
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  }
}
