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

    if (truckNumber === 'ALL') {
      let q = supabase
        .from('ifta_mileage_entries')
        .select('state, miles')
        .eq('year', year)
        .eq('quarter', quarter)
      if (company !== 'all') q = q.eq('company', company)
      const { data } = await q
      const map = {}
      for (const r of (data ?? [])) {
        map[r.state] = (map[r.state] || 0) + Number(r.miles)
      }
      setMiles(map)
    } else {
      const co = company !== 'all' ? company : 'carat'
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

// ── HUT reference: miles for KY/NM/CT/NY per truck ───────────────────────────
// KY/NM/CT are quarterly — only the selected quarter's miles
// NY is annual — sum of all quarters in the year
export function useHUTData(year, quarter, company) {
  const [hutByTruck, setHutByTruck] = useState({}) // { truckNum: { KY, NM, CT, NY } }
  const [loading,    setLoading]    = useState(true)
  const HUT_STATES = ['KY', 'NM', 'CT', 'NY']

  const fetch = useCallback(async () => {
    setLoading(true)
    let hutQ = supabase
      .from('ifta_mileage_entries')
      .select('truck_number, quarter, state, miles')
      .eq('year', year)
      .in('state', HUT_STATES)
    if (company !== 'all') hutQ = hutQ.eq('company', company)
    const { data } = await hutQ
    const byTruck = {}
    for (const r of (data ?? [])) {
      const t = r.truck_number
      if (!byTruck[t]) byTruck[t] = { KY: 0, NM: 0, CT: 0, NY: 0 }
      // KY/NM/CT: quarterly — only count miles from the selected quarter
      // NY: annual — sum all quarters
      if (r.state === 'NY') {
        byTruck[t].NY += Number(r.miles)
      } else if (Number(r.quarter) === Number(quarter)) {
        byTruck[t][r.state] = (byTruck[t][r.state] || 0) + Number(r.miles)
      }
    }
    setHutByTruck(byTruck)
    setLoading(false)
  }, [year, quarter, company])

  useEffect(() => { fetch() }, [fetch])
  return { hutByTruck, loading, refetch: fetch }
}

// ── State full name → 2-letter abbreviation (IFTA jurisdictions only) ─────────
export const STATE_NAME_TO_ABBR = {
  'Alabama': 'AL', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
  'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL',
  'Georgia': 'GA', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN',
  'Iowa': 'IA', 'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA',
  'Maine': 'ME', 'Maryland': 'MD', 'Massachusetts': 'MA', 'Michigan': 'MI',
  'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO', 'Montana': 'MT',
  'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
  'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND',
  'Ohio': 'OH', 'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA',
  'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD',
  'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
  'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY',
  // DC is not an IFTA jurisdiction — intentionally omitted
}

// Parse a single CSV line handling quoted fields ("1,234.56")
function parseCSVLine(line) {
  const cols = []
  let cur = ''
  let inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ }
    else if (ch === ',' && !inQ) { cols.push(cur); cur = '' }
    else { cur += ch }
  }
  cols.push(cur)
  return cols
}

// Parse Motive distance_summary_by_vehicle CSV
// Returns { truckNumber: { ST: miles } }
export function parseMotiveCSV(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  // First line is header: Vehicle,Jurisdiction,Distance (mi),Fuel (gal)
  const result = {}
  for (const line of lines.slice(1)) {
    const cols = parseCSVLine(line)
    if (cols.length < 3) continue
    const truck = cols[0].trim()
    const juris = cols[1].trim()
    const miles = parseFloat((cols[2] || '').replace(/,/g, ''))
    if (!truck || !juris || isNaN(miles) || miles <= 0) continue
    const st = STATE_NAME_TO_ABBR[juris]
    if (!st) continue  // skip DC and unknown jurisdictions
    if (!result[truck]) result[truck] = {}
    result[truck][st] = (result[truck][st] || 0) + miles
  }
  return result
}

// ── Detect which company each truck belongs to based on load history ──────────
// Uses the dominant company (most loads) for each truck in the given date range.
// Falls back to `fallback` when a truck has no loads in that period.
export async function detectTruckCompanies(truckNumbers, from, to, fallback = 'carat') {
  if (!truckNumbers.length) return {}
  const { data } = await supabase
    .from('loads')
    .select('truck_number, company')
    .in('truck_number', truckNumbers.map(String))
    .gte('pickup_date', from)
    .lte('pickup_date', to)
    .not('company', 'is', null)

  const counts = {}
  for (const row of (data ?? [])) {
    const t = String(row.truck_number || '').trim()
    const c = row.company
    if (!t || !c) continue
    if (!counts[t]) counts[t] = {}
    counts[t][c] = (counts[t][c] || 0) + 1
  }

  const result = {}
  for (const truck of truckNumbers) {
    const t = String(truck).trim()
    const co = counts[t]
    result[t] = co
      ? Object.entries(co).sort((a, b) => b[1] - a[1])[0][0]
      : fallback
  }
  return result
}

// ── Bulk save mileage for all trucks from CSV import ─────────────────────────
// truckCompanyMap: { truckNumber: 'carat'|'pro_freight' } — detected from loads
export async function saveIFTAMileageBulk(year, quarter, truckMilesMap, truckCompanyMap, fallback = 'carat') {
  const rows = []
  for (const [truck, stateMap] of Object.entries(truckMilesMap)) {
    const co = (truckCompanyMap && truckCompanyMap[truck]) || fallback
    for (const [state, miles] of Object.entries(stateMap)) {
      rows.push({
        company: co, year, quarter,
        truck_number: truck,
        state,
        miles: Math.round(miles * 100) / 100,
        updated_at: new Date().toISOString(),
      })
    }
  }
  if (!rows.length) return 0
  const { error } = await supabase
    .from('ifta_mileage_entries')
    .upsert(rows, { onConflict: 'company,year,quarter,truck_number,state' })
  if (error) throw new Error(error.message)
  return rows.length
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
