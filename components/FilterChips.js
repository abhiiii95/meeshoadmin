'use client';

// Shows each active filter as a chip with its own ×, plus "Clear all".
// chips: [{ key, label }]
export default function FilterChips({ chips, onRemove, onClear }) {
  if (!chips.length) return null;
  return (
    <div className="filters filter-chips">
      <span className="muted small">Filters:</span>
      {chips.map((c) => (
        <span className="chip" key={c.key}>
          {c.label}
          <button type="button" onClick={() => onRemove(c.key)} aria-label={`Remove ${c.label}`}>
            ×
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <button type="button" className="btn btn-sm btn-clear" onClick={onClear}>
          ✕ Clear all
        </button>
      )}
    </div>
  );
}
