import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Search brokers with optional company filter — searches as you type
export function useBrokerSearch(query = '', company = 'all') {
  const [brokers, setBrokers]   = useState([])
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    if (query.length < 2) { setBrokers([]); return }
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      let q = supabase
        .from('brokers')
        .select('id, name, address, city, state, zip, phone, email, company')
        .ilike('name', `%${query}%`)
        .order('name')
        .limit(150)
      if (company !== 'all') q = q.eq('company', company)
      const { data } = await q
      if (!cancelled) { setBrokers(data ?? []); setLoading(false) }
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query, company])

  return { brokers, loading }
}

// All brokers for a company (used when building invoice from history)
export async function fetchBrokerById(id) {
  const { data } = await supabase.from('brokers').select('*').eq('id', id).single()
  return data
}

export async function createBroker(data) {
  const { data: broker, error } = await supabase
    .from('brokers').insert([data]).select().single()
  if (error) throw new Error(error.message)
  return broker
}

export async function updateBroker(id, data) {
  const { data: broker, error } = await supabase
    .from('brokers').update(data).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  return broker
}
