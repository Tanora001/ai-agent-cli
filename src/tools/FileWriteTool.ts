/**
 * FileWriteTool — 文件写入工具
 * 参考 Claude Code 的 src/tools/FileWriteTool/FileWriteTool.tsx
 */

import { z } from 'zod'
import { writeFile, mkdir } from 'fs/promises'
import { resolve, isAbsolute, dirname } from 'path'
import { buildTool } from '../Tool.js'

export const FileWriteTool = buildTool({
  name: 'FileWrite',
  description: '创建或覆写文件。如果目录不存在会自动创建。',

  inputSchema: z.object({
    file_path: z.string().describe('文件路径'),
    content: z.string().describe('文件内容'),
  }),

  isReadOnly() { return false },
  isConcurrencySafe() { return false },

  async checkPermissions(input, context) {
    const fullPath = isAbsolute(input.file_path)
      ? input.file_path
      : resolve(context.cwd, input.file_path)

    // 检查是否写入敏感文件
    const sensitivePatterns = ['.env', 'credentials', 'secret', '.key', '.pem']
    const isSensitive = sensitivePatterns.some(p =>
      fullPath.toLowerCase().includes(p)
    )

    if (isSensitive) {
      return {
        behavior: 'ask' as const,
        reason: `目标文件可能包含敏感信息: ${input.file_path}`,
      }
    }

    return { behavior: 'ask' as const }
  },

  async call(input, context) {
    const { file_path, content } = input
    const fullPath = isAbsolute(file_path) ? file_path : resolve(context.cwd, file_path)

    try {
      // 确保目录存在
      await mkdir(dirname(fullPath), { recursive: true })

      // 写入文件
      await writeFile(fullPath, content, 'utf-8')

      const lineCount = content.split('\n').length

      return {
        data: {
          path: fullPath,
          bytesWritten: Buffer.byteLength(content, 'utf-8'),
          lineCount,
        },
      }
    } catch (err) {
      const error = err as Error
      return { data: { error: `写入文件失败: ${error.message}` } }
    }
  },

  formatResult(output) {
    const result = output as { path?: string; bytesWritten?: number; error?: string }
    if (result.error) return result.error
    return `文件已写入: ${result.path} (${result.bytesWritten} bytes)`
  },
})
