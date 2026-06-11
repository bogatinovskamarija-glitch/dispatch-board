import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

function getWeekStart(isoDate) {
  const d = new Date(isoDate + 'T12:00:00')
  const day = d.getDay()
  const sinceThursday = (day - 4 + 7) % 7
  const thu = new Date(d)
  thu.setDate(d.getDate() - sinceThursday)
  return thu.toISOString().split('T')[0]
}

function getWeekEnd(thuStart) {
  const d = new Date(thuStart + 'T12:00:00')
  d.setDate(d.getDate() + 6)
  return d.toISOString().split('T')[0]
}

function monthOf(isoDate) {
  return isoDate ? new Date(isoDate + 'T12:00:00').getMonth() : null
}

function emptyWeek(start) {
  return { start, end: getWeekEnd(start), gross: 0, payroll: 0, fuel: 0, maintenance: 0, miles: 0 }
}

function addToWeek(weeksMap, dateStr, fields) {
  const wk = getWeekStart(dateStr)
  if (!weeksMap[wk]) weeksMap[wk] = emptyWeek(wk)
  Object.entries(fields).forEach(([k, v]) => { weeksMap[wk][k] += v })
}

export function useMonthlyAccountingSummary(year, company) {
  const [loads,       setLoads]       = useState([])
  const [paystubs,    setPaystubs]    = useState([])
  const [fuel,        setFuel]        = useState([])
  const [maintenance, setMaintenance] = useState([])
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    if (!year) return
    setLoading(true)
    const from = `${year}-01-01`
    const to   = `${year}-12-31`

    async function fetchAll() {
      const [loadsRes, paystubsRes, fuelRes, maintRes] = await Promise.all([
        supabase
          .from('loads')
          .select('id,price,total_miles,pickup_date,date,company,status')
          // Mirror the weekly hook: pickup_date is the source of truth;
          // fall back to date only when pickup_date is null.
          // Filtering by date alone misses pre-booked loads (entry date ≠ pickup date).
          .or(`and(pickup_date.gte.${from},pickup_date.lte.${to}),and(pickup_date.is.null,date.gte.${from},date.lte.${to})`),
        supabase
          .from('paystubs')
          .select('id,grand_total,start_date,company')
          .gte('start_date', from)
          .lte('start_date', to),
        supabase
          .from('fuel_transactions')
          .select('id,amount,transaction_date,company')
          .gte('transaction_date', from)
          .lte('transaction_date', to),
        supabase
          .from('maintenance_records')
          .select('id,amount,date,company')
          .gte('date', from)
          .lte('date', to),
      ])
      setLoads(loadsRes.data ?? [])
      setPaystubs(paystubsRes.data ?? [])
      setFuel(fuelRes.data ?? [])
      setMaintenance(maintRes.data ?? [])
      setLoading(false)
    }

    fetchAll()
  }, [year, company])

  const months = useMemo(() => {
    const NON_REVENUE = new Set(['empty', 'home', 'broken', 'no_driver'])

    const result = Array.from({ length: 12 }, () => ({
      gross: 0, payroll: 0, fuel: 0, maintenance: 0, miles: 0,
      weeks: {},
    }))

    const matchesCompany = r => !company || company === 'all' || r.company === company

    for (const l of loads) {
      if (!matchesCompany(l)) continue
      if (NON_REVENUE.has(l.status)) continue
      const dateStr = l.pickup_date || l.date
      if (!dateStr) continue
      const m = monthOf(dateStr)
      if (m == null) continue
      const price = Number(l.price) || 0
      const miles = Number(l.total_miles) || 0
      result[m].gross += price
      result[m].miles += miles
      addToWeek(result[m].weeks, dateStr, { gross: price, miles })
    }

    for (const p of paystubs) {
      if (!matchesCompany(p) || !p.start_date) continue
      const m = monthOf(p.start_date)
      if (m == null) continue
      const amt = Number(p.grand_total) || 0
      result[m].payroll += amt
      addToWeek(result[m].weeks, p.start_date, { payroll: amt })
    }

    for (const f of fuel) {
      if (!matchesCompany(f) || !f.transaction_date) continue
      const m = monthOf(f.transaction_date)
      if (m == null) continue
      const amt = Number(f.amount) || 0
      result[m].fuel += amt
      addToWeek(result[m].weeks, f.transaction_date, { fuel: amt })
    }

    for (const rec of maintenance) {
      if (!matchesCompany(rec) || !rec.date) continue
      const m = monthOf(rec.date)
      if (m == null) continue
      const amt = Number(rec.amount) || 0
      result[m].maintenance += amt
      addToWeek(result[m].weeks, rec.date, { maintenance: amt })
    }

    return result.map(m => ({
      ...m,
      weeks: Object.values(m.weeks).sort((a, b) => a.start.localeCompare(b.start)),
    }))
  }, [loads, paystubs, fuel, maintenance, company])

  return { months, loading }
}
