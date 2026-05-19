import { useState } from 'react'

const COMPANY_INFO = {
  carat: {
    name: 'CARAT EXPEDITED INC',
    address: '475 S Frontage Rd Ste 210',
    city: 'Burr Ridge, IL 60527',
    phone: '630-491-5555',
  },
  pro_freight: {
    name: 'PRO FREIGHT TRANSPORTATION INC',
    address: '',
    city: '',
    phone: '',
  },
}

function genInvoiceNumber() {
  const d   = new Date()
  const ymd = [d.getFullYear(), d.getMonth() + 1, d.getDate()]
    .map(n => String(n).padStart(2, '0')).join('')
  const rnd = String(Math.floor(Math.random() * 900) + 100)
  return `${ymd}-${rnd}`
}

const fmt = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })
const today = () => new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

export default function InvoicePrintModal({ loads, onConfirm, onClose }) {
  const company = loads[0]?.company || 'carat'
  const co      = COMPANY_INFO[company] || COMPANY_INFO.carat
  const broker  = loads[0]?.broker || ''

  const [invoiceNum,    setInvoiceNum]    = useState(genInvoiceNumber)
  const [billTo,        setBillTo]        = useState(broker)
  const [billToAddress, setBillToAddress] = useState('')
  const [remitTo,       setRemitTo]       = useState('')
  const [notes,         setNotes]         = useState('')

  const total = loads.reduce((s, l) => s + (Number(l.price) || 0), 0)

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide">

        <div className="modal-header no-print">
          <div className="modal-title">Invoice Preview</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">

          {/* Edit controls — hidden on print */}
          <div className="invoice-controls no-print">
            <div className="form-grid">
              <div className="form-group">
                <label>Invoice #</label>
                <input value={invoiceNum} onChange={e => setInvoiceNum(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Bill To — Broker Name</label>
                <input value={billTo} onChange={e => setBillTo(e.target.value)} placeholder="Broker name" />
              </div>
              <div className="form-group">
                <label>Bill To — Address</label>
                <textarea rows={2} value={billToAddress} onChange={e => setBillToAddress(e.target.value)} placeholder="Street, City, State ZIP" />
              </div>
              <div className="form-group">
                <label>Remit To (factoring / direct)</label>
                <textarea rows={2} value={remitTo} onChange={e => setRemitTo(e.target.value)} placeholder="Leave blank to use company address" />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 8 }}>
              <label>Notes (optional)</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Net 30" />
            </div>
          </div>

          {/* ─── Printable document ─── */}
          <div className="print-doc" id="print-area">

            <div className="inv-header">
              <div className="inv-company">
                <div className="inv-company-name">{co.name}</div>
                {co.address && <div>{co.address}</div>}
                {co.city    && <div>{co.city}</div>}
                {co.phone   && <div>Phone: {co.phone}</div>}
              </div>
              <div className="inv-meta">
                <div className="inv-title">INVOICE</div>
                <table className="inv-meta-table">
                  <tbody>
                    <tr><td>Invoice #</td><td><strong>{invoiceNum}</strong></td></tr>
                    <tr><td>Date</td><td>{today()}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="inv-parties">
              <div className="inv-party">
                <div className="inv-party-label">BILL TO</div>
                <div><strong>{billTo || broker}</strong></div>
                {billToAddress && billToAddress.split('\n').map((line, i) => <div key={i}>{line}</div>)}
              </div>
              {remitTo ? (
                <div className="inv-party">
                  <div className="inv-party-label">REMIT TO</div>
                  {remitTo.split('\n').map((line, i) => <div key={i}>{line}</div>)}
                </div>
              ) : (
                <div className="inv-party">
                  <div className="inv-party-label">REMIT TO</div>
                  <div><strong>{co.name}</strong></div>
                  {co.address && <div>{co.address}</div>}
                  {co.city    && <div>{co.city}</div>}
                </div>
              )}
            </div>

            <table className="inv-loads-table">
              <thead>
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
                    <td>{l.pickup_date || l.date || '—'}</td>
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
                  <td colSpan={6} className="inv-total-label">TOTAL DUE</td>
                  <td className="inv-total-val">{fmt(total)}</td>
                </tr>
              </tfoot>
            </table>

            {notes && <div className="inv-notes">{notes}</div>}
          </div>
          {/* end print-doc */}
        </div>

        <div className="modal-footer no-print">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-ghost" onClick={() => window.print()}>
            🖨 Print / Save PDF
          </button>
          <button className="btn btn-primary" onClick={onConfirm}>
            ✓ Mark as Invoiced
          </button>
        </div>
      </div>
    </div>
  )
}
