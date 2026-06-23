import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

export function useAllTimeSummary(company, refreshKey = 0) {
  const [raw, setRaw] = useState({ manual: [], insurance: [], loads: [], paystubs: [], fuel: [], maintenance: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAll() {
      setLoading(true)
      const [manualRes, insRes, loadsRes, paystubsRes, fuelRes, maintRes] = await Promise.all([
        supabase.from('monthly_manual_entries').select('*').limit(5000),
        supabase.from('insurance_entries').select('*').limit(5000),
        supabase.from('loads')
          .select('price,pickup_date,date,company,status,truck_number')
          .or('pickup_date.gte.2022-01-01,and(pickup_date.is.null,date.gte.2022-01-01)')
          .limit(50000),
        supabase.from('paystubs').select('grand_total,start_date,company').gte('start_date', '2022-01-01').limit(10000),
        supabase.from('fuel_transactions').select('amount,transaction_date,company').gte('transaction_date', '2022-01-01').limit(10000),
        supabase.from('maintenance_records').select('amount,date,company').gte('date', '2022-01-01').limit(10000),
      ])
      setRaw({
        manual:      manualRes.data   ?? [],
        insurance:   insRes.data      ?? [],
        loads:       loadsRes.data    ?? [],
        paystubs:    paystubsRes.data ?? [],
        fuel:        fuelRes.data     ?? [],
        maintenance: maintRes.data    ?? [],
      })
      setLoading(false)
    }
    fetchAll()
  }, [refreshKey])

  const yearSummaries = useMemo(() => {
    const NON_REVENUE = new Set(['home', 'broken', 'no_driver'])
    const matchCo = r => company === 'all' || r.company === company

    const years = {}
    const ensure = y => {
      if (!years[y]) years[y] = {
        year: y, gross: 0, payroll: 0, fuel: 0, maintenance: 0, insurance: 0,
        unitsByMonth: {},        // from manual entries
        trucksByMonth: {},       // computed from real loads: { month -> Set<truck_number> }
      }
    }

    // Manual entries — primary source for historical years, supplemental for tracked years
    for (const e of raw.manual) {
      if (!matchCo(e)) continue
      ensure(e.year)
      years[e.year].gross       += Number(e.gross)       || 0
      years[e.year].payroll     += Number(e.payroll)     || 0
      years[e.year].fuel        += Number(e.fuel)        || 0
      years[e.year].maintenance += Number(e.maintenance) || 0
      const uc = Number(e.unit_count) || 0
      if (uc > 0) {
        // For company='all', same month from both companies adds up (total fleet)
        years[e.year].unitsByMonth[e.month] = (years[e.year].unitsByMonth[e.month] || 0) + uc
      }
    }

    // Insurance entries — all years, fully manual
    for (const ins of raw.insurance) {
      if (!matchCo(ins)) continue
      ensure(ins.year)
      years[ins.year].insurance += Number(ins.amount) || 0
    }

    // Real loads (2022+) — also track unique trucks per month for auto unit count
    for (const l of raw.loads) {
      if (!matchCo(l) || NON_REVENUE.has(l.status)) continue
      const d = l.pickup_date || l.date
      if (!d) continue
      const y = parseInt(d.substring(0, 4))
      const mo = parseInt(d.substring(5, 7))
      ensure(y)
      years[y].gross += Number(l.price) || 0
      const trk = (l.truck_number || '').trim()
      if (trk) {
        if (!years[y].trucksByMonth[mo]) years[y].trucksByMonth[mo] = new Set()
        years[y].trucksByMonth[mo].add(trk)
      }
    }

    // Real paystubs (2022+)
    for (const p of raw.paystubs) {
      if (!matchCo(p) || !p.start_date) continue
      const y = parseInt(p.start_date.substring(0, 4))
      ensure(y)
      years[y].payroll += Number(p.grand_total) || 0
    }

    // Real fuel (2022+)
    for (const f of raw.fuel) {
      if (!matchCo(f) || !f.transaction_date) continue
      const y = parseInt(f.transaction_date.substring(0, 4))
      ensure(y)
      years[y].fuel += Number(f.amount) || 0
    }

    // Real maintenance records (2022+)
    for (const m of raw.maintenance) {
      if (!matchCo(m) || !m.date) continue
      const y = parseInt(m.date.substring(0, 4))
      ensure(y)
      years[y].maintenance += Number(m.amount) || 0
    }

    return Object.values(years)
      .map(y => {
        const net = y.gross - y.payroll - y.fuel - y.maintenance - y.insurance

        // Build per-month unit count: prefer manual entry, fall back to computed truck count
        const allMonths = new Set([
          ...Object.keys(y.unitsByMonth).map(Number),
          ...Object.keys(y.trucksByMonth).map(Number),
        ])
        const monthUnits = []
        for (const mo of allMonths) {
          const manualVal = y.unitsByMonth[mo] || 0
          const computedVal = y.trucksByMonth[mo] ? y.trucksByMonth[mo].size : 0
          const val = manualVal > 0 ? manualVal : computedVal
          if (val > 0) monthUnits.push(val)
        }

        const avgUnits = monthUnits.length > 0
          ? Math.round(monthUnits.reduce((s, v) => s + v, 0) / monthUnits.length)
          : null

        return {
          year:        y.year,
          gross:       y.gross,
          payroll:     y.payroll,
          fuel:        y.fuel,
          maintenance: y.maintenance,
          insurance:   y.insurance,
          net,
          units:       avgUnits,
          netPerUnit:  avgUnits ? net / avgUnits : null,
        }
      })
      .filter(y => y.gross > 0 || y.payroll > 0 || y.insurance > 0)
      .sort((a, b) => a.year - b.year)
  }, [raw, company])

  return { yearSummaries, loading }
}
