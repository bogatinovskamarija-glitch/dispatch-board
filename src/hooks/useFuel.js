import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useFuelTransactions(from, to, company = 'all') {
  const [transactions, setTransactions] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [dbMissing,    setDbMissing]    = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      let q = supabase
        .from('fuel_transactions')
        .select('*')
        .gte('transaction_date', from)
        .lte('transaction_date', to)
        .order('transaction_date', { ascending: true })
      if (company !== 'all') q = q.eq('company', company)
      const { data, error } = await q
      if (error) {
        const missing = error.code === '42P01' || error.message?.includes('schema cache')
        if (missing) setDbMissing(true)
        else throw error
        setTransactions([])
      } else {
        setDbMissing(false)
        setTransactions(data ?? [])
      }
    } catch (e) {
      console.warn('Fuel query error:', e.message)
      setTransactions([])
    }
    setLoading(false)
  }, [from, to, company])

  useEffect(() => { fetch() }, [fetch])
  return { transactions, loading, dbMissing, refetch: fetch }
}

export async function importFuelTransactions(rows) {
  // Insert in batches of 500 to stay within Supabase limits
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500)
    const { error } = await supabase.from('fuel_transactions').insert(batch)
    if (error) throw new Error(error.message)
  }
}

export async function clearFuelWeek(from, to, company) {
  let q = supabase
    .from('fuel_transactions')
    .delete()
    .gte('transaction_date', from)
    .lte('transaction_date', to)
  if (company !== 'all') q = q.eq('company', company)
  const { error } = await q
  if (error) throw new Error(error.message)
}
