import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { ConfirmProvider } from './context/ConfirmContext.jsx';
import { LiveProvider } from './context/LiveContext.jsx';
import AdminLayout from './components/layout/AdminLayout.jsx';
import Login from './pages/Login.jsx';

const Dashboard = lazy(() => import('./pages/admin/Dashboard.jsx'));
const Teams = lazy(() => import('./pages/admin/Teams.jsx'));
const Questions = lazy(() => import('./pages/admin/Questions.jsx'));
const Rounds = lazy(() => import('./pages/admin/Rounds.jsx'));
const Control = lazy(() => import('./pages/admin/Control.jsx'));
const WheelPage = lazy(() => import('./pages/admin/WheelPage.jsx'));
const Leaderboards = lazy(() => import('./pages/admin/Leaderboards.jsx'));
const History = lazy(() => import('./pages/admin/History.jsx'));
const Settings = lazy(() => import('./pages/admin/Settings.jsx'));
const LiveArena = lazy(() => import('./pages/arena/LiveArena.jsx'));
const Buzzer = lazy(() => import('./pages/arena/Buzzer.jsx'));

const Loading = () => (
  <div className="page-loading">
    <div className="spinner" />
  </div>
);

function RequireAuth({ children }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <ConfirmProvider>
        <div className="app-bg" />
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/arena/live"
              element={
                <LiveProvider role="audience">
                  <LiveArena />
                </LiveProvider>
              }
            />
            <Route path="/buzz/:side" element={<Buzzer />} />
            <Route
              path="/admin"
              element={
                <RequireAuth>
                  <LiveProvider role="host">
                    <AdminLayout />
                  </LiveProvider>
                </RequireAuth>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="control" element={<Control />} />
              <Route path="wheel" element={<WheelPage />} />
              <Route path="teams" element={<Teams />} />
              <Route path="questions" element={<Questions />} />
              <Route path="rounds" element={<Rounds />} />
              <Route path="leaderboards" element={<Leaderboards />} />
              <Route path="history" element={<History />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </Suspense>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3500,
            style: { background: '#14231F', color: '#E3DCD2', border: '1px solid rgba(227, 220, 210,.25)', borderRadius: 12, fontSize: 14 },
            success: { iconTheme: { primary: '#6FBF9C', secondary: '#01231B' } },
            error: { iconTheme: { primary: '#C4583F', secondary: '#1A0A08' }, duration: 5000 },
          }}
        />
      </ConfirmProvider>
    </AuthProvider>
  );
}
