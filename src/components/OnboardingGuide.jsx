export default function OnboardingGuide({ onClose }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide" style={{ maxWidth: 680, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        <div className="modal-header">
          <div className="modal-title">📋 What's New — Dispatcher Guide</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ overflowY: 'auto', fontSize: 14, lineHeight: 1.6 }}>

          {/* ── Section 1 ── */}
          <div className="guide-section">
            <div className="guide-section-title">🗓 Daily Board — How to use it</div>

            <div className="guide-item">
              <div className="guide-item-head">Every truck in the fleet shows up every day</div>
              <div className="guide-item-body">
                Trucks without a load show a <span className="guide-chip grey">No load</span> row.
                You have four quick buttons right there — no need to open any form:
              </div>
              <div className="guide-qp-demo">
                <span className="ghost-qp-btn qp-home" style={{ pointerEvents: 'none' }}>🏠 At Home</span>
                <span className="ghost-qp-btn qp-empty" style={{ pointerEvents: 'none' }}>🚛 Empty</span>
                <span className="ghost-qp-btn qp-broken" style={{ pointerEvents: 'none' }}>🔧 Broken</span>
                <span className="ghost-qp-btn qp-add" style={{ pointerEvents: 'none' }}>+ Add Load</span>
              </div>
              <div className="guide-item-note">
                Click <strong>At Home</strong>, <strong>Empty</strong>, or <strong>Broken</strong> to record the truck status instantly — no form needed.<br />
                Click <strong>+ Add Load</strong> to open the full form with truck &amp; driver already filled in.
              </div>
            </div>

            <div className="guide-item">
              <div className="guide-item-head">Multiple loads on one truck</div>
              <div className="guide-item-body">
                When a truck has more than one load for the day, they stack under each other with a
                <span style={{ color: '#818CF8', fontWeight: 700, marginLeft: 4 }}>└</span> connector and a purple left border.
                Use the <span className="guide-chip indigo">▾ loads</span> toggle button to collapse/expand them.
                Everything is <strong>expanded by default</strong> so nothing is hidden from dispatch in the morning.
              </div>
            </div>

            <div className="guide-item">
              <div className="guide-item-head">Adding a follow-up load (chaining)</div>
              <div className="guide-item-body">
                On any covered load row, click the <span className="guide-chip green">+</span> chain button.
                It opens the form with the same truck, trailer, and driver already filled in — just add the new route and details.
              </div>
            </div>
          </div>

          {/* ── Section 2 ── */}
          <div className="guide-section">
            <div className="guide-section-title">⚙️ Required Fields for Active Loads</div>
            <div className="guide-item">
              <div className="guide-item-body">
                When a load status is <strong>Covered, At Pick Up, At Delivery, or TONU</strong>,
                the following fields are required before saving:
              </div>
              <ul className="guide-list">
                <li><strong>Load Number</strong> — the broker's load/reference number</li>
                <li><strong>Broker</strong> — who booked the load</li>
                <li><strong>Price</strong> — what the broker is paying</li>
                <li><strong>Total Miles &amp; Empty Miles</strong> — needed for $/mile calculation and driver pay</li>
              </ul>
              <div className="guide-item-note">
                Fields marked with a red <span style={{ color: '#DC2626', fontWeight: 700 }}>*</span> are required. The form will not save until they are filled.
              </div>
            </div>
          </div>

          {/* ── Section 3 ── */}
          <div className="guide-section">
            <div className="guide-section-title">🔒 Deleting Loads — What's Protected</div>
            <div className="guide-item">
              <div className="guide-item-body">
                Loads that have been <strong>invoiced</strong> or included in a <strong>paystub</strong> cannot be deleted.
                This protects the accounting records.
              </div>
              <div className="guide-item-note">
                If you need to remove an invoiced load from the pending list, use the
                <strong> Archive (🗄)</strong> button inside the Accounting → Invoices tab instead.
              </div>
            </div>
          </div>

          {/* ── Section 4 ── */}
          <div className="guide-section">
            <div className="guide-section-title">📄 Invoices — What Changed</div>
            <div className="guide-item">
              <div className="guide-item-head">Loads stay linked to their invoice</div>
              <div className="guide-item-body">
                Previously, editing a load after invoicing it could accidentally break the link between the load and the invoice
                (showing $0 in history). This is now fixed:
              </div>
              <ul className="guide-list">
                <li>Editing a load <strong>never</strong> touches the invoice link, paid status, or accounting fields.</li>
                <li>Invoice history now stores the load IDs directly on the invoice record — a reliable backup link.</li>
              </ul>
            </div>

            <div className="guide-item">
              <div className="guide-item-head">Invoice history: editable total</div>
              <div className="guide-item-body">
                When re-opening an old invoice, you can now <strong>manually edit the total</strong> if it shows $0 or an incorrect amount.
                A warning banner appears if no loads are linked.
              </div>
            </div>

            <div className="guide-item">
              <div className="guide-item-head">Invoice history: search &amp; sort</div>
              <div className="guide-item-body">
                The history table now shows <strong>Truck Numbers</strong> alongside load numbers, and all columns are sortable.
              </div>
            </div>
          </div>

          {/* ── Section 5 ── */}
          <div className="guide-section">
            <div className="guide-section-title">💰 Paystubs — Multi-stop loads</div>
            <div className="guide-item">
              <div className="guide-item-body">
                Multi-stop loads (e.g. two pickups then one delivery) now display stops in
                <strong> chronological order</strong> on the paystub — earliest pickup first, then deliveries.
                No more confusing "pickup → delivery → pickup" sequences.
              </div>
            </div>
          </div>

          {/* ── Section 6 ── */}
          <div className="guide-section">
            <div className="guide-section-title">📊 Weekly Summary</div>
            <div className="guide-item">
              <div className="guide-item-body">
                The weekly summary now correctly counts only loads that were <strong>dispatched (picked up) during that week</strong>.
                Old loads with no delivery date no longer bleed into every week's totals.
              </div>
            </div>
          </div>

          <div style={{ marginTop: 20, padding: '12px 16px', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, fontSize: 13, color: '#166534' }}>
            <strong>Tip:</strong> This guide reopens anytime — click the <strong>?</strong> button in the top-right corner of the toolbar.
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>Got it — let's go!</button>
        </div>
      </div>
    </div>
  )
}
