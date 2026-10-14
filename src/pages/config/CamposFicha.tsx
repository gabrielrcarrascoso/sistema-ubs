import { useState, type FormEvent } from 'react';
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase, traduzErro } from '../../lib/supabase';
import { ok, useConsulta } from '../../lib/hooks';
import type { CampoFicha, TipoCampo, Unidade } from '../../lib/types';
import { lerOpcoes, NOME_TIPO_CAMPO, TIPO_TEM_OPCOES } from '../../components/CampoDinamico';
import { BotaoIcone, BarraAba, Dica, Campo, Carregando, Erro, Modal, Painel } from '../../components/ui';

export async function buscarCamposFicha(somenteAtivos = true): Promise<CampoFicha[]> {
  let q = supabase.from('campos_ficha').select('*').order('ordem').order('nome');
  if (somenteAtivos) q = q.eq('ativo', true);
  return ok(await q);
}

/** Agrupa os campos por seção, mantendo a ordem */
export function agruparPorSecao(campos: CampoFicha[]): [string, CampoFicha[]][] {
  const mapa = new Map<string, CampoFicha[]>();
  for (const c of campos) mapa.set(c.secao, [...(mapa.get(c.secao) ?? []), c]);
  return [...mapa.entries()];
}

type Edicao = Partial<CampoFicha> & { opcoesTexto?: string };

// Tela do administrador geral: define QUAIS informações a ficha de toda UBS tem
export function CamposFicha() {
  const camposQ = useConsulta(() => buscarCamposFicha(false), []);
  const [editando, setEditando] = useState<Edicao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  if (camposQ.carregando) return <Carregando />;
  const campos = camposQ.dados ?? [];
  const secoes = [...new Set(campos.map(c => c.secao))];

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!editando) return;
    setErro(null);
    const tipo = editando.tipo ?? 'texto';
    const opcoes = TIPO_TEM_OPCOES(tipo) ? lerOpcoes(editando.opcoesTexto ?? '') : [];
    if (TIPO_TEM_OPCOES(tipo) && opcoes.length < 2) return setErro('Informe pelo menos duas opções (uma por linha).');
    const registro = {
      secao: editando.secao?.trim() || 'Outras informações',
      nome: editando.nome?.trim(),
      tipo,
      opcoes,
      ajuda: editando.ajuda?.trim() || null,
      obrigatorio: editando.obrigatorio ?? false,
      ordem: editando.ordem ?? (Math.max(0, ...campos.map(c => c.ordem)) + 1),
      ativo: editando.ativo ?? true,
    };
    const { error } = editando.id
      ? await supabase.from('campos_ficha').update(registro).eq('id', editando.id)
      : await supabase.from('campos_ficha').insert(registro);
    if (error) return setErro(traduzErro(error));
    setEditando(null);
    camposQ.recarregar();
  }

  async function remover(c: CampoFicha) {
    if (!confirm(`Remover o campo "${c.nome}"?\n\nOs valores já preenchidos nas UBS deixam de aparecer. Se quiser só escondê-lo, use "Desativar".`)) return;
    const { error } = await supabase.from('campos_ficha').delete().eq('id', c.id);
    if (error) return setErro(traduzErro(error));
    camposQ.recarregar();
  }

  async function mover(c: CampoFicha, direcao: -1 | 1) {
    const daSecao = campos.filter(x => x.secao === c.secao);
    const i = daSecao.findIndex(x => x.id === c.id);
    const outro = daSecao[i + direcao];
    if (!outro) return;
    // troca a ordem dos dois campos
    const a = await supabase.from('campos_ficha').update({ ordem: outro.ordem }).eq('id', c.id);
    const b = await supabase.from('campos_ficha').update({ ordem: c.ordem === outro.ordem ? c.ordem + direcao : c.ordem }).eq('id', outro.id);
    if (a.error || b.error) setErro(traduzErro(a.error || b.error));
    camposQ.recarregar();
  }

  return (
    <>
      <Dica id="config-campos">
        Aqui você decide <b>quais informações toda UBS deve ter</b>. Criou um campo? Ele aparece na hora na ficha de todas as UBS, e o administrador de cada uma preenche. Use <b>Desativar</b> para esconder sem perder o que já foi preenchido.
      </Dica>
      <BarraAba acoes={<button className="btn primary" onClick={() => setEditando({ tipo: 'texto', secao: secoes.at(-1) ?? 'Outras informações' })}><Plus size={16} strokeWidth={1.8} /> Novo campo</button>}
      />
      <Erro mensagem={(!editando && erro) || camposQ.erro} />

      {campos.length === 0 && <div className="callout">Nenhum campo ainda. Clique em “Novo campo”.</div>}

      {agruparPorSecao(campos).map(([secao, lista]) => (
        <Painel key={secao} titulo={secao}>
          <div className="tablewrap">
            <table>
              <thead>
                <tr><th>Campo</th><th>Tipo</th><th>Opções</th><th>Situação</th><th></th></tr>
              </thead>
              <tbody>
                {lista.map((c, i) => (
                  <tr key={c.id} style={{ opacity: c.ativo ? 1 : 0.5 }}>
                    <td>
                      <b>{c.nome}</b>{c.obrigatorio && <span className="muted"> · obrigatório</span>}
                      {c.ajuda && <div className="muted">{c.ajuda}</div>}
                    </td>
                    <td>{NOME_TIPO_CAMPO[c.tipo]}</td>
                    <td className="muted">{c.opcoes.join(', ')}</td>
                    <td>{c.ativo ? <span className="chip">Ativo</span> : <span className="chip neutral">Desativado</span>}</td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button className="btn small" disabled={i === 0} onClick={() => mover(c, -1)} title="Subir"><ChevronUp size={14} strokeWidth={2} /></button>{' '}
                      <button className="btn small" disabled={i === lista.length - 1} onClick={() => mover(c, 1)} title="Descer"><ChevronDown size={14} strokeWidth={2} /></button>{' '}
                      <BotaoIcone icone={Pencil} titulo="Editar" aoClicar={() => setEditando({ ...c, opcoesTexto: c.opcoes.join('\n') })} />
                      <BotaoIcone icone={Trash2} titulo="Remover" perigo aoClicar={() => remover(c)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Painel>
      ))}

      <UbsDesativadas />

      {editando && (
        <Modal titulo={editando.id ? `Editar campo` : 'Novo campo da ficha'} aoFechar={() => setEditando(null)}>
          <form onSubmit={salvar}>
            <Erro mensagem={erro} />
            <div className="form-grid cols-2">
              <Campo rotulo="Nome do campo" className="full" dica="Ex.: Possui sala de vacina? · Nº de consultórios · Horário da farmácia">
                <input required value={editando.nome ?? ''} onChange={e => setEditando({ ...editando, nome: e.target.value })} />
              </Campo>
              <Campo rotulo="Seção" dica="Agrupa os campos na ficha. Digite uma nova para criar.">
                <input list="secoes" required value={editando.secao ?? ''} onChange={e => setEditando({ ...editando, secao: e.target.value })} />
                <datalist id="secoes">{secoes.map(s => <option key={s} value={s} />)}</datalist>
              </Campo>
              <Campo rotulo="Tipo de resposta">
                <select value={editando.tipo} onChange={e => setEditando({ ...editando, tipo: e.target.value as TipoCampo })}>
                  {(Object.keys(NOME_TIPO_CAMPO) as TipoCampo[]).map(t => <option key={t} value={t}>{NOME_TIPO_CAMPO[t]}</option>)}
                </select>
              </Campo>
              {editando.tipo && TIPO_TEM_OPCOES(editando.tipo) && (
                <Campo rotulo="Opções (uma por linha)" className="full">
                  <textarea required value={editando.opcoesTexto ?? ''} onChange={e => setEditando({ ...editando, opcoesTexto: e.target.value })} />
                </Campo>
              )}
              <Campo rotulo="Texto de ajuda (opcional)" className="full">
                <input value={editando.ajuda ?? ''} onChange={e => setEditando({ ...editando, ajuda: e.target.value })} />
              </Campo>
              <Campo rotulo="Preenchimento">
                <select value={editando.obrigatorio ? 'sim' : 'nao'} onChange={e => setEditando({ ...editando, obrigatorio: e.target.value === 'sim' })}>
                  <option value="nao">Opcional</option>
                  <option value="sim">Obrigatório</option>
                </select>
              </Campo>
              <Campo rotulo="Situação">
                <select value={editando.ativo === false ? 'nao' : 'sim'} onChange={e => setEditando({ ...editando, ativo: e.target.value === 'sim' })}>
                  <option value="sim">Ativo (aparece na ficha)</option>
                  <option value="nao">Desativado (fica escondido)</option>
                </select>
              </Campo>
            </div>
            {editando.id && (
              <div className="callout" style={{ marginTop: 12 }}>
                Mudar o tipo de um campo já preenchido pode deixar valores antigos em formato diferente. Prefira criar um campo novo.
              </div>
            )}
            <div className="actions">
              <button type="button" className="btn" onClick={() => setEditando(null)}>Cancelar</button>
              <button className="btn primary">Salvar</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

/** UBS desativadas pelo administrador geral, com opção de reativar */
function UbsDesativadas() {
  const [erro, setErro] = useState<string | null>(null);
  const { dados, recarregar } = useConsulta(
    async () => ok<Unidade[]>(await supabase.from('unidades').select('*').eq('ativa', false).order('nome')),
    [],
  );
  if (!dados?.length) return null;

  async function reativar(u: Unidade) {
    if (!confirm(`Reativar "${u.nome}"? Ela volta a aparecer em todas as telas.`)) return;
    const { error } = await supabase.from('unidades').update({ ativa: true }).eq('id', u.id);
    if (error) return setErro(traduzErro(error));
    recarregar();
  }

  return (
    <Painel titulo="UBS desativadas">
      <Erro mensagem={erro} />
      {dados.map(u => (
        <div className="item row-flex" key={u.id}>
          <b>{u.nome}</b>
          <button className="btn small" onClick={() => reativar(u)}>Reativar</button>
        </div>
      ))}
    </Painel>
  );
}
