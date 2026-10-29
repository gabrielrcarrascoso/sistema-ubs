import { NavLink, Outlet } from 'react-router-dom';
import { BarChart3, ClipboardList, Hospital, House, LogOut, Settings } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { NOME_PAPEL } from '../lib/util';
import { MarcaComNome } from './Marca';
import { BotaoTema } from './BotaoTema';

// Moldura das telas internas: menu lateral (poucas opções, de propósito) + conteúdo
export function Layout() {
  const { perfil, ehGestor, sair } = useAuth();
  const link = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav active' : 'nav');

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <MarcaComNome claro />
        </div>

        <nav className="menu" aria-label="Menu principal">
          <NavLink to="/" end className={link}><House size={16} strokeWidth={1.8} />Início</NavLink>
          <NavLink to="/ubs" className={link}><Hospital size={16} strokeWidth={1.8} />{perfil?.papel === 'coordenador' ? 'Minha UBS' : 'UBS'}</NavLink>
          <NavLink to="/questionarios" className={link}><ClipboardList size={16} strokeWidth={1.8} />Questionários</NavLink>
          <NavLink to="/indicadores" className={link}><BarChart3 size={16} strokeWidth={1.8} />Indicadores</NavLink>
          {ehGestor && <NavLink to="/configuracoes" className={link}><Settings size={16} strokeWidth={1.8} />Configurações</NavLink>}
        </nav>

        <div className="side-user">
          <div>
            <NavLink to="/perfil" style={{ textDecoration: 'none' }} title="Meu perfil e senha">
              <strong>{perfil?.nome || perfil?.email}</strong>
            </NavLink>
            {perfil && NOME_PAPEL[perfil.papel]}
          </div>
          <div className="side-botoes">
            <BotaoTema comRotulo />
            <button onClick={sair}><LogOut size={13} strokeWidth={1.8} /> Sair</button>
          </div>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>

      {/* No celular, o menu vira uma barra fixa embaixo da tela */}
      <nav className="nav-inferior" aria-label="Menu">
        <NavLink to="/" end><House size={20} strokeWidth={1.8} />Início</NavLink>
        <NavLink to="/ubs"><Hospital size={20} strokeWidth={1.8} />{perfil?.papel === 'coordenador' ? 'Minha UBS' : 'UBS'}</NavLink>
        <NavLink to="/questionarios"><ClipboardList size={20} strokeWidth={1.8} />Questionários</NavLink>
        <NavLink to="/indicadores"><BarChart3 size={20} strokeWidth={1.8} />Indicadores</NavLink>
        {ehGestor && <NavLink to="/configuracoes"><Settings size={20} strokeWidth={1.8} />Ajustes</NavLink>}
      </nav>
    </div>
  );
}
