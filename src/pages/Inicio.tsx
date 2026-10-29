import { Link, useNavigate } from 'react-router-dom';
import { BarChart3, ChevronRight, CircleCheck, ClipboardList, FileText, Flag, Hospital, Hourglass, PenLine, UserCheck, Users, type LucideIcon } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { buscarUnidades, ok, useConsulta } from '../lib/hooks';
import { buscarIndicadores, buscarLancamentos } from '../lib/indicadores';
import type { Aplicacao, Equipe, Pendencia, Questionario } from '../lib/types';
import { mesAno, NOME_PAPEL, numeroBR, ultimosMeses } from '../lib/util';
import { Cabecalho, Carregando, Erro } from '../components/ui';
import { BarrasEmpilhadasH, BarrasH, CartaoGrafico, CORES, GraficoVazio, Linhas, Numero, SeloSituacao, SERIES } from '../components/graficos';
import { GRUPOS_CARGO, grupoDoCargo, serieMensal, ultimoMesComDado } from '../lib/paineis';
import { buscarCamposFicha } from './config/CamposFicha';
import { preenchimentoFicha } from './ubs/AbaFicha';

interface Tarefa {
  icone: LucideIcon;
  titulo: string;
  detalhe: string;
  link: string;
  unidadeId?: string; // abre a página da UBS já nesta unidade
  alta?: boolean;
}

const lembrarUnidade = (id?: string) => {
  if (!id) return;
  try {
    localStorage.setItem('sistema-ubs:unidade', id);
  } catch {
    /* sem armazenamento */
  }
};

/** Página inicial: painel geral das UBS + o que cada pessoa precisa fazer agora */
export function Inicio() {
  const { perfil, ehGestor } = useAuth();
  const navegar = useNavigate();
  const mesPassado = ultimosMeses(2)[0];

  const { dados, carregando, erro } = useConsulta(async () => {
    const [unidades, campos, pendencias, questionarios, aplicacoes, indicadores, lancamentos12, aguardando, equipes] = await Promise.all([
      buscarUnidades(),
      buscarCamposFicha(true),
      supabase.from('pendencias').select('*').eq('concluida', false).then(ok<Pendencia[]>),
      supabase.from('questionarios').select('*').neq('status', 'encerrado').then(ok<Questionario[]>),
      supabase.from('aplicacoes').select('id, questionario_id, unidade_id').then(ok<Pick<Aplicacao, 'id' | 'questionario_id' | 'unidade_id'>[]>),
      buscarIndicadores(true),
      buscarLancamentos({ desde: ultimosMeses(12)[0] }),
      ehGestor ? supabase.from('perfis').select('id', { count: 'exact', head: true }).eq('ativo', false) : Promise.resolve({ count: 0 }),
      supabase.from('equipes').select('unidade_id, cargo, quantidade').then(ok<Pick<Equipe, 'unidade_id' | 'cargo' | 'quantidade'>[]>),
    ]);
    return { unidades, campos, pendencias, questionarios, aplicacoes, indicadores, lancamentos12, aguardando: aguardando.count ?? 0, equipes };
  }, [ehGestor, mesPassado], 'inicio');

  if (carregando) return <Carregando />;
  if (!dados || !perfil) return <Erro mensagem={erro} />;
  const { unidades, campos, pendencias, questionarios, aplicacoes, indicadores, lancamentos12, aguardando, equipes } = dados;

  const minhaUBS = perfil.papel === 'coordenador' ? unidades.find(u => u.id === perfil.unidade_id) : undefined;
  const lancadosNoMes = (uid: string) => lancamentos12.filter(l => l.unidade_id === uid && l.competencia.startsWith(mesPassado.slice(0, 7))).length;
  const abertos = questionarios.filter(q => q.status === 'aberto');
  const tarefas: Tarefa[] = [];

  if (ehGestor) {
    if (aguardando > 0)
      tarefas.push({ icone: UserCheck, titulo: `${aguardando} pessoa(s) aguardando aprovação`, detalhe: 'Aprove e defina o papel de cada uma.', link: '/configuracoes?aba=usuarios', alta: true });
    for (const q of questionarios.filter(x => x.status === 'rascunho'))
      tarefas.push({ icone: PenLine, titulo: `Questionário em rascunho: “${q.titulo}”`, detalhe: 'Revise as perguntas e abra para as UBS responderem.', link: `/questionarios/${q.id}/editar` });
    for (const q of abertos) {
      const faltam = unidades.filter(u => !aplicacoes.some(a => a.questionario_id === q.id && a.unidade_id === u.id));
      if (faltam.length)
        tarefas.push({ icone: Hourglass, titulo: `“${q.titulo}”: ${faltam.length} UBS ainda não responderam`, detalhe: faltam.map(u => u.nome).join(', '), link: `/questionarios/${q.id}/resultados` });
    }
    const semLancamento = unidades.filter(u => lancadosNoMes(u.id) < indicadores.length);
    if (indicadores.length && semLancamento.length)
      tarefas.push({ icone: BarChart3, titulo: `Indicadores de ${mesAno(mesPassado)} incompletos em ${semLancamento.length} UBS`, detalhe: semLancamento.map(u => u.nome).join(', '), link: '/indicadores?aba=qualidade' });
    const incompletas = unidades.filter(u => preenchimentoFicha(u, campos) < 100);
    if (incompletas.length)
      tarefas.push({ icone: FileText, titulo: `${incompletas.length} UBS com ficha incompleta`, detalhe: incompletas.map(u => `${u.nome} (${numeroBR(preenchimentoFicha(u, campos), 0)}%)`).join(', '), link: '/ubs', unidadeId: incompletas[0].id });
    const altas = pendencias.filter(p => p.prioridade === 'Alta');
    if (altas.length)
      tarefas.push({ icone: Flag, titulo: `${altas.length} pendência(s) de prioridade alta`, detalhe: altas.slice(0, 3).map(p => p.texto).join(' · '), link: '/ubs?aba=restricoes' });
  }

  if (minhaUBS) {
    for (const q of abertos.filter(q => !aplicacoes.some(a => a.questionario_id === q.id && a.unidade_id === minhaUBS.id)))
      tarefas.push({ icone: ClipboardList, titulo: `Responder o questionário “${q.titulo}”`, detalhe: 'Sua UBS ainda não respondeu.', link: `/questionarios/${q.id}/responder`, alta: true });
    const faltam = indicadores.length - lancadosNoMes(minhaUBS.id);
    if (faltam > 0)
      tarefas.push({ icone: BarChart3, titulo: `Lançar ${faltam} indicador(es) de ${mesAno(mesPassado)}`, detalhe: 'Números do mês passado tirados do e-SUS/PEC.', link: '/indicadores?aba=lancar', alta: true });
    const pct = preenchimentoFicha(minhaUBS, campos);
    if (pct < 100)
      tarefas.push({ icone: FileText, titulo: `Completar a ficha da UBS (${numeroBR(pct, 0)}% preenchida)`, detalhe: 'Mantenha as informações da sua unidade atualizadas.', link: '/ubs', unidadeId: minhaUBS.id });
    const minhas = pendencias.filter(p => p.unidade_id === minhaUBS.id);
    if (minhas.length)
      tarefas.push({ icone: Flag, titulo: `${minhas.length} pendência(s) da sua UBS em aberto`, detalhe: minhas.slice(0, 3).map(p => p.texto).join(' · '), link: '/ubs?aba=restricoes', unidadeId: minhaUBS.id });
  }

  tarefas.sort((a, b) => Number(!!b.alta) - Number(!!a.alta));

  // ---------- dados dos gráficos ----------
  const ultimo = ultimoMesComDado(lancamentos12);
  const totalProf = unidades.reduce((s, u) => s + (u.profissionais_declarados ?? 0), 0);
  const fichaMedia = unidades.length ? unidades.reduce((s, u) => s + preenchimentoFicha(u, campos), 0) / unidades.length : 0;
  const altasAbertas = pendencias.filter(p => p.prioridade === 'Alta').length;
  const esperados = indicadores.length * unidades.length;
  const lancados = unidades.reduce((s, u) => s + Math.min(lancadosNoMes(u.id), indicadores.length), 0);

  const equipePorUBS = unidades.map(u => {
    const valores = GRUPOS_CARGO.map(() => 0);
    for (const e of equipes.filter(e => e.unidade_id === u.id)) valores[grupoDoCargo(e.cargo)] += e.quantidade ?? 0;
    const semQtd = equipes.some(e => e.unidade_id === u.id && e.quantidade === null);
    return { rotulo: u.nome, valores, semQtd };
  });
  const prioridades = ['Alta', 'Média', 'Baixa'] as const;
  const pendPorUBS = unidades.map(u => ({
    rotulo: u.nome,
    valores: prioridades.map(pr => pendencias.filter(p => p.unidade_id === u.id && p.prioridade === pr).length),
  }));
  const producao = indicadores.find(i => i.codigo === 'PROD-01');
  const seriesProd = producao
    ? unidades.slice(0, 5).map((u, i) => ({ nome: u.nome, cor: SERIES[i], ...serieMensal(lancamentos12.filter(l => l.unidade_id === u.id), producao.id) }))
    : [];
  const temProducao = seriesProd.some(s => s.pontos.some(p => p !== null));
  const valorNoUltimo = (uid: string, iid: string) =>
    lancamentos12.find(l => l.unidade_id === uid && l.indicador_id === iid && ultimo && l.competencia.startsWith(ultimo.slice(0, 7)));

  const abrirPainel = (id: string) => {
    lembrarUnidade(id);
    navegar('/ubs?aba=painel');
  };

  return (
    <>
      <Cabecalho
        titulo={`Olá, ${perfil.nome.split(' ')[0] || 'bem-vindo(a)'}!`}
        subtitulo={`${NOME_PAPEL[perfil.papel]}${minhaUBS ? ` · ${minhaUBS.nome}` : ''} · visão geral das UBS de Salgueiro`}
      />

      <div className="numeros">
        <Numero destaque icone={<Users size={15} strokeWidth={2} />} rotulo="Profissionais nas UBS" valor={totalProf} detalhe={`em ${unidades.length} unidade(s) acompanhada(s)`} />
        <Numero icone={<FileText size={15} strokeWidth={2} />} rotulo="Fichas preenchidas" valor={`${numeroBR(fichaMedia, 0)}%`} detalhe={<span className="mini-trilho"><span style={{ width: `${fichaMedia}%` }} /></span>} />
        <Numero icone={<Flag size={15} strokeWidth={2} />} rotulo="Pendências abertas" valor={pendencias.length} detalhe={altasAbertas ? `${altasAbertas} de prioridade alta` : 'nenhuma urgente'} />
        <Numero icone={<BarChart3 size={15} strokeWidth={2} />} rotulo={`Indicadores de ${mesAno(mesPassado)}`} valor={`${lancados}/${esperados}`} detalhe="números lançados" />
      </div>

      <div className="painel-grade">
        <section className="cartao-grafico">
          <header><div><h2>O que fazer agora</h2><p>{tarefas.length ? `${tarefas.length} tarefa(s) para você` : 'Nada pendente'}</p></div></header>
          {tarefas.length === 0 ? (
            <div className="info"><CircleCheck size={16} strokeWidth={1.8} style={{ verticalAlign: '-3px' }} /> Tudo em dia! Nenhuma tarefa pendente para você.</div>
          ) : (
            <div className="tarefas">
              {tarefas.map((t, i) => (
                <button
                  key={i}
                  className={`tarefa ${t.alta ? 'alta' : ''}`}
                  onClick={() => {
                    lembrarUnidade(t.unidadeId);
                    navegar(t.link);
                  }}
                >
                  <span className="icone"><t.icone size={18} strokeWidth={1.8} /></span>
                  <span className="texto">
                    <b>{t.titulo}</b>
                    <small>{t.detalhe}</small>
                  </span>
                  <ChevronRight size={16} strokeWidth={2} className="ir" />
                </button>
              ))}
            </div>
          )}
        </section>

        <CartaoGrafico
          titulo="Equipe por UBS"
          subtitulo="Profissionais por área de atuação"
          tabela={{ cabecalho: ['UBS', ...GRUPOS_CARGO.map(g => g.nome)], linhas: equipePorUBS.map(e => [e.rotulo, ...e.valores]) }}
        >
          <BarrasEmpilhadasH
            series={GRUPOS_CARGO.map(g => ({ nome: g.nome, cor: g.cor }))}
            linhas={equipePorUBS.map(e => ({ ...e, destaque: e.semQtd ? <span className="texto-alerta" title="Há cargos sem quantidade informada">incompleta</span> : undefined }))}
            sufixo=" prof."
          />
        </CartaoGrafico>

        <CartaoGrafico
          titulo="Ficha preenchida"
          subtitulo="Quanto das informações de cada UBS já foi informado"
          tabela={{ cabecalho: ['UBS', 'Preenchido (%)'], linhas: unidades.map(u => [u.nome, Math.round(preenchimentoFicha(u, campos))]) }}
        >
          <BarrasH itens={unidades.map(u => ({ rotulo: u.nome, valor: Math.round(preenchimentoFicha(u, campos)) }))} sufixo="%" maximo={100} />
        </CartaoGrafico>

        <CartaoGrafico
          titulo="Pendências abertas"
          subtitulo="Por prioridade, em cada UBS"
          tabela={{ cabecalho: ['UBS', ...prioridades], linhas: pendPorUBS.map(p => [p.rotulo, ...p.valores]) }}
        >
          <BarrasEmpilhadasH
            series={[{ nome: 'Alta', cor: CORES.serie2 }, { nome: 'Média', cor: CORES.serie4 }, { nome: 'Baixa', cor: CORES.neutro }]}
            linhas={pendPorUBS}
          />
        </CartaoGrafico>

        <CartaoGrafico
          titulo="Indicadores por UBS"
          subtitulo={ultimo ? `Último mês com dados: ${mesAno(ultimo)}` : 'Situação de cada indicador em cada UBS'}
          className="largo"
        >
          {ultimo ? (
            <div className="tablewrap">
              <table className="tabela-calor">
                <thead>
                  <tr><th>Indicador</th>{unidades.map(u => <th key={u.id}>{u.nome}</th>)}</tr>
                </thead>
                <tbody>
                  {indicadores.map(i => (
                    <tr key={i.id}>
                      <td><b>{i.nome}</b>{i.meta !== null && <small className="muted"> · meta {i.sentido_meta === 'maior' ? '≥' : '≤'} {numeroBR(i.meta)}{i.unidade_medida === '%' ? '%' : ''}</small>}</td>
                      {unidades.map(u => {
                        const l = valorNoUltimo(u.id, i.id);
                        if (!l || l.valor === null) return <td key={u.id}><SeloSituacao situacao="sem_dado" texto="—" /></td>;
                        const ating = i.meta === null ? null : i.sentido_meta === 'maior' ? l.valor >= i.meta : l.valor <= i.meta;
                        const texto = `${numeroBR(l.valor)}${i.unidade_medida === '%' ? '%' : ''}`;
                        return <td key={u.id}><SeloSituacao situacao={ating === null ? 'sem_meta' : ating ? 'atingiu' : 'abaixo'} texto={texto} /></td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <GraficoVazio>Quando os números mensais forem lançados (ou importados da planilha), este quadro mostra quem atingiu cada meta. <Link to="/indicadores?aba=lancar&novo=1">Lançar o mês</Link></GraficoVazio>
          )}
        </CartaoGrafico>

        <CartaoGrafico
          titulo="Atendimentos por mês"
          subtitulo="Últimos 12 meses, por UBS"
          className="largo"
          tabela={temProducao ? { cabecalho: ['Mês', ...seriesProd.map(s => s.nome)], linhas: (seriesProd[0]?.rotulos ?? []).map((r, k) => [r, ...seriesProd.map(s => s.pontos[k] ?? '—')]) } : undefined}
        >
          {temProducao ? (
            <Linhas rotulosX={seriesProd[0].rotulos} series={seriesProd.map(s => ({ nome: s.nome, cor: s.cor, pontos: s.pontos }))} />
          ) : (
            <GraficoVazio>O gráfico aparece quando houver atendimentos lançados.</GraficoVazio>
          )}
        </CartaoGrafico>
      </div>

      <h2 className="titulo-secao">Painel de cada UBS</h2>
      <div className="cartoes-ubs">
        {unidades.map(u => {
          const pct = preenchimentoFicha(u, campos);
          const pend = pendencias.filter(p => p.unidade_id === u.id);
          return (
            <button key={u.id} className="cartao-ubs" onClick={() => abrirPainel(u.id)}>
              <span className="cartao-ubs-topo">
                <span className="cartao-ubs-icone"><Hospital size={18} strokeWidth={1.8} /></span>
                <span>
                  <b>{u.nome}</b>
                  <small>{u.horario || 'Horário não informado'}</small>
                </span>
                {u.id === perfil.unidade_id && <span className="chip">Minha UBS</span>}
              </span>
              <span className="cartao-ubs-numeros">
                <span><strong>{u.profissionais_declarados ?? '—'}</strong> profissionais</span>
                <span><strong>{pend.length}</strong> pendências</span>
                <span><strong>{numeroBR(pct, 0)}%</strong> da ficha</span>
              </span>
              <span className="mini-trilho"><span style={{ width: `${pct}%` }} /></span>
              <span className="cartao-ubs-link">Abrir painel <ChevronRight size={15} strokeWidth={2} /></span>
            </button>
          );
        })}
      </div>
    </>
  );
}
