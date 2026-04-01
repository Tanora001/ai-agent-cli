/**
 * 上下文构建器
 * 参考 Claude Code 的 src/context.ts — getUserContext / getSystemContext
 */

import { execSync } from 'child_process'
import { readFile } from 'fs/promises'
import { join } from 'path'

/** 获取 git 状态上下文 */
export async function getGitContext(cwd: string): Promise<string> {
  try {
    const branch = execSync('git branch --show-current', { cwd, encoding: 'utf-8' }).trim()
    const status = execSync('git status --short', { cwd, encoding: 'utf-8' }).trim()
    const recentLog = execSync('git log --oneline -5', { cwd, encoding: 'utf-8' }).trim()

    return [
      `当前分支: ${branch}`,
      status ? `文件变更:\n${status}` : '工作区干净',
      `最近提交:\n${recentLog}`,
    ].join('\n\n')
  } catch {
    return '(非 git 仓库)'
  }
}

/** 尝试读取 CLAUDE.md 文件 */
export async function getClaudeMd(cwd: string): Promise<string | null> {
  const paths = [
    join(cwd, 'CLAUDE.md'),
    join(cwd, '.claude', 'CLAUDE.md'),
  ]

  for (const p of paths) {
    try {
      return await readFile(p, 'utf-8')
    } catch {
      continue
    }
  }
  return null
}

/** 构建完整的系统提示词 */
export async function buildSystemPrompt(cwd: string): Promise<string> {
  const parts: string[] = []

  // 基础系统提示词
  parts.push(`你是一个 AI 编程助手，运行在终端环境中。
你可以通过工具来读取文件、执行命令、搜索代码等。

规则:
- 在修改文件前先读取文件内容
- 避免引入安全漏洞
- 保持简洁，不要过度工程化
- 只做用户要求的事情`)

  // Git 上下文
  const gitContext = await getGitContext(cwd)
  parts.push(`# Git 状态\n${gitContext}`)

  // CLAUDE.md 上下文
  const claudeMd = await getClaudeMd(cwd)
  if (claudeMd) {
    parts.push(`# 项目说明 (CLAUDE.md)\n${claudeMd}`)
  }

  // 环境信息
  parts.push(`# 环境信息
- 工作目录: ${cwd}
- 平台: ${process.platform}
- 当前日期: ${new Date().toISOString().split('T')[0]}`)

  return parts.join('\n\n---\n\n')
}
