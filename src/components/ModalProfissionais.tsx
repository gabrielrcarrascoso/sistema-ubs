import { ChevronRight, EyeOff } from 'lucide-react';
import type { Equipe } from '../lib/types';
import { nomeEquipe, periodoTexto, type ProducaoProfissional } from '../lib/producao';
import { numeroBR } from '../lib/util';
import { Modal } from './ui';

/** Lista de funcionários de uma ou mais UBS: cargos com quantidades + quem tem atendimento registrado no e-SUS */
export function ModalProfissionais({
  unidades,
  equipes,
  profissionais,
  aoFechar,
  aoAbrirEquipe,
}: {
  unidades: { id: string; nome: string }[];
  equipes: Pick<Equipe, 'unidade_id' | 'cargo' | 'quantidade'>[];
  profissionais: ProducaoProfissional[];
  aoFechar: () => void;
  aoAbrirEquipe?: (unidadeId: string) => void;
}) {
  const nomesVisiveis = profissionais.some(p => p.nome_visivel);
  const periodo = profissionais[0] ? periodoTexto(profissionais[0].inicio, profissionais[0].fim) : '';
  return (
    <Modal titulo={unidades.length === 1 ? `Profissionais · ${unidades[0].nome}` : 'Profissionais das UBS'} aoFechar={aoFechar}>
      {!nomesVisiveis && profissionais.length > 0 && (
        <div className="callout" style={{ marginBottom: 14 }}>
          <EyeOff size={13} strokeWidth={2} style={{ verticalAlign: '-2px' }} /> Os nomes aparecem só para o administrador geral.
        </div>
      )}
      {unidades.map(u => {
        const cargos = equipes.filter(e => e.unidade_id === u.id);
        const pessoas = profissionais.filter(p => p.unidade_id === u.id);
        const variasEquipes = new Set(pessoas.map(p => p.equipe)).size > 1;
        const total = cargos.reduce((s, e) => s + (e.quantidade ?? 0), 0);
        return (
          <section key={u.id} className="lista-prof">
            <header className="lista-prof-topo">
              <h3>{u.nome}</h3>
              <span className="muted">{total} profissionais por cargo</span>
              {aoAbrirEquipe && (
                <button className="btn small ver-tudo" onClick={() => aoAbrirEquipe(u.id)}>
                  Equipe e atividades <ChevronRight size={14} strokeWidth={2} />
                </button>
              )}
            </header>
            <div className="lista-prof-cargos">
              {cargos.map(e => (
                <span key={e.cargo} className={`chip ${e.quantidade === null ? 'warn' : 'neutral'}`}>
                  {e.cargo}: <b>{e.quantidade ?? 'não informado'}</b>
                </span>
              ))}
              {!cargos.length && <span className="muted">Nenhum cargo cadastrado.</span>}
            </div>
            {pessoas.length > 0 && (
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Profissional</th>
                      <th>Categoria</th>
                      {variasEquipes && <th>Equipe</th>}
                      <th className="num">Registros ({periodo})</th>
                      <th>Horas/semana</th>
                      <th>Validação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pessoas.map(p => (
                      <tr key={p.id}>
                        <td><b>{p.nome}</b></td>
                        <td>{p.categoria}</td>
                        {variasEquipes && <td>{nomeEquipe(p.equipe)}</td>}
                        <td className="num">{numeroBR(p.quantidade, 0)}</td>
                        <td className="muted">{p.horas_semana ?? '—'}</td>
                        <td className="muted">{p.status_validacao ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
      <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
        A tabela traz médicos, enfermeiros e dentistas com atendimento registrado no e-SUS. Contagem de registros não mede produtividade.
      </p>
      <div className="actions">
        <button className="btn" onClick={aoFechar}>Fechar</button>
      </div>
    </Modal>
  );
}
