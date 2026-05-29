import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ── Expense configuration ─────────────────────────────────────────────────
// deduction: true  → appears in Deductions section of paystub
// addition:  true  → appears in Additions (reimbursement) section of paystub
export const EXPENSE_CONFIG = {
  // Advances — deduction only (driver owes it back)
  cash_advance: { label: 'Cash Advance', deduction: true,  addition: false, color: '#DC2626', bg: '#FEF2F2', group: 'advance' },
  zelle:        { label: 'Zelle',        deduction: true,  addition: false, color: '#DC2626', bg: '#FEF2F2', group: 'advance' },
  // Company-paid expenses — deduction + reimbursement (net $0 on check, both documented)
  parking:      { label: 'Parking',      deduction: true,  addition: true,  color: '#D97706', bg: '#FFFBEB', group: 'expense' },
  washout:      { label: 'Washout',      deduction: true,  addition: true,  color: '#D97706', bg: '#FFFBEB', group: 'expense' },
  fuel:         { label: 'Fuel',         deduction: true,  addition: true,  color: '#D97706', bg: '#FFFBEB', group: 'expense' },
  ifta:         { label: 'IFTA',         deduction: true,  addition: true,  color: '#D97706', bg: '#FFFBEB', group: 'expense' },
  maintenance:  { label: 'Maintenance',  deduction: true,  addition: true,  color: '#D97706', bg: '#FFFBEB', group: 'expense' },
  tolls:        { label: 'Tolls',        deduction: true,  addition: true,  color: '#D97706', bg: '#FFFBEB', group: 'expense' },
  other:        { label: 'Other',        deduction: true,  addition: true,  color: '#D97706', bg: '#FFFBEB', group: 'expense' },
  // Reimbursables — addition only (extra pay owed to driver)
  detention:    { label: 'Detention',    deduction: false, addition: true,  color: '#059669', bg: '#ECFDF5', group: 'reimbursable' },
  lumper:       { label: 'Lumper',       deduction: false, addition: true,  color: '#059669', bg: '#ECFDF5', group: 'reimbursable' },
  bonus:        { label: 'Bonus',        deduction: false, addition: true,  color: '#059669', bg: '#ECFDF5', group: 'reimbursable' },
  tonu:         { label: 'TONU',         deduction: false, addition: true,  color: '#7C3AED', bg: '#F5F3FF', group: 'reimbursable' },
}

export const EXPENSE_GROUPS = [
  { label: 'Advances — Deduction only',          types: ['cash_advance', 'zelle'] },
  { label: 'Expenses — Deducted + Reimbursed',   types: ['parking', 'washout', 'fuel', 'ifta', 'maintenance', 'tolls', 'other'] },
  { label: 'Reimbursables — Addition only',       types: ['detention', 'lumper', 'bonus', 'tonu'] },
]

// ── Hooks ────────────────────────────────────────────────────────────────
export function useLedgerEntries(from, to, company = 'all', driverFilter = '') {
  const [entries,   setEntries]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [dbMissing, setDbMissing] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      let q = supabase
        .from('ledger_entries')
        .select('*')
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true })
      if (company !== 'all') q = q.eq('company', company)
      if (driverFilter)      q = q.eq('driver_name', driverFilter)
      const { data, error } = await q
      if (error) {
        // PostgREST returns "schema cache" message when the table doesn't exist yet
        const isTableMissing =
          error.code === '42P01' ||
          error.message?.includes('schema cache') ||
          error.message?.includes('does not exist') ||
          error.message?.includes('ledger_entries')
        if (isTableMissing) setDbMissing(true)
        else throw error
        setEntries([])
      } else {
        setDbMissing(false)
        setEntries(data ?? [])
      }
    } catch (e) {
      console.warn('Ledger fetch error:', e.message)
      setEntries([])
    }
    setLoading(false)
  }, [from, to, company, driverFilter])

  useEffect(() => { fetch() }, [fetch])
  return { entries, loading, dbMissing, refetch: fetch }
}

// ── CRUD ────────────────────────────────────────────────────────────────
export async function addLedgerEntry(entry) {
  const { data, error } = await supabase
    .from('ledger_entries').insert([entry]).select().single()
  if (error) {
    if (error.message?.includes('schema cache') || error.message?.includes('does not exist'))
      throw new Error('The ledger table has not been created yet. Please run the SQL setup in your Supabase dashboard, then refresh the page.')
    throw new Error(error.message)
  }
  return data
}

export async function updateLedgerEntry(id, fields) {
  const { error } = await supabase
    .from('ledger_entries').update(fields).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteLedgerEntry(id) {
  const { error } = await supabase
    .from('ledger_entries').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Paystub integration ──────────────────────────────────────────────────
// Fetch ALL unapplied entries for a driver (no date restriction —
// entries from any previous week show until applied to a paystub)
export async function fetchDriverLedgerEntries(driverName) {
  try {
    const { data, error } = await supabase
      .from('ledger_entries')
      .select('*')
      .eq('driver_name', driverName)
      .is('applied_at', null)
      .order('date', { ascending: true })
    if (error) throw error
    return data ?? []
  } catch (e) {
    console.warn('Could not fetch ledger entries for paystub:', e.message)
    return []
  }
}

// Outstanding entries from weeks before `beforeDate` (drives the reminder banner)
export function useOutstandingLedgerEntries(beforeDate, company = 'all') {
  const [entries, setEntries] = useState([])

  const fetch = useCallback(async () => {
    try {
      let q = supabase
        .from('ledger_entries')
        .select('*')
        .lt('date', beforeDate)
        .is('applied_at', null)
        .order('date', { ascending: true })
      if (company !== 'all') q = q.eq('company', company)
      const { data, error } = await q
      if (error) throw error
      setEntries(data ?? [])
    } catch (e) {
      setEntries([])
    }
  }, [beforeDate, company])

  useEffect(() => { fetch() }, [fetch])
  return { entries, refetch: fetch }
}

// Stamp entries as applied once the paystub is saved
export async function markLedgerEntriesApplied(entryIds, paystubId) {
  if (!entryIds?.length) return
  try {
    await supabase
      .from('ledger_entries')
      .update({ applied_paystub_id: paystubId, applied_at: new Date().toISOString() })
      .in('id', entryIds)
  } catch (e) {
    console.warn('Could not mark ledger entries applied:', e.message)
  }
}
