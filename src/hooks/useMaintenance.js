import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export function useMaintenance(filters = {}) {
  const [records, setRecords]   = useState([])
  const [loading, setLoading]   = useState(false)
  const filtersKey = JSON.stringify(filters)

  async function fetchRecords() {
    setLoading(true)

    // Build the base query with all filters applied
    function buildQuery() {
      let q = supabase
        .from('maintenance_records')
        .select('*')
        .order('date', { ascending: false })

      if (filters.company && filters.company !== 'all')
        q = q.eq('company', filters.company)
      if (filters.unit_type && filters.unit_type !== 'all')
        q = q.ilike('unit_type', filters.unit_type)
      if (filters.category && filters.category !== 'all')
        q = q.eq('category', filters.category)
      if (filters.unit_number)
        q = q.ilike('unit_number', `%${filters.unit_number}%`)
      if (filters.search)
        q = q.ilike('description', `%${filters.search}%`)
      if (filters.dateFrom)
        q = q.gte('date', filters.dateFrom)
      if (filters.dateTo)
        q = q.lte('date', filters.dateTo)

      return q
    }

    // Paginate to overcome Supabase's 1000-row default limit
    const PAGE = 1000
    let all = [], from = 0
    while (true) {
      const { data, error } = await buildQuery().range(from, from + PAGE - 1)
      if (error) break
      if (data && data.length > 0) all = all.concat(data)
      if (!data || data.length < PAGE) break
      from += PAGE
    }
    setRecords(all)
    setLoading(false)
  }

  useEffect(() => { fetchRecords() }, [filtersKey])

  async function addRecord(record) {
    const { data, error } = await supabase
      .from('maintenance_records')
      .insert([record])
      .select()
      .single()
    if (error) throw new Error(error.message)
    await fetchRecords()
    return data
  }

  async function updateRecord(id, changes) {
    const { error } = await supabase
      .from('maintenance_records')
      .update(changes)
      .eq('id', id)
    if (error) throw new Error(error.message)
    await fetchRecords()
  }

  async function removeRecord(id) {
    const { error } = await supabase
      .from('maintenance_records')
      .delete()
      .eq('id', id)
    if (error) throw new Error(error.message)
    await fetchRecords()
  }

  async function bulkInsert(rows) {
    const CHUNK = 400
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase
        .from('maintenance_records')
        .insert(rows.slice(i, i + CHUNK))
      if (error) throw new Error(error.message)
    }
    await fetchRecords()
  }

  return { records, loading, addRecord, updateRecord, removeRecord, bulkInsert, refresh: fetchRecords }
}

export function useMaintenanceShops() {
  const [shops, setShops]   = useState([])
  const [loading, setLoading] = useState(false)

  async function fetchShops() {
    setLoading(true)
    const { data, error } = await supabase
      .from('maintenance_shops')
      .select('*')
      .order('name')
    if (!error) setShops(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchShops() }, [])

  async function addShop(name, notes = '') {
    const trimmed = name.trim()
    if (!trimmed) return null
    const { data, error } = await supabase
      .from('maintenance_shops')
      .insert([{ name: trimmed, notes }])
      .select()
      .single()
    if (error) throw new Error(error.message)
    await fetchShops()
    return data
  }

  async function updateShop(id, changes) {
    const { error } = await supabase
      .from('maintenance_shops')
      .update(changes)
      .eq('id', id)
    if (error) throw new Error(error.message)
    await fetchShops()
  }

  async function removeShop(id) {
    const { error } = await supabase
      .from('maintenance_shops')
      .delete()
      .eq('id', id)
    if (error) throw new Error(error.message)
    await fetchShops()
  }

  return { shops, loading, addShop, updateShop, removeShop, refresh: fetchShops }
}

// ── Date range helpers ─────────────────────────────────────────────────────
export function getDateRange(periodType, year, month, quarter) {
  if (periodType === 'all') return { dateFrom: null, dateTo: null }

  const y = Number(year)
  if (!y) return { dateFrom: null, dateTo: null }

  if (periodType === 'year') {
    return { dateFrom: `${y}-01-01`, dateTo: `${y}-12-31` }
  }
  if (periodType === 'quarter') {
    const q = Number(quarter)
    const m0 = (q - 1) * 3 + 1
    const m1 = m0 + 2
    const lastDay = new Date(y, m1, 0).getDate()
    return {
      dateFrom: `${y}-${String(m0).padStart(2,'0')}-01`,
      dateTo:   `${y}-${String(m1).padStart(2,'0')}-${lastDay}`,
    }
  }
  if (periodType === 'month') {
    const m = Number(month)
    const lastDay = new Date(y, m, 0).getDate()
    return {
      dateFrom: `${y}-${String(m).padStart(2,'0')}-01`,
      dateTo:   `${y}-${String(m).padStart(2,'0')}-${lastDay}`,
    }
  }
  return { dateFrom: null, dateTo: null }
}

// ── CSV Parser ─────────────────────────────────────────────────────────────
// Parses the Google Sheets export format for maintenance records.
// Columns: Year, Month, Date, Unit Number, Unit Type, Category, Description,
//          Amount, Mileage, PM Code, Invoice
export function parseMaintenanceCSV(text, company) {
  const CATEGORY_MAP = {
    'pm':               'pm',
    'pm ':              'pm',
    'tire':             'tire',
    'other':            'other',
    'ac':               'ac',
    'light':            'light',
    'batteries':        'batteries',
    'dot inspection':   'dot_inspection',
    'dot':              'dot_inspection',
    'steering tires':   'steering_tires',
    'steering':         'steering_tires',
  }

  // Full CSV parser: handles quoted fields with embedded commas AND newlines
  function parseCSV(raw) {
    const rows = []
    let cols = [], cur = '', inQuote = false

    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]
      if (ch === '"') {
        // Handle escaped quotes ("")
        if (inQuote && raw[i + 1] === '"') { cur += '"'; i++; continue }
        inQuote = !inQuote
        continue
      }
      if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = ''; continue }
      if ((ch === '\n' || (ch === '\r' && raw[i+1] === '\n')) && !inQuote) {
        if (ch === '\r') i++ // skip \n of \r\n
        cols.push(cur.trim())
        if (cols.some(c => c)) rows.push(cols)  // skip fully blank rows
        cols = []; cur = ''
        continue
      }
      if (ch === '\r') continue  // bare \r
      cur += ch
    }
    cols.push(cur.trim())
    if (cols.some(c => c)) rows.push(cols)
    return rows
  }

  function parseDate(dateStr, yearFallback) {
    if (!dateStr) return null
    const parts = dateStr.trim().split('/')
    if (parts.length < 2) return null
    const month = parts[0].padStart(2, '0')
    const day   = parts[1].padStart(2, '0')
    let year = parts[2]
    // Fix typos (e.g. 0202) — use yearFallback for clearly wrong years
    if (!year || year.length < 4 || Number(year) < 2010 || Number(year) > 2030) {
      year = String(yearFallback)
    }
    const y = Number(year), m = Number(month), d = Number(day)
    if (y < 2010 || y > 2030 || m < 1 || m > 12 || d < 1 || d > 31) return null
    return `${y}-${month}-${day}`
  }

  function parseAmount(amtStr) {
    if (!amtStr) return null
    const cleaned = amtStr.replace(/[$,\s]/g, '')
    const n = parseFloat(cleaned)
    return isNaN(n) || n === 0 ? null : n
  }

  const rows = parseCSV(text)
  const records = []
  let skipped = 0
  let lastYear = null  // carry-forward: Google Sheets often only fills year on first row of each year
  const diagSamples = []  // first 8 raw rows for diagnostics

  for (const cols of rows) {
    const yearVal = (cols[0] || '').trim()
    const dateStr = (cols[2] || '').trim()
    const unitNum = (cols[3] || '').trim()
    const unitRaw = (cols[4] || '').trim()
    const catRaw  = (cols[5] || '').trim()
    const desc    = (cols[6] || '').trim()
    const amtRaw  = (cols[7] || '').trim()
    // col[8] may be blank spacer column in some exports — try both positions for mileage
    const col8    = (cols[8] || '').trim()
    const col9    = (cols[9] || '').trim()
    const col10   = (cols[10] || '').trim()
    const col11   = (cols[11] || '').trim()
    // Auto-detect if there's a blank spacer column at position 8:
    // If col8 is blank and col9 looks like mileage (numeric) or col10 looks like invoice, use offset
    const hasSpacerCol = col8 === '' && (col9.match(/^\d+$/) || col10.match(/^[A-Z]-\d+$/i))
    const mileage = hasSpacerCol ? col9  : col8
    const pmCode  = hasSpacerCol ? col10 : col9
    const invoice = hasSpacerCol ? col11 : col10

    // Skip header row and Google Sheets filter row
    const yearLower = yearVal.toLowerCase()
    if (yearLower === 'year' || yearLower.startsWith('filter')) { skipped++; continue }

    // Collect first 8 data rows for diagnostics (after header)
    if (diagSamples.length < 8) diagSamples.push(cols.slice(0, 12))

    // Update carry-forward year when we see a valid year
    const parsedYear = parseInt(yearVal, 10)
    if (parsedYear >= 2010 && parsedYear <= 2030) {
      lastYear = parsedYear
    }

    // Use explicit year or carry-forward from previous rows
    const yearNum = (parsedYear >= 2010 && parsedYear <= 2030) ? parsedYear : lastYear
    if (!yearNum) { skipped++; continue }  // no year context at all

    // Skip year-total rows: year present but no unit number and no date
    // (These are summary rows like "2024,,,,,,,  $333,204.74,,,")
    if (!unitNum && !dateStr) { skipped++; continue }

    // Need at least an amount or a description or a unit to be worth importing
    const amount = parseAmount(amtRaw)
    if (amount == null && !desc && !unitNum) { skipped++; continue }

    const date     = parseDate(dateStr, yearNum)
    const unitType = unitRaw.toLowerCase() || 'unknown'
    const catKey   = catRaw.toLowerCase()
    const category = CATEGORY_MAP[catKey] || 'other'

    records.push({
      company,
      date,
      unit_number: unitNum || null,
      unit_type:   unitType,
      category,
      description: desc || null,
      amount,
      mileage:     mileage || null,
      pm_code:     pmCode  || null,
      invoice:     invoice || null,
      shop_name:   null,
      shop_id:     null,
    })
  }

  const nullAmountCount = records.filter(r => r.amount == null).length
  return { records, skipped, nullAmountCount, diagSamples }
}

// ── Total maintenance spend for a week ────────────────────────────────────
export function useWeekMaintenanceTotal(start, end, company = 'all') {
  const [total, setTotal] = useState(0)
  useEffect(() => {
    async function load() {
      let q = supabase
        .from('maintenance_records')
        .select('amount')
        .gte('date', start)
        .lte('date', end)
      if (company !== 'all') q = q.eq('company', company)
      const { data } = await q
      setTotal((data ?? []).reduce((s, r) => s + (Number(r.amount) || 0), 0))
    }
    load()
  }, [start, end, company])
  return total
}

