/**
 * 多 Agent 系统类型定义
 */

/** Agent 定义 */
export interface AgentDefinition {
  name: string
  description: string
  systemPrompt: string
  /** 使用的 Provider 名称（如 "kimi", "claude", "deepseek"） */
  provider?: string
  /** 使用的模型 ID */
  model?: string
  maxTurns?: number
}

/** 任务 */
export interface Task {
  id: string
  description: string
  assignedAgent: string
  status: TaskStatus
  result?: string
  error?: string
  createdAt: number
  completedAt?: number
  dependencies?: string[]
}

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

/** Agent 执行结果 */
export interface AgentResult {
  agentName: string
  taskId: string
  success: boolean
  output: string
  usage: { inputTokens: number; outputTokens: number }
  turnCount: number
  durationMs: number
}

/** 协调器事件 */
export type CoordinatorEvent =
  | { type: 'task_created'; task: Task }
  | { type: 'task_started'; task: Task; agent: string }
  | { type: 'task_completed'; task: Task; result: AgentResult }
  | { type: 'task_failed'; task: Task; error: string }
  | { type: 'all_completed'; results: AgentResult[] }
  | { type: 'coordinator_thinking'; text: string }
  | { type: 'worker_output'; agent: string; text: string }
