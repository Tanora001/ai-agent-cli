/**
 * 计算器 MCP 工具
 */

export const calculatorDef = {
  name: 'calculate',
  description: '执行数学计算表达式',
}

export function executeCalculator(input: { expression: string }): string {
  try {
    const sanitized = input.expression.trim()
    if (!/^[\d\s+\-*/().,%^Math.absceilfloorlogmaxminpowroundsqrtsincostanarandomPIE]+$/i.test(sanitized)) {
      return '错误: 表达式包含不允许的字符'
    }
    const fn = new Function('Math', `"use strict"; return (${sanitized})`)
    return `计算结果: ${fn(Math)}`
  } catch (err) {
    return `计算错误: ${(err as Error).message}`
  }
}
