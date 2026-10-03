'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import QuickCheck from '@/components/QuickCheck';
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

  const { totals, customers, tabs, riskLevels, riskyPincodes, topReturners, topReturnedSkus, recentUploads } = data;
  const returnRate = totals.orders ? totals.returnedOrders / totals.orders : 0;

  return (
    <>
      <div className="page-head">
        <h1>Dashboard</h1>
        <Link href="/upload" className="btn btn-primary">
          Upload label PDF
        </Link>
      </div>

      <QuickCheck />

      <div className="grid status-cards">
        <StatusCard
          href="/orders?tab=delivered"
          cls="tab-green"
          label="Delivered"
          value={tabs.delivered}
          sub={inr(tabs.deliveredAmount)}
        />
        <StatusCard
          href="/orders?tab=customerReturn"
          cls="tab-red"
          label="Customer Return"
          value={tabs.customerReturn}
          sub={`Meesho charge ${inr(tabs.customerReturnCharges)}`}
        />
        <StatusCard
          href="/orders?tab=rto"
          cls="tab-amber"
          label="RTO"
          value={tabs.rto}
          sub={`${inr(tabs.rtoAmount)} · no charge`}
        />
        <StatusCard
          href="/orders?tab=cancelled"
          cls="tab-grey"
          label="Cancelled"
          value={tabs.cancelled}
          sub={inr(tabs.cancelledAmount)}
        />
      </div>

      <div className="grid stats">
        <Stat
          href="/orders"
          label="Orders"
          value={totals.orders}
          sub={`${totals.items} items${totals.cancelled ? ` · ${totals.cancelled} cancelled` : ''}`}
        />
        <Stat href="/pnl" label="Revenue" value={inr(totals.revenue)} sub={`${inr(totals.returnedAmount)} returned`} />
        <Stat
          href="/orders?status=anyReturn"
          label="Returned orders"
          value={totals.returnedOrders}
          sub={`${pct(returnRate)} return rate`}
        />
        <Stat
          href="/customers"
          label="Customers"
          value={customers.customers}
          sub={`${customers.repeat} ordered more than once`}
        />
        <Stat
          href="/customers?risk=high&sort=risk"
          label="Risky customers"
          value={riskLevels.fraud + riskLevels.high}
          sub={`${riskLevels.fraud} fraud · ${riskLevels.high} high · ${riskLevels.medium} medium`}
        />
        <Stat
          href="/orders?payment=COD"
          label="COD / Prepaid"
          value={`${totals.cod} / ${totals.orders - totals.cod}`}
          sub="tap to see COD orders"
        />
      </div>

      <div className="grid two-col">
        <div className="card">
          <h2>
            <Link href="/customers?risk=medium&sort=risk">Customers with most returns →</Link>
          </h2>
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
          <h2>Risky pincodes</h2>
          {riskyPincodes.length ? (
            <ul className="list">
              {riskyPincodes.map((p) => (
                <li key={p._id}>
                  <Link href={`/customers?q=${encodeURIComponent(p._id)}&sort=risk`}>
                    <span className="mono">{p._id}</span>{' '}
                    <span className="muted small">· {p.city || p.state}</span>
                    <div className="muted small">
                      {p.orders} orders · {p.customers} customers · Cust {p.customerReturns} · RTO {p.rto}
                    </div>
                  </Link>
                  <span className={`badge ${p.rate >= 0.5 ? 'badge-red' : 'badge-amber'}`}>{pct(p.rate)} returned</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Shows up once a pincode has 2+ orders with returns.</p>
          )}
        </div>

        <div className="card">
          <h2>
            <Link href="/products">Most returned SKUs →</Link>
          </h2>
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
          <h2>
            <Link href="/upload">Recent uploads →</Link>
          </h2>
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

function StatusCard({ href, cls, label, value, sub }) {
  return (
    <Link href={href} className={`card stat status-card ${cls}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="sub">{sub}</div>
    </Link>
  );
}

function Stat({ href, label, value, sub }) {
  return (
    <Link href={href} className="card stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </Link>
  );
}
