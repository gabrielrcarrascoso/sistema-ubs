import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { App } from './App';
import './styles.css';

// HashRouter usa endereços como site/#/unidades — funciona no GitHub Pages sem configuração extra
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
);
