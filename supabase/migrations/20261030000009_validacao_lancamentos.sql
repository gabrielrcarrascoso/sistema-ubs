-- =====================================================================
-- Validação dos números lançados: quem validou e quando.
-- Pode validar quem pode editar a UBS (administrador geral ou o da própria UBS).
-- Se o número mudar depois de validado, ele volta a "a validar".
-- =====================================================================

alter table public.lancamentos
  add column validado_por uuid references auth.users (id) on delete set null,
  add column validado_em timestamptz;

create or replace function public.marcar_validacao()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.validado and old.validado
     and (new.numerador is distinct from old.numerador
          or new.denominador is distinct from old.denominador
          or new.competencia is distinct from old.competencia
          or new.indicador_id is distinct from old.indicador_id
          or new.unidade_id is distinct from old.unidade_id) then
    new.validado := false;  -- mudou o número: precisa validar de novo
  end if;
  if new.validado and (tg_op = 'INSERT' or not old.validado) then
    new.validado_por := auth.uid();
    new.validado_em := now();
  elsif not new.validado then
    new.validado_por := null;
    new.validado_em := null;
  end if;
  return new;
end;
$$;

create trigger lancamentos_validacao before insert or update on public.lancamentos
  for each row execute function public.marcar_validacao();

-- a visão precisa ser recriada para incluir as colunas novas
drop view public.v_lancamentos;
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
revoke execute on function public.marcar_validacao() from anon;
