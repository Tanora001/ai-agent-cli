/**
 * BashTool — Shell 命令执行工具
 * 参考 Claude Code 的 src/tools/BashTool/BashTool.tsx
 */

import { z } from 'zod'
import { exec } from 'child_process'
import { buildTool } from '../Tool.js'

/** 只读命令白名单前缀 */
const READ_ONLY_PREFIXES = [
  'ls', 'cat', 'head', 'tail', 'wc', 'find', 'grep', 'rg',
  'git status', 'git log', 'git diff', 'git branch', 'git show',
  'echo', 'pwd', 'whoami', 'date', 'which', 'type',
  'node --version', 'npm --version', 'python --version',
]

/** 破坏性命令黑名单 */
const DESTRUCTIVE_PATTERNS = [
  /^rm\s+-rf\s/,
  /^sudo\s/,
  /^git\s+push\s+.*--force/,
  /^git\s+reset\s+--hard/,
  /^chmod\s+777/,
  /^mkfs/,
  /^dd\s+if=/,
]

function isReadOnlyCommand(command: string): boolean {
  const trimmed = command.trim()
  return READ_ONLY_PREFIXES.some(prefix => trimmed.startsWith(prefix))
}

function isDestructiveCommand(command: string): boolean {
  const trimmed = command.trim()
  return DESTRUCTIVE_PATTERNS.some(pattern => pattern.test(trimmed))
}

export const BashTool = buildTool({
  name: 'Bash',
  description: '执行 Shell 命令并返回输出。支持超时控制和后台运行。',

  inputSchema: z.object({
    command: z.string().describe('要执行的 Shell 命令'),
    timeout_ms: z.number().optional().describe('超时时间（毫秒），默认 120000'),
  }),

  isReadOnly(input) {
    return isReadOnlyCommand(input.command)
  },

  isConcurrencySafe() {
    return false // Shell 操作不并发安全
  },

  async checkPermissions(input) {
    if (isDestructiveCommand(input.command)) {
      return {
        behavior: 'ask' as const,
        reason: `检测到潜在破坏性命令: ${input.command}`,
      }
    }

    if (isReadOnlyCommand(input.command)) {
      return { behavior: 'allow' as const }
    }

    return { behavior: 'ask' as const }
  },

  async call(input, context, onProgress) {
    const { command, timeout_ms = 120000 } = input

    return new Promise((resolve) => {
      const child = exec(command, {
        cwd: context.cwd,
        timeout: timeout_ms,
        maxBuffer: 1024 * 1024 * 10, // 10MB
        env: { ...process.env },
      }, (error, stdout, stderr) => {
        const exitCode = error ? (error as NodeJS.ErrnoException & { code?: number }).code ?? 1 : 0

        resolve({
          data: {
            stdout: stdout.slice(0, 30000), // 限制结果大小
            stderr: stderr.slice(0, 10000),
            exitCode,
          },
        })
      })

      // 支持中断
      context.abortSignal?.addEventListener('abort', () => {
        child.kill('SIGTERM')
      })
    })
  },

  formatResult(output) {
    const { stdout, stderr, exitCode } = output as {
      stdout: string; stderr: string; exitCode: number
    }
    let result = stdout
    if (stderr) result += `\nSTDERR:\n${stderr}`
    if (exitCode !== 0) result += `\nExit code: ${exitCode}`
    return result
  },
})
