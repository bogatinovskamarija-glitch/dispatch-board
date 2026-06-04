import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Ghost / not-yet-picked-up statuses that should NOT get an auto pickup_date
const NO_AUTO_PICKUP = ['home', 'broken', 'no_driver', 'prebooked']

// Automatically set pickup_date = date when a real load is saved without a pickup_date.
// This ensures the weekly accounting summary can always find the load by pickup date.
// Dispatch only needs to fill in the dispatch date — pickup_date is kept in sync automatically.
function autoPickupDate(payload) {
  if (payload.pickup_date) return payload               // already set — leave it alone
  if (NO_AUTO_PICKUP.includes(payload.status)) return payload  // ghost/prebooked — don't set
  if (!payload.date) return payload                     // no dispatch date — can't infer
  return { ...payload, pickup_date: payload.date }      // mirror dispatch date → pickup date
}

export function useLoads(date, company) {
  const [loads, setLoads]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const fetchLoads = useCallback(async () => {
    setLoading(true)
    setError(null)
    // Show any load whose range covers this day:
    // created on or before today AND (no delivery date yet OR delivery date is today or later)
    let q = supabase.from('loads')
      .select('*')
      .lte('date', date)
      .or(`delivery_date.is.null,delivery_date.gte.${date}`)
      .order('company')
      .order('truck_number')
    if (company && company !== 'all') q = q.eq('company', company)
    const { data, error } = await q
    if (error) setError(error.message)
    else setLoads(data ?? [])
    setLoading(false)
  }, [date, company])

  useEffect(() => { fetchLoads() }, [fetchLoads])

  async function createLoad(payload) {
    const enriched = autoPickupDate(payload)
    const { data, error } = await supabase.from('loads').insert([enriched]).select().single()
    if (error) throw new Error(error.message)
    setLoads(prev => [...prev, data])
    return data
  }

  async function updateLoad(id, payload) {
    const enriched = autoPickupDate(payload)
    const { data, error } = await supabase.from('loads').update(enriched).eq('id', id).select().single()
    if (error) throw new Error(error.message)
    setLoads(prev => prev.map(l => l.id === id ? data : l))
    return data
  }

  async function deleteLoad(id) {
    const { error } = await supabase.from('loads').delete().eq('id', id)
    if (error) throw new Error(error.message)
    setLoads(prev => prev.filter(l => l.id !== id))
  }

  return { loads, loading, error, createLoad, updateLoad, deleteLoad, refetch: fetchLoads }
}

export function useWeekLoads(weekStart, weekEnd, company) {
  const [loads, setLoads]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      setLoading(true)
      // Fetch any load whose range overlaps this week:
      // created on or before week end AND (no delivery date OR delivery date is within/after week start)
      let q = supabase.from('loads')
        .select('*')
        .lte('date', weekEnd)
        .or(`delivery_date.is.null,delivery_date.gte.${weekStart}`)
        .order('company')
        .order('truck_number')
      if (company && company !== 'all') q = q.eq('company', company)
      const { data } = await q
      setLoads(data ?? [])
      setLoading(false)
    }
    fetch()
  }, [weekStart, weekEnd, company])

  return { loads, loading }
}
