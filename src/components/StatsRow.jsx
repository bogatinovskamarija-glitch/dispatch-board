export default function StatsRow({ loads, statusFilter, onFilterChange }) {
  // Count unique trucks per status (a truck with 2 loads counts as 1)
  const truckStatus = new Map()
  for (const l of loads) {
    const key = l.truck_number || `_${l.id}`
    if (!truckStatus.has(key)) truckStatus.set(key, l.status)
  }

  const counts = { covered: 0, empty: 0, home: 0, broken: 0, no_driver: 0, prebooked: 0 }
  for (const s of truckStatus.values()) {
    if (counts[s] !== undefined) counts[s]++
  }

  // Active loads = all covered load records (trucks can have multiple)
  const activeLoads = loads.filter(l => l.status === 'covered').length

  const totalRevenue = loads.reduce((s, l) => s + (Number(l.price) || 0), 0)
  const fmt = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0 })

  function toggle(status) {
    onFilterChange(statusFilter === status ? null : status)
  }

  const CARDS = [
    { status: 'covered',   dot: 'dot-green',  label: 'Covered',    count: counts.covered   },
    { status: 'empty',     dot: 'dot-yellow', label: 'Empty',      count: counts.empty     },
    { status: 'home',      dot: 'dot-pink',   label: 'At Home',    count: counts.home      },
    { status: 'broken',    dot: 'dot-red',    label: 'Broken',     count: counts.broken    },
    { status: 'no_driver', dot: 'dot-grey',   label: 'No Driver',  count: counts.no_driver },
    { status: 'prebooked', dot: 'dot-indigo', label: 'Pre-Booked', count: counts.prebooked },
  ]

  return (
    <div className="stats-row">
      {CARDS.map(c => (
        <div
          key={c.status}
          className={`stat-card stat-card-btn${statusFilter === c.status ? ' stat-active' : ''}`}
          onClick={() => toggle(c.status)}
          title={`Filter by ${c.label}`}
        >
          <div className={`stat-dot ${c.dot}`} />
          <div>
            <div className="stat-count">{c.count}</div>
            <div className="stat-label">{c.label}</div>
          </div>
        </div>
      ))}

      <div className="stat-card" style={{ borderLeft: '3px solid #6366F1' }}>
        <div>
          <div className="stat-count" style={{ color: '#4F46E5' }}>{activeLoads}</div>
          <div className="stat-label">Active Loads</div>
        </div>
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
