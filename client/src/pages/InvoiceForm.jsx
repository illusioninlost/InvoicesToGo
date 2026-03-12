import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '../apiFetch';
import UpgradeNotice from '../components/UpgradeNotice';

const today = () => new Date().toISOString().slice(0, 10);
const dueDefault = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
};

function newItem() {
  return { description: 'Monthly Rent', quantity: 1, unit_price: 0, amount: 0 };
}

function calcTotal(items) {
  return items.reduce((s, it) => s + (it.amount || 0), 0);
}

export default function InvoiceForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({
    invoice_number: '',
    client_name: '',
    client_email: '',
    client_address: '',
    date_created: today(),
    due_date: dueDefault(),
    status: 'unpaid',
    notes: '',
  });
  const [items, setItems] = useState([newItem()]);
  const [clients, setClients] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch('/api/clients').then(r => r.json()).then(setClients);
  }, []);

  useEffect(() => {
    if (!isEdit) {
      apiFetch('/api/invoices').then(r => r.json()).then(list => {
        const max = list.reduce((m, inv) => {
          const n = parseInt(inv.invoice_number.replace(/\D/g, ''), 10);
          return isNaN(n) ? m : Math.max(m, n);
        }, 0);
        setForm(f => ({ ...f, invoice_number: `RENT-${String(max + 1).padStart(3, '0')}` }));
      });
      return;
    }
    apiFetch(`/api/invoices/${id}`).then(r => r.json()).then(inv => {
      setForm({
        invoice_number: inv.invoice_number,
        client_name: inv.client_name,
        client_email: inv.client_email || '',
        client_address: inv.client_address || '',
        date_created: inv.date_created,
        due_date: inv.due_date,
        status: inv.status,
        notes: inv.notes || '',
      });
      setItems(inv.items.length ? inv.items : [newItem()]);
    });
  }, [id, isEdit]);

  function setField(key, val) {
    setForm(f => ({ ...f, [key]: val }));
  }

  function selectClient(clientId) {
    const c = clients.find(c => c.id === parseInt(clientId, 10));
    if (!c) return;
    setForm(f => ({ ...f, client_name: c.name, client_email: c.email || '', client_address: c.address || '' }));
    if (c.monthly_rent) {
      setItems(prev => prev.map((it, i) => {
        if (i !== 0) return it;
        const unit_price = parseFloat(c.monthly_rent);
        return { ...it, unit_price, amount: unit_price * parseFloat(it.quantity || 1) };
      }));
    }
  }

  function updateItem(index, key, val) {
    setItems(prev => {
      const next = prev.map((it, i) => {
        if (i !== index) return it;
        const updated = { ...it, [key]: val };
        if (key === 'quantity' || key === 'unit_price') {
          updated.amount = parseFloat(updated.quantity || 0) * parseFloat(updated.unit_price || 0);
        }
        return updated;
      });
      return next;
    });
  }

  function addItem() { setItems(prev => [...prev, { description: '', quantity: 1, unit_price: 0, amount: 0 }]); }
  function removeItem(i) { setItems(prev => prev.filter((_, idx) => idx !== i)); }

  const total = calcTotal(items);

  function fmt(n) {
    return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = { ...form, items, total };
    const url = isEdit ? `/api/invoices/${id}` : '/api/invoices';
    const method = isEdit ? 'PUT' : 'POST';
    const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const saved = await res.json();
    if (!res.ok) {
      setError(saved.error === 'upgrade_required' ? saved : (saved.error || 'Failed to save invoice.'));
      setSaving(false);
      return;
    }
    navigate(`/invoices/${saved.id}`);
  }

  return (
    <main className="page">
      <div className="page-header">
        <h1>{isEdit ? 'Edit Rental Invoice' : 'New Rental Invoice'}</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ padding: 24 }}>
          <div className="form-grid" style={{ marginBottom: 16 }}>
            <div className="form-group">
              <label>Invoice Number</label>
              <input required value={form.invoice_number} onChange={e => setField('invoice_number', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={form.status} onChange={e => setField('status', e.target.value)}>
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
          </div>

          <div className="section-title">Tenant Details</div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Select Tenant</label>
            <select
              required
              onChange={e => selectClient(e.target.value)}
              defaultValue=""
            >
              <option value="" disabled>— Choose a client —</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {clients.length === 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>No clients yet — use "+ Add Client" on the invoices page.</span>
            )}
          </div>
          <div className="section-title">Dates</div>
          <div className="form-grid" style={{ marginBottom: 8 }}>
            <div className="form-group">
              <label>Invoice Date</label>
              <input type="date" required value={form.date_created} onChange={e => setField('date_created', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Payment Due</label>
              <input type="date" required value={form.due_date} onChange={e => setField('due_date', e.target.value)} />
            </div>
          </div>

          <hr className="divider" />

          <div className="section-title">Charges</div>
          <table className="line-items" style={{ marginBottom: 12 }}>
            <thead>
              <tr>
                <th style={{ width: '45%' }}>Description</th>
                <th style={{ width: '10%' }}>Qty</th>
                <th style={{ width: '15%' }}>Unit Price</th>
                <th style={{ width: '15%' }}>Amount</th>
                <th style={{ width: '10%' }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td><input value={it.description} onChange={e => updateItem(i, 'description', e.target.value)} placeholder="e.g. Monthly Rent, Late Fee…" /></td>
                  <td><input type="number" min="0" step="any" value={it.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} /></td>
                  <td><input type="number" min="0" step="0.01" value={it.unit_price} onChange={e => updateItem(i, 'unit_price', e.target.value)} /></td>
                  <td className="amount-cell">{fmt(it.amount)}</td>
                  <td><button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => removeItem(i)} disabled={items.length === 1}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="btn btn-secondary btn-sm" onClick={addItem}>+ Add Charge</button>

          <hr className="divider" />

          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Notes</label>
              <textarea value={form.notes} onChange={e => setField('notes', e.target.value)} placeholder="Payment instructions, late fee policy, etc." />
            </div>
            <div className="totals-box" style={{ minWidth: 260 }}>
              <div className="totals-row grand">
                <span>Total Due</span>
                <span>{fmt(total)}</span>
              </div>
            </div>
          </div>
        </div>

        {error && (error.error === 'upgrade_required'
          ? <UpgradeNotice message={error.message} />
          : <div className="form-error" style={{ marginTop: 12, color: 'var(--danger)', fontWeight: 500 }}>{error}</div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Invoice'}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
        </div>
      </form>
    </main>
  );
}
