import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Loads pending invoicing: have a price, not yet invoiced
export function usePendingInvoices(company = 'all') {
  const [loads, setLoads]     = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('loads')
      .select('*')
      .is('invoiced_at', null)
      .not('price', 'is', null)
      .order('delivery_date', { ascending: false })
    if (company !== 'all') q = q.eq('company', company)
    const { data } = await q
    // Only show loads that have a broker (invoiceable)
    setLoads((data ?? []).filter(l => l.broker))
    setLoading(false)
  }, [company])

  useEffect(() => { fetch() }, [fetch])

  return { loads, loading, refetch: fetch }
}

// Already-invoiced loads (history)
export function useInvoiceHistory(company = 'all') {
  const [loads, setLoads]     = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('loads')
      .select('*')
      .not('invoiced_at', 'is', null)
      .order('invoiced_at', { ascending: false })
      .limit(300)
    if (company !== 'all') q = q.eq('company', company)
    const { data } = await q
    setLoads(data ?? [])
    setLoading(false)
  }, [company])

  useEffect(() => { fetch() }, [fetch])

  return { loads, loading, refetch: fetch }
}

export async function markLoadsInvoiced(loadIds) {
  const { error } = await supabase
    .from('loads')
    .update({ invoiced_at: new Date().toISOString() })
    .in('id', loadIds)
  if (error) throw new Error(error.message)
}

// Fetch all loads for a driver in a date range (by pickup_date or date)
export async function fetchDriverLoads(driverName, startDate, endDate) {
  const { data, error } = await supabase
    .from('loads')
    .select('*')
    .eq('driver_name', driverName)
    .order('pickup_date', { ascending: true })
  if (error) throw new Error(error.message)

  // Filter client-side by pickup_date or date field
  return (data ?? []).filter(l => {
    const d = l.pickup_date || l.date
    return d >= startDate && d <= endDate
  })
}
