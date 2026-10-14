import { supabase } from './supabase';
import { ok } from './hooks';
import type { Indicador, Lancamento } from './types';

// Regras de cálculo dos indicadores — as MESMAS em todas as telas (fórmulas padronizadas)

export async function buscarIndicadores(somenteAtivos = false): Promise<Indicador[]> {
  let q = supabase.from('indicadores').select('*').order('codigo');
  if (somenteAtivos) q = q.eq('ativo', true);
  return ok(await q);
}

export async function buscarLancamentos(filtro: { desde?: string; unidadeId?: string; indicadorId?: string } = {}) {
  let q = supabase.from('v_lancamentos').select('*').order('competencia');
  if (filtro.desde) q = q.gte('competencia', filtro.desde);
  if (filtro.unidadeId) q = q.eq('unidade_id', filtro.unidadeId);
  if (filtro.indicadorId) q = q.eq('indicador_id', filtro.indicadorId);
  return ok<Lancamento[]>(await q);
}

/** Valor de um lançamento isolado */
export function calcularValor(tipo: Indicador['tipo'], fator: number, numerador: number | null, denominador: number | null) {
  if (numerador === null) return null;
  if (tipo === 'contagem') return numerador;
  if (!denominador) return null;
  return Math.round((numerador / denominador) * fator * 100) / 100;
}

/**
 * Junta vários lançamentos (ex.: todas as unidades de um mês).
 * Contagem: soma. Percentual/razão: soma numeradores ÷ soma denominadores
 * (nunca a média de percentuais, que distorce o resultado).
 */
export function agregar(lancs: Lancamento[]): number | null {
  if (lancs.length === 0) return null;
  const tipo = lancs[0].tipo_aplicado;
  const num = lancs.reduce((s, l) => s + Number(l.numerador), 0);
  if (tipo === 'contagem') return num;
  const den = lancs.reduce((s, l) => s + Number(l.denominador ?? 0), 0);
  return calcularValor(tipo, Number(lancs[0].fator_aplicado), num, den);
}

export function descreverFormula(i: Pick<Indicador, 'tipo' | 'numerador_desc' | 'denominador_desc' | 'fator'>) {
  if (i.tipo === 'contagem') return i.numerador_desc;
  const fator = i.fator === 1 ? '' : ` × ${Number(i.fator).toLocaleString('pt-BR')}`;
  return `(${i.numerador_desc}) ÷ (${i.denominador_desc})${fator}`;
}

export const NOME_TIPO = { percentual: 'Percentual', contagem: 'Contagem', razao: 'Razão / taxa' } as const;
