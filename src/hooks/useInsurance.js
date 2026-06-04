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

  // Total insurance for a company+month (all types summed)
  function getAmount(company, month) {
    if (company === 'all') {
      return entries
        .filter(e => e.month === month)
        .reduce((s, e) => s + (Number(e.amount) || 0), 0)
    }
    return entries
      .filter(e => e.company === company && e.month === month)
      .reduce((s, e) => s + (Number(e.amount) || 0), 0)
  }

  // Get a specific entry by company + month + type
  function getEntry(company, month, type = 'liability') {
    return entries.find(e => e.company === company && e.month === month && e.type === type)
  }

  // Upsert a single insurance entry
  async function setAmount(company, month, amount, notes = '', type = 'liability') {
    const { error } = await supabase
      .from('insurance_entries')
      .upsert(
        { company, year, month, type, amount: Number(amount) || 0, notes },
        { onConflict: 'company,year,month,type' }
      )
    if (error) throw new Error(error.message)
    await fetchEntries()
  }

  return { entries, loading, getAmount, getEntry, setAmount }
}
