import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, CalendarPlus, CheckCheck, ClipboardList, Target } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { buscarUnidades, useConsulta } from '../../lib/hooks';
import { agregar, buscarIndicadores, buscarLancamentos, descreverFormula } from '../../lib/indicadores';
import { serieMensal } from '../../lib/paineis';
import type { Indicador, Lancamento, Unidade } from '../../lib/types';
import { atingiuMeta, mesAno, ultimosMeses, valorIndicador } from '../../lib/util';
import { BarrasH, CartaoGrafico, GraficoVazio, Linhas, Numero, SeloSituacao, SERIES } from '../../components/graficos';
import { Carregando, Erro, Modal } from '../../components/ui';

/**
 * Visão geral dos indicadores: responde só "como estão as metas" e "o que falta lançar".
 * O resto (evolução, comparação entre UBS, como calcula) fica na janela de cada indicador.
 */
export function PainelIndicadores() {
  const { podeEditar } = useAuth();
  const navegar = useNavigate();
  const [mesEscolhido, setMesEscolhido] = useState<string | null>(null);
  const [unidadeId, setUnidadeId] = useState('');
  const [detalhe, setDetalhe] = useState<Indicador | null>(null);

  const { dados, carregando, erro } = useConsulta(async () => {
    const [indicadores, unidades, lancamentos] = await Promise.all([
      buscarIndicadores(true),
      buscarUnidades(),
      buscarLancamentos({ desde: ultimosMeses(24)[0] }),
    ]);
    return { indicadores, unidades, lancamentos };
  }, [], 'painel-indicadores');

  if (carregando) return <Carregando />;
  if (erro || !dados) return <Erro mensagem={erro} />;
  const { indicadores, unidades, lancamentos } = dados;

  // mês de referência: o último com números (ou o mês passado, quando ainda não há nenhum)
  const meses = ultimosMeses(13).slice(0, -1).reverse(); // os 12 meses fechados, do mais recente
  const ultimoComDado = lancamentos.length ? lancamentos.map(l => l.competencia.slice(0, 7)).sort().at(-1)! + '-01' : null;
  const mes = mesEscolhido ?? ultimoComDado ?? meses[0];
  const doMes = (l: Lancamento) => l.competencia.startsWith(mes.slice(0, 7));
  const lancsMes = lancamentos.filter(doMes);
  const mensais = indicadores.filter(i => i.periodicidade === 'Mensal');
  const filtrados = (ls: Lancamento[]) => ls.filter(l => !unidadeId || l.unidade_id === unidadeId);

  const valorNoMes = (i: Indicador) => agregar(filtrados(lancsMes).filter(l => l.indicador_id === i.id));
  const resumo = indicadores.map(i => {
    const valor = valorNoMes(i);
    return { i, valor, ok: atingiuMeta(valor, i.meta, i.sentido_meta) };
  });
  const comMeta = resumo.filter(r => r.ok !== null);
  const atingidas = comMeta.filter(r => r.ok).length;

  // andamento do mês por UBS
  const andamento = unidades.map(u => {
    const daUbs = lancsMes.filter(l => l.unidade_id === u.id);
    const lancados = mensais.filter(i => daUbs.some(l => l.indicador_id === i.id)).length;
    return { u, lancados };
  });
  const esperados = mensais.length * unidades.length;
  const lancadosTotal = andamento.reduce((s, a) => s + a.lancados, 0);
  const aValidar = lancsMes.filter(l => !l.validado).length;

  const lancar = (u?: Unidade) => navegar(`/indicadores?aba=lancar&novo=1&mes=${mes.slice(0, 7)}${u ? `&unidade=${u.id}` : ''}`);
  const algumaEditavel = unidades.some(u => podeEditar(u.id));
  const rolarAte = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const temNumeros = lancsMes.length > 0;
  const nomeUbs = unidadeId ? unidades.find(u => u.id === unidadeId)?.nome : null;

  return (
    <>
      <div className="barra-filtros">
        <label className="seletor-mes">
          <span>Mês</span>
          <select value={mes} onChange={e => setMesEscolhido(e.target.value)} aria-label="Mês de referência">
            {meses.map(m => <option key={m} value={m}>{mesAno(m)}</option>)}
          </select>
        </label>
        <select value={unidadeId} onChange={e => setUnidadeId(e.target.value)} aria-label="UBS">
          <option value="">Todas as UBS</option>
          {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </select>
        {algumaEditavel && (
          <button className="btn primary" style={{ marginLeft: 'auto' }} onClick={() => lancar()}>
            <CalendarPlus size={16} strokeWidth={1.8} /> Lançar {mesAno(mes)}
          </button>
        )}
      </div>

      {temNumeros ? (
        <div className="numeros">
          <Numero
            destaque
            icone={<Target size={15} strokeWidth={2} />}
            rotulo="Metas atingidas"
            valor={comMeta.length ? `${atingidas} de ${comMeta.length}` : '—'}
            detalhe={nomeUbs ?? 'todas as UBS'}
          />
          <Numero
            icone={<ClipboardList size={15} strokeWidth={2} />}
            rotulo="Números lançados"
            valor={`${lancadosTotal} de ${esperados}`}
            detalhe={<span className="mini-trilho"><span style={{ width: `${esperados ? (lancadosTotal / esperados) * 100 : 0}%` }} /></span>}
            aoClicar={() => rolarAte('ind-andamento')}
            dica="Ver por UBS"
          />
          <Numero
            icone={<CheckCheck size={15} strokeWidth={2} />}
            rotulo="A validar"
            valor={aValidar}
            detalhe={aValidar ? 'esperando conferência' : 'tudo conferido'}
            aoClicar={aValidar ? () => navegar('/indicadores?aba=lancar&validacao=a_validar') : undefined}
            dica="Conferir"
          />
        </div>
      ) : (
        <div className="faixa-vazia">
          <ClipboardList size={20} strokeWidth={1.8} />
          <span><b>Nenhum número de {mesAno(mes)} ainda.</b> Cada UBS lança os números do mês tirados do e-SUS/PEC.</span>
        </div>
      )}

      <h2 className="titulo-secao">Indicadores de {mesAno(mes)}</h2>
      <div className="indicadores-ubs">
        {resumo.map(({ i, valor, ok }) => {
          const pct = i.unidade_medida === '%';
          const max = pct ? Math.max(100, valor ?? 0, i.meta ?? 0) : Math.max(valor ?? 0, i.meta ?? 0, 1) * 1.15;
          const meta = i.meta !== null ? `meta ${i.sentido_meta === 'maior' ? '≥' : '≤'} ${valorIndicador(i.meta, i.unidade_medida)}` : 'sem meta';
          return (
            <button key={i.id} type="button" className={`ind-cartao ${valor === null ? 'vazio' : ''}`} onClick={() => setDetalhe(i)} title="Ver evolução, comparação entre UBS e como é calculado">
              <span className="ind-topo">
                <span className="ind-codigo">{i.codigo}</span>
                <b className="ind-nome">{i.nome}</b>
              </span>
              <span className="ind-valor">{valor === null ? '—' : valorIndicador(valor, i.unidade_medida)}</span>
              {valor !== null && i.tipo !== 'variacao' && (
                <span className="barra-trilho ind-barra">
                  <span className="barra-preenchida" style={{ width: `${Math.max(0, Math.min(100, (valor / max) * 100))}%`, background: ok === false ? 'var(--serie2)' : 'var(--serie1)' }} />
                  {i.meta !== null && <span className="barra-referencia" style={{ left: `${(i.meta / max) * 100}%` }} />}
                </span>
              )}
              <span className="ind-rodape">
                {valor !== null && ok !== null && <SeloSituacao situacao={ok ? 'atingiu' : 'abaixo'} />}
                <span className="ind-meta">{meta}</span>
              </span>
            </button>
          );
        })}
      </div>

      <h2 className="titulo-secao" id="ind-andamento">Quem já lançou {mesAno(mes)}</h2>
      <div className="panel andamento">
        {andamento.map(a => {
          const completo = a.lancados >= mensais.length;
          return (
            <div key={a.u.id} className="andamento-linha">
              <b className="andamento-nome">{a.u.nome}</b>
              <span className="mini-trilho"><span style={{ width: `${mensais.length ? (a.lancados / mensais.length) * 100 : 0}%` }} /></span>
              <span className={`andamento-conta ${completo ? 'completo' : ''}`}>{completo ? 'Completo' : `${a.lancados} de ${mensais.length}`}</span>
              {podeEditar(a.u.id) ? (
                <button className={`btn small ${completo ? '' : 'primary'}`} onClick={() => lancar(a.u)}>{completo ? 'Revisar' : 'Lançar'}</button>
              ) : <span />}
            </div>
          );
        })}
      </div>

      {detalhe && (
        <DetalheIndicador
          indicador={detalhe}
          unidades={unidades}
          lancamentos={lancamentos}
          mes={mes}
          aoFechar={() => setDetalhe(null)}
          aoLancar={algumaEditavel ? () => lancar() : undefined}
        />
      )}
    </>
  );
}

/** Janela de um indicador: evolução em 12 meses (por UBS), comparação no mês e como é calculado */
function DetalheIndicador({
  indicador: i,
  unidades,
  lancamentos,
  mes,
  aoFechar,
  aoLancar,
}: {
  indicador: Indicador;
  unidades: Unidade[];
  lancamentos: Lancamento[];
  mes: string;
  aoFechar: () => void;
  aoLancar?: () => void;
}) {
  const sufixo = i.unidade_medida === '%' ? '%' : '';
  const series = unidades.slice(0, 5).map((u, k) => ({ nome: u.nome, cor: SERIES[k], ...serieMensal(lancamentos.filter(l => l.unidade_id === u.id), i.id) }));
  const temSerie = series.some(s => s.pontos.some(p => p !== null));
  const noMes = unidades
    .map(u => ({ u, l: lancamentos.find(l => l.indicador_id === i.id && l.unidade_id === u.id && l.competencia.startsWith(mes.slice(0, 7))) }))
    .filter(x => x.l && x.l.valor !== null);
  return (
    <Modal titulo={`${i.codigo} · ${i.nome}`} aoFechar={aoFechar}>
      <p style={{ marginBottom: 14 }}>{i.definicao}</p>
      <div className="painel-grade detalhe-ind">
        <CartaoGrafico
          titulo="Evolução"
          subtitulo={`Últimos 12 meses, por UBS${i.meta !== null ? ' · linha tracejada = meta' : ''}`}
          className="largo"
          tabela={temSerie ? { cabecalho: ['Mês', ...series.map(s => s.nome)], linhas: series[0].rotulos.map((r, k) => [r, ...series.map(s => s.pontos[k] ?? '—')]) } : undefined}
        >
          {temSerie ? <Linhas rotulosX={series[0].rotulos} series={series} sufixo={sufixo} meta={i.meta} /> : <GraficoVazio>Ainda não há números deste indicador.</GraficoVazio>}
        </CartaoGrafico>
        <CartaoGrafico titulo={`UBS em ${mesAno(mes)}`} subtitulo={i.meta !== null ? 'A linha escura marca a meta' : 'Sem meta aprovada'} className="largo">
          {noMes.length ? (
            <BarrasH
              itens={noMes.map(({ u, l }) => ({ rotulo: u.nome, valor: Number(l!.valor), cor: atingiuMeta(l!.valor, i.meta, i.sentido_meta) === false ? 'var(--serie2)' : 'var(--serie1)' }))}
              sufixo={sufixo}
              referencia={i.meta !== null ? { valor: i.meta, rotulo: `meta ${valorIndicador(i.meta, i.unidade_medida)}` } : undefined}
              maximo={sufixo ? 100 : undefined}
            />
          ) : (
            <GraficoVazio>Nenhuma UBS lançou este indicador em {mesAno(mes)}.</GraficoVazio>
          )}
        </CartaoGrafico>
      </div>
      <div className="ficha-grid" style={{ marginTop: 14 }}>
        <div className="ficha-item"><span>O que lançar</span>{i.numerador_desc}{i.denominador_desc && <> e {i.denominador_desc.charAt(0).toLowerCase() + i.denominador_desc.slice(1)}</>}</div>
        <div className="ficha-item"><span>Como calcula</span>{descreverFormula(i)}</div>
        <div className="ficha-item"><span>Meta</span>{i.meta !== null ? `${i.sentido_meta === 'maior' ? '≥' : '≤'} ${valorIndicador(i.meta, i.unidade_medida)}` : 'Sem meta aprovada'}</div>
        <div className="ficha-item"><span>De onde vem o dado</span>{i.fonte_dados}</div>
        <div className="ficha-item"><span>Situação dos dados</span>{i.situacao_dados}</div>
      </div>
      {i.criterio && <div className="callout" style={{ marginTop: 12 }}><b>Cautela:</b> {i.criterio}</div>}
      <div className="actions">
        <button className="btn" onClick={aoFechar}>Fechar</button>
        {aoLancar && <button className="btn primary" onClick={aoLancar}><BarChart3 size={16} strokeWidth={1.8} /> Lançar números</button>}
      </div>
    </Modal>
  );
}
