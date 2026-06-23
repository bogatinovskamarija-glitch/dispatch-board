import { useState, useMemo } from 'react'
import { useMonthlyAccountingSummary } from '../../hooks/useMonthlyAccountingSummary'
import { useInsurance } from '../../hooks/useInsurance'
import { useMonthlyManual } from '../../hooks/useMonthlyManual'
import { useAllTimeSummary } from '../../hooks/useAllTimeSummary'

const fmt      = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtFull  = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtMiles = n => Number(n || 0).toLocaleString('en-US')

const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']

const C = {
  gross:       '#34D399',  // emerald-400
  payroll:     '#818CF8',  // indigo-400
  fuel:        '#FBBF24',  // amber-400
  maintenance: '#94A3B8',  // slate-400
  insurance:   '#FB7185',  // rose-400
  miles:       '#C084FC',  // purple-400
  net:         '#4ADE80',  // green-400
}

// Shared grid column definition — update here to affect all rows simultaneously
// month-name(180px) | gross | payroll | fuel | maintenance | insurance(fixed) | miles | units | net/unit
const COLS = '1fr 1fr 1fr 1fr 1fr 130px 1fr 70px 100px'

const MONTHLY_SESSION_KEY = 'monthly_unlocked'
const MONTHLY_PASSWORD    = import.meta.env.VITE_MONTHLY_PASSWORD || '08192021'

function formatRange(start, end) {
  const o = { month: 'short', day: 'numeric' }
  const s = new Date(start + 'T12:00:00').toLocaleDateString('en-US', o)
  const e = new Date(end   + 'T12:00:00').toLocaleDateString('en-US', o)
  return `${s} – ${e}`
}

// ── Inline password lock ──────────────────────────────────────────────────────
function MonthlyLock({ onUnlock }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    if (value === MONTHLY_PASSWORD) {
      sessionStorage.setItem(MONTHLY_SESSION_KEY, '1')
      onUnlock()
    } else {
      setError(true)
      setShake(true)
      setValue('')
      setTimeout(() => setShake(false), 500)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 6 }}>Monthly Overview</div>
      <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 28 }}>This section is separately protected.</div>
      <form onSubmit={handleSubmit} style={{ width: 260 }}>
        <input
          type="password"
          autoFocus
          placeholder="Password"
          value={value}
          onChange={e => { setValue(e.target.value); setError(false) }}
          className={shake ? 'shake' : ''}
          style={{
            width: '100%', padding: '10px 14px', fontSize: 16, letterSpacing: 4,
            textAlign: 'center', border: `1.5px solid ${error ? '#DC2626' : '#D1D5DB'}`,
            borderRadius: 8, marginBottom: 8, outline: 'none', boxSizing: 'border-box',
          }}
        />
        {error && (
          <div style={{ color: '#DC2626', fontSize: 12, textAlign: 'center', marginBottom: 8 }}>
            Incorrect password.
          </div>
        )}
        <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={!value}>
          Unlock
        </button>
      </form>
    </div>
  )
}

// ── Shared two-column modal fields helper ─────────────────────────────────────
function ModalCol({ title, state, onChange }) {
  const field = (label, key, type = 'number', placeholder = '0') => (
    <div className="form-group" key={key}>
      <label style={{ fontSize: 12 }}>{label}</label>
      <input
        type={type}
        min={type === 'number' ? '0' : undefined}
        step={key === 'miles' || key === 'unit_count' ? '1' : '0.01'}
        placeholder={placeholder}
        value={state[key]}
        onChange={e => onChange(key, e.target.value)}
      />
    </div>
  )
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 10, color: '#374151', fontSize: 13 }}>{title}</div>
      {field('Gross Revenue ($)',  'gross')}
      {field('Fuel ($)',           'fuel')}
      {field('Payroll ($)',        'payroll')}
      {field('Maintenance ($)',    'maintenance')}
      {field('Miles',              'miles')}
      {field('# Units (trucks)',   'unit_count')}
      {field('Notes (optional)',   'notes', 'text', 'e.g. source, remarks')}
    </div>
  )
}

// ── Insurance edit modal ──────────────────────────────────────────────────────
function InsuranceModal({ monthIdx, year, getEntry, onSave, onClose }) {
  const month = monthIdx + 1

  const initAmt   = (company, type) => { const e = getEntry(company, month, type); return e ? String(e.amount) : '' }
  const initNotes = (company, type) => getEntry(company, month, type)?.notes ?? ''

  const [caratLiabAmt,   setCaratLiabAmt]   = useState(() => initAmt('carat', 'liability'))
  const [caratLiabNotes, setCaratLiabNotes] = useState(() => initNotes('carat', 'liability'))
  const [caratCargoAmt,  setCaratCargoAmt]  = useState(() => initAmt('carat', 'cargo'))
  const [caratCargoNotes,setCaratCargoNotes]= useState(() => initNotes('carat', 'cargo'))
  const [proAmt,         setProAmt]         = useState(() => initAmt('pro_freight', 'liability'))
  const [proNotes,       setProNotes]       = useState(() => initNotes('pro_freight', 'liability'))
  const [saving,         setSaving]         = useState(false)
  const [err,            setErr]            = useState('')

  async function handleSave() {
    setSaving(true)
    setErr('')
    try {
      await onSave(month, caratLiabAmt, caratLiabNotes, caratCargoAmt, caratCargoNotes, proAmt, proNotes)
      onClose()
    } catch (e) {
      setErr(e.message)
      setSaving(false)
    }
  }

  const AmtField = ({ label, val, onChange, notes, onNotesChange }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 6 }}>{label}</div>
      <div className="form-group" style={{ marginBottom: 4 }}>
        <label style={{ fontSize: 11 }}>Amount ($)</label>
        <input type="number" min="0" step="0.01" placeholder="0.00" value={val} onChange={e => onChange(e.target.value)} />
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label style={{ fontSize: 11 }}>Notes (optional)</label>
        <input placeholder="policy #, provider…" value={notes} onChange={e => onNotesChange(e.target.value)} />
      </div>
    </div>
  )

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div className="modal-title">Insurance — {MONTHS_FULL[monthIdx]} {year}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 12, color: '#374151', fontSize: 13, borderBottom: '1px solid #E5E7EB', paddingBottom: 6 }}>
                Carat Expedited
              </div>
              <AmtField label="Liability" val={caratLiabAmt} onChange={setCaratLiabAmt} notes={caratLiabNotes} onNotesChange={setCaratLiabNotes} />
              <AmtField label="Cargo"     val={caratCargoAmt} onChange={setCaratCargoAmt} notes={caratCargoNotes} onNotesChange={setCaratCargoNotes} />
              {(Number(caratLiabAmt)||0) + (Number(caratCargoAmt)||0) > 0 && (
                <div style={{ fontSize: 11, color: '#6B7280', textAlign: 'right', marginTop: 4 }}>
                  Total: <strong style={{ color: '#DC2626' }}>${((Number(caratLiabAmt)||0) + (Number(caratCargoAmt)||0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                </div>
              )}
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 12, color: '#374151', fontSize: 13, borderBottom: '1px solid #E5E7EB', paddingBottom: 6 }}>
                Pro Freight
              </div>
              <AmtField label="Liability" val={proAmt} onChange={setProAmt} notes={proNotes} onNotesChange={setProNotes} />
            </div>
          </div>
          {err && <div style={{ color: '#DC2626', fontSize: 12, marginTop: 8 }}>Error: {err}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Manual data modal ─────────────────────────────────────────────────────────
function ManualDataModal({ monthIdx, year, rawEntries, onSave, onClose }) {
  const month = monthIdx + 1
  const ce = rawEntries?.carat       || {}
  const pe = rawEntries?.pro_freight || {}

  const init = src => ({
    gross:       src.gross       != null ? String(src.gross)       : '',
    fuel:        src.fuel        != null ? String(src.fuel)        : '',
    payroll:     src.payroll     != null ? String(src.payroll)     : '',
    miles:       src.miles       != null ? String(src.miles)       : '',
    maintenance: src.maintenance != null ? String(src.maintenance) : '',
    unit_count:  src.unit_count  != null ? String(src.unit_count)  : '',
    notes:       src.notes ?? '',
  })

  const [carat,  setCarat]  = useState(() => init(ce))
  const [pro,    setPro]    = useState(() => init(pe))
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  function updateCarat(key, val) { setCarat(p => ({ ...p, [key]: val })) }
  function updatePro(key, val)   { setPro(p   => ({ ...p, [key]: val })) }

  async function handleSave() {
    setSaving(true)
    setErr('')
    try {
      await onSave(
        month,
        {
          gross:       Number(carat.gross)       || 0,
          fuel:        Number(carat.fuel)        || 0,
          payroll:     Number(carat.payroll)     || 0,
          miles:       Number(carat.miles)       || 0,
          maintenance: Number(carat.maintenance) || 0,
          unit_count:  carat.unit_count !== '' ? (Number(carat.unit_count) || null) : null,
          notes:       carat.notes,
        },
        {
          gross:       Number(pro.gross)       || 0,
          fuel:        Number(pro.fuel)        || 0,
          payroll:     Number(pro.payroll)     || 0,
          miles:       Number(pro.miles)       || 0,
          maintenance: Number(pro.maintenance) || 0,
          unit_count:  pro.unit_count !== '' ? (Number(pro.unit_count) || null) : null,
          notes:       pro.notes,
        },
      )
      onClose()
    } catch (e) {
      setErr(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <div className="modal-title">Manual Data — {MONTHS_FULL[monthIdx]} {year}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 16, background: '#F9FAFB', padding: '8px 12px', borderRadius: 6 }}>
            These values are added on top of actual system data. Use for months with missing or incomplete records.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <ModalCol title="Carat Expedited" state={carat} onChange={updateCarat} />
            <ModalCol title="Pro Freight"     state={pro}   onChange={updatePro}   />
          </div>
          {err && <div style={{ color: '#DC2626', fontSize: 12, marginTop: 8 }}>Error: {err}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Small icon button ─────────────────────────────────────────────────────────
function IconBtn({ title, icon, onClick, active }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick() }}
      title={title}
      style={{
        background: active ? '#FEF2F2' : 'none',
        border: 'none', cursor: 'pointer',
        color: active ? C.insurance : '#9CA3AF',
        fontSize: 12, padding: '2px 4px', lineHeight: 1, borderRadius: 4,
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#F3F4F6' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'none' }}
    >
      {icon}
    </button>
  )
}

// ── Print / PDF report ────────────────────────────────────────────────────────
function printReport(year, monthsEnriched, totals, company) {
  const companyLabel = company === 'all' ? 'All Companies' : company === 'carat' ? 'Carat Expedited' : 'Pro Freight'
  const generated = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const rows = monthsEnriched.map((m, i) => {
    const gross = m.gross + m.manual.gross
    const payroll = m.payroll + m.manual.payroll
    const fuel = m.fuel + m.manual.fuel
    const maint = m.maintenance + m.manual.maintenance
    const ins = m.insurance
    const miles = m.miles + m.manual.miles
    const expenses = payroll + fuel + maint + ins
    const net = gross - expenses
    const hasAny = gross > 0 || expenses > 0

    const cell = (val, color) => val > 0 ? `<td style="color:${color};font-weight:600">${fmtFull(val)}</td>` : `<td style="color:#9CA3AF">—</td>`
    const netColor = net >= 0 ? '#059669' : '#DC2626'

    return `<tr style="${!hasAny ? 'color:#ccc' : ''}">
      <td style="font-weight:700;color:#111">${MONTHS_FULL[i]}</td>
      ${cell(gross,   '#059669')}
      ${cell(payroll, '#2563EB')}
      ${cell(fuel,    '#D97706')}
      ${cell(maint,   '#6B7280')}
      ${cell(ins,     '#DC2626')}
      <td style="font-weight:700;color:${netColor}">${fmtFull(net)}</td>
      <td style="color:#8B5CF6">${miles > 0 ? fmtMiles(miles) : '—'}</td>
    </tr>`
  }).join('')

  const totalNet = totals.gross - totals.payroll - totals.fuel - totals.maintenance - totals.insurance
  const netColor = totalNet >= 0 ? '#059669' : '#DC2626'

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Monthly Overview ${year} — ${companyLabel}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111827; padding: 32px 40px; }
    header { margin-bottom: 24px; border-bottom: 2px solid #E5E7EB; padding-bottom: 16px; }
    h1 { font-size: 20px; font-weight: 800; margin-bottom: 4px; }
    .meta { font-size: 12px; color: #6B7280; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th { background: #F3F4F6; padding: 8px 10px; text-align: right; font-size: 11px; font-weight: 700; border-bottom: 2px solid #D1D5DB; white-space: nowrap; }
    th:first-child { text-align: left; }
    td { padding: 7px 10px; text-align: right; border-bottom: 1px solid #F3F4F6; font-size: 12px; }
    td:first-child { text-align: left; }
    .total-row td { background: #F3F4F6; font-weight: 800; font-size: 13px; border-top: 2px solid #D1D5DB; border-bottom: none; padding: 10px; }
    @media print { body { padding: 16px 20px; } @page { margin: 1cm; } }
  </style>
</head>
<body>
  <header>
    <h1>Annual Overview — ${year}</h1>
    <div class="meta">${companyLabel} &nbsp;·&nbsp; Generated ${generated}</div>
  </header>
  <table>
    <thead>
      <tr>
        <th>Month</th>
        <th style="color:#059669">Gross</th>
        <th style="color:#2563EB">Payroll</th>
        <th style="color:#D97706">Fuel</th>
        <th style="color:#6B7280">Maintenance</th>
        <th style="color:#DC2626">Insurance</th>
        <th style="color:#059669">Operating Net</th>
        <th style="color:#8B5CF6">Miles</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="total-row">
        <td>Year Total</td>
        <td style="color:#059669">${fmtFull(totals.gross)}</td>
        <td style="color:#2563EB">${fmtFull(totals.payroll)}</td>
        <td style="color:#D97706">${fmtFull(totals.fuel)}</td>
        <td style="color:#6B7280">${fmtFull(totals.maintenance)}</td>
        <td style="color:#DC2626">${fmtFull(totals.insurance)}</td>
        <td style="color:${netColor}">${fmtFull(totalNet)}</td>
        <td style="color:#8B5CF6">${fmtMiles(totals.miles)}</td>
      </tr>
    </tbody>
  </table>
</body>
</html>`

  const w = window.open('', '_blank')
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 400)
}

// ── Monthly expenses + net chart ──────────────────────────────────────────────
function MonthlyChart({ months }) {
  const W = 920, LEFT = 72, RIGHT = 20, TOP = 32, BOT = 30, PLOT_H = 210
  const PLOT_W = W - LEFT - RIGHT
  const SVG_H  = TOP + PLOT_H + BOT
  const MONTH_W = PLOT_W / 12
  const EXPENSE_W = 20, NET_W = 14, GAP = 5
  const GROUP_W = EXPENSE_W + GAP + NET_W
  const GROUP_X = (MONTH_W - GROUP_W) / 2

  const data = months.map(m => {
    const payroll = m.payroll + (m.manual?.payroll || 0)
    const fuel    = m.fuel    + (m.manual?.fuel    || 0)
    const maint   = m.maintenance + (m.manual?.maintenance || 0)
    const ins     = m.insurance
    const gross   = m.gross   + (m.manual?.gross   || 0)
    const expenses = payroll + fuel + maint + ins
    const net = gross - expenses
    return { payroll, fuel, maint, ins, expenses, net }
  })

  const maxVal = Math.max(...data.map(d => d.expenses), ...data.map(d => Math.abs(d.net)), 1)
  const gridPcts = [0, 0.25, 0.5, 0.75, 1]

  const legend = [
    { color: C.payroll,     label: 'Payroll' },
    { color: C.fuel,        label: 'Fuel' },
    { color: C.maintenance, label: 'Maintenance' },
    { color: C.insurance,   label: 'Insurance' },
    { color: C.gross,       label: 'Operating Net' },
  ]

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${SVG_H}`} style={{ fontFamily: 'Arial, sans-serif', display: 'block' }}>
      {legend.map((l, i) => (
        <g key={l.label} transform={`translate(${LEFT + i * 142}, 8)`}>
          <rect width={10} height={10} fill={l.color} rx={2} y={2} />
          <text x={14} y={11} fontSize={10} fill="#374151">{l.label}</text>
        </g>
      ))}
      {gridPcts.map((f, i) => {
        const y = TOP + PLOT_H - f * PLOT_H
        return (
          <g key={i}>
            <line x1={LEFT} y1={y} x2={LEFT + PLOT_W} y2={y} stroke="#E5E7EB" strokeWidth={1} />
            <text x={LEFT - 6} y={y + 4} textAnchor="end" fontSize={9} fill="#9CA3AF">{fmt(f * maxVal)}</text>
          </g>
        )
      })}
      {data.map((d, mi) => {
        const ox = LEFT + mi * MONTH_W + GROUP_X
        const baseline = TOP + PLOT_H
        const segments = [
          { val: d.payroll, color: C.payroll },
          { val: d.fuel,    color: C.fuel },
          { val: d.maint,   color: C.maintenance },
          { val: d.ins,     color: C.insurance },
        ]
        const netAbs = Math.abs(d.net)
        const netBH  = netAbs > 0 ? Math.max((netAbs / maxVal) * PLOT_H, 2) : 0
        const netColor = d.net >= 0 ? C.gross : '#EF4444'
        const netY = d.net >= 0 ? baseline - netBH : baseline
        return (
          <g key={mi}>
            {(() => {
              let y = baseline
              return segments.map((seg, si) => {
                if (seg.val <= 0) return null
                const bh = Math.max((seg.val / maxVal) * PLOT_H, 1)
                y -= bh
                return <rect key={si} x={ox} y={y} width={EXPENSE_W} height={bh} fill={seg.color} />
              })
            })()}
            {netBH > 0 && <rect x={ox + EXPENSE_W + GAP} y={netY} width={NET_W} height={netBH} fill={netColor} rx={2} />}
            <text x={LEFT + mi * MONTH_W + MONTH_W / 2} y={TOP + PLOT_H + 16} textAnchor="middle" fontSize={10} fill="#374151" fontWeight="600">
              {MONTHS[mi]}
            </text>
          </g>
        )
      })}
      <line x1={LEFT} y1={TOP}          x2={LEFT}          y2={TOP + PLOT_H} stroke="#D1D5DB" strokeWidth={1} />
      <line x1={LEFT} y1={TOP + PLOT_H} x2={LEFT + PLOT_W} y2={TOP + PLOT_H} stroke="#D1D5DB" strokeWidth={1} />
    </svg>
  )
}

function MileageChart({ months }) {
  const W = 920, LEFT = 72, RIGHT = 20, TOP = 8, PLOT_H = 52
  const PLOT_W = W - LEFT - RIGHT
  const SVG_H  = TOP + PLOT_H + 4
  const MONTH_W = PLOT_W / 12
  const BAR_W   = 28
  const maxVal  = Math.max(...months.map(m => m.miles), 1)

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${SVG_H}`} style={{ fontFamily: 'Arial, sans-serif', display: 'block', marginTop: 2 }}>
      <text x={LEFT - 6} y={TOP + 10}         textAnchor="end" fontSize={9} fill="#9CA3AF">{fmtMiles(maxVal)}</text>
      <text x={LEFT - 6} y={TOP + PLOT_H + 2} textAnchor="end" fontSize={9} fill="#9CA3AF">0</text>
      {months.map((m, mi) => {
        const bh = m.miles > 0 ? Math.max((m.miles / maxVal) * PLOT_H, 2) : 0
        return <rect key={mi} x={LEFT + mi * MONTH_W + (MONTH_W - BAR_W) / 2} y={TOP + PLOT_H - bh} width={BAR_W} height={bh} fill={C.miles} rx={2} opacity={0.75} />
      })}
      <line x1={LEFT} y1={TOP}          x2={LEFT}          y2={TOP + PLOT_H} stroke="#D1D5DB" strokeWidth={1} />
      <line x1={LEFT} y1={TOP + PLOT_H} x2={LEFT + PLOT_W} y2={TOP + PLOT_H} stroke="#D1D5DB" strokeWidth={1} />
    </svg>
  )
}

// ── All-time year-over-year chart ─────────────────────────────────────────────
function AllTimeChart({ data }) {
  if (!data.length) return null
  const n = data.length
  const W = 920, LEFT = 72, RIGHT = 20, TOP = 32, BOT = 44, PLOT_H = 220
  const PLOT_W = W - LEFT - RIGHT
  const SVG_H  = TOP + PLOT_H + BOT
  const YEAR_W = PLOT_W / n
  const EXP_W  = Math.min(Math.floor(YEAR_W * 0.38), 44)
  const NET_W  = Math.min(Math.floor(YEAR_W * 0.22), 26)
  const GAP    = 5

  const maxVal = Math.max(
    ...data.map(y => y.payroll + y.fuel + y.maintenance + y.insurance),
    ...data.map(y => Math.abs(y.net)),
    1
  )

  const legend = [
    { color: C.payroll,     label: 'Payroll' },
    { color: C.fuel,        label: 'Fuel' },
    { color: C.maintenance, label: 'Maintenance' },
    { color: C.insurance,   label: 'Insurance' },
    { color: C.net,         label: 'Net Revenue' },
  ]

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${SVG_H}`} style={{ fontFamily: 'Arial, sans-serif', display: 'block' }}>
      {legend.map((l, i) => (
        <g key={l.label} transform={`translate(${LEFT + i * 142}, 8)`}>
          <rect width={10} height={10} fill={l.color} rx={2} y={2} />
          <text x={14} y={11} fontSize={10} fill="#374151">{l.label}</text>
        </g>
      ))}

      {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
        const y = TOP + PLOT_H - f * PLOT_H
        return (
          <g key={i}>
            <line x1={LEFT} y1={y} x2={LEFT + PLOT_W} y2={y} stroke="#E5E7EB" strokeWidth={1} />
            <text x={LEFT - 6} y={y + 4} textAnchor="end" fontSize={9} fill="#9CA3AF">{fmt(f * maxVal)}</text>
          </g>
        )
      })}

      {data.map((d, i) => {
        const cx     = LEFT + i * YEAR_W + YEAR_W / 2
        const ox     = cx - (EXP_W + GAP + NET_W) / 2
        const baseline = TOP + PLOT_H
        const segments = [
          { val: d.payroll,     color: C.payroll },
          { val: d.fuel,        color: C.fuel },
          { val: d.maintenance, color: C.maintenance },
          { val: d.insurance,   color: C.insurance },
        ]
        const netAbs  = Math.abs(d.net)
        const netBH   = netAbs > 0 ? Math.max((netAbs / maxVal) * PLOT_H, 2) : 0
        const netColor = d.net >= 0 ? C.net : '#EF4444'
        const netY    = d.net >= 0 ? baseline - netBH : baseline

        return (
          <g key={d.year}>
            {(() => {
              let y = baseline
              return segments.map((seg, si) => {
                if (seg.val <= 0) return null
                const bh = Math.max((seg.val / maxVal) * PLOT_H, 1)
                y -= bh
                return <rect key={si} x={ox} y={y} width={EXP_W} height={bh} fill={seg.color} />
              })
            })()}
            {netBH > 0 && <rect x={ox + EXP_W + GAP} y={netY} width={NET_W} height={netBH} fill={netColor} rx={2} />}
            <text x={cx} y={TOP + PLOT_H + 14} textAnchor="middle" fontSize={10} fill="#374151" fontWeight="700">{d.year}</text>
            {d.units != null && (
              <text x={cx} y={TOP + PLOT_H + 26} textAnchor="middle" fontSize={8.5} fill="#9CA3AF">{d.units} units</text>
            )}
            {d.netPerUnit != null && (
              <text x={cx} y={TOP + PLOT_H + 38} textAnchor="middle" fontSize={8} fill={d.net >= 0 ? C.net : '#EF4444'} fontWeight="600">
                {fmt(d.netPerUnit)}/unit
              </text>
            )}
          </g>
        )
      })}

      <line x1={LEFT} y1={TOP}          x2={LEFT}          y2={TOP + PLOT_H} stroke="#D1D5DB" strokeWidth={1} />
      <line x1={LEFT} y1={TOP + PLOT_H} x2={LEFT + PLOT_W} y2={TOP + PLOT_H} stroke="#D1D5DB" strokeWidth={1} />
    </svg>
  )
}

// ── Cell ──────────────────────────────────────────────────────────────────────
function Cell({ val, color, small }) {
  return (
    <div style={{ textAlign: 'right', color: val > 0 ? color : '#D1D5DB', fontWeight: val > 0 ? (small ? 500 : 700) : 400 }}>
      {val > 0 ? fmt(val) : '—'}
    </div>
  )
}

// ── Month row ─────────────────────────────────────────────────────────────────
function MonthRow({ m, idx, isExpanded, onToggle, insuranceAmt, manual, onEditInsurance, onEditManual }) {
  const combined = {
    gross:       m.gross       + manual.gross,
    payroll:     m.payroll     + manual.payroll,
    fuel:        m.fuel        + manual.fuel,
    maintenance: m.maintenance + manual.maintenance,
    miles:       m.miles       + manual.miles,
  }
  const net        = combined.gross - combined.payroll - combined.fuel - combined.maintenance - insuranceAmt
  const unitCount  = manual.unit_count > 0 ? manual.unit_count : null
  const netPerUnit = unitCount ? net / unitCount : null

  const hasManual = manual.gross > 0 || manual.fuel > 0 || manual.payroll > 0 || manual.miles > 0 || manual.maintenance > 0 || manual.unit_count > 0
  const hasData   = combined.gross > 0 || combined.payroll > 0 || combined.fuel > 0 || combined.maintenance > 0 || combined.miles > 0 || insuranceAmt > 0

  return (
    <>
      <div
        onClick={() => hasData && onToggle(idx)}
        style={{
          display: 'grid', gridTemplateColumns: `180px ${COLS}`,
          padding: '10px 16px', gap: 8,
          borderTop: idx > 0 ? '1px solid #F3F4F6' : 'none',
          cursor: hasData ? 'pointer' : 'default',
          background: isExpanded ? '#F0FDF4' : undefined,
          alignItems: 'center',
        }}
      >
        {/* Month name + action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: hasData ? '#6B7280' : '#D1D5DB', fontSize: 10, marginRight: 2 }}>
            {hasData ? (isExpanded ? '▾' : '▸') : '–'}
          </span>
          <span style={{ fontWeight: 700, color: '#111827', fontSize: 13 }}>{MONTHS_FULL[idx]}</span>
          {hasManual && (
            <span style={{ fontSize: 9, background: '#EDE9FE', color: '#7C3AED', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>
              +manual
            </span>
          )}
          <IconBtn icon="✎" title="Edit insurance"  onClick={() => onEditInsurance(idx)} active={insuranceAmt > 0} />
          <IconBtn icon="⊕" title="Add manual data" onClick={() => onEditManual(idx)}   active={hasManual} />
        </div>

        <Cell val={combined.gross}       color={C.gross}       />
        <Cell val={combined.payroll}     color={C.payroll}     />
        <Cell val={combined.fuel}        color={C.fuel}        />
        <Cell val={combined.maintenance} color={C.maintenance} />

        {/* Insurance cell */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <span style={{ color: insuranceAmt > 0 ? C.insurance : '#D1D5DB', fontWeight: insuranceAmt > 0 ? 700 : 400 }}>
            {insuranceAmt > 0 ? fmt(insuranceAmt) : '—'}
          </span>
        </div>

        {/* Miles */}
        <div style={{ textAlign: 'right', color: combined.miles > 0 ? C.miles : '#D1D5DB', fontWeight: combined.miles > 0 ? 600 : 400 }}>
          {combined.miles > 0 ? fmtMiles(combined.miles) : '—'}
        </div>

        {/* Units */}
        <div style={{ textAlign: 'right', color: unitCount ? '#374151' : '#D1D5DB', fontWeight: unitCount ? 600 : 400, fontSize: 12 }}>
          {unitCount ?? '—'}
        </div>

        {/* Net / Unit */}
        <div style={{ textAlign: 'right', fontSize: 12, fontWeight: netPerUnit != null ? 700 : 400, color: netPerUnit != null ? (net >= 0 ? C.net : '#DC2626') : '#D1D5DB' }}>
          {netPerUnit != null ? fmt(netPerUnit) : '—'}
        </div>
      </div>

      {/* Expanded weekly rows */}
      {isExpanded && (
        <div style={{ borderTop: '1px solid #D1FAE5', borderBottom: '1px solid #D1FAE5' }}>
          {/* Sub-header */}
          <div style={{ display: 'grid', gridTemplateColumns: `180px ${COLS}`, padding: '5px 16px 5px 36px', gap: 8, background: '#F3F4F6', fontSize: 10, fontWeight: 700, color: '#9CA3AF' }}>
            <div>Week (Thu – Wed)</div>
            <div style={{ textAlign: 'right' }}>Gross</div>
            <div style={{ textAlign: 'right' }}>Payroll</div>
            <div style={{ textAlign: 'right' }}>Fuel</div>
            <div style={{ textAlign: 'right' }}>Maintenance</div>
            <div style={{ textAlign: 'right' }}>Insurance</div>
            <div style={{ textAlign: 'right' }}>Miles</div>
            <div style={{ textAlign: 'right' }}>Units</div>
            <div style={{ textAlign: 'right' }}>Net/Unit</div>
          </div>

          {m.weeks.length === 0 && !hasManual && (
            <div style={{ padding: '10px 36px', color: '#9CA3AF', fontSize: 12 }}>No weekly data.</div>
          )}

          {m.weeks.map(wk => (
            <div key={wk.start} style={{ display: 'grid', gridTemplateColumns: `180px ${COLS}`, padding: '6px 16px 6px 36px', gap: 8, borderTop: '1px solid #E5E7EB', fontSize: 12 }}>
              <div style={{ color: '#6B7280', fontSize: 11 }}>{formatRange(wk.start, wk.end)}</div>
              <Cell val={wk.gross}       color={C.gross}       small />
              <Cell val={wk.payroll}     color={C.payroll}     small />
              <Cell val={wk.fuel}        color={C.fuel}        small />
              <Cell val={wk.maintenance} color={C.maintenance} small />
              <div style={{ textAlign: 'right', color: '#D1D5DB' }}>—</div>
              <div style={{ textAlign: 'right', color: wk.miles > 0 ? C.miles : '#D1D5DB', fontSize: 12 }}>
                {wk.miles > 0 ? fmtMiles(wk.miles) : '—'}
              </div>
              <div style={{ textAlign: 'right', color: '#D1D5DB' }}>—</div>
              <div style={{ textAlign: 'right', color: '#D1D5DB' }}>—</div>
            </div>
          ))}

          {/* Manual entries summary row */}
          {hasManual && (
            <div style={{ display: 'grid', gridTemplateColumns: `180px ${COLS}`, padding: '6px 16px 6px 36px', gap: 8, borderTop: '1px solid #E5E7EB', background: '#FAF5FF', fontSize: 12 }}>
              <div style={{ color: '#7C3AED', fontWeight: 600, fontSize: 11 }}>⊕ Manual entry</div>
              <Cell val={manual.gross}       color="#7C3AED" small />
              <Cell val={manual.payroll}     color="#7C3AED" small />
              <Cell val={manual.fuel}        color="#7C3AED" small />
              <Cell val={manual.maintenance} color="#7C3AED" small />
              <div style={{ textAlign: 'right', color: '#D1D5DB' }}>—</div>
              <div style={{ textAlign: 'right', color: manual.miles > 0 ? '#7C3AED' : '#D1D5DB', fontSize: 12 }}>
                {manual.miles > 0 ? fmtMiles(manual.miles) : '—'}
              </div>
              <div style={{ textAlign: 'right', color: manual.unit_count > 0 ? '#7C3AED' : '#D1D5DB', fontWeight: 600 }}>
                {manual.unit_count > 0 ? manual.unit_count : '—'}
              </div>
              <div style={{ textAlign: 'right', color: '#D1D5DB' }}>—</div>
            </div>
          )}

          {/* Month subtotal */}
          <div style={{ display: 'grid', gridTemplateColumns: `180px ${COLS}`, padding: '7px 16px 7px 36px', gap: 8, borderTop: '2px solid #BBF7D0', background: '#ECFDF5', fontWeight: 700, fontSize: 12 }}>
            <div style={{ color: '#374151' }}>Month Total</div>
            <Cell val={combined.gross}       color={C.gross}       />
            <Cell val={combined.payroll}     color={C.payroll}     />
            <Cell val={combined.fuel}        color={C.fuel}        />
            <Cell val={combined.maintenance} color={C.maintenance} />
            <Cell val={insuranceAmt}         color={C.insurance}   />
            <div style={{ textAlign: 'right', color: combined.miles > 0 ? C.miles : '#D1D5DB', fontWeight: 700 }}>
              {combined.miles > 0 ? fmtMiles(combined.miles) : '—'}
            </div>
            <div style={{ textAlign: 'right', color: unitCount ? '#374151' : '#D1D5DB', fontWeight: 700 }}>
              {unitCount ?? '—'}
            </div>
            <div style={{ textAlign: 'right', fontWeight: 700, color: netPerUnit != null ? (net >= 0 ? C.net : '#DC2626') : '#D1D5DB' }}>
              {netPerUnit != null ? fmt(netPerUnit) : '—'}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MonthlySummaryTab({ company }) {
  const currentYear = new Date().getFullYear()
  const [year,         setYear]         = useState(currentYear)
  const [expanded,     setExpanded]     = useState(null)
  const [unlocked,     setUnlocked]     = useState(() => sessionStorage.getItem(MONTHLY_SESSION_KEY) === '1')
  const [editInsMonth, setEditInsMonth] = useState(null)
  const [editManMonth, setEditManMonth] = useState(null)
  const [allTimeKey,   setAllTimeKey]   = useState(0)

  const { months, loading }          = useMonthlyAccountingSummary(year, company)
  const { entries: insEntries, getAmount, getEntry, setAmount } = useInsurance(year)
  const { entries: manEntries, getManual, getRawEntries, saveMonth } = useMonthlyManual(year)
  const { yearSummaries, loading: allTimeLoading } = useAllTimeSummary(company, allTimeKey)

  async function handleSaveManual(month, caratData, proData) {
    await saveMonth(month, caratData, proData)
    setAllTimeKey(k => k + 1)
  }

  const monthsEnriched = useMemo(() =>
    months.map((m, i) => {
      const manual = getManual(company, i + 1)
      // Use manual unit_count if entered; fall back to computed weekly avg trucks from loads
      if (!manual.unit_count && m.avgTrucks) manual.unit_count = m.avgTrucks
      return {
        ...m,
        insurance: getAmount(company, i + 1),
        manual,
      }
    }),
    [months, insEntries, manEntries, company]
  )

  const totals = useMemo(() =>
    monthsEnriched.reduce(
      (s, m) => ({
        gross:       s.gross       + m.gross       + m.manual.gross,
        payroll:     s.payroll     + m.payroll     + m.manual.payroll,
        fuel:        s.fuel        + m.fuel        + m.manual.fuel,
        maintenance: s.maintenance + m.maintenance + m.manual.maintenance,
        insurance:   s.insurance   + m.insurance,
        miles:       s.miles       + m.miles       + m.manual.miles,
      }),
      { gross: 0, payroll: 0, fuel: 0, maintenance: 0, insurance: 0, miles: 0 }
    ),
    [monthsEnriched]
  )

  // Average units across months that have a unit_count entered
  const yearUnitCounts = useMemo(() => {
    const counts = monthsEnriched.map(m => m.manual.unit_count).filter(v => v > 0)
    return counts.length > 0 ? Math.round(counts.reduce((s, v) => s + v, 0) / counts.length) : null
  }, [monthsEnriched])

  const yearNet = totals.gross - totals.payroll - totals.fuel - totals.maintenance - totals.insurance
  const yearNetPerUnit = yearUnitCounts ? yearNet / yearUnitCounts : null

  const pct = (num, den) => den > 0 ? ((num / den) * 100).toFixed(1) + '% of gross' : '—'

  async function handleSaveInsurance(month, caratLiabAmt, caratLiabNotes, caratCargoAmt, caratCargoNotes, proAmt, proNotes) {
    await Promise.all([
      setAmount('carat',       month, caratLiabAmt,  caratLiabNotes,  'liability'),
      setAmount('carat',       month, caratCargoAmt, caratCargoNotes, 'cargo'),
      setAmount('pro_freight', month, proAmt,        proNotes,        'liability'),
    ])
  }

  if (!unlocked) return <MonthlyLock onUnlock={() => setUnlocked(true)} />

  return (
    <div className="summary-wrap">

      <div className="summary-week-nav">
        <button className="btn btn-ghost" onClick={() => { setYear(y => y - 1); setExpanded(null) }}>‹ {year - 1}</button>
        <div className="summary-week-label" style={{ fontSize: 17, fontWeight: 700 }}>{year} — Annual Overview</div>
        <button className="btn btn-ghost" onClick={() => { setYear(y => y + 1); setExpanded(null) }} disabled={year >= currentYear}>{year + 1} ›</button>
        <button
          className="btn btn-ghost btn-xs"
          style={{ marginLeft: 12, fontSize: 12 }}
          onClick={() => printReport(year, monthsEnriched, totals, company)}
        >
          📄 Print / PDF
        </button>
        <button
          className="btn btn-ghost btn-xs"
          style={{ marginLeft: 8, color: '#9CA3AF', fontSize: 11 }}
          onClick={() => { sessionStorage.removeItem(MONTHLY_SESSION_KEY); setUnlocked(false) }}
        >
          🔒 Lock
        </button>
      </div>

      {loading ? (
        <div style={{ color: '#9CA3AF', padding: '32px 0' }}>Loading…</div>
      ) : (
        <>
          {/* ── Stat cards ── */}
          <div className="summary-stat-cards">
            <div className="summary-card green">
              <div className="summary-card-label">Gross Revenue</div>
              <div className="summary-card-value">{fmtFull(totals.gross)}</div>
              <div className="summary-card-sub">full year {year}</div>
            </div>
            <div className="summary-card blue">
              <div className="summary-card-label">Total Payroll</div>
              <div className="summary-card-value">{fmtFull(totals.payroll)}</div>
              <div className="summary-card-sub">{pct(totals.payroll, totals.gross)}</div>
            </div>
            <div className="summary-card" style={{ borderLeft: `4px solid ${C.fuel}` }}>
              <div className="summary-card-label">Fuel</div>
              <div className="summary-card-value" style={{ color: C.fuel }}>{fmtFull(totals.fuel)}</div>
              <div className="summary-card-sub">{pct(totals.fuel, totals.gross)}</div>
            </div>
            <div className="summary-card" style={{ borderLeft: `4px solid ${C.maintenance}` }}>
              <div className="summary-card-label">Maintenance</div>
              <div className="summary-card-value" style={{ color: C.maintenance }}>{fmtFull(totals.maintenance)}</div>
              <div className="summary-card-sub">{pct(totals.maintenance, totals.gross)}</div>
            </div>
            <div className="summary-card" style={{ borderLeft: `4px solid ${C.insurance}` }}>
              <div className="summary-card-label">Insurance</div>
              <div className="summary-card-value" style={{ color: C.insurance }}>{fmtFull(totals.insurance)}</div>
              <div className="summary-card-sub">{pct(totals.insurance, totals.gross)}</div>
            </div>
            <div className="summary-card" style={{ borderLeft: `4px solid ${C.miles}` }}>
              <div className="summary-card-label">Total Miles</div>
              <div className="summary-card-value" style={{ color: C.miles }}>{fmtMiles(totals.miles)}</div>
              <div className="summary-card-sub">
                {totals.miles > 0 && totals.gross > 0 ? `$${(totals.gross / totals.miles).toFixed(2)}/mi avg` : 'loaded miles'}
              </div>
            </div>
            {totals.gross > 0 && (totals.payroll + totals.fuel + totals.maintenance + totals.insurance) > 0 && (
              <div className="summary-card" style={{ borderLeft: `4px solid ${C.net}` }}>
                <div className="summary-card-label">Operating Net</div>
                <div className="summary-card-value" style={{ color: C.net }}>{fmtFull(yearNet)}</div>
                <div className="summary-card-sub">gross − pay − fuel − maint − ins</div>
              </div>
            )}
            {yearUnitCounts && (
              <div className="summary-card" style={{ borderLeft: '4px solid #374151' }}>
                <div className="summary-card-label">Avg Units</div>
                <div className="summary-card-value" style={{ color: '#374151' }}>{yearUnitCounts}</div>
                <div className="summary-card-sub">avg trucks this year</div>
              </div>
            )}
            {yearNetPerUnit != null && (
              <div className="summary-card" style={{ borderLeft: `4px solid ${C.net}` }}>
                <div className="summary-card-label">Net / Unit</div>
                <div className="summary-card-value" style={{ color: yearNet >= 0 ? C.net : '#DC2626' }}>{fmt(yearNetPerUnit)}</div>
                <div className="summary-card-sub">annual net ÷ avg units</div>
              </div>
            )}
          </div>

          {/* ── Chart ── */}
          <div className="summary-section-title">Monthly Breakdown — {year}</div>
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '16px 20px', marginBottom: 24 }}>
            <MonthlyChart months={monthsEnriched.map(m => ({ ...m, gross: m.gross + m.manual.gross, fuel: m.fuel + m.manual.fuel, payroll: m.payroll + m.manual.payroll, miles: m.miles + m.manual.miles, maintenance: m.maintenance + m.manual.maintenance }))} />
            <div style={{ paddingLeft: 72, marginTop: 8, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: C.miles, fontWeight: 700 }}>▌</span>
              <span style={{ fontSize: 10, color: '#6B7280' }}>Miles (relative scale)</span>
            </div>
            <MileageChart months={monthsEnriched.map(m => ({ ...m, miles: m.miles + m.manual.miles }))} />
          </div>

          {/* ── Monthly detail table ── */}
          <div className="summary-section-title">
            Monthly Detail
            <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 10, fontWeight: 400 }}>
              ✎ = insurance &nbsp;·&nbsp; ⊕ = manual data (gross, payroll, fuel, maintenance, units)
            </span>
          </div>
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: `180px ${COLS}`, padding: '8px 16px', gap: 8, background: '#F3F4F6', fontSize: 11, fontWeight: 700, color: '#6B7280' }}>
              <div>Month</div>
              <div style={{ textAlign: 'right', color: C.gross }}>Gross</div>
              <div style={{ textAlign: 'right', color: C.payroll }}>Payroll</div>
              <div style={{ textAlign: 'right', color: C.fuel }}>Fuel</div>
              <div style={{ textAlign: 'right', color: C.maintenance }}>Maintenance</div>
              <div style={{ textAlign: 'right', color: C.insurance }}>Insurance</div>
              <div style={{ textAlign: 'right', color: C.miles }}>Miles</div>
              <div style={{ textAlign: 'right' }}>Units</div>
              <div style={{ textAlign: 'right', color: C.net }}>Net/Unit</div>
            </div>

            {monthsEnriched.map((m, i) => (
              <MonthRow
                key={i}
                m={m}
                idx={i}
                isExpanded={expanded === i}
                onToggle={idx => setExpanded(p => p === idx ? null : idx)}
                insuranceAmt={m.insurance}
                manual={m.manual}
                onEditInsurance={setEditInsMonth}
                onEditManual={setEditManMonth}
              />
            ))}

            {/* Year totals */}
            <div style={{ display: 'grid', gridTemplateColumns: `180px ${COLS}`, padding: '10px 16px', gap: 8, borderTop: '2px solid #D1D5DB', background: '#F3F4F6', fontWeight: 800, fontSize: 13 }}>
              <div style={{ color: '#111827' }}>Year Total</div>
              <div style={{ textAlign: 'right', color: C.gross }}>       {totals.gross       > 0 ? fmt(totals.gross)       : '—'}</div>
              <div style={{ textAlign: 'right', color: C.payroll }}>     {totals.payroll     > 0 ? fmt(totals.payroll)     : '—'}</div>
              <div style={{ textAlign: 'right', color: C.fuel }}>        {totals.fuel        > 0 ? fmt(totals.fuel)        : '—'}</div>
              <div style={{ textAlign: 'right', color: C.maintenance }}> {totals.maintenance > 0 ? fmt(totals.maintenance) : '—'}</div>
              <div style={{ textAlign: 'right', color: C.insurance }}>   {totals.insurance   > 0 ? fmt(totals.insurance)   : '—'}</div>
              <div style={{ textAlign: 'right', color: C.miles }}>       {totals.miles       > 0 ? fmtMiles(totals.miles)  : '—'}</div>
              <div style={{ textAlign: 'right', color: '#374151' }}>     {yearUnitCounts     ?? '—'}</div>
              <div style={{ textAlign: 'right', color: yearNetPerUnit != null ? (yearNet >= 0 ? C.net : '#DC2626') : '#9CA3AF' }}>
                {yearNetPerUnit != null ? fmt(yearNetPerUnit) : '—'}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── All-Time Year-over-Year ── */}
      <div className="summary-section-title" style={{ marginTop: 8 }}>All-Time Performance — Year over Year</div>
      {allTimeLoading ? (
        <div style={{ color: '#9CA3AF', fontSize: 13, padding: '16px 0' }}>Loading historical data…</div>
      ) : yearSummaries.length === 0 ? (
        <div style={{ color: '#9CA3AF', fontSize: 13, padding: '16px 0' }}>No data found. Add manual entries via the ⊕ button above.</div>
      ) : (
        <>
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
            <AllTimeChart data={yearSummaries} />
          </div>

          {/* All-time table */}
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 1fr 1fr 1fr 1fr 70px 110px', padding: '8px 16px', gap: 8, background: '#F3F4F6', fontSize: 11, fontWeight: 700, color: '#6B7280' }}>
              <div>Year</div>
              <div style={{ textAlign: 'right', color: C.gross }}>Gross</div>
              <div style={{ textAlign: 'right', color: C.payroll }}>Payroll</div>
              <div style={{ textAlign: 'right', color: C.fuel }}>Fuel</div>
              <div style={{ textAlign: 'right', color: C.maintenance }}>Maintenance</div>
              <div style={{ textAlign: 'right', color: C.insurance }}>Insurance</div>
              <div style={{ textAlign: 'right', color: C.net }}>Net</div>
              <div style={{ textAlign: 'right' }}>Avg Units</div>
              <div style={{ textAlign: 'right', color: C.net }}>Net/Unit</div>
            </div>

            {yearSummaries.map((y, i) => (
              <div
                key={y.year}
                style={{
                  display: 'grid', gridTemplateColumns: '80px 1fr 1fr 1fr 1fr 1fr 1fr 70px 110px',
                  padding: '9px 16px', gap: 8,
                  borderTop: i > 0 ? '1px solid #F3F4F6' : 'none',
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 800, color: '#111827' }}>{y.year}</div>
                <div style={{ textAlign: 'right', fontWeight: 600, color: C.gross }}>{y.gross > 0 ? fmt(y.gross) : '—'}</div>
                <div style={{ textAlign: 'right', color: C.payroll }}>{y.payroll > 0 ? fmt(y.payroll) : '—'}</div>
                <div style={{ textAlign: 'right', color: C.fuel }}>{y.fuel > 0 ? fmt(y.fuel) : '—'}</div>
                <div style={{ textAlign: 'right', color: C.maintenance }}>{y.maintenance > 0 ? fmt(y.maintenance) : '—'}</div>
                <div style={{ textAlign: 'right', color: C.insurance }}>{y.insurance > 0 ? fmt(y.insurance) : '—'}</div>
                <div style={{ textAlign: 'right', fontWeight: 700, color: y.net >= 0 ? C.net : '#DC2626' }}>{fmt(y.net)}</div>
                <div style={{ textAlign: 'right', color: '#374151' }}>{y.units ?? '—'}</div>
                <div style={{ textAlign: 'right', fontWeight: 700, color: y.netPerUnit != null ? (y.net >= 0 ? C.net : '#DC2626') : '#9CA3AF' }}>
                  {y.netPerUnit != null ? fmt(y.netPerUnit) : '—'}
                </div>
              </div>
            ))}
          </div>

          {/* Disclaimer */}
          <div style={{ fontSize: 11, color: '#9CA3AF', padding: '10px 14px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, marginBottom: 24, lineHeight: 1.6 }}>
            <strong style={{ color: '#6B7280' }}>Note:</strong> The figures above are rough estimates based on available records. Actual net revenue is lower — additional operating expenses (office costs, licenses, permits, factoring fees, miscellaneous) are not captured here. This view is intended for high-level trend analysis only, not for precise financial reporting.
          </div>
        </>
      )}

      {editInsMonth !== null && (
        <InsuranceModal
          monthIdx={editInsMonth}
          year={year}
          getEntry={getEntry}
          onSave={handleSaveInsurance}
          onClose={() => setEditInsMonth(null)}
        />
      )}

      {editManMonth !== null && (
        <ManualDataModal
          monthIdx={editManMonth}
          year={year}
          rawEntries={getRawEntries(editManMonth + 1)}
          onSave={handleSaveManual}
          onClose={() => setEditManMonth(null)}
        />
      )}
    </div>
  )
}
