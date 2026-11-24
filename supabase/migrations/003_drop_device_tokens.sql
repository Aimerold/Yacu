-- Migration des tokens de device_tokens vers push_tokens (déjà exécutée manuellement)
-- Conservation de l'historique : device_tokens est supprimée, push_tokens devient la table de référence.
drop table if exists public.device_tokens;