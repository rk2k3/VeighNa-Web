interface StatCardProps {
  label: string
  value: string
  colorClass?: 'green' | 'red' | ''
}

export function StatCard({ label, value, colorClass = '' }: StatCardProps) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${colorClass}`}>{value}</div>
    </div>
  )
}
