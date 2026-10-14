import { useAuth } from '../../auth/AuthProvider';
import { BarChart3, BookOpen, Plus, ShieldCheck } from 'lucide-react';
import { BarraDeAbas, Cabecalho, useAba, type DefAba } from '../../components/ui';
import { PainelIndicadores } from './PainelIndicadores';
import { Lancamentos } from './Lancamentos';
import { Qualidade } from './Qualidade';
import { Dicionario } from './Dicionario';

/** Indicadores APS: painel, lançamento mensal, qualidade e definições — numa só página */
export function PaginaIndicadores() {
  const { perfil } = useAuth();
  const podeLancar = perfil?.papel !== 'profissional';
  const abas: DefAba[] = [
    { id: 'painel', rotulo: 'Painel', icone: BarChart3 },
    { id: 'lancar', rotulo: 'Lançar dados', icone: Plus, oculta: !podeLancar },
    { id: 'qualidade', rotulo: 'Qualidade dos dados', icone: ShieldCheck },
    { id: 'definicoes', rotulo: 'Definições', icone: BookOpen },
  ];
  const [aba, setAba] = useAba(abas, 'painel');

  return (
    <>
      <Cabecalho titulo="Indicadores" subtitulo="Números mensais das UBS, com fórmulas padronizadas e conferência de qualidade." />
      <BarraDeAbas abas={abas} atual={aba} aoMudar={setAba} />
      {aba === 'painel' && <PainelIndicadores />}
      {aba === 'lancar' && <Lancamentos />}
      {aba === 'qualidade' && <Qualidade />}
      {aba === 'definicoes' && <Dicionario />}
    </>
  );
}
