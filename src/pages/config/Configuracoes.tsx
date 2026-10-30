import { BarraDeAbas, Cabecalho, useAba, type DefAba } from '../../components/ui';
import { Download, FileSpreadsheet, FileText, Grid3x3, History, Users } from 'lucide-react';
import { Usuarios } from './Usuarios';
import { CamposFicha } from './CamposFicha';
import { Atividades } from './Atividades';
import { Auditoria } from './Auditoria';
import { Backup } from './Backup';
import { ImportarPlanilha } from './ImportarPlanilha';

const ABAS: DefAba[] = [
  { id: 'usuarios', rotulo: 'Usuários', icone: Users },
  { id: 'ficha', rotulo: 'Ficha das UBS', icone: FileText },
  { id: 'importar', rotulo: 'Importar planilha', icone: FileSpreadsheet },
  { id: 'atividades', rotulo: 'Atividades', icone: Grid3x3 },
  { id: 'historico', rotulo: 'Histórico', icone: History },
  { id: 'backup', rotulo: 'Backup', icone: Download },
];

/** Área do administrador geral */
export function Configuracoes() {
  const [aba, setAba] = useAba(ABAS, 'usuarios');
  return (
    <>
      <Cabecalho titulo="Configurações" subtitulo="Área do administrador geral." />
      <BarraDeAbas abas={ABAS} atual={aba} aoMudar={setAba} />
      {aba === 'usuarios' && <Usuarios />}
      {aba === 'ficha' && <CamposFicha />}
      {aba === 'importar' && <ImportarPlanilha />}
      {aba === 'atividades' && <Atividades />}
      {aba === 'historico' && <Auditoria />}
      {aba === 'backup' && <Backup />}
    </>
  );
}
