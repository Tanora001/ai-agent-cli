/**
 * 任务管理器
 */

import type { Task, TaskStatus } from './types.js'

export class TaskManager {
  private tasks: Map<string, Task> = new Map()
  private idCounter = 0

  createTask(description: string, assignedAgent: string, dependencies?: string[]): Task {
    const task: Task = {
      id: `task_${++this.idCounter}`,
      description,
      assignedAgent,
      status: 'pending',
      createdAt: Date.now(),
      dependencies,
    }
    this.tasks.set(task.id, task)
    return task
  }

  updateTask(taskId: string, updates: Partial<Pick<Task, 'status' | 'result' | 'error'>>): Task {
    const task = this.tasks.get(taskId)
    if (!task) throw new Error(`任务不存在: ${taskId}`)
    Object.assign(task, updates)
    if (updates.status === 'completed' || updates.status === 'failed') {
      task.completedAt = Date.now()
    }
    return task
  }

  getTask(taskId: string): Task | undefined { return this.tasks.get(taskId) }
  getAllTasks(): Task[] { return Array.from(this.tasks.values()) }
  getTasksByStatus(status: TaskStatus): Task[] { return this.getAllTasks().filter(t => t.status === status) }

  getReadyTasks(): Task[] {
    return this.getAllTasks().filter(task => {
      if (task.status !== 'pending') return false
      if (task.dependencies) {
        return task.dependencies.every(depId => {
          const dep = this.tasks.get(depId)
          return dep && dep.status === 'completed'
        })
      }
      return true
    })
  }

  isAllCompleted(): boolean {
    return this.getAllTasks().every(
      t => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled'
    )
  }

  getSummary(): string {
    const all = this.getAllTasks()
    const counts: Record<string, number> = {}
    for (const t of all) { counts[t.status] = (counts[t.status] ?? 0) + 1 }
    return `总计 ${all.length} | ` +
      Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(' | ')
  }
}
