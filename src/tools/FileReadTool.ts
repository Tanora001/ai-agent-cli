/**
 * FileReadTool — 文件读取工具
 * 参考 Claude Code 的 src/tools/FileReadTool/FileReadTool.tsx
 */

import { z } from 'zod'
import { readFile, stat } from 'fs/promises'
import { resolve, isAbsolute } from 'path'
import { buildTool } from '../Tool.js'

export const FileReadTool = buildTool({
  name: 'FileRead',
  description: '读取文件内容。支持指定起始行和行数限制。',

  inputSchema: z.object({
    file_path: z.string().describe('文件路径（绝对路径或相对路径）'),
    offset: z.number().optional().describe('起始行号（从 1 开始）'),
    limit: z.number().optional().describe('读取的行数上限'),
  }),

  isReadOnly() { return true },
  isConcurrencySafe() { return true },

  async checkPermissions() {
    // 读取操作默认允许
    return { behavior: 'allow' as const }
  },

  async call(input, context) {
    const { file_path, offset, limit } = input
    const fullPath = isAbsolute(file_path) ? file_path : resolve(context.cwd, file_path)

    try {
      // 检查文件是否存在和大小
      const fileStat = await stat(fullPath)

      if (fileStat.isDirectory()) {
        return { data: { error: `${fullPath} 是一个目录，请使用 Bash 的 ls 命令查看目录内容` } }
      }

      // 读取文件
      const content = await readFile(fullPath, 'utf-8')
      const lines = content.split('\n')

      // 应用 offset 和 limit
      const startLine = (offset ?? 1) - 1
      const endLine = limit ? startLine + limit : lines.length
      const selectedLines = lines.slice(startLine, endLine)

      // 添加行号（模拟 cat -n 格式）
      const numbered = selectedLines.map(
        (line, i) => `${String(startLine + i + 1).padStart(6, ' ')}\t${line}`
      )

      return {
        data: {
          path: fullPath,
          content: numbered.join('\n'),
          totalLines: lines.length,
          shownLines: selectedLines.length,
        },
      }
    } catch (err) {
      const error = err as NodeJS.ErrnoException
      if (error.code === 'ENOENT') {
        return { data: { error: `文件不存在: ${fullPath}` } }
      }
      return { data: { error: `读取文件失败: ${error.message}` } }
    }
  },

  formatResult(output) {
    const result = output as { content?: string; error?: string }
    if (result.error) return result.error
    return result.content ?? ''
  },
})
