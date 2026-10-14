import { useState, type FormEvent } from 'react';
import { Check, Plus, RotateCcw } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { supabase, traduzErro } from '../../lib/supabase';
import { ok, useConsulta } from '../../lib/hooks';
import type { Pendencia, Restricao, Unidade } from '../../lib/types';
import { Campo, Carregando, Dica, Erro, Modal, Painel } from '../../components/ui';

const STATUS_SUGERIDOS = [
  'Confirmado em entrevista',
  'Parcialmente informado',
  'Qualitativo',
  'Quantitativo informado',
  'Estimativa',
  'Divergente',
  'Inconsistente',
  'Lacuna crítica',
  'Validado',
];
const ehAlerta = (s: string | null) => /Divergente|Inconsistente|Lacuna/i.test(s ?? '');

/** Restrições operacionais e pendências de coleta de uma UBS */
export function AbaRestricoes({ unidade, unidades }: { unidade: Unidade; unidades: Unidade[] }) {
  const { podeEditar, ehGestor } = useAuth();
  const unidadeId = unidade.id;
  const [mostrarConcluidas, setMostrarConcluidas] = useState(false);
  const [restricao, setRestricao] = useState<Partial<Restricao> | null>(null);
  const [pendencia, setPendencia] = useState<Partial<Pendencia> | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const dadosQ = useConsulta(async () => {
    if (!unidadeId) return { restricoes: [] as Restricao[], pendencias: [] as Pendencia[] };
    const [restricoes, pendencias] = await Promise.all([
      supabase.from('restricoes').select('*').eq('unidade_id', unidadeId).order('tipo').then(ok<Restricao[]>),
      supabase
        .from('pendencias')
        .select('*')
        .or(`unidade_id.eq.${unidadeId},unidade_id.is.null`)
        .order('created_at')
        .then(ok<Pendencia[]>),
    ]);
    return { restricoes, pendencias };
  }, [unidadeId]);

  const editavel = podeEditar(unidadeId);
  const podeMexerPendencia = (p: Partial<Pendencia>) => (p.unidade_id ? podeEditar(p.unidade_id) : ehGestor);
  const pesoPrioridade = { Alta: 0, Média: 1, Baixa: 2 };
  const pendencias = (dadosQ.dados?.pendencias ?? [])
    .filter(p => mostrarConcluidas || !p.concluida)
    .sort((a, b) => Number(a.concluida) - Number(b.concluida) || pesoPrioridade[a.prioridade] - pesoPrioridade[b.prioridade]);

  async function executar(promessa: PromiseLike<{ error: unknown }>, depois?: () => void) {
    setErro(null);
    const { error } = await promessa;
    if (error) return setErro(traduzErro(error));
    depois?.();
    dadosQ.recarregar();
  }

  function salvarRestricao(e: FormEvent) {
    e.preventDefault();
    if (!restricao) return;
    const registro = {
      unidade_id: unidadeId,
      tipo: restricao.tipo?.trim(),
      descricao: restricao.descricao?.trim(),
      impacto: restricao.impacto || null,
      status: restricao.status || null,
      validar: restricao.validar || null,
    };
    executar(
      restricao.id
        ? supabase.from('restricoes').update(registro).eq('id', restricao.id)
        : supabase.from('restricoes').insert(registro),
      () => setRestricao(null),
    );
  }

  function salvarPendencia(e: FormEvent) {
    e.preventDefault();
    if (!pendencia) return;
    const unidade = unidades.find(u => u.id === pendencia.unidade_id);
    const registro = {
      unidade_id: pendencia.unidade_id || null,
      escopo: unidade?.nome ?? 'Todas',
      prioridade: pendencia.prioridade ?? 'Média',
      texto: pendencia.texto?.trim(),
      motivo: pendencia.motivo || null,
    };
    executar(
      pendencia.id
        ? supabase.from('pendencias').update(registro).eq('id', pendencia.id)
        : supabase.from('pendencias').insert(registro),
      () => setPendencia(null),
    );
  }

  return (
    <>
      <Dica id="ubs-restricoes">
        <b>Restrições</b> são limitações que afetam o trabalho da UBS (falta de sala, horário indefinido, equipe incompleta…).
        <b> Pendências</b> são informações que ainda precisam ser levantadas. Marque <b>Concluir</b> quando resolver.
      </Dica>
      <Erro mensagem={erro || dadosQ.erro} />

      <Painel
        titulo="Restrições e gargalos registrados"
        acoes={editavel && <button className="btn small primary" onClick={() => setRestricao({})}><Plus size={16} strokeWidth={1.8} /> Nova restrição</button>}
      >
        {dadosQ.carregando ? (
          <Carregando />
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Dimensão</th>
                  <th>Informação disponível</th>
                  <th>Impacto</th>
                  <th>Estado</th>
                  <th>Validar em campo</th>
                  {editavel && <th></th>}
                </tr>
              </thead>
              <tbody>
                {dadosQ.dados?.restricoes.map(r => (
                  <tr key={r.id}>
                    <td><b>{r.tipo}</b></td>
                    <td>{r.descricao}</td>
                    <td>{r.impacto}</td>
                    <td>{r.status && <span className={`chip ${ehAlerta(r.status) ? 'warn' : 'neutral'}`}>{r.status}</span>}</td>
                    <td>{r.validar}</td>
                    {editavel && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn small" onClick={() => setRestricao(r)}>Editar</button>{' '}
                        <button
                          className="btn small danger"
                          onClick={() => confirm('Remover esta restrição?') && executar(supabase.from('restricoes').delete().eq('id', r.id))}
                        >
                          Remover
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {dadosQ.dados?.restricoes.length === 0 && (
                  <tr><td colSpan={6} className="empty">Nenhuma restrição registrada para esta unidade.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Painel>

      <Painel
        titulo="Pendências de coleta"
        acoes={
          <div className="actions">
            <label className="muted">
              <input type="checkbox" checked={mostrarConcluidas} onChange={e => setMostrarConcluidas(e.target.checked)} /> mostrar concluídas
            </label>
            {(editavel || ehGestor) && (
              <button className="btn small primary" onClick={() => setPendencia({ unidade_id: unidadeId, prioridade: 'Alta' })}>
                <Plus size={16} strokeWidth={1.8} /> Nova pendência
              </button>
            )}
          </div>
        }
      >
        {pendencias.length === 0 && <p className="empty">Nenhuma pendência em aberto.</p>}
        {pendencias.map(p => (
          <div className="item row-flex" key={p.id} style={{ opacity: p.concluida ? 0.55 : 1 }}>
            <div>
              <span className={`chip ${p.prioridade === 'Alta' ? 'warn' : 'neutral'}`}>{p.prioridade}</span>{' '}
              <span className="chip neutral">{p.escopo || 'Todas'}</span>{' '}
              <b style={{ textDecoration: p.concluida ? 'line-through' : 'none' }}>{p.texto}</b>
              {p.motivo && <p>{p.motivo}</p>}
            </div>
            {podeMexerPendencia(p) && (
              <div className="actions" style={{ flexShrink: 0 }}>
                <button
                  className="btn small"
                  onClick={() => executar(supabase.from('pendencias').update({ concluida: !p.concluida }).eq('id', p.id))}
                >
                  {p.concluida ? <><RotateCcw size={14} strokeWidth={1.8} /> Reabrir</> : <><Check size={14} strokeWidth={2} /> Concluir</>}
                </button>
                <button className="btn small" onClick={() => setPendencia(p)}>Editar</button>
              </div>
            )}
          </div>
        ))}
      </Painel>

      {restricao && (
        <Modal titulo={restricao.id ? 'Editar restrição' : 'Nova restrição'} aoFechar={() => setRestricao(null)}>
          <form onSubmit={salvarRestricao}>
            <div className="form-grid cols-2">
              <Campo rotulo="Dimensão" dica="Ex.: Disponibilidade, Equipe, Estrutura, Demanda">
                <input required value={restricao.tipo ?? ''} onChange={e => setRestricao({ ...restricao, tipo: e.target.value })} />
              </Campo>
              <Campo rotulo="Estado da informação">
                <input list="status-sugeridos" value={restricao.status ?? ''} onChange={e => setRestricao({ ...restricao, status: e.target.value })} />
                <datalist id="status-sugeridos">
                  {STATUS_SUGERIDOS.map(s => <option key={s} value={s} />)}
                </datalist>
              </Campo>
              <Campo rotulo="Informação disponível" className="full">
                <textarea required value={restricao.descricao ?? ''} onChange={e => setRestricao({ ...restricao, descricao: e.target.value })} />
              </Campo>
              <Campo rotulo="Impacto na designação" className="full">
                <textarea value={restricao.impacto ?? ''} onChange={e => setRestricao({ ...restricao, impacto: e.target.value })} />
              </Campo>
              <Campo rotulo="O que validar em campo" className="full">
                <input value={restricao.validar ?? ''} onChange={e => setRestricao({ ...restricao, validar: e.target.value })} />
              </Campo>
            </div>
            <div className="actions">
              <button type="button" className="btn" onClick={() => setRestricao(null)}>Cancelar</button>
              <button className="btn primary">Salvar</button>
            </div>
          </form>
        </Modal>
      )}

      {pendencia && (
        <Modal titulo={pendencia.id ? 'Editar pendência' : 'Nova pendência'} aoFechar={() => setPendencia(null)}>
          <form onSubmit={salvarPendencia}>
            <div className="form-grid cols-2">
              <Campo rotulo="Unidade">
                <select value={pendencia.unidade_id ?? ''} onChange={e => setPendencia({ ...pendencia, unidade_id: e.target.value || null })}>
                  {ehGestor && <option value="">Todas as unidades</option>}
                  {unidades.filter(u => podeEditar(u.id)).map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Prioridade">
                <select value={pendencia.prioridade ?? 'Média'} onChange={e => setPendencia({ ...pendencia, prioridade: e.target.value as Pendencia['prioridade'] })}>
                  <option>Alta</option>
                  <option>Média</option>
                  <option>Baixa</option>
                </select>
              </Campo>
              <Campo rotulo="O que precisa ser levantado" className="full">
                <input required value={pendencia.texto ?? ''} onChange={e => setPendencia({ ...pendencia, texto: e.target.value })} />
              </Campo>
              <Campo rotulo="Por quê (motivo)" className="full">
                <input value={pendencia.motivo ?? ''} onChange={e => setPendencia({ ...pendencia, motivo: e.target.value })} />
              </Campo>
            </div>
            <div className="actions">
              {pendencia.id && (
                <button
                  type="button"
                  className="btn danger"
                  style={{ marginRight: 'auto' }}
                  onClick={() =>
                    confirm('Remover esta pendência?') &&
                    executar(supabase.from('pendencias').delete().eq('id', pendencia.id!), () => setPendencia(null))
                  }
                >
                  Remover
                </button>
              )}
              <button type="button" className="btn" onClick={() => setPendencia(null)}>Cancelar</button>
              <button className="btn primary">Salvar</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
