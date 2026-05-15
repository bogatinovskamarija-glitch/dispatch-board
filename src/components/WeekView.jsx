import { addDays, format, isSameDay, startOfWeek } from '../lib/dateUtils'

const STATUS_CLASS = {
  covered:   'wdc-covered',
  empty:     'wdc-empty',
  home:      'wdc-home',
  broken:    'wdc-broken',
  no_driver: 'wdc-no_driver',
}

const fmt$ = n => n ? '$' + Number(n).toLocaleString('en-US') : null

export default function WeekView({ loads, loading, weekStart, today, onLoadClick }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  // Gather unique trucks across the week
  const truckMap = new Map()
  for (const l of loads) {
    const key = l.truck_number ?? l.id
    if (!truckMap.has(key)) {
      truckMap.set(key, {
        truck:  l.truck_number,
        type:   l.equipment_type,
        trailer: l.trailer_number,
        driver: l.driver_name,
        company: l.company,
      })
    }
  }

  const caratTrucks     = [...truckMap.entries()].filter(([, v]) => v.company === 'carat')
  const proFreightTrucks = [...truckMap.entries()].filter(([, v]) => v.company === 'pro_freight')

  // Per-day revenue for footer
  const dayRevenue = days.map(day => {
    const dayLoads = loads.filter(l => l.date === format(day))
    return {
      total: dayLoads.reduce((s, l) => s + (Number(l.price) || 0), 0),
      count: dayLoads.filter(l => l.price).length,
    }
  })
  const weekTotal = dayRevenue.reduce((s, d) => s + d.total, 0)

  function loadsForTruckDay(truckNumber, day) {
    return loads.filter(l => l.truck_number === truckNumber && l.date === format(day))
  }

  function renderTruckRows(entries) {
    return entries.map(([key, meta]) => (
      <div className="week-row" key={key}>
        <div className="week-truck-cell">
          <div className="wtc-truck">Truck {meta.truck ?? '—'}</div>
          <div className="wtc-type">{meta.type}{meta.trailer ? ` · ${meta.trailer}` : ''}</div>
          {meta.driver && <div className="wtc-driver">{meta.driver}</div>}
        </div>
        {days.map((day, i) => {
          const isToday = isSameDay(day, today)
          const dayLoads = loadsForTruckDay(meta.truck, day)
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
                  {l.price && <div className="wdc-price">{fmt$(l.price)}</div>}
                </div>
              )) : (
                <span className="wdc-empty-state">—</span>
              )}
            </div>
          )
        })}
      </div>
    ))
  }

  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div className="week-wrap">
      <div className="week-grid">

        {/* HEADER */}
        <div className="week-header">
          <div className="week-header-cell" style={{ textAlign: 'left', background: '#F9FAFB' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              Truck / Driver
            </div>
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
        </div>

        {loading ? (
          <div className="empty-week">Loading week…</div>
        ) : (
          <>
            {caratTrucks.length > 0 && (
              <>
                <div className="week-section-label">Carat Expedited</div>
                {renderTruckRows(caratTrucks)}
              </>
            )}
            {proFreightTrucks.length > 0 && (
              <>
                <div className="week-section-label">Pro Freight Transportation</div>
                {renderTruckRows(proFreightTrucks)}
              </>
            )}
            {loads.length === 0 && (
              <div className="empty-week">No loads this week.</div>
            )}
          </>
        )}

        {/* REVENUE FOOTER */}
        {!loading && loads.length > 0 && (
          <div className="week-revenue-row">
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
          </div>
        )}

      </div>
    </div>
  )
}
