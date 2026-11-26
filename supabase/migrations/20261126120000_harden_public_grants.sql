-- Réduit les privilèges par défaut trop larges sur le schéma public.

revoke truncate, references, trigger
on all tables in schema public
from anon, authenticated;

revoke all on table public.profiles
from anon;

revoke all on table public.push_tokens
from anon;