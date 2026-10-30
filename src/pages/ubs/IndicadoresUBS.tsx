import { Link } from 'react-router-dom';
import { CalendarPlus } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import type { Indicador, Lancamento } from '../../lib/types';
import { atingiuMeta, mesAno, valorIndicador } from '../../lib/util';
import { SeloSituacao } from '../../components/graficos';

/**
 * Indicadores da UBS no painel: os 8 aparecem sempre, mesmo sem número,
 * dizendo o que falta lançar para cada um (variável A e, quando houver, variável B).
 */
export function IndicadoresUBS({ unidadeId, indicadores, lancamentos }: { unidadeId: string; indicadores: Indicador[]; lancamentos: Lancamento[] }) {
  const { podeEditar } = useAuth();
  const ultimoDe = (id: string) =>
    lancamentos.filter(l => l.indicador_id === id).sort((a, b) => b.competencia.localeCompare(a.competencia))[0];
  const comDado = indicadores.filter(i => ultimoDe(i.id)).length;
  const comMeta = indicadores.filter(i => {
    const l = ultimoDe(i.id);
    return l && atingiuMeta(l.valor, i.meta, i.sentido_meta) !== null;
  });
  const atingidas = comMeta.filter(i => atingiuMeta(ultimoDe(i.id)!.valor, i.meta, i.sentido_meta)).length;

  return (
    <section className="cartao-grafico largo">
      <header>
        <div>
          <h2>Indicadores da UBS</h2>
          <p>
            {comDado === 0
              ? 'Nenhum número lançado ainda. Os indicadores dependem da validação das variáveis (planilha de indicadores).'
              : `${comDado} de ${indicadores.length} com números${comMeta.length ? ` · ${atingidas} de ${comMeta.length} atingiram a meta` : ''}`}
          </p>
        </div>
        <div className="cartao-grafico-acoes">
          <Link to="/indicadores?aba=definicoes" className="btn small">Como calcula</Link>
          {podeEditar(unidadeId) && (
            <Link to="/indicadores?aba=lancar&novo=1" className="btn small primary">
              <CalendarPlus size={14} strokeWidth={1.9} /> Lançar o mês
            </Link>
          )}
        </div>
      </header>

      <div className="indicadores-ubs">
        {indicadores.map(i => {
          const l = ultimoDe(i.id);
          const ok = l ? atingiuMeta(l.valor, i.meta, i.sentido_meta) : null;
          const pct = i.unidade_medida === '%';
          const max = pct ? Math.max(100, l?.valor ?? 0, i.meta ?? 0) : Math.max(l?.valor ?? 0, i.meta ?? 0, 1) * 1.15;
          return (
            <article key={i.id} className={`ind-cartao ${l ? '' : 'vazio'}`}>
              <div className="ind-topo">
                <span className="ind-codigo">{i.codigo}</span>
                <b className="ind-nome">{i.nome}</b>
              </div>
              <div className="ind-valor">{l ? valorIndicador(l.valor, i.unidade_medida) : '—'}</div>
              {l && i.tipo !== 'variacao' && (
                <div className="barra-trilho ind-barra">
                  <span
                    className="barra-preenchida"
                    style={{ width: `${Math.max(0, Math.min(100, ((l.valor ?? 0) / max) * 100))}%`, background: ok === false ? 'var(--serie2)' : 'var(--serie1)' }}
                  />
                  {i.meta !== null && <span className="barra-referencia" style={{ left: `${(i.meta / max) * 100}%` }} title={`Meta: ${valorIndicador(i.meta, i.unidade_medida)}`} />}
                </div>
              )}
              <div className="ind-meta">
                {i.meta !== null ? `Meta ${i.sentido_meta === 'maior' ? '≥' : '≤'} ${valorIndicador(i.meta, i.unidade_medida)}` : 'Sem meta aprovada'}
                {l && <> · {mesAno(l.competencia)}</>}
              </div>
              <div className="ind-rodape">
                {l ? (
                  <>
                    <SeloSituacao situacao={ok === null ? 'sem_meta' : ok ? 'atingiu' : 'abaixo'} />
                    {!l.validado && <span className="chip neutral">a validar</span>}
                  </>
                ) : (
                  <span className="ind-precisa">
                    Precisa de: <b>{i.numerador_desc}</b>
                    {i.denominador_desc && <> e <b>{i.denominador_desc}</b></>}
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
