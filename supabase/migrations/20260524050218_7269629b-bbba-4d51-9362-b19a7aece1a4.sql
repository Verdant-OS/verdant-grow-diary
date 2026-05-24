create or replace function public.merge_duplicate_plant(
  source_plant_id uuid,
  target_plant_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  v_source record;
  v_target record;
  v_moved_grow_events int := 0;
  v_moved_diary_entries int := 0;
  v_moved_alerts int := 0;
  v_moved_action_queue int := 0;
  v_merge_marker text;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if source_plant_id is null or target_plant_id is null then
    raise exception 'source_plant_id and target_plant_id are required'
      using errcode = '22023';
  end if;

  if source_plant_id = target_plant_id then
    raise exception 'source_plant_id and target_plant_id must differ'
      using errcode = '22023';
  end if;

  select id, user_id, grow_id, is_archived, last_note
    into v_source
    from public.plants
   where id = source_plant_id;

  if not found or v_source.user_id is null or v_source.user_id <> uid then
    raise exception 'source plant not found or not owned by caller'
      using errcode = '42501';
  end if;

  select id, user_id, grow_id
    into v_target
    from public.plants
   where id = target_plant_id;

  if not found or v_target.user_id is null or v_target.user_id <> uid then
    raise exception 'target plant not found or not owned by caller'
      using errcode = '42501';
  end if;

  if v_source.grow_id is distinct from v_target.grow_id then
    raise exception 'cross-grow merges are not supported'
      using errcode = '22023';
  end if;

  -- Reject repeat merges (idempotent-by-rejection).
  v_merge_marker := 'Merged into ' || target_plant_id::text;
  if v_source.is_archived
     and v_source.last_note is not null
     and position(v_merge_marker in v_source.last_note) > 0 then
    raise exception 'plant_already_merged' using errcode = 'P0001';
  end if;

  -- Reassign plant-linked history. Subtype event tables follow grow_events
  -- via event_id and require no separate update.
  update public.grow_events
     set plant_id = target_plant_id,
         updated_at = now()
   where plant_id = source_plant_id
     and user_id  = uid;
  get diagnostics v_moved_grow_events = row_count;

  update public.diary_entries
     set plant_id = target_plant_id
   where plant_id = source_plant_id
     and user_id  = uid;
  get diagnostics v_moved_diary_entries = row_count;

  update public.alerts
     set plant_id = target_plant_id,
         updated_at = now()
   where plant_id = source_plant_id
     and user_id  = uid;
  get diagnostics v_moved_alerts = row_count;

  update public.action_queue
     set plant_id = target_plant_id,
         updated_at = now()
   where plant_id = source_plant_id
     and user_id  = uid;
  get diagnostics v_moved_action_queue = row_count;

  -- Archive source plant. Never hard-delete.
  update public.plants
     set is_archived = true,
         last_note   = (v_merge_marker || ' at ' || now()::text)
                        || coalesce(E'\n' || last_note, ''),
         updated_at  = now()
   where id      = source_plant_id
     and user_id = uid;

  return jsonb_build_object(
    'source_plant_id', source_plant_id,
    'target_plant_id', target_plant_id,
    'moved', jsonb_build_object(
      'grow_events',   v_moved_grow_events,
      'diary_entries', v_moved_diary_entries,
      'alerts',        v_moved_alerts,
      'action_queue',  v_moved_action_queue
    ),
    'skipped', jsonb_build_object(
      'sensor_readings_tent_scoped', true,
      'pi_ingest_idempotency_keys_tent_scoped', true
    ),
    'source_status', 'archived_as_merged',
    'audit_logged', false
  );
end;
$$;

revoke all on function public.merge_duplicate_plant(uuid, uuid) from public;
revoke all on function public.merge_duplicate_plant(uuid, uuid) from anon;
grant execute on function public.merge_duplicate_plant(uuid, uuid) to authenticated;