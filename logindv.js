const supabaseClient = window.supabase.createClient(
  'https://xyiebwrjkmvmcpdhenjk.supabase.co',
  'sb_publishable_0Qsrr-I39mcgsm_yj8dEEA_DhtV_2fg'
);

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

async function login() {
  const name  = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const pass  = document.getElementById('pass').value;
  const btn   = document.querySelector('.btn-cta');

  if (!name || !email || !pass) { showToast('⚠️ Please fill in all fields.'); return; }
  if (!email.includes('@'))     { showToast('⚠️ Enter a valid email address.'); return; }
  if (pass.length < 6)          { showToast('⚠️ Password must be at least 6 characters.'); return; }

  btn.disabled = true;
  btn.textContent = 'Signing in…';

  try {
    // PASO 1 — Supabase Auth valida email y contraseña
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });

    if (error) {
      showToast('❌ ' + translateAuthError(error.message));
      return;
    }

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