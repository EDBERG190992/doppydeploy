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
  if (m.includes('invalid login credentials')) return 'Incorrect email or password.';
  if (m.includes('email not confirmed'))       return 'Please confirm your email before signing in.';
  if (m.includes('user not found'))            return 'No account found with that email.';
  return 'Could not sign in: ' + message;
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
  btn.textContent = 'Signing in…';

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

    // PASO 2 — ¿Es veterinary_staff?
    const { data: staffRow, error: staffErr } = await supabaseClient
      .from('veterinary_staff')
      .select('id, veterinary_id, nombre, email, rol')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (staffErr) {
      console.error('[Doppy] veterinary_staff lookup error:', staffErr);
      showToast('❌ Could not verify your account. Please try again.');
      await supabaseClient.auth.signOut();
      return;
    }

    if (staffRow) {
      // ✅ Es veterinary_staff → va a dashboarddv.html
      localStorage.setItem('userName',        staffRow.nombre || name);
      localStorage.setItem('userEmail',       user.email);
      localStorage.setItem('userId',          user.id);
      localStorage.setItem('vetStaffId',      staffRow.id);
      localStorage.setItem('vetVeterinaryId', staffRow.veterinary_id);
      localStorage.setItem('accountType',     'staff');
      showToast('✅ Welcome back, ' + (staffRow.nombre || name) + '!');
      setTimeout(() => { window.location.href = 'dashboarddv.html'; }, 500);
      return;
    }

    // PASO 3 — ¿Es una clínica (veterinary)?
    const { data: clinicRow, error: clinicErr } = await supabaseClient
      .from('veterinary')
      .select('id_veterinary, clinic_name, email, location, affiliation_code')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (clinicErr) {
      console.error('[Doppy] veterinary lookup error:', clinicErr);
      showToast('❌ Could not verify your account. Please try again.');
      await supabaseClient.auth.signOut();
      return;
    }

    if (clinicRow) {
      // ✅ Es clínica → va a dashboardda.html
      localStorage.setItem('userName', clinicRow.clinic_name || name);
      localStorage.setItem('userEmail',     user.email);
      localStorage.setItem('userId',        user.id);
      localStorage.setItem('vetClinicId',   clinicRow.id_veterinary);
      localStorage.setItem('accountType',   'clinic');
      showToast('✅ Welcome back, ' + (clinicRow.clinic_name || name) + '!');
      setTimeout(() => { window.location.href = 'dashboardda.html'; }, 500);
      return;
    }

    // PASO 4 — No está en ninguna tabla → no es del sistema vet/clinic
    showToast('❌ No account found. Please contact your administrator.');
    await supabaseClient.auth.signOut();

  } catch (err) {
    console.error('[Doppy] Unexpected error:', err);
    showToast('❌ An unexpected error occurred.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Done';
  }
}