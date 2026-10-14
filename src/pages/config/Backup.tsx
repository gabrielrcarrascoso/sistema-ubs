import { useState } from 'react';
import { supabase, traduzErro } from '../../lib/supabase';
import { baixarArquivo } from '../../lib/util';
import { BarraAba, Dica, Erro, Painel } from '../../components/ui';

// Tabelas incluídas no backup (todas as do sistema)
const TABELAS = [
  'unidades', 'campos_ficha', 'atividades', 'equipes', 'competencias', 'restricoes', 'pendencias', 'coletas',
  'indicadores', 'lancamentos', 'questionarios', 'perguntas', 'aplicacoes', 'perfis', 'auditoria',
] as const;

/** Busca TODAS as linhas de uma tabela, de 1000 em 1000 (limite do Supabase por consulta) */
async function buscarTudo(tabela: string): Promise<unknown[]> {
  const linhas: unknown[] = [];
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await supabase.from(tabela).select('*').range(inicio, inicio + 999);
    if (error) throw error;
    linhas.push(...(data ?? []));
    if (!data || data.length < 1000) return linhas;
  }
}

export function Backup() {
  const [progresso, setProgresso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resumo, setResumo] = useState<[string, number][] | null>(null);

  async function gerar() {
    setErro(null);
    setResumo(null);
    try {
      const dados: Record<string, unknown[]> = {};
      for (const t of TABELAS) {
        setProgresso(`Copiando ${t}…`);
        dados[t] = await buscarTudo(t);
      }
      const agora = new Date();
      const nome = `backup_sistema_ubs_${agora.toISOString().slice(0, 10)}.json`;
      baixarArquivo(JSON.stringify({ gerado_em: agora.toISOString(), versao: 1, tabelas: dados }, null, 2), nome, 'application/json');
      setResumo(TABELAS.map(t => [t, dados[t].length]));
    } catch (e) {
      setErro(traduzErro(e));
    } finally {
      setProgresso(null);
    }
  }

  return (
    <>
      <Dica id="config-backup">
        O plano gratuito do Supabase <b>não guarda cópias de segurança</b>. Clique no botão abaixo pelo menos <b>uma vez por mês</b>
        e guarde o arquivo baixado no Google Drive ou num pen drive. Se algo der errado no banco, os dados podem ser
        recuperados a partir dele.
      </Dica>
      <BarraAba texto="Cópia completa de todos os dados do sistema em um único arquivo (.json)." />
      <Erro mensagem={erro} />
      <Painel titulo="Backup completo">
        <button className="btn primary" onClick={gerar} disabled={!!progresso}>
          {progresso ?? '⬇ Baixar backup agora'}
        </button>
        {resumo && (
          <div className="info" style={{ marginTop: 16 }}>
            Backup baixado com sucesso: {resumo.map(([t, n]) => `${t} (${n})`).join(' · ')}.
          </div>
        )}
        <p className="muted" style={{ marginTop: 14 }}>
          O arquivo contém dados de equipe e e-mails dos usuários do sistema (sem senhas). Guarde-o em local seguro e não
          compartilhe publicamente.
        </p>
      </Painel>
    </>
  );
}
