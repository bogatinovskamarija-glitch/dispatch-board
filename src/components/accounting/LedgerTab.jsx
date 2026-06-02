import { useState, useMemo } from 'react'
import { useLedgerEntries, useOutstandingLedgerEntries, addLedgerEntry, updateLedgerEntry, deleteLedgerEntry, EXPENSE_CONFIG, EXPENSE_GROUPS } from '../../hooks/useLedger'
import { useDriverProfiles } from '../../hooks/useDriverProfiles'
import { getThursdayWeek } from '../../hooks/useWeeklySummary'

const fmt = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })
const isoDate = d => d.toISOString().split('T')[0]

// Week runs Thu–Wed to match company accounting period
function getWeekBounds(offset = 0) {
  const base = getThursdayWeek()
  // Shift by offset weeks from the current Thu anchor
  const anchor = new Date(base.start + 'T12:00:00')
  anchor.setDate(anchor.getDate() + offset * 7)
  const { start, end } = getThursdayWeek(anchor.toISOString().split('T')[0])
  return { from: start, to: end }
}

function fmtRange(from, to) {
  const opts = { month: 'short', day: 'numeric' }
  const a = new Date(from + 'T00:00:00').toLocaleDateString('en-US', opts)
  const b = new Date(to   + 'T00:00:00').toLocaleDateString('en-US', opts)
  return `${a} – ${b}`
}

function EffectBadge({ type }) {
  const cfg = EXPENSE_CONFIG[type]
  if (!cfg) return null
  const both = cfg.deduction && cfg.addition
  if (both)           return <span className="ledger-badge ledger-badge-both">± Both</span>
  if (cfg.deduction)  return <span className="ledger-badge ledger-badge-ded">− Deduction</span>
  if (cfg.addition)   return <span className="ledger-badge ledger-badge-add">+ Addition</span>
  return null
}

const BLANK_ENTRY = { date: isoDate(new Date()), driver_name: '', company: 'carat', type: 'cash_advance', description: '', amount: '' }

export default function LedgerTab({ company }) {
  const [weekOffset,    setWeekOffset]    = useState(0)
  const [driverFilter,  setDriverFilter]  = useState('all')
  const [addOpen,       setAddOpen]       = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [newEntry,      setNewEntry]      = useState({ ...BLANK_ENTRY })
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [editId,        setEditId]        = useState(null)
  const [editData,      setEditData]      = useState({})

  const week = getWeekBounds(weekOffset)
  const { entries, loading, dbMissing, refetch } = useLedgerEntries(week.from, week.to, company, driverFilter === 'all' ? '' : driverFilter)
  const { entries: outstanding } = useOutstandingLedgerEntries(week.from, company)
  const { profiles } = useDriverProfiles()

  const driverNames = useMemo(() =>
    [...new Set(profiles.map(p => p.driver_name))].sort()
  , [profiles])

  function setField(k, v) {
    setNewEntry(prev => {
      const next = { ...prev, [k]: v }
      // Auto-set company from driver profile
      if (k === 'driver_name') {
        const profile = profiles.find(p => p.driver_name === v)
        if (profile?.company) next.company = profile.company
      }
      return next
    })
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!newEntry.driver_name || !newEntry.amount || !newEntry.date) return
    setSaving(true)
    try {
      await addLedgerEntry({
        ...newEntry,
        amount: Number(newEntry.amount),
      })
      await refetch()
      setNewEntry({ ...BLANK_ENTRY })
      setAddOpen(false)
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    try {
      await deleteLedgerEntry(id)
      await refetch()
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setDeleteConfirm(null)
      if (editId === id) setEditId(null)
    }
  }

  function startEdit(e) {
    setEditId(e.id)
    setEditData({
      date:        e.date,
      driver_name: e.driver_name,
      type:        e.type,
      description: e.description,
      amount:      String(e.amount),
    })
  }

  async function saveEdit() {
    if (!editData.amount) return
    setSaving(true)
    try {
      await updateLedgerEntry(editId, { ...editData, amount: Number(editData.amount) })
      await refetch()
      setEditId(null)
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Per-driver summary for the displayed period
  const driverSummary = useMemo(() => {
    const map = {}
    for (const e of entries) {
      const cfg = EXPENSE_CONFIG[e.type]
      if (!cfg) continue
      if (!map[e.driver_name]) map[e.driver_name] = { deductions: 0, additions: 0 }
      if (cfg.deduction) map[e.driver_name].deductions += Number(e.amount)
      if (cfg.addition)  map[e.driver_name].additions  += Number(e.amount)
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [entries])

  // ── DB missing banner ──────────────────────────────────────────────────
  if (dbMissing) return (
    <div className="acct-tab-content">
      <div style={{ padding: 24, background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, maxWidth: 600 }}>
        <div style={{ fontWeight: 700, color: '#DC2626', marginBottom: 8 }}>⚠ Ledger table not set up yet</div>
        <div style={{ fontSize: 13, color: '#374151', marginBottom: 12, lineHeight: 1.6 }}>
          Run the following SQL in your Supabase dashboard (SQL Editor → New query):
        </div>
        <pre style={{ background: '#1E1E1E', color: '#D4D4D4', padding: 14, borderRadius: 8, fontSize: 11, overflowX: 'auto', lineHeight: 1.6 }}>{
`CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  date               DATE NOT NULL,
  driver_name        TEXT NOT NULL,
  driver_clickup_id  TEXT,
  company            TEXT NOT NULL DEFAULT 'carat',
  type               TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  amount             NUMERIC(10,2) NOT NULL DEFAULT 0,
  applied_paystub_id UUID,
  applied_at         TIMESTAMPTZ
);
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ledger_all" ON public.ledger_entries
  FOR ALL USING (true) WITH CHECK (true);`
        }</pre>
        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={refetch}>↻ Retry</button>
      </div>
    </div>
  )

  return (
    <div className="acct-tab-content">

      {/* ── Header bar ──────────────────────────────────────────────── */}
      <div className="ledger-topbar">
        <div className="ledger-week-nav">
          <button className="btn btn-ghost btn-xs" onClick={() => setWeekOffset(o => o - 1)}>‹</button>
          <span className="ledger-week-label">{fmtRange(week.from, week.to)}</span>
          <button className="btn btn-ghost btn-xs" onClick={() => setWeekOffset(o => o + 1)}>›</button>
          {weekOffset !== 0 && (
            <button className="btn btn-ghost btn-xs" onClick={() => setWeekOffset(0)} style={{ marginLeft: 4, fontSize: 11 }}>
              This Week
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            className="form-input"
            value={driverFilter}
            onChange={e => setDriverFilter(e.target.value)}
            style={{ fontSize: 12, padding: '4px 8px', width: 160 }}
          >
            <option value="all">All Drivers</option>
            {driverNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => setAddOpen(o => !o)}>
            {addOpen ? '✕ Cancel' : '+ Add Entry'}
          </button>
        </div>
      </div>

      {/* ── Add Entry form ───────────────────────────────────────────── */}
      {addOpen && (
        <form onSubmit={handleAdd} className="ledger-add-form">
          <div className="ledger-add-row">
            <div className="ledger-add-field">
              <label>Date</label>
              <input type="date" value={newEntry.date} onChange={e => setField('date', e.target.value)} required />
            </div>
            <div className="ledger-add-field" style={{ flex: 2 }}>
              <label>Driver</label>
              <select value={newEntry.driver_name} onChange={e => setField('driver_name', e.target.value)} required>
                <option value="">Select driver…</option>
                {driverNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="ledger-add-field" style={{ flex: 2 }}>
              <label>Type</label>
              <select value={newEntry.type} onChange={e => setField('type', e.target.value)}>
                {EXPENSE_GROUPS.map(g => (
                  <optgroup key={g.label} label={g.label}>
                    {g.types.map(t => (
                      <option key={t} value={t}>{EXPENSE_CONFIG[t].label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="ledger-add-field" style={{ flex: 3 }}>
              <label>Description (optional)</label>
              <input
                type="text"
                placeholder="e.g. weekend advance, I-90 toll"
                value={newEntry.description}
                onChange={e => setField('description', e.target.value)}
              />
            </div>
            <div className="ledger-add-field" style={{ maxWidth: 110 }}>
              <label>Amount ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={newEntry.amount}
                onChange={e => setField('amount', e.target.value)}
                required
              />
            </div>
            <div className="ledger-add-field" style={{ maxWidth: 80, alignSelf: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%' }}>
                {saving ? '…' : 'Save'}
              </button>
            </div>
          </div>

          {/* Effect preview */}
          {newEntry.type && newEntry.amount && (
            <div className="ledger-add-preview">
              <span style={{ fontSize: 12, color: '#6B7280' }}>Paystub effect: </span>
              <EffectBadge type={newEntry.type} />
              {EXPENSE_CONFIG[newEntry.type]?.deduction && (
                <span style={{ fontSize: 12, color: '#DC2626' }}>
                  {' '}Deduction: {fmt(newEntry.amount)}
                </span>
              )}
              {EXPENSE_CONFIG[newEntry.type]?.addition && (
                <span style={{ fontSize: 12, color: '#059669' }}>
                  {' '}Addition: {fmt(newEntry.amount)}
                </span>
              )}
            </div>
          )}
        </form>
      )}

      {/* ── Outstanding banner — unapplied entries from previous weeks ── */}
      {outstanding.length > 0 && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
          <div style={{ fontWeight: 700, color: '#92400E', fontSize: 12, marginBottom: 6 }}>
            ⚠ {outstanding.length} unapplied entr{outstanding.length === 1 ? 'y' : 'ies'} from previous weeks
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
            {outstanding.map(e => (
              <span key={e.id} style={{ fontSize: 11, color: '#92400E' }}>
                {e.driver_name} · {EXPENSE_CONFIG[e.type]?.label || e.type} · ${Number(e.amount).toFixed(2)} · <span style={{ color: '#9CA3AF' }}>{e.date}</span>
              </span>
            ))}
          </div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>These will appear as checkboxes when generating that driver's next paystub.</div>
        </div>
      )}

      {/* ── Entries table ────────────────────────────────────────────── */}
      {loading ? (
        <div className="acct-empty">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="acct-empty">
          No entries for this week.{' '}
          <button className="btn btn-ghost btn-xs" onClick={() => setAddOpen(true)}>+ Add first entry</button>
        </div>
      ) : (
        <table className="acct-table ledger-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Driver</th>
              <th>Type</th>
              <th>Description</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th>Paystub Effect</th>
              <th>Status</th>
              <th style={{ width: 36 }}></th>
            </tr>
          </thead>
          <tbody>
            {entries.map(e => {
              const cfg     = EXPENSE_CONFIG[e.type]
              const isEditing = editId === e.id
              if (isEditing) return (
                <tr key={e.id} style={{ background: '#F0F9FF' }}>
                  <td>
                    <input type="date" value={editData.date}
                      onChange={ev => setEditData(d => ({ ...d, date: ev.target.value }))}
                      style={{ fontSize: 12, padding: '2px 6px', border: '1px solid #7DD3FC', borderRadius: 4, width: 120 }} />
                  </td>
                  <td>
                    <select value={editData.driver_name}
                      onChange={ev => setEditData(d => ({ ...d, driver_name: ev.target.value }))}
                      style={{ fontSize: 12, padding: '2px 6px', border: '1px solid #7DD3FC', borderRadius: 4 }}>
                      {profiles.map(p => <option key={p.driver_name} value={p.driver_name}>{p.driver_name}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={editData.type}
                      onChange={ev => setEditData(d => ({ ...d, type: ev.target.value }))}
                      style={{ fontSize: 12, padding: '2px 6px', border: '1px solid #7DD3FC', borderRadius: 4 }}>
                      {EXPENSE_GROUPS.map(g => (
                        <optgroup key={g.label} label={g.label}>
                          {g.types.map(t => <option key={t} value={t}>{EXPENSE_CONFIG[t].label}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input value={editData.description}
                      onChange={ev => setEditData(d => ({ ...d, description: ev.target.value }))}
                      placeholder="Description"
                      style={{ fontSize: 12, padding: '2px 6px', border: '1px solid #7DD3FC', borderRadius: 4, width: '100%' }} />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <input type="number" step="0.01" value={editData.amount}
                      onChange={ev => setEditData(d => ({ ...d, amount: ev.target.value }))}
                      style={{ fontSize: 12, padding: '2px 6px', border: '1px solid #7DD3FC', borderRadius: 4, width: 80, textAlign: 'right' }} />
                  </td>
                  <td><EffectBadge type={editData.type} /></td>
                  <td><span style={{ fontSize: 11, color: '#0284C7' }}>Editing…</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-primary btn-xs" onClick={saveEdit} disabled={saving}>✓</button>
                      <button className="btn btn-ghost btn-xs" onClick={() => setEditId(null)}>✕</button>
                    </div>
                  </td>
                </tr>
              )
              return (
                <tr key={e.id} style={{ opacity: e.applied_at ? 0.55 : 1 }}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: '#6B7280' }}>
                    {new Date(e.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
                  </td>
                  <td style={{ fontWeight: 600 }}>{e.driver_name}</td>
                  <td>
                    {cfg && (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, color: cfg.color, background: cfg.bg, whiteSpace: 'nowrap' }}>
                        {cfg.label}
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: '#6B7280' }}>{e.description || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 13 }}>{fmt(e.amount)}</td>
                  <td><EffectBadge type={e.type} /></td>
                  <td>
                    {e.applied_at
                      ? <span style={{ fontSize: 11, color: '#9CA3AF', background: '#F3F4F6', padding: '2px 7px', borderRadius: 8 }}>✓ Applied</span>
                      : <span style={{ fontSize: 11, color: '#D97706' }}>Pending</span>
                    }
                  </td>
                  <td>
                    {!e.applied_at && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        {deleteConfirm === e.id ? (
                          <>
                            <button className="btn btn-ghost btn-xs" style={{ color: '#DC2626' }} onClick={() => handleDelete(e.id)}>✓</button>
                            <button className="btn btn-ghost btn-xs" onClick={() => setDeleteConfirm(null)}>✕</button>
                          </>
                        ) : (
                          <>
                            <button className="btn btn-ghost btn-xs" style={{ color: '#4F46E5' }} onClick={() => startEdit(e)} title="Edit">✎</button>
                            <button className="btn btn-ghost btn-xs" style={{ color: '#9CA3AF' }} onClick={() => setDeleteConfirm(e.id)} title="Delete">✕</button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {/* ── Per-driver summary ───────────────────────────────────────── */}
      {driverSummary.length > 0 && (
        <div className="ledger-summary">
          <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
            Weekly Summary — {fmtRange(week.from, week.to)}
          </div>
          <div className="ledger-summary-grid">
            {driverSummary.map(([name, sums]) => (
              <div key={name} className="ledger-summary-card">
                <div className="ledger-summary-driver">{name}</div>
                <div className="ledger-summary-row">
                  <span style={{ color: '#DC2626' }}>Deductions</span>
                  <strong style={{ color: '#DC2626' }}>{sums.deductions > 0 ? fmt(sums.deductions) : '—'}</strong>
                </div>
                <div className="ledger-summary-row">
                  <span style={{ color: '#059669' }}>Additions</span>
                  <strong style={{ color: '#059669' }}>{sums.additions > 0 ? fmt(sums.additions) : '—'}</strong>
                </div>
                {sums.deductions > 0 && sums.additions > 0 && (
                  <div className="ledger-summary-row" style={{ borderTop: '1px solid #E5E7EB', marginTop: 4, paddingTop: 4 }}>
                    <span style={{ color: '#374151' }}>Net</span>
                    <strong style={{
                      color: (sums.additions - sums.deductions) >= 0 ? '#059669' : '#DC2626'
                    }}>{fmt(sums.additions - sums.deductions)}</strong>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
