'use client';

const MAP = {
  fraud: ['risk-fraud', '⚠ Fraud'],
  high: ['risk-high', 'High risk'],
  medium: ['risk-medium', 'Medium risk'],
  low: ['risk-low', 'Low risk'],
};

export default function RiskBadge({ risk, onClick, showLow = false }) {
  if (!risk || (risk.level === 'low' && !showLow)) return null;
  const [cls, label] = MAP[risk.level] || MAP.low;
  const title = risk.reasons?.length ? risk.reasons.join('\n') : 'No warning signs';
  if (!onClick) {
    return (
      <span className={`badge risk ${cls}`} title={title}>
        {label}
      </span>
    );
  }
  return (
    <button type="button" className={`badge badge-link risk ${cls}`} title={title} onClick={onClick}>
      {label}
    </button>
  );
}
