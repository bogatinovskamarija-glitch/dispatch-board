import { useState } from 'react'
import { useMotiveDrivers, useMotiveViolations } from '../../hooks/useMotive'

// ── Helpers ───────────────────────────────────────────────────────────────────
function secToHM(sec) {
  if (sec == null || sec < 0) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return `${h}h ${m.toString().padStart(2, '0')}m`
}

function dutyLabel(status) {
  switch (status) {
    case 'driving':             return { label: 'Driving',       color: '#2563EB', bg: '#EFF6FF' }
    case 'on_duty_not_driving': return { label: 'On Duty',       color: '#D97706', bg: '#FFFBEB' }
    case 'off_duty':            return { label: 'Off Duty',      color: '#6B7280', bg: '#F9FAFB' }
    case 'sleeper_berth':       return { label: 'Sleeper',       color: '#7C3AED', bg: '#F5F3FF' }
    case 'yard_moves':          return { label: 'Yard Moves',    color: '#0891B2', bg: '#ECFEFF' }
    case 'personal_conveyance': return { label: 'Personal Conv.', color: '#059669', bg: '#ECFDF5' }
    default:                    return { label: status ?? 'Unknown', color: '#9CA3AF', bg: '#F9FAFB' }
  }
}

function hosBarColor(remainingSec) {
  if (remainingSec == null) return '#E5E7EB'
  const hrs = remainingSec / 3600
  if (hrs <= 1)  return '#DC2626'
  if (hrs <= 2)  return '#F59E0B'
  return '#059669'
}

function HosBar({ remainingSec, totalSec = 11 * 3600 }) {
  const pct = Math.min(100, Math.max(0, (remainingSec / totalSec) * 100))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: '#E5E7EB', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: hosBarColor(remainingSec), borderRadius: 3, transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: 11, width: 52, color: hosBarColor(remainingSec), fontWeight: 600 }}>
        {secToHM(remainingSec)}
      </span>
    </div>
  )
}

function StatusBadge({ status }) {
  const { label, color, bg } = dutyLabel(status)
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, color, background: bg, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

function timeAgo(isoStr) {
  if (!isoStr) return '—'
  const diff = Math.floor((Date.now() - new Date(isoStr)) / 1000)
  if (diff < 60)   return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const CO_LABEL = { carat: 'Carat', pro_freight: 'Pro Freight' }

// ── Main component ────────────────────────────────────────────────────────────
export default function SafetyView({ onClose }) {
  const [company, setCompany] = useState('all')
  const [search,  setSearch]  = useState('')

  const { drivers,    loading: dLoading, error: dError,    lastSync, refresh: refreshDrivers } = useMotiveDrivers(company)
  const { violations, loading: vLoading, error: vError,    refresh: refreshViol }  = useMotiveViolations(company)

  function refreshAll() { refreshDrivers(); refreshViol() }

  // ── Parse each driver's HOS from Motive user object ───────────────────────
  const rows = drivers
    .map(u => {
      const hos = u.current_driver_status ?? u.hos_status ?? {}
      return {
        id:         u.id,
        name:       [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || `Driver ${u.id}`,
        company:    u._company,
        status:     hos.duty_status ?? hos.current_duty_status ?? 'off_duty',
        driveLeft:  hos.drive_remaining_sec   ?? hos.shift_drive_remaining  ?? null,
        shiftLeft:  hos.shift_remaining_sec   ?? hos.shift_remaining        ?? null,
        cycleLeft:  hos.cycle_remaining_sec   ?? hos.cycle_remaining        ?? null,
        inViolation: hos.is_in_violation      ?? false,
        updatedAt:  hos.updated_at ?? u.updated_at ?? null,
        eldSerial:  u.eld_device?.serial_number ?? null,
      }
    })
    .filter(r => {
      if (!search) return true
      const q = search.toLowerCase()
      return r.name.toLowerCase().includes(q) || CO_LABEL[r.company]?.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      // violations first, then driving, then on-duty, then off
      if (a.inViolation !== b.inViolation) return a.inViolation ? -1 : 1
      const order = { driving: 0, on_duty_not_driving: 1, sleeper_berth: 2, off_duty: 3 }
      return (order[a.status] ?? 4) - (order[b.status] ?? 4)
    })

  // ── Summary counts ─────────────────────────────────────────────────────────
  const total      = rows.length
  const driving    = rows.filter(r => r.status === 'driving').length
  const onDuty     = rows.filter(r => r.status === 'on_duty_not_driving').length
  const offDuty    = rows.filter(r => r.status === 'off_duty' || r.status === 'sleeper_berth').length
  const inViol     = rows.filter(r => r.inViolation).length
  const nearLimit  = rows.filter(r => r.driveLeft != null && r.driveLeft < 2 * 3600 && !r.inViolation).length

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

        <div className="topbar-right" style={{ gap: 8 }}>
          {lastSync && (
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>
              Synced {timeAgo(lastSync.toISOString())}
            </span>
          )}
          <button className="btn btn-ghost" onClick={refreshAll} disabled={loading}>
            {loading ? 'Loading…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      <div className="summary-wrap">

        {/* ── Error banner ── */}
        {(dError || vError) && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: '#DC2626', fontSize: 13 }}>
            ⚠ Motive API error: {dError || vError}
            <br /><span style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4, display: 'block' }}>
              Make sure the Edge Function is deployed and secrets are set in Supabase.
            </span>
          </div>
        )}

        {/* ── Summary cards ── */}
        <div className="summary-stat-cards" style={{ marginBottom: 24 }}>
          <div className="summary-card">
            <div className="summary-card-label">Total Drivers</div>
            <div className="summary-card-value">{loading ? '—' : total}</div>
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
              <div className="summary-card-sub">&lt; 2 hrs drive time left</div>
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
          {search && (
            <button className="btn btn-ghost btn-xs" onClick={() => setSearch('')}>✕ Clear</button>
          )}
          <span style={{ fontSize: 12, color: '#9CA3AF', marginLeft: 'auto' }}>
            {rows.length} driver{rows.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ── HOS Table ── */}
        <div className="summary-section-title">Driver HOS Status</div>

        {loading ? (
          <div style={{ color: '#9CA3AF', padding: '32px 0' }}>Loading from Motive…</div>
        ) : rows.length === 0 ? (
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
                  <th style={{ width: 160 }}>Drive Time Left</th>
                  <th style={{ width: 160 }}>Shift Left</th>
                  <th style={{ width: 160 }}>Cycle Left</th>
                  <th>ELD</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={`${r._company}-${r.id}`} style={{ background: r.inViolation ? '#FFF5F5' : undefined }}>
                    <td>
                      <strong style={{ color: r.inViolation ? '#DC2626' : undefined }}>
                        {r.inViolation && '🚨 '}{r.name}
                      </strong>
                    </td>
                    {company === 'all' && (
                      <td style={{ fontSize: 11, color: '#6B7280' }}>{CO_LABEL[r.company] ?? r.company}</td>
                    )}
                    <td><StatusBadge status={r.status} /></td>
                    <td><HosBar remainingSec={r.driveLeft} totalSec={11 * 3600} /></td>
                    <td><HosBar remainingSec={r.shiftLeft} totalSec={14 * 3600} /></td>
                    <td><HosBar remainingSec={r.cycleLeft} totalSec={70 * 3600} /></td>
                    <td style={{ fontSize: 11, color: '#6B7280' }}>{r.eldSerial ?? '—'}</td>
                    <td style={{ fontSize: 11, color: '#9CA3AF' }}>{timeAgo(r.updatedAt)}</td>
                  </tr>
                ))}
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
