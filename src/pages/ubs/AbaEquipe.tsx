import { useState, type FormEvent } from 'react';
import { Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase, traduzErro } from '../../lib/supabase';
import { ok, useConsulta } from '../../lib/hooks';
import type { Atividade, Competencia, Equipe, Nivel, Unidade } from '../../lib/types';
import { baixarCSV, NOME_NIVEL, numOuNull, ORDEM_NIVEL } from '../../lib/util';
import { BotaoIcone, Campo, Carregando, Dica, Erro, Modal, NivelTag, Painel } from '../../components/ui';

/** Equipe da UBS (cargos e quantidades) + matriz de quem faz cada atividade */
export function AbaEquipe({ unidade: u, editavel }: { unidade: Unidade; editavel: boolean }) {
  const [editando, setEditando] = useState<Partial<Equipe> | null>(null);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const { dados, carregando, erro: erroQ, recarregar } = useConsulta(async () => {
    const [equipes, atividades] = await Promise.all([
      supabase.from('equipes').select('*').eq('unidade_id', u.id).order('ordem').then(ok<Equipe[]>),
      supabase.from('atividades').select('*').order('ordem').then(ok<Atividade[]>),
    ]);
    const comps = equipes.length
      ? ok<Competencia[]>(await supabase.from('competencias').select('*').in('equipe_id', equipes.map(e => e.id)))
      : [];
    return { equipes, atividades, niveis: new Map(comps.map(c => [`${c.equipe_id}|${c.atividade_id}`, c.nivel])) };
  }, [u.id], 'equipe');

  if (carregando) return <Carregando />;
  if (!dados) return <Erro mensagem={erroQ} />;
  const { equipes, atividades, niveis } = dados;
  const colunas = atividades.filter(a => a.nome.toLowerCase().includes(busca.toLowerCase()));
  const nivelDe = (eq: string, at: string): Nivel => niveis.get(`${eq}|${at}`) ?? 'nao';
  const soma = equipes.reduce((s, e) => s + (e.quantidade ?? 0), 0);
  const algumSemQtd = equipes.some(e => e.quantidade === null);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!editando) return;
    setErro(null);
    const registro = {
      unidade_id: u.id,
      cargo: editando.cargo?.trim(),
      quantidade: editando.quantidade ?? null,
      disponibilidade: editando.disponibilidade || null,
      observacoes: editando.observacoes || null,
      ordem: editando.ordem ?? equipes.length + 1,
    };
    const { error } = editando.id
      ? await supabase.from('equipes').update(registro).eq('id', editando.id)
      : await supabase.from('equipes').insert(registro);
    if (error) return setErro(traduzErro(error));
    setEditando(null);
    recarregar();
  }

  async function remover(eq: Equipe) {
    if (!confirm(`Remover "${eq.cargo}" desta UBS? A linha dele na matriz também será removida.`)) return;
    const { error } = await supabase.from('equipes').delete().eq('id', eq.id);
    if (error) return setErro(traduzErro(error));
    recarregar();
  }

  async function alternar(equipeId: string, atividadeId: string) {
    if (!editavel) return;
    const atual = nivelDe(equipeId, atividadeId);
    const proximo = ORDEM_NIVEL[(ORDEM_NIVEL.indexOf(atual) + 1) % ORDEM_NIVEL.length];
    setErro(null);
    const { error } = await supabase.from('competencias').upsert({ equipe_id: equipeId, atividade_id: atividadeId, nivel: proximo });
    if (error) setErro(traduzErro(error));
    recarregar();
  }

  function exportar() {
    baixarCSV(
      [
        ['UBS', 'Cargo', 'Quantidade', 'Disponibilidade', ...atividades.map(a => a.nome)],
        ...equipes.map(eq => [u.nome, eq.cargo, eq.quantidade ?? 'não informado', eq.disponibilidade ?? '', ...atividades.map(a => NOME_NIVEL[nivelDe(eq.id, a.id)])]),
      ],
      `equipe_${u.slug}.csv`,
    );
  }

  return (
    <>
      <Dica id="ubs-equipe">
        <ol>
          <li>Em <b>Equipe</b>, cadastre cada cargo e quantos profissionais existem (deixe em branco se não souber).</li>
          <li>Na <b>Matriz</b>, {editavel ? 'clique numa célula para trocar' : 'veja'} o que cada cargo faz: <b>Executa</b>, <b>Apoia</b>, <b>Verificar</b> (precisa confirmar) ou <b>—</b> (não faz).</li>
        </ol>
      </Dica>
      <Erro mensagem={erro || erroQ} />

      {u.profissionais_declarados !== null && !algumSemQtd && soma !== u.profissionais_declarados && (
        <div className="alert" style={{ marginBottom: 16 }}>
          Atenção: a ficha diz {u.profissionais_declarados} profissionais, mas a soma dos cargos abaixo é {soma}.
        </div>
      )}

      <Painel
        titulo={`Equipe · ${algumSemQtd ? 'há cargos sem quantidade' : `${soma} profissionais`}`}
        acoes={
          <div className="actions">
            <button className="btn small" onClick={exportar}><Download size={16} strokeWidth={1.8} /> Exportar</button>
            {editavel && <button className="btn small primary" onClick={() => setEditando({ cargo: '', quantidade: null })}><Plus size={16} strokeWidth={1.8} /> Adicionar cargo</button>}
          </div>
        }
      >
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Cargo / função</th>
                <th className="num">Quantidade</th>
                <th>Disponibilidade</th>
                <th>Observações</th>
                {editavel && <th></th>}
              </tr>
            </thead>
            <tbody>
              {equipes.map(eq => (
                <tr key={eq.id}>
                  <td><strong>{eq.cargo}</strong></td>
                  <td className="num">{eq.quantidade ?? <span className="status verify">Não informado</span>}</td>
                  <td>{eq.disponibilidade}</td>
                  <td>{eq.observacoes}</td>
                  {editavel && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <BotaoIcone icone={Pencil} titulo="Editar" aoClicar={() => setEditando(eq)} />
                      <BotaoIcone icone={Trash2} titulo="Remover" perigo aoClicar={() => remover(eq)} />
                    </td>
                  )}
                </tr>
              ))}
              {equipes.length === 0 && <tr><td colSpan={5} className="empty">Nenhum cargo cadastrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </Painel>

      <Painel
        titulo="Matriz: quem faz cada atividade"
        acoes={<input className="nao-imprimir" placeholder="Buscar atividade…" value={busca} onChange={e => setBusca(e.target.value)} style={{ border: '1px solid #d8e3ec', borderRadius: 8, padding: '7px 10px' }} />}
      >
        <div className="tablewrap">
          <table className="matrix">
            <thead>
              <tr>
                <th>Cargo</th>
                {colunas.map(a => <th key={a.id}>{a.nome}</th>)}
              </tr>
            </thead>
            <tbody>
              {equipes.map(eq => (
                <tr key={eq.id}>
                  <td><strong>{eq.cargo}</strong></td>
                  {colunas.map(a => (
                    <td key={a.id}>
                      {editavel ? (
                        <button className="btn link" title="Clique para trocar" onClick={() => alternar(eq.id, a.id)}>
                          <NivelTag nivel={nivelDe(eq.id, a.id)} />
                        </button>
                      ) : (
                        <NivelTag nivel={nivelDe(eq.id, a.id)} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {equipes.length === 0 && <tr><td colSpan={colunas.length + 1} className="empty">Cadastre a equipe acima primeiro.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="selectrow" style={{ marginTop: 14 }}>
          {(['executa', 'apoia', 'verificar', 'nao'] as Nivel[]).map(n => <NivelTag key={n} nivel={n} />)}
          <span className="muted">A matriz é preliminar: não substitui habilitação legal nem gera escalas automaticamente.</span>
        </div>
      </Painel>

      {editando && (
        <Modal titulo={editando.id ? 'Editar cargo' : 'Adicionar cargo'} aoFechar={() => setEditando(null)}>
          <form onSubmit={salvar}>
            <Erro mensagem={erro} />
            <div className="form-grid cols-2">
              <Campo rotulo="Cargo / função">
                <input required value={editando.cargo ?? ''} onChange={e => setEditando({ ...editando, cargo: e.target.value })} />
              </Campo>
              <Campo rotulo="Quantidade" dica="Deixe em branco se não souber.">
                <input type="number" min={0} value={editando.quantidade ?? ''} onChange={e => setEditando({ ...editando, quantidade: numOuNull(e.target.value) })} />
              </Campo>
              <Campo rotulo="Disponibilidade (dias e horários)" className="full">
                <input value={editando.disponibilidade ?? ''} onChange={e => setEditando({ ...editando, disponibilidade: e.target.value })} />
              </Campo>
              <Campo rotulo="Observações / limitações" className="full">
                <textarea value={editando.observacoes ?? ''} onChange={e => setEditando({ ...editando, observacoes: e.target.value })} />
              </Campo>
            </div>
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
