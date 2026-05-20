import { useState, useRef } from 'react'
import { parseMaintenanceCSV } from '../../hooks/useMaintenance'

const CAT_LABELS = {
  pm: 'PM', tire: 'Tire', other: 'Other', ac: 'AC',
  light: 'Light', batteries: 'Batteries', dot_inspection: 'DOT', steering_tires: 'Steer Tires',
}

export default function ImportCSVModal({ onImport, onClose }) {
  const [company,   setCompany]   = useState('carat')
  const [preview,   setPreview]   = useState(null)   // { records, skipped }
  const [fileName,  setFileName]  = useState('')
  const [importing, setImporting] = useState(false)
  const [done,      setDone]      = useState(false)
  const fileRef = useRef()

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const result = parseMaintenanceCSV(ev.target.result, company)
        setPreview(result)
      } catch (err) {
        alert('Error parsing file: ' + err.message)
      }
    }
    reader.readAsText(file)
  }

  function handleCompanyChange(e) {
    setCompany(e.target.value)
    setPreview(null)
    setFileName('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleImport() {
    if (!preview?.records?.length) return
    setImporting(true)
    try {
      await onImport(preview.records)
      setDone(true)
    } catch (err) {
      alert('Import error: ' + err.message)
      setImporting(false)
    }
  }

  const validRecords = preview?.records?.filter(r => r.date && r.unit_number) || []
  const invalidCount = (preview?.records?.length || 0) - validRecords.length

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-header">
          <div className="modal-title">Import Maintenance CSV</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {done ? (
            <div className="import-done">
              <div style={{ fontSize: 48, textAlign: 'center' }}>✓</div>
              <div style={{ textAlign: 'center', fontWeight: 600 }}>
                {validRecords.length} records imported successfully!
              </div>
              <div className="modal-footer" style={{ marginTop: 24 }}>
                <button className="btn btn-primary" onClick={onClose}>Close</button>
              </div>
            </div>
          ) : (
            <>
              <div className="import-setup">
                <div className="form-group" style={{ maxWidth: 220 }}>
                  <label>Company</label>
                  <select value={company} onChange={handleCompanyChange}>
                    <option value="carat">Carat Expedited</option>
                    <option value="pro_freight">Pro Freight Transportation</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>CSV File (Google Sheets export)</label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleFile}
                  />
                  <div className="form-hint">
                    Expected columns: Year, Month, Date, Unit Number, Unit Type, Maintenance, Other, Amount, Mileage, PM Code, Invoice
                  </div>
                </div>
              </div>

              {preview && (
                <div className="import-preview">
                  <div className="import-preview-stats">
                    <span className="import-stat-good">✓ {validRecords.length} records ready</span>
                    {preview.skipped + invalidCount > 0 && (
                      <span className="import-stat-skip">⚠ {preview.skipped + invalidCount} rows skipped (headers, totals, invalid dates)</span>
                    )}
                  </div>

                  <div className="import-table-wrap">
                    <table className="import-preview-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Unit</th>
                          <th>Type</th>
                          <th>Category</th>
                          <th>Description</th>
                          <th>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validRecords.slice(0, 50).map((r, i) => (
                          <tr key={i}>
                            <td>{r.date || <span className="text-muted">—</span>}</td>
                            <td>{r.unit_number}</td>
                            <td style={{ textTransform: 'capitalize' }}>{r.unit_type}</td>
                            <td>{CAT_LABELS[r.category] || r.category}</td>
                            <td className="import-desc">{r.description}</td>
                            <td>{r.amount != null ? '$' + Number(r.amount).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}</td>
                          </tr>
                        ))}
                        {validRecords.length > 50 && (
                          <tr>
                            <td colSpan={6} style={{ textAlign: 'center', color: '#9CA3AF', fontStyle: 'italic' }}>
                              … and {validRecords.length - 50} more records
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {!done && (
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            {preview && validRecords.length > 0 && (
              <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
                {importing ? `Importing ${validRecords.length} records…` : `Import ${validRecords.length} Records`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
