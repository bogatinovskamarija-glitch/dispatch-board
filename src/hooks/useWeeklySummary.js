import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Returns the Thursday–Wednesday week that contains the given ISO date (defaults to today)
export function getThursdayWeek(fromDate) {
  const d = fromDate ? new Date(fromDate + 'T12:00:00') : new Date()
  const day = d.getDay() // 0=Sun, 1=Mon, ..., 4=Thu
  const sinceThursday = (day - 4 + 7) % 7
  const thu = new Date(d)
  thu.setDate(d.getDate() - sinceThursday)
  const wed = new Date(thu)
  wed.setDate(thu.getDate() + 6)
  const iso = dt => dt.toISOString().split('T')[0]
  return { start: iso(thu), end: iso(wed) }
}

// Fetch paystubs whose period starts within the given week
export function useWeekPaystubs(startDate, endDate, company) {
  const [paystubs, setPaystubs] = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!startDate || !endDate) return
    let cancelled = false
    setLoading(true)

    async function fetch() {
      let q = supabase
        .from('paystubs')
        .select('driver_name, company, grand_total, load_total, start_date, end_date')
        .gte('start_date', startDate)
        .lte('start_date', endDate)

      if (company && company !== 'all') q = q.eq('company', company)

      const { data } = await q
      if (!cancelled) {
        setPaystubs(data ?? [])
        setLoading(false)
      }
    }

    fetch()
    return () => { cancelled = true }
  }, [startDate, endDate, company])

  return { paystubs, loading }
}

export function useWeeklySummary(startDate, endDate, company) {
  const [loads,   setLoads]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!startDate || !endDate) return
    let cancelled = false
    setLoading(true)

    async function fetch() {
      // A load "belongs" to this accounting week when its PICKUP DATE falls within
      // the Thursday–Wednesday window (startDate–endDate).
      // We do NOT fall back to dispatch date for loads with no pickup_date — a load
      // with no pickup_date hasn't been picked up yet and hasn't generated revenue.
      // Prebooked loads are still shown so dispatchers can see the full picture,
      // but they need a pickup_date entered to count toward miles/revenue.
      const REVENUE_STATUSES = ['covered','at_pickup','at_delivery','tonu','empty','prebooked']
      let q = supabase
        .from('loads')
        .select('id, load_number, company, price, status, date, pickup_date, delivery_date, pickup_location, delivery_location, driver_name, truck_number, invoiced_at, broker, total_miles, empty_miles')
        .in('status', REVENUE_STATUSES)
        .gte('pickup_date', startDate)
        .lte('pickup_date', endDate)
        .order('pickup_date', { ascending: true })

      if (company && company !== 'all') q = q.eq('company', company)

      const { data } = await q
      if (!cancelled) {
        setLoads(data ?? [])
        setLoading(false)
      }
    }

    fetch()
    return () => { cancelled = true }
  }, [startDate, endDate, company])

  return { loads, loading }
}
