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

const fmt = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })

export default function PaystubPrintModal({
  driver, startDate, endDate,
  loads, payAmounts, additions, deductions,
  company, onClose,
}) {
  const co      = COMPANY_INFO[company] || COMPANY_INFO.carat
  const today   = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

  const loadTotal = loads.reduce((s, l)  => s + (Number(payAmounts[l.id]) || 0), 0)
  const addTotal  = additions.reduce((s, a) => s + (Number(a.amount) || 0), 0)
  const dedTotal  = deductions.reduce((s, d) => s + (Number(d.amount) || 0), 0)
  const grandTotal = loadTotal + addTotal - dedTotal

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide">

        <div className="modal-header no-print">
          <div className="modal-title">Paystub Preview</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
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
                <div className="inv-title" style={{ fontSize: 18 }}>DRIVER PAY REPORT</div>
                <table className="inv-meta-table">
                  <tbody>
                    <tr><td>Driver</td>       <td><strong>{driver.name}</strong></td></tr>
                    {driver.phone    && <tr><td>Phone</td>       <td>{driver.phone}</td></tr>}
                    {driver.hometown && <tr><td>Location</td>    <td>{driver.hometown}</td></tr>}
                    <tr><td>Report Date</td>  <td>{today}</td></tr>
                    <tr><td>Period</td>       <td>{startDate} – {endDate}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

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
                  <th>Pay</th>
                </tr>
              </thead>
              <tbody>
                {loads.map(l => (
                  <tr key={l.id}>
                    <td>{l.load_number || '—'}</td>
                    <td>{l.pickup_date  || l.date || '—'}</td>
                    <td>{l.pickup_location?.split(',')[0]   || '—'}</td>
                    <td>{l.delivery_date || '—'}</td>
                    <td>{l.delivery_location?.split(',')[0] || '—'}</td>
                    <td>{l.total_miles || '—'}</td>
                    <td>{l.empty_miles || '—'}</td>
                    <td className="inv-amount">{payAmounts[l.id] ? fmt(payAmounts[l.id]) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={7} className="inv-total-label" style={{ fontWeight: 600 }}>Sub-Total</td>
                  <td className="inv-amount" style={{ fontWeight: 600 }}>{fmt(loadTotal)}</td>
                </tr>
              </tfoot>
            </table>

            {additions.length > 0 && (
              <div className="paystub-adddeds">
                <div className="paystub-addded-title">Additions</div>
                {additions.map((a, i) => (
                  <div key={i} className="paystub-addded-row">
                    <span>{a.label}</span>
                    <span className="paystub-addded-amount">{fmt(a.amount || 0)}</span>
                  </div>
                ))}
              </div>
            )}

            {deductions.length > 0 && (
              <div className="paystub-adddeds">
                <div className="paystub-addded-title">Deductions</div>
                {deductions.map((d, i) => (
                  <div key={i} className="paystub-addded-row">
                    <span>{d.label}</span>
                    <span className="paystub-addded-amount" style={{ color: '#DC2626' }}>
                      -{fmt(d.amount || 0)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="paystub-grand-print">
              <span>Grand Total</span>
              <span>{fmt(grandTotal)} USD</span>
            </div>

          </div>
          {/* end print-doc */}
        </div>

        <div className="modal-footer no-print">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={() => window.print()}>
            🖨 Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  )
}
