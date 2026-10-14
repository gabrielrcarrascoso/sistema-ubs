import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { supabase, traduzErro } from '../lib/supabase';
import { buscarUnidades, useConsulta } from '../lib/hooks';
import { NOME_PAPEL } from '../lib/util';
import { Cabecalho, Campo, Erro, Painel } from '../components/ui';

export function MeuPerfil() {
  const { perfil, recarregarPerfil } = useAuth();
  const unidadesQ = useConsulta(buscarUnidades, []);
  const [nome, setNome] = useState(perfil?.nome ?? '');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  if (!perfil) return null;
  const unidade = unidadesQ.dados?.find(u => u.id === perfil.unidade_id);

  async function salvarNome(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    const { error } = await supabase.from('perfis').update({ nome: nome.trim() }).eq('id', perfil!.id);
    if (error) return setErro(traduzErro(error));
    await recarregarPerfil();
    setAviso('Nome atualizado.');
  }

  async function trocarSenha(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    if (senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.');
    if (senha !== confirmacao) return setErro('As senhas não conferem.');
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) return setErro(traduzErro(error));
    setSenha('');
    setConfirmacao('');
    setAviso('Senha alterada com sucesso.');
  }

  return (
    <>
      <Cabecalho titulo="Meu perfil" subtitulo="Seus dados de acesso." />
      <Erro mensagem={erro} />
      {aviso && <div className="info" style={{ marginBottom: 14 }}>{aviso}</div>}

      <div className="two">
        <Painel titulo="Dados">
          <form onSubmit={salvarNome}>
            <div className="form-grid cols-2">
              <Campo rotulo="Nome" className="full"><input required value={nome} onChange={e => setNome(e.target.value)} /></Campo>
              <Campo rotulo="E-mail"><input value={perfil.email} disabled /></Campo>
              <Campo rotulo="Papel"><input value={NOME_PAPEL[perfil.papel]} disabled /></Campo>
              <Campo rotulo="Unidade" className="full"><input value={unidade?.nome ?? 'Todas (sem vínculo)'} disabled /></Campo>
            </div>
            <div className="actions" style={{ marginTop: 14 }}><button className="btn primary">Salvar nome</button></div>
          </form>
          <p className="muted" style={{ marginTop: 12 }}>Papel e unidade só podem ser alterados por um gestor.</p>
        </Painel>

        <Painel titulo="Trocar senha">
          <form onSubmit={trocarSenha}>
            <div className="form-grid cols-2">
              <Campo rotulo="Nova senha" className="full">
                <input type="password" autoComplete="new-password" value={senha} onChange={e => setSenha(e.target.value)} />
              </Campo>
              <Campo rotulo="Confirmar nova senha" className="full">
                <input type="password" autoComplete="new-password" value={confirmacao} onChange={e => setConfirmacao(e.target.value)} />
              </Campo>
            </div>
            <div className="actions" style={{ marginTop: 14 }}><button className="btn primary">Alterar senha</button></div>
          </form>
        </Painel>
      </div>
    </>
  );
}
