import { useState, useEffect } from 'react'
import { useDriverDetail } from '../hooks/useClickUp'
import { fetchAttachmentBlob } from '../lib/clickup'

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
              {driver.altPhone  && <InfoRow label="Alt Phone" value={driver.altPhone} />}
              {driver.address   && <InfoRow label="Address"   value={driver.address} />}
              {driver.hometown  && <InfoRow label="Hometown"  value={driver.hometown} />}
            </div>

            <div className="sidebar-section">
              <div className="sidebar-section-title">License & Compliance</div>
              {driver.cdlState  && <InfoRow label="CDL State"    value={driver.cdlState} />}
              {driver.cdlNumber && <InfoRow label="CDL #"        value={driver.cdlNumber} />}
              <InfoRow           label="CDL Expiry"              value={driver.cdlExpiry  || '—'} />
              <InfoRow           label="Med Cert Expiry"         value={driver.medCert    || '—'} />
              {driver.endorsements && <InfoRow label="Endorsements" value={driver.endorsements} />}
              {driver.twic        && <InfoRow label="TWIC"         value={driver.twic} />}
              {driver.driverType  && <InfoRow label="Driver Type"  value={driver.driverType} />}
            </div>

            {driver.attachments?.length > 0 && (
              <div className="sidebar-section">
                <div className="sidebar-section-title">Documents & Licenses</div>
                <div className="attachment-grid">
                  {driver.attachments.map(a => (
                    <AttachmentImage key={a.id} url={a.url} title={a.title} />
                  ))}
                </div>
              </div>
            )}

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

function AttachmentImage({ url, title }) {
  const [src, setSrc]         = useState(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let objectUrl
    fetchAttachmentBlob(url)
      .then(blobUrl => { objectUrl = blobUrl; setSrc(blobUrl) })
      .catch(() => {})
      .finally(() => setLoading(false))
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [url])

  if (loading) return (
    <div className="attachment-placeholder">Loading…</div>
  )

  if (!src) return (
    <a href={url} target="_blank" rel="noreferrer" className="attachment-link">
      ↗ {title}
    </a>
  )

  return (
    <>
      <div className="attachment-item" onClick={() => setExpanded(true)} title="Click to enlarge">
        <img src={src} alt={title} className="attachment-thumb" />
        <div className="attachment-label">{title}</div>
      </div>
      {expanded && (
        <div className="attachment-lightbox" onClick={() => setExpanded(false)}>
          <img src={src} alt={title} />
          <div className="attachment-lightbox-hint">Click anywhere to close</div>
        </div>
      )}
    </>
  )
}
