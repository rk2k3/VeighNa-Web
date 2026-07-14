import type { Dsl, DslCondition, DslOperand, DslRule } from '../types'

export function operandLabel(op: DslOperand): string {
  if (op.indicator === 'CLOSE') return 'Price'
  return `${op.indicator}(${op.period ?? '?'})`
}

const OP_TEXT: Record<string, string> = {
  '<': '<',
  '>': '>',
  '<=': '≤',
  '>=': '≥',
  crosses_above: 'crosses above',
  crosses_below: 'crosses below',
}

export function conditionText(c: DslCondition): string {
  const right = typeof c.right === 'number' ? String(c.right) : operandLabel(c.right)
  return `${operandLabel(c.left)} ${OP_TEXT[c.operator] ?? c.operator} ${right}`
}

export function ruleText(rule: DslRule): string {
  if (!rule.conditions.length) return '—'
  return rule.conditions.map(conditionText).join(`  ${rule.logic}  `)
}

export function riskText(dsl: Dsl): string {
  const parts: string[] = []
  if (dsl.risk.stop_loss_pct != null) parts.push(`Stop loss ${(dsl.risk.stop_loss_pct * 100).toFixed(0)}%`)
  if (dsl.risk.take_profit_pct != null)
    parts.push(`Take profit ${(dsl.risk.take_profit_pct * 100).toFixed(0)}%`)
  return parts.length ? parts.join(' · ') : 'None'
}
