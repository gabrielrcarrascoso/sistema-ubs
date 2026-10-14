import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ok, useConsulta } from '../../lib/hooks';
import type { RegistroAuditoria } from '../../lib/types';
import { dataBR, dataHoraBR, mesAno, NOME_NIVEL, NOME_PAPEL } from '../../lib/util';
import { Dica, Carregando, Erro, Modal, Painel } from '../../components/ui';

const NOME_TABELA: Record<string, string> = {
  unidades: 'UBS', perfis: 'Usuários', atividades: 'Atividades da matriz', equipes: 'Equipes', competencias: 'Matriz',
  restricoes: 'Restrições', pendencias: 'Pendências', coletas: 'Visitas de campo', indicadores: 'Definições de indicadores',
  lancamentos: 'Números dos indicadores', campos_ficha: 'Campos da ficha', questionarios: 'Questionários',
  perguntas: 'Perguntas', aplicacoes: 'Respostas de questionários',
};

// Nomes amigáveis dos campos (o que não está aqui e é técnico fica escondido)
const ROTULO: Record<string, string> = {
  nome: 'Nome', email: 'E-mail', papel: 'Papel', ativo: 'Ativo', ativa: 'Ativa', unidade_id: 'UBS',
  horario: 'Horário', volume_estimado: 'Atendimentos (estimativa)', pico: 'Maior movimento',
  profissionais_declarados: 'Profissionais declarados', observacao: 'Observação', observacoes: 'Observações',
  cargo: 'Cargo', quantidade: 'Quantidade', disponibilidade: 'Disponibilidade', nivel: 'Nível na matriz',
  tipo: 'Tipo', descricao: 'Descrição', impacto: 'Impacto', status: 'Situação', validar: 'Validar em campo',
  prioridade: 'Prioridade', texto: 'Texto', motivo: 'Motivo', concluida: 'Concluída', escopo: 'Abrangência',
  responsavel: 'Responsável', data_visita: 'Data da visita', total_confirmado: 'Profissionais confirmados',
  escalas_disponiveis: 'Escalas individuais', atividade: 'Atividade', demanda_semanal: 'Atendimentos/semana',
  duracao_media_min: 'Minutos por atendimento', profissionais_habilitados: 'Profissionais na atividade',
  horas_semana_profissional: 'Horas/semana por profissional', fonte: 'Fonte',
  codigo: 'Código', definicao: 'Definição', unidade_medida: 'Unidade de medida', numerador_desc: 'O que é contado',
  denominador_desc: 'Total de referência', fator: 'Fator', fonte_dados: 'Fonte dos dados', periodicidade: 'Periodicidade',
  meta: 'Meta', sentido_meta: 'Interpretação da meta', versao: 'Versão da fórmula',
  competencia: 'Mês', numerador: 'Quantidade', denominador: 'Total',
  secao: 'Seção', opcoes: 'Opções', ajuda: 'Ajuda', obrigatorio: 'Obrigatório', obrigatoria: 'Obrigatória', ordem: 'Ordem',
  titulo: 'Título', enunciado: 'Pergunta', data_aplicacao: 'Data', respondente: 'Quem respondeu', respostas: 'Respostas',
  dados_ficha: 'Ficha',
};

type Nomes = Record<string, string>;
interface Apoio {
  pessoas: Nomes;
  ubs: Nomes;
  indicadores: Nomes;
  atividades: Nomes;
  cargos: Nomes; // equipe_id -> "Cargo (UBS)"
  campos: Nomes; // campo da ficha
}

const formatar = (campo: string, v: unknown, apoio: Apoio): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (campo === 'unidade_id') return apoio.ubs[String(v)] ?? 'UBS removida';
  if (campo === 'papel') return NOME_PAPEL[v as keyof typeof NOME_PAPEL] ?? String(v);
  if (campo === 'nivel') return NOME_NIVEL[v as keyof typeof NOME_NIVEL] ?? String(v);
  if (campo === 'competencia') return mesAno(String(v));
  if (campo === 'data_visita' || campo === 'data_aplicacao') return dataBR(String(v));
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return '(vários valores)';
  return String(v);
};

/** Campos que mudaram, com nomes amigáveis. A ficha da UBS é aberta campo a campo. */
function diferencas(r: RegistroAuditoria, apoio: Apoio) {
  const antes = r.dados_antes ?? {};
  const depois = r.dados_depois ?? {};
  const linhas: { campo: string; antes: string; depois: string }[] = [];
  for (const k of new Set([...Object.keys(antes), ...Object.keys(depois)])) {
    if (JSON.stringify(antes[k]) === JSON.stringify(depois[k])) continue;
    if (k === 'dados_ficha') {
      const a = (antes[k] ?? {}) as Record<string, unknown>;
      const d = (depois[k] ?? {}) as Record<string, unknown>;
      for (const c of new Set([...Object.keys(a), ...Object.keys(d)]))
        if (JSON.stringify(a[c]) !== JSON.stringify(d[c]))
          linhas.push({ campo: `Ficha: ${apoio.campos[c] ?? 'campo removido'}`, antes: formatar(c, a[c], apoio), depois: formatar(c, d[c], apoio) });
      continue;
    }
    if (!ROTULO[k]) continue; // campo técnico (ids, datas internas, versões)
    linhas.push({ campo: ROTULO[k], antes: formatar(k, antes[k], apoio), depois: formatar(k, depois[k], apoio) });
  }
  return linhas;
}

/** Frase que descreve o que aconteceu */
function descrever(r: RegistroAuditoria, apoio: Apoio): string {
  const d = (r.dados_depois ?? r.dados_antes ?? {}) as Record<string, string>;
  const ubs = apoio.ubs[d.unidade_id] ?? '';
  const verbo = { INSERT: 'criou', UPDATE: 'alterou', DELETE: 'removeu' }[r.acao];
  const curto = (t: string) => (t && t.length > 60 ? t.slice(0, 57) + '…' : t);
  switch (r.tabela) {
    case 'unidades':
      return r.acao === 'UPDATE' && JSON.stringify(r.dados_antes?.dados_ficha) !== JSON.stringify(r.dados_depois?.dados_ficha)
        ? `atualizou a ficha da UBS “${d.nome}”`
        : `${verbo} a UBS “${d.nome}”`;
    case 'perfis':
      return r.acao === 'INSERT' ? `cadastrou-se: ${d.nome || d.email}` : `${verbo} o acesso de ${d.nome || d.email}`;
    case 'atividades':
      return `${verbo} a atividade “${d.nome}”`;
    case 'equipes':
      return `${verbo} o cargo “${d.cargo}” · ${ubs}`;
    case 'competencias':
      return `mudou a matriz: ${apoio.cargos[d.equipe_id] ?? 'cargo'} × ${apoio.atividades[d.atividade_id] ?? 'atividade'} → ${NOME_NIVEL[d.nivel as keyof typeof NOME_NIVEL] ?? d.nivel}`;
    case 'restricoes':
      return `${verbo} a restrição “${d.tipo}” · ${ubs}`;
    case 'pendencias':
      return `${verbo} a pendência “${curto(d.texto)}”`;
    case 'coletas':
      return `${verbo} uma visita de campo · ${ubs}${d.data_visita ? ` · ${dataBR(d.data_visita)}` : ''}`;
    case 'indicadores':
      return `${verbo} a definição do indicador “${d.nome}”`;
    case 'lancamentos':
      return `${{ INSERT: 'lançou', UPDATE: 'corrigiu', DELETE: 'removeu' }[r.acao]} o número de “${apoio.indicadores[d.indicador_id] ?? 'indicador'}” · ${ubs} · ${d.competencia ? mesAno(d.competencia) : ''}`;
    case 'campos_ficha':
      return `${verbo} o campo da ficha “${d.nome}”`;
    case 'questionarios':
      return `${verbo} o questionário “${d.titulo}”`;
    case 'perguntas':
      return `${verbo} a pergunta “${curto(d.enunciado)}”`;
    case 'aplicacoes':
      return `${{ INSERT: 'respondeu', UPDATE: 'corrigiu', DELETE: 'removeu' }[r.acao]} um questionário · ${ubs}`;
    default:
      return `${verbo} um registro em ${NOME_TABELA[r.tabela] ?? r.tabela}`;
  }
}

const diaDe = (iso: string) => {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === hoje.toDateString()) return 'Hoje';
  if (d.toDateString() === ontem.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
};

export function Auditoria() {
  const [tabela, setTabela] = useState('');
  const [limite, setLimite] = useState(100);
  const [detalhe, setDetalhe] = useState<RegistroAuditoria | null>(null);

  const apoioQ = useConsulta(async () => {
    const mapa = <T extends { id: string }>(lista: T[], f: (x: T) => string) => Object.fromEntries(lista.map(x => [x.id, f(x)]));
    const [pessoas, ubs, indicadores, atividades, equipes, campos] = await Promise.all([
      supabase.from('perfis').select('id, nome, email').then(ok<{ id: string; nome: string; email: string }[]>),
      supabase.from('unidades').select('id, nome').then(ok<{ id: string; nome: string }[]>),
      supabase.from('indicadores').select('id, nome').then(ok<{ id: string; nome: string }[]>),
      supabase.from('atividades').select('id, nome').then(ok<{ id: string; nome: string }[]>),
      supabase.from('equipes').select('id, cargo, unidade_id').then(ok<{ id: string; cargo: string; unidade_id: string }[]>),
      supabase.from('campos_ficha').select('id, nome').then(ok<{ id: string; nome: string }[]>),
    ]);
    const nomesUBS = mapa(ubs, u => u.nome);
    return {
      pessoas: mapa(pessoas, p => p.nome || p.email),
      ubs: nomesUBS,
      indicadores: mapa(indicadores, i => i.nome),
      atividades: mapa(atividades, a => a.nome),
      cargos: mapa(equipes, e => `${e.cargo} (${nomesUBS[e.unidade_id] ?? 'UBS'})`),
      campos: mapa(campos, c => c.nome),
    } as Apoio;
  }, [], 'auditoria-apoio');

  const { dados, carregando, erro } = useConsulta(async () => {
    let q = supabase.from('auditoria').select('*').order('created_at', { ascending: false }).limit(limite);
    if (tabela) q = q.eq('tabela', tabela);
    return ok<RegistroAuditoria[]>(await q);
  }, [tabela, limite]);

  const apoio = apoioQ.dados;
  const quem = (r: RegistroAuditoria) =>
    (r.usuario_id && apoio?.pessoas[r.usuario_id]) || r.usuario_email || 'Sistema (carga inicial)';

  // agrupa por dia
  const grupos: [string, RegistroAuditoria[]][] = [];
  for (const r of dados ?? []) {
    const dia = diaDe(r.created_at);
    if (grupos.at(-1)?.[0] === dia) grupos.at(-1)![1].push(r);
    else grupos.push([dia, [r]]);
  }

  return (
    <>
      <Dica id="config-historico">
        Tudo o que é criado, alterado ou removido no sistema fica registrado aqui: <b>quem</b>, <b>quando</b> e <b>o que mudou</b>.
        Clique numa linha para ver o valor de antes e o de depois.
      </Dica>
      <Erro mensagem={erro || apoioQ.erro} />

      <div className="barra-filtros">
        <select value={tabela} onChange={e => setTabela(e.target.value)} aria-label="Área">
          <option value="">Todas as áreas</option>
          {Object.entries(NOME_TABELA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={limite} onChange={e => setLimite(Number(e.target.value))} aria-label="Quantidade">
          <option value={100}>Últimas 100 alterações</option>
          <option value={500}>Últimas 500 alterações</option>
        </select>
      </div>

      {carregando || !apoio ? (
        <Carregando />
      ) : (
        <Painel titulo="Histórico de alterações">
          {grupos.length === 0 && <p className="empty">Nenhum registro.</p>}
          {grupos.map(([dia, lista]) => (
            <div key={dia} className="historico-dia">
              <h3>{dia}</h3>
              {lista.map(r => (
                <button key={r.id} className="historico-item" onClick={() => setDetalhe(r)}>
                  <span className="historico-hora">{new Date(r.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className={`historico-ponto ${r.acao === 'DELETE' ? 'remocao' : r.acao === 'INSERT' ? 'criacao' : ''}`} />
                  <span className="historico-texto"><b>{quem(r)}</b> {descrever(r, apoio)}</span>
                </button>
              ))}
            </div>
          ))}
        </Painel>
      )}

      {detalhe && apoio && (
        <Modal titulo="Detalhes da alteração" aoFechar={() => setDetalhe(null)}>
          <p style={{ color: 'var(--text)' }}><b>{quem(detalhe)}</b> {descrever(detalhe, apoio)}</p>
          <p className="muted" style={{ marginTop: 4 }}>{dataHoraBR(detalhe.created_at)} · {NOME_TABELA[detalhe.tabela] ?? detalhe.tabela}</p>
          {diferencas(detalhe, apoio).length > 0 ? (
            <div className="tablewrap" style={{ marginTop: 14 }}>
              <table>
                <thead><tr><th>Informação</th><th>Antes</th><th>Depois</th></tr></thead>
                <tbody>
                  {diferencas(detalhe, apoio).map(d => (
                    <tr key={d.campo}><td><b>{d.campo}</b></td><td className="muted">{d.antes}</td><td>{d.depois}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted" style={{ marginTop: 14 }}>Sem detalhes adicionais.</p>
          )}
          <div className="actions"><button className="btn" onClick={() => setDetalhe(null)}>Fechar</button></div>
        </Modal>
      )}
    </>
  );
}
