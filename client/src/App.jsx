import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useState, useRef, useEffect } from 'react';
import InvoiceList from './pages/InvoiceList';
import InvoiceForm from './pages/InvoiceForm';
import InvoiceDetail from './pages/InvoiceDetail';
import Reports from './pages/Reports';
import TenantList from './pages/TenantList';
import TenantForm from './pages/TenantForm';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ResetPassword from './pages/ResetPassword';
import Billing from './pages/Billing';

function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <nav className="navbar">
      <NavLink to="/" className="navbar-brand">RentInvoicesToGo</NavLink>
      <div className="navbar-links">
        <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>Invoices</NavLink>
        <NavLink to="/tenants" className={({ isActive }) => isActive ? 'active' : ''}>Tenants</NavLink>
        <NavLink to="/reports" className={({ isActive }) => isActive ? 'active' : ''}>Reports</NavLink>
      </div>
      {user && (
        <div className="navbar-user" ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontWeight: 500, color: 'var(--text-muted)' }}
            onClick={() => setDropdownOpen(o => !o)}
          >
            {user.name} ▾
          </button>
          {dropdownOpen && (
            <div className="navbar-dropdown">
              <Link to="/billing" className="navbar-dropdown-item" onClick={() => setDropdownOpen(false)}>
                Manage Subscription
              </Link>
              <button className="navbar-dropdown-item" onClick={handleLogout}>
                Sign out
              </button>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <div className="layout">
                  <Navbar />
                  <Routes>
                    <Route path="/" element={<InvoiceList />} />
                    <Route path="/invoices/new" element={<InvoiceForm />} />
                    <Route path="/invoices/:id/edit" element={<InvoiceForm />} />
                    <Route path="/invoices/:id" element={<InvoiceDetail />} />
                    <Route path="/tenants" element={<TenantList />} />
                    <Route path="/tenants/new" element={<TenantForm />} />
                    <Route path="/tenants/:id/edit" element={<TenantForm />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route path="/billing" element={<Billing />} />
                  </Routes>
                </div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
