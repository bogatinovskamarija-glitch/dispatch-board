import { useState, useEffect } from 'react'
import { fetchDrivers, fetchEquipment, fetchDriver, fetchTruckDetail, fetchTrailerDetail } from '../lib/clickup'

export function useDrivers() {
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDrivers()
      .then(setDrivers)
      .catch(() => setDrivers([]))
      .finally(() => setLoading(false))
  }, [])

  return { drivers, loading }
}

export function useEquipment() {
  const [trucks, setTrucks]     = useState([])
  const [trailers, setTrailers] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    fetchEquipment()
      .then(({ trucks, trailers }) => {
        setTrucks(trucks)
        setTrailers(trailers)
      })
      .catch(() => { setTrucks([]); setTrailers([]) })
      .finally(() => setLoading(false))
  }, [])

  return { trucks, trailers, loading }
}

export function useDriverDetail(clickupId) {
  const [driver, setDriver]   = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!clickupId) return
    setLoading(true)
    fetchDriver(clickupId)
      .then(setDriver)
      .catch(() => setDriver(null))
      .finally(() => setLoading(false))
  }, [clickupId])

  return { driver, loading }
}

export function useEquipmentDetail(taskId, equipType) {
  const [detail, setDetail]   = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!taskId) return
    setLoading(true)
    const fetch = equipType === 'truck' ? fetchTruckDetail : fetchTrailerDetail
    fetch(taskId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }, [taskId, equipType])

  return { detail, loading }
}
