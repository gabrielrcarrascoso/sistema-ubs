import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { supabaseConfigurado } from './lib/supabase';
import { Layout } from './components/Layout';
import { Carregando } from './components/ui';
import { Login, Cadastro, RecuperarSenha, NovaSenha, AguardandoAprovacao, ConfiguracaoPendente } from './pages/Acesso';
import { PainelGeral } from './pages/PainelGeral';
import { Unidades } from './pages/Unidades';
import { Matriz } from './pages/Matriz';
import { Restricoes } from './pages/Restricoes';
import { Coleta } from './pages/Coleta';
import { PainelIndicadores } from './pages/PainelIndicadores';
import { Lancamentos } from './pages/Lancamentos';
import { Dicionario } from './pages/Dicionario';
import { Qualidade } from './pages/Qualidade';
import { Usuarios } from './pages/Usuarios';
import { Auditoria } from './pages/Auditoria';
import { MeuPerfil } from './pages/MeuPerfil';
import { CamposFicha } from './pages/CamposFicha';
import { Questionarios } from './pages/Questionarios';
import { QuestionarioEditar } from './pages/QuestionarioEditar';
import { QuestionarioResponder } from './pages/QuestionarioResponder';
import { QuestionarioResultados } from './pages/QuestionarioResultados';

/** Só deixa passar quem está logado E foi aprovado por um gestor */
function Protegida({ children }: { children: ReactNode }) {
  const { carregando, sessao, perfil } = useAuth();
  if (carregando) return <Carregando />;
  if (!sessao) return <Navigate to="/login" replace />;
  if (!perfil) return <Carregando />;
  if (!perfil.ativo) return <Navigate to="/aguardando" replace />;
  return <>{children}</>;
}

function SoGestor({ children }: { children: ReactNode }) {
  const { ehGestor } = useAuth();
  return ehGestor ? <>{children}</> : <Navigate to="/" replace />;
}

/** Telas de login: quem já está logado vai direto para o sistema */
function Publica({ children }: { children: ReactNode }) {
  const { carregando, sessao } = useAuth();
  if (carregando) return <Carregando />;
  if (sessao) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  if (!supabaseConfigurado) return <ConfiguracaoPendente />;

  return (
    <Routes>
      <Route path="/login" element={<Publica><Login /></Publica>} />
      <Route path="/cadastro" element={<Publica><Cadastro /></Publica>} />
      <Route path="/recuperar-senha" element={<Publica><RecuperarSenha /></Publica>} />
      <Route path="/nova-senha" element={<NovaSenha />} />
      <Route path="/aguardando" element={<AguardandoAprovacao />} />

      <Route element={<Protegida><Layout /></Protegida>}>
        <Route index element={<PainelGeral />} />
        <Route path="unidades" element={<Unidades />} />
        <Route path="matriz" element={<Matriz />} />
        <Route path="restricoes" element={<Restricoes />} />
        <Route path="coleta" element={<Coleta />} />
        <Route path="indicadores" element={<PainelIndicadores />} />
        <Route path="lancamentos" element={<Lancamentos />} />
        <Route path="dicionario" element={<Dicionario />} />
        <Route path="qualidade" element={<Qualidade />} />
        <Route path="perfil" element={<MeuPerfil />} />
        <Route path="questionarios" element={<Questionarios />} />
        <Route path="questionarios/:id/responder" element={<QuestionarioResponder />} />
        <Route path="questionarios/:id/resultados" element={<QuestionarioResultados />} />
        <Route path="questionarios/:id/editar" element={<SoGestor><QuestionarioEditar /></SoGestor>} />
        <Route path="campos-ficha" element={<SoGestor><CamposFicha /></SoGestor>} />
        <Route path="usuarios" element={<SoGestor><Usuarios /></SoGestor>} />
        <Route path="auditoria" element={<SoGestor><Auditoria /></SoGestor>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
