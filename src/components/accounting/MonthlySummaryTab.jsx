import { useState, useMemo } from 'react'
import { useMonthlyAccountingSummary } from '../../hooks/useMonthlyAccountingSummary'
import { useInsurance } from '../../hooks/useInsurance'

const fmt      = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtFull  = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtMiles = n => Number(n || 0).toLocaleString('en-US')

const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']

const C = {
  gross:       '#059669',
  payroll:     '#2563EB',
  fuel:        '#D97706',
  maintenance: '#6B7280',
  insurance:   '#DC2626',
  miles:       '#8B5CF6',
}

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
      <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 28 }}>
        This section is separately protected.
      </div>
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
            Incorrect password. Try again.
          </div>
        )}
        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: '100%' }}
          disabled={!value}
        >
          Unlock
        </button>
      </form>
    </div>
  )
}

// ── Insurance edit modal ──────────────────────────────────────────────────────
function InsuranceModal({ monthIdx, year, entries, onSave, onClose }) {
  const monthName = MONTHS_FULL[monthIdx]
  const month = monthIdx + 1

  const caratEntry    = entries.find(e => e.company === 'carat'       && e.month === month)
  const proEntry      = entries.find(e => e.company === 'pro_freight' && e.month === month)

  const [caratAmt,    setCaratAmt]    = useState(caratEntry    ? String(caratEntry.amount)  : '')
  const [proAmt,      setProAmt]      = useState(proEntry      ? String(proEntry.amount)    : '')
  const [caratNotes,  setCaratNotes]  = useState(caratEntry?.notes  ?? '')
  const [proNotes,    setProNotes]    = useState(proEntry?.notes     ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await onSave(month, {
      carat:       { amount: caratAmt,   notes: caratNotes },
      pro_freight: { amount: proAmt,     notes: proNotes   },
    })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div className="modal-title">Insurance — {monthName} {year}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Carat */}
            <div>
              <div style={{ fontWeight: 700, marginBottom: 10, color: '#374151', fontSize: 13 }}>Carat Expedited</div>
              <div className="form-group">
                <label style={{ fontSize: 12 }}>Amount ($)</label>
                <input
                  type="number" min="0" step="0.01"
                  placeholder="0.00"
                  value={caratAmt}
                  onChange={e => setCaratAmt(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label style={{ fontSize: 12 }}>Notes (optional)</label>
                <input
                  placeholder="e.g. policy #, provider"
                  value={caratNotes}
                  onChange={e => setCaratNotes(e.target.value)}
                />
              </div>
            </div>
            {/* Pro Freight */}
            <div>
              <div style={{ fontWeight: 700, marginBottom: 10, color: '#374151', fontSize: 13 }}>Pro Freight</div>
              <div className="form-group">
                <label style={{ fontSize: 12 }}>Amount ($)</label>
                <input
                  type="number" min="0" step="0.01"
                  placeholder="0.00"
                  value={proAmt}
                  onChange={e => setProAmt(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label style={{ fontSize: 12 }}>Notes (optional)</label>
                <input
                  placeholder="e.g. policy #, provider"
                  value={proNotes}
                  onChange={e => setProNotes(e.target.value)}
                />
              </div>
            </div>
          </div>
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

// ── Bar chart (financial metrics) ─────────────────────────────────────────────
function MonthlyChart({ months }) {
  const W = 920, LEFT = 72, RIGHT = 20, TOP = 28, BOT = 30, PLOT_H = 200
  const PLOT_W = W - LEFT - RIGHT
  const SVG_H  = TOP + PLOT_H + BOT
  const MONTH_W = PLOT_W / 12

  const BAR_W = 10, GAP = 2
  const GROUP_W = 5 * BAR_W + 4 * GAP
  const GROUP_X = (MONTH_W - GROUP_W) / 2

  const maxVal = Math.max(...months.map(m => m.gross), 1)
  const gridPcts = [0, 0.25, 0.5, 0.75, 1]

  const bars = [
    { key: 'gross',       color: C.gross,       label: 'Gross Revenue' },
    { key: 'payroll',     color: C.payroll,     label: 'Payroll' },
    { key: 'fuel',        color: C.fuel,        label: 'Fuel' },
    { key: 'maintenance', color: C.maintenance, label: 'Maintenance' },
    { key: 'insurance',   color: C.insurance,   label: 'Insurance' },
  ]

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${SVG_H}`} style={{ fontFamily: 'Arial, sans-serif', display: 'block' }}>
      {/* Legend */}
      {bars.map((b, i) => (
        <g key={b.key} transform={`translate(${LEFT + i * 138}, 6)`}>
          <rect width={10} height={10} fill={b.color} rx={2} y={2} />
          <text x={14} y={11} fontSize={10} fill="#374151">{b.label}</text>
        </g>
      ))}

      {/* Grid lines + Y labels */}
      {gridPcts.map((f, i) => {
        const y = TOP + PLOT_H - f * PLOT_H
        return (
          <g key={i}>
            <line x1={LEFT} y1={y} x2={LEFT + PLOT_W} y2={y} stroke="#E5E7EB" strokeWidth={1} />
            <text x={LEFT - 6} y={y + 4} textAnchor="end" fontSize={9} fill="#9CA3AF">{fmt(f * maxVal)}</text>
          </g>
        )
      })}

      {/* Bars per month */}
      {months.map((m, mi) => {
        const ox = LEFT + mi * MONTH_W + GROUP_X
        return (
          <g key={mi}>
            {bars.map((b, bi) => {
              const val = m[b.key] || 0
              const bh  = val > 0 ? Math.max((val / maxVal) * PLOT_H, 2) : 0
              return (
                <rect
                  key={b.key}
                  x={ox + bi * (BAR_W + GAP)}
                  y={TOP + PLOT_H - bh}
                  width={BAR_W} height={bh}
                  fill={b.color} rx={2}
                />
              )
            })}
            <text
              x={LEFT + mi * MONTH_W + MONTH_W / 2}
              y={TOP + PLOT_H + 16}
              textAnchor="middle" fontSize={10} fill="#374151" fontWeight="600"
            >
              {MONTHS[mi]}
            </text>
          </g>
        )
      })}

      {/* Axes */}
      <line x1={LEFT} y1={TOP}          x2={LEFT}          y2={TOP + PLOT_H} stroke="#D1D5DB" strokeWidth={1} />
      <line x1={LEFT} y1={TOP + PLOT_H} x2={LEFT + PLOT_W} y2={TOP + PLOT_H} stroke="#D1D5DB" strokeWidth={1} />
    </svg>
  )
}

// ── Mileage sparkline ─────────────────────────────────────────────────────────
function MileageChart({ months }) {
  const W = 920, LEFT = 72, RIGHT = 20, TOP = 8, PLOT_H = 52
  const PLOT_W = W - LEFT - RIGHT
  const SVG_H  = TOP + PLOT_H + 4
  const MONTH_W = PLOT_W / 12
  const BAR_W   = 28
  const maxVal  = Math.max(...months.map(m => m.miles), 1)

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${SVG_H}`} style={{ fontFamily: 'Arial, sans-serif', display: 'block', marginTop: 2 }}>
      <text x={LEFT - 6} y={TOP + 10}           textAnchor="end" fontSize={9} fill="#9CA3AF">{fmtMiles(maxVal)}</text>
      <text x={LEFT - 6} y={TOP + PLOT_H + 2}   textAnchor="end" fontSize={9} fill="#9CA3AF">0</text>
      {months.map((m, mi) => {
        const bh = m.miles > 0 ? Math.max((m.miles / maxVal) * PLOT_H, 2) : 0
        return (
          <rect
            key={mi}
            x={LEFT + mi * MONTH_W + (MONTH_W - BAR_W) / 2}
            y={TOP + PLOT_H - bh}
            width={BAR_W} height={bh}
            fill={C.miles} rx={2} opacity={0.75}
          />
        )
      })}
      <line x1={LEFT} y1={TOP}          x2={LEFT}          y2={TOP + PLOT_H} stroke="#D1D5DB" strokeWidth={1} />
      <line x1={LEFT} y1={TOP + PLOT_H} x2={LEFT + PLOT_W} y2={TOP + PLOT_H} stroke="#D1D5DB" strokeWidth={1} />
    </svg>
  )
}

// ── Shared cell ───────────────────────────────────────────────────────────────
function Cell({ val, color, small }) {
  return (
    <div style={{ textAlign: 'right', color: val > 0 ? color : '#D1D5DB', fontWeight: val > 0 ? (small ? 500 : 700) : 400 }}>
      {val > 0 ? fmt(val) : '—'}
    </div>
  )
}

// ── Month row ─────────────────────────────────────────────────────────────────
function MonthRow({ m, idx, isExpanded, onToggle, insuranceAmt, onEditInsurance }) {
  const hasData = m.gross > 0 || m.payroll > 0 || m.fuel > 0 || m.maintenance > 0 || m.miles > 0 || insuranceAmt > 0
  const COLS = '130px 1fr 1fr 1fr 1fr 140px 1fr'

  return (
    <>
      <div
        onClick={() => hasData && onToggle(idx)}
        style={{
          display: 'grid', gridTemplateColumns: COLS,
          padding: '10px 16px', gap: 8,
          borderTop: idx > 0 ? '1px solid #F3F4F6' : 'none',
          cursor: hasData ? 'pointer' : 'default',
          background: isExpanded ? '#F0FDF4' : undefined,
          alignItems: 'center',
        }}
      >
        <div style={{ fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <span style={{ color: hasData ? '#6B7280' : '#D1D5DB', fontSize: 10 }}>
            {hasData ? (isExpanded ? '▾' : '▸') : '–'}
          </span>
          {MONTHS_FULL[idx]}
        </div>
        <Cell val={m.gross}       color={C.gross}       />
        <Cell val={m.payroll}     color={C.payroll}     />
        <Cell val={m.fuel}        color={C.fuel}        />
        <Cell val={m.maintenance} color={C.maintenance} />

        {/* Insurance cell with edit button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
          <span style={{ color: insuranceAmt > 0 ? C.insurance : '#D1D5DB', fontWeight: insuranceAmt > 0 ? 700 : 400 }}>
            {insuranceAmt > 0 ? fmt(insuranceAmt) : '—'}
          </span>
          <button
            onClick={e => { e.stopPropagation(); onEditInsurance(idx) }}
            title="Edit insurance"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 12, padding: '2px 4px', lineHeight: 1, borderRadius: 4 }}
            onMouseEnter={e => e.currentTarget.style.background = '#F3F4F6'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            ✎
          </button>
        </div>

        <div style={{ textAlign: 'right', color: m.miles > 0 ? C.miles : '#D1D5DB', fontWeight: m.miles > 0 ? 600 : 400 }}>
          {m.miles > 0 ? fmtMiles(m.miles) : '—'}
        </div>
      </div>

      {/* Weekly breakdown */}
      {isExpanded && (
        <div style={{ borderTop: '1px solid #D1FAE5', borderBottom: '1px solid #D1FAE5' }}>
          <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '5px 16px 5px 36px', gap: 8, background: '#F3F4F6', fontSize: 10, fontWeight: 700, color: '#9CA3AF' }}>
            <div>Week (Thu – Wed)</div>
            <div style={{ textAlign: 'right' }}>Gross</div>
            <div style={{ textAlign: 'right' }}>Payroll</div>
            <div style={{ textAlign: 'right' }}>Fuel</div>
            <div style={{ textAlign: 'right' }}>Maintenance</div>
            <div style={{ textAlign: 'right' }}>Insurance</div>
            <div style={{ textAlign: 'right' }}>Miles</div>
          </div>

          {m.weeks.length === 0 && (
            <div style={{ padding: '10px 36px', color: '#9CA3AF', fontSize: 12 }}>No weekly data.</div>
          )}

          {m.weeks.map(wk => (
            <div
              key={wk.start}
              style={{ display: 'grid', gridTemplateColumns: COLS, padding: '6px 16px 6px 36px', gap: 8, borderTop: '1px solid #E5E7EB', fontSize: 12 }}
            >
              <div style={{ color: '#6B7280', fontSize: 11 }}>{formatRange(wk.start, wk.end)}</div>
              <Cell val={wk.gross}       color={C.gross}       small />
              <Cell val={wk.payroll}     color={C.payroll}     small />
              <Cell val={wk.fuel}        color={C.fuel}        small />
              <Cell val={wk.maintenance} color={C.maintenance} small />
              <div style={{ textAlign: 'right', color: '#9CA3AF', fontSize: 11 }}>—</div>
              <div style={{ textAlign: 'right', color: wk.miles > 0 ? C.miles : '#D1D5DB', fontSize: 12 }}>
                {wk.miles > 0 ? fmtMiles(wk.miles) : '—'}
              </div>
            </div>
          ))}

          {/* Month subtotal */}
          <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '7px 16px 7px 36px', gap: 8, borderTop: '2px solid #BBF7D0', background: '#ECFDF5', fontWeight: 700, fontSize: 12 }}>
            <div style={{ color: '#374151' }}>Month Total</div>
            <Cell val={m.gross}       color={C.gross}       />
            <Cell val={m.payroll}     color={C.payroll}     />
            <Cell val={m.fuel}        color={C.fuel}        />
            <Cell val={m.maintenance} color={C.maintenance} />
            <Cell val={insuranceAmt}  color={C.insurance}   />
            <div style={{ textAlign: 'right', color: C.miles, fontWeight: 700 }}>
              {m.miles > 0 ? fmtMiles(m.miles) : '—'}
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
  const [year,          setYear]          = useState(currentYear)
  const [expanded,      setExpanded]      = useState(null)
  const [unlocked,      setUnlocked]      = useState(() => sessionStorage.getItem(MONTHLY_SESSION_KEY) === '1')
  const [editMonthIdx,  setEditMonthIdx]  = useState(null)

  const { months, loading } = useMonthlyAccountingSummary(year, company)
  const { entries, getAmount, setAmount } = useInsurance(year)

  // Merge insurance into months data for the chart
  const monthsWithInsurance = useMemo(() =>
    months.map((m, i) => ({ ...m, insurance: getAmount(company, i + 1) })),
    [months, entries, company]
  )

  const totals = useMemo(() =>
    monthsWithInsurance.reduce(
      (s, m) => ({
        gross:       s.gross       + m.gross,
        payroll:     s.payroll     + m.payroll,
        fuel:        s.fuel        + m.fuel,
        maintenance: s.maintenance + m.maintenance,
        insurance:   s.insurance   + m.insurance,
        miles:       s.miles       + m.miles,
      }),
      { gross: 0, payroll: 0, fuel: 0, maintenance: 0, insurance: 0, miles: 0 }
    ),
    [monthsWithInsurance]
  )

  const pct = (num, den) => den > 0 ? ((num / den) * 100).toFixed(1) + '% of gross' : '—'

  async function handleSaveInsurance(month, data) {
    await Promise.all([
      setAmount('carat',       month, data.carat.amount,       data.carat.notes),
      setAmount('pro_freight', month, data.pro_freight.amount, data.pro_freight.notes),
    ])
  }

  function toggleMonth(idx) {
    setExpanded(prev => prev === idx ? null : idx)
  }

  if (!unlocked) {
    return <MonthlyLock onUnlock={() => setUnlocked(true)} />
  }

  const COLS = '130px 1fr 1fr 1fr 1fr 140px 1fr'

  return (
    <div className="summary-wrap">

      {/* Year navigation */}
      <div className="summary-week-nav">
        <button className="btn btn-ghost" onClick={() => { setYear(y => y - 1); setExpanded(null) }}>
          ‹ {year - 1}
        </button>
        <div className="summary-week-label" style={{ fontSize: 17, fontWeight: 700 }}>
          {year} — Annual Overview
        </div>
        <button
          className="btn btn-ghost"
          onClick={() => { setYear(y => y + 1); setExpanded(null) }}
          disabled={year >= currentYear}
        >
          {year + 1} ›
        </button>
        <button
          className="btn btn-ghost btn-xs"
          style={{ marginLeft: 12, color: '#9CA3AF', fontSize: 11 }}
          onClick={() => { sessionStorage.removeItem(MONTHLY_SESSION_KEY); setUnlocked(false) }}
        >
          🔒 Lock
        </button>
      </div>

      {loading ? (
        <div style={{ color: '#9CA3AF', padding: '32px 0' }}>Loading…</div>
      ) : (
        <>
          {/* Year stat cards */}
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
                {totals.miles > 0 && totals.gross > 0
                  ? `$${(totals.gross / totals.miles).toFixed(2)}/mi avg`
                  : 'loaded miles'}
              </div>
            </div>
            {totals.gross > 0 && (totals.payroll + totals.fuel + totals.maintenance + totals.insurance) > 0 && (
              <div className="summary-card" style={{ borderLeft: '4px solid #10B981' }}>
                <div className="summary-card-label">Operating Net</div>
                <div className="summary-card-value" style={{ color: '#10B981' }}>
                  {fmtFull(totals.gross - totals.payroll - totals.fuel - totals.maintenance - totals.insurance)}
                </div>
                <div className="summary-card-sub">gross − pay − fuel − maint − ins</div>
              </div>
            )}
          </div>

          {/* Bar chart */}
          <div className="summary-section-title">Monthly Breakdown — {year}</div>
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '16px 20px', marginBottom: 24 }}>
            <MonthlyChart months={monthsWithInsurance} />
            <div style={{ paddingLeft: 72, marginTop: 8, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: C.miles, fontWeight: 700 }}>▌</span>
              <span style={{ fontSize: 10, color: '#6B7280' }}>Miles (relative scale)</span>
            </div>
            <MileageChart months={monthsWithInsurance} />
          </div>

          {/* Monthly detail table */}
          <div className="summary-section-title">Monthly Detail</div>
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>

            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '8px 16px', gap: 8, background: '#F3F4F6', fontSize: 11, fontWeight: 700, color: '#6B7280' }}>
              <div>Month</div>
              <div style={{ textAlign: 'right', color: C.gross }}>Gross</div>
              <div style={{ textAlign: 'right', color: C.payroll }}>Payroll</div>
              <div style={{ textAlign: 'right', color: C.fuel }}>Fuel</div>
              <div style={{ textAlign: 'right', color: C.maintenance }}>Maintenance</div>
              <div style={{ textAlign: 'right', color: C.insurance }}>Insurance ✎</div>
              <div style={{ textAlign: 'right', color: C.miles }}>Miles</div>
            </div>

            {monthsWithInsurance.map((m, i) => (
              <MonthRow
                key={i}
                m={m}
                idx={i}
                isExpanded={expanded === i}
                onToggle={toggleMonth}
                insuranceAmt={m.insurance}
                onEditInsurance={setEditMonthIdx}
              />
            ))}

            {/* Year totals */}
            <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '10px 16px', gap: 8, borderTop: '2px solid #D1D5DB', background: '#F3F4F6', fontWeight: 800, fontSize: 13 }}>
              <div style={{ color: '#111827' }}>Year Total</div>
              <div style={{ textAlign: 'right', color: C.gross }}>       {totals.gross       > 0 ? fmt(totals.gross)       : '—'}</div>
              <div style={{ textAlign: 'right', color: C.payroll }}>     {totals.payroll     > 0 ? fmt(totals.payroll)     : '—'}</div>
              <div style={{ textAlign: 'right', color: C.fuel }}>        {totals.fuel        > 0 ? fmt(totals.fuel)        : '—'}</div>
              <div style={{ textAlign: 'right', color: C.maintenance }}> {totals.maintenance > 0 ? fmt(totals.maintenance) : '—'}</div>
              <div style={{ textAlign: 'right', color: C.insurance }}>   {totals.insurance   > 0 ? fmt(totals.insurance)   : '—'}</div>
              <div style={{ textAlign: 'right', color: C.miles }}>       {totals.miles       > 0 ? fmtMiles(totals.miles)  : '—'}</div>
            </div>
          </div>
        </>
      )}

      {/* Insurance edit modal */}
      {editMonthIdx !== null && (
        <InsuranceModal
          monthIdx={editMonthIdx}
          year={year}
          entries={entries}
          onSave={handleSaveInsurance}
          onClose={() => setEditMonthIdx(null)}
        />
      )}
    </div>
  )
}
