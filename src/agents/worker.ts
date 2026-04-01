/**
 * Worker Agent — 使用 LLMProvider 接口（支持任意大模型）
 */

import type { LLMProvider } from '../providers/types.js'
import type { AgentDefinition, AgentResult } from './types.js'

/** 执行 Worker Agent */
export async function runWorker(
  provider: LLMProvider,
  agent: AgentDefinition,
  taskId: string,
  taskDescription: string,
  onOutput?: (text: string) => void
): Promise<AgentResult> {
  const startTime = Date.now()
  let turnCount = 0
  const maxTurns = agent.maxTurns ?? 10
  let totalInputTokens = 0
  let totalOutputTokens = 0

  const systemPrompt = `${agent.systemPrompt}

你的名字是 "${agent.name}"。
你正在执行以下任务: ${taskDescription}

规则:
- 专注于你的任务，不要偏离主题
- 完成后给出清晰的结果总结
- 如果遇到无法解决的问题，明确说明`

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: taskDescription },
  ]

  let finalOutput = ''

  while (turnCount < maxTurns) {
    turnCount++

    try {
      const response = await provider.chat({
        model: agent.model ?? 'default',
        messages,
        maxTokens: 4096,
        systemPrompt,
      })

      totalInputTokens += response.usage.inputTokens
      totalOutputTokens += response.usage.outputTokens

      const text = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as { text: string }).text)
        .join('\n')

      if (text) {
        finalOutput = text
        onOutput?.(text)
      }

      messages.push({ role: 'assistant', content: text })

      if (response.stopReason === 'end_turn' || response.stopReason === 'stop') {
        break
      }

      if (response.stopReason === 'max_tokens') {
        messages.push({ role: 'user', content: '请继续。' })
        continue
      }

      break
    } catch (err) {
      return {
        agentName: agent.name,
        taskId,
        success: false,
        output: `Agent 执行错误: ${(err as Error).message}`,
        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
        turnCount,
        durationMs: Date.now() - startTime,
      }
    }
  }

  return {
    agentName: agent.name,
    taskId,
    success: true,
    output: finalOutput,
    usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
    turnCount,
    durationMs: Date.now() - startTime,
  }
}
