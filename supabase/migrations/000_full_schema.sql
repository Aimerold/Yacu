


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."add_group_members"("p_conversation_id" "uuid", "p_user_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (
    select 1
    from public.conversation_members
    where conversation_id = p_conversation_id
      and user_id = auth.uid()
      and role = 'admin'
  ) then
    raise exception 'forbidden';
  end if;

  insert into public.conversation_members (
    conversation_id,
    user_id,
    role
  )
  select
    p_conversation_id,
    user_id,
    'member'
  from unnest(p_user_ids) as user_id
  on conflict (conversation_id, user_id) do nothing;
end;
$$;


ALTER FUNCTION "public"."add_group_members"("p_conversation_id" "uuid", "p_user_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_send_conversation_topic"("p_topic" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select case
    when public.can_use_conversation_topic(p_topic)
    then not public.conversation_has_block(substr(p_topic, 14)::uuid)
    else false
  end;
$$;


ALTER FUNCTION "public"."can_send_conversation_topic"("p_topic" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_use_conversation_topic"("p_topic" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
  select case
    when p_topic ~* '^conversation:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.is_conversation_member(substr(p_topic, 14)::uuid)
    else false
  end;
$_$;


ALTER FUNCTION "public"."can_use_conversation_topic"("p_topic" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_friend_request"("p_request_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_friendship public.friendships%rowtype;
begin
  if v_user_id is null then
    raise exception using message = 'not_authenticated';
  end if;


  select *
    into v_friendship
  from public.friendships f
  where f.id = p_request_id;


  if not found then
    raise exception using message = 'request_not_found';
  end if;


  perform pg_advisory_xact_lock(
    hashtextextended(
      least(v_friendship.requester_id::text, v_friendship.addressee_id::text)
        || ':' ||
        greatest(v_friendship.requester_id::text, v_friendship.addressee_id::text),
      0
    )
  );


  select *
    into v_friendship
  from public.friendships f
  where f.id = p_request_id
  for update;


  if not found or v_friendship.status <> 'pending' then
    raise exception using message = 'request_not_found';
  end if;


  if v_friendship.requester_id <> v_user_id then
    raise exception using message = 'forbidden';
  end if;


  delete from public.friendships where id = v_friendship.id;
end;
$$;


ALTER FUNCTION "public"."cancel_friend_request"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."chat_image_conversation_id"("p_name" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $_$
  select case
    when (storage.foldername(p_name))[1]
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(p_name))[1])::uuid
    else null
  end;
$_$;


ALTER FUNCTION "public"."chat_image_conversation_id"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."conversation_has_block"("p_conversation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.conversations c
    join public.blocked_users b
      on (b.blocker_id = c.user_a_id and b.blocked_id = c.user_b_id)
      or (b.blocker_id = c.user_b_id and b.blocked_id = c.user_a_id)
    where c.id = p_conversation_id
      and auth.uid() in (c.user_a_id, c.user_b_id)
  );
$$;


ALTER FUNCTION "public"."conversation_has_block"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_default_user_settings"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."create_default_user_settings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_direct_conversation"("p_other_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_me uuid := auth.uid();
  v_a  uuid;
  v_b  uuid;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;

  if p_other_user_id is null or p_other_user_id = v_me then
    raise exception 'invalid_user';
  end if;

  if not exists (select 1 from public.profiles where id = p_other_user_id) then
    raise exception 'user_not_found';
  end if;

  -- normalisation de la paire
  if v_me < p_other_user_id then
    v_a := v_me;
    v_b := p_other_user_id;
  else
    v_a := p_other_user_id;
    v_b := v_me;
  end if;

  insert into public.conversations (user_a_id, user_b_id, created_by)
  values (v_a, v_b, v_me)
  on conflict (user_a_id, user_b_id) do nothing
  returning id into v_id;

  -- la conversation existait déjà : on la récupère
  if v_id is null then
    select id into v_id
    from public.conversations
    where user_a_id = v_a and user_b_id = v_b;
  end if;

  insert into public.conversation_members (conversation_id, user_id)
  values (v_id, v_a), (v_id, v_b)
  on conflict do nothing;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."create_direct_conversation"("p_other_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_group"("p_name" "text", "p_member_ids" "uuid"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_conversation_id uuid;
  v_member_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Utilisateur non connecté.';
  end if;

  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'Le nom du groupe doit contenir au moins 2 caractères.';
  end if;

  if p_member_ids is null or array_length(p_member_ids, 1) = 0 then
    raise exception 'Sélectionne au moins un membre.';
  end if;

  insert into public.conversations (
    type,
    name,
    created_by,
    is_active
  )
  values (
    'group',
    trim(p_name),
    v_user_id,
    true
  )
  returning id into v_conversation_id;

  insert into public.conversation_members (
    conversation_id,
    user_id,
    role
  )
  values (
    v_conversation_id,
    v_user_id,
    'admin'
  );

  foreach v_member_id in array p_member_ids
  loop
    if v_member_id <> v_user_id then
      insert into public.conversation_members (
        conversation_id,
        user_id,
        role
      )
      values (
        v_conversation_id,
        v_member_id,
        'member'
      )
      on conflict do nothing;
    end if;
  end loop;

  return v_conversation_id;
end;
$$;


ALTER FUNCTION "public"."create_group"("p_name" "text", "p_member_ids" "uuid"[]) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "type" "text" DEFAULT 'text'::"text" NOT NULL,
    "content" "text",
    "media_path" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "edited_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "messages_content_valid" CHECK ((("deleted_at" IS NOT NULL) OR (("type" = 'text'::"text") AND ("content" IS NOT NULL) AND (("char_length"("btrim"("content")) >= 1) AND ("char_length"("btrim"("content")) <= 5000)) AND ("media_path" IS NULL)) OR (("type" = 'image'::"text") AND ("media_path" IS NOT NULL)))),
    CONSTRAINT "messages_type_check" CHECK (("type" = ANY (ARRAY['text'::"text", 'image'::"text"])))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_message"("p_message_id" "uuid") RETURNS "public"."messages"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_me  uuid := auth.uid();
  v_msg public.messages;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_msg
  from public.messages
  where id = p_message_id
  for update;

  if not found or v_msg.sender_id <> v_me then
    raise exception 'forbidden';
  end if;

  -- déjà supprimé : opération idempotente
  if v_msg.deleted_at is not null then
    return v_msg;
  end if;

  update public.messages
  set deleted_at = now(),
      content = null
  where id = p_message_id
  returning * into v_msg;

  return v_msg;
end;
$$;


ALTER FUNCTION "public"."delete_message"("p_message_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."device_tokens_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."device_tokens_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."edit_message"("p_message_id" "uuid", "p_content" "text") RETURNS "public"."messages"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_me      uuid := auth.uid();
  v_msg     public.messages;
  v_content text := btrim(coalesce(p_content, ''));
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;

  if char_length(v_content) < 1 or char_length(v_content) > 5000 then
    raise exception 'invalid_content';
  end if;

  select * into v_msg
  from public.messages
  where id = p_message_id
  for update;

  if not found or v_msg.sender_id <> v_me then
    raise exception 'forbidden';
  end if;

  if not public.is_conversation_member(v_msg.conversation_id) then
    raise exception 'forbidden';
  end if;

  if v_msg.deleted_at is not null or v_msg.type <> 'text' then
    raise exception 'not_editable';
  end if;

  if v_msg.created_at < now() - interval '15 minutes' then
    raise exception 'edit_window_expired';
  end if;

  if public.conversation_has_block(v_msg.conversation_id) then
    raise exception 'forbidden';
  end if;

  update public.messages
  set content = v_content,
      edited_at = now()
  where id = p_message_id
  returning * into v_msg;

  return v_msg;
end;
$$;


ALTER FUNCTION "public"."edit_message"("p_message_id" "uuid", "p_content" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."friendships_remove_on_block"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended(
      least(new.blocker_id::text, new.blocked_id::text) || ':' ||
        greatest(new.blocker_id::text, new.blocked_id::text),
      0
    )
  );


  delete from public.friendships f
  where (f.requester_id = new.blocker_id and f.addressee_id = new.blocked_id)
     or (f.requester_id = new.blocked_id and f.addressee_id = new.blocker_id);


  return new;
end;
$$;


ALTER FUNCTION "public"."friendships_remove_on_block"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."friendships_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."friendships_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_conversation_overview"() RETURNS TABLE("conv_id" "uuid", "last_id" "uuid", "last_type" "text", "last_content" "text", "last_sender_id" "uuid", "last_at" timestamp with time zone, "unread_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select
    m.conversation_id,
    lm.id,
    lm.type,
    lm.content,
    lm.sender_id,
    lm.created_at,
    (
      select count(*)
      from public.messages x
      where x.conversation_id = m.conversation_id
        and x.sender_id <> auth.uid()
        and x.deleted_at is null
        and x.created_at > m.last_read_at
    )
  from public.conversation_members m
  left join lateral (
    select id, type, content, sender_id, created_at
    from public.messages
    where conversation_id = m.conversation_id
      and deleted_at is null
    order by created_at desc, id desc
    limit 1
  ) lm on true
  where m.user_id = auth.uid();
$$;


ALTER FUNCTION "public"."get_conversation_overview"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_group_members"("p_conversation_id" "uuid") RETURNS TABLE("user_id" "uuid", "username" "text", "display_name" "text", "avatar_url" "text", "role" "text", "joined_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    cm.user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    cm.role,
    cm.joined_at
  from public.conversation_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.conversation_id = p_conversation_id
    and public.is_conversation_member(p_conversation_id)
  order by
    case when cm.role = 'admin' then 0 else 1 end,
    p.display_name nulls last,
    p.username;
$$;


ALTER FUNCTION "public"."get_group_members"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_peer_receipts"("p_conversation_id" "uuid") RETURNS TABLE("peer_delivered_at" timestamp with time zone, "peer_read_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_conversation_member(p_conversation_id) then
    raise exception 'forbidden';
  end if;

  return query
  select
    m.last_delivered_at,
    case
      when coalesce(s.read_receipts_enabled, true) then m.last_read_at
      else null
    end
  from public.conversation_members m
  left join public.user_settings s on s.user_id = m.user_id
  where m.conversation_id = p_conversation_id
    and m.user_id <> v_me;
end;
$$;


ALTER FUNCTION "public"."get_peer_receipts"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_presence"("p_user_ids" "uuid"[]) RETURNS TABLE("target_id" "uuid", "is_online" boolean, "last_seen_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_me uuid := auth.uid();
  v_me_shows_last_seen boolean;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;

  select coalesce(s.show_last_seen, true)
  into v_me_shows_last_seen
  from (select 1) as one
  left join public.user_settings s on s.user_id = v_me;

  return query
  select
    t.id,
    (
      coalesce(ts.show_online_status, true)
      and p.last_active_at is not null
      and p.last_active_at > now() - interval '60 seconds'
    ),
    case
      when not v_me_shows_last_seen then null
      when not coalesce(ts.show_last_seen, true) then null
      when p.last_active_at is null then null
      when coalesce(ts.show_online_status, true)
           and p.last_active_at > now() - interval '60 seconds' then null
      when coalesce(ts.show_online_status, true) then p.last_active_at
      else least(p.last_active_at, now() - interval '1 minute')
    end
  from unnest(p_user_ids[1:50]) as t(id)
  left join public.user_settings ts on ts.user_id = t.id
  left join public.user_presence p on p.user_id = t.id
  where t.id <> v_me
    and exists (
      select 1
      from public.conversation_members a
      join public.conversation_members b on b.conversation_id = a.conversation_id
      where a.user_id = v_me and b.user_id = t.id
    )
    and not exists (
      select 1
      from public.blocked_users bu
      where (bu.blocker_id = v_me and bu.blocked_id = t.id)
         or (bu.blocker_id = t.id and bu.blocked_id = v_me)
    );
end;
$$;


ALTER FUNCTION "public"."get_presence"("p_user_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_yacu_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    chosen_username TEXT;
BEGIN
    chosen_username := COALESCE(
        NULLIF(
            LOWER(TRIM(NEW.raw_user_meta_data ->> 'username')),
            ''
        ),
        'user_' || REPLACE(NEW.id::TEXT, '-', '')
    );

    INSERT INTO public.profiles (
        id,
        username,
        display_name
    )
    VALUES (
        NEW.id,
        chosen_username,
        COALESCE(
            NEW.raw_user_meta_data ->> 'display_name',
            ''
        )
    );

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_yacu_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_conversation_admin"("p_conversation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = auth.uid()
      and cm.role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_conversation_admin"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_conversation_member"("p_conversation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_conversation_member"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_valid_avatar_url"("p_url" "text", "p_user" "uuid") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $_$
  select
    p_url is null
    or p_url ~ (
      '^https://mifbrotcmhapuwgsvwjh\.supabase\.co/storage/v1/object/public/avatars/'
      || p_user::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
    );
$_$;


ALTER FUNCTION "public"."is_valid_avatar_url"("p_url" "text", "p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."leave_group"("p_conversation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (
    select 1
    from public.conversations
    where id = p_conversation_id
      and type = 'group'
      and is_active = true
  ) then
    raise exception 'not_found';
  end if;

  delete from public.conversation_members
  where conversation_id = p_conversation_id
    and user_id = auth.uid();
end;
$$;


ALTER FUNCTION "public"."leave_group"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_all_delivered"() RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  update public.conversation_members
  set last_delivered_at = now()
  where user_id = auth.uid();
$$;


ALTER FUNCTION "public"."mark_all_delivered"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_call_missed"("p_call_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_call public.calls%rowtype;
  v_user_id uuid;
begin
  v_user_id := auth.uid();




  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;




  select *
  into v_call
  from public.calls
  where id = p_call_id;




  if not found then
    raise exception 'call_not_found';
  end if;




  if v_call.caller_id <> v_user_id then
    raise exception 'forbidden';
  end if;




  if v_call.status <> 'ringing' then
    raise exception 'call_is_not_ringing';
  end if;




  update public.calls
  set status = 'missed',
      ended_at = now()
  where id = p_call_id;
end;
$$;


ALTER FUNCTION "public"."mark_call_missed"("p_call_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_conversation_read"("p_conversation_id" "uuid") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  update public.conversation_members
  set last_read_at = now(),
      last_delivered_at = now()
  where conversation_id = p_conversation_id
    and user_id = auth.uid();
$$;


ALTER FUNCTION "public"."mark_conversation_read"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_call_identity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
       OR NEW.caller_id IS DISTINCT FROM OLD.caller_id
       OR NEW.callee_id IS DISTINCT FROM OLD.callee_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
        RAISE EXCEPTION 'Call identity fields cannot be modified';
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_call_identity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_device_token"("p_token" "text", "p_platform" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$' then
    raise exception 'invalid_token';
  end if;

  if p_platform is null or p_platform not in ('android', 'ios') then
    raise exception 'invalid_platform';
  end if;

  -- ✅ NOUVEAU : un seul appareil par utilisateur.
  -- Supprime les anciens tokens de ce user avant d'insérer le nouveau.
  delete from public.device_tokens
   where user_id = auth.uid()
     and expo_push_token <> p_token;

  insert into public.device_tokens (user_id, expo_push_token, platform)
  values (auth.uid(), p_token, p_platform)
  on conflict (expo_push_token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform;
end;
$_$;


ALTER FUNCTION "public"."register_device_token"("p_token" "text", "p_platform" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_friend"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using message = 'not_authenticated';
  end if;


  if p_user_id is null or p_user_id = v_user_id then
    raise exception using message = 'invalid_user';
  end if;


  if not exists (
    select 1 from public.profiles where id = p_user_id
  ) then
    raise exception using message = 'user_not_found';
  end if;


  perform pg_advisory_xact_lock(
    hashtextextended(
      least(v_user_id::text, p_user_id::text) || ':' ||
        greatest(v_user_id::text, p_user_id::text),
      0
    )
  );


  delete from public.friendships f
  where f.status = 'accepted'
    and (
      (f.requester_id = v_user_id and f.addressee_id = p_user_id)
      or (f.requester_id = p_user_id and f.addressee_id = v_user_id)
    );


  if not found then
    raise exception using message = 'not_friends';
  end if;
end;
$$;


ALTER FUNCTION "public"."remove_friend"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_group_member"("p_conversation_id" "uuid", "p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (
    select 1
    from public.conversation_members
    where conversation_id = p_conversation_id
      and user_id = auth.uid()
      and role = 'admin'
  ) then
    raise exception 'forbidden';
  end if;

  if not exists (
    select 1
    from public.conversation_members
    where conversation_id = p_conversation_id
      and user_id = p_user_id
  ) then
    raise exception 'not_found';
  end if;

  delete from public.conversation_members
  where conversation_id = p_conversation_id
    and user_id = p_user_id;
end;
$$;


ALTER FUNCTION "public"."remove_group_member"("p_conversation_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."respond_friend_request"("p_request_id" "uuid", "p_accept" boolean) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_friendship public.friendships%rowtype;
begin
  if v_user_id is null then
    raise exception using message = 'not_authenticated';
  end if;


  select *
    into v_friendship
  from public.friendships f
  where f.id = p_request_id;


  if not found then
    raise exception using message = 'request_not_found';
  end if;


  perform pg_advisory_xact_lock(
    hashtextextended(
      least(v_friendship.requester_id::text, v_friendship.addressee_id::text)
        || ':' ||
        greatest(v_friendship.requester_id::text, v_friendship.addressee_id::text),
      0
    )
  );


  select *
    into v_friendship
  from public.friendships f
  where f.id = p_request_id
  for update;


  if not found or v_friendship.status <> 'pending' then
    raise exception using message = 'request_not_found';
  end if;


  if v_friendship.addressee_id <> v_user_id then
    raise exception using message = 'forbidden';
  end if;


  if p_accept is null then
    raise exception using message = 'invalid_user';
  end if;


  if p_accept then
    update public.friendships
    set status = 'accepted'
    where id = v_friendship.id;


    return 'accepted';
  end if;


  delete from public.friendships where id = v_friendship.id;
  return 'declined';
end;
$$;


ALTER FUNCTION "public"."respond_friend_request"("p_request_id" "uuid", "p_accept" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_users"("p_term" "text") RETURNS TABLE("id" "uuid", "username" "text", "display_name" "text", "avatar_url" "text", "bio" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_me      uuid := auth.uid();
  v_term    text := btrim(coalesce(p_term, ''));
  v_pattern text;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;

  -- Moins de 2 ou plus de 50 caractères : aucun résultat (évite l'extraction massive)
  if char_length(v_term) < 2 or char_length(v_term) > 50 then
    return;
  end if;

  -- Les jokers saisis par l'utilisateur sont neutralisés
  v_pattern := replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_');

  return query
  select p.id, p.username, p.display_name, p.avatar_url, p.bio
  from public.profiles p
  where p.id <> v_me
    and (
      p.username ilike (v_pattern || '%') escape '\'
      or p.display_name ilike (v_pattern || '%') escape '\'
      or p.display_name ilike ('% ' || v_pattern || '%') escape '\'
    )
    -- ni les personnes que j'ai bloquées, ni celles qui m'ont bloqué
    and not exists (
      select 1
      from public.blocked_users b
      where (b.blocker_id = v_me and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = v_me)
    )
  order by
    (lower(p.username) = lower(v_term)) desc,
    (p.username ilike (v_pattern || '%') escape '\') desc,
    p.username
  limit 20;
end;
$$;


ALTER FUNCTION "public"."search_users"("p_term" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."friendships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requester_id" "uuid" NOT NULL,
    "addressee_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "friendships_different_users" CHECK (("requester_id" <> "addressee_id")),
    CONSTRAINT "friendships_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text"])))
);


ALTER TABLE "public"."friendships" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_friend_request"("p_user_id" "uuid") RETURNS "public"."friendships"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_friendship public.friendships%rowtype;
  v_pending_count integer;
begin
  if v_user_id is null then
    raise exception using message = 'not_authenticated';
  end if;


  if p_user_id is null or p_user_id = v_user_id then
    raise exception using message = 'invalid_user';
  end if;


  if not exists (
    select 1 from public.profiles where id = p_user_id
  ) then
    raise exception using message = 'user_not_found';
  end if;


  if not exists (
    select 1 from public.profiles where id = v_user_id
  ) then
    raise exception using message = 'user_not_found';
  end if;


  perform pg_advisory_xact_lock(
    hashtextextended(
      least(v_user_id::text, p_user_id::text) || ':' ||
        greatest(v_user_id::text, p_user_id::text),
      0
    )
  );


  if exists (
    select 1
    from public.blocked_users bu
    where (bu.blocker_id = v_user_id and bu.blocked_id = p_user_id)
       or (bu.blocker_id = p_user_id and bu.blocked_id = v_user_id)
  ) then
    raise exception using message = 'blocked';
  end if;


  select *
    into v_friendship
  from public.friendships f
  where (f.requester_id = v_user_id and f.addressee_id = p_user_id)
     or (f.requester_id = p_user_id and f.addressee_id = v_user_id)
  for update;


  if found then
    if v_friendship.status = 'accepted'
       or v_friendship.requester_id = v_user_id then
      return v_friendship;
    end if;


    update public.friendships
    set status = 'accepted'
    where id = v_friendship.id
    returning * into v_friendship;


    return v_friendship;
  end if;


  perform 1
  from public.profiles
  where id = v_user_id
  for update;


  select count(*)::integer
    into v_pending_count
  from public.friendships f
  where f.requester_id = v_user_id
    and f.status = 'pending';


  if v_pending_count >= 50 then
    raise exception using message = 'too_many_requests';
  end if;


  insert into public.friendships (requester_id, addressee_id)
  values (v_user_id, p_user_id)
  returning * into v_friendship;


  return v_friendship;
end;
$$;


ALTER FUNCTION "public"."send_friend_request"("p_user_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "caller_id" "uuid" NOT NULL,
    "callee_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'ringing'::"text" NOT NULL,
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "calls_status_check" CHECK (("status" = ANY (ARRAY['ringing'::"text", 'accepted'::"text", 'declined'::"text", 'missed'::"text", 'ended'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."calls" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_call"("p_conversation_id" "uuid", "p_callee_id" "uuid") RETURNS "public"."calls"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_caller_id uuid;
  v_existing_call public.calls%rowtype;
  v_new_call public.calls%rowtype;
begin
  v_caller_id := auth.uid();




  if v_caller_id is null then
    raise exception 'not_authenticated';
  end if;




  if v_caller_id = p_callee_id then
    raise exception 'cannot_call_yourself';
  end if;




  select *
  into v_existing_call
  from public.calls
  where conversation_id = p_conversation_id
    and status = 'ringing'
  for update;




  if found then
    raise exception 'call_already_ringing';
  end if;




  if exists (
    select 1
    from public.calls
    where (caller_id = v_caller_id or callee_id = v_caller_id)
      and status in ('ringing', 'accepted')
  ) then
    raise exception 'user_already_in_call';
  end if;




  if exists (
    select 1
    from public.calls
    where (caller_id = p_callee_id or callee_id = p_callee_id)
      and status in ('ringing', 'accepted')
  ) then
    raise exception 'callee_already_in_call';
  end if;




  insert into public.calls (
    conversation_id,
    caller_id,
    callee_id,
    status
  )
  values (
    p_conversation_id,
    v_caller_id,
    p_callee_id,
    'ringing'
  )
  returning *
  into v_new_call;

  return v_new_call;
end;
$$;


ALTER FUNCTION "public"."start_call"("p_conversation_id" "uuid", "p_callee_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_presence"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.user_presence (user_id, last_active_at)
  values (auth.uid(), now())
  on conflict (user_id) do update
    set last_active_at = now()
    where public.user_presence.last_active_at < now() - interval '10 seconds';
end;
$$;


ALTER FUNCTION "public"."touch_presence"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_call_status"("p_call_id" "uuid", "p_new_status" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_call public.calls%rowtype;
  v_user_id uuid;
begin
  v_user_id := auth.uid();




  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;




  select *
  into v_call
  from public.calls
  where id = p_call_id;




  if not found then
    raise exception 'call_not_found';
  end if;




  if v_call.caller_id <> v_user_id and v_call.callee_id <> v_user_id then
    raise exception 'forbidden';
  end if;




  if v_call.status in (
    'declined',
    'missed',
    'ended',
    'failed',
    'cancelled'
  ) then
    raise exception 'call_already_finished';
  end if;




  if p_new_status = 'accepted' then
    if v_call.status <> 'ringing' or v_call.callee_id <> v_user_id then
      raise exception 'forbidden';
    end if;




    update public.calls
    set status = 'accepted',
        started_at = now()
    where id = p_call_id;




  elsif p_new_status = 'declined' then
    if v_call.status <> 'ringing' or v_call.callee_id <> v_user_id then
      raise exception 'forbidden';
    end if;




    update public.calls
    set status = 'declined',
        ended_at = now()
    where id = p_call_id;




  elsif p_new_status = 'cancelled' then
    if v_call.status <> 'ringing' or v_call.caller_id <> v_user_id then
      raise exception 'forbidden';
    end if;




    update public.calls
    set status = 'cancelled',
        ended_at = now()
    where id = p_call_id;




  elsif p_new_status = 'ended' then
    if v_call.status <> 'accepted' then
      raise exception 'forbidden';
    end if;




    update public.calls
    set status = 'ended',
        ended_at = now()
    where id = p_call_id;




  elsif p_new_status = 'failed' then
    if v_call.status not in ('ringing', 'accepted') then
      raise exception 'forbidden';
    end if;




    update public.calls
    set status = 'failed',
        ended_at = now()
    where id = p_call_id;




  else
    raise exception 'invalid_status';
  end if;
end;
$$;


ALTER FUNCTION "public"."update_call_status"("p_call_id" "uuid", "p_new_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_group"("p_conversation_id" "uuid", "p_name" "text", "p_avatar_url" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (
    select 1
    from public.conversation_members
    where conversation_id = p_conversation_id
      and user_id = auth.uid()
      and role = 'admin'
  ) then
    raise exception 'forbidden';
  end if;

  update public.conversations
  set
    name = p_name,
    avatar_url = p_avatar_url
  where id = p_conversation_id
    and type = 'group';
end;
$$;


ALTER FUNCTION "public"."update_group"("p_conversation_id" "uuid", "p_name" "text", "p_avatar_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_settings_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."user_settings_set_updated_at"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."blocked_users" (
    "blocker_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "blocked_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "blocked_users_not_self" CHECK (("blocker_id" <> "blocked_id"))
);


ALTER TABLE "public"."blocked_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_members" (
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_delivered_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL
);


ALTER TABLE "public"."conversation_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_a_id" "uuid",
    "user_b_id" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "type" "text" DEFAULT 'direct'::"text" NOT NULL,
    "name" "text",
    "avatar_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    CONSTRAINT "conversations_creator_member" CHECK ((("created_by" = "user_a_id") OR ("created_by" = "user_b_id"))),
    CONSTRAINT "conversations_distinct_users" CHECK (("user_a_id" < "user_b_id"))
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."device_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "expo_push_token" "text" NOT NULL,
    "platform" "text" DEFAULT 'android'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "device_tokens_platform_check" CHECK (("platform" = ANY (ARRAY['android'::"text", 'ios'::"text", 'web'::"text"])))
);


ALTER TABLE "public"."device_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "display_name" "text" DEFAULT ''::"text" NOT NULL,
    "avatar_url" "text",
    "bio" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_deliveries" (
    "message_id" "uuid" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "push_tokens_platform_check" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text"])))
);


ALTER TABLE "public"."push_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reporter_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "reported_user_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "details" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reports_details_check" CHECK ((("details" IS NULL) OR ("char_length"("details") <= 1000))),
    CONSTRAINT "reports_not_self" CHECK (("reporter_id" <> "reported_user_id")),
    CONSTRAINT "reports_reason_check" CHECK (("reason" = ANY (ARRAY['spam'::"text", 'harassment'::"text", 'inappropriate'::"text", 'impersonation'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_presence" (
    "user_id" "uuid" NOT NULL,
    "last_active_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_presence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_settings" (
    "user_id" "uuid" NOT NULL,
    "show_last_seen" boolean DEFAULT true NOT NULL,
    "show_online_status" boolean DEFAULT true NOT NULL,
    "typing_indicator_enabled" boolean DEFAULT true NOT NULL,
    "read_receipts_enabled" boolean DEFAULT true NOT NULL,
    "push_notifications_enabled" boolean DEFAULT true NOT NULL,
    "theme_preference" "text" DEFAULT 'system'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_settings_theme_preference_check" CHECK (("theme_preference" = ANY (ARRAY['system'::"text", 'light'::"text", 'dark'::"text"])))
);


ALTER TABLE "public"."user_settings" OWNER TO "postgres";


ALTER TABLE ONLY "public"."blocked_users"
    ADD CONSTRAINT "blocked_users_pkey" PRIMARY KEY ("blocker_id", "blocked_id");



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pair_unique" UNIQUE ("user_a_id", "user_b_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."device_tokens"
    ADD CONSTRAINT "device_tokens_expo_push_token_key" UNIQUE ("expo_push_token");



ALTER TABLE ONLY "public"."device_tokens"
    ADD CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."device_tokens"
    ADD CONSTRAINT "device_tokens_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."profiles"
    ADD CONSTRAINT "profiles_avatar_url_valid" CHECK ("public"."is_valid_avatar_url"("avatar_url", "id")) NOT VALID;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_deliveries"
    ADD CONSTRAINT "push_deliveries_pkey" PRIMARY KEY ("message_id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_presence"
    ADD CONSTRAINT "user_presence_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id");



CREATE INDEX "blocked_users_blocked_idx" ON "public"."blocked_users" USING "btree" ("blocked_id");



CREATE INDEX "calls_callee_id_idx" ON "public"."calls" USING "btree" ("callee_id");



CREATE INDEX "calls_caller_id_idx" ON "public"."calls" USING "btree" ("caller_id");



CREATE INDEX "calls_conversation_id_idx" ON "public"."calls" USING "btree" ("conversation_id");



CREATE INDEX "calls_created_at_idx" ON "public"."calls" USING "btree" ("created_at" DESC);



CREATE INDEX "conversation_members_conversation_idx" ON "public"."conversation_members" USING "btree" ("conversation_id");



CREATE INDEX "conversation_members_user_idx" ON "public"."conversation_members" USING "btree" ("user_id");



CREATE INDEX "conversations_type_idx" ON "public"."conversations" USING "btree" ("type");



CREATE INDEX "conversations_user_b_idx" ON "public"."conversations" USING "btree" ("user_b_id");



CREATE INDEX "device_tokens_user_id_idx" ON "public"."device_tokens" USING "btree" ("user_id");



CREATE INDEX "friendships_addressee_id_idx" ON "public"."friendships" USING "btree" ("addressee_id");



CREATE INDEX "friendships_requester_id_idx" ON "public"."friendships" USING "btree" ("requester_id");



CREATE UNIQUE INDEX "friendships_unique_user_pair_idx" ON "public"."friendships" USING "btree" (LEAST("requester_id", "addressee_id"), GREATEST("requester_id", "addressee_id"));



CREATE INDEX "messages_conversation_created_idx" ON "public"."messages" USING "btree" ("conversation_id", "created_at" DESC, "id" DESC);



CREATE UNIQUE INDEX "profiles_username_lower_unique" ON "public"."profiles" USING "btree" ("lower"("username"));



CREATE INDEX "push_tokens_user_id_idx" ON "public"."push_tokens" USING "btree" ("user_id");



CREATE INDEX "reports_reported_idx" ON "public"."reports" USING "btree" ("reported_user_id", "created_at" DESC);



CREATE OR REPLACE TRIGGER "blocked_users_remove_friendship_trigger" AFTER INSERT ON "public"."blocked_users" FOR EACH ROW EXECUTE FUNCTION "public"."friendships_remove_on_block"();



CREATE OR REPLACE TRIGGER "device_tokens_updated_at" BEFORE UPDATE ON "public"."device_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."device_tokens_set_updated_at"();



CREATE OR REPLACE TRIGGER "friendships_set_updated_at_trigger" BEFORE UPDATE ON "public"."friendships" FOR EACH ROW EXECUTE FUNCTION "public"."friendships_set_updated_at"();



CREATE OR REPLACE TRIGGER "profiles_create_user_settings" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."create_default_user_settings"();



CREATE OR REPLACE TRIGGER "protect_call_identity_trigger" BEFORE UPDATE ON "public"."calls" FOR EACH ROW EXECUTE FUNCTION "public"."protect_call_identity"();



CREATE OR REPLACE TRIGGER "push_on_message_insert" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://mifbrotcmhapuwgsvwjh.supabase.co/functions/v1/send-push-notification', 'POST', '{"Content-type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZmJyb3RjbWhhcHV3Z3N2d2poIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MzYzNDIxNCwiZXhwIjoyMTA5MjEwMjE0fQ.dceEVji4vIO3Idx5FyrUotMQFGEx32WeBy9YMBgs60E","x-webhook-secret":"afdb1a8ce1714ca49e1520c4c6740b7f8d3150c2c597450b988cb20996317ccc"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "send-call-notification" AFTER INSERT ON "public"."calls" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://mifbrotcmhapuwgsvwjh.supabase.co/functions/v1/send-call-notification', 'POST', '{"Content-type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZmJyb3RjbWhhcHV3Z3N2d2poIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MzYzNDIxNCwiZXhwIjoyMTA5MjEwMjE0fQ.dceEVji4vIO3Idx5FyrUotMQFGEx32WeBy9YMBgs60E"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "user_settings_updated_at" BEFORE UPDATE ON "public"."user_settings" FOR EACH ROW EXECUTE FUNCTION "public"."user_settings_set_updated_at"();



ALTER TABLE ONLY "public"."blocked_users"
    ADD CONSTRAINT "blocked_users_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blocked_users"
    ADD CONSTRAINT "blocked_users_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_callee_id_fkey" FOREIGN KEY ("callee_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_caller_id_fkey" FOREIGN KEY ("caller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_user_a_id_fkey" FOREIGN KEY ("user_a_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_user_b_id_fkey" FOREIGN KEY ("user_b_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."device_tokens"
    ADD CONSTRAINT "device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_addressee_id_fkey" FOREIGN KEY ("addressee_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_deliveries"
    ADD CONSTRAINT "push_deliveries_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_presence"
    ADD CONSTRAINT "user_presence_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can remove members" ON "public"."conversation_members" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "admin"
  WHERE (("admin"."conversation_id" = "conversation_members"."conversation_id") AND ("admin"."user_id" = "auth"."uid"()) AND ("admin"."role" = 'admin'::"text")))));



CREATE POLICY "Authenticated users can view profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Creators can add themselves to new conversations" ON "public"."conversation_members" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "conversation_members"."conversation_id") AND ("c"."created_by" = "auth"."uid"()))))));



CREATE POLICY "Group admins can manage members" ON "public"."conversation_members" USING ("public"."is_conversation_admin"("conversation_id")) WITH CHECK ("public"."is_conversation_admin"("conversation_id"));



CREATE POLICY "Group admins can update conversations" ON "public"."conversations" FOR UPDATE USING ((("type" = 'group'::"text") AND "public"."is_conversation_admin"("id"))) WITH CHECK ((("type" = 'group'::"text") AND "public"."is_conversation_admin"("id")));



CREATE POLICY "Members can delete their own membership" ON "public"."conversation_members" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Only caller can delete ringing call" ON "public"."calls" FOR DELETE USING ((("caller_id" = "auth"."uid"()) AND ("status" = 'ringing'::"text")));



CREATE POLICY "Participants can update their calls" ON "public"."calls" FOR UPDATE USING ((("caller_id" = "auth"."uid"()) OR ("callee_id" = "auth"."uid"()))) WITH CHECK ((("caller_id" = "auth"."uid"()) OR ("callee_id" = "auth"."uid"())));



CREATE POLICY "Users can create calls in their conversations" ON "public"."calls" FOR INSERT TO "authenticated" WITH CHECK ((("caller_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "calls"."conversation_id") AND ("cm"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can create conversations" ON "public"."conversations" FOR INSERT WITH CHECK ((("auth"."uid"() = "created_by") AND ((("type" = 'direct'::"text") AND ("user_a_id" IS NOT NULL) AND ("user_b_id" IS NOT NULL)) OR (("type" = 'group'::"text") AND ("name" IS NOT NULL) AND ("user_a_id" IS NULL) AND ("user_b_id" IS NULL)))));



CREATE POLICY "Users can manage their own push tokens" ON "public"."push_tokens" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Users can view calls in their conversations" ON "public"."calls" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "calls"."conversation_id") AND ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view conversation members" ON "public"."conversation_members" FOR SELECT USING ("public"."is_conversation_member"("conversation_id"));



CREATE POLICY "Users can view their conversations" ON "public"."conversations" FOR SELECT USING ("public"."is_conversation_member"("id"));



CREATE POLICY "blocked_delete_own" ON "public"."blocked_users" FOR DELETE TO "authenticated" USING (("blocker_id" = "auth"."uid"()));



CREATE POLICY "blocked_insert_own" ON "public"."blocked_users" FOR INSERT TO "authenticated" WITH CHECK (("blocker_id" = "auth"."uid"()));



CREATE POLICY "blocked_select_own" ON "public"."blocked_users" FOR SELECT TO "authenticated" USING (("blocker_id" = "auth"."uid"()));



ALTER TABLE "public"."blocked_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."calls" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversation_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."device_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "device_tokens_delete_own" ON "public"."device_tokens" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "device_tokens_insert_own" ON "public"."device_tokens" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "device_tokens_select_own" ON "public"."device_tokens" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "device_tokens_update_own" ON "public"."device_tokens" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."friendships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "friendships_select_participants" ON "public"."friendships" FOR SELECT TO "authenticated" USING ((("requester_id" = "auth"."uid"()) OR ("addressee_id" = "auth"."uid"())));



ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_insert_own_in_conversation" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = "auth"."uid"()) AND "public"."is_conversation_member"("conversation_id") AND (NOT "public"."conversation_has_block"("conversation_id")) AND (("type" <> 'image'::"text") OR ("media_path" ~~ (((("conversation_id")::"text" || '/'::"text") || ("auth"."uid"())::"text") || '/%'::"text")))));



CREATE POLICY "messages_select_members" ON "public"."messages" FOR SELECT TO "authenticated" USING ("public"."is_conversation_member"("conversation_id"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reports_insert_own" ON "public"."reports" FOR INSERT TO "authenticated" WITH CHECK (("reporter_id" = "auth"."uid"()));



CREATE POLICY "reports_select_own" ON "public"."reports" FOR SELECT TO "authenticated" USING (("reporter_id" = "auth"."uid"()));



ALTER TABLE "public"."user_presence" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_settings_insert_own" ON "public"."user_settings" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "user_settings_select_own" ON "public"."user_settings" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_settings_update_own" ON "public"."user_settings" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."add_group_members"("p_conversation_id" "uuid", "p_user_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."add_group_members"("p_conversation_id" "uuid", "p_user_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_group_members"("p_conversation_id" "uuid", "p_user_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_send_conversation_topic"("p_topic" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_send_conversation_topic"("p_topic" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_send_conversation_topic"("p_topic" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_use_conversation_topic"("p_topic" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_use_conversation_topic"("p_topic" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_use_conversation_topic"("p_topic" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_friend_request"("p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_friend_request"("p_request_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."cancel_friend_request"("p_request_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."chat_image_conversation_id"("p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."chat_image_conversation_id"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."chat_image_conversation_id"("p_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."conversation_has_block"("p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."conversation_has_block"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."conversation_has_block"("p_conversation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_default_user_settings"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_default_user_settings"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_direct_conversation"("p_other_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_direct_conversation"("p_other_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_direct_conversation"("p_other_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_group"("p_name" "text", "p_member_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."create_group"("p_name" "text", "p_member_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_group"("p_name" "text", "p_member_ids" "uuid"[]) TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."messages" TO "authenticated";



GRANT INSERT("id") ON TABLE "public"."messages" TO "authenticated";



GRANT INSERT("conversation_id") ON TABLE "public"."messages" TO "authenticated";



GRANT INSERT("type") ON TABLE "public"."messages" TO "authenticated";



GRANT INSERT("content") ON TABLE "public"."messages" TO "authenticated";



GRANT INSERT("media_path") ON TABLE "public"."messages" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."delete_message"("p_message_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_message"("p_message_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_message"("p_message_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."device_tokens_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."device_tokens_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."device_tokens_set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."edit_message"("p_message_id" "uuid", "p_content" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."edit_message"("p_message_id" "uuid", "p_content" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."edit_message"("p_message_id" "uuid", "p_content" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."friendships_remove_on_block"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."friendships_remove_on_block"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."friendships_set_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."friendships_set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_conversation_overview"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_conversation_overview"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_conversation_overview"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_group_members"("p_conversation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_group_members"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_group_members"("p_conversation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_peer_receipts"("p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_peer_receipts"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_peer_receipts"("p_conversation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_presence"("p_user_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_presence"("p_user_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_presence"("p_user_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_yacu_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_yacu_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_yacu_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_conversation_admin"("p_conversation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_conversation_admin"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_conversation_admin"("p_conversation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_conversation_member"("p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_conversation_member"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_conversation_member"("p_conversation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_valid_avatar_url"("p_url" "text", "p_user" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_valid_avatar_url"("p_url" "text", "p_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_valid_avatar_url"("p_url" "text", "p_user" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."leave_group"("p_conversation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."leave_group"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."leave_group"("p_conversation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_all_delivered"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_all_delivered"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_all_delivered"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_call_missed"("p_call_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_call_missed"("p_call_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_conversation_read"("p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_conversation_read"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_conversation_read"("p_conversation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_call_identity"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_call_identity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_call_identity"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."register_device_token"("p_token" "text", "p_platform" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."register_device_token"("p_token" "text", "p_platform" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_device_token"("p_token" "text", "p_platform" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."remove_friend"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_friend"("p_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."remove_friend"("p_user_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."remove_group_member"("p_conversation_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_group_member"("p_conversation_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_group_member"("p_conversation_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."respond_friend_request"("p_request_id" "uuid", "p_accept" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."respond_friend_request"("p_request_id" "uuid", "p_accept" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."respond_friend_request"("p_request_id" "uuid", "p_accept" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."search_users"("p_term" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."search_users"("p_term" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_users"("p_term" "text") TO "service_role";



GRANT ALL ON TABLE "public"."friendships" TO "service_role";
GRANT SELECT ON TABLE "public"."friendships" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."send_friend_request"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_friend_request"("p_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."send_friend_request"("p_user_id" "uuid") TO "authenticated";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."calls" TO "authenticated";
GRANT ALL ON TABLE "public"."calls" TO "service_role";



REVOKE ALL ON FUNCTION "public"."start_call"("p_conversation_id" "uuid", "p_callee_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."start_call"("p_conversation_id" "uuid", "p_callee_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_call"("p_conversation_id" "uuid", "p_callee_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."touch_presence"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_presence"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_presence"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_call_status"("p_call_id" "uuid", "p_new_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_call_status"("p_call_id" "uuid", "p_new_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_group"("p_conversation_id" "uuid", "p_name" "text", "p_avatar_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_group"("p_conversation_id" "uuid", "p_name" "text", "p_avatar_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_group"("p_conversation_id" "uuid", "p_name" "text", "p_avatar_url" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_settings_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."user_settings_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_settings_set_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."blocked_users" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."blocked_users" TO "authenticated";



GRANT INSERT("blocked_id") ON TABLE "public"."blocked_users" TO "authenticated";



GRANT ALL ON TABLE "public"."conversation_members" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."conversation_members" TO "authenticated";



GRANT UPDATE("last_read_at") ON TABLE "public"."conversation_members" TO "authenticated";



GRANT UPDATE("last_delivered_at") ON TABLE "public"."conversation_members" TO "authenticated";



GRANT ALL ON TABLE "public"."conversations" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."conversations" TO "authenticated";



GRANT ALL ON TABLE "public"."device_tokens" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."device_tokens" TO "authenticated";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."push_deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."push_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."reports" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."reports" TO "authenticated";



GRANT INSERT("reported_user_id") ON TABLE "public"."reports" TO "authenticated";



GRANT INSERT("reason") ON TABLE "public"."reports" TO "authenticated";



GRANT INSERT("details") ON TABLE "public"."reports" TO "authenticated";



GRANT ALL ON TABLE "public"."user_presence" TO "service_role";



GRANT ALL ON TABLE "public"."user_settings" TO "service_role";
GRANT SELECT ON TABLE "public"."user_settings" TO "authenticated";



GRANT INSERT("user_id") ON TABLE "public"."user_settings" TO "authenticated";



GRANT INSERT("show_last_seen"),UPDATE("show_last_seen") ON TABLE "public"."user_settings" TO "authenticated";



GRANT INSERT("show_online_status"),UPDATE("show_online_status") ON TABLE "public"."user_settings" TO "authenticated";



GRANT INSERT("typing_indicator_enabled"),UPDATE("typing_indicator_enabled") ON TABLE "public"."user_settings" TO "authenticated";



GRANT INSERT("read_receipts_enabled"),UPDATE("read_receipts_enabled") ON TABLE "public"."user_settings" TO "authenticated";



GRANT INSERT("push_notifications_enabled"),UPDATE("push_notifications_enabled") ON TABLE "public"."user_settings" TO "authenticated";



GRANT INSERT("theme_preference"),UPDATE("theme_preference") ON TABLE "public"."user_settings" TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







