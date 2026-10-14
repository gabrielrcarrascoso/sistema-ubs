import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase, traduzErro } from '../lib/supabase';
import { buscarUnidades, ok, useConsulta } from '../lib/hooks';
import type { Aplicacao, Pergunta, Questionario, ValorCampo } from '../lib/types';
import { CampoDinamico, vazio } from '../components/CampoDinamico';
import { Cabecalho, Campo, Carregando, Erro, Painel } from '../components/ui';

const hoje = () => new Date().toISOString().slice(0, 10);

// Aplicação do questionário em uma UBS (nova resposta ou edição de uma existente)
export function QuestionarioResponder() {
  const { id = '' } = useParams();
  const [busca] = useSearchParams();
  const aplicacaoId = busca.get('aplicacao');
  const navegar = useNavigate();
  const { perfil, podeEditar } = useAuth();

  const [unidadeId, setUnidadeId] = useState('');
  const [data, setData] = useState(hoje());
  const [respondente, setRespondente] = useState('');
  const [observacao, setObservacao] = useState('');
  const [respostas, setRespostas] = useState<Record<string, ValorCampo>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [destacar, setDestacar] = useState<Set<string>>(new Set());

  const { dados, carregando, erro: erroQ } = useConsulta(async () => {
    const [questionario, perguntas, unidades, aplicacao] = await Promise.all([
      supabase.from('questionarios').select('*').eq('id', id).single().then(ok<Questionario>),
      supabase.from('perguntas').select('*').eq('questionario_id', id).order('ordem').then(ok<Pergunta[]>),
      buscarUnidades(),
      aplicacaoId ? supabase.from('aplicacoes').select('*').eq('id', aplicacaoId).single().then(ok<Aplicacao>) : Promise.resolve(null),
    ]);
    return { questionario, perguntas, unidades, aplicacao };
  }, [id, aplicacaoId]);

  // Preenche o formulário quando os dados chegam
  useEffect(() => {
    if (!dados) return;
    const editaveis = dados.unidades.filter(u => podeEditar(u.id));
    if (dados.aplicacao) {
      setUnidadeId(dados.aplicacao.unidade_id);
      setData(dados.aplicacao.data_aplicacao);
      setRespondente(dados.aplicacao.respondente ?? '');
      setObservacao(dados.aplicacao.observacao ?? '');
      setRespostas(dados.aplicacao.respostas ?? {});
    } else {
      const propria = editaveis.find(u => u.id === perfil?.unidade_id);
      setUnidadeId((propria ?? editaveis[0])?.id ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados]);

  if (carregando) return <Carregando />;
  if (!dados) return <Erro mensagem={erroQ} />;
  const { questionario: q, perguntas, unidades } = dados;
  const editaveis = unidades.filter(u => podeEditar(u.id));
  const respondidas = perguntas.filter(p => !vazio(respostas[p.id])).length;

  if (q.status !== 'aberto') {
    return (
      <>
        <Cabecalho titulo={q.titulo} subtitulo="Este questionário não está aberto para respostas." acoes={<Link className="btn" to="/questionarios"><ArrowLeft size={16} strokeWidth={1.8} /> Voltar</Link>} />
        <div className="alert">Só é possível responder ou alterar respostas enquanto o questionário estiver aberto.</div>
      </>
    );
  }
  if (editaveis.length === 0) {
    return <div className="alert">Somente o administrador geral ou o administrador de uma UBS podem responder questionários.</div>;
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const faltando = perguntas.filter(p => p.obrigatoria && vazio(respostas[p.id]));
    setDestacar(new Set(faltando.map(p => p.id)));
    if (faltando.length) {
      // leva a pessoa direto até a primeira pergunta que falta
      document.getElementById(`pergunta-${faltando[0].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return setErro(`Faltam ${faltando.length} pergunta(s) obrigatória(s), destacadas em vermelho.`);
    }
    // guarda só as respostas das perguntas que existem
    const limpas = Object.fromEntries(perguntas.filter(p => !vazio(respostas[p.id])).map(p => [p.id, respostas[p.id]]));
    const registro = {
      questionario_id: q.id,
      unidade_id: unidadeId,
      data_aplicacao: data,
      respondente: respondente.trim() || null,
      observacao: observacao.trim() || null,
      respostas: limpas,
    };
    setSalvando(true);
    const { error } = aplicacaoId
      ? await supabase.from('aplicacoes').update(registro).eq('id', aplicacaoId)
      : await supabase.from('aplicacoes').insert(registro);
    setSalvando(false);
    if (error) return setErro(traduzErro(error));
    navegar(`/questionarios/${q.id}/resultados`);
  }

  return (
    <>
      <Cabecalho
        titulo={q.titulo}
        subtitulo={q.descricao || 'Preencha as respostas desta UBS.'}
        acoes={<Link className="btn" to="/questionarios"><ArrowLeft size={16} strokeWidth={1.8} /> Voltar</Link>}
      />

      <form onSubmit={salvar}>
        <div className="progresso-fixo">
          <span>{respondidas} de {perguntas.length} respondidas</span>
          <div className="progresso"><div style={{ width: `${perguntas.length ? (respondidas / perguntas.length) * 100 : 0}%` }} /></div>
        </div>

        <Painel titulo={aplicacaoId ? 'Corrigindo a resposta' : 'Sobre esta resposta'}>
          <div className="form-grid">
            <Campo rotulo="UBS" className="wide">
              <select required value={unidadeId} onChange={e => setUnidadeId(e.target.value)} disabled={!!aplicacaoId}>
                {editaveis.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Data da aplicação">
              <input type="date" required value={data} onChange={e => setData(e.target.value)} />
            </Campo>
            <Campo rotulo="Quem respondeu (cargo/função)" dica="Ex.: Enfermeira coordenadora">
              <input value={respondente} onChange={e => setRespondente(e.target.value)} />
            </Campo>
          </div>
          <p className="muted" style={{ marginTop: 10 }}><b>Não registre dados de pacientes.</b></p>
        </Painel>

        <Painel titulo="Perguntas">
          {perguntas.map((p, i) => (
            <div className={`pergunta ${destacar.has(p.id) && vazio(respostas[p.id]) ? 'faltando' : ''}`} key={p.id} id={`pergunta-${p.id}`}>
              <label className="field">
                <span className="label" style={{ fontSize: 14, color: 'var(--text)' }}>
                  <span className="num">{i + 1}.</span>
                  {p.enunciado}
                  {p.obrigatoria && <span style={{ color: 'var(--danger)' }}> *</span>}
                </span>
                {p.ajuda && <span className="hint" style={{ marginBottom: 6 }}>{p.ajuda}</span>}
                <CampoDinamico
                  id={`p-${p.id}`}
                  tipo={p.tipo}
                  opcoes={p.opcoes}
                  valor={respostas[p.id]}
                  aoMudar={v => setRespostas({ ...respostas, [p.id]: v })}
                />
              </label>
            </div>
          ))}
          <Campo rotulo="Observações gerais" className="full">
            <textarea value={observacao} onChange={e => setObservacao(e.target.value)} />
          </Campo>
        </Painel>

        <Erro mensagem={erro} />
        <div className="actions" style={{ marginBottom: 30 }}>
          <button className="btn primary" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar respostas'}</button>
          <Link className="btn" to="/questionarios">Cancelar</Link>
        </div>
      </form>
    </>
  );
}
