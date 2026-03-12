import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const CHECK = '✓';

export default function Billing() {
  const { token } = useAuth();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchParams] = useSearchParams();

  const success = searchParams.get('success');
  const canceled = searchParams.get('canceled');

  useEffect(() => {
    fetch('/api/billing/status', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { setPlan(data.plan); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  async function handleUpgrade() {
    setActionLoading(true);
    setError('');
    try {
      const res = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setError(data.error || 'Something went wrong.');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePortal() {
    setActionLoading(true);
    setError('');
    try {
      const res = await fetch('/api/billing/portal', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setError(data.error || 'Something went wrong.');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) return <div className="page"><div className="page-header"><h1>Billing</h1></div><p>Loading...</p></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Billing</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>Manage your plan and subscription.</p>
      </div>

      {success && (
        <div className="alert alert-success" style={{ marginBottom: '1.5rem' }}>
          You're now on the Pro plan. Enjoy unlimited invoices and tenants!
        </div>
      )}
      {canceled && (
        <div className="alert alert-warning" style={{ marginBottom: '1.5rem' }}>
          Upgrade canceled. You're still on the Free plan.
        </div>
      )}
      {error && <div className="alert alert-error" style={{ marginBottom: '1.5rem' }}>{error}</div>}

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'stretch' }}>

        {/* Free plan card */}
        <div className="card" style={{ flex: '1', minWidth: '240px', opacity: plan === 'pro' ? 0.55 : 1, display: 'flex', flexDirection: 'column', padding: '28px' }}>
          <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Starter</span>
          </div>
          <h2 style={{ margin: '0 0 4px', fontSize: '22px' }}>Free</h2>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '1.5rem' }}>
            <span style={{ fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-1px' }}>$0</span>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>/month</span>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, marginBottom: '1.5rem' }}>
            {['Up to 5 invoices', 'Up to 3 tenants', 'Email invoices', 'Reports'].map(f => (
              <li key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                <span style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--success)', flexShrink: 0 }}>{CHECK}</span>
                {f}
              </li>
            ))}
          </ul>
          {plan === 'free' && (
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', padding: '10px 16px', background: 'var(--bg)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
              Your current plan
            </div>
          )}
        </div>

        {/* Pro plan card */}
        <div style={{
          flex: '1', minWidth: '240px',
          background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 60%, #3b82f6 100%)',
          borderRadius: 'var(--radius)',
          padding: '28px',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(37,99,235,0.35)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Background decoration */}
          <div style={{
            position: 'absolute', top: '-40px', right: '-40px',
            width: '160px', height: '160px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', bottom: '-60px', left: '-20px',
            width: '200px', height: '200px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.04)',
            pointerEvents: 'none',
          }} />

          {/* Most popular badge */}
          <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', opacity: 0.75 }}>Pro</span>
            <span style={{
              background: 'rgba(255,255,255,0.2)',
              fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px',
              textTransform: 'uppercase', padding: '3px 8px',
              borderRadius: '99px',
            }}>Most Popular</span>
          </div>

          <h2 style={{ margin: '0 0 4px', fontSize: '22px', color: '#fff' }}>Pro Plan</h2>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '1.5rem' }}>
            <span style={{ fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-1px' }}>$10</span>
            <span style={{ fontSize: '13px', opacity: 0.75 }}>/month</span>
          </div>

          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, marginBottom: '1.5rem' }}>
            {['Unlimited invoices', 'Unlimited tenants', 'Email invoices', 'Reports', 'Priority support'].map(f => (
              <li key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                <span style={{ background: 'rgba(255,255,255,0.2)', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>{CHECK}</span>
                {f}
              </li>
            ))}
          </ul>

          {plan === 'pro' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, opacity: 0.85 }}>✓ You're on Pro</div>
              <button
                onClick={handlePortal}
                disabled={actionLoading}
                style={{
                  background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
                  color: '#fff', borderRadius: 'var(--radius)', padding: '10px 16px',
                  fontWeight: 600, fontSize: '14px', cursor: 'pointer', transition: 'background 0.15s',
                }}
                onMouseOver={e => e.target.style.background = 'rgba(255,255,255,0.25)'}
                onMouseOut={e => e.target.style.background = 'rgba(255,255,255,0.15)'}
              >
                {actionLoading ? 'Loading...' : 'Manage Subscription'}
              </button>
            </div>
          ) : (
            <button
              onClick={handleUpgrade}
              disabled={actionLoading}
              style={{
                background: '#fff', border: 'none',
                color: 'var(--primary)', borderRadius: 'var(--radius)',
                padding: '12px 16px', fontWeight: 700, fontSize: '14px',
                cursor: 'pointer', transition: 'opacity 0.15s',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
              onMouseOver={e => e.target.style.opacity = '0.9'}
              onMouseOut={e => e.target.style.opacity = '1'}
            >
              {actionLoading ? 'Loading...' : 'Upgrade to Pro →'}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
