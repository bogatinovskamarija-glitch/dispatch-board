import { useState } from 'react'
import BrokerPicker from './BrokerPicker'
import { createInvoice, updateInvoice } from '../../hooks/useAccounting'

// Company info & branding
const CO = {
  carat: {
    name:    'CARAT EXPEDITED INC',
    address: '475 S Frontage Rd Ste 210',
    city:    'Burr Ridge, IL 60527',
    phone:   '630-491-5555',
    color:   '#6B1F1F',   // dark maroon
    logo:    '/logo-carat.png',
  },
  pro_freight: {
    name:    'PRO FREIGHT TRANSPORTATION INC',
    address: '',
    city:    '',
    phone:   '',
    color:   '#0D1B4B',   // dark navy
    logo:    '/logo-pro-freight.png',
  },
}

const fmt   = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })
const today = () => new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

export default function InvoicePrintModal({ loads, existingInvoice, company: companyFilter, onCreated, onClose }) {
  const loadCompany = loads[0]?.company || 'carat'
  const co = CO[loadCompany] || CO.carat

  // Pre-fill from existing invoice if re-opening from history
  const [broker,        setBroker]        = useState(existingInvoice ? { name: existingInvoice.bill_to_name } : null)
  const [billToAddress, setBillToAddress] = useState(existingInvoice?.bill_to_address || '')
  const [remitTo,       setRemitTo]       = useState(existingInvoice?.remit_to || '')
  const [notes,         setNotes]         = useState(existingInvoice?.notes || '')
  const [saving,        setSaving]        = useState(false)

  const total        = loads.reduce((s, l) => s + (Number(l.price) || 0), 0)
  const invoiceNum   = existingInvoice?.invoice_number || '—'
  const isExisting   = Boolean(existingInvoice)

  // Auto-fill address from broker picker
  function handleBrokerChange(b) {
    setBroker(b)
    if (b && !billToAddress) {
      const parts = [b.address, b.city && b.state ? `${b.city}, ${b.state} ${b.zip || ''}`.trim() : (b.city || b.state)].filter(Boolean)
      setBillToAddress(parts.join('\n'))
    }
  }

  async function handleMarkInvoiced() {
    setSaving(true)
    try {
      const invoiceData = {
        bill_to_name:    broker?.name || '',
        bill_to_address: billToAddress,
        remit_to:        remitTo,
        notes,
        company:         loadCompany,
        total,
      }
      if (isExisting) {
        await updateInvoice(existingInvoice.id, invoiceData)
      } else {
        await createInvoice(invoiceData, loads.map(l => l.id))
      }
      await onCreated()
    } catch (e) {
      alert('Error: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide">

        <div className="modal-header no-print">
          <div className="modal-title">
            {isExisting ? `Invoice #${invoiceNum} — Re-export` : 'New Invoice'}
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">

          {/* Edit controls — hidden on print */}
          <div className="invoice-controls no-print">
            <div className="form-grid">
              <div className="form-group">
                <label>Bill To — Broker</label>
                <BrokerPicker value={broker} onChange={handleBrokerChange} company={loadCompany} />
              </div>
              <div className="form-group">
                <label>Bill To — Address</label>
                <textarea rows={2} value={billToAddress} onChange={e => setBillToAddress(e.target.value)} placeholder="Street, City, State ZIP" />
              </div>
              <div className="form-group">
                <label>Remit To (factoring / leave blank for company)</label>
                <textarea rows={2} value={remitTo} onChange={e => setRemitTo(e.target.value)} placeholder="Pro Funding Inc — or leave blank" />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Net 30" />
              </div>
            </div>
          </div>

          {/* ─── Printable invoice ─── */}
          <div className="print-doc" id="print-area">

            <div className="inv-header" style={{ borderBottom: `3px solid ${co.color}`, paddingBottom: 16, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <img
                  src={co.logo}
                  alt={co.name}
                  className="inv-logo"
                  onError={e => { e.target.style.display = 'none' }}
                />
                <div className="inv-company">
                  <div className="inv-company-name" style={{ color: co.color }}>{co.name}</div>
                  {co.address && <div>{co.address}</div>}
                  {co.city    && <div>{co.city}</div>}
                  {co.phone   && <div>Phone: {co.phone}</div>}
                </div>
              </div>
              <div className="inv-meta">
                <div className="inv-title" style={{ color: co.color }}>INVOICE</div>
                <table className="inv-meta-table">
                  <tbody>
                    <tr><td>Invoice #</td><td><strong>{isExisting ? invoiceNum : 'Pending'}</strong></td></tr>
                    <tr><td>Date</td><td>{today()}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="inv-parties">
              <div className="inv-party">
                <div className="inv-party-label">BILL TO</div>
                <div><strong>{broker?.name || '—'}</strong></div>
                {billToAddress && billToAddress.split('\n').map((line, i) => <div key={i}>{line}</div>)}
              </div>
              <div className="inv-party">
                <div className="inv-party-label">REMIT TO</div>
                {remitTo
                  ? remitTo.split('\n').map((line, i) => <div key={i}>{line}</div>)
                  : (
                    <>
                      <div><strong>{co.name}</strong></div>
                      {co.address && <div>{co.address}</div>}
                      {co.city    && <div>{co.city}</div>}
                    </>
                  )
                }
              </div>
            </div>

            <table className="inv-loads-table">
              <thead style={{ background: co.color }}>
                <tr>
                  <th>Load #</th>
                  <th>Pickup Date</th>
                  <th>Origin</th>
                  <th>Delivery Date</th>
                  <th>Destination</th>
                  <th>Miles</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {loads.map(l => (
                  <tr key={l.id}>
                    <td>{l.load_number || '—'}</td>
                    <td>{l.pickup_date  || l.date || '—'}</td>
                    <td>{l.pickup_location?.split(',')[0]  || '—'}</td>
                    <td>{l.delivery_date || '—'}</td>
                    <td>{l.delivery_location?.split(',')[0] || '—'}</td>
                    <td>{l.total_miles || '—'}</td>
                    <td className="inv-amount">{l.price ? fmt(l.price) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6} className="inv-total-label" style={{ borderTopColor: co.color }}>TOTAL DUE</td>
                  <td className="inv-total-val" style={{ borderTopColor: co.color, color: co.color }}>{fmt(total)}</td>
                </tr>
              </tfoot>
            </table>

            {notes && <div className="inv-notes">{notes}</div>}
          </div>
        </div>

        <div className="modal-footer no-print">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-ghost" onClick={() => window.print()}>🖨 Print / Save PDF</button>
          <button className="btn btn-primary" onClick={handleMarkInvoiced} disabled={saving}>
            {saving ? 'Saving…' : isExisting ? '✓ Update & Save' : '✓ Mark as Invoiced'}
          </button>
        </div>
      </div>
    </div>
  )
}
