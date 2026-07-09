import type { StrategyInfo, StrategyParam } from '../types'

// The `weights` param is rendered by the dedicated per-symbol weights editor,
// so it's excluded from the generic scalar inputs here.
function scalarParams(strategy: StrategyInfo | undefined): StrategyParam[] {
  return strategy?.parameters.filter((p) => p.name !== 'weights') ?? []
}

export function seedParamValues(strategy: StrategyInfo | undefined): Record<string, string> {
  const init: Record<string, string> = {}
  for (const p of scalarParams(strategy)) {
    init[p.name] = String(p.default ?? '')
  }
  return init
}

export function buildScalarParams(
  strategy: StrategyInfo | undefined,
  values: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const p of scalarParams(strategy)) {
    const raw = values[p.name]
    if (p.type === 'int') {
      const n = parseInt(raw, 10)
      out[p.name] = Number.isNaN(n) ? p.default : n
    } else if (p.type === 'float') {
      const n = parseFloat(raw)
      out[p.name] = Number.isNaN(n) ? p.default : n
    } else if (p.type === 'bool') {
      out[p.name] = raw === 'true' || raw === '1'
    } else {
      out[p.name] = raw ?? p.default
    }
  }
  return out
}

export function ParamInputs({
  strategy,
  values,
  onChange,
}: {
  strategy: StrategyInfo | undefined
  values: Record<string, string>
  onChange: (name: string, value: string) => void
}) {
  const params = scalarParams(strategy)
  if (!params.length) return null
  return (
    <div style={{ marginTop: 8 }}>
      <h3>Parameters</h3>
      {params.map((p) => (
        <span key={p.name} style={{ display: 'inline-block', marginRight: 12 }}>
          <label style={{ fontSize: 18, marginRight: 6 }}>{p.name}</label>
          <input
            style={{ width: 110 }}
            type={p.type === 'int' || p.type === 'float' ? 'number' : 'text'}
            value={values[p.name] ?? ''}
            onChange={(e) => onChange(p.name, e.target.value)}
          />
        </span>
      ))}
    </div>
  )
}
