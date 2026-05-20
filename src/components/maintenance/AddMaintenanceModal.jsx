import { useState } from 'react'
import ShopPicker from './ShopPicker'

const CATEGORIES = [
  { value: 'pm',             label: 'PM Service'       },
  { value: 'tire',           label: 'Tire'             },
  { value: 'other',          label: 'Other'            },
  { value: 'ac',             label: 'AC'               },
  { value: 'light',          label: 'Light / Electric' },
  { value: 'batteries',      label: 'Batteries'        },
  { value: 'dot_inspection', label: 'DOT Inspection'   },
  { value: 'steering_tires', label: 'Steering Tires'   },
]

const PM_CODES = [
  { value: 'A', label: 'A – Oil Change'    },
  { value: 'B', label: 'B – Brakes'        },
  { value: 'C', label: 'C – Tires'         },
  { value: 'D', label: 'D – Brake Adj'     },
  { value: 'E', label: 'E – DOT'           },
]

const BLANK = {
  company:     'carat',
  date:        '',
  unit_number: '',
  unit_type:   'tractor',
  category:    'other',
  description: '',
  amount:      '',
  mileage:     '',
  pm_code:     '',
  invoice:     '',
  shop_id:     null,
  shop_name:   '',
}

export default function AddMaintenanceModal({ record, shops, onSave, onAddShop, onClose }) {
  const [form, setForm] = useState(record
    ? { ...BLANK, ...record, amount: record.amount ?? '', shop_name: record.shop_name || '' }
    : { ...BLANK }
  )
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.company || !form.date || !form.unit_number) {
      alert('Company, date and unit number are required.')
      return
    }
    setSaving(true)
    try {
      await onSave({
        ...form,
        amount: form.amount !== '' ? Number(form.amount) : null,
        unit_number: String(form.unit_number).trim(),
        unit_type:   form.unit_type.toLowerCase(),
      })
      onClose()
    } catch (e) { alert(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{record ? 'Edit Maintenance Record' : 'Add Maintenance Record'}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-grid-2">

              <div className="form-group">
                <label>Company *</label>
                <select value={form.company} onChange={e => set('company', e.target.value)}>
                  <option value="carat">Carat Expedited</option>
                  <option value="pro_freight">Pro Freight</option>
                </select>
              </div>

              <div className="form-group">
                <label>Date *</label>
                <input type="date" value={form.date} onChange={e => set('date', e.target.value)} required />
              </div>

              <div className="form-group">
                <label>Unit # *</label>
                <input
                  placeholder="e.g. 121"
                  value={form.unit_number}
                  onChange={e => set('unit_number', e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Unit Type *</label>
                <select value={form.unit_type} onChange={e => set('unit_type', e.target.value)}>
                  <option value="tractor">Tractor</option>
                  <option value="trailer">Trailer</option>
                </select>
              </div>

              <div className="form-group">
                <label>Category</label>
                <select value={form.category} onChange={e => set('category', e.target.value)}>
                  {CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={e => set('amount', e.target.value)}
                />
              </div>

              <div className="form-group form-span-2">
                <label>Description</label>
                <textarea
                  rows={2}
                  placeholder="Work performed…"
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Shop / Vendor</label>
                <ShopPicker
                  shops={shops}
                  value={form.shop_id ? { id: form.shop_id, name: form.shop_name } : null}
                  onChange={s => set('shop_id', s?.id || null) || set('shop_name', s?.name || '')}
                  onAddShop={onAddShop}
                />
              </div>

              <div className="form-group">
                <label>Invoice #</label>
                <input
                  placeholder="Invoice number"
                  value={form.invoice}
                  onChange={e => set('invoice', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Mileage</label>
                <input
                  placeholder="Odometer reading"
                  value={form.mileage}
                  onChange={e => set('mileage', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>PM Code</label>
                <select value={form.pm_code} onChange={e => set('pm_code', e.target.value)}>
                  <option value="">— None —</option>
                  {PM_CODES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : record ? 'Save Changes' : 'Add Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
