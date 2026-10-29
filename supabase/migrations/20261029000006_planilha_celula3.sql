-- =====================================================================
-- Produção registrada no e-SUS e dados da planilha da Célula 3
--
-- producao               -> totais por equipe (por categoria e por tipo de atendimento); todos os usuários ativos veem
-- producao_profissionais -> total por profissional, COM NOME; só o administrador geral vê a tabela
-- v_producao_profissionais -> a mesma lista para todos, mas com "Médico 1, Médico 2…" no lugar do nome
--                             para quem não é administrador geral
-- Atenção: contagem de registros não equivale a horas trabalhadas nem a produtividade individual.
-- =====================================================================

alter table public.atividades add column if not exists observacao text;

create table public.producao (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades (id) on delete cascade,
  equipe text not null,                                                -- ESF, ESB, ESF I…
  dimensao text not null check (dimensao in ('categoria', 'tipo')),    -- categoria profissional ou tipo de atendimento
  item text not null,                                                  -- 'Médico', 'Consulta no Dia'…
  quantidade integer not null check (quantidade >= 0),
  inicio date not null,
  fim date not null check (fim >= inicio),
  fonte text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unidade_id, equipe, dimensao, item, inicio)
);

create table public.producao_profissionais (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades (id) on delete cascade,
  equipe text not null,
  nome text not null,
  categoria text not null,
  quantidade integer not null check (quantidade >= 0),
  inicio date not null,
  fim date not null check (fim >= inicio),
  fonte text not null,
  horas_semana text,
  dias_turnos text,
  tempo_consulta text,
  status_validacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unidade_id, equipe, nome, inicio)
);

do $$
declare t text;
begin
  foreach t in array array['producao', 'producao_profissionais']
  loop
    execute format('create trigger %I_updated_at before update on public.%I
                    for each row execute function public.tocar_updated_at()', t, t);
    execute format('create trigger %I_auditoria after insert or update or delete on public.%I
                    for each row execute function public.registrar_auditoria()', t, t);
  end loop;
end $$;

alter table public.producao enable row level security;
alter table public.producao_profissionais enable row level security;

create policy "leitura usuarios ativos" on public.producao for select to authenticated using (public.usuario_ativo());
create policy "inserir por unidade" on public.producao for insert to authenticated with check (public.pode_editar_unidade(unidade_id));
create policy "editar por unidade" on public.producao for update to authenticated
  using (public.pode_editar_unidade(unidade_id)) with check (public.pode_editar_unidade(unidade_id));
create policy "remover por unidade" on public.producao for delete to authenticated using (public.pode_editar_unidade(unidade_id));

create policy "gestor le" on public.producao_profissionais for select to authenticated using (public.eh_gestor());
create policy "gestor cria" on public.producao_profissionais for insert to authenticated with check (public.eh_gestor());
create policy "gestor edita" on public.producao_profissionais for update to authenticated using (public.eh_gestor()) with check (public.eh_gestor());
create policy "gestor remove" on public.producao_profissionais for delete to authenticated using (public.eh_gestor());

-- Visão para todos os usuários ativos: o nome só aparece para o administrador geral.
-- (Não usa security_invoker de propósito: lê a tabela protegida e esconde o nome aqui.)
create view public.v_producao_profissionais as
select
  p.id, p.unidade_id, p.equipe, p.categoria, p.quantidade, p.inicio, p.fim, p.fonte,
  p.horas_semana, p.dias_turnos, p.tempo_consulta, p.status_validacao,
  case when public.eh_gestor() then p.nome
       else p.categoria || ' ' || dense_rank() over (partition by p.unidade_id, p.categoria order by p.nome)
  end as nome,
  public.eh_gestor() as nome_visivel
from public.producao_profissionais p
where public.usuario_ativo();

revoke all on public.producao, public.producao_profissionais, public.v_producao_profissionais from anon;
grant select on public.v_producao_profissionais to authenticated;


-- =====================================================================
-- DADOS DA PLANILHA "Modelo_Celula_3_UBS_Prado_Riachinho" (aba Restrições desconsiderada)
-- =====================================================================

-- UBS do protótipo saem das telas (ficam arquivadas e podem ser reativadas em Configurações)
update public.unidades set ativa = false where slug in ('maria', 'manha', 'tarde') or nome = 'Unidade Exemplo';

insert into public.unidades (slug, nome, volume_estimado, profissionais_declarados, observacao) values
  ('prado', 'Prado', '≈740 registros/mês (e-SUS, abr–set/2026)', 4, 'Equipes ESF e ESB. Profissionais = médicos, enfermeiros e dentistas com atendimento registrado no período; técnicos, ACS e apoio ainda não levantados.'),
  ('riachinho', 'Riachinho', '≈810 registros/mês (e-SUS, abr–set/2026)', 10, 'Equipes ESF I e ESF II. Profissionais = médicos, enfermeiros e dentistas com atendimento registrado no período; técnicos, ACS e apoio ainda não levantados.')
on conflict (slug) do update set ativa = true, nome = excluded.nome, volume_estimado = excluded.volume_estimado,
  profissionais_declarados = excluded.profissionais_declarados, observacao = excluded.observacao;

-- Atividades da matriz: passam a ser as da planilha (as que têm o mesmo nome continuam)
delete from public.atividades where nome not in ('Consulta médica', 'Consulta de enfermagem', 'Consulta odontológica', 'Acolhimento e avaliação inicial', 'Classificação de risco', 'Vacinação', 'Curativo', 'Administração de medicamentos', 'Monitoramento de condições crônicas', 'Pré-natal de risco habitual', 'Visita domiciliar', 'Educação em saúde', 'Agendamento e orientação de acesso');
insert into public.atividades (nome, ordem, observacao) values
  ('Consulta médica', 1, 'Competência legal específica'),
  ('Consulta de enfermagem', 2, 'Competência legal específica'),
  ('Consulta odontológica', 3, 'Competência legal específica'),
  ('Acolhimento e avaliação inicial', 4, 'Segundo protocolo e atribuições'),
  ('Classificação de risco', 5, 'Conforme protocolo institucional'),
  ('Vacinação', 6, 'Sala de vacina, supervisão e treinamento'),
  ('Curativo', 7, 'Conforme complexidade e protocolo'),
  ('Administração de medicamentos', 8, 'Prescrição e competência legal'),
  ('Monitoramento de condições crônicas', 9, 'Sem substituir consulta privativa'),
  ('Pré-natal de risco habitual', 10, 'Conforme atribuições e protocolos'),
  ('Visita domiciliar', 11, 'Cada categoria no âmbito da profissão'),
  ('Educação em saúde', 12, 'Temas coerentes com competência'),
  ('Agendamento e orientação de acesso', 13, 'Atuação também da recepção')
on conflict (nome) do update set ordem = excluded.ordem, observacao = excluded.observacao;

insert into public.equipes (unidade_id, cargo, quantidade, observacoes, ordem) values
  ((select id from public.unidades where slug = 'prado'), 'Médico(a)', 2, 'ESF: 2. Profissionais com atendimento registrado no e-SUS entre abr e set/2026; escala e vínculo a validar.', 1),
  ((select id from public.unidades where slug = 'prado'), 'Enfermeiro(a)', 1, 'ESF: 1. Profissionais com atendimento registrado no e-SUS entre abr e set/2026; escala e vínculo a validar.', 2),
  ((select id from public.unidades where slug = 'prado'), 'Dentista', 1, 'ESB: 1. Profissionais com atendimento registrado no e-SUS entre abr e set/2026; escala e vínculo a validar.', 3),
  ((select id from public.unidades where slug = 'prado'), 'Técnico(a) de enfermagem', null, 'Quantidade não levantada na planilha da Célula 3.', 4),
  ((select id from public.unidades where slug = 'prado'), 'ACS', null, 'Quantidade não levantada na planilha da Célula 3.', 5),
  ((select id from public.unidades where slug = 'riachinho'), 'Médico(a)', 7, 'ESF I: 2 · ESF II: 6 (1 profissional atua em mais de uma equipe). Profissionais com atendimento registrado no e-SUS entre abr e set/2026; escala e vínculo a validar.', 1),
  ((select id from public.unidades where slug = 'riachinho'), 'Enfermeiro(a)', 3, 'ESF I: 2 · ESF II: 1. Profissionais com atendimento registrado no e-SUS entre abr e set/2026; escala e vínculo a validar.', 2),
  ((select id from public.unidades where slug = 'riachinho'), 'Técnico(a) de enfermagem', null, 'Quantidade não levantada na planilha da Célula 3.', 3),
  ((select id from public.unidades where slug = 'riachinho'), 'ACS', null, 'Quantidade não levantada na planilha da Célula 3.', 4)
on conflict (unidade_id, cargo) do update set quantidade = excluded.quantidade, observacoes = excluded.observacoes, ordem = excluded.ordem;

-- Matriz: P = principal (executa), C = condicionada a protocolo/capacitação (apoia), — = não alocar
insert into public.competencias (equipe_id, atividade_id, nivel)
select e.id, a.id, v.nivel::public.nivel_competencia
from (values
  ('prado', 'Médico(a)', 'Consulta médica', 'executa'),
  ('prado', 'Médico(a)', 'Consulta de enfermagem', 'nao'),
  ('prado', 'Médico(a)', 'Consulta odontológica', 'nao'),
  ('prado', 'Médico(a)', 'Acolhimento e avaliação inicial', 'apoia'),
  ('prado', 'Médico(a)', 'Classificação de risco', 'apoia'),
  ('prado', 'Médico(a)', 'Vacinação', 'nao'),
  ('prado', 'Médico(a)', 'Curativo', 'apoia'),
  ('prado', 'Médico(a)', 'Administração de medicamentos', 'apoia'),
  ('prado', 'Médico(a)', 'Monitoramento de condições crônicas', 'executa'),
  ('prado', 'Médico(a)', 'Pré-natal de risco habitual', 'executa'),
  ('prado', 'Médico(a)', 'Visita domiciliar', 'executa'),
  ('prado', 'Médico(a)', 'Educação em saúde', 'executa'),
  ('prado', 'Médico(a)', 'Agendamento e orientação de acesso', 'apoia'),
  ('prado', 'Enfermeiro(a)', 'Consulta médica', 'nao'),
  ('prado', 'Enfermeiro(a)', 'Consulta de enfermagem', 'executa'),
  ('prado', 'Enfermeiro(a)', 'Consulta odontológica', 'nao'),
  ('prado', 'Enfermeiro(a)', 'Acolhimento e avaliação inicial', 'executa'),
  ('prado', 'Enfermeiro(a)', 'Classificação de risco', 'executa'),
  ('prado', 'Enfermeiro(a)', 'Vacinação', 'executa'),
  ('prado', 'Enfermeiro(a)', 'Curativo', 'executa'),
  ('prado', 'Enfermeiro(a)', 'Administração de medicamentos', 'executa'),
  ('prado', 'Enfermeiro(a)', 'Monitoramento de condições crônicas', 'executa'),
  ('prado', 'Enfermeiro(a)', 'Pré-natal de risco habitual', 'executa'),
  ('prado', 'Enfermeiro(a)', 'Visita domiciliar', 'executa'),
  ('prado', 'Enfermeiro(a)', 'Educação em saúde', 'executa'),
  ('prado', 'Enfermeiro(a)', 'Agendamento e orientação de acesso', 'apoia'),
  ('prado', 'Dentista', 'Consulta médica', 'nao'),
  ('prado', 'Dentista', 'Consulta de enfermagem', 'nao'),
  ('prado', 'Dentista', 'Consulta odontológica', 'executa'),
  ('prado', 'Dentista', 'Acolhimento e avaliação inicial', 'nao'),
  ('prado', 'Dentista', 'Classificação de risco', 'nao'),
  ('prado', 'Dentista', 'Vacinação', 'nao'),
  ('prado', 'Dentista', 'Curativo', 'nao'),
  ('prado', 'Dentista', 'Administração de medicamentos', 'nao'),
  ('prado', 'Dentista', 'Monitoramento de condições crônicas', 'nao'),
  ('prado', 'Dentista', 'Pré-natal de risco habitual', 'nao'),
  ('prado', 'Dentista', 'Visita domiciliar', 'apoia'),
  ('prado', 'Dentista', 'Educação em saúde', 'executa'),
  ('prado', 'Dentista', 'Agendamento e orientação de acesso', 'nao'),
  ('prado', 'Técnico(a) de enfermagem', 'Consulta médica', 'nao'),
  ('prado', 'Técnico(a) de enfermagem', 'Consulta de enfermagem', 'nao'),
  ('prado', 'Técnico(a) de enfermagem', 'Consulta odontológica', 'nao'),
  ('prado', 'Técnico(a) de enfermagem', 'Acolhimento e avaliação inicial', 'apoia'),
  ('prado', 'Técnico(a) de enfermagem', 'Classificação de risco', 'nao'),
  ('prado', 'Técnico(a) de enfermagem', 'Vacinação', 'apoia'),
  ('prado', 'Técnico(a) de enfermagem', 'Curativo', 'apoia'),
  ('prado', 'Técnico(a) de enfermagem', 'Administração de medicamentos', 'apoia'),
  ('prado', 'Técnico(a) de enfermagem', 'Monitoramento de condições crônicas', 'apoia'),
  ('prado', 'Técnico(a) de enfermagem', 'Pré-natal de risco habitual', 'apoia'),
  ('prado', 'Técnico(a) de enfermagem', 'Visita domiciliar', 'apoia'),
  ('prado', 'Técnico(a) de enfermagem', 'Educação em saúde', 'executa'),
  ('prado', 'Técnico(a) de enfermagem', 'Agendamento e orientação de acesso', 'apoia'),
  ('prado', 'ACS', 'Consulta médica', 'nao'),
  ('prado', 'ACS', 'Consulta de enfermagem', 'nao'),
  ('prado', 'ACS', 'Consulta odontológica', 'nao'),
  ('prado', 'ACS', 'Acolhimento e avaliação inicial', 'nao'),
  ('prado', 'ACS', 'Classificação de risco', 'nao'),
  ('prado', 'ACS', 'Vacinação', 'nao'),
  ('prado', 'ACS', 'Curativo', 'nao'),
  ('prado', 'ACS', 'Administração de medicamentos', 'nao'),
  ('prado', 'ACS', 'Monitoramento de condições crônicas', 'apoia'),
  ('prado', 'ACS', 'Pré-natal de risco habitual', 'apoia'),
  ('prado', 'ACS', 'Visita domiciliar', 'executa'),
  ('prado', 'ACS', 'Educação em saúde', 'executa'),
  ('prado', 'ACS', 'Agendamento e orientação de acesso', 'executa'),
  ('riachinho', 'Médico(a)', 'Consulta médica', 'executa'),
  ('riachinho', 'Médico(a)', 'Consulta de enfermagem', 'nao'),
  ('riachinho', 'Médico(a)', 'Consulta odontológica', 'nao'),
  ('riachinho', 'Médico(a)', 'Acolhimento e avaliação inicial', 'apoia'),
  ('riachinho', 'Médico(a)', 'Classificação de risco', 'apoia'),
  ('riachinho', 'Médico(a)', 'Vacinação', 'nao'),
  ('riachinho', 'Médico(a)', 'Curativo', 'apoia'),
  ('riachinho', 'Médico(a)', 'Administração de medicamentos', 'apoia'),
  ('riachinho', 'Médico(a)', 'Monitoramento de condições crônicas', 'executa'),
  ('riachinho', 'Médico(a)', 'Pré-natal de risco habitual', 'executa'),
  ('riachinho', 'Médico(a)', 'Visita domiciliar', 'executa'),
  ('riachinho', 'Médico(a)', 'Educação em saúde', 'executa'),
  ('riachinho', 'Médico(a)', 'Agendamento e orientação de acesso', 'apoia'),
  ('riachinho', 'Enfermeiro(a)', 'Consulta médica', 'nao'),
  ('riachinho', 'Enfermeiro(a)', 'Consulta de enfermagem', 'executa'),
  ('riachinho', 'Enfermeiro(a)', 'Consulta odontológica', 'nao'),
  ('riachinho', 'Enfermeiro(a)', 'Acolhimento e avaliação inicial', 'executa'),
  ('riachinho', 'Enfermeiro(a)', 'Classificação de risco', 'executa'),
  ('riachinho', 'Enfermeiro(a)', 'Vacinação', 'executa'),
  ('riachinho', 'Enfermeiro(a)', 'Curativo', 'executa'),
  ('riachinho', 'Enfermeiro(a)', 'Administração de medicamentos', 'executa'),
  ('riachinho', 'Enfermeiro(a)', 'Monitoramento de condições crônicas', 'executa'),
  ('riachinho', 'Enfermeiro(a)', 'Pré-natal de risco habitual', 'executa'),
  ('riachinho', 'Enfermeiro(a)', 'Visita domiciliar', 'executa'),
  ('riachinho', 'Enfermeiro(a)', 'Educação em saúde', 'executa'),
  ('riachinho', 'Enfermeiro(a)', 'Agendamento e orientação de acesso', 'apoia'),
  ('riachinho', 'Técnico(a) de enfermagem', 'Consulta médica', 'nao'),
  ('riachinho', 'Técnico(a) de enfermagem', 'Consulta de enfermagem', 'nao'),
  ('riachinho', 'Técnico(a) de enfermagem', 'Consulta odontológica', 'nao'),
  ('riachinho', 'Técnico(a) de enfermagem', 'Acolhimento e avaliação inicial', 'apoia'),
  ('riachinho', 'Técnico(a) de enfermagem', 'Classificação de risco', 'nao'),
  ('riachinho', 'Técnico(a) de enfermagem', 'Vacinação', 'apoia'),
  ('riachinho', 'Técnico(a) de enfermagem', 'Curativo', 'apoia'),
  ('riachinho', 'Técnico(a) de enfermagem', 'Administração de medicamentos', 'apoia'),
  ('riachinho', 'Técnico(a) de enfermagem', 'Monitoramento de condições crônicas', 'apoia'),
  ('riachinho', 'Técnico(a) de enfermagem', 'Pré-natal de risco habitual', 'apoia'),
  ('riachinho', 'Técnico(a) de enfermagem', 'Visita domiciliar', 'apoia'),
  ('riachinho', 'Técnico(a) de enfermagem', 'Educação em saúde', 'executa'),
  ('riachinho', 'Técnico(a) de enfermagem', 'Agendamento e orientação de acesso', 'apoia'),
  ('riachinho', 'ACS', 'Consulta médica', 'nao'),
  ('riachinho', 'ACS', 'Consulta de enfermagem', 'nao'),
  ('riachinho', 'ACS', 'Consulta odontológica', 'nao'),
  ('riachinho', 'ACS', 'Acolhimento e avaliação inicial', 'nao'),
  ('riachinho', 'ACS', 'Classificação de risco', 'nao'),
  ('riachinho', 'ACS', 'Vacinação', 'nao'),
  ('riachinho', 'ACS', 'Curativo', 'nao'),
  ('riachinho', 'ACS', 'Administração de medicamentos', 'nao'),
  ('riachinho', 'ACS', 'Monitoramento de condições crônicas', 'apoia'),
  ('riachinho', 'ACS', 'Pré-natal de risco habitual', 'apoia'),
  ('riachinho', 'ACS', 'Visita domiciliar', 'executa'),
  ('riachinho', 'ACS', 'Educação em saúde', 'executa'),
  ('riachinho', 'ACS', 'Agendamento e orientação de acesso', 'executa')
) as v (slug, cargo, atividade, nivel)
join public.unidades u on u.slug = v.slug
join public.equipes e on e.unidade_id = u.id and e.cargo = v.cargo
join public.atividades a on a.nome = v.atividade
on conflict (equipe_id, atividade_id) do update set nivel = excluded.nivel;

insert into public.producao (unidade_id, equipe, dimensao, item, quantidade, inicio, fim, fonte) values
  ((select id from public.unidades where slug = 'prado'), 'ESF', 'categoria', 'Médico', 3154, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'prado'), 'ESF', 'categoria', 'Enfermeiro', 875, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'prado'), 'ESB', 'categoria', 'Dentista', 411, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'riachinho'), 'ESF I', 'categoria', 'Médico', 1539, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'riachinho'), 'ESF I', 'categoria', 'Enfermeiro', 458, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'riachinho'), 'ESF II', 'categoria', 'Médico', 2289, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'riachinho'), 'ESF II', 'categoria', 'Enfermeiro', 573, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'prado'), 'ESB', 'tipo', 'Atendimento de Urgência', 4, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'prado'), 'ESB', 'tipo', 'Consulta Agendada', 274, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'prado'), 'ESB', 'tipo', 'Consulta no Dia', 133, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'prado'), 'ESF', 'tipo', 'Atendimento de Urgência', 9, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'prado'), 'ESF', 'tipo', 'Consulta Agendada', 1537, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'prado'), 'ESF', 'tipo', 'Consulta Agendada Programada / Cuidado Continuado', 32, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'prado'), 'ESF', 'tipo', 'Consulta no Dia', 2451, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'riachinho'), 'ESF I', 'tipo', 'Atendimento de Urgência', 440, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'riachinho'), 'ESF I', 'tipo', 'Consulta Agendada', 1140, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'riachinho'), 'ESF I', 'tipo', 'Consulta Agendada Programada / Cuidado Continuado', 30, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'riachinho'), 'ESF I', 'tipo', 'Consulta no Dia', 387, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'riachinho'), 'ESF II', 'tipo', 'Atendimento de Urgência', 76, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'riachinho'), 'ESF II', 'tipo', 'Consulta Agendada', 1434, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'riachinho'), 'ESF II', 'tipo', 'Consulta Agendada Programada / Cuidado Continuado', 33, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'riachinho'), 'ESF II', 'tipo', 'Consulta no Dia', 1319, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3')
on conflict (unidade_id, equipe, dimensao, item, inicio) do update set quantidade = excluded.quantidade, fim = excluded.fim, fonte = excluded.fonte;

-- O que a planilha deixou pendente vira tarefa no sistema
insert into public.pendencias (unidade_id, escopo, prioridade, texto, motivo) values
  ((select id from public.unidades where slug = 'prado'), 'Prado', 'Alta', 'Confirmar horas por semana, dias/turnos e tempo por consulta de cada profissional', 'Na planilha da Célula 3 estes campos estão como Pendente; sem eles não dá para calcular a capacidade da equipe.'),
  ((select id from public.unidades where slug = 'prado'), 'Prado', 'Média', 'Verificar escala e vínculo de cada profissional', 'Status de validação da planilha: Verificar escala e vínculo. Há profissionais com poucos registros no período.'),
  ((select id from public.unidades where slug = 'prado'), 'Prado', 'Média', 'Levantar quantos técnicos de enfermagem e ACS a UBS tem', 'A planilha traz só médicos, enfermeiros e dentistas; a matriz de competências inclui técnicos e ACS.'),
  ((select id from public.unidades where slug = 'riachinho'), 'Riachinho', 'Alta', 'Confirmar horas por semana, dias/turnos e tempo por consulta de cada profissional', 'Na planilha da Célula 3 estes campos estão como Pendente; sem eles não dá para calcular a capacidade da equipe.'),
  ((select id from public.unidades where slug = 'riachinho'), 'Riachinho', 'Média', 'Verificar escala e vínculo de cada profissional', 'Status de validação da planilha: Verificar escala e vínculo. Há profissionais com poucos registros no período.'),
  ((select id from public.unidades where slug = 'riachinho'), 'Riachinho', 'Média', 'Levantar quantos técnicos de enfermagem e ACS a UBS tem', 'A planilha traz só médicos, enfermeiros e dentistas; a matriz de competências inclui técnicos e ACS.'),
  (null, 'Todas', 'Média', 'Validar a matriz de competências com a coordenação e a legislação profissional', 'A própria planilha indica que a matriz é uma proposta para planejamento.');
