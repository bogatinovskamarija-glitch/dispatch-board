import { useState } from 'react'
import { useLoads, useWeekLoads } from './hooks/useLoads'
import { useDrivers, useEquipment } from './hooks/useClickUp'
import { useFleet } from './hooks/useFleet'
import { format, addDays, startOfWeek, formatDisplay, formatWeekRange } from './lib/dateUtils'
import StatsRow from './components/StatsRow'
import DayView from './components/DayView'
import WeekView from './components/WeekView'
import LoadModal from './components/LoadModal'
import DriverSidebar from './components/DriverSidebar'
import EquipmentSidebar from './components/EquipmentSidebar'
import FleetModal from './components/FleetModal'
import ExportModal from './components/ExportModal'
import AccountingView from './components/AccountingView'

const today = new Date()
today.setHours(0, 0, 0, 0)

export default function App() {
  const [view, setView]       = useState('day')
  const [currentDay, setDay]  = useState(today)
  const [company, setCompany] = useState('all')
  const [modal, setModal]           = useState(null)
  const [sidebar, setSidebar]       = useState(null)
  const [equipSidebar, setEquip]    = useState(null)
  const [fleetOpen, setFleetOpen]       = useState(false)
  const [exportOpen, setExportOpen]     = useState(false)
  const [accountingOpen, setAccounting] = useState(false)
  const [statusFilter, setFilter]   = useState([])

  const weekStart = startOfWeek(currentDay)
  const weekEnd   = addDays(weekStart, 6)

  const { loads, loading, createLoad, updateLoad, deleteLoad } = useLoads(format(currentDay), company)
  const { loads: weekLoads, loading: weekLoading } = useWeekLoads(format(weekStart), format(weekEnd), company)
  const { drivers } = useDrivers()
  const { trucks, trailers } = useEquipment()
  const { fleet, addFleetEntry, updateFleetEntry, removeFleetEntry } = useFleet()

  async function handleSave(payload) {
    if (payload.id) await updateLoad(payload.id, payload)
    else await createLoad(payload)
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this load?')) return
    await deleteLoad(id)
  }

  function shiftDay(n)  { setDay(d => addDays(d, n)) }
  function shiftWeek(n) { setDay(d => addDays(d, n * 7)) }

  const isDay = view === 'day'
  const dateLabel = isDay
    ? formatDisplay(currentDay, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : formatWeekRange(weekStart)

  if (accountingOpen) {
    return (
      <AccountingView
        drivers={drivers}
        onClose={() => setAccounting(false)}
      />
    )
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <div className="logo">CE</div>
          <div>
            <div className="app-title">Dispatcher Board</div>
            <div className="app-subtitle">Carat Expedited · Pro Freight</div>
          </div>
        </div>

        <div className="topbar-center">
          <div className="date-nav">
            <button onClick={() => isDay ? shiftDay(-1) : shiftWeek(-1)}>&#8249;</button>
            <span className="date-label">{dateLabel}</span>
            <button onClick={() => isDay ? shiftDay(1) : shiftWeek(1)}>&#8250;</button>
          </div>
          <div className="view-toggle">
            <button className={isDay ? 'active' : ''} onClick={() => setView('day')}>Day</button>
            <button className={!isDay ? 'active' : ''} onClick={() => setView('week')}>Week</button>
          </div>
        </div>

        <div className="topbar-right">
          <button className="btn btn-ghost" onClick={() => setAccounting(true)}>
            $ Accounting
          </button>
          <button className="btn btn-ghost" onClick={() => setExportOpen(true)}>
            ↓ Export CSV
          </button>
          <button className="btn btn-ghost" onClick={() => setFleetOpen(true)}>⊞ Fleet Roster</button>
          <button className="btn btn-primary" onClick={() => setModal('add')}>+ Add Load</button>
        </div>
      </div>

      <div className="filters-bar">
        <div className="company-tabs">
          {[['all','All Trucks'],['carat','Carat Expedited'],['pro_freight','Pro Freight']].map(([v, l]) => (
            <button key={v} className={`company-tab${company === v ? ' active' : ''}`} onClick={() => setCompany(v)}>
              {l}
            </button>
          ))}
        </div>
        <div className="filters-divider" />
        <div className="legend">
          <div className="legend-item"><div className="legend-dot dot-green" /> Covered</div>
          <div className="legend-item"><div className="legend-dot dot-yellow" /> Empty</div>
          <div className="legend-item"><div className="legend-dot dot-pink" /> At Home</div>
          <div className="legend-item"><div className="legend-dot dot-red" /> Broken Down</div>
          <div className="legend-item"><div className="legend-dot dot-grey" /> No Driver</div>
          <div className="legend-item"><div className="legend-dot dot-indigo" /> Pre-Booked</div>
          <div className="legend-item"><div className="legend-dot dot-sky" /> At Pick Up</div>
          <div className="legend-item"><div className="legend-dot dot-orange" /> At Delivery</div>
        </div>
      </div>

      <StatsRow
        loads={isDay ? loads : weekLoads}
        statusFilter={statusFilter}
        onFilterChange={setFilter}
      />

      {isDay ? (
        <DayView
          loads={loads}
          loading={loading}
          statusFilter={statusFilter}
          trucks={trucks}
          trailers={trailers}
          drivers={drivers}
          fleet={fleet}
          onEdit={l => setModal(l)}
          onDelete={handleDelete}
          onDriverClick={(id, name) => setSidebar({ clickupId: id, name })}
          onTruckClick={t => setEquip({ equipment: t, equipType: 'truck' })}
          onTrailerClick={t => setEquip({ equipment: t, equipType: 'trailer' })}
        />
      ) : (
        <WeekView
          loads={weekLoads}
          loading={weekLoading}
          weekStart={weekStart}
          today={today}
          fleet={fleet}
          statusFilter={statusFilter}
          onLoadClick={l => setModal(l)}
        />
      )}

      {modal && (
        <LoadModal
          load={modal === 'add' ? null : modal}
          date={format(currentDay)}
          drivers={drivers}
          trucks={trucks}
          trailers={trailers}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {sidebar && (
        <DriverSidebar
          clickupId={sidebar.clickupId}
          name={sidebar.name}
          onClose={() => setSidebar(null)}
        />
      )}

      {equipSidebar && (
        <EquipmentSidebar
          equipment={equipSidebar.equipment}
          equipType={equipSidebar.equipType}
          onClose={() => setEquip(null)}
        />
      )}

      {exportOpen && (
        <ExportModal onClose={() => setExportOpen(false)} />
      )}

      {fleetOpen && (
        <FleetModal
          fleet={fleet}
          drivers={drivers}
          onAdd={addFleetEntry}
          onUpdate={updateFleetEntry}
          onRemove={removeFleetEntry}
          onClose={() => setFleetOpen(false)}
        />
      )}
    </>
  )
}
