/**
 * 命令注册表（融合版）
 * 新增：/agent, /tasks, /config, /models, /provider
 */

import type { Command, LocalCommand, PromptCommand, ToolUseContext } from '../types.js'

/** 内置命令列表 */
const BUILTIN_COMMANDS: Command[] = [
  {
    name: 'help',
    description: '显示帮助信息',
    type: 'local',
    async execute() {
      const commands = getCommands()
      console.log('\n可用命令:')
      for (const cmd of commands) {
        if (!cmd.isHidden) {
          console.log(`  /${cmd.name.padEnd(15)} ${cmd.description}`)
        }
      }
      console.log()
    },
  } satisfies LocalCommand,

  {
    name: 'clear',
    description: '清空屏幕',
    type: 'local',
    async execute() { console.clear() },
  } satisfies LocalCommand,

  {
    name: 'exit',
    description: '退出程序',
    type: 'local',
    async execute() { console.log('再见!'); process.exit(0) },
  } satisfies LocalCommand,

  {
    name: 'config',
    description: '显示当前配置',
    type: 'local',
    async execute() {
      // 由主循环通过上下文注入实际配置信息
      console.log('(使用 /config 在主循环中显示)')
    },
  } satisfies LocalCommand,

  {
    name: 'models',
    description: '列出可用模型别名',
    type: 'local',
    async execute() {
      console.log('(使用 /models 在主循环中显示)')
    },
  } satisfies LocalCommand,

  {
    name: 'tasks',
    description: '查看当前任务状态',
    type: 'local',
    async execute() {
      console.log('(使用 /tasks 在主循环中显示)')
    },
  } satisfies LocalCommand,

  // ===== 提示词命令 =====
  {
    name: 'review',
    description: '审查当前 git 变更',
    type: 'prompt',
    async getPrompt() {
      return `请审查当前工作目录的 git 变更。
使用 Bash 工具运行 "git diff" 查看变更内容，然后提供变更摘要、潜在问题和改进建议。`
    },
  } satisfies PromptCommand,

  {
    name: 'commit',
    description: '生成 commit 消息并提交',
    type: 'prompt',
    async getPrompt() {
      return `请帮我创建一个 git commit。
1. 运行 "git status" 和 "git diff --cached" 查看暂存变更
2. 分析变更内容，生成简洁的 commit 消息
3. 使用 Bash 执行 git commit`
    },
  } satisfies PromptCommand,

  {
    name: 'explain',
    description: '解释当前项目结构',
    type: 'prompt',
    async getPrompt() {
      return `请分析当前工作目录的项目结构。
使用文件读取和 Bash 工具了解项目，然后提供项目类型、目录结构和关键文件说明。`
    },
  } satisfies PromptCommand,

  {
    name: 'agent',
    description: '使用多 Agent 协作处理复杂任务',
    type: 'prompt',
    async getPrompt(args) {
      return `[多 Agent 模式] 请使用 Agent 工具将以下任务分配给合适的 Agent 协作完成：

${args || '请输入任务描述'}

你可以调用多个 Agent 工具来并行处理不同的子任务。每个 Agent 可能使用不同的大模型。`
    },
  } satisfies PromptCommand,
]

export function getCommands(): Command[] { return [...BUILTIN_COMMANDS] }

export function findCommand(name: string): Command | undefined {
  return getCommands().find(cmd => cmd.name === name)
}

export function parseCommandInput(input: string): {
  isCommand: boolean; commandName?: string; args?: string
} {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return { isCommand: false }
  const spaceIndex = trimmed.indexOf(' ')
  if (spaceIndex === -1) return { isCommand: true, commandName: trimmed.slice(1), args: '' }
  return {
    isCommand: true,
    commandName: trimmed.slice(1, spaceIndex),
    args: trimmed.slice(spaceIndex + 1),
  }
}
