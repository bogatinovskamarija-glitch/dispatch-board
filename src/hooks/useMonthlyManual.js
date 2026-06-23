import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useMonthlyManual(year) {
  const [entries, setEntries] = useState([])

  async function fetchEntries() {
    const { data } = await supabase
      .from('monthly_manual_entries')
      .select('*')
      .eq('year', year)
    setEntries(data ?? [])
  }

  useEffect(() => { fetchEntries() }, [year])

  // Returns { gross, fuel, payroll, miles, maintenance, unit_count } summed for the given company+month
  function getManual(company, month) {
    if (company === 'all') {
      const carat = entries.find(e => e.company === 'carat'       && e.month === month) || {}
      const pro   = entries.find(e => e.company === 'pro_freight' && e.month === month) || {}
      return {
        gross:       (Number(carat.gross)       || 0) + (Number(pro.gross)       || 0),
        fuel:        (Number(carat.fuel)        || 0) + (Number(pro.fuel)        || 0),
        payroll:     (Number(carat.payroll)     || 0) + (Number(pro.payroll)     || 0),
        miles:       (Number(carat.miles)       || 0) + (Number(pro.miles)       || 0),
        maintenance: (Number(carat.maintenance) || 0) + (Number(pro.maintenance) || 0),
        unit_count:  (Number(carat.unit_count)  || 0) + (Number(pro.unit_count)  || 0),
      }
    }
    const e = entries.find(e => e.company === company && e.month === month) || {}
    return {
      gross:       Number(e.gross)       || 0,
      fuel:        Number(e.fuel)        || 0,
      payroll:     Number(e.payroll)     || 0,
      miles:       Number(e.miles)       || 0,
      maintenance: Number(e.maintenance) || 0,
      unit_count:  Number(e.unit_count)  || 0,
    }
  }

  // Returns the raw entries for both companies for a given month (for the edit modal)
  function getRawEntries(month) {
    return {
      carat:       entries.find(e => e.company === 'carat'       && e.month === month),
      pro_freight: entries.find(e => e.company === 'pro_freight' && e.month === month),
    }
  }

  // Upsert for one company+month
  async function saveEntry(company, month, data) {
    const { error } = await supabase
      .from('monthly_manual_entries')
      .upsert(
        { company, year, month, ...data },
        { onConflict: 'company,year,month' }
      )
    if (error) throw new Error(error.message)
    await fetchEntries()
  }

  // Save both companies at once
  async function saveMonth(month, caratData, proData) {
    await Promise.all([
      saveEntry('carat',       month, caratData),
      saveEntry('pro_freight', month, proData),
    ])
  }

  return { entries, getManual, getRawEntries, saveMonth }
}
