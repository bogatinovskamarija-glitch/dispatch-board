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
  // Atomic increment via RPC — fall back to timestamp-based if RPC missing
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

  // Insert invoice record
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .insert([{ ...invoiceData, invoice_number: invNum }])
    .select()
    .single()
  if (invErr) throw new Error(invErr.message)

  // Mark loads as invoiced
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

// ── Driver loads for paystub ───────────────────────────────────────────────
export async function fetchDriverLoads(driverName, startDate, endDate) {
  const { data, error } = await supabase
    .from('loads')
    .select('*')
    .eq('driver_name', driverName)
    .order('pickup_date', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).filter(l => {
    const d = l.pickup_date || l.date
    return d >= startDate && d <= endDate
  })
}
