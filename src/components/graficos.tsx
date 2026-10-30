import { useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, MinusCircle, Table2, BarChart3 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Gráficos do sistema (SVG/HTML puros, sem biblioteca externa).
// Paleta validada (inclusive para daltonismo) — a ordem das cores é fixa.
// Os tons ficam no CSS (styles.css, --serie1…) e mudam sozinhos entre modo escuro e claro.
// ---------------------------------------------------------------------------
export const CORES = {
  serie1: 'var(--serie1)', // verde-petróleo
  serie2: 'var(--serie2)', // terracota
  serie3: 'var(--serie3)', // azul
  serie4: 'var(--serie4)', // mostarda (pouco contraste no claro: sempre com legenda/rótulo/tabela)
  serie5: 'var(--serie5)', // ameixa
  // situação (reservadas — sempre com ícone + texto)
  bom: 'var(--bom)',
  atencao: 'var(--atencao)',
  serio: 'var(--serio)',
  critico: 'var(--critico)',
  neutro: 'var(--serie-neutra)',
} as const;
export const SERIES = [CORES.serie1, CORES.serie2, CORES.serie3, CORES.serie4, CORES.serie5];

const fmt = (v: number, casas = 1) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas });

// ---------- Dica flutuante (tooltip) ----------
interface EstadoDica {
  x: number;
  y: number;
  conteudo: ReactNode;
}
function useDica() {
  const [dica, setDica] = useState<EstadoDica | null>(null);
  const mostrar = (e: React.MouseEvent, conteudo: ReactNode) => {
    const caixa = (e.currentTarget as HTMLElement).closest('.grafico')?.getBoundingClientRect();
    if (!caixa) return;
    setDica({ x: e.clientX - caixa.left, y: e.clientY - caixa.top, conteudo });
  };
  const esconder = () => setDica(null);
  const elemento = dica && (
    <div className="grafico-dica" style={{ left: dica.x, top: dica.y }} role="tooltip">
      {dica.conteudo}
    </div>
  );
  return { mostrar, esconder, elemento };
}

/** Props para tornar uma linha/bloco clicável (mouse e teclado) */
function clicavel(aoClicar: (() => void) | undefined, titulo?: string) {
  if (!aoClicar) return {};
  return {
    role: 'button',
    tabIndex: 0,
    title: titulo,
    onClick: aoClicar,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        aoClicar();
      }
    },
  };
}

// ---------- Moldura de cada gráfico ----------
export function CartaoGrafico({
  titulo,
  subtitulo,
  children,
  tabela,
  acoes,
  className,
  verTudo,
  id,
}: {
  titulo: string;
  subtitulo?: ReactNode;
  children: ReactNode;
  tabela?: { cabecalho: string[]; linhas: (string | number)[][] };
  acoes?: ReactNode;
  className?: string;
  /** link "Ver tudo →" no canto do cartão */
  verTudo?: { rotulo?: string; aoClicar: () => void };
  id?: string;
}) {
  const [verTabela, setVerTabela] = useState(false);
  return (
    <section className={`cartao-grafico ${className ?? ''}`} id={id}>
      <header>
        <div>
          <h2>{titulo}</h2>
          {subtitulo && <p>{subtitulo}</p>}
        </div>
        <div className="cartao-grafico-acoes">
          {acoes}
          {verTudo && (
            <button className="btn small ver-tudo nao-imprimir" onClick={verTudo.aoClicar}>
              {verTudo.rotulo ?? 'Ver tudo'} <ChevronRight size={14} strokeWidth={2} />
            </button>
          )}
          {tabela && (
            <button
              className="btn icone nao-imprimir"
              title={verTabela ? 'Ver gráfico' : 'Ver como tabela'}
              aria-label={verTabela ? 'Ver gráfico' : 'Ver como tabela'}
              onClick={() => setVerTabela(!verTabela)}
            >
              {verTabela ? <BarChart3 size={15} strokeWidth={1.9} /> : <Table2 size={15} strokeWidth={1.9} />}
            </button>
          )}
        </div>
      </header>
      {verTabela && tabela ? (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>{tabela.cabecalho.map(c => <th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {tabela.linhas.map((l, i) => (
                <tr key={i}>{l.map((c, j) => <td key={j} className={typeof c === 'number' ? 'num' : ''}>{typeof c === 'number' ? fmt(c) : c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

export function Legenda({ itens }: { itens: { nome: string; cor: string }[] }) {
  return (
    <ul className="legenda">
      {itens.map(i => (
        <li key={i.nome}>
          <span className="legenda-marca" style={{ background: i.cor }} />
          {i.nome}
        </li>
      ))}
    </ul>
  );
}

export function GraficoVazio({ children }: { children: ReactNode }) {
  return <div className="grafico-vazio">{children}</div>;
}

// ---------- Barras horizontais (uma série) ----------
export function BarrasH({
  itens,
  sufixo = '',
  cor = CORES.serie1,
  referencia,
  maximo,
}: {
  itens: { rotulo: string; valor: number; detalhe?: string; cor?: string; aoClicar?: () => void }[];
  sufixo?: string;
  cor?: string;
  referencia?: { valor: number; rotulo: string };
  maximo?: number;
}) {
  const { mostrar, esconder, elemento } = useDica();
  const max = Math.max(maximo ?? 0, referencia?.valor ?? 0, ...itens.map(i => i.valor), 1);
  return (
    <div className="grafico barras-h" onMouseLeave={esconder}>
      {itens.map(i => (
        <div
          className={`barra-linha ${i.aoClicar ? 'clicavel' : ''}`}
          key={i.rotulo}
          {...clicavel(i.aoClicar, `Abrir ${i.rotulo}`)}
          onMouseMove={e => mostrar(e, <><b>{i.rotulo}</b><span>{fmt(i.valor)}{sufixo}</span>{i.detalhe && <small>{i.detalhe}</small>}</>)}
        >
          <span className="barra-rotulo" title={i.rotulo}>{i.rotulo}</span>
          <span className="barra-trilho">
            <span className="barra-preenchida" style={{ width: `${(i.valor / max) * 100}%`, background: i.cor ?? cor }} />
            {referencia && <span className="barra-referencia" style={{ left: `${(referencia.valor / max) * 100}%` }} />}
          </span>
          <span className="barra-valor">{fmt(i.valor)}{sufixo}</span>
        </div>
      ))}
      {referencia && (
        <div className="barra-linha barra-legenda-ref">
          <span />
          <span className="barra-trilho sem-fundo">
            <span className="barra-ref-rotulo" style={{ left: `${(referencia.valor / max) * 100}%` }}>{referencia.rotulo}</span>
          </span>
          <span />
        </div>
      )}
      {elemento}
    </div>
  );
}

// ---------- Barras horizontais empilhadas (várias séries) ----------
export function BarrasEmpilhadasH({
  series,
  linhas,
  sufixo = '',
  percentual,
}: {
  series: { nome: string; cor: string }[];
  linhas: { rotulo: string; valores: number[]; destaque?: ReactNode; aoClicar?: () => void }[];
  sufixo?: string;
  percentual?: boolean; // cada linha soma 100%
}) {
  const { mostrar, esconder, elemento } = useDica();
  const max = Math.max(1, ...linhas.map(l => l.valores.reduce((a, b) => a + b, 0)));
  return (
    <div className="grafico" onMouseLeave={esconder}>
      <Legenda itens={series} />
      <div className="barras-h">
        {linhas.map(l => {
          const total = l.valores.reduce((a, b) => a + b, 0);
          const base = percentual ? total || 1 : max;
          return (
            <div className={`barra-linha ${l.aoClicar ? 'clicavel' : ''}`} key={l.rotulo} {...clicavel(l.aoClicar, `Abrir ${l.rotulo}`)}>
              <span className="barra-rotulo" title={l.rotulo}>{l.rotulo}</span>
              <span className="barra-trilho empilhada">
                {l.valores.map((v, i) =>
                  v > 0 ? (
                    <span
                      key={i}
                      className="barra-segmento"
                      style={{ width: `${(v / base) * 100}%`, background: series[i].cor }}
                      onMouseMove={e =>
                        mostrar(e, <><b>{l.rotulo}</b><span>{series[i].nome}: {fmt(v)}{sufixo}</span>{percentual && total > 0 && <small>{fmt((v / total) * 100, 0)}% do total</small>}</>)
                      }
                    />
                  ) : null,
                )}
              </span>
              <span className="barra-valor">{l.destaque ?? (percentual ? '' : `${fmt(total)}${sufixo}`)}</span>
            </div>
          );
        })}
      </div>
      {elemento}
    </div>
  );
}

// ---------- Linhas (evolução mês a mês) ----------
export function Linhas({
  rotulosX,
  series,
  sufixo = '',
  meta,
}: {
  rotulosX: string[];
  series: { nome: string; cor: string; pontos: (number | null)[] }[];
  sufixo?: string;
  meta?: number | null;
}) {
  const [foco, setFoco] = useState<number | null>(null);
  const L = 640, A = 230, mE = 44, mD = 16, mT = 14, mB = 28;
  const valores = series.flatMap(s => s.pontos.filter((p): p is number => p !== null));
  const maxBruto = Math.max(meta ?? 0, ...valores, 1);
  // passo "redondo" (1, 2, 2,5 ou 5 × 10ⁿ) para o eixo ter 4 divisões com números inteiros
  const bruto = (maxBruto * 1.08) / 4;
  const ordem = Math.pow(10, Math.floor(Math.log10(bruto)));
  const passo = [1, 2, 2.5, 5, 10].map(f => f * ordem).find(v => v >= bruto) ?? 10 * ordem;
  const max = passo * 4;
  const x = (i: number) => mE + (rotulosX.length === 1 ? (L - mE - mD) / 2 : (i * (L - mE - mD)) / (rotulosX.length - 1));
  const y = (v: number) => mT + (A - mT - mB) * (1 - v / max);
  const marcas = [0, max / 4, max / 2, (3 * max) / 4, max];
  const compacto = (v: number) => (v >= 1000 ? `${fmt(v / 1000, 1)} mil` : fmt(v, 0));

  return (
    <div className="grafico" onMouseLeave={() => setFoco(null)}>
      {series.length > 1 && <Legenda itens={series} />}
      <svg viewBox={`0 0 ${L} ${A}`} className="linhas-svg" role="img" aria-label="Evolução mensal">
        {marcas.map(m => (
          <g key={m}>
            <line x1={mE} x2={L - mD} y1={y(m)} y2={y(m)} className="grade" />
            <text x={mE - 8} y={y(m) + 4} textAnchor="end" className="eixo">{compacto(m)}</text>
          </g>
        ))}
        {rotulosX.map((r, i) => (
          <text key={r} x={x(i)} y={A - 8} textAnchor="middle" className="eixo">{r}</text>
        ))}
        {meta !== null && meta !== undefined && (
          <g>
            <line x1={mE} x2={L - mD} y1={y(meta)} y2={y(meta)} className="linha-meta" />
            <text x={L - mD} y={y(meta) - 6} textAnchor="end" className="eixo forte">meta {fmt(meta)}{sufixo}</text>
          </g>
        )}
        {foco !== null && <line x1={x(foco)} x2={x(foco)} y1={mT} y2={A - mB} className="mira" />}
        {series.map(s => {
          // linha só entre pontos com dado
          const trechos: string[] = [];
          let atual = '';
          s.pontos.forEach((p, i) => {
            if (p === null) {
              if (atual) trechos.push(atual);
              atual = '';
            } else atual += `${atual ? 'L' : 'M'}${x(i)},${y(p)}`;
          });
          if (atual) trechos.push(atual);
          return (
            <g key={s.nome}>
              {trechos.map((d, k) => <path key={k} d={d} fill="none" style={{ stroke: s.cor }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
              {s.pontos.map((p, i) =>
                p !== null && (foco === i || s.pontos.length === 1 || i === lastIndex(s.pontos)) ? (
                  <circle key={i} cx={x(i)} cy={y(p)} r={4.5} style={{ fill: s.cor, stroke: 'var(--superficie)' }} strokeWidth={2} />
                ) : null,
              )}
            </g>
          );
        })}
        {/* área de toque por mês */}
        {rotulosX.map((_, i) => (
          <rect key={i} x={x(i) - (L - mE - mD) / Math.max(rotulosX.length - 1, 1) / 2} y={0} width={(L - mE - mD) / Math.max(rotulosX.length - 1, 1)} height={A} fill="transparent" onMouseEnter={() => setFoco(i)} />
        ))}
      </svg>
      {foco !== null && (
        <div className="grafico-dica fixa" style={{ left: `${(x(foco) / L) * 100}%` }}>
          <b>{rotulosX[foco]}</b>
          {series.map(s => (
            <span key={s.nome}>
              <i style={{ background: s.cor }} /> {s.nome}: {s.pontos[foco] === null ? 'sem dado' : `${fmt(s.pontos[foco] as number)}${sufixo}`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
const lastIndex = (p: (number | null)[]) => {
  for (let i = p.length - 1; i >= 0; i--) if (p[i] !== null) return i;
  return -1;
};

// ---------- Situação contra a meta (ícone + texto, nunca só cor) ----------
export type Situacao = 'atingiu' | 'abaixo' | 'sem_meta' | 'sem_dado';
export function SeloSituacao({ situacao, texto }: { situacao: Situacao; texto?: string }) {
  const mapa = {
    atingiu: { Icone: CheckCircle2, rotulo: 'Atingiu', cls: 'bom' },
    abaixo: { Icone: AlertTriangle, rotulo: 'Abaixo da meta', cls: 'critico' },
    sem_meta: { Icone: MinusCircle, rotulo: 'Sem meta', cls: 'neutro' },
    sem_dado: { Icone: MinusCircle, rotulo: 'Sem dado', cls: 'neutro' },
  }[situacao];
  return (
    <span className={`selo ${mapa.cls}`}>
      <mapa.Icone size={13} strokeWidth={2.2} /> {texto ?? mapa.rotulo}
    </span>
  );
}

/** Barra de um indicador contra a meta (estilo "bullet") */
export function BarraMeta({
  nome,
  valor,
  meta,
  sentido,
  unidade,
}: {
  nome: string;
  valor: number | null;
  meta: number | null;
  sentido: 'maior' | 'menor';
  unidade: string;
}) {
  const pct = unidade === '%';
  const max = pct ? Math.max(100, valor ?? 0, meta ?? 0) : Math.max(valor ?? 0, meta ?? 0, 1) * 1.15; // I2 pode passar de 100%
  const situacao: Situacao =
    valor === null ? 'sem_dado' : meta === null ? 'sem_meta' : (sentido === 'maior' ? valor >= meta : valor <= meta) ? 'atingiu' : 'abaixo';
  const corBarra = situacao === 'atingiu' ? CORES.serie1 : situacao === 'abaixo' ? CORES.serie2 : CORES.neutro;
  return (
    <div className="barra-meta">
      <div className="barra-meta-topo">
        <span className="barra-meta-nome">{nome}</span>
        <span className="barra-meta-valor">{valor === null ? '—' : `${fmt(valor)}${pct ? '%' : ''}`}</span>
      </div>
      <div className="barra-trilho">
        {valor !== null && <span className="barra-preenchida" style={{ width: `${Math.max(0, Math.min(100, (valor / max) * 100))}%`, background: corBarra }} />}
        {meta !== null && <span className="barra-referencia" style={{ left: `${(meta / max) * 100}%` }} title={`Meta: ${fmt(meta)}${pct ? '%' : ''}`} />}
      </div>
      <div className="barra-meta-rodape">
        <SeloSituacao situacao={situacao} />
        {meta !== null && <span className="muted">meta {sentido === 'maior' ? '≥' : '≤'} {fmt(meta)}{pct ? '%' : ''}</span>}
      </div>
    </div>
  );
}

// ---------- Número de destaque ----------
export function Numero({
  rotulo,
  valor,
  detalhe,
  destaque,
  icone,
  aoClicar,
  dica,
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  destaque?: boolean;
  icone?: ReactNode;
  aoClicar?: () => void;
  /** o que acontece ao clicar (aparece ao passar o mouse; ex.: "Ver lista") */
  dica?: string;
}) {
  return (
    <div className={`numero ${destaque ? 'destaque' : ''} ${aoClicar ? 'clicavel' : ''}`} {...clicavel(aoClicar, dica ?? rotulo)}>
      {aoClicar && <span className="numero-ir" aria-hidden="true"><ChevronRight size={16} strokeWidth={2.2} /></span>}
      <div className="numero-rotulo">{icone}{rotulo}</div>
      <div className="numero-valor">{valor}</div>
      {detalhe && <div className="numero-detalhe">{detalhe}</div>}
    </div>
  );
}
