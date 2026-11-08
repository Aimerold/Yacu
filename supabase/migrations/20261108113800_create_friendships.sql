create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_different_users check (requester_id <> addressee_id)
);

create unique index if not exists friendships_unique_user_pair_idx
  on public.friendships (
    least(requester_id, addressee_id),
    greatest(requester_id, addressee_id)
  );

create index if not exists friendships_addressee_id_idx
  on public.friendships (addressee_id);

create index if not exists friendships_requester_id_idx
  on public.friendships (requester_id);

alter table public.friendships enable row level security;

drop policy if exists friendships_select_participants
  on public.friendships;

create policy friendships_select_participants
  on public.friendships
  for select
  to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

revoke all on table public.friendships from public, anon, authenticated;
grant select on table public.friendships to authenticated;

create or replace function public.friendships_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.friendships'::regclass
      and tgname = 'friendships_set_updated_at_trigger'
      and not tgisinternal
  ) then
    create trigger friendships_set_updated_at_trigger
      before update on public.friendships
      for each row
      execute function public.friendships_set_updated_at();
  end if;
end;
$$;

create or replace function public.send_friend_request(p_user_id uuid)
returns public.friendships
language plpgsql
security definer
set search_path = public
as $$
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

create or replace function public.respond_friend_request(
  p_request_id uuid,
  p_accept boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
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

create or replace function public.cancel_friend_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

create or replace function public.remove_friend(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
    raise exception using message = 'request_not_found';
  end if;
end;
$$;

create or replace function public.friendships_remove_on_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.blocked_users'::regclass
      and tgname = 'blocked_users_remove_friendship_trigger'
      and not tgisinternal
  ) then
    create trigger blocked_users_remove_friendship_trigger
      after insert on public.blocked_users
      for each row
      execute function public.friendships_remove_on_block();
  end if;
end;
$$;

revoke all on function public.friendships_set_updated_at()
  from public, anon, authenticated;
revoke all on function public.friendships_remove_on_block()
  from public, anon, authenticated;
revoke all on function public.send_friend_request(uuid)
  from public, anon, authenticated;
revoke all on function public.respond_friend_request(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.cancel_friend_request(uuid)
  from public, anon, authenticated;
revoke all on function public.remove_friend(uuid)
  from public, anon, authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean)
  to authenticated;
grant execute on function public.cancel_friend_request(uuid) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'friendships'
  ) then
    if not exists (
      select 1 from pg_publication where pubname = 'supabase_realtime'
    ) then
      raise exception 'Publication supabase_realtime does not exist.';
    end if;

    alter publication supabase_realtime add table public.friendships;
  end if;
end;
$$;

-- Tests à lancer séparément dans un environnement de test après avoir remplacé
-- les UUID ci-dessous par ceux des comptes Alice, Bob et Charlie.
--
-- Écriture directe (chacune des trois instructions doit échouer) :
-- begin;
-- set local role authenticated;
-- set local request.jwt.claim.sub = '<alice-uuid>';
-- insert into public.friendships (requester_id, addressee_id)
-- values ('<alice-uuid>', '<bob-uuid>');
-- rollback;
-- Refaire séparément avec UPDATE public.friendships SET status = 'accepted'
-- et DELETE FROM public.friendships.
--
-- Un tiers ne doit lire aucune relation Alice-Bob (résultat vide) :
-- begin;
-- set local role authenticated;
-- set local request.jwt.claim.sub = '<charlie-uuid>';
-- select id from public.friendships
-- where requester_id in ('<alice-uuid>', '<bob-uuid>')
--   and addressee_id in ('<alice-uuid>', '<bob-uuid>');
-- rollback;
--
-- Avec l'UUID d'une demande pending Alice -> Bob, les deux appels ci-dessous
-- doivent échouer avec forbidden :
-- begin;
-- set local role authenticated;
-- set local request.jwt.claim.sub = '<alice-uuid>';
-- select public.respond_friend_request('<request-uuid>', true);
-- rollback;
-- begin;
-- set local role authenticated;
-- set local request.jwt.claim.sub = '<bob-uuid>';
-- select public.cancel_friend_request('<request-uuid>');
-- rollback;
--
-- En tant qu'administrateur de test, créer Alice -> Bob puis tenter l'inverse
-- dans une transaction séparée : la seconde insertion doit violer l'index unique.
-- begin;
-- insert into public.friendships (requester_id, addressee_id)
-- values ('<alice-uuid>', '<bob-uuid>');
-- savepoint before_inverse;
-- insert into public.friendships (requester_id, addressee_id)
-- values ('<bob-uuid>', '<alice-uuid>');
-- rollback to savepoint before_inverse;
-- rollback;
--
-- Avec Alice authentifiée, ces appels doivent chacun échouer avec blocked :
-- select public.send_friend_request('<bob-uuid>');
-- Répéter après un blocage Alice -> Bob puis après un blocage Bob -> Alice.
--
-- Pour vérifier le trigger, créer une relation via send_friend_request, insérer
-- le blocage en tant que propriétaire du compte, puis vérifier qu'aucune ligne
-- Alice-Bob ne subsiste. Annuler la transaction de test ensuite.
--
-- Pour le plafond, préparer 50 destinataires de test distincts et appeler
-- send_friend_request pour chacun avec Alice authentifiée ; le 51e appel doit
-- échouer avec too_many_requests. Annuler les effets du test ensuite.
--
-- Retour arrière manuel (à exécuter dans une transaction dédiée) :
-- drop trigger if exists blocked_users_remove_friendship_trigger
--   on public.blocked_users;
-- drop trigger if exists friendships_set_updated_at_trigger
--   on public.friendships;
-- drop function if exists public.friendships_remove_on_block();
-- drop function if exists public.remove_friend(uuid);
-- drop function if exists public.cancel_friend_request(uuid);
-- drop function if exists public.respond_friend_request(uuid, boolean);
-- drop function if exists public.send_friend_request(uuid);
-- drop function if exists public.friendships_set_updated_at();
-- drop table if exists public.friendships cascade;
