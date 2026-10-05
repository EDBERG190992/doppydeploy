-- =====================================================================
-- Doppy — Restricciones (CHECK / UNIQUE) para las tablas de Supabase
-- ---------------------------------------------------------------------
-- Son las mismas reglas que las validaciones del JS (ver CLAUDE.md →
-- "Validaciones"), pero aplicadas en la base: así nadie puede saltárselas
-- llamando a la API directamente.
--
-- ⚠️ NO SE HA EJECUTADO TODAVÍA. La base es compartida: revisar en equipo.
--
-- Cómo usarlo (Supabase → SQL Editor), en este orden:
--   PASO 1  Ejecutar solo la sección 1 (diagnóstico). No cambia nada:
--           lista las filas que ya existen y no cumplen las reglas.
--   PASO 2  Corregir o borrar esas filas (o ajustar la regla aquí).
--   PASO 3  Ejecutar la sección 2. Las restricciones se crean con
--           NOT VALID: se aplican a filas nuevas y modificadas, pero no
--           revisan las antiguas, así que no fallan por datos viejos.
--   PASO 4  Cuando el diagnóstico salga vacío, ejecutar la sección 3
--           (VALIDATE + índices únicos) para que también cubran lo antiguo.
--
-- Si una columna no existe (ej. users.phone), su restricción se omite
-- sola y aparece un NOTICE; no da error.
-- Para deshacer: sección 4 al final.
-- =====================================================================


-- =====================================================================
-- SECCIÓN 1 — DIAGNÓSTICO (solo lectura)
-- =====================================================================
-- Cada consulta devuelve las filas que NO cumplen la regla.
-- Si alguna columna no existe en tu tabla, comenta esa consulta.

-- users
select 'users.name' as regla, id_client, name from public.users
 where not (char_length(name) between 2 and 60 and name ~ '^[[:alpha:] .''-]+$');
select 'users.email' as regla, id_client, email from public.users
 where email is not null and not (char_length(email) <= 254 and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$');

-- pets
select 'pets.pet_name' as regla, id, pet_name from public.pets
 where not (char_length(pet_name) between 1 and 30 and pet_name ~ '^[[:alnum:] .''-]+$' and pet_name ~ '[[:alpha:]]');
select 'pets.pet_breed' as regla, id, pet_breed from public.pets
 where pet_breed is not null and not (char_length(pet_breed) between 2 and 40 and pet_breed ~ '^[[:alpha:] .''-]+$');
select 'pets.pet_age' as regla, id, pet_age, pet_year from public.pets
 where pet_age is not null and not (pet_age >= 0 and pet_age <= case when pet_year = false then 24 else 40 end);
select 'pets.petTypes' as regla, id, "petTypes" from public.pets
 where "petTypes" is not null and lower("petTypes") not in ('dog','cat','bird','turtle','rabbit','lizard');

-- vacunas, recetas, notas
select 'vaccination_record' as regla, id, vaccine_name, dose_number from public.vaccination_record
 where not (char_length(vaccine_name) between 2 and 60) or (dose_number is not null and dose_number not between 1 and 10);
select 'prescriptions.instructions' as regla, id, instructions from public.prescriptions
 where instructions is not null and not (char_length(btrim(instructions)) between 5 and 500);
select 'vet_private_notes.note' as regla, id, note from public.vet_private_notes
 where not (char_length(btrim(note)) between 3 and 1000);

-- citas
select 'appointments' as regla, id, status, type, notes from public.appointments
 where (status is not null and status not in ('scheduled','completed','cancelled','no_show'))
    or (type is not null and type not in ('checkup','vaccination','consultation','review','dermatology','deworming','grooming','other'))
    or (notes is not null and char_length(notes) > 500);

-- afiliaciones
select 'affiliations' as regla, id, code, status, current_uses, max_uses from public.affiliations
 where code !~ '^DOPPY-[A-Z0-9]{4}-[A-Z0-9]{4}$'
    or status not in ('unclaimed','pending','active','rejected','expired')
    or current_uses < 0 or (max_uses is not null and (max_uses < 1 or current_uses > max_uses));
select 'affiliations.code repetido' as regla, code, count(*) from public.affiliations group by code having count(*) > 1;

-- muro
select 'posts' as regla, id, title, author_type, post_type from public.posts
 where not (char_length(btrim(title)) between 3 and 120)
    or not (char_length(btrim(content)) between 5 and 2000)
    or author_type not in ('owner','staff')
    or (post_type is not null and post_type not in ('community','tip','event','poll'));
select 'post_likes repetido' as regla, post_id, user_id, count(*) from public.post_likes group by post_id, user_id having count(*) > 1;

-- personal y clínica
select 'veterinary_staff' as regla, id, nombre, email, schedule_start, schedule_end from public.veterinary_staff
 where not (char_length(nombre) between 2 and 60 and nombre ~ '^[[:alpha:] .''-]+$')
    or (email is not null and email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$')
    or (schedule_start is not null and schedule_end is not null and schedule_end <= schedule_start);
select 'veterinary_staff.email repetido' as regla, veterinary_id, lower(email), count(*) from public.veterinary_staff
 where email is not null group by veterinary_id, lower(email) having count(*) > 1;
select 'veterinary' as regla, id_veterinary, clinic_name, email from public.veterinary
 where not (char_length(btrim(clinic_name)) between 2 and 80)
    or (email is not null and email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$');


-- =====================================================================
-- SECCIÓN 2 — CREAR RESTRICCIONES (NOT VALID)
-- =====================================================================
-- Función temporal: agrega la restricción solo si la columna existe y la
-- restricción todavía no fue creada. Desaparece al cerrar la sesión.
create or replace function pg_temp.doppy_check(tabla text, columna text, nombre text, expr text)
returns void language plpgsql as $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = tabla and column_name = columna) then
    raise notice 'Omitida % (no existe %.%)', nombre, tabla, columna;
    return;
  end if;
  if exists (select 1 from pg_constraint where conname = nombre) then
    raise notice 'Ya existe %', nombre;
    return;
  end if;
  execute format('alter table public.%I add constraint %I check (%s) not valid', tabla, nombre, expr);
  raise notice 'Creada %', nombre;
end $$;

begin;

-- users ---------------------------------------------------------------
select pg_temp.doppy_check('users', 'name', 'users_name_chk',
  $c$char_length(name) between 2 and 60 and name ~ '^[[:alpha:] .''-]+$'$c$);
select pg_temp.doppy_check('users', 'email', 'users_email_chk',
  $c$email is null or (char_length(email) <= 254 and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$')$c$);
select pg_temp.doppy_check('users', 'phone', 'users_phone_chk',
  $c$phone is null or phone = '' or (phone ~ '^\+?[0-9 ().-]{7,20}$' and char_length(regexp_replace(phone, '\D', '', 'g')) between 7 and 15)$c$);

-- pets ----------------------------------------------------------------
select pg_temp.doppy_check('pets', 'pet_name', 'pets_name_chk',
  $c$char_length(pet_name) between 1 and 30 and pet_name ~ '^[[:alnum:] .''-]+$' and pet_name ~ '[[:alpha:]]'$c$);
select pg_temp.doppy_check('pets', 'pet_breed', 'pets_breed_chk',
  $c$pet_breed is null or (char_length(pet_breed) between 2 and 40 and pet_breed ~ '^[[:alpha:] .''-]+$')$c$);
select pg_temp.doppy_check('pets', 'pet_age', 'pets_age_chk',
  $c$pet_age is null or (pet_age >= 0 and pet_age <= case when pet_year = false then 24 else 40 end)$c$);
select pg_temp.doppy_check('pets', 'petTypes', 'pets_type_chk',
  $c$"petTypes" is null or lower("petTypes") in ('dog','cat','bird','turtle','rabbit','lizard')$c$);

-- vacunas, recetas, notas ---------------------------------------------
select pg_temp.doppy_check('vaccination_record', 'vaccine_name', 'vacc_name_chk',
  $c$char_length(vaccine_name) between 2 and 60$c$);
select pg_temp.doppy_check('vaccination_record', 'dose_number', 'vacc_dose_chk',
  $c$dose_number is null or dose_number between 1 and 10$c$);
select pg_temp.doppy_check('prescriptions', 'instructions', 'rx_instructions_chk',
  $c$instructions is null or char_length(btrim(instructions)) between 5 and 500$c$);
select pg_temp.doppy_check('vet_private_notes', 'note', 'notes_note_chk',
  $c$char_length(btrim(note)) between 3 and 1000$c$);

-- citas ---------------------------------------------------------------
-- Valores tomados del código: dashboarddv.js (APPT_TYPE_COLOR), dashboardda.js
-- y dashboarddu.js (APPT_TYPES). Si se agrega un tipo/estado nuevo en el JS,
-- hay que agregarlo aquí también.
select pg_temp.doppy_check('appointments', 'status', 'appt_status_chk',
  $c$status is null or status in ('scheduled','completed','cancelled','no_show')$c$);
select pg_temp.doppy_check('appointments', 'type', 'appt_type_chk',
  $c$type is null or type in ('checkup','vaccination','consultation','review','dermatology','deworming','grooming','other')$c$);
select pg_temp.doppy_check('appointments', 'notes', 'appt_notes_chk',
  $c$notes is null or char_length(notes) <= 500$c$);

-- afiliaciones --------------------------------------------------------
select pg_temp.doppy_check('affiliations', 'code', 'afil_code_chk',
  $c$code ~ '^DOPPY-[A-Z0-9]{4}-[A-Z0-9]{4}$'$c$);
select pg_temp.doppy_check('affiliations', 'status', 'afil_status_chk',
  $c$status in ('unclaimed','pending','active','rejected','expired')$c$);
select pg_temp.doppy_check('affiliations', 'current_uses', 'afil_uses_chk',
  $c$current_uses >= 0 and (max_uses is null or (max_uses >= 1 and current_uses <= max_uses))$c$);

-- muro ----------------------------------------------------------------
select pg_temp.doppy_check('posts', 'title', 'posts_title_chk',
  $c$char_length(btrim(title)) between 3 and 120$c$);
select pg_temp.doppy_check('posts', 'content', 'posts_content_chk',
  $c$char_length(btrim(content)) between 5 and 2000$c$);
select pg_temp.doppy_check('posts', 'author_type', 'posts_author_type_chk',
  $c$author_type in ('owner','staff')$c$);
select pg_temp.doppy_check('posts', 'post_type', 'posts_type_chk',
  $c$post_type is null or post_type in ('community','tip','event','poll')$c$);
-- post_comments: falta confirmar cómo se llama la columna del texto
-- (dashboarddu.js la detecta entre content/comment/text/body/message).
-- Cuando se sepa, agregar aquí: char_length(btrim(<columna>)) between 1 and 500.

-- personal y clínica --------------------------------------------------
select pg_temp.doppy_check('veterinary_staff', 'nombre', 'staff_nombre_chk',
  $c$char_length(nombre) between 2 and 60 and nombre ~ '^[[:alpha:] .''-]+$'$c$);
select pg_temp.doppy_check('veterinary_staff', 'email', 'staff_email_chk',
  $c$email is null or email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'$c$);
select pg_temp.doppy_check('veterinary_staff', 'schedule_end', 'staff_schedule_chk',
  $c$schedule_start is null or schedule_end is null or schedule_end > schedule_start$c$);
select pg_temp.doppy_check('veterinary', 'clinic_name', 'clinic_name_chk',
  $c$char_length(btrim(clinic_name)) between 2 and 80$c$);
select pg_temp.doppy_check('veterinary', 'email', 'clinic_email_chk',
  $c$email is null or email = '' or email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'$c$);
select pg_temp.doppy_check('veterinary', 'phone', 'clinic_phone_chk',
  $c$phone is null or phone = '' or (phone ~ '^\+?[0-9 ().-]{7,20}$' and char_length(regexp_replace(phone, '\D', '', 'g')) between 7 and 15)$c$);
select pg_temp.doppy_check('veterinary', 'postal_code', 'clinic_cp_chk',
  $c$postal_code is null or postal_code = '' or postal_code ~ '^[A-Za-z0-9 -]{3,10}$'$c$);
select pg_temp.doppy_check('veterinary', 'website', 'clinic_web_chk',
  $c$website is null or website = '' or website ~* '^(https?://)?([[:alnum:]_-]+\.)+[a-z]{2,}(/[^[:space:]]*)?$'$c$);

commit;


-- =====================================================================
-- SECCIÓN 3 — VALIDAR LO ANTIGUO E ÍNDICES ÚNICOS
-- Ejecutar SOLO cuando el diagnóstico (sección 1) salga vacío.
-- =====================================================================
-- Revisa también las filas antiguas (falla si alguna no cumple):
-- do $$
-- declare r record;
-- begin
--   for r in select conrelid::regclass as tabla, conname from pg_constraint
--            where convalidated = false and conname ~ '_chk$' and connamespace = 'public'::regnamespace
--   loop
--     execute format('alter table %s validate constraint %I', r.tabla, r.conname);
--     raise notice 'Validada %', r.conname;
--   end loop;
-- end $$;

-- Un código de afiliación no puede repetirse:
-- create unique index if not exists affiliations_code_uq on public.affiliations (code);
-- Un dueño solo puede dar un "me gusta" por publicación:
-- create unique index if not exists post_likes_post_user_uq on public.post_likes (post_id, user_id);
-- No puede haber dos veterinarios con el mismo correo en la misma clínica:
-- create unique index if not exists staff_clinic_email_uq on public.veterinary_staff (veterinary_id, lower(email)) where email is not null;


-- =====================================================================
-- SECCIÓN 4 — DESHACER (borra todas las restricciones de este archivo)
-- =====================================================================
-- do $$
-- declare r record;
-- begin
--   for r in select conrelid::regclass as tabla, conname from pg_constraint
--            where conname in ('users_name_chk','users_email_chk','users_phone_chk','pets_name_chk','pets_breed_chk',
--              'pets_age_chk','pets_type_chk','vacc_name_chk','vacc_dose_chk','rx_instructions_chk','notes_note_chk',
--              'appt_status_chk','appt_type_chk','appt_notes_chk','afil_code_chk','afil_status_chk','afil_uses_chk',
--              'posts_title_chk','posts_content_chk','posts_author_type_chk','posts_type_chk','staff_nombre_chk',
--              'staff_email_chk','staff_schedule_chk','clinic_name_chk','clinic_email_chk','clinic_phone_chk',
--              'clinic_cp_chk','clinic_web_chk')
--   loop
--     execute format('alter table %s drop constraint %I', r.tabla, r.conname);
--   end loop;
-- end $$;
-- drop index if exists public.affiliations_code_uq, public.post_likes_post_user_uq, public.staff_clinic_email_uq;
