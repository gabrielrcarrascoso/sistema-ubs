import { useCallback, useEffect, useState } from 'react';
import { supabase, traduzErro } from './supabase';
import type { Unidade } from './types';

// Memória das últimas consultas (enquanto a aba do navegador estiver aberta).
// Ao voltar para uma tela, os dados aparecem na hora e são atualizados em seguida.
const memoria = new Map<string, unknown>();

/** Esquece tudo que está na memória (ex.: ao sair do sistema) */
export function limparMemoria() {
  memoria.clear();
}

/**
 * Executa uma busca no banco e controla "carregando" e "erro".
 * Uso: const { dados, carregando, erro, recarregar } = useConsulta(async () => ..., [dependências], 'nome-opcional')
 * Com um nome, o resultado fica na memória e a tela abre instantaneamente nas próximas visitas.
 */
export function useConsulta<T>(buscar: () => Promise<T>, deps: unknown[], nome?: string) {
  const chave = nome ? `${nome}:${JSON.stringify(deps)}` : null;
  const guardado = chave && memoria.has(chave) ? (memoria.get(chave) as T) : null;
  const [dados, setDados] = useState<T | null>(guardado);
  const [carregando, setCarregando] = useState(guardado === null);
  const [erro, setErro] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const executar = useCallback(buscar, deps);

  const recarregar = useCallback(async () => {
    setErro(null);
    try {
      const novos = await executar();
      if (chave) memoria.set(chave, novos);
      setDados(novos);
    } catch (e) {
      setErro(traduzErro(e));
    } finally {
      setCarregando(false);
    }
  }, [executar, chave]);

  useEffect(() => {
    if (chave && memoria.has(chave)) {
      setDados(memoria.get(chave) as T);
      setCarregando(false);
    } else {
      setCarregando(true);
    }
    recarregar();
  }, [recarregar, chave]);

  return { dados, carregando, erro, recarregar };
}

/** Lança o erro do Supabase (se houver) e devolve os dados */
export function ok<T>(resposta: { data: T | null; error: unknown }): T {
  if (resposta.error) throw resposta.error;
  return resposta.data as T;
}

export async function buscarUnidades(): Promise<Unidade[]> {
  return ok(await supabase.from('unidades').select('*').eq('ativa', true).order('nome'));
}

/** Lembra a última unidade escolhida (por navegador) */
export function useUnidadeEscolhida(unidades: Unidade[] | null, padrao?: string | null) {
  const chave = 'sistema-ubs:unidade';
  const [id, setId] = useState<string>(() => {
    try {
      return localStorage.getItem(chave) || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    if (!unidades?.length) return;
    if (!unidades.some(u => u.id === id)) {
      setId(padrao && unidades.some(u => u.id === padrao) ? padrao : unidades[0].id);
    }
  }, [unidades, id, padrao]);

  const escolher = (novo: string) => {
    setId(novo);
    try {
      localStorage.setItem(chave, novo);
    } catch {
      /* navegador sem armazenamento: tudo bem */
    }
  };
  return [id, escolher] as const;
}
