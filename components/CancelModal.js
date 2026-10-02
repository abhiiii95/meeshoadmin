'use client';

import { useState } from 'react';

export default function CancelModal({ order, onClose, onSubmit }) {
  const [cancelReason, setCancelReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    const err = await onSubmit({ cancelReason });
    setSaving(false);
    if (err) setError(err);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>Cancel order {order.orderNo}?</h3>
        <p className="muted small" style={{ margin: 0 }}>
          Use this when the order was cancelled before delivery (even if the label was already printed). It won&apos;t
          count in sales, profit or the customer&apos;s orders, and no return charge is applied.
        </p>
        {error && <div className="alert alert-error">{error}</div>}
        <label>
          Reason (optional)
          <input
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="e.g. Customer cancelled, Meesho cancelled"
            autoFocus
          />
        </label>
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Back
          </button>
          <button className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Cancel order'}
          </button>
        </div>
      </form>
    </div>
  );
}
