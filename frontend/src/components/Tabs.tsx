import type { PageName } from '../types'

const TABS: { name: PageName; label: string }[] = [
  { name: 'builder', label: 'Strategy Builder' },
  { name: 'ai', label: 'AI Strategy Builder' },
  { name: 'portfolio', label: 'Portfolio Backtest' },
  { name: 'backtest', label: 'Stock Backtest' },
  { name: 'paper', label: 'Paper Trading' },
]

interface TabsProps {
  active: PageName
  onSelect: (page: PageName) => void
}

export function Tabs({ active, onSelect }: TabsProps) {
  return (
    <div className="tabs">
      {TABS.map((tab) => (
        <div
          key={tab.name}
          className={`tab ${active === tab.name ? 'active' : ''}`}
          onClick={() => onSelect(tab.name)}
        >
          {tab.label}
        </div>
      ))}
    </div>
  )
}
