import { Fragment, useState } from 'react'
import StatusBadge from './StatusBadge'
import SelectCell from './SelectCell'
import { useDriverNotes } from '../hooks/useDriverNotes'
import DriverAlertModal from './DriverAlertModal'

const fmt = n => n ? '$' + Number(n).toLocaleString('en-US') : '—'
const dpm = (price, miles) =>
  price && miles ? '$' + (price / miles).toFixed(2) + '/mi' : null

const STATUS_ROUTE_BG = {
  covered:      { bg: '#F0FDF4', border: '#86EFAC' },  // green
  empty:        { bg: '#FEFCE8', border: '#FDE047' },  // yellow
  at_home:      { bg: '#FDF2F8', border: '#F9A8D4' },  // pink
  broken_down:  { bg: '#FEF2F2', border: '#FCA5A5' },  // red
  no_driver:    { bg: '#F9FAFB', border: '#D1D5DB' },  // grey
  prebooked:    { bg: '#EEF2FF', border: '#A5B4FC' },  // indigo
  at_pickup:    { bg: '#F0F9FF', border: '#7DD3FC' },  // sky
  at_delivery:  { bg: '#FFF7ED', border: '#FDBA74' },  // orange
}

export default function DayView({ loads, loading, trucks, trailers, drivers, fleet = [], statusFilter, onEdit, onDelete, onDirectSave, onDriverClick, onTruckClick, onTrailerClick }) {
  // Tracks which multi-load truck groups are manually COLLAPSED.
  // Empty set = all groups open by default so dispatch sees everything on load.
  const [collapsed,   setCollapsed]   = useState(new Set())
  const [alertDriver, setAlertDriver] = useState(null)  // { name, clickupId, company } | null

  const { getNote, saveNote, clearNote } = useDriverNotes()

  function toggleExpand(key) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function formatExpiry(expiresAt) {
    const today = new Date().toISOString().split('T')[0]
    if (expiresAt === today) return 'expires today'
    const d = new Date(expiresAt + 'T00:00:00')
    return 'exp ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  function AlertBadge({ name, clickupId, company }) {
    const dn = getNote(name)
    return (
      <button
        onClick={e => { e.stopPropagation(); setAlertDriver({ name, clickupId, company }) }}
        style={{
          display: 'block', width: '100%', marginTop: 3, textAlign: 'left',
          cursor: 'pointer',
          background: dn ? '#FEF2F2' : 'transparent',
          border: dn ? '1px solid #FECACA' : '1px dashed #FCA5A5',
          borderRadius: 4, padding: '2px 6px',
          fontSize: 10, color: dn ? '#B91C1C' : '#FCA5A5', lineHeight: 1.4,
        }}
        title={dn ? 'Edit safety alert' : 'Add safety alert'}
      >
        {dn ? (
          <>
            <span>⚠ {dn.note.length > 38 ? dn.note.slice(0, 38) + '…' : dn.note}</span>
            {dn.expires_at && <div style={{ fontSize: 9, marginTop: 1 }}>{formatExpiry(dn.expires_at)}</div>}
          </>
        ) : (
          <span>+ alert</span>
        )}
      </button>
    )
  }

  const truckOpts = trucks.map(e => ({
    value: e.truckNumber,
    label: e.truckNumber,
    sub: `${e.type} · ${e.company === 'carat' ? 'Carat' : 'Pro Freight'}`,
  }))

  const trailerOpts = trailers.map(e => ({
    value: e.trailerNumber,
    label: e.trailerNumber,
    sub: e.type,
  }))

  const driverOpts = drivers.map(d => ({
    value: d.id,
    label: d.name,
    sub: d.company,
  }))

  // Merge fleet entries with today's loads
  function buildRows(fleetEntries, loadsList) {
    const result        = []
    const coveredTrucks = new Set()
    for (const entry of fleetEntries) {
      const truckLoads = loadsList.filter(l => l.truck_number === entry.truck_number)
      if (truckLoads.length > 0) {
        truckLoads.forEach(l => result.push(l))
      } else {
        result.push({
          _ghost:            true,
          _fleetId:          entry.id,
          company:           entry.company,
          truck_number:      entry.truck_number,
          trailer_number:    entry.trailer_number,
          equipment_type:    entry.equipment_type,
          driver_name:       entry.driver_name,
          driver_clickup_id: entry.driver_clickup_id,
          phone:             entry.phone,
        })
      }
      coveredTrucks.add(entry.truck_number)
    }
    loadsList.filter(l => !coveredTrucks.has(l.truck_number)).forEach(l => result.push(l))
    return result
  }

  // Group rows by truck so multiple loads for the same truck appear in one slot
  function groupByTruck(rows) {
    const groups = []
    const seen   = new Map()
    for (const row of rows) {
      const key = row._ghost
        ? `ghost_${row._fleetId}`
        : (row.truck_number || `notruck_${row.id}`)
      if (!seen.has(key)) {
        seen.set(key, groups.length)
        groups.push([row])
      } else {
        groups[seen.get(key)].push(row)
      }
    }
    // Sort by pickup_date ascending so the soonest load is always first
    const key = r => r.pickup_date || r.date || ''
    return groups.map(g => g.slice().sort((a, b) => key(a) <= key(b) ? -1 : 1))
  }

  const caratLoads = loads.filter(l => l.company === 'carat')
  const proLoads   = loads.filter(l => l.company === 'pro_freight')

  let carat, proFreight
  if (fleet.length > 0) {
    carat      = buildRows(fleet.filter(e => e.company === 'carat'),       caratLoads)
    proFreight = buildRows(fleet.filter(e => e.company === 'pro_freight'), proLoads)
  } else {
    carat      = caratLoads
    proFreight = proLoads
  }

  // Apply status filter — ghost rows have no status so hide them when filtering
  if (statusFilter.length > 0) {
    carat      = carat.filter(r => statusFilter.includes(r.status))
    proFreight = proFreight.filter(r => statusFilter.includes(r.status))
  }

  const caratGroups      = groupByTruck(carat)
  const proFreightGroups = groupByTruck(proFreight)

  // Prefill for chain / ghost add — equipment + driver, no id
  function chainPrefill(load) {
    return {
      company:           load.company,
      truck_number:      load.truck_number,
      trailer_number:    load.trailer_number,
      equipment_type:    load.equipment_type,
      driver_name:       load.driver_name,
      driver_clickup_id: load.driver_clickup_id,
      phone:             load.phone,
    }
  }

  function renderGhostRow(entry) {
    return (
      <tr key={entry._fleetId} className="row-fleet-ghost">
        <td>
          <span className="fleet-ghost-badge">No load</span>
        </td>

        <td>
          <div className="equip-cell">
            <span style={{ fontSize: 12, fontWeight: 500 }}>{entry.truck_number || '—'}</span>
            {entry.truck_number && (
              <button
                className="equip-info-btn"
                title="Truck info"
                onClick={() => { const t = trucks.find(t => t.truckNumber === entry.truck_number); if (t) onTruckClick(t) }}
              >ⓘ</button>
            )}
          </div>
        </td>

        <td>
          <div className="equip-cell">
            <span style={{ fontSize: 12, fontWeight: 500 }}>{entry.trailer_number || '—'}</span>
            {entry.trailer_number && (
              <button
                className="equip-info-btn"
                title="Trailer info"
                onClick={() => { const t = trailers.find(t => t.trailerNumber === entry.trailer_number); if (t) onTrailerClick(t) }}
              >ⓘ</button>
            )}
          </div>
        </td>

        <td>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280' }}>{entry.equipment_type ?? '—'}</span>
        </td>

        <td>
          <div className="driver-cell">
            {entry.driver_name ? (
              <button className="clickup-link" onClick={() => onDriverClick(entry.driver_clickup_id, entry.driver_name)}>
                {entry.driver_name}
              </button>
            ) : (
              <span style={{ color: '#9CA3AF', fontStyle: 'italic', fontSize: 12 }}>No driver</span>
            )}
            {entry.phone && <div className="driver-phone">{entry.phone}</div>}
            {entry.driver_name && (
              <AlertBadge name={entry.driver_name} clickupId={entry.driver_clickup_id} company={entry.company} />
            )}
          </div>
        </td>

        <td colSpan={7}>
          <div className="ghost-quickpick">
            <button
              className="ghost-qp-btn qp-home"
              title="Mark truck as At Home today"
              onClick={() => onDirectSave({ ...chainPrefill(entry), status: 'home' })}
            >🏠 At Home</button>
            <button
              className="ghost-qp-btn qp-empty"
              title="Mark truck as Empty / Ready"
              onClick={() => onDirectSave({ ...chainPrefill(entry), status: 'empty' })}
            >🚛 Empty</button>
            <button
              className="ghost-qp-btn qp-broken"
              title="Mark truck as Broken Down"
              onClick={() => onDirectSave({ ...chainPrefill(entry), status: 'broken' })}
            >🔧 Broken</button>
            <button
              className="ghost-qp-btn qp-add"
              title="Add a load for this truck"
              onClick={() => onEdit(chainPrefill(entry))}
            >+ Add Load</button>
          </div>
        </td>
      </tr>
    )
  }

  function renderRow(load, extraCount = 0, isExp = false, onToggle = null) {
    if (load._ghost) return renderGhostRow(load)

    return (
      <tr key={load.id} className={`row-${load.status}`}>
        <td>
          <StatusBadge status={load.status} />
          {extraCount > 0 && (
            <button
              title={isExp ? 'Click to collapse extra loads' : `Click to show ${extraCount} more load${extraCount > 1 ? 's' : ''}`}
              onClick={onToggle}
              style={{
                display: 'block',
                marginTop: 4,
                background: isExp ? '#F3F4F6' : '#EEF2FF',
                border: `1px solid ${isExp ? '#D1D5DB' : '#A5B4FC'}`,
                cursor: 'pointer',
                fontSize: 10,
                color: isExp ? '#4B5563' : '#4F46E5',
                padding: '2px 7px',
                borderRadius: 10,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                lineHeight: 1.5,
              }}
            >
              {isExp ? `▾ ${extraCount} load${extraCount > 1 ? 's' : ''}` : `▸ +${extraCount} load${extraCount > 1 ? 's' : ''}`}
            </button>
          )}
        </td>

        <td>
          <div className="equip-cell">
            <SelectCell
              value={load.truck_number}
              options={truckOpts}
              onChange={v => onEdit({ ...load, truck_number: v })}
              placeholder="—"
            />
            {load.truck_number && (
              <button
                className="equip-info-btn"
                title="Truck info"
                onClick={() => { const t = trucks.find(t => t.truckNumber === load.truck_number); if (t) onTruckClick(t) }}
              >ⓘ</button>
            )}
          </div>
        </td>

        <td>
          <div className="equip-cell">
            <SelectCell
              value={load.trailer_number}
              options={trailerOpts}
              onChange={v => onEdit({ ...load, trailer_number: v })}
              placeholder="—"
            />
            {load.trailer_number && (
              <button
                className="equip-info-btn"
                title="Trailer info"
                onClick={() => { const t = trailers.find(t => t.trailerNumber === load.trailer_number); if (t) onTrailerClick(t) }}
              >ⓘ</button>
            )}
          </div>
        </td>

        <td>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280' }}>
            {load.equipment_type ?? '—'}
          </span>
        </td>

        <td>
          <div className="driver-cell">
            {load.driver_name ? (
              <button
                className="clickup-link"
                onClick={() => onDriverClick(load.driver_clickup_id, load.driver_name)}
              >
                {load.driver_name}
              </button>
            ) : (
              <span style={{ color: '#9CA3AF', fontStyle: 'italic', fontSize: 12 }}>No driver</span>
            )}
            {load.phone && <div className="driver-phone">{load.phone}</div>}
            {load.driver_name && (
              <AlertBadge name={load.driver_name} clickupId={load.driver_clickup_id} company={load.company} />
            )}
          </div>
        </td>

        <td style={{
          background: STATUS_ROUTE_BG[load.status]?.bg,
          borderLeft: `3px solid ${STATUS_ROUTE_BG[load.status]?.border ?? 'transparent'}`,
          borderRadius: 6,
        }}>
          {load.pickup_location || load.delivery_location ? (
            <div className="route-cell">
              <div>
                <div className="route-city">{load.pickup_location?.split(',')[0] ?? '?'}</div>
                <div className="route-state">{load.pickup_location?.split(',')[1]?.trim() ?? ''}</div>
                {load.pickup_date && <div className="route-date">{new Date(load.pickup_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}</div>}
              </div>
              {load.stops?.length > 2 && (
                <div className="route-stops-badge">+{load.stops.length - 2}</div>
              )}
              <div className="route-arrow">→</div>
              <div>
                <div className="route-city">{load.delivery_location?.split(',')[0] ?? '?'}</div>
                <div className="route-state">{load.delivery_location?.split(',')[1]?.trim() ?? ''}</div>
              </div>
            </div>
          ) : (
            <span style={{ color: '#9CA3AF' }}>—</span>
          )}
        </td>

        <td>
          {load.load_number ? (
            <>
              <div className="load-number">{load.load_number}</div>
              <div className="load-broker">{load.broker}</div>
            </>
          ) : '—'}
        </td>

        <td>
          {load.delivery_date ? (
            <>
              <div>{new Date(load.delivery_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}</div>
              {load.delivery_appt && <div style={{ fontSize: 11, color: '#6B7280' }}>{load.delivery_appt}</div>}
            </>
          ) : '—'}
        </td>

        <td>{load.total_miles ? load.total_miles.toLocaleString() : '—'}</td>

        <td>
          {load.price ? <div className="price-main">{fmt(load.price)}</div> : '—'}
        </td>

        <td>
          {dpm(load.price, load.total_miles)
            ? <div className="price-main">{dpm(load.price, load.total_miles)}</div>
            : '—'}
        </td>

        <td style={{ maxWidth: 120, whiteSpace: 'normal', fontSize: 11, color: '#B91C1C', fontWeight: 500 }}>
          {load.safety_notes ?? ''}
        </td>

        <td style={{ maxWidth: 140, whiteSpace: 'normal', fontSize: 11, color: '#6B7280' }}>
          {load.notes ?? ''}
        </td>

        <td>
          <div className="actions-cell">
            <button
              className="action-btn chain"
              title="Add next load (same truck & driver)"
              onClick={() => onEdit(chainPrefill(load))}
            >+</button>
            <button className="action-btn" title="Edit"   onClick={() => onEdit(load)}>✎</button>
            <button className="action-btn danger" title="Delete" onClick={() => onDelete(load.id)}>✕</button>
          </div>
        </td>
      </tr>
    )
  }

  // Compact row for 2nd, 3rd, … loads on the same truck — visually nested
  function renderNextRow(load) {
    return (
      <tr
        key={`next-${load.id}`}
        className="row-next-load"
        style={{ background: '#F0F0F0', borderLeft: '4px solid #9CA3AF' }}
      >
        <td style={{ paddingLeft: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#9CA3AF', fontSize: 13, lineHeight: 1, userSelect: 'none' }}>└</span>
            <StatusBadge status={load.status} />
          </div>
        </td>

        {/* truck / trailer / type / driver: same as primary — leave blank */}
        <td /><td /><td /><td />

        <td style={{
          background: STATUS_ROUTE_BG[load.status]?.bg,
          borderLeft: `3px solid ${STATUS_ROUTE_BG[load.status]?.border ?? 'transparent'}`,
          borderRadius: 6,
        }}>
          {load.pickup_location || load.delivery_location ? (
            <div className="route-cell">
              <div>
                <div className="route-city">{load.pickup_location?.split(',')[0] ?? '?'}</div>
                <div className="route-state">{load.pickup_location?.split(',')[1]?.trim() ?? ''}</div>
                {load.pickup_date && <div className="route-date">{new Date(load.pickup_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}</div>}
              </div>
              {load.stops?.length > 2 && (
                <div className="route-stops-badge">+{load.stops.length - 2}</div>
              )}
              <div className="route-arrow">→</div>
              <div>
                <div className="route-city">{load.delivery_location?.split(',')[0] ?? '?'}</div>
                <div className="route-state">{load.delivery_location?.split(',')[1]?.trim() ?? ''}</div>
              </div>
            </div>
          ) : (
            <span style={{ color: '#9CA3AF' }}>—</span>
          )}
        </td>

        <td>
          {load.load_number ? (
            <>
              <div className="load-number">{load.load_number}</div>
              <div className="load-broker">{load.broker}</div>
            </>
          ) : '—'}
        </td>

        <td>
          {load.delivery_date ? (
            <>
              <div>{new Date(load.delivery_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}</div>
              {load.delivery_appt && <div style={{ fontSize: 11, color: '#6B7280' }}>{load.delivery_appt}</div>}
            </>
          ) : '—'}
        </td>

        <td>{load.total_miles ? load.total_miles.toLocaleString() : '—'}</td>
        <td>{load.price ? <div className="price-main">{fmt(load.price)}</div> : '—'}</td>
        <td>{dpm(load.price, load.total_miles) ? <div className="price-main">{dpm(load.price, load.total_miles)}</div> : '—'}</td>

        <td style={{ maxWidth: 120, whiteSpace: 'normal', fontSize: 11, color: '#B91C1C', fontWeight: 500 }}>
          {load.safety_notes ?? ''}
        </td>

        <td style={{ maxWidth: 140, whiteSpace: 'normal', fontSize: 11, color: '#6B7280' }}>
          {load.notes ?? ''}
        </td>

        <td>
          <div className="actions-cell">
            <button className="action-btn" title="Edit"   onClick={() => onEdit(load)}>✎</button>
            <button className="action-btn danger" title="Delete" onClick={() => onDelete(load.id)}>✕</button>
          </div>
        </td>
      </tr>
    )
  }

  function renderGroup(group) {
    const [primary, ...rest] = group
    const fragKey  = primary._ghost ? `ghost_${primary._fleetId}` : primary.id
    const groupKey = primary.truck_number || fragKey
    const isExp    = !collapsed.has(groupKey)   // open by default

    return (
      <Fragment key={fragKey}>
        {renderRow(primary, rest.length, isExp, rest.length > 0 ? () => toggleExpand(groupKey) : null)}
        {isExp && rest.map(renderNextRow)}
      </Fragment>
    )
  }

  return (
    <Fragment>
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Truck #</th>
            <th>Trailer #</th>
            <th>Type</th>
            <th>Driver</th>
            <th>Route</th>
            <th>Load Info</th>
            <th>Delivery</th>
            <th>Miles</th>
            <th>Revenue</th>
            <th>$/Mile</th>
            <th>Load Notes</th>
            <th>Notes</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr className="loading-row"><td colSpan={14}>Loading loads…</td></tr>
          ) : (
            <>
              {caratGroups.length > 0 && (
                <>
                  <tr className="section-row"><td colSpan={14}>Carat Expedited</td></tr>
                  {caratGroups.map(renderGroup)}
                </>
              )}
              {proFreightGroups.length > 0 && (
                <>
                  <tr className="section-row"><td colSpan={14}>Pro Freight Transportation</td></tr>
                  {proFreightGroups.map(renderGroup)}
                </>
              )}
              {caratGroups.length === 0 && proFreightGroups.length === 0 && (
                <tr className="loading-row"><td colSpan={14}>No loads for this day. Click + Add Load to get started.</td></tr>
              )}
            </>
          )}
        </tbody>
      </table>
    </div>

    {alertDriver && (
      <DriverAlertModal
        driver={alertDriver}
        existing={getNote(alertDriver.name)}
        onSave={saveNote}
        onClear={clearNote}
        onClose={() => setAlertDriver(null)}
      />
    )}
    </Fragment>
  )
}
