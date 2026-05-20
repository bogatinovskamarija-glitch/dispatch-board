import { useState } from 'react'

export default function ShopPicker({ shops, value, onChange, onAddShop }) {
  const [adding, setAdding]   = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving]   = useState(false)

  async function handleAdd() {
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    try {
      const shop = await onAddShop(name)
      onChange(shop)
      setNewName('')
      setAdding(false)
    } catch (e) { alert(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="shop-picker">
      <select
        value={value?.id || ''}
        onChange={e => {
          if (e.target.value === '__new__') { setAdding(true); return }
          const s = shops.find(s => s.id === e.target.value) || null
          onChange(s)
        }}
      >
        <option value="">— No shop —</option>
        {shops.map(s => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
        <option value="__new__">+ Add new shop…</option>
      </select>

      {adding && (
        <div className="shop-picker-add">
          <input
            autoFocus
            placeholder="Shop name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false) }}
          />
          <button className="btn btn-primary" onClick={handleAdd} disabled={saving || !newName.trim()}>
            {saving ? '…' : 'Save'}
          </button>
          <button className="btn btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      )}
    </div>
  )
}
