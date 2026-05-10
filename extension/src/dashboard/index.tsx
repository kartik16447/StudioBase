import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';

import { Layout } from './components/Layout';
import { LibraryPage } from './pages/LibraryPage';
import { AccountPage } from './pages/AccountPage';
import { JoinPage } from './pages/JoinPage';
import { AdminPage } from './pages/AdminPage';

function App() {
  const [session, setSession] = useState<any>({
    user: { email: 'Loading...', id: '' }
  });

  React.useEffect(() => {
    chrome.storage.local.get(['sv_accounts']).then(res => {
      const accounts = res.sv_accounts || [];
      if (accounts.length > 0) {
        setSession({
          user: { email: accounts[0].email, id: accounts[0].id }
        });
      }
    });
  }, []);

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout session={session} />}>
          <Route index element={<Navigate to="/library" replace />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/account" element={<AccountPage session={session} />} />
          <Route path="/join" element={<JoinPage />} />
          <Route path="/invite/:token" element={<JoinPage />} />
          <Route path="/admin" element={<AdminPage session={session} />} />
        </Route>

        <Route path="*" element={<Navigate to="/library" replace />} />
      </Routes>
    </HashRouter>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
