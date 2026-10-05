/* ============================================================
   Doppy — Signup (dueños)
   ------------------------------------------------------------
   FIX 1: el script de Supabase ahora se carga desde la ruta UMD
   explícita en el HTML (…/dist/umd/supabase.min.js). La versión
   genérica (…/@supabase/supabase-js sin la ruta) no siempre deja
   `window.supabase` disponible en el navegador, y por eso a veces
   no cargaba nada (mismo bug que tuvo dashboardda.html).

   FIX 2: se sacó la lógica que "adivinaba" el nombre de la tabla
   de usuarios probando clients/client/clientes/usuarios/users/
   owners/perfiles/profiles hasta que alguna no tirara error. La
   tabla real siempre fue "users" — esa adivinanza era innecesaria
   y arriesgada (podía "acertar" con una tabla que no correspondía).

   FIX 3: el insert ahora usa las columnas reales de "users"
   (name, email, auth_user_id) en vez de una tabla y columnas que
   no existen.
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

function togglePass(id, btn) {
  const input = document.getElementById(id);
  const isText = input.type === 'text';
  input.type = isText ? 'password' : 'text';
  btn.style.color = isText ? 'var(--text-light)' : 'var(--blue)';
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

/* ============================================================
   VALIDACIONES (mismas reglas en todo el proyecto, ver CLAUDE.md)
   ============================================================ */
const RE_EMAIL  = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RE_NOMBRE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]{2,60}$/;

function validarNombre(v) {
  if (!v) return 'Escribe tu nombre.';
  if (!RE_NOMBRE.test(v) || !/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2}/.test(v)) return 'El nombre solo puede tener letras y espacios (2 a 60 caracteres).';
  return null;
}
function validarEmail(v) {
  if (!v) return 'Escribe tu correo.';
  if (v.length > 254 || !RE_EMAIL.test(v)) return 'Escribe un correo válido (ej. nombre@correo.com).';
  return null;
}
// Contraseña nueva: 8 a 72 caracteres, con al menos una letra y un número.
function validarPasswordNueva(v, email) {
  if (!v) return 'Escribe una contraseña.';
  if (v.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (v.length > 72) return 'La contraseña no puede tener más de 72 caracteres.';
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return 'La contraseña debe tener letras y números.';
  if (email && v.toLowerCase() === email.toLowerCase()) return 'La contraseña no puede ser igual a tu correo.';
  return null;
}

// Marca en rojo el campo con error y muestra el mensaje debajo.
function marcarError(inputId, msg) {
  const input = document.getElementById(inputId);
  const wrap = input.closest('.input-wrap');
  wrap.classList.add('invalid');
  let err = wrap.nextElementSibling;
  if (!err || !err.classList.contains('field-error')) {
    err = document.createElement('div');
    err.className = 'field-error';
    wrap.after(err);
  }
  err.textContent = msg;
}
function limpiarErrores() {
  document.querySelectorAll('.input-wrap.invalid').forEach(w => w.classList.remove('invalid'));
  document.querySelectorAll('.field-error').forEach(e => e.remove());
}
// Al corregir un campo se le quita la marca de error.
document.querySelectorAll('.input-wrap input').forEach(input => {
  input.addEventListener('input', () => {
    const wrap = input.closest('.input-wrap');
    wrap.classList.remove('invalid');
    const err = wrap.nextElementSibling;
    if (err && err.classList.contains('field-error')) err.remove();
  });
});

async function register() {
  // Se normalizan espacios: "  Ana   López " → "Ana López"
  const nombre = document.getElementById('nombre').value.trim().replace(/\s+/g, ' ');
  const email  = document.getElementById('email').value.trim().toLowerCase();
  const pass   = document.getElementById('pass').value;
  const pass2  = document.getElementById('pass2').value;

  const btn = document.querySelector('.btn-cta');

  limpiarErrores();
  const errores = [
    ['nombre', validarNombre(nombre)],
    ['email',  validarEmail(email)],
    ['pass',   validarPasswordNueva(pass, email)],
    ['pass2',  !pass2 ? 'Confirma tu contraseña.' : (pass !== pass2 ? 'Las contraseñas no coinciden.' : null)]
  ].filter(([, msg]) => msg);

  if (errores.length) {
    errores.forEach(([id, msg]) => marcarError(id, msg));
    document.getElementById(errores[0][0]).focus();
    showToast('⚠️ ' + errores[0][1]);
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Creating account…';

  try {
    // 1. Create the user in Supabase Auth. Supabase Auth stores the
    // password securely (hashed) itself — that's why we never save a
    // "contra"/password column anywhere in our own tables.
    const { data, error: authError } = await supabaseClient.auth.signUp({
      email: email,
      password: pass,
      options: {
        data: { nombre: nombre }
      }
    });

    if (authError) {
      console.error('[Doppy][Supabase] Auth error:', authError);
      showToast('❌ Error: ' + authError.message);
      return;
    }

    // If email confirmation is required, Supabase may not return a user id here.
    if (!data.user) {
      console.warn('[Doppy] Signup returned no user (email confirmation may be required).');
      showToast('⚠️ Check your email to confirm your account.');
      return;
    }

    // 2. Create the matching profile row in "users".
    // id_client is auto-generated by the database — never set it manually.
    const authUserId = data.user.id;
    const { error: dbError } = await supabaseClient
      .from('users')
      .insert([{
        name: nombre,
        email: email,
        auth_user_id: authUserId
      }]);

    if (dbError) {
      console.error('[Doppy][Supabase] Error saving profile:', dbError);
      showToast('⚠️ Account created but failed to save profile: ' + dbError.message);
      return;
    }

    showToast('🐾 Account created successfully!');
    document.getElementById('nombre').value = '';
    document.getElementById('email').value  = '';
    document.getElementById('pass').value   = '';
    document.getElementById('pass2').value  = '';

    setTimeout(() => {
      window.location.href = 'selpetdu.html';
    }, 800);

  } catch (err) {
    console.error('[Doppy] Unexpected error:', err);
    showToast('❌ An unexpected error occurred.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign up';
  }
}