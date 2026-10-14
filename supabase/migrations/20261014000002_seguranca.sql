-- =====================================================================
-- Segurança: perfis automáticos, permissões (RLS), auditoria e versões
--
-- Papéis:
--   gestor        -> Secretaria de Saúde: vê e edita tudo, aprova usuários
--   coordenador   -> edita apenas a própria unidade
--   profissional  -> somente leitura
-- Usuário novo entra INATIVO e só acessa depois que um gestor aprova.
-- O primeiro usuário cadastrado vira gestor automaticamente.
-- =====================================================================

-- ---------- Funções auxiliares (usadas nas regras de acesso) ----------
create or replace function public.usuario_ativo()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo);
$$;

create or replace function public.eh_gestor()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo and papel = 'gestor');
$$;

create or replace function public.pode_editar_unidade(alvo uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.perfis p
    where p.id = auth.uid() and p.ativo
      and (p.papel = 'gestor' or (p.papel = 'coordenador' and p.unidade_id = alvo))
  );
$$;

create or replace function public.unidade_da_equipe(equipe uuid)
returns uuid language sql stable security definer set search_path = ''
as $$
  select unidade_id from public.equipes where id = equipe;
$$;

-- ---------- updated_at automático ----------
create or replace function public.tocar_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['unidades','perfis','equipes','competencias','restricoes',
                           'pendencias','coletas','indicadores','lancamentos']
  loop
    execute format('create trigger %I_updated_at before update on public.%I
                    for each row execute function public.tocar_updated_at()', t, t);
  end loop;
end $$;

-- ---------- Perfil criado automaticamente no cadastro ----------
create or replace function public.criar_perfil_novo_usuario()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  ja_tem_gestor boolean;
begin
  -- trava para que dois cadastros simultâneos não virem gestores
  perform pg_advisory_xact_lock(hashtext('primeiro_gestor'));
  select exists (select 1 from public.perfis where papel = 'gestor') into ja_tem_gestor;

  insert into public.perfis (id, nome, email, papel, ativo)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)),
    coalesce(new.email, ''),
    case when ja_tem_gestor then 'profissional'::public.papel_usuario else 'gestor'::public.papel_usuario end,
    not ja_tem_gestor
  );
  return new;
end;
$$;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();

-- ---------- Proteção do perfil ----------
-- Usuário comum só pode mudar o próprio nome. Papel, unidade e status: só gestor.
-- Também impede que o sistema fique sem nenhum gestor ativo.
create or replace function public.proteger_perfil()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  -- auth.uid() nulo = administrador do banco (SQL Editor), que pode tudo
  if auth.uid() is not null and not public.eh_gestor() then
    if new.papel is distinct from old.papel
       or new.unidade_id is distinct from old.unidade_id
       or new.ativo is distinct from old.ativo
       or new.email is distinct from old.email then
      raise exception 'Somente gestores podem alterar papel, unidade ou status de usuários.';
    end if;
  end if;

  if old.papel = 'gestor' and old.ativo and (new.papel <> 'gestor' or not new.ativo) then
    if (select count(*) from public.perfis where papel = 'gestor' and ativo and id <> old.id) = 0 then
      raise exception 'O sistema precisa de pelo menos um gestor ativo.';
    end if;
  end if;

  if new.papel = 'coordenador' and new.unidade_id is null then
    raise exception 'Coordenador precisa estar vinculado a uma unidade.';
  end if;
  return new;
end;
$$;

create trigger perfis_protecao before update on public.perfis
  for each row execute function public.proteger_perfil();

-- ---------- Versão das fórmulas (rastreabilidade) ----------
-- Se a fórmula de um indicador muda, a versão sobe sozinha.
create or replace function public.versionar_indicador()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.tipo is distinct from old.tipo
     or new.numerador_desc is distinct from old.numerador_desc
     or new.denominador_desc is distinct from old.denominador_desc
     or new.fator is distinct from old.fator then
    new.versao := old.versao + 1;
  end if;
  return new;
end;
$$;

create trigger indicadores_versao before update on public.indicadores
  for each row execute function public.versionar_indicador();

-- Cada lançamento guarda a versão da fórmula vigente no momento e valida o denominador.
create or replace function public.preparar_lancamento()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  ind record;
begin
  select tipo, versao, fator into ind from public.indicadores where id = new.indicador_id;
  new.versao_formula := ind.versao;
  new.tipo_aplicado := ind.tipo;
  new.fator_aplicado := ind.fator;
  if ind.tipo <> 'contagem' and (new.denominador is null or new.denominador = 0) then
    raise exception 'Este indicador exige denominador maior que zero.';
  end if;
  if ind.tipo = 'contagem' then
    new.denominador := null;
  end if;
  new.competencia := date_trunc('month', new.competencia)::date;
  return new;
end;
$$;

create trigger lancamentos_preparar before insert or update on public.lancamentos
  for each row execute function public.preparar_lancamento();

-- ---------- Auditoria ----------
create or replace function public.registrar_auditoria()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  registro jsonb;
begin
  registro := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.auditoria (tabela, registro_id, acao, usuario_id, usuario_email, dados_antes, dados_depois)
  values (
    tg_table_name,
    coalesce(registro ->> 'id', registro ->> 'equipe_id' || ':' || (registro ->> 'atividade_id')),
    tg_op,
    auth.uid(),
    (select email from public.perfis where id = auth.uid()),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['unidades','perfis','atividades','equipes','competencias','restricoes',
                           'pendencias','coletas','indicadores','lancamentos']
  loop
    execute format('create trigger %I_auditoria after insert or update or delete on public.%I
                    for each row execute function public.registrar_auditoria()', t, t);
  end loop;
end $$;

-- ---------- Visão com o valor calculado do indicador ----------
create view public.v_lancamentos with (security_invoker = true) as
select
  l.*,
  i.codigo, i.nome as indicador_nome, i.unidade_medida, i.meta, i.sentido_meta,
  i.versao as versao_atual,
  u.nome as unidade_nome,
  -- usa a fórmula congelada no lançamento, não a atual (rastreabilidade)
  case
    when l.tipo_aplicado = 'contagem' then l.numerador
    else round(l.numerador / nullif(l.denominador, 0) * l.fator_aplicado, 2)
  end as valor
from public.lancamentos l
join public.indicadores i on i.id = l.indicador_id
join public.unidades u on u.id = l.unidade_id;

-- ---------- Row Level Security (quem vê / quem edita) ----------
alter table public.unidades     enable row level security;
alter table public.perfis       enable row level security;
alter table public.atividades   enable row level security;
alter table public.equipes      enable row level security;
alter table public.competencias enable row level security;
alter table public.restricoes   enable row level security;
alter table public.pendencias   enable row level security;
alter table public.coletas      enable row level security;
alter table public.indicadores  enable row level security;
alter table public.lancamentos  enable row level security;
alter table public.auditoria    enable row level security;

-- Leitura: qualquer usuário ATIVO (dados agregados, sem pacientes)
create policy "leitura usuarios ativos" on public.unidades     for select to authenticated using (public.usuario_ativo());
create policy "leitura usuarios ativos" on public.atividades   for select to authenticated using (public.usuario_ativo());
create policy "leitura usuarios ativos" on public.equipes      for select to authenticated using (public.usuario_ativo());
create policy "leitura usuarios ativos" on public.competencias for select to authenticated using (public.usuario_ativo());
create policy "leitura usuarios ativos" on public.restricoes   for select to authenticated using (public.usuario_ativo());
create policy "leitura usuarios ativos" on public.pendencias   for select to authenticated using (public.usuario_ativo());
create policy "leitura usuarios ativos" on public.coletas      for select to authenticated using (public.usuario_ativo());
create policy "leitura usuarios ativos" on public.indicadores  for select to authenticated using (public.usuario_ativo());
create policy "leitura usuarios ativos" on public.lancamentos  for select to authenticated using (public.usuario_ativo());

-- Perfis: cada um vê o seu; gestor vê todos
create policy "ver proprio perfil ou gestor" on public.perfis for select to authenticated
  using (id = (select auth.uid()) or public.eh_gestor());
create policy "editar proprio perfil ou gestor" on public.perfis for update to authenticated
  using (id = (select auth.uid()) or public.eh_gestor())
  with check (id = (select auth.uid()) or public.eh_gestor());

-- Auditoria: só gestor lê; ninguém escreve direto (só os gatilhos)
create policy "gestor le auditoria" on public.auditoria for select to authenticated using (public.eh_gestor());

-- Cadastros gerais: só gestor
create policy "gestor gerencia unidades" on public.unidades for insert to authenticated with check (public.eh_gestor());
create policy "editar unidade" on public.unidades for update to authenticated
  using (public.pode_editar_unidade(id)) with check (public.pode_editar_unidade(id));
create policy "gestor remove unidades" on public.unidades for delete to authenticated using (public.eh_gestor());

create policy "gestor gerencia atividades" on public.atividades for insert to authenticated with check (public.eh_gestor());
create policy "gestor edita atividades" on public.atividades for update to authenticated using (public.eh_gestor()) with check (public.eh_gestor());
create policy "gestor remove atividades" on public.atividades for delete to authenticated using (public.eh_gestor());

create policy "gestor gerencia indicadores" on public.indicadores for insert to authenticated with check (public.eh_gestor());
create policy "gestor edita indicadores" on public.indicadores for update to authenticated using (public.eh_gestor()) with check (public.eh_gestor());
create policy "gestor remove indicadores" on public.indicadores for delete to authenticated using (public.eh_gestor());

-- Dados por unidade: gestor ou coordenador daquela unidade
create policy "inserir por unidade" on public.equipes for insert to authenticated with check (public.pode_editar_unidade(unidade_id));
create policy "editar por unidade" on public.equipes for update to authenticated
  using (public.pode_editar_unidade(unidade_id)) with check (public.pode_editar_unidade(unidade_id));
create policy "remover por unidade" on public.equipes for delete to authenticated using (public.pode_editar_unidade(unidade_id));

create policy "inserir por unidade" on public.competencias for insert to authenticated
  with check (public.pode_editar_unidade(public.unidade_da_equipe(equipe_id)));
create policy "editar por unidade" on public.competencias for update to authenticated
  using (public.pode_editar_unidade(public.unidade_da_equipe(equipe_id)))
  with check (public.pode_editar_unidade(public.unidade_da_equipe(equipe_id)));
create policy "remover por unidade" on public.competencias for delete to authenticated
  using (public.pode_editar_unidade(public.unidade_da_equipe(equipe_id)));

create policy "inserir por unidade" on public.restricoes for insert to authenticated with check (public.pode_editar_unidade(unidade_id));
create policy "editar por unidade" on public.restricoes for update to authenticated
  using (public.pode_editar_unidade(unidade_id)) with check (public.pode_editar_unidade(unidade_id));
create policy "remover por unidade" on public.restricoes for delete to authenticated using (public.pode_editar_unidade(unidade_id));

-- Pendências sem unidade (valem para todas) só o gestor mexe
create policy "inserir pendencia" on public.pendencias for insert to authenticated
  with check (case when unidade_id is null then public.eh_gestor() else public.pode_editar_unidade(unidade_id) end);
create policy "editar pendencia" on public.pendencias for update to authenticated
  using (case when unidade_id is null then public.eh_gestor() else public.pode_editar_unidade(unidade_id) end)
  with check (case when unidade_id is null then public.eh_gestor() else public.pode_editar_unidade(unidade_id) end);
create policy "remover pendencia" on public.pendencias for delete to authenticated
  using (case when unidade_id is null then public.eh_gestor() else public.pode_editar_unidade(unidade_id) end);

create policy "inserir por unidade" on public.coletas for insert to authenticated with check (public.pode_editar_unidade(unidade_id));
create policy "editar por unidade" on public.coletas for update to authenticated
  using (public.pode_editar_unidade(unidade_id)) with check (public.pode_editar_unidade(unidade_id));
create policy "remover por unidade" on public.coletas for delete to authenticated using (public.pode_editar_unidade(unidade_id));

create policy "inserir por unidade" on public.lancamentos for insert to authenticated with check (public.pode_editar_unidade(unidade_id));
create policy "editar por unidade" on public.lancamentos for update to authenticated
  using (public.pode_editar_unidade(unidade_id)) with check (public.pode_editar_unidade(unidade_id));
create policy "remover por unidade" on public.lancamentos for delete to authenticated using (public.pode_editar_unidade(unidade_id));

-- Visitantes não logados não acessam nada
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;
