import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useFactoringCompanies() {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('factoring_companies')
      .select('*')
      .order('name')
      .then(({ data }) => {
        setCompanies(data ?? [])
        setLoading(false)
      })
  }, [])

  async function saveCompany(company) {
    if (company.id) {
      const { data, error } = await supabase
        .from('factoring_companies')
        .update({ name: company.name, address: company.address, phone: company.phone, email: company.email })
        .eq('id', company.id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      setCompanies(cs => cs.map(c => c.id === data.id ? data : c))
      return data
    } else {
      const { data, error } = await supabase
        .from('factoring_companies')
        .insert([{ name: company.name, address: company.address, phone: company.phone || null, email: company.email || null }])
        .select()
        .single()
      if (error) throw new Error(error.message)
      setCompanies(cs => [...cs, data])
      return data
    }
  }

  async function removeCompany(id) {
    const { error } = await supabase.from('factoring_companies').delete().eq('id', id)
    if (error) throw new Error(error.message)
    setCompanies(cs => cs.filter(c => c.id !== id))
  }

  return { companies, loading, saveCompany, removeCompany }
}
