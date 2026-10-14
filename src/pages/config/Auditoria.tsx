import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ok, useConsulta } from '../../lib/hooks';
import type { RegistroAuditoria } from '../../lib/types';
import { dataHoraBR } from '../../lib/util';
import { BarraAba, Dica, Carregando, Erro, Modal, Painel } from '../../components/ui';

const NOME_TABELA: Record<string, string> = {
  unidades: 'Unidades', perfis: 'Usuários', atividades: 'Atividades', equipes: 'Equipes', competencias: 'Matriz',
  restricoes: 'Restrições', pendencias: 'Pendências', coletas: 'Coletas', indicadores: 'Dicionário', lancamentos: 'Lançamentos',
};
const NOME_ACAO = { INSERT: 'Criou', UPDATE: 'Alterou', DELETE: 'Removeu' } as const;
const IGNORAR = new Set(['updated_at', 'created_at']);

/** Lista só os campos que mudaram entre antes e depois */
function diferencas(r: RegistroAuditoria) {
  const chaves = new Set([...Object.keys(r.dados_antes ?? {}), ...Object.keys(r.dados_depois ?? {})]);
  return [...chaves]
    .filter(k => !IGNORAR.has(k) && JSON.stringify(r.dados_antes?.[k]) !== JSON.stringify(r.dados_depois?.[k]))
    .map(k => ({ campo: k, antes: r.dados_antes?.[k], depois: r.dados_depois?.[k] }));
}
const mostrar = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export function Auditoria() {
  const [tabela, setTabela] = useState('');
  const [limite, setLimite] = useState(100);
  const [detalhe, setDetalhe] = useState<RegistroAuditoria | null>(null);

  const { dados, carregando, erro } = useConsulta(async () => {
    let q = supabase.from('auditoria').select('*').order('created_at', { ascending: false }).limit(limite);
    if (tabela) q = q.eq('tabela', tabela);
    return ok<RegistroAuditoria[]>(await q);
  }, [tabela, limite]);

  return (
    <>
      <Dica id="config-historico">
        Tudo o que é criado, alterado ou removido no sistema fica registrado aqui: <b>quem</b>, <b>quando</b> e <b>o que mudou</b>. Clique em <b>Detalhes</b> para ver o valor antes e depois.
      </Dica>
      <BarraAba texto="Rastreabilidade: quem alterou o quê, quando e qual era o valor anterior." />
      <Erro mensagem={erro} />

      <Painel titulo="Filtros">
        <div className="selectrow">
          <select value={tabela} onChange={e => setTabela(e.target.value)} aria-label="Área">
            <option value="">Todas as áreas</option>
            {Object.entries(NOME_TABELA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={limite} onChange={e => setLimite(Number(e.target.value))} aria-label="Quantidade">
            <option value={100}>Últimos 100</option>
            <option value={500}>Últimos 500</option>
          </select>
        </div>
      </Painel>

      <Painel titulo="Histórico de alterações">
        {carregando ? (
          <Carregando />
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Área</th><th>Campos alterados</th><th></th></tr>
              </thead>
              <tbody>
                {dados?.map(r => {
                  const dif = diferencas(r);
                  return (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{dataHoraBR(r.created_at)}</td>
                      <td>{r.usuario_email ?? <span className="muted">sistema / carga inicial</span>}</td>
                      <td><span className={`chip ${r.acao === 'DELETE' ? 'bad' : r.acao === 'INSERT' ? '' : 'neutral'}`}>{NOME_ACAO[r.acao]}</span></td>
                      <td>{NOME_TABELA[r.tabela] ?? r.tabela}</td>
                      <td className="muted">{dif.slice(0, 4).map(d => d.campo).join(', ')}{dif.length > 4 ? '…' : ''}</td>
                      <td><button className="btn small" onClick={() => setDetalhe(r)}>Detalhes</button></td>
                    </tr>
                  );
                })}
                {dados?.length === 0 && <tr><td colSpan={6} className="empty">Nenhum registro.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Painel>

      {detalhe && (
        <Modal titulo={`${NOME_ACAO[detalhe.acao]} · ${NOME_TABELA[detalhe.tabela] ?? detalhe.tabela}`} aoFechar={() => setDetalhe(null)}>
          <p className="muted">{dataHoraBR(detalhe.created_at)} · {detalhe.usuario_email ?? 'sistema'}</p>
          <div className="tablewrap" style={{ marginTop: 12 }}>
            <table>
              <thead><tr><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead>
              <tbody>
                {diferencas(detalhe).map(d => (
                  <tr key={d.campo}><td><b>{d.campo}</b></td><td>{mostrar(d.antes)}</td><td>{mostrar(d.depois)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="actions"><button className="btn" onClick={() => setDetalhe(null)}>Fechar</button></div>
        </Modal>
      )}
    </>
  );
}
