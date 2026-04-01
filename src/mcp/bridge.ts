/**
 * MCP Bridge — 将 MCP 工具桥接为内部 Tool 格式
 *
 * 嵌入模式：MCP 工具直接在进程内调用，无需 stdio 子进程。
 */

import { z } from 'zod'
import { buildTool } from '../Tool.js'
import type { Tool } from '../types.js'
import { calculatorDef, executeCalculator } from './tools/calculator.js'
import { fileAnalyzerDef, executeFileAnalyzer } from './tools/file-analyzer.js'

/** 获取所有嵌入的 MCP 工具（桥接为内部 Tool 格式） */
export function getEmbeddedMcpTools(): Tool[] {
  return [
    buildTool({
      name: `mcp__builtin__${calculatorDef.name}`,
      description: calculatorDef.description,
      inputSchema: z.object({
        expression: z.string().describe('数学表达式'),
      }),
      isConcurrencySafe: () => true,
      isReadOnly: () => true,
      async checkPermissions() { return { behavior: 'allow' as const } },
      async call(input) {
        return { data: executeCalculator(input) }
      },
      formatResult(output) { return typeof output === 'string' ? output : String(output) },
    }) as Tool,

    buildTool({
      name: `mcp__builtin__${fileAnalyzerDef.name}`,
      description: fileAnalyzerDef.description,
      inputSchema: z.object({
        path: z.string().describe('目录路径'),
        depth: z.number().optional().describe('递归深度'),
      }),
      isConcurrencySafe: () => true,
      isReadOnly: () => true,
      async checkPermissions() { return { behavior: 'allow' as const } },
      async call(input) {
        return { data: await executeFileAnalyzer(input) }
      },
      formatResult(output) { return typeof output === 'string' ? output : String(output) },
    }) as Tool,
  ]
}
