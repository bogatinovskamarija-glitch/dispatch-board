import { useState } from 'react'

const BLANK_PROFILE = {
  driver_name: '', company: 'carat',
  profile_type: 'company', pay_type: 'per_mile',
  pay_rate: '', commission_pct: 15, is_active: true,
}

export default function DriversPanel({ profiles, inactiveProfiles, drivers, saveProfile, removeProfile, reactivateProfile, fetchInactive }) {
  const [collapsed,     setCollapsed]     = useState(false)
  const [editing,       setEditing]       = useState(null) // profile id or 'new'
  const [form,          setForm]          = useState(BLANK_PROFILE)
  const [saving,        setSaving]        = useState(false)
  const [showInactive,  setShowInactive]  = useState(false)
  const [loadingInact,  setLoadingInact]  = useState(false)

  function startAdd() {
    setForm({ ...BLANK_PROFILE })
    setEditing('new')
  }

  function startEdit(p) {
    setForm({ ...p })
    setEditing(p.id)
  }

  function cancelEdit() { setEditing(null) }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...form,
        id:             editing === 'new' ? undefined : editing,
        pay_rate:       form.pay_rate       !== '' ? Number(form.pay_rate)       : null,
        commission_pct: form.commission_pct !== '' ? Number(form.commission_pct) : null,
      }
      await saveProfile(payload)
      setEditing(null)
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleInactive() {
    if (!showInactive) {
      setLoadingInact(true)
      await fetchInactive()
      setLoadingInact(false)
    }
    setShowInactive(v => !v)
  }

  async function handleReactivate(id) {
    await reactivateProfile(id)
  }

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }))

  return (
    <div className="drivers-panel">
      <div className="drivers-panel-header" onClick={() => setCollapsed(c => !c)}>
        <span>Driver Profiles ({profiles.length})</span>
        <span className="drivers-panel-toggle">{collapsed ? '▸ Expand' : '▾ Collapse'}</span>
      </div>

      {!collapsed && (
        <>
          <table className="acct-table drivers-table">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Company</th>
                <th>Profile Type</th>
                <th>Pay Rate / Setting</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {profiles.map(p => (
                <tr key={p.id}>
                  <td><strong>{p.driver_name}</strong></td>
                  <td>{p.company === 'carat' ? 'Carat' : 'Pro Freight'}</td>
                  <td>
                    <span className={`profile-badge ${p.profile_type === 'owner_operator' ? 'badge-oo' : 'badge-co'}`}>
                      {p.profile_type === 'owner_operator' ? 'Owner Operator' : 'Company Driver'}
                    </span>
                  </td>
                  <td>
                    {p.profile_type === 'company'
                      ? p.pay_type === 'per_mile'
                        ? `$${p.pay_rate}/mile`
                        : `Flat rate`
                      : `${p.commission_pct ?? 15}% commission`
                    }
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-xs" onClick={() => startEdit(p)}>Edit</button>
                    <button
                      className="btn btn-ghost btn-xs"
                      style={{ color: '#B45309', marginLeft: 4 }}
                      title="Deactivate — hides from paystub generator. History is preserved."
                      onClick={() => {
                        if (confirm(`Deactivate ${p.driver_name}? They will be hidden from the paystub generator but all pay history is preserved.`)) {
                          removeProfile(p.id)
                        }
                      }}
                    >Deactivate</button>
                  </td>
                </tr>
              ))}
              {profiles.length === 0 && (
                <tr><td colSpan={5} style={{ color: '#9CA3AF', padding: '16px 12px' }}>No active driver profiles. Add one below.</td></tr>
              )}
            </tbody>
          </table>

          {/* ── Inactive drivers section ── */}
          <div style={{ marginTop: 10 }}>
            <button
              className="btn btn-ghost btn-xs"
              onClick={handleToggleInactive}
              disabled={loadingInact}
              style={{ color: '#6B7280' }}
            >
              {loadingInact ? 'Loading…' : showInactive ? '▾ Hide inactive drivers' : '▸ Show inactive drivers'}
            </button>
          </div>

          {showInactive && (
            <div style={{ marginTop: 8 }}>
              {inactiveProfiles.length === 0 ? (
                <div style={{ fontSize: 12, color: '#9CA3AF', padding: '8px 0' }}>No inactive profiles.</div>
              ) : (
                <table className="acct-table drivers-table" style={{ opacity: 0.7 }}>
                  <thead>
                    <tr>
                      <th>Driver</th>
                      <th>Company</th>
                      <th>Type</th>
                      <th>Pay Rate</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {inactiveProfiles.map(p => (
                      <tr key={p.id} style={{ color: '#9CA3AF' }}>
                        <td><strong style={{ color: '#6B7280' }}>{p.driver_name}</strong></td>
                        <td>{p.company === 'carat' ? 'Carat' : 'Pro Freight'}</td>
                        <td>
                          <span className={`profile-badge ${p.profile_type === 'owner_operator' ? 'badge-oo' : 'badge-co'}`} style={{ opacity: 0.5 }}>
                            {p.profile_type === 'owner_operator' ? 'Owner Operator' : 'Company Driver'}
                          </span>
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {p.profile_type === 'company'
                            ? p.pay_type === 'per_mile' ? `$${p.pay_rate}/mile` : 'Flat rate'
                            : `${p.commission_pct ?? 15}% commission`}
                        </td>
                        <td>
                          <button
                            className="btn btn-ghost btn-xs"
                            style={{ color: '#059669' }}
                            onClick={() => handleReactivate(p.id)}
                          >Reactivate</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {editing ? (
            <form className="driver-profile-form" onSubmit={handleSave}>
              <div className="driver-profile-form-title">{editing === 'new' ? 'Add Driver Profile' : 'Edit Profile'}</div>
              <div className="form-grid">
                <div className="form-group">
                  <label>Driver Name</label>
                  <input
                    required list="dp-driver-list"
                    value={form.driver_name}
                    onChange={e => set('driver_name', e.target.value)}
                    placeholder="Type or select driver…"
                  />
                  <datalist id="dp-driver-list">
                    {drivers.map(d => <option key={d.id} value={d.name} />)}
                  </datalist>
                </div>
                <div className="form-group">
                  <label>Company</label>
                  <select value={form.company} onChange={e => set('company', e.target.value)}>
                    <option value="carat">Carat Expedited</option>
                    <option value="pro_freight">Pro Freight</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Profile Type</label>
                  <select value={form.profile_type} onChange={e => set('profile_type', e.target.value)}>
                    <option value="company">Company Driver</option>
                    <option value="owner_operator">Owner Operator</option>
                  </select>
                </div>

                {form.profile_type === 'company' && (
                  <>
                    <div className="form-group">
                      <label>Pay Type</label>
                      <select value={form.pay_type} onChange={e => set('pay_type', e.target.value)}>
                        <option value="per_mile">Per Mile</option>
                        <option value="flat_rate">Flat Rate</option>
                      </select>
                    </div>
                    {form.pay_type === 'per_mile' && (
                      <div className="form-group">
                        <label>Rate ($/mile)</label>
                        <input type="number" step="0.01" value={form.pay_rate} onChange={e => set('pay_rate', e.target.value)} placeholder="0.70" />
                      </div>
                    )}
                  </>
                )}

                {form.profile_type === 'owner_operator' && (
                  <div className="form-group">
                    <label>Commission %</label>
                    <input type="number" step="0.1" value={form.commission_pct} onChange={e => set('commission_pct', e.target.value)} placeholder="15" />
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" className="btn btn-ghost" onClick={cancelEdit}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Profile'}</button>
              </div>
            </form>
          ) : (
            <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={startAdd}>
              + Add Driver Profile
            </button>
          )}
        </>
      )}
    </div>
  )
}
