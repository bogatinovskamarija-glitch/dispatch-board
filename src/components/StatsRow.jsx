export default function StatsRow({ loads }) {
  const counts = { covered: 0, empty: 0, home: 0, broken: 0, no_driver: 0 }
  let totalRevenue = 0

  for (const l of loads) {
    if (counts[l.status] !== undefined) counts[l.status]++
    totalRevenue += Number(l.price) || 0
  }

  const fmt = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0 })

  return (
    <div className="stats-row">
      <div className="stat-card">
        <div className="stat-dot dot-green" />
        <div><div className="stat-count">{counts.covered}</div><div className="stat-label">Covered</div></div>
      </div>
      <div className="stat-card">
        <div className="stat-dot dot-yellow" />
        <div><div className="stat-count">{counts.empty}</div><div className="stat-label">Empty</div></div>
      </div>
      <div className="stat-card">
        <div className="stat-dot dot-pink" />
        <div><div className="stat-count">{counts.home}</div><div className="stat-label">At Home</div></div>
      </div>
      <div className="stat-card">
        <div className="stat-dot dot-red" />
        <div><div className="stat-count">{counts.broken}</div><div className="stat-label">Broken</div></div>
      </div>
      <div className="stat-card">
        <div className="stat-dot dot-grey" />
        <div><div className="stat-count">{counts.no_driver}</div><div className="stat-label">No Driver</div></div>
      </div>
      <div className="stat-card" style={{ marginLeft: 'auto', minWidth: 160 }}>
        <div>
          <div className="stat-count">{fmt(totalRevenue)}</div>
          <div className="stat-label">Total Revenue</div>
        </div>
      </div>
    </div>
  )
}
