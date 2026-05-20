import { useState } from 'react'
import { useWeeklySummary, getThursdayWeek } from '../../hooks/useWeeklySummary'

const fmt    = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })
const fmtNum = n => Number(n).toLocaleString('en-US')

function addWeeks(isoDate, n) {
  const d = new Date(isoDate + 'T12:00:00')
  d.setDate(d.getDate() + n * 7)
  return d.toISOString().split('T')[0]
}

function formatDateRange(start, end) {
  const opts = { month: 'short', day: 'numeric' }
  const s = new Date(start + 'T12:00:00').toLocaleDateString('en-US', opts)
  const e = new Date(end   + 'T12:00:00').toLocaleDateString('en-US', { ...opts, year: 'numeric' })
  return `${s} – ${e}`
}

export default function WeeklySummaryTab({ company }) {
  const [weekStart, setWeekStart] = useState(() => getThursdayWeek().start)
  const { start, end } = getThursdayWeek(weekStart)

  const { loads, invoices, loading } = useWeeklySummary(start, end)

  // Filter by company tab
  const filteredLoads    = company === 'all' ? loads    : loads.filter(l => l.company === company)
  const filteredInvoices = company === 'all' ? invoices : invoices.filter(i => i.company === company)

  // ── Top-line metrics ───────────────────────────────────────────────────────
  const totalRevenue    = filteredLoads.reduce((s, l) => s + (Number(l.price) || 0), 0)
  const invoicedTotal   = filteredInvoices.reduce((s, i) => s + (Number(i.total) || 0), 0)
  const pendingLoads    = filteredLoads.filter(l => !l.invoiced_at)
  const pendingRevenue  = pendingLoads.reduce((s, l) => s + (Number(l.price) || 0), 0)
  const invoicedLoads   = filteredLoads.filter(l => l.invoiced_at)

  // ── Per-company breakdown ─────────────────────────────────────────────────
  const companies = [
    { key: 'carat',       label: 'Carat Expedited' },
    { key: 'pro_freight', label: 'Pro Freight Transportation' },
  ]

  function companyStats(key) {
    const cLoads    = loads.filter(l => l.company === key)
    const cInvoices = invoices.filter(i => i.company === key)
    return {
      loadCount:   cLoads.length,
      revenue:     cLoads.reduce((s, l) => s + (Number(l.price) || 0), 0),
      invoiced:    cInvoices.reduce((s, i) => s + (Number(i.total) || 0), 0),
      pending:     cLoads.filter(l => !l.invoiced_at).reduce((s, l) => s + (Number(l.price) || 0), 0),
      invoiceCount: cInvoices.length,
    }
  }

  return (
    <div className="summary-wrap">

      {/* ── Week navigator ── */}
      <div className="summary-week-nav">
        <button className="btn btn-ghost" onClick={() => setWeekStart(s => addWeeks(s, -1))}>‹ Prev</button>
        <div className="summary-week-label">
          Week of {formatDateRange(start, end)}
          <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 8 }}>Thu – Wed</span>
        </div>
        <button className="btn btn-ghost" onClick={() => setWeekStart(s => addWeeks(s, 1))}>Next ›</button>
        <button className="btn btn-ghost btn-xs" onClick={() => setWeekStart(getThursdayWeek().start)} style={{ marginLeft: 8 }}>
          This Week
        </button>
      </div>

      {loading ? (
        <div style={{ color: '#9CA3AF', padding: '32px 0' }}>Loading…</div>
      ) : (
        <>
          {/* ── Stat cards ── */}
          <div className="summary-stat-cards">
            <div className="summary-card">
              <div className="summary-card-label">Total Loads</div>
              <div className="summary-card-value">{fmtNum(filteredLoads.length)}</div>
              <div className="summary-card-sub">{invoicedLoads.length} invoiced · {pendingLoads.length} pending</div>
            </div>
            <div className="summary-card green">
              <div className="summary-card-label">Total Revenue</div>
              <div className="summary-card-value">{fmt(totalRevenue)}</div>
              <div className="summary-card-sub">all loads this week</div>
            </div>
            <div className="summary-card blue">
              <div className="summary-card-label">Invoiced This Week</div>
              <div className="summary-card-value">{fmt(invoicedTotal)}</div>
              <div className="summary-card-sub">{filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? 's' : ''} created</div>
            </div>
            <div className="summary-card red">
              <div className="summary-card-label">Pending Invoice</div>
              <div className="summary-card-value">{fmt(pendingRevenue)}</div>
              <div className="summary-card-sub">{pendingLoads.length} load{pendingLoads.length !== 1 ? 's' : ''} not yet invoiced</div>
            </div>
          </div>

          {/* ── Per-company breakdown (only when showing all) ── */}
          {company === 'all' && (
            <>
              <div className="summary-section-title">By Company</div>
              <div className="summary-company-grid">
                {companies.map(c => {
                  const s = companyStats(c.key)
                  return (
                    <div key={c.key} className="summary-company-card">
                      <div className="summary-company-name">{c.label}</div>
                      <div className="summary-company-row"><span>Loads</span><span>{s.loadCount}</span></div>
                      <div className="summary-company-row"><span>Revenue</span><span>{fmt(s.revenue)}</span></div>
                      <div className="summary-company-row"><span>Invoiced</span><span>{fmt(s.invoiced)}</span></div>
                      <div className="summary-company-row"><span>Pending</span><span style={{ color: s.pending > 0 ? '#DC2626' : '#111827' }}>{fmt(s.pending)}</span></div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* ── Invoices created this week ── */}
          {filteredInvoices.length > 0 && (
            <>
              <div className="summary-section-title">Invoices Created This Week</div>
              <table className="acct-table" style={{ marginBottom: 28 }}>
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Broker</th>
                    <th>Company</th>
                    <th>Date</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map(inv => (
                    <tr key={inv.id}>
                      <td><strong>#{inv.invoice_number}</strong></td>
                      <td>{inv.bill_to_name || '—'}</td>
                      <td>{inv.company === 'carat' ? 'Carat' : 'Pro Freight'}</td>
                      <td>{new Date(inv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(inv.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* ── Loads this week ── */}
          <div className="summary-section-title">Loads This Week</div>
          {filteredLoads.length === 0 ? (
            <div style={{ color: '#9CA3AF', padding: '20px 0' }}>No loads found for this week.</div>
          ) : (
            <table className="acct-table">
              <thead>
                <tr>
                  <th>Load #</th>
                  <th>Date</th>
                  <th>Driver</th>
                  <th>Route</th>
                  <th>Company</th>
                  <th>Broker</th>
                  <th style={{ textAlign: 'right' }}>Revenue</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredLoads.map(l => (
                  <tr key={l.id}>
                    <td>{l.load_number || '—'}</td>
                    <td>{l.pickup_date || l.date || '—'}</td>
                    <td>{l.driver || '—'}</td>
                    <td className="acct-route">
                      {l.pickup_location && l.delivery_location
                        ? `${l.pickup_location.split(',')[0]} → ${l.delivery_location.split(',')[0]}`
                        : '—'}
                    </td>
                    <td>{l.company === 'carat' ? 'Carat' : 'Pro Freight'}</td>
                    <td>{l.broker || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{l.price ? fmt(l.price) : '—'}</td>
                    <td>
                      {l.invoiced_at
                        ? <span style={{ color: '#059669', fontSize: 11, fontWeight: 600 }}>✓ Invoiced</span>
                        : <span style={{ color: '#D97706', fontSize: 11, fontWeight: 600 }}>Pending</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6} style={{ textAlign: 'right', fontWeight: 700, paddingRight: 10 }}>Total</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 14 }}>{fmt(totalRevenue)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </>
      )}
    </div>
  )
}
