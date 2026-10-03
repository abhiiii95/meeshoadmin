'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Pagination from '@/components/Pagination';
import RiskBadge from '@/components/RiskBadge';
import RiskModal from '@/components/RiskModal';
import { fmtDate, inr, pct } from '@/lib/format';

const FILTER_KEYS = ['q', 'risk', 'minOrders', 'minReturns', 'sort'];

const RISK_TABS = [
  { key: '', label: 'All', count: (l) => l.low + l.medium + l.high + l.fraud, cls: '' },
  { key: 'fraud', label: '⚠ Fraud', count: (l) => l.fraud, cls: 'tab-grey' },
  { key: 'high', label: 'High risk +', count: (l) => l.high + l.fraud, cls: 'tab-red' },
  { key: 'medium', label: 'Medium risk +', count: (l) => l.medium + l.high + l.fraud, cls: 'tab-amber' },
];

export default function CustomersPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <CustomersView />
    </Suspense>
  );
}

function CustomersView() {
  const router = useRouter();
  const sp = useSearchParams();
  const qs = sp.toString();
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, sp.get(k) || '']));

  const [draft, setDraft] = useState(filters);
  const [data, setData] = useState(null);
  const [openKey, setOpenKey] = useState(null);

  const load = useCallback(
    () =>
      fetch(`/api/customers?${qs}`)
        .then((r) => r.json())
        .then(setData)
        .catch(() => setData({ customers: [], total: 0 })),
    [qs]
  );

  useEffect(() => {
    setDraft(Object.fromEntries(FILTER_KEYS.map((k) => [k, sp.get(k) || ''])));
    load();
  }, [load, sp]);

  function apply(changes, page = 1) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...draft, ...changes })) if (v) params.set(k, v);
    if (page > 1) params.set('page', String(page));
    router.push(`/customers?${params.toString()}`);
  }

  const rateBadge = (r) => (r >= 0.5 ? 'badge-red' : r > 0 ? 'badge-amber' : 'badge-green');

  return (
    <>
      <div className="page-head">
        <h1>Customers</h1>
        <span className="muted small">Same customer = same name + pincode</span>
      </div>

      {data?.levels && (
        <div className="tabs">
          {RISK_TABS.map((t) => (
            <button
              key={t.key || 'all'}
              type="button"
              className={`tab ${t.cls}${filters.risk === t.key ? ' on' : ''}`}
              onClick={() => apply({ risk: t.key, sort: t.key ? 'risk' : draft.sort })}
            >
              {t.label}
              <span className="tab-count">{t.count(data.levels)}</span>
            </button>
          ))}
        </div>
      )}

      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          apply({});
        }}
      >
        <input
          type="search"
          placeholder="Customer name, city, pincode…"
          value={draft.q}
          onChange={(e) => setDraft({ ...draft, q: e.target.value })}
        />
        <input
          type="number"
          min="0"
          placeholder="Min orders"
          style={{ width: 120 }}
          value={draft.minOrders}
          onChange={(e) => setDraft({ ...draft, minOrders: e.target.value })}
        />
        <input
          type="number"
          min="0"
          placeholder="Min returns"
          style={{ width: 120 }}
          value={draft.minReturns}
          onChange={(e) => setDraft({ ...draft, minReturns: e.target.value })}
        />
        <select value={draft.sort} onChange={(e) => apply({ sort: e.target.value })}>
          <option value="">Most orders</option>
          <option value="risk">Riskiest first</option>
          <option value="returns">Most returns</option>
          <option value="returnRate">Highest return rate</option>
          <option value="spent">Highest spend</option>
          <option value="last">Recent order</option>
          <option value="name">Name A–Z</option>
        </select>
        <button className="btn btn-primary">Apply</button>
        <button type="button" className="btn" onClick={() => apply({ minOrders: '2' })}>
          Repeat buyers
        </button>
        <button type="button" className="btn" onClick={() => apply({ minReturns: '1', sort: 'returns' })}>
          Returners
        </button>
      </form>

      <div className="table-wrap">
        <table className="cards">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Risk</th>
              <th>Location</th>
              <th className="num">Times shopped</th>
              <th className="num">Times returned</th>
              <th className="num">Return rate</th>
              <th className="num">COD</th>
              <th className="num">Total spent</th>
              <th>First / last order</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {!data ? (
              <tr>
                <td colSpan={10} className="empty">Loading…</td>
              </tr>
            ) : !data.customers.length ? (
              <tr>
                <td colSpan={10} className="empty">No customers found</td>
              </tr>
            ) : (
              data.customers.map((c) => (
                <tr key={c._id}>
                  <td data-label="Customer" className="card-title">
                    <strong>{c.name}</strong>
                    <div className="muted small" style={{ maxWidth: 260 }}>{c.address}</div>
                  </td>
                  <td data-label="Risk" style={{ maxWidth: 240 }}>
                    <RiskBadge risk={c.risk} showLow onClick={() => setOpenKey(c._id)} />
                    {c.risk.reasons[0] && <div className="small muted" style={{ marginTop: 4 }}>{c.risk.reasons[0]}</div>}
                    {c.risk.reasons.length > 1 && (
                      <div className="small muted">+{c.risk.reasons.length - 1} more</div>
                    )}
                    {c.risk.links > 0 && (
                      <div className="small" style={{ color: 'var(--amber)' }}>
                        {c.risk.links} possible same person
                      </div>
                    )}
                  </td>
                  <td className="small" data-label="Location">
                    {[c.city, c.state].filter(Boolean).join(', ')}
                    <div className="mono muted">{c.pincode}</div>
                  </td>
                  <td className="num half" data-label="Times shopped">
                    <strong>{c.orders}</strong>
                    {c.cancelledOrders > 0 && <div className="muted small">{c.cancelledOrders} cancelled</div>}
                  </td>
                  <td className="num half" data-label="Times returned">
                    <strong style={{ color: c.returnedOrders ? 'var(--red)' : undefined }}>{c.returnedOrders}</strong>
                    {(c.customerReturns > 0 || c.rto > 0) && (
                      <div className="muted small">
                        Cust {c.customerReturns} · RTO {c.rto}
                        {c.wrongProducts > 0 && ` · Wrong ${c.wrongProducts}`}
                      </div>
                    )}
                  </td>
                  <td className="num half" data-label="Return rate">
                    <span className={`badge ${rateBadge(c.returnRate)}`}>{pct(c.returnRate)}</span>
                  </td>
                  <td className="num half" data-label="COD">
                    {c.codOrders}
                    {c.codRto > 0 && <div className="small" style={{ color: 'var(--red)' }}>{c.codRto} refused</div>}
                  </td>
                  <td className="num half" data-label="Total spent">
                    {inr(c.totalSpent)}
                    {c.lossAmount > 0 && (
                      <div className="small" style={{ color: 'var(--red)' }}>−{inr(c.lossAmount)} lost</div>
                    )}
                  </td>
                  <td className="small nowrap" data-label="First / last order">
                    {fmtDate(c.firstOrder)}
                    <div className="muted">{fmtDate(c.lastOrder)}</div>
                  </td>
                  <td className="row-actions">
                    <button className="btn btn-sm" onClick={() => setOpenKey(c._id)} style={{ marginRight: 6 }}>
                      Check
                    </button>
                    <Link className="btn btn-sm" href={`/orders?customerKey=${encodeURIComponent(c._id)}`}>
                      Orders
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && (
        <Pagination page={data.page} pages={data.pages} total={data.total} onChange={(p) => apply({}, p)} />
      )}

      {openKey && <RiskModal customerKey={openKey} onClose={() => setOpenKey(null)} onChanged={load} />}
    </>
  );
}
