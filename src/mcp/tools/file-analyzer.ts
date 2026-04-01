/**
 * 目录分析 MCP 工具
 */

import { readdir, stat } from 'fs/promises'
import { join, extname } from 'path'

export const fileAnalyzerDef = {
  name: 'analyze_directory',
  description: '分析目录的文件结构统计',
}

export async function executeFileAnalyzer(input: { path: string; depth?: number }): Promise<string> {
  const stats = { files: 0, dirs: 0, size: 0, byExt: {} as Record<string, number> }

  async function scan(dir: string, d: number) {
    if (d > (input.depth ?? 2)) return
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      for (const e of entries) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue
        const p = join(dir, e.name)
        if (e.isDirectory()) { stats.dirs++; await scan(p, d + 1) }
        else {
          stats.files++
          const s = await stat(p)
          stats.size += s.size
          const ext = extname(e.name) || '(无扩展名)'
          stats.byExt[ext] = (stats.byExt[ext] ?? 0) + 1
        }
      }
    } catch { /* ignore */ }
  }

  await scan(input.path, 0)

  const lines = [`目录: ${input.path}`, `文件: ${stats.files} | 目录: ${stats.dirs} | 大小: ${(stats.size / 1024).toFixed(1)} KB`]
  for (const [ext, count] of Object.entries(stats.byExt).sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${ext}: ${count} 个`)
  }
  return lines.join('\n')
}
