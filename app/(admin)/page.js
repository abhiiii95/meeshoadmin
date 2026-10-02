'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fmtDate, inr, pct } from '@/lib/format';

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then(setData)
      .catch(() => setError('Could not load stats. Check MONGODB_URI in .env.local.'));
  }, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <p className="muted">Loading…</p>;

  const { totals, customers, topReturners, topReturnedSkus, recentUploads } = data;
  const returnRate = totals.orders ? totals.returnedOrders / totals.orders : 0;

  return (
    <>
      <div className="page-head">
        <h1>Dashboard</h1>
        <Link href="/upload" className="btn btn-primary">
          Upload label PDF
        </Link>
      </div>

      <div className="grid stats">
        <Stat label="Orders" value={totals.orders} sub={`${totals.items} items`} />
        <Stat label="Revenue" value={inr(totals.revenue)} sub={`${inr(totals.returnedAmount)} returned`} />
        <Stat label="Returned orders" value={totals.returnedOrders} sub={`${pct(returnRate)} return rate`} />
        <Stat label="Customers" value={customers.customers} sub={`${customers.repeat} ordered more than once`} />
        <Stat label="COD / Prepaid" value={`${totals.cod} / ${totals.orders - totals.cod}`} />
      </div>

      <div className="grid two-col">
        <div className="card">
          <h2>Customers with most returns</h2>
          {topReturners.length ? (
            <ul className="list">
              {topReturners.map((c) => (
                <li key={c._id}>
                  <Link href={`/orders?customerKey=${encodeURIComponent(c._id)}`}>
                    {c.name} <span className="muted small">· {c.city || c.pincode}</span>
                  </Link>
                  <span className="badge badge-red">{c.returns} returned</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No returns yet.</p>
          )}
        </div>

        <div className="card">
          <h2>Most returned SKUs</h2>
          {topReturnedSkus.length ? (
            <ul className="list">
              {topReturnedSkus.map((s) => (
                <li key={s._id}>
                  <Link href={`/orders?sku=${encodeURIComponent(s._id)}&status=anyReturn`} className="mono">
                    {s._id}
                  </Link>
                  <span className="badge badge-red">{s.returns} returned</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No returns yet.</p>
          )}
        </div>

        <div className="card">
          <h2>Recent uploads</h2>
          {recentUploads.length ? (
            <ul className="list">
              {recentUploads.map((u) => (
                <li key={u._id}>
                  <span>
                    {u.fileName}
                    <div className="muted small">{fmtDate(u.createdAt)}</div>
                  </span>
                  <span className="small">
                    {u.inserted} new · {u.updated ?? u.duplicates ?? 0} updated
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              Nothing uploaded yet. <Link href="/upload">Upload a PDF</Link>
            </p>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
