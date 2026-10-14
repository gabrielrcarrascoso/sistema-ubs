import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase, traduzErro } from '../lib/supabase';
import { buscarUnidades, ok, useConsulta } from '../lib/hooks';
import type { Aplicacao, Pergunta, Questionario, StatusQuestionario } from '../lib/types';
import { dataBR } from '../lib/util';
import { Cabecalho, Campo, Carregando, Dica, Erro, Modal } from '../components/ui';

export const NOME_STATUS: Record<StatusQuestionario, string> = {
  rascunho: 'Rascunho',
  aberto: 'Aberto para respostas',
  encerrado: 'Encerrado',
};
export const CLASSE_STATUS: Record<StatusQuestionario, string> = { rascunho: 'neutral', aberto: '', encerrado: 'warn' };

export function Questionarios() {
  const { ehGestor, podeEditar } = useAuth();
  const navegar = useNavigate();
  const [criando, setCriando] = useState<{ titulo: string; descricao: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const { dados, carregando, erro: erroQ } = useConsulta(async () => {
    const [questionarios, perguntas, aplicacoes, unidades] = await Promise.all([
      supabase.from('questionarios').select('*').order('created_at', { ascending: false }).then(ok<Questionario[]>),
      supabase.from('perguntas').select('id, questionario_id').then(ok<Pick<Pergunta, 'id' | 'questionario_id'>[]>),
      supabase.from('aplicacoes').select('id, questionario_id, unidade_id').then(ok<Pick<Aplicacao, 'id' | 'questionario_id' | 'unidade_id'>[]>),
      buscarUnidades(),
    ]);
    return { questionarios, perguntas, aplicacoes, unidades };
  }, [], 'questionarios');

  if (carregando) return <Carregando />;
  if (!dados) return <Erro mensagem={erroQ} />;
  const { questionarios, perguntas, aplicacoes, unidades } = dados;
  const possoResponder = unidades.some(u => podeEditar(u.id));

  async function criar(e: FormEvent) {
    e.preventDefault();
    if (!criando) return;
    setErro(null);
    const { data, error } = await supabase
      .from('questionarios')
      .insert({ titulo: criando.titulo.trim(), descricao: criando.descricao.trim() || null })
      .select('id')
      .single();
    if (error) return setErro(traduzErro(error));
    navegar(`/questionarios/${data.id}/editar`);
  }

  return (
    <>
      <Cabecalho
        titulo="Questionários"
        subtitulo="Pesquisas de campo aplicadas nas UBS."
        acoes={ehGestor && <button className="btn primary" onClick={() => setCriando({ titulo: '', descricao: '' })}><Plus size={16} strokeWidth={1.8} /> Novo questionário</button>}
      />
      <Dica id="questionarios">
        {ehGestor ? (
          <ol>
            <li>Clique em <b>Novo questionário</b> e adicione as perguntas.</li>
            <li>Clique em <b>Abrir para respostas</b> — só então as UBS conseguem ver e responder.</li>
            <li>Acompanhe em <b>Resultados</b> quem já respondeu e compare as respostas. Ao final, <b>Encerre</b>.</li>
          </ol>
        ) : (
          <>Clique em <b>Responder</b> no questionário aberto e preencha pela sua UBS. Depois, veja tudo em <b>Resultados</b>.</>
        )}
      </Dica>
      <Erro mensagem={erroQ} />


      {questionarios.length === 0 && (
        <div className="callout">
          {ehGestor ? 'Nenhum questionário ainda. Clique em “Novo questionário”.' : 'Nenhum questionário aberto no momento.'}
        </div>
      )}

      {questionarios.map(q => {
        const nPerguntas = perguntas.filter(p => p.questionario_id === q.id).length;
        const respostas = aplicacoes.filter(a => a.questionario_id === q.id);
        const ubsRespondidas = new Set(respostas.map(a => a.unidade_id)).size;
        return (
          <section className="panel" key={q.id}>
            <div className="section-head">
              <div>
                <h2>{q.titulo}</h2>
                <p className="muted" style={{ marginTop: 4 }}>
                  {nPerguntas} pergunta(s) · {respostas.length} resposta(s) · {ubsRespondidas} de {unidades.length} UBS · criado em {dataBR(q.created_at)}
                </p>
              </div>
              <span className={`chip ${CLASSE_STATUS[q.status]}`}>{NOME_STATUS[q.status]}</span>
            </div>
            {q.descricao && <p style={{ marginBottom: 14, fontSize: 14 }}>{q.descricao}</p>}
            <div className="actions">
              {q.status === 'aberto' && possoResponder && (
                <Link className="btn primary" to={`/questionarios/${q.id}/responder`}>Responder</Link>
              )}
              <Link className="btn" to={`/questionarios/${q.id}/resultados`}>Resultados</Link>
              {ehGestor && <Link className="btn" to={`/questionarios/${q.id}/editar`}>Editar perguntas</Link>}
            </div>
          </section>
        );
      })}

      {criando && (
        <Modal titulo="Novo questionário" aoFechar={() => setCriando(null)}>
          <form onSubmit={criar}>
            <Erro mensagem={erro} />
            <div className="form-grid cols-2">
              <Campo rotulo="Título" className="full">
                <input required value={criando.titulo} onChange={e => setCriando({ ...criando, titulo: e.target.value })} placeholder="Ex.: Levantamento de estrutura física" />
              </Campo>
              <Campo rotulo="Descrição / instruções" className="full">
                <textarea value={criando.descricao} onChange={e => setCriando({ ...criando, descricao: e.target.value })} />
              </Campo>
            </div>
            <p className="muted" style={{ marginTop: 10 }}>O questionário começa como rascunho. Depois de montar as perguntas, abra-o para as UBS responderem.</p>
            <div className="actions">
              <button type="button" className="btn" onClick={() => setCriando(null)}>Cancelar</button>
              <button className="btn primary">Criar e adicionar perguntas</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
