import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { buscarUnidades, ok, useConsulta } from '../../lib/hooks';
import { buscarIndicadores, buscarLancamentos } from '../../lib/indicadores';
import type { Coleta, Equipe } from '../../lib/types';
import { mesAno, numeroBR, ultimosMeses, valorIndicador } from '../../lib/util';
import { Dica, Carregando, Cartao, Erro, Painel } from '../../components/ui';

interface Achado {
  gravidade: 'Alta' | 'Média' | 'Baixa';
  categoria: string;
  descricao: string;
  onde: string;
}

// Controle de qualidade: checagem automática de ausências, inconsistências e dados desatualizados
export function Qualidade() {
  const [qtdMeses, setQtdMeses] = useState(6);
  const { dados, carregando, erro } = useConsulta(async () => {
    const [indicadores, unidades, lancamentos, equipes, coletas] = await Promise.all([
      buscarIndicadores(true),
      buscarUnidades(),
      buscarLancamentos({ desde: ultimosMeses(25)[0] }),
      supabase.from('equipes').select('unidade_id, cargo, quantidade').then(ok<Pick<Equipe, 'unidade_id' | 'cargo' | 'quantidade'>[]>),
      supabase.from('coletas').select('unidade_id, data_visita, created_at').then(ok<Pick<Coleta, 'unidade_id' | 'data_visita' | 'created_at'>[]>),
    ]);
    return { indicadores, unidades, lancamentos, equipes, coletas };
  }, []);

  if (carregando) return <Carregando />;
  if (erro || !dados) return <Erro mensagem={erro} />;
  const { indicadores, unidades, lancamentos, equipes, coletas } = dados;

  // Meses fechados = até o mês passado (o mês atual ainda está acontecendo)
  const meses = ultimosMeses(qtdMeses + 1).slice(0, -1);
  const achados: Achado[] = [];
  const existe = new Set(lancamentos.map(l => `${l.indicador_id}|${l.unidade_id}|${l.competencia.slice(0, 7)}`));

  // 1. Ausências
  let esperados = 0;
  let presentes = 0;
  for (const i of indicadores)
    for (const u of unidades) {
      const faltando = meses.filter(m => {
        esperados++;
        const tem = existe.has(`${i.id}|${u.id}|${m.slice(0, 7)}`);
        if (tem) presentes++;
        return !tem;
      });
      if (faltando.length)
        achados.push({
          gravidade: faltando.length === meses.length ? 'Média' : 'Alta',
          categoria: 'Ausência de dados',
          descricao: `${i.codigo} sem lançamento em ${faltando.length} de ${meses.length} meses (${faltando.map(mesAno).join(', ')})`,
          onde: u.nome,
        });
    }

  for (const l of lancamentos) {
    // 2. Percentual acima de 100%
    if (l.tipo_aplicado === 'percentual' && l.valor !== null && l.valor > 100)
      achados.push({ gravidade: 'Alta', categoria: 'Inconsistência', descricao: `${l.codigo} em ${mesAno(l.competencia)} = ${valorIndicador(l.valor, '%')} (numerador maior que denominador)`, onde: l.unidade_nome });
    // 3. Fórmula desatualizada
    if (l.versao_formula < l.versao_atual)
      achados.push({ gravidade: 'Baixa', categoria: 'Versão da fórmula', descricao: `${l.codigo} em ${mesAno(l.competencia)} foi calculado com a fórmula v${l.versao_formula} (atual: v${l.versao_atual})`, onde: l.unidade_nome });
  }

  // 4. Variação brusca (> 50%) em relação ao mês anterior
  for (const l of lancamentos) {
    const d = new Date(l.competencia.slice(0, 10) + 'T12:00:00');
    d.setMonth(d.getMonth() - 1);
    const mesAnt = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const ant = lancamentos.find(x => x.indicador_id === l.indicador_id && x.unidade_id === l.unidade_id && x.competencia.startsWith(mesAnt));
    if (ant?.valor && l.valor !== null) {
      const variacao = ((l.valor - ant.valor) / ant.valor) * 100;
      if (Math.abs(variacao) > 50)
        achados.push({ gravidade: 'Média', categoria: 'Variação atípica', descricao: `${l.codigo} variou ${numeroBR(variacao)}% de ${mesAno(ant.competencia)} para ${mesAno(l.competencia)} — confirmar o dado`, onde: l.unidade_nome });
    }
  }

  // 5. Cadastro de equipes
  for (const u of unidades) {
    const eqs = equipes.filter(e => e.unidade_id === u.id);
    const semQtd = eqs.filter(e => e.quantidade === null);
    if (semQtd.length)
      achados.push({ gravidade: 'Média', categoria: 'Equipe incompleta', descricao: `${semQtd.length} cargo(s) sem quantidade: ${semQtd.map(e => e.cargo).join(', ')}`, onde: u.nome });
    const soma = eqs.reduce((s, e) => s + (e.quantidade ?? 0), 0);
    if (!semQtd.length && u.profissionais_declarados !== null && soma !== u.profissionais_declarados)
      achados.push({ gravidade: 'Média', categoria: 'Divergência de equipe', descricao: `${u.profissionais_declarados} declarados × ${soma} discriminados por cargo`, onde: u.nome });

    // 6. Coleta de campo desatualizada (> 90 dias)
    const ultima = coletas.filter(c => c.unidade_id === u.id).map(c => c.data_visita ?? c.created_at.slice(0, 10)).sort().at(-1);
    const dias = ultima ? (Date.now() - new Date(ultima).getTime()) / 86_400_000 : Infinity;
    if (dias > 90)
      achados.push({ gravidade: 'Baixa', categoria: 'Coleta de campo', descricao: ultima ? `Última coleta há ${Math.floor(dias)} dias` : 'Nenhuma coleta de campo registrada', onde: u.nome });
  }

  const peso = { Alta: 0, Média: 1, Baixa: 2 };
  achados.sort((a, b) => peso[a.gravidade] - peso[b.gravidade] || a.onde.localeCompare(b.onde));
  const completude = esperados ? (presentes / esperados) * 100 : 0;

  return (
    <>
      <Dica id="ind-qualidade">
        O sistema confere sozinho se faltam lançamentos, se há números estranhos (ex.: acima de 100%) ou dados desatualizados. Comece corrigindo os alertas de gravidade <b>Alta</b>.
      </Dica>

      <div className="barra-filtros">
          <select value={qtdMeses} onChange={e => setQtdMeses(Number(e.target.value))} aria-label="Período">
            <option value={3}>Últimos 3 meses fechados</option>
            <option value={6}>Últimos 6 meses fechados</option>
            <option value={12}>Últimos 12 meses fechados</option>
          </select>
          <span className="chip neutral">{mesAno(meses[0])} a {mesAno(meses.at(-1)!)}</span>
        </div>

      <div className="cards">
        <Cartao titulo="Completude dos lançamentos" valor={`${numeroBR(completude)}%`} nota={`${presentes} de ${esperados} esperados`} />
        <Cartao titulo="Alertas de prioridade alta" valor={achados.filter(a => a.gravidade === 'Alta').length} nota="Corrigir primeiro" />
        <Cartao titulo="Total de alertas" valor={achados.length} nota="Todas as verificações" />
        <Cartao titulo="Duplicidades" valor="0" nota="Bloqueadas automaticamente pelo banco" />
      </div>

      <Painel titulo="Verificações encontradas">
        {achados.length === 0 ? (
          <div className="info">Nenhum problema encontrado no período.</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr><th>Gravidade</th><th>Categoria</th><th>Unidade</th><th>Descrição</th></tr>
              </thead>
              <tbody>
                {achados.map((a, i) => (
                  <tr key={i}>
                    <td><span className={`chip ${a.gravidade === 'Alta' ? 'bad' : a.gravidade === 'Média' ? 'warn' : 'neutral'}`}>{a.gravidade}</span></td>
                    <td><b>{a.categoria}</b></td>
                    <td>{a.onde}</td>
                    <td>{a.descricao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Painel>

      <Painel titulo="Regras aplicadas">
        <div className="three">
          <div className="callout"><b>Ausência</b><br />Cada indicador ativo deve ter um lançamento por unidade em cada mês fechado.</div>
          <div className="callout"><b>Duplicidade</b><br />O banco impede dois lançamentos do mesmo indicador, unidade e mês.</div>
          <div className="callout"><b>Consistência</b><br />Percentuais acima de 100%, variações acima de 50% e fórmulas desatualizadas são sinalizados.</div>
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          Corrija os dados em <Link to="/indicadores?aba=lancar">Lançamentos</Link> ou em <Link to="/ubs">Unidades e equipes</Link>. Cada alteração fica registrada na auditoria.
        </p>
      </Painel>
    </>
  );
}
