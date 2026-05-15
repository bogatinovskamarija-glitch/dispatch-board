const LABELS = {
  covered:   'Covered',
  empty:     'Empty',
  home:      'At Home',
  broken:    'Broken Down',
  no_driver: 'No Driver',
}

export default function StatusBadge({ status }) {
  return (
    <span className={`status-badge badge-${status}`}>
      <span className="dot" />
      {LABELS[status] ?? status}
    </span>
  )
}
