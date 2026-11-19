create table public.auditflow_records (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  kind text not null check (kind in ('template', 'snapshot', 'audit', 'answer', 'finding', 'capa')),
  data jsonb not null,
  deleted boolean not null default false,
  version integer not null check (version > 0),
  revision bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id),
  unique (owner_id, revision)
);

create index auditflow_records_kind on public.auditflow_records (owner_id, kind) where not deleted;
create unique index auditflow_snapshot_numbers on public.auditflow_records (owner_id, (data->>'templateId'), (data->>'number')) where kind = 'snapshot';
create unique index auditflow_answer_questions on public.auditflow_records (owner_id, (data->>'auditId'), (data->>'questionId')) where kind = 'answer';
create index auditflow_findings_audit on public.auditflow_records (owner_id, (data->>'auditId')) where kind = 'finding' and not deleted;
create unique index auditflow_capa_finding on public.auditflow_records (owner_id, (data->>'findingId')) where kind = 'capa' and not deleted;

create table public.auditflow_receipts (
  owner_id uuid not null references auth.users(id) on delete cascade,
  mutation_key uuid not null,
  request_hash bytea not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, mutation_key)
);

alter table public.auditflow_records enable row level security;
alter table public.auditflow_receipts enable row level security;
revoke all on public.auditflow_records, public.auditflow_receipts from public, anon, authenticated;
grant select on public.auditflow_records to authenticated;
create policy auditflow_read_own on public.auditflow_records for select to authenticated using (owner_id = (select auth.uid()));

create function public.auditflow_field(payload jsonb, field text, max_length int, required boolean default false)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(payload->field) = 'string' and length(payload->>field) <= max_length
    and (not required or (payload->>field) ~ '[^[:space:]]'), false)
$$;

create function public.auditflow_blueprint(payload jsonb, publishing boolean)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  s jsonb;
  q jsonb;
  o jsonb;
  qtype text;
  ids uuid[] := '{}';
  labels text[];
  option_ids uuid[];
  scores int;
  identifier uuid;
begin
  if not public.auditflow_field(payload, 'name', 160, publishing) or not public.auditflow_field(payload, 'description', 4000)
     or jsonb_typeof(payload->'sections') is distinct from 'array' then return false; end if;
  if jsonb_array_length(payload->'sections') > 20 or (publishing and jsonb_array_length(payload->'sections') = 0) then return false; end if;
  for s in select value from jsonb_array_elements(payload->'sections') loop
    identifier := (s->>'id')::uuid;
    if identifier is null or identifier = any(ids) or not public.auditflow_field(s, 'title', 160, publishing)
       or jsonb_typeof(s->'questions') is distinct from 'array' then return false; end if;
    ids := array_append(ids, identifier);
    if jsonb_array_length(s->'questions') > 80 or (publishing and jsonb_array_length(s->'questions') = 0) then return false; end if;
    for q in select value from jsonb_array_elements(s->'questions') loop
      identifier := (q->>'id')::uuid;
      qtype := q->>'type';
      if identifier is null or identifier = any(ids) or not public.auditflow_field(q, 'title', 160, publishing)
         or not public.auditflow_field(q, 'description', 4000) or jsonb_typeof(q->'required') is distinct from 'boolean'
         or coalesce(qtype, '') not in ('boolean','text','number','date','rating','select','multiselect')
         or coalesce(q->>'severity', '') not in ('low','medium','high','critical')
         or jsonb_typeof(q->'weight') is distinct from 'number' or (q->>'weight')::numeric not between 0 and 1000 or (q->>'weight')::numeric = 0
         or jsonb_typeof(q->'options') is distinct from 'array' then return false; end if;
      ids := array_append(ids, identifier);
      if jsonb_array_length(q->'options') > 30 then return false; end if;
      labels := '{}'; option_ids := '{}'; scores := 0;
      for o in select value from jsonb_array_elements(q->'options') loop
        identifier := (o->>'id')::uuid;
        if identifier is null or identifier = any(option_ids) or not public.auditflow_field(o, 'label', 160, publishing) then return false; end if;
        option_ids := array_append(option_ids, identifier);
        labels := array_append(labels, lower(btrim(o->>'label')));
        if o->'score' is distinct from 'null'::jsonb then
          if jsonb_typeof(o->'score') is distinct from 'number' or (o->>'score')::numeric not between 0 and 1 then return false; end if;
          scores := scores + 1;
        end if;
      end loop;
      if publishing then
        if qtype in ('select','multiselect','rating') then
          if cardinality(labels) < 2 or cardinality(labels) <> (select count(distinct value) from unnest(labels) as value)
             or (qtype = 'rating' and labels <> array['1','2','3','4','5'])
             or scores not in (0, cardinality(labels)) then return false; end if;
        elsif cardinality(labels) <> 0 then return false;
        end if;
      end if;
    end loop;
  end loop;
  return true;
end;
$$;

create function public.auditflow_question(owner uuid, snapshot uuid, question_id text)
returns jsonb language sql stable set search_path = '' as $$
  select q.value from public.auditflow_records r
  cross join lateral jsonb_array_elements(r.data->'sections') s
  cross join lateral jsonb_array_elements(s.value->'questions') q
  where r.owner_id = owner and r.id = snapshot and r.kind = 'snapshot' and not r.deleted and q.value->>'id' = question_id
$$;

create function public.auditflow_answer_valid(question jsonb, answer jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  response jsonb := answer->'value';
  value_text text := answer->>'value';
begin
  if question is null or response is null or not public.auditflow_field(answer, 'notes', 4000) then return false; end if;
  if response = 'null'::jsonb then return true; end if;
  case question->>'type'
    when 'boolean' then return jsonb_typeof(response) = 'string' and value_text in ('yes','no','na');
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

create function public.auditflow_answered(response jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select case jsonb_typeof(response)
    when 'string' then (response #>> '{}') ~ '[^[:space:]]'
    when 'array' then jsonb_array_length(response) > 0
    when 'number' then true
    else false end
$$;

create function public.auditflow_child_id(parent_id uuid, child_key text)
returns uuid language sql immutable strict set search_path = '' as $$
  with hashed as (select encode(sha256(convert_to(concat(parent_id::text,'/',child_key), 'UTF8')), 'hex') as h)
  select concat(substr(h,1,8),'-',substr(h,9,4),'-8',substr(h,14,3),'-8',substr(h,18,3),'-',substr(h,21,12))::uuid from hashed
$$;

create function public.auditflow_history(payload jsonb, prior jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  events jsonb := payload->'events';
  old_events jsonb := prior->'events';
begin
  if jsonb_typeof(events) is distinct from 'array' then return false; end if;
  if prior->>'status' = payload->>'status' then return events = old_events; end if;
  return jsonb_array_length(events) = coalesce(jsonb_array_length(old_events), 0) + 1
    and (old_events is null or (events - (jsonb_array_length(events) - 1)) = old_events)
    and (events->-1->>'status') is not distinct from (payload->>'status')
    and public.auditflow_field(events->-1, 'at', 32, true)
    and events->-1->>'at' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$'
    and (events->-1->>'at')::timestamptz is not null;
end;
$$;

create function public.apply_auditflow_mutation(p_owner uuid, p_key uuid, p_id uuid, p_kind text, p_base integer, p_data jsonb, p_deleted boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  current_row public.auditflow_records;
  parent public.auditflow_records;
  other public.auditflow_records;
  receipt public.auditflow_receipts;
  digest bytea;
  output jsonb;
  status text := p_data->>'status';
  previous text;
  next_revision bigint;
  question jsonb;
begin
  if actor is null or p_owner is distinct from actor then raise exception 'Account mismatch' using errcode = '42501'; end if;
  if p_key is null or p_id is null or p_base is null or p_base < 0 or p_deleted is null or p_kind is null
     or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text) > 524288 then
    raise exception 'Invalid mutation' using errcode = '22023';
  end if;
  -- Per-owner serialization keeps revisions commit-ordered and validates parent state atomically.
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 0));
  digest := sha256(convert_to(jsonb_build_array(p_id,p_kind,p_base,p_data,p_deleted)::text, 'UTF8'));
  select * into receipt from public.auditflow_receipts where owner_id = actor and mutation_key = p_key;
  if found then
    if receipt.request_hash <> digest then raise exception 'Mutation key reused with different content' using errcode = '22023'; end if;
    return receipt.result;
  end if;
  select * into current_row from public.auditflow_records where owner_id = actor and id = p_id;
  if p_kind = 'answer' and (current_row.id is null or current_row.kind = 'answer') then
    select * into parent from public.auditflow_records where owner_id = actor and id = (p_data->>'auditId')::uuid and kind = 'audit' and not deleted;
    if parent.data->>'status' in ('completed','archived') and p_id = public.auditflow_child_id(parent.id,p_data->>'questionId') then
      return jsonb_build_object('state','conflict','row',case when current_row.id is not null then to_jsonb(current_row) - 'owner_id' end,
        'reason','This inspection was finalized elsewhere. Export pending changes before keeping the server version.');
    end if;
  end if;
  if coalesce(current_row.version, 0) <> p_base then
    if current_row.id is null then raise exception 'Base record is unavailable' using errcode = '22023'; end if;
    return jsonb_build_object('state','conflict','row',to_jsonb(current_row) - 'owner_id');
  end if;
  if current_row.id is not null and (current_row.kind <> p_kind or current_row.deleted or p_kind = 'snapshot') then
    raise exception 'Record is immutable' using errcode = '22023';
  end if;
  if p_deleted then
    if p_kind <> 'template' or current_row.id is null or exists (select 1 from public.auditflow_records
      where owner_id = actor and kind = 'snapshot' and data->>'templateId' = p_id::text) then
      raise exception 'Only unpublished checklists can be deleted' using errcode = '22023';
    end if;
    p_data := current_row.data;
  else
    previous := current_row.data->>'status';
    case p_kind
      when 'template' then
        if coalesce(status,'') not in ('draft','published','archived') or not public.auditflow_blueprint(p_data, false)
           or (status = 'published' and not exists (select 1 from public.auditflow_records where owner_id = actor and kind = 'snapshot' and data->>'templateId' = p_id::text)) then
          raise exception 'Invalid checklist' using errcode = '22023';
        end if;
      when 'snapshot' then
        select * into parent from public.auditflow_records where owner_id = actor and id = (p_data->>'templateId')::uuid and kind = 'template' and not deleted;
        if parent.id is null or not public.auditflow_blueprint(p_data, true)
           or jsonb_typeof(p_data->'number') is distinct from 'number' or (p_data->>'number')::int < 1 then
          raise exception 'Invalid checklist version' using errcode = '22023';
        end if;
        select coalesce(max((data->>'number')::int),0) + 1 into next_revision from public.auditflow_records
          where owner_id = actor and kind = 'snapshot' and data->>'templateId' = parent.id::text;
        p_data := jsonb_set(p_data, '{number}', to_jsonb(next_revision));
      when 'audit' then
        select * into parent from public.auditflow_records where owner_id = actor and id = (p_data->>'snapshotId')::uuid and kind = 'snapshot' and not deleted;
        if parent.id is null or (current_row.id is not null and current_row.data->>'snapshotId' is distinct from (p_data->>'snapshotId'))
           or not public.auditflow_field(p_data, 'title', 160, true) or not public.auditflow_field(p_data, 'entity', 160, true)
           or not public.auditflow_field(p_data, 'location', 160) or not public.auditflow_field(p_data, 'notes', 4000)
           or not public.auditflow_field(p_data, 'date', 10, true) or p_data->>'date' !~ '^\d{4}-\d{2}-\d{2}$'
           or to_char((p_data->>'date')::date, 'YYYY-MM-DD') <> p_data->>'date'
           or coalesce(status,'') not in ('draft','in_progress','completed','archived') or not public.auditflow_history(p_data,current_row.data) then
          raise exception 'Invalid inspection' using errcode = '22023';
        end if;
        if not coalesce(case coalesce(previous,'new')
          when 'new' then status in ('draft','in_progress')
          when 'draft' then status in ('draft','in_progress','completed','archived')
          when 'in_progress' then status in ('in_progress','completed','archived')
          when 'completed' then status in ('in_progress','archived') and (p_data - 'status' - 'events') = (current_row.data - 'status' - 'events')
          else false end,false) then raise exception 'Invalid inspection transition' using errcode = '22023'; end if;
        if status = 'completed' and exists (
          select 1 from jsonb_array_elements(parent.data->'sections') s cross join lateral jsonb_array_elements(s.value->'questions') q
          where q.value->>'required' = 'true' and not exists (
            select 1 from public.auditflow_records a where a.owner_id = actor and a.kind = 'answer' and not a.deleted
            and a.data->>'auditId' = p_id::text and a.data->>'questionId' = q.value->>'id' and public.auditflow_answered(a.data->'value')
          )
        ) then return jsonb_build_object('state','conflict','row',to_jsonb(current_row) - 'owner_id',
          'reason','The server is missing required answers. Keep the server status and review the responses before completing again.'); end if;
      when 'answer' then
        question := public.auditflow_question(actor, (parent.data->>'snapshotId')::uuid, p_data->>'questionId');
        if parent.id is null or parent.data->>'status' in ('completed','archived') or not public.auditflow_answer_valid(question,p_data)
           or p_id is distinct from public.auditflow_child_id(parent.id,p_data->>'questionId') then
          raise exception 'Invalid response or inspection is read-only' using errcode = '22023';
        end if;
      when 'finding' then
        select * into parent from public.auditflow_records where owner_id = actor and id = (p_data->>'auditId')::uuid and kind = 'audit' and not deleted;
        if parent.id is null or (current_row.id is not null and current_row.data->>'auditId' is distinct from (p_data->>'auditId'))
           or not (p_data ? 'questionId') or (p_data->'questionId' <> 'null'::jsonb and public.auditflow_question(actor, (parent.data->>'snapshotId')::uuid, p_data->>'questionId') is null)
           or not public.auditflow_field(p_data, 'title', 160, true) or not public.auditflow_field(p_data, 'details', 4000)
           or coalesce(p_data->>'severity','') not in ('low','medium','high','critical') or coalesce(status,'') not in ('open','closed') then
          raise exception 'Invalid finding' using errcode = '22023';
        end if;
      when 'capa' then
        select * into other from public.auditflow_records where owner_id = actor and id = (p_data->>'findingId')::uuid and kind = 'finding' and not deleted;
        if other.id is null or p_id is distinct from public.auditflow_child_id(other.id,'capa') or (current_row.id is not null and current_row.data->>'findingId' is distinct from (p_data->>'findingId'))
           or not public.auditflow_field(p_data, 'rootCause', 4000) or not public.auditflow_field(p_data, 'corrective', 4000, true)
           or not public.auditflow_field(p_data, 'preventive', 4000) or not public.auditflow_field(p_data, 'assignee', 160)
           or not public.auditflow_field(p_data, 'dueDate', 10) or not public.auditflow_field(p_data, 'verification', 4000)
           or (p_data->>'dueDate' <> '' and (p_data->>'dueDate' !~ '^\d{4}-\d{2}-\d{2}$' or to_char((p_data->>'dueDate')::date,'YYYY-MM-DD') <> p_data->>'dueDate'))
           or coalesce(status,'') not in ('open','in_progress','pending_verification','verified','ineffective','closed')
           or (status in ('verified','ineffective') and not public.auditflow_field(p_data, 'verification', 4000, true))
           or not public.auditflow_history(p_data,current_row.data) then raise exception 'Invalid corrective action' using errcode = '22023'; end if;
      else raise exception 'Unknown record type' using errcode = '22023';
    end case;
  end if;

  select coalesce(max(revision),0) + 1 into next_revision from public.auditflow_records where owner_id = actor;
  insert into public.auditflow_records(owner_id,id,kind,data,deleted,version,revision)
  values (actor,p_id,p_kind,p_data,p_deleted,p_base+1,next_revision)
  on conflict (owner_id,id) do update set data = excluded.data, deleted = excluded.deleted, version = excluded.version,
     revision = excluded.revision, updated_at = now()
  returning * into current_row;
  output := jsonb_build_object('state','applied','row',to_jsonb(current_row) - 'owner_id');
  insert into public.auditflow_receipts(owner_id,mutation_key,request_hash,result) values(actor,p_key,digest,output);
  return output;
end;
$$;

revoke execute on function public.auditflow_field(jsonb,text,int,boolean), public.auditflow_blueprint(jsonb,boolean),
  public.auditflow_question(uuid,uuid,text), public.auditflow_answer_valid(jsonb,jsonb), public.auditflow_answered(jsonb),
  public.auditflow_history(jsonb,jsonb), public.auditflow_child_id(uuid,text), public.apply_auditflow_mutation(uuid,uuid,uuid,text,integer,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.apply_auditflow_mutation(uuid,uuid,uuid,text,integer,jsonb,boolean) to authenticated;
