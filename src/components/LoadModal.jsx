import { useState, useEffect } from 'react'

const STATUSES = [
  { value: 'covered',   label: 'Covered',   dot: '#16A34A' },
  { value: 'empty',     label: 'Empty',     dot: '#CA8A04' },
  { value: 'home',      label: 'At Home',   dot: '#DB2777' },
  { value: 'broken',    label: 'Broken',    dot: '#DC2626' },
  { value: 'no_driver', label: 'No Driver', dot: '#9CA3AF' },
]

const BLANK = {
  status: 'empty', company: 'carat', truck_number: '', trailer_number: '',
  equipment_type: 'REEF', is_tanker: false, driver_name: '', driver_clickup_id: '',
  phone: '', pickup_location: '', delivery_location: '', zip: '',
  delivery_date: '', delivery_appt: '', load_number: '', broker: '',
  total_miles: '', price: '', safety_notes: '', notes: '', hometown: '',
}

export default function LoadModal({ load, date, drivers, trucks, trailers, onSave, onClose }) {
  const isEdit = Boolean(load?.id)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (load) {
      setForm({ ...BLANK, ...load, delivery_date: load.delivery_date ?? '', total_miles: load.total_miles ?? '', price: load.price ?? '' })
    } else {
      setForm({ ...BLANK, date })
    }
  }, [load, date])

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
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
    if (truck) {
      setForm(f => ({
        ...f,
        truck_number: truckNum,
        equipment_type: truck.type || f.equipment_type,
        is_tanker: truck.isTanker ?? f.is_tanker,
        company: truck.company || f.company,
      }))
    } else {
      set('truck_number', truckNum)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    try {
      const payload = {
        ...form,
        total_miles: form.total_miles ? Number(form.total_miles) : null,
        price:       form.price       ? Number(form.price)       : null,
        delivery_date: form.delivery_date || null,
        date: form.date || date,
      }
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
              <div className="form-grid-3">
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
                <div className="form-group">
                  <label>Tanker</label>
                  <select value={form.is_tanker ? 'yes' : 'no'} onChange={e => set('is_tanker', e.target.value === 'yes')}>
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
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

            {/* ROUTE */}
            <div className="form-section">
              <div className="form-section-title">Route</div>
              <div className="form-grid">
                <div className="form-group">
                  <label>Pick Up</label>
                  <input type="text" placeholder="City, State" value={form.pickup_location} onChange={e => set('pickup_location', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Delivery</label>
                  <input type="text" placeholder="City, State" value={form.delivery_location} onChange={e => set('delivery_location', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Delivery Date</label>
                  <input type="date" value={form.delivery_date} onChange={e => set('delivery_date', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Delivery Appt</label>
                  <input type="text" placeholder="3:30 AM" value={form.delivery_appt} onChange={e => set('delivery_appt', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Zip</label>
                  <input type="text" placeholder="08873" value={form.zip} onChange={e => set('zip', e.target.value)} />
                </div>
              </div>
            </div>

            {/* LOAD DETAILS */}
            <div className="form-section">
              <div className="form-section-title">Load Details</div>
              <div className="form-grid">
                <div className="form-group">
                  <label>Load Number</label>
                  <input type="text" placeholder="20317925" value={form.load_number} onChange={e => set('load_number', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Broker</label>
                  <input type="text" placeholder="JERUE" value={form.broker} onChange={e => set('broker', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Total Miles</label>
                  <input type="number" placeholder="1377" value={form.total_miles} onChange={e => set('total_miles', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Price ($)</label>
                  <input type="number" placeholder="4000" value={form.price} onChange={e => set('price', e.target.value)} />
                </div>
              </div>
            </div>

            {/* NOTES */}
            <div className="form-section">
              <div className="form-section-title">Notes</div>
              <div className="form-grid">
                <div className="form-group">
                  <label>Safety Notes</label>
                  <textarea placeholder="Any safety-related notes…" value={form.safety_notes} onChange={e => set('safety_notes', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea placeholder="General notes, updates…" value={form.notes} onChange={e => set('notes', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Hometown</label>
                  <input type="text" placeholder="Ft Lauderdale, FL" value={form.hometown} onChange={e => set('hometown', e.target.value)} />
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
