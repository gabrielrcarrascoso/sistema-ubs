-- =====================================================================
-- Reorganização das UBS (confirmada pela equipe do projeto):
--   * Prado e Maria Panta são a MESMA UBS -> fica uma só, chamada "Prado": usa o registro da antiga
--     Maria Panta (mantém o histórico dela) e recebe os dados da planilha do Prado.
--     Equipes: ESF (Saúde da Família) e ESB (Saúde Bucal).
--   * Riachinho I e Riachinho II são UBS DIFERENTES -> viram duas unidades, cada uma com sua ESF.
-- Nenhum nome de profissional aparece aqui: os dados são movidos de uma unidade para outra.
-- =====================================================================

do $$
declare
  maria uuid := (select id from public.unidades where slug = 'maria');
  prado uuid := (select id from public.unidades where slug = 'prado');
  riach uuid := (select id from public.unidades where slug = 'riachinho');
  r1 uuid;
  r2 uuid;
  origem record;
begin
  if prado is null or riach is null then
    raise notice 'Reorganização já aplicada (Prado/Riachinho não existem mais).';
    return;
  end if;

  -- ================= Riachinho I e Riachinho II =================
  insert into public.unidades (slug, nome, horario, volume_estimado, pico, dados_ficha, observacao)
  select v.slug, v.nome, u.horario, null, u.pico, u.dados_ficha,
         'Equipe ESF (Saúde da Família). Profissionais = médicos e enfermeiros com atendimento registrado no e-SUS entre abr e set/2026; técnicos, ACS e apoio ainda não levantados.'
  from public.unidades u, (values ('riachinho-1', 'Riachinho I'), ('riachinho-2', 'Riachinho II')) as v (slug, nome)
  where u.id = riach
  on conflict (slug) do nothing;
  r1 := (select id from public.unidades where slug = 'riachinho-1');
  r2 := (select id from public.unidades where slug = 'riachinho-2');

  -- produção e profissionais: cada equipe vai para a sua UBS e passa a se chamar só "ESF"
  update public.producao set unidade_id = r1, equipe = 'ESF' where unidade_id = riach and equipe = 'ESF I';
  update public.producao set unidade_id = r2, equipe = 'ESF' where unidade_id = riach and equipe = 'ESF II';
  update public.producao_profissionais set unidade_id = r1, equipe = 'ESF' where unidade_id = riach and equipe = 'ESF I';
  update public.producao_profissionais set unidade_id = r2, equipe = 'ESF' where unidade_id = riach and equipe = 'ESF II';

  -- volume e equipe de cada nova UBS, calculados a partir dos dados movidos
  update public.unidades u set volume_estimado = '≈' || round(t.total / 6.0)::int || ' registros/mês (e-SUS, abr–set/2026)'
  from (select unidade_id, sum(quantidade) total from public.producao where dimensao = 'categoria' group by unidade_id) t
  where t.unidade_id = u.id and u.id in (r1, r2);

  for origem in select * from public.equipes where unidade_id = riach loop
    insert into public.equipes (unidade_id, cargo, quantidade, disponibilidade, observacoes, ordem)
    select alvo.id, origem.cargo,
           case when origem.quantidade is null then null
                else (select count(distinct p.nome) from public.producao_profissionais p
                      where p.unidade_id = alvo.id
                        and p.categoria = case origem.cargo when 'Médico(a)' then 'Médico' when 'Enfermeiro(a)' then 'Enfermeiro' else 'Dentista' end)
           end,
           origem.disponibilidade,
           case when origem.quantidade is null then origem.observacoes
                else 'Profissionais com atendimento registrado no e-SUS entre abr e set/2026; escala e vínculo a validar.' end,
           origem.ordem
    from (values (r1), (r2)) as alvo (id)
    on conflict (unidade_id, cargo) do nothing;
    -- a mesma matriz de competências da planilha
    insert into public.competencias (equipe_id, atividade_id, nivel)
    select e.id, c.atividade_id, c.nivel
    from public.competencias c
    join public.equipes e on e.unidade_id in (r1, r2) and e.cargo = origem.cargo
    where c.equipe_id = origem.id
    on conflict (equipe_id, atividade_id) do nothing;
  end loop;
  -- se os dados de teste/planilha não tiverem profissionais, a quantidade fica "não informada" em vez de 0
  update public.equipes set quantidade = null where unidade_id in (r1, r2) and quantidade = 0;
  update public.unidades u set profissionais_declarados = (select nullif(sum(coalesce(quantidade, 0)), 0) from public.equipes where unidade_id = u.id)
  where u.id in (r1, r2);

  -- pendências: cada UBS recebe as suas
  insert into public.pendencias (unidade_id, escopo, prioridade, texto, motivo, concluida)
  select alvo.id, alvo.nome, p.prioridade, p.texto, p.motivo, p.concluida
  from public.pendencias p, (select id, nome from public.unidades where id in (r1, r2)) alvo
  where p.unidade_id = riach;

  -- o que mais existir só no Riachinho antigo (lançamentos, visitas, respostas, restrições) impede apagar
  if exists (select 1 from public.lancamentos where unidade_id = riach)
     or exists (select 1 from public.coletas where unidade_id = riach)
     or exists (select 1 from public.aplicacoes where unidade_id = riach)
     or exists (select 1 from public.restricoes where unidade_id = riach) then
    update public.unidades set ativa = false, nome = 'Riachinho (antiga, dividida em I e II)' where id = riach;
  else
    delete from public.unidades where id = riach;
  end if;

  -- ================= Prado (antiga Maria Panta) =================
  if maria is null then
    return;  -- não há Maria Panta para juntar: o Prado continua como está
  end if;

  update public.producao set unidade_id = maria where unidade_id = prado;
  update public.producao_profissionais set unidade_id = maria where unidade_id = prado;
  update public.pendencias set unidade_id = maria, escopo = 'Prado' where unidade_id = prado;
  update public.lancamentos set unidade_id = maria where unidade_id = prado
    and not exists (select 1 from public.lancamentos l2 where l2.unidade_id = maria and l2.indicador_id = lancamentos.indicador_id and l2.competencia = lancamentos.competencia);
  update public.coletas set unidade_id = maria where unidade_id = prado;
  update public.restricoes set unidade_id = maria where unidade_id = prado;
  update public.aplicacoes set unidade_id = maria where unidade_id = prado
    and not exists (select 1 from public.aplicacoes a2 where a2.unidade_id = maria and a2.questionario_id = aplicacoes.questionario_id);

  -- equipe: médicos, enfermeiros e dentista vêm da planilha; os demais cargos continuam do levantamento anterior
  for origem in select * from public.equipes where unidade_id = prado loop
    insert into public.equipes (unidade_id, cargo, quantidade, observacoes, ordem)
    values (maria, origem.cargo, origem.quantidade, origem.observacoes, origem.ordem)
    on conflict (unidade_id, cargo) do update set
      quantidade = coalesce(excluded.quantidade, public.equipes.quantidade),
      observacoes = case when excluded.quantidade is null
                         then 'Levantamento anterior (protótipo), a confirmar. ' || coalesce(public.equipes.observacoes, '')
                         else excluded.observacoes end;
    insert into public.competencias (equipe_id, atividade_id, nivel)
    select e.id, c.atividade_id, c.nivel
    from public.competencias c
    join public.equipes e on e.unidade_id = maria and e.cargo = origem.cargo
    where c.equipe_id = origem.id
    on conflict (equipe_id, atividade_id) do update set nivel = excluded.nivel;
  end loop;

  update public.pendencias
  set texto = 'Confirmar quantos técnicos de enfermagem e ACS a UBS tem',
      motivo = 'A planilha da Célula 3 não traz esses cargos; o levantamento anterior indicava 2 técnicos de enfermagem e 7 ACS.'
  where unidade_id = maria and texto = 'Levantar quantos técnicos de enfermagem e ACS a UBS tem';

  update public.unidades m set
    nome = 'Prado',
    ativa = true,
    volume_estimado = p.volume_estimado,
    profissionais_declarados = (select sum(quantidade) from public.equipes where unidade_id = maria),
    observacao = 'Também chamada de UBS Maria Panta. Equipes ESF (Saúde da Família) e ESB (Saúde Bucal). Médicos, enfermeiros e dentista: planilha da Célula 3 (e-SUS, abr–set/2026); demais cargos: levantamento anterior, a confirmar.',
    dados_ficha = p.dados_ficha || m.dados_ficha
  from public.unidades p
  where m.id = maria and p.id = prado;

  delete from public.unidades where id = prado;  -- tudo já foi movido para o registro da antiga Maria Panta
  update public.unidades set slug = 'prado' where id = maria;
end $$;
