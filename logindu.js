/* ============================================================
   Doppy — Login de dueños (logindu.html)
   ------------------------------------------------------------
   Mismo patrón que logindv.js:
   PASO 1 — Supabase Auth valida email y contraseña.
   PASO 2 — Se busca el perfil del dueño en "users" (auth_user_id).
   PASO 3 — Si no existe y la cuenta es de veterinaria/clínica, se
            le indica que use el otro login.
   PASO 4 — Si no existe y no es de veterinaria, se crea la fila en
            "users" (pasa cuando el registro pidió confirmar el correo
            y signupdu.js no llegó a insertar el perfil).
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

function togglePass() {
  const input = document.getElementById('pass');
  input.type = input.type === 'password' ? 'text' : 'password';
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function translateAuthError(message) {
  const m = (message || '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed'))       return 'Confirma tu correo antes de iniciar sesión.';
  if (m.includes('user not found'))            return 'No hay ninguna cuenta con ese correo.';
  return 'No se pudo iniciar sesión: ' + message;
}

/* ============================================================
   VALIDACIONES (mismas reglas en todo el proyecto, ver CLAUDE.md)
   ============================================================ */
const RE_EMAIL  = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RE_NOMBRE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]{2,60}$/;
const MAX_INTENTOS = 5;          // intentos fallidos seguidos permitidos
const ESPERA_MS = 30 * 1000;     // espera después de superarlos

function marcarError(inputId, msg) {
  const wrap = document.getElementById(inputId).closest('.input-wrap');
  wrap.classList.add('invalid');
  const host = wrap.closest('.pass-row') || wrap;
  let err = host.nextElementSibling;
  if (!err || !err.classList.contains('field-error')) {
    err = document.createElement('div');
    err.className = 'field-error';
    host.after(err);
  }
  err.textContent = msg;
}
function limpiarErrores() {
  document.querySelectorAll('.input-wrap.invalid').forEach(w => w.classList.remove('invalid'));
  document.querySelectorAll('.field-error').forEach(e => e.remove());
}
document.querySelectorAll('.input-wrap input').forEach(input => {
  input.addEventListener('input', () => input.closest('.input-wrap').classList.remove('invalid'));
});

// Bloqueo temporal tras varios intentos fallidos (se guarda por pestaña).
function segundosBloqueo() {
  const hasta = Number(sessionStorage.getItem('doppy_login_lock') || 0);
  return Math.max(0, Math.ceil((hasta - Date.now()) / 1000));
}
function registrarFallo() {
  const n = Number(sessionStorage.getItem('doppy_login_fails') || 0) + 1;
  sessionStorage.setItem('doppy_login_fails', String(n));
  if (n >= MAX_INTENTOS) {
    sessionStorage.setItem('doppy_login_lock', String(Date.now() + ESPERA_MS));
    sessionStorage.setItem('doppy_login_fails', '0');
  }
}
function limpiarFallos() {
  sessionStorage.removeItem('doppy_login_fails');
  sessionStorage.removeItem('doppy_login_lock');
}

function validarLogin(name, email, pass) {
  const errores = [];
  if (!name) errores.push(['name', 'Escribe tu nombre.']);
  else if (!RE_NOMBRE.test(name)) errores.push(['name', 'El nombre solo puede tener letras y espacios.']);
  if (!email) errores.push(['email', 'Escribe tu correo.']);
  else if (email.length > 254 || !RE_EMAIL.test(email)) errores.push(['email', 'Escribe un correo válido.']);
  if (!pass) errores.push(['pass', 'Escribe tu contraseña.']);
  else if (pass.length < 6 || pass.length > 72) errores.push(['pass', 'La contraseña debe tener entre 6 y 72 caracteres.']);
  return errores;
}

async function login() {
  const name  = document.getElementById('name').value.trim().replace(/\s+/g, ' ');
  const email = document.getElementById('email').value.trim().toLowerCase();
  const pass  = document.getElementById('pass').value;
  const btn   = document.querySelector('.btn-cta');

  limpiarErrores();
  const espera = segundosBloqueo();
  if (espera) { showToast(`⏳ Demasiados intentos. Espera ${espera} s e inténtalo de nuevo.`); return; }

  const errores = validarLogin(name, email, pass);
  if (errores.length) {
    errores.forEach(([id, msg]) => marcarError(id, msg));
    document.getElementById(errores[0][0]).focus();
    showToast('⚠️ ' + errores[0][1]);
    return;
  }
  if (!supabaseClient) { showToast('❌ No se pudo conectar con el servidor.'); return; }

  btn.disabled = true;
  btn.textContent = 'Entrando…';

  try {
    // PASO 1 — Supabase Auth valida email y contraseña
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
    if (error) {
      registrarFallo();
      showToast('❌ ' + translateAuthError(error.message));
      return;
    }
    limpiarFallos();
    const user = data.user;

    // PASO 2 — ¿Tiene perfil de dueño en "users"?
    let { data: owner, error: ownerErr } = await supabaseClient
      .from('users')
      .select('id_client, name, email')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (ownerErr) {
      console.error('[Doppy] users lookup error:', ownerErr);
      showToast('❌ No se pudo verificar tu cuenta. Inténtalo de nuevo.');
      await supabaseClient.auth.signOut();
      return;
    }

    if (!owner) {
      // PASO 3 — ¿Es una cuenta de veterinaria o de clínica?
      const [staffRes, clinicRes] = await Promise.all([
        supabaseClient.from('veterinary_staff').select('id').eq('auth_user_id', user.id).maybeSingle(),
        supabaseClient.from('veterinary').select('id_veterinary').eq('auth_user_id', user.id).maybeSingle()
      ]);
      if (staffRes.data || clinicRes.data) {
        showToast('ℹ️ Esta es una cuenta de veterinaria. Usa el acceso para clínicas.');
        await supabaseClient.auth.signOut();
        setTimeout(() => { window.location.href = 'logindv.html'; }, 1500);
        return;
      }

      // PASO 4 — Dueño sin perfil todavía: se crea la fila en "users".
      const { data: inserted, error: insertErr } = await supabaseClient
        .from('users')
        .insert([{ name: name, email: user.email, auth_user_id: user.id }])
        .select('id_client, name, email')
        .single();
      if (insertErr || !inserted) {
        console.error('[Doppy] Could not create the user profile:', insertErr);
        showToast('❌ No se pudo crear tu perfil: ' + (insertErr ? insertErr.message : ''));
        await supabaseClient.auth.signOut();
        return;
      }
      owner = inserted;
    }

    // ✅ Dueño → dashboarddu.html
    // Si cambió de cuenta en este navegador, se olvida la mascota en edición de la anterior.
    if (localStorage.getItem('doppy_client_id') !== String(owner.id_client)) {
      localStorage.removeItem('pet_row_id');
    }
    localStorage.setItem('doppy_client_id', String(owner.id_client));
    localStorage.setItem('userName',        owner.name || name);
    localStorage.setItem('userEmail',       user.email);
    localStorage.setItem('userId',          user.id);
    localStorage.setItem('accountType',     'owner');

    showToast('✅ ¡Bienvenido de nuevo, ' + (owner.name || name) + '!');
    setTimeout(() => { window.location.href = 'dashboarddu.html'; }, 500);

  } catch (err) {
    console.error('[Doppy] Unexpected error:', err);
    showToast('❌ Ocurrió un error inesperado.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
}

/* ---------- ¿Olvidaste tu contraseña? ----------
   Supabase envía el correo de recuperación al email escrito arriba. */
document.querySelector('.forgot')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim().toLowerCase();
  if (!email || !RE_EMAIL.test(email)) {
    showToast('✉️ Escribe tu correo arriba y vuelve a tocar aquí.');
    return;
  }
  if (!supabaseClient) { showToast('❌ No se pudo conectar con el servidor.'); return; }
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname
  });
  if (error) {
    console.error('[Doppy] resetPasswordForEmail', error);
    showToast('❌ ' + error.message);
    return;
  }
  showToast('📬 Te enviamos un correo para restablecer tu contraseña.');
});

/* ---------- Botón de ayuda ---------- */
document.querySelector('button.nav-btn')?.addEventListener('click', () => {
  showToast('¿No tienes cuenta? Regístrate gratis desde la página de inicio.');
});

/* ---------- Si ya hay sesión de dueño, rellenar el correo ---------- */
(function prefillEmail() {
  const saved = localStorage.getItem('userEmail');
  const type  = localStorage.getItem('accountType');
  const input = document.getElementById('email');
  if (saved && type === 'owner' && input && !input.value) input.value = saved;
  const savedName = localStorage.getItem('userName');
  const nameInput = document.getElementById('name');
  if (savedName && type === 'owner' && nameInput && !nameInput.value) nameInput.value = savedName;
})();
