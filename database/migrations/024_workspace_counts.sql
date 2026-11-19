-- One round trip instead of three count queries for the dashboard metrics.
create or replace function public.workspace_counts()
returns jsonb language sql stable set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'properties', (select count(*) from public.properties where deleted_at is null),
    'availableProperties', (select count(*) from public.properties where deleted_at is null and status='available'),
    'clients', (select count(*) from public.clients where deleted_at is null)
  )
$$;
revoke all on function public.workspace_counts() from public,anonymous;
grant execute on function public.workspace_counts() to authenticated;
