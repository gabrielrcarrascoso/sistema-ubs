import { useState } from 'react';
import { CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { supabase, traduzErro } from '../../lib/supabase';
import { buscarUnidades, limparMemoria, ok, useConsulta } from '../../lib/hooks';
import { montarImportacao, type Importacao } from '../../lib/importarCelula3';
import { periodoTexto } from '../../lib/producao';
import { numeroBR } from '../../lib/util';
import { Campo, Carregando, Dica, Erro, Painel } from '../../components/ui';
import { useConfirmar } from '../../components/Confirmacao';

const pendente = (v: string | null | undefined) => !v || /^pendente$/i.test(v.trim());
const ultimoDiaDoMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  return `${mes}-${new Date(a, m, 0).getDate()}`;
};

/**
 * Importa a planilha da Célula 3 (.xlsx): registros do e-SUS por equipe, categoria e tipo,
 * profissionais e matriz de competências. Mostra uma prévia e só grava quando o gestor confirma.
 */
export function ImportarPlanilha() {
  const confirmar = useConfirmar();
  const unidadesQ = useConsulta(buscarUnidades, [], 'unidades');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [plano, setPlano] = useState<Importacao | null>(null);
  const [mesInicio, setMesInicio] = useState('');
  const [mesFim, setMesFim] = useState('');
  const [atualizarEquipe, setAtualizarEquipe] = useState(true);
  const [atualizarMatriz, setAtualizarMatriz] = useState(true);
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  if (unidadesQ.carregando) return <Carregando />;
  const unidades = unidadesQ.dados ?? [];

  async function escolher(f: File | undefined) {
    setErro(null);
    setResultado(null);
    setPlano(null);
    if (!f) return;
    setArquivo(f);
    setLendo(true);
    try {
      // a biblioteca de leitura só é baixada quando alguém importa (o site continua leve)
      const { default: lerExcel } = await import('read-excel-file/browser');
      const abas = await lerExcel(f);
      const p = montarImportacao(abas.map(a => ({ nome: a.sheet, linhas: a.data })), unidades);
      setPlano(p);
      setMesInicio(p.periodo?.inicio.slice(0, 7) ?? '');
      setMesFim(p.periodo?.fim.slice(0, 7) ?? '');
    } catch (e) {
      setErro(`Não consegui ler o arquivo. Ele precisa ser uma planilha .xlsx no modelo da Célula 3. (${traduzErro(e)})`);
    } finally {
      setLendo(false);
    }
  }

  async function importar() {
    if (!plano || !arquivo) return;
    if (!mesInicio || !mesFim || mesFim < mesInicio) return setErro('Informe o período (mês de início e de fim) dos dados.');
    const inicio = `${mesInicio}-01`;
    const fim = ultimoDiaDoMes(mesFim);
    const periodo = periodoTexto(inicio, fim);
    const ok1 = await confirmar(
      `Importar ${numeroBR(plano.producao.filter(p => p.dimensao === 'categoria').reduce((s, p) => s + p.quantidade, 0), 0)} registros de ${periodo} para ${plano.resumo.length} UBS? ` +
        'Se já houver dados deste mesmo período, eles serão atualizados.',
      { botao: 'Importar' },
    );
    if (!ok1) return;
    setErro(null);
    const fonte = `e-SUS APS: contagem de registros (${periodo}) · planilha ${arquivo.name}`;
    const ids = plano.resumo.map(r => r.unidadeId);
    try {
      // 1. registros por equipe (categoria e tipo de atendimento)
      setGravando('Gravando os registros do e-SUS…');
      ok(
        await supabase.from('producao').upsert(
          plano.producao.map(p => ({ unidade_id: p.unidadeId, equipe: p.equipe, dimensao: p.dimensao, item: p.item, quantidade: p.quantidade, inicio, fim, fonte })),
          { onConflict: 'unidade_id,equipe,dimensao,item,inicio' },
        ),
      );

      // 2. profissionais: a carga horária já preenchida no sistema não é apagada por um "Pendente" da planilha
      setGravando('Gravando os profissionais…');
      const existentes = ok<{ unidade_id: string; equipe: string; nome: string; horas_semana: string | null; dias_turnos: string | null; tempo_consulta: string | null; status_validacao: string | null }[]>(
        await supabase.from('producao_profissionais').select('unidade_id, equipe, nome, horas_semana, dias_turnos, tempo_consulta, status_validacao, updated_at').in('unidade_id', ids).order('updated_at', { ascending: false }),
      );
      const manter = (novo: string | null, antigo: string | null | undefined) => (pendente(novo) && !pendente(antigo) ? antigo! : novo ?? 'Pendente');
      ok(
        await supabase.from('producao_profissionais').upsert(
          plano.profissionais.map(p => {
            const antes = existentes.find(e => e.unidade_id === p.unidadeId && e.equipe === p.equipe && e.nome === p.nome);
            return {
              unidade_id: p.unidadeId, equipe: p.equipe, nome: p.nome, categoria: p.categoria, quantidade: p.quantidade, inicio, fim, fonte,
              horas_semana: manter(p.horas_semana, antes?.horas_semana),
              dias_turnos: manter(p.dias_turnos, antes?.dias_turnos),
              tempo_consulta: manter(p.tempo_consulta, antes?.tempo_consulta),
              status_validacao: /^validad/i.test(antes?.status_validacao ?? '') ? antes!.status_validacao : p.status_validacao ?? 'Pendente',
            };
          }),
          { onConflict: 'unidade_id,equipe,nome,inicio' },
        ),
      );

      // 3. quantidade de médicos, enfermeiros e dentistas = profissionais com registro no período
      if (atualizarEquipe && plano.profissionais.length) {
        setGravando('Atualizando a equipe de cada UBS…');
        const CARGO = { Médico: 'Médico(a)', Enfermeiro: 'Enfermeiro(a)', Dentista: 'Dentista' } as Record<string, string>;
        const linhas = ids.flatMap(uid =>
          Object.entries(CARGO)
            .map(([cat, cargo]) => ({
              unidade_id: uid,
              cargo,
              quantidade: new Set(plano.profissionais.filter(p => p.unidadeId === uid && p.categoria === cat).map(p => p.nome)).size,
            }))
            .filter(l => l.quantidade > 0),
        );
        if (linhas.length) ok(await supabase.from('equipes').upsert(linhas, { onConflict: 'unidade_id,cargo' }));
      }

      // 4. matriz de competências (vale para todas as UBS ativas)
      if (atualizarMatriz && plano.matriz.length) {
        setGravando('Atualizando a matriz de competências…');
        ok(
          await supabase.from('atividades').upsert(
            plano.matriz.map((m, i) => ({ nome: m.atividade, ordem: i + 1, observacao: m.observacao })),
            { onConflict: 'nome' },
          ),
        );
        const atividades = ok<{ id: string; nome: string }[]>(await supabase.from('atividades').select('id, nome'));
        const equipes = ok<{ id: string; cargo: string }[]>(await supabase.from('equipes').select('id, cargo').in('unidade_id', unidades.map(u => u.id)));
        const competencias = equipes.flatMap(e =>
          plano.matriz
            .filter(m => m.niveis[e.cargo])
            .map(m => ({ equipe_id: e.id, atividade_id: atividades.find(a => a.nome === m.atividade)!.id, nivel: m.niveis[e.cargo] })),
        );
        if (competencias.length) ok(await supabase.from('competencias').upsert(competencias, { onConflict: 'equipe_id,atividade_id' }));
      }

      limparMemoria(); // os painéis buscam tudo de novo
      setResultado(
        `Importado: ${plano.producao.length} totais de registros e ${plano.profissionais.length} profissionais de ${periodo}` +
          `${atualizarEquipe ? ', equipe atualizada' : ''}${atualizarMatriz && plano.matriz.length ? ` e matriz com ${plano.matriz.length} atividades` : ''}.`,
      );
      setPlano(null);
      setArquivo(null);
    } catch (e) {
      setErro(`A importação parou no meio (${gravando ?? ''}). O que já foi gravado continua salvo; corrija e importe de novo. Detalhe: ${traduzErro(e)}`);
    } finally {
      setGravando(null);
    }
  }

  return (
    <>
      <Dica id="importar-planilha">
        Envie a planilha da Célula 3 (.xlsx) com as abas <b>Painel</b>, <b>Tipos atendimento</b>, <b>Carga profissionais</b> e{' '}
        <b>Matriz competencias</b>. O sistema mostra o que vai mudar e só grava quando você confirmar. A aba de Restrições é ignorada.
        Importar de novo o mesmo período atualiza os números (não duplica).
      </Dica>
      <Erro mensagem={erro || unidadesQ.erro} />
      {resultado && (
        <div className="info" style={{ marginBottom: 16 }}>
          <CheckCircle2 size={16} strokeWidth={1.8} style={{ verticalAlign: '-3px' }} /> {resultado} Os painéis já mostram os dados novos.
        </div>
      )}

      <Painel titulo="1. Escolha a planilha">
        <label className="arquivo-planilha">
          <FileSpreadsheet size={28} strokeWidth={1.6} />
          <span>
            <b>{arquivo ? arquivo.name : 'Clique para escolher o arquivo .xlsx'}</b>
            <small className="muted">{lendo ? 'Lendo a planilha…' : 'Modelo Célula 3 (UBS · e-SUS)'}</small>
          </span>
          <input type="file" accept=".xlsx" onChange={e => escolher(e.target.files?.[0])} />
        </label>
      </Painel>

      {plano && (
        <Painel titulo="2. Confira antes de importar">
          {plano.erros.map(e => <div key={e} className="error" style={{ marginBottom: 8 }}>{e}</div>)}
          {plano.avisos.map(a => <div key={a} className="alert" style={{ marginBottom: 8 }}>{a}</div>)}
          <p className="muted" style={{ marginBottom: 12 }}>
            Abas lidas: {plano.abasLidas.join(', ') || 'nenhuma'}
            {plano.abasIgnoradas.length > 0 && <> · ignoradas: {plano.abasIgnoradas.join(', ')}</>}
          </p>

          <div className="form-grid cols-2" style={{ marginBottom: 14 }}>
            <Campo rotulo="Período dos dados: de"><input type="month" value={mesInicio} onChange={e => setMesInicio(e.target.value)} /></Campo>
            <Campo rotulo="até"><input type="month" value={mesFim} onChange={e => setMesFim(e.target.value)} /></Campo>
          </div>

          {plano.resumo.length > 0 ? (
            <div className="tablewrap" style={{ marginBottom: 14 }}>
              <table>
                <thead>
                  <tr><th>UBS</th><th>Equipes</th><th className="num">Registros</th><th className="num">Profissionais</th></tr>
                </thead>
                <tbody>
                  {plano.resumo.map(r => (
                    <tr key={r.unidadeId}>
                      <td><b>{r.nome}</b></td>
                      <td>{r.equipes.join(', ')}</td>
                      <td className="num">{numeroBR(r.registros, 0)}</td>
                      <td className="num">{r.profissionais}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="error" style={{ marginBottom: 14 }}>Nenhuma linha da planilha corresponde a uma UBS do sistema.</div>
          )}

          <div className="opcoes-importar">
            <label><input type="checkbox" checked={atualizarEquipe} onChange={e => setAtualizarEquipe(e.target.checked)} /> Atualizar a quantidade de médicos, enfermeiros e dentistas de cada UBS pela lista de profissionais</label>
            <label><input type="checkbox" checked={atualizarMatriz} onChange={e => setAtualizarMatriz(e.target.checked)} disabled={!plano.matriz.length} /> Atualizar a matriz de competências ({plano.matriz.length} atividades; vale para todas as UBS)</label>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '10px 0 0' }}>
            A carga horária que já foi preenchida no sistema é mantida quando a planilha diz “Pendente”.
          </p>

          <div className="actions" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => { setPlano(null); setArquivo(null); }}>Cancelar</button>
            <button className="btn primary" onClick={importar} disabled={!!gravando || !plano.resumo.length}>
              <Upload size={16} strokeWidth={1.8} /> {gravando ?? 'Importar'}
            </button>
          </div>
        </Painel>
      )}
    </>
  );
}
