/**
 * MCP 嵌入资源
 * 在嵌入模式下暂不使用，保留供外部 MCP Server 模式扩展。
 */

export interface ResourceDef {
  uri: string
  name: string
  description: string
  mimeType: string
}

export function getResourceDefinitions(): ResourceDef[] {
  return [
    {
      uri: 'config://server-info',
      name: '服务器信息',
      description: 'AI Agent CLI 运行状态',
      mimeType: 'application/json',
    },
  ]
}

export async function readResource(uri: string): Promise<string> {
  if (uri === 'config://server-info') {
    return JSON.stringify({
      name: 'ai-agent-cli',
      version: '2.0.0',
      uptime: process.uptime(),
      platform: process.platform,
    }, null, 2)
  }
  throw new Error(`未知资源: ${uri}`)
}
