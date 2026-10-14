import { useEffect, type ReactNode } from 'react';
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
