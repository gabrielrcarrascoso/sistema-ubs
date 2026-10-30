import { Fragment, useState, type FormEvent } from 'react';
import { ChevronRight, EyeOff, Pencil } from 'lucide-react';
import type { Equipe } from '../lib/types';
import { supabase, traduzErro } from '../lib/supabase';
import { nomeEquipe, periodoTexto, type ProducaoProfissional } from '../lib/producao';
import { numeroBR } from '../lib/util';
import { BotaoIcone, Campo, Erro, Modal } from './ui';

const SITUACOES = ['Pendente', 'Verificar escala e vínculo', 'Validado'];
const pendente = (v: string | null) => !v || /^pendente$/i.test(v.trim());

/** Carga horária em uma linha: "40 h/semana · seg–sex manhã · 20 min/consulta" (ou "Pendente") */
function resumoCarga(p: ProducaoProfissional) {
  const partes = [
    !pendente(p.horas_semana) && `${p.horas_semana}${/^\d+([.,]\d+)?$/.test(p.horas_semana!.trim()) ? ' h/semana' : ''}`,
    !pendente(p.dias_turnos) && p.dias_turnos,
    !pendente(p.tempo_consulta) && `${p.tempo_consulta}${/^\d+([.,]\d+)?$/.test(p.tempo_consulta!.trim()) ? ' min/consulta' : ''}`,
  ].filter(Boolean);
  return partes.length ? partes.join(' · ') : 'Pendente';
}

interface Edicao {
  id: string;
  horas_semana: string;
  dias_turnos: string;
  tempo_consulta: string;
  status_validacao: string;
}

/**
 * Lista de funcionários de uma ou mais UBS: cargos com quantidades + quem tem atendimento registrado no e-SUS.
 * O administrador geral (o único que vê os nomes) também preenche a carga horária de cada profissional.
 */
export function ModalProfissionais({
  unidades,
  equipes,
  profissionais,
  aoFechar,
  aoAbrirEquipe,
  aoAlterar,
}: {
  unidades: { id: string; nome: string }[];
  equipes: Pick<Equipe, 'unidade_id' | 'cargo' | 'quantidade'>[];
  profissionais: ProducaoProfissional[];
  aoFechar: () => void;
  aoAbrirEquipe?: (unidadeId: string) => void;
  /** chamado depois de salvar, para a tela buscar os dados de novo */
  aoAlterar?: () => void;
}) {
  const nomesVisiveis = profissionais.some(p => p.nome_visivel);
  const periodo = profissionais[0] ? periodoTexto(profissionais[0].inicio, profissionais[0].fim) : '';
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const semCarga = profissionais.filter(p => pendente(p.horas_semana)).length;

  function editar(p: ProducaoProfissional) {
    setErro(null);
    const limpo = (v: string | null) => (pendente(v) ? '' : v!);
    setEdicao({
      id: p.id,
      horas_semana: limpo(p.horas_semana),
      dias_turnos: limpo(p.dias_turnos),
      tempo_consulta: limpo(p.tempo_consulta),
      status_validacao: p.status_validacao ?? 'Pendente',
    });
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!edicao) return;
    setSalvando(true);
    setErro(null);
    const valor = (v: string) => v.trim() || 'Pendente';
    const { error } = await supabase
      .from('producao_profissionais')
      .update({
        horas_semana: valor(edicao.horas_semana),
        dias_turnos: valor(edicao.dias_turnos),
        tempo_consulta: valor(edicao.tempo_consulta),
        status_validacao: edicao.status_validacao,
      })
      .eq('id', edicao.id);
    setSalvando(false);
    if (error) return setErro(traduzErro(error));
    setEdicao(null);
    aoAlterar?.();
  }

  const campo = (k: keyof Omit<Edicao, 'id'>) => ({
    value: edicao?.[k] ?? '',
    onChange: (e: { target: { value: string } }) => edicao && setEdicao({ ...edicao, [k]: e.target.value }),
  });

  return (
    <Modal titulo={unidades.length === 1 ? `Profissionais · ${unidades[0].nome}` : 'Profissionais das UBS'} aoFechar={aoFechar}>
      {!nomesVisiveis && profissionais.length > 0 && (
        <div className="callout" style={{ marginBottom: 14 }}>
          <EyeOff size={13} strokeWidth={2} style={{ verticalAlign: '-2px' }} /> Os nomes e a carga horária aparecem só para o administrador geral.
        </div>
      )}
      {nomesVisiveis && semCarga > 0 && (
        <div className="alert" style={{ marginBottom: 14 }}>
          {semCarga} profissional(is) ainda sem carga horária. Clique no lápis para preencher horas por semana, dias/turnos e tempo por consulta.
        </div>
      )}
      <Erro mensagem={erro} />
      {unidades.map(u => {
        const cargos = equipes.filter(e => e.unidade_id === u.id);
        const pessoas = profissionais.filter(p => p.unidade_id === u.id);
        const variasEquipes = new Set(pessoas.map(p => p.equipe)).size > 1;
        const total = cargos.reduce((s, e) => s + (e.quantidade ?? 0), 0);
        const colunas = 4 + (variasEquipes ? 1 : 0) + (nomesVisiveis ? 2 : 0);
        return (
          <section key={u.id} className="lista-prof">
            <header className="lista-prof-topo">
              <h3>{u.nome}</h3>
              <span className="muted">{total} profissionais por cargo</span>
              {aoAbrirEquipe && (
                <button className="btn small ver-tudo" onClick={() => aoAbrirEquipe(u.id)}>
                  Equipe e atividades <ChevronRight size={14} strokeWidth={2} />
                </button>
              )}
            </header>
            <div className="lista-prof-cargos">
              {cargos.map(e => (
                <span key={e.cargo} className={`chip ${e.quantidade === null ? 'warn' : 'neutral'}`}>
                  {e.cargo}: <b>{e.quantidade ?? 'não informado'}</b>
                </span>
              ))}
              {!cargos.length && <span className="muted">Nenhum cargo cadastrado.</span>}
            </div>
            {pessoas.length > 0 && (
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Profissional</th>
                      <th>Categoria</th>
                      {variasEquipes && <th>Equipe</th>}
                      <th className="num">Registros ({periodo})</th>
                      {nomesVisiveis && <th>Carga horária</th>}
                      <th>Validação</th>
                      {nomesVisiveis && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pessoas.map(p => (
                      <Fragment key={p.id}>
                        <tr>
                          <td><b>{p.nome}</b></td>
                          <td>{p.categoria}</td>
                          {variasEquipes && <td>{nomeEquipe(p.equipe)}</td>}
                          <td className="num">{numeroBR(p.quantidade, 0)}</td>
                          {nomesVisiveis && <td className={pendente(p.horas_semana) ? 'muted' : ''}>{resumoCarga(p)}</td>}
                          <td>
                            <span className={`chip ${/^validad/i.test(p.status_validacao ?? '') ? '' : 'warn'}`}>{p.status_validacao ?? 'Pendente'}</span>
                          </td>
                          {nomesVisiveis && (
                            <td><BotaoIcone icone={Pencil} titulo="Preencher carga horária" aoClicar={() => editar(p)} /></td>
                          )}
                        </tr>
                        {edicao?.id === p.id && (
                          <tr className="linha-edicao">
                            <td colSpan={colunas}>
                              <form onSubmit={salvar}>
                                <div className="form-grid">
                                  <Campo rotulo="Horas por semana" dica="Ex.: 40"><input inputMode="decimal" autoFocus {...campo('horas_semana')} /></Campo>
                                  <Campo rotulo="Dias / turnos" dica="Ex.: seg–sex, manhã e tarde"><input {...campo('dias_turnos')} /></Campo>
                                  <Campo rotulo="Tempo por consulta (min)" dica="Ex.: 20"><input inputMode="decimal" {...campo('tempo_consulta')} /></Campo>
                                  <Campo rotulo="Validação">
                                    <select {...campo('status_validacao')}>
                                      {[...new Set([...SITUACOES, edicao.status_validacao])].map(s => <option key={s}>{s}</option>)}
                                    </select>
                                  </Campo>
                                </div>
                                <div className="actions" style={{ marginTop: 10 }}>
                                  <button type="button" className="btn small" onClick={() => setEdicao(null)}>Cancelar</button>
                                  <button className="btn small primary" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
                                </div>
                              </form>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
      <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
        A tabela traz médicos, enfermeiros e dentistas com atendimento registrado no e-SUS. Contagem de registros não mede produtividade.
        Campos em branco ficam como “Pendente”.
      </p>
      <div className="actions">
        <button className="btn" onClick={aoFechar}>Fechar</button>
      </div>
    </Modal>
  );
}
