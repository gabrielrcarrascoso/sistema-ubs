import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, CalendarDays, ClipboardCheck, EyeOff, FileText, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ok, useConsulta } from '../../lib/hooks';
import { buscarIndicadores, buscarLancamentos } from '../../lib/indicadores';
import type { Aplicacao, Atividade, CampoFicha, Coleta, Competencia, Equipe, Pendencia, Questionario, Unidade } from '../../lib/types';
import { dataBR, numeroBR, ultimosMeses } from '../../lib/util';
import { CODIGO_ATENDIMENTOS, GRUPOS_CARGO, grupoDoCargo, serieMensal } from '../../lib/paineis';
import { buscarProducao, buscarProfissionais, corDaCategoria, nomeEquipe, resumirProducao, TIPOS } from '../../lib/producao';
import { Carregando, Erro } from '../../components/ui';
import {
  BarrasEmpilhadasH, BarrasH, CartaoGrafico, CORES, GraficoVazio, Legenda, Linhas, Numero, SeloSituacao,
} from '../../components/graficos';
import { ModalProfissionais } from '../../components/ModalProfissionais';
import { calcularCapacidade } from './AbaColetas';
import { IndicadoresUBS } from './IndicadoresUBS';
import { preenchimentoFicha } from './AbaFicha';

const PESO = { Alta: 0, Média: 1, Baixa: 2 } as const;

/** Rola até um cartão do painel (ex.: ao clicar no número de registros) */
const rolarAte = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

/**
 * Painel (dashboard) de uma UBS: o retrato da unidade em gráficos.
 * Tudo leva a algum lugar: números abrem a lista ou a aba certa, linhas dos gráficos abrem o detalhe.
 */
export function AbaPainel({ unidade: u, campos, aoIrPara }: { unidade: Unidade; campos: CampoFicha[]; aoIrPara: (aba: string) => void }) {
  const navegar = useNavigate();
  const [verProfissionais, setVerProfissionais] = useState(false);
  const { dados, carregando, erro, recarregar } = useConsulta(async () => {
    const [equipes, atividades, pendencias, coletas, indicadores, lancamentos, questionarios, aplicacoes, producao, profissionais] = await Promise.all([
      supabase.from('equipes').select('*').eq('unidade_id', u.id).order('ordem').then(ok<Equipe[]>),
      supabase.from('atividades').select('*').order('ordem').then(ok<Atividade[]>),
      supabase.from('pendencias').select('*').eq('unidade_id', u.id).eq('concluida', false).then(ok<Pendencia[]>),
      supabase.from('coletas').select('*').eq('unidade_id', u.id).order('data_visita', { ascending: false, nullsFirst: false }).then(ok<Coleta[]>),
      buscarIndicadores(true),
      buscarLancamentos({ desde: ultimosMeses(12)[0], unidadeId: u.id }),
      supabase.from('questionarios').select('*').eq('status', 'aberto').then(ok<Questionario[]>),
      supabase.from('aplicacoes').select('id, questionario_id, unidade_id').eq('unidade_id', u.id).then(ok<Pick<Aplicacao, 'id' | 'questionario_id' | 'unidade_id'>[]>),
      buscarProducao(u.id),
      buscarProfissionais(u.id),
    ]);
    const competencias = equipes.length
      ? ok<Competencia[]>(await supabase.from('competencias').select('*').in('equipe_id', equipes.map(e => e.id)))
      : [];
    return { equipes, atividades, pendencias, coletas, indicadores, lancamentos, questionarios, aplicacoes, competencias, producao, profissionais };
  }, [u.id], 'painel-ubs');

  if (carregando) return <Carregando />;
  if (!dados) return <Erro mensagem={erro} />;
  const { equipes, atividades, pendencias, coletas, indicadores, lancamentos, questionarios, aplicacoes, competencias, producao, profissionais } = dados;

  // ---- números do topo ----
  const soma = equipes.reduce((s, e) => s + (e.quantidade ?? 0), 0);
  const semQtd = equipes.filter(e => e.quantidade === null);
  const declarados = u.profissionais_declarados;
  const pctFicha = preenchimentoFicha(u, campos);
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

  // ---- atendimentos por mês (vêm do C1) ----
  const indicadorProd = indicadores.find(i => i.codigo === CODIGO_ATENDIMENTOS);
  const serieProd = indicadorProd ? serieMensal(lancamentos, indicadorProd.id, 12, 'numerador') : null;
  const temProducao = serieProd?.pontos.some(p => p !== null);

  // ---- ocupação (última visita de cada atividade) ----
  const ocupacao = new Map<string, { valor: number; data: string | null }>();
  for (const c of coletas) {
    const k = calcularCapacidade(c);
    if (k && c.atividade && !ocupacao.has(c.atividade)) ocupacao.set(c.atividade, { valor: Math.round(k.ocupacao), data: c.data_visita });
  }

  const pendOrdenadas = [...pendencias].sort((a, b) => PESO[a.prioridade] - PESO[b.prioridade]);

  // ---- produção registrada no e-SUS (planilha da Célula 3) ----
  const prod = resumirProducao(producao);
  const nomesVisiveis = profissionais.some(p => p.nome_visivel);
  const variasEquipes = new Set(profissionais.map(p => p.equipe)).size > 1;
  const itensProf = profissionais.map(p => ({
    rotulo: variasEquipes ? `${p.nome} · ${nomeEquipe(p.equipe, true)}` : p.nome,
    valor: p.quantidade,
    cor: corDaCategoria(p.categoria),
    detalhe: `${p.categoria} · ≈${numeroBR(p.quantidade / (prod?.meses ?? 6), 0)} por mês`,
    aoClicar: () => setVerProfissionais(true),
  }));

  return (
    <>
      <div className="numeros">
        {prod && (
          <Numero
            destaque
            icone={<Activity size={15} strokeWidth={2} />}
            rotulo={`Registros no e-SUS · ${prod.periodo}`}
            valor={numeroBR(prod.total, 0)}
            aoClicar={() => rolarAte('ubs-registros')}
            dica="Ver gráficos"
            detalhe={`≈${numeroBR(prod.mediaMensal, 0)} por mês · ${prod.porCategoria.length > 1 ? 'equipes' : 'equipe'} ${prod.porCategoria.map(e => e.rotulo).join(' e ')}`}
          />
        )}
        <Numero
          destaque={!prod}
          icone={<Users size={15} strokeWidth={2} />}
          rotulo="Profissionais"
          valor={declarados ?? soma}
          aoClicar={() => setVerProfissionais(true)}
          dica="Ver lista"
          detalhe={
            semQtd.length ? `${semQtd.length} cargo(s) sem quantidade informada`
            : declarados !== null && declarados !== soma ? <span className="texto-alerta">{soma} discriminados por cargo — confere?</span>
            : `${equipes.length} cargos na equipe`
          }
        />
        <Numero icone={<FileText size={15} strokeWidth={2} />} rotulo="Ficha preenchida" valor={`${numeroBR(pctFicha, 0)}%`} aoClicar={() => aoIrPara('ficha')} dica="Abrir ficha" detalhe={<span className="mini-trilho"><span style={{ width: `${pctFicha}%` }} /></span>} />
        <Numero icone={<ClipboardCheck size={15} strokeWidth={2} />} rotulo="Pendências abertas" valor={pendencias.length} aoClicar={() => aoIrPara('restricoes')} dica="Ver pendências" detalhe={altas ? `${altas} de prioridade alta` : 'nenhuma urgente'} />
        <Numero icone={<CalendarDays size={15} strokeWidth={2} />} rotulo="Última visita" valor={ultimaVisita ? dataBR(ultimaVisita) : '—'} aoClicar={() => aoIrPara('coletas')} dica="Ver visitas" detalhe={`${coletas.length} visita(s) registrada(s)`} />
      </div>

      <div className="painel-grade">
        {prod && (
          <>
            <CartaoGrafico
              titulo="Registros por equipe e categoria"
              subtitulo={`Total de ${prod.periodo} · e-SUS`}
              id="ubs-registros"
              verTudo={{ rotulo: 'Profissionais', aoClicar: () => setVerProfissionais(true) }}
              tabela={{
                cabecalho: ['Equipe', ...prod.categorias.map(c => c.nome), 'Total', 'Média mensal'],
                linhas: prod.porCategoria.map(l => {
                  const t = l.valores.reduce((a, b) => a + b, 0);
                  return [l.rotulo, ...l.valores, t, Math.round(t / prod.meses)];
                }),
              }}
            >
              <BarrasEmpilhadasH series={prod.categorias.map(c => ({ nome: c.plural, cor: c.cor }))} linhas={prod.porCategoria} />
            </CartaoGrafico>
            <CartaoGrafico
              titulo="Tipo de atendimento"
              subtitulo="Proporção de cada tipo em cada equipe"
              tabela={{ cabecalho: ['Equipe', ...TIPOS.map(t => t.curto)], linhas: prod.porTipo.map(l => [l.rotulo, ...l.valores]) }}
            >
              <BarrasEmpilhadasH series={TIPOS.map(t => ({ nome: t.curto, cor: t.cor }))} linhas={prod.porTipo} percentual />
            </CartaoGrafico>
          </>
        )}
        {profissionais.length > 0 && (
          <CartaoGrafico
            titulo="Registros por profissional"
            subtitulo={`${prod?.periodo ?? ''} · contagem de registros não mede produtividade nem horas trabalhadas`}
            verTudo={{ rotulo: 'Ver lista', aoClicar: () => setVerProfissionais(true) }}
            className="largo"
            acoes={!nomesVisiveis && (
              <span className="chip neutral" title="Os nomes aparecem só para o administrador geral">
                <EyeOff size={12} strokeWidth={2} style={{ verticalAlign: '-2px' }} /> nomes ocultos
              </span>
            )}
            tabela={{
              cabecalho: ['Profissional', 'Equipe', 'Categoria', 'Registros', 'Média mensal', 'Horas/semana', 'Dias/turnos', 'Tempo por consulta', 'Validação'],
              linhas: profissionais.map(p => [
                p.nome, nomeEquipe(p.equipe), p.categoria, p.quantidade, Math.round(p.quantidade / (prod?.meses ?? 6)),
                p.horas_semana ?? '—', p.dias_turnos ?? '—', p.tempo_consulta ?? '—', p.status_validacao ?? '—',
              ]),
            }}
          >
            <Legenda itens={[...new Set(profissionais.map(p => p.categoria))].map(c => ({ nome: c, cor: corDaCategoria(c) }))} />
            <BarrasH itens={itensProf} />
          </CartaoGrafico>
        )}
        <CartaoGrafico
          titulo="Composição da equipe"
          subtitulo={semQtd.length ? `Sem quantidade: ${semQtd.map(e => e.cargo).join(', ')}` : 'Profissionais por cargo'}
          tabela={{ cabecalho: ['Cargo', 'Área', 'Profissionais'], linhas: itensEquipe.map(i => [i.rotulo, i.detalhe, i.valor]) }}
          verTudo={{ rotulo: 'Ver lista', aoClicar: () => setVerProfissionais(true) }}
        >
          {itensEquipe.length ? (
            <>
              <Legenda itens={gruposPresentes.map(g => ({ nome: g.nome, cor: g.cor }))} />
              <BarrasH itens={itensEquipe.map(i => ({ ...i, aoClicar: () => aoIrPara('equipe') }))} />
            </>
          ) : (
            <GraficoVazio>Nenhum cargo com quantidade informada. <button className="btn link" onClick={() => aoIrPara('equipe')}>Preencher a equipe</button></GraficoVazio>
          )}
        </CartaoGrafico>

        <CartaoGrafico
          titulo="Quem faz cada atividade"
          subtitulo={semResponsavel.length ? <span className="texto-alerta">{semResponsavel.length} atividade(s) sem cargo principal</span> : 'Quantos cargos fazem cada atividade (matriz de competências)'}
          tabela={{ cabecalho: ['Atividade', 'Principal', 'Condicionada', 'A verificar'], linhas: cobertura.map(c => [c.rotulo, ...c.valores]) }}
          verTudo={{ rotulo: 'Ver matriz', aoClicar: () => aoIrPara('equipe') }}
        >
          <BarrasEmpilhadasH
            series={[{ nome: 'Principal', cor: CORES.serie1 }, { nome: 'Condicionada', cor: CORES.serie3 }, { nome: 'A verificar', cor: CORES.serie4 }]}
            linhas={cobertura.map(c => ({ ...c, destaque: c.valores[0] === 0 ? <SeloSituacao situacao="abaixo" texto="sem principal" /> : undefined, aoClicar: () => aoIrPara('equipe') }))}
            sufixo=" cargo(s)"
          />
        </CartaoGrafico>

        <IndicadoresUBS unidadeId={u.id} indicadores={indicadores} lancamentos={lancamentos} />

        {(temProducao || !prod) && (
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
        )}

        <CartaoGrafico
          titulo="Ocupação da equipe por atividade"
          subtitulo="Da visita de campo mais recente de cada atividade · acima de 100% a demanda passa da capacidade"
          verTudo={{ rotulo: 'Visitas', aoClicar: () => aoIrPara('coletas') }}
          tabela={{ cabecalho: ['Atividade', 'Ocupação (%)', 'Visita'], linhas: [...ocupacao].map(([a, o]) => [a, o.valor, dataBR(o.data)]) }}
        >
          {ocupacao.size ? (
            <BarrasH
              itens={[...ocupacao].map(([a, o]) => ({ rotulo: a, valor: o.valor, detalhe: `Visita de ${dataBR(o.data)}` }))}
              sufixo="%"
              referencia={{ valor: 100, rotulo: '100% = no limite' }}
            />
          ) : (
            <GraficoVazio>Registre uma visita com o cálculo de capacidade para ver este gráfico. <button className="btn link" onClick={() => aoIrPara('coletas')}>Visitas de campo</button></GraficoVazio>
          )}
        </CartaoGrafico>

        <CartaoGrafico titulo="Pendências e questionários" subtitulo="O que esta UBS ainda precisa resolver" verTudo={{ rotulo: 'Ver todas', aoClicar: () => aoIrPara('restricoes') }}>
          <div className="lista-compacta">
            {questionarios.map(q => {
              const respondeu = aplicacoes.some(a => a.questionario_id === q.id);
              return (
                <div key={q.id} className="lista-compacta-item clicavel" role="button" tabIndex={0} onClick={() => navegar(respondeu ? `/questionarios/${q.id}/resultados` : `/questionarios/${q.id}/responder`)}>
                  <SeloSituacao situacao={respondeu ? 'atingiu' : 'abaixo'} texto={respondeu ? 'Respondido' : 'Falta responder'} />
                  <span>Questionário “{q.titulo}”</span>
                </div>
              );
            })}
            {pendOrdenadas.slice(0, 6).map(p => (
              <div key={p.id} className="lista-compacta-item clicavel" role="button" tabIndex={0} onClick={() => aoIrPara('restricoes')}>
                <span className={`chip ${p.prioridade === 'Alta' ? 'warn' : 'neutral'}`}>{p.prioridade}</span>
                <span>{p.texto}</span>
              </div>
            ))}
            {!questionarios.length && !pendencias.length && <p className="empty">Nada pendente nesta UBS.</p>}
            {pendencias.length > 6 && <Link to="/ubs?aba=restricoes" className="muted">Ver as {pendencias.length} pendências</Link>}
          </div>
        </CartaoGrafico>
      </div>
      {verProfissionais && (
        <ModalProfissionais
          unidades={[{ id: u.id, nome: u.nome }]}
          equipes={equipes}
          profissionais={profissionais}
          aoFechar={() => setVerProfissionais(false)}
          aoAlterar={recarregar}
          aoAbrirEquipe={() => {
            setVerProfissionais(false);
            aoIrPara('equipe');
          }}
        />
      )}
    </>
  );
}
