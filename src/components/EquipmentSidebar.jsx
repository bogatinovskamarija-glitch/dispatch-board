export default function EquipmentSidebar({ equipment, equipType, onClose }) {
  const isTruck   = equipType === 'truck'
  const number    = isTruck ? equipment.truckNumber : equipment.trailerNumber
  const label     = isTruck ? `Truck ${number}` : `Trailer ${number}`
  const initials  = isTruck ? 'TR' : 'TL'

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
          {equipment.year         && <InfoRow label="Year"          value={equipment.year} />}
          {equipment.make         && <InfoRow label="Make"          value={equipment.make} />}
          {equipment.model        && <InfoRow label="Model"         value={equipment.model} />}
          {!equipment.year && !equipment.make && !equipment.model && (
            <p style={{ fontSize: 12, color: '#9CA3AF' }}>No details in ClickUp yet.</p>
          )}
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-title">Registration & Compliance</div>
          {equipment.vin           && <InfoRow label="VIN"              value={equipment.vin} mono />}
          {equipment.licensePlate  && <InfoRow label="License Plate"    value={equipment.licensePlate} />}
          {equipment.dotInspection && <InfoRow label="DOT Inspection"   value={equipment.dotInspection} />}
          {!equipment.vin && !equipment.licensePlate && !equipment.dotInspection && (
            <p style={{ fontSize: 12, color: '#9CA3AF' }}>No compliance data in ClickUp yet.</p>
          )}
        </div>

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
