import { useState } from 'react';
import { Download, FileText, Flag, MapPin, Plus, Printer, Users } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { buscarUnidades, useConsulta, useUnidadeEscolhida } from '../../lib/hooks';
import type { Unidade } from '../../lib/types';
import { baixarCSV } from '../../lib/util';
import { BarraDeAbas, Cabecalho, Carregando, Erro, useAba, type DefAba } from '../../components/ui';
import { mostrarValor, vazio } from '../../components/CampoDinamico';
import { buscarCamposFicha } from '../config/CamposFicha';
import { AbaFicha } from './AbaFicha';
import { AbaEquipe } from './AbaEquipe';
import { AbaRestricoes } from './AbaRestricoes';
import { AbaColetas } from './AbaColetas';
import { ModalFicha } from './ModalFicha';

const ABAS: DefAba[] = [
  { id: 'ficha', rotulo: 'Ficha', icone: FileText },
  { id: 'equipe', rotulo: 'Equipe e atividades', icone: Users },
  { id: 'restricoes', rotulo: 'Restrições e pendências', icone: Flag },
  { id: 'coletas', rotulo: 'Visitas de campo', icone: MapPin },
];

/** Tudo sobre uma UBS em um só lugar */
export function PaginaUBS() {
  const { perfil, podeEditar, ehGestor } = useAuth();
  const unidadesQ = useConsulta(buscarUnidades, []);
  const camposQ = useConsulta(() => buscarCamposFicha(true), []);
  const [unidadeId, setUnidadeId] = useUnidadeEscolhida(unidadesQ.dados, perfil?.unidade_id);
  const [aba, setAba] = useAba(ABAS, 'ficha');
  const [modal, setModal] = useState<Partial<Unidade> | null>(null);

  if (unidadesQ.carregando || camposQ.carregando) return <Carregando />;
  const unidades = unidadesQ.dados ?? [];
  const campos = camposQ.dados ?? [];
  const u = unidades.find(x => x.id === unidadeId);
  const editavel = podeEditar(unidadeId);

  function exportarFichas() {
    baixarCSV(
      [
        ['UBS', 'Horário', 'Profissionais declarados', 'Atendimentos (estimativa)', 'Maior movimento', 'Observação', ...campos.map(c => c.nome)],
        ...unidades.map(x => [
          x.nome, x.horario, x.profissionais_declarados, x.volume_estimado, x.pico, x.observacao,
          ...campos.map(c => (vazio(x.dados_ficha?.[c.id]) ? '' : mostrarValor(c.tipo, x.dados_ficha[c.id]))),
        ]),
      ],
      'fichas_ubs.csv',
    );
  }

  return (
    <>
      <Cabecalho
        titulo={u?.nome ?? 'UBS'}
        subtitulo={editavel ? 'Tudo sobre esta UBS em um só lugar. Você pode editar.' : 'Tudo sobre esta UBS em um só lugar (somente consulta).'}
        acoes={
          <>
            <select
              className="seletor-grande"
              value={unidadeId}
              onChange={e => setUnidadeId(e.target.value)}
              aria-label="Escolher UBS"
            >
              {unidades.map(x => <option key={x.id} value={x.id}>{x.nome}{x.id === perfil?.unidade_id ? ' (minha UBS)' : ''}</option>)}
            </select>
            <button className="btn" onClick={() => window.print()} title="Imprimir ou salvar em PDF"><Printer size={16} strokeWidth={1.8} /> Imprimir</button>
            <button className="btn" onClick={exportarFichas} title="Planilha com a ficha de todas as UBS"><Download size={16} strokeWidth={1.8} /> Fichas (Excel)</button>
            {ehGestor && <button className="btn primary" onClick={() => setModal({ nome: '', dados_ficha: {} })}><Plus size={16} strokeWidth={1.8} /> Nova UBS</button>}
          </>
        }
      />
      <Erro mensagem={unidadesQ.erro || camposQ.erro} />

      {unidades.length === 0 && (
        <div className="callout">{ehGestor ? 'Nenhuma UBS cadastrada. Clique em “+ Nova UBS”.' : 'Nenhuma UBS cadastrada ainda.'}</div>
      )}

      {u && (
        <>
          <BarraDeAbas abas={ABAS} atual={aba} aoMudar={setAba} />
          {/* key={u.id}: ao trocar de UBS, a aba recomeça do zero */}
          {aba === 'ficha' && <AbaFicha key={u.id} unidade={u} campos={campos} editavel={editavel} aoEditar={() => setModal(u)} />}
          {aba === 'equipe' && <AbaEquipe key={u.id} unidade={u} editavel={editavel} />}
          {aba === 'restricoes' && <AbaRestricoes key={u.id} unidade={u} unidades={unidades} />}
          {aba === 'coletas' && <AbaColetas key={u.id} unidade={u} />}
        </>
      )}

      {modal && (
        <ModalFicha
          inicial={modal}
          campos={campos}
          podeDesativar={ehGestor}
          aoFechar={() => setModal(null)}
          aoSalvar={id => {
            setModal(null);
            if (id) setUnidadeId(id);
            unidadesQ.recarregar();
          }}
        />
      )}
    </>
  );
}
