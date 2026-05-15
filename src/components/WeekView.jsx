import React from 'react'
import { addDays, format, isSameDay } from '../lib/dateUtils'

const STATUS_CLASS = {
  covered:   'wdc-covered',
  empty:     'wdc-empty',
  home:      'wdc-home',
  broken:    'wdc-broken',
  no_driver: 'wdc-no_driver',
}

const fmt$ = n => n ? '$' + Number(n).toLocaleString('en-US') : null

export default function WeekView({ loads, loading, weekStart, today, onLoadClick, fleet = [] }) {
  const days     = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  // Build row sources: use fleet if populated, else derive from loads
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

  const dayStr = day => format(day)

  // Revenue counts only on delivery date to avoid double-counting
  const dayRevenue = days.map(day => {
    const d = dayStr(day)
    const dayLoads = loads.filter(l => (l.delivery_date || l.date) === d)
    return {
      total: dayLoads.reduce((s, l) => s + (Number(l.price) || 0), 0),
      count: dayLoads.filter(l => l.price).length,
    }
  })
  const weekTotal = dayRevenue.reduce((s, d) => s + d.total, 0)

  function loadsForTruckDay(truckNumber, day) {
    const d = dayStr(day)
    return loads.filter(l => {
      if (l.truck_number !== truckNumber) return false
      const start = l.pickup_date || l.date
      const end   = l.delivery_date || l.date
      return d >= start && d <= end
    })
  }

  function renderTruckRows(rows) {
    return rows.map(entry => (
      <React.Fragment key={entry.id}>
        <div className="week-truck-cell">
          <div className="wtc-truck">Truck {entry.truck_number ?? '—'}</div>
          <div className="wtc-type">
            {entry.equipment_type}{entry.trailer_number ? ` · ${entry.trailer_number}` : ''}
          </div>
          {entry.driver_name && <div className="wtc-driver">{entry.driver_name}</div>}
        </div>
        {days.map((day, i) => {
          const isToday  = isSameDay(day, today)
          const dayLoads = loadsForTruckDay(entry.truck_number, day)
          return (
            <div key={i} className={`week-day-cell${isToday ? ' today-col' : ''}`}>
              {dayLoads.length > 0 ? dayLoads.map(l => (
                <div
                  key={l.id}
                  className={`wdc-card ${STATUS_CLASS[l.status] ?? ''}`}
                  onClick={() => onLoadClick(l)}
                >
                  <div className="wdc-route">
                    {l.pickup_location && l.delivery_location
                      ? `${l.pickup_location.split(',')[0]} → ${l.delivery_location.split(',')[0]}`
                      : l.pickup_location || l.delivery_location || '—'}
                  </div>
                  {l.broker && <div className="wdc-broker">{l.broker}{l.load_number ? ` · ${l.load_number}` : ''}</div>}
                  {l.price  && <div className="wdc-price">{fmt$(l.price)}</div>}
                </div>
              )) : (
                <span className="wdc-empty-state">—</span>
              )}
            </div>
          )
        })}
      </React.Fragment>
    ))
  }

  const hasRows = caratRows.length > 0 || proRows.length > 0

  return (
    <div className="week-wrap">
      <div className="week-grid">

        {/* Header row — 8 direct grid children */}
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

        {/* Body */}
        {loading ? (
          <div className="empty-week">Loading week…</div>
        ) : (
          <>
            {caratRows.length > 0 && (
              <>
                <div className="week-section-label">Carat Expedited</div>
                {renderTruckRows(caratRows)}
              </>
            )}
            {proRows.length > 0 && (
              <>
                <div className="week-section-label">Pro Freight Transportation</div>
                {renderTruckRows(proRows)}
              </>
            )}
            {!hasRows && (
              <div className="empty-week">No loads this week.</div>
            )}
          </>
        )}

        {/* Revenue footer — 8 direct grid children */}
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
