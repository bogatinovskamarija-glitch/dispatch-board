import { useState, useMemo } from 'react'
import { useWeeklySummary, useWeekPaystubs, getThursdayWeek } from '../../hooks/useWeeklySummary'
import { useDriverProfiles } from '../../hooks/useDriverProfiles'

const fmt    = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })
const fmtNum = n => Number(n).toLocaleString('en-US')

function addWeeks(isoDate, n) {
  const d = new Date(isoDate + 'T12:00:00')
  d.setDate(d.getDate() + n * 7)
  return d.toISOString().split('T')[0]
}

function formatRange(start, end) {
  const opts = { month: 'short', day: 'numeric' }
  const s = new Date(start + 'T12:00:00').toLocaleDateString('en-US', opts)
  const e = new Date(end   + 'T12:00:00').toLocaleDateString('en-US', { ...opts, year: 'numeric' })
  return `${s} – ${e}`
}

// Estimate pay for one load given a driver profile
function estimatePay(load, profile) {
  if (!profile) return null
  if (profile.profile_type === 'owner_operator') {
    // OO driver receives the load price MINUS the company's commission.
    // commission_pct is what the company keeps, so the driver gets (1 - pct).
    const pct = (Number(profile.commission_pct) || 15) / 100
    return (Number(load.price) || 0) * (1 - pct)
  }
  if (profile.pay_type === 'per_mile' && profile.pay_rate && load.total_miles) {
    return Number(load.total_miles) * Number(profile.pay_rate)
  }
  return null // flat rate — can't auto-calc
}

// ── Simple SVG horizontal bar chart ───────────────────────────────────────────
function PayrollChart({ rows }) {
  if (!rows.length) return null
  const maxVal = Math.max(...rows.map(r => Math.max(r.gross, r.payroll ?? 0)), 1)
  const BAR_H  = 18
  const GAP    = 6
  const GROUP  = BAR_H * 2 + GAP + 28  // two bars + gap + label row
  const LABEL_W = 140
  const BAR_AREA = 360
  const SVG_W   = LABEL_W + BAR_AREA + 80
  const SVG_H   = rows.length * GROUP + 24

  return (
    <svg width="100%" viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ fontFamily: 'Arial, sans-serif', overflow: 'visible' }}>
      {/* Legend */}
      <rect x={LABEL_W} y={2} width={12} height={10} fill="#059669" rx={2} />
      <text x={LABEL_W + 16} y={11} fontSize={10} fill="#374151">Gross Revenue</text>
      <rect x={LABEL_W + 110} y={2} width={12} height={10} fill="#2563EB" rx={2} />
      <text x={LABEL_W + 126} y={11} fontSize={10} fill="#374151">Est. Payroll</text>
      <rect x={LABEL_W + 222} y={2} width={12} height={10} fill="#F59E0B" rx={2} />
      <text x={LABEL_W + 238} y={11} fontSize={10} fill="#374151">Net</text>

      {rows.map((r, i) => {
        const y        = i * GROUP + 22
        const grossW   = (r.gross / maxVal) * BAR_AREA
        const payW     = r.payroll != null ? (r.payroll / maxVal) * BAR_AREA : 0
        const netW     = r.payroll != null ? Math.max((r.net / maxVal) * BAR_AREA, 2) : 0
        const netColor = r.net >= 0 ? '#F59E0B' : '#DC2626'
        const shortName = r.name.split(' ')[0]  // first name only to save space

        return (
          <g key={r.name}>
            {/* Driver name */}
            <text x={LABEL_W - 6} y={y + BAR_H / 2 + 2} textAnchor="end" fontSize={11} fill="#111827" fontWeight="600">{shortName}</text>

            {/* Gross bar */}
            <rect x={LABEL_W} y={y} width={Math.max(grossW, 2)} height={BAR_H} fill="#059669" rx={3} />
            <text x={LABEL_W + grossW + 4} y={y + BAR_H / 2 + 4} fontSize={9} fill="#059669">{fmt(r.gross)}</text>

            {/* Payroll bar */}
            {r.payroll != null && (
              <>
                <rect x={LABEL_W} y={y + BAR_H + GAP} width={Math.max(payW, 2)} height={BAR_H} fill="#2563EB" rx={3} />
                <text x={LABEL_W + payW + 4} y={y + BAR_H + GAP + BAR_H / 2 + 4} fontSize={9} fill="#2563EB">{fmt(r.payroll)}</text>
              </>
            )}
            {r.payroll == null && (
              <text x={LABEL_W + 4} y={y + BAR_H + GAP + BAR_H / 2 + 4} fontSize={9} fill="#9CA3AF">payroll not configured</text>
            )}

            {/* Net bar (below both, small) */}
            {r.payroll != null && (
              <rect x={LABEL_W} y={y + (BAR_H + GAP) * 2 - 4} width={Math.max(netW, 2)} height={4} fill={netColor} rx={2} />
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function WeeklySummaryTab({ company }) {
  const [anchor, setAnchor] = useState(() => getThursdayWeek().start)
  const { start, end } = getThursdayWeek(anchor)

  const { loads, loading }        = useWeeklySummary(start, end, company)
  const { paystubs: weekPaystubs } = useWeekPaystubs(start, end, company)
  const { profiles }               = useDriverProfiles()

  // Map driver name → total grand_total paid this week (a driver could have 2 paystubs)
  const paystubByDriver = useMemo(() => {
    const map = {}
    for (const ps of weekPaystubs) {
      map[ps.driver_name] = (map[ps.driver_name] || 0) + (Number(ps.grand_total) || 0)
    }
    return map
  }, [weekPaystubs])

  // ── Per-driver payroll rows ───────────────────────────────────────────────
  const driverRows = useMemo(() => {
    const map = {}
    for (const load of loads) {
      const name = load.driver_name || '(No Driver)'
      if (!map[name]) map[name] = { name, loads: [], gross: 0, payroll: 0, hasProfile: false, missingPay: false }
      map[name].loads.push(load)
      map[name].gross += Number(load.price) || 0

      const profile = profiles.find(p => p.driver_name === name)
      if (profile) {
        map[name].hasProfile = true
        const pay = estimatePay(load, profile)
        if (pay != null) map[name].payroll += pay
        else map[name].missingPay = true
      }
    }

    return Object.values(map)
      .map(r => ({
        ...r,
        payroll:  r.hasProfile && !r.missingPay ? r.payroll : (r.hasProfile ? r.payroll : null),
        net:      r.hasProfile && !r.missingPay ? r.gross - r.payroll : null,
      }))
      .sort((a, b) => b.gross - a.gross)
  }, [loads, profiles])

  // ── Top-line metrics ──────────────────────────────────────────────────────
  const totalRevenue   = loads.reduce((s, l) => s + (Number(l.price) || 0), 0)
  const billedLoads    = loads.filter(l => l.invoiced_at)
  const billedRevenue  = billedLoads.reduce((s, l) => s + (Number(l.price) || 0), 0)
  const pendingLoads   = loads.filter(l => !l.invoiced_at)
  const pendingRevenue = pendingLoads.reduce((s, l) => s + (Number(l.price) || 0), 0)
  const totalPayroll   = driverRows.reduce((s, r) => s + (r.payroll ?? 0), 0)
  const knownPayroll   = driverRows.some(r => r.payroll != null)

  // ── Top brokers ────────────────────────────────────────────────────────────
  const brokerStats = useMemo(() => {
    const map = {}
    for (const l of loads) {
      const name = l.broker || '(No Broker)'
      if (!map[name]) map[name] = { name, count: 0, revenue: 0 }
      map[name].count++
      map[name].revenue += Number(l.price) || 0
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue)
  }, [loads])

  return (
    <div className="summary-wrap">

      {/* ── Week navigator ── */}
      <div className="summary-week-nav">
        <button className="btn btn-ghost" onClick={() => setAnchor(a => addWeeks(a, -1))}>‹ Prev</button>
        <div className="summary-week-label">
          {formatRange(start, end)}
          <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 8 }}>Thu – Wed</span>
        </div>
        <button className="btn btn-ghost" onClick={() => setAnchor(a => addWeeks(a, 1))}>Next ›</button>
        <button className="btn btn-ghost btn-xs" style={{ marginLeft: 8 }} onClick={() => setAnchor(getThursdayWeek().start)}>
          This Week
        </button>
      </div>

      {loading ? (
        <div style={{ color: '#9CA3AF', padding: '32px 0' }}>Loading…</div>
      ) : (
        <>
          {/* ── Stat cards ── */}
          <div className="summary-stat-cards">
            <div className="summary-card">
              <div className="summary-card-label">Total Loads</div>
              <div className="summary-card-value">{fmtNum(loads.length)}</div>
              <div className="summary-card-sub">
                {billedLoads.length} invoiced · {pendingLoads.length} pending
              </div>
            </div>
            <div className="summary-card green">
              <div className="summary-card-label">Gross Billed</div>
              <div className="summary-card-value">{fmt(totalRevenue)}</div>
              <div className="summary-card-sub">all loads this week</div>
            </div>
            <div className="summary-card" style={{ borderLeft: '4px solid #6366F1' }}>
              <div className="summary-card-label">Invoiced</div>
              <div className="summary-card-value" style={{ color: '#6366F1' }}>{fmt(billedRevenue)}</div>
              <div className="summary-card-sub">{billedLoads.length} load{billedLoads.length !== 1 ? 's' : ''} sent to broker</div>
            </div>
            <div className="summary-card red">
              <div className="summary-card-label">Not Yet Invoiced</div>
              <div className="summary-card-value">{fmt(pendingRevenue)}</div>
              <div className="summary-card-sub">{pendingLoads.length} load{pendingLoads.length !== 1 ? 's' : ''} not billed yet</div>
            </div>
            {knownPayroll && (
              <div className="summary-card blue">
                <div className="summary-card-label">Est. Driver Payroll</div>
                <div className="summary-card-value">{fmt(totalPayroll)}</div>
                <div className="summary-card-sub">based on driver profiles</div>
              </div>
            )}
            {knownPayroll && (
              <div className="summary-card" style={{ borderLeft: '4px solid #F59E0B' }}>
                <div className="summary-card-label">Gross – Payroll</div>
                <div className="summary-card-value" style={{ color: '#F59E0B' }}>{fmt(totalRevenue - totalPayroll)}</div>
                <div className="summary-card-sub">{((totalPayroll / totalRevenue) * 100 || 0).toFixed(0)}% payroll ratio</div>
              </div>
            )}
          </div>

          {/* ── Top Brokers ── */}
          {brokerStats.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div className="summary-section-title">Top Brokers This Week</div>
              <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '16px 20px' }}>
                {brokerStats.slice(0, 5).map((b, i) => {
                  const pct = totalRevenue > 0 ? (b.revenue / totalRevenue * 100) : 0
                  const colors = ['#6366F1','#059669','#2563EB','#D97706','#DC2626']
                  return (
                    <div key={b.name} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: i < Math.min(brokerStats.length, 5) - 1 ? 12 : 0 }}>
                      <div style={{ width: 22, color: '#9CA3AF', fontSize: 11, fontWeight: 700, textAlign: 'right' }}>#{i+1}</div>
                      <div style={{ width: 170, fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#111827' }}>{b.name}</div>
                      <div style={{ flex: 1, height: 8, background: '#F3F4F6', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: colors[i] || '#6B7280', borderRadius: 4 }} />
                      </div>
                      <div style={{ width: 90, textAlign: 'right', fontWeight: 700, color: colors[i] || '#6B7280', fontSize: 13 }}>{fmt(b.revenue)}</div>
                      <div style={{ width: 55, textAlign: 'right', color: '#9CA3AF', fontSize: 11 }}>{b.count} load{b.count !== 1 ? 's' : ''}</div>
                      <div style={{ width: 38, textAlign: 'right', color: '#9CA3AF', fontSize: 11 }}>{pct.toFixed(0)}%</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Payroll by driver ── */}
          {driverRows.length > 0 && (
            <>
              <div className="summary-section-title">Payroll by Driver</div>
              <table className="acct-table" style={{ marginBottom: 8 }}>
                <thead>
                  <tr>
                    <th>Driver</th>
                    <th style={{ textAlign: 'center' }}>Loads</th>
                    <th style={{ textAlign: 'right' }}>Gross Revenue</th>
                    <th style={{ textAlign: 'right' }}>Est. Payroll</th>
                    <th style={{ textAlign: 'right' }}>Actual Payroll</th>
                    <th style={{ textAlign: 'right' }}>Net After Payroll</th>
                    <th style={{ textAlign: 'right' }}>Est. Net</th>
                  </tr>
                </thead>
                <tbody>
                  {driverRows.map(r => {
                    const actual = paystubByDriver[r.name]
                    return (
                      <tr key={r.name}>
                        <td><strong>{r.name}</strong></td>
                        <td style={{ textAlign: 'center' }}>{r.loads.length}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: '#059669' }}>{fmt(r.gross)}</td>
                        <td style={{ textAlign: 'right', color: '#2563EB' }}>
                          {r.payroll != null ? fmt(r.payroll) : <span style={{ color: '#9CA3AF', fontSize: 11 }}>no profile</span>}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: actual != null ? '#7C3AED' : '#9CA3AF' }}>
                          {actual != null ? fmt(actual) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: actual != null ? '#059669' : '#9CA3AF' }}>
                          {actual != null ? fmt(r.gross - actual) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: r.net == null ? '#9CA3AF' : r.net >= 0 ? '#111827' : '#DC2626' }}>
                          {r.net != null ? fmt(r.net) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#F3F4F6' }}>
                    <td colSpan={2}><strong>Total</strong></td>
                    <td style={{ textAlign: 'right', fontWeight: 800 }}>{fmt(totalRevenue)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#2563EB' }}>
                      {knownPayroll ? fmt(totalPayroll) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#7C3AED' }}>
                      {Object.keys(paystubByDriver).length > 0
                        ? fmt(Object.values(paystubByDriver).reduce((s, v) => s + v, 0))
                        : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#059669' }}>
                      {Object.keys(paystubByDriver).length > 0
                        ? fmt(totalRevenue - Object.values(paystubByDriver).reduce((s, v) => s + v, 0))
                        : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#F59E0B' }}>
                      {knownPayroll ? fmt(totalRevenue - totalPayroll) : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
              {!knownPayroll && (
                <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 16 }}>
                  ⚠ Add driver profiles in the Paystubs tab to see estimated payroll.
                </div>
              )}

              {/* ── Bar chart ── */}
              <div className="summary-section-title" style={{ marginTop: 24 }}>Gross vs. Payroll — by Driver</div>
              <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '16px 20px', marginBottom: 24 }}>
                <PayrollChart rows={driverRows} />
              </div>
            </>
          )}

          {/* ── All loads this week ── */}
          <div className="summary-section-title">All Loads This Week</div>
          {loads.length === 0 ? (
            <div style={{ color: '#9CA3AF', padding: '20px 0' }}>No loads found for this week.</div>
          ) : (
            <table className="acct-table">
              <thead>
                <tr>
                  <th>Load #</th>
                  <th>Date</th>
                  <th>Driver</th>
                  <th>Truck</th>
                  <th>Route</th>
                  <th>Broker</th>
                  <th style={{ textAlign: 'right' }}>Revenue</th>
                  <th>Billed</th>
                </tr>
              </thead>
              <tbody>
                {loads.map(l => (
                  <tr key={l.id}>
                    <td>{l.load_number || '—'}</td>
                    <td>{l.pickup_date || l.date || '—'}</td>
                    <td>{l.driver_name || '—'}</td>
                    <td>{l.truck_number || '—'}</td>
                    <td className="acct-route">
                      {l.pickup_location && l.delivery_location
                        ? `${l.pickup_location.split(',')[0]} → ${l.delivery_location.split(',')[0]}`
                        : '—'}
                    </td>
                    <td>{l.broker || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{l.price ? fmt(l.price) : '—'}</td>
                    <td>
                      {l.invoiced_at
                        ? <span style={{ color: '#059669', fontSize: 11, fontWeight: 600 }}>✓ Invoiced</span>
                        : <span style={{ color: '#D97706', fontSize: 11, fontWeight: 600 }}>Pending</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6} style={{ textAlign: 'right', fontWeight: 700 }}>Total</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 14 }}>{fmt(totalRevenue)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </>
      )}
    </div>
  )
}
