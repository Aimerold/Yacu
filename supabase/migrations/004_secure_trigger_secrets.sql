-- Fonction sécurisée : lit les secrets dans le Vault à chaque appel
create or replace function public.yacu_call_edge_function()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_api_key text;
  v_webhook_secret text;
  v_url text;
begin
  select decrypted_secret
  into v_api_key
  from vault.decrypted_secrets
  where name = 'yacu_edge_functions';

  select decrypted_secret
  into v_webhook_secret
  from vault.decrypted_secrets
  where name = 'yacu_webhook_secret';

  if v_api_key is null or v_webhook_secret is null then
    raise exception 'Secrets Vault manquants : yacu_edge_functions ou yacu_webhook_secret';
  end if;

  if tg_table_name = 'messages' then
    v_url := (select decrypted_secret
              from vault.decrypted_secrets
              where name = 'yacu_project_url')
             || '/functions/v1/send-push-notification';
  elsif tg_table_name = 'calls' then
    v_url := (select decrypted_secret
              from vault.decrypted_secrets
              where name = 'yacu_project_url')
             || '/functions/v1/send-call-notification';
  else
    return new;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_api_key,
      'x-webhook-secret', v_webhook_secret
    ),
    body := jsonb_build_object(
      'type', tg_op,
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', to_jsonb(new)
    )
  );

  return new;
end;
$$;

revoke execute on function public.yacu_call_edge_function()
from anon, authenticated;

drop trigger if exists push_on_message_insert
  on public.messages;

create trigger push_on_message_insert
after insert on public.messages
for each row
execute function public.yacu_call_edge_function();

drop trigger if exists "send-call-notification"
  on public.calls;

create trigger "send-call-notification"
after insert on public.calls
for each row
execute function public.yacu_call_edge_function();