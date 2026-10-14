import { useState } from 'react';
import { ArrowLeft, Download, Plus, Printer, Trash2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase, traduzErro } from '../lib/supabase';
import { buscarUnidades, ok, useConsulta } from '../lib/hooks';
import type { Aplicacao, Pergunta, Questionario, Unidade } from '../lib/types';
import { baixarCSV, dataBR, numeroBR } from '../lib/util';
import { mostrarValor, vazio } from '../components/CampoDinamico';
import { BotaoIcone, Cabecalho, Carregando, Cartao, Erro, Painel } from '../components/ui';
import { CLASSE_STATUS, NOME_STATUS } from './Questionarios';

// Resultados consolidados do questionário (por pergunta e por UBS)
export function QuestionarioResultados() {
  const { id = '' } = useParams();
  const { ehGestor, podeEditar } = useAuth();
  const [filtroUnidade, setFiltroUnidade] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const { dados, carregando, erro: erroQ, recarregar } = useConsulta(async () => {
    const [questionario, perguntas, aplicacoes, unidades] = await Promise.all([
      supabase.from('questionarios').select('*').eq('id', id).single().then(ok<Questionario>),
      supabase.from('perguntas').select('*').eq('questionario_id', id).order('ordem').then(ok<Pergunta[]>),
      supabase.from('aplicacoes').select('*').eq('questionario_id', id).order('data_aplicacao').then(ok<Aplicacao[]>),
      buscarUnidades(),
    ]);
    return { questionario, perguntas, aplicacoes, unidades };
  }, [id]);

  if (carregando) return <Carregando />;
  if (!dados) return <Erro mensagem={erroQ} />;
  const { questionario: q, perguntas, unidades } = dados;
  const aplicacoes = dados.aplicacoes.filter(a => !filtroUnidade || a.unidade_id === filtroUnidade);
  const nomeUBS = (uid: string) => unidades.find(u => u.id === uid)?.nome ?? 'UBS desativada';
  const ubsComResposta = new Set(dados.aplicacoes.map(a => a.unidade_id));
  const pendentes = unidades.filter((u: Unidade) => !ubsComResposta.has(u.id));

  async function remover(a: Aplicacao) {
    if (!confirm(`Remover a resposta de ${nomeUBS(a.unidade_id)} (${dataBR(a.data_aplicacao)})?`)) return;
    const { error } = await supabase.from('aplicacoes').delete().eq('id', a.id);
    if (error) return setErro(traduzErro(error));
    recarregar();
  }

  function exportar() {
    baixarCSV(
      [
        ['UBS', 'Data', 'Respondente', ...perguntas.map((p, i) => `${i + 1}. ${p.enunciado}`), 'Observações'],
        ...aplicacoes.map(a => [
          nomeUBS(a.unidade_id), dataBR(a.data_aplicacao), a.respondente ?? '',
          ...perguntas.map(p => (vazio(a.respostas[p.id]) ? '' : mostrarValor(p.tipo, a.respostas[p.id]))),
          a.observacao ?? '',
        ]),
      ],
      `respostas_${q.titulo.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '_')}.csv`,
    );
  }

  return (
    <>
      <Cabecalho
        titulo={`Resultados · ${q.titulo}`}
        subtitulo="Consolidação das respostas das UBS."
        acoes={
          <>
            <Link className="btn" to="/questionarios"><ArrowLeft size={16} strokeWidth={1.8} /> Voltar</Link>
            <button className="btn" onClick={() => window.print()}><Printer size={16} strokeWidth={1.8} /> Imprimir</button>
            <button className="btn" onClick={exportar} disabled={!aplicacoes.length}><Download size={16} strokeWidth={1.8} /> Exportar respostas (CSV)</button>
            {q.status === 'aberto' && <Link className="btn primary" to={`/questionarios/${q.id}/responder`}><Plus size={16} strokeWidth={1.8} /> Responder</Link>}
          </>
        }
      />
      <Erro mensagem={erro || erroQ} />

      <div className="cards">
        <Cartao titulo="Situação" valor={<span className={`chip ${CLASSE_STATUS[q.status]}`}>{NOME_STATUS[q.status]}</span>} />
        <Cartao titulo="Respostas" valor={dados.aplicacoes.length} nota={ehGestor ? 'De todas as UBS' : 'Da sua UBS'} />
        <Cartao titulo="UBS que responderam" valor={`${ubsComResposta.size}/${unidades.length}`} />
        <Cartao titulo="Perguntas" valor={perguntas.length} />
      </div>

      {ehGestor && pendentes.length > 0 && (
        <div className="alert" style={{ marginBottom: 20 }}>
          Ainda sem resposta: {pendentes.map(u => u.nome).join(', ')}.
        </div>
      )}

      <Painel
        titulo="Resumo por pergunta"
        acoes={
          ehGestor && (
            <select value={filtroUnidade} onChange={e => setFiltroUnidade(e.target.value)} aria-label="Filtrar UBS">
              <option value="">Todas as UBS</option>
              {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          )
        }
      >
        {aplicacoes.length === 0 && <p className="empty">Nenhuma resposta ainda.</p>}
        {aplicacoes.length > 0 &&
          perguntas.map((p, i) => (
            <div className="resultado" key={p.id}>
              <b><span className="num" style={{ color: '#147d79' }}>{i + 1}.</span> {p.enunciado}</b>
              <ResumoPergunta pergunta={p} aplicacoes={aplicacoes} nomeUBS={nomeUBS} />
            </div>
          ))}
      </Painel>

      <Painel titulo="Respostas individuais">
        <div className="tablewrap">
          <table>
            <thead>
              <tr><th>UBS</th><th>Data</th><th>Respondente</th><th className="num">Respondidas</th><th></th></tr>
            </thead>
            <tbody>
              {aplicacoes.map(a => (
                <tr key={a.id}>
                  <td><b>{nomeUBS(a.unidade_id)}</b></td>
                  <td>{dataBR(a.data_aplicacao)}</td>
                  <td>{a.respondente ?? '—'}</td>
                  <td className="num">{perguntas.filter(p => !vazio(a.respostas[p.id])).length}/{perguntas.length}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {podeEditar(a.unidade_id) && q.status === 'aberto' && (
                      <Link className="btn small" to={`/questionarios/${q.id}/responder?aplicacao=${a.id}`}>Editar</Link>
                    )}{' '}
                    {podeEditar(a.unidade_id) && <BotaoIcone icone={Trash2} titulo="Remover" perigo aoClicar={() => remover(a)} />}
                  </td>
                </tr>
              ))}
              {aplicacoes.length === 0 && <tr><td colSpan={5} className="empty">Nenhuma resposta.</td></tr>}
            </tbody>
          </table>
        </div>
      </Painel>
    </>
  );
}

function ResumoPergunta({
  pergunta: p,
  aplicacoes,
  nomeUBS,
}: {
  pergunta: Pergunta;
  aplicacoes: Aplicacao[];
  nomeUBS: (id: string) => string;
}) {
  const com = aplicacoes.filter(a => !vazio(a.respostas[p.id]));
  if (com.length === 0) return <p className="empty">Sem respostas.</p>;

  // Contagem de opções (sim/não, escolha única, múltipla)
  if (p.tipo === 'sim_nao' || p.tipo === 'escolha_unica' || p.tipo === 'multipla_escolha') {
    const opcoes = p.tipo === 'sim_nao' ? ['Sim', 'Não'] : p.opcoes;
    const conta = (o: string) =>
      com.filter(a => {
        const v = a.respostas[p.id];
        if (p.tipo === 'sim_nao') return (v ? 'Sim' : 'Não') === o;
        return Array.isArray(v) ? v.includes(o) : v === o;
      }).length;
    return (
      <div className="bars" style={{ marginTop: 10 }}>
        {opcoes.map(o => {
          const n = conta(o);
          return (
            <div key={o}>
              <div className="bar-label"><span>{o}</span><span>{n} de {com.length} ({numeroBR((n / com.length) * 100, 0)}%)</span></div>
              <div className="track"><div className="fill" style={{ width: `${(n / com.length) * 100}%` }} /></div>
            </div>
          );
        })}
        {p.tipo === 'multipla_escolha' && <p className="muted">Mais de uma opção pode ser marcada por UBS.</p>}
      </div>
    );
  }

  // Números e escala: estatísticas + valor de cada UBS
  if (p.tipo === 'numero' || p.tipo === 'escala') {
    const valores = com.map(a => Number(a.respostas[p.id]));
    const media = valores.reduce((s, v) => s + v, 0) / valores.length;
    return (
      <>
        <div className="selectrow" style={{ margin: '10px 0' }}>
          <span className="chip">Média {numeroBR(media, 1)}</span>
          <span className="chip neutral">Mínimo {numeroBR(Math.min(...valores), 2)}</span>
          <span className="chip neutral">Máximo {numeroBR(Math.max(...valores), 2)}</span>
          <span className="chip neutral">{com.length} resposta(s)</span>
        </div>
        <p className="muted">{com.map(a => `${nomeUBS(a.unidade_id)}: ${mostrarValor(p.tipo, a.respostas[p.id])}`).join(' · ')}</p>
      </>
    );
  }

  // Texto e data: lista das respostas por UBS
  return (
    <div style={{ marginTop: 8 }}>
      {com.map(a => (
        <div className="item" key={a.id}>
          <span className="chip neutral">{nomeUBS(a.unidade_id)}</span> {mostrarValor(p.tipo, a.respostas[p.id])}
        </div>
      ))}
    </div>
  );
}
