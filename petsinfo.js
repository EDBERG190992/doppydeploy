/* ============================================================
   Doppy — Pet Info (paso 2 del wizard de alta de mascota)
   ------------------------------------------------------------
   FIX 1: el script de Supabase en el HTML ahora usa la ruta UMD
   explícita (…/dist/umd/supabase.min.js), igual que en el resto
   del proyecto — la ruta genérica no siempre deja disponible
   `window.supabase`.

   FIX 2: resolver el owner_id ahora primero intenta usar el
   id_client que selpetdu.js ya dejó cacheado en localStorage
   ("doppy_client_id") en vez de volver a resolver la sesión desde
   cero. Si por algún motivo no está cacheado (por ejemplo, si se
   entra a esta página directamente sin pasar por selpetdu.html),
   cae al mismo mecanismo de siempre (auth -> users.auth_user_id),
   y si tampoco existe la fila en "users" todavía, la crea — igual
   que ya hace dashboarddu.js — en vez de simplemente fallar.
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

// Se agregan turtle y lizard para que coincida con las 6 opciones de selpetdu.html.
const petTypes = {
  dog:    { image: 'assets/dogd.png', label: 'Dog' },
  cat:    { image: 'assets/catd.png', label: 'Cat' },
  bird:   { image: 'assets/parrotd.png', label: 'Bird' },
  turtle: { image: 'assets/turtled.png', label: 'Turtle' },
  rabbit: { image: 'assets/rabitd.png', label: 'Rabbit' },
  lizard: { image: 'assets/lizardd.png', label: 'Lizard' }
};
const typeKeys = Object.keys(petTypes);

// Tomamos el tipo que el usuario ya eligió en selpetdu.html.
const pendingType = (localStorage.getItem('doppy_pending_pet_type') || '').toLowerCase();
let currentTypeIndex = typeKeys.includes(pendingType) ? typeKeys.indexOf(pendingType) : 0;

const petIcon = document.getElementById('petIcon');
const petTypeLabel = document.getElementById('petTypeLabel');
const changeTypeBtn = document.getElementById('changeTypeBtn');
const toast = document.getElementById('toast');

(function initPetType(){
  const key = typeKeys[currentTypeIndex];
  petIcon.src = petTypes[key].image;
  petTypeLabel.textContent = petTypes[key].label;
})();

function showToast(msg){
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(()=> toast.classList.remove('show'), 2200);
}

changeTypeBtn.addEventListener('click', () => {
  currentTypeIndex = (currentTypeIndex + 1) % typeKeys.length;
  const key = typeKeys[currentTypeIndex];
  petIcon.src = petTypes[key].image;
  petTypeLabel.textContent = petTypes[key].label;
});

document.querySelectorAll('.gender-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
});

document.getElementById('backBtn').addEventListener('click', () => {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    showToast('Going back to: Pet Type');
  }
});

document.getElementById('helpBtn').addEventListener('click', () => {
  showToast('Help center: reach us at support@poppy.app');
});

/* ---- Resolver el id_client (owner) del dueño logueado ---- */
async function getCurrentClientId(){
  // Camino rápido: selpetdu.js ya lo dejó cacheado.
  const cached = localStorage.getItem('doppy_client_id');
  if (cached) {
    console.log('[Doppy][petsinfo] Usando doppy_client_id cacheado:', cached);
    return Number(cached);
  }

  try{
    console.log('[Doppy][petsinfo] Sin cache — pidiendo sesión...');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.warn('[Doppy] No hay sesión activa todavía.', authError);
      return null;
    }

    let { data, error } = await supabaseClient
      .from('users')
      .select('id_client')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('[Doppy][petsinfo] Error consultando "users":', error);
      return null;
    }

    if (!data) {
      // No debería pasar si vino del flujo normal, pero por las dudas se
      // crea acá también en vez de fallar directamente.
      const { data: inserted, error: insertErr } = await supabaseClient
        .from('users')
        .insert([{ auth_user_id: user.id, name: user.email ? user.email.split('@')[0] : 'User', email: user.email }])
        .select('id_client')
        .single();
      if (insertErr || !inserted) {
        console.error('[Doppy][petsinfo] No se pudo crear la fila de usuario:', insertErr);
        return null;
      }
      data = inserted;
    }

    localStorage.setItem('doppy_client_id', String(data.id_client));
    return data.id_client;
  }catch(err){
    console.error('[Doppy] Error obteniendo el cliente actual:', err);
    return null;
  }
}

const form = document.getElementById('petForm');
const nameField = document.getElementById('nameField');
const ageField = document.getElementById('ageField');
const breedField = document.getElementById('breedField');
const petName = document.getElementById('petName');
const petAge = document.getElementById('petAge');
const petBreed = document.getElementById('petBreed');
const continueBtn = document.getElementById('continueBtn');

function validate(){
  let valid = true;

  if (petName.value.trim() === '') {
    nameField.classList.add('invalid');
    valid = false;
  } else {
    nameField.classList.remove('invalid');
  }

  if (petAge.value === '' || Number(petAge.value) < 0) {
    ageField.classList.add('invalid');
    valid = false;
  } else {
    ageField.classList.remove('invalid');
  }

  if (petBreed.value.trim() === '') {
    breedField.classList.add('invalid');
    valid = false;
  } else {
    breedField.classList.remove('invalid');
  }

  return valid;
}

function showFatalError(msg){
  console.error('[Doppy][petsinfo] ' + msg);
  showToast('❌ ' + msg);
  let banner = document.getElementById('doppyErrorBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'doppyErrorBanner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#fee2e2;color:#991b1b;padding:12px 20px;font-size:13px;font-weight:600;z-index:999;text-align:center;';
    document.body.prepend(banner);
  }
  banner.textContent = '⚠️ ' + msg;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  console.log('[Doppy][petsinfo] Paso 1: submit disparado');

  if (!validate()) {
    showToast('Please fill in the required fields.');
    return;
  }

  const gender = document.querySelector('.gender-btn.selected').dataset.gender === 'male' ? 'Male' : 'Female';
  const ageUnit = document.getElementById('ageUnit').value === 'years' ? 'years' : 'months';

  const data = {
    type: petTypeLabel.textContent,
    name: petName.value.trim(),
    age: `${petAge.value} ${ageUnit}`,
    breed: petBreed.value.trim(),
    gender
  };
  console.log('[Doppy][petsinfo] Paso 2: datos validados:', data);

  continueBtn.disabled = true;
  continueBtn.textContent = 'Saving…';

  try {
    const isMale = gender === 'Male';
    const isYears = ageUnit === 'years';
    const petRowId = localStorage.getItem('pet_row_id');

    console.log('[Doppy][petsinfo] Paso 3: resolviendo owner_id...');
    let ownerId = null;
    try {
      ownerId = await getCurrentClientId();
    } catch (ownerErr) {
      console.error('[Doppy][petsinfo] Error resolviendo owner_id:', ownerErr);
    }
    console.log('[Doppy][petsinfo] Paso 4: owner_id resuelto ->', ownerId);

    if (ownerId === null) {
      showFatalError('No se encontró sesión activa. Inicia sesión antes de registrar tu mascota.');
      return;
    }

    const petPayload = {
      petTypes: petTypeLabel.textContent,
      pet_name: petName.value.trim(),
      pet_age: Number(petAge.value),
      pet_year: isYears,
      pet_breed: petBreed.value.trim(),
      pet_gender: isMale,
      owner_id: ownerId
    };
    console.log('[Doppy][petsinfo] Paso 5: payload listo:', petPayload);

    if (petRowId) {
      console.log('[Doppy][petsinfo] Paso 6: actualizando fila existente id=' + petRowId);
      const { error } = await supabaseClient
        .from('pets')
        .update(petPayload)
        .eq('id', petRowId);

      if (error) {
        showFatalError('Error al actualizar: ' + error.message);
        return;
      }
    } else {
      console.log('[Doppy][petsinfo] Paso 6: insertando fila nueva');
      const { data: inserted, error } = await supabaseClient
        .from('pets')
        .insert([petPayload])
        .select('id')
        .single();

      if (error) {
        showFatalError('Error al guardar: ' + error.message);
        return;
      }

      console.log('[Doppy][petsinfo] Paso 7: fila insertada con id=' + inserted.id);
      localStorage.setItem('pet_row_id', inserted.id);
    }

    localStorage.removeItem('doppy_pending_pet_type');
    showToast(`Saved! ${data.name} (${data.type}, ${data.age}, ${data.breed}, ${data.gender})`);
    console.log('[Doppy][petsinfo] Paso 8: guardado exitoso, redirigiendo...');

    setTimeout(() => {
      window.location.href = 'logindu.html';
    }, 900);

  } catch (err) {
    showFatalError('Error inesperado: ' + (err && err.message ? err.message : String(err)));
  } finally {
    continueBtn.disabled = false;
    continueBtn.textContent = 'Continue ›';
  }
});

[petName, petAge, petBreed].forEach(input => {
  input.addEventListener('input', () => {
    input.closest('.field').classList.remove('invalid');
  });
});