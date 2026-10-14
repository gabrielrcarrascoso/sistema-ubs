import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { supabase, traduzErro } from '../lib/supabase';
import { buscarUnidades, ok, useConsulta, useUnidadeEscolhida } from '../lib/hooks';
import type { Equipe, Unidade } from '../lib/types';
import { baixarCSV, numOuNull } from '../lib/util';
import { Cabecalho, Campo, Carregando, Cartao, Erro, Modal, Painel, SeletorUnidade } from '../components/ui';
import { CampoDinamico, mostrarValor, vazio } from '../components/CampoDinamico';
import { agruparPorSecao, buscarCamposFicha } from './CamposFicha';

type EquipeEditavel = Partial<Equipe>;
type UnidadeEditavel = Partial<Unidade>;

export function Unidades() {
  const { perfil, podeEditar, ehGestor } = useAuth();
  const unidadesQ = useConsulta(buscarUnidades, []);
  const camposQ = useConsulta(() => buscarCamposFicha(true), []);
  const inativasQ = useConsulta(
    async () => (ehGestor ? ok<Unidade[]>(await supabase.from('unidades').select('*').eq('ativa', false).order('nome')) : []),
    [ehGestor],
  );
  const [unidadeId, setUnidadeId] = useUnidadeEscolhida(unidadesQ.dados, perfil?.unidade_id);
  const equipesQ = useConsulta(
    async () =>
      unidadeId
        ? ok<Equipe[]>(await supabase.from('equipes').select('*').eq('unidade_id', unidadeId).order('ordem'))
        : [],
    [unidadeId],
  );

  const [editandoEquipe, setEditandoEquipe] = useState<EquipeEditavel | null>(null);
  const [editandoUnidade, setEditandoUnidade] = useState<UnidadeEditavel | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  if (unidadesQ.carregando || camposQ.carregando) return <Carregando />;
  const unidades = unidadesQ.dados ?? [];
  const campos = camposQ.dados ?? [];
  const u = unidades.find(x => x.id === unidadeId);
  const equipes = equipesQ.dados ?? [];
  const editavel = podeEditar(unidadeId);
  const somaCargos = equipes.reduce((s, e) => s + (e.quantidade ?? 0), 0);
  const algumSemQtd = equipes.some(e => e.quantidade === null);

  async function salvarEquipe(e: FormEvent) {
    e.preventDefault();
    if (!editandoEquipe) return;
    setErro(null);
    const registro = {
      unidade_id: unidadeId,
      cargo: editandoEquipe.cargo?.trim(),
      quantidade: editandoEquipe.quantidade ?? null,
      disponibilidade: editandoEquipe.disponibilidade || null,
      observacoes: editandoEquipe.observacoes || null,
      ordem: editandoEquipe.ordem ?? equipes.length + 1,
    };
    const resp = editandoEquipe.id
      ? await supabase.from('equipes').update(registro).eq('id', editandoEquipe.id)
      : await supabase.from('equipes').insert(registro);
    if (resp.error) return setErro(traduzErro(resp.error));
    setEditandoEquipe(null);
    equipesQ.recarregar();
  }

  async function removerEquipe(eq: Equipe) {
    if (!confirm(`Remover "${eq.cargo}" desta unidade? A linha correspondente da matriz também será removida.`)) return;
    const { error } = await supabase.from('equipes').delete().eq('id', eq.id);
    if (error) return setErro(traduzErro(error));
    equipesQ.recarregar();
  }

  async function salvarUnidade(e: FormEvent) {
    e.preventDefault();
    if (!editandoUnidade) return;
    setErro(null);
    const nome = editandoUnidade.nome?.trim() ?? '';
    const ficha = editandoUnidade.dados_ficha ?? {};
    const faltando = campos.filter(c => c.obrigatorio && vazio(ficha[c.id])).map(c => c.nome);
    if (faltando.length) return setErro(`Preencha os campos obrigatórios: ${faltando.join(', ')}.`);
    const registro = {
      dados_ficha: ficha,
      nome,
      horario: editandoUnidade.horario || null,
      volume_estimado: editandoUnidade.volume_estimado || null,
      pico: editandoUnidade.pico || null,
      profissionais_declarados: editandoUnidade.profissionais_declarados ?? null,
      observacao: editandoUnidade.observacao || null,
    };
    if (editandoUnidade.id) {
      const { error } = await supabase.from('unidades').update(registro).eq('id', editandoUnidade.id);
      if (error) return setErro(traduzErro(error));
    } else {
      const slug = nome.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);
      const { data, error } = await supabase.from('unidades').insert({ ...registro, slug }).select('id').single();
      if (error) return setErro(traduzErro(error));
      setUnidadeId(data.id);
    }
    setEditandoUnidade(null);
    unidadesQ.recarregar();
  }

  async function alterarAtiva(alvo: Unidade, ativa: boolean) {
    const msg = ativa
      ? `Reativar "${alvo.nome}"?`
      : `Desativar "${alvo.nome}"?\n\nA UBS some das telas, mas todos os dados ficam guardados e ela pode ser reativada depois.`;
    if (!confirm(msg)) return;
    const { error } = await supabase.from('unidades').update({ ativa }).eq('id', alvo.id);
    if (error) return setErro(traduzErro(error));
    setEditandoUnidade(null);
    unidadesQ.recarregar();
    inativasQ.recarregar();
  }

  function exportarFichas() {
    baixarCSV(
      [
        ['UBS', 'Horário', 'Profissionais declarados', 'Volume estimado', 'Pico', 'Observação', ...campos.map(c => c.nome)],
        ...unidades.map(x => [
          x.nome, x.horario, x.profissionais_declarados, x.volume_estimado, x.pico, x.observacao,
          ...campos.map(c => (vazio(x.dados_ficha?.[c.id]) ? '' : mostrarValor(c.tipo, x.dados_ficha[c.id]))),
        ]),
      ],
      'fichas_ubs.csv',
    );
  }

  return (
    <>
      <Cabecalho
        titulo="Unidades e equipes"
        subtitulo="Caracterização dos profissionais e da operação por unidade."
        acoes={
          <>
            <button className="btn" onClick={exportarFichas}>↓ Exportar fichas (CSV)</button>
            {ehGestor && (
              <button className="btn primary" onClick={() => setEditandoUnidade({ nome: '', dados_ficha: {} })}>
                + Nova UBS
              </button>
            )}
          </>
        }
      />
      <Erro mensagem={(!editandoUnidade && erro) || unidadesQ.erro || equipesQ.erro || camposQ.erro} />

      <Painel titulo="Selecione a UBS">
        <div className="selectrow">
          <SeletorUnidade unidades={unidades} valor={unidadeId} aoMudar={setUnidadeId} />
          {u && <span className="chip neutral">{u.profissionais_declarados ?? '—'} profissionais declarados</span>}
          {editavel && u && (
            <button className="btn small" onClick={() => setEditandoUnidade(u)}>
              Editar ficha da UBS
            </button>
          )}
        </div>
      </Painel>

      {u && (
        <>
          <div className="cards">
            <Cartao titulo="Equipe declarada" valor={u.profissionais_declarados ?? '—'} nota="Conforme fonte original" />
            <Cartao
              titulo="Contagem por cargo"
              valor={algumSemQtd && somaCargos === 0 ? 'Pendente' : somaCargos}
              nota={algumSemQtd ? 'Há cargos sem quantidade informada' : 'Soma das quantidades abaixo'}
            />
            <Cartao titulo="Atendimentos" valor={u.volume_estimado || '—'} nota="Estimativa da fonte" />
            <Cartao titulo="Horário" valor={<span style={{ fontSize: 17 }}>{u.horario || '—'}</span>} nota="Funcionamento, não escala individual" />
          </div>

          {u.profissionais_declarados !== null && !algumSemQtd && somaCargos !== u.profissionais_declarados && (
            <div className="alert" style={{ marginBottom: 20 }}>
              Divergência: {u.profissionais_declarados} profissionais declarados, mas {somaCargos} discriminados por cargo.
            </div>
          )}

          <Painel
            titulo="Ficha da UBS"
            acoes={editavel && <button className="btn small primary" onClick={() => setEditandoUnidade(u)}>Editar ficha</button>}
          >
            {campos.length === 0 && <p className="empty">Nenhum campo definido. O administrador geral define os campos em “Campos da ficha”.</p>}
            {agruparPorSecao(campos).map(([secao, lista]) => (
              <div className="ficha-secao" key={secao}>
                <h3>{secao}</h3>
                <div className="ficha-grid">
                  {lista.map(c => (
                    <div className="ficha-item" key={c.id}>
                      <span>{c.nome}</span>
                      {vazio(u.dados_ficha?.[c.id]) ? <em className="muted">não informado</em> : mostrarValor(c.tipo, u.dados_ficha[c.id])}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Painel>

          <Painel
            titulo="Equipe por categoria"
            acoes={
              editavel && (
                <button className="btn small primary" onClick={() => setEditandoEquipe({ cargo: '', quantidade: null })}>
                  + Adicionar cargo
                </button>
              )
            }
          >
            {equipesQ.carregando ? (
              <Carregando />
            ) : (
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Categoria / função</th>
                      <th className="num">Quantidade</th>
                      <th>Disponibilidade observada</th>
                      <th>Observações</th>
                      {editavel && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {equipes.map(eq => (
                      <tr key={eq.id}>
                        <td><strong>{eq.cargo}</strong></td>
                        <td className="num">
                          {eq.quantidade ?? <span className="status verify">Não informado</span>}
                        </td>
                        <td>{eq.disponibilidade}</td>
                        <td>{eq.observacoes}</td>
                        {editavel && (
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button className="btn small" onClick={() => setEditandoEquipe(eq)}>Editar</button>{' '}
                            <button className="btn small danger" onClick={() => removerEquipe(eq)}>Remover</button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {equipes.length === 0 && (
                      <tr><td colSpan={5} className="empty">Nenhum cargo cadastrado.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Painel>

          <Painel titulo="Características operacionais">
            <div className="three">
              <div className="callout"><b>Período</b><br />{u.horario || '—'}</div>
              <div className="callout"><b>Demanda informada</b><br />{u.volume_estimado || '—'}</div>
              <div className="callout"><b>Maior movimento</b><br />{u.pico || '—'}</div>
            </div>
            {u.observacao && <p className="muted" style={{ marginTop: 15 }}>{u.observacao}</p>}
          </Painel>
        </>
      )}

      {ehGestor && (inativasQ.dados?.length ?? 0) > 0 && (
        <Painel titulo="UBS desativadas">
          {inativasQ.dados!.map(x => (
            <div className="item row-flex" key={x.id}>
              <b>{x.nome}</b>
              <button className="btn small" onClick={() => alterarAtiva(x, true)}>Reativar</button>
            </div>
          ))}
        </Painel>
      )}

      {editandoEquipe && (
        <Modal titulo={editandoEquipe.id ? 'Editar cargo' : 'Adicionar cargo'} aoFechar={() => setEditandoEquipe(null)}>
          <form onSubmit={salvarEquipe}>
            <div className="form-grid cols-2">
              <Campo rotulo="Categoria / função">
                <input required value={editandoEquipe.cargo ?? ''} onChange={e => setEditandoEquipe({ ...editandoEquipe, cargo: e.target.value })} />
              </Campo>
              <Campo rotulo="Quantidade" dica="Deixe em branco se não informado.">
                <input
                  type="number"
                  min={0}
                  value={editandoEquipe.quantidade ?? ''}
                  onChange={e => setEditandoEquipe({ ...editandoEquipe, quantidade: numOuNull(e.target.value) })}
                />
              </Campo>
              <Campo rotulo="Disponibilidade observada" className="full">
                <input value={editandoEquipe.disponibilidade ?? ''} onChange={e => setEditandoEquipe({ ...editandoEquipe, disponibilidade: e.target.value })} />
              </Campo>
              <Campo rotulo="Observações / limitações" className="full">
                <textarea value={editandoEquipe.observacoes ?? ''} onChange={e => setEditandoEquipe({ ...editandoEquipe, observacoes: e.target.value })} />
              </Campo>
            </div>
            <div className="actions">
              <button type="button" className="btn" onClick={() => setEditandoEquipe(null)}>Cancelar</button>
              <button className="btn primary">Salvar</button>
            </div>
          </form>
        </Modal>
      )}

      {editandoUnidade && (
        <Modal titulo={editandoUnidade.id ? `Ficha · ${editandoUnidade.nome}` : 'Nova UBS'} aoFechar={() => setEditandoUnidade(null)}>
          <form onSubmit={salvarUnidade}>
            <Erro mensagem={erro} />
            <div className="ficha-secao"><h3>Dados gerais</h3></div>
            <div className="form-grid cols-2">
              <Campo rotulo="Nome da unidade / turno" className="full">
                <input required value={editandoUnidade.nome ?? ''} onChange={e => setEditandoUnidade({ ...editandoUnidade, nome: e.target.value })} />
              </Campo>
              <Campo rotulo="Horário de funcionamento">
                <input value={editandoUnidade.horario ?? ''} onChange={e => setEditandoUnidade({ ...editandoUnidade, horario: e.target.value })} />
              </Campo>
              <Campo rotulo="Profissionais declarados">
                <input
                  type="number"
                  min={0}
                  value={editandoUnidade.profissionais_declarados ?? ''}
                  onChange={e => setEditandoUnidade({ ...editandoUnidade, profissionais_declarados: numOuNull(e.target.value) })}
                />
              </Campo>
              <Campo rotulo="Volume de atendimentos (estimativa)">
                <input value={editandoUnidade.volume_estimado ?? ''} onChange={e => setEditandoUnidade({ ...editandoUnidade, volume_estimado: e.target.value })} />
              </Campo>
              <Campo rotulo="Dias / horários de pico">
                <input value={editandoUnidade.pico ?? ''} onChange={e => setEditandoUnidade({ ...editandoUnidade, pico: e.target.value })} />
              </Campo>
              <Campo rotulo="Observação" className="full">
                <textarea value={editandoUnidade.observacao ?? ''} onChange={e => setEditandoUnidade({ ...editandoUnidade, observacao: e.target.value })} />
              </Campo>
            </div>
            {agruparPorSecao(campos).map(([secao, lista]) => (
              <div key={secao} style={{ marginTop: 18 }}>
                <div className="ficha-secao"><h3>{secao}</h3></div>
                <div className="form-grid cols-2">
                  {lista.map(c => (
                    <Campo
                      key={c.id}
                      rotulo={c.nome + (c.obrigatorio ? ' *' : '')}
                      dica={c.ajuda ?? undefined}
                      className={c.tipo === 'texto_longo' || c.tipo === 'multipla_escolha' ? 'full' : ''}
                    >
                      <CampoDinamico
                        id={`campo-${c.id}`}
                        tipo={c.tipo}
                        opcoes={c.opcoes}
                        valor={editandoUnidade.dados_ficha?.[c.id]}
                        aoMudar={v => setEditandoUnidade({ ...editandoUnidade, dados_ficha: { ...editandoUnidade.dados_ficha, [c.id]: v } })}
                      />
                    </Campo>
                  ))}
                </div>
              </div>
            ))}
            <div className="actions">
              {ehGestor && editandoUnidade.id && (
                <button type="button" className="btn danger" style={{ marginRight: 'auto' }} onClick={() => alterarAtiva(editandoUnidade as Unidade, false)}>
                  Desativar UBS
                </button>
              )}
              <button type="button" className="btn" onClick={() => setEditandoUnidade(null)}>Cancelar</button>
              <button className="btn primary">Salvar</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
