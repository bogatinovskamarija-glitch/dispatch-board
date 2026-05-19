import { useState } from 'react'
import { useFactoringCompanies } from '../../hooks/useFactoringCompanies'

const BLANK = { name: '', address: '', phone: '', email: '' }

export default function FactoringPicker({ onSelect }) {
  const { companies, loading, saveCompany, removeCompany } = useFactoringCompanies()
  const [mode,    setMode]    = useState(null)   // null | 'add' | 'edit'
  const [editing, setEditing] = useState(null)   // company being edited
  const [form,    setForm]    = useState(BLANK)
  const [saving,  setSaving]  = useState(false)

  function startAdd() {
    setForm(BLANK)
    setEditing(null)
    setMode('add')
  }

  function startEdit(c) {
    setForm({ ...c })
    setEditing(c)
    setMode('edit')
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const saved = await saveCompany(editing ? { ...form, id: editing.id } : form)
      if (mode === 'add') onSelect(saved)
      setMode(null)
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(c) {
    if (!window.confirm(`Remove "${c.name}"?`)) return
    try { await removeCompany(c.id) } catch (err) { alert(err.message) }
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="factoring-picker">
      {loading ? (
        <div style={{ color: '#9CA3AF', fontSize: 12 }}>Loading…</div>
      ) : (
        <div className="factoring-list">
          {companies.map(c => (
            <div key={c.id} className="factoring-item">
              <button type="button" className="btn btn-ghost btn-xs factoring-select-btn" onClick={() => onSelect(c)}>
                {c.name}
              </button>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => startEdit(c)} title="Edit">✎</button>
              <button type="button" className="btn btn-ghost btn-xs" style={{ color: '#B91C1C' }} onClick={() => handleRemove(c)} title="Remove">✕</button>
            </div>
          ))}
          {companies.length === 0 && (
            <span style={{ color: '#9CA3AF', fontSize: 12 }}>No factoring companies saved yet.</span>
          )}
          <button type="button" className="btn btn-ghost btn-xs" style={{ color: '#4F46E5', marginTop: 4 }} onClick={startAdd}>
            + Add Factoring Company
          </button>
        </div>
      )}

      {(mode === 'add' || mode === 'edit') && (
        <form onSubmit={handleSave} className="factoring-form">
          <div className="factoring-form-title">{mode === 'add' ? 'New Factoring Company' : 'Edit Factoring Company'}</div>
          <div className="form-grid">
            <div className="form-group">
              <label>Company Name *</label>
              <input required value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Address (for Remit To)</label>
              <textarea rows={3} value={form.address} onChange={e => set('address', e.target.value)} placeholder={'Street Address\nCity, State ZIP'} />
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setMode(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      )}
    </div>
  )
}
