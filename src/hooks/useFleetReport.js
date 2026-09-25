import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// Calendar days between two ISO date strings, inclusive (min 1)
function daysBetween(start, end) {
  if (!start) return 0
  const s = new Date(start + 'T12:00:00')
  const e = end ? new Date(end + 'T12:00:00') : s
  return Math.max(1, Math.round((e - s) / 86400000) + 1)
}

// Quarter → date range
export function quarterRange(year, quarter) {
  if (!quarter || quarter === 'year') {
    return { from: `${year}-01-01`, to: `${year}-12-31` }
  }
  const q = Number(quarter)
  const m0 = (q - 1) * 3 + 1
  const m1 = m0 + 2
  const lastDay = new Date(year, m1, 0).getDate()
  return {
    from: `${year}-${String(m0).padStart(2,'0')}-01`,
    to:   `${year}-${String(m1).padStart(2,'0')}-${lastDay}`,
  }
}

const IDLE_STATUSES  = new Set(['no_driver', 'home'])
const ON_ROAD_STATUS = new Set(['covered', 'empty'])   // empty = truck has a load, same as covered
const REVENUE_STATUS = new Set(['covered','at_pickup','at_delivery','tonu','empty','prebooked'])


export function useFleetReport(year, quarter, company) {
  const [loads,       setLoads]       = useState([])
  const [paystubs,    setPaystubs]    = useState([])
  const [fuel,        setFuel]        = useState([])
  const [maintenance, setMaintenance] = useState([])
  const [profiles,    setProfiles]    = useState([])
  const [loading,     setLoading]     = useState(true)

  const { from, to } = useMemo(() => quarterRange(year, quarter), [year, quarter])

  useEffect(() => {
    setLoading(true)
    const matchCo = company && company !== 'all'

    async function fetchAll() {
      const [loadsRes, paystubsRes, fuelRes, maintRes, profilesRes] = await Promise.all([
        (() => {
          let q = supabase
            .from('loads')
            .select('truck_number,driver_name,price,total_miles,pickup_date,delivery_date,date,status,company')
            .or(`and(pickup_date.gte.${from},pickup_date.lte.${to}),and(pickup_date.is.null,date.gte.${from},date.lte.${to})`)
            .limit(20000)
          if (matchCo) q = q.eq('company', company)
          return q
        })(),
        (() => {
          let q = supabase
            .from('paystubs')
            .select('driver_name,grand_total,start_date,company')
            .gte('start_date', from)
            .lte('start_date', to)
            .limit(5000)
          if (matchCo) q = q.eq('company', company)
          return q
        })(),
        (() => {
          let q = supabase
            .from('fuel_transactions')
            .select('truck_number,driver_name,amount,rebate_amount,fuel_category,transaction_date,company')
            .gte('transaction_date', from)
            .lte('transaction_date', to)
            .limit(10000)
          if (matchCo) q = q.eq('company', company)
          return q
        })(),
        (() => {
          let q = supabase
            .from('maintenance_records')
            .select('unit_number,unit_type,amount,date,company')
            .gte('date', from)
            .lte('date', to)
            .limit(10000)
          if (matchCo) q = q.eq('company', company)
          return q
        })(),
        supabase.from('driver_profiles').select('driver_name,profile_type,is_active'),
      ])

      setLoads(loadsRes.data ?? [])
      setPaystubs(paystubsRes.data ?? [])
      setFuel(fuelRes.data ?? [])
      setMaintenance(maintRes.data ?? [])
      setProfiles(profilesRes.data ?? [])
      setLoading(false)
    }

    fetchAll()
  }, [from, to, company])

  // ── Derived: profile type lookup ───────────────────────────────────────────
  const profileMap = useMemo(() => {
    const m = {}
    for (const p of profiles) {
      m[p.driver_name?.toLowerCase().trim()] = p.profile_type
    }
    return m
  }, [profiles])

  // ── Per-truck report ───────────────────────────────────────────────────────
  const truckReport = useMemo(() => {
    const trucks = {}

    const ensureTruck = t => {
      if (!trucks[t]) {
        trucks[t] = {
          truck: t,
          drivers: new Set(),
          gross: 0,
          miles: 0,
          fuel: 0,
          maintenance: 0,
          onRoadDays: 0,
          noDriverDays: 0,
          homeDays: 0,
        }
      }
      return trucks[t]
    }

    // Build truck rows ONLY from loads — this naturally excludes trailers
    for (const l of loads) {
      const t = (l.truck_number || '').trim()
      if (!t) continue
      const rec = ensureTruck(t)
      if (l.driver_name) rec.drivers.add(l.driver_name)

      const startDate = l.pickup_date || l.date
      if (!startDate) continue

      const days = daysBetween(startDate, l.delivery_date)
      if (ON_ROAD_STATUS.has(l.status)) rec.onRoadDays  += days
      if (l.status === 'no_driver')     rec.noDriverDays += days
      if (l.status === 'home')          rec.homeDays     += days

      if (REVENUE_STATUS.has(l.status)) {
        rec.gross += Number(l.price) || 0
        rec.miles += Number(l.total_miles) || 0
      }
    }

    // Only apply fuel/maintenance to trucks already in the map (skips trailers, unknown units)
    for (const f of fuel) {
      const t = (f.truck_number || '').trim()
      if (!trucks[t]) continue  // not a known tractor — skip
      const cat = String(f.fuel_category || '').toUpperCase()
      if (cat === 'DEFD') continue
      trucks[t].fuel += Math.max(0, (Number(f.amount) || 0) - (Number(f.rebate_amount) || 0))
    }

    for (const m of maintenance) {
      const t = (m.unit_number || '').trim()
      if (!trucks[t]) continue  // not a known tractor — skip trailers and unknowns
      const isTrailer = (m.unit_type || '').toLowerCase().includes('trailer')
      if (isTrailer) continue
      trucks[t].maintenance += Number(m.amount) || 0
    }

    return Object.values(trucks)
      .map(r => ({
        ...r,
        drivers:  [...r.drivers].join(', ') || '—',
        net:      r.gross - r.fuel - r.maintenance,
        idleDays: r.noDriverDays + r.homeDays,
      }))
      .sort((a, b) => b.gross - a.gross)
  }, [loads, fuel, maintenance])

  // ── Driver leaderboard ─────────────────────────────────────────────────────
  const driverReport = useMemo(() => {
    const norm = s => (s || '').toLowerCase().trim()

    // Gross revenue per driver (from loads)
    const grossByDriver = {}
    const milesbyDriver = {}
    for (const l of loads) {
      if (!l.driver_name || !REVENUE_STATUS.has(l.status)) continue
      const k = norm(l.driver_name)
      grossByDriver[k] = (grossByDriver[k] || 0) + (Number(l.price) || 0)
      milesbyDriver[k] = (milesbyDriver[k] || 0) + (Number(l.total_miles) || 0)
    }

    // Payroll per driver (from paystubs — company drivers)
    const payrollByDriver = {}
    for (const p of paystubs) {
      if (!p.driver_name) continue
      const k = norm(p.driver_name)
      payrollByDriver[k] = (payrollByDriver[k] || 0) + (Number(p.grand_total) || 0)
    }

    // Fuel per driver
    const fuelByDriver = {}
    for (const f of fuel) {
      if (!f.driver_name) continue
      const cat = String(f.fuel_category || '').toUpperCase()
      if (cat === 'DEFD') continue
      const k = norm(f.driver_name)
      fuelByDriver[k] = (fuelByDriver[k] || 0) + Math.max(0, (Number(f.amount) || 0) - (Number(f.rebate_amount) || 0))
    }

    // Build combined driver set
    const allDriverNames = new Set([
      ...Object.keys(grossByDriver),
      ...Object.keys(payrollByDriver),
    ])

    const drivers = []
    for (const k of allDriverNames) {
      const profileType = profileMap[k] || 'company'
      const gross   = grossByDriver[k]   || 0
      const payroll = payrollByDriver[k] || 0
      const fuel    = fuelByDriver[k]    || 0
      const miles   = milesbyDriver[k]   || 0
      // Display name: find original casing from loads or paystubs
      const displayName =
        loads.find(l => norm(l.driver_name) === k)?.driver_name ||
        paystubs.find(p => norm(p.driver_name) === k)?.driver_name ||
        k
      drivers.push({ name: displayName, profileType, gross, payroll, fuel, miles })
    }

    const oo      = drivers.filter(d => d.profileType === 'owner_operator').sort((a,b) => b.gross - a.gross)
    const company = drivers.filter(d => d.profileType !== 'owner_operator').sort((a,b) => b.payroll - a.payroll || b.gross - a.gross)

    return { oo, company: company }
  }, [loads, paystubs, fuel, profileMap])

  const numPeriodDays = useMemo(() => daysBetween(from, to), [from, to])

  return { truckReport, driverReport, loading, from, to, periodDays: numPeriodDays }
}
