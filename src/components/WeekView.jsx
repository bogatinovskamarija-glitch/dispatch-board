import React from 'react'
import { addDays, format, isSameDay } from '../lib/dateUtils'

// ── Status colours ─────────────────────────────────────────────
const STATUS_COLORS = {
  covered:     { bg: '#DCFCE7', border: '#16A34A', text: '#15803D' },
  empty:       { bg: '#FEF9C3', border: '#CA8A04', text: '#92400E' },
  at_home:     { bg: '#FCE7F3', border: '#DB2777', text: '#9D174D' },
  broken_down: { bg: '#FEE2E2', border: '#DC2626', text: '#991B1B' },
  no_driver:   { bg: '#F3F4F6', border: '#9CA3AF', text: '#6B7280' },
  prebooked:   { bg: '#EEF2FF', border: '#4F46E5', text: '#4338CA' },
  at_pickup:   { bg: '#E0F2FE', border: '#0284C7', text: '#075985' },
  at_delivery: { bg: '#FFF7ED', border: '#EA580C', text: '#9A3412' },
  tonu:        { bg: '#F1F5F9', border: '#475569', text: '#1E293B' },
}

const fmt$ = n => n ? '$' + Number(n).toLocaleString('en-US') : null
const dpm  = (price, miles) => price && miles ? '$' + (price / miles).toFixed(2) + '/mi' : null

// ── Date helpers (string-based, no timezone drift) ─────────────
function addDaysToStr(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + n)
  return format(dt)
}

function daysBetweenStr(a, b) {
  // a and b are 'YYYY-MM-DD' strings; returns b - a in whole days
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((new Date(by, bm - 1, bd) - new Date(ay, am - 1, ad)) / 86400000)
}

// ── Chain builder ──────────────────────────────────────────────
// Uses a 14-column internal grid (2 half-columns per day) so that
// same-day handoffs (Load A delivers Tue, Load B picks up Tue) split
// Tuesday into a delivery-morning half and a pickup-afternoon half
// with no overlap and no lost days.
//
// Returns segments:
//   { type: 'load', load, startCol, endCol }  — colums 1-14
//   { type: 'gap',        startCol, endCol }
function buildChain(truckLoads, weekStartStr, weekEndStr) {
  function clamp(s)     { return s < weekStartStr ? weekStartStr : s > weekEndStr ? weekEndStr : s }
  function dayIdx(s)    { return daysBetweenStr(weekStartStr, clamp(s)) + 1 }  // 1-7
  function leftCol(s)   { return 2 * dayIdx(s) - 1 }   // morning half  (1,3,5,…13)
  function rightCol(s)  { return 2 * dayIdx(s) }        // afternoon half (2,4,6,…14)
  function nextDay(s)   { return addDaysToStr(s, 1) }

  const sorted = truckLoads
    .filter(l => {
      const s = l.pickup_date  || l.date
      const e = l.delivery_date || l.date
      return s <= weekEndStr && e >= weekStartStr
    })
    .sort((a, b) => {
      const as = a.pickup_date || a.date
      const bs = b.pickup_date || b.date
      return as < bs ? -1 : as > bs ? 1 : 0
    })

  if (sorted.length === 0) {
    return [{ type: 'gap', startCol: 1, endCol: 14 }]
  }

  const segments = []
  let pointerCol = 1   // current position in 1-14 half-column space

  for (let i = 0; i < sorted.length; i++) {
    if (pointerCol > 14) break

    const load     = sorted[i]
    const effStart = clamp(load.pickup_date  || load.date)
    const effEnd   = clamp(load.delivery_date || load.date)
    if (leftCol(effStart) > 14) break

    // Same-day handoff: next load picks up on the same day this one delivers
    const nextLoad      = sorted[i + 1]
    const nextEffStart  = nextLoad ? clamp(nextLoad.pickup_date || nextLoad.date) : null
    const sameDayOff    = !!nextEffStart && nextEffStart === effEnd

    // Where this block starts and ends (in half-columns)
    const loadStartCol = Math.max(leftCol(effStart), pointerCol)
    const loadEndCol   = sameDayOff ? leftCol(effEnd) : rightCol(effEnd)

    // Gap before this load
    if (pointerCol < loadStartCol) {
      segments.push({ type: 'gap', startCol: pointerCol, endCol: loadStartCol - 1 })
    }

    // Load block
    if (loadStartCol <= loadEndCol) {
      segments.push({ type: 'load', load, startCol: loadStartCol, endCol: loadEndCol })
    }

    // Advance pointer
    if (sameDayOff) {
      pointerCol = rightCol(effEnd)         // next load picks up the afternoon half
    } else if (effEnd >= weekEndStr) {
      pointerCol = 15                        // past week end — no trailing gap needed
    } else {
      pointerCol = leftCol(nextDay(effEnd)) // normal: start of the next day
    }
  }

  // Trailing gap
  if (pointerCol <= 14) {
    segments.push({ type: 'gap', startCol: pointerCol, endCol: 14 })
  }

  return segments
}

// ── Main component ─────────────────────────────────────────────
export default function WeekView({ loads, loading, weekStart, today, onLoadClick, fleet = [], statusFilter = [] }) {
  const days        = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const DAY_NAMES   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const weekStartStr = format(weekStart)
  const weekEndStr   = format(addDays(weekStart, 6))

  // ── Build truck rows ──
  let caratRows, proRows
  if (fleet.length > 0) {
    caratRows = fleet.filter(e => e.company === 'carat')
    proRows   = fleet.filter(e => e.company === 'pro_freight')
  } else {
    const truckMap = new Map()
    for (const l of loads) {
      const key = l.truck_number ?? l.id
      if (!truckMap.has(key)) {
        truckMap.set(key, {
          id: key,
          truck_number:   l.truck_number,
          equipment_type: l.equipment_type,
          trailer_number: l.trailer_number,
          driver_name:    l.driver_name,
          company:        l.company,
        })
      }
    }
    caratRows = [...truckMap.values()].filter(v => v.company === 'carat')
    proRows   = [...truckMap.values()].filter(v => v.company === 'pro_freight')
  }

  // ── Revenue footer ──
  const dayRevenue = days.map(day => {
    const d = format(day)
    const dayLoads = loads.filter(l => (l.delivery_date || l.date) === d)
    return {
      total: dayLoads.reduce((s, l) => s + (Number(l.price) || 0), 0),
      count: dayLoads.filter(l => l.price).length,
    }
  })
  const weekTotal = dayRevenue.reduce((s, d) => s + d.total, 0)

  // ── Status filter ──
  function truckHasMatch(truckNumber) {
    if (statusFilter.length === 0) return true
    return loads.some(l => l.truck_number === truckNumber && statusFilter.includes(l.status))
  }
  if (statusFilter.length > 0) {
    caratRows = caratRows.filter(e => truckHasMatch(e.truck_number))
    proRows   = proRows.filter(e => truckHasMatch(e.truck_number))
  }

  function loadsForTruck(truckNumber) {
    return loads.filter(l => {
      if (l.truck_number !== truckNumber) return false
      if (statusFilter.length > 0 && !statusFilter.includes(l.status)) return false
      return true
    })
  }

  // ── Render one gantt row ──
  function renderGanttRow(entry) {
    const truckLoads = loadsForTruck(entry.truck_number)
    const chain      = buildChain(truckLoads, weekStartStr, weekEndStr)

    return (
      <React.Fragment key={entry.id}>
        {/* Label cell */}
        <div className="week-truck-cell">
          <div className="wtc-truck">Truck {entry.truck_number ?? '—'}</div>
          <div className="wtc-type">
            {entry.equipment_type}{entry.trailer_number ? ` · ${entry.trailer_number}` : ''}
          </div>
          {entry.driver_name && <div className="wtc-driver">{entry.driver_name}</div>}
        </div>

        {/* Timeline cell — spans all 7 day columns */}
        <div className="gantt-timeline">
          {chain.map((seg, si) => {
            if (seg.type === 'gap') {
              return (
                <div
                  key={si}
                  className="gantt-gap"
                  style={{ gridColumn: `${seg.startCol} / ${seg.endCol + 1}` }}
                />
              )
            }

            const l      = seg.load
            const colors   = STATUS_COLORS[l.status] ?? STATUS_COLORS.no_driver
            const route    = l.pickup_location && l.delivery_location
              ? `${l.pickup_location.split(',')[0]} → ${l.delivery_location.split(',')[0]}`
              : l.pickup_location || l.delivery_location || '—'
            // half-cols: 2 = 1 full day, 4 = 2 full days, etc.
            const halfCols = seg.endCol - seg.startCol + 1

            return (
              <div
                key={si}
                className="gantt-block"
                style={{
                  gridColumn: `${seg.startCol} / ${seg.endCol + 1}`,
                  background:  colors.bg,
                  borderLeft:  `3px solid ${colors.border}`,
                }}
                onClick={() => onLoadClick(l)}
                title={`${l.status ?? ''}  ${route}`}
              >
                <div className="gantt-route" style={{ color: colors.text }}>{route}</div>
                {halfCols >= 3 && (l.broker || l.load_number) && (
                  <div className="gantt-meta">
                    {[l.broker, l.load_number].filter(Boolean).join(' · ')}
                  </div>
                )}
                {(l.price || dpm(l.price, l.total_miles)) && (
                  <div className="gantt-bottom">
                    {l.price && <span className="gantt-price">{fmt$(l.price)}</span>}
                    {dpm(l.price, l.total_miles) && <span className="gantt-dpm">{dpm(l.price, l.total_miles)}</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </React.Fragment>
    )
  }

  const hasRows = caratRows.length > 0 || proRows.length > 0

  return (
    <div className="week-wrap">
      <div className="week-grid">

        {/* ── Header ── */}
        <div className="week-header-label">
          <span style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Truck / Driver
          </span>
        </div>
        {days.map((day, i) => {
          const isToday = isSameDay(day, today)
          return (
            <div key={i} className={`week-header-cell${isToday ? ' today-header' : ''}`}>
              <div>{DAY_NAMES[i]}</div>
              <div className="wh-num">{day.getDate()}</div>
            </div>
          )
        })}

        {/* ── Body ── */}
        {loading ? (
          <div className="empty-week">Loading week…</div>
        ) : (
          <>
            {caratRows.length > 0 && (
              <>
                <div className="week-section-label">Carat Expedited</div>
                {caratRows.map(e => renderGanttRow(e))}
              </>
            )}
            {proRows.length > 0 && (
              <>
                <div className="week-section-label">Pro Freight Transportation</div>
                {proRows.map(e => renderGanttRow(e))}
              </>
            )}
            {!hasRows && (
              <div className="empty-week">No loads this week.</div>
            )}
          </>
        )}

        {/* ── Revenue footer ── */}
        {!loading && hasRows && (
          <>
            <div className="wrf-label">
              <div>Week Total</div>
              <div className="wrf-total">{fmt$(weekTotal)}</div>
            </div>
            {dayRevenue.map((dr, i) => {
              const isToday = isSameDay(days[i], today)
              return (
                <div key={i} className={`wrf-day${isToday ? ' today-col' : ''}`}>
                  <div className="wrf-amount">{dr.total > 0 ? fmt$(dr.total) : <span style={{ color: '#9CA3AF' }}>—</span>}</div>
                  <div className="wrf-count">{dr.count > 0 ? `${dr.count} load${dr.count > 1 ? 's' : ''}` : 'no loads'}</div>
                </div>
              )
            })}
          </>
        )}

      </div>
    </div>
  )
}
