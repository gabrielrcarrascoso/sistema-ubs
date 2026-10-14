import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { NOME_PAPEL } from '../lib/util';

// Moldura das telas internas: menu lateral (poucas opções, de propósito) + conteúdo
export function Layout() {
  const { perfil, ehGestor, sair } = useAuth();
  const link = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav active' : 'nav');

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <span className="logo">UBS</span>
          <span>
            <strong>Sistema UBS</strong>
            <small>Salgueiro/PE · Atenção Primária</small>
          </span>
        </div>

        <nav className="menu" aria-label="Menu principal">
          <NavLink to="/" end className={link}>🏠 &nbsp;Início</NavLink>
          <NavLink to="/ubs" className={link}>🏥 &nbsp;{perfil?.papel === 'coordenador' ? 'Minha UBS' : 'UBS'}</NavLink>
          <NavLink to="/questionarios" className={link}>✍ &nbsp;Questionários</NavLink>
          <NavLink to="/indicadores" className={link}>📊 &nbsp;Indicadores</NavLink>
          {ehGestor && <NavLink to="/configuracoes" className={link}>⚙ &nbsp;Configurações</NavLink>}
        </nav>

        <div className="side-user">
          <div>
            <NavLink to="/perfil" style={{ textDecoration: 'none' }} title="Meu perfil e senha">
              <strong>{perfil?.nome || perfil?.email}</strong>
            </NavLink>
            {perfil && NOME_PAPEL[perfil.papel]}
          </div>
          <button onClick={sair}>Sair</button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
