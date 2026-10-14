import { useAuth } from '../../auth/AuthProvider';
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
    { id: 'painel', rotulo: '📊 Painel' },
    { id: 'lancar', rotulo: '＋ Lançar dados', oculta: !podeLancar },
    { id: 'qualidade', rotulo: '✓ Qualidade dos dados' },
    { id: 'definicoes', rotulo: '☰ Definições' },
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
