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
  clearOptimizeRuns,
  deleteOptimizeRun,
  fetchOptimizeRun,
  fetchOptimizeRuns,
  fetchSavedPortfolioStrategies,
  fetchSavedStockStrategies,
  runOptimization,
  runSensitivity,
  runWalkForward,
} from '../api'
import { defaultDates } from '../lib/dates'
import type {
  OptimizeMetrics,
  OptimizeRecommendation,
  OptimizeResult,
  OptimizeRow,
  OptimizeRunSummary,
  Overfitting,
  SavedPortfolioStrategy,
  SavedStockStrategy,
  SensitivityResult,
  WalkForwardResult,
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
  const [seed, setSeed] = useState('42')

  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState('')
  const [statusColor, setStatusColor] = useState('')
  const [result, setResult] = useState<OptimizeResult | null>(null)
  const [runCtx, setRunCtx] = useState<RunCtx | null>(null)
  const [wfResult, setWfResult] = useState<WalkForwardResult | null>(null)
  const [history, setHistory] = useState<OptimizeRunSummary[]>([])

  const list = kind === 'portfolio' ? portfolios : stocks

  const reloadHistory = () => {
    fetchOptimizeRuns().then(setHistory).catch(() => setHistory([]))
  }

  useEffect(() => {
    Promise.all([
      fetchSavedPortfolioStrategies().then(setPortfolios).catch(() => setPortfolios([])),
      fetchSavedStockStrategies().then(setStocks).catch(() => setStocks([])),
    ]).finally(() => setLoading(false))
    reloadHistory()
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
        seed: parseInt(seed, 10) || 42,
      })
      setResult(r)
      setRunCtx({ kind, strategy_id: strategyId, start, split, end, target })
      setStatus(`Done — ${r.trials.length} trials evaluated (seed ${r.seed}).`)
      setStatusColor('#10b981')
      reloadHistory()
    } catch (e) {
      setStatus('Error: ' + (e as Error).message)
      setStatusColor('#f43f5e')
    } finally {
      setRunning(false)
    }
  }

  // Reload a persisted run into the view (audit / reproducibility).
  async function handleReload(id: string) {
    try {
      const rec = await fetchOptimizeRun(id)
      if (rec.type === 'walk_forward') {
        setWfResult(rec.result as WalkForwardResult)
      } else {
        const res = rec.result as OptimizeResult
        setResult(res)
        setRunCtx({
          kind: rec.kind,
          strategy_id: rec.strategy_id,
          start: res.in_sample_period.start,
          split: res.in_sample_period.end,
          end: res.out_sample_period.end,
          target: res.target,
        })
      }
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      // ignore — the row stays; user can retry
    }
  }

  async function handleDeleteRun(id: string) {
    try {
      await deleteOptimizeRun(id)
      reloadHistory()
    } catch {
      // ignore
    }
  }

  async function handleClearHistory() {
    if (!window.confirm('Delete all saved runs? This clears the audit trail and cannot be undone.')) return
    try {
      await clearOptimizeRuns()
      reloadHistory()
    } catch {
      // ignore
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
                <Field label="Seed">
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      type="number"
                      style={{ width: 80 }}
                      value={seed}
                      onChange={(e) => setSeed(e.target.value)}
                      title="Same seed + inputs reproduce the exact run"
                    />
                    <button
                      type="button"
                      onClick={() => setSeed(String(Math.floor(Math.random() * 1000000)))}
                      title="New random seed — re-run to check the recommendation is stable across seeds"
                      style={{ padding: '0 8px' }}
                    >
                      🎲
                    </button>
                  </div>
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
        <RecommendationCard rec={result.recommendation} target={result.target} seed={result.seed} />
      )}
      {result?.overfitting && (
        <OverfittingCard overfitting={result.overfitting} nTrials={result.trials.length} />
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

      {!loading && list.length > 0 && strategyId && (
        <WalkForwardPanel
          kind={kind}
          strategyId={strategyId}
          start={start}
          end={end}
          target={target}
          nTrials={nTrials}
          seed={seed}
          result={wfResult}
          setResult={setWfResult}
          onDone={reloadHistory}
        />
      )}

      <RunHistoryPanel
        runs={history}
        onReload={handleReload}
        onRefresh={reloadHistory}
        onDelete={handleDeleteRun}
        onClear={handleClearHistory}
      />
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
function RecommendationCard({
  rec,
  target,
  seed,
}: {
  rec: OptimizeRecommendation
  target: string
  seed: number
}) {
  const tLabel = TARGETS.find((t) => t.value === target)?.label ?? target
  const targetKey = target as keyof OptimizeMetrics
  return (
    <div
      className="section"
      style={{ border: '1px solid rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.06)' }}
    >
      <h3 style={{ marginTop: 0 }}>
        ✅ Recommended parameters <span style={{ color: '#64748b', fontWeight: 400, fontSize: 14 }}>
          (row #{rec.index + 1} below · seed {seed})
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

// --- Overfitting statistics (PBO + Deflated Sharpe) ---

// A small "?" badge that reveals a conceptual explanation on click. A fixed,
// transparent backdrop catches outside clicks so the popover text stays
// selectable (unlike an onBlur-close).
function InfoTip({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`About ${title}`}
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          padding: 0,
          fontSize: 11,
          lineHeight: '14px',
          fontWeight: 700,
          border: '1px solid #475569',
          background: open ? '#334155' : 'transparent',
          color: '#94a3b8',
          cursor: 'pointer',
        }}
      >
        ?
      </button>
      {open && (
        <>
          <span
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 19 }}
          />
          <span
            style={{
              position: 'absolute',
              zIndex: 20,
              top: 24,
              left: 0,
              width: 300,
              maxWidth: '80vw',
              background: '#0b1220',
              border: '1px solid #334155',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 13,
              fontWeight: 400,
              lineHeight: 1.55,
              color: '#cbd5e1',
              textAlign: 'left',
              whiteSpace: 'normal',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: 6 }}>{title}</div>
            {children}
          </span>
        </>
      )}
    </span>
  )
}

function StatTile({
  label,
  value,
  verdict,
  color,
  hint,
  info,
}: {
  label: string
  value: string
  verdict: string
  color: string
  hint: string
  info?: React.ReactNode
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 200,
        border: '1px solid #1e293b',
        borderRadius: 8,
        padding: 14,
        background: '#0b1220',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', fontSize: 13 }}>
        {label}
        {info && <InfoTip title={label}>{info}</InfoTip>}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
        <span style={{ fontSize: 30, fontWeight: 700, color }}>{value}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color }}>{verdict}</span>
      </div>
      <div style={{ color: '#64748b', fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>{hint}</div>
    </div>
  )
}

function OverfittingCard({ overfitting, nTrials }: { overfitting: Overfitting; nTrials: number }) {
  if (overfitting.note) {
    return (
      <div className="section">
        <h3 style={{ marginTop: 0 }}>Overfitting risk</h3>
        <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 0 }}>{overfitting.note}</p>
      </div>
    )
  }

  const pbo = overfitting.pbo
  const dsr = overfitting.deflated_sharpe

  // PBO: probability the in-sample winner underperforms out-of-sample. Lower is better.
  const pboVerdict =
    pbo == null
      ? { v: '—', c: '#94a3b8' }
      : pbo < 0.2
        ? { v: 'Low', c: '#10b981' }
        : pbo < 0.5
          ? { v: 'Moderate', c: '#f59e0b' }
          : { v: 'High', c: '#f43f5e' }

  // DSR: probability the best strategy's true Sharpe is > 0 after multiple testing. Higher is better.
  const dsrVerdict =
    dsr == null
      ? { v: '—', c: '#94a3b8' }
      : dsr >= 0.95
        ? { v: 'Strong', c: '#10b981' }
        : dsr >= 0.5
          ? { v: 'Moderate', c: '#f59e0b' }
          : { v: 'Weak', c: '#f43f5e' }

  return (
    <div className="section">
      <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        Overfitting risk
        <InfoTip title="Overfitting risk">
          <p style={{ margin: 0 }}>
            A backtest is easy to make look great by trying many parameter sets and keeping the
            winner — but most of that "edge" can be luck. These two statistics discount for the
            search so you get a defensible verdict instead of a number to eyeball. Both are computed
            from the trials already run, at no extra cost.
          </p>
        </InfoTip>
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 0 }}>
        Because we tried {nTrials} parameter sets, some will look good by luck alone. These two
        statistics discount for that multiple testing — a defensible verdict rather than a chart to
        eyeball.
      </p>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <StatTile
          label="Probability of Backtest Overfitting (PBO)"
          value={pbo == null ? '—' : `${(pbo * 100).toFixed(0)}%`}
          verdict={pboVerdict.v}
          color={pboVerdict.c}
          hint="How often the in-sample winner falls below the out-of-sample median across many splits. Lower is better — under 20% is reassuring."
          info={
            <>
              <p style={{ margin: '0 0 8px' }}>
                Judges your <strong>selection process</strong>: because you tested many parameter
                sets, the best one is partly skill and partly luck. PBO repeatedly splits the
                history and checks how often the config that won in-sample lands below the median
                out-of-sample — i.e. whether picking the winner generalizes or just fits noise.
              </p>
              <p style={{ margin: 0 }}>
                Read it low-is-good: ~0% means the choice holds up, ~50% is a coin-flip (pure
                overfitting), and above 50% is worse than random.
              </p>
            </>
          }
        />
        <StatTile
          label="Deflated Sharpe Ratio (DSR)"
          value={dsr == null ? '—' : `${(dsr * 100).toFixed(0)}%`}
          verdict={dsrVerdict.v}
          color={dsrVerdict.c}
          hint="Probability the recommended strategy's true Sharpe is positive after discounting for the number of trials. Higher is better — 95%+ is the usual bar."
          info={
            <>
              <p style={{ margin: '0 0 8px' }}>
                Judges the <strong>recommended strategy itself</strong>. It discounts that config's
                Sharpe for two things: how many configurations you tried (more tries → a higher
                Sharpe appears by luck alone) and how short or noisy its return series is.
              </p>
              <p style={{ margin: 0 }}>
                The result is the probability its true Sharpe is above zero. Higher is better — 95%+
                is the usual bar. Note the split of labour: PBO asks "does picking the in-sample best
                generalize?" (the search); DSR asks "is the config we recommend actually real?" (what
                you'd deploy).
              </p>
            </>
          }
        />
      </div>
      <p style={{ color: '#64748b', fontSize: 12, marginTop: 10 }}>
        PBO is a property of the search across {overfitting.n_configs ?? '—'} configurations over{' '}
        {overfitting.n_obs ?? '—'} in-sample days. DSR describes the{' '}
        <strong>{overfitting.dsr_basis === 'peak' ? 'in-sample peak' : 'recommended'}</strong> config
        {overfitting.selected_sharpe_daily != null &&
          ` — its daily Sharpe ${overfitting.selected_sharpe_daily} vs the expected-max-of-${overfitting.n_configs} hurdle ${overfitting.expected_max_sharpe_daily}`}
        .
      </p>
    </div>
  )
}

// --- Walk-forward validation ---

function WalkForwardPanel({
  kind,
  strategyId,
  start,
  end,
  target,
  nTrials,
  seed,
  result,
  setResult,
  onDone,
}: {
  kind: Kind
  strategyId: string
  start: string
  end: string
  target: string
  nTrials: string
  seed: string
  result: WalkForwardResult | null
  setResult: (r: WalkForwardResult | null) => void
  onDone: () => void
}) {
  const [nWindows, setNWindows] = useState('4')
  const [trainWindows, setTrainWindows] = useState('3')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  async function run() {
    setRunning(true)
    setError('')
    try {
      const r = await runWalkForward({
        kind,
        strategy_id: strategyId,
        start,
        end,
        n_windows: parseInt(nWindows, 10) || 4,
        train_windows: parseInt(trainWindows, 10) || 3,
        n_trials: parseInt(nTrials, 10) || 20,
        target,
        seed: parseInt(seed, 10) || 42,
      })
      setResult(r)
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="section">
      <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        Walk-forward validation
        <InfoTip title="Walk-forward validation">
          <p style={{ margin: '0 0 8px' }}>
            Rather than trusting one arbitrary in/out split, this simulates actually running the
            system: re-optimize on a rolling training window, trade the chosen parameters on the
            next <em>unseen</em> window, then slide forward and repeat.
          </p>
          <p style={{ margin: 0 }}>
            Stitched together, the unseen segments form one honest out-of-sample track record — with
            no parameters picked by hand. It's the empirical gold-standard test that PBO and DSR only
            approximate cheaply.
          </p>
        </InfoTip>
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 0 }}>
        Instead of one arbitrary split, re-optimize on a rolling training window and trade the
        chosen parameters on the next unseen window — repeatedly. The result is a single stitched
        out-of-sample equity curve and a <strong>walk-forward efficiency</strong> number, with no
        parameter picked by hand. Uses the strategy, dates, trials, target and seed above.
      </p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Test windows">
          <input type="number" style={{ width: 80 }} value={nWindows} onChange={(e) => setNWindows(e.target.value)} />
        </Field>
        <Field label="Train blocks / window">
          <input
            type="number"
            style={{ width: 80 }}
            value={trainWindows}
            onChange={(e) => setTrainWindows(e.target.value)}
          />
        </Field>
        <button onClick={run} disabled={running}>
          {running ? 'Running walk-forward…' : 'Run walk-forward'}
        </button>
      </div>
      {error && (
        <div className="status" style={{ color: '#f43f5e' }}>
          {error}
        </div>
      )}
      {result && <WalkForwardResults result={result} />}
    </div>
  )
}

function WalkForwardResults({ result }: { result: WalkForwardResult }) {
  const tLabel = TARGETS.find((t) => t.value === result.target)?.label ?? result.target
  const targetKey = result.target as keyof OptimizeMetrics
  const wfe = result.walk_forward_efficiency

  const wfeVerdict =
    wfe == null
      ? { v: '—', c: '#94a3b8' }
      : wfe >= 0.5
        ? { v: 'Healthy', c: '#10b981' }
        : wfe > 0
          ? { v: 'Fragile', c: '#f59e0b' }
          : { v: 'Failing', c: '#f43f5e' }

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
        <StatTile
          label="Walk-forward efficiency"
          value={wfe == null ? '—' : `${(wfe * 100).toFixed(0)}%`}
          verdict={wfeVerdict.v}
          color={wfeVerdict.c}
          hint="Out-of-sample performance as a share of in-sample. Above ~50% suggests the edge survives re-optimization; near zero or negative means it doesn't."
          info={
            <>
              <p style={{ margin: '0 0 8px' }}>
                Out-of-sample performance ÷ in-sample performance, averaged across all rolling
                windows. It measures how much of what the optimizer <em>promised</em> actually
                survived on data it had never seen.
              </p>
              <p style={{ margin: 0 }}>
                Near 100% means a real, stable edge; a collapse toward zero (or negative) means the
                optimization was fitting noise. Above ~50% is generally considered healthy.
              </p>
            </>
          }
        />
        <StatTile
          label={`Avg out-of-sample ${tLabel}`}
          value={fmt(result.avg_test_metric ?? undefined)}
          verdict={`${result.windows_positive}/${result.steps.length} windows +`}
          color={
            (result.avg_test_metric ?? 0) > 0 ? '#10b981' : '#f43f5e'
          }
          hint="Average of the metric across the unseen test windows, and how many of them were profitable."
        />
      </div>

      {result.equity_curve.length > 0 && (
        <>
          <div style={{ fontSize: 13, color: '#e2e8f0', marginBottom: 4 }}>
            Stitched out-of-sample equity (growth of 1)
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={result.equity_curve} margin={{ top: 6, right: 12, bottom: 4, left: -10 }}>
              <CartesianGrid stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} minTickGap={40} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b' }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <ReferenceLine y={1} stroke="#334155" strokeDasharray="4 3" />
              <Line dataKey="equity" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}

      <div className="scroll-table" style={{ marginTop: 12 }}>
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>#</th>
              <th style={{ textAlign: 'left' }}>Train</th>
              <th style={{ textAlign: 'left' }}>Test (unseen)</th>
              <th style={{ textAlign: 'left' }}>Chosen params</th>
              <th style={{ textAlign: 'right' }}>Train {tLabel}</th>
              <th style={{ textAlign: 'right' }}>Test {tLabel}</th>
              <th style={{ textAlign: 'right' }}>Test Ret %</th>
            </tr>
          </thead>
          <tbody>
            {result.steps.map((s, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td style={{ whiteSpace: 'nowrap', color: '#94a3b8', fontSize: 13 }}>
                  {s.train_period.start} → {s.train_period.end}
                </td>
                <td style={{ whiteSpace: 'nowrap', color: '#94a3b8', fontSize: 13 }}>
                  {s.test_period.start} → {s.test_period.end}
                </td>
                <td style={{ fontSize: 12, color: '#cbd5e1' }}>
                  {Object.entries(s.params)
                    .map(([k, v]) => `${k}=${fmt(v)}`)
                    .join(', ')}
                </td>
                <td style={{ textAlign: 'right' }}>{fmt(s.train_metric ?? undefined)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(s.test_metrics?.[targetKey])}</td>
                <td style={{ textAlign: 'right' }}>{fmt(s.test_metrics?.total_return)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// --- Run history (audit trail) ---

function RunHistoryPanel({
  runs,
  onReload,
  onRefresh,
  onDelete,
  onClear,
}: {
  runs: OptimizeRunSummary[]
  onReload: (id: string, type: 'optimization' | 'walk_forward') => void
  onRefresh: () => void
  onDelete: (id: string) => void
  onClear: () => void
}) {
  return (
    <div className="section">
      <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
        Run history
        <button style={{ fontSize: 12, padding: '2px 10px' }} onClick={onRefresh}>
          Refresh
        </button>
        {runs.length > 0 && (
          <button
            style={{ fontSize: 12, padding: '2px 10px', background: 'transparent', color: '#f43f5e', border: '1px solid #f43f5e' }}
            onClick={onClear}
          >
            Clear all
          </button>
        )}
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 0 }}>
        Every optimization and walk-forward run is saved with its seed and inputs, so results are
        reproducible and auditable. Click a row to reload it.
      </p>
      {runs.length === 0 ? (
        <p style={{ color: '#64748b' }}>No runs yet.</p>
      ) : (
        <div className="scroll-table">
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>When</th>
                <th style={{ textAlign: 'left' }}>Type</th>
                <th style={{ textAlign: 'left' }}>Strategy</th>
                <th style={{ textAlign: 'left' }}>Target</th>
                <th style={{ textAlign: 'right' }}>Seed</th>
                <th style={{ textAlign: 'left' }}>Result</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap', color: '#94a3b8', fontSize: 13 }}>
                    {r.created_at?.slice(0, 16).replace('T', ' ')}
                  </td>
                  <td>
                    <span style={{ color: r.type === 'walk_forward' ? '#818cf8' : '#10b981', fontSize: 13 }}>
                      {r.type === 'walk_forward' ? 'Walk-forward' : 'Optimization'}
                    </span>
                  </td>
                  <td style={{ fontSize: 13 }}>{r.strategy_name}</td>
                  <td style={{ fontSize: 13, color: '#94a3b8' }}>
                    {TARGETS.find((t) => t.value === r.target)?.label ?? r.target}
                  </td>
                  <td style={{ textAlign: 'right' }}>{r.seed}</td>
                  <td style={{ fontSize: 13, color: '#94a3b8' }}>
                    {r.type === 'walk_forward'
                      ? `WFE ${r.walk_forward_efficiency == null ? '—' : `${(r.walk_forward_efficiency * 100).toFixed(0)}%`}`
                      : `PBO ${r.pbo == null ? '—' : `${(r.pbo * 100).toFixed(0)}%`} · DSR ${r.deflated_sharpe == null ? '—' : `${(r.deflated_sharpe * 100).toFixed(0)}%`}`}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button style={{ fontSize: 12, padding: '2px 10px' }} onClick={() => onReload(r.id, r.type)}>
                      Reload
                    </button>
                    <button
                      title="Delete this run"
                      style={{ fontSize: 12, padding: '2px 8px', marginLeft: 6, background: 'transparent', color: '#64748b', border: '1px solid #334155' }}
                      onClick={() => onDelete(r.id)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
