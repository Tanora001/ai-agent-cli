/**
 * 配置加载器
 *
 * 配置文件搜索顺序：
 * 1. --config 参数指定的路径
 * 2. ./ai-agent.config.json（当前目录）
 * 3. ~/.ai-agent/config.json（用户目录）
 *
 * 支持 ${ENV_VAR} 语法引用环境变量（避免明文存储密钥）
 */

import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import type { UnifiedConfig } from './types.js'

/** 默认配置 */
export const DEFAULT_CONFIG: UnifiedConfig = {
  defaultProvider: 'anthropic',
  defaultModel: 'claude-sonnet-4-20250514',
  providers: {
    anthropic: {
      type: 'anthropic',
      apiKey: '${ANTHROPIC_API_KEY}',
    },
  },
  models: {
    smart: { provider: 'anthropic', model: 'claude-opus-4-6' },
    fast: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
  },
  agents: [
    {
      name: 'researcher',
      description: '擅长信息收集、代码阅读和分析',
      systemPrompt: '你是一个研究型 Agent，擅长收集信息、阅读代码和进行分析。请提供详细、准确的信息。',
    },
    {
      name: 'coder',
      description: '擅长编写和修改代码',
      systemPrompt: '你是一个编码型 Agent，擅长编写高质量代码。请写出简洁、安全、可维护的代码。',
    },
    {
      name: 'reviewer',
      description: '擅长代码审查和质量检查',
      systemPrompt: '你是一个审查型 Agent，擅长发现代码问题和提出改进建议。请全面、具体地指出问题。',
    },
  ],
  mcp: { enabled: true },
}

/** 配置文件搜索路径 */
function getConfigPaths(): string[] {
  return [
    join(process.cwd(), 'ai-agent.config.json'),
    join(homedir(), '.ai-agent', 'config.json'),
  ]
}

/** 解析 ${ENV_VAR} 引用 */
function resolveEnvVars(value: string): string {
  return value.replace(/\$\{(\w+)\}/g, (_, name) => {
    return process.env[name] ?? ''
  })
}

/** 递归解析对象中的环境变量 */
function resolveConfigEnvVars(obj: unknown): unknown {
  if (typeof obj === 'string') return resolveEnvVars(obj)
  if (Array.isArray(obj)) return obj.map(resolveConfigEnvVars)
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveConfigEnvVars(value)
    }
    return result
  }
  return obj
}

/** 加载配置文件 */
export async function loadConfig(configPath?: string): Promise<UnifiedConfig> {
  const paths = configPath ? [configPath] : getConfigPaths()

  for (const p of paths) {
    try {
      const raw = await readFile(p, 'utf-8')
      const parsed = JSON.parse(raw)
      const resolved = resolveConfigEnvVars(parsed) as UnifiedConfig

      // 合并默认值
      return {
        ...DEFAULT_CONFIG,
        ...resolved,
        providers: { ...DEFAULT_CONFIG.providers, ...resolved.providers },
        models: { ...DEFAULT_CONFIG.models, ...resolved.models },
        agents: resolved.agents ?? DEFAULT_CONFIG.agents,
      }
    } catch {
      continue
    }
  }

  // 没找到配置文件，使用默认配置
  return DEFAULT_CONFIG
}

/** 生成示例配置文件 */
export async function generateExampleConfig(): Promise<string> {
  const example: UnifiedConfig = {
    defaultProvider: 'kimi',
    defaultModel: 'moonshot-v1-8k',
    providers: {
      claude: {
        type: 'anthropic',
        apiKey: '${ANTHROPIC_API_KEY}',
      },
      gpt: {
        type: 'openai-compatible',
        apiKey: '${OPENAI_API_KEY}',
        baseUrl: 'https://api.openai.com/v1',
      },
      kimi: {
        type: 'openai-compatible',
        apiKey: '${MOONSHOT_API_KEY}',
        baseUrl: 'https://api.moonshot.cn/v1',
      },
      chatglm: {
        type: 'openai-compatible',
        apiKey: '${ZHIPU_API_KEY}',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      },
      deepseek: {
        type: 'openai-compatible',
        apiKey: '${DEEPSEEK_API_KEY}',
        baseUrl: 'https://api.deepseek.com',
      },
      qwen: {
        type: 'openai-compatible',
        apiKey: '${DASHSCOPE_API_KEY}',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      },
      doubao: {
        type: 'openai-compatible',
        apiKey: '${DOUBAO_API_KEY}',
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      },
      minimax: {
        type: 'openai-compatible',
        apiKey: '${MINIMAX_API_KEY}',
        baseUrl: 'https://api.minimax.chat/v1',
      },
      gemini: {
        type: 'openai-compatible',
        apiKey: '${GEMINI_API_KEY}',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      },
    },
    models: {
      smart: { provider: 'claude', model: 'claude-opus-4-6' },
      fast: { provider: 'kimi', model: 'moonshot-v1-8k' },
      code: { provider: 'deepseek', model: 'deepseek-coder' },
      glm4: { provider: 'chatglm', model: 'glm-4' },
      gpt4o: { provider: 'gpt', model: 'gpt-4o' },
    },
    agents: [
      {
        name: 'researcher',
        description: '擅长信息收集和分析',
        systemPrompt: '你是一个研究型 Agent，擅长收集信息和分析。',
        provider: 'kimi',
        model: 'moonshot-v1-32k',
      },
      {
        name: 'coder',
        description: '擅长编写代码',
        systemPrompt: '你是一个编码型 Agent，擅长编写高质量代码。',
        provider: 'deepseek',
        model: 'deepseek-coder',
      },
      {
        name: 'reviewer',
        description: '擅长代码审查',
        systemPrompt: '你是一个审查型 Agent，擅长发现问题和改进建议。',
        provider: 'claude',
        model: 'claude-sonnet-4-20250514',
      },
    ],
    mcp: { enabled: true },
  }

  const configDir = join(homedir(), '.ai-agent')
  const configPath = join(configDir, 'config.json')

  await mkdir(configDir, { recursive: true })
  const content = JSON.stringify(example, null, 2)
  await writeFile(configPath, content, 'utf-8')

  return configPath
}

export type { UnifiedConfig }
