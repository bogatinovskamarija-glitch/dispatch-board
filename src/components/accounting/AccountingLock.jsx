import { useState, useEffect, useRef } from 'react'

// ── Generic session-based password gate ──────────────────────────────────────
// Each "door" gets its own sessionStorage key so locks are independent.

export function isUnlocked(sessionKey) {
  return sessionStorage.getItem(sessionKey) === '1'
}

export function lock(sessionKey) {
  sessionStorage.removeItem(sessionKey)
}

// Convenience helpers kept for backward-compat with existing Accounting usage
export function isAccountingUnlocked() { return isUnlocked('acct_unlocked') }
export function lockAccounting()        { lock('acct_unlocked') }

export default function PasswordGate({ onUnlock, onClose, title, subtitle, password }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  function handleSubmit(e) {
    e.preventDefault()
    if (value === password) {
      onUnlock()
    } else {
      setError(true)
      setShake(true)
      setValue('')
      setTimeout(() => setShake(false), 500)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal acct-lock-modal${shake ? ' shake' : ''}`} style={{ maxWidth: 360 }}>

        <div style={{ textAlign: 'center', padding: '32px 32px 8px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 6 }}>
            {title}
          </div>
          <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 24 }}>
            {subtitle}
          </div>

          <form onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="password"
              className={`form-input${error ? ' input-error' : ''}`}
              placeholder="Password"
              value={value}
              onChange={e => { setValue(e.target.value); setError(false) }}
              style={{ width: '100%', textAlign: 'center', fontSize: 16, letterSpacing: 4, marginBottom: 8 }}
              autoComplete="current-password"
            />
            {error && (
              <div style={{ color: '#DC2626', fontSize: 12, marginBottom: 8 }}>
                Incorrect password. Try again.
              </div>
            )}
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 4 }}
              disabled={!value}
            >
              Unlock
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', padding: '12px 32px 24px' }}>
          <button className="btn btn-ghost btn-xs" onClick={onClose} style={{ color: '#9CA3AF' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
