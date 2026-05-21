import { useState, useMemo } from 'react'
import { fetchDriverLoads, createPaystub, updatePaystub, usePaystubHistory, fetchPaystubLoads } from '../../hooks/useAccounting'
import { useDriverProfiles } from '../../hooks/useDriverProfiles'
import DriversPanel from './DriversPanel'
import PaystubPrintModal from './PaystubPrintModal'

const fmtDate = s => s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const fmt     = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })

// ── Default deductions by profile type ────────────────────────────────────
function defaultDeductions(profileType) {
  if (profileType === 'owner_operator') {
    return [
      { label: 'Commission',         amount: '', balance: '', isCommission: true },
      { label: 'Fuel',               amount: '', balance: '', isFuel: true },
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

export default function PaystubsTab({ drivers, company }) {
  const week = currentWeek()
  const { profiles, inactiveProfiles, loading: profLoading, saveProfile, removeProfile, reactivateProfile, fetchInactive } = useDriverProfiles()
  const { paystubs, loading: histLoading, refresh: refreshHistory } = usePaystubHistory(company)

  // ── Tab: 'generate' | 'history' ─────────────────────────────────────────
  const [psTab, setPsTab] = useState('generate')

  // History — open a past paystub for reprint
  const [historyModal, setHistoryModal] = useState(null)   // { paystub, loads }
  async function openHistoryPaystub(ps) {
    try {
      const loads = await fetchPaystubLoads(ps.id)
      setHistoryModal({ paystub: ps, loads })
    } catch (e) { alert(e.message) }
  }

  // Edit mode — pre-populate the generate form with a historical paystub
  const [editingPaystubId, setEditingPaystubId] = useState(null)

  function openEditMode(ps, psLoads) {
    setDriverName(ps.driver_name)
    setStartDate(ps.start_date)
    setEndDate(ps.end_date)
    setLoads(psLoads)
    setLoadPay(ps.load_pay || {})
    setAdditions((ps.additions || []).length ? ps.additions : [{ ...BLANK_LINE }])
    setDeductions((ps.deductions || []).length ? ps.deductions : [{ ...BLANK_LINE }])
    setCommissionPct(ps.commission_pct ?? 15)
    // Restore fuel total from saved deductions
    const fuelDed = (ps.deductions || []).find(d => d.isFuel)
    setFuelTotal(fuelDed?.amount ? String(fuelDed.amount) : '')
    setFuelText(ps.fuel_text || '')
    setLoaded(true)
    setEditingPaystubId(ps.id)
    setHistoryModal(null)
    setPsTab('generate')
  }

  function cancelEdit() {
    setEditingPaystubId(null)
    setLoads([])
    setLoaded(false)
    setLoadPay({})
    setAdditions([{ ...BLANK_LINE }])
    setDeductions([{ ...BLANK_LINE }])
    setFuelTotal('')
    setFuelText('')
    setDriverName('')
    setPsTab('history')
  }

  // ── History filters ──────────────────────────────────────────────────────
  const [histSearch,    setHistSearch]    = useState('')
  const [histFromDate,  setHistFromDate]  = useState('')
  const [histToDate,    setHistToDate]    = useState('')

  const filteredPaystubs = useMemo(() => {
    let list = paystubs
    if (histSearch.trim()) {
      const q = histSearch.trim().toLowerCase()
      list = list.filter(ps => (ps.driver_name || '').toLowerCase().includes(q))
    }
    if (histFromDate) list = list.filter(ps => (ps.start_date || '') >= histFromDate)
    if (histToDate)   list = list.filter(ps => (ps.end_date   || '') <= histToDate)
    return list
  }, [paystubs, histSearch, histFromDate, histToDate])

  // ── Paystub generator state ──────────────────────────────────────────────
  const [driverName, setDriverName] = useState('')
  const [startDate,  setStartDate]  = useState(week.start)
  const [endDate,    setEndDate]    = useState(week.end)
  const [dateField,  setDateField]  = useState('pickup_date')  // 'pickup_date' | 'delivery_date'
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

  // Fuel transactions (owner operators only)
  const [fuelTotal,       setFuelTotal]       = useState('')
  const [fuelText,        setFuelText]        = useState('')
  const [fuelOpen,        setFuelOpen]        = useState(true)

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
      const data = await fetchDriverLoads(driverName, startDate, endDate, dateField)
      setLoads(data)
      // Initialize pay per load
      const init = {}
      data.forEach(l => {
        if (isOO) {
          // Owner operator: gross = load price
          init[l.id] = { amount: String(l.price || ''), emptyMiles: String(l.empty_miles || '') }
        } else if (isPerMile) {
          // Company driver per mile: auto-calc (loaded + empty) * rate
          const miles = l.total_miles || 0
          const empty = l.empty_miles || 0
          const rate  = profile?.pay_rate || 0
          init[l.id] = { miles: String(miles), emptyMiles: String(empty || ''), rate: String(rate), amount: String(((miles + empty) * rate).toFixed(2)) }
        } else {
          // Flat rate or no profile: blank
          init[l.id] = { amount: '', emptyMiles: String(l.empty_miles || '') }
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
  // Per-mile total = (loaded miles + empty miles) * rate
  function calcAmount(entry) {
    const loaded = Number(entry.miles)      || 0
    const empty  = Number(entry.emptyMiles) || 0
    const rate   = Number(entry.rate)       || 0
    return String(((loaded + empty) * rate).toFixed(2))
  }
  function updateLoadMiles(id, miles) {
    setLoadPay(p => {
      const entry = { ...p[id], miles }
      entry.amount = calcAmount(entry)
      return { ...p, [id]: entry }
    })
  }
  function updateLoadRate(id, rate) {
    setLoadPay(p => {
      const entry = { ...p[id], rate }
      entry.amount = calcAmount(entry)
      return { ...p, [id]: entry }
    })
  }
  function updateLoadEmptyMiles(id, emptyMiles) {
    setLoadPay(p => {
      const entry = { ...p[id], emptyMiles }
      if (isPerMile && (entry.payType ?? 'per_mile') === 'per_mile') entry.amount = calcAmount(entry)
      return { ...p, [id]: entry }
    })
  }
  function updateLoadPayType(id, payType) {
    setLoadPay(p => {
      const entry = { ...p[id], payType }
      if (payType === 'per_mile') entry.amount = calcAmount(entry)  // recalc when switching back
      if (payType === 'flat')     entry.amount = ''                 // clear so user types manually
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

  // Fill commission + fuel amounts into deductions for display/total calc
  const effectiveDeds = deductions.map(d =>
    d.isCommission ? { ...d, amount: commissionAmt.toFixed(2) } :
    d.isFuel && fuelTotal !== '' ? { ...d, amount: fuelTotal } :
    d
  )
  const dedTotal  = effectiveDeds.reduce((s, d) => s + (Number(d.amount) || 0), 0)
  const grandTotal = loadTotal + addTotal - dedTotal

  const selectedDriver = drivers.find(d => d.name === driverName) || {}
  const driverCompany  = loads[0]?.company || profile?.company || 'carat'

  // ── Mark paystub as paid (or save edits) ────────────────────────────────
  async function handleMarkPaid() {
    const paystubData = {
      driver_name:    driverName,
      company:        driverCompany,
      start_date:     startDate,
      end_date:       endDate,
      load_total:     loadTotal,
      grand_total:    grandTotal,
      commission_pct: isOO ? Number(commissionPct) : null,
      additions:      additions.filter(a => a.label || a.amount),
      deductions:     effectiveDeds.filter(d => d.label || d.amount),
      load_pay:       loadPay,
      fuel_text:      (isOO && fuelText) ? fuelText : null,
    }
    if (editingPaystubId) {
      await updatePaystub(editingPaystubId, paystubData)
      setEditingPaystubId(null)
    } else {
      await createPaystub(paystubData, loads.map(l => l.id))
    }
    await refreshHistory()
    setShowPrint(false)
    // Reset form
    setLoads([])
    setLoaded(false)
    setLoadPay({})
    setAdditions([{ ...BLANK_LINE }])
    setDeductions([{ ...BLANK_LINE }])
    setFuelTotal('')
    setFuelText('')
    setPsTab('history')
  }

  return (
    <div className="acct-tab-content">

      {/* ── Sub-tab toggle ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          className={`btn ${psTab === 'generate' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setPsTab('generate')}
        >Generate Paystub</button>
        <button
          className={`btn ${psTab === 'history' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setPsTab('history')}
        >History ({paystubs.length})</button>
      </div>

      {/* ── History tab ── */}
      {psTab === 'history' && (
        <>
          {histLoading ? (
            <div style={{ color: '#9CA3AF' }}>Loading…</div>
          ) : (
            <>
              {/* Filter bar */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Search driver name…"
                  value={histSearch}
                  onChange={e => setHistSearch(e.target.value)}
                  style={{ width: 200, fontSize: 13 }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <label style={{ color: '#6B7280', whiteSpace: 'nowrap' }}>Period from</label>
                  <input type="date" value={histFromDate} onChange={e => setHistFromDate(e.target.value)} style={{ fontSize: 13, padding: '4px 8px', border: '1px solid #D1D5DB', borderRadius: 6 }} />
                  <label style={{ color: '#6B7280' }}>to</label>
                  <input type="date" value={histToDate} onChange={e => setHistToDate(e.target.value)} style={{ fontSize: 13, padding: '4px 8px', border: '1px solid #D1D5DB', borderRadius: 6 }} />
                </div>
                {(histSearch || histFromDate || histToDate) && (
                  <button className="btn btn-ghost btn-xs" onClick={() => { setHistSearch(''); setHistFromDate(''); setHistToDate('') }}>
                    ✕ Clear
                  </button>
                )}
                <span style={{ fontSize: 12, color: '#9CA3AF', marginLeft: 'auto' }}>
                  {filteredPaystubs.length} of {paystubs.length} paystub{paystubs.length !== 1 ? 's' : ''}
                </span>
              </div>

              {filteredPaystubs.length === 0 ? (
                <div className="acct-empty">
                  {paystubs.length === 0
                    ? 'No paystubs generated yet. Generate and mark a paystub as paid to see it here.'
                    : 'No paystubs match your filters.'}
                </div>
              ) : (
                <table className="acct-table">
                  <thead>
                    <tr>
                      <th>Driver</th>
                      <th>Period</th>
                      <th>Company</th>
                      <th>Created</th>
                      <th style={{ textAlign: 'right' }}>Grand Total</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPaystubs.map(ps => (
                      <tr key={ps.id} style={{ cursor: 'pointer' }} onClick={() => openHistoryPaystub(ps)}>
                        <td><strong>{ps.driver_name}</strong></td>
                        <td>{ps.start_date} – {ps.end_date}</td>
                        <td>{ps.company === 'carat' ? 'Carat' : 'Pro Freight'}</td>
                        <td>{fmtDate(ps.created_at)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(ps.grand_total)}</td>
                        <td className="acct-click-hint">View / Reprint</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </>
      )}

      {psTab === 'generate' && <>

      {/* ── Edit mode banner ── */}
      {editingPaystubId && (
        <div className="paystub-edit-banner">
          <span>✏ Editing historical paystub for <strong>{driverName}</strong> — {startDate} to {endDate}</span>
          <button className="btn btn-ghost btn-xs" onClick={cancelEdit}>✕ Cancel Edit</button>
        </div>
      )}

      {/* ── Driver Profiles Panel ── */}
      <DriversPanel
        profiles={profiles}
        inactiveProfiles={inactiveProfiles}
        drivers={drivers}
        saveProfile={saveProfile}
        removeProfile={removeProfile}
        reactivateProfile={reactivateProfile}
        fetchInactive={fetchInactive}
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
        <div className="form-group">
          <label>Date By</label>
          <select value={dateField} onChange={e => setDateField(e.target.value)} style={{ fontSize: 13 }}>
            <option value="pickup_date">Pickup Date</option>
            <option value="delivery_date">Delivery Date</option>
          </select>
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
                {isPerMile && <th>Type</th>}
                {isPerMile && <><th>Loaded Mi</th><th>Empty Mi</th><th>Rate</th></>}
                {!isPerMile && <><th>Loaded Mi</th><th>Empty Mi</th></>}
                <th>{isOO ? 'Gross ($)' : 'Pay ($)'}</th>
              </tr>
            </thead>
            <tbody>
              {loads.map(l => {
                const pay = loadPay[l.id] || {}
                const flatLoad = isPerMile && (pay.payType ?? 'per_mile') === 'flat'
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
                    {isPerMile && (
                      <td>
                        <select
                          className="pay-type-select"
                          value={pay.payType ?? 'per_mile'}
                          onChange={e => updateLoadPayType(l.id, e.target.value)}
                        >
                          <option value="per_mile">$/mi</option>
                          <option value="flat">Flat Rate</option>
                        </select>
                      </td>
                    )}
                    {isPerMile ? (
                      <>
                        <td>
                          <input type="number" className="pay-amount-input" value={pay.miles ?? ''}
                            disabled={flatLoad}
                            style={flatLoad ? { background: '#F3F4F6', color: '#9CA3AF' } : {}}
                            onChange={e => updateLoadMiles(l.id, e.target.value)} />
                        </td>
                        <td>
                          <input type="number" className="pay-amount-input" placeholder="0" value={pay.emptyMiles ?? ''}
                            disabled={flatLoad}
                            style={flatLoad ? { background: '#F3F4F6', color: '#9CA3AF' } : {}}
                            onChange={e => updateLoadEmptyMiles(l.id, e.target.value)} />
                        </td>
                        <td>
                          <input type="number" className="pay-amount-input" style={{ width: 70, ...(flatLoad ? { background: '#F3F4F6', color: '#9CA3AF' } : {}) }}
                            step="0.01" value={pay.rate ?? ''}
                            disabled={flatLoad}
                            onChange={e => updateLoadRate(l.id, e.target.value)} />
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{l.total_miles || '—'}</td>
                        <td>
                          <input type="number" className="pay-amount-input" placeholder="0" value={pay.emptyMiles ?? ''} onChange={e => updateLoadEmptyMiles(l.id, e.target.value)} />
                        </td>
                      </>
                    )}
                    <td>
                      <input
                        type="number"
                        className="pay-amount-input"
                        placeholder="0.00"
                        value={pay.amount ?? ''}
                        readOnly={isPerMile && !flatLoad}
                        style={isPerMile && !flatLoad ? { background: '#F3F4F6', color: '#374151' } : {}}
                        onChange={e => updateLoadAmount(l.id, e.target.value)}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={isPerMile ? 8 : 6} className="acct-subtotal-label">Sub-Total</td>
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

          {/* ── Fuel Transactions (OO only) ── */}
          {isOO && (
            <div className="fuel-section">
              <div className="fuel-section-header" onClick={() => setFuelOpen(o => !o)}>
                <span>⛽ Fuel Transactions</span>
                <span style={{ fontSize: 12, color: '#6B7280' }}>{fuelOpen ? '▾ Collapse' : '▸ Expand'}</span>
              </div>
              {fuelOpen && (
                <div className="fuel-section-body">
                  <div className="fuel-total-row">
                    <label>Total Fuel This Week ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={fuelTotal}
                      onChange={e => setFuelTotal(e.target.value)}
                      className="pay-amount-input"
                    />
                    <span style={{ fontSize: 12, color: '#6B7280' }}>← auto-fills the Fuel deduction</span>
                  </div>
                  <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>
                    Paste Fuel Transactions (prints on paystub as reference)
                  </label>
                  <textarea
                    className="fuel-transactions-textarea"
                    placeholder={'Paste fuel card transactions here…\ne.g.:\n05/15 Pilot #1234 Columbus OH  $312.45\n05/17 Love\'s #5678 Indianapolis IN  $289.10'}
                    value={fuelText}
                    onChange={e => setFuelText(e.target.value)}
                  />
                  <div className="fuel-hint">Tip: copy from your fuel card report and paste directly here.</div>
                </div>
              )}
            </div>
          )}

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
          fuelText={isOO && fuelText ? fuelText : null}
          company={driverCompany}
          isEdit={!!editingPaystubId}
          onMarkPaid={handleMarkPaid}
          onClose={() => setShowPrint(false)}
        />
      )}

      </> /* end psTab === 'generate' */}

      {/* ── History paystub reprint modal ── */}
      {historyModal && (
        <PaystubPrintModal
          driver={{ name: historyModal.paystub.driver_name }}
          profile={profiles.find(p => p.driver_name === historyModal.paystub.driver_name)}
          startDate={historyModal.paystub.start_date}
          endDate={historyModal.paystub.end_date}
          loads={historyModal.loads}
          loadPay={historyModal.paystub.load_pay || {}}
          additions={historyModal.paystub.additions || []}
          deductions={historyModal.paystub.deductions || []}
          commissionPct={historyModal.paystub.commission_pct}
          fuelText={historyModal.paystub.fuel_text}
          company={historyModal.paystub.company || 'carat'}
          isHistory
          onEdit={() => openEditMode(historyModal.paystub, historyModal.loads)}
          onClose={() => setHistoryModal(null)}
        />
      )}
    </div>
  )
}
