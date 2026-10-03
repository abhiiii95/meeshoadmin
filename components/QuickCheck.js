'use client';

import { useState } from 'react';
import RiskBadge from '@/components/RiskBadge';
import RiskModal from '@/components/RiskModal';

// Dashboard search: type a name / pincode / AWB / order no and see the customer's risk
export default function QuickCheck() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [openKey, setOpenKey] = useState(null);

  async function search(e) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/customers/check?q=${encodeURIComponent(q.trim())}`);
    const data = await res.json().catch(() => ({ customers: [] }));
    setResults(data.customers || []);
    setBusy(false);
  }

  return (
    <div className="card quick-check">
      <h2>Check a customer</h2>
      <form className="filters" style={{ margin: 0 }} onSubmit={search}>
        <input
          type="search"
          placeholder="Name, pincode, AWB or order no…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Checking…' : 'Check'}
        </button>
      </form>

      {results && (
        <ul className="list" style={{ marginTop: 8 }}>
          {results.map((c) => (
            <li key={c._id}>
              <button type="button" className="link-btn" onClick={() => setOpenKey(c._id)}>
                <strong>{c.name}</strong>
                <div className="muted small">
                  {c.city || '—'} · {c.pincode} · {c.orders} orders · {c.customerReturns} cust. returns · {c.rto} RTO
                  {c.wrongProducts > 0 && ` · ${c.wrongProducts} wrong product`}
                </div>
              </button>
              <RiskBadge risk={c.risk} showLow onClick={() => setOpenKey(c._id)} />
            </li>
          ))}
          {!results.length && <li className="muted">No customer found. New customer.</li>}
        </ul>
      )}

      {openKey && <RiskModal customerKey={openKey} onClose={() => setOpenKey(null)} />}
    </div>
  );
}
