import { useState } from 'react'
import InvoicesTab from './accounting/InvoicesTab'
import PaystubsTab from './accounting/PaystubsTab'
import WeeklySummaryTab from './accounting/WeeklySummaryTab'
import LedgerTab from './accounting/LedgerTab'
import FuelTab   from './accounting/FuelTab'
import { useCompanySettings } from '../hooks/useSettings'

function CompanySettingsModal({ onClose }) {
  const { companies, saving, saveSetting } = useCompanySettings()
  const [carat, setCarat]         = useState(null)
  const [proFreight, setProFreight] = useState(null)

  // Lazily init local state from loaded companies
  const c  = carat      ?? companies.company_carat
  const pf = proFreight ?? companies.company_pro_freight

  async function handleSave() {
    await saveSetting('company_carat',       carat      ?? companies.company_carat)
    await saveSetting('company_pro_freight', proFreight ?? companies.company_pro_freight)
    onClose()
  }

  const Field = ({ label, value, onChange }) => (
    <div className="form-group">
      <label style={{ fontSize: 12 }}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} />
    </div>
  )

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 620 }}>
        <div className="modal-header">
          <div className="modal-title">Company Settings</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            {/* Carat */}
            <div>
              <div style={{ fontWeight: 700, marginBottom: 10, color: '#374151' }}>Carat Expedited</div>
              <Field label="Company Name"  value={c.name}    onChange={v => setCarat(p => ({ ...(p ?? c), name: v }))} />
              <Field label="Address Line"  value={c.address} onChange={v => setCarat(p => ({ ...(p ?? c), address: v }))} />
              <Field label="City, State ZIP" value={c.city}  onChange={v => setCarat(p => ({ ...(p ?? c), city: v }))} />
              <Field label="Phone"         value={c.phone}   onChange={v => setCarat(p => ({ ...(p ?? c), phone: v }))} />
            </div>
            {/* Pro Freight */}
            <div>
              <div style={{ fontWeight: 700, marginBottom: 10, color: '#374151' }}>Pro Freight</div>
              <Field label="Company Name"  value={pf.name}    onChange={v => setProFreight(p => ({ ...(p ?? pf), name: v }))} />
              <Field label="Address Line"  value={pf.address} onChange={v => setProFreight(p => ({ ...(p ?? pf), address: v }))} />
              <Field label="City, State ZIP" value={pf.city}  onChange={v => setProFreight(p => ({ ...(p ?? pf), city: v }))} />
              <Field label="Phone"         value={pf.phone}   onChange={v => setProFreight(p => ({ ...(p ?? pf), phone: v }))} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AccountingView({ onClose, drivers }) {
  const [tab,      setTab]      = useState('invoices')
  const [company,  setCompany]  = useState('all')
  const [settings, setSettings] = useState(false)

  return (
    <div className="acct-wrap">

      <div className="topbar">
        <div className="topbar-left">
          <button className="btn btn-ghost" onClick={onClose} style={{ marginRight: 8 }}>
            ← Board
          </button>
          <div>
            <div className="app-title">Accounting</div>
            <div className="app-subtitle">Invoices &amp; Driver Pay</div>
          </div>
        </div>

        <div className="topbar-center">
          <div className="view-toggle">
            <button className={tab === 'invoices' ? 'active' : ''} onClick={() => setTab('invoices')}>
              Invoices
            </button>
            <button className={tab === 'paystubs' ? 'active' : ''} onClick={() => setTab('paystubs')}>
              Paystubs
            </button>
            <button className={tab === 'ledger' ? 'active' : ''} onClick={() => setTab('ledger')}>
              📒 Ledger
            </button>
            <button className={tab === 'fuel' ? 'active' : ''} onClick={() => setTab('fuel')}>
              ⛽ Fuel
            </button>
            <button className={tab === 'summary' ? 'active' : ''} onClick={() => setTab('summary')}>
              Weekly Summary
            </button>
          </div>
        </div>

        <div className="topbar-right">
          <button className="btn btn-ghost" onClick={() => setSettings(true)} style={{ fontSize: 12 }}>
            ⚙ Company Settings
          </button>
          <div className="company-tabs">
            {[['all', 'All'], ['carat', 'Carat'], ['pro_freight', 'Pro Freight']].map(([v, l]) => (
              <button
                key={v}
                className={`company-tab${company === v ? ' active' : ''}`}
                onClick={() => setCompany(v)}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="acct-body">
        {tab === 'invoices'  && <InvoicesTab company={company} />}
        {tab === 'paystubs'  && <PaystubsTab company={company} drivers={drivers} />}
        {tab === 'ledger'    && <LedgerTab company={company} />}
        {tab === 'fuel'      && <FuelTab   company={company} />}
        {tab === 'summary'   && <WeeklySummaryTab company={company} />}
      </div>

      {settings && <CompanySettingsModal onClose={() => setSettings(false)} />}
    </div>
  )
}
