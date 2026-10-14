import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { supabaseConfigurado } from './lib/supabase';
import { Layout } from './components/Layout';
import { Carregando } from './components/ui';
import { Login, Cadastro, RecuperarSenha, NovaSenha, AguardandoAprovacao, ConfiguracaoPendente } from './pages/Acesso';
import { Inicio } from './pages/Inicio';
import { PaginaUBS } from './pages/ubs/PaginaUBS';
import { Questionarios } from './pages/Questionarios';
import { QuestionarioEditar } from './pages/QuestionarioEditar';
import { QuestionarioResponder } from './pages/QuestionarioResponder';
import { QuestionarioResultados } from './pages/QuestionarioResultados';
import { PaginaIndicadores } from './pages/indicadores/PaginaIndicadores';
import { Configuracoes } from './pages/config/Configuracoes';
import { MeuPerfil } from './pages/MeuPerfil';

/** Só deixa passar quem está logado E foi aprovado pelo administrador geral */
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

// Endereços da versão anterior continuam funcionando (favoritos, links enviados)
const REDIRECIONAMENTOS: [string, string][] = [
  ['unidades', '/ubs'],
  ['matriz', '/ubs?aba=equipe'],
  ['restricoes', '/ubs?aba=restricoes'],
  ['coleta', '/ubs?aba=coletas'],
  ['lancamentos', '/indicadores?aba=lancar'],
  ['dicionario', '/indicadores?aba=definicoes'],
  ['qualidade', '/indicadores?aba=qualidade'],
  ['usuarios', '/configuracoes?aba=usuarios'],
  ['campos-ficha', '/configuracoes?aba=ficha'],
  ['auditoria', '/configuracoes?aba=historico'],
];

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
        <Route index element={<Inicio />} />
        <Route path="ubs" element={<PaginaUBS />} />
        <Route path="questionarios" element={<Questionarios />} />
        <Route path="questionarios/:id/responder" element={<QuestionarioResponder />} />
        <Route path="questionarios/:id/resultados" element={<QuestionarioResultados />} />
        <Route path="questionarios/:id/editar" element={<SoGestor><QuestionarioEditar /></SoGestor>} />
        <Route path="indicadores" element={<PaginaIndicadores />} />
        <Route path="configuracoes" element={<SoGestor><Configuracoes /></SoGestor>} />
        <Route path="perfil" element={<MeuPerfil />} />
        {REDIRECIONAMENTOS.map(([de, para]) => (
          <Route key={de} path={de} element={<Navigate to={para} replace />} />
        ))}
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
