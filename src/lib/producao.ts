import { supabase } from './supabase';
import { ok } from './hooks';
import { SERIES } from '../components/graficos';

// Produção registrada no e-SUS (totais de um período), vinda da planilha da Célula 3.
// Atenção: contagem de registros não equivale a horas trabalhadas nem a produtividade individual.

export interface Producao {
  id: string;
  unidade_id: string;
  equipe: string;
  dimensao: 'categoria' | 'tipo';
  item: string;
  quantidade: number;
  inicio: string;
  fim: string;
  fonte: string;
}

export interface ProducaoProfissional {
  id: string;
  unidade_id: string;
  equipe: string;
  nome: string; // nome real só para o administrador geral; para os demais, "Médico 1", "Médico 2"…
  nome_visivel: boolean;
  categoria: string;
  quantidade: number;
  inicio: string;
  fim: string;
  fonte: string;
  horas_semana: string | null;
  dias_turnos: string | null;
  tempo_consulta: string | null;
  status_validacao: string | null;
}

// Mesmas cores dos grupos de cargo (Médicos, Enfermagem, Saúde bucal): a cor segue a categoria em todo o sistema
export const CATEGORIAS = [
  { nome: 'Médico', plural: 'Médicos', cor: SERIES[0] },
  { nome: 'Enfermeiro', plural: 'Enfermeiros', cor: SERIES[1] },
  { nome: 'Dentista', plural: 'Dentistas', cor: SERIES[2] },
];

export const TIPOS = [
  { nome: 'Consulta Agendada', curto: 'Agendada', cor: SERIES[2] },
  { nome: 'Consulta no Dia', curto: 'No dia', cor: SERIES[3] },
  { nome: 'Consulta Agendada Programada / Cuidado Continuado', curto: 'Cuidado continuado', cor: SERIES[4] },
  { nome: 'Atendimento de Urgência', curto: 'Urgência', cor: SERIES[1] },
];

export const corDaCategoria = (c: string) => CATEGORIAS.find(x => x.nome === c)?.cor ?? SERIES[4];

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** '2026-04-01' + '2026-09-30' -> 'abr–set/2026' */
export function periodoTexto(inicio: string, fim: string) {
  const [ai, mi] = inicio.split('-').map(Number);
  const [af, mf] = fim.split('-').map(Number);
  return ai === af ? `${MESES[mi - 1]}–${MESES[mf - 1]}/${af}` : `${MESES[mi - 1]}/${ai}–${MESES[mf - 1]}/${af}`;
}

/** Número de meses cobertos pelo período (para a média mensal) */
export function mesesNoPeriodo(inicio: string, fim: string) {
  const [ai, mi] = inicio.split('-').map(Number);
  const [af, mf] = fim.split('-').map(Number);
  return Math.max(1, (af - ai) * 12 + (mf - mi) + 1);
}

export async function buscarProducao(unidadeId?: string) {
  let q = supabase.from('producao').select('*').order('equipe');
  if (unidadeId) q = q.eq('unidade_id', unidadeId);
  return ok<Producao[]>(await q);
}

export async function buscarProfissionais(unidadeId: string) {
  return ok<ProducaoProfissional[]>(
    await supabase.from('v_producao_profissionais').select('*').eq('unidade_id', unidadeId).order('quantidade', { ascending: false }),
  );
}

/** Resumo do período mais recente: total, média mensal, por equipe × categoria e por equipe × tipo */
export function resumirProducao(linhas: Producao[], nomeEquipe: (p: Producao) => string = p => p.equipe) {
  if (!linhas.length) return null;
  const inicio = linhas.map(l => l.inicio).sort().at(-1)!;
  const doPeriodo = linhas.filter(l => l.inicio === inicio);
  const fim = doPeriodo[0].fim;
  const meses = mesesNoPeriodo(inicio, fim);
  const porCategoria = doPeriodo.filter(l => l.dimensao === 'categoria');
  const equipes = [...new Map(doPeriodo.map(l => [`${l.unidade_id}|${l.equipe}`, l])).values()];
  const linhaDe = (dim: 'categoria' | 'tipo', nomes: string[]) =>
    equipes.map(e => ({
      rotulo: nomeEquipe(e),
      valores: nomes.map(n => doPeriodo.find(l => l.unidade_id === e.unidade_id && l.equipe === e.equipe && l.dimensao === dim && l.item === n)?.quantidade ?? 0),
    }));
  const categorias = CATEGORIAS.filter(c => porCategoria.some(l => l.item === c.nome));
  const total = porCategoria.reduce((s, l) => s + l.quantidade, 0);
  return {
    inicio, fim, meses, total,
    mediaMensal: total / meses,
    periodo: periodoTexto(inicio, fim),
    fonte: doPeriodo[0].fonte,
    categorias,
    porCategoria: linhaDe('categoria', categorias.map(c => c.nome)),
    porTipo: linhaDe('tipo', TIPOS.map(t => t.nome)),
  };
}
