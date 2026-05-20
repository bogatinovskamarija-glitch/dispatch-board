import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ── Pending loads (not yet invoiced, have broker + price) ──────────────────
export function usePendingInvoices(company = 'all') {
  const [loads, setLoads]     = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('loads')
      .select('*')
      .is('invoiced_at', null)
      .not('price', 'is', null)
      .order('delivery_date', { ascending: false })
    if (company !== 'all') q = q.eq('company', company)
    const { data } = await q
    setLoads((data ?? []).filter(l => l.broker))
    setLoading(false)
  }, [company])

  useEffect(() => { fetch() }, [fetch])
  return { loads, loading, refetch: fetch }
}

// ── Invoice history ────────────────────────────────────────────────────────
export function useInvoiceHistory(company = 'all') {
  const [invoices, setInvoices] = useState([])
  const [loading,  setLoading]  = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300)
    if (company !== 'all') q = q.eq('company', company)
    const { data } = await q
    setInvoices(data ?? [])
    setLoading(false)
  }, [company])

  useEffect(() => { fetch() }, [fetch])
  return { invoices, loading, refetch: fetch }
}

// ── Loads for a given invoice ──────────────────────────────────────────────
export async function fetchInvoiceLoads(invoiceId) {
  const { data, error } = await supabase
    .from('loads')
    .select('*')
    .eq('invoice_id', invoiceId)
  if (error) throw new Error(error.message)
  return data ?? []
}

// ── Get + increment invoice number ────────────────────────────────────────
export async function getNextInvoiceNumber() {
  const { data, error } = await supabase
    .from('invoice_counter')
    .select('next_number')
    .eq('id', 1)
    .single()

  if (error || !data) {
    return 'INV-' + Date.now().toString().slice(-6)
  }

  const num = data.next_number
  await supabase
    .from('invoice_counter')
    .update({ next_number: num + 1 })
    .eq('id', 1)

  return String(num).padStart(5, '0')
}

// ── Create invoice + mark loads ────────────────────────────────────────────
export async function createInvoice(invoiceData, loadIds) {
  const invNum = await getNextInvoiceNumber()

  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .insert([{ ...invoiceData, invoice_number: invNum }])
    .select()
    .single()
  if (invErr) throw new Error(invErr.message)

  const { error: loadErr } = await supabase
    .from('loads')
    .update({
      invoiced_at:    new Date().toISOString(),
      invoice_id:     invoice.id,
      invoice_number: invNum,
    })
    .in('id', loadIds)
  if (loadErr) throw new Error(loadErr.message)

  return invoice
}

// ── Update existing invoice metadata (for re-export) ──────────────────────
export async function updateInvoice(invoiceId, data) {
  const { data: inv, error } = await supabase
    .from('invoices')
    .update(data)
    .eq('id', invoiceId)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return inv
}

// ── Driver loads for paystub (only unpaid loads) ───────────────────────────
export async function fetchDriverLoads(driverName, startDate, endDate) {
  const { data, error } = await supabase
    .from('loads')
    .select('*')
    .eq('driver_name', driverName)
    .is('paid_at', null)           // exclude already-paid loads
    .order('pickup_date', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).filter(l => {
    const d = l.pickup_date || l.date
    return d >= startDate && d <= endDate
  })
}

// ── Paystub history ────────────────────────────────────────────────────────
export function usePaystubHistory(company = 'all') {
  const [paystubs, setPaystubs] = useState([])
  const [loading,  setLoading]  = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('paystubs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300)
    if (company !== 'all') q = q.eq('company', company)
    const { data } = await q
    setPaystubs(data ?? [])
    setLoading(false)
  }, [company])

  useEffect(() => { refresh() }, [refresh])
  return { paystubs, loading, refresh }
}

// ── Loads belonging to a saved paystub ────────────────────────────────────
export async function fetchPaystubLoads(paystubId) {
  const { data, error } = await supabase
    .from('loads')
    .select('*')
    .eq('paystub_id', paystubId)
  if (error) throw new Error(error.message)
  return data ?? []
}

// ── Update an existing paystub record ────────────────────────────────────
export async function updatePaystub(id, paystubData) {
  const { error } = await supabase
    .from('paystubs')
    .update(paystubData)
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Save paystub + mark loads as paid ─────────────────────────────────────
export async function createPaystub(paystubData, loadIds) {
  const { data: paystub, error: psErr } = await supabase
    .from('paystubs')
    .insert([paystubData])
    .select()
    .single()
  if (psErr) throw new Error(psErr.message)

  if (loadIds.length > 0) {
    const { error: loadErr } = await supabase
      .from('loads')
      .update({ paid_at: new Date().toISOString(), paystub_id: paystub.id })
      .in('id', loadIds)
    if (loadErr) throw new Error(loadErr.message)
  }

  return paystub
}
