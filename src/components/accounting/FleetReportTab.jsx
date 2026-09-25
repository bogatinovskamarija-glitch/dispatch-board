import { useState } from 'react'
import { useFleetReport, quarterRange } from '../../hooks/useFleetReport'

const fmt$    = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtMi   = n => Number(n || 0).toLocaleString('en-US')
const fmtFull = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const C = {
  gross: '#059669', net: '#4ADE80', fuel: '#D97706',
  maint: '#6B7280', payroll: '#4F46E5', miles: '#8B5CF6',
  empty: '#D97706', noDriver: '#6B7280', home: '#DB2777',
}

const QUARTERS = [
  { value: 'year', label: 'Full Year' },
  { value: '1',    label: 'Q1 (Jan–Mar)' },
  { value: '2',    label: 'Q2 (Apr–Jun)' },
  { value: '3',    label: 'Q3 (Jul–Sep)' },
  { value: '4',    label: 'Q4 (Oct–Dec)' },
]

// ── Print function ────────────────────────────────────────────────────────────
function printFleetReport({ year, quarter, company, truckReport, driverReport, from, to }) {
  const companyLabel = company === 'all' ? 'All Companies' : company === 'carat' ? 'Carat Expedited' : 'Pro Freight'
  const periodLabel  = QUARTERS.find(q => q.value === quarter)?.label ?? 'Full Year'
  const generated    = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const truckRows = truckReport.map((r, i) => {
    const idleDays = r.emptyDays + r.noDriverDays + r.homeDays
    const netColor = r.net >= 0 ? '#059669' : '#DC2626'
    return `
    <tr>
      <td style="font-weight:700">${r.truck}</td>
      <td style="color:#374151;font-size:11px">${r.drivers}</td>
      <td style="text-align:right;color:#059669;font-weight:600">${r.gross > 0 ? fmtFull(r.gross) : '—'}</td>
      <td style="text-align:right;color:${netColor};font-weight:700">${r.net !== 0 ? fmtFull(r.net) : '—'}</td>
      <td style="text-align:right;color:#D97706">${r.fuel > 0 ? fmtFull(r.fuel) : '—'}</td>
      <td style="text-align:right;color:#6B7280">${r.maintenance > 0 ? fmtFull(r.maintenance) : '—'}</td>
      <td style="text-align:right;color:#8B5CF6">${r.miles > 0 ? fmtMi(r.miles) : '—'}</td>
      <td style="text-align:right;color:#D97706">${r.emptyDays > 0 ? r.emptyDays + ' d' : '—'}</td>
      <td style="text-align:right;color:#6B7280">${r.noDriverDays > 0 ? r.noDriverDays + ' d' : '—'}</td>
      <td style="text-align:right;color:#DB2777">${r.homeDays > 0 ? r.homeDays + ' d' : '—'}</td>
    </tr>`
  }).join('')

  const totGross = truckReport.reduce((s,r) => s + r.gross, 0)
  const totNet   = truckReport.reduce((s,r) => s + r.net, 0)
  const totFuel  = truckReport.reduce((s,r) => s + r.fuel, 0)
  const totMaint = truckReport.reduce((s,r) => s + r.maintenance, 0)
  const totMiles = truckReport.reduce((s,r) => s + r.miles, 0)
  const totEmpty = truckReport.reduce((s,r) => s + r.emptyDays, 0)
  const totNoDrv = truckReport.reduce((s,r) => s + r.noDriverDays, 0)
  const totHome  = truckReport.reduce((s,r) => s + r.homeDays, 0)

  const driverSection = (title, drivers, isOO) => {
    if (!drivers.length) return ''
    const rows = drivers.map((d, i) => `
      <tr>
        <td style="font-weight:600">#${i+1}</td>
        <td style="font-weight:700">${d.name}</td>
        ${isOO
          ? `<td style="text-align:right;color:#059669;font-weight:600">${d.gross > 0 ? fmtFull(d.gross) : '—'}</td>
             <td style="text-align:right;color:#D97706">${d.fuel > 0 ? fmtFull(d.fuel) : '—'}</td>
             <td style="text-align:right;color:#8B5CF6">${d.miles > 0 ? fmtMi(d.miles) : '—'}</td>`
          : `<td style="text-align:right;color:#4F46E5;font-weight:600">${d.payroll > 0 ? fmtFull(d.payroll) : '—'}</td>
             <td style="text-align:right;color:#059669">${d.gross > 0 ? fmtFull(d.gross) : '—'}</td>
             <td style="text-align:right;color:#8B5CF6">${d.miles > 0 ? fmtMi(d.miles) : '—'}</td>`}
      </tr>`).join('')

    const cols = isOO
      ? '<th>Rank</th><th>Driver</th><th style="text-align:right;color:#059669">Gross Revenue</th><th style="text-align:right;color:#D97706">Fuel (net)</th><th style="text-align:right;color:#8B5CF6">Miles</th>'
      : '<th>Rank</th><th>Driver</th><th style="text-align:right;color:#4F46E5">Total Payroll</th><th style="text-align:right;color:#059669">Gross Revenue</th><th style="text-align:right;color:#8B5CF6">Miles</th>'

    return `
      <h2 style="margin-top:32px;font-size:15px;font-weight:800;border-bottom:2px solid #E5E7EB;padding-bottom:6px;margin-bottom:10px">${title}</h2>
      <table>
        <thead><tr>${cols}</tr></thead>
        <tbody>${rows}</tbody>
      </table>`
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Fleet Report ${year} ${periodLabel} — ${companyLabel}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111827; padding: 28px 36px; }
    header { margin-bottom: 20px; border-bottom: 2px solid #E5E7EB; padding-bottom: 14px; display:flex; justify-content:space-between; align-items:flex-end; }
    h1 { font-size: 18px; font-weight: 800; }
    .meta { font-size: 11px; color: #6B7280; margin-top: 3px; }
    h2 { font-size: 14px; font-weight: 800; margin: 28px 0 10px; border-bottom: 2px solid #E5E7EB; padding-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #F3F4F6; padding: 7px 8px; text-align: left; font-size: 11px; font-weight: 700; border-bottom: 2px solid #D1D5DB; color: #6B7280; white-space: nowrap; }
    td { padding: 6px 8px; border-bottom: 1px solid #F3F4F6; font-size: 11.5px; }
    .total-row td { background: #F3F4F6; font-weight: 800; font-size: 12px; border-top: 2px solid #D1D5DB; border-bottom: none; }
    .note { margin-top: 24px; font-size: 10px; color: #9CA3AF; border-top: 1px solid #E5E7EB; padding-top: 10px; line-height: 1.5; }
    @media print { body { padding: 12px 16px; } @page { margin: 0.8cm; size: landscape; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Fleet Performance Report — ${year} ${periodLabel}</h1>
      <div class="meta">${companyLabel} &nbsp;·&nbsp; Period: ${from} to ${to} &nbsp;·&nbsp; Generated ${generated}</div>
    </div>
  </header>

  <h2>Per-Truck Performance</h2>
  <table>
    <thead>
      <tr>
        <th>Truck</th>
        <th>Driver(s)</th>
        <th style="text-align:right;color:#059669">Gross</th>
        <th style="text-align:right;color:#059669">Net*</th>
        <th style="text-align:right;color:#D97706">Fuel (net)</th>
        <th style="text-align:right;color:#6B7280">Maintenance</th>
        <th style="text-align:right;color:#8B5CF6">Miles</th>
        <th style="text-align:right;color:#D97706">Empty</th>
        <th style="text-align:right;color:#6B7280">No Driver</th>
        <th style="text-align:right;color:#DB2777">At Home</th>
      </tr>
    </thead>
    <tbody>
      ${truckRows}
      <tr class="total-row">
        <td colspan="2">Fleet Total</td>
        <td style="text-align:right;color:#059669">${fmtFull(totGross)}</td>
        <td style="text-align:right;color:${totNet >= 0 ? '#059669':'#DC2626'}">${fmtFull(totNet)}</td>
        <td style="text-align:right;color:#D97706">${fmtFull(totFuel)}</td>
        <td style="text-align:right;color:#6B7280">${fmtFull(totMaint)}</td>
        <td style="text-align:right;color:#8B5CF6">${fmtMi(totMiles)}</td>
        <td style="text-align:right;color:#D97706">${totEmpty > 0 ? totEmpty + ' d' : '—'}</td>
        <td style="text-align:right;color:#6B7280">${totNoDrv > 0 ? totNoDrv + ' d' : '—'}</td>
        <td style="text-align:right;color:#DB2777">${totHome > 0 ? totHome + ' d' : '—'}</td>
      </tr>
    </tbody>
  </table>
  <p style="font-size:10px;color:#9CA3AF;margin-top:6px">* Net = Gross − Fuel − Maintenance (payroll excluded at truck level — see driver sections below)</p>

  ${driverSection('Owner-Operator Leaderboard', driverReport.oo, true)}
  ${driverSection('Company Driver Leaderboard', driverReport.company, false)}

  <div class="note">
    <strong>Notes:</strong>
    Fuel figures are net after rebate. Idle days (Empty, No Driver, At Home) are calendar days from pickup date to delivery date as entered in the dispatch board.
    Driver payroll is from paystubs issued in this period. OO gross is the total load revenue attributed to that driver.
    This report is for internal management review — it does not account for all operating expenses.
  </div>
</body>
</html>`

  const w = window.open('', '_blank')
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 400)
}

// ── Stat badge ────────────────────────────────────────────────────────────────
function StatBadge({ val, label, color, unit = '' }) {
  const display = unit === '$' ? fmt$(val) : val > 0 ? (fmtMi(val) + (unit ? ' ' + unit : '')) : '—'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 60 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: val > 0 ? color : '#D1D5DB' }}>{display}</span>
      <span style={{ fontSize: 10, color: '#9CA3AF', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function FleetReportTab({ company }) {
  const currentYear = new Date().getFullYear()
  const [year,    setYear]    = useState(currentYear)
  const [quarter, setQuarter] = useState('year')

  const { truckReport, driverReport, loading, from, to } = useFleetReport(year, quarter, company)

  const totGross = truckReport.reduce((s,r) => s + r.gross, 0)
  const totNet   = truckReport.reduce((s,r) => s + r.net, 0)
  const totFuel  = truckReport.reduce((s,r) => s + r.fuel, 0)
  const totMaint = truckReport.reduce((s,r) => s + r.maintenance, 0)
  const totMiles = truckReport.reduce((s,r) => s + r.miles, 0)
  const totEmpty = truckReport.reduce((s,r) => s + r.emptyDays, 0)
  const totNoDrv = truckReport.reduce((s,r) => s + r.noDriverDays, 0)
  const totHome  = truckReport.reduce((s,r) => s + r.homeDays, 0)

  return (
    <div className="summary-wrap">

      {/* ── Controls ── */}
      <div className="summary-week-nav" style={{ gap: 12 }}>
        <button className="btn btn-ghost" onClick={() => setYear(y => y - 1)}>‹ {year - 1}</button>
        <div className="summary-week-label" style={{ fontSize: 16, fontWeight: 700 }}>{year} — Fleet Performance</div>
        <button className="btn btn-ghost" onClick={() => setYear(y => y + 1)} disabled={year >= currentYear}>{year + 1} ›</button>

        <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
          {QUARTERS.map(q => (
            <button
              key={q.value}
              className={`btn btn-xs ${quarter === q.value ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setQuarter(q.value)}
            >
              {q.label}
            </button>
          ))}
        </div>

        <button
          className="btn btn-ghost btn-xs"
          style={{ marginLeft: 'auto', fontSize: 12 }}
          disabled={loading || truckReport.length === 0}
          onClick={() => printFleetReport({ year, quarter, company, truckReport, driverReport, from, to })}
        >
          📄 Print / PDF
        </button>
      </div>

      {loading ? (
        <div style={{ color: '#9CA3AF', padding: '32px 0' }}>Loading…</div>
      ) : (
        <>
          {/* ── Summary stat cards ── */}
          {truckReport.length > 0 && (
            <div className="summary-stat-cards">
              <div className="summary-card green">
                <div className="summary-card-label">Fleet Gross</div>
                <div className="summary-card-value">{fmt$(totGross)}</div>
                <div className="summary-card-sub">{truckReport.length} trucks</div>
              </div>
              <div className="summary-card" style={{ borderLeft: `4px solid ${C.net}` }}>
                <div className="summary-card-label">Fleet Net*</div>
                <div className="summary-card-value" style={{ color: totNet >= 0 ? C.net : '#DC2626' }}>{fmt$(totNet)}</div>
                <div className="summary-card-sub">gross − fuel − maint</div>
              </div>
              <div className="summary-card" style={{ borderLeft: `4px solid ${C.fuel}` }}>
                <div className="summary-card-label">Total Fuel</div>
                <div className="summary-card-value" style={{ color: C.fuel }}>{fmt$(totFuel)}</div>
                <div className="summary-card-sub">net after rebate</div>
              </div>
              <div className="summary-card" style={{ borderLeft: `4px solid ${C.maint}` }}>
                <div className="summary-card-label">Maintenance</div>
                <div className="summary-card-value" style={{ color: C.maint }}>{fmt$(totMaint)}</div>
                <div className="summary-card-sub">trucks only</div>
              </div>
              <div className="summary-card" style={{ borderLeft: `4px solid ${C.miles}` }}>
                <div className="summary-card-label">Total Miles</div>
                <div className="summary-card-value" style={{ color: C.miles }}>{fmtMi(totMiles)}</div>
                <div className="summary-card-sub">loaded miles</div>
              </div>
              {(totEmpty + totNoDrv + totHome) > 0 && (
                <div className="summary-card" style={{ borderLeft: '4px solid #D97706' }}>
                  <div className="summary-card-label">Total Idle Days</div>
                  <div className="summary-card-value" style={{ color: '#D97706' }}>{totEmpty + totNoDrv + totHome}</div>
                  <div className="summary-card-sub">empty + no driver + home</div>
                </div>
              )}
            </div>
          )}

          {/* ── Per-truck table ── */}
          <div className="summary-section-title" style={{ marginTop: 16 }}>Per-Truck Performance</div>
          {truckReport.length === 0 ? (
            <div style={{ color: '#9CA3AF', fontSize: 13, padding: '16px 0' }}>No load data found for this period.</div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
              <table className="acct-table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>Truck</th>
                    <th>Driver(s)</th>
                    <th style={{ textAlign: 'right', color: C.gross }}>Gross</th>
                    <th style={{ textAlign: 'right', color: C.net }}>Net*</th>
                    <th style={{ textAlign: 'right', color: C.fuel }}>Fuel</th>
                    <th style={{ textAlign: 'right', color: C.maint }}>Maint.</th>
                    <th style={{ textAlign: 'right', color: C.miles }}>Miles</th>
                    <th style={{ textAlign: 'right', color: C.empty }}>Empty</th>
                    <th style={{ textAlign: 'right', color: C.noDriver }}>No Driver</th>
                    <th style={{ textAlign: 'right', color: C.home }}>Home</th>
                  </tr>
                </thead>
                <tbody>
                  {truckReport.map(r => {
                    const netColor = r.net > 0 ? C.net : r.net < 0 ? '#DC2626' : '#D1D5DB'
                    return (
                      <tr key={r.truck}>
                        <td style={{ fontWeight: 700, fontSize: 13 }}>{r.truck}</td>
                        <td style={{ color: '#6B7280', fontSize: 11 }}>{r.drivers}</td>
                        <td style={{ textAlign: 'right', color: C.gross, fontWeight: 600 }}>
                          {r.gross > 0 ? fmt$(r.gross) : <span style={{ color: '#D1D5DB' }}>—</span>}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: netColor }}>
                          {r.net !== 0 ? fmt$(r.net) : <span style={{ color: '#D1D5DB' }}>—</span>}
                        </td>
                        <td style={{ textAlign: 'right', color: r.fuel > 0 ? C.fuel : '#D1D5DB' }}>
                          {r.fuel > 0 ? fmt$(r.fuel) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', color: r.maintenance > 0 ? C.maint : '#D1D5DB' }}>
                          {r.maintenance > 0 ? fmt$(r.maintenance) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', color: r.miles > 0 ? C.miles : '#D1D5DB' }}>
                          {r.miles > 0 ? fmtMi(r.miles) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', color: r.emptyDays > 0 ? C.empty : '#D1D5DB', fontWeight: r.emptyDays > 0 ? 600 : 400 }}>
                          {r.emptyDays > 0 ? `${r.emptyDays}d` : '—'}
                        </td>
                        <td style={{ textAlign: 'right', color: r.noDriverDays > 0 ? C.noDriver : '#D1D5DB', fontWeight: r.noDriverDays > 0 ? 600 : 400 }}>
                          {r.noDriverDays > 0 ? `${r.noDriverDays}d` : '—'}
                        </td>
                        <td style={{ textAlign: 'right', color: r.homeDays > 0 ? C.home : '#D1D5DB', fontWeight: r.homeDays > 0 ? 600 : 400 }}>
                          {r.homeDays > 0 ? `${r.homeDays}d` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#F3F4F6', fontWeight: 800 }}>
                    <td colSpan={2}>Fleet Total</td>
                    <td style={{ textAlign: 'right', color: C.gross }}>{fmt$(totGross)}</td>
                    <td style={{ textAlign: 'right', color: totNet >= 0 ? C.net : '#DC2626' }}>{fmt$(totNet)}</td>
                    <td style={{ textAlign: 'right', color: C.fuel }}>{totFuel > 0 ? fmt$(totFuel) : '—'}</td>
                    <td style={{ textAlign: 'right', color: C.maint }}>{totMaint > 0 ? fmt$(totMaint) : '—'}</td>
                    <td style={{ textAlign: 'right', color: C.miles }}>{fmtMi(totMiles)}</td>
                    <td style={{ textAlign: 'right', color: C.empty }}>{totEmpty > 0 ? `${totEmpty}d` : '—'}</td>
                    <td style={{ textAlign: 'right', color: C.noDriver }}>{totNoDrv > 0 ? `${totNoDrv}d` : '—'}</td>
                    <td style={{ textAlign: 'right', color: C.home }}>{totHome > 0 ? `${totHome}d` : '—'}</td>
                  </tr>
                </tfoot>
              </table>
              <div style={{ padding: '6px 14px 8px', fontSize: 10, color: '#9CA3AF' }}>
                * Net = Gross − Fuel − Maintenance &nbsp;·&nbsp; Payroll excluded at truck level (see driver sections below)
              </div>
            </div>
          )}

          {/* ── Driver leaderboards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>

            {/* OO */}
            <div>
              <div className="summary-section-title">Owner-Operator Leaderboard</div>
              {driverReport.oo.length === 0 ? (
                <div style={{ color: '#9CA3AF', fontSize: 13, padding: '12px 0' }}>No OO drivers found.</div>
              ) : (
                <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
                  <table className="acct-table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 30 }}>#</th>
                        <th>Driver</th>
                        <th style={{ textAlign: 'right', color: C.gross }}>Gross Rev.</th>
                        <th style={{ textAlign: 'right', color: C.fuel }}>Fuel</th>
                        <th style={{ textAlign: 'right', color: C.miles }}>Miles</th>
                      </tr>
                    </thead>
                    <tbody>
                      {driverReport.oo.map((d, i) => (
                        <tr key={d.name}>
                          <td style={{ color: '#9CA3AF', fontWeight: 600, fontSize: 11 }}>#{i+1}</td>
                          <td style={{ fontWeight: 700 }}>
                            {d.name}
                            {i === 0 && <span style={{ marginLeft: 6, fontSize: 9, background: '#FEF3C7', color: '#D97706', padding: '1px 5px', borderRadius: 6, fontWeight: 700 }}>TOP</span>}
                          </td>
                          <td style={{ textAlign: 'right', color: C.gross, fontWeight: 600 }}>{d.gross > 0 ? fmt$(d.gross) : '—'}</td>
                          <td style={{ textAlign: 'right', color: d.fuel > 0 ? C.fuel : '#D1D5DB' }}>{d.fuel > 0 ? fmt$(d.fuel) : '—'}</td>
                          <td style={{ textAlign: 'right', color: d.miles > 0 ? C.miles : '#D1D5DB' }}>{d.miles > 0 ? fmtMi(d.miles) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Company Drivers */}
            <div>
              <div className="summary-section-title">Company Driver Leaderboard</div>
              {driverReport.company.length === 0 ? (
                <div style={{ color: '#9CA3AF', fontSize: 13, padding: '12px 0' }}>No company driver data found.</div>
              ) : (
                <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
                  <table className="acct-table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 30 }}>#</th>
                        <th>Driver</th>
                        <th style={{ textAlign: 'right', color: C.payroll }}>Payroll</th>
                        <th style={{ textAlign: 'right', color: C.gross }}>Gross Rev.</th>
                        <th style={{ textAlign: 'right', color: C.miles }}>Miles</th>
                      </tr>
                    </thead>
                    <tbody>
                      {driverReport.company.map((d, i) => (
                        <tr key={d.name}>
                          <td style={{ color: '#9CA3AF', fontWeight: 600, fontSize: 11 }}>#{i+1}</td>
                          <td style={{ fontWeight: 700 }}>
                            {d.name}
                            {i === 0 && <span style={{ marginLeft: 6, fontSize: 9, background: '#EDE9FE', color: '#7C3AED', padding: '1px 5px', borderRadius: 6, fontWeight: 700 }}>TOP</span>}
                          </td>
                          <td style={{ textAlign: 'right', color: C.payroll, fontWeight: 600 }}>{d.payroll > 0 ? fmt$(d.payroll) : '—'}</td>
                          <td style={{ textAlign: 'right', color: d.gross > 0 ? C.gross : '#D1D5DB' }}>{d.gross > 0 ? fmt$(d.gross) : '—'}</td>
                          <td style={{ textAlign: 'right', color: d.miles > 0 ? C.miles : '#D1D5DB' }}>{d.miles > 0 ? fmtMi(d.miles) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div style={{ fontSize: 11, color: '#9CA3AF', padding: '10px 14px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, marginBottom: 24, lineHeight: 1.6 }}>
            <strong style={{ color: '#6B7280' }}>Note:</strong> Fuel figures are net after rebate. Idle days are calendar days between pickup and delivery dates as entered in the dispatch board.
            OO gross = total load revenue attributed to that driver. Company driver payroll = paystubs issued in this period.
            Since tracking started in May 2026, earlier quarters will show partial or no data.
          </div>
        </>
      )}
    </div>
  )
}
