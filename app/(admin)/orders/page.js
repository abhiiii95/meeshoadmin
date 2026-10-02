'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Pagination from '@/components/Pagination';
import CancelModal from '@/components/CancelModal';
import OrderDetails from '@/components/OrderDetails';
import ReturnModal from '@/components/ReturnModal';
import StatusBadge from '@/components/StatusBadge';
import { fmtDate, inr } from '@/lib/format';

const FILTER_KEYS = ['q', 'status', 'payment', 'courier', 'from', 'to', 'customerKey', 'sku', 'sort'];

export default function OrdersPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <OrdersView />
    </Suspense>
  );
}

function OrdersView() {
  const router = useRouter();
  const sp = useSearchParams();
  const qs = sp.toString();
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, sp.get(k) || '']));

  const [search, setSearch] = useState(filters.q);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // { order, item }
  const [detailsId, setDetailsId] = useState(null);
  const [cancelOrder, setCancelOrder] = useState(null);
  const detailsOrder = data?.orders?.find((o) => o._id === detailsId);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/orders?${qs}`);
    setData(res.ok ? await res.json() : { orders: [], total: 0, error: true });
    setLoading(false);
  }, [qs]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setSearch(sp.get('q') || '');
  }, [sp]);

  function apply(changes, page = 1) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filters, ...changes })) if (v) params.set(k, v);
    if (page > 1) params.set('page', String(page));
    router.push(`/orders?${params.toString()}`);
  }

  async function markReturn(order, item, payload) {
    const res = await fetch(`/api/orders/${order._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subOrderNo: item?.subOrderNo, returned: true, ...payload }),
    });
    if (!res.ok) return (await res.json().catch(() => ({}))).error || 'Could not save';
    setModal(null);
    load();
  }

  async function undoReturn(order, item) {
    await fetch(`/api/orders/${order._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subOrderNo: item.subOrderNo, returned: false }),
    });
    load();
  }

  async function setCancelled(order, cancelled, cancelReason = '') {
    const res = await fetch(`/api/orders/${order._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cancelled, cancelReason }),
    });
    if (!res.ok) return (await res.json().catch(() => ({}))).error || 'Could not save';
    setCancelOrder(null);
    load();
  }

  async function remove(order) {
    if (!confirm(`Delete order ${order.orderNo}? This cannot be undone.`)) return;
    await fetch(`/api/orders/${order._id}`, { method: 'DELETE' });
    load();
  }

  const customerName =
    filters.customerKey && data?.orders?.[0]?.customerKey === filters.customerKey
      ? data.orders[0].customer?.name
      : filters.customerKey.split('|')[0];

  return (
    <>
      <div className="page-head">
        <h1>Orders</h1>
        <a className="btn" href={`/api/orders/export?${qs}`}>
          Export CSV
        </a>
      </div>

      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          apply({ q: search.trim() });
        }}
      >
        <input
          type="search"
          placeholder="Customer name, order no, AWB, SKU, pincode…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn btn-primary">Search</button>
        <select value={filters.status} onChange={(e) => apply({ status: e.target.value })}>
          <option value="">All status</option>
          <option value="active">Not returned</option>
          <option value="anyReturn">Any return</option>
          <option value="partial">Partly returned</option>
          <option value="returned">Fully returned</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select value={filters.payment} onChange={(e) => apply({ payment: e.target.value })}>
          <option value="">All payments</option>
          <option value="Prepaid">Prepaid</option>
          <option value="COD">COD</option>
        </select>
        <select value={filters.courier} onChange={(e) => apply({ courier: e.target.value })}>
          <option value="">All couriers</option>
          {(data?.couriers || []).map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input type="date" value={filters.from} onChange={(e) => apply({ from: e.target.value })} title="From date" />
        <input type="date" value={filters.to} onChange={(e) => apply({ to: e.target.value })} title="To date" />
        <select value={filters.sort} onChange={(e) => apply({ sort: e.target.value })}>
          <option value="">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="amount">Highest amount</option>
        </select>
      </form>

      {(filters.customerKey || filters.sku) && (
        <div className="filters">
          {filters.customerKey && (
            <span className="chip">
              Customer: {customerName}
              <button type="button" onClick={() => apply({ customerKey: '' })}>×</button>
            </span>
          )}
          {filters.sku && (
            <span className="chip">
              SKU: {filters.sku}
              <button type="button" onClick={() => apply({ sku: '' })}>×</button>
            </span>
          )}
        </div>
      )}

      {data?.error && <div className="alert alert-error">Could not load orders.</div>}

      {data?.summary && (filters.q || filters.customerKey || filters.sku || filters.status || filters.payment || filters.courier || filters.from || filters.to) && (
        <div className="grid summary">
          <div className="card stat">
            <div className="label">Orders</div>
            <div className="value">{data.summary.orders}</div>
            <div className="sub">
              {data.summary.customers} customer{data.summary.customers === 1 ? '' : 's'}
              {data.summary.cancelledOrders > 0 && ` · ${data.summary.cancelledOrders} cancelled`}
            </div>
          </div>
          <div className="card stat">
            <div className="label">Returned</div>
            <div className="value" style={{ color: data.summary.returnedOrders ? 'var(--red)' : undefined }}>
              {data.summary.returnedOrders}
            </div>
            <div className="sub">{data.summary.returnedItems} item(s)</div>
          </div>
          <div className="card stat">
            <div className="label">Amount</div>
            <div className="value">{inr(data.summary.amount)}</div>
            {data.summary.returnedAmount > 0 && <div className="sub">−{inr(data.summary.returnedAmount)} returned</div>}
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="cards">
          <thead>
            <tr>
              <th>Date</th>
              <th>Order</th>
              <th>Customer</th>
              <th>Products</th>
              <th>Payment / Courier</th>
              <th className="num">Amount</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <tr>
                <td colSpan={8} className="empty">Loading…</td>
              </tr>
            ) : !data?.orders?.length ? (
              <tr>
                <td colSpan={8} className="empty">No orders found</td>
              </tr>
            ) : (
              data.orders.map((o) => {
                const cs = data.customerStats?.[o.customerKey];
                return (
                  <tr key={o._id}>
                    <td className="nowrap" data-label="Date">{fmtDate(o.orderDate)}</td>
                    <td data-label="Order">
                      <div className="mono">{o.orderNo}</div>
                      <div className="muted small">Inv: {o.invoiceNo || '—'}</div>
                      {o.pdfUrl && (
                        <a className="small" href={o.pdfUrl} target="_blank" rel="noreferrer">
                          PDF (page {o.page})
                        </a>
                      )}
                    </td>
                    <td style={{ minWidth: 200 }} data-label="Customer">
                      <strong>{o.customer?.name}</strong>
                      <div className="muted small" title={o.customer?.address}>
                        {[o.customer?.city, o.customer?.state, o.customer?.pincode].filter(Boolean).join(', ')}
                      </div>
                      {cs && (
                        <button
                          type="button"
                          className={`badge badge-link ${cs.returns ? 'badge-amber' : 'badge-grey'}`}
                          style={{ marginTop: 4 }}
                          onClick={() => apply({ customerKey: o.customerKey })}
                          title="Show all orders of this customer"
                        >
                          {cs.orders} order{cs.orders === 1 ? '' : 's'} · {cs.returns} returned
                          {cs.cancelled > 0 && ` · ${cs.cancelled} cancelled`}
                        </button>
                      )}
                    </td>
                    <td style={{ minWidth: 300 }} data-label="Products">
                      {o.items.map((it) => (
                        <div className="item-line" key={it.subOrderNo || it.sku}>
                          {data.images?.[it.sku] ? (
                            <img className="thumb" src={data.images[it.sku]} alt={it.sku} />
                          ) : (
                            <div className="thumb thumb-empty">No img</div>
                          )}
                          <div style={{ flex: 1 }}>
                            <div className="mono">{it.sku}</div>
                            <div className="small">{it.description}</div>
                            <div className="muted small">
                              {it.size} · {it.color} · Qty {it.qty} · {inr(it.total)}
                            </div>
                            {o.cancelled ? null : it.returned ? (
                              <div style={{ marginTop: 4 }}>
                                <span className="badge badge-red">
                                  {it.returnType || 'Returned'}
                                  {it.returnedAt ? ` · ${fmtDate(it.returnedAt)}` : ''}
                                </span>
                                {it.wrongProduct && <span className="badge badge-red" style={{ marginLeft: 4 }}>Wrong product</span>}
                                <div className="small" style={{ color: 'var(--red)', marginTop: 2 }}>
                                  Charge {inr(it.returnCharge)}
                                  {it.wrongProduct && ` · Product lost ${inr(it.lostValue)}`}
                                </div>
                                {it.returnReason && <div className="muted small">{it.returnReason}</div>}
                                <button className="btn btn-sm" style={{ marginTop: 4 }} onClick={() => undoReturn(o, it)}>
                                  Undo
                                </button>
                              </div>
                            ) : (
                              <button
                                className="btn btn-sm"
                                style={{ marginTop: 4 }}
                                onClick={() => setModal({ order: o, item: it })}
                              >
                                Mark returned
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </td>
                    <td className="nowrap" data-label="Payment / Courier">
                      <span className={`badge ${o.paymentType === 'COD' ? 'badge-amber' : 'badge-grey'}`}>
                        {o.paymentType}
                      </span>
                      <div className="small" style={{ marginTop: 4 }}>
                        {o.courier} {o.serviceType && <span className="muted">· {o.serviceType} {o.pickupCode}</span>}
                      </div>
                      <div className="mono muted">{o.awb}</div>
                      {o.destinationCode && <div className="mono muted">Dest: {o.destinationCode}</div>}
                      {o.sortCodes?.length > 0 && <div className="mono muted">{o.sortCodes.join(' · ')}</div>}
                    </td>
                    <td className="num" data-label="Amount">
                      <strong style={o.cancelled ? { textDecoration: 'line-through', color: 'var(--muted)' } : undefined}>
                        {inr(o.totalAmount)}
                      </strong>
                      {o.returnedAmount > 0 && (
                        <div className="small" style={{ color: 'var(--red)' }}>−{inr(o.returnedAmount)}</div>
                      )}
                    </td>
                    <td data-label="Status">
                      <StatusBadge status={o.status} />
                      {o.cancelled && (
                        <div className="muted small" style={{ marginTop: 4 }}>
                          {fmtDate(o.cancelledAt)}
                          {o.cancelReason && <div>{o.cancelReason}</div>}
                        </div>
                      )}
                    </td>
                    <td className="nowrap row-actions">
                      <button className="btn btn-sm" onClick={() => setDetailsId(o._id)} style={{ marginRight: 6 }}>
                        Details
                      </button>
                      {o.cancelled ? (
                        <button className="btn btn-sm" onClick={() => setCancelled(o, false)} style={{ marginRight: 6 }}>
                          Undo cancel
                        </button>
                      ) : (
                        <button className="btn btn-sm" onClick={() => setCancelOrder(o)} style={{ marginRight: 6 }}>
                          Cancel
                        </button>
                      )}
                      <button className="btn btn-sm btn-danger" onClick={() => remove(o)} title="Delete order">
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {data && (
        <Pagination
          page={data.page}
          pages={data.pages}
          total={data.total}
          onChange={(p) => apply({}, p)}
        />
      )}

      {detailsOrder && <OrderDetails order={detailsOrder} onClose={() => setDetailsId(null)} />}

      {cancelOrder && (
        <CancelModal
          order={cancelOrder}
          onClose={() => setCancelOrder(null)}
          onSubmit={({ cancelReason }) => setCancelled(cancelOrder, true, cancelReason)}
        />
      )}

      {modal && (
        <ReturnModal
          title={`Return ${modal.item.sku} (${modal.item.subOrderNo})`}
          defaultLostValue={
            data?.prices?.[modal.item.sku] ? data.prices[modal.item.sku] * (modal.item.qty || 1) : undefined
          }
          onClose={() => setModal(null)}
          onSubmit={(payload) => markReturn(modal.order, modal.item, payload)}
        />
      )}
    </>
  );
}
