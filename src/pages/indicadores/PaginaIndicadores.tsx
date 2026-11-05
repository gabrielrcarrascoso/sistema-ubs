import { useAuth } from '../../auth/AuthProvider';
import { BookOpen, CalendarPlus, LayoutDashboard, ShieldCheck } from 'lucide-react';
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
    // na ordem do trabalho: acompanhar → lançar → conferir → entender (os ids ficam iguais, para os links continuarem valendo)
    { id: 'painel', rotulo: 'Visão geral', icone: LayoutDashboard },
    { id: 'lancar', rotulo: 'Lançar o mês', icone: CalendarPlus, oculta: !podeLancar },
    { id: 'qualidade', rotulo: 'Conferir dados', icone: ShieldCheck },
    { id: 'definicoes', rotulo: 'Como cada um é calculado', icone: BookOpen },
  ];
  const [aba, setAba] = useAba(abas, 'painel');

  return (
    <>
      <Cabecalho titulo="Indicadores" subtitulo="Lance os números de cada mês, confira e acompanhe as metas de cada UBS." />
      <BarraDeAbas abas={abas} atual={aba} aoMudar={setAba} />
      {aba === 'painel' && <PainelIndicadores />}
      {aba === 'lancar' && <Lancamentos />}
      {aba === 'qualidade' && <Qualidade />}
      {aba === 'definicoes' && <Dicionario />}
    </>
  );
}
