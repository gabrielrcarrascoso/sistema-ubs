import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Nivel, Unidade } from '../lib/types';
import { CLASSE_NIVEL, NOME_NIVEL } from '../lib/util';

// Peças visuais pequenas usadas em todas as telas

export function Cartao({ titulo, valor, nota }: { titulo: string; valor: ReactNode; nota?: string }) {
  return (
    <div className="card">
      <div className="k">{titulo}</div>
      <div className="value">{valor}</div>
      {nota && <small>{nota}</small>}
    </div>
  );
}

export function Painel({ titulo, acoes, children }: { titulo: string; acoes?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="section-head">
        <h2>{titulo}</h2>
        {acoes}
      </div>
      {children}
    </section>
  );
}

export function Cabecalho({ titulo, subtitulo, acoes }: { titulo: string; subtitulo: string; acoes?: ReactNode }) {
  useEffect(() => {
    document.title = `${titulo} · Sistema UBS`;
  }, [titulo]);
  return (
    <div className="top">
      <div>
        <div className="eyebrow">Sistema UBS · Salgueiro/PE</div>
        <h1>{titulo}</h1>
        <p>{subtitulo}</p>
      </div>
      {acoes && <div className="actions">{acoes}</div>}
    </div>
  );
}

export function NivelTag({ nivel }: { nivel: Nivel }) {
  return <span className={CLASSE_NIVEL[nivel]}>{NOME_NIVEL[nivel]}</span>;
}

export function Carregando() {
  return <div className="loading">Carregando…</div>;
}

export function Erro({ mensagem }: { mensagem: string | null }) {
  if (!mensagem) return null;
  return (
    <div className="error" role="alert" style={{ marginBottom: 14 }}>
      {mensagem}
    </div>
  );
}

export function Modal({ titulo, aoFechar, children }: { titulo: string; aoFechar: () => void; children: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [aoFechar]);
  return (
    <div className="modal-bg" onMouseDown={e => e.target === e.currentTarget && aoFechar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo}>
        <h2>{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

export function Campo({
  rotulo,
  dica,
  className,
  children,
}: {
  rotulo: string;
  dica?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`field ${className ?? ''}`}>
      <span className="label">{rotulo}</span>
      {children}
      {dica && <span className="hint">{dica}</span>}
    </label>
  );
}

export function SeletorUnidade({
  unidades,
  valor,
  aoMudar,
  incluirTodas,
}: {
  unidades: Unidade[];
  valor: string;
  aoMudar: (id: string) => void;
  incluirTodas?: boolean;
}) {
  return (
    <select value={valor} onChange={e => aoMudar(e.target.value)} aria-label="Unidade">
      {incluirTodas && <option value="">Todas as unidades</option>}
      {unidades.map(u => (
        <option key={u.id} value={u.id}>
          {u.nome}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Abas internas de uma página (a aba escolhida fica no endereço: ?aba=...)
// ---------------------------------------------------------------------------
export interface DefAba {
  id: string;
  rotulo: string;
  oculta?: boolean;
}

export function useAba(abas: DefAba[], padrao: string) {
  const [params, setParams] = useSearchParams();
  const visiveis = abas.filter(a => !a.oculta);
  const pedida = params.get('aba');
  const atual = visiveis.some(a => a.id === pedida) ? pedida! : padrao;
  const mudar = (id: string) => {
    const novos = new URLSearchParams(params);
    novos.set('aba', id);
    setParams(novos, { replace: true });
  };
  return [atual, mudar] as const;
}

export function BarraDeAbas({ abas, atual, aoMudar }: { abas: DefAba[]; atual: string; aoMudar: (id: string) => void }) {
  return (
    <div className="abas" role="tablist">
      {abas
        .filter(a => !a.oculta)
        .map(a => (
          <button key={a.id} role="tab" aria-selected={a.id === atual} className={a.id === atual ? 'aba ativa' : 'aba'} onClick={() => aoMudar(a.id)}>
            {a.rotulo}
          </button>
        ))}
    </div>
  );
}

/** Linha com explicação curta + botões, usada no topo de cada aba */
export function BarraAba({ texto, acoes }: { texto?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="barra-aba">
      <p>{texto}</p>
      {acoes && <div className="actions">{acoes}</div>}
    </div>
  );
}

/** Caixa "Como usar" que a pessoa pode recolher; o navegador lembra a escolha */
export function Dica({ id, children }: { id: string; children: ReactNode }) {
  const chave = `sistema-ubs:dica:${id}`;
  const [aberta, setAberta] = useState(() => {
    try {
      return localStorage.getItem(chave) !== 'fechada';
    } catch {
      return true;
    }
  });
  const alternar = () => {
    setAberta(!aberta);
    try {
      localStorage.setItem(chave, aberta ? 'fechada' : 'aberta');
    } catch {
      /* sem armazenamento */
    }
  };
  return (
    <div className={`dica ${aberta ? '' : 'fechada'} nao-imprimir`}>
      <button className="dica-titulo" onClick={alternar} aria-expanded={aberta}>
        💡 Como usar esta tela <span>{aberta ? 'esconder' : 'mostrar'}</span>
      </button>
      {aberta && <div className="dica-texto">{children}</div>}
    </div>
  );
}
