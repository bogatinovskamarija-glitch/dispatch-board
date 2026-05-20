import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Low-level call — routes through the Supabase Edge Function proxy
async function motiveGet(company, path, params = {}) {
  const { data, error } = await supabase.functions.invoke('motive-proxy', {
    body: { company, path, params },
  })
  // FunctionsHttpError = function returned non-2xx (deployment/runtime issue)
  if (error) {
    // Try to get more detail from the response body
    const detail = error.context?.body ? await error.context.text?.() : null
    throw new Error(detail || error.message)
  }
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
          // 1. Get active drivers (small list, fits in one page)
          const userData = await motiveGet(co, '/users', { role: 'driver', status: 'active', per_page: 100 })
          const activeDrivers = (userData?.users ?? [])
            .map(u => u.user ?? u)
            .filter(u => !u.status || u.status === 'active')

          if (activeDrivers.length === 0) return []

          // 2. Fetch HOS data from /available_time — max per_page is 100, so paginate
          //    We need all pages to cover every active driver (they sort alphabetically)
          const page1 = await motiveGet(co, '/available_time', { per_page: 100, page_no: 1 })
          const total  = page1?.pagination?.total ?? 0
          const pages  = Math.ceil(total / 100)

          let hosUsers = (page1?.users ?? []).map(u => u.user ?? u)

          if (pages > 1) {
            const extraPages = await Promise.all(
              Array.from({ length: pages - 1 }, (_, i) =>
                motiveGet(co, '/available_time', { per_page: 100, page_no: i + 2 })
                  .catch(() => null)
              )
            )
            for (const p of extraPages) {
              if (p?.users) hosUsers = hosUsers.concat(p.users.map(u => u.user ?? u))
            }
          }

          // 3. Build HOS map by driver ID
          const hosMap = {}
          for (const u of hosUsers) hosMap[u.id] = u

          // 4. Merge: active driver list + HOS data
          return activeDrivers.map(u => {
            const hos = hosMap[u.id] ?? {}
            return {
              ...u,
              available_time:   hos.available_time   ?? null,
              duty_status:      hos.duty_status       ?? u.duty_status ?? 'off_duty',
              last_hos_status:  hos.last_hos_status   ?? null,
              _company: co,
            }
          })
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
          try {
            const data = await motiveGet(co, '/hos_violations', {
              start_date: fmt(from),
              end_date:   fmt(to),
              per_page:   100,
            })
            // Motive v1: { hos_violations: [ { hos_violation: {...} }, ... ] }
            const viols = data?.hos_violations ?? data?.violations ?? []
            return viols.map(v => ({ ...(v.hos_violation ?? v), _company: co }))
          } catch {
            return []   // violations are bonus data — don't fail the whole page
          }
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
