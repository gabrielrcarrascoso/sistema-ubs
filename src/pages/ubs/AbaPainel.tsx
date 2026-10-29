import { Link } from 'react-router-dom';
import { CalendarDays, ClipboardCheck, FileText, Flag, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ok, useConsulta } from '../../lib/hooks';
import { buscarIndicadores, buscarLancamentos } from '../../lib/indicadores';
import type { Aplicacao, Atividade, CampoFicha, Coleta, Competencia, Equipe, Pendencia, Questionario, Restricao, Unidade } from '../../lib/types';
import { dataBR, mesAno, numeroBR, ultimosMeses } from '../../lib/util';
import { GRUPOS_CARGO, grupoDoCargo, serieMensal, ultimoMesComDado } from '../../lib/paineis';
import { Carregando, Erro } from '../../components/ui';
import {
  BarraMeta, BarrasEmpilhadasH, BarrasH, CartaoGrafico, CORES, GraficoVazio, Legenda, Linhas, Numero, SeloSituacao,
} from '../../components/graficos';
import { calcularCapacidade } from './AbaColetas';
import { preenchimentoFicha } from './AbaFicha';

const PESO = { Alta: 0, Média: 1, Baixa: 2 } as const;

/** Painel (dashboard) de uma UBS: o retrato da unidade em gráficos */
export function AbaPainel({ unidade: u, campos }: { unidade: Unidade; campos: CampoFicha[] }) {
  const { dados, carregando, erro } = useConsulta(async () => {
    const [equipes, atividades, restricoes, pendencias, coletas, indicadores, lancamentos, questionarios, aplicacoes] = await Promise.all([
      supabase.from('equipes').select('*').eq('unidade_id', u.id).order('ordem').then(ok<Equipe[]>),
      supabase.from('atividades').select('*').order('ordem').then(ok<Atividade[]>),
      supabase.from('restricoes').select('*').eq('unidade_id', u.id).then(ok<Restricao[]>),
      supabase.from('pendencias').select('*').eq('unidade_id', u.id).eq('concluida', false).then(ok<Pendencia[]>),
      supabase.from('coletas').select('*').eq('unidade_id', u.id).order('data_visita', { ascending: false, nullsFirst: false }).then(ok<Coleta[]>),
      buscarIndicadores(true),
      buscarLancamentos({ desde: ultimosMeses(12)[0], unidadeId: u.id }),
      supabase.from('questionarios').select('*').eq('status', 'aberto').then(ok<Questionario[]>),
      supabase.from('aplicacoes').select('id, questionario_id, unidade_id').eq('unidade_id', u.id).then(ok<Pick<Aplicacao, 'id' | 'questionario_id' | 'unidade_id'>[]>),
    ]);
    const competencias = equipes.length
      ? ok<Competencia[]>(await supabase.from('competencias').select('*').in('equipe_id', equipes.map(e => e.id)))
      : [];
    return { equipes, atividades, restricoes, pendencias, coletas, indicadores, lancamentos, questionarios, aplicacoes, competencias };
  }, [u.id], 'painel-ubs');

  if (carregando) return <Carregando />;
  if (!dados) return <Erro mensagem={erro} />;
  const { equipes, atividades, restricoes, pendencias, coletas, indicadores, lancamentos, questionarios, aplicacoes, competencias } = dados;

  // ---- números do topo ----
  const soma = equipes.reduce((s, e) => s + (e.quantidade ?? 0), 0);
  const semQtd = equipes.filter(e => e.quantidade === null);
  const declarados = u.profissionais_declarados;
  const pctFicha = preenchimentoFicha(u, campos);
  const alertasRestricao = restricoes.filter(r => /Divergente|Inconsistente|Lacuna/i.test(r.status ?? '')).length;
  const altas = pendencias.filter(p => p.prioridade === 'Alta').length;
  const ultimaVisita = coletas.find(c => c.data_visita)?.data_visita ?? null;

  // ---- equipe ----
  const itensEquipe = equipes
    .filter(e => e.quantidade !== null)
    .sort((a, b) => (b.quantidade ?? 0) - (a.quantidade ?? 0))
    .map(e => ({ rotulo: e.cargo, valor: e.quantidade ?? 0, cor: GRUPOS_CARGO[grupoDoCargo(e.cargo)].cor, detalhe: GRUPOS_CARGO[grupoDoCargo(e.cargo)].nome }));
  const gruposPresentes = GRUPOS_CARGO.filter((_, i) => itensEquipe.some(it => it.cor === GRUPOS_CARGO[i].cor));

  // ---- cobertura das atividades ----
  const nivel = (eq: string, at: string) => competencias.find(c => c.equipe_id === eq && c.atividade_id === at)?.nivel ?? 'nao';
  const cobertura = atividades.map(a => {
    const conta = (n: string) => equipes.filter(e => nivel(e.id, a.id) === n).length;
    return { rotulo: a.nome, valores: [conta('executa'), conta('apoia'), conta('verificar')] };
  });
  const semResponsavel = cobertura.filter(c => c.valores[0] === 0);

  // ---- indicadores ----
  const ultimo = ultimoMesComDado(lancamentos);
  const noUltimo = (id: string) => lancamentos.find(l => l.indicador_id === id && ultimo && l.competencia.startsWith(ultimo.slice(0, 7)));
  const producao = indicadores.find(i => i.codigo === 'PROD-01');
  const serieProd = producao ? serieMensal(lancamentos, producao.id) : null;
  const temProducao = serieProd?.pontos.some(p => p !== null);

  // ---- ocupação (última visita de cada atividade) ----
  const ocupacao = new Map<string, { valor: number; data: string | null }>();
  for (const c of coletas) {
    const k = calcularCapacidade(c);
    if (k && c.atividade && !ocupacao.has(c.atividade)) ocupacao.set(c.atividade, { valor: Math.round(k.ocupacao), data: c.data_visita });
  }

  const pendOrdenadas = [...pendencias].sort((a, b) => PESO[a.prioridade] - PESO[b.prioridade]);

  return (
    <>
      <div className="numeros">
        <Numero
          destaque
          icone={<Users size={15} strokeWidth={2} />}
          rotulo="Profissionais"
          valor={declarados ?? soma}
          detalhe={
            semQtd.length ? `${semQtd.length} cargo(s) sem quantidade informada`
            : declarados !== null && declarados !== soma ? <span className="texto-alerta">{soma} discriminados por cargo — confere?</span>
            : `${equipes.length} cargos na equipe`
          }
        />
        <Numero icone={<FileText size={15} strokeWidth={2} />} rotulo="Ficha preenchida" valor={`${numeroBR(pctFicha, 0)}%`} detalhe={<span className="mini-trilho"><span style={{ width: `${pctFicha}%` }} /></span>} />
        <Numero icone={<Flag size={15} strokeWidth={2} />} rotulo="Restrições" valor={restricoes.length} detalhe={alertasRestricao ? `${alertasRestricao} com informação a confirmar` : 'nenhuma divergente'} />
        <Numero icone={<ClipboardCheck size={15} strokeWidth={2} />} rotulo="Pendências abertas" valor={pendencias.length} detalhe={altas ? `${altas} de prioridade alta` : 'nenhuma urgente'} />
        <Numero icone={<CalendarDays size={15} strokeWidth={2} />} rotulo="Última visita" valor={ultimaVisita ? dataBR(ultimaVisita) : '—'} detalhe={`${coletas.length} visita(s) registrada(s)`} />
      </div>

      <div className="painel-grade">
        <CartaoGrafico
          titulo="Composição da equipe"
          subtitulo={semQtd.length ? `Sem quantidade: ${semQtd.map(e => e.cargo).join(', ')}` : 'Profissionais por cargo'}
          tabela={{ cabecalho: ['Cargo', 'Área', 'Profissionais'], linhas: itensEquipe.map(i => [i.rotulo, i.detalhe, i.valor]) }}
        >
          {itensEquipe.length ? (
            <>
              <Legenda itens={gruposPresentes.map(g => ({ nome: g.nome, cor: g.cor }))} />
              <BarrasH itens={itensEquipe} />
            </>
          ) : (
            <GraficoVazio>Nenhum cargo com quantidade informada. <Link to="/ubs?aba=equipe">Preencher a equipe</Link></GraficoVazio>
          )}
        </CartaoGrafico>

        <CartaoGrafico
          titulo="Quem faz cada atividade"
          subtitulo={semResponsavel.length ? <span className="texto-alerta">{semResponsavel.length} atividade(s) sem nenhum cargo que execute</span> : 'Número de cargos por nível'}
          tabela={{ cabecalho: ['Atividade', 'Executa', 'Apoia', 'Verificar'], linhas: cobertura.map(c => [c.rotulo, ...c.valores]) }}
        >
          <BarrasEmpilhadasH
            series={[{ nome: 'Executa', cor: CORES.serie1 }, { nome: 'Apoia', cor: CORES.serie3 }, { nome: 'A verificar', cor: CORES.serie4 }]}
            linhas={cobertura.map(c => ({ ...c, destaque: c.valores[0] === 0 ? <SeloSituacao situacao="abaixo" texto="ninguém executa" /> : undefined }))}
            sufixo=" cargo(s)"
          />
        </CartaoGrafico>

        <CartaoGrafico
          titulo="Indicadores × meta"
          subtitulo={ultimo ? `Último mês com dados: ${mesAno(ultimo)}` : 'Valores do último mês lançado'}
          tabela={{
            cabecalho: ['Indicador', 'Valor', 'Meta'],
            linhas: indicadores.map(i => [i.nome, noUltimo(i.id)?.valor ?? '—', i.meta ?? '—']),
          }}
        >
          {ultimo ? (
            <div className="lista-metas">
              {indicadores.map(i => (
                <BarraMeta key={i.id} nome={i.nome} valor={noUltimo(i.id)?.valor ?? null} meta={i.meta} sentido={i.sentido_meta} unidade={i.unidade_medida} />
              ))}
            </div>
          ) : (
            <GraficoVazio>Ainda não há números lançados para esta UBS. <Link to="/indicadores?aba=lancar&novo=1">Lançar o mês</Link></GraficoVazio>
          )}
        </CartaoGrafico>

        <CartaoGrafico
          titulo="Atendimentos por mês"
          subtitulo="Últimos 12 meses"
          tabela={serieProd ? { cabecalho: ['Mês', 'Atendimentos'], linhas: serieProd.rotulos.map((r, i) => [r, serieProd.pontos[i] ?? '—']) } : undefined}
        >
          {temProducao && serieProd ? (
            <Linhas rotulosX={serieProd.rotulos} series={[{ nome: 'Atendimentos', cor: CORES.serie1, pontos: serieProd.pontos }]} />
          ) : (
            <GraficoVazio>O gráfico aparece quando houver atendimentos lançados.</GraficoVazio>
          )}
        </CartaoGrafico>

        <CartaoGrafico
          titulo="Ocupação da equipe por atividade"
          subtitulo="Da visita de campo mais recente de cada atividade · acima de 100% a demanda passa da capacidade"
          tabela={{ cabecalho: ['Atividade', 'Ocupação (%)', 'Visita'], linhas: [...ocupacao].map(([a, o]) => [a, o.valor, dataBR(o.data)]) }}
        >
          {ocupacao.size ? (
            <BarrasH
              itens={[...ocupacao].map(([a, o]) => ({ rotulo: a, valor: o.valor, detalhe: `Visita de ${dataBR(o.data)}` }))}
              sufixo="%"
              referencia={{ valor: 100, rotulo: '100% = no limite' }}
            />
          ) : (
            <GraficoVazio>Registre uma visita com o cálculo de capacidade para ver este gráfico. <Link to="/ubs?aba=coletas">Visitas de campo</Link></GraficoVazio>
          )}
        </CartaoGrafico>

        <CartaoGrafico titulo="Pendências e questionários" subtitulo="O que esta UBS ainda precisa resolver">
          <div className="lista-compacta">
            {questionarios.map(q => {
              const respondeu = aplicacoes.some(a => a.questionario_id === q.id);
              return (
                <div key={q.id} className="lista-compacta-item">
                  <SeloSituacao situacao={respondeu ? 'atingiu' : 'abaixo'} texto={respondeu ? 'Respondido' : 'Falta responder'} />
                  <span>Questionário “{q.titulo}”</span>
                </div>
              );
            })}
            {pendOrdenadas.slice(0, 6).map(p => (
              <div key={p.id} className="lista-compacta-item">
                <span className={`chip ${p.prioridade === 'Alta' ? 'warn' : 'neutral'}`}>{p.prioridade}</span>
                <span>{p.texto}</span>
              </div>
            ))}
            {!questionarios.length && !pendencias.length && <p className="empty">Nada pendente nesta UBS.</p>}
            {pendencias.length > 6 && <Link to="/ubs?aba=restricoes" className="muted">Ver as {pendencias.length} pendências</Link>}
          </div>
        </CartaoGrafico>
      </div>
    </>
  );
}
