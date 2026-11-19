insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('auditflow-evidence','auditflow-evidence',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf']);

create policy auditflow_evidence_read on storage.objects for select to authenticated using (
  bucket_id = 'auditflow-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy auditflow_evidence_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'auditflow-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.auditflow_records r where r.owner_id = (select auth.uid())
    and r.kind = 'audit' and not r.deleted and r.id::text = (storage.foldername(name))[2])
);

create policy auditflow_evidence_delete on storage.objects for delete to authenticated using (
  bucket_id = 'auditflow-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text
);
