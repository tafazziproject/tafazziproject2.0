-- 1) Prima crea l'utente in Supabase Dashboard:
--    Authentication > Users > Add user
-- 2) Copia il suo UUID e sostituiscilo qui sotto.
-- 3) Esegui SOLO questa query nel SQL Editor.

insert into public.admins (user_id)
values ('6a1b81df-98fc-40a2-b0e7-2c168da8e7c9')
on conflict (user_id) do nothing;
