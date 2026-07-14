import { useState } from 'react'
import {
  createDslStrategy,
  createSavedStrategy,
  generatePortfolioStrategy,
  generateStrategy,
} from '../api'
import { ruleText, riskText } from '../lib/dsl'
import type { Dsl, PortfolioChoice } from '../types'
import { SavedStrategiesManager } from './SavedStrategiesManager'

type Mode = 'portfolio' | 'stock'

const PORTFOLIO_EXAMPLES = [
  'Grow my wealth aggressively over the long term, I can tolerate risk.',
  'Protect my capital and keep volatility low — this is my safety bucket.',
  'Spread risk broadly across all these names, minimal management.',
]
const STOCK_EXAMPLES = [
  'Buy AAPL when the daily RSI drops below 30 and sell when RSI rises above 70. Use an 8% stop loss.',
  'Golden cross with short windows: go long when the 20-day SMA crosses above the 50-day SMA, and exit when it crosses back below.',
  'Buy when price crosses above its 20-day EMA; take profit at 15%, stop loss at 5%.',
  'Build a momentum strategy for AAPL. Go long whenever any of these signals suggest bullish momentum: the 14-day RSI is below 35, the 10-day EMA is above the 30-day EMA, the closing price is trading above its 20-day simple moving average, or the 20-day SMA is above the 50-day SMA. Exit the position whenever any of the following occurs: the 14-day RSI exceeds 70, the closing price drops below its 20-day SMA, or the 10-day EMA falls below the 30-day EMA. Apply an 8% stop loss and a 12% take profit.',
]

export function AiStrategyPage() {
  const [mode, setMode] = useState<Mode>('portfolio')
  // Bumped whenever a strategy is saved, so the manager below refreshes.
  const [savedTick, setSavedTick] = useState(0)
  const onSaved = () => setSavedTick((t) => t + 1)

  return (
    <div>
      <div className="section">
        <h2>Create a Strategy with AI</h2>
        <p style={{ color: '#94a3b8', marginBottom: 12 }}>
          Describe your goal in plain English and let AI build a strategy. Save it, then
          run it from the matching backtest tab.
        </p>
        <div className="option-row">
          <button
            className={`option ${mode === 'portfolio' ? 'selected' : ''}`}
            onClick={() => setMode('portfolio')}
          >
            📊 Portfolio Strategy
          </button>
          <button
            className={`option ${mode === 'stock' ? 'selected' : ''}`}
            onClick={() => setMode('stock')}
          >
            📈 Single-Stock Strategy
          </button>
        </div>
        <p style={{ color: '#64748b', fontSize: 13, marginTop: 8 }}>
          {mode === 'portfolio'
            ? 'AI allocates across a set of stocks you choose. Backtest it on the Portfolio Backtest tab.'
            : 'AI builds entry/exit rules for one stock. Backtest it on the Stock Backtest tab.'}
        </p>
      </div>

      {mode === 'portfolio' ? <PortfolioCreator onSaved={onSaved} /> : <StockCreator onSaved={onSaved} />}

      <SavedStrategiesManager refreshKey={savedTick} />
    </div>
  )
}

// --- Portfolio strategy creation -----------------------------------------

function PortfolioCreator({ onSaved }: { onSaved: () => void }) {
  const [description, setDescription] = useState('')
  const [symbols, setSymbols] = useState('AAPL, MSFT, NVDA, AMZN, META, GOOGL')
  const [exchange, setExchange] = useState('NASDAQ')
  const [capital, setCapital] = useState('100000')
  const [name, setName] = useState('')
  const [goalSummary, setGoalSummary] = useState('')

  const [generating, setGenerating] = useState(false)
  const [choice, setChoice] = useState<PortfolioChoice | null>(null)
  const [status, setStatus] = useState('')
  const [color, setColor] = useState('')

  const symbolList = symbols.split(',').map((s) => s.trim()).filter(Boolean)

  async function handleGenerate() {
    if (!description.trim() || !symbolList.length) return
    setGenerating(true)
    setStatus('')
    setChoice(null)
    try {
      const c = await generatePortfolioStrategy({ description, symbols: symbolList, exchange })
      setChoice(c)
      setName(c.name)
      // Goal is left empty for the user to fill in themselves before saving.
      setGoalSummary('')
    } catch (e) {
      setStatus((e as Error).message)
      setColor('#f43f5e')
    } finally {
      setGenerating(false)
    }
  }

  async function handleSave() {
    if (!choice) return
    try {
      await createSavedStrategy({
        name: name.trim() || choice.name,
        goal: 'ai',
        goal_label: goalSummary.trim() || 'AI Generated',
        strategy: choice.strategy,
        strategy_label: choice.strategy_label,
        universe_label: 'Custom Universe',
        symbols: symbolList,
        exchange,
        capital: parseFloat(capital) || 100000,
        params: choice.params,
      })
      setStatus(`Saved “${name.trim() || choice.name}”. Open the Portfolio Backtest tab to run it.`)
      setColor('#10b981')
      setChoice(null)
      setDescription('')
      setGoalSummary('')
      onSaved()
    } catch (e) {
      setStatus('Error saving: ' + (e as Error).message)
      setColor('#f43f5e')
    }
  }

  return (
    <>
      <div className="section">
        <h2>Describe Your Portfolio Goal</h2>
        <textarea
          style={textareaStyle}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Grow my wealth aggressively over the long term; I can tolerate risk."
        />
        <ExampleButtons examples={PORTFOLIO_EXAMPLES} onPick={setDescription} />

        <div style={{ marginTop: 10 }}>
          <label className="question-label">Markets / Symbols</label>
          <div>
            <input
              style={{ width: 360 }}
              value={symbols}
              onChange={(e) => setSymbols(e.target.value)}
              placeholder="Symbols (e.g. AAPL, MSFT, SPY.ARCA)"
            />
            <input value={exchange} onChange={(e) => setExchange(e.target.value)} placeholder="Default exchange" />
            <input value={capital} onChange={(e) => setCapital(e.target.value)} placeholder="Capital" />
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <button onClick={handleGenerate} disabled={generating}>
            {generating ? 'Generating...' : 'Generate Portfolio Strategy'}
          </button>
        </div>
        {status && (
          <div className="status" style={{ color }}>
            {status}
          </div>
        )}
      </div>

      {choice && (
        <div className="section">
          <h2>Generated Strategy</h2>
          <div className="config-summary">
            <div className="config-row">
              <span className="config-key">Name</span>
              <input style={{ width: 280, margin: 0 }} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="config-row">
              <span className="config-key">Goal</span>
              <input
                style={{ width: 360, margin: 0 }}
                value={goalSummary}
                onChange={(e) => setGoalSummary(e.target.value)}
                placeholder="Short summary of your goal"
              />
            </div>
            <div className="config-row">
              <span className="config-key">Strategy</span>
              <span>{choice.strategy_label}</span>
            </div>
            <div className="config-row">
              <span className="config-key">Universe</span>
              <span>{symbolList.join(', ')}</span>
            </div>
            {Object.entries(choice.params).map(([k, v]) => (
              <div className="config-row" key={k}>
                <span className="config-key">{k}</span>
                <span>{v}</span>
              </div>
            ))}
            <div className="config-row">
              <span className="config-key">Why</span>
              <span style={{ color: '#94a3b8' }}>{choice.rationale}</span>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <button onClick={handleSave}>Save Strategy</button>
            <button className="secondary" onClick={() => setChoice(null)}>
              Discard
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// --- Single-stock strategy creation --------------------------------------

function StockCreator({ onSaved }: { onSaved: () => void }) {
  const [description, setDescription] = useState('')
  const [symbol, setSymbol] = useState('AAPL')
  const [generating, setGenerating] = useState(false)
  const [dsl, setDsl] = useState<Dsl | null>(null)
  const [status, setStatus] = useState('')
  const [color, setColor] = useState('')

  async function handleGenerate() {
    if (!description.trim()) return
    setGenerating(true)
    setStatus('')
    setDsl(null)
    try {
      const res = await generateStrategy({ description, symbol: symbol.trim() || undefined })
      setDsl(res.dsl)
    } catch (e) {
      setStatus((e as Error).message)
      setColor('#f43f5e')
    } finally {
      setGenerating(false)
    }
  }

  async function handleSave() {
    if (!dsl) return
    try {
      await createDslStrategy(dsl)
      setStatus(`Saved “${dsl.name}”. Open the Stock Backtest tab to run it.`)
      setColor('#10b981')
      setDsl(null)
      setDescription('')
      onSaved()
    } catch (e) {
      setStatus('Error saving: ' + (e as Error).message)
      setColor('#f43f5e')
    }
  }

  return (
    <>
      <div className="section">
        <h2>Describe Your Stock Strategy</h2>
        <textarea
          style={textareaStyle}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Buy AAPL when daily RSI drops below 30 and sell when it rises above 70, with an 8% stop loss."
        />
        <ExampleButtons examples={STOCK_EXAMPLES} onPick={setDescription} />

        <div style={{ marginTop: 10 }}>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="Symbol" />
          <button onClick={handleGenerate} disabled={generating}>
            {generating ? 'Generating...' : 'Generate Stock Strategy'}
          </button>
        </div>
        {status && (
          <div className="status" style={{ color }}>
            {status}
          </div>
        )}
      </div>

      {dsl && (
        <div className="section">
          <h2>Generated Strategy</h2>
          <div className="config-summary">
            <div className="config-row">
              <span className="config-key">Name</span>
              <input
                style={{ width: 280, margin: 0 }}
                value={dsl.name}
                onChange={(e) => setDsl({ ...dsl, name: e.target.value })}
              />
            </div>
            <div className="config-row">
              <span className="config-key">Symbol</span>
              <input
                style={{ width: 160, margin: 0 }}
                value={dsl.symbol}
                onChange={(e) => setDsl({ ...dsl, symbol: e.target.value })}
              />
            </div>
            <div className="config-row">
              <span className="config-key">Direction</span>
              <span>{dsl.direction}</span>
            </div>
            <div className="config-row">
              <span className="config-key">Entry when</span>
              <span>{ruleText(dsl.entry)}</span>
            </div>
            <div className="config-row">
              <span className="config-key">Exit when</span>
              <span>{ruleText(dsl.exit)}</span>
            </div>
            <div className="config-row">
              <span className="config-key">Risk</span>
              <span>{riskText(dsl)}</span>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <button onClick={handleSave}>Save Strategy</button>
            <button className="secondary" onClick={() => setDsl(null)}>
              Discard
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// --- Shared bits ---------------------------------------------------------

const textareaStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 90,
  background: '#1e293b',
  color: '#e2e8f0',
  border: '1px solid #334155',
  borderRadius: 4,
  padding: 8,
  fontSize: 16,
  fontFamily: 'inherit',
}

function ExampleButtons({ examples, onPick }: { examples: string[]; onPick: (s: string) => void }) {
  return (
    <div style={{ marginTop: 4 }}>
      <span style={{ color: '#64748b', fontSize: 13 }}>Try: </span>
      {examples.map((ex, i) => (
        <button
          key={i}
          className="secondary"
          style={{ fontSize: 12, padding: '2px 8px' }}
          onClick={() => onPick(ex)}
        >
          Example {i + 1}
        </button>
      ))}
    </div>
  )
}
