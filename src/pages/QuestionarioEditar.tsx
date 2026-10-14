import { useState, type FormEvent } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, traduzErro } from '../lib/supabase';
import { ok, useConsulta } from '../lib/hooks';
import type { Pergunta, Questionario, StatusQuestionario, TipoCampo } from '../lib/types';
import { CampoDinamico, lerOpcoes, NOME_TIPO_CAMPO, TIPO_TEM_OPCOES } from '../components/CampoDinamico';
import { Cabecalho, Campo, Carregando, Erro, Modal, Painel } from '../components/ui';
import { CLASSE_STATUS, NOME_STATUS } from './Questionarios';

type Edicao = Partial<Pergunta> & { opcoesTexto?: string };

// Editor do questionário (somente administrador geral)
export function QuestionarioEditar() {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const [editando, setEditando] = useState<Edicao | null>(null);
  const [cabecalho, setCabecalho] = useState<{ titulo: string; descricao: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const { dados, carregando, erro: erroQ, recarregar } = useConsulta(async () => {
    const [questionario, perguntas, respostas] = await Promise.all([
      supabase.from('questionarios').select('*').eq('id', id).single().then(ok<Questionario>),
      supabase.from('perguntas').select('*').eq('questionario_id', id).order('ordem').then(ok<Pergunta[]>),
      supabase.from('aplicacoes').select('id', { count: 'exact', head: true }).eq('questionario_id', id),
    ]);
    return { questionario, perguntas, totalRespostas: respostas.count ?? 0 };
  }, [id]);

  if (carregando) return <Carregando />;
  if (!dados) return <Erro mensagem={erroQ} />;
  const { questionario: q, perguntas, totalRespostas } = dados;

  async function executar(promessa: PromiseLike<{ error: unknown }>) {
    setErro(null);
    const { error } = await promessa;
    if (error) {
      setErro(traduzErro(error));
      return false;
    }
    recarregar();
    return true;
  }

  async function mudarStatus(status: StatusQuestionario) {
    if (status === 'aberto' && perguntas.length === 0) return setErro('Adicione pelo menos uma pergunta antes de abrir.');
    const avisos: Record<StatusQuestionario, string> = {
      aberto: 'Abrir o questionário? As UBS passam a ver e responder.',
      encerrado: 'Encerrar? As respostas ficam guardadas, mas ninguém pode responder ou alterar mais.',
      rascunho: 'Voltar para rascunho? O questionário some para as UBS até ser aberto de novo.',
    };
    if (confirm(avisos[status])) await executar(supabase.from('questionarios').update({ status }).eq('id', q.id));
  }

  async function salvarPergunta(e: FormEvent) {
    e.preventDefault();
    if (!editando) return;
    const tipo = editando.tipo ?? 'texto';
    const opcoes = TIPO_TEM_OPCOES(tipo) ? lerOpcoes(editando.opcoesTexto ?? '') : [];
    if (TIPO_TEM_OPCOES(tipo) && opcoes.length < 2) return setErro('Informe pelo menos duas opções (uma por linha).');
    const registro = {
      questionario_id: q.id,
      enunciado: editando.enunciado?.trim(),
      tipo,
      opcoes,
      ajuda: editando.ajuda?.trim() || null,
      obrigatoria: editando.obrigatoria ?? false,
      ordem: editando.ordem ?? Math.max(0, ...perguntas.map(p => p.ordem)) + 1,
    };
    const deu = await executar(
      editando.id ? supabase.from('perguntas').update(registro).eq('id', editando.id) : supabase.from('perguntas').insert(registro),
    );
    if (deu) setEditando(null);
  }

  async function mover(i: number, direcao: -1 | 1) {
    const a = perguntas[i];
    const b = perguntas[i + direcao];
    if (!a || !b) return;
    await supabase.from('perguntas').update({ ordem: b.ordem }).eq('id', a.id);
    await executar(supabase.from('perguntas').update({ ordem: a.ordem === b.ordem ? a.ordem + direcao : a.ordem }).eq('id', b.id));
  }

  async function removerQuestionario() {
    const aviso = totalRespostas
      ? `Este questionário tem ${totalRespostas} resposta(s). Remover apaga TUDO, inclusive as respostas. Tem certeza?`
      : 'Remover este questionário?';
    if (!confirm(aviso)) return;
    if (await executar(supabase.from('questionarios').delete().eq('id', q.id))) navegar('/questionarios');
  }

  return (
    <>
      <Cabecalho
        titulo={q.titulo}
        subtitulo={q.descricao || 'Monte as perguntas e depois abra o questionário para as UBS.'}
        acoes={
          <>
            <Link className="btn" to="/questionarios"><ArrowLeft size={16} strokeWidth={1.8} /> Voltar</Link>
            <Link className="btn" to={`/questionarios/${q.id}/resultados`}>Resultados</Link>
          </>
        }
      />
      <Erro mensagem={(!editando && !cabecalho && erro) || erroQ} />

      <Painel titulo="Situação" acoes={<span className={`chip ${CLASSE_STATUS[q.status]}`}>{NOME_STATUS[q.status]}</span>}>
        <div className="actions">
          {q.status !== 'aberto' && <button className="btn primary" onClick={() => mudarStatus('aberto')}>Abrir para respostas</button>}
          {q.status === 'aberto' && <button className="btn" onClick={() => mudarStatus('encerrado')}>Encerrar</button>}
          {q.status !== 'rascunho' && <button className="btn" onClick={() => mudarStatus('rascunho')}>Voltar a rascunho</button>}
          <button className="btn" onClick={() => setCabecalho({ titulo: q.titulo, descricao: q.descricao ?? '' })}>Editar título</button>
          <button className="btn danger" onClick={removerQuestionario}>Remover questionário</button>
        </div>
        {totalRespostas > 0 && (
          <div className="alert" style={{ marginTop: 14 }}>
            Já existem {totalRespostas} resposta(s). Você pode adicionar perguntas, mas evite mudar o sentido ou o tipo das
            existentes — isso confunde a comparação entre UBS.
          </div>
        )}
      </Painel>

      <Painel titulo={`Perguntas (${perguntas.length})`} acoes={<button className="btn small primary" onClick={() => setEditando({ tipo: 'texto' })}><Plus size={16} strokeWidth={1.8} /> Adicionar pergunta</button>}>
        {perguntas.length === 0 && <p className="empty">Nenhuma pergunta ainda.</p>}
        {perguntas.map((p, i) => (
          <div className="pergunta" key={p.id}>
            <div className="row-flex">
              <div>
                <span className="num">{i + 1}.</span>
                <b>{p.enunciado}</b>
                {p.obrigatoria && <span className="muted"> · obrigatória</span>}
                <div className="muted" style={{ marginTop: 3 }}>
                  {NOME_TIPO_CAMPO[p.tipo]}
                  {p.opcoes.length > 0 && ` · ${p.opcoes.join(' / ')}`}
                  {p.ajuda && ` · ${p.ajuda}`}
                </div>
              </div>
              <div className="actions" style={{ flexShrink: 0 }}>
                <button className="btn small" disabled={i === 0} onClick={() => mover(i, -1)} title="Subir"><ChevronUp size={14} strokeWidth={2} /></button>
                <button className="btn small" disabled={i === perguntas.length - 1} onClick={() => mover(i, 1)} title="Descer"><ChevronDown size={14} strokeWidth={2} /></button>
                <button className="btn small" onClick={() => setEditando({ ...p, opcoesTexto: p.opcoes.join('\n') })}>Editar</button>
                <button className="btn small danger" onClick={() => confirm('Remover esta pergunta? Respostas já dadas a ela deixam de aparecer.') && executar(supabase.from('perguntas').delete().eq('id', p.id))}>
                  Remover
                </button>
              </div>
            </div>
          </div>
        ))}
      </Painel>

      {editando && (
        <Modal titulo={editando.id ? 'Editar pergunta' : 'Nova pergunta'} aoFechar={() => setEditando(null)}>
          <form onSubmit={salvarPergunta}>
            <Erro mensagem={erro} />
            <div className="form-grid cols-2">
              <Campo rotulo="Pergunta" className="full">
                <textarea required value={editando.enunciado ?? ''} onChange={e => setEditando({ ...editando, enunciado: e.target.value })} />
              </Campo>
              <Campo rotulo="Tipo de resposta">
                <select value={editando.tipo} onChange={e => setEditando({ ...editando, tipo: e.target.value as TipoCampo })}>
                  {(Object.keys(NOME_TIPO_CAMPO) as TipoCampo[]).map(t => <option key={t} value={t}>{NOME_TIPO_CAMPO[t]}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Resposta">
                <select value={editando.obrigatoria ? 'sim' : 'nao'} onChange={e => setEditando({ ...editando, obrigatoria: e.target.value === 'sim' })}>
                  <option value="nao">Opcional</option>
                  <option value="sim">Obrigatória</option>
                </select>
              </Campo>
              {editando.tipo && TIPO_TEM_OPCOES(editando.tipo) && (
                <Campo rotulo="Opções (uma por linha)" className="full">
                  <textarea required value={editando.opcoesTexto ?? ''} onChange={e => setEditando({ ...editando, opcoesTexto: e.target.value })} />
                </Campo>
              )}
              <Campo rotulo="Texto de ajuda (opcional)" className="full">
                <input value={editando.ajuda ?? ''} onChange={e => setEditando({ ...editando, ajuda: e.target.value })} />
              </Campo>
            </div>
            {editando.tipo && (
              <div className="callout" style={{ marginTop: 12 }}>
                <b>Prévia:</b>
                <CampoDinamico
                  id="previa"
                  tipo={editando.tipo}
                  opcoes={TIPO_TEM_OPCOES(editando.tipo) ? lerOpcoes(editando.opcoesTexto ?? '') : []}
                  valor={null}
                  aoMudar={() => undefined}
                />
              </div>
            )}
            <div className="actions">
              <button type="button" className="btn" onClick={() => setEditando(null)}>Cancelar</button>
              <button className="btn primary">Salvar</button>
            </div>
          </form>
        </Modal>
      )}

      {cabecalho && (
        <Modal titulo="Título e descrição" aoFechar={() => setCabecalho(null)}>
          <form
            onSubmit={async e => {
              e.preventDefault();
              if (await executar(supabase.from('questionarios').update({ titulo: cabecalho.titulo.trim(), descricao: cabecalho.descricao.trim() || null }).eq('id', q.id)))
                setCabecalho(null);
            }}
          >
            <Erro mensagem={erro} />
            <div className="form-grid cols-2">
              <Campo rotulo="Título" className="full"><input required value={cabecalho.titulo} onChange={e => setCabecalho({ ...cabecalho, titulo: e.target.value })} /></Campo>
              <Campo rotulo="Descrição / instruções" className="full"><textarea value={cabecalho.descricao} onChange={e => setCabecalho({ ...cabecalho, descricao: e.target.value })} /></Campo>
            </div>
            <div className="actions">
              <button type="button" className="btn" onClick={() => setCabecalho(null)}>Cancelar</button>
              <button className="btn primary">Salvar</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
