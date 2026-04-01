/**
 * 统一配置类型
 */

import type { ProviderConfig, ModelAlias } from '../providers/types.js'

/** 用户配置文件结构 */
export interface UnifiedConfig {
  /** 默认 Provider（对应 providers 中的 key） */
  defaultProvider: string
  /** 默认模型 ID */
  defaultModel: string

  /** Provider 配置表 */
  providers: Record<string, ProviderConfig>

  /** 模型别名：短名称 → provider + model */
  models?: Record<string, ModelAlias>

  /** Agent 定义 */
  agents?: Array<{
    name: string
    description: string
    systemPrompt: string
    /** 此 Agent 使用的 provider（可以和默认不同） */
    provider?: string
    model?: string
    maxTurns?: number
  }>

  /** MCP 配置 */
  mcp?: {
    enabled: boolean
  }

  /** 权限配置 */
  permissions?: {
    mode?: 'default' | 'auto' | 'bypass'
  }
}
