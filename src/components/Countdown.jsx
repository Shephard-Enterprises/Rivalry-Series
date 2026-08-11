import { useEffect, useState } from 'react'

export default function Countdown({ deadline }) {
  const [now, setNow] = useState(() => deadline.getTime())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const distance = Math.max(0, deadline.getTime() - now)
  const values = [Math.floor(distance / 86400000), Math.floor(distance / 3600000) % 24, Math.floor(distance / 60000) % 60, Math.floor(distance / 1000) % 60]
  return <div className="countdown" aria-label="Time remaining"><span><b>{values[0]}</b>Days</span><i>:</i><span><b>{String(values[1]).padStart(2, '0')}</b>Hrs</span><i>:</i><span><b>{String(values[2]).padStart(2, '0')}</b>Min</span><i>:</i><span><b>{String(values[3]).padStart(2, '0')}</b>Sec</span></div>
}
