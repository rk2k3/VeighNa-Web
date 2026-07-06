import { useState } from 'react'
import { placeOrder, subscribeSymbol } from '../api'
import type { Direction, Position, TickMessage } from '../types'
import { PositionsTable } from './PositionsTable'

interface PaperTradingPageProps {
  lastTick: TickMessage | null
  positions: Position[]
  onRefreshPositions: () => void
}

export function PaperTradingPage({ lastTick, positions, onRefreshPositions }: PaperTradingPageProps) {
  const [subSymbol, setSubSymbol] = useState('AAPL')
  const [subExchange, setSubExchange] = useState('NASDAQ')
  const [subStatus, setSubStatus] = useState('')

  const [orderSymbol, setOrderSymbol] = useState('')
  const [orderPrice, setOrderPrice] = useState('')
  const [orderVolume, setOrderVolume] = useState('')
  const [orderStatus, setOrderStatus] = useState('')
  const [orderStatusColor, setOrderStatusColor] = useState('')

  async function handleSubscribe() {
    const data = await subscribeSymbol(subSymbol, subExchange)
    setSubStatus(data.status)
  }

  async function handlePlaceOrder(direction: Direction) {
    setOrderStatus('Submitting...')
    try {
      const data = await placeOrder({
        symbol: orderSymbol,
        direction,
        price: parseFloat(orderPrice),
        volume: parseFloat(orderVolume),
      })
      setOrderStatus('Order submitted: ' + data.vt_orderid)
      setOrderStatusColor('#69f0ae')
      onRefreshPositions()
    } catch (e) {
      setOrderStatus('Error: ' + (e as Error).message)
      setOrderStatusColor('#ef5350')
    }
  }

  return (
    <div>
      <div className="section">
        <h2>Subscribe to Symbol</h2>
        <div>
          <input value={subSymbol} onChange={(e) => setSubSymbol(e.target.value)} placeholder="Symbol" />
          <input value={subExchange} onChange={(e) => setSubExchange(e.target.value)} placeholder="Exchange" />
          <button onClick={handleSubscribe}>Subscribe</button>
        </div>
        <div className="ticker">
          {lastTick
            ? (
              <>
                {lastTick.symbol}: <strong>${Number(lastTick.price).toFixed(2)}</strong> | Bid:{' '}
                {Number(lastTick.bid).toFixed(2)} | Ask: {Number(lastTick.ask).toFixed(2)}
              </>
            )
            : subStatus || 'Waiting for prices...'}
        </div>
      </div>
      <div className="section">
        <h2>Place Order</h2>
        <div>
          <input value={orderSymbol} onChange={(e) => setOrderSymbol(e.target.value)} placeholder="Symbol" />
          <input value={orderPrice} onChange={(e) => setOrderPrice(e.target.value)} placeholder="Price" />
          <input value={orderVolume} onChange={(e) => setOrderVolume(e.target.value)} placeholder="Volume" />
          <button onClick={() => handlePlaceOrder('Long')}>Buy</button>
          <button style={{ background: '#ef5350', color: '#fff' }} onClick={() => handlePlaceOrder('Short')}>
            Sell
          </button>
        </div>
        <div className="status" style={{ color: orderStatusColor }}>
          {orderStatus}
        </div>
      </div>
      <PositionsTable positions={positions} onRefresh={onRefreshPositions} />
    </div>
  )
}
