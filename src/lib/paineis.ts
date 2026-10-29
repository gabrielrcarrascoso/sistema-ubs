import { SERIES } from '../components/graficos';
import type { Lancamento } from './types';
import { mesAno, ultimosMeses } from './util';
import { agregar } from './indicadores';

// Agrupa os cargos em 5 áreas, para comparar equipes de UBS diferentes
export const GRUPOS_CARGO = [
  { nome: 'Médicos', cor: SERIES[0], teste: /m[eé]dic/i },
  { nome: 'Enfermagem', cor: SERIES[1], teste: /enferm/i },
  { nome: 'Saúde bucal', cor: SERIES[2], teste: /dentist|bucal|odont/i },
  { nome: 'Agentes comunitários', cor: SERIES[3], teste: /\bacs\b|agente/i },
  { nome: 'Farmácia, recepção e apoio', cor: SERIES[4], teste: /.*/ },
] as const;

export function grupoDoCargo(cargo: string): number {
  return GRUPOS_CARGO.findIndex(g => g.teste.test(cargo));
}

/**
 * Série mensal (últimos N meses) de um indicador, juntando as UBS do filtro.
 * campo 'numerador' usa só a variável A (ex.: no C1, os atendimentos do mês).
 */
export function serieMensal(lancs: Lancamento[], indicadorId: string, meses = 12, campo: 'valor' | 'numerador' = 'valor') {
  const lista = ultimosMeses(meses);
  const doMes = (m: string) => lancs.filter(l => l.indicador_id === indicadorId && l.competencia.startsWith(m.slice(0, 7)));
  return {
    rotulos: lista.map(m => mesAno(m).replace('/20', '/')),
    pontos: lista.map(m => {
      const ls = doMes(m);
      if (campo === 'valor') return agregar(ls);
      return ls.length ? ls.reduce((s, l) => s + Number(l.numerador), 0) : null;
    }),
  };
}

/** Indicador cujo numerador são os atendimentos do mês (C1 — variação mensal) */
export const CODIGO_ATENDIMENTOS = 'C1';

/** Último mês que tem algum lançamento (ou null) */
export function ultimoMesComDado(lancs: Lancamento[]): string | null {
  return lancs.length ? lancs.map(l => l.competencia.slice(0, 10)).sort().at(-1)! : null;
}
