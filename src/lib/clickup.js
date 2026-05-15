const BASE  = 'https://api.clickup.com/api/v2'
const TOKEN = import.meta.env.VITE_CLICKUP_API_KEY

const LIST_IDS = {
  caratDrivers:   import.meta.env.VITE_CLICKUP_CARAT_DRIVERS_LIST_ID,
  caratTrucks:    import.meta.env.VITE_CLICKUP_CARAT_TRUCKS_LIST_ID,
  proDrivers:     import.meta.env.VITE_CLICKUP_PRO_DRIVERS_LIST_ID,
  proTrucks:      import.meta.env.VITE_CLICKUP_PRO_TRUCKS_LIST_ID,
  trailers:       import.meta.env.VITE_CLICKUP_TRAILERS_LIST_ID,
}

const headers = { Authorization: TOKEN, 'Content-Type': 'application/json' }

async function fetchList(listId) {
  if (!listId) return []
  const res = await fetch(`${BASE}/list/${listId}/task?archived=false&page=0`, { headers })
  if (!res.ok) return []
  const { tasks } = await res.json()
  return tasks ?? []
}

export async function fetchDrivers() {
  const [caratTasks, proTasks] = await Promise.all([
    fetchList(LIST_IDS.caratDrivers),
    fetchList(LIST_IDS.proDrivers),
  ])
  const isActive = t => t.status?.status?.toLowerCase() === 'active'
  return [
    ...caratTasks.filter(isActive).map(t => normalizeDriver(t, 'carat')),
    ...proTasks.filter(isActive).map(t => normalizeDriver(t, 'pro_freight')),
  ]
}

export async function fetchDriver(clickupId) {
  if (!clickupId) return null
  const res = await fetch(`${BASE}/task/${clickupId}`, { headers })
  if (!res.ok) return null
  const task = await res.json()
  const company = task.list?.id === LIST_IDS.caratDrivers ? 'carat' : 'pro_freight'
  return normalizeDriver(task, company)
}

export async function fetchEquipment() {
  const [caratTasks, proTasks, trailerTasks] = await Promise.all([
    fetchList(LIST_IDS.caratTrucks),
    fetchList(LIST_IDS.proTrucks),
    fetchList(LIST_IDS.trailers),
  ])
  const trucks = [
    ...caratTasks.map(t => normalizeTruck(t, 'carat')),
    ...proTasks.map(t => normalizeTruck(t, 'pro_freight')),
  ]
  const trailers = trailerTasks.map(normalizeTrailer)
  return { trucks, trailers }
}

function getField(task, ...names) {
  for (const name of names) {
    const f = task.custom_fields?.find(cf => cf.name.toLowerCase() === name.toLowerCase())
    if (!f) continue
    if (f.value !== undefined && f.value !== null && f.value !== '') {
      const opt = f.type_config?.options?.find(o => o.id === f.value)
      return opt ? opt.name : String(f.value)
    }
  }
  return ''
}

function normalizeDriver(task, company) {
  return {
    id:               task.id,
    name:             task.name,
    company,
    phone:            getField(task, 'phone', 'phone number', 'cell'),
    altPhone:         getField(task, 'alt phone', 'alternative phone', 'phone 2'),
    address:          getField(task, 'address', 'home address', 'street address'),
    hometown:         getField(task, 'hometown', 'home city', 'home'),
    cdl:              getField(task, 'cdl', 'cdl number', 'license'),
    cdlExpiry:        getField(task, 'cdl expiry', 'license expiry', 'cdl exp'),
    medCard:          getField(task, 'medical card', 'med card', 'medical'),
    medCardExpiry:    getField(task, 'med card expiry', 'medical card expiry', 'med exp', 'medical expiry'),
    tankerEndorsement: getField(task, 'tanker endorsement', 'tanker'),
    notes:            task.description ?? '',
  }
}

function normalizeTruck(task, company) {
  return {
    id:            task.id,
    truckNumber:   task.name,
    company,
    type:          getField(task, 'type', 'equipment type', 'truck type') || 'REEF',
    isTanker:      ['yes', 'true', '1'].includes(getField(task, 'tanker').toLowerCase()),
    year:          getField(task, 'year', 'truck year'),
    make:          getField(task, 'make', 'manufacturer'),
    model:         getField(task, 'model', 'truck model'),
    vin:           getField(task, 'vin', 'vin number'),
    licensePlate:  getField(task, 'license plate', 'plate', 'license number'),
    dotInspection: getField(task, 'dot inspection', 'dot expiry', 'annual inspection', 'inspection expiry'),
  }
}

function normalizeTrailer(task) {
  return {
    id:            task.id,
    trailerNumber: task.name,
    type:          getField(task, 'type', 'trailer type') || 'REEF',
    year:          getField(task, 'year', 'trailer year'),
    make:          getField(task, 'make', 'manufacturer'),
    model:         getField(task, 'model', 'trailer model'),
    vin:           getField(task, 'vin', 'vin number'),
    licensePlate:  getField(task, 'license plate', 'plate', 'license number'),
    dotInspection: getField(task, 'dot inspection', 'dot expiry', 'annual inspection', 'inspection expiry'),
  }
}
