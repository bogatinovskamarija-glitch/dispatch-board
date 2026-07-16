import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import {
  useIFTATrucks, useIFTAFuel, useIFTAMileage, useHUTData,
  saveIFTAMileage, saveIFTAMileageBulk, parseMotiveCSV,
  detectTruckCompanies, quarterRange,
} from '../../hooks/useIFTA'

// ── Q2 2026 IFTA tax rates ($/gallon) — source: IL MFUT-15 Q2 2026 official filing
// KY base rate is 0.000 in Q2 — KY only collects via surcharge through IL IFTA
// IN surcharge is incorporated into the base rate (0.630) for Q2 — no separate surcharge
const DEFAULT_RATES = {
  AL: 0.3100, AZ: 0.2600, AR: 0.2850, CA: 0.8530, CO: 0.2650,
  CT: 0.4890, DE: 0.2200, FL: 0.4100, GA: 0.3730, ID: 0.3200,
  IL: 0.7380, IN: 0.6300, IA: 0.3250, KS: 0.2600, KY: 0.0000,
  LA: 0.2000, ME: 0.3120, MD: 0.4680, MA: 0.2400, MI: 0.5240,
  MN: 0.3260, MS: 0.2100, MO: 0.2950, MT: 0.2775, NE: 0.3180,
  NV: 0.2700, NH: 0.2220, NJ: 0.5610, NM: 0.2100, NY: 0.3810,
  NC: 0.4100, ND: 0.2300, OH: 0.4700, OK: 0.1900, OR: 0.0000,
  PA: 0.7410, RI: 0.3400, SC: 0.2800, SD: 0.2800, TN: 0.2700,
  TX: 0.2000, UT: 0.2450, VT: 0.3100, VA: 0.3270, WA: 0.4450,
  WV: 0.3570, WI: 0.3290, WY: 0.2400,
}

// Surcharge states — applied to TAXABLE gallons (state miles ÷ MPG), NOT net gallons
// IN surcharge removed for Q2 2026 (incorporated into base rate 0.630 per IL MFUT-15)
const SURCHARGES = {
  KY: 0.1050,
  VA: 0.1430,
}

const STATES = Object.keys(DEFAULT_RATES).sort()

const HUT_INFO = {
  KY: { label: 'Kentucky',     period: 'Quarterly' },
  NM: { label: 'New Mexico',   period: 'Quarterly' },
  CT: { label: 'Connecticut',  period: 'Quarterly' },
  NY: { label: 'New York',     period: 'Annual' },
}

const QTR_LABELS = ['Q1 (Jan–Mar)', 'Q2 (Apr–Jun)', 'Q3 (Jul–Sep)', 'Q4 (Oct–Dec)']

const f2   = n => Number(n).toFixed(2)
const fNum = n => Math.round(n).toLocaleString()

function Cell({ children, right, bold, muted, style }) {
  return (
    <td style={{
      padding: '4px 10px',
      textAlign: right ? 'right' : 'left',
      fontWeight: bold ? 600 : 400,
      color: muted ? '#9CA3AF' : undefined,
      borderBottom: '1px solid #F3F4F6',
      fontSize: 13,
      ...style,
    }}>
      {children}
    </td>
  )
}

function SummaryCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8,
      padding: '14px 20px', minWidth: 130,
    }}>
      <div style={{ fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || '#111827' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export default function IFTATab({ company }) {
  const now = new Date()
  const curQ = Math.ceil((now.getMonth() + 1) / 3)

  const [year,    setYear]    = useState(now.getFullYear())
  const [quarter, setQuarter] = useState(curQ)
  const [truck,   setTruck]   = useState('ALL')
  const [showAll, setShowAll] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [rates,   setRates]   = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`ifta_rates_${now.getFullYear()}_${curQ}`) || 'null')
      return saved ? { ...DEFAULT_RATES, ...saved } : { ...DEFAULT_RATES }
    } catch { return { ...DEFAULT_RATES } }
  })
  const [editingRateState, setEditingRateState] = useState(null)

  // OO billing fees (per-truck only)
  const [prepFee, setPrepFee] = useState(150)
  const [hutFee,  setHutFee]  = useState(70)

  // CSV import
  const fileInputRef = useRef(null)
  const [importPreview, setImportPreview] = useState(null) // { truckMap, truckCount, rowCount }
  const [importing,     setImporting]     = useState(false)
  const [importMsg,     setImportMsg]     = useState('')

  // milesEdit: local edits before saving { ST: rawInputString }
  const [milesEdit, setMilesEdit] = useState({})
  const milesEditRef = useRef(milesEdit)
  milesEditRef.current = milesEdit

  // ── Data ─────────────────────────────────────────────────────────────────────
  const { trucks }        = useIFTATrucks(year, quarter, company)
  const { fuelByState, totalGal } = useIFTAFuel(year, quarter, company, truck)
  const { miles: savedMiles, loading: milesLoading, refetch: refetchMiles } =
    useIFTAMileage(year, quarter, company, truck)
  const { hutByTruck } = useHUTData(year, quarter, company)

  // Reload rates from localStorage when year/quarter changes
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`ifta_rates_${year}_${quarter}`) || 'null')
      setRates(saved ? { ...DEFAULT_RATES, ...saved } : { ...DEFAULT_RATES })
    } catch { setRates({ ...DEFAULT_RATES }) }
  }, [year, quarter])

  // Persist rates to localStorage whenever they change
  useEffect(() => {
    try { localStorage.setItem(`ifta_rates_${year}_${quarter}`, JSON.stringify(rates)) }
    catch { /* storage full — ignore */ }
  }, [rates, year, quarter])

  // Reset local edits whenever saved data or truck changes
  useEffect(() => {
    setMilesEdit(
      Object.fromEntries(Object.entries(savedMiles).map(([k, v]) => [k, String(v)]))
    )
  }, [savedMiles, truck, year, quarter])

  // Effective miles: merge savedMiles with local edits
  const effectiveMiles = useMemo(() => {
    const base = { ...savedMiles }
    for (const [st, val] of Object.entries(milesEdit)) {
      const n = Number(val)
      if (!isNaN(n)) base[st] = n
    }
    return base
  }, [savedMiles, milesEdit])

  // ── IFTA calculations ─────────────────────────────────────────────────────────
  const totalMiles = useMemo(
    () => STATES.reduce((s, st) => s + (effectiveMiles[st] || 0), 0),
    [effectiveMiles]
  )
  const mpg = totalMiles > 0 && totalGal > 0 ? totalMiles / totalGal : 0

  const stateRows = useMemo(() => {
    return STATES.map(st => {
      const stMiles   = effectiveMiles[st] || 0
      const taxPaidGal = fuelByState[st] || 0
      const taxableGal = mpg > 0 ? stMiles / mpg : 0
      const netGal     = taxableGal - taxPaidGal
      const rate       = rates[st] || 0
      const tax        = netGal * rate
      const hasSurcharge = st in SURCHARGES
      // Surcharge applies to ALL taxable gallons — no tax-paid credit (per IFTA rules)
      const surchargeTax = hasSurcharge ? taxableGal * SURCHARGES[st] : 0
      return { st, stMiles, taxPaidGal, taxableGal, netGal, rate, tax, hasSurcharge, surchargeTax }
    })
  }, [effectiveMiles, fuelByState, mpg, rates])

  const visibleRows = useMemo(() => {
    if (showAll) return stateRows
    return stateRows.filter(r => r.stMiles > 0 || r.taxPaidGal > 0)
  }, [stateRows, showAll])

  const totals = useMemo(() => {
    const base = stateRows.reduce((s, r) => ({
      taxPaidGal: s.taxPaidGal + r.taxPaidGal,
      taxableGal: s.taxableGal + r.taxableGal,
      netGal:     s.netGal + r.netGal,
      tax:        s.tax + r.tax,
      surchargeTax: s.surchargeTax + r.surchargeTax,
    }), { taxPaidGal: 0, taxableGal: 0, netGal: 0, tax: 0, surchargeTax: 0 })
    return { ...base, total: base.tax + base.surchargeTax }
  }, [stateRows])

  // Surcharge summary rows for states with surcharge
  const surchargeRows = useMemo(
    () => stateRows.filter(r => r.hasSurcharge && (r.stMiles > 0 || r.taxPaidGal > 0)),
    [stateRows]
  )

  // ── Actions ───────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (truck === 'ALL') return
    setSaving(true)
    setSaveMsg('')
    try {
      // Build map: include states where miles > 0, or where DB had a value (to allow zero-out)
      const toSave = {}
      for (const st of STATES) {
        const edited = Number(milesEditRef.current[st]) || 0
        const wasSaved = (savedMiles[st] || 0) > 0
        if (edited > 0 || wasSaved) toSave[st] = edited
      }
      await saveIFTAMileage(company !== 'all' ? company : 'carat', year, quarter, truck, toSave)
      await refetchMiles()
      setSaveMsg('Saved')
      setTimeout(() => setSaveMsg(''), 2500)
    } catch (e) {
      setSaveMsg('Error: ' + e.message)
    }
    setSaving(false)
  }, [truck, company, year, quarter, savedMiles, refetchMiles])

  const handlePrint = useCallback(() => {
    const coName = company === 'pro_freight' ? 'PRO FREIGHT TRANSPORTATION' : 'CARAT EXPEDITED INC'
    const truckLabel = truck === 'ALL' ? 'Fleet Total — All Trucks' : `Truck ${truck}`
    const periodStarts = [`${year}-01-01`, `${year}-04-01`, `${year}-07-01`, `${year}-10-01`]
    const periodEnds   = [`${year}-03-31`, `${year}-06-30`, `${year}-09-30`, `${year}-12-31`]
    const fmtDt = s => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const periodStr = `${fmtDt(periodStarts[quarter - 1])} – ${fmtDt(periodEnds[quarter - 1])}`

    const activeRows  = stateRows.filter(r => r.stMiles > 0 || r.taxPaidGal > 0)
    const activeSurch = surchargeRows

    const fmtTax = n => {
      if (Math.abs(n) < 0.005) return '—'
      return n < 0 ? `(${Math.abs(n).toFixed(2)})` : n.toFixed(2)
    }
    const fmtAmt = n => {
      if (Math.abs(n) < 0.005) return '$0.00'
      return n < 0 ? `($${Math.abs(n).toFixed(2)})` : `$${n.toFixed(2)}`
    }

    const isOO   = truck !== 'ALL'
    const line1  = totals.total
    const line2  = isOO ? (Number(prepFee) || 0) : 0
    const line3  = isOO ? (Number(hutFee)  || 0) : 0
    const totalDue = line1 + line2 + line3

    const stateTableRows = activeRows.map((r, i) => `
      <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f8f9fa'}">
        <td class="l bold">${r.st}${SURCHARGES[r.st] ? ' <span class="badge-s">+S</span>' : ''}</td>
        <td class="r">${fNum(r.stMiles)}</td>
        <td class="r">${r.taxPaidGal > 0 ? r.taxPaidGal.toFixed(3) : '—'}</td>
        <td class="r">${r.taxableGal > 0 ? r.taxableGal.toFixed(3) : '—'}</td>
        <td class="r ${r.netGal < -0.005 ? 'cr' : r.netGal > 0.005 ? 'dr' : ''}">${r.netGal !== 0 ? r.netGal.toFixed(3) : '—'}</td>
        <td class="r">${(rates[r.st] || 0).toFixed(4)}</td>
        <td class="r bold ${r.tax < -0.005 ? 'cr' : r.tax > 0.005 ? 'dr' : ''}">${fmtTax(r.tax)}</td>
      </tr>`).join('')

    const surchargeTableRows = activeSurch.map((r, i) => `
      <tr style="background:#fffbf0">
        <td class="l" style="color:#92400E;font-style:italic">${r.st} Surcharge</td>
        <td class="r" style="color:#9CA3AF">—</td>
        <td class="r" style="color:#9CA3AF">—</td>
        <td class="r" style="color:#9CA3AF">${r.taxableGal.toFixed(3)}</td>
        <td class="r dr">${r.taxableGal.toFixed(3)}</td>
        <td class="r">${SURCHARGES[r.st].toFixed(4)}</td>
        <td class="r bold dr">${fmtTax(r.surchargeTax)}</td>
      </tr>`).join('')

    const billingSection = isOO ? `
      <div class="billing-box">
        <div class="billing-title">OO Billing Summary</div>
        <table class="billing-table">
          <tr>
            <td class="billing-num">1.</td>
            <td class="billing-label">IFTA Tax / Credit Due</td>
            <td class="billing-amt ${line1 < 0 ? 'cr' : line1 > 0 ? 'dr' : ''}">${fmtAmt(line1)}</td>
          </tr>
          <tr>
            <td class="billing-num">2.</td>
            <td class="billing-label">Preparation Fee</td>
            <td class="billing-amt">${fmtAmt(line2)}</td>
          </tr>
          <tr>
            <td class="billing-num">3.</td>
            <td class="billing-label">New York + CT HUT</td>
            <td class="billing-amt">${fmtAmt(line3)}</td>
          </tr>
          <tr class="billing-total-row">
            <td class="billing-num"></td>
            <td class="billing-label bold">TOTAL AMOUNT DUE</td>
            <td class="billing-amt bold ${totalDue < 0 ? 'cr' : 'dr'}">${fmtAmt(totalDue)}</td>
          </tr>
        </table>
      </div>` : ''

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>IFTA Q${quarter} ${year} — ${truckLabel}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1a1a; background: #fff; padding: 32px 40px; }
    @media print { body { padding: 16px 20px; } @page { margin: 1cm; } }

    /* Header */
    .report-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1e3a5f; padding-bottom: 12px; margin-bottom: 18px; }
    .co-name { font-size: 18px; font-weight: 800; color: #1e3a5f; letter-spacing: 0.02em; }
    .co-sub { font-size: 11px; color: #6B7280; margin-top: 2px; }
    .report-title-block { text-align: right; }
    .report-title { font-size: 16px; font-weight: 700; color: #1e3a5f; }
    .report-sub { font-size: 12px; color: #374151; margin-top: 3px; }

    /* Info row */
    .info-row { display: flex; gap: 0; border: 1px solid #d1d5db; border-radius: 6px; overflow: hidden; margin-bottom: 20px; }
    .info-cell { flex: 1; padding: 10px 14px; border-right: 1px solid #e5e7eb; }
    .info-cell:last-child { border-right: none; }
    .info-cell-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: #6B7280; font-weight: 600; margin-bottom: 3px; }
    .info-cell-value { font-size: 14px; font-weight: 700; color: #111827; }

    /* State table */
    .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #6B7280; margin-bottom: 6px; }
    table.ifta-tbl { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    table.ifta-tbl thead tr { background: #1e3a5f; color: #fff; }
    table.ifta-tbl thead th { padding: 7px 8px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
    table.ifta-tbl tbody td { padding: 5px 8px; border-bottom: 1px solid #f0f0f0; font-size: 11px; }
    table.ifta-tbl tfoot td { padding: 7px 8px; font-size: 11px; font-weight: 700; background: #f1f5f9; border-top: 2px solid #1e3a5f; }
    .l { text-align: left; }
    .r { text-align: right; }
    .bold { font-weight: 700; }
    .dr { color: #b91c1c; }
    .cr { color: #15803d; }
    .badge-s { font-size: 8px; background: #fef3c7; color: #92400e; border-radius: 2px; padding: 0 3px; vertical-align: middle; }

    /* Totals note */
    .totals-note { font-size: 10px; color: #6B7280; margin-bottom: 20px; display: flex; gap: 20px; }

    /* Billing box */
    .billing-box { border: 2px solid #1e3a5f; border-radius: 6px; overflow: hidden; max-width: 380px; margin-left: auto; margin-bottom: 24px; }
    .billing-title { background: #1e3a5f; color: #fff; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 8px 14px; }
    .billing-table { width: 100%; border-collapse: collapse; }
    .billing-table tr { border-bottom: 1px solid #e5e7eb; }
    .billing-table tr:last-child { border-bottom: none; }
    .billing-num { padding: 8px 6px 8px 14px; width: 24px; color: #6B7280; font-size: 11px; }
    .billing-label { padding: 8px 6px; font-size: 11px; color: #374151; }
    .billing-amt { padding: 8px 14px 8px 6px; text-align: right; font-size: 12px; min-width: 90px; }
    .billing-total-row { background: #f8fafc; border-top: 2px solid #1e3a5f !important; }
    .billing-total-row .billing-label { font-size: 12px; color: #111827; }
    .billing-total-row .billing-amt { font-size: 14px; }

    /* Footer */
    .report-footer { border-top: 1px solid #e5e7eb; padding-top: 12px; font-size: 10px; color: #9CA3AF; display: flex; justify-content: space-between; }
    .sig-line { display: flex; gap: 40px; margin-top: 24px; }
    .sig-field { flex: 1; border-bottom: 1px solid #1a1a1a; padding-bottom: 2px; margin-bottom: 4px; min-width: 120px; height: 28px; }
    .sig-label { font-size: 9px; color: #6B7280; }
  </style>
</head>
<body>

  <div class="report-header">
    <div>
      <div class="co-name">${coName}</div>
      <div class="co-sub">Illinois IFTA Registrant</div>
    </div>
    <div class="report-title-block">
      <div class="report-title">IFTA Quarterly Report</div>
      <div class="report-sub">Q${quarter} ${year} &nbsp;·&nbsp; ${QTR_LABELS[quarter - 1].replace('–', '–')}</div>
    </div>
  </div>

  <div class="info-row">
    <div class="info-cell">
      <div class="info-cell-label">Vehicle</div>
      <div class="info-cell-value">${truckLabel}</div>
    </div>
    <div class="info-cell">
      <div class="info-cell-label">Period</div>
      <div class="info-cell-value" style="font-size:11px;padding-top:2px">${periodStr}</div>
    </div>
    <div class="info-cell">
      <div class="info-cell-label">Total Miles</div>
      <div class="info-cell-value">${fNum(totalMiles)}</div>
    </div>
    <div class="info-cell">
      <div class="info-cell-label">Total Diesel Gal</div>
      <div class="info-cell-value">${totalGal.toFixed(3)}</div>
    </div>
    <div class="info-cell">
      <div class="info-cell-label">Fleet MPG</div>
      <div class="info-cell-value">${mpg > 0 ? mpg.toFixed(2) : '—'}</div>
    </div>
  </div>

  <div class="section-title">IFTA State Mileage &amp; Tax Calculation</div>
  <table class="ifta-tbl">
    <thead>
      <tr>
        <th class="l" style="width:70px">State</th>
        <th class="r">Total Miles</th>
        <th class="r">Tax-Paid Gal</th>
        <th class="r">Taxable Gal</th>
        <th class="r">Net Gal</th>
        <th class="r">Rate ($/gal)</th>
        <th class="r">Tax / Credit</th>
      </tr>
    </thead>
    <tbody>
      ${stateTableRows}
      ${surchargeTableRows}
    </tbody>
    <tfoot>
      <tr>
        <td class="l bold">TOTALS</td>
        <td class="r">${fNum(totalMiles)}</td>
        <td class="r">${totals.taxPaidGal.toFixed(3)}</td>
        <td class="r">${totals.taxableGal.toFixed(3)}</td>
        <td class="r bold ${totals.netGal < 0 ? 'cr' : 'dr'}">${totals.netGal.toFixed(3)}</td>
        <td></td>
        <td class="r bold ${totals.total < 0 ? 'cr' : totals.total > 0 ? 'dr' : ''}">${fmtAmt(totals.total)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="totals-note">
    <span>Base IFTA: <strong>${fmtAmt(totals.tax)}</strong></span>
    <span>Surcharges (IN / KY / VA): <strong>${fmtAmt(totals.surchargeTax)}</strong></span>
    <span>Net IFTA Balance: <strong class="${totals.total < 0 ? 'cr' : 'dr'}">${fmtAmt(totals.total)}</strong></span>
  </div>

  ${billingSection}

  <div class="sig-line" style="${isOO ? '' : 'margin-top:32px'}">
    <div>
      <div class="sig-field"></div>
      <div class="sig-label">Authorized Signature</div>
    </div>
    <div>
      <div class="sig-field"></div>
      <div class="sig-label">Date</div>
    </div>
    <div style="flex:2"></div>
  </div>

  <div class="report-footer" style="margin-top:20px">
    <span>Generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
    <span>IFTA Q${quarter} ${year} · ${coName} · ${truckLabel}</span>
  </div>

</body>
</html>`

    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) { alert('Please allow pop-ups to print the report.'); return }
    w.document.write(html)
    w.document.close()
    setTimeout(() => { w.focus(); w.print() }, 400)
  }, [truck, quarter, year, company, stateRows, surchargeRows, totals, totalMiles, totalGal, mpg, rates, prepFee, hutFee])

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = async ev => {
      try {
        const truckMap   = parseMotiveCSV(ev.target.result)
        const truckCount = Object.keys(truckMap).length
        const rowCount   = Object.values(truckMap).reduce((s, m) => s + Object.keys(m).length, 0)
        if (!truckCount) {
          setImportMsg('No valid IFTA data found in this file.')
          return
        }
        // Detect company from load history — trucks driving for Pro Freight go to pro_freight
        const { from, to } = quarterRange(year, quarter)
        const fallback    = company !== 'all' ? company : 'carat'
        const companyMap  = await detectTruckCompanies(Object.keys(truckMap), from, to, fallback)
        setImportPreview({ truckMap, companyMap, truckCount, rowCount })
      } catch (err) {
        setImportMsg('Could not parse file — make sure it is the Motive distance summary CSV.')
      }
    }
    reader.readAsText(file)
  }, [year, quarter, company])

  const handleImportConfirm = useCallback(async () => {
    if (!importPreview) return
    setImporting(true)
    try {
      const fallback = company !== 'all' ? company : 'carat'
      const n = await saveIFTAMileageBulk(year, quarter, importPreview.truckMap, importPreview.companyMap, fallback)
      await refetchMiles()
      setImportPreview(null)
      setImportMsg(`Imported ${n} entries across ${importPreview.truckCount} trucks.`)
      setTimeout(() => setImportMsg(''), 4000)
    } catch (e) {
      setImportMsg('Import error: ' + e.message)
    }
    setImporting(false)
  }, [importPreview, company, year, quarter, refetchMiles])

  // ── HUT data for this quarter ─────────────────────────────────────────────────
  const hutTableData = useMemo(() => {
    const allTrucks = Object.keys(hutByTruck).sort((a, b) => Number(a) - Number(b))
    if (!allTrucks.length) return []
    return allTrucks.map(t => ({
      truck: t,
      KY: hutByTruck[t]?.KY || 0,
      NM: hutByTruck[t]?.NM || 0,
      CT: hutByTruck[t]?.CT || 0,
      NY: hutByTruck[t]?.NY || 0,
    }))
  }, [hutByTruck])

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="ifta-wrap" style={{ padding: '20px 24px', maxWidth: 1100, margin: '0 auto' }}>

      {/* ── Print styles ──────────────────────────────────────────────────── */}
      <style>{`
        @media print {
          .ifta-no-print { display: none !important; }
          .ifta-wrap { padding: 0 !important; max-width: 100% !important; }
          body { background: white !important; }
          * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .ifta-section + .ifta-section { page-break-before: auto; }
        }
        .ifta-miles-input {
          width: 80px; border: 1px solid #D1D5DB; border-radius: 4px;
          padding: 2px 6px; font-size: 13px; text-align: right;
          background: #FAFAFA;
        }
        .ifta-miles-input:focus {
          outline: none; border-color: #6366F1; background: white;
        }
        .ifta-miles-input:read-only {
          background: #F3F4F6; color: #6B7280; border-color: #E5E7EB; cursor: default;
        }
        .ifta-rate-input {
          width: 60px; border: 1px solid #D1D5DB; border-radius: 4px;
          padding: 2px 4px; font-size: 12px; text-align: right; background: white;
        }
        .ifta-rate-input:focus { outline: none; border-color: #6366F1; }
        .ifta-row:hover td { background: #F9FAFB; }
      `}</style>

      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div className="ifta-no-print" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>Year</label>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            style={{ border: '1px solid #D1D5DB', borderRadius: 6, padding: '5px 8px', fontSize: 13 }}
          >
            {[2024, 2025, 2026, 2027].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>Quarter</label>
          <select
            value={quarter}
            onChange={e => setQuarter(Number(e.target.value))}
            style={{ border: '1px solid #D1D5DB', borderRadius: 6, padding: '5px 8px', fontSize: 13 }}
          >
            {[1,2,3,4].map(q => <option key={q} value={q}>Q{q} — {QTR_LABELS[q-1]}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>Truck</label>
          <select
            value={truck}
            onChange={e => { setTruck(e.target.value); setMilesEdit({}) }}
            style={{ border: '1px solid #D1D5DB', borderRadius: 6, padding: '5px 8px', fontSize: 13, minWidth: 130 }}
          >
            <option value="ALL">All Trucks (Fleet)</option>
            {trucks.map(t => <option key={t} value={t}>Truck {t}</option>)}
          </select>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {(saveMsg || importMsg) && (
            <span style={{ fontSize: 12, color: (saveMsg || importMsg).startsWith('Error') || (saveMsg || importMsg).startsWith('No valid') ? '#DC2626' : '#16A34A', fontWeight: 500 }}>
              {saveMsg || importMsg}
            </span>
          )}
          {/* Hidden file input for CSV import */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              background: '#fff', color: '#374151', border: '1px solid #D1D5DB',
              borderRadius: 6, padding: '7px 14px', fontSize: 13, cursor: 'pointer',
            }}
            title="Import Motive distance_summary_by_vehicle CSV"
          >
            ↑ Import Motive CSV
          </button>
          {truck !== 'ALL' && (
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                background: '#4F46E5', color: '#fff', border: 'none', borderRadius: 6,
                padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: saving ? 'default' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save Mileage'}
            </button>
          )}
          <button
            onClick={handlePrint}
            style={{
              background: '#fff', color: '#374151', border: '1px solid #D1D5DB',
              borderRadius: 6, padding: '7px 14px', fontSize: 13, cursor: 'pointer',
            }}
          >
            Print / Export
          </button>
        </div>
      </div>

      {/* ── Print header (hidden on screen) ──────────────────────────────── */}
      <div style={{ display: 'none' }} className="ifta-print-only">
        <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>
          IFTA Report — Q{quarter} {year}
        </h2>
        <div style={{ fontSize: 14, color: '#374151', marginBottom: 16 }}>
          {truck === 'ALL' ? 'Fleet Total (All Trucks)' : `Truck ${truck}`}
        </div>
      </div>

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <SummaryCard label="Total Miles" value={fNum(totalMiles)} sub="from mileage entries" />
        <SummaryCard label="Total Diesel Gal" value={f2(totalGal)} sub="from EFS fuel records" />
        <SummaryCard label="Fleet MPG" value={mpg > 0 ? f2(mpg) : '—'} sub="miles ÷ gallons" />
        <SummaryCard
          label="Net IFTA Balance"
          value={totals.total === 0 ? '$0.00' : (totals.total > 0 ? `$${f2(totals.total)}` : `-$${f2(Math.abs(totals.total))}`)}
          sub={totals.total > 0 ? 'owed to states' : totals.total < 0 ? 'credit from states' : ''}
          color={totals.total > 0 ? '#DC2626' : totals.total < 0 ? '#16A34A' : '#111827'}
        />
      </div>

      {/* ── OO Billing Fees (per-truck only) ──────────────────────────── */}
      {truck !== 'ALL' && (
        <div className="ifta-no-print" style={{
          background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8,
          padding: '14px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            OO Billing Fees
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 12, color: '#6B7280' }}>Preparation Fee</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 13, color: '#374151' }}>$</span>
              <input
                type="number" min="0" step="1"
                value={prepFee}
                onChange={e => setPrepFee(e.target.value)}
                style={{ width: 72, border: '1px solid #D1D5DB', borderRadius: 5, padding: '4px 6px', fontSize: 13, textAlign: 'right' }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 12, color: '#6B7280' }}>NY + CT HUT</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 13, color: '#374151' }}>$</span>
              <input
                type="number" min="0" step="1"
                value={hutFee}
                onChange={e => setHutFee(e.target.value)}
                style={{ width: 72, border: '1px solid #D1D5DB', borderRadius: 5, padding: '4px 6px', fontSize: 13, textAlign: 'right' }}
              />
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ fontSize: 11, color: '#6B7280' }}>Total OO Amount Due</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: (totals.total + (Number(prepFee)||0) + (Number(hutFee)||0)) < 0 ? '#15803d' : '#b91c1c' }}>
              {(() => {
                const t = totals.total + (Number(prepFee)||0) + (Number(hutFee)||0)
                return t < 0 ? `($${Math.abs(t).toFixed(2)})` : `$${t.toFixed(2)}`
              })()}
            </div>
            <div style={{ fontSize: 10, color: '#9CA3AF' }}>IFTA + prep fee + HUT</div>
          </div>
        </div>
      )}

      {truck === 'ALL' && (
        <div style={{
          background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: 8,
          padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#3730A3',
        }} className="ifta-no-print">
          Showing aggregated fleet totals. Select a specific truck to enter or edit mileage.
        </div>
      )}

      {/* ── State filter toggle ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }} className="ifta-no-print">
        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>IFTA Mileage & Calculations</div>
        <button
          onClick={() => setShowAll(p => !p)}
          style={{
            background: 'none', border: '1px solid #D1D5DB', borderRadius: 6,
            padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#374151',
          }}
        >
          {showAll ? 'Hide empty states' : `Show all ${STATES.length} states`}
        </button>
        {!showAll && visibleRows.length === 0 && (
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>
            No mileage or fuel data yet for this period.
          </span>
        )}
      </div>

      {/* ── IFTA Table ────────────────────────────────────────────────────── */}
      <div className="ifta-section" style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ background: '#F9FAFB' }}>
                <th style={{ padding: '10px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid #E5E7EB', width: 50 }}>State</th>
                <th style={{ padding: '10px 10px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid #E5E7EB' }}>Miles</th>
                <th style={{ padding: '10px 10px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid #E5E7EB' }}>Tax-Paid Gal</th>
                <th style={{ padding: '10px 10px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid #E5E7EB' }}>Taxable Gal</th>
                <th style={{ padding: '10px 10px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid #E5E7EB' }}>Net Gal</th>
                <th style={{ padding: '10px 10px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid #E5E7EB', minWidth: 90 }}>Rate ($/gal)</th>
                <th style={{ padding: '10px 10px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid #E5E7EB' }}>Tax / Credit</th>
              </tr>
            </thead>
            <tbody>
              {(showAll ? stateRows : visibleRows).map(r => (
                <tr key={r.st} className="ifta-row">
                  <Cell>
                    <span style={{ fontWeight: 600, color: '#374151' }}>{r.st}</span>
                    {r.hasSurcharge && (
                      <span style={{ fontSize: 10, background: '#FEF3C7', color: '#92400E', borderRadius: 3, padding: '1px 4px', marginLeft: 4 }}>+S</span>
                    )}
                  </Cell>
                  <Cell right>
                    {truck === 'ALL' ? (
                      <span>{fNum(effectiveMiles[r.st] || 0)}</span>
                    ) : (
                      <input
                        className="ifta-miles-input"
                        type="number"
                        min="0"
                        step="1"
                        value={milesEdit[r.st] !== undefined ? milesEdit[r.st] : (effectiveMiles[r.st] || '')}
                        onChange={e => setMilesEdit(p => ({ ...p, [r.st]: e.target.value }))}
                        onFocus={e => e.target.select()}
                        placeholder="0"
                      />
                    )}
                  </Cell>
                  <Cell right muted={r.taxPaidGal === 0}>{f2(r.taxPaidGal)}</Cell>
                  <Cell right muted={r.taxableGal === 0}>{f2(r.taxableGal)}</Cell>
                  <Cell right style={{ color: r.netGal < 0 ? '#16A34A' : r.netGal > 0 ? '#DC2626' : undefined }}>
                    {f2(r.netGal)}
                  </Cell>
                  <Cell right>
                    {editingRateState === r.st ? (
                      <input
                        className="ifta-rate-input"
                        autoFocus
                        type="number"
                        step="0.001"
                        min="0"
                        value={rates[r.st] || 0}
                        onChange={e => setRates(p => ({ ...p, [r.st]: Number(e.target.value) }))}
                        onBlur={() => setEditingRateState(null)}
                        onKeyDown={e => e.key === 'Enter' && setEditingRateState(null)}
                      />
                    ) : (
                      <span
                        onClick={() => setEditingRateState(r.st)}
                        title="Click to edit rate"
                        style={{ cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: 2, color: '#374151' }}
                      >
                        {f2(rates[r.st] || 0)}
                      </span>
                    )}
                  </Cell>
                  <Cell right bold={Math.abs(r.tax) > 0} style={{ color: r.tax < 0 ? '#16A34A' : r.tax > 0 ? '#DC2626' : '#9CA3AF' }}>
                    {r.tax === 0 ? '—' : (r.tax < 0 ? `(${f2(Math.abs(r.tax))})` : f2(r.tax))}
                  </Cell>
                </tr>
              ))}

              {/* ── Surcharge rows ───────────────────────────────────────── */}
              {surchargeRows.map(r => (
                <tr key={`${r.st}-surcharge`} className="ifta-row">
                  <Cell>
                    <span style={{ color: '#92400E', fontWeight: 600 }}>{r.st} Surcharge</span>
                  </Cell>
                  <Cell right muted>—</Cell>
                  <Cell right muted>—</Cell>
                  <Cell right muted>{f2(r.taxableGal)}</Cell>
                  {/* Surcharge has no tax-paid credit — net = taxable */}
                  <Cell right style={{ color: '#DC2626' }}>{f2(r.taxableGal)}</Cell>
                  <Cell right muted>{f2(SURCHARGES[r.st])}</Cell>
                  <Cell right bold style={{ color: r.surchargeTax > 0 ? '#DC2626' : '#9CA3AF' }}>
                    {r.surchargeTax === 0 ? '—' : f2(r.surchargeTax)}
                  </Cell>
                </tr>
              ))}

              {/* ── Totals row ───────────────────────────────────────────── */}
              <tr style={{ background: '#F9FAFB', borderTop: '2px solid #E5E7EB' }}>
                <td colSpan={2} style={{ padding: '10px 10px', fontWeight: 700, fontSize: 13, color: '#111827' }}>
                  TOTALS
                </td>
                <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, fontSize: 13 }}>
                  {f2(totals.taxPaidGal)}
                </td>
                <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, fontSize: 13 }}>
                  {f2(totals.taxableGal)}
                </td>
                <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, fontSize: 13, color: totals.netGal < 0 ? '#16A34A' : totals.netGal > 0 ? '#DC2626' : undefined }}>
                  {f2(totals.netGal)}
                </td>
                <td style={{ padding: '10px 10px' }}></td>
                <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: totals.total > 0 ? '#DC2626' : totals.total < 0 ? '#16A34A' : '#374151' }}>
                  {totals.total === 0 ? '$0.00' : totals.total < 0
                    ? `($${f2(Math.abs(totals.total))})`
                    : `$${f2(totals.total)}`
                  }
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Base + surcharge breakdown */}
        {(totals.tax !== 0 || totals.surchargeTax !== 0) && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid #F3F4F6', fontSize: 12, color: '#6B7280', display: 'flex', gap: 20 }}>
            <span>Base IFTA: <strong style={{ color: '#374151' }}>${f2(totals.tax)}</strong></span>
            <span>Surcharges (IN/KY/VA): <strong style={{ color: '#374151' }}>${f2(totals.surchargeTax)}</strong></span>
            <span style={{ fontWeight: 600, color: totals.total > 0 ? '#DC2626' : '#16A34A' }}>
              Total Net: {totals.total >= 0 ? '' : '—'} ${f2(Math.abs(totals.total))}
            </span>
          </div>
        )}
      </div>

      {/* ── HUT Reference Section ─────────────────────────────────────────── */}
      <div className="ifta-section" style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>
            Highway Use Tax (HUT) Reference — {year}
          </div>
          <div style={{ fontSize: 12, color: '#6B7280' }}>
            KY / NM / CT — Q{quarter} only &nbsp;|&nbsp; NY — {year} annual (all quarters)
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          {hutTableData.length === 0 ? (
            <div style={{ padding: '24px 16px', color: '#9CA3AF', fontSize: 13 }}>
              Enter mileage per truck above — KY, NM, CT, and NY miles will appear here automatically.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F9FAFB' }}>
                  <th style={{ padding: '9px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid #E5E7EB' }}>Truck</th>
                  {Object.entries(HUT_INFO).map(([st, info]) => (
                    <th key={st} style={{ padding: '9px 10px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid #E5E7EB' }}>
                      {st} Miles<br />
                      <span style={{ fontWeight: 400, fontSize: 10, textTransform: 'none' }}>
                        {info.period === 'Annual' ? `(${year} Annual)` : `(Q${quarter} Only)`}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hutTableData.map(row => (
                  <tr key={row.truck} className="ifta-row">
                    <Cell><span style={{ fontWeight: 600 }}>Truck {row.truck}</span></Cell>
                    {['KY', 'NM', 'CT', 'NY'].map(st => (
                      <Cell key={st} right muted={row[st] === 0}>
                        {row[st] > 0 ? fNum(row[st]) : '—'}
                      </Cell>
                    ))}
                  </tr>
                ))}
                {/* Totals row */}
                <tr style={{ background: '#F9FAFB', borderTop: '2px solid #E5E7EB' }}>
                  <td style={{ padding: '10px 10px', fontWeight: 700, fontSize: 13 }}>TOTAL</td>
                  {['KY', 'NM', 'CT', 'NY'].map(st => (
                    <td key={st} style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, fontSize: 13 }}>
                      {fNum(hutTableData.reduce((s, r) => s + r[st], 0))}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          )}
        </div>
        <div style={{ padding: '10px 16px', fontSize: 11, color: '#9CA3AF', borderTop: '1px solid #F3F4F6' }}>
          Miles shown are YTD totals from all quarters entered. HUT is filed separately through each state's portal — this table is for reference only.
        </div>
      </div>

      {/* ── CSV Import Preview Modal ──────────────────────────────────────── */}
      {importPreview && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setImportPreview(null)}>
          <div className="modal" style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <div className="modal-title">Import Motive Mileage — Q{quarter} {year}</div>
              <button className="modal-close" onClick={() => setImportPreview(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight: 420, overflowY: 'auto' }}>
              <div style={{ marginBottom: 12, fontSize: 13, color: '#374151' }}>
                Found <strong>{importPreview.truckCount} trucks</strong> and <strong>{importPreview.rowCount} state entries</strong>.
                Existing entries for the same truck + state + quarter will be overwritten.
              </div>
              <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10, background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 6, padding: '8px 12px' }}>
                Company auto-detected from load history. Trucks with no loads in this quarter fall back to {company !== 'all' ? (company === 'pro_freight' ? 'Pro Freight' : 'Carat') : 'Carat'}.
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#F9FAFB' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #E5E7EB', fontSize: 11, color: '#6B7280', textTransform: 'uppercase' }}>Truck</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #E5E7EB', fontSize: 11, color: '#6B7280', textTransform: 'uppercase' }}>Company</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #E5E7EB', fontSize: 11, color: '#6B7280', textTransform: 'uppercase' }}>States</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #E5E7EB', fontSize: 11, color: '#6B7280', textTransform: 'uppercase' }}>Total Miles</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(importPreview.truckMap)
                    .sort((a, b) => Number(a[0]) - Number(b[0]))
                    .map(([t, stMap]) => {
                      const total = Object.values(stMap).reduce((s, m) => s + m, 0)
                      const co    = importPreview.companyMap?.[t] || 'carat'
                      const coLabel = co === 'pro_freight' ? 'Pro Freight' : 'Carat'
                      const coColor = co === 'pro_freight' ? '#7C3AED' : '#0284C7'
                      return (
                        <tr key={t} style={{ borderBottom: '1px solid #F3F4F6' }}>
                          <td style={{ padding: '7px 10px', fontWeight: 600 }}>Truck {t}</td>
                          <td style={{ padding: '7px 10px' }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: coColor, background: co === 'pro_freight' ? '#EDE9FE' : '#E0F2FE', borderRadius: 4, padding: '2px 7px' }}>
                              {coLabel}
                            </span>
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: '#6B7280' }}>{Object.keys(stMap).length}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right' }}>{fNum(total)}</td>
                        </tr>
                      )
                    })
                  }
                </tbody>
              </table>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setImportPreview(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleImportConfirm}
                disabled={importing}
              >
                {importing ? 'Importing…' : `Import ${importPreview.rowCount} entries`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
