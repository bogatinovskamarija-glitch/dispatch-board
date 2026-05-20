import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Returns the Thursday–Wednesday week containing 'fromDate' (ISO string)
export function getThursdayWeek(fromDate) {
  const d = fromDate ? new Date(fromDate + 'T12:00:00') : new Date()
  const day = d.getDay() // 0=Sun,1=Mon,...,4=Thu,5=Fri,6=Sat
  // Days since last Thursday (Thu=4)
  const sinceThursday = (day - 4 + 7) % 7
  const thu = new Date(d)
  thu.setDate(d.getDate() - sinceThursday)
  const wed = new Date(thu)
  wed.setDate(thu.getDate() + 6)
  const iso = dt => dt.toISOString().split('T')[0]
  return { start: iso(thu), end: iso(wed) }
}

export function useWeeklySummary(startDate, endDate) {
  const [loads,    setLoads]    = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!startDate || !endDate) return
    let cancelled = false
    setLoading(true)

    async function fetch() {
      const [loadsRes, invoicesRes] = await Promise.all([
        supabase
          .from('loads')
          .select('id, load_number, company, price, date, pickup_date, delivery_date, pickup_location, delivery_location, driver, invoiced_at, broker')
          .gte('date', startDate)
          .lte('date', endDate)
          .order('date', { ascending: true }),
        supabase
          .from('invoices')
          .select('id, invoice_number, company, total, created_at, bill_to_name')
          .gte('created_at', startDate)
          .lte('created_at', endDate + 'T23:59:59.999Z')
          .order('created_at', { ascending: true }),
      ])

      if (!cancelled) {
        setLoads(loadsRes.data ?? [])
        setInvoices(invoicesRes.data ?? [])
        setLoading(false)
      }
    }

    fetch()
    return () => { cancelled = true }
  }, [startDate, endDate])

  return { loads, invoices, loading }
}
