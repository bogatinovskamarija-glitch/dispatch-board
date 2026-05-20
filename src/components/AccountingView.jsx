import { useState } from 'react'
import InvoicesTab from './accounting/InvoicesTab'
import PaystubsTab from './accounting/PaystubsTab'
import WeeklySummaryTab from './accounting/WeeklySummaryTab'

export default function AccountingView({ onClose, drivers }) {
  const [tab,     setTab]     = useState('invoices')
  const [company, setCompany] = useState('all')

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
            <button className={tab === 'summary' ? 'active' : ''} onClick={() => setTab('summary')}>
              Weekly Summary
            </button>
          </div>
        </div>

        <div className="topbar-right">
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
        {tab === 'summary'   && <WeeklySummaryTab company={company} />}
      </div>
    </div>
  )
}
