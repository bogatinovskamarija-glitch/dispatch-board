import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Statuses that are valid for invoicing — excludes ghost/non-delivery statuses
const INVOICEABLE_STATUSES = ['covered', 'at_pickup', 'at_delivery', 'tonu']

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
      .in('status', INVOICEABLE_STATUSES)
      .order('delivery_date', { ascending: false })
    if (company !== 'all') q = q.eq('company', company)
    const { data } = await q
    // Also exclude manually archived loads (safe even if column doesn't exist yet)
    setLoads((data ?? []).filter(l => l.broker && !l.is_archived))
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
    const invoiceList = data ?? []

    // Enrich every invoice with load numbers pulled from the loads table.
    // This works for all invoices (old and new) because loads always have
    // invoice_id set after invoicing, regardless of whether load_numbers
    // was stored on the invoice itself.
    if (invoiceList.length > 0) {
      const ids = invoiceList.map(i => i.id)
      const { data: invLoads } = await supabase
        .from('loads')
        .select('invoice_id, load_number')
        .in('invoice_id', ids)
        .not('load_number', 'is', null)
        .neq('load_number', '')

      const numMap = {}
      for (const l of (invLoads ?? [])) {
        if (!numMap[l.invoice_id]) numMap[l.invoice_id] = []
        numMap[l.invoice_id].push(l.load_number)
      }

      setInvoices(invoiceList.map(inv => ({
        ...inv,
        load_numbers: numMap[inv.id]?.length ? numMap[inv.id] : (inv.load_numbers ?? []),
      })))
    } else {
      setInvoices([])
    }
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

// ── Peek at next invoice number without incrementing ──────────────────────
export async function peekNextInvoiceNumber(company = 'carat') {
  const { data } = await supabase
    .from('invoice_counter')
    .select('next_number')
    .eq('company', company)
    .single()

  if (data?.next_number) return String(data.next_number).padStart(5, '0')

  // Fallback: legacy id=1 row for carat
  if (company === 'carat') {
    const { data: legacy } = await supabase
      .from('invoice_counter').select('next_number').eq('id', 1).single()
    if (legacy) return String(legacy.next_number).padStart(5, '0')
  }
  return null
}

// ── Get + increment invoice number (per company) ──────────────────────────
export async function getNextInvoiceNumber(company = 'carat') {
  const { data, error } = await supabase
    .from('invoice_counter')
    .select('id, next_number')
    .eq('company', company)
    .single()

  if (error || !data) {
    // Fallback: try legacy id=1 row for carat, or generate timestamp-based
    if (company === 'carat') {
      const { data: legacy } = await supabase
        .from('invoice_counter').select('next_number').eq('id', 1).single()
      if (legacy) {
        await supabase.from('invoice_counter').update({ next_number: legacy.next_number + 1 }).eq('id', 1)
        return String(legacy.next_number).padStart(5, '0')
      }
    }
    return 'INV-' + Date.now().toString().slice(-6)
  }

  const num = data.next_number
  await supabase
    .from('invoice_counter')
    .update({ next_number: num + 1 })
    .eq('id', data.id)

  return String(num).padStart(5, '0')
}

// ── Create invoice + mark loads ────────────────────────────────────────────
export async function createInvoice(invoiceData, loadIds, loads = []) {
  const invNum = await getNextInvoiceNumber(invoiceData.company || 'carat')
  const load_numbers = loads.map(l => l.load_number).filter(Boolean)

  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .insert([{ ...invoiceData, invoice_number: invNum, load_numbers }])
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

// ── Archive a load (removes from pending invoices) ────────────────────────
export async function archiveLoad(id) {
  const { error } = await supabase
    .from('loads')
    .update({ is_archived: true })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Archive an invoice (void / mistake) ──────────────────────────────────
export async function archiveInvoice(id) {
  const { error } = await supabase
    .from('invoices')
    .update({ is_archived: true })
    .eq('id', id)
  if (error) throw new Error(error.message)
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
// dateField: 'pickup_date' | 'delivery_date' — which date to filter the range by
// profileType: 'owner_operator' | 'company' — OO still gets paid for TONU loads; company drivers do not
export async function fetchDriverLoads(driverName, startDate, endDate, dateField = 'pickup_date', profileType = 'company') {
  let q = supabase
    .from('loads')
    .select('*')
    .eq('driver_name', driverName)
    .is('paid_at', null)           // exclude already-paid loads
    .order(dateField, { ascending: true })

  if (profileType !== 'owner_operator') {
    q = q.neq('status', 'tonu')   // company drivers are not paid for TONU loads
  }

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []).filter(l => {
    const d = l[dateField] || l.date
    return d >= startDate && d <= endDate
  })
}

// ── YTD summary ───────────────────────────────────────────────────────────
export function useYTDSummary(company = 'all', year = new Date().getFullYear()) {
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const from = `${year}-01-01`
    const to   = `${year}-12-31`
    let q = supabase
      .from('paystubs')
      .select('driver_name, company, load_total, grand_total, additions, deductions, start_date')
      .gte('start_date', from)
      .lte('start_date', to)
      .order('driver_name')
    if (company !== 'all') q = q.eq('company', company)
    const { data } = await q

    // Aggregate by driver
    const map = {}
    for (const ps of (data ?? [])) {
      if (!map[ps.driver_name]) {
        map[ps.driver_name] = {
          driver_name:  ps.driver_name,
          company:      ps.company,
          paystubCount: 0,
          gross:        0,
          addTotal:     0,
          dedTotal:     0,
          net:          0,
          addsByLabel:  {},
          dedsByLabel:  {},
          paystubs:     [],   // individual statements
        }
      }
      const d = map[ps.driver_name]
      d.paystubCount++
      d.gross += Number(ps.load_total)  || 0
      d.net   += Number(ps.grand_total) || 0

      // Per-statement add/ded totals for the statement list
      let psAddTotal = 0
      let psDedTotal = 0
      ;(ps.additions || []).forEach(a => {
        if (!a.label || !a.amount) return
        d.addsByLabel[a.label] = (d.addsByLabel[a.label] || 0) + Number(a.amount)
        d.addTotal += Number(a.amount)
        psAddTotal += Number(a.amount)
      })
      ;(ps.deductions || []).forEach(ded => {
        if (!ded.label || !ded.amount) return
        d.dedsByLabel[ded.label] = (d.dedsByLabel[ded.label] || 0) + Number(ded.amount)
        d.dedTotal += Number(ded.amount)
        psDedTotal += Number(ded.amount)
      })

      d.paystubs.push({
        start_date: ps.start_date,
        end_date:   ps.end_date,
        gross:      Number(ps.load_total)  || 0,
        addTotal:   psAddTotal,
        dedTotal:   psDedTotal,
        net:        Number(ps.grand_total) || 0,
      })
    }

    setRows(Object.values(map).sort((a, b) => a.driver_name.localeCompare(b.driver_name)))
    setLoading(false)
  }, [company, year])

  useEffect(() => { load() }, [load])
  return { rows, loading, refresh: load }
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

// ── Update an existing paystub record (optionally link new loads to it) ──
export async function updatePaystub(id, paystubData, newLoadIds = []) {
  const { error } = await supabase
    .from('paystubs')
    .update(paystubData)
    .eq('id', id)
  if (error) throw new Error(error.message)

  // Mark any newly-added loads as paid and link them to this paystub
  if (newLoadIds.length > 0) {
    const { error: loadErr } = await supabase
      .from('loads')
      .update({ paid_at: new Date().toISOString(), paystub_id: id })
      .in('id', newLoadIds)
    if (loadErr) throw new Error(loadErr.message)
  }
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
