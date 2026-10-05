-- =====================================================================
-- Doppy — BORRADOR de políticas RLS (Row Level Security)
-- ---------------------------------------------------------------------
-- RLS decide, fila por fila, quién puede leer o escribir cada tabla.
-- Hoy cualquiera con la clave pública (la que está en los .js) puede
-- pedir datos a la API; con RLS solo ve lo que le corresponde.
--
-- ⚠️ BORRADOR — NO EJECUTAR EN LA BASE COMPARTIDA SIN PROBAR ANTES.
--    Si una política queda mal, la app deja de ver datos para TODOS.
--    Recomendado: probarlo primero en un proyecto de Supabase de prueba
--    (o tabla por tabla), con una cuenta de dueño, una de veterinario y
--    una de clínica. Para deshacer: sección 5 al final.
--
-- Está escrito a partir de lo que hace el código (no se pudo leer el
-- esquema real). Relaciones que asume:
--   dueño      → users.auth_user_id = auth.uid()            (id: users.id_client)
--   veterinario→ veterinary_staff.auth_user_id = auth.uid() (clínica: veterinary_id)
--   clínica    → veterinary.auth_user_id = auth.uid()       (id: id_veterinary)
--   mascota    → pets.owner_id (dueño), pets.primary_clinic_id (clínica)
--
-- Puntos que requieren decisión del equipo están marcados con "DECIDIR".
-- =====================================================================


-- =====================================================================
-- SECCIÓN 1 — FUNCIONES DE AYUDA
-- security definer: leen las tablas sin pasar por RLS, así las políticas
-- no se llaman a sí mismas en bucle. Solo devuelven ids del usuario actual.
-- =====================================================================
create or replace function public.doppy_client_id() returns bigint
language sql stable security definer set search_path = public as $$
  select id_client::bigint from public.users where auth_user_id = auth.uid() limit 1
$$;

create or replace function public.doppy_staff_id() returns bigint
language sql stable security definer set search_path = public as $$
  select id::bigint from public.veterinary_staff where auth_user_id = auth.uid() limit 1
$$;

-- Clínica del usuario actual: la suya si es la cuenta de la clínica,
-- o la clínica donde trabaja si es veterinario.
create or replace function public.doppy_clinic_id() returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select id_veterinary::bigint from public.veterinary where auth_user_id = auth.uid() limit 1),
    (select veterinary_id::bigint from public.veterinary_staff where auth_user_id = auth.uid() limit 1)
  )
$$;

create or replace function public.doppy_is_clinic_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.veterinary where auth_user_id = auth.uid())
$$;

-- ¿La mascota es del dueño actual, o la atiende la clínica del usuario actual?
create or replace function public.doppy_can_see_pet(p_pet_id bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.pets p
    where p.id = p_pet_id
      and (p.owner_id = public.doppy_client_id()
           or p.primary_clinic_id = public.doppy_clinic_id())
  )
$$;

-- ¿La mascota es atendida por la clínica del usuario actual? (solo personal)
create or replace function public.doppy_clinic_has_pet(p_pet_id bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.pets p
    where p.id = p_pet_id and p.primary_clinic_id = public.doppy_clinic_id()
  )
$$;


-- =====================================================================
-- SECCIÓN 2 — AFILIACIÓN POR CÓDIGO (función en lugar de acceso directo)
-- ---------------------------------------------------------------------
-- Hoy el dueño busca el código en "affiliations" y lo actualiza él mismo.
-- Con RLS eso obligaría a dejar que cualquier dueño lea TODOS los códigos
-- (podría copiarlos). En su lugar, esta función hace la búsqueda en el
-- servidor y solo devuelve el resultado.
--
-- Requiere un cambio pequeño en dashboarddu.js → submitAffiliation():
--   const { data, error } = await supabaseClient.rpc('doppy_solicitar_afiliacion',
--     { p_code: code, p_pet_id: Number(petId) });
--   // data = 'ok' | 'no_existe' | 'pendiente' | 'vencido' | 'agotado' | 'no_es_tu_mascota'
-- (y recibirSolicitudAfiliacion() en dashboardda.js deja de usarse desde el dueño).
-- =====================================================================
create or replace function public.doppy_solicitar_afiliacion(p_code text, p_pet_id bigint)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_client bigint := public.doppy_client_id();
  v_afil   public.affiliations%rowtype;
begin
  if v_client is null then return 'sin_sesion'; end if;
  if not exists (select 1 from public.pets where id = p_pet_id and owner_id = v_client) then
    return 'no_es_tu_mascota';
  end if;
  select * into v_afil from public.affiliations where code = upper(btrim(p_code)) for update;
  if not found then return 'no_existe'; end if;
  if v_afil.status = 'pending' then return 'pendiente'; end if;
  if v_afil.expiration_date is not null and v_afil.expiration_date < current_date then return 'vencido'; end if;
  if v_afil.max_uses is not null and coalesce(v_afil.current_uses, 0) >= v_afil.max_uses then return 'agotado'; end if;

  update public.affiliations
     set status = 'pending', id_client = v_client, pet_id = p_pet_id, requested_at = now()
   where id = v_afil.id;
  return 'ok';
end $$;

revoke all on function public.doppy_solicitar_afiliacion(text, bigint) from public, anon;
grant execute on function public.doppy_solicitar_afiliacion(text, bigint) to authenticated;


-- =====================================================================
-- SECCIÓN 3 — ACTIVAR RLS
-- (Al activarlo, todo queda bloqueado hasta que existan políticas.)
-- =====================================================================
alter table public.users              enable row level security;
alter table public.pets               enable row level security;
alter table public.veterinary         enable row level security;
alter table public.veterinary_staff   enable row level security;
alter table public.affiliations       enable row level security;
alter table public.appointments       enable row level security;
alter table public.clinical_records   enable row level security;
alter table public.vaccination_record enable row level security;
alter table public.prescriptions      enable row level security;
alter table public.vet_private_notes  enable row level security;
alter table public.notifications      enable row level security;
alter table public.events             enable row level security;
alter table public.activity_log       enable row level security;
alter table public.posts              enable row level security;
alter table public.post_comments      enable row level security;
alter table public.post_likes         enable row level security;


-- =====================================================================
-- SECCIÓN 4 — POLÍTICAS
-- Todas son para usuarios con sesión ("authenticated"). Sin sesión no se
-- ve nada (dashboardda.js dejará de mostrar la "clínica demo" id 1).
-- =====================================================================

-- ---------- users (dueños) ----------
create policy "users: el dueño ve su perfil" on public.users
  for select to authenticated using (auth_user_id = auth.uid());
create policy "users: el dueño crea su perfil" on public.users
  for insert to authenticated with check (auth_user_id = auth.uid());
create policy "users: el dueño edita su perfil" on public.users
  for update to authenticated using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
-- La clínica ve a los dueños de sus pacientes y a los que le pidieron afiliación.
create policy "users: la clínica ve a sus dueños" on public.users
  for select to authenticated using (
    exists (select 1 from public.pets p where p.owner_id = users.id_client and p.primary_clinic_id = public.doppy_clinic_id())
    or exists (select 1 from public.affiliations a where a.id_client = users.id_client and a.veterinary_id = public.doppy_clinic_id())
  );
-- DECIDIR: el muro muestra el nombre de quien publica, así que hay que dejar
-- leer la fila de los autores de posts. Eso también expone su correo/teléfono.
-- Mejor a futuro: una vista "perfiles_publicos(id_client, name)" y leer de ahí.
create policy "users: autores del muro visibles" on public.users
  for select to authenticated using (
    exists (select 1 from public.posts po where po.author_type = 'owner' and po.author_id = users.id_client)
  );
-- DECIDIR: dashboardda.js → submitPet() busca dueños por correo en TODA la
-- tabla. Con estas políticas esa búsqueda no encuentra a quien no sea ya
-- dueño/solicitante de la clínica. Opción segura: otra función RPC que
-- reciba el correo y devuelva solo el id_client.

-- ---------- pets ----------
create policy "pets: el dueño ve sus mascotas" on public.pets
  for select to authenticated using (owner_id = public.doppy_client_id());
create policy "pets: el dueño registra mascotas" on public.pets
  for insert to authenticated with check (owner_id = public.doppy_client_id());
create policy "pets: el dueño edita sus mascotas" on public.pets
  for update to authenticated using (owner_id = public.doppy_client_id()) with check (owner_id = public.doppy_client_id());
-- La clínica ve sus pacientes y las mascotas con solicitud de afiliación (para aprobarla).
create policy "pets: la clínica ve sus pacientes" on public.pets
  for select to authenticated using (
    primary_clinic_id = public.doppy_clinic_id()
    or exists (select 1 from public.affiliations a where a.pet_id = pets.id and a.veterinary_id = public.doppy_clinic_id()
               and a.status in ('pending','active'))
  );
create policy "pets: la clínica registra pacientes" on public.pets
  for insert to authenticated with check (primary_clinic_id = public.doppy_clinic_id());
-- Al aprobar una afiliación, dashboardda.js pone primary_clinic_id en la mascota.
create policy "pets: la clínica edita sus pacientes" on public.pets
  for update to authenticated using (
    primary_clinic_id = public.doppy_clinic_id()
    or exists (select 1 from public.affiliations a where a.pet_id = pets.id and a.veterinary_id = public.doppy_clinic_id()
               and a.status in ('pending','active'))
  ) with check (primary_clinic_id = public.doppy_clinic_id());
create policy "pets: solo la cuenta de la clínica borra" on public.pets
  for delete to authenticated using (primary_clinic_id = public.doppy_clinic_id() and public.doppy_is_clinic_admin());

-- ---------- veterinary (clínicas) ----------
-- Datos de contacto de la clínica: visibles para cualquier usuario con sesión
-- (el dueño los ve en su panel y en el modo emergencia).
create policy "veterinary: visible con sesión" on public.veterinary
  for select to authenticated using (true);
create policy "veterinary: la clínica edita sus datos" on public.veterinary
  for update to authenticated using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

-- ---------- veterinary_staff ----------
create policy "staff: ve su propia fila" on public.veterinary_staff
  for select to authenticated using (auth_user_id = auth.uid());
create policy "staff: compañeros de la misma clínica" on public.veterinary_staff
  for select to authenticated using (veterinary_id = public.doppy_clinic_id());
create policy "staff: el dueño ve al veterinario de sus mascotas" on public.veterinary_staff
  for select to authenticated using (
    exists (select 1 from public.pets p where p.assigned_veterinarian_id = veterinary_staff.id and p.owner_id = public.doppy_client_id())
  );
create policy "staff: autores del muro visibles" on public.veterinary_staff
  for select to authenticated using (
    exists (select 1 from public.posts po where po.author_type = 'staff' and po.author_id = veterinary_staff.id)
  );
create policy "staff: la clínica agrega personal" on public.veterinary_staff
  for insert to authenticated with check (veterinary_id = public.doppy_clinic_id() and public.doppy_is_clinic_admin());
create policy "staff: la clínica edita su personal" on public.veterinary_staff
  for update to authenticated using (veterinary_id = public.doppy_clinic_id() and public.doppy_is_clinic_admin())
  with check (veterinary_id = public.doppy_clinic_id());

-- ---------- affiliations ----------
create policy "afil: la clínica gestiona sus códigos" on public.affiliations
  for all to authenticated using (veterinary_id = public.doppy_clinic_id())
  with check (veterinary_id = public.doppy_clinic_id());
-- El dueño solo ve SUS solicitudes; para pedir una usa doppy_solicitar_afiliacion().
create policy "afil: el dueño ve sus solicitudes" on public.affiliations
  for select to authenticated using (id_client = public.doppy_client_id());

-- ---------- appointments ----------
create policy "citas: el dueño ve las de sus mascotas" on public.appointments
  for select to authenticated using (exists (select 1 from public.pets p where p.id = appointments.pet_id and p.owner_id = public.doppy_client_id()));
-- El dueño pide citas solo en la clínica de su mascota y en estado "scheduled".
create policy "citas: el dueño pide citas" on public.appointments
  for insert to authenticated with check (
    status = 'scheduled'
    and exists (select 1 from public.pets p where p.id = appointments.pet_id and p.owner_id = public.doppy_client_id()
                and p.primary_clinic_id = appointments.veterinary_id)
  );
create policy "citas: la clínica gestiona las suyas" on public.appointments
  for all to authenticated using (veterinary_id = public.doppy_clinic_id())
  with check (veterinary_id = public.doppy_clinic_id());

-- ---------- historial médico ----------
create policy "historial: lo ven dueño y clínica" on public.clinical_records
  for select to authenticated using (public.doppy_can_see_pet(pet_id));
create policy "historial: lo escribe la clínica" on public.clinical_records
  for insert to authenticated with check (public.doppy_clinic_has_pet(pet_id));

create policy "vacunas: las ven dueño y clínica" on public.vaccination_record
  for select to authenticated using (public.doppy_can_see_pet(pet_id));
create policy "vacunas: las registra la clínica" on public.vaccination_record
  for insert to authenticated with check (public.doppy_clinic_has_pet(pet_id));

create policy "recetas: las ven dueño y clínica" on public.prescriptions
  for select to authenticated using (public.doppy_can_see_pet(pet_id));
create policy "recetas: las escribe la clínica" on public.prescriptions
  for insert to authenticated with check (public.doppy_clinic_has_pet(pet_id));

-- Notas privadas: SOLO el personal de la clínica (el dueño no las ve).
create policy "notas privadas: solo la clínica" on public.vet_private_notes
  for select to authenticated using (public.doppy_clinic_has_pet(pet_id));
create policy "notas privadas: las escribe la clínica" on public.vet_private_notes
  for insert to authenticated with check (public.doppy_clinic_has_pet(pet_id));

-- ---------- notifications ----------
create policy "notif: el veterinario ve las suyas" on public.notifications
  for select to authenticated using (staff_id = public.doppy_staff_id());
create policy "notif: la clínica ve las de su personal" on public.notifications
  for select to authenticated using (
    public.doppy_is_clinic_admin()
    and exists (select 1 from public.veterinary_staff s where s.id = notifications.staff_id and s.veterinary_id = public.doppy_clinic_id())
  );
-- Modo emergencia del dueño: solo puede avisar al veterinario asignado a una de sus mascotas.
create policy "notif: el dueño avisa a su veterinario" on public.notifications
  for insert to authenticated with check (
    exists (select 1 from public.pets p where p.assigned_veterinarian_id = notifications.staff_id and p.owner_id = public.doppy_client_id())
  );

-- ---------- events / activity_log ----------
create policy "eventos: visibles con sesión" on public.events
  for select to authenticated using (true);
create policy "actividad: la ve su clínica" on public.activity_log
  for select to authenticated using (veterinary_id = public.doppy_clinic_id());

-- ---------- muro: posts, likes, comentarios ----------
create policy "posts: visibles con sesión" on public.posts
  for select to authenticated using (true);
create policy "posts: publicar como uno mismo" on public.posts
  for insert to authenticated with check (
    (author_type = 'owner' and author_id = public.doppy_client_id())
    or (author_type = 'staff' and author_id = public.doppy_staff_id())
  );
create policy "posts: borrar los propios" on public.posts
  for delete to authenticated using (
    (author_type = 'owner' and author_id = public.doppy_client_id())
    or (author_type = 'staff' and author_id = public.doppy_staff_id())
  );

create policy "likes: visibles con sesión" on public.post_likes
  for select to authenticated using (true);
create policy "likes: dar like como uno mismo" on public.post_likes
  for insert to authenticated with check (user_id = public.doppy_client_id());
create policy "likes: quitar el propio" on public.post_likes
  for delete to authenticated using (user_id = public.doppy_client_id());

create policy "comentarios: visibles con sesión" on public.post_comments
  for select to authenticated using (true);
create policy "comentarios: comentar como uno mismo" on public.post_comments
  for insert to authenticated with check (user_id = public.doppy_client_id());


-- =====================================================================
-- SECCIÓN 5 — DESHACER (vuelve al estado actual: sin RLS)
-- =====================================================================
-- do $$
-- declare r record;
-- begin
--   for r in select schemaname, tablename, policyname from pg_policies
--            where schemaname = 'public' and tablename in ('users','pets','veterinary','veterinary_staff','affiliations',
--              'appointments','clinical_records','vaccination_record','prescriptions','vet_private_notes','notifications',
--              'events','activity_log','posts','post_comments','post_likes')
--   loop
--     execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
--   end loop;
--   for r in select unnest(array['users','pets','veterinary','veterinary_staff','affiliations','appointments',
--              'clinical_records','vaccination_record','prescriptions','vet_private_notes','notifications','events',
--              'activity_log','posts','post_comments','post_likes']) as t
--   loop
--     execute format('alter table public.%I disable row level security', r.t);
--   end loop;
-- end $$;
-- drop function if exists public.doppy_solicitar_afiliacion(text, bigint), public.doppy_can_see_pet(bigint),
--   public.doppy_clinic_has_pet(bigint), public.doppy_is_clinic_admin(), public.doppy_clinic_id(),
--   public.doppy_staff_id(), public.doppy_client_id();
