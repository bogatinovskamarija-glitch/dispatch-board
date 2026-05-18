import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { format } from '../lib/dateUtils'

const COLS = [
  'date','company','status','truck_number','trailer_number','equipment_type',
  'driver_name','phone','pickup_location','pickup_date','delivery_location','zip',
  'delivery_date','delivery_appt','load_number','broker','total_miles','price','safety_notes','notes',
]

function toCSV(loads) {
  const rows = [COLS.join(',')]
  for (const l of loads) {
    rows.push(COLS.map(c => {
      const v = l[c] ?? ''
      return typeof v === 'string' && v.includes(',') ? `"${v}"` : v
    }).join(','))
  }
  return rows.join('\n')
}

function download(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function ExportModal({ onClose }) {
  const today = format(new Date())
  const [start, setStart]     = useState(today)
  const [end, setEnd]         = useState(today)
  const [company, setCompany] = useState('all')
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState(null)

  async function handleExport() {
    if (!start || !end) { setErr('Please select both dates.'); return }
    if (start > end)    { setErr('Start date must be before end date.'); return }
    setLoading(true)
    setErr(null)
    try {
      let q = supabase.from('loads')
        .select('*')
        .lte('date', end)
        .or(`delivery_date.is.null,delivery_date.gte.${start}`)
        .order('date')
        .order('company')
        .order('truck_number')
      if (company !== 'all') q = q.eq('company', company)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      const csv = toCSV(data ?? [])
      const label = start === end ? start : `${start}_to_${end}`
      download(csv, `loads-${label}.csv`)
      onClose()
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <div className="modal-title">Export CSV</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="form-section">
            <div className="form-grid">
              <div className="form-group">
                <label>Start Date</label>
                <input type="date" value={start} onChange={e => setStart(e.target.value)} />
              </div>
              <div className="form-group">
                <label>End Date</label>
                <input type="date" value={end} onChange={e => setEnd(e.target.value)} />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 12 }}>
              <label>Company</label>
              <select value={company} onChange={e => setCompany(e.target.value)}>
                <option value="all">All Companies</option>
                <option value="carat">Carat Expedited</option>
                <option value="pro_freight">Pro Freight Transportation</option>
              </select>
            </div>
          </div>

          {err && <div style={{ color: '#B91C1C', fontSize: 12 }}>{err}</div>}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleExport} disabled={loading}>
            {loading ? 'Exporting…' : '↓ Download CSV'}
          </button>
        </div>
      </div>
    </div>
  )
}
