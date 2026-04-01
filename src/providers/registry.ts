/**
 * Provider 注册表
 * 管理所有 LLM Provider 的注册和实例化
 */

import type { LLMProvider, LLMProviderFactory, ProviderInstanceConfig } from './types.js'
import { createAnthropicProvider } from './anthropic.js'
import { createOpenAICompatibleProvider } from './openai-compatible.js'

/** Provider 工厂注册表 */
const factories = new Map<string, LLMProviderFactory>()

/** Provider 实例缓存 */
const instances = new Map<string, LLMProvider>()

/** 注册 Provider 工厂 */
export function registerProviderFactory(type: string, factory: LLMProviderFactory): void {
  factories.set(type, factory)
}

/** 获取或创建 Provider 实例 */
export function getProvider(
  instanceName: string,
  type: string,
  config: ProviderInstanceConfig
): LLMProvider {
  // 缓存命中
  const cached = instances.get(instanceName)
  if (cached) return cached

  // 查找工厂
  const factory = factories.get(type)
  if (!factory) {
    throw new Error(
      `未知的 Provider 类型: "${type}"\n` +
      `可用类型: ${[...factories.keys()].join(', ')}\n` +
      `提示: 大多数国产大模型使用 "openai-compatible" 类型`
    )
  }

  // 创建实例
  const provider = factory(config)
  instances.set(instanceName, provider)
  return provider
}

/** 清除实例缓存 */
export function clearProviderCache(): void {
  instances.clear()
}

/** 获取所有已注册的 Provider 类型 */
export function getRegisteredTypes(): string[] {
  return [...factories.keys()]
}

/** 获取所有已实例化的 Provider */
export function getActiveProviders(): Map<string, LLMProvider> {
  return new Map(instances)
}

// ===== 注册内置 Provider =====
registerProviderFactory('anthropic', createAnthropicProvider)
registerProviderFactory('openai-compatible', createOpenAICompatibleProvider)

// Gemini 也可以通过 OpenAI 兼容模式使用：
// baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai"
// 或者用户可以注册自定义 factory
