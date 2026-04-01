/**
 * AgentTool — 跨任务 Agent 调用工具
 *
 * 让当前对话中的 AI 可以调用其他 Agent 执行子任务。
 * 每个 Agent 可以使用不同的 Provider（大模型），实现跨模型协作。
 *
 * 例如：主对话用 Claude，调用 researcher Agent 用 Kimi（长上下文），
 * 调用 coder Agent 用 DeepSeek（代码能力强）。
 */

import { z } from 'zod'
import { buildTool } from '../Tool.js'
import { runWorker } from '../agents/worker.js'
import type { LLMProvider } from '../providers/types.js'
import type { AgentDefinition } from '../agents/types.js'

/** AgentTool 运行时需要的上下文 */
let _agents: AgentDefinition[] = []
let _resolveProvider: (name: string) => LLMProvider = () => { throw new Error('AgentTool 未初始化') }
let _defaultProvider: LLMProvider | null = null
let _defaultModel = 'default'

/** 初始化 AgentTool（在 CLI 启动时调用） */
export function initAgentTool(params: {
  agents: AgentDefinition[]
  resolveProvider: (name: string) => LLMProvider
  defaultProvider: LLMProvider
  defaultModel: string
}) {
  _agents = params.agents
  _resolveProvider = params.resolveProvider
  _defaultProvider = params.defaultProvider
  _defaultModel = params.defaultModel
}

export const AgentTool = buildTool({
  name: 'Agent',
  description: '调用其他 Agent 执行子任务。每个 Agent 可以使用不同的大模型。可用 Agent 会在系统提示中列出。',

  inputSchema: z.object({
    agent_name: z.string().describe('要调用的 Agent 名称'),
    task: z.string().describe('交给该 Agent 的任务描述'),
  }),

  isConcurrencySafe: () => true,  // Agent 调用可并行
  isReadOnly: () => true,          // Agent 调用本身不修改文件

  async checkPermissions() {
    return { behavior: 'allow' as const }
  },

  async call(input, context, onProgress) {
    const { agent_name, task } = input

    // 查找 Agent 定义
    const agentDef = _agents.find(a => a.name === agent_name)
    if (!agentDef) {
      const available = _agents.map(a => a.name).join(', ')
      return {
        data: `错误: 未知 Agent "${agent_name}"。可用 Agent: ${available}`,
      }
    }

    // 获取该 Agent 的 Provider
    const provider = agentDef.provider
      ? _resolveProvider(agentDef.provider)
      : _defaultProvider!

    onProgress?.({ type: 'agent_start', data: { agent: agent_name, task } })

    // 执行 Worker Agent
    const result = await runWorker(
      provider,
      { ...agentDef, model: agentDef.model ?? _defaultModel },
      `inline_${Date.now()}`,
      task,
      (text) => onProgress?.({ type: 'agent_output', data: text.slice(0, 100) })
    )

    return {
      data: result.success
        ? `[Agent ${agent_name} 完成]\n${result.output}`
        : `[Agent ${agent_name} 失败]\n${result.output}`,
    }
  },

  formatResult(output) {
    return typeof output === 'string' ? output : JSON.stringify(output)
  },
})
