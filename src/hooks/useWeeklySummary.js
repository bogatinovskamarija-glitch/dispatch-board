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

export function useWeeklySummary(startDate, endDate, company) {
  const [loads,   setLoads]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!startDate || !endDate) return
    let cancelled = false
    setLoading(true)

    async function fetch() {
      // Match loads whose pickup_date (or fallback date) falls within the week.
      // Uses: (pickup_date in range) OR (pickup_date is null AND date in range)
      let q = supabase
        .from('loads')
        .select('id, load_number, company, price, date, pickup_date, delivery_date, pickup_location, delivery_location, driver, truck_number, invoiced_at, broker, total_miles, empty_miles')
        .or(`and(pickup_date.gte.${startDate},pickup_date.lte.${endDate}),and(pickup_date.is.null,date.gte.${startDate},date.lte.${endDate})`)
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
