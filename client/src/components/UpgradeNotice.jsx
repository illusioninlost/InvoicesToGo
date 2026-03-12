import { Link } from 'react-router-dom';

export default function UpgradeNotice({ message }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
      marginTop: 12, padding: '12px 16px',
      background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 'var(--radius)',
    }}>
      <span style={{ fontSize: 13, color: '#1e40af', fontWeight: 500 }}>
        {message || 'You\'ve reached your free plan limit.'}
      </span>
      <Link to="/billing" style={{
        fontSize: 13, fontWeight: 700, color: '#fff',
        background: 'var(--primary)', padding: '6px 12px',
        borderRadius: 'var(--radius)', textDecoration: 'none', whiteSpace: 'nowrap',
      }}>
        Upgrade Plan →
      </Link>
    </div>
  );
}
