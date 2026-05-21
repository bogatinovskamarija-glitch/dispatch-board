import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Default fallback if DB row hasn't loaded yet
const DEFAULTS = {
  company_carat: {
    name:    'CARAT EXPEDITED INC',
    address: '475 S Frontage Rd Ste 210',
    city:    'Burr Ridge, IL 60527',
    phone:   '630-491-5555',
  },
  company_pro_freight: {
    name:    'PRO FREIGHT TRANSPORTATION INC',
    address: '475 S Frontage Rd Ste 210B',
    city:    'Burr Ridge, IL 60527',
    phone:   '',
  },
}

export function useCompanySettings() {
  const [companies, setCompanies] = useState(DEFAULTS)
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('settings')
        .select('key, value')
        .in('key', ['company_carat', 'company_pro_freight'])
      if (data?.length) {
        const merged = { ...DEFAULTS }
        for (const row of data) merged[row.key] = { ...merged[row.key], ...row.value }
        setCompanies(merged)
      }
      setLoading(false)
    }
    load()
  }, [])

  async function saveSetting(key, value) {
    setSaving(true)
    const { error } = await supabase
      .from('settings')
      .upsert({ key, value }, { onConflict: 'key' })
    if (error) throw new Error(error.message)
    setCompanies(prev => ({ ...prev, [key]: { ...prev[key], ...value } }))
    setSaving(false)
  }

  return { companies, loading, saving, saveSetting }
}
