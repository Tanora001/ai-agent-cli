/**
 * OpenAI 兼容 Provider
 *
 * 一个 Provider 覆盖所有 OpenAI 兼容 API 的大模型：
 *
 * | 大模型     | baseUrl                                            | 示例模型             |
 * |-----------|----------------------------------------------------|--------------------|
 * | ChatGPT   | https://api.openai.com/v1                          | gpt-4o, gpt-4o-mini|
 * | ChatGLM   | https://open.bigmodel.cn/api/paas/v4               | glm-4, glm-4-flash |
 * | Kimi      | https://api.moonshot.cn/v1                         | moonshot-v1-8k     |
 * | MiniMax   | https://api.minimax.chat/v1                        | MiniMax-Text-01    |
 * | Doubao    | https://ark.cn-beijing.volces.com/api/v3            | doubao-*           |
 * | DeepSeek  | https://api.deepseek.com                           | deepseek-chat      |
 * | Qwen      | https://dashscope.aliyuncs.com/compatible-mode/v1  | qwen-turbo         |
 * | Yi        | https://api.lingyiwanwu.com/v1                     | yi-large           |
 * | Baichuan  | https://api.baichuan-ai.com/v1                     | Baichuan4          |
 * | Spark     | https://spark-api-open.xf-yun.com/v1               | generalv3.5        |
 *
 * 使用原生 fetch，不依赖 openai npm 包。
 */

import type {
  LLMProvider, ChatParams, ChatResponse,
  ContentBlock, ChatMessage, ChatToolDef,
  ProviderInstanceConfig,
} from './types.js'

/** OpenAI 消息格式 */
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

/** OpenAI 工具格式 */
interface OpenAITool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/** OpenAI 响应格式 */
interface OpenAIResponse {
  id: string
  choices: Array<{
    message: {
      role: 'assistant'
      content?: string | null
      tool_calls?: Array<{
        id: string
        type: 'function'
        function: { name: string; arguments: string }
      }>
    }
    finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter'
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export function createOpenAICompatibleProvider(config: ProviderInstanceConfig): LLMProvider {
  const baseUrl = (config.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '')
  const apiKey = config.apiKey

  return {
    name: 'openai-compatible',

    supportsToolUse: () => true,

    async listModels() {
      try {
        const res = await fetch(`${baseUrl}/models`, {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        })
        if (!res.ok) return ['(使用 --model 手动指定)']
        const data = await res.json() as { data: Array<{ id: string }> }
        return data.data.map(m => m.id).slice(0, 20)
      } catch {
        return ['(无法获取模型列表)']
      }
    },

    async chat(params: ChatParams): Promise<ChatResponse> {
      // 1. 转换消息
      const messages = convertToOpenAIMessages(params.messages, params.systemPrompt)

      // 2. 转换工具
      const tools: OpenAITool[] | undefined = params.tools?.map(t => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }))

      // 3. 构建请求体
      const body: Record<string, unknown> = {
        model: params.model,
        messages,
        max_tokens: params.maxTokens ?? 4096,
        ...(params.temperature != null ? { temperature: params.temperature } : {}),
        ...(tools && tools.length > 0 ? { tools } : {}),
      }

      // 4. 发送请求
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          ...(config.options?.headers as Record<string, string> ?? {}),
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`LLM API 错误 (${res.status}): ${errorText.slice(0, 500)}`)
      }

      const data = await res.json() as OpenAIResponse

      // 5. 转换响应
      return convertFromOpenAIResponse(data)
    },
  }
}

/** 标准化消息 → OpenAI 消息 */
function convertToOpenAIMessages(
  messages: ChatMessage[],
  systemPrompt?: string
): OpenAIMessage[] {
  const result: OpenAIMessage[] = []

  // 系统提示词作为第一条消息
  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt })
  }

  for (const msg of messages) {
    if (msg.role === 'system') {
      result.push({ role: 'system', content: extractText(msg.content) })
      continue
    }

    if (msg.role === 'tool') {
      result.push({
        role: 'tool',
        content: extractText(msg.content),
        tool_call_id: msg.tool_call_id,
      })
      continue
    }

    if (msg.role === 'user') {
      // 检查是否包含 tool_result 块（Anthropic 风格）
      if (Array.isArray(msg.content)) {
        const toolResults = msg.content.filter(b => b.type === 'tool_result')
        const textBlocks = msg.content.filter(b => b.type === 'text')

        // 如果有 tool_result，转换为 OpenAI 的 tool 角色消息
        for (const tr of toolResults) {
          if (tr.type === 'tool_result') {
            result.push({
              role: 'tool',
              content: tr.content,
              tool_call_id: tr.tool_use_id,
            })
          }
        }

        // 其余文本作为 user 消息
        if (textBlocks.length > 0) {
          result.push({
            role: 'user',
            content: textBlocks.map(b => b.type === 'text' ? b.text : '').join('\n'),
          })
        }
      } else {
        result.push({ role: 'user', content: msg.content })
      }
      continue
    }

    if (msg.role === 'assistant') {
      if (Array.isArray(msg.content)) {
        const textParts = msg.content.filter(b => b.type === 'text')
        const toolUses = msg.content.filter(b => b.type === 'tool_use')

        const openAIMsg: OpenAIMessage = {
          role: 'assistant',
          content: textParts.map(b => b.type === 'text' ? b.text : '').join('\n') || null,
        }

        if (toolUses.length > 0) {
          openAIMsg.tool_calls = toolUses.map(tu => {
            if (tu.type !== 'tool_use') throw new Error('unexpected')
            return {
              id: tu.id,
              type: 'function' as const,
              function: {
                name: tu.name,
                arguments: JSON.stringify(tu.input),
              },
            }
          })
        }

        result.push(openAIMsg)
      } else {
        result.push({ role: 'assistant', content: msg.content })
      }
    }
  }

  return result
}

/** OpenAI 响应 → 标准化响应 */
function convertFromOpenAIResponse(data: OpenAIResponse): ChatResponse {
  const choice = data.choices[0]
  if (!choice) {
    return {
      content: [{ type: 'text', text: '(空响应)' }],
      stopReason: 'end_turn',
      usage: { inputTokens: 0, outputTokens: 0 },
    }
  }

  const content: ContentBlock[] = []

  // 文本内容
  if (choice.message.content) {
    content.push({ type: 'text', text: choice.message.content })
  }

  // 工具调用
  if (choice.message.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      let input: Record<string, unknown> = {}
      try {
        input = JSON.parse(tc.function.arguments)
      } catch {
        input = { _raw: tc.function.arguments }
      }

      content.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.function.name,
        input,
      })
    }
  }

  // 如果既没有文本也没有工具调用
  if (content.length === 0) {
    content.push({ type: 'text', text: '' })
  }

  // 停止原因映射
  const stopMap: Record<string, ChatResponse['stopReason']> = {
    'stop': 'end_turn',
    'tool_calls': 'tool_use',
    'length': 'max_tokens',
    'content_filter': 'stop',
  }

  return {
    content,
    stopReason: stopMap[choice.finish_reason] ?? 'end_turn',
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    },
  }
}

/** 提取文本内容 */
function extractText(content: string | ContentBlock[]): string {
  if (typeof content === 'string') return content
  return content
    .filter(b => b.type === 'text')
    .map(b => (b as { text: string }).text)
    .join('\n')
}
