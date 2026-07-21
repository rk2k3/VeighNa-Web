import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  fetchSavedPortfolioStrategies,
  fetchSavedStockStrategies,
  runOptimization,
  runSensitivity,
} from '../api'
import { defaultDates } from '../lib/dates'
import type {
  OptimizeMetrics,
  OptimizeRecommendation,
  OptimizeResult,
  OptimizeRow,
  SavedPortfolioStrategy,
  SavedStockStrategy,
  SensitivityResult,
} from '../types'

type Kind = 'portfolio' | 'stock'

// The context an optimization ran with — reused so sensitivity analysis uses
// the exact same strategy, windows and target the candidate came from.
type RunCtx = {
  kind: Kind
  strategy_id: string
  start: string
  split: string
  end: string
  target: string
}

// A split ~2/3 of the way through the range: more history to optimize on, a
// meaningful chunk held back to test on.
function defaultSplit(start: string, end: string): string {
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  return new Date(s + (e - s) * 0.66).toISOString().slice(0, 10)
}

const TARGETS = [
  { value: 'sharpe_ratio', label: 'Sharpe ratio' },
  { value: 'total_return', label: 'Total return' },
  { value: 'annual_return', label: 'Annual return' },
]

export function OptimizePage() {
  const [kind, setKind] = useState<Kind>('portfolio')
  const [portfolios, setPortfolios] = useState<SavedPortfolioStrategy[]>([])
  const [stocks, setStocks] = useState<SavedStockStrategy[]>([])
  const [loading, setLoading] = useState(true)
  const [strategyId, setStrategyId] = useState('')

  const dd = useMemo(() => defaultDates(), [])
  const [start, setStart] = useState(dd.start)
  const [end, setEnd] = useState(dd.end)
  const [split, setSplit] = useState(defaultSplit(dd.start, dd.end))
  const [nTrials, setNTrials] = useState('20')
  const [target, setTarget] = useState('sharpe_ratio')

  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState('')
  const [statusColor, setStatusColor] = useState('')
  const [result, setResult] = useState<OptimizeResult | null>(null)
  const [runCtx, setRunCtx] = useState<RunCtx | null>(null)

  const list = kind === 'portfolio' ? portfolios : stocks

  useEffect(() => {
    Promise.all([
      fetchSavedPortfolioStrategies().then(setPortfolios).catch(() => setPortfolios([])),
      fetchSavedStockStrategies().then(setStocks).catch(() => setStocks([])),
    ]).finally(() => setLoading(false))
  }, [])

  // Point the dropdown at the first strategy of whichever kind is active.
  useEffect(() => {
    setStrategyId(list.length ? list[0].id : '')
    setResult(null)
    setStatus('')
  }, [kind, portfolios, stocks]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRun() {
    if (!strategyId) return
    setRunning(true)
    setStatus('Optimizing… running many backtests, this can take a bit.')
    setStatusColor('')
    setResult(null)
    setRunCtx(null)
    try {
      const r = await runOptimization({
        kind,
        strategy_id: strategyId,
        start,
        split,
        end,
        n_trials: parseInt(nTrials, 10) || 20,
        target,
      })
      setResult(r)
      setRunCtx({ kind, strategy_id: strategyId, start, split, end, target })
      setStatus(`Done — ${r.trials.length} trials evaluated.`)
      setStatusColor('#10b981')
    } catch (e) {
      setStatus('Error: ' + (e as Error).message)
      setStatusColor('#f43f5e')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div>
      <div className="section">
        <h2>Parameter Optimization</h2>
        <p style={{ color: '#94a3b8', fontSize: 15, marginTop: 0 }}>
          Search a saved strategy's parameters on an <strong>in-sample</strong> window, then
          check each result on a held-out <strong>out-of-sample</strong> window it never saw.
          A row that looks great in-sample but poor out-of-sample is curve-fit — nothing is
          saved, this is just for exploring.
        </p>

        <div className="option-row">
          <button
            className={`option ${kind === 'portfolio' ? 'selected' : ''}`}
            onClick={() => setKind('portfolio')}
          >
            📊 Portfolio Strategy
          </button>
          <button
            className={`option ${kind === 'stock' ? 'selected' : ''}`}
            onClick={() => setKind('stock')}
          >
            📈 Single-Stock Strategy
          </button>
        </div>

        {loading ? (
          <p style={{ color: '#64748b' }}>Loading saved strategies…</p>
        ) : list.length === 0 ? (
          <p style={{ color: '#64748b' }}>
            No saved {kind === 'portfolio' ? 'portfolio' : 'stock'} strategies yet. Create one on
            the <strong>AI Strategy Builder</strong> tab first.
          </p>
        ) : (
          <>
            <div style={{ marginTop: 10 }}>
              <label className="question-label">Strategy</label>
              <select style={{ width: 340 }} value={strategyId} onChange={(e) => setStrategyId(e.target.value)}>
                {kind === 'portfolio'
                  ? portfolios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {s.strategy_label}
                      </option>
                    ))
                  : stocks.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.dsl.name} — {s.dsl.symbol}
                      </option>
                    ))}
              </select>
            </div>

            <div style={{ marginTop: 12 }}>
              <label className="question-label">Windows &amp; settings</label>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <Field label="In-sample start">
                  <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
                </Field>
                <Field label="Split (in ▸ out)">
                  <input type="date" value={split} onChange={(e) => setSplit(e.target.value)} />
                </Field>
                <Field label="Out-of-sample end">
                  <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
                </Field>
                <Field label="Trials">
                  <input
                    type="number"
                    style={{ width: 80 }}
                    value={nTrials}
                    onChange={(e) => setNTrials(e.target.value)}
                  />
                </Field>
                <Field label="Optimize for">
                  <select value={target} onChange={(e) => setTarget(e.target.value)}>
                    {TARGETS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <button onClick={handleRun} disabled={running}>
                {running ? 'Optimizing…' : 'Run Optimization'}
              </button>
            </div>
            {status && (
              <div className="status" style={{ color: statusColor }}>
                {status}
              </div>
            )}
          </>
        )}
      </div>

      {result?.recommendation && (
        <RecommendationCard rec={result.recommendation} target={result.target} />
      )}
      {result && <OptimizeResults result={result} />}
      {result && result.trials.length > 0 && (
        <TrialScatter
          trials={result.trials}
          paramNames={result.param_names}
          target={result.target}
          recIdx={result.recommendation?.index ?? -1}
        />
      )}
      {result && runCtx && result.trials.length > 0 && (
        <SensitivityPanel
          ctx={runCtx}
          trials={result.trials}
          defaultIdx={result.recommendation?.index ?? 0}
        />
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ color: '#64748b', fontSize: 13, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}

function fmt(n: number | undefined): string {
  return typeof n === 'number' ? n.toFixed(2) : '—'
}

// The auto-picked robust parameter set, chosen from in-sample data only. This
// replaces the old "eyeball the table" step: the app names one set and shows
// why, so the choice is reproducible rather than a judgement call.
function RecommendationCard({ rec, target }: { rec: OptimizeRecommendation; target: string }) {
  const tLabel = TARGETS.find((t) => t.value === target)?.label ?? target
  const targetKey = target as keyof OptimizeMetrics
  return (
    <div
      className="section"
      style={{ border: '1px solid rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.06)' }}
    >
      <h3 style={{ marginTop: 0 }}>
        ✅ Recommended parameters <span style={{ color: '#64748b', fontWeight: 400, fontSize: 14 }}>
          (row #{rec.index + 1} below)
        </span>
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 0 }}>
        Chosen automatically from <strong>in-sample</strong> data by robustness — not the raw
        in-sample peak, and never from the out-of-sample window. That held-out window is only used
        below as a validation check.
      </p>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: '#64748b', fontSize: 13, marginBottom: 4 }}>Parameters</div>
          <table style={{ fontSize: 14 }}>
            <tbody>
              {Object.entries(rec.params).map(([k, v]) => (
                <tr key={k}>
                  <td style={{ color: '#cbd5e1', paddingRight: 16 }}>{k}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ color: '#64748b', fontSize: 12, marginTop: 8 }}>
            In-sample {tLabel}: <strong style={{ color: '#e2e8f0' }}>{fmt(rec.in_sample[targetKey])}</strong>{' '}
            · Out-of-sample: <strong style={{ color: rec.oos_pass ? '#10b981' : '#f59e0b' }}>
              {fmt(rec.out_sample[targetKey])}
            </strong>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ color: '#64748b', fontSize: 13, marginBottom: 4 }}>Why this set</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
            {rec.reasons.map((r, i) => (
              <li key={i} style={{ color: r.startsWith('⚠') ? '#f59e0b' : '#cbd5e1' }}>
                {r}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

function OptimizeResults({ result }: { result: OptimizeResult }) {
  const { param_names, in_sample_period, out_sample_period, baseline, recommendation, trials, target } =
    result
  const targetLabel = TARGETS.find((t) => t.value === target)?.label ?? target

  // Highlight the recommended (robustly-chosen) row. We intentionally do NOT
  // highlight the best out-of-sample row — cueing users to pick on OOS turns the
  // held-out window into a second optimizer and defeats the validation.
  const recIdx = recommendation?.index ?? -1

  const cell = (m: OptimizeMetrics, key: keyof OptimizeMetrics) => fmt(m?.[key])

  const row = (r: OptimizeRow, label: string, highlight?: string) => (
    <tr style={highlight ? { background: highlight } : undefined}>
      <td style={{ whiteSpace: 'nowrap' }}>{label}</td>
      {param_names.map((p) => (
        <td key={p} style={{ textAlign: 'right' }}>
          {fmt(r.params[p])}
        </td>
      ))}
      <td style={{ textAlign: 'right', fontWeight: 600 }}>{cell(r.in_sample, 'sharpe_ratio')}</td>
      <td style={{ textAlign: 'right' }}>{cell(r.in_sample, 'total_return')}</td>
      <td style={{ textAlign: 'right', fontWeight: 600 }}>{cell(r.out_sample, 'sharpe_ratio')}</td>
      <td style={{ textAlign: 'right' }}>{cell(r.out_sample, 'total_return')}</td>
      <td style={{ textAlign: 'right' }}>{r.out_sample?.total_trade_count ?? '—'}</td>
    </tr>
  )

  return (
    <div className="section">
      <h3 style={{ marginTop: 0 }}>Results — optimized for {targetLabel}</h3>
      <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 0 }}>
        In-sample {in_sample_period.start} → {in_sample_period.end} &nbsp;·&nbsp; Out-of-sample{' '}
        {out_sample_period.start} → {out_sample_period.end}. Ranked by in-sample {targetLabel}.
        The <span style={{ color: '#10b981' }}>green row</span> is the recommended pick above; the
        OOS columns are a validation check, not a selection criterion.
      </p>
      <div className="scroll-table">
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>#</th>
              {param_names.map((p) => (
                <th key={p} style={{ textAlign: 'right' }}>
                  {p}
                </th>
              ))}
              <th style={{ textAlign: 'right' }}>IS Sharpe</th>
              <th style={{ textAlign: 'right' }}>IS Ret %</th>
              <th style={{ textAlign: 'right' }}>OOS Sharpe</th>
              <th style={{ textAlign: 'right' }}>OOS Ret %</th>
              <th style={{ textAlign: 'right' }}>OOS Trades</th>
            </tr>
          </thead>
          <tbody>
            {baseline && row(baseline, 'Current', 'rgba(148,163,184,0.12)')}
            {trials.map((t, i) =>
              row(t, String(i + 1), i === recIdx ? 'rgba(16,185,129,0.14)' : undefined),
            )}
          </tbody>
        </table>
      </div>
      {trials.length === 0 && (
        <p style={{ color: '#f43f5e' }}>
          No trials produced a result — the strategy may not have traded in this window (check
          that price data is cached over the whole range).
        </p>
      )}
    </div>
  )
}

function TrialScatter({
  trials,
  paramNames,
  target,
  recIdx,
}: {
  trials: OptimizeRow[]
  paramNames: string[]
  target: string
  recIdx: number
}) {
  const targetKey = target as keyof OptimizeMetrics
  const tLabel = TARGETS.find((t) => t.value === target)?.label ?? target

  return (
    <div className="section">
      <h3 style={{ marginTop: 0 }}>
        Where do the good scores cluster?{' '}
        <span style={{ fontWeight: 400, color: '#64748b', fontSize: 14 }}>(all {trials.length} trials)</span>
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 0 }}>
        Each dot is one trial you already ran — its parameter value vs its in-sample {tLabel}. High
        dots bunched around similar values = a robust zone; a lone high dot = a fluke.{' '}
        <span style={{ color: '#f59e0b' }}>Orange</span> is the recommended pick — it should sit
        inside a cluster, not off on its own. No extra backtests — this just re-plots the trials
        above.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        {paramNames.map((p) => {
          const pts = trials.map((t, i) => ({
            x: t.params[p],
            y: t.in_sample[targetKey] as number,
            best: i === recIdx,
          }))
          return (
            <div key={p}>
              <div style={{ fontSize: 13, color: '#e2e8f0', marginBottom: 4 }}>{p}</div>
              <ResponsiveContainer width="100%" height={160}>
                <ScatterChart margin={{ top: 6, right: 10, bottom: 4, left: -18 }}>
                  <CartesianGrid stroke="#1e293b" />
                  <XAxis
                    dataKey="x"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                  />
                  <YAxis dataKey="y" type="number" tick={{ fill: '#64748b', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b' }}
                    labelStyle={{ color: '#94a3b8' }}
                    cursor={{ stroke: '#334155' }}
                  />
                  {/* Greens first, then the recommended point on top so it's
                      never buried under the cluster. */}
                  <Scatter data={pts.filter((p) => !p.best)} fill="#10b981" isAnimationActive={false} />
                  <Scatter
                    data={pts.filter((p) => p.best)}
                    fill="#f59e0b"
                    isAnimationActive={false}
                    shape={(props: { cx?: number; cy?: number }) => (
                      <circle
                        cx={props.cx}
                        cy={props.cy}
                        r={7}
                        fill="#f59e0b"
                        stroke="#f8fafc"
                        strokeWidth={2}
                      />
                    )}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SensitivityPanel({
  ctx,
  trials,
  defaultIdx = 0,
}: {
  ctx: RunCtx
  trials: OptimizeRow[]
  defaultIdx?: number
}) {
  const [candidateIdx, setCandidateIdx] = useState(defaultIdx)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<SensitivityResult | null>(null)

  const targetKey = ctx.target as keyof OptimizeMetrics
  const tLabel = TARGETS.find((t) => t.value === ctx.target)?.label ?? ctx.target

  async function analyze() {
    const cand = trials[candidateIdx]
    if (!cand) return
    setRunning(true)
    setError('')
    setResult(null)
    try {
      setResult(await runSensitivity({ ...ctx, params: cand.params }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="section">
      <h3 style={{ marginTop: 0 }}>Step 2 · Parameter sensitivity</h3>
      <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 0 }}>
        Pick a candidate from the in-sample ranking, then see how each parameter behaves around
        it. A <strong>flat / plateau</strong> curve means the choice is robust; a{' '}
        <strong>sharp spike</strong> means it's fragile (curve-fit). This uses in-sample data
        only — choose here, then judge the winner by its out-of-sample number.
      </p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#64748b', fontSize: 13, marginBottom: 4 }}>Candidate (in-sample rank)</div>
          <select
            style={{ width: 240 }}
            value={candidateIdx}
            onChange={(e) => setCandidateIdx(parseInt(e.target.value, 10))}
          >
            {trials.map((t, i) => (
              <option key={i} value={i}>
                #{i + 1} — {tLabel} {fmt(t.in_sample[targetKey])}
                {i === defaultIdx ? ' (recommended)' : ''}
              </option>
            ))}
          </select>
        </div>
        <button onClick={analyze} disabled={running}>
          {running ? 'Analyzing…' : 'Analyze robustness'}
        </button>
      </div>
      {error && (
        <div className="status" style={{ color: '#f43f5e' }}>
          {error}
        </div>
      )}
      {result && <SensitivityCharts result={result} targetKey={targetKey} tLabel={tLabel} />}
    </div>
  )
}

function SensitivityCharts({
  result,
  targetKey,
  tLabel,
}: {
  result: SensitivityResult
  targetKey: keyof OptimizeMetrics
  tLabel: string
}) {
  const c = result.candidate
  return (
    <>
      <p style={{ marginTop: 12, fontSize: 14 }}>
        Candidate verdict — in-sample {tLabel}: <strong>{fmt(c.in_sample[targetKey])}</strong> vs
        out-of-sample: <strong>{fmt(c.out_sample[targetKey])}</strong>. A big drop out-of-sample
        means it was overfit.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
          marginTop: 8,
        }}
      >
        {result.curves.map((curve) => (
          <div key={curve.name}>
            <div style={{ fontSize: 13, color: '#e2e8f0', marginBottom: 4 }}>
              {curve.name} <span style={{ color: '#64748b' }}>· chosen {curve.current}</span>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={curve.points} margin={{ top: 6, right: 10, bottom: 4, left: -18 }}>
                <CartesianGrid stroke="#1e293b" />
                <XAxis
                  dataKey="value"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tick={{ fill: '#64748b', fontSize: 11 }}
                />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <ReferenceLine x={curve.current} stroke="#3b82f6" strokeDasharray="4 3" />
                <Line
                  dataKey="metric"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>
      <p style={{ color: '#64748b', fontSize: 12, marginTop: 8 }}>
        Blue dashed line = your chosen value · green line = {tLabel} as that one parameter varies
        (others held at the candidate).
      </p>
    </>
  )
}
