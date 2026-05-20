import { useState, useEffect, useMemo } from 'react'
import { useMotiveDrivers, useMotiveViolations } from '../../hooks/useMotive'
import { supabase } from '../../lib/supabase'

// ── Helpers ───────────────────────────────────────────────────────────────────
function secToHM(sec) {
  if (sec == null || sec < 0) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return `${h}h ${m.toString().padStart(2, '0')}m`
}

function dutyLabel(status) {
  switch (status) {
    case 'driving':             return { label: 'Driving',        color: '#2563EB', bg: '#EFF6FF' }
    case 'on_duty_not_driving': return { label: 'On Duty',        color: '#D97706', bg: '#FFFBEB' }
    case 'off_duty':            return { label: 'Off Duty',       color: '#6B7280', bg: '#F9FAFB' }
    case 'sleeper_berth':       return { label: 'Sleeper',        color: '#7C3AED', bg: '#F5F3FF' }
    case 'yard_moves':          return { label: 'Yard Moves',     color: '#0891B2', bg: '#ECFEFF' }
    case 'personal_conveyance': return { label: 'Personal Conv.', color: '#059669', bg: '#ECFDF5' }
    default:                    return { label: status ?? 'Unknown', color: '#9CA3AF', bg: '#F9FAFB' }
  }
}

function hosBarColor(remainingSec) {
  if (remainingSec == null) return '#E5E7EB'
  const hrs = remainingSec / 3600
  if (hrs <= 1) return '#DC2626'
  if (hrs <= 2) return '#F59E0B'
  return '#059669'
}

function HosBar({ remainingSec, totalSec }) {
  const pct = Math.min(100, Math.max(0, (remainingSec / totalSec) * 100))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: '#E5E7EB', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: hosBarColor(remainingSec), borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, width: 54, color: hosBarColor(remainingSec), fontWeight: 600 }}>
        {secToHM(remainingSec)}
      </span>
    </div>
  )
}

function StatusBadge({ status }) {
  const { label, color, bg } = dutyLabel(status)
  return (
    <span style={{ padding: '2px 9px', borderRadius: 12, fontSize: 11, fontWeight: 700, color, background: bg, whiteSpace: 'nowrap', display: 'inline-block' }}>
      {label}
    </span>
  )
}

function timeAgo(isoStr) {
  if (!isoStr) return '—'
  const diff = Math.floor((Date.now() - new Date(isoStr)) / 1000)
  if (diff < 60)    return `${diff}s ago`
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const CO_LABEL = { carat: 'Carat', pro_freight: 'Pro Freight' }

// ── Fetch today's active loads from the dispatcher board ─────────────────────
async function fetchActiveLoads(company) {
  const today = new Date().toISOString().split('T')[0]
  let q = supabase
    .from('loads')
    .select('id, driver_name, truck_number, load_number, status, company, pickup_date, delivery_date, date')
    .lte('date', today)
    .or(`delivery_date.is.null,delivery_date.gte.${today}`)
    .in('status', ['covered', 'at_pickup', 'at_delivery', 'prebooked'])
  if (company && company !== 'all') q = q.eq('company', company)
  const { data } = await q
  return data ?? []
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SafetyView({ onClose }) {
  const [company,     setCompany]     = useState('all')
  const [search,      setSearch]      = useState('')
  const [activeLoads, setActiveLoads] = useState([])

  const { drivers, loading: dLoading, error: dError, lastSync, refresh: refreshDrivers } = useMotiveDrivers(company)
  const { violations, loading: vLoading, error: vError, refresh: refreshViol } = useMotiveViolations(company)

  // Fetch active loads whenever company changes
  useEffect(() => {
    fetchActiveLoads(company).then(setActiveLoads)
  }, [company])

  function refreshAll() { refreshDrivers(); refreshViol(); fetchActiveLoads(company).then(setActiveLoads) }

  // ── Parse HOS from Motive user objects ────────────────────────────────────
  const rows = useMemo(() => drivers.map(u => {
    // HOS data comes from the merged _hos field (today's /hos_logs entry)
    // Fall back to current_driver_status on the user object if present
    const hos = u._hos ?? u.current_driver_status ?? u.duty_status ?? {}

    const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ') ||
                     u.name || u.username || `Driver ${u.id}`

    const updatedAt = hos.start_time ?? hos.updated_at ?? hos.recorded_at ?? u.updated_at ?? null
    const staleHours = updatedAt ? (Date.now() - new Date(updatedAt)) / 3600000 : null

    // Motive v1 /hos_logs fields for remaining time
    const toSec = (val) => val == null ? null : val > 1000 ? val : val * 3600  // handle seconds OR hours
    const driveLeft = toSec(
      hos.drive_remaining     ?? hos.drive_remaining_sec ??
      hos.driving_remaining   ?? hos.shift_drive_remaining ?? null
    )
    const shiftLeft = toSec(
      hos.shift_remaining     ?? hos.shift_remaining_sec ??
      hos.on_duty_remaining   ?? null
    )
    const cycleLeft = toSec(
      hos.cycle_remaining     ?? hos.cycle_remaining_sec ??
      hos.recap_hours         ?? null
    )

    return {
      id:          u.id,
      name:        fullName,
      nameLower:   fullName.toLowerCase(),
      company:     u._company,
      status:      hos.duty_status ?? hos.status ?? 'off_duty',
      driveLeft,
      shiftLeft,
      cycleLeft,
      inViolation: hos.is_in_violation ?? false,
      updatedAt,
      staleHours,
      eldSerial:   u.eld_device?.serial_number ?? u.current_vehicle?.number ?? null,
    }
  }), [drivers])

  // ── Cross-reference: active loads vs Motive data ──────────────────────────
  const loadAlerts = useMemo(() => {
    if (!activeLoads.length) return []
    const motiveNames = new Set(rows.map(r => r.nameLower))

    return activeLoads
      .filter(l => {
        if (!l.driver_name) return false
        const driverLower = l.driver_name.toLowerCase()

        // Check 1: driver has a load but isn't in Motive at all
        if (!motiveNames.has(driverLower)) return true

        // Check 2: driver is in Motive but log is stale (> 4 hours) or shows off_duty
        const motiveRow = rows.find(r => r.nameLower === driverLower)
        if (!motiveRow) return true
        if (motiveRow.staleHours != null && motiveRow.staleHours > 4) return true

        return false
      })
      .map(l => {
        const motiveRow = rows.find(r => r.nameLower === l.driver_name?.toLowerCase())
        let reason = 'No Motive log found'
        if (motiveRow) {
          if (motiveRow.staleHours != null && motiveRow.staleHours > 4) {
            reason = `ELD not updated for ${Math.floor(motiveRow.staleHours)}h`
          }
        }
        return { ...l, reason }
      })
  }, [activeLoads, rows])

  // ── Filtered + sorted driver rows ─────────────────────────────────────────
  const filtered = useMemo(() => rows
    .filter(r => !search || r.nameLower.includes(search.toLowerCase()))
    .sort((a, b) => {
      if (a.inViolation !== b.inViolation) return a.inViolation ? -1 : 1
      const order = { driving: 0, on_duty_not_driving: 1, sleeper_berth: 2, off_duty: 3 }
      return (order[a.status] ?? 4) - (order[b.status] ?? 4)
    }), [rows, search])

  // ── Summary counts ─────────────────────────────────────────────────────────
  const driving   = rows.filter(r => r.status === 'driving').length
  const onDuty    = rows.filter(r => r.status === 'on_duty_not_driving').length
  const offDuty   = rows.filter(r => r.status === 'off_duty' || r.status === 'sleeper_berth').length
  const inViol    = rows.filter(r => r.inViolation).length
  const nearLimit = rows.filter(r => r.driveLeft != null && r.driveLeft < 2 * 3600 && !r.inViolation).length

  const loading = dLoading || vLoading

  return (
    <div className="acct-wrap">

      {/* ── Top bar ── */}
      <div className="topbar">
        <div className="topbar-left">
          <button className="btn btn-ghost" onClick={onClose} style={{ marginRight: 8 }}>← Board</button>
          <div>
            <div className="app-title">Safety</div>
            <div className="app-subtitle">Driver HOS &amp; Compliance · via Motive</div>
          </div>
        </div>
        <div className="topbar-center">
          <div className="company-tabs">
            {[['all','All'],['carat','Carat'],['pro_freight','Pro Freight']].map(([v, l]) => (
              <button key={v} className={`company-tab${company === v ? ' active' : ''}`} onClick={() => setCompany(v)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="topbar-right" style={{ gap: 10 }}>
          {lastSync && <span style={{ fontSize: 11, color: '#9CA3AF' }}>Synced {timeAgo(lastSync.toISOString())}</span>}
          <button className="btn btn-ghost" onClick={refreshAll} disabled={loading}>
            {loading ? 'Loading…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      <div className="summary-wrap">

        {/* ── Error banner ── */}
        {(dError || vError) && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: '#DC2626', fontSize: 13 }}>
            <strong>⚠ Motive API error:</strong> {dError || vError}
            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
              Edge Function must be deployed in Supabase and secrets set. See setup instructions.
            </div>
          </div>
        )}

        {/* ── Load alert banner ── */}
        {loadAlerts.length > 0 && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '14px 18px', marginBottom: 20 }}>
            <div style={{ fontWeight: 700, color: '#92400E', fontSize: 13, marginBottom: 8 }}>
              ⚠ {loadAlerts.length} driver{loadAlerts.length !== 1 ? 's' : ''} with active loads — ELD log missing or stale
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {loadAlerts.map(l => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
                  <span style={{ fontWeight: 700, color: '#111827', minWidth: 180 }}>{l.driver_name}</span>
                  <span style={{ color: '#6B7280' }}>
                    {l.load_number ? `Load #${l.load_number}` : 'Active load'}
                    {l.truck_number ? ` · Truck ${l.truck_number}` : ''}
                  </span>
                  <span style={{ marginLeft: 'auto', color: '#DC2626', fontWeight: 600, background: '#FEF2F2', padding: '2px 8px', borderRadius: 6 }}>
                    {l.reason}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Summary cards ── */}
        <div className="summary-stat-cards" style={{ marginBottom: 24 }}>
          <div className="summary-card">
            <div className="summary-card-label">Total Drivers</div>
            <div className="summary-card-value">{loading ? '—' : rows.length}</div>
            <div className="summary-card-sub">on Motive ELD</div>
          </div>
          <div className="summary-card" style={{ borderLeft: '4px solid #2563EB' }}>
            <div className="summary-card-label">Driving</div>
            <div className="summary-card-value" style={{ color: '#2563EB' }}>{loading ? '—' : driving}</div>
            <div className="summary-card-sub">currently on road</div>
          </div>
          <div className="summary-card" style={{ borderLeft: '4px solid #D97706' }}>
            <div className="summary-card-label">On Duty</div>
            <div className="summary-card-value" style={{ color: '#D97706' }}>{loading ? '—' : onDuty}</div>
            <div className="summary-card-sub">not driving</div>
          </div>
          <div className="summary-card">
            <div className="summary-card-label">Off Duty / Sleeper</div>
            <div className="summary-card-value">{loading ? '—' : offDuty}</div>
            <div className="summary-card-sub">resting</div>
          </div>
          {inViol > 0 && (
            <div className="summary-card red">
              <div className="summary-card-label">🚨 In Violation</div>
              <div className="summary-card-value">{inViol}</div>
              <div className="summary-card-sub">HOS violation active</div>
            </div>
          )}
          {nearLimit > 0 && (
            <div className="summary-card" style={{ borderLeft: '4px solid #F59E0B' }}>
              <div className="summary-card-label">⚠ Near Limit</div>
              <div className="summary-card-value" style={{ color: '#F59E0B' }}>{nearLimit}</div>
              <div className="summary-card-sub">&lt; 2 hrs drive left</div>
            </div>
          )}
        </div>

        {/* ── Search ── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
          <input
            className="form-input"
            placeholder="Search driver…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 220, fontSize: 13 }}
          />
          {search && <button className="btn btn-ghost btn-xs" onClick={() => setSearch('')}>✕ Clear</button>}
          <span style={{ fontSize: 12, color: '#9CA3AF', marginLeft: 'auto' }}>
            {filtered.length} driver{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ── HOS Table ── */}
        <div className="summary-section-title">Driver HOS Status</div>

        {loading ? (
          <div style={{ color: '#9CA3AF', padding: '32px 0' }}>Loading from Motive…</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: '#9CA3AF', padding: '24px 0' }}>
            {dError ? 'Could not load drivers — see error above.' : 'No drivers found.'}
          </div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden', marginBottom: 28 }}>
            <table className="acct-table" style={{ marginBottom: 0 }}>
              <thead>
                <tr>
                  <th>Driver</th>
                  {company === 'all' && <th>Company</th>}
                  <th>Status</th>
                  <th style={{ minWidth: 160 }}>Drive Time Left</th>
                  <th style={{ minWidth: 160 }}>Shift Left</th>
                  <th style={{ minWidth: 160 }}>70h Cycle Left</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const hasAlert = loadAlerts.some(l => l.driver_name?.toLowerCase() === r.nameLower)
                  return (
                    <tr key={`${r.company}-${r.id}`}
                      style={{ background: r.inViolation ? '#FFF5F5' : hasAlert ? '#FFFBEB' : undefined }}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {r.inViolation && <span title="HOS Violation">🚨</span>}
                          {hasAlert && !r.inViolation && <span title="Load assigned — ELD stale">⚠️</span>}
                          <strong style={{ color: r.inViolation ? '#DC2626' : undefined }}>{r.name}</strong>
                        </div>
                      </td>
                      {company === 'all' && (
                        <td style={{ fontSize: 11, color: '#6B7280' }}>{CO_LABEL[r.company] ?? r.company}</td>
                      )}
                      <td><StatusBadge status={r.status} /></td>
                      <td><HosBar remainingSec={r.driveLeft}  totalSec={11 * 3600} /></td>
                      <td><HosBar remainingSec={r.shiftLeft}  totalSec={14 * 3600} /></td>
                      <td><HosBar remainingSec={r.cycleLeft}  totalSec={70 * 3600} /></td>
                      <td style={{ fontSize: 11, color: r.staleHours > 4 ? '#F59E0B' : '#9CA3AF', fontWeight: r.staleHours > 4 ? 600 : 400 }}>
                        {timeAgo(r.updatedAt)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Violations ── */}
        {violations.length > 0 && (
          <>
            <div className="summary-section-title">Violations — Last 7 Days</div>
            <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden', marginBottom: 28 }}>
              <table className="acct-table" style={{ marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th>Driver</th>
                    {company === 'all' && <th>Company</th>}
                    <th>Violation Type</th>
                    <th>Date</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {violations.map((v, i) => (
                    <tr key={i} style={{ background: '#FFF5F5' }}>
                      <td><strong style={{ color: '#DC2626' }}>{v.driver?.first_name} {v.driver?.last_name}</strong></td>
                      {company === 'all' && <td style={{ fontSize: 11, color: '#6B7280' }}>{CO_LABEL[v._company] ?? v._company}</td>}
                      <td>{v.violation_type ?? v.type ?? '—'}</td>
                      <td>{v.start_time ? new Date(v.start_time).toLocaleDateString() : '—'}</td>
                      <td>{v.duration_sec ? secToHM(v.duration_sec) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
