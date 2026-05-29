import { useState, useEffect } from 'react'
import BrokerPicker from './BrokerPicker'
import FactoringPicker from './FactoringPicker'
import { createInvoice, updateInvoice, peekNextInvoiceNumber, findLoadsByNumbers, relinkLoadsToInvoice, updateLoadField } from '../../hooks/useAccounting'
import { useCompanySettings } from '../../hooks/useSettings'

const LOGOS = { carat: '/logo-carat.png', pro_freight: '/logo-pro-freight.png' }

const EXTRA_TYPES = ['TONU', 'Lumper Fee', 'Detention', 'Layover']

const fmt   = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })
const today = () => new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

export default function InvoicePrintModal({ loads, existingInvoice, company: companyFilter, onCreated, onClose }) {
  // For existing invoices with no linked loads, use the company stored on the invoice itself
  const loadCompany = loads[0]?.company || existingInvoice?.company || 'carat'
  const { companies } = useCompanySettings()
  const coKey = loadCompany === 'pro_freight' ? 'company_pro_freight' : 'company_carat'
  const co = { ...companies[coKey], logo: LOGOS[loadCompany] || LOGOS.carat }

  // Pre-fill from existing invoice if re-opening from history
  const [broker,           setBroker]           = useState(existingInvoice ? { name: existingInvoice.bill_to_name } : null)
  const [billToAddress,    setBillToAddress]    = useState(existingInvoice?.bill_to_address    || '')
  const [factoringName,    setFactoringName]    = useState(existingInvoice?.factoring_name     || '')
  const [factoringAddress, setFactoringAddress] = useState(existingInvoice?.factoring_address  || '')
  const [notes,            setNotes]            = useState(existingInvoice?.notes              || '')
  const [extras,           setExtras]           = useState(existingInvoice?.extra_charges      || [])
  const [saving,           setSaving]           = useState(false)
  const [previewNum,       setPreviewNum]       = useState(null)

  // ── Re-link panel (for invoices where loads lost their link) ────────────
  const [attached,   setAttached]   = useState([])  // loads manually re-linked
  const [linkInput,  setLinkInput]  = useState('')
  const [foundLoads, setFoundLoads] = useState([])
  const [finding,    setFinding]    = useState(false)
  // Open re-link panel by default when no loads are linked
  const [linkOpen,   setLinkOpen]   = useState(Boolean(existingInvoice && loads.length === 0))

  // ── Inline load-number corrections ──────────────────────────────────────
  // Keyed by load ID; only stores values the user actually changed.
  const [loadNumEdits, setLoadNumEdits] = useState({})
  function getLoadNum(l) {
    return loadNumEdits[l.id] !== undefined ? loadNumEdits[l.id] : (l.load_number || '')
  }

  const invoiceNum = existingInvoice?.invoice_number || '—'
  const isExisting = Boolean(existingInvoice)

  // Pre-fetch the invoice number so it shows before the user clicks "Mark as Invoiced"
  useEffect(() => {
    if (!isExisting) {
      peekNextInvoiceNumber(loadCompany).then(n => { if (n) setPreviewNum(n) })
    }
  }, [loadCompany, isExisting])

  // allLoads = prop loads (if any) OR manually re-attached loads
  const allLoads    = loads.length > 0 ? loads : attached
  const loadsTotal  = allLoads.reduce((s, l) => s + (Number(l.price) || 0), 0)
  const extrasTotal = extras.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const computedTotal = loadsTotal + extrasTotal

  // For existing invoices allow manually overriding the total — critical when loads
  // aren't linked (invoice shows $0) so the correct amount can be entered/restored.
  const [totalOverride, setTotalOverride] = useState(
    isExisting ? String(existingInvoice?.total ?? '') : null
  )
  // Use the override when editing an existing invoice; otherwise use computed.
  const total = isExisting && totalOverride !== null && totalOverride !== ''
    ? Number(totalOverride)
    : computedTotal

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

  // ── Re-link: look up loads by load number ─────────────────────────────
  async function handleFindLoads() {
    const nums = linkInput.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)
    if (!nums.length) return
    setFinding(true)
    try {
      const results = await findLoadsByNumbers(nums, loadCompany)
      setFoundLoads(results)
      if (results.length === 0) alert('No loads found for those load numbers. Check the numbers and try again.')
    } catch (e) {
      alert('Error: ' + e.message)
    } finally {
      setFinding(false)
    }
  }

  function handleAttachLoads() {
    setAttached(foundLoads)
    setFoundLoads([])
    setLinkOpen(false)
    // Offer to sync the total override with the newly computed total
    const newComputed = foundLoads.reduce((s, l) => s + (Number(l.price) || 0), 0) + extrasTotal
    if (newComputed > 0 && window.confirm(
      `Loads attached! The computed total from these loads is $${newComputed.toLocaleString('en-US', { minimumFractionDigits: 2 })}.\n\nUpdate the invoice total to this amount?`
    )) {
      setTotalOverride(String(newComputed))
    }
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
      // Save any corrected load numbers first
      const changedLoads = allLoads.filter(
        l => loadNumEdits[l.id] !== undefined && loadNumEdits[l.id] !== (l.load_number || '')
      )
      for (const l of changedLoads) {
        await updateLoadField(l.id, { load_number: loadNumEdits[l.id] })
      }

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
        // If loads were manually re-attached, stamp the DB link
        if (attached.length > 0) {
          await relinkLoadsToInvoice(
            existingInvoice.id,
            existingInvoice.invoice_number,
            attached.map(l => l.id)
          )
        }
      } else {
        await createInvoice(invoiceData, loads.map(l => l.id), loads)
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

            {/* Invoice total override + re-link panel (existing invoices) */}
            {isExisting && (
              <div style={{ marginTop: 12, borderRadius: 8, overflow: 'hidden', border: `1px solid ${allLoads.length === 0 ? '#FCA5A5' : '#E5E7EB'}` }}>

                {/* Re-link banner — shown when no loads are linked */}
                {allLoads.length === 0 && (
                  <div style={{ background: '#FEF2F2', padding: '10px 14px', borderBottom: linkOpen ? '1px solid #FCA5A5' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>
                        ⚠ No loads are linked to this invoice. Re-attach them below to restore the load table.
                      </div>
                      <button
                        className="btn btn-ghost btn-xs"
                        style={{ color: '#DC2626', borderColor: '#FCA5A5', whiteSpace: 'nowrap', marginLeft: 12 }}
                        onClick={() => setLinkOpen(v => !v)}
                      >
                        {linkOpen ? '▲ Hide' : '🔗 Re-link Loads'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Re-link success banner */}
                {attached.length > 0 && (
                  <div style={{ background: '#F0FDF4', padding: '8px 14px', borderBottom: '1px solid #86EFAC', fontSize: 12, color: '#166534', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>✓ {attached.length} load{attached.length > 1 ? 's' : ''} re-attached — will be saved when you click Update &amp; Save</span>
                    <button className="btn btn-ghost btn-xs" style={{ color: '#6B7280' }} onClick={() => { setAttached([]); setLinkOpen(true) }}>Undo</button>
                  </div>
                )}

                {/* Re-link search panel */}
                {linkOpen && (
                  <div style={{ background: '#FFF7F7', padding: '12px 14px', borderBottom: '1px solid #FCA5A5' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                      Enter the load numbers for this invoice (one per line or comma-separated):
                    </div>
                    <textarea
                      rows={3}
                      value={linkInput}
                      onChange={e => setLinkInput(e.target.value)}
                      placeholder={'e.g.\n20317925\n20317926'}
                      style={{ width: '100%', fontSize: 12, padding: '6px 8px', border: '1px solid #FCA5A5', borderRadius: 6, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'monospace' }}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button className="btn btn-ghost btn-xs" onClick={handleFindLoads} disabled={finding || !linkInput.trim()}>
                        {finding ? 'Searching…' : '🔍 Find Loads'}
                      </button>
                      {foundLoads.length > 0 && (
                        <button className="btn btn-primary btn-xs" onClick={handleAttachLoads}>
                          ✓ Attach {foundLoads.length} load{foundLoads.length > 1 ? 's' : ''}
                        </button>
                      )}
                    </div>

                    {/* Search results preview */}
                    {foundLoads.length > 0 && (
                      <div style={{ marginTop: 10, border: '1px solid #E5E7EB', borderRadius: 6, overflow: 'hidden' }}>
                        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#F3F4F6' }}>
                              <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600 }}>Load #</th>
                              <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600 }}>Broker</th>
                              <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600 }}>Pickup</th>
                              <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600 }}>Destination</th>
                              <th style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {foundLoads.map(l => (
                              <tr key={l.id} style={{ borderTop: '1px solid #E5E7EB' }}>
                                <td style={{ padding: '4px 8px' }}><strong>{l.load_number}</strong></td>
                                <td style={{ padding: '4px 8px', color: '#6B7280' }}>{l.broker || '—'}</td>
                                <td style={{ padding: '4px 8px', color: '#6B7280' }}>{l.pickup_date || l.date || '—'}</td>
                                <td style={{ padding: '4px 8px', color: '#6B7280' }}>{l.delivery_location?.split(',')[0] || '—'}</td>
                                <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600, color: '#15803D' }}>{l.price ? fmt(l.price) : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Total override row */}
                <div style={{ padding: '10px 14px', background: '#F9FAFB', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>
                    Invoice Total ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={totalOverride ?? ''}
                    onChange={e => setTotalOverride(e.target.value)}
                    placeholder={String(computedTotal || '')}
                    style={{ width: 140, fontSize: 13, padding: '4px 8px', border: `1px solid ${allLoads.length === 0 ? '#FCA5A5' : '#D1D5DB'}`, borderRadius: 6 }}
                  />
                  {allLoads.length > 0 && (
                    <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                      Computed from loads: {fmt(computedTotal)}
                      {totalOverride && Number(totalOverride) !== computedTotal && (
                        <button
                          className="btn btn-ghost btn-xs"
                          style={{ marginLeft: 6, fontSize: 10 }}
                          onClick={() => setTotalOverride(String(computedTotal))}
                        >Use this</button>
                      )}
                    </span>
                  )}
                </div>
              </div>
            )}

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
                    <tr><td>Invoice #</td><td><strong>{isExisting ? invoiceNum : (previewNum || 'Pending')}</strong></td></tr>
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
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {allLoads.map(l => (
                  <tr key={l.id}>
                    <td>
                      <input
                        className="inv-inline-edit"
                        value={getLoadNum(l)}
                        onChange={e => setLoadNumEdits(prev => ({ ...prev, [l.id]: e.target.value }))}
                        title="Click to correct load number"
                        placeholder="—"
                      />
                    </td>
                    <td>{l.pickup_date  || l.date || '—'}</td>
                    <td>{l.pickup_location?.split(',')[0]  || '—'}</td>
                    <td>{l.delivery_date || '—'}</td>
                    <td>{l.delivery_location?.split(',')[0] || '—'}</td>
                    <td className="inv-amount">{l.price ? fmt(l.price) : '—'}</td>
                  </tr>
                ))}
                {extras.filter(e => e.amount).map((e, i) => (
                  <tr key={`extra-${i}`} className="inv-extra-row">
                    <td><strong>{e.type}</strong></td>
                    <td colSpan={4} style={{ color: '#6B7280', fontStyle: 'italic' }}>{e.description || ''}</td>
                    <td className="inv-amount">{fmt(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} className="inv-total-label">TOTAL DUE</td>
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
