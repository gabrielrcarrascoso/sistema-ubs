import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { supabase, traduzErro } from '../../lib/supabase';
import { buscarUnidades, ok, useConsulta } from '../../lib/hooks';
import type { Papel, Perfil } from '../../lib/types';
import { dataBR, NOME_PAPEL } from '../../lib/util';
import { Dica, Carregando, Cartao, Erro, Modal, Painel } from '../../components/ui';

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
        Quem cria conta no site aparece aqui como <b>Aguardando</b>. Clique em <b>Aprovar</b> e escolha o papel: <b>Administrador da UBS</b> (precisa escolher a UBS dele) ou <b>Profissional</b> (só consulta). Para tirar o acesso de alguém, mude a situação para <b>Inativo</b>.
      </Dica>
      <Erro mensagem={(!editando && erro) || erroQ} />

      <div className="cards">
        <Cartao titulo="Usuários" valor={perfis.length} nota="Cadastrados" />
        <Cartao titulo="Aguardando aprovação" valor={aguardando.length} nota="Sem acesso até serem aprovados" />
        <Cartao titulo="Administradores gerais" valor={perfis.filter(p => p.ativo && p.papel === 'gestor').length} nota="Acesso total" />
        <Cartao titulo="Administradores de UBS" valor={perfis.filter(p => p.ativo && p.papel === 'coordenador').length} nota="Editam a própria unidade" />
      </div>

      <Painel titulo="Todos os usuários">
        <div className="tablewrap">
          <table>
            <thead>
              <tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Unidade</th><th>Situação</th><th>Cadastro</th><th></th></tr>
            </thead>
            <tbody>
              {perfis.map(p => (
                <tr key={p.id}>
                  <td><b>{p.nome}</b>{p.id === eu?.id && <span className="muted"> (você)</span>}</td>
                  <td>{p.email}</td>
                  <td>{NOME_PAPEL[p.papel]}</td>
                  <td>{nomeUnidade(p.unidade_id)}</td>
                  <td>{p.ativo ? <span className="chip">Ativo</span> : <span className="chip warn">Aguardando</span>}</td>
                  <td>{dataBR(p.created_at)}</td>
                  <td><button className={`btn small ${p.ativo ? '' : 'primary'}`} onClick={() => setEditando(p)}>{p.ativo ? 'Editar' : 'Aprovar'}</button></td>
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
