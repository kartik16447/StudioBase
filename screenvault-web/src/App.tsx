import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getUser } from './auth';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { LandingPage } from './pages/LandingPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { LibraryPage } from './pages/LibraryPage';
import { AccountPage } from './pages/AccountPage';
import { JoinPage } from './pages/JoinPage';
import { AdminPage } from './pages/AdminPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Signed-in visitors landing on "/" should go straight to their library,
// not the public marketing page - only logged-out visitors see that.
function RootRoute() {
  const user = getUser();
  if (user) return <Navigate to="/library" replace />;
  return <LandingPage />;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRoute />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/invite/:token" element={<JoinPage />} />

        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/join" element={<JoinPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
