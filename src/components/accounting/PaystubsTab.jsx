import { useState, useMemo } from 'react'
import { fetchDriverLoads } from '../../hooks/useAccounting'
import { useDriverProfiles } from '../../hooks/useDriverProfiles'
import DriversPanel from './DriversPanel'
import PaystubPrintModal from './PaystubPrintModal'

// ── Default deductions by profile type ────────────────────────────────────
function defaultDeductions(profileType) {
  if (profileType === 'owner_operator') {
    return [
      { label: 'Commission',         amount: '', balance: '', isCommission: true },
      { label: 'Trailer Rent',        amount: '', balance: '' },
      { label: 'Tractor Payment',     amount: '', balance: '' },
      { label: 'Wire Transaction',    amount: '', balance: '' },
      { label: 'Escrow',              amount: '', balance: '$2000' },
      { label: 'Physical Insurance',  amount: '', balance: '' },
      { label: 'Cargo Insurance',     amount: '', balance: '' },
      { label: 'ELD',                 amount: '', balance: '' },
      { label: 'IFTA',                amount: '', balance: '' },
      { label: 'Cash Advance',        amount: '', balance: '' },
    ]
  }
  // company driver
  return [
    { label: 'Cash Advance',     amount: '', balance: '' },
    { label: 'Escrow',           amount: '', balance: '$1500' },
    { label: 'Wire Transaction', amount: '', balance: '' },
  ]
}

function currentWeek() {
  const today = new Date()
  const day   = today.getDay()
  const mon   = new Date(today)
  mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  const iso = d => d.toISOString().split('T')[0]
  return { start: iso(mon), end: iso(sun) }
}

const BLANK_LINE = { label: '', amount: '', balance: '' }
const fmt = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })

export default function PaystubsTab({ drivers, company }) {
  const week = currentWeek()
  const { profiles, loading: profLoading, saveProfile, removeProfile } = useDriverProfiles()

  // ── Paystub generator state ──────────────────────────────────────────────
  const [driverName, setDriverName] = useState('')
  const [startDate,  setStartDate]  = useState(week.start)
  const [endDate,    setEndDate]    = useState(week.end)
  const [loads,      setLoads]      = useState([])
  const [loaded,     setLoaded]     = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const [showPrint,  setShowPrint]  = useState(false)

  // Per-load pay state: { id: { miles, rate, amount } }
  const [loadPay, setLoadPay] = useState({})

  // Additions & deductions
  const [additions,  setAdditions]  = useState([{ ...BLANK_LINE }])
  const [deductions, setDeductions] = useState([{ ...BLANK_LINE }])

  // Commission % (for owner operators — shown above deductions)
  const [commissionPct, setCommissionPct] = useState(15)

  // ── Get active profile for selected driver ───────────────────────────────
  const profile = useMemo(() =>
    profiles.find(p => p.driver_name === driverName) || null
  , [profiles, driverName])

  const isOO      = profile?.profile_type === 'owner_operator'
  const isPerMile = profile?.pay_type === 'per_mile' && !isOO

  // ── Load loads for driver + date range ──────────────────────────────────
  async function loadLoads() {
    if (!driverName) return
    setLoading(true)
    setError(null)
    setLoaded(false)
    try {
      const data = await fetchDriverLoads(driverName, startDate, endDate)
      setLoads(data)
      // Initialize pay per load
      const init = {}
      data.forEach(l => {
        if (isOO) {
          // Owner operator: gross = load price
          init[l.id] = { amount: String(l.price || '') }
        } else if (isPerMile) {
          // Company driver per mile: auto-calc
          const miles = l.total_miles || 0
          const rate  = profile?.pay_rate || 0
          init[l.id] = { miles: String(miles), rate: String(rate), amount: String((miles * rate).toFixed(2)) }
        } else {
          // Flat rate or no profile: blank
          init[l.id] = { amount: '' }
        }
      })
      setLoadPay(init)
      // Pre-populate deductions
      if (profile) {
        setDeductions(defaultDeductions(profile.profile_type))
        if (isOO) setCommissionPct(profile.commission_pct ?? 15)
      }
      setLoaded(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Load pay calculations ────────────────────────────────────────────────
  function updateLoadMiles(id, miles) {
    setLoadPay(p => {
      const entry = { ...p[id], miles }
      entry.amount = String(((Number(miles) || 0) * (Number(entry.rate) || 0)).toFixed(2))
      return { ...p, [id]: entry }
    })
  }
  function updateLoadRate(id, rate) {
    setLoadPay(p => {
      const entry = { ...p[id], rate }
      entry.amount = String(((Number(p[id]?.miles) || 0) * (Number(rate) || 0)).toFixed(2))
      return { ...p, [id]: entry }
    })
  }
  function updateLoadAmount(id, amount) {
    setLoadPay(p => ({ ...p, [id]: { ...p[id], amount } }))
  }

  // ── Additions / deductions helpers ──────────────────────────────────────
  function updateLine(arr, setArr, idx, field, value) {
    setArr(arr.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }
  function addLine(setArr)          { setArr(prev => [...prev, { ...BLANK_LINE }]) }
  function removeLine(arr, setArr, idx) { setArr(arr.filter((_, i) => i !== idx)) }

  // ── Totals ───────────────────────────────────────────────────────────────
  const loadTotal = loads.reduce((s, l) => s + (Number(loadPay[l.id]?.amount) || 0), 0)
  const addTotal  = additions.reduce((s, a) => s + (Number(a.amount) || 0), 0)

  // Commission auto-calc for OO — applies to commissionable deduction row
  const commissionAmt = isOO ? (loadTotal * (Number(commissionPct) || 0) / 100) : 0

  // Fill commission amount into deductions for display/total calc
  const effectiveDeds = deductions.map(d =>
    d.isCommission ? { ...d, amount: commissionAmt.toFixed(2) } : d
  )
  const dedTotal  = effectiveDeds.reduce((s, d) => s + (Number(d.amount) || 0), 0)
  const grandTotal = loadTotal + addTotal - dedTotal

  const selectedDriver = drivers.find(d => d.name === driverName) || {}
  const driverCompany  = loads[0]?.company || profile?.company || 'carat'

  return (
    <div className="acct-tab-content">

      {/* ── Driver Profiles Panel ── */}
      <DriversPanel
        profiles={profiles}
        drivers={drivers}
        saveProfile={saveProfile}
        removeProfile={removeProfile}
      />

      <div className="paystub-section-divider" />

      {/* ── Generate Paystub Controls ── */}
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
            {profiles.map(p => <option key={p.id} value={p.driver_name} />)}
            {drivers.filter(d => !profiles.find(p => p.driver_name === d.name)).map(d => <option key={d.id} value={d.name} />)}
          </datalist>
        </div>
        {profile && (
          <div className="paystub-profile-badge">
            <span className={`profile-badge ${isOO ? 'badge-oo' : 'badge-co'}`}>
              {isOO ? 'Owner Operator' : 'Company Driver'}
            </span>
            {isPerMile && <span className="paystub-rate-hint">${profile.pay_rate}/mi</span>}
            {isOO      && <span className="paystub-rate-hint">{commissionPct}% commission</span>}
          </div>
        )}
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
                {isPerMile && <><th>Loaded Mi</th><th>Empty Mi</th><th>Rate</th></>}
                {!isPerMile && <><th>Loaded Mi</th><th>Empty Mi</th></>}
                <th>{isOO ? 'Gross ($)' : isPerMile ? 'Pay ($)' : 'Pay ($)'}</th>
              </tr>
            </thead>
            <tbody>
              {loads.map(l => {
                const pay = loadPay[l.id] || {}
                return (
                  <tr key={l.id}>
                    <td>{l.load_number || '—'}</td>
                    <td>{l.pickup_date  || l.date || '—'}</td>
                    <td>{l.delivery_date || '—'}</td>
                    <td className="acct-route">
                      {l.pickup_location && l.delivery_location
                        ? `${l.pickup_location.split(',')[0]} → ${l.delivery_location.split(',')[0]}`
                        : '—'}
                    </td>
                    {isPerMile ? (
                      <>
                        <td>
                          <input type="number" className="pay-amount-input" value={pay.miles ?? ''} onChange={e => updateLoadMiles(l.id, e.target.value)} />
                        </td>
                        <td>{l.empty_miles || '—'}</td>
                        <td>
                          <input type="number" className="pay-amount-input" style={{ width: 70 }} step="0.01" value={pay.rate ?? ''} onChange={e => updateLoadRate(l.id, e.target.value)} />
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{l.total_miles || '—'}</td>
                        <td>{l.empty_miles || '—'}</td>
                      </>
                    )}
                    <td>
                      <input
                        type="number"
                        className="pay-amount-input"
                        placeholder="0.00"
                        value={pay.amount ?? ''}
                        onChange={e => updateLoadAmount(l.id, e.target.value)}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={isPerMile ? 7 : 6} className="acct-subtotal-label">Sub-Total</td>
                <td className="acct-subtotal-val">{fmt(loadTotal)}</td>
              </tr>
            </tfoot>
          </table>

          {/* ── Additions & Deductions ── */}
          <div className="adddeds-grid">

            {/* Additions */}
            <div className="addded-section">
              <div className="addded-header">
                <span>Additions</span>
                <button className="btn btn-ghost btn-xs" onClick={() => addLine(setAdditions)}>+ Add</button>
              </div>
              {additions.map((a, i) => (
                <div key={i} className="addded-row addded-row-3">
                  <input placeholder="Description" value={a.label} onChange={e => updateLine(additions, setAdditions, i, 'label', e.target.value)} />
                  <input type="number" placeholder="0.00" value={a.amount} onChange={e => updateLine(additions, setAdditions, i, 'amount', e.target.value)} />
                  <input placeholder="Balance" value={a.balance} onChange={e => updateLine(additions, setAdditions, i, 'balance', e.target.value)} />
                  {additions.length > 1 && <button className="stop-remove" onClick={() => removeLine(additions, setAdditions, i)}>✕</button>}
                </div>
              ))}
              {addTotal > 0 && <div className="addded-total">+{fmt(addTotal)}</div>}
            </div>

            {/* Deductions */}
            <div className="addded-section">
              <div className="addded-header">
                <span>Deductions</span>
                <button className="btn btn-ghost btn-xs" onClick={() => addLine(setDeductions)}>+ Add</button>
              </div>

              {/* Commission % control for OO */}
              {isOO && (
                <div className="commission-control">
                  <span>Commission:</span>
                  <input
                    type="number"
                    className="pay-amount-input"
                    style={{ width: 60 }}
                    value={commissionPct}
                    onChange={e => setCommissionPct(e.target.value)}
                  />
                  <span>% = {fmt(commissionAmt)}</span>
                </div>
              )}

              {deductions.map((d, i) => {
                const isComm = d.isCommission
                const displayAmount = isComm ? commissionAmt.toFixed(2) : d.amount
                return (
                  <div key={i} className="addded-row addded-row-3">
                    <input
                      placeholder="Description"
                      value={d.label}
                      readOnly={isComm}
                      style={isComm ? { background: '#F3F4F6', color: '#6B7280' } : {}}
                      onChange={e => updateLine(deductions, setDeductions, i, 'label', e.target.value)}
                    />
                    <input
                      type="number"
                      placeholder="0.00"
                      value={displayAmount}
                      readOnly={isComm}
                      style={isComm ? { background: '#F3F4F6', color: '#6B7280' } : {}}
                      onChange={e => updateLine(deductions, setDeductions, i, 'amount', e.target.value)}
                    />
                    <input
                      placeholder="Balance (e.g. 5/12)"
                      value={d.balance}
                      onChange={e => updateLine(deductions, setDeductions, i, 'balance', e.target.value)}
                    />
                    {deductions.length > 1 && !isComm && (
                      <button className="stop-remove" onClick={() => removeLine(deductions, setDeductions, i)}>✕</button>
                    )}
                  </div>
                )
              })}
              {dedTotal > 0 && <div className="addded-total" style={{ color: '#DC2626' }}>-{fmt(dedTotal)}</div>}
            </div>
          </div>

          <div className="addded-col-labels">
            <span>Description</span>
            <span>Amount ($)</span>
            <span>Balance / Notes</span>
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
          profile={profile}
          startDate={startDate}
          endDate={endDate}
          loads={loads}
          loadPay={loadPay}
          additions={additions.filter(a => a.label || a.amount)}
          deductions={effectiveDeds.filter(d => d.label || d.amount)}
          commissionPct={isOO ? commissionPct : null}
          company={driverCompany}
          onClose={() => setShowPrint(false)}
        />
      )}
    </div>
  )
}
