import { useState, useEffect } from 'react'

/**
 * Modal for adding / editing a persistent driver safety alert.
 *
 * Props:
 *   driver   – { name, clickupId, company } or null (null = closed)
 *   existing – current active note object from useDriverNotes, or null
 *   onSave   – async ({ driverName, driverClickupId, company, note, expiresAt }) => void
 *   onClear  – async (driverName) => void
 *   onClose  – () => void
 */
export default function DriverAlertModal({ driver, existing, onSave, onClear, onClose }) {
  const [note,      setNote]      = useState('')
  const [expiry,    setExpiry]    = useState('none')   // 'none' | 'today' | 'date'
  const [pickDate,  setPickDate]  = useState('')
  const [saving,    setSaving]    = useState(false)
  const [clearing,  setClearing]  = useState(false)
  const [err,       setErr]       = useState('')

  // Pre-fill when editing an existing alert
  useEffect(() => {
    if (!driver) return
    if (existing) {
      setNote(existing.note ?? '')
      if (!existing.expires_at) {
        setExpiry('none')
        setPickDate('')
      } else {
        const today = new Date().toISOString().split('T')[0]
        if (existing.expires_at === today) {
          setExpiry('today')
          setPickDate('')
        } else {
          setExpiry('date')
          setPickDate(existing.expires_at)
        }
      }
    } else {
      setNote('')
      setExpiry('none')
      setPickDate('')
    }
    setErr('')
  }, [driver, existing])

  if (!driver) return null

  function computeExpiresAt() {
    if (expiry === 'none')  return null
    if (expiry === 'today') return new Date().toISOString().split('T')[0]
    if (expiry === 'date')  return pickDate || null
    return null
  }

  async function handleSave() {
    if (!note.trim()) { setErr('Please enter an alert note.'); return }
    if (expiry === 'date' && !pickDate) { setErr('Please pick an expiry date.'); return }
    setSaving(true); setErr('')
    try {
      await onSave({
        driverName:      driver.name,
        driverClickupId: driver.clickupId ?? null,
        company:         driver.company  ?? null,
        note:            note.trim(),
        expiresAt:       computeExpiresAt(),
      })
      onClose()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    setClearing(true); setErr('')
    try {
      await onClear(driver.name)
      onClose()
    } catch (e) {
      setErr(e.message)
    } finally {
      setClearing(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#fff', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        width: 440, maxWidth: '95vw', padding: '24px 28px',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 22 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#111' }}>
              Safety Alert — {driver.name}
            </div>
            <div style={{ fontSize: 12, color: '#6B7280' }}>
              This alert shows on the board every day until it expires or is cleared.
            </div>
          </div>
        </div>

        {/* Note textarea */}
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
          Alert message
        </label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={3}
          placeholder="e.g. Selected for random drug test — must complete by end of day"
          style={{
            width: '100%', boxSizing: 'border-box', padding: '8px 10px',
            border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13,
            resize: 'vertical', outline: 'none', fontFamily: 'inherit',
          }}
        />

        {/* Expiry options */}
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', margin: '14px 0 8px' }}>
          Expires
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { value: 'none',  label: 'Until cleared manually' },
            { value: 'today', label: 'End of today' },
            { value: 'date',  label: 'Pick a date' },
          ].map(opt => (
            <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#111', whiteSpace: 'nowrap' }}>
              <input
                type="radio"
                name="expiry"
                value={opt.value}
                checked={expiry === opt.value}
                onChange={() => setExpiry(opt.value)}
                style={{ accentColor: '#DC2626', flexShrink: 0 }}
              />
              <span style={{ minWidth: 140 }}>{opt.label}</span>
              {opt.value === 'date' && (
                <input
                  type="date"
                  value={pickDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => { setExpiry('date'); setPickDate(e.target.value) }}
                  style={{
                    padding: '3px 8px', border: '1px solid #D1D5DB',
                    borderRadius: 5, fontSize: 12, outline: 'none',
                    opacity: expiry === 'date' ? 1 : 0.4,
                  }}
                />
              )}
            </label>
          ))}
        </div>

        {/* Error */}
        {err && (
          <div style={{ marginTop: 10, color: '#B91C1C', fontSize: 12, background: '#FEF2F2', borderRadius: 5, padding: '6px 10px' }}>
            {err}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
          {existing ? (
            <button
              onClick={handleClear}
              disabled={clearing || saving}
              style={{
                padding: '7px 14px', borderRadius: 6, border: '1px solid #FCA5A5',
                background: '#FEF2F2', color: '#B91C1C', fontSize: 13, cursor: 'pointer', fontWeight: 600,
              }}
            >
              {clearing ? 'Clearing…' : '✕ Clear Alert'}
            </button>
          ) : <div />}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              disabled={saving || clearing}
              style={{
                padding: '7px 14px', borderRadius: 6, border: '1px solid #D1D5DB',
                background: '#F9FAFB', color: '#374151', fontSize: 13, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || clearing}
              style={{
                padding: '7px 18px', borderRadius: 6, border: 'none',
                background: '#DC2626', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 700,
              }}
            >
              {saving ? 'Saving…' : existing ? 'Update Alert' : 'Set Alert'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
