import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { NAV, flattenNav, navFor, type NavItem } from '@ccp/shared';
import { AppShell } from './components/layout/AppShell';
import { canAccessPath, homePathFor } from './lib/access';
import { useAuth } from './lib/auth';
import { Account } from './pages/Account';
import { AdminUsers } from './pages/AdminUsers';
import { BriefOrder } from './pages/BriefOrder';
import { BriefWizard } from './pages/BriefWizard';
import { ComingSoon } from './pages/ComingSoon';
import { Login } from './pages/Login';
import { WeeklyListing } from './pages/WeeklyListing';
import logoMark from './assets/logo-mark.png';

function EditBrief() {
  const { id } = useParams();
  return <BriefWizard key={`ubah-${id}`} mode="edit" />;
}

function Splash() {
  return (
    <div className="grid h-full place-items-center">
      <img src={logoMark} alt="Memuat" width={36} className="h-12 w-auto animate-pulse" />
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

/** Halaman yang sudah punya rute sendiri; sisanya tampil sebagai "Sedang dibangun". */
const IMPLEMENTED = new Set(['admin-users', 'brief-order', 'weekly-listing']);
const PENDING_ITEMS = [...NAV, ...flattenNav(NAV).filter((n) => !NAV.includes(n))].filter((n) => !IMPLEMENTED.has(n.key));

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected />}>
        <Route index element={<Home />} />
        {PENDING_ITEMS.map((item) => (
          <Route key={item.key} path={item.path.slice(1)} element={<Pending item={item} />} />
        ))}
        {/* `key` memaksa komponen dibuat ulang: tanpa itu React memakai ulang instance yang sama saat berpindah antar rute
            dan state lama (mis. filter) terbawa. */}
        <Route path="brief-order" element={<BriefOrder key="list" />} />
        <Route path="brief-order/arsip" element={<BriefOrder key="arsip" archive />} />
        <Route path="brief-order/baru" element={<BriefWizard key="baru" mode="new" />} />
        <Route path="brief-order/:id/ubah" element={<EditBrief />} />
        <Route path="production-board/weekly-listing" element={<WeeklyListing />} />
        <Route path="admin/users" element={<AdminUsers />} />
        <Route path="account" element={<Account />} />
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  );
}
