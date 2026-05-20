import { useState } from 'react'
import BrokerPicker from './BrokerPicker'
import FactoringPicker from './FactoringPicker'
import { createInvoice, updateInvoice } from '../../hooks/useAccounting'

// Company info
const CO = {
  carat: {
    name:    'CARAT EXPEDITED INC',
    address: '475 S Frontage Rd Ste 210',
    city:    'Burr Ridge, IL 60527',
    phone:   '630-491-5555',
    color:   '#111827',
    logo:    '/logo-carat.png',
  },
  pro_freight: {
    name:    'PRO FREIGHT TRANSPORTATION INC',
    address: '2526 Alligator Creek Rd',
    city:    'Clearwater, FL 33765',
    phone:   '',
    color:   '#111827',
    logo:    '/logo-pro-freight.png',
  },
}

const EXTRA_TYPES = ['TONU', 'Lumper Fee', 'Detention', 'Layover']

const fmt   = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })
const today = () => new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

export default function InvoicePrintModal({ loads, existingInvoice, company: companyFilter, onCreated, onClose }) {
  const loadCompany = loads[0]?.company || 'carat'
  const co = CO[loadCompany] || CO.carat

  // Pre-fill from existing invoice if re-opening from history
  const [broker,           setBroker]           = useState(existingInvoice ? { name: existingInvoice.bill_to_name } : null)
  const [billToAddress,    setBillToAddress]    = useState(existingInvoice?.bill_to_address    || '')
  const [factoringName,    setFactoringName]    = useState(existingInvoice?.factoring_name     || '')
  const [factoringAddress, setFactoringAddress] = useState(existingInvoice?.factoring_address  || '')
  const [notes,            setNotes]            = useState(existingInvoice?.notes              || '')
  const [extras,           setExtras]           = useState(existingInvoice?.extra_charges      || [])
  const [saving,           setSaving]           = useState(false)

  const loadsTotal  = loads.reduce((s, l) => s + (Number(l.price) || 0), 0)
  const extrasTotal = extras.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const total       = loadsTotal + extrasTotal

  const invoiceNum = existingInvoice?.invoice_number || '—'
  const isExisting = Boolean(existingInvoice)

  // Auto-fill address from broker picker
  function handleBrokerChange(b) {
    setBroker(b)
    if (b && !billToAddress) {
      const parts = [b.address, b.city && b.state ? `${b.city}, ${b.state} ${b.zip || ''}`.trim() : (b.city || b.state)].filter(Boolean)
      setBillToAddress(parts.join('\n'))
    }
  }

  // Auto-fill factoring from saved company
  function handleFactoringSelect(c) {
    setFactoringName(c.name)
    setFactoringAddress(c.address || '')
  }

  // Extra charges management
  function addExtra() {
    setExtras(ex => [...ex, { type: 'TONU', description: '', amount: '' }])
  }
  function updateExtra(i, field, val) {
    setExtras(ex => ex.map((e, idx) => idx === i ? { ...e, [field]: val } : e))
  }
  function removeExtra(i) {
    setExtras(ex => ex.filter((_, idx) => idx !== i))
  }

  function handlePrint() {
    const el = document.getElementById('print-area')
    if (!el) { window.print(); return }
    const cssLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map(l => `<link rel="stylesheet" href="${l.href}">`)
      .join('\n')
    const win = window.open('', '_blank')
    if (!win) { window.print(); return }
    win.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<base href="${window.location.origin}">
${cssLinks}
<style>
  @page { margin: 0.5in; size: letter portrait; }
  body { margin: 0; padding: 0; background: #fff; }
  .no-print { display: none !important; }
</style>
</head>
<body>${el.innerHTML}</body>
</html>`)
    win.document.close()
    setTimeout(() => { win.focus(); win.print(); setTimeout(() => win.close(), 500) }, 700)
  }

  async function handleMarkInvoiced() {
    setSaving(true)
    try {
      const invoiceData = {
        bill_to_name:       broker?.name || '',
        bill_to_address:    billToAddress,
        factoring_name:     factoringName,
        factoring_address:  factoringAddress,
        notes,
        extra_charges:      extras.filter(e => e.amount !== '' && e.amount !== null),
        company:            loadCompany,
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
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Remit To — Factoring Company</label>
                <FactoringPicker onSelect={handleFactoringSelect} />
              </div>
              <div className="form-group">
                <label>Remit To — Name (or leave blank to use company address)</label>
                <input value={factoringName} onChange={e => setFactoringName(e.target.value)} placeholder="e.g. Pro Funding Inc" />
              </div>
              <div className="form-group">
                <label>Remit To — Address</label>
                <textarea rows={2} value={factoringAddress} onChange={e => setFactoringAddress(e.target.value)} placeholder="Street, City, State ZIP" />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Net 30" />
              </div>
            </div>

            {/* Extra charges */}
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Extra Charges</div>
                <button type="button" className="btn btn-ghost btn-xs" onClick={addExtra}>+ Add</button>
              </div>
              {extras.length === 0 && (
                <div style={{ color: '#9CA3AF', fontSize: 12 }}>No extra charges. Click + Add to include TONU, Lumper Fee, Detention, or Layover.</div>
              )}
              {extras.map((e, i) => (
                <div key={i} className="extra-row">
                  <select value={e.type} onChange={v => updateExtra(i, 'type', v.target.value)}>
                    {EXTRA_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                  <input
                    placeholder="Description (optional)"
                    value={e.description}
                    onChange={v => updateExtra(i, 'description', v.target.value)}
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Amount"
                    value={e.amount}
                    onChange={v => updateExtra(i, 'amount', v.target.value)}
                    style={{ width: 110 }}
                  />
                  <button type="button" className="btn btn-ghost btn-xs" style={{ color: '#B91C1C' }} onClick={() => removeExtra(i)}>✕</button>
                </div>
              ))}
            </div>
          </div>

          {/* ─── Printable invoice ─── */}
          <div className="print-doc" id="print-area">

            <div className="inv-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <img
                  src={co.logo}
                  alt={co.name}
                  className="inv-logo"
                  onError={e => { e.target.style.display = 'none' }}
                />
                <div className="inv-company">
                  <div className="inv-company-name">{co.name}</div>
                  {co.address && <div>{co.address}</div>}
                  {co.city    && <div>{co.city}</div>}
                  {co.phone   && <div>Phone: {co.phone}</div>}
                </div>
              </div>
              <div className="inv-meta">
                <div className="inv-title">INVOICE</div>
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
                {factoringName ? (
                  <>
                    <div><strong>{factoringName}</strong></div>
                    {factoringAddress && factoringAddress.split('\n').map((line, i) => <div key={i}>{line}</div>)}
                  </>
                ) : (
                  <>
                    <div><strong>{co.name}</strong></div>
                    {co.address && <div>{co.address}</div>}
                    {co.city    && <div>{co.city}</div>}
                  </>
                )}
              </div>
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
                    <td>{l.pickup_date  || l.date || '—'}</td>
                    <td>{l.pickup_location?.split(',')[0]  || '—'}</td>
                    <td>{l.delivery_date || '—'}</td>
                    <td>{l.delivery_location?.split(',')[0] || '—'}</td>
                    <td>{l.total_miles || '—'}</td>
                    <td className="inv-amount">{l.price ? fmt(l.price) : '—'}</td>
                  </tr>
                ))}
                {extras.filter(e => e.amount).map((e, i) => (
                  <tr key={`extra-${i}`} className="inv-extra-row">
                    <td><strong>{e.type}</strong></td>
                    <td colSpan={4} style={{ color: '#6B7280', fontStyle: 'italic' }}>{e.description || ''}</td>
                    <td></td>
                    <td className="inv-amount">{fmt(e.amount)}</td>
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
        </div>

        <div className="modal-footer no-print">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-ghost" onClick={handlePrint}>🖨 Print / Save PDF</button>
          <button className="btn btn-primary" onClick={handleMarkInvoiced} disabled={saving}>
            {saving ? 'Saving…' : isExisting ? '✓ Update & Save' : '✓ Mark as Invoiced'}
          </button>
        </div>
      </div>
    </div>
  )
}
