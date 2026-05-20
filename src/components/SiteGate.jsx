import { useState, useEffect, useRef } from 'react'

const SESSION_KEY = 'site_unlocked'
const PASSWORD    = import.meta.env.VITE_SITE_PASSWORD || 'carat2026'

export function isSiteUnlocked() {
  return sessionStorage.getItem(SESSION_KEY) === '1'
}

export default function SiteGate({ children }) {
  // Start unlocked if sessionStorage already has the flag (survives page refresh)
  const [unlocked, setUnlocked] = useState(() => isSiteUnlocked())
  const [value,    setValue]    = useState('')
  const [error,    setError]    = useState(false)
  const [shake,    setShake]    = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!unlocked) inputRef.current?.focus()
  }, [unlocked])

  if (unlocked) return children

  function handleSubmit(e) {
    e.preventDefault()
    if (value === PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, '1')
      setUnlocked(true)
    } else {
      setError(true)
      setShake(true)
      setValue('')
      setTimeout(() => setShake(false), 500)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#F3F4F6',
    }}>
      <div className={`modal acct-lock-modal${shake ? ' shake' : ''}`}
        style={{ maxWidth: 380, width: '90%', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.13)' }}>

        <div style={{ textAlign: 'center', padding: '40px 36px 16px' }}>
          <div style={{ fontSize: 52, marginBottom: 14 }}>🚛</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginBottom: 4 }}>
            Dispatcher Board
          </div>
          <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 28 }}>
            Carat Expedited · Pro Freight
          </div>

          <form onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="password"
              className={`form-input${error ? ' input-error' : ''}`}
              placeholder="Enter password"
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
              style={{ width: '100%', marginTop: 6, fontSize: 15, padding: '10px 0' }}
              disabled={!value}
            >
              Sign In
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', padding: '4px 36px 28px', fontSize: 11, color: '#D1D5DB' }}>
          Authorized personnel only
        </div>
      </div>
    </div>
  )
}
