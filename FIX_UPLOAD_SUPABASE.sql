-- FIX UPLOAD SUPABASE - Closing Emas
-- Aman dijalankan ulang. Script ini TIDAK menghapus data aplikasi.
-- Tujuan: memastikan hak akses Admin untuk upload DATA MULIA.xlsx dan CSV Mulia Lunas.

begin;

alter table if exists public.mulia_records enable row level security;
alter table if exists public.risk_records enable row level security;
alter table if exists public.risk_meta enable row level security;

-- Policy Mulia Lunas
DROP POLICY IF EXISTS mulia_read_active ON public.mulia_records;
CREATE POLICY mulia_read_active ON public.mulia_records
FOR SELECT TO authenticated USING (public.is_active_user());

DROP POLICY IF EXISTS mulia_admin_insert ON public.mulia_records;
CREATE POLICY mulia_admin_insert ON public.mulia_records
FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS mulia_delete_active ON public.mulia_records;
CREATE POLICY mulia_delete_active ON public.mulia_records
FOR DELETE TO authenticated USING (public.is_active_user());

-- Policy Monitoring KOL/LAR/NPL
DROP POLICY IF EXISTS risk_read_active ON public.risk_records;
CREATE POLICY risk_read_active ON public.risk_records
FOR SELECT TO authenticated USING (public.is_active_user());

DROP POLICY IF EXISTS risk_admin_insert ON public.risk_records;
CREATE POLICY risk_admin_insert ON public.risk_records
FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS risk_admin_delete ON public.risk_records;
CREATE POLICY risk_admin_delete ON public.risk_records
FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS risk_meta_read_active ON public.risk_meta;
CREATE POLICY risk_meta_read_active ON public.risk_meta
FOR SELECT TO authenticated USING (public.is_active_user());

DROP POLICY IF EXISTS risk_meta_admin_insert ON public.risk_meta;
CREATE POLICY risk_meta_admin_insert ON public.risk_meta
FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS risk_meta_admin_update ON public.risk_meta;
CREATE POLICY risk_meta_admin_update ON public.risk_meta
FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- RPC Mulia Lunas dibuat ulang agar import CSV batch selalu tersedia.
create or replace function public.bulk_insert_mulia(p_records jsonb, p_last_import text default '')
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  item jsonb;
  row_data jsonb;
  rec_id text;
  sig text;
  affected integer;
  added integer := 0;
  skipped integer := 0;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  for item in select value from jsonb_array_elements(coalesce(p_records,'[]'::jsonb)) loop
    row_data := coalesce(item->'data','{}'::jsonb);
    if jsonb_typeof(row_data) <> 'object' or row_data='{}'::jsonb then continue; end if;
    rec_id := coalesce(nullif(item->>'id',''),'m' || replace(gen_random_uuid()::text,'-',''));
    sig := md5(row_data::text);
    insert into public.mulia_records(id,data,signature,created_by)
    values(rec_id,row_data,sig,auth.uid())
    on conflict do nothing;
    get diagnostics affected = row_count;
    if affected=1 then added:=added+1; else skipped:=skipped+1; end if;
  end loop;
  if btrim(coalesce(p_last_import,'')) <> '' then
    insert into public.settings(key,value) values('mulia_last_import',p_last_import)
    on conflict(key) do update set value=excluded.value;
  end if;
  return jsonb_build_object('added',added,'skipped',skipped);
end;
$$;

revoke all on public.mulia_records, public.risk_records, public.risk_meta from anon;
grant usage on schema public to authenticated;
grant select,insert,delete on public.mulia_records to authenticated;
grant select,insert,delete on public.risk_records to authenticated;
grant select,insert,update,delete on public.risk_meta to authenticated;
grant usage,select on all sequences in schema public to authenticated;
revoke execute on function public.bulk_insert_mulia(jsonb,text) from public, anon;
grant execute on function public.bulk_insert_mulia(jsonb,text) to authenticated;

commit;
