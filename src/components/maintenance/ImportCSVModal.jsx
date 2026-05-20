import { useState, useRef } from 'react'
import { parseMaintenanceCSV } from '../../hooks/useMaintenance'

const CAT_LABELS = {
  pm: 'PM', tire: 'Tire', other: 'Other', ac: 'AC',
  light: 'Light', batteries: 'Batteries', dot_inspection: 'DOT', steering_tires: 'Steer Tires',
}

export default function ImportCSVModal({ onImport, onClose }) {
  const [company,   setCompany]   = useState('carat')
  const [preview,   setPreview]   = useState(null)
  const [fileName,  setFileName]  = useState('')
  const [importing, setImporting] = useState(false)
  const [done,      setDone]      = useState(false)
  const [showTable, setShowTable] = useState(false)
  const [showNullOnly, setShowNullOnly] = useState(false)
  const fileRef = useRef()

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name)
    setShowTable(false)
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
    setShowTable(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleImport() {
    if (!validRecords.length) return
    setImporting(true)
    try {
      await onImport(validRecords)
      setDone(true)
    } catch (err) {
      alert('Import error: ' + err.message)
      setImporting(false)
    }
  }

  // Only drop rows that are truly empty
  const validRecords = preview?.records?.filter(r =>
    r.unit_number || r.amount != null || r.description
  ) || []
  const invalidCount = (preview?.records?.length || 0) - validRecords.length
  const previewTotal = validRecords.reduce((sum, r) => sum + (r.amount || 0), 0)
  const nullAmtCount = preview?.nullAmountCount ?? 0

  // Year-by-year breakdown
  const yearBreakdown = validRecords.reduce((acc, r) => {
    const yr = r.date ? r.date.slice(0, 4) : 'No date'
    if (!acc[yr]) acc[yr] = { count: 0, total: 0 }
    acc[yr].count++
    acc[yr].total += r.amount || 0
    return acc
  }, {})
  const yearRows = Object.entries(yearBreakdown).sort(([a], [b]) => a.localeCompare(b))

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
                  {/* Summary stats */}
                  <div className="import-preview-stats">
                    <span className="import-stat-good">✓ {validRecords.length} records ready</span>
                    <span className="import-stat-total">
                      Total: ${previewTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {nullAmtCount > 0 && (
                      <span className="import-stat-skip">⚠ {nullAmtCount} records have no amount</span>
                    )}
                    {preview.skipped + invalidCount > 0 && (
                      <span className="import-stat-skip">⚠ {preview.skipped + invalidCount} rows skipped</span>
                    )}
                  </div>

                  {/* Raw column diagnostic — first 8 rows */}
                  {preview.diagSamples?.length > 0 && (
                    <div className="import-year-breakdown" style={{ marginBottom: 8 }}>
                      <div className="import-year-title">Raw column values (first 8 rows — col[5]=cat, col[6]=desc, col[7]=amount):</div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ fontSize: 11, borderCollapse: 'collapse', width: '100%' }}>
                          <thead>
                            <tr>
                              {['[0]Year','[1]Mon','[2]Date','[3]Unit','[4]Type','[5]Cat','[6]Desc','[7]Amt','[8]','[9]','[10]','[11]'].map(h => (
                                <th key={h} style={{ background: '#E5E7EB', padding: '3px 6px', textAlign: 'left', whiteSpace: 'nowrap', fontSize: 10 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {preview.diagSamples.map((row, i) => (
                              <tr key={i} style={{ background: i % 2 ? '#F9FAFB' : '#fff' }}>
                                {Array.from({ length: 12 }, (_, ci) => (
                                  <td key={ci} style={{ padding: '3px 6px', borderBottom: '1px solid #F3F4F6', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {row[ci] ?? ''}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Year-by-year breakdown — key diagnostic */}
                  <div className="import-year-breakdown">
                    <div className="import-year-title">Breakdown by year (verify these match your spreadsheet):</div>
                    <div className="import-year-grid">
                      {yearRows.map(([yr, { count, total }]) => (
                        <div key={yr} className="import-year-row">
                          <span className="import-year-label">{yr}</span>
                          <span className="import-year-count">{count} records</span>
                          <span className="import-year-amt">
                            ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Record preview table (toggle) */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => { setShowTable(v => !v); setShowNullOnly(false) }}>
                      {showTable && !showNullOnly ? '▲ Hide preview' : '▼ Show record preview (first 50)'}
                    </button>
                    {nullAmtCount > 0 && (
                      <button className="btn btn-ghost" style={{ fontSize: 12, color: '#F59E0B' }} onClick={() => { setShowTable(true); setShowNullOnly(v => !v) }}>
                        {showNullOnly ? '▲ Hide' : '▼ Show'} {nullAmtCount} records missing amount
                      </button>
                    )}
                  </div>

                  {showTable && (
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
                          {(showNullOnly ? validRecords.filter(r => r.amount == null) : validRecords.slice(0, 50)).map((r, i) => (
                            <tr key={i} style={r.amount == null ? { background: '#FEF3C7' } : {}}>
                              <td>{r.date || <span className="text-muted">—</span>}</td>
                              <td>{r.unit_number}</td>
                              <td style={{ textTransform: 'capitalize' }}>{r.unit_type}</td>
                              <td>{CAT_LABELS[r.category] || r.category}</td>
                              <td className="import-desc">{r.description}</td>
                              <td style={r.amount == null ? { color: '#EF4444', fontWeight: 600 } : {}}>
                                {r.amount != null ? '$' + Number(r.amount).toLocaleString('en-US', { minimumFractionDigits: 2 }) : 'MISSING'}
                              </td>
                            </tr>
                          ))}
                          {!showNullOnly && validRecords.length > 50 && (
                            <tr>
                              <td colSpan={6} style={{ textAlign: 'center', color: '#9CA3AF', fontStyle: 'italic' }}>
                                … and {validRecords.length - 50} more records
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
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
