import { useState, useRef, useEffect } from 'react'

export default function SelectCell({ value, options, onChange, placeholder = '—' }) {
  const [open, setOpen]     = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase())
  )

  function pick(opt) {
    onChange(opt.value)
    setOpen(false)
    setSearch('')
  }

  const label = options.find(o => o.value === value)?.label ?? placeholder

  return (
    <div className="select-cell" ref={ref} onClick={() => setOpen(o => !o)}>
      {label} <span className="sc-arrow">▾</span>
      {open && (
        <div className="dropdown-popup" onClick={e => e.stopPropagation()}>
          <input
            className="dropdown-search"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          {filtered.map(opt => (
            <div
              key={opt.value}
              className={`dropdown-item ${opt.value === value ? 'selected' : ''}`}
              onClick={() => pick(opt)}
            >
              {opt.label}
              {opt.sub && <span className="di-sub">{opt.sub}</span>}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: '8px 10px', color: '#9CA3AF', fontSize: 12 }}>No results</div>
          )}
        </div>
      )}
    </div>
  )
}
