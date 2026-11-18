-- Upgrade import processing for already provisioned databases.

alter table public.import_batches add column if not exists duplicate_strategy text not null default 'skip';
alter table public.import_batches drop constraint if exists import_batches_duplicate_strategy_check;
alter table public.import_batches add constraint import_batches_duplicate_strategy_check check(duplicate_strategy in ('skip','update','create_anyway'));
drop function if exists public.create_import_batch(text,text);

create or replace function public.create_import_batch(p_file_name text,p_target text default 'properties',p_duplicate_strategy text default 'skip')
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare batch_id uuid;
begin
  if auth.uid() is null or not public.has_permission('imports','import') then raise exception 'Import permission is required'; end if;
  if p_target not in ('properties','clients','requests','follow_ups','lookups') then raise exception 'Unsupported import target'; end if;
  if p_duplicate_strategy not in ('skip','update','create_anyway') then raise exception 'Unsupported duplicate strategy'; end if;
  insert into public.import_batches(created_by,file_name,target,duplicate_strategy,status) values(auth.uid(),left(p_file_name,255),p_target,p_duplicate_strategy,'staged') returning id into batch_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data) values(auth.uid(),'import_start','import_batch',batch_id::text,jsonb_build_object('file_name',p_file_name,'target',p_target,'duplicate_strategy',p_duplicate_strategy));
  return batch_id;
end;
$$;
revoke all on function public.create_import_batch(text,text,text) from public,anon;
grant execute on function public.create_import_batch(text,text,text) to authenticated;

create or replace function public.process_import_batch(p_batch_id uuid,p_limit integer default 500)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  batch_row public.import_batches%rowtype;
  staged public.import_rows%rowtype;
  prop jsonb;
  client_record_id uuid;
  property_record_id uuid;
  existing_record public.properties%rowtype;
  assigned_record_id uuid;
  type_record_id uuid;
  offer_record_id uuid;
  area_record_id uuid;
  location_record_id uuid;
  phone_value text;
  phone_normalized text;
  processed integer:=0;
begin
  select * into batch_row from public.import_batches where id=p_batch_id for update;
  if not found or (batch_row.created_by<>auth.uid() and public.current_app_role() not in ('super_admin','manager')) then raise exception 'Import batch is unavailable'; end if;
  if not public.has_permission('imports','import') then raise exception 'Import permission is required'; end if;
  if batch_row.status='cancelled' then raise exception 'Import batch was cancelled'; end if;
  if batch_row.status='paused' then return jsonb_build_object('status','paused','processed',0); end if;
  if batch_row.target<>'properties' then raise exception 'This batch processor currently handles property imports only'; end if;
  if p_limit<1 or p_limit>500 then raise exception 'Process between 1 and 500 rows per request'; end if;
  update public.import_batches set status='processing',started_at=coalesce(started_at,now()) where id=p_batch_id;

  for staged in select * from public.import_rows where batch_id=p_batch_id and status='pending' order by row_number limit p_limit for update skip locked loop
    begin
      prop:=staged.mapped_row;
      property_record_id:=null;
      if batch_row.duplicate_strategy<>'create_anyway' then
        select * into existing_record from public.properties where code=prop->>'code' and deleted_at is null limit 1;
        property_record_id:=existing_record.id;
      end if;
      if property_record_id is not null and batch_row.duplicate_strategy='skip' then
        update public.import_rows set status='skipped',error_message='رمز العقار موجود مسبقاً',processed_at=now() where id=staged.id;
      else
        if property_record_id is not null then
          if not public.has_permission('properties','edit') or not public.can_view_record(existing_record.assigned_to) then
            update public.import_rows set status='skipped',error_message='لا تملك صلاحية تحديث العقار الموجود',processed_at=now() where id=staged.id;
            processed:=processed+1;
            continue;
          end if;
          update public.import_rows set before_data=to_jsonb(existing_record) where id=staged.id;
        end if;
        assigned_record_id:=auth.uid();
        if nullif(prop->>'employee','') is not null and prop->>'employee'<>'غير معيّن' then
          select id into assigned_record_id from public.profiles where full_name=prop->>'employee' and is_active limit 1;
          if assigned_record_id is null or (assigned_record_id<>auth.uid() and (not public.has_permission('properties','assign') or not public.can_view_record(assigned_record_id))) then
            assigned_record_id:=auth.uid();
          end if;
        end if;
        select id into type_record_id from public.lookups where type='property_type' and name_ar=prop->>'type' and is_active limit 1;
        select id into offer_record_id from public.lookups where type='offer_type' and name_ar=case prop->>'offer' when 'معروض للبيع' then 'للبيع' when 'معروض للإيجار' then 'للإيجار' when 'للبدل' then 'للبدل' else prop->>'offer' end and is_active limit 1;
        select id into area_record_id from public.lookups where type='area' and name_ar=prop->>'area' and is_active limit 1;
        select id into location_record_id from public.lookups where type='location_type' and name_ar=prop->>'locationType' and is_active limit 1;
        client_record_id:=null;
        for phone_value in select jsonb_array_elements_text(coalesce(prop->'phones','[]'::jsonb)) loop
          phone_normalized:=regexp_replace(phone_value,'\D','','g');if left(phone_normalized,3)='965' then phone_normalized:=substring(phone_normalized from 4);end if;
          select cp.client_id into client_record_id from public.client_phones cp where cp.normalized_phone=phone_normalized limit 1;
          exit when client_record_id is not null;
        end loop;
        if client_record_id is not null then
          if not exists(select 1 from public.clients c where c.id=client_record_id and public.can_view_record(c.assigned_to)) then
            update public.import_rows set status='skipped',error_message='رقم الهاتف مرتبط بعميل خارج نطاق صلاحيتك',processed_at=now() where id=staged.id;
            continue;
          end if;
        else
          if not public.has_permission('clients','create') then raise exception 'Client create permission is required for new imported clients'; end if;
          insert into public.clients(name,assigned_to,created_by) values(coalesce(nullif(prop->>'client',''),'عميل مستورد'),assigned_record_id,auth.uid()) returning id into client_record_id;
        end if;
        for phone_value in select jsonb_array_elements_text(coalesce(prop->'phones','[]'::jsonb)) loop
          phone_normalized:=regexp_replace(phone_value,'\D','','g');if left(phone_normalized,3)='965' then phone_normalized:=substring(phone_normalized from 4);end if;
          if phone_normalized<>'' then insert into public.client_phones(client_id,phone,normalized_phone,is_primary) values(client_record_id,phone_value,phone_normalized,not exists(select 1 from public.client_phones where client_id=client_record_id)) on conflict(client_id,normalized_phone) do nothing;end if;
        end loop;
        if existing_record.id is not null and batch_row.duplicate_strategy='update' then
          update public.properties set client_id=client_record_id,type_id=type_record_id,offer_type_id=offer_record_id,location_type_id=location_record_id,area_id=area_record_id,block=nullif(prop->>'block',''),plot=nullif(prop->>'plot',''),street=nullif(prop->>'street',''),area_m2=nullif(prop->>'size','')::numeric,asking_price_kwd=nullif(prop->>'price','')::numeric,details=nullif(prop->>'details',''),assigned_to=assigned_record_id,status=coalesce(nullif(prop->>'status','')::public.property_status,'available'),entry_date=coalesce(nullif(prop->>'date','')::date,current_date),updated_at=now() where id=existing_record.id returning id into property_record_id;
        else
          if not public.has_permission('properties','create') then raise exception 'Property create permission is required'; end if;
          insert into public.properties(code,client_id,type_id,offer_type_id,location_type_id,area_id,block,plot,street,area_m2,asking_price_kwd,details,assigned_to,created_by,status,entry_date)
          values(case when batch_row.duplicate_strategy='create_anyway' and exists(select 1 from public.properties p where p.code=prop->>'code') then coalesce(nullif(prop->>'code',''),'IMP-'||staged.row_number)||'-IMP-'||staged.row_number else coalesce(nullif(prop->>'code',''),'IMP-'||staged.row_number) end,client_record_id,type_record_id,offer_record_id,location_record_id,area_record_id,nullif(prop->>'block',''),nullif(prop->>'plot',''),nullif(prop->>'street',''),nullif(prop->>'size','')::numeric,nullif(prop->>'price','')::numeric,nullif(prop->>'details',''),assigned_record_id,auth.uid(),coalesce(nullif(prop->>'status','')::public.property_status,'available'),coalesce(nullif(prop->>'date','')::date,current_date)) returning id into property_record_id;
        end if;
        for phone_value in select jsonb_array_elements_text(coalesce(prop->'phones','[]'::jsonb)) loop
          phone_normalized:=regexp_replace(phone_value,'\D','','g');if left(phone_normalized,3)='965' then phone_normalized:=substring(phone_normalized from 4);end if;
          if phone_normalized<>'' then insert into public.property_phones(property_id,phone,normalized_phone,position) values(property_record_id,phone_value,phone_normalized,(select count(*)+1 from public.property_phones where property_id=property_record_id)) on conflict(property_id,position) do nothing;end if;
        end loop;
        update public.import_rows set status=case when existing_record.id is not null and batch_row.duplicate_strategy='update' then 'updated' else 'created' end,entity_id=property_record_id,processed_at=now() where id=staged.id;
      end if;
      processed:=processed+1;
    exception when others then
      update public.import_rows set status='failed',error_message=left(sqlerrm,500),processed_at=now() where id=staged.id;
      processed:=processed+1;
    end;
  end loop;
  update public.import_batches b set created_count=(select count(*) from public.import_rows where batch_id=p_batch_id and status='created'),updated_count=(select count(*) from public.import_rows where batch_id=p_batch_id and status='updated'),skipped_count=(select count(*) from public.import_rows where batch_id=p_batch_id and status='skipped'),failed_count=(select count(*) from public.import_rows where batch_id=p_batch_id and status='failed'),status=case when exists(select 1 from public.import_rows where batch_id=p_batch_id and status='pending') then 'processing' else 'completed' end,completed_at=case when not exists(select 1 from public.import_rows where batch_id=p_batch_id and status='pending') then now() else null end where b.id=p_batch_id;
  return jsonb_build_object('processed',processed,'status',(select status from public.import_batches where id=p_batch_id),'created',(select created_count from public.import_batches where id=p_batch_id),'updated',(select updated_count from public.import_batches where id=p_batch_id),'skipped',(select skipped_count from public.import_batches where id=p_batch_id),'failed',(select failed_count from public.import_batches where id=p_batch_id),'total',(select total_rows from public.import_batches where id=p_batch_id));
end;
$$;
revoke all on function public.process_import_batch(uuid,integer) from public,anon;
grant execute on function public.process_import_batch(uuid,integer) to authenticated;

create or replace function public.rollback_import_batch(p_batch_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare batch_row public.import_batches%rowtype;item record;prior public.properties%rowtype;deleted_count integer:=0;updated_count integer:=0;client_record_id uuid;
begin
  select * into batch_row from public.import_batches where id=p_batch_id for update;
  if not found or public.current_app_role() not in ('super_admin','manager') or batch_row.rollback_until<now() then raise exception 'Batch rollback is unavailable'; end if;
  for item in select entity_id from public.import_rows where batch_id=p_batch_id and status='created' and entity_id is not null loop
    select client_id into client_record_id from public.properties where id=item.entity_id;
    delete from public.properties where id=item.entity_id;
    if client_record_id is not null and not exists(select 1 from public.properties where client_id=client_record_id) and exists(select 1 from public.clients where id=client_record_id and created_by=batch_row.created_by) then delete from public.clients where id=client_record_id; end if;
    deleted_count:=deleted_count+1;
  end loop;
  for item in select entity_id,before_data from public.import_rows where batch_id=p_batch_id and status='updated' and entity_id is not null and before_data is not null loop
    select * into prior from jsonb_populate_record(null::public.properties,item.before_data);
    update public.properties set code=prior.code,client_id=prior.client_id,type_id=prior.type_id,offer_type_id=prior.offer_type_id,location_type_id=prior.location_type_id,area_id=prior.area_id,block=prior.block,plot=prior.plot,street=prior.street,avenue=prior.avenue,floor=prior.floor,building_type=prior.building_type,area_m2=prior.area_m2,asking_price_kwd=prior.asking_price_kwd,details=prior.details,notes=prior.notes,assigned_to=prior.assigned_to,status=prior.status,entry_date=prior.entry_date,latitude=prior.latitude,longitude=prior.longitude,deleted_at=prior.deleted_at,updated_at=now() where id=item.entity_id;
    updated_count:=updated_count+1;
  end loop;
  update public.import_batches set status='rolled_back' where id=p_batch_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'import_rollback','import_batch',p_batch_id::text,jsonb_build_object('deleted_count',deleted_count,'updated_restored',updated_count));
  return jsonb_build_object('deleted_count',deleted_count,'updated_restored',updated_count);
end;
$$;
revoke all on function public.rollback_import_batch(uuid) from public,anon;
grant execute on function public.rollback_import_batch(uuid) to authenticated;
