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
      // A load "belongs" to this accounting week when:
      //   A) Its pickup_date falls within the Thu–Wed window, OR
      //   B) It has no pickup_date yet AND its dispatch date (date) is in range
      //      AND its status is one of the active/completed statuses (not prebooked).
      //      Prebooked loads have no pickup_date by definition and must NOT be
      //      counted toward revenue/miles — they haven't been executed yet.
      const REVENUE_STATUSES = ['covered','at_pickup','at_delivery','tonu','empty','prebooked']
      const ACTIVE_STATUSES  = ['covered','at_pickup','at_delivery','tonu','empty']
      let q = supabase
        .from('loads')
        .select('id, load_number, company, price, status, date, pickup_date, delivery_date, pickup_location, delivery_location, driver_name, truck_number, invoiced_at, broker, total_miles, empty_miles')
        .in('status', REVENUE_STATUSES)
        .or(
          `and(pickup_date.gte.${startDate},pickup_date.lte.${endDate}),` +
          `and(pickup_date.is.null,status.in.(${ACTIVE_STATUSES.join(',')}),date.gte.${startDate},date.lte.${endDate})`
        )
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
