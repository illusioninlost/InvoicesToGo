import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../apiFetch';
import ConfirmModal from '../components/ConfirmModal';

export default function TenantList() {
  const [tenants, setTenants] = useState([]);
  const [confirmId, setConfirmId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    apiFetch('/api/clients').then(r => r.json()).then(setTenants);
  }, []);

  async function handleDelete() {
    await apiFetch(`/api/clients/${confirmId}`, { method: 'DELETE' });
    setTenants(prev => prev.filter(t => t.id !== confirmId));
    setConfirmId(null);
  }

  return (
    <>
    <main className="page">
      <div className="page-header">
        <h1>Tenants</h1>
        <Link to="/tenants/new" className="btn btn-primary">+ New Tenant</Link>
      </div>

      <div className="summary-cards" style={{ gridTemplateColumns: 'repeat(1, 200px)' }}>
        <div className="summary-card">
          <div className="label">Total Tenants</div>
          <div className="value">{tenants.length}</div>
          <div className="sub">registered tenant{tenants.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          {tenants.length === 0 ? (
            <div className="empty-state">
              <p>No tenants yet.</p>
              <Link to="/tenants/new" className="btn btn-primary" style={{ marginTop: 12 }}>Add your first tenant</Link>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Address</th>
                  <th className="text-right">Monthly Rent</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 500 }}>
                      {t.name}
                      {t.recurring_enabled && (
                        <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, background: '#dbeafe', color: '#1d4ed8', borderRadius: 4, padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Auto</span>
                      )}
                    </td>
                    <td>{t.phone || <span className="text-muted">—</span>}</td>
                    <td>{t.email || <span className="text-muted">—</span>}</td>
                    <td>{t.address || <span className="text-muted">—</span>}</td>
                    <td className="text-right" style={{ fontWeight: 500 }}>{t.monthly_rent ? '$' + Number(t.monthly_rent).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : <span className="text-muted">—</span>}</td>
                    <td>
                      <div className="actions-cell">
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/tenants/${t.id}/edit`)}>Edit</button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setConfirmId(t.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>

    {confirmId && (
      <ConfirmModal
        message="Delete this tenant? This cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setConfirmId(null)}
      />
    )}
    </>
  );
}
