import { useState, useEffect } from 'react'
import { fetchAttachmentBlob } from '../lib/clickup'
import { useEquipmentDetail } from '../hooks/useClickUp'

export default function EquipmentSidebar({ equipment, equipType, onClose }) {
  const isTruck  = equipType === 'truck'
  const number   = isTruck ? equipment.truckNumber : equipment.trailerNumber
  const label    = isTruck ? `Truck ${number}` : `Trailer ${number}`
  const initials = isTruck ? 'TR' : 'TL'

  // Fetch individual task to get attachments (list endpoint doesn't return them)
  const { detail, loading: detailLoading } = useEquipmentDetail(equipment.id, equipType)
  const data = detail ?? equipment

  return (
    <>
      <div className="sidebar-overlay" onClick={onClose} />
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="equip-avatar">{initials}</div>
          <div style={{ flex: 1 }}>
            <div className="sidebar-name">{label}</div>
            <div className="sidebar-role">
              {equipment.type}{equipment.company ? ` · ${equipment.company === 'carat' ? 'Carat Expedited' : 'Pro Freight'}` : ''}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} style={{ flexShrink: 0 }}>✕</button>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-title">Details</div>
          {detailLoading && <p style={{ fontSize: 12, color: '#9CA3AF' }}>Loading…</p>}
          {!detailLoading && <>
            {data.year  && <InfoRow label="Year"  value={data.year} />}
            {data.make  && <InfoRow label="Make"  value={data.make} />}
            {data.model && <InfoRow label="Model" value={data.model} />}
            {!data.year && !data.make && !data.model && (
              <p style={{ fontSize: 12, color: '#9CA3AF' }}>No details in ClickUp yet.</p>
            )}
          </>}
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-title">Registration & Compliance</div>
          {data.vin           && <InfoRow label="VIN"            value={data.vin} mono />}
          {data.plate         && <InfoRow label="License Plate"  value={data.plate} />}
          {data.dotInspection && <InfoRow label="DOT Inspection" value={data.dotInspection} />}
          {!data.vin && !data.plate && !data.dotInspection && !detailLoading && (
            <p style={{ fontSize: 12, color: '#9CA3AF' }}>No compliance data in ClickUp yet.</p>
          )}
        </div>

        {data.attachments?.length > 0 && (
          <div className="sidebar-section">
            <div className="sidebar-section-title">Documents & Photos</div>
            <div className="attachment-grid">
              {data.attachments.map(a => (
                <AttachmentImage key={a.id} url={a.url} title={a.title} />
              ))}
            </div>
          </div>
        )}

        <div className="sidebar-section">
          <div className="sidebar-section-title">Source</div>
          <button
            className="cu-badge"
            onClick={() => window.open(`https://app.clickup.com/t/${equipment.id}`, '_blank')}
          >
            ↗ View in ClickUp
          </button>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 8 }}>
            Data pulled from ClickUp
          </div>
        </div>
      </div>
    </>
  )
}

function InfoRow({ label, value, mono }) {
  return (
    <div className="info-row">
      <span className="info-key">{label}</span>
      <span className="info-val" style={mono ? { fontFamily: '"SF Mono","Fira Code",monospace', fontSize: 11 } : {}}>
        {value}
      </span>
    </div>
  )
}

function AttachmentImage({ url, title }) {
  const [src, setSrc]           = useState(null)
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let objectUrl
    fetchAttachmentBlob(url)
      .then(blobUrl => { objectUrl = blobUrl; setSrc(blobUrl) })
      .catch(() => {})
      .finally(() => setLoading(false))
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [url])

  if (loading) return <div className="attachment-placeholder">Loading…</div>

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
