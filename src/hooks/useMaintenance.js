import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export function useMaintenance(filters = {}) {
  const [records, setRecords]   = useState([])
  const [loading, setLoading]   = useState(false)
  const filtersKey = JSON.stringify(filters)

  async function fetchRecords() {
    setLoading(true)
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

    const { data, error } = await q.limit(2000)
    if (!error) setRecords(data || [])
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
  }

  function parseRow(raw) {
    // Simple CSV parser that handles quoted fields with commas
    const cols = []
    let cur = '', inQuote = false
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]
      if (ch === '"') { inQuote = !inQuote; continue }
      if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = ''; continue }
      cur += ch
    }
    cols.push(cur.trim())
    return cols
  }

  function parseDate(dateStr, yearFallback) {
    if (!dateStr) return null
    // Handle MM/DD/YYYY, M/D/YYYY, MM/DD (partial)
    const parts = dateStr.split('/')
    if (parts.length < 2) return null
    const month = parts[0].padStart(2, '0')
    const day   = parts[1].padStart(2, '0')
    let year  = parts[2]
    // fix obvious typos like 0202 → skip, or 2032 → plausible
    if (!year || year.length < 4) year = String(yearFallback)
    const y = Number(year)
    const m = Number(month)
    const d = Number(day)
    if (y < 2010 || y > 2030 || m < 1 || m > 12 || d < 1 || d > 31) return null
    return `${y}-${month}-${day}`
  }

  function parseAmount(amtStr) {
    if (!amtStr) return null
    const cleaned = amtStr.replace(/[$,]/g, '').trim()
    const n = parseFloat(cleaned)
    return isNaN(n) ? null : n
  }

  const lines = text.split('\n')
  const records = []
  let skipped = 0

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim()
    if (!raw) continue
    const cols = parseRow(raw)

    // Skip header row
    if (cols[0]?.toLowerCase() === 'year') continue

    const yearVal = cols[0]
    const dateStr = cols[2]
    const unitNum = cols[3]
    const unitRaw = cols[4]
    const catRaw  = cols[5]
    const desc    = cols[6]
    const amtRaw  = cols[7]
    const mileage = cols[8]
    const pmCode  = cols[9]
    const invoice = cols[10]

    // Skip year-total / blank rows (no unit and no date)
    if (!unitNum && (!dateStr || !amtRaw)) { skipped++; continue }

    // Skip rows that are clearly year total lines (e.g., amount like "$297,112.51" with no unit)
    if (!unitNum || !unitRaw) { skipped++; continue }

    const yearNum = parseInt(yearVal, 10)
    if (!yearNum || yearNum < 2010 || yearNum > 2030) { skipped++; continue }

    const date    = parseDate(dateStr, yearNum)
    const amount  = parseAmount(amtRaw)
    const unitType = (unitRaw || '').trim().toLowerCase() // 'tractor' or 'trailer'
    const catKey  = (catRaw || '').trim().toLowerCase()
    const category = CATEGORY_MAP[catKey] || 'other'

    records.push({
      company,
      date,
      unit_number: String(unitNum).trim(),
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

  return { records, skipped }
}
