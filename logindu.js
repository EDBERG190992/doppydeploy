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

async function login() {
  const name  = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const pass  = document.getElementById('pass').value;
  const btn   = document.querySelector('.btn-cta');

  if (!name || !email || !pass) { showToast('⚠️ Completa todos los campos.'); return; }
  if (!email.includes('@'))     { showToast('⚠️ Ingresa un correo válido.'); return; }
  if (pass.length < 6)          { showToast('⚠️ La contraseña debe tener al menos 6 caracteres.'); return; }
  if (!supabaseClient)          { showToast('❌ No se pudo conectar con el servidor.'); return; }

  btn.disabled = true;
  btn.textContent = 'Entrando…';

  try {
    // PASO 1 — Supabase Auth valida email y contraseña
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
    if (error) {
      showToast('❌ ' + translateAuthError(error.message));
      return;
    }
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
  const email = document.getElementById('email').value.trim();
  if (!email || !email.includes('@')) {
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
