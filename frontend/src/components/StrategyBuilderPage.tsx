import { useEffect, useState } from 'react'
import { createSavedStrategy, deleteSavedStrategy, fetchSavedStrategies } from '../api'
import {
  answerLabel,
  buildStrategyConfig,
  defaultAnswers,
  GOALS,
  type Goal,
} from '../lib/goals'
import type { SavedStrategy } from '../types'

type Step = 'goal' | 'questions' | 'review'

export function StrategyBuilderPage() {
  const [step, setStep] = useState<Step>('goal')
  const [goal, setGoal] = useState<Goal | null>(null)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [capitalText, setCapitalText] = useState('100000')
  const [name, setName] = useState('')

  const [saved, setSaved] = useState<SavedStrategy[]>([])
  const [status, setStatus] = useState('')
  const [statusColor, setStatusColor] = useState('')

  async function loadSaved() {
    try {
      setSaved(await fetchSavedStrategies())
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    loadSaved()
  }, [])

  function selectGoal(g: Goal) {
    setGoal(g)
    setAnswers(defaultAnswers(g))
    setCapitalText(String(g.questions.find((q) => q.param === 'capital')?.default ?? 100000))
    setName('')
    setStep('questions')
  }

  function restart() {
    setGoal(null)
    setStep('goal')
    setStatus('')
  }

  async function handleSave() {
    if (!goal) return
    if (!name.trim()) {
      setStatus('Please enter a strategy name before saving.')
      setStatusColor('#f43f5e')
      return
    }
    const { capital, params } = buildStrategyConfig(goal, answers)
    try {
      await createSavedStrategy({
        name: name.trim(),
        goal: goal.key,
        goal_label: goal.title,
        strategy: goal.strategy,
        strategy_label: goal.strategyLabel,
        universe_label: goal.universeLabel,
        symbols: goal.symbols,
        exchange: goal.exchange,
        capital,
        params,
      })
      setStatus(`Saved "${name.trim()}". Find it on the Portfolio tab to backtest.`)
      setStatusColor('#10b981')
      await loadSaved()
      restart()
    } catch (e) {
      setStatus('Error saving: ' + (e as Error).message)
      setStatusColor('#f43f5e')
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteSavedStrategy(id)
      await loadSaved()
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div>
      {step === 'goal' && <GoalStep onSelect={selectGoal} />}

      {step === 'questions' && goal && (
        <QuestionsStep
          goal={goal}
          answers={answers}
          capitalText={capitalText}
          onAnswer={(param, value) => setAnswers((prev) => ({ ...prev, [param]: value }))}
          onCapital={(text) => {
            setCapitalText(text)
            const n = parseFloat(text)
            setAnswers((prev) => ({ ...prev, capital: Number.isNaN(n) ? 0 : n }))
          }}
          onBack={restart}
          onNext={() => setStep('review')}
        />
      )}

      {step === 'review' && goal && (
        <ReviewStep
          goal={goal}
          answers={answers}
          name={name}
          onName={setName}
          onBack={() => setStep('questions')}
          onSave={handleSave}
        />
      )}

      {status && (
        <div className="status" style={{ color: statusColor, fontSize: 15 }}>
          {status}
        </div>
      )}

      <SavedList saved={saved} onDelete={handleDelete} />
    </div>
  )
}

// --- Step 1: goal cards ---------------------------------------------------

function GoalStep({ onSelect }: { onSelect: (g: Goal) => void }) {
  return (
    <div className="section">
      <h2>Choose an Investment Goal</h2>
      <p style={{ color: '#94a3b8', marginBottom: 8 }}>
        Pick what you want this portfolio to achieve. We'll turn your answers into a
        ready-to-backtest strategy.
      </p>
      <div className="goal-grid">
        {GOALS.map((g) => (
          <button key={g.key} className="goal-card" onClick={() => onSelect(g)}>
            <span className="goal-emoji">{g.emoji}</span>
            <span className="goal-title">{g.title}</span>
            <span className="goal-desc">{g.description}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// --- Step 2: questionnaire ------------------------------------------------

function QuestionsStep({
  goal,
  answers,
  capitalText,
  onAnswer,
  onCapital,
  onBack,
  onNext,
}: {
  goal: Goal
  answers: Record<string, number>
  capitalText: string
  onAnswer: (param: string, value: number) => void
  onCapital: (text: string) => void
  onBack: () => void
  onNext: () => void
}) {
  return (
    <div className="section">
      <h2>
        {goal.emoji} {goal.title}
      </h2>
      <p style={{ color: '#94a3b8', marginBottom: 12 }}>
        Strategy: <strong>{goal.strategyLabel}</strong> · Universe:{' '}
        <strong>{goal.universeLabel}</strong>
      </p>

      {goal.questions.map((q) => (
        <div key={q.param} className="question">
          <label className="question-label">{q.label}</label>
          {q.help && <div className="question-help">{q.help}</div>}
          {q.kind === 'number' ? (
            <input
              type="number"
              value={capitalText}
              onChange={(e) => onCapital(e.target.value)}
            />
          ) : (
            <div className="option-row">
              {q.options!.map((opt) => (
                <button
                  key={opt.label}
                  className={`option ${answers[q.param] === opt.value ? 'selected' : ''}`}
                  onClick={() => onAnswer(q.param, opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      <div style={{ marginTop: 16 }}>
        <button onClick={onBack} className="secondary">
          Back
        </button>
        <button onClick={onNext}>Review</button>
      </div>
    </div>
  )
}

// --- Step 3: review + save ------------------------------------------------

function ReviewStep({
  goal,
  answers,
  name,
  onName,
  onBack,
  onSave,
}: {
  goal: Goal
  answers: Record<string, number>
  name: string
  onName: (name: string) => void
  onBack: () => void
  onSave: () => void
}) {
  const { capital, params } = buildStrategyConfig(goal, answers)
  return (
    <div className="section">
      <h2>Review Your Strategy</h2>

      <table>
        <tbody>
          <tr>
            <th style={{ width: 220 }}>Investment Goal</th>
            <td>
              {goal.emoji} {goal.title}
            </td>
          </tr>
          <tr>
            <th>Strategy</th>
            <td>{goal.strategyLabel}</td>
          </tr>
          <tr>
            <th>Investment Universe</th>
            <td>
              {goal.universeLabel}
              <div style={{ color: '#94a3b8', fontSize: 14, marginTop: 4 }}>
                {goal.symbols.join(', ')}
              </div>
            </td>
          </tr>
          <tr>
            <th>Initial Investment</th>
            <td>${capital.toLocaleString()}</td>
          </tr>
          {goal.questions
            .filter((q) => q.param !== 'capital')
            .map((q) => (
              <tr key={q.param}>
                <th>{q.label}</th>
                <td>
                  {answerLabel(q, answers[q.param])}
                  <span style={{ color: '#64748b', fontSize: 13 }}>
                    {' '}
                    ({q.param} = {params[q.param]})
                  </span>
                </td>
              </tr>
            ))}
        </tbody>
      </table>

      <div style={{ marginTop: 16 }}>
        <label className="question-label">Strategy Name</label>
        <div>
          <input
            style={{ width: 320 }}
            value={name}
            onChange={(e) => onName(e.target.value)}
            placeholder="e.g. My Growth Portfolio"
          />
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <button onClick={onBack} className="secondary">
          Back
        </button>
        <button onClick={onSave}>Save Strategy</button>
      </div>
    </div>
  )
}

// --- Saved strategies list ------------------------------------------------

function SavedList({
  saved,
  onDelete,
}: {
  saved: SavedStrategy[]
  onDelete: (id: string) => void
}) {
  if (!saved.length) return null
  return (
    <div className="section">
      <h2>Saved Strategies</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Goal</th>
            <th>Strategy</th>
            <th>Capital</th>
            <th>Symbols</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {saved.map((s) => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td>{s.goal_label}</td>
              <td>{s.strategy_label}</td>
              <td>${s.capital.toLocaleString()}</td>
              <td style={{ color: '#94a3b8', fontSize: 14 }}>{s.symbols.join(', ')}</td>
              <td>
                <button className="danger" onClick={() => onDelete(s.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
