import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { supabase, traduzErro } from '../lib/supabase';
import { buscarUnidades, ok, useConsulta, useUnidadeEscolhida } from '../lib/hooks';
import type { Coleta as ColetaT } from '../lib/types';
import { baixarCSV, dataBR, numeroBR, numOuNull } from '../lib/util';
import { Cabecalho, Campo, Carregando, Cartao, Erro, Painel, SeletorUnidade } from '../components/ui';

type Formulario = Partial<ColetaT>;

/** Cálculo indicativo de capacidade (mesma lógica do protótipo) */
export function calcularCapacidade(c: Formulario) {
  const demanda = c.demanda_semanal ?? 0;
  const duracao = c.duracao_media_min ?? 0;
  const profissionais = c.profissionais_habilitados ?? 0;
  const horas = c.horas_semana_profissional ?? 0;
  if (!(demanda > 0 && duracao > 0 && profissionais > 0 && horas > 0)) return null;
  const necessaria = (demanda * duracao) / 60;
  const capacidade = profissionais * horas;
  return { necessaria, capacidade, ocupacao: (necessaria / capacidade) * 100, folga: capacidade - necessaria };
}

export function Coleta() {
  const { perfil, podeEditar } = useAuth();
  const unidadesQ = useConsulta(buscarUnidades, []);
  const [unidadeId, setUnidadeId] = useUnidadeEscolhida(unidadesQ.dados, perfil?.unidade_id);
  const [form, setForm] = useState<Formulario>({ responsavel: perfil?.nome ?? '' });
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const coletasQ = useConsulta(
    async () =>
      unidadeId
        ? ok<ColetaT[]>(
            await supabase.from('coletas').select('*').eq('unidade_id', unidadeId).order('data_visita', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }),
          )
        : [],
    [unidadeId],
  );

  if (unidadesQ.carregando) return <Carregando />;
  const unidades = unidadesQ.dados ?? [];
  const unidade = unidades.find(u => u.id === unidadeId);
  const editavel = podeEditar(unidadeId);
  const calculo = calcularCapacidade(form);

  const texto = (campo: keyof Formulario) => ({
    value: (form[campo] as string | null) ?? '',
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [campo]: e.target.value }),
  });
  const numero = (campo: keyof Formulario) => ({
    type: 'number',
    min: 0,
    step: 'any',
    value: (form[campo] as number | null) ?? '',
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [campo]: numOuNull(e.target.value) }),
  });

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    setSalvando(true);
    const registro = {
      unidade_id: unidadeId,
      responsavel: form.responsavel || null,
      data_visita: form.data_visita || null,
      total_confirmado: form.total_confirmado ?? null,
      escalas_disponiveis: form.escalas_disponiveis || null,
      atividade: form.atividade || null,
      demanda_semanal: form.demanda_semanal ?? null,
      duracao_media_min: form.duracao_media_min ?? null,
      profissionais_habilitados: form.profissionais_habilitados ?? null,
      horas_semana_profissional: form.horas_semana_profissional ?? null,
      fonte: form.fonte || null,
      observacao: form.observacao || null,
    };
    const { error } = form.id
      ? await supabase.from('coletas').update(registro).eq('id', form.id)
      : await supabase.from('coletas').insert(registro);
    setSalvando(false);
    if (error) return setErro(traduzErro(error));
    setAviso(form.id ? 'Coleta atualizada.' : 'Coleta registrada no banco de dados.');
    setForm({ responsavel: perfil?.nome ?? '' });
    coletasQ.recarregar();
  }

  async function remover(c: ColetaT) {
    if (!confirm('Remover este registro de coleta?')) return;
    const { error } = await supabase.from('coletas').delete().eq('id', c.id);
    if (error) return setErro(traduzErro(error));
    coletasQ.recarregar();
  }

  async function exportarTudo() {
    const { data, error } = await supabase.from('coletas').select('*, unidades(nome)').order('data_visita');
    if (error) return setErro(traduzErro(error));
    const linhas = [
      ['UBS', 'Responsável', 'Data', 'Total confirmado', 'Escalas', 'Atividade', 'Demanda semanal', 'Duração média (min)',
        'Profissionais habilitados', 'Horas efetivas/semana', 'Carga necessária (h)', 'Capacidade (h)', 'Ocupação (%)', 'Fonte', 'Observações'],
      ...(data as (ColetaT & { unidades: { nome: string } | null })[]).map(c => {
        const k = calcularCapacidade(c);
        return [c.unidades?.nome, c.responsavel, dataBR(c.data_visita), c.total_confirmado, c.escalas_disponiveis, c.atividade,
          c.demanda_semanal, c.duracao_media_min, c.profissionais_habilitados, c.horas_semana_profissional,
          k ? numeroBR(k.necessaria) : '', k ? numeroBR(k.capacidade) : '', k ? numeroBR(k.ocupacao) : '', c.fonte, c.observacao];
      }),
    ];
    baixarCSV(linhas, 'coletas_ubs.csv');
  }

  return (
    <>
      <Cabecalho
        titulo="Coleta e capacidade"
        subtitulo="Registre dados de campo e visualize estimativas simples de carga."
        acoes={<button className="btn" onClick={exportarTudo}>↓ Exportar coletas (CSV)</button>}
      />
      <Erro mensagem={erro || unidadesQ.erro || coletasQ.erro} />
      {aviso && <div className="info" style={{ marginBottom: 14 }}>{aviso}</div>}

      <Painel titulo="Unidade">
        <div className="selectrow">
          <SeletorUnidade unidades={unidades} valor={unidadeId} aoMudar={id => { setUnidadeId(id); setForm({ responsavel: perfil?.nome ?? '' }); }} />
          <span className="chip">Salvo no banco · sincronizado</span>
        </div>
        <p className="muted" style={{ marginTop: 10 }}>
          Cada visita fica guardada no histórico abaixo. <b>Não insira dados de pacientes.</b>
        </p>
      </Painel>

      {editavel ? (
        <Painel titulo={`${form.id ? 'Editar ficha' : 'Nova ficha'} — ${unidade?.nome ?? ''}`}>
          <form onSubmit={salvar}>
            <div className="form-grid">
              <Campo rotulo="Responsável pela coleta"><input {...texto('responsavel')} /></Campo>
              <Campo rotulo="Data da visita"><input type="date" {...texto('data_visita')} /></Campo>
              <Campo rotulo="Total confirmado de profissionais"><input {...numero('total_confirmado')} /></Campo>
              <Campo rotulo="Escalas individuais disponíveis?">
                <select {...texto('escalas_disponiveis')}>
                  <option value="">Selecione</option>
                  <option>Sim</option>
                  <option>Não</option>
                  <option>Parcial</option>
                </select>
              </Campo>
              <Campo rotulo="Atividade analisada"><input {...texto('atividade')} /></Campo>
              <Campo rotulo="Atendimentos/semana da atividade"><input {...numero('demanda_semanal')} /></Campo>
              <Campo rotulo="Minutos médios por atendimento"><input {...numero('duracao_media_min')} /></Campo>
              <Campo rotulo="Profissionais habilitados e disponíveis"><input {...numero('profissionais_habilitados')} /></Campo>
              <Campo rotulo="Horas efetivas/semana por profissional"><input {...numero('horas_semana_profissional')} /></Campo>
              <Campo rotulo="Fonte / evidência dos dados" className="wide"><input {...texto('fonte')} /></Campo>
              <Campo rotulo="Observações e restrições adicionais" className="full">
                <textarea placeholder="Anote informações verificadas e pendências…" {...texto('observacao')} />
              </Campo>
            </div>
            <div className="actions" style={{ marginTop: 15 }}>
              <button className="btn primary" disabled={salvando}>{salvando ? 'Salvando…' : form.id ? 'Salvar alterações' : 'Registrar coleta'}</button>
              {form.id && <button type="button" className="btn" onClick={() => setForm({ responsavel: perfil?.nome ?? '' })}>Cancelar edição</button>}
            </div>
          </form>
        </Painel>
      ) : (
        <div className="callout" style={{ marginBottom: 20 }}>
          Você pode consultar as coletas desta unidade, mas apenas o administrador geral ou o administrador desta UBS podem registrar novas.
        </div>
      )}

      {editavel && (
        <Painel titulo="Prévia de capacidade por atividade">
          {calculo ? (
            <>
              <div className="cards">
                <Cartao titulo="Carga necessária" valor={`${numeroBR(calculo.necessaria)}h`} nota="Demanda × minutos ÷ 60" />
                <Cartao titulo="Capacidade estimada" valor={`${numeroBR(calculo.capacidade)}h`} nota="Profissionais × horas efetivas" />
                <Cartao titulo="Ocupação estimada" valor={`${numeroBR(calculo.ocupacao)}%`} nota="Somente para a atividade preenchida" />
                <Cartao titulo="Diferença" valor={`${numeroBR(calculo.folga)}h`} nota="Capacidade menos demanda" />
              </div>
              <div className={calculo.necessaria > calculo.capacidade ? 'alert' : 'info'}>
                {calculo.necessaria > calculo.capacidade && <b>Demanda acima da capacidade estimada. </b>}
                Cálculo indicativo: não é otimização, não resolve conflitos entre atividades e não valida automaticamente
                competências ou horários.
              </div>
            </>
          ) : (
            <div className="callout">
              Preencha demanda, tempo médio, número de profissionais habilitados/disponíveis e horas efetivas para estimar a
              capacidade. Campos vazios não são tratados como zero.
            </div>
          )}
        </Painel>
      )}

      <Painel titulo="Histórico de coletas da unidade">
        {coletasQ.carregando ? (
          <Carregando />
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Responsável</th>
                  <th>Atividade</th>
                  <th className="num">Demanda/sem.</th>
                  <th className="num">Carga (h)</th>
                  <th className="num">Capacidade (h)</th>
                  <th className="num">Ocupação</th>
                  <th>Fonte</th>
                  {editavel && <th></th>}
                </tr>
              </thead>
              <tbody>
                {coletasQ.dados?.map(c => {
                  const k = calcularCapacidade(c);
                  return (
                    <tr key={c.id}>
                      <td>{dataBR(c.data_visita)}</td>
                      <td>{c.responsavel}</td>
                      <td>{c.atividade}</td>
                      <td className="num">{numeroBR(c.demanda_semanal)}</td>
                      <td className="num">{k ? numeroBR(k.necessaria) : '—'}</td>
                      <td className="num">{k ? numeroBR(k.capacidade) : '—'}</td>
                      <td className="num">
                        {k ? <span className={`chip ${k.ocupacao > 100 ? 'bad' : k.ocupacao > 85 ? 'warn' : ''}`}>{numeroBR(k.ocupacao)}%</span> : '—'}
                      </td>
                      <td>{c.fonte}</td>
                      {editavel && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn small" onClick={() => { setForm(c); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Editar</button>{' '}
                          <button className="btn small danger" onClick={() => remover(c)}>Remover</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {coletasQ.dados?.length === 0 && (
                  <tr><td colSpan={9} className="empty">Nenhuma coleta registrada para esta unidade.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Painel>

      <Painel titulo="Como interpretar o cálculo">
        <div className="info">
          Este módulo estima a carga de uma única atividade. Um modelo matemático completo de designação depende de escalas
          por profissional, demanda por atividade, prioridades, espaços e restrições de competência.
        </div>
      </Painel>
    </>
  );
}
