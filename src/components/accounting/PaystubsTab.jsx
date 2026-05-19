import { useState } from 'react'
import { fetchDriverLoads } from '../../hooks/useAccounting'
import PaystubPrintModal from './PaystubPrintModal'

function currentWeek() {
  const today = new Date()
  const day   = today.getDay()                              // 0=Sun … 6=Sat
  const mon   = new Date(today)
  mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1)) // Monday
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  const iso = d => d.toISOString().split('T')[0]
  return { start: iso(mon), end: iso(sun) }
}

const BLANK = { label: '', amount: '' }
const fmt   = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })

export default function PaystubsTab({ drivers, company }) {
  const week = currentWeek()

  const [driverName, setDriverName] = useState('')
  const [startDate,  setStartDate]  = useState(week.start)
  const [endDate,    setEndDate]    = useState(week.end)
  const [loads,      setLoads]      = useState([])
  const [payAmounts, setPayAmounts] = useState({})   // loadId → string
  const [additions,  setAdditions]  = useState([{ ...BLANK }])
  const [deductions, setDeductions] = useState([{ ...BLANK }])
  const [loading,    setLoading]    = useState(false)
  const [loaded,     setLoaded]     = useState(false)
  const [error,      setError]      = useState(null)
  const [showPrint,  setShowPrint]  = useState(false)

  async function loadLoads() {
    if (!driverName) return
    setLoading(true)
    setError(null)
    setLoaded(false)
    try {
      const data = await fetchDriverLoads(driverName, startDate, endDate)
      setLoads(data)
      const init = {}
      data.forEach(l => { init[l.id] = '' })
      setPayAmounts(init)
      setLoaded(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function updateLine(arr, setArr, idx, field, value) {
    setArr(arr.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }
  function addLine(setArr)          { setArr(prev => [...prev, { ...BLANK }]) }
  function removeLine(arr, setArr, idx) { setArr(arr.filter((_, i) => i !== idx)) }

  const loadTotal  = loads.reduce((s, l) => s + (Number(payAmounts[l.id]) || 0), 0)
  const addTotal   = additions.reduce((s, a) => s + (Number(a.amount) || 0), 0)
  const dedTotal   = deductions.reduce((s, d) => s + (Number(d.amount) || 0), 0)
  const grandTotal = loadTotal + addTotal - dedTotal

  const selectedDriver = drivers.find(d => d.name === driverName) || {}
  const driverCompany  = loads[0]?.company || company || 'carat'

  return (
    <div className="acct-tab-content">

      {/* ── Controls ── */}
      <div className="paystub-controls">
        <div className="form-group">
          <label>Driver</label>
          <input
            list="ps-driver-list"
            value={driverName}
            onChange={e => setDriverName(e.target.value)}
            placeholder="Type driver name…"
            className="paystub-driver-input"
          />
          <datalist id="ps-driver-list">
            {drivers.map(d => <option key={d.id} value={d.name} />)}
          </datalist>
        </div>
        <div className="form-group">
          <label>From</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label>To</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <div className="form-group form-group-btn">
          <label>&nbsp;</label>
          <button className="btn btn-primary" onClick={loadLoads} disabled={!driverName || loading}>
            {loading ? 'Loading…' : 'Load Loads'}
          </button>
        </div>
      </div>

      {error && <div className="acct-error">{error}</div>}

      {/* ── No results ── */}
      {loaded && loads.length === 0 && (
        <div className="acct-empty">No loads found for <strong>{driverName}</strong> in this period.</div>
      )}

      {/* ── Load table ── */}
      {loads.length > 0 && (
        <>
          <table className="acct-table acct-table-paystub">
            <thead>
              <tr>
                <th>Load #</th>
                <th>Pickup</th>
                <th>Delivery</th>
                <th>Route</th>
                <th>Loaded Mi</th>
                <th>Empty Mi</th>
                <th>Pay ($)</th>
              </tr>
            </thead>
            <tbody>
              {loads.map(l => (
                <tr key={l.id}>
                  <td>{l.load_number || '—'}</td>
                  <td>{l.pickup_date  || l.date || '—'}</td>
                  <td>{l.delivery_date || '—'}</td>
                  <td className="acct-route">
                    {l.pickup_location && l.delivery_location
                      ? `${l.pickup_location.split(',')[0]} → ${l.delivery_location.split(',')[0]}`
                      : '—'}
                  </td>
                  <td>{l.total_miles || '—'}</td>
                  <td>{l.empty_miles || '—'}</td>
                  <td>
                    <input
                      type="number"
                      className="pay-amount-input"
                      placeholder="0.00"
                      value={payAmounts[l.id] ?? ''}
                      onChange={e => setPayAmounts(p => ({ ...p, [l.id]: e.target.value }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6} className="acct-subtotal-label">Sub-Total</td>
                <td className="acct-subtotal-val">{fmt(loadTotal)}</td>
              </tr>
            </tfoot>
          </table>

          {/* ── Additions & Deductions ── */}
          <div className="adddeds-grid">

            <div className="addded-section">
              <div className="addded-header">
                <span>Additions</span>
                <button className="btn btn-ghost btn-xs" onClick={() => addLine(setAdditions)}>+ Add</button>
              </div>
              {additions.map((a, i) => (
                <div key={i} className="addded-row">
                  <input
                    placeholder="Description"
                    value={a.label}
                    onChange={e => updateLine(additions, setAdditions, i, 'label', e.target.value)}
                  />
                  <input
                    type="number"
                    placeholder="0.00"
                    value={a.amount}
                    onChange={e => updateLine(additions, setAdditions, i, 'amount', e.target.value)}
                  />
                  {additions.length > 1 && (
                    <button className="stop-remove" onClick={() => removeLine(additions, setAdditions, i)}>✕</button>
                  )}
                </div>
              ))}
              {addTotal > 0 && <div className="addded-total">+{fmt(addTotal)}</div>}
            </div>

            <div className="addded-section">
              <div className="addded-header">
                <span>Deductions</span>
                <button className="btn btn-ghost btn-xs" onClick={() => addLine(setDeductions)}>+ Add</button>
              </div>
              {deductions.map((d, i) => (
                <div key={i} className="addded-row">
                  <input
                    placeholder="Description"
                    value={d.label}
                    onChange={e => updateLine(deductions, setDeductions, i, 'label', e.target.value)}
                  />
                  <input
                    type="number"
                    placeholder="0.00"
                    value={d.amount}
                    onChange={e => updateLine(deductions, setDeductions, i, 'amount', e.target.value)}
                  />
                  {deductions.length > 1 && (
                    <button className="stop-remove" onClick={() => removeLine(deductions, setDeductions, i)}>✕</button>
                  )}
                </div>
              ))}
              {dedTotal > 0 && <div className="addded-total" style={{ color: '#DC2626' }}>-{fmt(dedTotal)}</div>}
            </div>
          </div>

          {/* ── Grand Total ── */}
          <div className="paystub-grand-total">
            <span>Grand Total</span>
            <span className="paystub-grand-amount">{fmt(grandTotal)}</span>
          </div>

          <div className="paystub-actions">
            <button className="btn btn-primary" onClick={() => setShowPrint(true)}>
              Generate Paystub
            </button>
          </div>
        </>
      )}

      {showPrint && (
        <PaystubPrintModal
          driver={{ name: driverName, phone: selectedDriver.phone, hometown: selectedDriver.hometown }}
          startDate={startDate}
          endDate={endDate}
          loads={loads}
          payAmounts={payAmounts}
          additions={additions.filter(a => a.label || a.amount)}
          deductions={deductions.filter(d => d.label || d.amount)}
          company={driverCompany}
          onClose={() => setShowPrint(false)}
        />
      )}
    </div>
  )
}
