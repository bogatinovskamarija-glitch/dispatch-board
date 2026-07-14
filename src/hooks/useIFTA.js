import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function quarterRange(year, q) {
  const ranges = [
    [`${year}-01-01`, `${year}-03-31`],
    [`${year}-04-01`, `${year}-06-30`],
    [`${year}-07-01`, `${year}-09-30`],
    [`${year}-10-01`, `${year}-12-31`],
  ]
  return { from: ranges[q - 1][0], to: ranges[q - 1][1] }
}

// Extract 2-letter state abbreviation from "Stop Name, ST"
export function parseState(loc) {
  if (!loc) return null
  const last = loc.split(',').pop().trim()
  return /^[A-Z]{2}$/.test(last) ? last : null
}

// ── Active trucks for the quarter (union of fuel + mileage data) ──────────────
export function useIFTATrucks(year, quarter, company) {
  const [trucks, setTrucks] = useState([])

  const fetch = useCallback(async () => {
    const { from, to } = quarterRange(year, quarter)
    const co = company !== 'all' ? company : null

    let fuelQ = supabase
      .from('fuel_transactions')
      .select('truck_number')
      .gte('transaction_date', from)
      .lte('transaction_date', to)
    if (co) fuelQ = fuelQ.eq('company', co)

    let milesQ = supabase
      .from('ifta_mileage_entries')
      .select('truck_number')
      .eq('year', year)
      .eq('quarter', quarter)
    if (co) milesQ = milesQ.eq('company', co)

    const [fuelRes, milesRes] = await Promise.all([fuelQ, milesQ])
    const set = new Set()
    for (const r of (fuelRes.data ?? [])) if (r.truck_number) set.add(r.truck_number)
    for (const r of (milesRes.data ?? [])) if (r.truck_number) set.add(r.truck_number)
    setTrucks([...set].sort((a, b) => Number(a) - Number(b)))
  }, [year, quarter, company])

  useEffect(() => { fetch() }, [fetch])
  return { trucks, refetch: fetch }
}

// ── Diesel gallons by state for the selected truck/quarter ────────────────────
export function useIFTAFuel(year, quarter, company, truckNumber) {
  const [fuelByState, setFuelByState] = useState({})
  const [totalGal,    setTotalGal]    = useState(0)
  const [loading,     setLoading]     = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { from, to } = quarterRange(year, quarter)
    let q = supabase
      .from('fuel_transactions')
      .select('truck_number, location, gallons, fuel_category')
      .gte('transaction_date', from)
      .lte('transaction_date', to)
    if (company !== 'all') q = q.eq('company', company)
    if (truckNumber !== 'ALL') q = q.eq('truck_number', truckNumber)

    const { data } = await q
    const byState = {}
    let total = 0

    for (const t of (data ?? [])) {
      const cat = (t.fuel_category || '').toUpperCase()
      // Skip reefer fuel (ULSR) and DEF — only diesel (ULSD) counts for IFTA
      if (cat && (cat.includes('ULSR') || cat.includes('DEF'))) continue
      const gal = Number(t.gallons) || 0
      const st  = parseState(t.location)
      if (st) {
        byState[st] = (byState[st] || 0) + gal
      }
      total += gal
    }

    setFuelByState(byState)
    setTotalGal(total)
    setLoading(false)
  }, [year, quarter, company, truckNumber])

  useEffect(() => { fetch() }, [fetch])
  return { fuelByState, totalGal, loading, refetch: fetch }
}

// ── Mileage entries for one truck (or aggregated for ALL) ─────────────────────
export function useIFTAMileage(year, quarter, company, truckNumber) {
  const [miles,   setMiles]   = useState({}) // { ST: miles }
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const co = company !== 'all' ? company : 'carat'

    if (truckNumber === 'ALL') {
      // Aggregate across all trucks
      const { data } = await supabase
        .from('ifta_mileage_entries')
        .select('state, miles')
        .eq('company', co)
        .eq('year', year)
        .eq('quarter', quarter)
      const map = {}
      for (const r of (data ?? [])) {
        map[r.state] = (map[r.state] || 0) + Number(r.miles)
      }
      setMiles(map)
    } else {
      const { data } = await supabase
        .from('ifta_mileage_entries')
        .select('state, miles')
        .eq('company', co)
        .eq('year', year)
        .eq('quarter', quarter)
        .eq('truck_number', truckNumber)
      const map = {}
      for (const r of (data ?? [])) map[r.state] = Number(r.miles)
      setMiles(map)
    }
    setLoading(false)
  }, [year, quarter, company, truckNumber])

  useEffect(() => { fetch() }, [fetch])
  return { miles, loading, refetch: fetch }
}

// ── HUT reference: miles for KY/NM/CT/NY per truck per quarter ───────────────
export function useHUTData(year, company) {
  const [hutByTruck, setHutByTruck] = useState({}) // { truckNum: { KY, NM, CT, NY } }
  const [loading,    setLoading]    = useState(true)
  const HUT_STATES = ['KY', 'NM', 'CT', 'NY']

  const fetch = useCallback(async () => {
    setLoading(true)
    const co = company !== 'all' ? company : 'carat'
    const { data } = await supabase
      .from('ifta_mileage_entries')
      .select('truck_number, quarter, state, miles')
      .eq('company', co)
      .eq('year', year)
      .in('state', HUT_STATES)
    const byTruck = {}
    for (const r of (data ?? [])) {
      const t = r.truck_number
      if (!byTruck[t]) byTruck[t] = { KY: 0, NM: 0, CT: 0, NY: 0 }
      byTruck[t][r.state] = (byTruck[t][r.state] || 0) + Number(r.miles)
    }
    setHutByTruck(byTruck)
    setLoading(false)
  }, [year, company])

  useEffect(() => { fetch() }, [fetch])
  return { hutByTruck, loading, refetch: fetch }
}

// ── Save mileage entries for one truck ────────────────────────────────────────
export async function saveIFTAMileage(company, year, quarter, truckNumber, milesMap) {
  const co = company !== 'all' ? company : 'carat'
  const rows = Object.entries(milesMap)
    .map(([state, miles]) => ({
      company: co, year, quarter,
      truck_number: truckNumber,
      state,
      miles: Number(miles) || 0,
      updated_at: new Date().toISOString(),
    }))
  if (!rows.length) return

  const { error } = await supabase
    .from('ifta_mileage_entries')
    .upsert(rows, { onConflict: 'company,year,quarter,truck_number,state' })
  if (error) throw new Error(error.message)
}
