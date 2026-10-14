import type { CampoFicha, Unidade } from '../../lib/types';
import { numeroBR } from '../../lib/util';
import { BarraAba, Cartao, Dica, Painel } from '../../components/ui';
import { mostrarValor, vazio } from '../../components/CampoDinamico';
import { agruparPorSecao } from '../config/CamposFicha';

/** % de campos da ficha preenchidos */
export function preenchimentoFicha(u: Unidade, campos: CampoFicha[]): number {
  if (!campos.length) return 100;
  return (campos.filter(c => !vazio(u.dados_ficha?.[c.id])).length / campos.length) * 100;
}

export function AbaFicha({
  unidade: u,
  campos,
  editavel,
  aoEditar,
}: {
  unidade: Unidade;
  campos: CampoFicha[];
  editavel: boolean;
  aoEditar: () => void;
}) {
  const pct = preenchimentoFicha(u, campos);

  return (
    <>
      <Dica id="ubs-ficha">
        Aqui ficam todas as informações da UBS. {editavel ? <>Clique em <b>Editar ficha</b> para atualizar — campos com * são obrigatórios.</> : 'Você pode consultar, mas só o administrador desta UBS ou o administrador geral podem alterar.'}{' '}
        Use <b>Imprimir</b> (no topo) para gerar um PDF.
      </Dica>
      <BarraAba
        texto={<>Ficha <b>{numeroBR(pct, 0)}%</b> preenchida</>}
        acoes={editavel && <button className="btn primary" onClick={aoEditar}>✎ Editar ficha</button>}
      />
      <div className="progresso nao-imprimir" style={{ marginTop: -8, marginBottom: 20 }}>
        <div style={{ width: `${pct}%` }} />
      </div>

      <div className="cards">
        <Cartao titulo="Profissionais (declarado)" valor={u.profissionais_declarados ?? '—'} />
        <Cartao titulo="Horário" valor={<span style={{ fontSize: 17 }}>{u.horario || '—'}</span>} />
        <Cartao titulo="Atendimentos" valor={<span style={{ fontSize: 17 }}>{u.volume_estimado || '—'}</span>} nota="Estimativa" />
        <Cartao titulo="Maior movimento" valor={<span style={{ fontSize: 17 }}>{u.pico || '—'}</span>} />
      </div>

      <Painel titulo="Informações da UBS">
        {campos.length === 0 && <p className="empty">Nenhum campo definido. O administrador geral define os campos em Configurações.</p>}
        {agruparPorSecao(campos).map(([secao, lista]) => (
          <div className="ficha-secao" key={secao}>
            <h3>{secao}</h3>
            <div className="ficha-grid">
              {lista.map(c => (
                <div className="ficha-item" key={c.id}>
                  <span>{c.nome}</span>
                  {vazio(u.dados_ficha?.[c.id]) ? <em className="muted">não informado</em> : mostrarValor(c.tipo, u.dados_ficha[c.id])}
                </div>
              ))}
            </div>
          </div>
        ))}
        {u.observacao && (
          <div className="ficha-secao">
            <h3>Observação</h3>
            <p>{u.observacao}</p>
          </div>
        )}
      </Painel>
    </>
  );
}
