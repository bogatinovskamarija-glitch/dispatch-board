import { useState } from 'react'

const EQUIP_TYPES = ['REEF', 'FLAT', 'STEP', 'BOX', 'TANKER', 'OTHER']

const BLANK = {
  company: 'carat',
  truck_number: '',
  trailer_number: '',
  equipment_type: 'REEF',
  driver_name: '',
  driver_clickup_id: '',
  phone: '',
  sort_order: 0,
}

export default function FleetModal({ fleet, drivers, onAdd, onUpdate, onRemove, onClose }) {
  const [editId,   setEditId]   = useState(null)
  const [showAdd,  setShowAdd]  = useState(false)
  const [form,     setForm]     = useState(BLANK)
  const [saving,   setSaving]   = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function startEdit(entry) {
    setShowAdd(false)
    setEditId(entry.id)
    setForm({
      company:          entry.company,
      truck_number:     entry.truck_number     ?? '',
      trailer_number:   entry.trailer_number   ?? '',
      equipment_type:   entry.equipment_type   ?? 'REEF',
      driver_name:      entry.driver_name      ?? '',
      driver_clickup_id:entry.driver_clickup_id?? '',
      phone:            entry.phone            ?? '',
      sort_order:       entry.sort_order       ?? 0,
    })
  }

  function startAdd() {
    setEditId(null)
    setShowAdd(true)
    setForm(BLANK)
  }

  function cancel() {
    setEditId(null)
    setShowAdd(false)
    setForm(BLANK)
  }

  async function handleSave() {
    setSaving(true)
    try {
      if (showAdd) {
        await onAdd(form)
        setShowAdd(false)
      } else if (editId) {
        await onUpdate(editId, form)
        setEditId(null)
      }
      setForm(BLANK)
    } finally {
      setSaving(false)
    }
  }

  function pickDriver(name) {
    const d = drivers.find(d => d.name === name)
    set('driver_name', name)
    if (d) {
      set('driver_clickup_id', d.id)
      set('phone', d.phone || '')
    }
  }

  const carat      = fleet.filter(e => e.company === 'carat')
  const proFreight = fleet.filter(e => e.company === 'pro_freight')

  function renderDataRow(entry) {
    return (
      <tr key={entry.id}>
        <td style={{ fontWeight: 600 }}>{entry.truck_number  || '—'}</td>
        <td>{entry.trailer_number  || '—'}</td>
        <td>{entry.equipment_type  || '—'}</td>
        <td>{entry.driver_name     || <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>No driver</span>}</td>
        <td>{entry.phone           || '—'}</td>
        <td>
          <div className="actions-cell">
            <button className="action-btn" title="Edit"   onClick={() => startEdit(entry)}>✎</button>
            <button
              className="action-btn danger"
              title="Remove from fleet"
              onClick={() => {
                if (window.confirm(`Remove Truck ${entry.truck_number || '?'} from the fleet roster?`)) onRemove(entry.id)
              }}
            >✕</button>
          </div>
        </td>
      </tr>
    )
  }

  function renderEditRow(entry) {
    return (
      <tr key={entry.id} style={{ background: '#FAFFF4' }}>
        {renderFormCells()}
        <td>
          <div className="actions-cell">
            <button className="btn btn-primary"  style={{ padding: '4px 10px', fontSize: 11 }} onClick={handleSave} disabled={saving}>Save</button>
            <button className="btn btn-ghost"    style={{ padding: '4px 8px',  fontSize: 11 }} onClick={cancel}>Cancel</button>
          </div>
        </td>
      </tr>
    )
  }

  function renderFormCells() {
    return (
      <>
        <td><input value={form.truck_number}   onChange={e => set('truck_number', e.target.value)}   placeholder="e.g. 101"  style={{ width: 70 }} /></td>
        <td><input value={form.trailer_number} onChange={e => set('trailer_number', e.target.value)} placeholder="e.g. T201" style={{ width: 80 }} /></td>
        <td>
          <select value={form.equipment_type} onChange={e => set('equipment_type', e.target.value)} style={{ width: 90 }}>
            {EQUIP_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </td>
        <td>
          <select value={form.driver_name} onChange={e => pickDriver(e.target.value)} style={{ width: 160 }}>
            <option value="">— No driver —</option>
            {drivers.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
        </td>
        <td><input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="Phone" style={{ width: 120 }} /></td>
      </>
    )
  }

  function renderSection(label, entries, companyKey) {
    return (
      <div key={companyKey} style={{ marginBottom: 20 }}>
        <div className="form-section-title" style={{ marginBottom: 8 }}>{label}</div>
        <table style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Truck #</th><th>Trailer #</th><th>Type</th><th>Driver</th><th>Phone</th><th></th>
            </tr>
          </thead>
          <tbody>
            {entries.map(e => editId === e.id ? renderEditRow(e) : renderDataRow(e))}
            {showAdd && form.company === companyKey && (
              <tr style={{ background: '#EFF6FF' }}>
                {renderFormCells()}
                <td>
                  <div className="actions-cell">
                    <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={handleSave} disabled={saving}>Add</button>
                    <button className="btn btn-ghost"   style={{ padding: '4px 8px',  fontSize: 11 }} onClick={cancel}>Cancel</button>
                  </div>
                </td>
              </tr>
            )}
            {entries.length === 0 && !(showAdd && form.company === companyKey) && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9CA3AF', padding: '14px', fontStyle: 'italic', fontSize: 12 }}>No trucks yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 740 }}>
        <div className="modal-header">
          <div className="modal-title">Fleet Roster</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 16, lineHeight: 1.5 }}>
            Trucks added here appear on every day in the dispatcher board with their default driver and trailer pre-filled.
            Dispatchers only need to add the load details.
          </p>

          {renderSection('Carat Expedited',          carat,      'carat')}
          {renderSection('Pro Freight Transportation', proFreight, 'pro_freight')}
        </div>

        <div className="modal-footer">
          {showAdd && (
            <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#6B7280' }}>Adding to:</span>
              <select value={form.company} onChange={e => set('company', e.target.value)} style={{ fontSize: 12, padding: '4px 8px' }}>
                <option value="carat">Carat Expedited</option>
                <option value="pro_freight">Pro Freight Transportation</option>
              </select>
            </div>
          )}
          <button className="btn btn-ghost"   onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={startAdd} disabled={showAdd}>+ Add Truck</button>
        </div>
      </div>
    </div>
  )
}
