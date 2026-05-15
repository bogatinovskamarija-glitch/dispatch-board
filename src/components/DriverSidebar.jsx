import { useDriverDetail } from '../hooks/useClickUp'

export default function DriverSidebar({ clickupId, name, onClose }) {
  const { driver, loading } = useDriverDetail(clickupId)

  const initials = name
    ? name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  return (
    <>
      <div className="sidebar-overlay" onClick={onClose} />
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="driver-avatar">{initials}</div>
          <div style={{ flex: 1 }}>
            <div className="sidebar-name">{name}</div>
            <div className="sidebar-role">
              {loading ? 'Loading…' : driver?.company ? `${driver.company} · Driver` : 'Driver'}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} style={{ flexShrink: 0 }}>✕</button>
        </div>

        {loading ? (
          <div className="sidebar-loading">Loading ClickUp data…</div>
        ) : driver ? (
          <>
            <div className="sidebar-section">
              <div className="sidebar-section-title">Contact</div>
              <InfoRow label="Phone"     value={driver.phone    || '—'} />
              <InfoRow label="Alt Phone" value={driver.altPhone || '—'} />
              <InfoRow label="Hometown"  value={driver.hometown || '—'} />
            </div>

            <div className="sidebar-section">
              <div className="sidebar-section-title">License & Compliance</div>
              <InfoRow label="CDL"          value={driver.cdl       || '—'} />
              <InfoRow label="CDL Expiry"   value={driver.cdlExpiry || '—'} />
              <InfoRow label="Medical Card" value={driver.medCard   || '—'} />
            </div>

            {driver.notes && (
              <div className="sidebar-section">
                <div className="sidebar-section-title">Notes</div>
                <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{driver.notes}</p>
              </div>
            )}

            <div className="sidebar-section">
              <div className="sidebar-section-title">Source</div>
              <button
                className="cu-badge"
                onClick={() => window.open(`https://app.clickup.com/t/${clickupId}`, '_blank')}
              >
                ↗ View in ClickUp
              </button>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 8 }}>
                Data pulled live from ClickUp
              </div>
            </div>
          </>
        ) : (
          <div className="sidebar-section">
            <div style={{ fontSize: 12, color: '#9CA3AF' }}>
              Could not load driver details. Check ClickUp connection.
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function InfoRow({ label, value }) {
  return (
    <div className="info-row">
      <span className="info-key">{label}</span>
      <span className="info-val">{value}</span>
    </div>
  )
}
