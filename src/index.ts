/**
 * AI Agent CLI — 统一入口
 *
 * 融合了：
 * - AI Agent CLI（Tool 系统 + QueryEngine + 命令 + 权限）
 * - MCP Server（嵌入模式，工具直接可用）
 * - 多 Agent 协调系统（Coordinator + Worker + TaskManager）
 *
 * 支持任意大模型 API：
 * - Claude (Anthropic)
 * - ChatGPT (OpenAI)
 * - ChatGLM / GLM-4 (智谱 AI)
 * - Kimi / Moonshot (月之暗面)
 * - DeepSeek
 * - Qwen / 通义千问 (阿里)
 * - Doubao / 豆包 (字节跳动)
 * - MiniMax
 * - Gemini (Google)
 * - 以及任何 OpenAI 兼容接口
 *
 * 用法：
 *   npm run dev                                  # 交互模式
 *   npm run dev -- "你的问题"                     # 单次查询
 *   npm run dev -- --provider kimi --model moonshot-v1-8k
 *   npm run dev -- --config ./my-config.json
 *   npm run dev -- --init-config                  # 生成示例配置
 */

import { createInterface } from 'readline'
import chalk from 'chalk'
import { loadConfig, generateExampleConfig, DEFAULT_CONFIG } from './config/index.js'
import type { UnifiedConfig } from './config/types.js'
import { getProvider, getRegisteredTypes } from './providers/registry.js'
import type { LLMProvider } from './providers/types.js'
import { QueryEngine } from './engine/QueryEngine.js'
import { buildSystemPrompt } from './engine/context.js'
import { assembleToolPool } from './tools/index.js'
import { initAgentTool } from './tools/AgentTool.js'
import { getCommands, findCommand, parseCommandInput } from './commands/index.js'
import { createDefaultPermissionConfig } from './permissions/index.js'
import { Coordinator } from './agents/coordinator.js'
import type { AgentDefinition } from './agents/types.js'

async function main() {
  const args = process.argv.slice(2)

  // ===== 解析 CLI 参数 =====
  let configPath: string | undefined
  let providerOverride: string | undefined
  let modelOverride: string | undefined
  let singleQuery: string | null = null
  let initConfig = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--config' && args[i + 1]) configPath = args[++i]
    else if (arg === '--provider' && args[i + 1]) providerOverride = args[++i]
    else if (arg === '--model' && args[i + 1]) modelOverride = args[++i]
    else if (arg === '--init-config') initConfig = true
    else if (!arg.startsWith('--')) singleQuery = arg
  }

  // ===== 生成示例配置 =====
  if (initConfig) {
    const path = await generateExampleConfig()
    console.log(chalk.green(`示例配置文件已生成: ${path}`))
    console.log(chalk.gray('请编辑配置文件，填入你的 API Key'))
    return
  }

  // ===== 加载配置 =====
  const config = await loadConfig(configPath)

  // ===== 解析 Provider =====
  const providerName = providerOverride ?? config.defaultProvider
  const providerConfig = config.providers[providerName]

  if (!providerConfig) {
    console.error(chalk.red(`Provider "${providerName}" 未在配置中定义`))
    console.log(chalk.gray(`已配置的 Provider: ${Object.keys(config.providers).join(', ')}`))
    console.log(chalk.gray(`可用 Provider 类型: ${getRegisteredTypes().join(', ')}`))
    process.exit(1)
  }

  // 检查 API Key
  if (!providerConfig.apiKey || providerConfig.apiKey === '') {
    console.error(chalk.red(`Provider "${providerName}" 的 API Key 未设置`))
    console.log(chalk.gray('请设置对应的环境变量，或在配置文件中填写'))
    console.log(chalk.gray('运行 --init-config 生成示例配置文件'))
    process.exit(1)
  }

  const defaultProvider = getProvider(providerName, providerConfig.type, {
    apiKey: providerConfig.apiKey,
    baseUrl: providerConfig.baseUrl,
    options: providerConfig.options,
  })

  const modelName = modelOverride ?? resolveModel(config, config.defaultModel)

  // ===== Provider 解析器（跨 Agent 使用） =====
  function resolveProvider(name: string): LLMProvider {
    const pc = config.providers[name]
    if (!pc) {
      console.warn(chalk.yellow(`Provider "${name}" 未配置，回退到默认 Provider`))
      return defaultProvider
    }
    return getProvider(name, pc.type, {
      apiKey: pc.apiKey,
      baseUrl: pc.baseUrl,
      options: pc.options,
    })
  }

  // ===== 初始化 Agent 系统 =====
  const agents: AgentDefinition[] = (config.agents ?? DEFAULT_CONFIG.agents!).map(a => ({
    name: a.name,
    description: a.description,
    systemPrompt: a.systemPrompt,
    provider: a.provider,
    model: a.model,
    maxTurns: a.maxTurns,
  }))

  initAgentTool({
    agents,
    resolveProvider,
    defaultProvider,
    defaultModel: modelName,
  })

  // ===== 组装工具 =====
  const permissionConfig = createDefaultPermissionConfig()
  const tools = assembleToolPool(permissionConfig, [], {
    includeMcp: config.mcp?.enabled !== false,
  })
  const commands = getCommands()

  // ===== 构建系统提示词 =====
  const cwd = process.cwd()
  let systemPrompt = await buildSystemPrompt(cwd)

  // 注入 Agent 信息到系统提示词
  const agentInfo = agents.map(a =>
    `- ${a.name}: ${a.description}` +
    (a.provider ? ` (使用 ${a.provider}/${a.model ?? 'default'})` : '')
  ).join('\n')

  systemPrompt += `\n\n# 可用 Agent\n你可以通过 Agent 工具调用以下 Agent：\n${agentInfo}`

  // ===== 创建对话引擎 =====
  const engine = new QueryEngine({
    provider: defaultProvider,
    model: modelName,
    maxTurns: 30,
    maxTokens: 8192,
    systemPrompt,
    tools,
    commands,
  })

  // ===== 启动 =====
  console.log(chalk.bold.cyan('\n🤖 AI Agent CLI (Unified)'))
  console.log(chalk.gray(`Provider: ${providerName} (${providerConfig.type})`))
  console.log(chalk.gray(`Model: ${modelName}`))
  console.log(chalk.gray(`Tools: ${tools.map(t => t.name).join(', ')}`))
  console.log(chalk.gray(`Agents: ${agents.map(a => {
    const p = a.provider ?? providerName
    return `${a.name}(${p})`
  }).join(', ')}`))
  console.log(chalk.gray(`\n命令: ${commands.filter(c => !c.isHidden).map(c => '/' + c.name).join(', ')}`))
  console.log(chalk.gray('输入 /help 查看帮助，/exit 退出\n'))

  if (singleQuery) {
    await runSingleQuery(engine, singleQuery)
    return
  }

  await runInteractive(engine, commands, config, defaultProvider, resolveProvider, agents, modelName)
}

/** 解析模型别名 */
function resolveModel(config: UnifiedConfig, modelInput: string): string {
  const alias = config.models?.[modelInput]
  return alias ? alias.model : modelInput
}

/** 单次查询 */
async function runSingleQuery(engine: QueryEngine, query: string) {
  console.log(chalk.blue('> ') + query + '\n')
  const result = await engine.submitMessage(query, (event) => {
    if (event.type === 'text_delta') process.stdout.write(event.text)
    else if (event.type === 'tool_use') console.log(chalk.yellow(`\n[工具] ${event.toolName}`))
    else if (event.type === 'tool_result') console.log(chalk.green(`[结果] ${event.result.slice(0, 200)}`))
  })
  const usage = engine.getUsage()
  console.log(chalk.gray(
    `\n\n--- ${engine.getProvider().name}/${engine.getModel()} | tokens: ${usage.inputTokens} in / ${usage.outputTokens} out | 轮次: ${result.turnCount} ---`
  ))
}

/** 交互式 REPL */
async function runInteractive(
  engine: QueryEngine,
  commands: ReturnType<typeof getCommands>,
  config: UnifiedConfig,
  defaultProvider: LLMProvider,
  resolveProvider: (name: string) => LLMProvider,
  agents: AgentDefinition[],
  modelName: string,
) {
  let coordinator: Coordinator | null = null

  const rl = createInterface({ input: process.stdin, output: process.stdout })

  const prompt = () => {
    const providerTag = chalk.gray(`[${engine.getProvider().name}]`)
    rl.question(`${providerTag} ${chalk.blue('> ')}`, async (input) => {
      const trimmed = input.trim()
      if (!trimmed) { prompt(); return }

      const parsed = parseCommandInput(trimmed)
      if (parsed.isCommand) {
        // 特殊处理的命令
        if (parsed.commandName === 'config') {
          console.log(chalk.cyan('\n当前配置:'))
          console.log(`  Provider: ${engine.getProvider().name}`)
          console.log(`  Model: ${engine.getModel()}`)
          console.log(`  已配置 Provider: ${Object.keys(config.providers).join(', ')}`)
          if (config.models) {
            console.log(`  模型别名: ${Object.entries(config.models).map(([k, v]) => `${k}→${v.provider}/${v.model}`).join(', ')}`)
          }
          prompt(); return
        }

        if (parsed.commandName === 'models') {
          console.log(chalk.cyan('\n模型别名:'))
          if (config.models) {
            for (const [alias, mapping] of Object.entries(config.models)) {
              console.log(`  ${alias.padEnd(12)} → ${mapping.provider}/${mapping.model}`)
            }
          }
          try {
            const models = await engine.getProvider().listModels()
            console.log(chalk.gray(`\n当前 Provider 可用模型: ${models.join(', ')}`))
          } catch { /* ignore */ }
          prompt(); return
        }

        if (parsed.commandName === 'tasks') {
          if (!coordinator) {
            console.log(chalk.gray('暂无任务（使用 /agent 启动多 Agent 任务）'))
          } else {
            const tm = coordinator.getTaskManager()
            console.log(chalk.cyan(tm.getSummary()))
            for (const t of tm.getAllTasks()) {
              const statusColor = t.status === 'completed' ? chalk.green
                : t.status === 'failed' ? chalk.red : chalk.yellow
              console.log(`  ${t.id}: [${statusColor(t.status)}] ${t.description} → ${t.assignedAgent}`)
            }
          }
          prompt(); return
        }

        if (parsed.commandName === 'agent' && parsed.args) {
          // 多 Agent 协调模式
          coordinator = new Coordinator({
            coordinatorProvider: defaultProvider,
            coordinatorModel: modelName,
            resolveProvider,
            defaultProvider,
            defaultModel: modelName,
            maxConcurrentWorkers: 3,
            agents,
          })

          try {
            const { summary } = await coordinator.execute(parsed.args, (event) => {
              if (event.type === 'coordinator_thinking') console.log(chalk.cyan(`[协调器] ${event.text}`))
              else if (event.type === 'task_created') console.log(chalk.blue(`[任务] ${event.task.id}: ${event.task.description} → ${event.task.assignedAgent}`))
              else if (event.type === 'task_started') console.log(chalk.yellow(`[开始] ${event.agent}`))
              else if (event.type === 'task_completed') console.log(chalk.green(`[完成] ${event.result.agentName} (${event.result.durationMs}ms)`))
              else if (event.type === 'task_failed') console.log(chalk.red(`[失败] ${event.error}`))
              else if (event.type === 'all_completed') {
                const total = event.results.reduce((a, r) => ({
                  i: a.i + r.usage.inputTokens, o: a.o + r.usage.outputTokens
                }), { i: 0, o: 0 })
                console.log(chalk.gray(`\n总 tokens: ${total.i} in / ${total.o} out`))
              }
            })
            console.log(chalk.bold('\n--- 最终结果 ---\n'))
            console.log(summary)
          } catch (err) {
            console.error(chalk.red(`协调器错误: ${(err as Error).message}`))
          }
          prompt(); return
        }

        // 常规命令
        const cmd = findCommand(parsed.commandName!)
        if (!cmd) {
          console.log(chalk.red(`未知命令: /${parsed.commandName}`))
          prompt(); return
        }

        if (cmd.type === 'local') {
          const context = { cwd: process.cwd(), tools: engine['config'].tools, commands, messages: engine.getMessages() }
          await cmd.execute(parsed.args ?? '', context)
          prompt(); return
        }

        if (cmd.type === 'prompt') {
          const cmdPrompt = await cmd.getPrompt(parsed.args ?? '', {
            cwd: process.cwd(), tools: engine['config'].tools, commands, messages: engine.getMessages(),
          })
          await processQuery(engine, cmdPrompt)
          prompt(); return
        }
      }

      // 普通消息
      await processQuery(engine, trimmed)
      prompt()
    })
  }

  prompt()
}

/** 处理查询并显示结果 */
async function processQuery(engine: QueryEngine, query: string) {
  try {
    await engine.submitMessage(query, (event) => {
      if (event.type === 'text_delta') process.stdout.write(event.text)
      else if (event.type === 'tool_use') console.log(chalk.yellow(`\n[工具] ${event.toolName}`))
      else if (event.type === 'tool_result') console.log(chalk.green(`[结果] ${event.result.slice(0, 100)}...`))
      else if (event.type === 'error') console.log(chalk.red(`[错误] ${event.error.message}`))
    })
    const usage = engine.getUsage()
    console.log(chalk.gray(`\n--- tokens: ${usage.inputTokens} in / ${usage.outputTokens} out ---`))
  } catch (err) {
    console.error(chalk.red(`错误: ${(err as Error).message}`))
  }
}

main().catch(err => {
  console.error(chalk.red(`启动失败: ${err.message}`))
  process.exit(1)
})
