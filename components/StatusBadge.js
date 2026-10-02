const MAP = {
  active: ['badge-green', 'Not returned'],
  partial: ['badge-amber', 'Partly returned'],
  returned: ['badge-red', 'Returned'],
};

export default function StatusBadge({ status }) {
  const [cls, label] = MAP[status] || MAP.active;
  return <span className={`badge ${cls}`}>{label}</span>;
}
