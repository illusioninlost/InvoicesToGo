import { useState } from 'react';
import { apiFetch } from '../apiFetch';
import UpgradeNotice from './UpgradeNotice';

export default function ClientModal({ onSave, onCancel }) {
  const [form, setForm] = useState({ name: '', address: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function setField(key, val) {
    setForm(f => ({ ...f, [key]: val }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await apiFetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error === 'upgrade_required' ? data : (data.error || 'Failed to save client.'));
      setSaving(false);
      return;
    }
    onSave(data);
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 440 }}>
        <h2 style={{ marginBottom: 20, fontSize: 16 }}>Add Client</h2>
        <form onSubmit={handleSubmit}>
          <div className="auth-form">
            <div className="form-group">
              <label>Name</label>
              <input required value={form.name} onChange={e => setField('name', e.target.value)} placeholder="Tenant full name" />
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input type="tel" value={form.phone} onChange={e => setField('phone', e.target.value)} placeholder="(555) 000-0000" />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={form.email} onChange={e => setField('email', e.target.value)} placeholder="tenant@email.com" />
            </div>
            <div className="form-group">
              <label>Address</label>
              <input value={form.address} onChange={e => setField('address', e.target.value)} placeholder="Mailing address" />
            </div>
          </div>
          {error && (error.error === 'upgrade_required'
            ? <UpgradeNotice message={error.message} />
            : <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }}>{error}</div>
          )}
          <div className="modal-actions" style={{ marginTop: 20 }}>
            <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add Client'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
