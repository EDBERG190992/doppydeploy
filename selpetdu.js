/* ============================================================
   Doppy — Selección de tipo de mascota (paso 1 del wizard)
   ------------------------------------------------------------
   Este paso no escribe nada en la base todavía (el nombre, edad,
   raza, etc. se completan en petsinfo.html). Lo que sí se conecta
   acá es la SESIÓN: si alguien llega a esta pantalla sin haberse
   registrado/logueado, se lo manda de vuelta al login en vez de
   dejarlo avanzar en un flujo roto.

   También se resuelve y cachea acá el id_client (fila en "users")
   del dueño logueado, para que petsinfo.html no tenga que volver a
   averiguarlo desde cero al insertar la mascota — el mismo patrón
   que ya usa dashboarddu.js con getCurrentClientId().
   ============================================================ */

let supabaseClient = null;
try {
  supabaseClient = window.supabase.createClient(
    'https://xyiebwrjkmvmcpdhenjk.supabase.co',
    'sb_publishable_0Qsrr-I39mcgsm_yj8dEEA_DhtV_2fg'
  );
} catch (e) {
  console.error('No se pudo conectar a Supabase (revisa tu conexión a internet):', e);
}

async function ensureSessionAndClientId(){
  try{
    const { data: { user }, error: authErr } = await supabaseClient.auth.getUser();
    if(authErr || !user){
      console.warn('[Doppy] No active session — sending back to login.');
      window.location.href = 'logindu.html';
      return;
    }

    let { data, error } = await supabaseClient
      .from('users')
      .select('id_client')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if(error){
      console.error('[Doppy][Supabase] Error checking user profile:', error);
      return;
    }

    if(!data){
      // No debería pasar si vino de signupdu.html, pero por las dudas se
      // crea acá también en vez de dejar al dueño sin fila en "users".
      const { data: inserted, error: insertErr } = await supabaseClient
        .from('users')
        .insert([{ auth_user_id: user.id, name: user.email ? user.email.split('@')[0] : 'User', email: user.email }])
        .select('id_client')
        .single();
      if(insertErr || !inserted){
        console.error('[Doppy][Supabase] Could not create the user profile:', insertErr);
        return;
      }
      data = inserted;
    }

    localStorage.setItem('doppy_client_id', String(data.id_client));
  }catch(err){
    console.error('[Doppy] Unexpected error checking session:', err);
  }
}

const form = document.getElementById("petTypeForm");
const nextBtn = document.getElementById("nextBtn");
const nextBtnText = document.getElementById("nextBtnText");
const saveStatus = document.getElementById("saveStatus");
const backBtn = document.getElementById("backBtn");

document.querySelectorAll(".pet-card").forEach((card) => {
  card.addEventListener("click", () => {
    const input = card.querySelector("input[type=radio]");
    input.checked = true;
  });
});

backBtn.addEventListener("click", () => {
  window.location.href = "signupdu.html";
});

form.addEventListener("submit", (e) => {
  e.preventDefault();

  const selected = form.querySelector('input[name="petType"]:checked');
  if (!selected) {
    showStatus("Por favor selecciona un tipo de mascota.", "error");
    return;
  }

  const petType = selected.value;

  // Guardamos el tipo elegido para que petsinfo.html lo use como
  // preselección al cargar (nombre/edad/raza se completan ahí).
  localStorage.setItem("doppy_pending_pet_type", petType);

  setLoading(true);
  showStatus("Guardado ✓", "success");

  setTimeout(() => {
    window.location.href = "petsinfo.html";
  }, 400);
});

/* ---------- UI helpers ---------- */

function setLoading(isLoading) {
  nextBtn.disabled = isLoading;
  nextBtnText.textContent = isLoading ? "Guardando..." : "Next";
}

function showStatus(message, type) {
  saveStatus.textContent = message;
  saveStatus.className = "save-status " + (type || "");
}

/* ---------- Init ---------- */
ensureSessionAndClientId();