/**
 * 权限管理系统
 * 参考 Claude Code 的 src/utils/permissions/ 和 src/types/permissions.ts
 */

import type { PermissionConfig, PermissionRule, PermissionMode, Tool, ToolUseContext } from '../types.js'

/** 创建默认权限配置 */
export function createDefaultPermissionConfig(): PermissionConfig {
  return {
    mode: 'default',
    allowRules: [
      // 只读工具默认允许
      { toolName: 'FileRead', behavior: 'allow' },
      // 只读 Bash 命令
      { toolName: 'Bash', pattern: 'ls *', behavior: 'allow' },
      { toolName: 'Bash', pattern: 'cat *', behavior: 'allow' },
      { toolName: 'Bash', pattern: 'git status*', behavior: 'allow' },
      { toolName: 'Bash', pattern: 'git log*', behavior: 'allow' },
      { toolName: 'Bash', pattern: 'git diff*', behavior: 'allow' },
    ],
    denyRules: [
      // 危险命令黑名单
      { toolName: 'Bash', pattern: 'rm -rf /*', behavior: 'deny' },
      { toolName: 'Bash', pattern: 'sudo *', behavior: 'deny' },
    ],
  }
}

/** 检查命令是否匹配模式 */
export function matchesPattern(command: string, pattern: string): boolean {
  // 简单的通配符匹配
  const regex = new RegExp(
    '^' + pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.') + '$'
  )
  return regex.test(command)
}

/** 检查工具调用是否被允许 */
export async function checkPermission(
  tool: Tool,
  input: unknown,
  config: PermissionConfig,
  context: ToolUseContext
): Promise<{ allowed: boolean; reason?: string }> {
  // bypass 模式：全部允许
  if (config.mode === 'bypass') {
    return { allowed: true }
  }

  // 1. 检查 deny 规则（优先级最高）
  for (const rule of config.denyRules) {
    if (rule.toolName === tool.name) {
      if (!rule.pattern) {
        return { allowed: false, reason: `工具 ${tool.name} 被全局禁止` }
      }
      // 对 Bash 工具检查命令模式
      if (tool.name === 'Bash' && typeof (input as Record<string, unknown>).command === 'string') {
        if (matchesPattern((input as Record<string, unknown>).command as string, rule.pattern)) {
          return { allowed: false, reason: `命令匹配拒绝规则: ${rule.pattern}` }
        }
      }
    }
  }

  // 2. 调用工具自身的权限检查
  const toolPermission = await tool.checkPermissions(input, context)
  if (toolPermission.behavior === 'deny') {
    return { allowed: false, reason: toolPermission.reason }
  }

  // 3. 检查 allow 规则
  for (const rule of config.allowRules) {
    if (rule.toolName === tool.name) {
      if (!rule.pattern) {
        return { allowed: true }
      }
      if (tool.name === 'Bash' && typeof (input as Record<string, unknown>).command === 'string') {
        if (matchesPattern((input as Record<string, unknown>).command as string, rule.pattern)) {
          return { allowed: true }
        }
      }
    }
  }

  // 4. 只读操作默认允许
  if (tool.isReadOnly(input)) {
    return { allowed: true }
  }

  // 5. auto 模式：自动允许
  if (config.mode === 'auto') {
    return { allowed: true }
  }

  // 6. default 模式：需要用户确认（简化版直接允许）
  return { allowed: true, reason: '需要用户确认（简化版自动允许）' }
}
