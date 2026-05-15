import StatusBadge from './StatusBadge'
import SelectCell from './SelectCell'

const fmt = n => n ? '$' + Number(n).toLocaleString('en-US') : '—'
const dpm = (price, miles) =>
  price && miles ? '$' + (price / miles).toFixed(2) + '/mi' : null

export default function DayView({ loads, loading, trucks, trailers, drivers, fleet = [], onEdit, onDelete, onDriverClick, onTruckClick, onTrailerClick }) {
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
    const result       = []
    const coveredTrucks = new Set()
    for (const entry of fleetEntries) {
      const truckLoads = loadsList.filter(l => l.truck_number === entry.truck_number)
      if (truckLoads.length > 0) {
        truckLoads.forEach(l => result.push(l))
      } else {
        result.push({
          _ghost:           true,
          _fleetId:         entry.id,
          company:          entry.company,
          truck_number:     entry.truck_number,
          trailer_number:   entry.trailer_number,
          equipment_type:   entry.equipment_type,
          driver_name:      entry.driver_name,
          driver_clickup_id:entry.driver_clickup_id,
          phone:            entry.phone,
        })
      }
      coveredTrucks.add(entry.truck_number)
    }
    // Include any loads for trucks not in the fleet roster
    loadsList.filter(l => !coveredTrucks.has(l.truck_number)).forEach(l => result.push(l))
    return result
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

  function renderGhostRow(entry) {
    const prefill = {
      company:          entry.company,
      truck_number:     entry.truck_number,
      trailer_number:   entry.trailer_number,
      equipment_type:   entry.equipment_type,
      driver_name:      entry.driver_name,
      driver_clickup_id:entry.driver_clickup_id,
      phone:            entry.phone,
    }
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
          </div>
        </td>

        <td colSpan={7} style={{ color: '#D1D5DB', fontStyle: 'italic', fontSize: 12 }}>
          No load assigned for today
        </td>

        <td>
          <div className="actions-cell">
            <button
              className="action-btn"
              title="Add load for this truck"
              onClick={() => onEdit(prefill)}
            >+</button>
          </div>
        </td>
      </tr>
    )
  }

  function renderRow(load) {
    if (load._ghost) return renderGhostRow(load)

    return (
      <tr key={load.id} className={`row-${load.status}`}>
        <td><StatusBadge status={load.status} /></td>

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
          </div>
        </td>

        <td>
          {load.pickup_location || load.delivery_location ? (
            <div className="route-cell">
              <div>
                <div className="route-city">{load.pickup_location?.split(',')[0] ?? '?'}</div>
                <div className="route-state">{load.pickup_location?.split(',')[1]?.trim() ?? ''}</div>
                {load.pickup_date && <div className="route-date">{new Date(load.pickup_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}</div>}
              </div>
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

  return (
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
            <th>Notes</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr className="loading-row"><td colSpan={13}>Loading loads…</td></tr>
          ) : (
            <>
              {carat.length > 0 && (
                <>
                  <tr className="section-row"><td colSpan={13}>Carat Expedited</td></tr>
                  {carat.map(renderRow)}
                </>
              )}
              {proFreight.length > 0 && (
                <>
                  <tr className="section-row"><td colSpan={13}>Pro Freight Transportation</td></tr>
                  {proFreight.map(renderRow)}
                </>
              )}
              {carat.length === 0 && proFreight.length === 0 && (
                <tr className="loading-row"><td colSpan={13}>No loads for this day. Click + Add Load to get started.</td></tr>
              )}
            </>
          )}
        </tbody>
      </table>
    </div>
  )
}
