-- =====================================================================
-- Indicadores da planilha "Indicadores_APS_Data_Performance_Implementacao"
-- (Frente 05 — Saúde Digital e APS — Salgueiro/PE · apresentação Semana 02)
--
-- I1–I6: tese Santos (2026), com as metas originais. C1 e C2: propostos no projeto, sem meta aprovada.
-- Regras da planilha aplicadas aqui:
--   * denominador zero, vazio ou não validado -> o número não é aceito (nunca um 0% artificial);
--   * I3 e I4 mantêm a fórmula da apresentação: (1 − A/B) × 100;
--   * C1 = (atual − anterior) / anterior × 100;
--   * valores guardados sem arredondar; a tela mostra 1–2 casas.
-- =====================================================================

-- ---------- Novos tipos de fórmula ----------
-- O tipo deixa de ser enum e vira texto com lista fechada (permite incluir tipos novos sem recriar o enum).
drop view public.v_lancamentos;
-- a regra "denominador obrigatório exceto contagem" usa o enum antigo: sai e volta depois da troca
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.indicadores'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%contagem%'
  loop
    execute format('alter table public.indicadores drop constraint %I', c);
  end loop;
end $$;
alter table public.indicadores alter column tipo drop default;
alter table public.indicadores alter column tipo type text using tipo::text;
alter table public.indicadores alter column tipo set default 'percentual';
alter table public.indicadores add constraint indicadores_tipo_valido
  check (tipo in ('percentual', 'contagem', 'razao', 'complemento', 'variacao'));
alter table public.indicadores add constraint indicadores_denominador_obrigatorio
  check (tipo = 'contagem' or denominador_desc is not null);
alter table public.lancamentos alter column tipo_aplicado type text using tipo_aplicado::text;
drop type public.tipo_indicador;

-- ---------- Documentação de cada indicador ----------
alter table public.indicadores
  add column origem text,
  add column variavel_a text,                 -- chave técnica da variável A (numerador)
  add column variavel_b text,                 -- chave técnica da variável B (denominador)
  add column granularidade text,              -- ex.: UBS / período
  add column criterio text,                   -- critério / cautela de interpretação
  add column situacao_dados text not null default 'Pendente validação',
  add column numerador_ate_denominador boolean not null default false; -- A nunca pode passar de B

-- ---------- Rastreabilidade de cada número lançado ----------
alter table public.lancamentos
  add column data_extracao date,               -- quando o dado foi tirado do sistema de origem
  add column validado boolean not null default false;

-- ---------- Cálculo ----------
create or replace function public.preparar_lancamento()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  ind record;
begin
  select tipo, versao, fator, numerador_ate_denominador into ind from public.indicadores where id = new.indicador_id;
  new.versao_formula := ind.versao;
  new.tipo_aplicado := ind.tipo;
  new.fator_aplicado := ind.fator;
  if ind.tipo <> 'contagem' and (new.denominador is null or new.denominador = 0) then
    raise exception 'Este indicador exige denominador maior que zero.';
  end if;
  if ind.tipo = 'contagem' then
    new.denominador := null;
  end if;
  if ind.numerador_ate_denominador and new.numerador > new.denominador then
    raise exception 'Neste indicador o numerador não pode ser maior que o denominador.';
  end if;
  new.competencia := date_trunc('month', new.competencia)::date;
  return new;
end;
$$;

create view public.v_lancamentos with (security_invoker = true) as
select
  l.*,
  i.codigo, i.nome as indicador_nome, i.unidade_medida, i.meta, i.sentido_meta,
  i.versao as versao_atual,
  u.nome as unidade_nome,
  -- usa a fórmula congelada no lançamento, não a atual (rastreabilidade)
  case l.tipo_aplicado
    when 'contagem'    then l.numerador
    when 'complemento' then round((1 - l.numerador / nullif(l.denominador, 0)) * l.fator_aplicado, 2)
    when 'variacao'    then round((l.numerador - l.denominador) / nullif(l.denominador, 0) * l.fator_aplicado, 2)
    else round(l.numerador / nullif(l.denominador, 0) * l.fator_aplicado, 2)
  end as valor
from public.lancamentos l
join public.indicadores i on i.id = l.indicador_id
join public.unidades u on u.id = l.unidade_id;

revoke all on public.v_lancamentos from anon;

-- ---------- Dicionário: os 8 indicadores da planilha ----------
-- Os indicadores anteriores (sugestões iniciais) ficam inativos, com o histórico preservado.
update public.indicadores set ativo = false where codigo not in ('I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'C1', 'C2');

insert into public.indicadores
  (codigo, nome, definicao, tipo, unidade_medida, numerador_desc, denominador_desc, fator, fonte_dados, periodicidade,
   meta, sentido_meta, origem, variavel_a, variavel_b, granularidade, criterio, situacao_dados, numerador_ate_denominador)
values
  ('I1', 'Produtividade',
   'Consultas concluídas / entradas totais × 100.',
   'percentual', '%', 'Consultas concluídas', 'Entradas totais (definição da tese)', 100,
   'A definir: fontes do I1 a conferir', 'Mensal', 70, 'maior',
   'Tese — Santos (2026)', 'consultas_concluidas', 'entradas_totais', 'UBS / período',
   'Validar conceitos de consultas concluídas e entradas totais.', 'Pendente validação', true),

  ('I2', 'Visitas ACS/equipe',
   'Visitas realizadas / famílias cadastradas × 100.',
   'percentual', '%', 'Visitas realizadas por ACS/equipe', 'Famílias cadastradas', 100,
   'A definir: fontes do I2 a conferir', 'Mensal', 80, 'maior',
   'Tese — Santos (2026)', 'visitas_realizadas', 'familias_cadastradas', 'UBS / período',
   'Visitas não significam necessariamente famílias distintas (pode passar de 100%); validar período e momento de referência do cadastro.', 'Pendente validação', false),

  ('I3', 'Qualidade das visitas de endemias',
   '(1 − entradas por endemias / entradas totais) × 100. Fórmula mantida como na apresentação, sem reinterpretar "qualidade" antes de validar as definições do estudo.',
   'complemento', '%', 'Entradas por endemias (definição original)', 'Entradas totais (definição da tese)', 100,
   'A definir: fontes do I3 a conferir', 'Mensal', 50, 'maior',
   'Tese — Santos (2026)', 'entradas_por_endemias', 'entradas_totais', 'UBS / período',
   'Validar definição de entradas por endemias; o conceito da tese precisa ser reproduzido.', 'Pendente validação', true),

  ('I4', 'Qualidade do atendimento ACS',
   '(1 − entradas de cadastrados / entradas totais) × 100. Fórmula mantida como na apresentação, sem reinterpretar "qualidade" antes de validar as definições do estudo.',
   'complemento', '%', 'Entradas de cadastrados (definição original)', 'Entradas totais (definição da tese)', 100,
   'A definir: fontes do I4 a conferir', 'Mensal', 45, 'maior',
   'Tese — Santos (2026)', 'entradas_de_cadastrados', 'entradas_totais', 'UBS / período',
   'Validar definição de entradas de cadastrados; o conceito da tese precisa ser reproduzido.', 'Pendente validação', true),

  ('I5', 'Testes e programas de endemias',
   'Número de testes realizados por UBS.',
   'contagem', 'testes', 'Testes realizados na UBS', null, 1,
   'A definir: fontes do I5 a conferir', 'Mensal', 200, 'maior',
   'Tese — Santos (2026)', 'testes_realizados', null, 'UBS / período',
   'Não converter em taxa; confirmar quais testes entram e o período.', 'Pendente validação', false),

  ('I6', 'Ergonomia contínua',
   'Requisitos de ergonomia atendidos / requisitos avaliados × 100.',
   'percentual', '%', 'Requisitos de ergonomia atendidos', 'Requisitos de ergonomia avaliados', 100,
   'A definir: instrumento de avaliação (checklist)', 'Por avaliação', 90, 'maior',
   'Tese — Santos (2026)', 'requisitos_atendidos', 'requisitos_avaliados', 'UBS / avaliação',
   'Confirmar instrumento e critérios de avaliação; atendidos não podem passar dos avaliados.', 'Pendente validação', true),

  ('C1', 'Variação mensal',
   '(Atendimentos do mês − atendimentos do mês anterior) / atendimentos do mês anterior × 100.',
   'variacao', '%', 'Atendimentos do mês', 'Atendimentos do mês anterior', 100,
   'e-SUS APS: relatórios de atendimentos por equipe/categoria e período', 'Mensal', null, 'maior',
   'Complementar — projeto', 'atendimentos_mes_atual', 'atendimentos_mes_anterior', 'UBS / mês',
   'Comparar meses equivalentes, mesma UBS e mesmo conceito de atendimento; o mês anterior não pode ser zero. Crescimento não implica melhora do serviço.', 'Depende de totais mensais comparáveis', false),

  ('C2', 'Utilização da capacidade',
   'Atendimentos / capacidade estimada × 100.',
   'percentual', '%', 'Atendimentos na janela de referência', 'Capacidade assistencial estimada e aprovada', 100,
   'e-SUS APS (atendimentos) + capacidade validada pela gestão', 'Mensal', null, 'maior',
   'Complementar — projeto', 'atendimentos_periodo', 'capacidade_estimada', 'UBS / período',
   'Capacidade assistencial efetiva precisa ser estimada e validada por UBS/período antes de publicar. Uso elevado não significa eficiência; não substituir jornada por capacidade automaticamente.', 'Depende de capacidade validada', false)
on conflict (codigo) do update set
  nome = excluded.nome, definicao = excluded.definicao, tipo = excluded.tipo, unidade_medida = excluded.unidade_medida,
  numerador_desc = excluded.numerador_desc, denominador_desc = excluded.denominador_desc, fator = excluded.fator,
  fonte_dados = excluded.fonte_dados, periodicidade = excluded.periodicidade, meta = excluded.meta, sentido_meta = excluded.sentido_meta,
  origem = excluded.origem, variavel_a = excluded.variavel_a, variavel_b = excluded.variavel_b, granularidade = excluded.granularidade,
  criterio = excluded.criterio, situacao_dados = excluded.situacao_dados, numerador_ate_denominador = excluded.numerador_ate_denominador,
  ativo = true;

-- ---------- Próximos passos da planilha viram tarefas ----------
insert into public.pendencias (unidade_id, escopo, prioridade, texto, motivo) values
  (null, 'Todas', 'Alta', 'Mapear as fontes e validar as variáveis e fórmulas dos indicadores I1 a I6',
   'Etapa inicial da planilha de indicadores: mapear fontes → validar variáveis e fórmulas → calcular os indicadores viáveis.'),
  (null, 'Todas', 'Média', 'Estimar e validar a capacidade assistencial de cada UBS (necessária para o C2)',
   'Sem capacidade validada o C2 não deve ser publicado.'),
  (null, 'Todas', 'Média', 'Validar a identificação de cada equipe/unidade nos relatórios (Prado, Riachinho I e II)',
   'A planilha indica relatórios disponíveis para Prado e Riachinho I/II.');
