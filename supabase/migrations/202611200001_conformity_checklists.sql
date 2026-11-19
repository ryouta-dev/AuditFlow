create or replace function public.auditflow_answer_valid(question jsonb, answer jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  response jsonb := answer->'value';
  value_text text := answer->>'value';
begin
  if question is null or response is null or not public.auditflow_field(answer, 'notes', 4000) then return false; end if;
  if response = 'null'::jsonb then return true; end if;
  case question->>'type'
    when 'boolean' then return jsonb_typeof(response) = 'string' and value_text in ('yes','no','na','unverified');
    when 'text' then return public.auditflow_field(answer, 'value', 4000);
    when 'number' then return jsonb_typeof(response) = 'number';
    when 'date' then return jsonb_typeof(response) = 'string' and value_text ~ '^\d{4}-\d{2}-\d{2}$' and to_char(value_text::date, 'YYYY-MM-DD') = value_text;
    when 'multiselect' then
      if jsonb_typeof(response) <> 'array' or jsonb_array_length(response) > 30 then return false; end if;
      return jsonb_array_length(response) = (select count(distinct v.value) from jsonb_array_elements_text(response) v
        where exists (select 1 from jsonb_array_elements(question->'options') o where o.value->>'id' = v.value));
    else return jsonb_typeof(response) = 'string' and exists (select 1 from jsonb_array_elements(question->'options') o where o.value->>'id' = value_text);
  end case;
end;
$$;

create function public.auditflow_conformity_rules()
returns trigger language plpgsql set search_path = '' as $$
declare
  snapshot jsonb;
begin
  if new.kind in ('template', 'snapshot') and new.data ? 'assessment' then
    if new.data->>'assessment' is distinct from 'conformity' or exists (
      select 1 from jsonb_array_elements(new.data->'sections') s
      cross join lateral jsonb_array_elements(s.value->'questions') q
      where q.value->>'type' is distinct from 'boolean'
        or q.value->'required' is distinct from 'true'::jsonb
        or q.value->'weight' is distinct from '1'::jsonb
        or (q.value ? 'source' and not public.auditflow_field(q.value, 'source', 400))
    ) then raise exception 'Invalid conformity checklist' using errcode = '23514';
    end if;
  end if;

  if new.kind = 'audit' and new.data->>'status' = 'completed' then
    select data into snapshot from public.auditflow_records
    where owner_id = new.owner_id and kind = 'snapshot' and not deleted
      and id = (new.data->>'snapshotId')::uuid;
    if snapshot->>'assessment' = 'conformity' and exists (
      select 1 from jsonb_array_elements(snapshot->'sections') s
      cross join lateral jsonb_array_elements(s.value->'questions') q
      where not exists (
        select 1 from public.auditflow_records a
        where a.owner_id = new.owner_id and a.kind = 'answer' and not a.deleted
          and a.data->>'auditId' = new.id::text and a.data->>'questionId' = q.value->>'id'
          and (a.data->>'value' = 'yes' or (
            a.data->>'value' in ('no','na','unverified')
            and public.auditflow_field(a.data, 'notes', 4000, true)
          ))
      )
    ) then raise exception 'AuditFlow: incomplete conformity results' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.auditflow_conformity_rules() from public, anon, authenticated;

create trigger auditflow_conformity_rules
before insert or update on public.auditflow_records
for each row execute function public.auditflow_conformity_rules();
