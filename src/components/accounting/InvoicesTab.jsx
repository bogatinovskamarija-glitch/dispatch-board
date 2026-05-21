import { useState, useMemo } from 'react'
import { usePendingInvoices, useInvoiceHistory, createInvoice, fetchInvoiceLoads } from '../../hooks/useAccounting'
import InvoicePrintModal from './InvoicePrintModal'

const fmt = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })

export default function InvoicesTab({ company }) {
  const { loads, loading, refetch }          = usePendingInvoices(company)
  const { invoices, loading: histLoad, refetch: refetchHist } = useInvoiceHistory(company)

  const [selected,    setSelected]    = useState(new Set())
  const [showHistory, setShowHistory] = useState(false)
  const [printData,   setPrintData]   = useState(null)  // { loads, invoice? }

  // ── History filters ────────────────────────────────────────────────────────
  const [filterText,    setFilterText]    = useState('')
  const [filterCompany, setFilterCompany] = useState('all')
  const [filterFrom,    setFilterFrom]    = useState('')
  const [filterTo,      setFilterTo]      = useState('')

  const filteredInvoices = useMemo(() => {
    let list = invoices
    if (filterCompany !== 'all') {
      list = list.filter(inv => inv.company === filterCompany)
    }
    if (filterText.trim()) {
      const q = filterText.trim().toLowerCase()
      list = list.filter(inv =>
        (inv.invoice_number || '').toLowerCase().includes(q) ||
        (inv.bill_to_name   || '').toLowerCase().includes(q) ||
        (inv.company        || '').toLowerCase().includes(q)
      )
    }
    if (filterFrom) {
      list = list.filter(inv => inv.created_at && inv.created_at.slice(0, 10) >= filterFrom)
    }
    if (filterTo) {
      list = list.filter(inv => inv.created_at && inv.created_at.slice(0, 10) <= filterTo)
    }
    return list
  }, [invoices, filterText, filterCompany, filterFrom, filterTo])

  function toggleRow(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function toggleAll() {
    setSelected(selected.size === loads.length && loads.length > 0
      ? new Set() : new Set(loads.map(l => l.id)))
  }

  // New invoice from selected loads
  function openNewInvoice() {
    setPrintData({ loads: loads.filter(l => selected.has(l.id)), invoice: null })
  }

  // Re-open an existing invoice from history
  async function openHistoryInvoice(invoice) {
    try {
      const invLoads = await fetchInvoiceLoads(invoice.id)
      setPrintData({ loads: invLoads, invoice })
    } catch (e) {
      alert('Error loading invoice: ' + e.message)
    }
  }

  async function handleCreated() {
    setSelected(new Set())
    setPrintData(null)
    await refetch()
    if (showHistory) await refetchHist()
  }

  const selectedLoads = loads.filter(l => selected.has(l.id))
  const selTotal      = selectedLoads.reduce((s, l) => s + (Number(l.price) || 0), 0)

  if (loading) return <div className="acct-empty">Loading…</div>

  return (
    <div className="acct-tab-content">

      <div className="acct-toolbar">
        <div className="acct-toolbar-left">
          {!showHistory
            ? <span className="acct-count">{loads.length} load{loads.length !== 1 ? 's' : ''} pending invoicing</span>
            : <span className="acct-count">Invoice history</span>}
        </div>
        <div className="acct-toolbar-right">
          {!showHistory && selected.size > 0 && (
            <button className="btn btn-primary" onClick={openNewInvoice}>
              Generate Invoice ({selected.size} load{selected.size !== 1 ? 's' : ''} · {fmt(selTotal)})
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => setShowHistory(h => !h)}>
            {showHistory ? '← Pending' : 'History →'}
          </button>
        </div>
      </div>

      {/* ── Pending ── */}
      {!showHistory && (
        loads.length === 0
          ? <div className="acct-empty">No loads pending invoicing.<br />Once a load with a broker and price is saved, it appears here.</div>
          : (
            <table className="acct-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}>
                    <input type="checkbox" checked={selected.size === loads.length && loads.length > 0} onChange={toggleAll} />
                  </th>
                  <th>Broker</th>
                  <th>Load #</th>
                  <th>Truck</th>
                  <th>Pickup</th>
                  <th>Delivery</th>
                  <th>Route</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {loads.map(l => (
                  <tr key={l.id} className={selected.has(l.id) ? 'acct-row-selected' : ''} onClick={() => toggleRow(l.id)}>
                    <td onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleRow(l.id)} />
                    </td>
                    <td><strong>{l.broker || '—'}</strong></td>
                    <td>{l.load_number || '—'}</td>
                    <td>{l.truck_number || '—'}</td>
                    <td>{l.pickup_date  || l.date || '—'}</td>
                    <td>{l.delivery_date || '—'}</td>
                    <td className="acct-route">
                      {l.pickup_location && l.delivery_location
                        ? `${l.pickup_location.split(',')[0]} → ${l.delivery_location.split(',')[0]}`
                        : l.pickup_location || l.delivery_location || '—'}
                    </td>
                    <td className="acct-price">{l.price ? fmt(l.price) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
      )}

      {/* ── History ── */}
      {showHistory && (
        histLoad
          ? <div className="acct-empty">Loading…</div>
          : (
            <>
              {/* Filter bar */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Search invoice #, broker…"
                  value={filterText}
                  onChange={e => setFilterText(e.target.value)}
                  style={{ width: 240, fontSize: 13 }}
                />
                {company === 'all' && (
                  <select
                    className="form-input"
                    value={filterCompany}
                    onChange={e => setFilterCompany(e.target.value)}
                    style={{ width: 150, fontSize: 13 }}
                  >
                    <option value="all">All Companies</option>
                    <option value="carat">Carat</option>
                    <option value="pro_freight">Pro Freight</option>
                  </select>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <label style={{ color: '#6B7280', whiteSpace: 'nowrap' }}>From</label>
                  <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} style={{ fontSize: 13, padding: '4px 8px', border: '1px solid #D1D5DB', borderRadius: 6 }} />
                  <label style={{ color: '#6B7280' }}>To</label>
                  <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} style={{ fontSize: 13, padding: '4px 8px', border: '1px solid #D1D5DB', borderRadius: 6 }} />
                </div>
                {(filterText || filterCompany !== 'all' || filterFrom || filterTo) && (
                  <button className="btn btn-ghost btn-xs" onClick={() => { setFilterText(''); setFilterCompany('all'); setFilterFrom(''); setFilterTo('') }}>
                    ✕ Clear
                  </button>
                )}
                <span style={{ fontSize: 12, color: '#9CA3AF', marginLeft: 'auto' }}>
                  {filteredInvoices.length} of {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
                </span>
              </div>

              {filteredInvoices.length === 0
                ? <div className="acct-empty">{invoices.length === 0 ? 'No invoices generated yet.' : 'No invoices match your filters.'}</div>
                : (
                  <table className="acct-table">
                    <thead>
                      <tr>
                        <th>Invoice #</th>
                        <th>Date</th>
                        <th>Broker</th>
                        <th>Company</th>
                        <th>Total</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvoices.map(inv => (
                        <tr key={inv.id} style={{ cursor: 'pointer' }} onClick={() => openHistoryInvoice(inv)}>
                          <td><strong>{inv.invoice_number}</strong></td>
                          <td>{inv.created_at ? new Date(inv.created_at).toLocaleDateString() : '—'}</td>
                          <td>{inv.bill_to_name || '—'}</td>
                          <td>{inv.company === 'carat' ? 'Carat' : inv.company === 'pro_freight' ? 'Pro Freight' : inv.company || '—'}</td>
                          <td className="acct-price">{inv.total ? fmt(inv.total) : '—'}</td>
                          <td><span className="acct-click-hint">View / Re-export →</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              }
            </>
          )
      )}

      {printData && (
        <InvoicePrintModal
          loads={printData.loads}
          existingInvoice={printData.invoice}
          company={company}
          onCreated={handleCreated}
          onClose={() => setPrintData(null)}
        />
      )}
    </div>
  )
}
