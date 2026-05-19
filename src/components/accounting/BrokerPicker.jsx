import { useState, useRef, useEffect } from 'react'
import { useBrokerSearch, createBroker } from '../../hooks/useBrokers'

// Searchable broker dropdown with inline Add New Broker form
export default function BrokerPicker({ value, onChange, company = 'all' }) {
  const [query,    setQuery]    = useState(value?.name || '')
  const [open,     setOpen]     = useState(false)
  const [addMode,  setAddMode]  = useState(false)
  const [newBroker, setNewBroker] = useState({ name: '', address: '', city: '', state: '', zip: '', phone: '', email: '', company: company === 'all' ? 'carat' : company })
  const [saving,   setSaving]   = useState(false)
  const wrapRef = useRef(null)

  const { brokers, loading } = useBrokerSearch(query, company)

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false)
        setAddMode(false)
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

  async function handleAddBroker(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const broker = await createBroker({ ...newBroker, name: newBroker.name || query })
      selectBroker(broker)
      setAddMode(false)
    } catch (err) {
      alert('Error saving broker: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={query}
        onChange={handleInput}
        onFocus={() => query.length >= 2 && setOpen(true)}
        placeholder="Search broker name…"
        autoComplete="off"
      />

      {open && !addMode && (
        <div className="broker-dropdown">
          {loading && <div className="broker-dd-item broker-dd-hint">Searching…</div>}
          {!loading && brokers.length === 0 && query.length >= 2 && (
            <div className="broker-dd-item broker-dd-hint">No results for "{query}"</div>
          )}
          {brokers.map(b => (
            <div key={b.id} className="broker-dd-item" onMouseDown={() => selectBroker(b)}>
              <div className="broker-dd-name">{b.name}</div>
              {(b.city || b.state) && (
                <div className="broker-dd-sub">{[b.city, b.state].filter(Boolean).join(', ')}</div>
              )}
            </div>
          ))}
          <div
            className="broker-dd-item broker-dd-add"
            onMouseDown={() => {
              setAddMode(true)
              setNewBroker(n => ({ ...n, name: query }))
            }}
          >
            + Add new broker
          </div>
        </div>
      )}

      {addMode && (
        <div className="broker-add-form">
          <div className="broker-add-title">New Broker</div>
          <form onSubmit={handleAddBroker}>
            <div className="form-grid">
              <div className="form-group">
                <label>Company Name *</label>
                <input required value={newBroker.name} onChange={e => setNewBroker(n => ({ ...n, name: e.target.value }))} />
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
              <button type="button" className="btn btn-ghost" onClick={() => setAddMode(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Broker'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
