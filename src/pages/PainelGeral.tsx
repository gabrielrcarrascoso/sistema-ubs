import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { buscarUnidades, ok, useConsulta } from '../lib/hooks';
import type { Equipe, Pendencia } from '../lib/types';
import { Cabecalho, Carregando, Cartao, Erro, Painel } from '../components/ui';

export function PainelGeral() {
  const navegar = useNavigate();
  const { dados, carregando, erro } = useConsulta(async () => {
    const [unidades, equipes, pendencias, lancamentos] = await Promise.all([
      buscarUnidades(),
      supabase.from('equipes').select('unidade_id, quantidade').then(ok<Pick<Equipe, 'unidade_id' | 'quantidade'>[]>),
      supabase.from('pendencias').select('*').eq('concluida', false).then(ok<Pendencia[]>),
      supabase.from('lancamentos').select('id', { count: 'exact', head: true }),
    ]);
    return { unidades, equipes, pendencias, totalLancamentos: lancamentos.count ?? 0 };
  }, []);

  if (carregando) return <Carregando />;
  if (erro || !dados) return <Erro mensagem={erro} />;

  const { unidades, equipes, pendencias, totalLancamentos } = dados;
  const declarados = unidades.reduce((s, u) => s + (u.profissionais_declarados ?? 0), 0);
  const quantificados = equipes.reduce((s, e) => s + (e.quantidade ?? 0), 0);
  const unidadesSemQuantidade = new Set(equipes.filter(e => e.quantidade === null).map(e => e.unidade_id));
  const maiorEquipe = Math.max(1, ...unidades.map(u => u.profissionais_declarados ?? 0));
  const altas = pendencias.filter(p => p.prioridade === 'Alta');

  const abrirUnidade = (id: string) => {
    try {
      localStorage.setItem('sistema-ubs:unidade', id);
    } catch {
      /* sem armazenamento */
    }
    navegar('/unidades');
  };

  return (
    <>
      <Cabecalho titulo="Painel geral" subtitulo="Visão consolidada das unidades e turnos acompanhados." />

      <div className="cards">
        <Cartao titulo="Unidades / turnos" valor={String(unidades.length).padStart(2, '0')} nota="Cadastrados e ativos" />
        <Cartao titulo="Profissionais declarados" valor={declarados} nota="Soma por unidade; pode haver compartilhamento" />
        <Cartao titulo="Quantificados por categoria" valor={quantificados} nota={`${unidadesSemQuantidade.size} unidade(s) com cargos sem quantidade`} />
        <Cartao titulo="Pendências abertas" valor={pendencias.length} nota={`${altas.length} de prioridade alta`} />
      </div>

      <Painel titulo="Unidades monitoradas">
        <div className="three">
          {unidades.map(u => {
            const incompleta = unidadesSemQuantidade.has(u.id);
            return (
              <button key={u.id} className="unit-card" onClick={() => abrirUnidade(u.id)}>
                <div className="row-flex">
                  <h3>{u.nome}</h3>
                  <span className={`chip ${incompleta ? 'warn' : ''}`}>{incompleta ? 'A detalhar' : 'Parcial'}</span>
                </div>
                <strong>{u.profissionais_declarados ?? '—'}</strong>
                <span className="muted"> profissionais declarados</span>
                <p>
                  {u.horario}
                  <br />
                  {u.observacao}
                </p>
              </button>
            );
          })}
        </div>
      </Painel>

      <div className="two">
        <Painel titulo="Efetivo informado por unidade">
          <div className="bars">
            {unidades.map(u => (
              <div key={u.id}>
                <div className="bar-label">
                  <b>{u.nome}</b>
                  <span>{u.profissionais_declarados ?? 0} declarados</span>
                </div>
                <div className="track">
                  <div className="fill" style={{ width: `${((u.profissionais_declarados ?? 0) / maiorEquipe) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 15 }}>
            A soma representa registros por unidade/turno, não necessariamente pessoas distintas.
          </p>
        </Painel>

        <Painel titulo="Pontos prioritários" acoes={<Link to="/restricoes" className="btn small">Ver todas</Link>}>
          {altas.length === 0 && <p className="empty">Nenhuma pendência de prioridade alta em aberto.</p>}
          {altas.slice(0, 6).map(p => (
            <div className="item" key={p.id}>
              <span className="chip warn">{p.escopo || 'Geral'}</span> <b>{p.texto}</b>
              {p.motivo && <p>{p.motivo}</p>}
            </div>
          ))}
        </Painel>
      </div>

      <Painel titulo="Indicadores APS" acoes={<Link to="/indicadores" className="btn small primary">Abrir painel</Link>}>
        {totalLancamentos === 0 ? (
          <div className="callout">
            Nenhum lançamento de indicador ainda. Comece pelo <Link to="/dicionario">dicionário de dados</Link> e depois
            registre os valores mensais em <Link to="/lancamentos">Lançamentos</Link>.
          </div>
        ) : (
          <p>{totalLancamentos} lançamento(s) mensais registrados. Veja a evolução no painel de indicadores.</p>
        )}
      </Painel>
    </>
  );
}
