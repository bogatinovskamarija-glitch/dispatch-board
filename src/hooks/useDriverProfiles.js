import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useDriverProfiles() {
  const [profiles, setProfiles]   = useState([])
  const [loading,  setLoading]    = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('driver_profiles')
      .select('*')
      .eq('is_active', true)
      .order('driver_name')
    setProfiles(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  async function saveProfile(profile) {
    const { id, ...rest } = profile
    if (id) {
      const { data, error } = await supabase
        .from('driver_profiles').update(rest).eq('id', id).select().single()
      if (error) throw new Error(error.message)
      setProfiles(prev => prev.map(p => p.id === id ? data : p))
      return data
    } else {
      const { data, error } = await supabase
        .from('driver_profiles').insert([rest]).select().single()
      if (error) throw new Error(error.message)
      setProfiles(prev => [...prev, data])
      return data
    }
  }

  async function removeProfile(id) {
    await supabase.from('driver_profiles').update({ is_active: false }).eq('id', id)
    setProfiles(prev => prev.filter(p => p.id !== id))
  }

  return { profiles, loading, saveProfile, removeProfile, refetch: fetch }
}
