// Leitura da planilha "Modelo Célula 3" (Painel, Matriz competências, Carga profissionais, Tipos atendimento).
// Esta parte só ENTENDE a planilha e monta um plano; nada é gravado aqui (a tela mostra a prévia e grava).
// A aba de Restrições é ignorada de propósito, como pediu a equipe do projeto.

export type Celula = unknown; // texto, número, data ou vazio: o leitor converte o que precisa
export interface AbaLida {
  nome: string;
  linhas: Celula[][];
}
export interface UnidadeRef {
  id: string;
  nome: string;
  slug: string;
}

export interface LinhaProducao {
  unidadeId: string;
  equipe: string;
  dimensao: 'categoria' | 'tipo';
  item: string;
  quantidade: number;
}
export interface LinhaProfissional {
  unidadeId: string;
  equipe: string;
  nome: string;
  categoria: string;
  quantidade: number;
  horas_semana: string | null;
  dias_turnos: string | null;
  tempo_consulta: string | null;
  status_validacao: string | null;
}
export interface LinhaMatriz {
  atividade: string;
  observacao: string | null;
  niveis: Record<string, 'executa' | 'apoia' | 'nao'>; // cargo -> nível
}
export interface Importacao {
  periodo: { inicio: string; fim: string } | null;
  producao: LinhaProducao[];
  profissionais: LinhaProfissional[];
  matriz: LinhaMatriz[];
  resumo: { unidadeId: string; nome: string; equipes: string[]; registros: number; profissionais: number }[];
  avisos: string[];
  erros: string[];
  abasLidas: string[];
  abasIgnoradas: string[];
}

/** minúsculas, sem acento e sem espaços repetidos */
export const normalizar = (v: Celula) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const texto = (v: Celula) => (v === null || v === undefined ? '' : String(v).trim());
const numero = (v: Celula): number | null => {
  if (typeof v === 'number') return v;
  const t = texto(v).replace(/\./g, '').replace(',', '.');
  return t && !Number.isNaN(Number(t)) ? Number(t) : null;
};

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** "Contagens e-SUS (abr–set 2026)" -> { inicio: '2026-04-01', fim: '2026-09-30' } */
export function lerPeriodo(t: string): { inicio: string; fim: string } | null {
  const m = normalizar(t).match(/([a-z]{3})[a-z]*\.?\s*[-–—a]\s*([a-z]{3})[a-z]*\.?\s*\/?\s*(\d{4})/);
  if (!m) return null;
  const mi = MESES.indexOf(m[1]) + 1;
  const mf = MESES.indexOf(m[2]) + 1;
  if (!mi || !mf) return null;
  const af = Number(m[3]);
  const ai = mi > mf ? af - 1 : af;
  const ultimoDia = new Date(af, mf, 0).getDate();
  return { inicio: `${ai}-${String(mi).padStart(2, '0')}-01`, fim: `${af}-${String(mf).padStart(2, '0')}-${ultimoDia}` };
}

function categoriaDe(t: string) {
  const n = normalizar(t);
  if (n.includes('dent') || n.includes('odont')) return 'Dentista';
  if (n.includes('enferm')) return 'Enfermeiro';
  if (n.includes('med')) return 'Médico';
  return texto(t);
}

const CARGO_DA_COLUNA: [RegExp, string][] = [
  [/^dent|odont/, 'Dentista'],
  [/^tec/, 'Técnico(a) de enfermagem'],
  [/^enferm/, 'Enfermeiro(a)'],
  [/^med/, 'Médico(a)'],
  [/^acs|agente/, 'ACS'],
];

/** Acha a linha de cabeçalho (a que começa com `primeira`) e devolve o índice de cada coluna procurada */
function cabecalho(linhas: Celula[][], primeira: string) {
  const i = linhas.findIndex(l => normalizar(l[0]).startsWith(primeira));
  const titulos = i >= 0 ? linhas[i].map(normalizar) : [];
  const col = (...nomes: string[]) => titulos.findIndex(t => nomes.some(n => t.includes(n)));
  return { inicio: i, titulos, col };
}

export function montarImportacao(abas: AbaLida[], unidades: UnidadeRef[]): Importacao {
  const r: Importacao = { periodo: null, producao: [], profissionais: [], matriz: [], resumo: [], avisos: [], erros: [], abasLidas: [], abasIgnoradas: [] };
  const aba = (trecho: string) => abas.find(a => normalizar(a.nome).includes(trecho));
  const conhecidas = ['painel', 'matriz', 'carga', 'tipo'];
  for (const a of abas) if (!conhecidas.some(c => normalizar(a.nome).includes(c))) r.abasIgnoradas.push(a.nome);

  // "Riachinho I - ESF" -> UBS Riachinho I, equipe ESF
  const naoEncontradas = new Set<string>();
  const equipeDe = (v: Celula) => {
    const t = texto(v);
    const partes = t.split(/\s+[-–—]\s+/);
    if (partes.length < 2) return null;
    const sigla = partes.pop()!.toUpperCase();
    const lugar = partes.join(' - ');
    const u = unidades.find(x => normalizar(x.nome) === normalizar(lugar) || x.slug === normalizar(lugar).replace(/ /g, '-'));
    if (!u) {
      naoEncontradas.add(lugar);
      return null;
    }
    return { unidadeId: u.id, equipe: sigla };
  };

  // ---------- Painel: registros por equipe e categoria + período ----------
  const painel = aba('painel');
  if (painel) {
    r.abasLidas.push(painel.nome);
    const c = cabecalho(painel.linhas, 'equipe');
    const cols = [
      { nome: 'Médico', i: c.col('medic') },
      { nome: 'Enfermeiro', i: c.col('enferm') },
      { nome: 'Dentista', i: c.col('dentist', 'odont') },
    ].filter(x => x.i >= 0);
    const colFonte = c.col('fonte', 'escopo', 'periodo');
    for (const l of painel.linhas.slice(c.inicio + 1)) {
      const eq = equipeDe(l[0]);
      if (!eq) continue;
      if (!r.periodo && colFonte >= 0) r.periodo = lerPeriodo(texto(l[colFonte]));
      for (const col of cols) {
        const n = numero(l[col.i]);
        if (n) r.producao.push({ ...eq, dimensao: 'categoria', item: col.nome, quantidade: Math.round(n) });
      }
    }
    if (c.inicio < 0) r.erros.push('Aba "Painel": não achei a linha de títulos que começa com "Equipe".');
  } else r.erros.push('A planilha não tem a aba "Painel" (registros por equipe).');

  // ---------- Tipos de atendimento ----------
  const tipos = aba('tipo');
  if (tipos) {
    r.abasLidas.push(tipos.nome);
    const c = cabecalho(tipos.linhas, 'equipe');
    const cTipo = c.col('tipo'), cQtd = c.col('contagem', 'total', 'quantidade');
    for (const l of tipos.linhas.slice(c.inicio + 1)) {
      const eq = equipeDe(l[0]);
      const n = numero(l[cQtd]);
      if (eq && texto(l[cTipo]) && n !== null) r.producao.push({ ...eq, dimensao: 'tipo', item: texto(l[cTipo]), quantidade: Math.round(n) });
    }
  }

  // ---------- Carga por profissional ----------
  const carga = aba('carga');
  if (carga) {
    r.abasLidas.push(carga.nome);
    const c = cabecalho(carga.linhas, 'equipe');
    const ci = {
      nome: c.col('profissional', 'nome'),
      cat: c.col('categoria', 'cargo'),
      total: c.col('total'),
      horas: c.col('horas'),
      dias: c.col('dias', 'turno'),
      tempo: c.col('tempo'),
      status: c.col('status', 'validac'),
    };
    const opcional = (i: number, l: Celula[]) => (i >= 0 && texto(l[i]) ? texto(l[i]) : null);
    for (const l of carga.linhas.slice(c.inicio + 1)) {
      const eq = equipeDe(l[0]);
      const n = numero(l[ci.total]);
      if (!eq || !texto(l[ci.nome]) || n === null) continue;
      r.profissionais.push({
        ...eq,
        nome: texto(l[ci.nome]),
        categoria: categoriaDe(texto(l[ci.cat])),
        quantidade: Math.round(n),
        horas_semana: opcional(ci.horas, l),
        dias_turnos: opcional(ci.dias, l),
        tempo_consulta: opcional(ci.tempo, l),
        status_validacao: opcional(ci.status, l),
      });
    }
  }

  // ---------- Matriz de competências (vale para todas as UBS) ----------
  const matriz = aba('matriz');
  if (matriz) {
    r.abasLidas.push(matriz.nome);
    const c = cabecalho(matriz.linhas, 'atividade');
    const colunasCargo = c.titulos
      .map((t, i) => ({ i, cargo: CARGO_DA_COLUNA.find(([re]) => re.test(t))?.[1] }))
      .filter((x): x is { i: number; cargo: string } => !!x.cargo && x.i > 0);
    const cObs = c.col('condic', 'observ');
    for (const l of matriz.linhas.slice(c.inicio + 1)) {
      const nome = texto(l[0]);
      if (!nome || /^(legenda|matriz)/i.test(normalizar(nome))) continue;
      const niveis: LinhaMatriz['niveis'] = {};
      for (const { i, cargo } of colunasCargo) {
        const v = texto(l[i]).toUpperCase();
        niveis[cargo] = v === 'P' ? 'executa' : v === 'C' ? 'apoia' : 'nao';
      }
      r.matriz.push({ atividade: nome, observacao: cObs >= 0 ? texto(l[cObs]) || null : null, niveis });
    }
  }

  // ---------- Conferências ----------
  for (const nome of naoEncontradas)
    r.erros.push(`A UBS "${nome}" não existe no sistema. Crie em UBS → Nova UBS (ou ajuste o nome na planilha); as linhas dela não serão importadas.`);
  if (!r.periodo) r.avisos.push('Não achei o período na planilha (ex.: "abr–set 2026"). Informe abaixo antes de importar.');
  const soma = new Map<string, number>();
  for (const p of r.profissionais) soma.set(`${p.unidadeId}|${p.equipe}|${p.categoria}`, (soma.get(`${p.unidadeId}|${p.equipe}|${p.categoria}`) ?? 0) + p.quantidade);
  for (const l of r.producao.filter(x => x.dimensao === 'categoria')) {
    const s = soma.get(`${l.unidadeId}|${l.equipe}|${l.item}`);
    if (s !== undefined && s !== l.quantidade) {
      const u = unidades.find(x => x.id === l.unidadeId)?.nome;
      r.avisos.push(`${u} · ${l.equipe} · ${l.item}: a soma por profissional (${s}) é diferente do total do painel (${l.quantidade}).`);
    }
  }
  for (const u of unidades) {
    const prod = r.producao.filter(p => p.unidadeId === u.id);
    if (!prod.length) continue;
    r.resumo.push({
      unidadeId: u.id,
      nome: u.nome,
      equipes: [...new Set(prod.map(p => p.equipe))],
      registros: prod.filter(p => p.dimensao === 'categoria').reduce((s, p) => s + p.quantidade, 0),
      profissionais: r.profissionais.filter(p => p.unidadeId === u.id).length,
    });
  }
  return r;
}
