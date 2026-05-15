import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useFleet() {
  const [fleet, setFleet]     = useState([])
  const [loading, setLoading] = useState(true)

  async function fetchFleet() {
    setLoading(true)
    const { data } = await supabase
      .from('fleet')
      .select('*')
      .eq('active', true)
      .order('company')
      .order('sort_order')
      .order('truck_number')
    setFleet(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchFleet() }, [])

  async function addFleetEntry(payload) {
    const { data, error } = await supabase.from('fleet').insert([payload]).select().single()
    if (error) throw new Error(error.message)
    setFleet(prev => [...prev, data].sort((a, b) =>
      a.company.localeCompare(b.company) || (a.sort_order - b.sort_order) || (a.truck_number ?? '').localeCompare(b.truck_number ?? '')
    ))
    return data
  }

  async function updateFleetEntry(id, payload) {
    const { data, error } = await supabase.from('fleet').update(payload).eq('id', id).select().single()
    if (error) throw new Error(error.message)
    setFleet(prev => prev.map(e => e.id === id ? data : e))
    return data
  }

  async function removeFleetEntry(id) {
    const { error } = await supabase.from('fleet').update({ active: false }).eq('id', id)
    if (error) throw new Error(error.message)
    setFleet(prev => prev.filter(e => e.id !== id))
  }

  return { fleet, loading, addFleetEntry, updateFleetEntry, removeFleetEntry, refetch: fetchFleet }
}
