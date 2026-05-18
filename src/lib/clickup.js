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
    // Iterate all fields — there can be multiple fields with the same name (workspace-level duplicates)
    for (const f of task.custom_fields ?? []) {
      if (f.name.toLowerCase() !== name.toLowerCase()) continue
      if (f.value === undefined || f.value === null || f.value === '') continue
      // Date fields store Unix ms as a string
      if (f.type === 'date') {
        return new Date(Number(f.value)).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
      }
      // Location fields store an object with formatted_address
      if (typeof f.value === 'object') {
        return f.value.formatted_address || f.value.address || ''
      }
      // Dropdowns: new_drop_down stores value as orderindex, old stores as option UUID
      const opts = f.type_config?.options
      if (opts) {
        const opt = opts.find(o => o.id === f.value) ?? opts.find(o => String(o.orderindex) === String(f.value))
        if (opt) return opt.name
      }
      return String(f.value)
    }
  }
  return ''
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic'])

export async function fetchAttachmentBlob(url) {
  const res = await fetch(url, { headers })
  if (!res.ok) return null
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

function normalizeDriver(task, company) {
  return {
    id:           task.id,
    name:         task.name,
    company,
    phone:        getField(task, 'phone', 'phone number', 'cell'),
    altPhone:     getField(task, 'alt phone', 'alternative phone', 'phone 2'),
    address:      getField(task, 'address', 'home address'),
    hometown:     getField(task, 'hometown', 'home city', 'home'),
    cdlNumber:    getField(task, 'cdl number'),
    cdlState:     getField(task, 'cdl state'),
    cdlExpiry:    getField(task, 'cdl', 'cdl expiry', 'license expiry'),
    medCert:      getField(task, 'med cert', 'medical certificate', 'medical card', 'med card'),
    endorsements: getField(task, 'endorsements', 'endorsement', 'tanker endorsement'),
    twic:         getField(task, 'twic', 'twic card'),
    driverType:   getField(task, 'driver type', 'type'),
    notes:        task.description ?? '',
    attachments:  (task.attachments ?? [])
      .filter(a => IMAGE_EXTS.has((a.extension || '').toLowerCase()))
      .map(a => ({ id: a.id, title: a.title || a.id, url: a.url })),
  }
}

function fmtDue(ms) {
  if (!ms) return ''
  return new Date(Number(ms)).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
}

function normalizeAttachments(task) {
  return (task.attachments ?? [])
    .filter(a => IMAGE_EXTS.has((a.extension || '').toLowerCase()))
    .map(a => ({ id: a.id, title: a.title || a.id, url: a.url }))
}

function normalizeTruck(task, company) {
  return {
    id:            task.id,
    truckNumber:   task.name,
    company,
    type:          getField(task, 'type', 'equipment type', 'truck type') || 'REEF',
    isTanker:      ['yes', 'true', '1'].includes(getField(task, 'tanker').toLowerCase()),
    year:          getField(task, 'year'),
    make:          getField(task, 'make'),
    vin:           getField(task, 'vin', 'vin number'),
    plate:         getField(task, 'plate', 'license plate'),
    dotInspection: fmtDue(task.due_date),
    attachments:   normalizeAttachments(task),
  }
}

function normalizeTrailer(task) {
  return {
    id:            task.id,
    trailerNumber: task.name,
    type:          getField(task, 'type', 'trailer type') || 'REEF',
    year:          getField(task, 'year'),
    make:          getField(task, 'make'),
    vin:           getField(task, 'vin', 'vin number'),
    plate:         getField(task, 'plate', 'license plate'),
    dotInspection: fmtDue(task.due_date),
    attachments:   normalizeAttachments(task),
  }
}
