import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useLoads(date, company) {
  const [loads, setLoads]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const fetchLoads = useCallback(async () => {
    setLoading(true)
    setError(null)
    let q = supabase.from('loads').select('*').eq('date', date).order('company').order('truck_number')
    if (company && company !== 'all') q = q.eq('company', company)
    const { data, error } = await q
    if (error) setError(error.message)
    else setLoads(data ?? [])
    setLoading(false)
  }, [date, company])

  useEffect(() => { fetchLoads() }, [fetchLoads])

  async function createLoad(payload) {
    const { data, error } = await supabase.from('loads').insert([payload]).select().single()
    if (error) throw new Error(error.message)
    setLoads(prev => [...prev, data])
    return data
  }

  async function updateLoad(id, payload) {
    const { data, error } = await supabase.from('loads').update(payload).eq('id', id).select().single()
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
      let q = supabase.from('loads').select('*')
        .gte('date', weekStart).lte('date', weekEnd).order('company').order('truck_number')
      if (company && company !== 'all') q = q.eq('company', company)
      const { data } = await q
      setLoads(data ?? [])
      setLoading(false)
    }
    fetch()
  }, [weekStart, weekEnd, company])

  return { loads, loading }
}
