import { useState, useMemo } from 'react'
import { useMaintenance, useMaintenanceShops, getDateRange } from '../../hooks/useMaintenance'
import { addDays, format } from '../../lib/dateUtils'
import AddMaintenanceModal from './AddMaintenanceModal'
import ImportCSVModal     from './ImportCSVModal'

// ── Constants ──────────────────────────────────────────────────────────────
const CAT_LABELS = {
  pm:             'PM',
  tire:           'Tire',
  other:          'Other',
  ac:             'AC',
  light:          'Light',
  batteries:      'Batteries',
  dot_inspection: 'DOT',
  steering_tires: 'Steer Tires',
}
const CAT_COLORS = {
  pm:             '#10B981',
  tire:           '#3B82F6',
  other:          '#6B7280',
  ac:             '#F59E0B',
  light:          '#8B5CF6',
  batteries:      '#EF4444',
  dot_inspection: '#06B6D4',
  steering_tires: '#F97316',
}
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const fmt$ = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })

// ── Stat Card ──────────────────────────────────────────────────────────────
function StatCard({ label, value, sub }) {
  return (
    <div className="maint-stat-card">
      <div className="maint-stat-label">{label}</div>
      <div className="maint-stat-value">{value}</div>
      {sub && <div className="maint-stat-sub">{sub}</div>}
    </div>
  )
}

// ── SVG Bar Chart ──────────────────────────────────────────────────────────
function CategoryChart({ records }) {
  const byCategory = useMemo(() => {
    const map = {}
    records.forEach(r => {
      const k = r.category || 'other'
      map[k] = (map[k] || 0) + (Number(r.amount) || 0)
    })
    return Object.entries(map)
      .map(([cat, total]) => ({ cat, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)
  }, [records])

  if (!byCategory.length) return null
  const max = byCategory[0].total
  const BAR_H = 22, GAP = 10, LEFT = 120, W = 440

  return (
    <div className="maint-chart-wrap">
      <div className="maint-chart-title">Spending by Category</div>
      <svg
        width="100%"
        viewBox={`0 0 ${LEFT + W + 80} ${byCategory.length * (BAR_H + GAP) + 10}`}
        style={{ display: 'block' }}
      >
        {byCategory.map(({ cat, total }, i) => {
          const y    = i * (BAR_H + GAP) + 5
          const barW = max > 0 ? (total / max) * W : 0
          const color = CAT_COLORS[cat] || '#6B7280'
          return (
            <g key={cat}>
              <text x={LEFT - 8} y={y + BAR_H / 2 + 5} textAnchor="end"
                fontSize={12} fill="#6B7280">{CAT_LABELS[cat] || cat}</text>
              <rect x={LEFT} y={y} width={barW} height={BAR_H} rx={3} fill={color} opacity={0.85} />
              <text x={LEFT + barW + 6} y={y + BAR_H / 2 + 5} fontSize={11} fill="#374151">
                {fmt$(total)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── Period Picker row ──────────────────────────────────────────────────────
function PeriodRow({ periodType, setPeriodType, year, setYear, month, setMonth, quarter, setQuarter }) {
  const years = []
  for (let y = 2022; y <= new Date().getFullYear() + 1; y++) years.push(y)

  return (
    <div className="maint-period-picker">
      <div className="maint-period-btns">
        {['all','year','quarter','month'].map(t => (
          <button
            key={t}
            className={`maint-period-btn${periodType === t ? ' active' : ''}`}
            onClick={() => setPeriodType(t)}
          >
            {t === 'all' ? 'All Time' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {periodType !== 'all' && (
        <select value={year} onChange={e => setYear(e.target.value)} className="maint-period-select">
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      )}

      {periodType === 'quarter' && (
        <div className="maint-period-btns">
          {[1,2,3,4].map(q => (
            <button
              key={q}
              className={`maint-period-btn${quarter === q ? ' active' : ''}`}
              onClick={() => setQuarter(q)}
            >Q{q}</button>
          ))}
        </div>
      )}

      {periodType === 'month' && (
        <select value={month} onChange={e => setMonth(Number(e.target.value))} className="maint-period-select">
          {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>
      )}
    </div>
  )
}

// ── Records Table ──────────────────────────────────────────────────────────
function RecordsTable({ records, loading, onEdit, onDelete }) {
  const total = records.reduce((s, r) => s + (Number(r.amount) || 0), 0)

  if (loading) return <div className="maint-empty">Loading…</div>
  if (!records.length) return <div className="maint-empty">No records found for the selected filters.</div>

  return (
    <div className="maint-table-wrap">
      <table className="maint-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Co.</th>
            <th>Unit</th>
            <th>Type</th>
            <th>Category</th>
            <th>Description</th>
            <th>Shop</th>
            <th>Invoice</th>
            <th style={{ textAlign: 'right' }}>Amount</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {records.map(r => (
            <tr key={r.id}>
              <td className="maint-date">{r.date || '—'}</td>
              <td>
                <span className={`co-badge co-${r.company}`}>
                  {r.company === 'carat' ? 'CE' : 'PF'}
                </span>
              </td>
              <td className="maint-unit">{r.unit_number}</td>
              <td style={{ textTransform: 'capitalize', color: '#6B7280', fontSize: 12 }}>{r.unit_type}</td>
              <td>
                <span className="maint-cat-badge" style={{
                  background: (CAT_COLORS[r.category] || '#6B7280') + '22',
                  color: CAT_COLORS[r.category] || '#6B7280'
                }}>
                  {CAT_LABELS[r.category] || r.category}
                </span>
              </td>
              <td className="maint-desc">{r.description || '—'}</td>
              <td className="maint-shop">{r.shop_name || '—'}</td>
              <td className="maint-invoice">{r.invoice || '—'}</td>
              <td className="maint-amount">{r.amount != null ? fmt$(r.amount) : '—'}</td>
              <td className="maint-actions">
                <button className="btn-icon" title="Edit"   onClick={() => onEdit(r)}>✎</button>
                <button className="btn-icon btn-icon-del" title="Delete" onClick={() => onDelete(r)}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={8} style={{ fontWeight: 600, textAlign: 'right', padding: '8px 12px', borderTop: '2px solid #E5E7EB' }}>
              Total ({records.length} records)
            </td>
            <td style={{ fontWeight: 700, textAlign: 'right', padding: '8px 12px', borderTop: '2px solid #E5E7EB' }}>
              {fmt$(total)}
            </td>
            <td style={{ borderTop: '2px solid #E5E7EB' }}></td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ── Spending Summary ───────────────────────────────────────────────────────
function SpendingTab({ records }) {
  const total        = records.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const tractors     = records.filter(r => r.unit_type?.toLowerCase() === 'tractor')
  const trailers     = records.filter(r => r.unit_type?.toLowerCase() === 'trailer')
  const tractorTotal = tractors.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const trailerTotal = trailers.reduce((s, r) => s + (Number(r.amount) || 0), 0)

  const byUnit = useMemo(() => {
    const map = {}
    records.forEach(r => {
      const k = r.unit_number + '|' + (r.unit_type || '')
      if (!map[k]) map[k] = { unit: r.unit_number, type: r.unit_type, total: 0, count: 0 }
      map[k].total += Number(r.amount) || 0
      map[k].count++
    })
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 20)
  }, [records])

  const byCat = useMemo(() => {
    const map = {}
    records.forEach(r => {
      const k = r.category || 'other'
      map[k] = (map[k] || 0) + (Number(r.amount) || 0)
    })
    return Object.entries(map)
      .map(([cat, total]) => ({ cat, total }))
      .sort((a, b) => b.total - a.total)
  }, [records])

  if (!records.length) return <div className="maint-empty">No records for the selected period.</div>

  return (
    <div className="maint-spending">
      <div className="maint-stat-row">
        <StatCard label="Total Spend"    value={fmt$(total)}        sub={`${records.length} records`} />
        <StatCard label="Tractors"       value={fmt$(tractorTotal)} sub={`${tractors.length} records`} />
        <StatCard label="Trailers"       value={fmt$(trailerTotal)} sub={`${trailers.length} records`} />
        <StatCard label="Avg per Record" value={fmt$(total / (records.length || 1))} />
      </div>

      <div className="maint-charts-row">
        <CategoryChart records={records} />

        <div className="maint-cat-table-wrap">
          <div className="maint-chart-title">By Category</div>
          <table className="maint-summary-table">
            <thead>
              <tr><th>Category</th><th>Records</th><th>Total</th><th>%</th></tr>
            </thead>
            <tbody>
              {byCat.map(({ cat, total: t }) => (
                <tr key={cat}>
                  <td>
                    <span className="maint-cat-badge" style={{
                      background: (CAT_COLORS[cat] || '#6B7280') + '22',
                      color: CAT_COLORS[cat] || '#6B7280'
                    }}>
                      {CAT_LABELS[cat] || cat}
                    </span>
                  </td>
                  <td>{records.filter(r => r.category === cat).length}</td>
                  <td style={{ fontWeight: 600 }}>{fmt$(t)}</td>
                  <td style={{ color: '#9CA3AF' }}>{total > 0 ? (t / total * 100).toFixed(1) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="maint-chart-title" style={{ marginTop: 28 }}>Top Units by Spend</div>
      <table className="maint-summary-table">
        <thead>
          <tr><th>Unit #</th><th>Type</th><th>Records</th><th>Total Spend</th></tr>
        </thead>
        <tbody>
          {byUnit.map(u => (
            <tr key={u.unit + u.type}>
              <td style={{ fontWeight: 600 }}>{u.unit}</td>
              <td style={{ textTransform: 'capitalize', color: '#6B7280' }}>{u.type}</td>
              <td>{u.count}</td>
              <td style={{ fontWeight: 600 }}>{fmt$(u.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Shops Tab ──────────────────────────────────────────────────────────────
function ShopsTab({ shops, onAddShop, onRemoveShop }) {
  const [newName, setNewName] = useState('')
  const [saving, setSaving]  = useState(false)

  async function handleAdd(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    try { await onAddShop(newName.trim()); setNewName('') }
    catch (e) { alert(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="maint-shops">
      <form className="maint-shop-add" onSubmit={handleAdd}>
        <input
          placeholder="Shop / vendor name"
          value={newName}
          onChange={e => setNewName(e.target.value)}
        />
        <button className="btn btn-primary" type="submit" disabled={saving || !newName.trim()}>
          {saving ? '…' : '+ Add Shop'}
        </button>
      </form>

      {!shops.length ? (
        <div className="maint-empty">No shops yet. Add vendor names above and select them when entering records.</div>
      ) : (
        <table className="maint-summary-table" style={{ maxWidth: 480 }}>
          <thead><tr><th>Shop Name</th><th></th></tr></thead>
          <tbody>
            {shops.map(s => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>
                  <button
                    className="btn-icon btn-icon-del"
                    onClick={() => { if (window.confirm(`Delete shop "${s.name}"?`)) onRemoveShop(s.id) }}
                  >✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Weekly Tab ─────────────────────────────────────────────────────────────
function WeeklyTab({ records }) {
  const byWeek = useMemo(() => {
    const map = {}
    records.forEach(r => {
      if (!r.date) return
      // Find Monday of this record's week
      const [y, m, d] = r.date.split('-').map(Number)
      const dt  = new Date(y, m - 1, d)
      const dow = dt.getDay()                      // 0=Sun, 1=Mon…
      const diff = dow === 0 ? -6 : 1 - dow
      dt.setDate(dt.getDate() + diff)
      const weekKey = format(dt)

      if (!map[weekKey]) {
        map[weekKey] = {
          weekStart: weekKey,
          weekEnd:   format(addDays(dt, 6)),
          records:   [],
          total:          0,
          tractorTotal:   0,
          trailerTotal:   0,
          catMap:         {},
        }
      }
      const w = map[weekKey]
      const amt = Number(r.amount) || 0
      w.records.push(r)
      w.total         += amt
      if (r.unit_type?.toLowerCase() === 'tractor') w.tractorTotal += amt
      if (r.unit_type?.toLowerCase() === 'trailer') w.trailerTotal += amt
      const cat = r.category || 'other'
      w.catMap[cat] = (w.catMap[cat] || 0) + amt
    })
    return Object.values(map).sort((a, b) => b.weekStart.localeCompare(a.weekStart))
  }, [records])

  if (!records.length) return <div className="maint-empty">No records for the selected period.</div>

  const grandTotal        = byWeek.reduce((s, w) => s + w.total, 0)
  const grandTractor      = byWeek.reduce((s, w) => s + w.tractorTotal, 0)
  const grandTrailer      = byWeek.reduce((s, w) => s + w.trailerTotal, 0)
  const grandRecords      = byWeek.reduce((s, w) => s + w.records.length, 0)

  function topCat(w) {
    const entries = Object.entries(w.catMap)
    if (!entries.length) return null
    const [cat] = entries.sort((a, b) => b[1] - a[1])[0]
    return cat
  }

  function fmtWeek(weekStart, weekEnd) {
    const fmt = d => {
      const [y, m, day] = d.split('-').map(Number)
      return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
    return `${fmt(weekStart)} – ${fmt(weekEnd)}`
  }

  return (
    <div className="maint-table-wrap">
      <table className="maint-table">
        <thead>
          <tr>
            <th>Week</th>
            <th style={{ textAlign: 'center' }}>Records</th>
            <th style={{ textAlign: 'right' }}>Tractors</th>
            <th style={{ textAlign: 'right' }}>Trailers</th>
            <th>Top Category</th>
            <th style={{ textAlign: 'right' }}>Week Total</th>
          </tr>
        </thead>
        <tbody>
          {byWeek.map(w => {
            const cat = topCat(w)
            return (
              <tr key={w.weekStart}>
                <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtWeek(w.weekStart, w.weekEnd)}</td>
                <td style={{ textAlign: 'center', color: '#6B7280' }}>{w.records.length}</td>
                <td style={{ textAlign: 'right', color: '#6B7280' }}>
                  {w.tractorTotal > 0 ? fmt$(w.tractorTotal) : <span style={{ color: '#D1D5DB' }}>—</span>}
                </td>
                <td style={{ textAlign: 'right', color: '#6B7280' }}>
                  {w.trailerTotal > 0 ? fmt$(w.trailerTotal) : <span style={{ color: '#D1D5DB' }}>—</span>}
                </td>
                <td>
                  {cat ? (
                    <span className="maint-cat-badge" style={{
                      background: (CAT_COLORS[cat] || '#6B7280') + '22',
                      color: CAT_COLORS[cat] || '#6B7280',
                    }}>
                      {CAT_LABELS[cat] || cat}
                    </span>
                  ) : '—'}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt$(w.total)}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ fontWeight: 700, padding: '8px 12px', borderTop: '2px solid #E5E7EB' }}>
              Total ({byWeek.length} week{byWeek.length !== 1 ? 's' : ''})
            </td>
            <td style={{ textAlign: 'center', fontWeight: 700, padding: '8px 12px', borderTop: '2px solid #E5E7EB' }}>
              {grandRecords}
            </td>
            <td style={{ textAlign: 'right', fontWeight: 700, padding: '8px 12px', borderTop: '2px solid #E5E7EB' }}>
              {fmt$(grandTractor)}
            </td>
            <td style={{ textAlign: 'right', fontWeight: 700, padding: '8px 12px', borderTop: '2px solid #E5E7EB' }}>
              {fmt$(grandTrailer)}
            </td>
            <td style={{ borderTop: '2px solid #E5E7EB' }} />
            <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 15, padding: '8px 12px', borderTop: '2px solid #E5E7EB' }}>
              {fmt$(grandTotal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ── Main View ──────────────────────────────────────────────────────────────
export default function MaintenanceView({ onClose }) {
  const [periodType, setPeriodType] = useState('all')
  const [year,       setYear]       = useState(String(new Date().getFullYear()))
  const [month,      setMonth]      = useState(new Date().getMonth() + 1)
  const [quarter,    setQuarter]    = useState(Math.ceil((new Date().getMonth() + 1) / 3))
  const [company,    setCompany]    = useState('all')
  const [unitType,   setUnitType]   = useState('all')
  const [category,   setCategory]   = useState('all')
  const [unitSearch, setUnitSearch] = useState('')
  const [textSearch, setTextSearch] = useState('')
  const [tab,        setTab]        = useState('records')
  const [editRec,    setEditRec]    = useState(null)
  const [addOpen,    setAddOpen]    = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const { dateFrom, dateTo } = getDateRange(periodType, year, month, quarter)
  const filters = {
    company:     company !== 'all' ? company : null,
    unit_type:   unitType !== 'all' ? unitType : null,
    category:    category !== 'all' ? category : null,
    unit_number: unitSearch || null,
    search:      textSearch || null,
    dateFrom,
    dateTo,
  }

  const { records, loading, addRecord, updateRecord, removeRecord, bulkInsert } = useMaintenance(filters)
  const { shops, addShop, removeShop } = useMaintenanceShops()

  async function handleSave(data) {
    if (editRec?.id) await updateRecord(editRec.id, data)
    else             await addRecord(data)
    setEditRec(null)
    setAddOpen(false)
  }

  async function handleDelete(r) {
    if (!window.confirm(`Delete record for unit ${r.unit_number} on ${r.date}?`)) return
    await removeRecord(r.id)
  }

  return (
    <div className="acct-wrap">

      {/* ── Top bar — same pattern as AccountingView ── */}
      <div className="topbar">
        <div className="topbar-left">
          <button className="btn btn-ghost" onClick={onClose} style={{ marginRight: 8 }}>
            ← Board
          </button>
          <div>
            <div className="app-title">Maintenance</div>
            <div className="app-subtitle">Equipment Records</div>
          </div>
        </div>

        <div className="topbar-center">
          <div className="view-toggle">
            {[['records','Records'],['spending','Spending'],['weekly','Weekly'],['shops','Shops']].map(([v,l]) => (
              <button key={v} className={tab === v ? 'active' : ''} onClick={() => setTab(v)}>{l}</button>
            ))}
          </div>
        </div>

        <div className="topbar-right">
          <button className="btn btn-ghost" onClick={() => setImportOpen(true)}>↑ Import CSV</button>
          <button className="btn btn-primary" onClick={() => { setEditRec(null); setAddOpen(true) }}>+ Add Record</button>
        </div>
      </div>

      {/* ── Filters bar ── */}
      <div className="maint-filters">
        <div className="maint-filter-row">
          <PeriodRow
            periodType={periodType} setPeriodType={setPeriodType}
            year={year}       setYear={setYear}
            month={month}     setMonth={setMonth}
            quarter={quarter} setQuarter={setQuarter}
          />

          <div style={{ width: 1, height: 24, background: '#E5E7EB', margin: '0 4px' }} />

          {/* Company tabs */}
          <div className="company-tabs">
            {[['all','All'],['carat','Carat'],['pro_freight','Pro Freight']].map(([v,l]) => (
              <button key={v} className={`company-tab${company === v ? ' active' : ''}`} onClick={() => setCompany(v)}>
                {l}
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 24, background: '#E5E7EB', margin: '0 4px' }} />

          <select value={unitType} onChange={e => setUnitType(e.target.value)} className="maint-filter-select">
            <option value="all">All Units</option>
            <option value="tractor">Tractors</option>
            <option value="trailer">Trailers</option>
          </select>

          <select value={category} onChange={e => setCategory(e.target.value)} className="maint-filter-select">
            <option value="all">All Categories</option>
            {Object.entries(CAT_LABELS).map(([v,l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>

          <input
            className="maint-filter-input"
            placeholder="Unit #"
            value={unitSearch}
            onChange={e => setUnitSearch(e.target.value)}
          />

          <input
            className="maint-filter-input"
            placeholder="Search description…"
            value={textSearch}
            onChange={e => setTextSearch(e.target.value)}
            style={{ minWidth: 180 }}
          />
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="acct-body">
        {tab === 'records'  && (
          <RecordsTable
            records={records}
            loading={loading}
            onEdit={r => setEditRec(r)}
            onDelete={handleDelete}
          />
        )}
        {tab === 'spending' && <SpendingTab records={records} />}
        {tab === 'weekly'   && <WeeklyTab  records={records} />}
        {tab === 'shops'    && <ShopsTab shops={shops} onAddShop={addShop} onRemoveShop={removeShop} />}
      </div>

      {/* ── Modals ── */}
      {(addOpen || editRec) && (
        <AddMaintenanceModal
          record={editRec}
          shops={shops}
          onSave={handleSave}
          onAddShop={addShop}
          onClose={() => { setAddOpen(false); setEditRec(null) }}
        />
      )}

      {importOpen && (
        <ImportCSVModal
          onImport={async rows => { await bulkInsert(rows) }}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  )
}
