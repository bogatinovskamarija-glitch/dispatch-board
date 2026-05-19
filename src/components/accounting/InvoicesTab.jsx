import { useState } from 'react'
import { usePendingInvoices, useInvoiceHistory, markLoadsInvoiced } from '../../hooks/useAccounting'
import InvoicePrintModal from './InvoicePrintModal'

const fmt = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })

export default function InvoicesTab({ company }) {
  const { loads, loading, refetch }           = usePendingInvoices(company)
  const { loads: history, loading: histLoad } = useInvoiceHistory(company)
  const [selected,    setSelected]    = useState(new Set())
  const [showHistory, setShowHistory] = useState(false)
  const [printLoads,  setPrintLoads]  = useState(null)

  function toggleRow(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(selected.size === loads.length && loads.length > 0
      ? new Set()
      : new Set(loads.map(l => l.id))
    )
  }

  async function handleMarkInvoiced(loadIds) {
    await markLoadsInvoiced(loadIds)
    setSelected(new Set())
    setPrintLoads(null)
    refetch()
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
            : <span className="acct-count">Invoice history</span>
          }
        </div>
        <div className="acct-toolbar-right">
          {!showHistory && selected.size > 0 && (
            <button className="btn btn-primary" onClick={() => setPrintLoads(selectedLoads)}>
              Generate Invoice ({selected.size} load{selected.size !== 1 ? 's' : ''} · {fmt(selTotal)})
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => setShowHistory(h => !h)}>
            {showHistory ? '← Pending' : 'History →'}
          </button>
        </div>
      </div>

      {/* ── Pending tab ── */}
      {!showHistory && (
        loads.length === 0
          ? <div className="acct-empty">No loads pending invoicing. Once a covered load with a broker and price is added, it will appear here.</div>
          : (
            <table className="acct-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}>
                    <input
                      type="checkbox"
                      checked={selected.size === loads.length && loads.length > 0}
                      onChange={toggleAll}
                    />
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
                  <tr
                    key={l.id}
                    className={selected.has(l.id) ? 'acct-row-selected' : ''}
                    onClick={() => toggleRow(l.id)}
                  >
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

      {/* ── History tab ── */}
      {showHistory && (
        histLoad
          ? <div className="acct-empty">Loading…</div>
          : history.length === 0
            ? <div className="acct-empty">No invoices generated yet.</div>
            : (
              <table className="acct-table">
                <thead>
                  <tr>
                    <th>Invoiced On</th>
                    <th>Broker</th>
                    <th>Load #</th>
                    <th>Truck</th>
                    <th>Route</th>
                    <th>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(l => (
                    <tr key={l.id}>
                      <td>{l.invoiced_at ? new Date(l.invoiced_at).toLocaleDateString() : '—'}</td>
                      <td>{l.broker || '—'}</td>
                      <td>{l.load_number || '—'}</td>
                      <td>{l.truck_number || '—'}</td>
                      <td className="acct-route">
                        {l.pickup_location && l.delivery_location
                          ? `${l.pickup_location.split(',')[0]} → ${l.delivery_location.split(',')[0]}`
                          : '—'}
                      </td>
                      <td className="acct-price">{l.price ? fmt(l.price) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
      )}

      {printLoads && (
        <InvoicePrintModal
          loads={printLoads}
          onConfirm={() => handleMarkInvoiced(printLoads.map(l => l.id))}
          onClose={() => setPrintLoads(null)}
        />
      )}
    </div>
  )
}
