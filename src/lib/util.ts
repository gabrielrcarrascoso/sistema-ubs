// Funções pequenas reaproveitadas em várias telas

export const NOME_PAPEL = {
  gestor: 'Gestor(a) da Secretaria',
  coordenador: 'Coordenador(a) de UBS',
  profissional: 'Profissional',
} as const;

export const NOME_NIVEL = { executa: 'Executa', apoia: 'Apoia', verificar: 'Verificar', nao: '—' } as const;
export const CLASSE_NIVEL = {
  executa: 'status exec',
  apoia: 'status support',
  verificar: 'status verify',
  nao: 'status none',
} as const;
// Ordem em que o nível muda ao clicar numa célula da matriz
export const ORDEM_NIVEL = ['nao', 'executa', 'apoia', 'verificar'] as const;

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** '2026-09-01' -> 'set/2026' */
export function mesAno(data: string): string {
  const [a, m] = data.slice(0, 10).split('-');
  return `${MESES[Number(m) - 1]}/${a}`;
}

/** '2026-09-15' -> '15/09/2026' */
export function dataBR(data: string | null): string {
  if (!data) return '—';
  const [a, m, d] = data.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function dataHoraBR(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Últimos N meses (dia 1), do mais antigo ao mais recente: ['2026-05-01', ...] */
export function ultimosMeses(n: number, ref = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
  }
  return out;
}

export function numeroBR(v: number | null | undefined, casas = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: casas });
}

export function valorIndicador(v: number | null, unidadeMedida: string): string {
  if (v === null || v === undefined) return '—';
  return unidadeMedida === '%' ? `${numeroBR(v)}%` : `${numeroBR(v)} ${unidadeMedida}`;
}

/** Converte o texto de um campo numérico em número ou null (campo vazio NÃO vira zero) */
export function numOuNull(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function baixarArquivo(conteudo: string, nome: string, tipo: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  link.download = nome;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/** CSV no padrão do Excel brasileiro (separador ";" e BOM para os acentos) */
export function baixarCSV(linhas: (string | number | null | undefined)[][], nome: string) {
  const csv = linhas
    .map(l => l.map(c => '"' + String(c ?? '').replaceAll('"', '""') + '"').join(';'))
    .join('\r\n');
  baixarArquivo('﻿' + csv, nome, 'text/csv;charset=utf-8');
}

/** A meta foi atingida? null = não dá para dizer */
export function atingiuMeta(valor: number | null, meta: number | null, sentido: 'maior' | 'menor'): boolean | null {
  if (valor === null || meta === null) return null;
  return sentido === 'maior' ? valor >= meta : valor <= meta;
}
