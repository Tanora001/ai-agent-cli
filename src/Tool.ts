/**
 * Tool 工厂函数 — 参考 Claude Code 的 buildTool() 模式
 *
 * 提供合理的默认值，减少样板代码。
 * 每个工具只需定义核心字段，其余由 buildTool 填充。
 */

import { z } from 'zod'
import { zodToJsonSchema as zodToJsonSchemaLib } from 'zod-to-json-schema'
import type {
  Tool,
  ToolResult,
  ToolProgress,
  ToolUseContext,
  PermissionResult,
  ValidationResult,
} from './types.js'

/** 工具定义（部分字段可选） */
export interface ToolDef<Input = unknown, Output = unknown> {
  name: string
  description: string
  inputSchema: z.ZodType<Input>

  call(
    input: Input,
    context: ToolUseContext,
    onProgress?: (p: ToolProgress) => void
  ): Promise<ToolResult<any>>

  // 可选方法，buildTool 会提供默认实现
  isConcurrencySafe?: (input: Input) => boolean
  isReadOnly?: (input: Input) => boolean
  checkPermissions?: (input: Input, context: ToolUseContext) => Promise<PermissionResult>
  isEnabled?: () => boolean
  formatResult?: (output: Output) => string
}

/**
 * buildTool — 工具工厂
 *
 * 用法：
 * ```typescript
 * const myTool = buildTool({
 *   name: 'MyTool',
 *   description: '我的工具',
 *   inputSchema: z.object({ query: z.string() }),
 *   async call(input) { return { data: 'result' } },
 * })
 * ```
 */
export function buildTool<Input, Output>(
  def: ToolDef<Input, Output>
): Tool<Input, Output> {
  return {
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema,

    call: def.call,

    isConcurrencySafe: def.isConcurrencySafe ?? (() => false),
    isReadOnly: def.isReadOnly ?? (() => false),
    isEnabled: def.isEnabled ?? (() => true),

    checkPermissions: def.checkPermissions ?? (async () => ({ behavior: 'allow' as const })),

    formatResult: def.formatResult ?? ((output: Output) => {
      if (typeof output === 'string') return output
      return JSON.stringify(output, null, 2)
    }),
  }
}

/**
 * 验证工具输入
 */
export function validateToolInput<Input>(
  tool: Tool<Input>,
  input: unknown
): ValidationResult {
  const result = tool.inputSchema.safeParse(input)
  if (result.success) {
    return { valid: true }
  }
  return {
    valid: false,
    error: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '),
  }
}

/**
 * 在工具集合中按名称查找工具
 */
export function findToolByName(tools: Tool[], name: string): Tool | undefined {
  return tools.find(t => t.name === name)
}

/**
 * 将工具定义转换为 LLM API 格式（通用）
 */
export function toolToApiFormat(tool: Tool): {
  name: string
  description: string
  input_schema: Record<string, unknown>
} {
  const jsonSchema = zodToJsonSchemaLib(tool.inputSchema, {
    $refStrategy: 'none',
    target: 'openApi3',
  }) as Record<string, unknown>

  // 移除顶层 $schema（部分 LLM API 不兼容）
  delete jsonSchema['$schema']

  return {
    name: tool.name,
    description: tool.description,
    input_schema: jsonSchema,
  }
}
