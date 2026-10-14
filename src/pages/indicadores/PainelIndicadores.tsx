import { useState } from 'react';
import { Link } from 'react-router-dom';
import { buscarUnidades, useConsulta } from '../../lib/hooks';
import { agregar, buscarIndicadores, buscarLancamentos, descreverFormula } from '../../lib/indicadores';
import type { Lancamento } from '../../lib/types';
import { atingiuMeta, mesAno, ultimosMeses, valorIndicador } from '../../lib/util';
import { GraficoBarras } from '../../components/GraficoBarras';
import { BarraAba, Dica, Carregando, Cartao, Erro, Painel } from '../../components/ui';

export function PainelIndicadores() {
  const [unidadeId, setUnidadeId] = useState('');
  const [indicadorId, setIndicadorId] = useState('');
  const [qtdMeses, setQtdMeses] = useState(6);

  const { dados, carregando, erro } = useConsulta(async () => {
    const [indicadores, unidades, lancamentos] = await Promise.all([
      buscarIndicadores(true),
      buscarUnidades(),
      buscarLancamentos({ desde: ultimosMeses(24)[0] }),
    ]);
    return { indicadores, unidades, lancamentos };
  }, []);

  if (carregando) return <Carregando />;
  if (erro || !dados) return <Erro mensagem={erro} />;

  const { indicadores, unidades, lancamentos } = dados;
  const filtrados = lancamentos.filter(l => !unidadeId || l.unidade_id === unidadeId);
  const meses = ultimosMeses(qtdMeses);

  // Valor de um indicador num mês (somando as unidades do filtro)
  const valorNoMes = (indId: string, mes: string) =>
    agregar(filtrados.filter(l => l.indicador_id === indId && l.competencia.startsWith(mes.slice(0, 7))));

  // Último mês que tem algum dado
  const ultimoMesComDado = filtrados.length ? filtrados.map(l => l.competencia.slice(0, 10)).sort().at(-1)! : null;

  const producao = indicadores.find(i => i.codigo === 'PROD-01');
  const qualidade = indicadores.find(i => i.codigo === 'QUAL-01');
  const indSelecionado = indicadores.find(i => i.id === indicadorId) ?? producao ?? indicadores[0];

  const resumo = indicadores.map(i => {
    const valor = ultimoMesComDado ? valorNoMes(i.id, ultimoMesComDado) : null;
    return { indicador: i, valor, ok: atingiuMeta(valor, i.meta, i.sentido_meta) };
  });
  const comMeta = resumo.filter(r => r.ok !== null);
  const atingidas = comMeta.filter(r => r.ok).length;

  // Tabela indicador × unidade no último mês
  const porUnidade = (indId: string, uniId: string): Lancamento | undefined =>
    lancamentos.find(l => l.indicador_id === indId && l.unidade_id === uniId && ultimoMesComDado && l.competencia.startsWith(ultimoMesComDado.slice(0, 7)));

  return (
    <>
      <Dica id="ind-painel">
        Resumo dos indicadores. Escolha <b>uma UBS</b> ou veja <b>todas juntas</b>. Valores em <b>verde</b> atingiram a meta; em <b>vermelho</b>, não atingiram.
      </Dica>
      <BarraAba texto="Dados padronizados, fórmulas únicas e rastreabilidade — APS Data & Performance."
        acoes={<Link to="/indicadores?aba=lancar" className="btn primary">+ Lançar dados</Link>}
      />

      <Painel titulo="Visão">
        <div className="selectrow">
          <select value={unidadeId} onChange={e => setUnidadeId(e.target.value)} aria-label="Unidade">
            <option value="">Todas as unidades (consolidado)</option>
            {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
          <select value={qtdMeses} onChange={e => setQtdMeses(Number(e.target.value))} aria-label="Período">
            <option value={6}>Últimos 6 meses</option>
            <option value={12}>Últimos 12 meses</option>
          </select>
          {ultimoMesComDado && <span className="chip neutral">Último mês com dados: {mesAno(ultimoMesComDado)}</span>}
        </div>
      </Painel>

      {lancamentos.length === 0 && (
        <div className="alert" style={{ marginBottom: 20 }}>
          Ainda não há lançamentos. Registre os números mensais em <Link to="/indicadores?aba=lancar">Lançamentos</Link> (um a um ou
          importando uma planilha) para o painel ganhar vida.
        </div>
      )}

      <div className="cards">
        <Cartao
          titulo={producao?.nome ?? 'Atendimentos no mês'}
          valor={producao && ultimoMesComDado ? valorIndicador(valorNoMes(producao.id, ultimoMesComDado), '') : '—'}
          nota={ultimoMesComDado ? mesAno(ultimoMesComDado) : 'sem dados'}
        />
        <Cartao
          titulo={qualidade?.nome ?? 'Registros completos'}
          valor={qualidade && ultimoMesComDado ? valorIndicador(valorNoMes(qualidade.id, ultimoMesComDado), '%') : '—'}
          nota={qualidade?.meta ? `Meta ≥ ${qualidade.meta}%` : 'Qualidade do registro'}
        />
        <Cartao titulo="Indicadores monitorados" valor={indicadores.length} nota="Ativos no dicionário" />
        <Cartao
          titulo="Metas atingidas"
          valor={comMeta.length ? `${atingidas}/${comMeta.length}` : '—'}
          nota="No último mês com dados"
        />
      </div>

      {indSelecionado && (
        <Painel
          titulo="Evolução por período"
          acoes={
            <select value={indSelecionado.id} onChange={e => setIndicadorId(e.target.value)} aria-label="Indicador do gráfico">
              {indicadores.map(i => <option key={i.id} value={i.id}>{i.codigo} · {i.nome}</option>)}
            </select>
          }
        >
          <GraficoBarras
            pontos={meses.map(m => ({ rotulo: mesAno(m), valor: valorNoMes(indSelecionado.id, m) }))}
            meta={indSelecionado.meta}
            sufixo={indSelecionado.unidade_medida === '%' ? '%' : ''}
          />
          <p className="muted" style={{ marginTop: 10 }}>
            <b>Fórmula (v{indSelecionado.versao}):</b> {descreverFormula(indSelecionado)} · <b>Fonte:</b> {indSelecionado.fonte_dados}
            {!unidadeId && indSelecionado.tipo !== 'contagem' && ' · Consolidado = soma dos numeradores ÷ soma dos denominadores.'}
          </p>
        </Painel>
      )}

      <div className="two">
        <Painel titulo="Situação dos indicadores">
          {resumo.map(({ indicador: i, valor, ok }) => (
            <div className="item row-flex" key={i.id}>
              <div>
                <b>{i.codigo}</b> {i.nome}
                <p>{i.meta !== null ? `Meta ${i.sentido_meta === 'maior' ? '≥' : '≤'} ${valorIndicador(i.meta, i.unidade_medida)}` : 'Sem meta definida'}</p>
              </div>
              <span className={`chip ${ok === null ? 'neutral' : ok ? '' : 'bad'}`}>{valorIndicador(valor, i.unidade_medida)}</span>
            </div>
          ))}
        </Painel>

        <Painel titulo={`Por unidade${ultimoMesComDado ? ` · ${mesAno(ultimoMesComDado)}` : ''}`}>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Indicador</th>
                  {unidades.map(u => <th key={u.id} className="num">{u.nome}</th>)}
                </tr>
              </thead>
              <tbody>
                {indicadores.map(i => (
                  <tr key={i.id}>
                    <td><b>{i.codigo}</b></td>
                    {unidades.map(u => {
                      const l = porUnidade(i.id, u.id);
                      const ok = l ? atingiuMeta(l.valor, i.meta, i.sentido_meta) : null;
                      return (
                        <td key={u.id} className="num">
                          {l ? <span className={`chip ${ok === null ? 'neutral' : ok ? '' : 'bad'}`}>{valorIndicador(l.valor, i.unidade_medida)}</span> : <span className="none">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Painel>
      </div>

      <div className="info">
        Privacidade por concepção: o sistema trabalha somente com dados agregados por unidade e mês, sem identificar
        pacientes, conforme a LGPD.
      </div>
    </>
  );
}
