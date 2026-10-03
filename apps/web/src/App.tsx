import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { NAV, flattenNav, navFor, type NavItem } from '@ccp/shared';
import { AppShell } from './components/layout/AppShell';
import { canAccessPath, homePathFor } from './lib/access';
import { useAuth } from './lib/auth';
import { Account } from './pages/Account';
import { AdminUsers } from './pages/AdminUsers';
import { ComingSoon } from './pages/ComingSoon';
import { Login } from './pages/Login';

function Splash() {
  return (
    <div className="grid h-full place-items-center">
      <img src="/logo-mark.png" alt="Memuat" width={36} className="h-12 w-auto animate-pulse" />
    </div>
  );
}

function Protected() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace />;
  if (!canAccessPath(user.role, pathname)) return <Navigate to={homePathFor(user.role)} replace />;
  return <AppShell />;
}

function Home() {
  const { user } = useAuth();
  return <Navigate to={user ? homePathFor(user.role) : '/login'} replace />;
}

function Pending({ item }: { item: NavItem }) {
  const { user } = useAuth();
  // Menu induk tanpa halaman sendiri → buka anak pertama yang boleh diakses.
  if (item.children && user) {
    const first = navFor(user.role).find((n) => n.key === item.key)?.children?.[0];
    if (first) return <Navigate to={first.path} replace />;
  }
  return <ComingSoon navKey={item.key} title={item.label} />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected />}>
        <Route index element={<Home />} />
        {[...NAV.filter((n) => n.key !== 'admin-users'), ...flattenNav(NAV).filter((n) => !NAV.includes(n))].map((item) => (
          <Route key={item.key} path={item.path.slice(1)} element={<Pending item={item} />} />
        ))}
        <Route path="admin/users" element={<AdminUsers />} />
        <Route path="account" element={<Account />} />
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  );
}
