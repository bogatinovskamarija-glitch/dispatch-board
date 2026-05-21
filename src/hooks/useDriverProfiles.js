import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useDriverProfiles() {
  const [profiles,         setProfiles]         = useState([])
  const [inactiveProfiles, setInactiveProfiles] = useState([])
  const [loading,          setLoading]          = useState(true)

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

  const fetchInactive = useCallback(async () => {
    const { data } = await supabase
      .from('driver_profiles')
      .select('*')
      .eq('is_active', false)
      .order('driver_name')
    setInactiveProfiles(data ?? [])
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

  async function reactivateProfile(id) {
    await supabase.from('driver_profiles').update({ is_active: true }).eq('id', id)
    const reactivated = inactiveProfiles.find(p => p.id === id)
    setInactiveProfiles(prev => prev.filter(p => p.id !== id))
    if (reactivated) {
      setProfiles(prev =>
        [...prev, { ...reactivated, is_active: true }]
          .sort((a, b) => a.driver_name.localeCompare(b.driver_name))
      )
    }
  }

  return { profiles, inactiveProfiles, loading, saveProfile, removeProfile, reactivateProfile, fetchInactive, refetch: fetch }
}
