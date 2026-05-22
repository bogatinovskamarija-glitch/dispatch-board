import { useState, useRef, useEffect } from 'react'
import { useBrokerSearch, createBroker } from '../../hooks/useBrokers'

export default function BrokerPicker({ value, onChange, company = 'all' }) {
  const [query,     setQuery]     = useState(value?.name || '')
  const [open,      setOpen]      = useState(false)
  const [addMode,   setAddMode]   = useState(false)
  const [newBroker, setNewBroker] = useState({
    name: '', address: '', city: '', state: '', zip: '',
    phone: '', email: '',
    company: company === 'all' ? 'carat' : company,
  })
  const [saving,  setSaving]  = useState(false)
  const [saveErr, setSaveErr] = useState(null)
  const wrapRef = useRef(null)

  const { brokers, loading } = useBrokerSearch(query, 'all')

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function selectBroker(b) {
    onChange(b)
    setQuery(b.name)
    setOpen(false)
    setAddMode(false)
  }

  function handleInput(e) {
    setQuery(e.target.value)
    setOpen(true)
    if (!e.target.value) onChange(null)
  }

  function openAddForm() {
    setAddMode(true)
    setOpen(false)
    setNewBroker(n => ({ ...n, name: query }))
    setSaveErr(null)
  }

  function cancelAdd() {
    setAddMode(false)
    setSaveErr(null)
  }

  async function handleAddBroker(e) {
    e.preventDefault()
    setSaving(true)
    setSaveErr(null)
    try {
      const broker = await createBroker({ ...newBroker, name: newBroker.name || query })
      selectBroker(broker)
      setAddMode(false)
    } catch (err) {
      setSaveErr(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div ref={wrapRef}>
      {/* Search row */}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          value={query}
          onChange={handleInput}
          onFocus={() => setOpen(true)}
          placeholder="Search broker name…"
          autoComplete="off"
          style={{ flex: 1 }}
        />
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          style={{ whiteSpace: 'nowrap' }}
          onClick={openAddForm}
        >+ New Broker</button>
      </div>

      {/* Search dropdown */}
      {open && !addMode && (
        <div className="broker-dropdown">
          {loading && <div className="broker-dd-item broker-dd-hint">Searching…</div>}
          {!loading && query.length >= 1 && brokers.length === 0 && (
            <div className="broker-dd-item broker-dd-hint">No results for "{query}"</div>
          )}
          {!loading && query.length < 1 && (
            <div className="broker-dd-item broker-dd-hint">Type to search brokers…</div>
          )}
          {brokers.map(b => (
            <div key={b.id} className="broker-dd-item" onMouseDown={() => selectBroker(b)}>
              <div className="broker-dd-name">{b.name}</div>
              {(b.city || b.state) && (
                <div className="broker-dd-sub">{[b.city, b.state].filter(Boolean).join(', ')}</div>
              )}
            </div>
          ))}
          <div className="broker-dd-item broker-dd-add" onMouseDown={openAddForm}>
            + Add new broker
          </div>
        </div>
      )}

      {/* Add broker form — inline so modal overflow doesn't clip it */}
      {addMode && (
        <div className="broker-add-form">
          <div className="broker-add-title">New Broker</div>
          {saveErr && <div style={{ color: '#B91C1C', fontSize: 12, marginBottom: 8 }}>Error: {saveErr}</div>}
          <form onSubmit={handleAddBroker}>
            <div className="form-grid">
              <div className="form-group">
                <label>Company Name *</label>
                <input
                  required
                  value={newBroker.name}
                  onChange={e => setNewBroker(n => ({ ...n, name: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Address</label>
                <input value={newBroker.address} onChange={e => setNewBroker(n => ({ ...n, address: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>City</label>
                <input value={newBroker.city} onChange={e => setNewBroker(n => ({ ...n, city: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>State</label>
                <input value={newBroker.state} maxLength={2} style={{ width: 60 }} onChange={e => setNewBroker(n => ({ ...n, state: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>ZIP</label>
                <input value={newBroker.zip} onChange={e => setNewBroker(n => ({ ...n, zip: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input value={newBroker.phone} onChange={e => setNewBroker(n => ({ ...n, phone: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={newBroker.email} onChange={e => setNewBroker(n => ({ ...n, email: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Works with</label>
                <select value={newBroker.company} onChange={e => setNewBroker(n => ({ ...n, company: e.target.value }))}>
                  <option value="carat">Carat Expedited</option>
                  <option value="pro_freight">Pro Freight</option>
                  <option value="both">Both</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="button" className="btn btn-ghost" onClick={cancelAdd}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save Broker'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
