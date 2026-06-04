import { useState, useMemo } from 'react'
import { useMonthlyAccountingSummary } from '../../hooks/useMonthlyAccountingSummary'

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
  miles:       '#8B5CF6',
}

function formatRange(start, end) {
  const o = { month: 'short', day: 'numeric' }
  const s = new Date(start + 'T12:00:00').toLocaleDateString('en-US', o)
  const e = new Date(end   + 'T12:00:00').toLocaleDateString('en-US', o)
  return `${s} – ${e}`
}

// ── Main bar chart (financial metrics) ────────────────────────────────────────
function MonthlyChart({ months }) {
  const W = 900, LEFT = 72, RIGHT = 20, TOP = 28, BOT = 30, PLOT_H = 200
  const PLOT_W = W - LEFT - RIGHT
  const SVG_H  = TOP + PLOT_H + BOT
  const MONTH_W = PLOT_W / 12

  const BAR_W = 11, GAP = 2
  const GROUP_W = 4 * BAR_W + 3 * GAP
  const GROUP_X = (MONTH_W - GROUP_W) / 2

  const maxVal = Math.max(...months.map(m => m.gross), 1)
  const gridPcts = [0, 0.25, 0.5, 0.75, 1]

  const bars = [
    { key: 'gross',       color: C.gross,       label: 'Gross Revenue' },
    { key: 'payroll',     color: C.payroll,     label: 'Payroll' },
    { key: 'fuel',        color: C.fuel,        label: 'Fuel' },
    { key: 'maintenance', color: C.maintenance, label: 'Maintenance' },
  ]

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${SVG_H}`} style={{ fontFamily: 'Arial, sans-serif', display: 'block' }}>
      {/* Legend */}
      {bars.map((b, i) => (
        <g key={b.key} transform={`translate(${LEFT + i * 148}, 6)`}>
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
              const val = m[b.key]
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

// ── Mileage bar chart ─────────────────────────────────────────────────────────
function MileageChart({ months }) {
  const W = 900, LEFT = 72, RIGHT = 20, TOP = 8, BOT = 4, PLOT_H = 52
  const PLOT_W = W - LEFT - RIGHT
  const SVG_H  = TOP + PLOT_H + BOT
  const MONTH_W = PLOT_W / 12
  const BAR_W   = 28

  const maxVal = Math.max(...months.map(m => m.miles), 1)

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${SVG_H}`} style={{ fontFamily: 'Arial, sans-serif', display: 'block', marginTop: 2 }}>
      <text x={LEFT - 6} y={TOP + 10} textAnchor="end" fontSize={9} fill="#9CA3AF">{fmtMiles(maxVal)}</text>
      <text x={LEFT - 6} y={TOP + PLOT_H + 2} textAnchor="end" fontSize={9} fill="#9CA3AF">0</text>
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

// ── Month row (summary + expandable weekly detail) ────────────────────────────
function MonthRow({ m, idx, isExpanded, onToggle }) {
  const hasData = m.gross > 0 || m.payroll > 0 || m.fuel > 0 || m.maintenance > 0 || m.miles > 0

  const COLS = '130px 1fr 1fr 1fr 1fr 1fr'

  return (
    <>
      {/* Month summary row */}
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
        <div style={{ textAlign: 'right', color: m.miles > 0 ? C.miles : '#D1D5DB', fontWeight: m.miles > 0 ? 600 : 400 }}>
          {m.miles > 0 ? fmtMiles(m.miles) : '—'}
        </div>
      </div>

      {/* Expanded weekly rows */}
      {isExpanded && (
        <div style={{ borderTop: '1px solid #D1FAE5', borderBottom: '1px solid #D1FAE5' }}>
          {/* Week header */}
          <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '5px 16px 5px 36px', gap: 8, background: '#F3F4F6', fontSize: 10, fontWeight: 700, color: '#9CA3AF' }}>
            <div>Week (Thu – Wed)</div>
            <div style={{ textAlign: 'right' }}>Gross</div>
            <div style={{ textAlign: 'right' }}>Payroll</div>
            <div style={{ textAlign: 'right' }}>Fuel</div>
            <div style={{ textAlign: 'right' }}>Maintenance</div>
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
            <div style={{ textAlign: 'right', color: C.miles, fontWeight: 700 }}>
              {m.miles > 0 ? fmtMiles(m.miles) : '—'}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Cell({ val, color, small }) {
  return (
    <div style={{ textAlign: 'right', color: val > 0 ? color : '#D1D5DB', fontWeight: val > 0 ? (small ? 500 : 700) : 400 }}>
      {val > 0 ? fmt(val) : '—'}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MonthlySummaryTab({ company }) {
  const currentYear = new Date().getFullYear()
  const [year,     setYear]     = useState(currentYear)
  const [expanded, setExpanded] = useState(null)

  const { months, loading } = useMonthlyAccountingSummary(year, company)

  const totals = useMemo(() =>
    months.reduce(
      (s, m) => ({
        gross:       s.gross       + m.gross,
        payroll:     s.payroll     + m.payroll,
        fuel:        s.fuel        + m.fuel,
        maintenance: s.maintenance + m.maintenance,
        miles:       s.miles       + m.miles,
      }),
      { gross: 0, payroll: 0, fuel: 0, maintenance: 0, miles: 0 }
    ),
    [months]
  )

  const pct = (num, den) => den > 0 ? ((num / den) * 100).toFixed(1) + '% of gross' : '—'

  function toggle(idx) {
    setExpanded(prev => prev === idx ? null : idx)
  }

  const COLS = '130px 1fr 1fr 1fr 1fr 1fr'

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
      </div>

      {loading ? (
        <div style={{ color: '#9CA3AF', padding: '32px 0' }}>Loading…</div>
      ) : (
        <>
          {/* Year-level stat cards */}
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
            <div className="summary-card" style={{ borderLeft: `4px solid ${C.miles}` }}>
              <div className="summary-card-label">Total Miles</div>
              <div className="summary-card-value" style={{ color: C.miles }}>{fmtMiles(totals.miles)}</div>
              <div className="summary-card-sub">
                {totals.miles > 0 && totals.gross > 0
                  ? `$${(totals.gross / totals.miles).toFixed(2)}/mi avg`
                  : 'loaded miles'}
              </div>
            </div>
            {totals.gross > 0 && (totals.payroll > 0 || totals.fuel > 0 || totals.maintenance > 0) && (
              <div className="summary-card" style={{ borderLeft: '4px solid #10B981' }}>
                <div className="summary-card-label">Operating Net</div>
                <div className="summary-card-value" style={{ color: '#10B981' }}>
                  {fmtFull(totals.gross - totals.payroll - totals.fuel - totals.maintenance)}
                </div>
                <div className="summary-card-sub">gross − pay − fuel − maint</div>
              </div>
            )}
          </div>

          {/* Bar chart */}
          <div className="summary-section-title">Monthly Breakdown — {year}</div>
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '16px 20px', marginBottom: 24 }}>
            <MonthlyChart months={months} />
            <div style={{ paddingLeft: 72, marginTop: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: '#8B5CF6', fontWeight: 700 }}>▌</span>
              <span style={{ fontSize: 10, color: '#6B7280', marginLeft: 4 }}>Miles (relative scale)</span>
            </div>
            <MileageChart months={months} />
          </div>

          {/* Monthly detail table */}
          <div className="summary-section-title">Monthly Detail</div>
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>

            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '8px 16px', gap: 8, background: '#F3F4F6', fontSize: 11, fontWeight: 700, color: '#6B7280' }}>
              <div>Month</div>
              <div style={{ textAlign: 'right', color: C.gross }}>Gross</div>
              <div style={{ textAlign: 'right', color: C.payroll }}>Payroll</div>
              <div style={{ textAlign: 'right', color: C.fuel }}>Fuel</div>
              <div style={{ textAlign: 'right', color: C.maintenance }}>Maintenance</div>
              <div style={{ textAlign: 'right', color: C.miles }}>Miles</div>
            </div>

            {months.map((m, i) => (
              <MonthRow
                key={i}
                m={m}
                idx={i}
                isExpanded={expanded === i}
                onToggle={toggle}
              />
            ))}

            {/* Year totals row */}
            <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '10px 16px', gap: 8, borderTop: '2px solid #D1D5DB', background: '#F3F4F6', fontWeight: 800, fontSize: 13 }}>
              <div style={{ color: '#111827' }}>Year Total</div>
              <div style={{ textAlign: 'right', color: C.gross }}>       {totals.gross       > 0 ? fmt(totals.gross)       : '—'}</div>
              <div style={{ textAlign: 'right', color: C.payroll }}>     {totals.payroll     > 0 ? fmt(totals.payroll)     : '—'}</div>
              <div style={{ textAlign: 'right', color: C.fuel }}>        {totals.fuel        > 0 ? fmt(totals.fuel)        : '—'}</div>
              <div style={{ textAlign: 'right', color: C.maintenance }}> {totals.maintenance > 0 ? fmt(totals.maintenance) : '—'}</div>
              <div style={{ textAlign: 'right', color: C.miles }}>       {totals.miles       > 0 ? fmtMiles(totals.miles)  : '—'}</div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
