import { useState } from 'react'
import { useCompanySettings } from '../../hooks/useSettings'

const LOGOS = {
  carat:       '/logo-carat.png',
  pro_freight: '/logo-pro-freight.png',
}

const fmt = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })

// Return "City, ST" from a "City, State Zip" string
function cityState(loc) {
  if (!loc) return '—'
  const parts = loc.split(',')
  if (parts.length >= 2) {
    const city = parts[0].trim()
    const stateWord = parts[1].trim().split(' ')[0]  // first word after comma = state abbrev
    return stateWord ? `${city}, ${stateWord}` : city
  }
  return parts[0].trim() || '—'
}

export default function PaystubPrintModal({
  driver, profile, startDate, endDate,
  loads, loadPay, additions, deductions,
  commissionPct, fuelText, company,
  onMarkPaid, isHistory, isEdit, onEdit, onClose,
}) {
  const [saving, setSaving] = useState(false)
  const { companies } = useCompanySettings()
  const coSettings = company === 'pro_freight' ? companies.company_pro_freight : companies.company_carat
  const co = { ...coSettings, logo: LOGOS[company] || LOGOS.carat }
  const today  = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

  const isOO      = profile?.profile_type === 'owner_operator'
  const isPerMile = profile?.pay_type === 'per_mile' && !isOO

  async function handleMarkPaid() {
    if (!onMarkPaid) return
    setSaving(true)
    try { await onMarkPaid() }
    catch (e) { alert('Error: ' + e.message); setSaving(false) }
  }

  function handlePrint() {
    const el = document.getElementById('print-area')
    if (!el) { window.print(); return }

    // Collect all stylesheet <link> tags (they have absolute hrefs already)
    const cssLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map(l => `<link rel="stylesheet" href="${l.href}">`)
      .join('\n')

    const win = window.open('', '_blank')
    if (!win) { window.print(); return }  // fallback if popup blocked

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

    // Give CSS time to load, then print
    setTimeout(() => {
      win.focus()
      win.print()
      setTimeout(() => win.close(), 500)
    }, 700)
  }

  const loadTotal  = loads.reduce((s, l) => s + (Number(loadPay[l.id]?.amount) || 0), 0)
  const addTotal   = additions.reduce((s, a) => s + (Number(a.amount) || 0), 0)
  const dedTotal   = deductions.reduce((s, d) => s + (Number(d.amount) || 0), 0)
  const grandTotal = loadTotal + addTotal - dedTotal

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide">

        <div className="modal-header no-print">
          <div className="modal-title">Paystub Preview — {driver.name}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="print-doc" id="print-area">

            {/* Header */}
            <div className="inv-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
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
                <div className="inv-title" style={{ fontSize: 18 }}>DRIVER PAY REPORT</div>
                <table className="inv-meta-table">
                  <tbody>
                    <tr><td>Driver</td>      <td><strong>{driver.name}</strong></td></tr>
                    {driver.phone    && <tr><td>Phone</td>      <td>{driver.phone}</td></tr>}
                    {driver.hometown && <tr><td>Location</td>   <td>{driver.hometown}</td></tr>}
                    <tr><td>Report Date</td> <td>{today}</td></tr>
                    <tr><td>Period</td>      <td>{startDate} – {endDate}</td></tr>
                    {profile && (
                      <tr>
                        <td>Type</td>
                        <td>{isOO ? 'Owner Operator' : `Company Driver${isPerMile ? ` · $${profile.pay_rate}/mi` : ''}`}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Load table */}
            <table className="inv-loads-table">
              <thead>
                <tr>
                  <th>Load #</th>
                  <th>Pickup</th>
                  <th>Origin</th>
                  <th>Delivery</th>
                  <th>Destination</th>
                  <th>Loaded Mi</th>
                  <th>Empty Mi</th>
                  <th>Rate</th>
                  <th>{isOO ? 'Gross' : 'Pay'}</th>
                </tr>
              </thead>
              <tbody>
                {loads.map(l => {
                  const pay = loadPay[l.id] || {}
                  const emptyMi = pay.emptyMiles ?? l.empty_miles
                  const rateCell = isPerMile
                    ? ((pay.payType ?? 'per_mile') === 'flat' ? 'Flat Rate' : `$${pay.rate || profile?.pay_rate || '—'}/mi`)
                    : isOO ? '—' : 'Flat Rate'
                  return (
                    <tr key={l.id}>
                      <td>
                        {l.status === 'tonu'
                          ? <><span className="tonu-badge" style={{ marginRight: 4 }}>TONU</span>{l.load_number || ''}</>
                          : (l.load_number || '—')}
                      </td>
                      <td>{l.pickup_date  || l.date || '—'}</td>
                      <td>{cityState(l.pickup_location)}</td>
                      <td>{l.delivery_date || '—'}</td>
                      <td>{cityState(l.delivery_location)}</td>
                      <td>{isPerMile ? (pay.miles || l.total_miles || '—') : (l.total_miles || '—')}</td>
                      <td>{emptyMi || '—'}</td>
                      <td>{rateCell}</td>
                      <td className="inv-amount">{pay.amount ? fmt(pay.amount) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={8} className="inv-total-label" style={{ fontWeight: 600 }}>Sub-Total</td>
                  <td className="inv-amount" style={{ fontWeight: 700 }}>{fmt(loadTotal)}</td>
                </tr>
              </tfoot>
            </table>

            {/* Additions */}
            {additions.length > 0 && (
              <div className="paystub-adddeds">
                <div className="paystub-addded-title" style={{ color: '#111827' }}>Additions</div>
                {additions.map((a, i) => (
                  <div key={i} className="paystub-addded-row">
                    <span>{a.label}</span>
                    <span className="paystub-addded-balance">{a.balance || ''}</span>
                    <span className="paystub-addded-amount">{fmt(a.amount || 0)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Deductions */}
            {deductions.length > 0 && (
              <div className="paystub-adddeds">
                <div className="paystub-addded-title" style={{ color: '#111827' }}>Deductions</div>
                {isOO && commissionPct && (
                  <div className="paystub-commission-note">Commission rate: {commissionPct}% of ${fmt(loadTotal)}</div>
                )}
                {deductions.map((d, i) => (
                  <div key={i} className="paystub-addded-row">
                    <span>{d.label}</span>
                    <span className="paystub-addded-balance">{d.balance || ''}</span>
                    <span className="paystub-addded-amount" style={{ color: '#DC2626' }}>-{fmt(d.amount || 0)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Grand Total */}
            <div className="paystub-grand-print">
              <span>Grand Total</span>
              <span>{fmt(grandTotal)} USD</span>
            </div>

            {/* Fuel Transactions Reference */}
            {fuelText && (
              <div className="paystub-fuel-section">
                <div className="paystub-fuel-title">⛽ Fuel Transactions — Reference</div>
                <div className="paystub-fuel-text">{fuelText}</div>
              </div>
            )}

          </div>
        </div>

        <div className="modal-footer no-print">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-ghost" onClick={handlePrint}>🖨 Print / Save PDF</button>
          {isHistory && onEdit && (
            <button className="btn btn-ghost" onClick={onEdit}>✏ Edit Paystub</button>
          )}
          {!isHistory && onMarkPaid && (
            <button className="btn btn-primary" onClick={handleMarkPaid} disabled={saving}>
              {saving ? 'Saving…' : isEdit ? '✓ Save Changes' : '✓ Mark as Paid'}
            </button>
          )}
          {isHistory && !onEdit && (
            <span style={{ fontSize: 12, color: '#9CA3AF', alignSelf: 'center' }}>Historical paystub — already paid</span>
          )}
        </div>
      </div>
    </div>
  )
}
