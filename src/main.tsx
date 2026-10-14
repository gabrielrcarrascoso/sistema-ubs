import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { App } from './App';
import { ProvedorConfirmacao, ProvedorPergunta } from './components/Confirmacao';
import './styles.css';

// HashRouter usa endereços como site/#/ubs — funciona em qualquer hospedagem estática (Vercel) sem configuração extra
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <ProvedorConfirmacao>
          <ProvedorPergunta>
            <App />
          </ProvedorPergunta>
        </ProvedorConfirmacao>
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
);
