import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useDriverNotes() {
  const [notes,   setNotes]   = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]
    // Active = no expiry OR expiry is today or future
    const { data } = await supabase
      .from('driver_notes')
      .select('*')
      .or(`expires_at.is.null,expires_at.gte.${today}`)
      .order('created_at', { ascending: false })
    setNotes(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  // Get the active alert for a specific driver (case-insensitive)
  function getNote(driverName) {
    if (!driverName) return null
    const name = driverName.trim().toLowerCase()
    return notes.find(n => n.driver_name.trim().toLowerCase() === name) ?? null
  }

  // Save (upsert) a driver alert
  async function saveNote({ driverName, driverClickupId, company, note, expiresAt }) {
    const existing = notes.find(n => n.driver_name.trim().toLowerCase() === driverName.trim().toLowerCase())

    if (existing) {
      const { error } = await supabase
        .from('driver_notes')
        .update({ note, expires_at: expiresAt ?? null, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabase
        .from('driver_notes')
        .insert([{
          driver_name:       driverName,
          driver_clickup_id: driverClickupId ?? null,
          company:           company ?? null,
          note,
          expires_at:        expiresAt ?? null,
        }])
      if (error) throw new Error(error.message)
    }
    await fetch()
  }

  // Remove the alert for a driver
  async function clearNote(driverName) {
    const existing = notes.find(n => n.driver_name.trim().toLowerCase() === driverName.trim().toLowerCase())
    if (!existing) return
    const { error } = await supabase
      .from('driver_notes')
      .delete()
      .eq('id', existing.id)
    if (error) throw new Error(error.message)
    await fetch()
  }

  return { notes, loading, getNote, saveNote, clearNote, refresh: fetch }
}
