/** The purple "✦ AI verdict" card used on backtest and optimization results. */
export function AiVerdictCard({ loading, text }: { loading: boolean; text: string }) {
  if (!loading && !text) return null
  return (
    <div
      className="no-print"
      style={{
        marginTop: 14,
        border: '1px solid rgba(167,139,250,0.35)',
        background: 'rgba(167,139,250,0.07)',
        borderRadius: 8,
        padding: '12px 16px',
      }}
    >
      <div style={{ color: '#a78bfa', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
        ✦ AI verdict
      </div>
      {loading ? (
        <div style={{ color: '#64748b', fontSize: 14 }}>Analyzing results…</div>
      ) : (
        <div style={{ color: '#e2e8f0', fontSize: 14, lineHeight: 1.6 }}>{text}</div>
      )}
    </div>
  )
}
