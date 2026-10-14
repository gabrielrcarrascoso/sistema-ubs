import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Perfil } from '../lib/types';

// "Contexto" = informações do usuário logado disponíveis para qualquer tela
interface AuthInfo {
  carregando: boolean;
  sessao: Session | null;
  perfil: Perfil | null;
  emRecuperacaoDeSenha: boolean;
  recarregarPerfil: () => Promise<void>;
  sair: () => Promise<void>;
  // atalhos de permissão
  ehGestor: boolean;
  podeEditar: (unidadeId: string | null | undefined) => boolean;
}

const AuthContext = createContext<AuthInfo | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [sessao, setSessao] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [emRecuperacaoDeSenha, setRecuperacao] = useState(false);

  const buscarPerfil = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setPerfil(null);
      return;
    }
    const { data } = await supabase.from('perfis').select('*').eq('id', userId).maybeSingle();
    setPerfil((data as Perfil) ?? null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSessao(data.session);
      await buscarPerfil(data.session?.user.id);
      setCarregando(false);
    });

    const { data: inscricao } = supabase.auth.onAuthStateChange((evento, novaSessao) => {
      setSessao(novaSessao);
      if (evento === 'PASSWORD_RECOVERY') {
        setRecuperacao(true);
        window.location.hash = '#/nova-senha';
      }
      // Busca o perfil fora do callback (recomendação do Supabase para evitar travamentos)
      setTimeout(() => buscarPerfil(novaSessao?.user.id), 0);
    });
    return () => inscricao.subscription.unsubscribe();
  }, [buscarPerfil]);

  const sair = async () => {
    await supabase.auth.signOut();
    setPerfil(null);
    setRecuperacao(false);
    window.location.hash = '#/login';
  };

  const ehGestor = perfil?.ativo === true && perfil.papel === 'gestor';
  const podeEditar = (unidadeId: string | null | undefined) =>
    perfil?.ativo === true &&
    (perfil.papel === 'gestor' || (perfil.papel === 'coordenador' && !!unidadeId && perfil.unidade_id === unidadeId));

  return (
    <AuthContext.Provider
      value={{
        carregando,
        sessao,
        perfil,
        emRecuperacaoDeSenha,
        recarregarPerfil: () => buscarPerfil(sessao?.user.id),
        sair,
        ehGestor,
        podeEditar,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthInfo {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
