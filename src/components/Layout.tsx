import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { NOME_PAPEL } from '../lib/util';

// Moldura das telas internas: menu lateral + conteúdo
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
          <div className="sub">Designação</div>
          <NavLink to="/" end className={link}>◫ &nbsp;Painel geral</NavLink>
          <NavLink to="/unidades" className={link}>⌂ &nbsp;UBS: ficha e equipe</NavLink>
          <NavLink to="/matriz" className={link}>▦ &nbsp;Matriz de atividades</NavLink>
          <NavLink to="/restricoes" className={link}>⚑ &nbsp;Restrições</NavLink>
          <NavLink to="/coleta" className={link}>✎ &nbsp;Coleta e capacidade</NavLink>

          <div className="sub">Pesquisa de campo</div>
          <NavLink to="/questionarios" className={link}>✍ &nbsp;Questionários</NavLink>

          <div className="sub">Indicadores APS</div>
          <NavLink to="/indicadores" className={link}>◔ &nbsp;Painel de indicadores</NavLink>
          <NavLink to="/lancamentos" className={link}>＋ &nbsp;Lançamentos</NavLink>
          <NavLink to="/dicionario" className={link}>☰ &nbsp;Dicionário de dados</NavLink>
          <NavLink to="/qualidade" className={link}>✓ &nbsp;Controle de qualidade</NavLink>

          {ehGestor && (
            <>
              <div className="sub">Administração</div>
              <NavLink to="/usuarios" className={link}>☺ &nbsp;Usuários</NavLink>
              <NavLink to="/campos-ficha" className={link}>⚙ &nbsp;Campos da ficha</NavLink>
              <NavLink to="/auditoria" className={link}>⟲ &nbsp;Auditoria</NavLink>
            </>
          )}
        </nav>

        <div className="side-user">
          <div>
            <NavLink to="/perfil" style={{ textDecoration: 'none' }}>
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
