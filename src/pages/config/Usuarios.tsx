import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { supabase, traduzErro } from '../../lib/supabase';
import { buscarUnidades, ok, useConsulta } from '../../lib/hooks';
import type { Papel, Perfil } from '../../lib/types';
import { dataBR, NOME_PAPEL } from '../../lib/util';
import { BotaoIcone, Dica, Carregando, Erro, Modal, Painel } from '../../components/ui';
import { Check, Pencil } from 'lucide-react';
import type { Unidade } from '../../lib/types';

export function Usuarios() {
  const { perfil: eu, recarregarPerfil } = useAuth();
  const [editando, setEditando] = useState<Perfil | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const { dados, carregando, erro: erroQ, recarregar } = useConsulta(async () => {
    const [perfis, unidades] = await Promise.all([
      supabase.from('perfis').select('*').order('ativo').order('nome').then(ok<Perfil[]>),
      buscarUnidades(),
    ]);
    return { perfis, unidades };
  }, [], 'usuarios');

  if (carregando) return <Carregando />;
  if (!dados) return <Erro mensagem={erroQ} />;
  const { perfis, unidades } = dados;
  const nomeUnidade = (id: string | null) => unidades.find(u => u.id === id)?.nome ?? '—';
  const aguardando = perfis.filter(p => !p.ativo);

  async function salvar() {
    if (!editando) return;
    setErro(null);
    const { error } = await supabase
      .from('perfis')
      .update({
        nome: editando.nome,
        papel: editando.papel,
        unidade_id: editando.unidade_id || null,
        ativo: editando.ativo,
      })
      .eq('id', editando.id);
    if (error) return setErro(traduzErro(error));
    if (editando.id === eu?.id) await recarregarPerfil();
    setEditando(null);
    recarregar();
  }

  return (
    <>
      <Dica id="config-usuarios">
        Quem cria conta no site aparece em <b>Sem acesso</b>. Escolha o papel (e a UBS, se for administrador de UBS) e clique em
        <b> Aprovar</b>. Para tirar o acesso de alguém, clique no lápis e mude a situação para <b>Inativo</b>.
      </Dica>
      <Erro mensagem={(!editando && erro) || erroQ} />

      {aguardando.length > 0 && (
        <Painel titulo={`Sem acesso (${aguardando.length})`}>
          <p className="muted" style={{ marginBottom: 12 }}>Pessoas que se cadastraram e ainda não foram aprovadas, ou que foram desativadas.</p>
          {aguardando.map(p => (
            <AprovacaoRapida key={p.id} perfil={p} unidades={unidades} aoAprovar={recarregar} aoErro={setErro} />
          ))}
        </Painel>
      )}

      <Painel titulo={`Com acesso (${perfis.length - aguardando.length})`}>
        <div className="tablewrap">
          <table>
            <thead>
              <tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>UBS</th><th>Desde</th><th></th></tr>
            </thead>
            <tbody>
              {perfis.filter(p => p.ativo).map(p => (
                <tr key={p.id}>
                  <td><b>{p.nome}</b>{p.id === eu?.id && <span className="muted"> (você)</span>}</td>
                  <td>{p.email}</td>
                  <td>{NOME_PAPEL[p.papel]}</td>
                  <td>{nomeUnidade(p.unidade_id)}</td>
                  <td>{dataBR(p.created_at)}</td>
                  <td style={{ textAlign: 'right' }}><BotaoIcone icone={Pencil} titulo="Alterar acesso" aoClicar={() => setEditando(p)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Painel>

      <div className="info">
        <b>Papéis:</b> Administrador geral cria as UBS, define a ficha e os questionários, aprova usuários e vê tudo ·
        Administrador da UBS altera tudo da sua unidade e responde os questionários dela · Profissional só consulta. Para desligar alguém, marque como inativo — o histórico de auditoria é preservado.
      </div>

      {editando && (
        <Modal titulo={`Acesso de ${editando.nome || editando.email}`} aoFechar={() => setEditando(null)}>
          <Erro mensagem={erro} />
          <div className="form-grid cols-2">
            <label className="field full">
              <span className="label">Nome</span>
              <input value={editando.nome} onChange={e => setEditando({ ...editando, nome: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">Papel</span>
              <select value={editando.papel} onChange={e => setEditando({ ...editando, papel: e.target.value as Papel })}>
                {(Object.keys(NOME_PAPEL) as Papel[]).map(p => <option key={p} value={p}>{NOME_PAPEL[p]}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="label">Unidade {editando.papel === 'coordenador' && '(obrigatória para administrador da UBS)'}</span>
              <select value={editando.unidade_id ?? ''} onChange={e => setEditando({ ...editando, unidade_id: e.target.value || null })}>
                <option value="">Nenhuma</option>
                {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </label>
            <label className="field full">
              <span className="label">Situação</span>
              <select value={editando.ativo ? 'ativo' : 'inativo'} onChange={e => setEditando({ ...editando, ativo: e.target.value === 'ativo' })}>
                <option value="ativo">Ativo — pode acessar o sistema</option>
                <option value="inativo">Inativo — sem acesso</option>
              </select>
            </label>
          </div>
          <div className="actions">
            <button className="btn" onClick={() => setEditando(null)}>Cancelar</button>
            <button className="btn primary" onClick={salvar}>Salvar</button>
          </div>
        </Modal>
      )}
    </>
  );
}

/** Linha de aprovação direta: escolhe papel e UBS e aprova, sem abrir janela */
function AprovacaoRapida({
  perfil: p,
  unidades,
  aoAprovar,
  aoErro,
}: {
  perfil: Perfil;
  unidades: Unidade[];
  aoAprovar: () => void;
  aoErro: (e: string | null) => void;
}) {
  const [papel, setPapel] = useState<Papel>(p.papel);
  const [unidadeId, setUnidadeId] = useState(p.unidade_id ?? '');
  const [salvando, setSalvando] = useState(false);
  const faltaUBS = papel === 'coordenador' && !unidadeId;

  async function aprovar() {
    aoErro(null);
    setSalvando(true);
    const { error } = await supabase.from('perfis').update({ papel, unidade_id: unidadeId || null, ativo: true }).eq('id', p.id);
    setSalvando(false);
    if (error) return aoErro(traduzErro(error));
    aoAprovar();
  }

  return (
    <div className="aprovacao">
      <div className="aprovacao-quem">
        <b>{p.nome || p.email}</b>
        <small>{p.email} · cadastro em {dataBR(p.created_at)}</small>
      </div>
      <select value={papel} onChange={e => setPapel(e.target.value as Papel)} aria-label="Papel" className="select-simples">
        {(Object.keys(NOME_PAPEL) as Papel[]).map(x => <option key={x} value={x}>{NOME_PAPEL[x]}</option>)}
      </select>
      <select value={unidadeId} onChange={e => setUnidadeId(e.target.value)} aria-label="UBS" className="select-simples">
        <option value="">{papel === 'coordenador' ? 'Escolha a UBS…' : 'Sem UBS'}</option>
        {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
      </select>
      <button className="btn primary" onClick={aprovar} disabled={salvando || faltaUBS} title={faltaUBS ? 'Escolha a UBS antes de aprovar' : ''}>
        <Check size={16} strokeWidth={2} /> Aprovar
      </button>
    </div>
  );
}
