/**
 * Coordinator — 多 Agent 协调器（支持跨 Provider 调用）
 *
 * 核心特性：
 * - 协调器可以用一个大模型（如 Claude），Worker 用另一个（如 Kimi、DeepSeek）
 * - 每个 Agent 可以配置不同的 Provider 和 Model
 * - 通过 resolveProvider 回调获取 Provider 实例
 */

import { TaskManager } from './task-manager.js'
import { runWorker } from './worker.js'
import type { LLMProvider } from '../providers/types.js'
import type {
  AgentDefinition,
  AgentResult,
  CoordinatorEvent,
  Task,
} from './types.js'

export interface CoordinatorConfig {
  /** 协调器使用的 Provider */
  coordinatorProvider: LLMProvider
  /** 协调器使用的模型 */
  coordinatorModel: string
  /** 根据 provider 名称获取 Provider 实例 */
  resolveProvider: (providerName: string) => LLMProvider
  /** 默认 Provider（Agent 未指定时使用） */
  defaultProvider: LLMProvider
  /** 默认模型 */
  defaultModel: string
  /** 最大并行 Worker 数 */
  maxConcurrentWorkers: number
  /** Agent 定义列表 */
  agents: AgentDefinition[]
}

export class Coordinator {
  private config: CoordinatorConfig
  private taskManager = new TaskManager()
  private agents: Map<string, AgentDefinition>
  private results: AgentResult[] = []

  constructor(config: CoordinatorConfig) {
    this.config = config
    this.agents = new Map(config.agents.map(a => [a.name, a]))
  }

  /** 执行用户请求：分解 → 分发 → 聚合 */
  async execute(
    userRequest: string,
    onEvent?: (event: CoordinatorEvent) => void
  ): Promise<{ summary: string; results: AgentResult[] }> {
    // 阶段 1：任务分解
    onEvent?.({ type: 'coordinator_thinking', text: '正在分析请求并分解任务...' })
    const taskPlan = await this.decomposeTask(userRequest)

    const tasks: Task[] = []
    for (const item of taskPlan) {
      const task = this.taskManager.createTask(item.description, item.agent, item.dependencies)
      tasks.push(task)
      onEvent?.({ type: 'task_created', task })
    }

    // 阶段 2：并行执行
    onEvent?.({ type: 'coordinator_thinking', text: `创建了 ${tasks.length} 个子任务，开始执行...` })

    while (!this.taskManager.isAllCompleted()) {
      const readyTasks = this.taskManager.getReadyTasks()
      if (readyTasks.length === 0) {
        const running = this.taskManager.getTasksByStatus('running')
        if (running.length === 0) break
        await new Promise(r => setTimeout(r, 100))
        continue
      }

      const batch = readyTasks.slice(0, this.config.maxConcurrentWorkers)
      const batchResults = await Promise.all(
        batch.map(task => this.executeTask(task, onEvent))
      )
      this.results.push(...batchResults)
    }

    // 阶段 3：聚合结果
    onEvent?.({ type: 'coordinator_thinking', text: '所有任务完成，正在聚合结果...' })
    const summary = await this.aggregateResults(userRequest, this.results)
    onEvent?.({ type: 'all_completed', results: this.results })

    return { summary, results: this.results }
  }

  /** 使用协调器 LLM 分解任务 */
  private async decomposeTask(
    userRequest: string
  ): Promise<Array<{ description: string; agent: string; dependencies?: string[] }>> {
    const agentList = this.config.agents
      .map(a => `- ${a.name}: ${a.description}` +
        (a.provider ? ` (使用 ${a.provider}/${a.model ?? 'default'})` : ''))
      .join('\n')

    const response = await this.config.coordinatorProvider.chat({
      model: this.config.coordinatorModel,
      maxTokens: 2048,
      systemPrompt: `你是一个任务协调器。将用户请求分解为可并行执行的子任务。

可用 Agent:
${agentList}

返回 JSON 数组: [{"description": "任务描述", "agent": "agent名称", "dependencies": [0]}]
dependencies 是依赖的任务索引（从 0 开始），可选。只返回 JSON 数组。`,
      messages: [{ role: 'user', content: userRequest }],
    })

    const textBlock = response.content.find(
      (b): b is { type: 'text'; text: string } => b.type === 'text'
    )
    const textContent = textBlock?.text ?? '[]'

    try {
      const jsonMatch = textContent.match(/\[[\s\S]*\]/)
      if (!jsonMatch) return [{ description: userRequest, agent: this.config.agents[0]?.name ?? 'default' }]

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        description: string; agent: string; dependencies?: number[]
      }>

      return parsed.map(item => ({
        description: item.description,
        agent: this.agents.has(item.agent) ? item.agent : this.config.agents[0]?.name ?? 'default',
        dependencies: item.dependencies?.map(i => `task_${i + 1}`),
      }))
    } catch {
      return [{ description: userRequest, agent: this.config.agents[0]?.name ?? 'default' }]
    }
  }

  /** 执行单个任务 — 为 Agent 选择对应的 Provider */
  private async executeTask(
    task: Task,
    onEvent?: (event: CoordinatorEvent) => void
  ): Promise<AgentResult> {
    const agentDef = this.agents.get(task.assignedAgent) ?? this.config.agents[0]!

    // 关键：每个 Agent 可以用不同的 Provider
    const provider = agentDef.provider
      ? this.config.resolveProvider(agentDef.provider)
      : this.config.defaultProvider

    this.taskManager.updateTask(task.id, { status: 'running' })
    onEvent?.({ type: 'task_started', task, agent: agentDef.name })

    // 构建任务上下文（含依赖结果）
    let taskPrompt = task.description
    if (task.dependencies) {
      const depResults = task.dependencies
        .map(depId => this.taskManager.getTask(depId))
        .filter(t => t?.result)
        .map(t => `### ${t!.description}\n${t!.result}`)

      if (depResults.length > 0) {
        taskPrompt += `\n\n## 前置任务结果\n${depResults.join('\n\n')}`
      }
    }

    try {
      const result = await runWorker(
        provider,
        { ...agentDef, model: agentDef.model ?? this.config.defaultModel },
        task.id,
        taskPrompt,
        (text) => onEvent?.({ type: 'worker_output', agent: agentDef.name, text })
      )

      if (result.success) {
        this.taskManager.updateTask(task.id, { status: 'completed', result: result.output })
        onEvent?.({ type: 'task_completed', task: this.taskManager.getTask(task.id)!, result })
      } else {
        this.taskManager.updateTask(task.id, { status: 'failed', error: result.output })
        onEvent?.({ type: 'task_failed', task: this.taskManager.getTask(task.id)!, error: result.output })
      }
      return result
    } catch (err) {
      const error = (err as Error).message
      this.taskManager.updateTask(task.id, { status: 'failed', error })
      onEvent?.({ type: 'task_failed', task: this.taskManager.getTask(task.id)!, error })
      return {
        agentName: agentDef.name, taskId: task.id, success: false, output: error,
        usage: { inputTokens: 0, outputTokens: 0 }, turnCount: 0, durationMs: 0,
      }
    }
  }

  /** 聚合结果 */
  private async aggregateResults(originalRequest: string, results: AgentResult[]): Promise<string> {
    const summaries = results.map(r =>
      `### Agent: ${r.agentName} (${r.taskId})\n状态: ${r.success ? '成功' : '失败'}\n输出:\n${r.output}`
    ).join('\n\n---\n\n')

    const response = await this.config.coordinatorProvider.chat({
      model: this.config.coordinatorModel,
      maxTokens: 4096,
      systemPrompt: '你是一个结果聚合器。根据各 Agent 的执行结果，为用户提供完整、连贯的最终回答。',
      messages: [{
        role: 'user',
        content: `原始请求: ${originalRequest}\n\n各 Agent 执行结果:\n${summaries}\n\n请聚合以上结果，给出完整的最终回答。`,
      }],
    })

    const resultBlock = response.content.find(
      (b): b is { type: 'text'; text: string } => b.type === 'text'
    )
    return resultBlock?.text ?? '(无结果)'
  }

  getTaskManager(): TaskManager { return this.taskManager }
}
