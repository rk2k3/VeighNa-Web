import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { fetchAccount, fetchPositions } from './api'
import { AccountPanel } from './components/AccountPanel'
import { BacktestPage } from './components/BacktestPage'
import { PaperTradingPage } from './components/PaperTradingPage'
import { AiStrategyPage } from './components/AiStrategyPage'
import { PortfolioPage } from './components/PortfolioPage'
import { StrategyBuilderPage } from './components/StrategyBuilderPage'
import { Tabs } from './components/Tabs'
import { useWebSocket } from './hooks/useWebSocket'
import type { Account, PageName, Position } from './types'

function App() {
  const [page, setPage] = useState<PageName>('builder')
  const [account, setAccount] = useState<Account | null>(null)
  const [accountError, setAccountError] = useState(false)
  const [positions, setPositions] = useState<Position[]>([])

  const loadAccount = useCallback(async () => {
    try {
      setAccount(await fetchAccount())
      setAccountError(false)
    } catch {
      setAccountError(true)
    }
  }, [])

  const loadPositions = useCallback(async () => {
    try {
      setPositions(await fetchPositions())
    } catch (e) {
      console.error(e)
    }
  }, [])

  const onPositionUpdateRef = useRef(() => {})
  onPositionUpdateRef.current = () => {
    loadPositions()
    loadAccount()
  }

  const { connected, lastTick } = useWebSocket(() => onPositionUpdateRef.current())

  useEffect(() => {
    loadAccount()
    loadPositions()
    const accountInterval = setInterval(loadAccount, 30000)
    const positionsInterval = setInterval(loadPositions, 10000)
    return () => {
      clearInterval(accountInterval)
      clearInterval(positionsInterval)
    }
  }, [loadAccount, loadPositions])

  return (
    <>
      <h1>Strategy Tester</h1>

      <AccountPanel account={account} error={accountError} connected={connected} />

      <Tabs active={page} onSelect={setPage} />

      {page === 'builder' && <StrategyBuilderPage />}
      {page === 'ai' && <AiStrategyPage />}
      {page === 'portfolio' && <PortfolioPage />}
      {page === 'backtest' && <BacktestPage />}
      {page === 'paper' && (
        <PaperTradingPage lastTick={lastTick} positions={positions} onRefreshPositions={loadPositions} />
      )}
    </>
  )
}

export default App
