import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useInsurance(year) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  async function fetchEntries() {
    setLoading(true)
    const { data } = await supabase
      .from('insurance_entries')
      .select('*')
      .eq('year', year)
    setEntries(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchEntries() }, [year])

  // Returns the amount for a given company+month (0 if not set)
  function getAmount(company, month) {
    if (company === 'all') {
      return entries
        .filter(e => e.month === month)
        .reduce((s, e) => s + (Number(e.amount) || 0), 0)
    }
    return Number(entries.find(e => e.company === company && e.month === month)?.amount) || 0
  }

  // Upsert: set amount for one company+month
  async function setAmount(company, month, amount, notes = '') {
    const { error } = await supabase
      .from('insurance_entries')
      .upsert(
        { company, year, month, amount: Number(amount) || 0, notes },
        { onConflict: 'company,year,month' }
      )
    if (error) throw new Error(error.message)
    await fetchEntries()
  }

  // For "all" company view, get per-company breakdown for a month
  function getBreakdown(month) {
    return entries.filter(e => e.month === month)
  }

  return { entries, loading, getAmount, setAmount, getBreakdown }
}
