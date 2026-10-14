import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { buscarUnidades, ok, useConsulta } from '../lib/hooks';
import { buscarIndicadores, buscarLancamentos } from '../lib/indicadores';
import type { Aplicacao, Pendencia, Questionario } from '../lib/types';
import { mesAno, NOME_PAPEL, numeroBR, ultimosMeses } from '../lib/util';
import { Cabecalho, Carregando, Erro, Painel } from '../components/ui';
import { buscarCamposFicha } from './config/CamposFicha';
import { preenchimentoFicha } from './ubs/AbaFicha';

interface Tarefa {
  icone: string;
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

/** Página inicial: o que cada pessoa precisa fazer agora + atalhos */
export function Inicio() {
  const { perfil, ehGestor } = useAuth();
  const navegar = useNavigate();
  const mesPassado = ultimosMeses(2)[0];

  const { dados, carregando, erro } = useConsulta(async () => {
    const [unidades, campos, pendencias, questionarios, aplicacoes, indicadores, lancamentos, aguardando] = await Promise.all([
      buscarUnidades(),
      buscarCamposFicha(true),
      supabase.from('pendencias').select('*').eq('concluida', false).then(ok<Pendencia[]>),
      supabase.from('questionarios').select('*').neq('status', 'encerrado').then(ok<Questionario[]>),
      supabase.from('aplicacoes').select('id, questionario_id, unidade_id').then(ok<Pick<Aplicacao, 'id' | 'questionario_id' | 'unidade_id'>[]>),
      buscarIndicadores(true),
      buscarLancamentos({ desde: mesPassado }),
      ehGestor ? supabase.from('perfis').select('id', { count: 'exact', head: true }).eq('ativo', false) : Promise.resolve({ count: 0 }),
    ]);
    return { unidades, campos, pendencias, questionarios, aplicacoes, indicadores, lancamentos, aguardando: aguardando.count ?? 0 };
  }, [ehGestor, mesPassado]);

  if (carregando) return <Carregando />;
  if (!dados || !perfil) return <Erro mensagem={erro} />;
  const { unidades, campos, pendencias, questionarios, aplicacoes, indicadores, lancamentos, aguardando } = dados;

  const minhaUBS = perfil.papel === 'coordenador' ? unidades.find(u => u.id === perfil.unidade_id) : undefined;
  const lancadosNoMes = (uid: string) => lancamentos.filter(l => l.unidade_id === uid && l.competencia.startsWith(mesPassado.slice(0, 7))).length;
  const abertos = questionarios.filter(q => q.status === 'aberto');
  const tarefas: Tarefa[] = [];

  if (ehGestor) {
    if (aguardando > 0)
      tarefas.push({ icone: '☺', titulo: `${aguardando} pessoa(s) aguardando aprovação`, detalhe: 'Aprove e defina o papel de cada uma.', link: '/configuracoes?aba=usuarios', alta: true });
    for (const q of questionarios.filter(x => x.status === 'rascunho'))
      tarefas.push({ icone: '✍', titulo: `Questionário em rascunho: “${q.titulo}”`, detalhe: 'Revise as perguntas e abra para as UBS responderem.', link: `/questionarios/${q.id}/editar` });
    for (const q of abertos) {
      const faltam = unidades.filter(u => !aplicacoes.some(a => a.questionario_id === q.id && a.unidade_id === u.id));
      if (faltam.length)
        tarefas.push({ icone: '⏳', titulo: `“${q.titulo}”: ${faltam.length} UBS ainda não responderam`, detalhe: faltam.map(u => u.nome).join(', '), link: `/questionarios/${q.id}/resultados` });
    }
    const semLancamento = unidades.filter(u => lancadosNoMes(u.id) < indicadores.length);
    if (indicadores.length && semLancamento.length)
      tarefas.push({ icone: '📊', titulo: `Indicadores de ${mesAno(mesPassado)} incompletos em ${semLancamento.length} UBS`, detalhe: semLancamento.map(u => u.nome).join(', '), link: '/indicadores?aba=qualidade' });
    const incompletas = unidades.filter(u => preenchimentoFicha(u, campos) < 100);
    if (incompletas.length)
      tarefas.push({ icone: '📋', titulo: `${incompletas.length} UBS com ficha incompleta`, detalhe: incompletas.map(u => `${u.nome} (${numeroBR(preenchimentoFicha(u, campos), 0)}%)`).join(', '), link: '/ubs', unidadeId: incompletas[0].id });
    const altas = pendencias.filter(p => p.prioridade === 'Alta');
    if (altas.length)
      tarefas.push({ icone: '⚑', titulo: `${altas.length} pendência(s) de prioridade alta`, detalhe: altas.slice(0, 3).map(p => p.texto).join(' · '), link: '/ubs?aba=restricoes' });
  }

  if (minhaUBS) {
    for (const q of abertos.filter(q => !aplicacoes.some(a => a.questionario_id === q.id && a.unidade_id === minhaUBS.id)))
      tarefas.push({ icone: '✍', titulo: `Responder o questionário “${q.titulo}”`, detalhe: 'Sua UBS ainda não respondeu.', link: `/questionarios/${q.id}/responder`, alta: true });
    const faltam = indicadores.length - lancadosNoMes(minhaUBS.id);
    if (faltam > 0)
      tarefas.push({ icone: '📊', titulo: `Lançar ${faltam} indicador(es) de ${mesAno(mesPassado)}`, detalhe: 'Números do mês passado tirados do e-SUS/PEC.', link: '/indicadores?aba=lancar', alta: true });
    const pct = preenchimentoFicha(minhaUBS, campos);
    if (pct < 100)
      tarefas.push({ icone: '📋', titulo: `Completar a ficha da UBS (${numeroBR(pct, 0)}% preenchida)`, detalhe: 'Mantenha as informações da sua unidade atualizadas.', link: '/ubs', unidadeId: minhaUBS.id });
    const minhas = pendencias.filter(p => p.unidade_id === minhaUBS.id);
    if (minhas.length)
      tarefas.push({ icone: '⚑', titulo: `${minhas.length} pendência(s) da sua UBS em aberto`, detalhe: minhas.slice(0, 3).map(p => p.texto).join(' · '), link: '/ubs?aba=restricoes', unidadeId: minhaUBS.id });
  }

  tarefas.sort((a, b) => Number(!!b.alta) - Number(!!a.alta));

  const atalhos = ehGestor
    ? [
        { icone: '🏥', titulo: 'UBS', texto: 'Fichas, equipes e restrições', link: '/ubs' },
        { icone: '✍', titulo: 'Questionários', texto: 'Criar e ver resultados', link: '/questionarios' },
        { icone: '📊', titulo: 'Indicadores', texto: 'Painel e qualidade', link: '/indicadores' },
        { icone: '⚙', titulo: 'Configurações', texto: 'Usuários, ficha e backup', link: '/configuracoes' },
      ]
    : minhaUBS
      ? [
          { icone: '🏥', titulo: 'Minha UBS', texto: minhaUBS.nome, link: '/ubs' },
          { icone: '✍', titulo: 'Questionários', texto: 'Responder pesquisas', link: '/questionarios' },
          { icone: '📊', titulo: 'Lançar indicadores', texto: 'Números do mês', link: '/indicadores?aba=lancar' },
          { icone: '✎', titulo: 'Visita de campo', texto: 'Registrar coleta', link: '/ubs?aba=coletas' },
        ]
      : [
          { icone: '🏥', titulo: 'UBS', texto: 'Consultar unidades', link: '/ubs' },
          { icone: '📊', titulo: 'Indicadores', texto: 'Painel', link: '/indicadores' },
          { icone: '✍', titulo: 'Questionários', texto: 'Pesquisas', link: '/questionarios' },
          { icone: '👤', titulo: 'Meu perfil', texto: 'Nome e senha', link: '/perfil' },
        ];

  return (
    <>
      <Cabecalho
        titulo={`Olá, ${perfil.nome.split(' ')[0] || 'bem-vindo(a)'}!`}
        subtitulo={`${NOME_PAPEL[perfil.papel]}${minhaUBS ? ` · ${minhaUBS.nome}` : ''}`}
      />

      <div className="atalhos" style={{ marginBottom: 20 }}>
        {atalhos.map(a => (
          <Link key={a.titulo} to={a.link} className="atalho" onClick={() => lembrarUnidade(minhaUBS?.id)}>
            <span>{a.icone}</span>
            <b>{a.titulo}</b>
            <small>{a.texto}</small>
          </Link>
        ))}
      </div>

      <Painel titulo="O que fazer agora">
        {tarefas.length === 0 ? (
          <div className="info">✓ Tudo em dia! Nenhuma tarefa pendente para você.</div>
        ) : (
          <div className="tarefas">
            {tarefas.map((t, i) => (
              <button
                key={i}
                className={`tarefa ${t.alta ? 'alta' : ''}`}
                style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit' }}
                onClick={() => {
                  lembrarUnidade(t.unidadeId);
                  navegar(t.link);
                }}
              >
                <span className="icone">{t.icone}</span>
                <span className="texto">
                  <b>{t.titulo}</b>
                  <small>{t.detalhe}</small>
                </span>
                <span className="ir">Resolver →</span>
              </button>
            ))}
          </div>
        )}
      </Painel>

      <Painel titulo="UBS acompanhadas">
        <div className="three">
          {unidades.map(u => {
            const pct = preenchimentoFicha(u, campos);
            return (
              <button
                key={u.id}
                className="unit-card"
                onClick={() => {
                  lembrarUnidade(u.id);
                  navegar('/ubs');
                }}
              >
                <div className="row-flex">
                  <h3>{u.nome}</h3>
                  {u.id === perfil.unidade_id && <span className="chip">Minha UBS</span>}
                </div>
                <strong>{u.profissionais_declarados ?? '—'}</strong>
                <span className="muted"> profissionais</span>
                <p>{u.horario || 'Horário não informado'}</p>
                <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>Ficha {numeroBR(pct, 0)}% preenchida</div>
                <div className="progresso"><div style={{ width: `${pct}%` }} /></div>
              </button>
            );
          })}
        </div>
      </Painel>
    </>
  );
}
