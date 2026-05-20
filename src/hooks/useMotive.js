import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Low-level call — routes through the Supabase Edge Function proxy
async function motiveGet(company, path, params = {}) {
  const { data, error } = await supabase.functions.invoke('motive-proxy', {
    body: { company, path, params },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data
}

// ── Fetch drivers + their current HOS status ────────────────────────────────
export function useMotiveDrivers(company) {
  const [drivers, setDrivers]   = useState([])
  const [loading, setLoading]   = useState(false)
  const [error,   setError]     = useState(null)
  const [lastSync, setLastSync] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const companies = company === 'all'
        ? ['carat', 'pro_freight']
        : [company]

      const results = await Promise.all(
        companies.map(async (co) => {
          const data = await motiveGet(co, '/users', { role: 'driver', per_page: 100 })
          // Motive v1 returns { users: [...] }
          const users = data?.users ?? []
          return users.map(u => ({ ...u, _company: co }))
        })
      )

      setDrivers(results.flat())
      setLastSync(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [company])

  useEffect(() => { refresh() }, [refresh])

  return { drivers, loading, error, lastSync, refresh }
}

// ── Fetch recent violations ─────────────────────────────────────────────────
export function useMotiveViolations(company) {
  const [violations, setViolations] = useState([])
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Last 7 days
      const to   = new Date()
      const from = new Date(to)
      from.setDate(from.getDate() - 7)
      const fmt = d => d.toISOString().split('T')[0]

      const companies = company === 'all'
        ? ['carat', 'pro_freight']
        : [company]

      const results = await Promise.all(
        companies.map(async (co) => {
          const data = await motiveGet(co, '/driver_violations', {
            start_time: fmt(from),
            end_time:   fmt(to),
            per_page:   100,
          })
          const viols = data?.driver_violations ?? []
          return viols.map(v => ({ ...v, _company: co }))
        })
      )

      setViolations(results.flat())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [company])

  useEffect(() => { refresh() }, [refresh])

  return { violations, loading, error, refresh }
}
