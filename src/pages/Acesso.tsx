import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { enderecoDoSite, supabase, traduzErro } from '../lib/supabase';
import { Campo, Carregando, Erro } from '../components/ui';
import { MarcaComNome } from '../components/Marca';

// Telas de acesso: login, cadastro, recuperação de senha e espera por aprovação

function CaixaAcesso({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="auth-page">
      <div className="auth-box">
        <div className="brand">
          <MarcaComNome />
        </div>
        <h2>{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

export function Login() {
  const navegar = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setEnviando(false);
    if (error) setErro(traduzErro(error));
    else navegar('/');
  }

  return (
    <CaixaAcesso titulo="Entrar">
      <form onSubmit={entrar}>
        <Erro mensagem={erro} />
        <Campo rotulo="E-mail">
          <input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
        </Campo>
        <Campo rotulo="Senha">
          <input
            type="password"
            autoComplete="current-password"
            required
            value={senha}
            onChange={e => setSenha(e.target.value)}
          />
        </Campo>
        <button className="btn primary" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <div className="auth-links">
        <Link to="/cadastro">Criar conta</Link>
        <Link to="/recuperar-senha">Esqueci minha senha</Link>
      </div>
    </CaixaAcesso>
  );
}

export function Cadastro() {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aguardandoEmail, setAguardandoEmail] = useState(false);

  async function cadastrar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.');
    if (senha !== confirmacao) return setErro('As senhas não conferem.');
    setEnviando(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: senha,
      options: { data: { nome: nome.trim() }, emailRedirectTo: enderecoDoSite() },
    });
    setEnviando(false);
    if (error) return setErro(traduzErro(error));
    // Sem sessão = o Supabase pediu confirmação por e-mail
    if (!data.session) setAguardandoEmail(true);
  }

  if (aguardandoEmail) {
    return (
      <CaixaAcesso titulo="Confirme seu e-mail">
        <div className="info">
          Enviamos um link de confirmação para <b>{email}</b>. Abra o e-mail <b>neste mesmo navegador</b> e clique
          no link. Depois disso, o administrador geral precisa aprovar seu acesso.
        </div>
        <div className="auth-links">
          <Link to="/login">Voltar para o login</Link>
        </div>
      </CaixaAcesso>
    );
  }

  return (
    <CaixaAcesso titulo="Criar conta">
      <p className="muted" style={{ marginBottom: 6 }}>
        Após o cadastro, o administrador geral precisa aprovar seu acesso.
      </p>
      <form onSubmit={cadastrar}>
        <Erro mensagem={erro} />
        <Campo rotulo="Nome completo">
          <input autoComplete="name" required value={nome} onChange={e => setNome(e.target.value)} />
        </Campo>
        <Campo rotulo="E-mail">
          <input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
        </Campo>
        <Campo rotulo="Senha" dica="Mínimo de 8 caracteres.">
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={senha}
            onChange={e => setSenha(e.target.value)}
          />
        </Campo>
        <Campo rotulo="Confirmar senha">
          <input
            type="password"
            autoComplete="new-password"
            required
            value={confirmacao}
            onChange={e => setConfirmacao(e.target.value)}
          />
        </Campo>
        <button className="btn primary" disabled={enviando}>
          {enviando ? 'Criando…' : 'Criar conta'}
        </button>
      </form>
      <div className="auth-links">
        <Link to="/login">Já tenho conta</Link>
      </div>
    </CaixaAcesso>
  );
}

export function RecuperarSenha() {
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: enderecoDoSite() });
    setEnviando(false);
    if (error) setErro(traduzErro(error));
    else setEnviado(true);
  }

  return (
    <CaixaAcesso titulo="Recuperar senha">
      {enviado ? (
        <div className="info">
          Se existir uma conta com <b>{email}</b>, você receberá um link para criar uma nova senha. Abra o link{' '}
          <b>neste mesmo navegador</b>.
        </div>
      ) : (
        <form onSubmit={enviar}>
          <Erro mensagem={erro} />
          <Campo rotulo="E-mail da sua conta">
            <input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
          </Campo>
          <button className="btn primary" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar link'}
          </button>
        </form>
      )}
      <div className="auth-links">
        <Link to="/login">Voltar para o login</Link>
      </div>
    </CaixaAcesso>
  );
}

export function NovaSenha() {
  const { carregando, sessao } = useAuth();
  const navegar = useNavigate();
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (carregando) return <Carregando />;
  if (!sessao) {
    return (
      <CaixaAcesso titulo="Link inválido ou expirado">
        <div className="alert">
          Abra o link de recuperação no mesmo navegador em que você o pediu, ou solicite um novo.
        </div>
        <div className="auth-links">
          <Link to="/recuperar-senha">Pedir novo link</Link>
        </div>
      </CaixaAcesso>
    );
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.');
    if (senha !== confirmacao) return setErro('As senhas não conferem.');
    setEnviando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setEnviando(false);
    if (error) return setErro(traduzErro(error));
    navegar('/');
  }

  return (
    <CaixaAcesso titulo="Criar nova senha">
      <form onSubmit={salvar}>
        <Erro mensagem={erro} />
        <Campo rotulo="Nova senha" dica="Mínimo de 8 caracteres.">
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={senha}
            onChange={e => setSenha(e.target.value)}
          />
        </Campo>
        <Campo rotulo="Confirmar nova senha">
          <input
            type="password"
            autoComplete="new-password"
            required
            value={confirmacao}
            onChange={e => setConfirmacao(e.target.value)}
          />
        </Campo>
        <button className="btn primary" disabled={enviando}>
          {enviando ? 'Salvando…' : 'Salvar nova senha'}
        </button>
      </form>
    </CaixaAcesso>
  );
}

export function AguardandoAprovacao() {
  const { carregando, sessao, perfil, recarregarPerfil, sair } = useAuth();
  if (carregando) return <Carregando />;
  if (!sessao) return <Navigate to="/login" replace />;
  if (perfil?.ativo) return <Navigate to="/" replace />;

  return (
    <CaixaAcesso titulo="Aguardando aprovação">
      <div className="info">
        Olá{perfil?.nome ? `, ${perfil.nome}` : ''}! Sua conta foi criada. O administrador geral precisa aprovar seu
        acesso e definir seu papel (administrador da UBS ou profissional).
      </div>
      <div className="actions" style={{ marginTop: 16 }}>
        <button className="btn primary" onClick={recarregarPerfil}>
          Verificar novamente
        </button>
        <button className="btn" onClick={sair}>
          Sair
        </button>
      </div>
    </CaixaAcesso>
  );
}

export function ConfiguracaoPendente() {
  return (
    <CaixaAcesso titulo="Configuração pendente">
      <div className="alert">
        O sistema ainda não foi ligado ao banco de dados. Crie o arquivo <code>.env.local</code> a partir do{' '}
        <code>.env.example</code> e preencha <code>VITE_SUPABASE_URL</code> e{' '}
        <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>. Veja o passo a passo no README.
      </div>
    </CaixaAcesso>
  );
}
