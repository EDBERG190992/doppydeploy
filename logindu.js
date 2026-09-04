// 1. Initialize the Supabase client de forma defensiva: si el script de
// Supabase no llegó a cargar (por ejemplo, sin conexión a internet o el
// CDN bloqueado), esto ya no rompe el resto del archivo — solo avisa.
let supabaseClient = null;
try {
  if (typeof window.supabase === 'undefined') {
    throw new Error('El script de Supabase no cargó (revisa tu conexión a internet o si algo bloquea cdn.jsdelivr.net).');
  }
  supabaseClient = window.supabase.createClient(
    'https://xyiebwrjkmvmcpdhenjk.supabase.co',
    'sb_publishable_0Qsrr-I39mcgsm_yj8dEEA_DhtV_2fg'
  );
} catch (initErr) {
  console.error('[Doppy] Error inicializando Supabase:', initErr);
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
  if (m.includes('invalid login credentials')) {
    return 'Incorrect email or password.';
  }
  if (m.includes('email not confirmed')) {
    return 'Please confirm your email before signing in. Check your inbox.';
  }
  if (m.includes('user not found')) {
    return 'No account found with that email.';
  }
  return 'Could not sign in: ' + message;
}

async function login() {
  if (!supabaseClient) {
    showToast('❌ No se pudo conectar con Supabase. Revisa tu conexión e intenta de nuevo.');
    return;
  }

  const name  = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const pass  = document.getElementById('pass').value;
  const btn   = document.querySelector('.btn-cta');

  if (!name || !email || !pass) {
    showToast('⚠️ Please fill in all fields.');
    return;
  }
  if (!email.includes('@')) {
    showToast('⚠️ Enter a valid email address.');
    return;
  }
  if (pass.length < 6) {
    showToast('⚠️ Password must be at least 6 characters.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Signing in…';

  try {
    // 2. Verify credentials against Supabase Auth.
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: pass
    });

    if (error) {
      console.error('Supabase error:', error);
      showToast('❌ ' + translateAuthError(error.message));
      return;
    }

    const user = data.user;

    // 3. La contraseña ya fue validada por Supabase Auth. Ahora hay que
    // confirmar que esta persona tiene un perfil real de dueño de mascota,
    // es decir, que exista una fila en "users" ligada a este auth_user_id.
    const { data: userRow, error: userErr } = await supabaseClient
      .from('users')
      .select('id_client, name, email')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (userErr) {
      console.error('Supabase error (users):', userErr);
      showToast('❌ Could not verify your account: ' + userErr.message);
      await supabaseClient.auth.signOut();
      return;
    }

    if (!userRow) {
      // El usuario existe en Supabase Auth pero no tiene fila en "users"
      showToast('Please, create an account');
      await supabaseClient.auth.signOut();
      return;
    }

    // 4. Todo válido: guardamos los datos del usuario y lo llevamos a su dashboard
    localStorage.setItem('userName', userRow.name || name);
    localStorage.setItem('userEmail', user.email);
    localStorage.setItem('userId', user.id);
    localStorage.setItem('clientId', userRow.id_client);
    localStorage.setItem('accountType', 'owner');

    showToast('✅ Welcome back!');
    setTimeout(() => {
      window.location.href = 'dashboarddu.html';
    }, 500);

  } catch (err) {
    console.error('Unexpected error:', err);
    showToast('❌ An unexpected error occurred: ' + (err.message || err));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Done';
  }
}