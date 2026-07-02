import { useState, useMemo } from 'react'
import { fetchDriverLoads, createPaystub, updatePaystub, usePaystubHistory, fetchPaystubLoads, useYTDSummary } from '../../hooks/useAccounting'
import { fetchDriverLedgerEntries, markLedgerEntriesApplied, EXPENSE_CONFIG } from '../../hooks/useLedger'
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

  // ── Tab: 'generate' | 'history' | 'ytd' ────────────────────────────────
  const [psTab, setPsTab] = useState('generate')

  // ── YTD ─────────────────────────────────────────────────────────────────
  const currentYear = new Date().getFullYear()
  const [ytdYear, setYtdYear] = useState(currentYear)
  const { rows: ytdRows, loading: ytdLoading, refresh: ytdRefresh } = useYTDSummary(company, ytdYear)
  const [ytdExpanded, setYtdExpanded] = useState({})
  const yearOptions = Array.from({ length: 4 }, (_, i) => currentYear - i)

  // History — open a past paystub for reprint
  const [historyModal, setHistoryModal] = useState(null)   // { paystub, loads }
  async function openHistoryPaystub(ps) {
    try {
      const loads = await fetchPaystubLoads(ps.id)
      setHistoryModal({ paystub: ps, loads })
    } catch (e) { alert(e.message) }
  }

  // Edit mode — pre-populate the generate form with a historical paystub
  const [editingPaystubId,   setEditingPaystubId]   = useState(null)
  // Loads that already belong to the paystub being edited (already marked paid)
  const [editingBaseLoads,   setEditingBaseLoads]   = useState([])

  function openEditMode(ps, psLoads) {
    setDriverName(ps.driver_name)
    setStartDate(ps.start_date)
    setEndDate(ps.end_date)
    setLoads(psLoads)
    setEditingBaseLoads(psLoads)
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
    setEditingBaseLoads([])
    setLoads([])
    setLoaded(false)
    setLoadPay({})
    setAdditions([{ ...BLANK_LINE }])
    setDeductions([{ ...BLANK_LINE }])
    setFuelTotal('')
    setFuelText('')
    setDriverName('')
    setPendingLedger([])
    setSelectedLedgerIds(new Set())
    setStagedLedgerIds(new Set())
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

  // Pending ledger entries for this driver (checklist)
  const [pendingLedger,    setPendingLedger]    = useState([])
  const [selectedLedgerIds, setSelectedLedgerIds] = useState(new Set())
  // IDs that have been "Added to Paystub" — marked applied on save
  const [stagedLedgerIds,   setStagedLedgerIds]  = useState(new Set())

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
      // fetchDriverLoads only returns unpaid loads; in edit mode we must also
      // keep the already-paid loads from the paystub being edited.
      const freshData = await fetchDriverLoads(driverName, startDate, endDate, dateField, profile?.profile_type)

      let finalLoads
      let initPay

      if (editingPaystubId && editingBaseLoads.length > 0) {
        // ── Edit mode: merge base (already-paid) loads + new unpaid loads ──
        const baseIds     = new Set(editingBaseLoads.map(l => l.id))
        const onlyNewLoads = freshData.filter(l => !baseIds.has(l.id))
        finalLoads = [...editingBaseLoads, ...onlyNewLoads]

        // Keep existing loadPay for base loads; init pay only for truly new ones
        initPay = { ...loadPay }
        onlyNewLoads.forEach(l => {
          initPay[l.id] = initLoadPayEntry(l)
        })

        // Also fetch any new pending ledger entries added since the paystub was generated
        const ledger = await fetchDriverLedgerEntries(driverName)
        setPendingLedger(ledger)
        setSelectedLedgerIds(new Set(ledger.map(e => e.id)))
      } else {
        // ── Normal mode: full replace ──
        finalLoads = freshData
        initPay = {}
        freshData.forEach(l => { initPay[l.id] = initLoadPayEntry(l) })

        // Fetch ALL unapplied ledger entries for this driver (any week)
        const ledger = await fetchDriverLedgerEntries(driverName)
        setPendingLedger(ledger)
        setSelectedLedgerIds(new Set(ledger.map(e => e.id))) // all checked by default

        // Pre-populate deductions with the default template only
        if (profile) {
          setDeductions(defaultDeductions(profile.profile_type))
          if (isOO) setCommissionPct(profile.commission_pct ?? 15)
        }
      }

      setLoads(finalLoads)
      setLoadPay(initPay)
      setLoaded(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Helper: build the initial pay entry for a single load
  function initLoadPayEntry(l) {
    if (isOO) {
      return { amount: String(l.price || ''), emptyMiles: String(l.empty_miles || '') }
    } else if (isPerMile) {
      const miles = l.total_miles || 0
      const empty = l.empty_miles || 0
      const rate  = profile?.pay_rate || 0
      if (l.flat_rate_pay && l.flat_rate_amount) {
        return { miles: String(miles), emptyMiles: String(empty || ''), rate: String(rate), payType: 'flat', amount: String(l.flat_rate_amount) }
      }
      return { miles: String(miles), emptyMiles: String(empty || ''), rate: String(rate), amount: String(((miles + empty) * rate).toFixed(2)) }
    } else {
      return { amount: '', emptyMiles: String(l.empty_miles || '') }
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

  // ── Move checked ledger entries into the additions/deductions sections ──
  function handleAddLedgerToPaystub() {
    const toAdd = pendingLedger.filter(e => selectedLedgerIds.has(e.id))
    const newAdds = []
    const newDeds = []
    for (const entry of toAdd) {
      const cfg = EXPENSE_CONFIG[entry.type]
      if (!cfg) continue
      const label  = cfg.label + (entry.description ? ` — ${entry.description}` : '')
      const amount = String(Number(entry.amount).toFixed(2))
      const balance = entry.date
      if (cfg.addition)  newAdds.push({ label, amount, balance })
      if (cfg.deduction) newDeds.push({ label, amount, balance })
    }
    if (newAdds.length > 0) setAdditions(prev => [...prev.filter(a => a.label || a.amount), ...newAdds, { ...BLANK_LINE }])
    if (newDeds.length > 0) setDeductions(prev => [...prev, ...newDeds])
    // Stage IDs and remove from pending checklist
    setStagedLedgerIds(prev => new Set([...prev, ...selectedLedgerIds]))
    setPendingLedger(prev => prev.filter(e => !selectedLedgerIds.has(e.id)))
    setSelectedLedgerIds(new Set())
  }

  // ── Additions / deductions helpers ──────────────────────────────────────
  function updateLine(arr, setArr, idx, field, value) {
    setArr(arr.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }
  function addLine(setArr)          { setArr(prev => [...prev, { ...BLANK_LINE }]) }
  function removeLine(arr, setArr, idx) { setArr(arr.filter((_, i) => i !== idx)) }

  // ── Totals ───────────────────────────────────────────────────────────────
  const sortedLoads = [...loads].sort((a, b) => {
    const da = a.pickup_date || a.date || ''
    const db = b.pickup_date || b.date || ''
    return da < db ? -1 : da > db ? 1 : 0
  })

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
      const baseIds    = new Set(editingBaseLoads.map(l => l.id))
      const newLoadIds = loads.filter(l => !baseIds.has(l.id)).map(l => l.id)
      await updatePaystub(editingPaystubId, paystubData, newLoadIds)
      // Mark any newly staged ledger entries as applied to this paystub
      await markLedgerEntriesApplied([...stagedLedgerIds], editingPaystubId)
      setEditingPaystubId(null)
      setEditingBaseLoads([])
    } else {
      const savedPaystub = await createPaystub(paystubData, loads.map(l => l.id))
      // Mark only staged entries (ones the user clicked "Add to Paystub" for)
      await markLedgerEntriesApplied([...stagedLedgerIds], savedPaystub.id)
    }
    setPendingLedger([])
    setSelectedLedgerIds(new Set())
    setStagedLedgerIds(new Set())
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
        <button
          className={`btn ${psTab === 'ytd' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setPsTab('ytd')}
        >YTD Summary</button>
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

      {/* ── YTD Summary tab ── */}
      {psTab === 'ytd' && (
        <div>
          {/* Year selector + export */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Year:</span>
            {yearOptions.map(y => (
              <button
                key={y}
                className={`btn btn-xs ${ytdYear === y ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setYtdYear(y)}
              >{y}</button>
            ))}
            <button className="btn btn-ghost btn-xs" onClick={ytdRefresh} style={{ marginLeft: 8 }}>↻ Refresh</button>
            {ytdRows.length > 0 && (
              <button
                className="btn btn-ghost btn-xs"
                style={{ marginLeft: 'auto' }}
                onClick={() => {
                  const header = ['Driver', 'Company', 'Period Start', 'Period End', 'Gross Pay', 'Additions', 'Deductions', 'Net Pay']
                  const lines  = [header.join(',')]
                  for (const r of ytdRows) {
                    for (const ps of r.paystubs) {
                      lines.push([
                        `"${r.driver_name}"`,
                        r.company === 'carat' ? 'Carat' : 'Pro Freight',
                        ps.start_date,
                        ps.end_date,
                        ps.gross.toFixed(2),
                        ps.addTotal.toFixed(2),
                        ps.dedTotal.toFixed(2),
                        ps.net.toFixed(2),
                      ].join(','))
                    }
                  }
                  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
                  const url  = URL.createObjectURL(blob)
                  const a    = document.createElement('a')
                  a.href = url; a.download = `ytd-${ytdYear}.csv`; a.click()
                  URL.revokeObjectURL(url)
                }}
              >⬇ Export CSV</button>
            )}
          </div>

          {ytdLoading ? (
            <div style={{ color: '#9CA3AF' }}>Loading…</div>
          ) : ytdRows.length === 0 ? (
            <div className="acct-empty">No paystubs found for {ytdYear}.</div>
          ) : (
            <>
              {/* Totals summary bar */}
              {(() => {
                const totGross = ytdRows.reduce((s, r) => s + r.gross,    0)
                const totAdd   = ytdRows.reduce((s, r) => s + r.addTotal, 0)
                const totDed   = ytdRows.reduce((s, r) => s + r.dedTotal, 0)
                const totNet   = ytdRows.reduce((s, r) => s + r.net,      0)
                return (
                  <div className="ytd-summary-bar">
                    <div className="ytd-bar-item"><span>Drivers</span><strong>{ytdRows.length}</strong></div>
                    <div className="ytd-bar-item"><span>Gross Pay</span><strong>{fmt(totGross)}</strong></div>
                    <div className="ytd-bar-item"><span>Additions</span><strong style={{ color: '#059669' }}>+{fmt(totAdd)}</strong></div>
                    <div className="ytd-bar-item"><span>Deductions</span><strong style={{ color: '#DC2626' }}>-{fmt(totDed)}</strong></div>
                    <div className="ytd-bar-item ytd-bar-net"><span>Net Pay</span><strong>{fmt(totNet)}</strong></div>
                  </div>
                )
              })()}

              <table className="acct-table ytd-table">
                <thead>
                  <tr>
                    <th style={{ width: 24 }}></th>
                    <th>Driver</th>
                    <th>Company</th>
                    <th style={{ textAlign: 'right' }}>Paystubs</th>
                    <th style={{ textAlign: 'right' }}>Gross Pay</th>
                    <th style={{ textAlign: 'right' }}>Additions</th>
                    <th style={{ textAlign: 'right' }}>Deductions</th>
                    <th style={{ textAlign: 'right' }}>Net Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {ytdRows.map(r => {
                    const expanded = !!ytdExpanded[r.driver_name]
                    const addEntries = Object.entries(r.addsByLabel)
                    const dedEntries = Object.entries(r.dedsByLabel)
                    return [
                      <tr
                        key={r.driver_name}
                        className="ytd-driver-row"
                        onClick={() => setYtdExpanded(prev => ({ ...prev, [r.driver_name]: !prev[r.driver_name] }))}
                        style={{ cursor: 'pointer' }}
                      >
                        <td style={{ color: '#9CA3AF', fontSize: 11 }}>{expanded ? '▾' : '▸'}</td>
                        <td><strong>{r.driver_name}</strong></td>
                        <td style={{ color: '#6B7280', fontSize: 12 }}>{r.company === 'carat' ? 'Carat' : 'Pro Freight'}</td>
                        <td style={{ textAlign: 'right', color: '#6B7280' }}>{r.paystubCount}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(r.gross)}</td>
                        <td style={{ textAlign: 'right', color: '#059669' }}>{r.addTotal > 0 ? `+${fmt(r.addTotal)}` : '—'}</td>
                        <td style={{ textAlign: 'right', color: '#DC2626' }}>{r.dedTotal > 0 ? `-${fmt(r.dedTotal)}` : '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 14 }}>{fmt(r.net)}</td>
                      </tr>,
                      expanded && (
                        <tr key={`${r.driver_name}-detail`} className="ytd-detail-row">
                          <td></td>
                          <td colSpan={7}>
                            <div style={{ padding: '10px 16px 16px 24px' }}>

                              {/* Individual statements */}
                              <div className="ytd-detail-title" style={{ color: '#374151', marginBottom: 6 }}>Statements</div>
                              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginBottom: 16 }}>
                                <thead>
                                  <tr style={{ color: '#9CA3AF', textAlign: 'right' }}>
                                    <th style={{ textAlign: 'left', fontWeight: 500, paddingBottom: 4 }}>Period</th>
                                    <th style={{ fontWeight: 500, paddingBottom: 4 }}>Gross</th>
                                    <th style={{ fontWeight: 500, paddingBottom: 4 }}>Additions</th>
                                    <th style={{ fontWeight: 500, paddingBottom: 4 }}>Deductions</th>
                                    <th style={{ fontWeight: 500, paddingBottom: 4 }}>Net Pay</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {r.paystubs.map((ps, pi) => (
                                    <tr key={pi} style={{ borderTop: '1px solid #F3F4F6' }}>
                                      <td style={{ padding: '4px 0', color: '#374151' }}>{ps.start_date} – {ps.end_date}</td>
                                      <td style={{ textAlign: 'right', padding: '4px 0' }}>{fmt(ps.gross)}</td>
                                      <td style={{ textAlign: 'right', padding: '4px 0', color: '#059669' }}>{ps.addTotal > 0 ? `+${fmt(ps.addTotal)}` : '—'}</td>
                                      <td style={{ textAlign: 'right', padding: '4px 0', color: '#DC2626' }}>{ps.dedTotal > 0 ? `-${fmt(ps.dedTotal)}` : '—'}</td>
                                      <td style={{ textAlign: 'right', padding: '4px 0', fontWeight: 600 }}>{fmt(ps.net)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>

                              {/* Category breakdown */}
                              {(addEntries.length > 0 || dedEntries.length > 0) && (
                                <div className="ytd-detail-grid" style={{ paddingLeft: 0 }}>
                                  {addEntries.length > 0 && (
                                    <div className="ytd-detail-section">
                                      <div className="ytd-detail-title" style={{ color: '#059669' }}>Additions (YTD)</div>
                                      {addEntries.map(([label, amt]) => (
                                        <div key={label} className="ytd-detail-line">
                                          <span>{label}</span>
                                          <span style={{ color: '#059669' }}>+{fmt(amt)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {dedEntries.length > 0 && (
                                    <div className="ytd-detail-section">
                                      <div className="ytd-detail-title" style={{ color: '#DC2626' }}>Deductions (YTD)</div>
                                      {dedEntries.map(([label, amt]) => (
                                        <div key={label} className="ytd-detail-line">
                                          <span>{label}</span>
                                          <span style={{ color: '#DC2626' }}>-{fmt(amt)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}

                            </div>
                          </td>
                        </tr>
                      )
                    ]
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
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
                <th style={{ width: 28 }}></th>
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
              {sortedLoads.map(l => {
                const pay = loadPay[l.id] || {}
                const flatLoad = isPerMile && (pay.payType ?? 'per_mile') === 'flat'
                return (
                  <tr key={l.id}>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        title="Remove from paystub"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 14, lineHeight: 1, padding: '2px 4px', borderRadius: 4 }}
                        onMouseOver={e => e.currentTarget.style.color = '#DC2626'}
                        onMouseOut={e => e.currentTarget.style.color = '#9CA3AF'}
                        onClick={() => {
                          setLoads(prev => prev.filter(x => x.id !== l.id))
                          setLoadPay(prev => { const next = { ...prev }; delete next[l.id]; return next })
                        }}
                      >✕</button>
                    </td>
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
                <td colSpan={isPerMile ? 9 : 7} className="acct-subtotal-label">Sub-Total</td>
                <td className="acct-subtotal-val">{fmt(loadTotal)}</td>
              </tr>
            </tfoot>
          </table>

          {/* ── Pending Ledger Entries (checklist) ── */}
          {pendingLedger.length > 0 && (
            <div className="ledger-checklist">
              <div className="ledger-checklist-header">
                <span>📒 Pending Expenses from Ledger</span>
                <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 400 }}>
                  Check what to include, then click Add
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button className="btn btn-ghost btn-xs" onClick={() => setSelectedLedgerIds(new Set(pendingLedger.map(e => e.id)))}>All</button>
                  <button className="btn btn-ghost btn-xs" onClick={() => setSelectedLedgerIds(new Set())}>None</button>
                  <button
                    className="btn btn-primary btn-xs"
                    disabled={selectedLedgerIds.size === 0}
                    onClick={handleAddLedgerToPaystub}
                  >
                    + Add {selectedLedgerIds.size > 0 ? `(${selectedLedgerIds.size})` : ''} to Paystub
                  </button>
                </div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: '#9CA3AF', borderBottom: '1px solid #E5E7EB' }}>
                    <th style={{ width: 28, padding: '4px 8px' }}></th>
                    <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 500 }}>Date</th>
                    <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 500 }}>Type</th>
                    <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 500 }}>Description</th>
                    <th style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 500 }}>Amount</th>
                    <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 500 }}>Effect</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingLedger.map(e => {
                    const cfg     = EXPENSE_CONFIG[e.type]
                    const checked = selectedLedgerIds.has(e.id)
                    const isOldWeek = e.date < startDate
                    return (
                      <tr key={e.id} style={{ opacity: checked ? 1 : 0.45, borderBottom: '1px solid #F3F4F6', background: isOldWeek ? '#FFFBEB' : 'transparent' }}>
                        <td style={{ padding: '6px 8px' }}>
                          <input type="checkbox" checked={checked} onChange={() => {
                            setSelectedLedgerIds(prev => {
                              const next = new Set(prev)
                              next.has(e.id) ? next.delete(e.id) : next.add(e.id)
                              return next
                            })
                          }} />
                        </td>
                        <td style={{ padding: '6px 8px', color: isOldWeek ? '#D97706' : '#6B7280', whiteSpace: 'nowrap' }}>
                          {e.date}{isOldWeek && <span style={{ marginLeft: 4, fontSize: 10, background: '#FEF3C7', color: '#D97706', padding: '1px 5px', borderRadius: 6, fontWeight: 700 }}>prev week</span>}
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          {cfg && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 10, color: cfg.color, background: cfg.bg }}>{cfg.label}</span>}
                        </td>
                        <td style={{ padding: '6px 8px', color: '#6B7280' }}>{e.description || '—'}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>${Number(e.amount).toFixed(2)}</td>
                        <td style={{ padding: '6px 8px' }}>
                          {cfg?.deduction && cfg?.addition && <span className="ledger-badge ledger-badge-both">± Both</span>}
                          {cfg?.deduction && !cfg?.addition && <span className="ledger-badge ledger-badge-ded">− Ded.</span>}
                          {!cfg?.deduction && cfg?.addition && <span className="ledger-badge ledger-badge-add">+ Add.</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {selectedLedgerIds.size > 0 && (
                <div style={{ padding: '6px 8px', fontSize: 11, color: '#6B7280', borderTop: '1px solid #E5E7EB' }}>
                  {selectedLedgerIds.size} of {pendingLedger.length} selected — will be applied and appear on the paystub
                </div>
              )}
            </div>
          )}

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
          loads={sortedLoads}
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
          loads={[...historyModal.loads].sort((a,b) => (a.pickup_date||a.date||'') < (b.pickup_date||b.date||'') ? -1 : 1)}
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
