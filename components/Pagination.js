'use client';

export default function Pagination({ page, pages, total, onChange }) {
  if (!total) return null;
  return (
    <div className="pagination">
      <span className="muted small">
        {total} result{total === 1 ? '' : 's'} · page {page} of {pages}
      </span>
      <button className="btn btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ← Prev
      </button>
      <button className="btn btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Next →
      </button>
    </div>
  );
}
