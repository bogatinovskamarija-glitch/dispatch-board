import { useState, useMemo, useEffect } from 'react'
import { useWeeklySummary, useWeekPaystubs, getThursdayWeek } from '../../hooks/useWeeklySummary'
import { useDriverProfiles } from '../../hooks/useDriverProfiles'
import { useLedgerEntries, EXPENSE_CONFIG } from '../../hooks/useLedger'
import { useWeekMaintenanceTotal, useWeekMaintenanceByUnit } from '../../hooks/useMaintenance'
import { supabase } from '../../lib/supabase'

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
    const pct = (Number(profile.commission_pct) || 15) / 100
    return (Number(load.price) || 0) * (1 - pct)
  }
  if (profile.pay_type === 'per_mile' && profile.pay_rate && load.total_miles) {
    return Number(load.total_miles) * Number(profile.pay_rate)
  }
  return null
}

// ── Net Revenue bar chart (one bar per driver) ─────────────────────────────
function NetChart({ rows, paystubByDriver }) {
  const data = rows.map(r => {
    const actual = paystubByDriver[r.name]
    let net, payNote
    if (r.isOO) {
      net = r.payroll != null ? r.gross - r.payroll : null
      payNote = 'OO commission'
    } else {
      const pay = actual ?? r.payroll
      if (pay != null) {
        net = r.gross - pay - r.fuel - r.maintenance
        payNote = actual != null ? 'actual payroll' : 'est. payroll'
      } else {
        net = null
      }
    }
    return { name: r.name.split(' ')[0], fullName: r.name, net, payNote, isOO: r.isOO }
  }).filter(r => r.net != null)

  if (!data.length) return (
    <div style={{ color: '#9CA3AF', fontSize: 13, padding: '16px 0' }}>
      Add driver profiles in the Paystubs tab to see net revenue.
    </div>
  )

  const maxAbs = Math.max(...data.map(r => Math.abs(r.net)), 1)
  const BAR_H  = 30
  const GAP    = 12
  const LABEL_W = 130
  const BAR_AREA = 380
  const SVG_W   = LABEL_W + BAR_AREA + 110
  const SVG_H   = data.length * (BAR_H + GAP) + 16

  return (
    <svg width="100%" viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ fontFamily: 'Arial, sans-serif', overflow: 'visible' }}>
      {data.map((r, i) => {
        const y      = i * (BAR_H + GAP) + 8
        const barW   = Math.max((Math.abs(r.net) / maxAbs) * BAR_AREA, 3)
        const pos    = r.net >= 0
        const color  = pos ? '#059669' : '#DC2626'
        const bgColor = pos ? '#ECFDF5' : '#FEF2F2'

        return (
          <g key={r.fullName}>
            {/* Background strip */}
            <rect x={LABEL_W} y={y} width={BAR_AREA} height={BAR_H} fill={bgColor} rx={4} />

            {/* Driver name */}
            <text x={LABEL_W - 8} y={y + BAR_H / 2} textAnchor="end" fontSize={12} fill="#111827" fontWeight="700" dominantBaseline="middle">
              {r.name}
            </text>
            <text x={LABEL_W - 8} y={y + BAR_H / 2 + 14} textAnchor="end" fontSize={9} fill="#9CA3AF">
              {r.isOO ? 'Owner Op.' : 'Company'}
            </text>

            {/* Net bar */}
            <rect x={LABEL_W} y={y + 4} width={barW} height={BAR_H - 8} fill={color} rx={3} opacity={0.9} />

            {/* Value label */}
            <text x={LABEL_W + barW + 6} y={y + BAR_H / 2} fontSize={11} fill={color} fontWeight="700" dominantBaseline="middle">
              {fmt(r.net)}
            </text>
            <text x={LABEL_W + barW + 6} y={y + BAR_H / 2 + 13} fontSize={8.5} fill="#9CA3AF">
              {r.payNote}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function WeeklySummaryTab({ company }) {
  const [anchor,          setAnchor]          = useState(() => getThursdayWeek().start)
  const [expandedDriver,  setExpandedDriver]  = useState(null)
  const { start, end } = getThursdayWeek(anchor)

  const { loads, loading }        = useWeeklySummary(start, end, company)
  const { paystubs: weekPaystubs } = useWeekPaystubs(start, end, company)
  const { profiles }               = useDriverProfiles()
  const { entries: ledgerEntries } = useLedgerEntries(start, end, company)
  const maintenanceTotal           = useWeekMaintenanceTotal(start, end, company)
  const maintenanceByUnit          = useWeekMaintenanceByUnit(start, end, company)

  // Fuel policy amount per driver for the week (from fuel_transactions)
  const [fuelByDriver, setFuelByDriver] = useState({})
  useEffect(() => {
    if (!start || !end) return
    let q = supabase
      .from('fuel_transactions')
      .select('driver_name, amount')
      .gte('transaction_date', start)
      .lte('transaction_date', end)
    if (company && company !== 'all') q = q.eq('company', company)
    q.then(({ data }) => {
      const map = {}
      for (const t of (data ?? [])) {
        const name = (t.driver_name || '').trim()
        if (!name) continue
        map[name.toLowerCase()] = (map[name.toLowerCase()] || 0) + (Number(t.amount) || 0)
      }
      setFuelByDriver(map)
    })
  }, [start, end, company])

  // Map driver name → total grand_total paid this week
  const paystubByDriver = useMemo(() => {
    const map = {}
    for (const ps of weekPaystubs) {
      map[ps.driver_name] = (map[ps.driver_name] || 0) + (Number(ps.grand_total) || 0)
    }
    return map
  }, [weekPaystubs])

  // ── Per-driver ledger expenses ────────────────────────────────────────────
  const driverExpenses = useMemo(() => {
    const map = {}
    for (const e of ledgerEntries) {
      const cfg = EXPENSE_CONFIG[e.type]
      if (!cfg?.deduction) continue
      map[e.driver_name] = (map[e.driver_name] || 0) + Number(e.amount)
    }
    return map
  }, [ledgerEntries])

  // ── Per-driver payroll rows ───────────────────────────────────────────────
  const driverRows = useMemo(() => {
    const map = {}
    for (const load of loads) {
      const name = load.driver_name || '(No Driver)'
      if (!map[name]) map[name] = { name, loads: [], gross: 0, payroll: 0, miles: 0, hasProfile: false, missingPay: false, trucks: new Set(), trailers: new Set() }
      map[name].loads.push(load)
      map[name].gross += Number(load.price) || 0
      map[name].miles += Number(load.total_miles) || 0
      if (load.truck_number)   map[name].trucks.add(load.truck_number)
      if (load.trailer_number) map[name].trailers.add(load.trailer_number)

      const profile = profiles.find(p => p.driver_name === name)
      if (profile) {
        map[name].hasProfile = true
        map[name].isOO = profile.profile_type === 'owner_operator'
        const pay = estimatePay(load, profile)
        if (pay != null) map[name].payroll += pay
        else map[name].missingPay = true
      }
    }

    return Object.values(map)
      .map(r => {
        const maintenance =
          [...r.trucks].reduce((s, u) => s + (maintenanceByUnit[u] || 0), 0) +
          [...r.trailers].reduce((s, u) => s + (maintenanceByUnit[u] || 0), 0)
        return {
          ...r,
          trucks: undefined,
          trailers: undefined,
          isOO:        r.isOO || false,
          payroll:     r.hasProfile && !r.missingPay ? r.payroll : (r.hasProfile ? r.payroll : null),
          net:         r.hasProfile && !r.missingPay ? r.gross - r.payroll : null,
          expenses:    driverExpenses[r.name] || 0,
          fuel:        fuelByDriver[r.name.toLowerCase()] || 0,
          maintenance,
        }
      })
      .sort((a, b) => b.gross - a.gross)
  }, [loads, profiles, driverExpenses, fuelByDriver, maintenanceByUnit])

  // ── Top-line metrics ──────────────────────────────────────────────────────
  const totalRevenue   = loads.reduce((s, l) => s + (Number(l.price) || 0), 0)
  const billedLoads    = loads.filter(l => l.invoiced_at)
  const billedRevenue  = billedLoads.reduce((s, l) => s + (Number(l.price) || 0), 0)
  const pendingLoads   = loads.filter(l => !l.invoiced_at)
  const pendingRevenue = pendingLoads.reduce((s, l) => s + (Number(l.price) || 0), 0)
  const totalPayroll   = driverRows.reduce((s, r) => s + (r.payroll ?? 0), 0)
  const totalExpenses  = driverRows.reduce((s, r) => s + r.expenses, 0)
  const totalMiles     = driverRows.reduce((s, r) => s + r.miles, 0)
  const knownPayroll   = driverRows.some(r => r.payroll != null)
  const totalDriverMaint = driverRows.reduce((s, r) => s + r.maintenance, 0)

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
            {totalMiles > 0 && (
              <div className="summary-card" style={{ borderLeft: '4px solid #8B5CF6' }}>
                <div className="summary-card-label">Total Miles</div>
                <div className="summary-card-value" style={{ color: '#8B5CF6' }}>{fmtNum(totalMiles)}</div>
                <div className="summary-card-sub">across all loads this week</div>
              </div>
            )}
            {totalExpenses > 0 && (
              <div className="summary-card" style={{ borderLeft: '4px solid #DC2626' }}>
                <div className="summary-card-label">Driver Expenses</div>
                <div className="summary-card-value" style={{ color: '#DC2626' }}>{fmt(totalExpenses)}</div>
                <div className="summary-card-sub">from weekly ledger</div>
              </div>
            )}
            <div className="summary-card" style={{ borderLeft: '4px solid #9CA3AF' }}>
              <div className="summary-card-label">Maintenance</div>
              <div className="summary-card-value" style={{ color: maintenanceTotal > 0 ? '#6B7280' : '#D1D5DB' }}>
                {fmt(maintenanceTotal)}
              </div>
              <div className="summary-card-sub">{maintenanceTotal > 0 ? 'repair & service spend' : 'no records this week'}</div>
            </div>
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
                    <th style={{ textAlign: 'right' }}>Miles</th>
                    <th style={{ textAlign: 'right' }}>Gross Revenue</th>
                    <th style={{ textAlign: 'right' }}>Est. Payroll</th>
                    <th style={{ textAlign: 'right' }}>Expenses</th>
                    <th style={{ textAlign: 'right' }}>Actual Payroll</th>
                    <th style={{ textAlign: 'right' }}>Net After Payroll</th>
                    <th style={{ textAlign: 'right' }}>Fuel Cost</th>
                    <th style={{ textAlign: 'right' }}>Maintenance</th>
                  </tr>
                </thead>
                <tbody>
                  {driverRows.map(r => {
                    const actual = paystubByDriver[r.name]
                    return (
                      <>
                      <tr key={r.name}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setExpandedDriver(prev => prev === r.name ? null : r.name)}
                      >
                        <td>
                          <strong>{r.name}</strong>
                          {r.isOO && <span style={{ marginLeft: 5, fontSize: 10, color: '#7C3AED', background: '#EDE9FE', borderRadius: 4, padding: '1px 5px', fontWeight: 600 }}>OO</span>}
                          <span style={{ marginLeft: 6, fontSize: 11, color: '#9CA3AF' }}>
                            {expandedDriver === r.name ? '▾' : '▸'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>{r.loads.length}</td>
                        <td style={{ textAlign: 'right', color: '#8B5CF6', fontWeight: 600 }}>{r.miles > 0 ? fmtNum(r.miles) : '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: '#059669' }}>{fmt(r.gross)}</td>
                        <td style={{ textAlign: 'right', color: '#2563EB' }}>
                          {r.payroll != null ? fmt(r.payroll) : <span style={{ color: '#9CA3AF', fontSize: 11 }}>no profile</span>}
                        </td>
                        <td style={{ textAlign: 'right', color: r.expenses > 0 ? '#DC2626' : '#9CA3AF', fontWeight: r.expenses > 0 ? 600 : 400 }}>
                          {r.expenses > 0 ? fmt(r.expenses) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: actual != null ? '#7C3AED' : '#9CA3AF' }}>
                          {actual != null ? fmt(actual) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: actual != null ? '#059669' : '#9CA3AF' }}>
                          {actual != null ? fmt(r.gross - actual) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: r.fuel > 0 ? '#DC2626' : '#9CA3AF' }}>
                          {r.fuel > 0 ? fmt(r.fuel) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: r.maintenance > 0 ? '#92400E' : '#9CA3AF' }}>
                          {r.maintenance > 0 ? fmt(r.maintenance) : '—'}
                        </td>
                      </tr>
                      {expandedDriver === r.name && (
                        <tr key={r.name + '_loads'}>
                          <td colSpan={10} style={{ padding: 0, background: '#F9FAFB' }}>
                            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ background: '#F3F4F6' }}>
                                  <th style={{ padding: '4px 12px', textAlign: 'left', color: '#6B7280' }}>Load #</th>
                                  <th style={{ padding: '4px 8px', color: '#6B7280' }}>Status</th>
                                  <th style={{ padding: '4px 8px', color: '#6B7280' }}>Pickup Date</th>
                                  <th style={{ padding: '4px 8px', color: '#6B7280' }}>Dispatch Date</th>
                                  <th style={{ padding: '4px 8px', color: '#6B7280' }}>Route</th>
                                  <th style={{ padding: '4px 8px', textAlign: 'right', color: '#6B7280' }}>Miles</th>
                                  <th style={{ padding: '4px 8px', textAlign: 'right', color: '#6B7280' }}>Revenue</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.loads.map(l => (
                                  <tr key={l.id} style={{ borderTop: '1px solid #E5E7EB', background: !l.pickup_date ? '#FFFBEB' : undefined }}>
                                    <td style={{ padding: '4px 12px', fontWeight: 600 }}>{l.load_number || '—'}</td>
                                    <td style={{ padding: '4px 8px' }}>
                                      <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: '#E5E7EB', color: '#374151' }}>{l.status}</span>
                                    </td>
                                    <td style={{ padding: '4px 8px', color: l.pickup_date ? '#111827' : '#DC2626', fontWeight: l.pickup_date ? 400 : 600 }}>
                                      {l.pickup_date || '⚠ no pickup date'}
                                    </td>
                                    <td style={{ padding: '4px 8px', color: '#9CA3AF' }}>{l.date || '—'}</td>
                                    <td style={{ padding: '4px 8px', color: '#374151' }}>
                                      {l.pickup_location && l.delivery_location
                                        ? `${l.pickup_location.split(',')[0]} → ${l.delivery_location.split(',')[0]}`
                                        : '—'}
                                    </td>
                                    <td style={{ padding: '4px 8px', textAlign: 'right', color: '#8B5CF6' }}>{l.total_miles || '—'}</td>
                                    <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600, color: '#059669' }}>{l.price ? fmt(l.price) : '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                      </>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#F3F4F6' }}>
                    <td colSpan={2}><strong>Total</strong></td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#8B5CF6' }}>{totalMiles > 0 ? fmtNum(totalMiles) : '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800 }}>{fmt(totalRevenue)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#2563EB' }}>
                      {knownPayroll ? fmt(totalPayroll) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#DC2626' }}>{totalExpenses > 0 ? fmt(totalExpenses) : '—'}</td>
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
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#DC2626' }}>
                      {driverRows.some(r => r.fuel > 0) ? fmt(driverRows.reduce((s,r) => s + r.fuel, 0)) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#92400E' }}>
                      {totalDriverMaint > 0 ? fmt(totalDriverMaint) : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
              {!knownPayroll && (
                <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 16 }}>
                  ⚠ Add driver profiles in the Paystubs tab to see estimated payroll.
                </div>
              )}
              <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 16 }}>
                🔧 Maintenance this week: <strong>{fmt(maintenanceTotal)}</strong>
                {maintenanceTotal === 0 && <span style={{ color: '#9CA3AF', fontWeight: 400 }}> — no records entered yet</span>}
              </div>

              {/* ── Net Revenue chart ── */}
              <div className="summary-section-title" style={{ marginTop: 24 }}>Net Revenue by Driver</div>
              <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '16px 20px', marginBottom: 24 }}>
                <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 12 }}>
                  Company drivers: Gross − Payroll − Fuel − Maintenance &nbsp;·&nbsp; Owner Operators: Gross − Commission
                </div>
                <NetChart rows={driverRows} paystubByDriver={paystubByDriver} />
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
                  <th>Status</th>
                  <th>Pickup Date</th>
                  <th>Dispatch Date</th>
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
                  <tr key={l.id} style={{ background: !l.pickup_date ? '#FFFBEB' : undefined }}>
                    <td>{l.load_number || '—'}</td>
                    <td>
                      <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 6, background: '#F3F4F6', color: '#374151', fontWeight: 600 }}>
                        {l.status}
                      </span>
                    </td>
                    <td style={{ color: l.pickup_date ? '#111827' : '#DC2626', fontWeight: l.pickup_date ? 400 : 700 }}>
                      {l.pickup_date || '⚠ missing'}
                    </td>
                    <td style={{ color: '#9CA3AF', fontSize: 12 }}>{l.date || '—'}</td>
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
