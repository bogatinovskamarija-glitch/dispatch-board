import { useState, useEffect } from 'react'

const STATUSES = [
  { value: 'covered',     label: 'Covered',      dot: '#16A34A' },
  { value: 'empty',       label: 'Empty',        dot: '#CA8A04' },
  { value: 'home',        label: 'At Home',      dot: '#DB2777' },
  { value: 'broken',      label: 'Broken',       dot: '#DC2626' },
  { value: 'no_driver',   label: 'No Driver',    dot: '#9CA3AF' },
  { value: 'prebooked',   label: 'Pre-Booked',   dot: '#4F46E5' },
  { value: 'at_pickup',   label: 'At Pick Up',   dot: '#0284C7' },
  { value: 'at_delivery', label: 'At Delivery',  dot: '#EA580C' },
  { value: 'tonu',        label: 'TONU',         dot: '#7C3AED' },
]

const BLANK_STOP = { type: 'pickup', location: '', date: '', appt: '' }

const DEFAULT_STOPS = [
  { type: 'pickup',   location: '', date: '', appt: '' },
  { type: 'delivery', location: '', date: '', appt: '' },
]

const BLANK = {
  status: 'empty', company: 'carat', truck_number: '', trailer_number: '',
  equipment_type: 'REEF', is_tanker: false, driver_name: '', driver_clickup_id: '',
  phone: '', zip: '', load_number: '', broker: '',
  total_miles: '', empty_miles: '', price: '', safety_notes: '', notes: '', hometown: '',
  flat_rate_pay: false, flat_rate_amount: '',
  stops: DEFAULT_STOPS,
}

function stopsFromLoad(load) {
  if (load.stops?.length) return load.stops
  return [
    { type: 'pickup',   location: load.pickup_location   || '', date: load.pickup_date   || '', appt: '' },
    { type: 'delivery', location: load.delivery_location || '', date: load.delivery_date || '', appt: load.delivery_appt || '' },
  ]
}

export default function LoadModal({ load, date, drivers, trucks, trailers, fleet = [], onSave, onClose }) {
  const isEdit = Boolean(load?.id)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (load) {
      setForm({
        ...BLANK, ...load,
        total_miles:       load.total_miles       ?? '',
        price:             load.price             ?? '',
        flat_rate_pay:     load.flat_rate_pay     ?? false,
        flat_rate_amount:  load.flat_rate_amount  ?? '',
        stops:             stopsFromLoad(load),
      })
    } else {
      setForm({ ...BLANK, date })
    }
  }, [load, date])

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function updateStop(i, field, value) {
    setForm(f => {
      const stops = f.stops.map((s, idx) => idx === i ? { ...s, [field]: value } : s)
      return { ...f, stops }
    })
  }

  function addStop() {
    setForm(f => ({ ...f, stops: [...f.stops, { ...BLANK_STOP }] }))
  }

  function removeStop(i) {
    setForm(f => ({ ...f, stops: f.stops.filter((_, idx) => idx !== i) }))
  }

  function onDriverChange(e) {
    const id = e.target.value
    const driver = drivers.find(d => d.id === id)
    if (driver) {
      setForm(f => ({
        ...f,
        driver_clickup_id: driver.id,
        driver_name: driver.name,
        phone: driver.phone || f.phone,
        hometown: driver.hometown || f.hometown,
      }))
    } else {
      set('driver_clickup_id', '')
      set('driver_name', '')
    }
  }

  function onTruckChange(e) {
    const truckNum = e.target.value
    const truck = trucks.find(t => t.truckNumber === truckNum)
    const fleetEntry = fleet.find(f => f.truck_number === truckNum)
    if (truck) {
      setForm(f => ({
        ...f,
        truck_number: truckNum,
        equipment_type: truck.type || f.equipment_type,
        is_tanker: truck.isTanker ?? f.is_tanker,
        company: truck.company || f.company,
        // Auto-fill trailer from fleet roster; fall back to whatever is already entered
        trailer_number: fleetEntry?.trailer_number || f.trailer_number || '',
      }))
    } else {
      set('truck_number', truckNum)
    }
  }

  // Statuses that require load details to be filled in
  const ACTIVE_STATUSES = ['covered', 'at_pickup', 'at_delivery', 'tonu']

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    try {
      // ── Required-field validation for active statuses ──────────────────
      if (ACTIVE_STATUSES.includes(form.status)) {
        const missing = []
        if (!form.load_number?.trim())   missing.push('Load Number')
        if (!form.price)                 missing.push(form.status === 'tonu' ? 'TONU Amount' : 'Price')
        if (!form.broker?.trim())        missing.push('Broker')
        if (form.status !== 'tonu') {
          if (!form.total_miles)         missing.push('Loaded Miles')
          if (form.empty_miles === '' || form.empty_miles === null || form.empty_miles === undefined)
                                         missing.push('Empty Miles')
        }
        if (missing.length > 0) {
          setErr('Required fields missing: ' + missing.join(', '))
          setSaving(false)
          return
        }
      }

      const stops      = form.stops.filter(s => s.location || s.date)
      const pickups    = stops.filter(s => s.type === 'pickup')
      const deliveries = stops.filter(s => s.type === 'delivery')
      const firstPickup   = pickups[0]
      const lastDelivery  = deliveries[deliveries.length - 1]

      const payload = {
        ...form,
        stops,
        pickup_location:  firstPickup?.location  || '',
        pickup_date:      firstPickup?.date       || null,
        delivery_location: lastDelivery?.location || '',
        delivery_date:    lastDelivery?.date      || null,
        delivery_appt:    lastDelivery?.appt      || '',
        total_miles:      form.total_miles      ? Number(form.total_miles)      : null,
        empty_miles:      form.empty_miles !== '' && form.empty_miles !== null && form.empty_miles !== undefined
                            ? Number(form.empty_miles) : null,
        price:            form.price            ? Number(form.price)            : null,
        flat_rate_pay:    form.flat_rate_pay    || false,
        flat_rate_amount: form.flat_rate_pay && form.flat_rate_amount ? Number(form.flat_rate_amount) : null,
        date:             form.date || date,
      }

      // Strip accounting fields — these are managed exclusively by accounting
      // operations (invoicing, paystubs) and must NEVER be overwritten by a
      // load edit, even if the in-memory load object has stale values.
      delete payload.invoice_id
      delete payload.invoice_number
      delete payload.invoiced_at
      delete payload.paid_at
      delete payload.paystub_id
      delete payload.is_archived

      await onSave(payload)
      onClose()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{isEdit ? 'Edit Load' : 'Add Load'}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">

            {/* STATUS */}
            <div className="form-section">
              <div className="form-section-title">Truck Status</div>
              <div className="status-picker">
                {STATUSES.map(s => (
                  <div
                    key={s.value}
                    className={`status-opt${form.status === s.value ? ' active' : ''}`}
                    data-s={s.value}
                    onClick={() => set('status', s.value)}
                  >
                    <span className="s-dot" style={{ background: s.dot }} />
                    {s.label}
                  </div>
                ))}
              </div>
            </div>

            {/* EQUIPMENT */}
            <div className="form-section">
              <div className="form-section-title">Equipment</div>
              <div className="form-grid">
                <div className="form-group">
                  <label>Truck #</label>
                  <select value={form.truck_number} onChange={onTruckChange}>
                    <option value="">Select truck…</option>
                    {trucks.map(t => (
                      <option key={t.id} value={t.truckNumber}>{t.truckNumber}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Trailer #</label>
                  <select value={form.trailer_number} onChange={e => set('trailer_number', e.target.value)}>
                    <option value="">Select trailer…</option>
                    {trailers.map(t => (
                      <option key={t.id} value={t.trailerNumber}>{t.trailerNumber}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Type</label>
                  <select value={form.equipment_type} onChange={e => set('equipment_type', e.target.value)}>
                    <option>REEF</option>
                    <option>V-VAN</option>
                    <option>E-tracks</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Company</label>
                  <select value={form.company} onChange={e => set('company', e.target.value)}>
                    <option value="carat">Carat Expedited</option>
                    <option value="pro_freight">Pro Freight Transportation</option>
                  </select>
                </div>
              </div>
            </div>

            {/* DRIVER */}
            <div className="form-section">
              <div className="form-section-title">Driver — from ClickUp</div>
              <div className="form-grid">
                <div className="form-group">
                  <label>Driver</label>
                  <div className="cu-row">
                    <select value={form.driver_clickup_id} onChange={onDriverChange}>
                      <option value="">Select driver…</option>
                      {drivers.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                    {form.driver_clickup_id && (
                      <button
                        type="button"
                        className="cu-btn"
                        onClick={() => window.open(`https://app.clickup.com/t/${form.driver_clickup_id}`, '_blank')}
                      >
                        ↗ ClickUp
                      </button>
                    )}
                  </div>
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input
                    type="text"
                    placeholder="Auto-filled from ClickUp"
                    value={form.phone}
                    onChange={e => set('phone', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* ROUTE — dynamic stops */}
            <div className="form-section">
              <div className="form-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Route</span>
                <button type="button" className="btn btn-ghost" style={{ padding: '2px 10px', fontSize: 11, height: 24 }} onClick={addStop}>
                  + Add Stop
                </button>
              </div>

              <div className="stops-header">
                <span>Type</span>
                <span>Location</span>
                <span>Date</span>
                <span>Appt</span>
                <span />
              </div>

              {form.stops.map((stop, i) => (
                <div key={i} className="stop-row">
                  <select
                    value={stop.type}
                    onChange={e => updateStop(i, 'type', e.target.value)}
                    className={`stop-type-${stop.type}`}
                  >
                    <option value="pickup">Pickup</option>
                    <option value="delivery">Delivery</option>
                  </select>
                  <input
                    type="text"
                    placeholder="City, State"
                    value={stop.location}
                    onChange={e => updateStop(i, 'location', e.target.value)}
                  />
                  <input
                    type="date"
                    value={stop.date}
                    onChange={e => updateStop(i, 'date', e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="e.g. 3:30 AM"
                    value={stop.appt}
                    onChange={e => updateStop(i, 'appt', e.target.value)}
                  />
                  {form.stops.length > 1 ? (
                    <button type="button" className="stop-remove" onClick={() => removeStop(i)} title="Remove stop">✕</button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}

              <div className="form-group" style={{ marginTop: 10, maxWidth: 160 }}>
                <label>Zip</label>
                <input type="text" placeholder="08873" value={form.zip} onChange={e => set('zip', e.target.value)} />
              </div>
            </div>

            {/* LOAD DETAILS */}
            <div className="form-section">
              <div className="form-section-title">Load Details</div>
              {form.status === 'tonu' && (
                <div className="tonu-notice">
                  ⚠ TONU — Broker owes a cancellation fee. Enter the TONU amount below to include this load in invoicing.
                  Driver will <strong>not</strong> be included in paystub calculations.
                </div>
              )}
              {ACTIVE_STATUSES.includes(form.status) && (
                <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 8 }}>
                  Fields marked <span style={{ color: '#DC2626' }}>*</span> are required for this status.
                </div>
              )}
              <div className="form-grid">
                <div className="form-group">
                  <label>
                    Load Number
                    {ACTIVE_STATUSES.includes(form.status) && <span style={{ color: '#DC2626', marginLeft: 2 }}>*</span>}
                  </label>
                  <input type="text" placeholder="20317925" value={form.load_number} onChange={e => set('load_number', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>
                    Broker
                    {ACTIVE_STATUSES.includes(form.status) && <span style={{ color: '#DC2626', marginLeft: 2 }}>*</span>}
                  </label>
                  <input type="text" placeholder="JERUE" value={form.broker} onChange={e => set('broker', e.target.value)} />
                </div>
                {form.status !== 'tonu' && (
                  <>
                    <div className="form-group">
                      <label>
                        Loaded Miles
                        {ACTIVE_STATUSES.includes(form.status) && <span style={{ color: '#DC2626', marginLeft: 2 }}>*</span>}
                      </label>
                      <input type="number" placeholder="1377" value={form.total_miles} onChange={e => set('total_miles', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>
                        Empty Miles
                        {ACTIVE_STATUSES.includes(form.status) && <span style={{ color: '#DC2626', marginLeft: 2 }}>*</span>}
                      </label>
                      <input type="number" placeholder="0" value={form.empty_miles} onChange={e => set('empty_miles', e.target.value)} />
                    </div>
                  </>
                )}
                <div className="form-group">
                  <label>
                    {form.status === 'tonu' ? 'TONU Amount ($)' : 'Price ($)'}
                    {ACTIVE_STATUSES.includes(form.status) && <span style={{ color: '#DC2626', marginLeft: 2 }}>*</span>}
                  </label>
                  <input
                    type="number"
                    placeholder={form.status === 'tonu' ? '150.00' : '4000'}
                    value={form.price}
                    onChange={e => set('price', e.target.value)}
                    style={form.status === 'tonu' ? { borderColor: '#475569' } : {}}
                  />
                </div>
                {form.status !== 'tonu' && (
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label
                      style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
                    >
                      <input
                        type="checkbox"
                        checked={form.flat_rate_pay}
                        onChange={e => {
                          set('flat_rate_pay', e.target.checked)
                          if (!e.target.checked) set('flat_rate_amount', '')
                        }}
                        style={{ width: 16, height: 16, cursor: 'pointer' }}
                      />
                      <span style={{ fontWeight: 600 }}>Flat Rate Driver Pay</span>
                      <span style={{ color: '#6B7280', fontWeight: 400, fontSize: 12 }}>
                        — check this if dispatch agreed to a fixed pay amount for this load
                      </span>
                    </label>
                    {form.flat_rate_pay && (
                      <div style={{ marginTop: 8, maxWidth: 200 }}>
                        <label style={{ fontSize: 12, color: '#6B7280', marginBottom: 4, display: 'block' }}>
                          Driver Pay Amount ($)
                        </label>
                        <input
                          type="number"
                          placeholder="250.00"
                          step="0.01"
                          value={form.flat_rate_amount}
                          onChange={e => set('flat_rate_amount', e.target.value)}
                          style={{ borderColor: '#F59E0B', boxShadow: '0 0 0 2px #FEF3C7' }}
                          autoFocus
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* NOTES */}
            <div className="form-section">
              <div className="form-section-title">Notes</div>
              <div className="form-grid">
                <div className="form-group">
                  <label>Notes</label>
                  <textarea placeholder="General notes, updates…" value={form.notes} onChange={e => set('notes', e.target.value)} />
                </div>
              </div>
            </div>

            {err && <div style={{ color: '#B91C1C', fontSize: 12, marginBottom: 8 }}>{err}</div>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Load'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
