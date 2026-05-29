import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useFuelTransactions, importFuelTransactions, clearFuelWeek } from '../../hooks/useFuel'
import { useDriverProfiles } from '../../hooks/useDriverProfiles'
import { supabase } from '../../lib/supabase'
import { getThursdayWeek } from '../../hooks/useWeeklySummary'

const fmt$  = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })
const fmtG  = n => Number(n).toFixed(3) + ' gal'
const fmtMi = n => Number(n).toLocaleString('en-US')

// ── Simple CSV parser (handles quoted fields) ─────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/)
  if (!lines.length) return { headers: [], rows: [] }
  function parseLine(line) {
    const fields = []
    let field = '', inQ = false
    for (const ch of line) {
      if (ch === '"') inQ = !inQ
      else if (ch === ',' && !inQ) { fields.push(field.trim()); field = '' }
      else field += ch
    }
    fields.push(field.trim())
    return fields.map(f => f.replace(/^"|"$/g, '').trim())
  }
  const headers = parseLine(lines[0])
  const rows    = lines.slice(1).filter(l => l.trim()).map(parseLine)
  return { headers, rows }
}

// Try to parse a date string into YYYY-MM-DD
function parseDate(raw) {
  if (!raw) return null
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  // MM/DD/YYYY or M/D/YYYY
  const m1 = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m1) return `${m1[3]}-${m1[1].padStart(2,'0')}-${m1[2].padStart(2,'0')}`
  // DD/MM/YYYY guesses — fall through to Date
  const d = new Date(raw)
  if (!isNaN(d)) return d.toISOString().split('T')[0]
  return null
}

function cleanNum(raw) {
  if (!raw) return null
  const n = parseFloat(String(raw).replace(/[$,\s]/g, ''))
  return isNaN(n) ? null : n
}

function getWeekBounds(offset = 0) {
  const base = getThursdayWeek()
  const d    = new Date(base.start + 'T12:00:00')
  d.setDate(d.getDate() + offset * 7)
  const { start, end } = getThursdayWeek(d.toISOString().split('T')[0])
  return { from: start, to: end }
}

function fmtRange(from, to) {
  const opts = { month: 'short', day: 'numeric' }
  const a = new Date(from + 'T12:00:00').toLocaleDateString('en-US', opts)
  const b = new Date(to   + 'T12:00:00').toLocaleDateString('en-US', { ...opts, year: 'numeric' })
  return `${a} – ${b}`
}

const REQUIRED_FIELDS = ['dateCol', 'gallonsCol', 'amountCol']
const FIELD_LABELS = {
  dateCol:     'Transaction Date *',
  truckCol:    'Truck / Unit # (optional)',
  driverCol:   'Driver Name (optional)',
  locationCol: 'Location (optional)',
  gallonsCol:  'Gallons *',
  amountCol:   'Amount ($) *',
}

const SETUP_SQL = `CREATE TABLE IF NOT EXISTS public.fuel_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  transaction_date DATE NOT NULL,
  truck_number     TEXT,
  driver_name      TEXT,
  location         TEXT,
  gallons          NUMERIC(10,3),
  amount           NUMERIC(10,2),
  company          TEXT NOT NULL DEFAULT 'carat',
  week_start       DATE,
  raw_row          JSONB
);
ALTER TABLE public.fuel_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fuel_all" ON public.fuel_transactions
  FOR ALL USING (true) WITH CHECK (true);`

// ── Main component ────────────────────────────────────────────────────────
export default function FuelTab({ company }) {
  const [weekOffset, setWeekOffset] = useState(0)
  const week = getWeekBounds(weekOffset)

  const { transactions, loading, dbMissing, refetch } = useFuelTransactions(week.from, week.to, company)
  const { profiles } = useDriverProfiles()

  // Miles per truck for the week (from loads)
  const [milesMap, setMilesMap] = useState({}) // { truckNumber: totalMiles }
  useEffect(() => {
    async function loadMiles() {
      const REVENUE = ['covered','at_pickup','at_delivery','tonu','empty','prebooked']
      let q = supabase.from('loads').select('truck_number, total_miles, driver_name')
        .in('status', REVENUE)
        .or(`and(pickup_date.gte.${week.from},pickup_date.lte.${week.to}),and(pickup_date.is.null,date.gte.${week.from},date.lte.${week.to})`)
      if (company !== 'all') q = q.eq('company', company)
      const { data } = await q
      const map = {}
      const driverMap = {}
      for (const l of (data ?? [])) {
        if (!l.truck_number) continue
        map[l.truck_number]       = (map[l.truck_number] || 0) + (Number(l.total_miles) || 0)
        driverMap[l.truck_number] = l.driver_name || driverMap[l.truck_number]
      }
      setMilesMap(map)
      setDriverByTruck(driverMap)
    }
    loadMiles()
  }, [week.from, week.to, company])
  const [driverByTruck, setDriverByTruck] = useState({})

  // ── CSV state ────────────────────────────────────────────────────────────
  const fileRef = useRef()
  const [csvParsed,  setCsvParsed]  = useState(null) // { headers, rows }
  const [colMap,     setColMap]     = useState(() => {
    try { return JSON.parse(localStorage.getItem('fuel_colmap') || 'null') } catch { return null }
  })
  const [showMapper, setShowMapper] = useState(false)
  const [importing,  setImporting]  = useState(false)
  const [importMsg,  setImportMsg]  = useState(null)
  const [clearing,   setClearing]   = useState(false)
  const [showTxns,   setShowTxns]   = useState(false)

  function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const parsed = parseCSV(ev.target.result)
      setCsvParsed(parsed)
      setShowMapper(true)
      setImportMsg(null)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function mappedPreview(row) {
    if (!colMap) return null
    const get = col => col !== '' && col != null ? row[Number(col)] : ''
    return {
      date:    parseDate(get(colMap.dateCol))    || get(colMap.dateCol),
      truck:   get(colMap.truckCol),
      driver:  get(colMap.driverCol),
      loc:     get(colMap.locationCol),
      gallons: cleanNum(get(colMap.gallonsCol)),
      amount:  cleanNum(get(colMap.amountCol)),
    }
  }

  async function handleImport() {
    if (!csvParsed || !colMap) return
    const missing = REQUIRED_FIELDS.filter(f => colMap[f] === '' || colMap[f] == null)
    if (missing.length) { alert('Please map all required fields first.'); return }

    setImporting(true)
    setImportMsg(null)
    try {
      const get = (row, col) => col !== '' && col != null ? row[Number(col)] : ''
      const rows = csvParsed.rows.map(row => {
        const rawDate  = get(row, colMap.dateCol)
        const date     = parseDate(rawDate)
        if (!date) return null
        return {
          transaction_date: date,
          truck_number:     get(row, colMap.truckCol)  || null,
          driver_name:      get(row, colMap.driverCol) || null,
          location:         get(row, colMap.locationCol) || null,
          gallons:          cleanNum(get(row, colMap.gallonsCol)),
          amount:           cleanNum(get(row, colMap.amountCol)),
          company:          company === 'all' ? 'carat' : company,
          week_start:       week.from,
          raw_row:          Object.fromEntries(csvParsed.headers.map((h, i) => [h, row[i]])),
        }
      }).filter(Boolean)

      localStorage.setItem('fuel_colmap', JSON.stringify(colMap))
      await importFuelTransactions(rows)
      setImportMsg(`✓ ${rows.length} transactions imported successfully.`)
      setCsvParsed(null)
      setShowMapper(false)
      await refetch()
    } catch (e) {
      setImportMsg('Error: ' + e.message)
    } finally {
      setImporting(false)
    }
  }

  async function handleClearWeek() {
    if (!window.confirm(`Delete all fuel transactions for ${fmtRange(week.from, week.to)}? This cannot be undone.`)) return
    setClearing(true)
    try {
      await clearFuelWeek(week.from, week.to, company)
      await refetch()
    } catch (e) {
      alert('Error: ' + e.message)
    } finally {
      setClearing(false)
    }
  }

  // ── Summary computation ───────────────────────────────────────────────────
  const summary = useMemo(() => {
    const map = {}
    for (const t of transactions) {
      const key = t.truck_number || t.driver_name || 'Unknown'
      if (!map[key]) map[key] = {
        truck:   t.truck_number || '—',
        driver:  t.driver_name  || driverByTruck[t.truck_number] || '—',
        gallons: 0, amount: 0, count: 0, txns: [],
      }
      map[key].gallons += Number(t.gallons) || 0
      map[key].amount  += Number(t.amount)  || 0
      map[key].count++
      map[key].txns.push(t)
      // Enrich driver name from loads if not on transaction
      if (!map[key].driver || map[key].driver === '—') {
        map[key].driver = driverByTruck[t.truck_number] || '—'
      }
    }
    return Object.values(map).sort((a, b) => b.gallons - a.gallons).map(r => ({
      ...r,
      miles: milesMap[r.truck] || 0,
      mpg:   (milesMap[r.truck] && r.gallons > 0) ? (milesMap[r.truck] / r.gallons) : null,
    }))
  }, [transactions, milesMap, driverByTruck])

  const totalGallons = summary.reduce((s, r) => s + r.gallons, 0)
  const totalAmount  = summary.reduce((s, r) => s + r.amount, 0)
  const totalMiles   = summary.reduce((s, r) => s + r.miles, 0)
  const fleetMPG     = totalGallons > 0 && totalMiles > 0 ? (totalMiles / totalGallons) : null

  // Format OO fuel report text (for pasting into paystub)
  function buildOOReport(rows) {
    return rows.txns.map(t =>
      [t.transaction_date, t.location, t.gallons != null ? `${Number(t.gallons).toFixed(3)} gal` : '', t.amount != null ? fmt$(t.amount) : '']
        .filter(Boolean).join('  ')
    ).join('\n')
  }

  function copyToClipboard(text, label) {
    navigator.clipboard.writeText(text).then(
      () => alert(`Copied fuel report for ${label}`),
      () => { /* fallback */ prompt('Copy this:', text) }
    )
  }

  // ── DB missing ──────────────────────────────────────────────────────────
  if (dbMissing) return (
    <div className="acct-tab-content">
      <div style={{ padding: 24, background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, maxWidth: 640 }}>
        <div style={{ fontWeight: 700, color: '#DC2626', marginBottom: 8 }}>⚠ Fuel table not set up yet</div>
        <div style={{ fontSize: 13, color: '#374151', marginBottom: 12 }}>Run this SQL in your Supabase dashboard (SQL Editor → New query):</div>
        <pre style={{ background: '#1E1E1E', color: '#D4D4D4', padding: 14, borderRadius: 8, fontSize: 11, overflowX: 'auto', lineHeight: 1.6 }}>{SETUP_SQL}</pre>
        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={refetch}>↻ Retry</button>
      </div>
    </div>
  )

  return (
    <div className="acct-tab-content">

      {/* ── Topbar ─────────────────────────────────────────────────────── */}
      <div className="ledger-topbar">
        <div className="ledger-week-nav">
          <button className="btn btn-ghost btn-xs" onClick={() => setWeekOffset(o => o - 1)}>‹</button>
          <span className="ledger-week-label">{fmtRange(week.from, week.to)}</span>
          <button className="btn btn-ghost btn-xs" onClick={() => setWeekOffset(o => o + 1)}>›</button>
          {weekOffset !== 0 && (
            <button className="btn btn-ghost btn-xs" onClick={() => setWeekOffset(0)} style={{ marginLeft: 4, fontSize: 11 }}>This Week</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {transactions.length > 0 && (
            <button className="btn btn-ghost btn-xs" style={{ color: '#DC2626' }} onClick={handleClearWeek} disabled={clearing}>
              {clearing ? 'Deleting…' : '🗑 Replace week'}
            </button>
          )}
          <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleFileSelect} />
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
            📤 Upload CSV
          </button>
        </div>
      </div>

      {importMsg && (
        <div style={{ marginBottom: 12, padding: '8px 14px', background: importMsg.startsWith('✓') ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${importMsg.startsWith('✓') ? '#86EFAC' : '#FCA5A5'}`, borderRadius: 8, fontSize: 13, color: importMsg.startsWith('✓') ? '#166534' : '#DC2626' }}>
          {importMsg}
        </div>
      )}

      {/* ── Column mapper ──────────────────────────────────────────────── */}
      {showMapper && csvParsed && (
        <div className="fuel-mapper">
          <div className="fuel-mapper-title">
            Map CSV Columns — <span style={{ fontWeight: 400, color: '#6B7280' }}>{csvParsed.rows.length} rows detected</span>
            <span style={{ float: 'right', fontSize: 11, color: '#9CA3AF' }}>Your mapping is saved automatically after import</span>
          </div>
          <div className="fuel-mapper-grid">
            {Object.entries(FIELD_LABELS).map(([field, label]) => (
              <div key={field} className="fuel-mapper-field">
                <label>{label}</label>
                <select
                  value={colMap?.[field] ?? ''}
                  onChange={e => setColMap(prev => ({ ...(prev || {}), [field]: e.target.value }))}
                >
                  <option value="">— not in CSV —</option>
                  {csvParsed.headers.map((h, i) => (
                    <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Preview */}
          {colMap && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Preview (first 5 rows)</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#F3F4F6' }}>
                      {['Date','Truck','Driver','Location','Gallons','Amount'].map(h => (
                        <th key={h} style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, color: '#6B7280' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvParsed.rows.slice(0, 5).map((row, i) => {
                      const p = mappedPreview(row)
                      return (
                        <tr key={i} style={{ borderTop: '1px solid #E5E7EB' }}>
                          <td style={{ padding: '4px 8px', color: p.date ? '#374151' : '#DC2626' }}>{p.date || '⚠ bad date'}</td>
                          <td style={{ padding: '4px 8px', color: '#6B7280' }}>{p.truck || '—'}</td>
                          <td style={{ padding: '4px 8px', color: '#6B7280' }}>{p.driver || '—'}</td>
                          <td style={{ padding: '4px 8px', color: '#6B7280' }}>{p.loc || '—'}</td>
                          <td style={{ padding: '4px 8px', color: p.gallons != null ? '#374151' : '#DC2626' }}>{p.gallons != null ? p.gallons : '⚠'}</td>
                          <td style={{ padding: '4px 8px', color: p.amount != null ? '#059669' : '#DC2626', fontWeight: 600 }}>{p.amount != null ? fmt$(p.amount) : '⚠'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" onClick={handleImport} disabled={importing || !colMap}>
              {importing ? 'Importing…' : `Import ${csvParsed.rows.length} Transactions`}
            </button>
            <button className="btn btn-ghost" onClick={() => { setCsvParsed(null); setShowMapper(false) }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── No data ──────────────────────────────────────────────────────── */}
      {!loading && transactions.length === 0 && !showMapper && (
        <div className="acct-empty">
          No fuel data for this week.
          <br />
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>Click <strong>📤 Upload CSV</strong> to import your fuel card report.</span>
        </div>
      )}

      {/* ── Summary ──────────────────────────────────────────────────────── */}
      {transactions.length > 0 && (
        <>
          {/* Fleet totals */}
          <div className="fuel-totals">
            <div className="fuel-total-card">
              <div className="fuel-total-label">Total Gallons</div>
              <div className="fuel-total-value">{fmtG(totalGallons)}</div>
            </div>
            <div className="fuel-total-card">
              <div className="fuel-total-label">Total Fuel Cost</div>
              <div className="fuel-total-value" style={{ color: '#DC2626' }}>{fmt$(totalAmount)}</div>
            </div>
            <div className="fuel-total-card">
              <div className="fuel-total-label">Total Miles</div>
              <div className="fuel-total-value" style={{ color: '#8B5CF6' }}>{fmtMi(totalMiles)}</div>
              <div className="fuel-total-sub">from loads this week</div>
            </div>
            {fleetMPG && (
              <div className="fuel-total-card">
                <div className="fuel-total-label">Fleet MPG</div>
                <div className="fuel-total-value" style={{ color: '#059669' }}>{fleetMPG.toFixed(2)}</div>
                <div className="fuel-total-sub">miles per gallon</div>
              </div>
            )}
            <div className="fuel-total-card">
              <div className="fuel-total-label">Transactions</div>
              <div className="fuel-total-value">{transactions.length}</div>
            </div>
          </div>

          {/* Per-truck/driver summary table */}
          <div className="summary-section-title" style={{ marginTop: 20 }}>Fuel by Truck</div>
          <table className="acct-table fuel-summary-table">
            <thead>
              <tr>
                <th>Truck</th>
                <th>Driver</th>
                <th style={{ textAlign: 'right' }}>Fillups</th>
                <th style={{ textAlign: 'right' }}>Gallons</th>
                <th style={{ textAlign: 'right' }}>Fuel Cost</th>
                <th style={{ textAlign: 'right' }}>Miles</th>
                <th style={{ textAlign: 'right' }}>MPG</th>
                <th style={{ textAlign: 'right' }}>Cost/Mile</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {summary.map(r => {
                const profile   = profiles.find(p => p.driver_name === r.driver)
                const isOO      = profile?.profile_type === 'owner_operator'
                const costPerMi = r.miles > 0 ? (r.amount / r.miles) : null
                return (
                  <tr key={r.truck}>
                    <td style={{ fontWeight: 600 }}>{r.truck}</td>
                    <td>
                      {r.driver !== '—' ? r.driver : <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>No driver linked</span>}
                      {isOO && <span style={{ marginLeft: 6, fontSize: 10, background: '#EEF2FF', color: '#4F46E5', padding: '1px 6px', borderRadius: 8, fontWeight: 700 }}>OO</span>}
                    </td>
                    <td style={{ textAlign: 'right', color: '#6B7280' }}>{r.count}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.gallons.toFixed(3)}</td>
                    <td style={{ textAlign: 'right', color: '#DC2626', fontWeight: 600 }}>{fmt$(r.amount)}</td>
                    <td style={{ textAlign: 'right', color: r.miles > 0 ? '#8B5CF6' : '#D1D5DB', fontWeight: r.miles > 0 ? 600 : 400 }}>
                      {r.miles > 0 ? fmtMi(r.miles) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: r.mpg ? (r.mpg >= 6 ? '#059669' : r.mpg >= 5 ? '#D97706' : '#DC2626') : '#D1D5DB' }}>
                      {r.mpg ? r.mpg.toFixed(2) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', color: '#6B7280', fontSize: 12 }}>
                      {costPerMi ? `$${costPerMi.toFixed(3)}/mi` : '—'}
                    </td>
                    <td>
                      {isOO && r.txns.length > 0 && (
                        <button
                          className="btn btn-ghost btn-xs"
                          style={{ color: '#4F46E5', whiteSpace: 'nowrap' }}
                          title="Copy fuel report for OO paystub"
                          onClick={() => copyToClipboard(buildOOReport(r), r.driver)}
                        >📋 Copy for paystub</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#F3F4F6' }}>
                <td colSpan={2}><strong>Total</strong></td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{transactions.length}</td>
                <td style={{ textAlign: 'right', fontWeight: 800 }}>{totalGallons.toFixed(3)}</td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: '#DC2626' }}>{fmt$(totalAmount)}</td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: '#8B5CF6' }}>{totalMiles > 0 ? fmtMi(totalMiles) : '—'}</td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: '#059669' }}>{fleetMPG ? fleetMPG.toFixed(2) : '—'}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>

          {/* Transaction list (collapsible) */}
          <div style={{ marginTop: 20 }}>
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => setShowTxns(v => !v)}
              style={{ marginBottom: 8 }}
            >
              {showTxns ? '▾ Hide' : '▸ Show'} all {transactions.length} transactions
            </button>
            {showTxns && (
              <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: 8 }}>
                <table className="acct-table" style={{ fontSize: 11 }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#F9FAFB' }}>
                    <tr>
                      <th>Date</th>
                      <th>Truck</th>
                      <th>Driver</th>
                      <th>Location</th>
                      <th style={{ textAlign: 'right' }}>Gallons</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(t => (
                      <tr key={t.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{t.transaction_date}</td>
                        <td>{t.truck_number || '—'}</td>
                        <td>{t.driver_name || driverByTruck[t.truck_number] || '—'}</td>
                        <td style={{ color: '#6B7280', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.location || '—'}</td>
                        <td style={{ textAlign: 'right' }}>{t.gallons != null ? Number(t.gallons).toFixed(3) : '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: '#059669' }}>{t.amount != null ? fmt$(t.amount) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
