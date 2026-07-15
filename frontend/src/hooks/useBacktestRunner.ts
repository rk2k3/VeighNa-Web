import { useCallback, useState } from 'react'

/**
 * Shared plumbing for running a backtest: the running flag, the result, and the
 * status line (with colour). Both the stock and portfolio backtest pages have
 * the same run → "Complete"/"Error" lifecycle; this keeps it in one place.
 *
 * `run` takes the actual async call, so each page stays in control of building
 * its own request. `setStatus`/`setStatusColor` are exposed so pages can reuse
 * the same status line for other messages (e.g. "Saved changes").
 */
export function useBacktestRunner<T>() {
  const [status, setStatus] = useState('')
  const [statusColor, setStatusColor] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<T | null>(null)

  const run = useCallback(async (call: () => Promise<T>, runningMessage = 'Running...') => {
    setRunning(true)
    setStatus(runningMessage)
    setStatusColor('')
    setResult(null)
    try {
      setResult(await call())
      setStatus('Complete')
      setStatusColor('#10b981')
    } catch (e) {
      setStatus('Error: ' + (e as Error).message)
      setStatusColor('#f43f5e')
    } finally {
      setRunning(false)
    }
  }, [])

  return { status, setStatus, statusColor, setStatusColor, running, result, setResult, run }
}
