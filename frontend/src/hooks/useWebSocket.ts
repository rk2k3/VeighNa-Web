import { useEffect, useRef, useState } from 'react'
import { API } from '../api'
import type { TickMessage, WsMessage } from '../types'

export function useWebSocket(onPosition: () => void) {
  const [connected, setConnected] = useState(false)
  const [lastTick, setLastTick] = useState<TickMessage | null>(null)
  const onPositionRef = useRef(onPosition)
  onPositionRef.current = onPosition

  useEffect(() => {
    const wsUrl = API.replace(/^http/, 'ws') + '/ws'
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onmessage = (e) => {
      const data: WsMessage = JSON.parse(e.data)
      if (data.type === 'tick') setLastTick(data)
      if (data.type === 'position') onPositionRef.current()
    }

    return () => ws.close()
  }, [])

  return { connected, lastTick }
}
