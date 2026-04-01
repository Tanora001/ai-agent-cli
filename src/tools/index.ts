/**
 * 工具注册表（融合版）
 * 整合内置工具 + AgentTool + MCP 嵌入工具
 */

import type { Tool, PermissionConfig } from '../types.js'
import { BashTool } from './BashTool.js'
import { FileReadTool } from './FileReadTool.js'
import { FileWriteTool } from './FileWriteTool.js'
import { AgentTool } from './AgentTool.js'
import { getEmbeddedMcpTools } from '../mcp/bridge.js'

/** 所有内置工具 */
export function getAllBaseTools(options?: { includeMcp?: boolean }): Tool[] {
  const tools: Tool[] = [
    BashTool as Tool,
    FileReadTool as Tool,
    FileWriteTool as Tool,
    AgentTool as Tool,
  ]

  // 嵌入 MCP 工具
  if (options?.includeMcp !== false) {
    tools.push(...getEmbeddedMcpTools())
  }

  return tools
}

/** 按权限配置过滤工具 */
export function getTools(permissionConfig: PermissionConfig, options?: { includeMcp?: boolean }): Tool[] {
  const base = getAllBaseTools(options)
  return base.filter(tool => {
    const isDenied = permissionConfig.denyRules.some(
      rule => rule.toolName === tool.name && !rule.pattern
    )
    return !isDenied && tool.isEnabled()
  })
}

/** 合并内置工具和外部工具 */
export function assembleToolPool(
  permissionConfig: PermissionConfig,
  externalTools: Tool[] = [],
  options?: { includeMcp?: boolean }
): Tool[] {
  const builtIn = getTools(permissionConfig, options)
  const builtInNames = new Set(builtIn.map(t => t.name))
  const uniqueExternal = externalTools.filter(t => !builtInNames.has(t.name))
  return [...builtIn, ...uniqueExternal]
}

export { BashTool, FileReadTool, FileWriteTool, AgentTool }
