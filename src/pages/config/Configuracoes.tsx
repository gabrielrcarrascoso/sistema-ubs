import { BarraDeAbas, Cabecalho, useAba, type DefAba } from '../../components/ui';
import { Usuarios } from './Usuarios';
import { CamposFicha } from './CamposFicha';
import { Atividades } from './Atividades';
import { Auditoria } from './Auditoria';
import { Backup } from './Backup';

const ABAS: DefAba[] = [
  { id: 'usuarios', rotulo: '☺ Usuários' },
  { id: 'ficha', rotulo: '📋 Ficha das UBS' },
  { id: 'atividades', rotulo: '▦ Atividades da matriz' },
  { id: 'historico', rotulo: '⟲ Histórico de alterações' },
  { id: 'backup', rotulo: '⬇ Backup' },
];

/** Área do administrador geral */
export function Configuracoes() {
  const [aba, setAba] = useAba(ABAS, 'usuarios');
  return (
    <>
      <Cabecalho titulo="Configurações" subtitulo="Área do administrador geral: quem acessa, o que cada UBS informa e segurança dos dados." />
      <BarraDeAbas abas={ABAS} atual={aba} aoMudar={setAba} />
      {aba === 'usuarios' && <Usuarios />}
      {aba === 'ficha' && <CamposFicha />}
      {aba === 'atividades' && <Atividades />}
      {aba === 'historico' && <Auditoria />}
      {aba === 'backup' && <Backup />}
    </>
  );
}
