export default function OnboardingGuide({ onClose }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide" style={{ maxWidth: 660, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        <div className="modal-header">
          <div className="modal-title">📋 Dispatcher Guide — Quick Reference</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ overflowY: 'auto', fontSize: 14, lineHeight: 1.6 }}>

          {/* ── Section 1: Daily Board ── */}
          <div className="guide-section">
            <div className="guide-section-title">🗓 Starting Your Day — Every Truck Shows Up</div>

            <div className="guide-item">
              <div className="guide-item-body">
                Every truck in the fleet has a row, even if it has no load yet.
                Trucks without a load show a <span className="guide-chip grey">No load</span> row with four quick buttons —
                <strong> no form needed:</strong>
              </div>
              <div className="guide-qp-demo" style={{ margin: '10px 0' }}>
                <span className="ghost-qp-btn qp-home" style={{ pointerEvents: 'none' }}>🏠 At Home</span>
                <span className="ghost-qp-btn qp-empty" style={{ pointerEvents: 'none' }}>🚛 Empty</span>
                <span className="ghost-qp-btn qp-broken" style={{ pointerEvents: 'none' }}>🔧 Broken</span>
                <span className="ghost-qp-btn qp-add" style={{ pointerEvents: 'none' }}>+ Add Load</span>
              </div>
              <ul className="guide-list">
                <li><strong>🏠 At Home</strong> — driver is home, truck not available today</li>
                <li><strong>🚛 Empty</strong> — truck is empty and ready for a load</li>
                <li><strong>🔧 Broken</strong> — truck is broken down</li>
                <li><strong>+ Add Load</strong> — opens the load form with truck &amp; driver already filled in</li>
              </ul>
            </div>
          </div>

          {/* ── Section 2: Multiple loads ── */}
          <div className="guide-section">
            <div className="guide-section-title">📦 Truck With Multiple Loads</div>

            <div className="guide-item">
              <div className="guide-item-body">
                When a truck has more than one load for the day, the extra loads are stacked below the first one
                with a grey <span style={{ fontWeight: 700, color: '#9CA3AF' }}>└</span> connector — indented so you can see at a glance they belong to the same truck.
              </div>
              <div className="guide-item-note">
                Use the <span className="guide-chip indigo">▾ loads</span> / <span className="guide-chip grey">▸ +1 load</span> toggle under the status badge to collapse or expand.
                Everything is <strong>expanded by default</strong> — nothing is hidden when you open the board in the morning.
              </div>
            </div>

            <div className="guide-item">
              <div className="guide-item-head">Adding a follow-up load (chaining)</div>
              <div className="guide-item-body">
                On any load row, click the <span className="guide-chip green">+</span> chain button (next to the ✎ edit button).
                It opens the form with the same truck, trailer, and driver already filled in — just enter the new route and details.
              </div>
            </div>
          </div>

          {/* ── Section 3: Required fields ── */}
          <div className="guide-section">
            <div className="guide-section-title">✅ Required Fields When Adding a Load</div>

            <div className="guide-item">
              <div className="guide-item-body">
                When the status is <strong>Covered, At Pick Up, At Delivery, or TONU</strong>,
                you must fill in these fields before saving:
              </div>
              <ul className="guide-list">
                <li><strong>Load Number</strong> — the broker's reference number (e.g. 20317925)</li>
                <li><strong>Broker</strong> — who booked the load (e.g. JERUE, TQL)</li>
                <li><strong>Price</strong> — what the broker is paying for this load</li>
                <li><strong>Total Miles &amp; Empty Miles</strong> — needed for $/mile tracking</li>
              </ul>
              <div className="guide-item-note">
                Fields with a red <span style={{ color: '#DC2626', fontWeight: 700 }}>*</span> are required. The form won't save until they're filled in.
              </div>
            </div>
          </div>

          {/* ── Section 4: Driver / Truck / Trailer info ── */}
          <div className="guide-section">
            <div className="guide-section-title">ℹ️ Checking Driver, Truck &amp; Trailer Info</div>

            <div className="guide-item">
              <div className="guide-item-head">Driver info</div>
              <div className="guide-item-body">
                Click the <strong>driver's name</strong> (shown as a blue link in the Driver column).
                A sidebar opens with their phone, hometown, and a direct link to their ClickUp profile.
              </div>
            </div>

            <div className="guide-item">
              <div className="guide-item-head">Truck &amp; Trailer info</div>
              <div className="guide-item-body">
                Next to every truck or trailer number you'll see a small <span style={{ fontWeight: 700, color: '#6B7280' }}>ⓘ</span> button.
                Click it to open a sidebar showing the equipment details — type, company, notes, and maintenance history.
              </div>
            </div>

            <div className="guide-item">
              <div className="guide-item-head">Fleet Roster</div>
              <div className="guide-item-body">
                Click <strong>⊞ Fleet Roster</strong> in the top toolbar to see all trucks, which driver is assigned to each,
                and edit the default driver/trailer for any truck. This is what controls which trucks appear on the daily board every day.
              </div>
            </div>
          </div>

          {/* ── Section 5: Navigating ── */}
          <div className="guide-section">
            <div className="guide-section-title">🔀 Navigating Dates &amp; Views</div>

            <div className="guide-item">
              <div className="guide-item-body">
                Use the <strong>‹ ›</strong> arrows in the top center to move between days (Day view) or weeks (Week view).
                Switch between <strong>Day</strong> and <strong>Week</strong> with the toggle next to the date.
              </div>
              <div className="guide-item-note">
                The <strong>Week view</strong> shows a Gantt-style chart of all loads across the week — useful for spotting gaps or overlap between trucks.
              </div>
            </div>
          </div>

          {/* ── Section 6: Status colors ── */}
          <div className="guide-section" style={{ borderBottom: 'none' }}>
            <div className="guide-section-title">🎨 Status Colors at a Glance</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px', fontSize: 13 }}>
              {[
                ['#16A34A', 'Covered — load is booked &amp; confirmed'],
                ['#0284C7', 'At Pick Up — driver is at the pickup location'],
                ['#EA580C', 'At Delivery — driver is delivering'],
                ['#4F46E5', 'Pre-Booked — load booked for a future date'],
                ['#CA8A04', 'Empty — truck is available, no load'],
                ['#DB2777', 'At Home — driver is home'],
                ['#DC2626', 'Broken Down — truck is out of service'],
                ['#9CA3AF', 'No Driver — truck has no driver assigned'],
              ].map(([color, label]) => (
                <div key={color} style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  dangerouslySetInnerHTML={{ __html: `<span style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block"></span> ${label}` }}
                />
              ))}
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
