import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { buscarUnidades, ok, useConsulta } from '../../lib/hooks';
import { buscarIndicadores, buscarLancamentos } from '../../lib/indicadores';
import type { Coleta, Equipe, Lancamento } from '../../lib/types';
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
  const { indicadores: todos, unidades, lancamentos, equipes, coletas } = dados;
  // só os indicadores mensais são cobrados todo mês (o I6, por exemplo, é "por avaliação")
  const indicadores = todos.filter(i => i.periodicidade === 'Mensal');
  const indicadorDe = (l: Lancamento) => todos.find(i => i.id === l.indicador_id);

  // Meses fechados = até o mês passado (o mês atual ainda está acontecendo)
  const meses = ultimosMeses(qtdMeses + 1).slice(0, -1);
  const achados: Achado[] = [];
  const existe = new Set(lancamentos.map(l => `${l.indicador_id}|${l.unidade_id}|${l.competencia.slice(0, 7)}`));

  // 1. Ausências: quadro UBS × indicador com os meses que faltam
  let esperados = 0;
  let presentes = 0;
  const faltas = new Map<string, string[]>();
  for (const i of indicadores)
    for (const u of unidades) {
      const faltando = meses.filter(m => {
        esperados++;
        const tem = existe.has(`${i.id}|${u.id}|${m.slice(0, 7)}`);
        if (tem) presentes++;
        return !tem;
      });
      faltas.set(`${u.id}|${i.id}`, faltando);
    }
  const ubsEmDia = unidades.filter(u => indicadores.every(i => !faltas.get(`${u.id}|${i.id}`)?.length)).length;

  for (const l of lancamentos) {
    // 2. Percentual acima de 100% (em alguns indicadores, como o I2, isso é possível: só pede conferência)
    if (l.tipo_aplicado === 'percentual' && l.valor !== null && l.valor > 100) {
      const possivel = !indicadorDe(l)?.numerador_ate_denominador;
      achados.push({
        gravidade: possivel ? 'Baixa' : 'Alta',
        categoria: possivel ? 'Conferir' : 'Inconsistência',
        descricao: `${l.indicador_nome} em ${mesAno(l.competencia)} = ${valorIndicador(l.valor, '%')} (quantidade maior que o total${possivel ? '; possível neste indicador, mas confira' : ''})`,
        onde: l.unidade_nome,
      });
    }
    // 3. Fórmula desatualizada
    if (l.versao_formula < l.versao_atual)
      achados.push({ gravidade: 'Baixa', categoria: 'Versão da fórmula', descricao: `${l.indicador_nome} em ${mesAno(l.competencia)} foi calculado com uma fórmula antiga (v${l.versao_formula}; atual v${l.versao_atual})`, onde: l.unidade_nome });
  }

  // 4. Variação brusca (> 50%) em relação ao mês anterior
  for (const l of lancamentos) {
    const d = new Date(l.competencia.slice(0, 10) + 'T12:00:00');
    d.setMonth(d.getMonth() - 1);
    const mesAnt = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    // o C1 já é uma variação: confere o próprio valor
    if (l.tipo_aplicado === 'variacao') {
      if (l.valor !== null && Math.abs(l.valor) > 50)
        achados.push({ gravidade: 'Média', categoria: 'Variação atípica', descricao: `Atendimentos variaram ${valorIndicador(l.valor, '%')} em ${mesAno(l.competencia)} (C1) — confirmar se os meses são comparáveis`, onde: l.unidade_nome });
      continue;
    }
    const ant = lancamentos.find(x => x.indicador_id === l.indicador_id && x.unidade_id === l.unidade_id && x.competencia.startsWith(mesAnt));
    if (ant?.valor && l.valor !== null) {
      const variacao = ((l.valor - ant.valor) / ant.valor) * 100;
      if (Math.abs(variacao) > 50)
        achados.push({ gravidade: 'Média', categoria: 'Variação atípica', descricao: `${l.indicador_nome} variou ${numeroBR(variacao)}% de ${mesAno(ant.competencia)} para ${mesAno(l.competencia)} — confirmar o número`, onde: l.unidade_nome });
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

    // 6. Números ainda não validados
    const aValidar = lancamentos.filter(l => l.unidade_id === u.id && !l.validado).length;
    if (aValidar)
      achados.push({ gravidade: 'Baixa', categoria: 'Validação', descricao: `${aValidar} número(s) lançado(s) ainda não validado(s)`, onde: u.nome });

    // 7. Coleta de campo desatualizada (> 90 dias)
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
        <Cartao titulo="Números lançados" valor={`${numeroBR(completude, 0)}%`} nota={`${presentes} de ${esperados} esperados no período`} />
        <Cartao titulo="UBS com tudo em dia" valor={`${ubsEmDia} de ${unidades.length}`} />
        <Cartao titulo="Alertas para conferir" valor={achados.length} nota={`${achados.filter(a => a.gravidade === 'Alta').length} urgente(s)`} />
      </div>

      <Painel titulo="Onde faltam números">
        <div className="tablewrap">
          <table className="quadro-faltas">
            <thead>
              <tr>
                <th>UBS</th>
                {indicadores.map(i => <th key={i.id} title={i.nome}>{i.nome}</th>)}
              </tr>
            </thead>
            <tbody>
              {unidades.map(u => (
                <tr key={u.id}>
                  <td><b>{u.nome}</b></td>
                  {indicadores.map(i => {
                    const f = faltas.get(`${u.id}|${i.id}`) ?? [];
                    return (
                      <td key={i.id} title={f.length ? `Faltam: ${f.map(mesAno).join(', ')}` : 'Todos os meses lançados'}>
                        {f.length === 0 ? (
                          <span className="chip"><Check size={12} strokeWidth={2.5} /> completo</span>
                        ) : (
                          <span className={`chip ${f.length === meses.length ? 'bad' : 'warn'}`}>falta{f.length > 1 ? 'm' : ''} {f.length}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 10 }}>Passe o mouse sobre um número para ver quais meses faltam.</p>
      </Painel>

      <Painel titulo="Outros alertas">
        {achados.length === 0 ? (
          <div className="info">Nenhum número estranho encontrado no período.</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr><th>Urgência</th><th>Tipo</th><th>UBS</th><th>O que conferir</th></tr>
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

      <Painel titulo="O que o sistema confere">
        <div className="three">
          <div className="callout"><b>Faltas</b><br />Cada UBS deve lançar todos os indicadores em todo mês já encerrado.</div>
          <div className="callout"><b>Repetição</b><br />O sistema não deixa lançar o mesmo indicador duas vezes no mesmo mês e UBS.</div>
          <div className="callout"><b>Números estranhos</b><br />Percentual acima de 100% ou variação maior que 50% de um mês para o outro.</div>
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          Corrija os números em <Link to="/indicadores?aba=lancar">Lançar dados</Link> e as equipes em <Link to="/ubs?aba=equipe">UBS</Link>. Toda alteração fica registrada no histórico.
        </p>
      </Painel>
    </>
  );
}
