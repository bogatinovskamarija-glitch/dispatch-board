import { useState, useMemo, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { useFuelTransactions, importFuelTransactions, clearFuelWeek } from '../../hooks/useFuel'
import { useDriverProfiles } from '../../hooks/useDriverProfiles'
import { supabase } from '../../lib/supabase'
import { getThursdayWeek } from '../../hooks/useWeeklySummary'

const fmt$  = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })
const fmtG  = n => Number(n).toFixed(3) + ' gal'
const fmtMi = n => Number(n).toLocaleString('en-US')

// ── Week bounds ────────────────────────────────────────────────────────────
function getWeekBounds(offset = 0) {
  const base = getThursdayWeek()
  const d = new Date(base.start + 'T12:00:00')
  d.setDate(d.getDate() + offset * 7)
  const { start, end } = getThursdayWeek(d.toISOString().split('T')[0])
  return { from: start, to: end }
}
function fmtRange(from, to) {
  const opts = { month: 'short', day: 'numeric' }
  return `${new Date(from + 'T12:00:00').toLocaleDateString('en-US', opts)} – ${new Date(to + 'T12:00:00').toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`
}

// ── Helpers ────────────────────────────────────────────────────────────────
function cleanNum(v) {
  if (v == null || v === '') return null
  const n = parseFloat(String(v).replace(/[$,\s]/g, ''))
  return isNaN(n) ? null : n
}
function parseDate(raw) {
  if (!raw) return null
  // "2026-05-27 23:07:00" or "2026-05-27T..." → strip time
  const s = String(raw).split(' ')[0].split('T')[0].trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`
  const d = new Date(s)
  return isNaN(d) ? null : d.toISOString().split('T')[0]
}

// ── EFS (Relay/EFS fuel card) format detection & parsing ──────────────────
// The EFS XLSX has 2 header rows:
//   row 0: group labels (GALLONS, PPU, AMOUNT, REBATE …)
//   row 1: sub-column names (date, id, unit, driver name, total, …)
//   row 2+: data; last row is a TOTAL summary — skip it
const EFS_COLS = {
  date:     0,   // "date" column
  location: 6,   // fuel stop name
  state:    7,   // loc state
  truck:    10,  // unit number (= truck number)
  driver:   12,  // driver name
  category: 14,  // ULSD / ULSR / DEFD
  gallons:  15,  // total gallons
  amount:   21,  // amount at policy price (pre-rebate)
  rebate:   23,  // rebate amount
}

function isEFSFormat(rows) {
  if (rows.length < 3) return false
  const sub = (rows[1] || []).map(h => String(h || '').toLowerCase().trim())
  return sub.includes('driver name') && sub.includes('unit') && sub.includes('total')
}

function parseEFSRows(rows, weekStart, company) {
  return rows.slice(2).map(row => {   // skip 2 header rows
    if (!row || !row.length) return null
    const raw = String(row[EFS_COLS.date] || '').trim()
    if (!raw || /^total$/i.test(raw)) return null  // skip TOTAL footer row
    const date = parseDate(raw)
    if (!date) return null
    const truck = String(row[EFS_COLS.truck] || '').trim()
    if (!truck || /^total$/i.test(truck)) return null
    const gallons = cleanNum(row[EFS_COLS.gallons])
    const amount  = cleanNum(row[EFS_COLS.amount])
    if (gallons == null || amount == null) return null
    const loc = [String(row[EFS_COLS.location] || '').trim(), String(row[EFS_COLS.state] || '').trim()].filter(Boolean).join(', ')
    return {
      transaction_date: date,
      truck_number:     truck,
      driver_name:      String(row[EFS_COLS.driver] || '').trim() || null,
      location:         loc || null,
      gallons,
      amount,
      rebate_amount:    cleanNum(row[EFS_COLS.rebate]) || 0,
      fuel_category:    String(row[EFS_COLS.category] || '').trim() || null,
      company:          company === 'all' ? 'carat' : company,
      week_start:       weekStart,
    }
  }).filter(Boolean)
}

// ── Generic CSV parser (fallback for non-XLSX or unknown formats) ──────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/)
  function parseLine(line) {
    const fields = []; let f = '', inQ = false
    for (const ch of line) {
      if (ch === '"') inQ = !inQ
      else if (ch === ',' && !inQ) { fields.push(f.trim()); f = '' }
      else f += ch
    }
    fields.push(f.trim())
    return fields.map(x => x.replace(/^"|"$/g, '').trim())
  }
  const headers = parseLine(lines[0])
  const rows    = lines.slice(1).filter(l => l.trim()).map(parseLine)
  return { headers, rows }
}

// ── Column mapper field definitions ───────────────────────────────────────
const MAP_FIELDS = {
  dateCol:     'Transaction Date *',
  truckCol:    'Truck / Unit #',
  driverCol:   'Driver Name',
  locationCol: 'Location',
  gallonsCol:  'Gallons *',
  amountCol:   'Amount ($) *',
  rebateCol:   'Rebate Amount',
  categoryCol: 'Fuel Category',
}

// ── Setup SQL ──────────────────────────────────────────────────────────────
const SETUP_SQL =
`CREATE TABLE IF NOT EXISTS public.fuel_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  transaction_date DATE NOT NULL,
  truck_number     TEXT,
  driver_name      TEXT,
  location         TEXT,
  gallons          NUMERIC(10,3),
  amount           NUMERIC(10,2),
  rebate_amount    NUMERIC(10,2) DEFAULT 0,
  fuel_category    TEXT,
  company          TEXT NOT NULL DEFAULT 'carat',
  week_start       DATE,
  raw_row          JSONB
);
ALTER TABLE public.fuel_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fuel_all" ON public.fuel_transactions
  FOR ALL USING (true) WITH CHECK (true);

-- If table already exists without rebate/category columns:
ALTER TABLE public.fuel_transactions ADD COLUMN IF NOT EXISTS rebate_amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.fuel_transactions ADD COLUMN IF NOT EXISTS fuel_category TEXT;`

// ══════════════════════════════════════════════════════════════════════════
export default function FuelTab({ company }) {
  const [weekOffset, setWeekOffset] = useState(0)
  const week = getWeekBounds(weekOffset)

  const { transactions, loading, dbMissing, refetch } = useFuelTransactions(week.from, week.to, company)
  const { profiles } = useDriverProfiles()

  // Miles + driver-by-truck from loads for the week
  const [milesMap,     setMilesMap]     = useState({})
  const [driverByTruck, setDriverByTruck] = useState({})
  useEffect(() => {
    const REVENUE = ['covered','at_pickup','at_delivery','tonu','empty','prebooked']
    let q = supabase.from('loads').select('truck_number, total_miles, driver_name')
      .in('status', REVENUE)
      .or(`and(pickup_date.gte.${week.from},pickup_date.lte.${week.to}),and(pickup_date.is.null,date.gte.${week.from},date.lte.${week.to})`)
    if (company !== 'all') q = q.eq('company', company)
    q.then(({ data }) => {
      const mi = {}, dr = {}
      for (const l of (data ?? [])) {
        if (!l.truck_number) continue
        mi[l.truck_number] = (mi[l.truck_number] || 0) + (Number(l.total_miles) || 0)
        if (l.driver_name) dr[l.truck_number] = l.driver_name
      }
      setMilesMap(mi)
      setDriverByTruck(dr)
    })
  }, [week.from, week.to, company])

  // ── File upload state ──────────────────────────────────────────────────
  const fileRef   = useRef()
  const [preview,    setPreview]    = useState(null)    // { rows, format: 'efs'|'csv', csvHeaders? }
  const [colMap,     setColMap]     = useState(() => { try { return JSON.parse(localStorage.getItem('fuel_colmap') || 'null') } catch { return null } })
  const [importing,  setImporting]  = useState(false)
  const [importMsg,  setImportMsg]  = useState(null)
  const [clearing,   setClearing]   = useState(false)
  const [showTxns,   setShowTxns]   = useState(false)

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImportMsg(null)

    const isXLSX = /\.(xlsx?|xlsm)$/i.test(file.name)
    const reader  = new FileReader()

    if (isXLSX) {
      reader.onload = ev => {
        const data = new Uint8Array(ev.target.result)
        const wb   = XLSX.read(data, { type: 'array', raw: false })
        // Pick the sheet most likely to be the transaction detail
        // (largest row count, or the one containing 'driver name' in row 1)
        let sheet = null
        for (const name of wb.SheetNames) {
          const ws   = wb.Sheets[name]
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
          if (isEFSFormat(rows)) { sheet = { name, rows }; break }
        }
        if (!sheet) {
          // Fall back to largest sheet
          const name = wb.SheetNames.reduce((best, n) => {
            const len = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 }).length
            return len > (best.len || 0) ? { n, len } : best
          }, {}).n || wb.SheetNames[0]
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' })
          setPreview({ rows, format: 'csv', csvHeaders: rows[0] || [] })
        } else {
          setPreview({ rows: sheet.rows, format: 'efs' })
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      reader.onload = ev => {
        const text = ev.target.result
        // EFS CSV has 2 header rows: line[0] = group labels, line[1] = sub-headers
        // Detect by checking the raw second line before any parsing
        const rawLines = text.trim().split(/\r?\n/)
        const line1 = (rawLines[1] || '').toLowerCase()
        const { headers, rows } = parseCSV(text)
        if (rawLines.length >= 3 && line1.includes('driver name') && line1.includes(',unit,')) {
          // Reconstruct as [groupLabels, subHeaders, ...data] for parseEFSRows
          setPreview({ rows: [headers, rows[0], ...rows.slice(1)], format: 'efs' })
        } else {
          setPreview({ rows, format: 'csv', csvHeaders: headers })
        }
      }
      reader.readAsText(file)
    }
  }

  async function handleImport() {
    if (!preview) return
    setImporting(true)
    setImportMsg(null)
    try {
      let rows
      if (preview.format === 'efs') {
        rows = parseEFSRows(preview.rows, week.from, company === 'all' ? 'carat' : company)
      } else {
        if (!colMap) { alert('Please map all columns first.'); setImporting(false); return }
        const get = (row, col) => col != null && col !== '' ? row[Number(col)] : ''
        rows = (preview.rows || []).map(row => {
          const date = parseDate(get(row, colMap.dateCol))
          if (!date) return null
          return {
            transaction_date: date,
            truck_number:  get(row, colMap.truckCol)    || null,
            driver_name:   get(row, colMap.driverCol)   || null,
            location:      get(row, colMap.locationCol) || null,
            gallons:       cleanNum(get(row, colMap.gallonsCol)),
            amount:        cleanNum(get(row, colMap.amountCol)),
            rebate_amount: cleanNum(get(row, colMap.rebateCol)) || 0,
            fuel_category: get(row, colMap.categoryCol) || null,
            company:       company === 'all' ? 'carat' : company,
            week_start:    week.from,
          }
        }).filter(r => r && r.gallons != null && r.amount != null)
        localStorage.setItem('fuel_colmap', JSON.stringify(colMap))
      }
      if (!rows.length) { setImportMsg('No valid rows found. Check the column mapping.'); setImporting(false); return }
      await importFuelTransactions(rows)
      setImportMsg(`✓ ${rows.length} transactions imported.`)
      setPreview(null)
      await refetch()
    } catch (err) {
      setImportMsg('Error: ' + err.message)
    } finally {
      setImporting(false)
    }
  }

  async function handleClearWeek() {
    if (!window.confirm(`Delete all fuel transactions for ${fmtRange(week.from, week.to)}?`)) return
    setClearing(true)
    try { await clearFuelWeek(week.from, week.to, company); await refetch() }
    catch (e) { alert('Error: ' + e.message) }
    finally { setClearing(false) }
  }

  // ── Parsed preview (EFS): first 5 rows ──────────────────────────────────
  const efsSample = useMemo(() => {
    if (!preview || preview.format !== 'efs') return []
    return parseEFSRows(preview.rows, week.from, company === 'all' ? 'carat' : company).slice(0, 5)
  }, [preview, week.from, company])

  const csvRowCount = preview?.format === 'csv' ? (preview.rows || []).length : 0
  const efsRowCount = useMemo(() => {
    if (!preview || preview.format !== 'efs') return 0
    return parseEFSRows(preview.rows, week.from, company === 'all' ? 'carat' : company).length
  }, [preview, week.from, company])

  // ── Summary ──────────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const map = {}
    for (const t of transactions) {
      const key = t.truck_number || t.driver_name || 'Unknown'
      if (!map[key]) map[key] = {
        truck: t.truck_number || '—', driver: t.driver_name || driverByTruck[t.truck_number] || '—',
        gallons: 0, diesel: 0, amount: 0, rebate: 0, count: 0, txns: [],
      }
      const g = Number(t.gallons) || 0
      map[key].gallons  += g
      map[key].amount   += Number(t.amount) || 0
      map[key].rebate   += Number(t.rebate_amount) || 0
      map[key].count++
      map[key].txns.push(t)
      // Only count diesel gallons (ULSD/ULSR) for MPG — not DEF
      if (!String(t.fuel_category || '').toUpperCase().includes('DEF')) map[key].diesel += g
      if (!map[key].driver || map[key].driver === '—') map[key].driver = driverByTruck[t.truck_number] || '—'
    }
    return Object.values(map).sort((a,b) => b.amount - a.amount).map(r => ({
      ...r,
      net:   r.amount - r.rebate,
      miles: milesMap[r.truck] || 0,
      mpg:   r.diesel > 0 && milesMap[r.truck] > 0 ? milesMap[r.truck] / r.diesel : null,
    }))
  }, [transactions, milesMap, driverByTruck])

  const totGallons = summary.reduce((s,r) => s + r.gallons, 0)
  const totAmount  = summary.reduce((s,r) => s + r.amount,  0)
  const totRebate  = summary.reduce((s,r) => s + r.rebate,  0)
  const totNet     = totAmount - totRebate
  const totMiles   = summary.reduce((s,r) => s + r.miles,   0)
  const totDiesel  = summary.reduce((s,r) => s + r.diesel,  0)
  const fleetMPG   = totDiesel > 0 && totMiles > 0 ? totMiles / totDiesel : null

  // Format fuel report for OO paystub
  function buildOOReport(r) {
    return r.txns
      .filter(t => !String(t.fuel_category || '').toUpperCase().includes('DEF'))
      .map(t => {
        // OOs are charged the policy amount — company keeps the rebate
        const charge = Number(t.amount).toFixed(2)
        return [t.transaction_date, t.location, `${Number(t.gallons).toFixed(3)} gal`, `$${charge}`].filter(Boolean).join('  ')
      }).join('\n')
  }

  // ── DB missing ──────────────────────────────────────────────────────────
  if (dbMissing) return (
    <div className="acct-tab-content">
      <div style={{ padding: 24, background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, maxWidth: 680 }}>
        <div style={{ fontWeight: 700, color: '#DC2626', marginBottom: 8 }}>⚠ Fuel table not set up yet</div>
        <div style={{ fontSize: 13, color: '#374151', marginBottom: 12 }}>Run this SQL in Supabase → SQL Editor:</div>
        <pre style={{ background: '#1E1E1E', color: '#D4D4D4', padding: 14, borderRadius: 8, fontSize: 11, overflowX: 'auto', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{SETUP_SQL}</pre>
        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={refetch}>↻ Retry</button>
      </div>
    </div>
  )

  return (
    <div className="acct-tab-content">

      {/* ── Topbar ────────────────────────────────────────────────────── */}
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
          {transactions.length > 0 && !preview && (
            <button className="btn btn-ghost btn-xs" style={{ color: '#DC2626' }} onClick={handleClearWeek} disabled={clearing}>
              {clearing ? 'Deleting…' : '🗑 Replace week'}
            </button>
          )}
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm,.csv,.txt" style={{ display: 'none' }} onChange={handleFile} />
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
            📤 Upload XLSX / CSV
          </button>
        </div>
      </div>

      {importMsg && (
        <div style={{ marginBottom: 12, padding: '8px 14px', background: importMsg.startsWith('✓') ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${importMsg.startsWith('✓') ? '#86EFAC' : '#FCA5A5'}`, borderRadius: 8, fontSize: 13, color: importMsg.startsWith('✓') ? '#166534' : '#DC2626' }}>
          {importMsg}
        </div>
      )}

      {/* ── EFS preview (auto-detected) ──────────────────────────────── */}
      {preview?.format === 'efs' && (
        <div className="fuel-mapper">
          <div className="fuel-mapper-title">
            ✓ EFS format detected automatically — {efsRowCount} transactions ready to import
            <span style={{ float: 'right', fontSize: 11, color: '#6B7280', fontWeight: 400 }}>No column mapping needed</span>
          </div>
          <div style={{ overflowX: 'auto', marginBottom: 12 }}>
            <table style={{ fontSize: 11, borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr style={{ background: '#F3F4F6' }}>
                  {['Date','Truck','Driver','Location','Category','Gallons','Amount','Rebate','Net'].map(h => (
                    <th key={h} style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, color: '#6B7280', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {efsSample.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #E5E7EB' }}>
                    <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>{r.transaction_date}</td>
                    <td style={{ padding: '4px 8px' }}>{r.truck_number}</td>
                    <td style={{ padding: '4px 8px', color: '#374151' }}>{r.driver_name || '—'}</td>
                    <td style={{ padding: '4px 8px', color: '#6B7280', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.location || '—'}</td>
                    <td style={{ padding: '4px 8px' }}>
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: String(r.fuel_category||'').includes('DEF') ? '#F0F9FF' : '#FFF7ED', color: String(r.fuel_category||'').includes('DEF') ? '#0284C7' : '#EA580C', fontWeight: 600 }}>
                        {r.fuel_category || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>{r.gallons.toFixed(3)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>{fmt$(r.amount)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: '#059669' }}>-{fmt$(r.rebate_amount)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700 }}>{fmt$(r.amount - r.rebate_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {efsRowCount > 5 && <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 10 }}>Showing 5 of {efsRowCount} rows</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
              {importing ? 'Importing…' : `Import ${efsRowCount} Transactions`}
            </button>
            <button className="btn btn-ghost" onClick={() => setPreview(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Generic CSV column mapper ────────────────────────────────── */}
      {preview?.format === 'csv' && (
        <div className="fuel-mapper">
          <div className="fuel-mapper-title">
            Map CSV Columns — {csvRowCount} rows detected
            <span style={{ float: 'right', fontSize: 11, color: '#9CA3AF', fontWeight: 400 }}>Mapping saved after import</span>
          </div>
          <div className="fuel-mapper-grid">
            {Object.entries(MAP_FIELDS).map(([field, label]) => (
              <div key={field} className="fuel-mapper-field">
                <label>{label}</label>
                <select value={colMap?.[field] ?? ''} onChange={e => setColMap(p => ({ ...(p||{}), [field]: e.target.value }))}>
                  <option value="">— skip —</option>
                  {(preview.csvHeaders || []).map((h, i) => <option key={i} value={i}>{h || `Col ${i+1}`}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" onClick={handleImport} disabled={importing || !colMap}>
              {importing ? 'Importing…' : `Import ${csvRowCount} Rows`}
            </button>
            <button className="btn btn-ghost" onClick={() => setPreview(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────── */}
      {!loading && transactions.length === 0 && !preview && (
        <div className="acct-empty">
          No fuel data for this week.
          <br />
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>
            Upload your weekly EFS report (.xlsx) — it will be auto-detected with no setup needed.
          </span>
        </div>
      )}

      {/* ── Data ─────────────────────────────────────────────────────── */}
      {transactions.length > 0 && !preview && (
        <>
          {/* Stat cards */}
          <div className="fuel-totals">
            <div className="fuel-total-card">
              <div className="fuel-total-label">Total Gallons</div>
              <div className="fuel-total-value">{fmtG(totGallons)}</div>
              <div className="fuel-total-sub">{transactions.length} transactions</div>
            </div>
            <div className="fuel-total-card">
              <div className="fuel-total-label">Policy Amount</div>
              <div className="fuel-total-value" style={{ color: '#DC2626' }}>{fmt$(totAmount)}</div>
              <div className="fuel-total-sub">pre-rebate</div>
            </div>
            <div className="fuel-total-card">
              <div className="fuel-total-label">Rebate</div>
              <div className="fuel-total-value" style={{ color: '#059669' }}>-{fmt$(totRebate)}</div>
              <div className="fuel-total-sub">savings this week</div>
            </div>
            <div className="fuel-total-card" style={{ borderLeft: '4px solid #DC2626' }}>
              <div className="fuel-total-label">Net Cost</div>
              <div className="fuel-total-value" style={{ color: '#DC2626' }}>{fmt$(totNet)}</div>
              <div className="fuel-total-sub">after rebate</div>
            </div>
            <div className="fuel-total-card">
              <div className="fuel-total-label">Total Miles</div>
              <div className="fuel-total-value" style={{ color: '#8B5CF6' }}>{totMiles > 0 ? fmtMi(totMiles) : '—'}</div>
              <div className="fuel-total-sub">from loads this week</div>
            </div>
            {fleetMPG && (
              <div className="fuel-total-card" style={{ borderLeft: '4px solid #059669' }}>
                <div className="fuel-total-label">Fleet MPG</div>
                <div className="fuel-total-value" style={{ color: '#059669' }}>{fleetMPG.toFixed(2)}</div>
                <div className="fuel-total-sub">diesel gallons only</div>
              </div>
            )}
          </div>

          {/* Per-truck summary */}
          <div className="summary-section-title" style={{ marginTop: 20 }}>Fuel by Truck</div>
          <table className="acct-table fuel-summary-table">
            <thead>
              <tr>
                <th>Truck</th>
                <th>Driver</th>
                <th style={{ textAlign: 'right' }}>Fillups</th>
                <th style={{ textAlign: 'right' }}>Gallons</th>
                <th style={{ textAlign: 'right' }}>Policy Amt</th>
                <th style={{ textAlign: 'right' }}>Rebate</th>
                <th style={{ textAlign: 'right' }}>Net Cost</th>
                <th style={{ textAlign: 'right' }}>Miles</th>
                <th style={{ textAlign: 'right' }}>MPG</th>
                <th style={{ textAlign: 'right' }}>¢/mile</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {summary.map(r => {
                const profile   = profiles.find(p => p.driver_name === r.driver)
                const isOO      = profile?.profile_type === 'owner_operator'
                const cpm       = r.miles > 0 ? (r.net / r.miles * 100) : null
                return (
                  <tr key={r.truck}>
                    <td style={{ fontWeight: 600 }}>{r.truck}</td>
                    <td>
                      <span>{r.driver !== '—' ? r.driver : <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>Not linked</span>}</span>
                      {isOO && <span style={{ marginLeft: 6, fontSize: 10, background: '#EEF2FF', color: '#4F46E5', padding: '1px 6px', borderRadius: 8, fontWeight: 700 }}>OO</span>}
                    </td>
                    <td style={{ textAlign: 'right', color: '#6B7280' }}>{r.count}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.gallons.toFixed(3)}</td>
                    <td style={{ textAlign: 'right', color: '#6B7280' }}>{fmt$(r.amount)}</td>
                    <td style={{ textAlign: 'right', color: '#059669' }}>-{fmt$(r.rebate)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#DC2626' }}>{fmt$(r.net)}</td>
                    <td style={{ textAlign: 'right', color: r.miles > 0 ? '#8B5CF6' : '#D1D5DB', fontWeight: r.miles > 0 ? 600 : 400 }}>
                      {r.miles > 0 ? fmtMi(r.miles) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: r.mpg ? (r.mpg >= 6.5 ? '#059669' : r.mpg >= 5.5 ? '#D97706' : '#DC2626') : '#D1D5DB' }}>
                      {r.mpg ? r.mpg.toFixed(2) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 12, color: '#6B7280' }}>
                      {cpm ? cpm.toFixed(1) + '¢' : '—'}
                    </td>
                    <td>
                      {isOO && (
                        <button
                          className="btn btn-ghost btn-xs"
                          style={{ color: '#4F46E5', whiteSpace: 'nowrap' }}
                          title="Copy formatted fuel report for OO paystub"
                          onClick={() => {
                            const text = buildOOReport(r)
                            navigator.clipboard.writeText(text).then(
                              () => alert(`Copied fuel report for ${r.driver} (${r.count} transactions)`),
                              () => prompt('Copy this:', text)
                            )
                          }}
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
                <td style={{ textAlign: 'right', fontWeight: 800 }}>{totGallons.toFixed(3)}</td>
                <td style={{ textAlign: 'right', color: '#6B7280', fontWeight: 600 }}>{fmt$(totAmount)}</td>
                <td style={{ textAlign: 'right', color: '#059669', fontWeight: 700 }}>-{fmt$(totRebate)}</td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: '#DC2626' }}>{fmt$(totNet)}</td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: '#8B5CF6' }}>{totMiles > 0 ? fmtMi(totMiles) : '—'}</td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: '#059669' }}>{fleetMPG ? fleetMPG.toFixed(2) : '—'}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>

          {/* Full transaction list (collapsible) */}
          <div style={{ marginTop: 20 }}>
            <button className="btn btn-ghost btn-xs" onClick={() => setShowTxns(v => !v)} style={{ marginBottom: 8 }}>
              {showTxns ? '▾ Hide' : '▸ Show'} all {transactions.length} transactions
            </button>
            {showTxns && (
              <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: 8 }}>
                <table className="acct-table" style={{ fontSize: 11 }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#F9FAFB', zIndex: 1 }}>
                    <tr>
                      <th>Date</th>
                      <th>Truck</th>
                      <th>Driver</th>
                      <th>Location</th>
                      <th>Type</th>
                      <th style={{ textAlign: 'right' }}>Gallons</th>
                      <th style={{ textAlign: 'right' }}>Policy</th>
                      <th style={{ textAlign: 'right' }}>Rebate</th>
                      <th style={{ textAlign: 'right' }}>Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(t => {
                      const net = (Number(t.amount) - Number(t.rebate_amount || 0))
                      const isDEF = String(t.fuel_category || '').toUpperCase().includes('DEF')
                      return (
                        <tr key={t.id} style={{ opacity: isDEF ? 0.6 : 1 }}>
                          <td style={{ whiteSpace: 'nowrap' }}>{t.transaction_date}</td>
                          <td style={{ fontWeight: 600 }}>{t.truck_number || '—'}</td>
                          <td>{t.driver_name || driverByTruck[t.truck_number] || '—'}</td>
                          <td style={{ color: '#6B7280', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.location || '—'}</td>
                          <td>
                            <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 6, background: isDEF ? '#F0F9FF' : '#FFF7ED', color: isDEF ? '#0284C7' : '#EA580C', fontWeight: 600 }}>
                              {t.fuel_category || '—'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>{t.gallons != null ? Number(t.gallons).toFixed(3) : '—'}</td>
                          <td style={{ textAlign: 'right', color: '#6B7280' }}>{t.amount != null ? fmt$(t.amount) : '—'}</td>
                          <td style={{ textAlign: 'right', color: '#059669' }}>{Number(t.rebate_amount) > 0 ? `-${fmt$(t.rebate_amount)}` : '—'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt$(net)}</td>
                        </tr>
                      )
                    })}
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
