/* ============================================================
   Doppy — Panel del dueño (dashboarddu)
   ------------------------------------------------------------
   Conectado a Supabase con las mismas tablas y columnas que ya
   usan dashboarddv.js / dashboardda.js / petsinfo.js:
     users, pets, affiliations, veterinary, veterinary_staff,
     appointments, vaccination_record, clinical_records,
     prescriptions, events, posts, post_likes, post_comments,
     notifications.

   Las filas se leen con select('*') y solo se escribe en una
   columna "opcional" (users.phone, users.fecha_nacimiento,
   pets.description) si esa columna vino en la fila leída. Lo que
   todavía no tiene columna en la base (foto de la mascota, eventos
   personales, preferencias) se guarda en este navegador
   (localStorage) y está marcado con "LOCAL" en los comentarios.
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

/* ---------- estado ---------- */
let currentUser = null;        // usuario de Supabase Auth
let currentClient = null;      // fila de "users"
let pets = [];                 // mascotas del dueño
let currentPetId = null;
let vaccinations = [];         // vaccination_record de la mascota actual
let appointments = [];         // appointments de todas sus mascotas
let affiliations = [];         // affiliations del dueño
let clinicsById = {};          // veterinary por id_veterinary
let staffById = {};            // veterinary_staff por id
let communityEvents = [];      // tabla events
let personalEvents = [];       // LOCAL
let posts = [];
let likesByPost = {};          // post_id -> cantidad
let myLikes = new Set();       // post_id que likeó este dueño
let commentsByPost = {};       // post_id -> [filas]
let commentTextKey = 'content';
let dbNotifications = [];

let calDate = new Date();
let calFilterType = 'all';
let notifFilter = 0;           // 0 todos, 1 recordatorios, 2 sin leer
let wallFilter = 'Todos';
let wallSearch = '';

const VACC_COLORS = ['#7ee0f0', '#4fc3e8', '#2e86d6', '#1e5fa8', '#FDE05A', '#f5b301'];
const APPT_TYPES = [
  { key: 'checkup',      label: 'Chequeo general' },
  { key: 'vaccination',  label: 'Vacunación' },
  { key: 'consultation', label: 'Consulta' },
  { key: 'deworming',    label: 'Desparasitación' },
  { key: 'other',        label: 'Otro' }
];
const WALL_CATEGORIES = ['General', 'Consejos', 'Salud', 'Adopción', 'Entrenamiento', 'Eventos'];

/* ============================================================
   HELPERS
   ============================================================ */
const $ = id => document.getElementById(id);

function esc(v){
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function lsGet(key, fallback){
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
}
function lsSet(key, value){
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { console.warn('[Doppy] localStorage lleno o bloqueado:', e); return false; }
}
function clientKey(suffix){ return `doppy_${suffix}_${currentClient ? currentClient.id_client : 'anon'}`; }

function showToast(msg){
  const t = $('toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove('show'), 3000);
}

function speciesToIcon(petTypes){
  const key = (petTypes || '').toLowerCase();
  const map = { dog:'assets/dogd.png', cat:'assets/catd.png', bird:'assets/parrotd.png', turtle:'assets/turtled.png', rabbit:'assets/rabitd.png', lizard:'assets/lizardd.png' };
  return map[key] || 'assets/PawB.png';
}
function speciesLabel(petTypes){
  const key = (petTypes || '').toLowerCase();
  const map = { dog:'Perro', cat:'Gato', bird:'Ave', turtle:'Tortuga', rabbit:'Conejo', lizard:'Lagartija' };
  return map[key] || (petTypes || 'Mascota');
}
function ageText(pet){
  if(!pet || pet.pet_age === null || pet.pet_age === undefined) return 'Edad sin registrar';
  const n = pet.pet_age;
  const years = pet.pet_year !== false;
  return `${n} ${years ? (n === 1 ? 'año' : 'años') : (n === 1 ? 'mes' : 'meses')}`;
}
function lifeStage(pet){
  if(!pet || pet.pet_age === null || pet.pet_age === undefined) return '';
  const years = pet.pet_year !== false ? pet.pet_age : pet.pet_age / 12;
  if(years < 1) return 'Cachorro';
  if(years < 3) return 'Joven';
  if(years < 8) return 'Adulto';
  return 'Senior';
}
function genderText(pet){ return pet && pet.pet_gender === false ? 'Hembra' : 'Macho'; }
function initials(name){
  return (name || '').split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('') || 'D';
}
function dateKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function fmtDate(iso, opts){
  if(!iso) return '—';
  // Las fechas sin hora (ej. next_due_date "2026-05-01") se leen en hora local,
  // si no, en zonas con UTC negativo se mostrarían un día antes.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T00:00:00') : new Date(iso);
  if(isNaN(d)) return '—';
  return d.toLocaleDateString('es', opts || { day:'2-digit', month:'short', year:'numeric' });
}
function fmtTime(iso){
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' });
}
function timeAgo(iso){
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if(mins < 1) return 'Ahora';
  if(mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if(hrs < 24) return `Hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return days < 30 ? `Hace ${days} d` : fmtDate(iso);
}
function petById(id){ return pets.find(p => String(p.id) === String(id)); }
function currentPet(){ return petById(currentPetId) || null; }
function apptTypeLabel(a){
  if(a.title) return a.title;
  const t = APPT_TYPES.find(x => x.key === a.type);
  return t ? t.label : 'Cita';
}

/* Clínica y veterinario de una mascota (o de la primera afiliación activa) */
function clinicForPet(pet){
  if(pet && pet.primary_clinic_id && clinicsById[pet.primary_clinic_id]) return clinicsById[pet.primary_clinic_id];
  const active = affiliations.find(a => a.status === 'active' && (!pet || String(a.pet_id) === String(pet.id)));
  if(active && clinicsById[active.veterinary_id]) return clinicsById[active.veterinary_id];
  return null;
}
function staffForPet(pet){
  return pet && pet.assigned_veterinarian_id ? (staffById[pet.assigned_veterinarian_id] || null) : null;
}
function clinicAddress(c){
  if(!c) return '';
  return [c.address || c.location, c.city, c.province].filter(Boolean).join(', ');
}

/* Fotos: LOCAL (todavía no hay bucket de Storage ni columna photo_url confirmada) */
function petPhoto(pet){ return pet ? (pet.photo_url || lsGet(`doppy_pet_photo_${pet.id}`, null)) : null; }

function resizeImage(file, maxSize){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function setDbStatus(state, text){
  const el = $('dbStatus');
  if(!el) return;
  el.classList.remove('ok', 'error');
  if(state) el.classList.add(state);
  $('dbStatusText').textContent = text;
}

/* ============================================================
   CARGA DESDE SUPABASE
   ============================================================ */
async function loadClient(){
  const { data, error } = await supabaseClient
    .from('users').select('*').eq('auth_user_id', currentUser.id).maybeSingle();
  if(error){ console.error('[Doppy] loadClient', error); return; }

  if(data){ currentClient = data; }
  else {
    // Mismo respaldo que selpetdu.js / petsinfo.js: si no hay fila en "users", se crea.
    const { data: inserted, error: insErr } = await supabaseClient
      .from('users')
      .insert([{ auth_user_id: currentUser.id, name: localStorage.getItem('userName') || (currentUser.email || 'Usuario').split('@')[0], email: currentUser.email }])
      .select('*').single();
    if(insErr){ console.error('[Doppy] No se pudo crear la fila en users', insErr); return; }
    currentClient = inserted;
  }
  localStorage.setItem('doppy_client_id', String(currentClient.id_client));
}

async function loadPets(){
  const { data, error } = await supabaseClient
    .from('pets').select('*').eq('owner_id', currentClient.id_client).order('id', { ascending: true });
  if(error){ console.error('[Doppy] loadPets', error); pets = []; return; }
  pets = data || [];
  const saved = localStorage.getItem('doppy_current_pet_id');
  currentPetId = petById(saved) ? saved : (pets[0] ? String(pets[0].id) : null);
}

async function loadAffiliationsAndClinics(){
  const { data, error } = await supabaseClient
    .from('affiliations')
    .select('id, code, status, veterinary_id, pet_id, requested_at')
    .eq('id_client', currentClient.id_client);
  if(error) console.error('[Doppy] loadAffiliations', error);
  affiliations = data || [];

  const clinicIds = [...new Set([
    ...affiliations.map(a => a.veterinary_id),
    ...pets.map(p => p.primary_clinic_id)
  ].filter(Boolean))];
  const staffIds = [...new Set(pets.map(p => p.assigned_veterinarian_id).filter(Boolean))];

  const [clinicsRes, staffRes] = await Promise.all([
    clinicIds.length ? supabaseClient.from('veterinary').select('*').in('id_veterinary', clinicIds) : Promise.resolve({ data: [] }),
    staffIds.length ? supabaseClient.from('veterinary_staff').select('*').in('id', staffIds) : Promise.resolve({ data: [] })
  ]);
  if(clinicsRes.error) console.error('[Doppy] load veterinary', clinicsRes.error);
  if(staffRes.error) console.error('[Doppy] load veterinary_staff', staffRes.error);
  clinicsById = {}; (clinicsRes.data || []).forEach(c => { clinicsById[c.id_veterinary] = c; });
  staffById = {};   (staffRes.data || []).forEach(s => { staffById[s.id] = s; });
}

async function loadAppointments(){
  const petIds = pets.map(p => p.id);
  if(!petIds.length){ appointments = []; return; }
  const { data, error } = await supabaseClient
    .from('appointments').select('*').in('pet_id', petIds).order('appointment_date', { ascending: true });
  if(error){ console.error('[Doppy] loadAppointments', error); appointments = []; return; }
  appointments = data || [];
}

async function loadVaccinations(){
  if(!currentPetId){ vaccinations = []; return; }
  const { data, error } = await supabaseClient
    .from('vaccination_record').select('*').eq('pet_id', currentPetId).order('created_at', { ascending: true });
  if(error){ console.error('[Doppy] loadVaccinations', error); vaccinations = []; return; }
  vaccinations = data || [];
}

async function loadEvents(){
  const { data, error } = await supabaseClient.from('events').select('*').order('event_date', { ascending: true }).limit(50);
  if(error){ console.error('[Doppy] loadEvents', error); communityEvents = []; return; }
  communityEvents = data || [];
}

async function loadPosts(){
  const { data, error } = await supabaseClient.from('posts').select('*').order('created_at', { ascending: false }).limit(50);
  if(error){ console.error('[Doppy] loadPosts', error); posts = []; return; }
  const rows = data || [];
  const ownerIds = [...new Set(rows.filter(r => r.author_type !== 'staff').map(r => r.author_id).filter(Boolean))];
  const staffIds = [...new Set(rows.filter(r => r.author_type === 'staff').map(r => r.author_id).filter(Boolean))];
  const postIds = rows.map(r => r.id);

  const [ownersRes, staffRes, likesRes, commentsRes] = await Promise.all([
    ownerIds.length ? supabaseClient.from('users').select('id_client, name').in('id_client', ownerIds) : Promise.resolve({ data: [] }),
    staffIds.length ? supabaseClient.from('veterinary_staff').select('id, nombre').in('id', staffIds) : Promise.resolve({ data: [] }),
    postIds.length ? supabaseClient.from('post_likes').select('*').in('post_id', postIds) : Promise.resolve({ data: [] }),
    postIds.length ? supabaseClient.from('post_comments').select('*').in('post_id', postIds) : Promise.resolve({ data: [] })
  ]);

  const ownerMap = {}; (ownersRes.data || []).forEach(u => { ownerMap[u.id_client] = u.name; });
  const staffMap = {}; (staffRes.data || []).forEach(s => { staffMap[s.id] = s.nombre; });

  likesByPost = {}; myLikes = new Set();
  (likesRes.data || []).forEach(l => {
    likesByPost[l.post_id] = (likesByPost[l.post_id] || 0) + 1;
    if(String(l.user_id) === String(currentClient.id_client)) myLikes.add(l.post_id);
  });

  commentsByPost = {};
  const comments = commentsRes.data || [];
  // El nombre de la columna del texto no aparece en el resto del código:
  // se detecta en las filas existentes y, si no hay ninguna, se usa "content".
  if(comments.length){
    const k = ['content', 'comment', 'text', 'body', 'message'].find(key => key in comments[0]);
    if(k) commentTextKey = k;
  }
  comments.forEach(c => { (commentsByPost[c.post_id] = commentsByPost[c.post_id] || []).push(c); });

  posts = rows.map(r => ({
    ...r,
    authorName: r.author_type === 'staff' ? (staffMap[r.author_id] || 'Veterinario') : (ownerMap[r.author_id] || 'Miembro de la comunidad')
  }));
}

async function loadNotifications(){
  const { data, error } = await supabaseClient.from('notifications').select('*').order('created_at', { ascending: false }).limit(50);
  if(error){ console.error('[Doppy] loadNotifications', error); dbNotifications = []; return; }
  // En la base solo está confirmada la columna staff_id (notificaciones del personal);
  // se muestran las que tengan alguna columna de dueño igual a este id_client.
  const cid = String(currentClient.id_client);
  dbNotifications = (data || []).filter(n => ['id_client', 'user_id', 'owner_id', 'client_id'].some(k => k in n && String(n[k]) === cid));
}

/* ============================================================
   NAVEGACIÓN Y UI GENERAL
   ============================================================ */
function showView(name, navEl){
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const view = $('view-' + name);
  if(view) view.classList.add('active');

  const target = navEl || document.querySelector(`.nav-item[data-view="${name}"]`);
  document.querySelectorAll('.nav-item').forEach(n => {
    const active = n === target;
    n.classList.toggle('active', active);
    const img = n.querySelector('.icon img');
    if(img) img.src = img.src.replace(active ? /W\.png$/ : /B\.png$/, active ? 'B.png' : 'W.png');
  });

  closeSidebar();
  window.scrollTo({ top: 0 });
  if(name === 'calendar') renderCalendar();
  if(name === 'emergency') startEmergency();
  if(name === 'notifications') renderNotifications();
}

function openSidebar(){ $('sidebar').classList.add('open'); $('overlay').classList.add('show'); }
function closeSidebar(){ $('sidebar')?.classList.remove('open'); $('overlay')?.classList.remove('show'); }
function closeAvatarMenu(){ $('avatarMenu')?.classList.remove('open'); $('avatarChev')?.classList.remove('open'); }

function goToSettings(){
  showView('profile', document.querySelector('[data-view=profile]'));
  const card = [...document.querySelectorAll('#view-profile .card')].find(c => c.querySelector('.settings-row'));
  if(card) setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}

function confirmEmergency(){
  if(confirm('¿Activar el modo de emergencia? Buscaremos veterinarias abiertas cerca de ti.')) showView('emergency');
}

function toggleDarkMode(){
  const dark = document.body.classList.toggle('dark');
  lsSet('doppy_dark_mode', dark);
  if($('appearanceValue')) $('appearanceValue').textContent = dark ? 'Oscuro' : 'Claro';
}

async function handleLogout(){
  if(!confirm('¿Cerrar sesión en Doppy?')) return;
  try { if(supabaseClient) await supabaseClient.auth.signOut(); } catch (e) { console.error(e); }
  ['doppy_client_id', 'accountType', 'userId', 'doppy_current_pet_id', 'pet_row_id'].forEach(k => localStorage.removeItem(k));
  window.location.href = 'index.html';
}

function selectPet(id){
  currentPetId = String(id);
  localStorage.setItem('doppy_current_pet_id', currentPetId);
  loadVaccinations().then(() => { renderAll(); });
}

/* ---------- modal genérico ---------- */
let qrStream = null;
let qrLoopId = null;

function openModal(title, bodyHtml, opts = {}){
  const box = $('modalBox');
  box.classList.toggle('wide', !!opts.wide);
  box.innerHTML = `
    <div class="modal-head"><h3>${title}</h3><button class="modal-close" onclick="closeModal()" aria-label="Cerrar">×</button></div>
    <div class="modal-body">${bodyHtml}</div>`;
  $('modalOverlay').classList.add('open');
}
function closeModal(){
  stopQrScan();
  $('modalOverlay').classList.remove('open');
  $('modalBox').innerHTML = '';
}

function petOptions(selectedId){
  return pets.map(p => `<option value="${p.id}" ${String(p.id) === String(selectedId) ? 'selected' : ''}>${esc(p.pet_name)} (${esc(speciesLabel(p.petTypes))})</option>`).join('');
}

/* ============================================================
   RENDER — todo
   ============================================================ */
function renderAll(){
  renderHeader();
  renderDashboard();
  renderProfile();
  renderPetProfile();
  renderCalendar();
  renderUpcoming();
  renderDiscoverEvents();
  renderPosts();
  renderTrending();
  renderNotifications();
  renderEmergencyPets();
  renderEmergencyMedicalSummary();
}

function renderHeader(){
  const avatar = document.querySelector('.topbar .avatar');
  if(avatar) avatar.textContent = initials(currentClient?.name);
  const unread = getNotificationItems().filter(n => !n.read).length;
  const badge = $('bellBadge');
  if(badge){ badge.textContent = unread; badge.style.display = unread ? 'flex' : 'none'; }
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function renderDashboard(){
  const pet = currentPet();
  const nameEl = $('dashPetName'), ageEl = $('dashPetAge');

  let sub = document.querySelector('.pet-meta .pet-sub');
  if(!sub){ sub = document.createElement('div'); sub.className = 'pet-sub'; document.querySelector('.pet-meta')?.appendChild(sub); }

  if(!pet){
    nameEl.textContent = 'Agrega tu primera mascota';
    nameEl.setAttribute('contenteditable', 'false');
    ageEl.textContent = '';
    ageEl.setAttribute('contenteditable', 'false');
    sub.innerHTML = `<button class="link" onclick="location.href='selpetdu.html'">+ Agregar mascota</button>`;
  } else {
    nameEl.textContent = pet.pet_name || 'Sin nombre';
    nameEl.setAttribute('contenteditable', 'true');
    ageEl.textContent = ageText(pet);
    ageEl.setAttribute('contenteditable', 'true');
    sub.textContent = `${speciesLabel(pet.petTypes)} · ${pet.pet_breed || 'Raza sin registrar'} · ${genderText(pet)}`;
  }

  // Foto: la del dueño si la subió (LOCAL), si no el dibujo de la especie.
  const wrap = $('dashPetPhotoWrap'), img = $('dashPetPhotoImg');
  const photo = petPhoto(pet);
  if(photo){
    img.src = photo; img.style.objectFit = 'cover'; img.style.padding = '0';
    img.style.display = 'block'; wrap.classList.add('has-photo');
  } else if(pet){
    img.src = speciesToIcon(pet.petTypes); img.style.objectFit = 'contain'; img.style.padding = '18px';
    img.style.display = 'block'; wrap.classList.remove('has-photo');
  } else {
    img.style.display = 'none'; wrap.classList.remove('has-photo');
  }

  renderVaccinationChart();
  renderVetInfo();
  renderSchedule();
}

function renderVaccinationChart(){
  const card = document.querySelector('.vaccination-card');
  if(!card) return;
  const legend = card.querySelector('.legend');
  const bars = card.querySelector('.bars');

  // Dosis por vacuna (la mayor dose_number registrada, o la cantidad de registros)
  const byName = {};
  vaccinations.forEach(v => {
    const name = v.vaccine_name || 'Vacuna';
    byName[name] = Math.max(byName[name] || 0, v.dose_number || 0, (byName[name] || 0) + (v.dose_number ? 0 : 1));
  });
  const entries = Object.entries(byName).slice(0, 6);

  if(!entries.length){
    legend.innerHTML = '';
    bars.innerHTML = `<p class="empty" style="margin:auto;text-align:center;">${currentPet() ? 'Aún no hay vacunas registradas.<br>Las agrega tu veterinario.' : 'Sin mascota seleccionada.'}</p>`;
    return;
  }
  const max = Math.max(1, ...entries.map(e => e[1]));
  const ticks = Array.from({ length: 5 }, (_, i) => +(max - (max / 4) * i).toFixed(1));
  legend.innerHTML = entries.map(([n], i) => `<span><i class="dot" style="background:${VACC_COLORS[i]}"></i>${esc(n)}</span>`).join('');
  bars.innerHTML = `<div class="y-axis">${ticks.map(t => `<span>${t}</span>`).join('')}</div>` +
    entries.map(([n, doses], i) => `
      <div class="bar-group" title="${esc(n)}: ${doses} dosis">
        <div class="bar" style="height:${Math.max(4, (doses / max) * 100)}%;background:${VACC_COLORS[i]}"></div>
        <div class="bar-label">${esc(n)}</div>
      </div>`).join('');
}

function renderVetInfo(){
  const pet = currentPet();
  const clinic = clinicForPet(pet);
  const staff = staffForPet(pet);
  ['vetNombre', 'vetVeterinario', 'vetLugar', 'vetTelefono'].forEach(id => $(id)?.setAttribute('contenteditable', 'false'));

  const pending = affiliations.filter(a => a.status === 'pending');
  if(!clinic){
    $('vetNombre').textContent = pending.length ? 'Solicitud de afiliación enviada' : 'Sin clínica afiliada';
    $('vetVeterinario').textContent = pending.length ? 'Esperando aprobación de la clínica' : 'Toca 📷 para afiliarte con el código de tu clínica';
    $('vetLugar').textContent = '—';
    $('vetTelefono').textContent = '—';
    $('vetHours').innerHTML = `<div>${pending.length ? '⏳ La clínica revisará tu solicitud.' : 'Aún no hay clínica afiliada'}</div>`;
  } else {
    $('vetNombre').textContent = clinic.clinic_name || 'Clínica';
    $('vetVeterinario').textContent = staff ? `${staff.nombre}${staff.specialty ? ' · ' + staff.specialty : ''}` : 'Veterinario por asignar';
    $('vetLugar').textContent = clinicAddress(clinic) || '—';
    $('vetTelefono').textContent = clinic.phone || staff?.telefono || '—';
    const hours = staff && staff.schedule_start && staff.schedule_end
      ? `<div><b>Horario de ${esc(staff.nombre)}</b></div><div>${esc(String(staff.schedule_start).slice(0,5))} – ${esc(String(staff.schedule_end).slice(0,5))}</div>`
      : `<div><b>${esc(clinic.clinic_name || 'Clínica')}</b></div><div>${esc(clinic.email || 'Consulta el horario con la clínica')}</div>`;
    $('vetHours').innerHTML = hours;
  }

  // Foto de la clínica: LOCAL
  const photo = clinic ? lsGet(`doppy_clinic_photo_${clinic.id_veterinary}`, null) : null;
  const img = $('vetPhotoImg'), wrap = $('vetPhotoWrap');
  if(photo){ img.src = photo; img.style.display = 'block'; wrap.classList.add('has-photo'); }
  else { img.style.display = 'none'; wrap.classList.remove('has-photo'); }
}

/* Próximas citas y eventos de la mascota actual */
function getCalendarItems(){
  const items = [];
  appointments.forEach(a => {
    const pet = petById(a.pet_id);
    items.push({
      kind: 'appointment', id: a.id, date: a.appointment_date, title: apptTypeLabel(a),
      sub: pet ? pet.pet_name : '', petId: a.pet_id, status: a.status, notes: a.notes
    });
  });
  personalEvents.forEach(e => {
    const pet = petById(e.petId);
    items.push({
      kind: 'event', id: e.id, date: e.date, title: e.title,
      sub: [pet ? pet.pet_name : '', e.location].filter(Boolean).join(' · '), petId: e.petId, location: e.location
    });
  });
  return items.sort((a, b) => new Date(a.date) - new Date(b.date));
}
function upcomingItems(petId){
  const now = Date.now() - 60 * 60000;
  return getCalendarItems().filter(i => new Date(i.date).getTime() >= now && (!petId || String(i.petId) === String(petId)));
}

function renderSchedule(){
  const el = $('scheduleList');
  if(!el) return;
  const items = upcomingItems(currentPetId).slice(0, 4);
  el.innerHTML = items.length ? items.map(i => {
    const d = new Date(i.date);
    return `<div class="sched-item ${i.kind}">
      <div class="sched-date"><b>${d.getDate()}</b><small>${d.toLocaleDateString('es', { month: 'short' })}</small></div>
      <div class="sched-info">
        <div class="sched-title">${esc(i.title)}</div>
        <div class="sched-sub">${fmtTime(i.date)}${i.sub ? ' · ' + esc(i.sub) : ''}</div>
      </div>
    </div>`;
  }).join('') : `<p class="empty">No hay citas ni eventos próximos.</p>`;
}

/* ============================================================
   PERFIL
   ============================================================ */
function renderProfile(){
  const c = currentClient || {};
  $('profileUserName').textContent = c.name || 'Tu nombre';
  const pet = currentPet();
  $('profilePetName').textContent = pet ? `🐾 ${pet.pet_name}` : 'Sin mascotas todavía';

  const phone = ('phone' in c) ? c.phone : lsGet(clientKey('phone'), '');
  $('profilePhone').textContent = phone || 'Agregar teléfono';
  $('profileEmail').textContent = c.email || currentUser?.email || '—';
  const birth = ('fecha_nacimiento' in c) ? c.fecha_nacimiento : lsGet(clientKey('birth'), '');
  $('profileOwnerAge').textContent = birth || 'Agregar fecha';
  const hoursEl = document.querySelector('[data-field="horario_contacto"]');
  if(hoursEl) hoursEl.textContent = lsGet(clientKey('contact_hours'), '9:00 AM - 6:00 PM');

  const assoc = affiliations
    .filter(a => a.status === 'active' || a.status === 'pending')
    .map(a => {
      const name = clinicsById[a.veterinary_id]?.clinic_name || 'Clínica';
      return a.status === 'pending' ? `${name} (pendiente)` : name;
    });
  $('profileAssocClinics').textContent = [...new Set(assoc)].join(', ') || 'Ninguna todavía';

  const list = $('myPetsList');
  list.innerHTML = pets.length ? pets.map(p => {
    const photo = petPhoto(p);
    return `<div class="my-pet-item ${String(p.id) === String(currentPetId) ? 'current' : ''}" onclick="selectPet('${p.id}')">
      <div class="my-pet-thumb"><img ${photo ? 'class="photo"' : ''} src="${esc(photo || speciesToIcon(p.petTypes))}" alt=""></div>
      <div><div class="my-pet-name">${esc(p.pet_name)}</div><div class="my-pet-sub">${esc(speciesLabel(p.petTypes))} · ${esc(p.pet_breed || '—')} · ${esc(ageText(p))}</div></div>
      ${String(p.id) === String(currentPetId) ? '<span class="chip vet">Seleccionada</span>' : ''}
    </div>`;
  }).join('') : `<p class="empty">Todavía no registraste mascotas.</p>`;

  $('appearanceValue').textContent = document.body.classList.contains('dark') ? 'Oscuro' : 'Claro';
  $('languageValue').textContent = lsGet('doppy_language', 'es') === 'en' ? 'Inglés' : 'Español';
}

/* ============================================================
   EDICIÓN EN LÍNEA (contenteditable)
   ============================================================ */
function editField(btn){
  const value = btn.parentElement.querySelector('.value');
  if(!value) return;
  if(document.activeElement === value){ value.blur(); return; } // guardar
  value.focus();
  const range = document.createRange();
  range.selectNodeContents(value);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  btn.textContent = 'Guardar';
}

async function saveEditable(el){
  const text = el.textContent.trim();
  const orig = el.dataset.orig ?? '';
  const btn = el.parentElement?.querySelector('.btn-outline');
  if(btn && btn.textContent === 'Guardar') btn.textContent = 'Editar';
  if(text === orig) return;
  const revert = (msg) => { el.textContent = orig; if(msg) showToast(msg); };

  const pet = currentPet();
  const id = el.id;
  const field = el.dataset.field;

  try {
    // ----- mascota -----
    if(id === 'dashPetName' || id === 'petProfileName'){
      if(!pet || !text) return revert('El nombre no puede quedar vacío.');
      return await updatePet(pet.id, { pet_name: text }, 'Nombre actualizado');
    }
    if(id === 'dashPetAge' || id === 'petProfileAge'){
      if(!pet) return revert();
      const num = parseInt(text, 10);
      if(isNaN(num) || num < 0) return revert('Escribe la edad así: "3 años" o "5 meses".');
      const isYears = !/mes|month/i.test(text);
      return await updatePet(pet.id, { pet_age: num, pet_year: isYears }, 'Edad actualizada');
    }
    if(id === 'petProfileBreed'){
      if(!pet || !text) return revert();
      return await updatePet(pet.id, { pet_breed: text }, 'Raza actualizada');
    }
    if(id === 'petProfileGender'){
      if(!pet) return revert();
      const t = text.toLowerCase();
      if(!/^(m|h|f)/.test(t)) return revert('Escribe "Macho" o "Hembra".');
      return await updatePet(pet.id, { pet_gender: t.startsWith('m') }, 'Sexo actualizado');
    }
    if(field === 'pet_descripcion'){
      if(!pet) return revert();
      if('description' in pet) return await updatePet(pet.id, { description: text }, 'Descripción guardada');
      lsSet(`doppy_pet_desc_${pet.id}`, text);   // LOCAL
      el.closest('.desc-card')?.classList.toggle('has-text', !!text);
      return showToast('Descripción guardada en este dispositivo');
    }

    // ----- dueño -----
    if(field === 'usuario_nombre' || field === 'owner_nombre'){
      if(!text) return revert('El nombre no puede quedar vacío.');
      return await updateClient({ name: text }, 'Nombre actualizado');
    }
    if(field === 'telefono'){
      if(currentClient && 'phone' in currentClient) return await updateClient({ phone: text }, 'Teléfono actualizado');
      lsSet(clientKey('phone'), text);   // LOCAL hasta que exista users.phone
      return showToast('Teléfono guardado en este dispositivo');
    }
    if(field === 'email'){
      if(!text.includes('@')) return revert('Escribe un correo válido.');
      const { error } = await supabaseClient.auth.updateUser({ email: text });
      if(error) return revert('❌ ' + error.message);
      await updateClient({ email: text }, null);
      return showToast('📬 Te enviamos un correo para confirmar el cambio.');
    }
    if(field === 'fecha_nacimiento'){
      if(currentClient && 'fecha_nacimiento' in currentClient) return await updateClient({ fecha_nacimiento: text }, 'Fecha actualizada');
      lsSet(clientKey('birth'), text);   // LOCAL
      return showToast('Guardado en este dispositivo');
    }
    if(field === 'horario_contacto'){
      lsSet(clientKey('contact_hours'), text);   // LOCAL
      return showToast('Horario de contacto guardado');
    }
  } catch (e) {
    console.error('[Doppy] saveEditable', e);
    revert('❌ No se pudo guardar.');
  }
}

async function updatePet(petId, patch, okMsg){
  const { error } = await supabaseClient.from('pets').update(patch).eq('id', petId);
  if(error){ console.error('[Doppy] updatePet', error); showToast('❌ No se pudo guardar: ' + error.message); renderAll(); return; }
  const p = petById(petId);
  if(p) Object.assign(p, patch);
  if(okMsg) showToast('✅ ' + okMsg);
  renderAll();
}

async function updateClient(patch, okMsg){
  const { error } = await supabaseClient.from('users').update(patch).eq('id_client', currentClient.id_client);
  if(error){ console.error('[Doppy] updateClient', error); showToast('❌ No se pudo guardar: ' + error.message); renderAll(); return; }
  Object.assign(currentClient, patch);
  if(patch.name) localStorage.setItem('userName', patch.name);
  if(okMsg) showToast('✅ ' + okMsg);
  renderAll();
}

/* ============================================================
   PERFIL DE LA MASCOTA + CARNÉ DE VACUNACIÓN
   ============================================================ */
function renderPetProfile(){
  const pet = currentPet();
  const photo = petPhoto(pet);
  const img = $('petProfilePhotoImg'), ph = $('petProfilePhotoPlaceholder');
  if(pet){
    img.src = photo || speciesToIcon(pet.petTypes);
    img.className = photo ? '' : 'species';
    img.style.display = 'block'; ph.style.display = 'none';
  } else { img.style.display = 'none'; ph.style.display = 'flex'; }

  $('petProfileName').textContent = pet ? pet.pet_name : 'Sin mascota';
  const ageEl = $('petProfileAge');
  ageEl.textContent = pet ? ageText(pet) : '—';
  ageEl.setAttribute('contenteditable', pet ? 'true' : 'false');
  const small = ageEl.parentElement.querySelector('small');
  if(small) small.textContent = lifeStage(pet);
  $('petProfileGender').textContent = pet ? genderText(pet) : '—';
  $('petProfileBreed').textContent = pet ? (pet.pet_breed || '—') : '—';
  const genderIc = $('petProfileGender').parentElement.querySelector('.ic');
  if(genderIc) genderIc.textContent = pet && pet.pet_gender === false ? '♀' : '♂';
  const breedIc = $('petProfileBreed').parentElement.querySelector('.ic');
  if(breedIc) breedIc.innerHTML = pet ? `<img src="${speciesToIcon(pet.petTypes)}" alt="" style="width:22px;height:22px;object-fit:contain;">` : '🐾';

  const owner = document.querySelector('.owner-card');
  if(owner){
    owner.querySelector('h4').textContent = currentClient?.name || 'Dueño';
    const phone = (currentClient && 'phone' in currentClient) ? currentClient.phone : lsGet(clientKey('phone'), '');
    owner.querySelector('p').textContent = phone || currentClient?.email || 'Contacto del dueño';
  }

  const clinic = clinicForPet(pet), staff = staffForPet(pet);
  $('petVetName').textContent = staff ? staff.nombre : (clinic ? 'Veterinario por asignar' : 'Aún no hay veterinario asignado');
  $('petVetSpecialty').textContent = staff?.specialty || '';
  $('petVetPlace').textContent = clinic ? [clinic.clinic_name, clinicAddress(clinic)].filter(Boolean).join(' · ') : '';

  const desc = document.querySelector('[data-field="pet_descripcion"]');
  if(desc){
    const text = pet ? (('description' in pet) ? pet.description : lsGet(`doppy_pet_desc_${pet.id}`, '')) : '';
    desc.textContent = text || 'Toca aquí para escribir una descripción (carácter, alergias, cuidados...)';
    desc.closest('.desc-card')?.classList.toggle('has-text', !!text);
  }

  renderVaccTable();
}

function vaccStatus(v){
  if(!v.next_due_date) return 'ok';
  return new Date(v.next_due_date) < new Date() ? 'late' : 'ok';
}

function renderVaccTable(){
  const body = $('vaccTableBody');
  if(!body) return;
  body.innerHTML = vaccinations.length ? vaccinations.map(v => {
    const st = vaccStatus(v);
    return `<tr>
      <td><b>${esc(v.vaccine_name)}</b>${v.dose_number ? ` <span class="chip">Dosis ${esc(v.dose_number)}</span>` : ''}</td>
      <td>${fmtDate(v.created_at)}</td>
      <td>${fmtDate(v.next_due_date)}</td>
      <td>${st === 'late' ? '<span class="late">✗</span>' : ''}</td>
      <td>${st === 'ok' ? '<span class="yes">✓</span>' : ''}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="5" class="empty">Aún no hay vacunas registradas para esta mascota.</td></tr>`;
}

/* "Descargar PDF": se abre una versión imprimible y el navegador permite
   guardarla como PDF (no hace falta otra librería). */
function downloadVaccinationCard(){
  const pet = currentPet();
  if(!pet){ showToast('Primero agrega una mascota.'); return; }
  const clinic = clinicForPet(pet);
  const rows = vaccinations.map(v => `<tr><td>${esc(v.vaccine_name)}</td><td>${esc(v.dose_number || '')}</td><td>${fmtDate(v.created_at)}</td><td>${fmtDate(v.next_due_date)}</td><td>${vaccStatus(v) === 'late' ? 'Vencida' : 'Al día'}</td></tr>`).join('')
    || '<tr><td colspan="5">Sin vacunas registradas</td></tr>';
  const w = window.open('', '_blank');
  if(!w){ showToast('Permite las ventanas emergentes para descargar el carné.'); return; }
  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Carné de vacunación - ${esc(pet.pet_name)}</title>
    <style>
      body{font-family:Inter,Arial,sans-serif;color:#0F172A;padding:32px;}
      h1{color:#087cbf;margin:0 0 4px;} .sub{color:#64748B;margin:0 0 24px;}
      .info{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-bottom:24px;font-size:14px;}
      table{width:100%;border-collapse:collapse;font-size:14px;} th,td{border:1px solid #E5E7EB;padding:8px 10px;text-align:left;}
      th{background:#EFF6FF;} .foot{margin-top:28px;font-size:12px;color:#64748B;}
    </style></head><body>
    <h1>🐾 Carné de vacunación</h1><p class="sub">Generado con Doppy · ${fmtDate(new Date().toISOString())}</p>
    <div class="info">
      <div><b>Mascota:</b> ${esc(pet.pet_name)}</div><div><b>Especie:</b> ${esc(speciesLabel(pet.petTypes))}</div>
      <div><b>Raza:</b> ${esc(pet.pet_breed || '—')}</div><div><b>Edad:</b> ${esc(ageText(pet))}</div>
      <div><b>Sexo:</b> ${genderText(pet)}</div><div><b>Dueño:</b> ${esc(currentClient?.name || '—')}</div>
      <div><b>Clínica:</b> ${esc(clinic?.clinic_name || '—')}</div>
    </div>
    <table><thead><tr><th>Vacuna</th><th>Dosis</th><th>Aplicada</th><th>Próxima</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="foot">Documento informativo. Los datos los registra la clínica veterinaria en Doppy.</p>
    <script>window.onload=function(){window.print();}<\/script></body></html>`);
  w.document.close();
}

/* ============================================================
   VETERINARIO: afiliación, historial, llamada
   ============================================================ */
function openAffiliateModal(){
  if(!pets.length){ showToast('Primero agrega una mascota para afiliarla.'); return; }
  openModal('Afiliarse a una clínica', `
    <p>Escanea el QR que te da tu clínica o escribe el código de afiliación (por ejemplo <b>DOPPY-AB12-CD34</b>).</p>
    <div class="form-field"><label>Mascota</label><select id="afPet">${petOptions(currentPetId)}</select></div>
    <div class="form-field"><label>Código de afiliación</label><input id="afCode" placeholder="DOPPY-XXXX-XXXX" autocomplete="off" style="text-transform:uppercase"></div>
    <div id="afScanArea"></div>
    <div class="modal-actions">
      <button class="btn-outline" onclick="startQrScan()">📷 Escanear QR</button>
      <button class="btn-primary" onclick="submitAffiliation()">Enviar solicitud</button>
    </div>`);
}

async function startQrScan(){
  if(!navigator.mediaDevices?.getUserMedia){ showToast('Tu navegador no permite usar la cámara (usa localhost o https).'); return; }
  if(typeof jsQR !== 'function'){ showToast('No se pudo cargar el lector de QR.'); return; }
  const area = $('afScanArea');
  area.innerHTML = `<video class="qr-video" id="afVideo" playsinline muted></video><p class="empty" style="text-align:center">Apunta la cámara al código QR…</p>`;
  try {
    qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch (e) {
    area.innerHTML = '';
    showToast('No se pudo abrir la cámara: ' + (e.message || e.name));
    return;
  }
  const video = $('afVideo');
  video.srcObject = qrStream;
  try { await video.play(); } catch (e) { console.warn('[Doppy] video.play', e); }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const tick = () => {
    if(!qrStream) return;
    if(video.readyState === video.HAVE_ENOUGH_DATA){
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const found = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
      if(found && found.data){
        // El QR de dashboardda.js contiene el código tal cual; si fuera un enlace, se toma ?code=
        let code = found.data.trim();
        try { const u = new URL(code); code = u.searchParams.get('code') || code; } catch (e) {}
        $('afCode').value = code.toUpperCase();
        stopQrScan();
        area.innerHTML = `<p class="empty" style="color:var(--green)">✅ Código leído: <b>${esc(code.toUpperCase())}</b></p>`;
        return;
      }
    }
    qrLoopId = requestAnimationFrame(tick);
  };
  tick();
}
function stopQrScan(){
  if(qrLoopId) cancelAnimationFrame(qrLoopId);
  qrLoopId = null;
  if(qrStream){ qrStream.getTracks().forEach(t => t.stop()); qrStream = null; }
}

/* Mismo flujo que recibirSolicitudAfiliacion() en dashboardda.js:
   busca el código y lo deja en "pending" con el dueño y la mascota;
   la clínica lo aprueba desde su panel (Solicitudes). */
async function submitAffiliation(){
  const code = ($('afCode').value || '').trim().toUpperCase();
  const petId = $('afPet').value;
  if(!code){ showToast('Escribe o escanea el código.'); return; }

  const { data: match, error } = await supabaseClient
    .from('affiliations').select('id, status, expiration_date, max_uses, current_uses').eq('code', code).maybeSingle();
  if(error){ console.error('[Doppy] submitAffiliation', error); showToast('❌ Error al verificar el código.'); return; }
  if(!match){ showToast(`⚠️ El código ${code} no es válido.`); return; }
  if(match.status === 'pending'){ showToast('Ya hay una solicitud pendiente con este código.'); return; }
  if(match.expiration_date && new Date(match.expiration_date + 'T23:59:59') < new Date()){ showToast('⚠️ Este código ya venció. Pide uno nuevo a tu clínica.'); return; }
  if(match.max_uses && (match.current_uses || 0) >= match.max_uses){ showToast('⚠️ Este código ya alcanzó su límite de usos.'); return; }

  const { error: upErr } = await supabaseClient.from('affiliations').update({
    status: 'pending', id_client: currentClient.id_client, pet_id: Number(petId), requested_at: new Date().toISOString()
  }).eq('id', match.id);
  if(upErr){ console.error('[Doppy] submitAffiliation update', upErr); showToast('❌ No se pudo enviar la solicitud: ' + upErr.message); return; }

  closeModal();
  showToast('✅ Solicitud enviada. La clínica debe aprobarla.');
  await loadAffiliationsAndClinics();
  renderAll();
}

async function openVetHistoryModal(){
  const pet = currentPet();
  if(!pet){ showToast('Primero agrega una mascota.'); return; }
  openModal(`Historial de ${esc(pet.pet_name)}`, `<p class="empty">Cargando…</p>`, { wide: true });
  const [recRes, rxRes] = await Promise.all([
    supabaseClient.from('clinical_records').select('*').eq('pet_id', pet.id).order('created_at', { ascending: false }),
    supabaseClient.from('prescriptions').select('*').eq('pet_id', pet.id).order('created_at', { ascending: false })
  ]);
  const past = appointments.filter(a => String(a.pet_id) === String(pet.id) && new Date(a.appointment_date) < new Date()).reverse();
  const section = (title, items) => `<h4 style="margin:16px 0 4px">${title}</h4>` + (items.length ? items.join('') : '<p class="empty">Sin registros.</p>');
  const body =
    section('🩺 Historial clínico', (recRes.data || []).map(r => `<div class="history-item"><b>${esc(r.record_type || 'Registro')}</b>${esc(r.description || '')}<br><small>${fmtDate(r.created_at)}</small></div>`)) +
    section('💊 Recetas', (rxRes.data || []).map(r => `<div class="history-item"><b>${esc(r.medicine || 'Receta')}</b>${esc(r.instructions || '')}<br><small>${fmtDate(r.created_at)}</small></div>`)) +
    section('📅 Citas anteriores', past.map(a => `<div class="history-item"><b>${esc(apptTypeLabel(a))}</b><small>${fmtDate(a.appointment_date)} · ${fmtTime(a.appointment_date)}</small></div>`));
  if($('modalOverlay').classList.contains('open')) $('modalBox').querySelector('.modal-body').innerHTML = body;
}

function callPhone(phone){
  if(!phone || phone === '—'){ showToast('No hay un teléfono registrado.'); return; }
  window.location.href = 'tel:' + String(phone).replace(/[^\d+]/g, '');
}
function callAssignedVetPhone(){
  const pet = currentPet();
  const staff = staffForPet(pet), clinic = clinicForPet(pet);
  callPhone(staff?.telefono || clinic?.phone);
}

/* ============================================================
   NUEVA CITA (tabla appointments)
   ============================================================ */
function openNewAppointmentModal(){
  if(!pets.length){ showToast('Primero agrega una mascota.'); return; }
  const today = dateKey(new Date());
  openModal('Solicitar cita', `
    <div class="form-field"><label>Mascota</label><select id="apPet">${petOptions(currentPetId)}</select></div>
    <div class="form-row2">
      <div class="form-field"><label>Fecha</label><input type="date" id="apDate" min="${today}" value="${today}"></div>
      <div class="form-field"><label>Hora</label><input type="time" id="apTime" value="09:00"></div>
    </div>
    <div class="form-field"><label>Motivo</label><select id="apType">${APPT_TYPES.map(t => `<option value="${t.key}">${t.label}</option>`).join('')}</select></div>
    <div class="form-field"><label>Notas (opcional)</label><textarea id="apNotes" rows="3" placeholder="Síntomas, indicaciones..."></textarea></div>
    <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn-primary" onclick="saveAppointment()">Guardar cita</button></div>`);
}

async function saveAppointment(){
  const pet = petById($('apPet').value);
  const date = $('apDate').value, time = $('apTime').value;
  const type = APPT_TYPES.find(t => t.key === $('apType').value) || APPT_TYPES[0];
  if(!pet || !date || !time){ showToast('Completa mascota, fecha y hora.'); return; }
  const clinic = clinicForPet(pet);
  if(!clinic){
    showToast('Para pedir una cita, primero afilia a tu mascota a una clínica.');
    closeModal(); openAffiliateModal();
    return;
  }
  const { error } = await supabaseClient.from('appointments').insert({
    pet_id: pet.id, veterinary_id: clinic.id_veterinary, veterinarian_id: pet.assigned_veterinarian_id || null,
    title: type.label, appointment_date: new Date(`${date}T${time}:00`).toISOString(), type: type.key,
    status: 'scheduled', notes: $('apNotes').value.trim() || null
  });
  if(error){ console.error('[Doppy] saveAppointment', error); showToast('❌ No se pudo guardar la cita: ' + error.message); return; }
  closeModal();
  showToast('✅ Cita guardada');
  await loadAppointments();
  renderAll();
}

/* ============================================================
   CALENDARIO
   ============================================================ */
function setCalFilter(btn, type){
  calFilterType = type;
  document.querySelectorAll('.cal-tab').forEach(b => b.classList.toggle('active', b === btn));
  renderCalendar();
}
function changeMonth(d){ calDate = new Date(calDate.getFullYear(), calDate.getMonth() + d, 1); renderCalendar(); }
function goToToday(){ calDate = new Date(); renderCalendar(); }

function filteredCalendarItems(){
  return getCalendarItems().filter(i => calFilterType === 'all' || i.kind === calFilterType);
}

function renderCalendar(){
  const grid = $('calGrid');
  if(!grid) return;
  const y = calDate.getFullYear(), m = calDate.getMonth();
  $('calMonthLabel').textContent = calDate.toLocaleDateString('es', { month: 'long', year: 'numeric' });

  const byDay = {};
  filteredCalendarItems().forEach(i => { const k = dateKey(new Date(i.date)); (byDay[k] = byDay[k] || []).push(i); });

  const first = new Date(y, m, 1);
  const start = new Date(y, m, 1 - ((first.getDay() + 6) % 7)); // semana empieza el lunes
  const weeks = Math.ceil((((first.getDay() + 6) % 7) + new Date(y, m + 1, 0).getDate()) / 7);
  const todayK = dateKey(new Date());

  let html = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => `<div class="cal-dow">${d}</div>`).join('');
  for(let i = 0; i < weeks * 7; i++){
    const d = new Date(start); d.setDate(start.getDate() + i);
    const k = dateKey(d);
    const items = byDay[k] || [];
    const evs = items.slice(0, 3).map(it =>
      `<div class="cal-ev ${it.kind}" title="${esc(it.title)}" onclick="event.stopPropagation();openCalendarItem('${it.kind}','${it.id}')">${fmtTime(it.date)} ${esc(it.title)}</div>`).join('');
    const more = items.length > 3 ? `<div class="cal-more">+${items.length - 3} más</div>` : '';
    html += `<div class="cal-cell ${d.getMonth() !== m ? 'other' : ''} ${k === todayK ? 'today' : ''}" ondblclick="openNewEventModal('${k}')">
      <span class="cal-num">${d.getDate()}</span>${evs}${more}</div>`;
  }
  grid.innerHTML = html;
  renderMiniCalendar(byDay);
}

function renderMiniCalendar(byDay){
  const grid = document.querySelector('.mini-cal-grid');
  const head = document.querySelector('.mini-cal-head');
  if(!grid || !head) return;
  const y = calDate.getFullYear(), m = calDate.getMonth();
  head.innerHTML = `<button onclick="changeMonth(-1)">‹</button> ${calDate.toLocaleDateString('es', { month: 'long', year: 'numeric' })} <button onclick="changeMonth(1)">›</button>`;
  const first = new Date(y, m, 1);
  const start = new Date(y, m, 1 - ((first.getDay() + 6) % 7));
  const todayK = dateKey(new Date());
  let html = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => `<span class="dow">${d}</span>`).join('');
  for(let i = 0; i < 42; i++){
    const d = new Date(start); d.setDate(start.getDate() + i);
    const k = dateKey(d);
    const cls = ['day', d.getMonth() !== m ? 'muted' : '', k === todayK ? 'today' : (byDay[k] ? 'sel' : '')].join(' ');
    html += `<span class="${cls}">${d.getDate()}</span>`;
  }
  grid.innerHTML = html;
}

function openCalendarItem(kind, id){
  const item = getCalendarItems().find(i => i.kind === kind && String(i.id) === String(id));
  if(!item) return;
  const pet = petById(item.petId);
  const del = kind === 'event' ? `<button class="btn-danger" onclick="deletePersonalEvent('${item.id}')">Eliminar evento</button>` : '';
  openModal(esc(item.title), `
    <p>📅 ${fmtDate(item.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${fmtTime(item.date)}</p>
    ${pet ? `<p>🐾 ${esc(pet.pet_name)}</p>` : ''}
    ${item.location ? `<p>📍 ${esc(item.location)}</p>` : ''}
    ${item.notes ? `<p>📝 ${esc(item.notes)}</p>` : ''}
    <p class="empty">${kind === 'appointment' ? 'Cita con la clínica' + (item.status ? ' · estado: ' + esc(item.status) : '') : 'Evento personal (guardado en este dispositivo)'}</p>
    <div class="modal-actions">${del}<button class="btn-secondary" onclick="closeModal()">Cerrar</button></div>`);
}

function renderUpcoming(){
  const el = $('upcomingEventsList');
  if(!el) return;
  const items = upcomingItems().slice(0, 5);
  el.innerHTML = items.length ? items.map(i => `
    <div class="up-item ${i.kind}" style="cursor:pointer" onclick="openCalendarItem('${i.kind}','${i.id}')">
      <div class="up-bar"></div>
      <div class="up-info"><div class="up-title">${esc(i.title)}</div><div class="up-sub">${fmtDate(i.date)} · ${fmtTime(i.date)}${i.sub ? ' · ' + esc(i.sub) : ''}</div></div>
    </div>`).join('') : `<p class="empty">No hay eventos próximos.</p>`;
}

function renderDiscoverEvents(){
  const el = $('discoverEventsList');
  if(!el) return;
  const now = Date.now();
  const list = communityEvents.filter(e => !e.event_date || new Date(e.event_date).getTime() >= now - 86400000).slice(0, 5);
  el.innerHTML = list.length ? list.map(e => {
    const added = personalEvents.some(p => p.id === 'c' + e.id);
    return `<div class="disc-item">
      <div class="disc-info"><div class="disc-title">${esc(e.title)}</div><div class="disc-sub">${fmtDate(e.event_date)}${e.location ? ' · ' + esc(e.location) : ''}</div></div>
      <button ${added ? 'disabled' : ''} onclick="addCommunityEvent('${esc(e.id)}')">${added ? '✓ Agregado' : '+ Agregar'}</button>
    </div>`;
  }).join('') : `<p class="empty">No hay eventos de la comunidad por ahora.</p>`;
}

/* Eventos personales: LOCAL (la tabla events es pública y no tiene dueño) */
function savePersonalEvents(){ lsSet(clientKey('events'), personalEvents); }

function addCommunityEvent(id){
  const e = communityEvents.find(x => String(x.id) === String(id));
  if(!e) return;
  personalEvents.push({ id: 'c' + e.id, title: e.title, date: e.event_date, location: e.location || '', petId: currentPetId, source: 'community' });
  savePersonalEvents();
  showToast('✅ Evento agregado a tu calendario');
  renderCalendar(); renderUpcoming(); renderDiscoverEvents(); renderSchedule();
}

function openNewEventModal(dateStr){
  const d = dateStr || dateKey(new Date());
  openModal('Nuevo evento', `
    <div class="form-field"><label>Título</label><input id="evTitle" placeholder="Ej. Paseo en el parque, baño, medicina..."></div>
    <div class="form-row2">
      <div class="form-field"><label>Fecha</label><input type="date" id="evDate" value="${d}"></div>
      <div class="form-field"><label>Hora</label><input type="time" id="evTime" value="10:00"></div>
    </div>
    <div class="form-field"><label>Lugar (opcional)</label><input id="evPlace"></div>
    ${pets.length ? `<div class="form-field"><label>Mascota</label><select id="evPet">${petOptions(currentPetId)}</select></div>` : ''}
    <p class="empty">Los eventos personales se guardan en este dispositivo. Las citas con la clínica se piden con "Nueva cita".</p>
    <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn-primary" onclick="savePersonalEvent()">Guardar</button></div>`);
}

function savePersonalEvent(){
  const title = $('evTitle').value.trim();
  const date = $('evDate').value, time = $('evTime').value || '10:00';
  if(!title || !date){ showToast('Escribe un título y una fecha.'); return; }
  personalEvents.push({
    id: 'p' + Date.now(), title, date: new Date(`${date}T${time}:00`).toISOString(),
    location: $('evPlace').value.trim(), petId: $('evPet') ? $('evPet').value : currentPetId, source: 'personal'
  });
  savePersonalEvents();
  closeModal();
  showToast('✅ Evento guardado');
  renderCalendar(); renderUpcoming(); renderDiscoverEvents(); renderSchedule();
}

function deletePersonalEvent(id){
  personalEvents = personalEvents.filter(e => String(e.id) !== String(id));
  savePersonalEvents();
  closeModal();
  showToast('Evento eliminado');
  renderCalendar(); renderUpcoming(); renderDiscoverEvents(); renderSchedule();
}

function openAllEventsModal(){
  const items = upcomingItems();
  openModal('Próximos eventos y citas', items.length ? items.map(i => `
    <div class="history-item" style="cursor:pointer" onclick="openCalendarItem('${i.kind}','${i.id}')">
      <b>${i.kind === 'appointment' ? '🔵' : '🟡'} ${esc(i.title)}</b>
      <small>${fmtDate(i.date)} · ${fmtTime(i.date)}${i.sub ? ' · ' + esc(i.sub) : ''}</small>
    </div>`).join('') : '<p class="empty">No hay nada próximo.</p>', { wide: true });
}

/* ============================================================
   MURO DE MASCOTAS (posts, post_likes, post_comments)
   ============================================================ */
function filterWall(btn){
  wallFilter = btn.textContent.trim();
  document.querySelectorAll('.wall-filter').forEach(b => b.classList.toggle('active', b === btn));
  renderPosts();
}

function postMatchesFilter(p){
  const cat = (p.category || '').toLowerCase();
  switch(wallFilter){
    case 'Consejos':       return p.post_type === 'tip' || cat === 'consejos';
    case 'Nuevos eventos': return p.post_type === 'event' || cat === 'eventos';
    case 'Salud':          return cat === 'salud';
    case 'Adopción':       return cat === 'adopción' || cat === 'adopcion';
    case 'Entrenamiento':  return cat === 'entrenamiento';
    default:               return true;
  }
}

function ensureComposeBox(){
  if($('wallCompose')) return;
  const list = $('postsList');
  const box = document.createElement('div');
  box.className = 'compose';
  box.id = 'wallCompose';
  box.innerHTML = `
    <input id="wallTitle" maxlength="120" placeholder="Título de tu publicación">
    <textarea id="wallText" placeholder="Comparte algo con otros amantes de las mascotas..."></textarea>
    <div class="compose-row">
      <select id="wallCat">${WALL_CATEGORIES.map(c => `<option>${c}</option>`).join('')}</select>
      <button class="btn-primary" onclick="submitWallPost()">Publicar</button>
    </div>`;
  list.parentElement.insertBefore(box, list);
}

function renderPosts(){
  const el = $('postsList');
  if(!el) return;
  ensureComposeBox();
  const q = wallSearch.toLowerCase();
  const list = posts.filter(postMatchesFilter).filter(p => !q || `${p.title} ${p.content} ${p.authorName}`.toLowerCase().includes(q));
  el.innerHTML = list.length ? list.map(p => {
    const isStaff = p.author_type === 'staff';
    const chip = p.post_type === 'tip' ? '<span class="chip tip">Consejo</span>' : (p.post_type === 'event' ? '<span class="chip event">Evento</span>' : (p.category ? `<span class="chip">${esc(p.category)}</span>` : ''));
    const liked = myLikes.has(p.id);
    const comments = commentsByPost[p.id] || [];
    return `<article class="post" id="wallpost-${p.id}">
      <div class="post-head">
        <div class="post-av" style="background:${isStaff ? 'var(--blue)' : 'var(--blue-mid)'}">${esc(initials(p.authorName))}</div>
        <div>
          <div class="post-author">${esc(p.authorName)} ${isStaff ? '<span class="chip vet">Veterinario ✓</span>' : ''} ${chip}</div>
          <div class="post-meta">${timeAgo(p.created_at)}</div>
        </div>
      </div>
      ${p.title ? `<h4 class="post-title">${esc(p.title)}</h4>` : ''}
      <div class="post-text">${esc(p.content || '')}</div>
      ${p.image_url ? `<img class="post-img" src="${esc(p.image_url)}" alt="">` : ''}
      <div class="post-actions">
        <button class="${liked ? 'liked' : ''}" onclick="togglePostLike(${p.id})">${liked ? '❤️' : '🤍'} ${likesByPost[p.id] || 0}</button>
        <button onclick="toggleCommentsBox(${p.id})">💬 ${comments.length}</button>
        <button onclick="sharePost(${p.id})">🔗 Compartir</button>
      </div>
      <div class="comments" id="comments-${p.id}" style="display:none">
        ${comments.map(c => `<div class="comment"><b>${esc(c.user_id && String(c.user_id) === String(currentClient?.id_client) ? (currentClient.name || 'Tú') : 'Miembro')}</b>${esc(c[commentTextKey] || '')}</div>`).join('')}
        <div class="comment-form"><input id="cinput-${p.id}" placeholder="Escribe un comentario..." onkeydown="if(event.key==='Enter')addPostComment(${p.id})"><button class="btn-primary" onclick="addPostComment(${p.id})">Enviar</button></div>
      </div>
    </article>`;
  }).join('') : `<p class="empty">${posts.length ? 'No hay publicaciones con ese filtro.' : 'Todavía no hay publicaciones. ¡Sé el primero!'}</p>`;
}

async function submitWallPost(){
  const title = $('wallTitle').value.trim();
  const content = $('wallText').value.trim();
  const category = $('wallCat').value;
  if(!title || !content){ showToast('Escribe un título y un texto.'); return; }
  const { error } = await supabaseClient.from('posts').insert({
    author_id: currentClient.id_client, author_type: 'owner', title, content,
    image_url: null, category, post_type: category === 'Eventos' ? 'event' : 'community'
  });
  if(error){ console.error('[Doppy] submitWallPost', error); showToast('❌ No se pudo publicar: ' + error.message); return; }
  $('wallTitle').value = ''; $('wallText').value = '';
  showToast('✅ Publicado');
  await loadPosts();
  renderPosts(); renderTrending();
}

async function togglePostLike(postId){
  const liked = myLikes.has(postId);
  // Optimista: se actualiza la vista y se revierte si falla
  if(liked){ myLikes.delete(postId); likesByPost[postId] = Math.max(0, (likesByPost[postId] || 1) - 1); }
  else { myLikes.add(postId); likesByPost[postId] = (likesByPost[postId] || 0) + 1; }
  renderPosts();
  const q = liked
    ? supabaseClient.from('post_likes').delete().eq('post_id', postId).eq('user_id', currentClient.id_client)
    : supabaseClient.from('post_likes').insert({ post_id: postId, user_id: currentClient.id_client });
  const { error } = await q;
  if(error){
    console.error('[Doppy] togglePostLike', error);
    if(liked){ myLikes.add(postId); likesByPost[postId]++; } else { myLikes.delete(postId); likesByPost[postId]--; }
    renderPosts();
    showToast('❌ No se pudo guardar el me gusta.');
  }
}

function toggleCommentsBox(postId){
  const el = $('comments-' + postId);
  if(el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function addPostComment(postId){
  const input = $('cinput-' + postId);
  const text = input.value.trim();
  if(!text) return;
  const row = { post_id: postId, user_id: currentClient.id_client, [commentTextKey]: text };
  const { data, error } = await supabaseClient.from('post_comments').insert(row).select('*').single();
  if(error){ console.error('[Doppy] addPostComment', error); showToast('❌ No se pudo comentar: ' + error.message); return; }
  (commentsByPost[postId] = commentsByPost[postId] || []).push(data || row);
  renderPosts();
  toggleCommentsBox(postId);
}

function sharePost(postId){
  const url = location.origin + location.pathname + '#wallpost-' + postId;
  navigator.clipboard?.writeText(url).then(() => showToast('🔗 Enlace copiado')).catch(() => showToast(url));
}

function scrollToPost(postId){
  wallFilter = 'Todos';
  document.querySelectorAll('.wall-filter').forEach((b, i) => b.classList.toggle('active', i === 0));
  wallSearch = ''; if($('searchInput')) $('searchInput').value = '';
  closeModal();
  showView('petwall', document.querySelector('[data-view=petwall]'));
  renderPosts();
  setTimeout(() => $('wallpost-' + postId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
}

function getTips(){
  return posts.filter(p => p.post_type === 'tip' || (p.category || '').toLowerCase() === 'consejos')
    .sort((a, b) => (likesByPost[b.id] || 0) - (likesByPost[a.id] || 0));
}
function renderTrending(){
  const el = $('petWallTrendingTips');
  if(!el) return;
  const tips = getTips().slice(0, 5);
  el.innerHTML = tips.length
    ? tips.map(t => `<li onclick="scrollToPost(${t.id})">${esc(t.title || 'Consejo')}</li>`).join('')
    : `<li class="empty-li"><span class="empty">Todavía no hay consejos publicados.</span></li>`;
}
function openTrendingTipsModal(){
  const tips = getTips();
  openModal('Consejos populares', tips.length ? tips.map(t => `
    <div class="history-item" style="cursor:pointer" onclick="scrollToPost(${t.id})"><b>${esc(t.title || 'Consejo')}</b><small>${esc(t.authorName)} · ❤️ ${likesByPost[t.id] || 0}</small></div>`).join('')
    : '<p class="empty">Todavía no hay consejos.</p>', { wide: true });
}

/* ============================================================
   NOTIFICACIONES (tabla notifications + recordatorios calculados)
   ============================================================ */
function getNotificationItems(){
  const read = new Set(lsGet(clientKey('read_notifs'), []));
  const items = dbNotifications.map(n => ({
    id: 'n' + n.id, kind: 'notif', icon: '🔔', title: n.title || 'Notificación', desc: n.message || '', date: n.created_at
  }));
  // Recordatorios de vacunas de todas las mascotas no se pueden calcular sin
  // cargarlas todas: se usan las de la mascota actual (las que se ven en el carné).
  const pet = currentPet();
  vaccinations.forEach(v => {
    if(!v.next_due_date) return;
    const days = Math.ceil((new Date(v.next_due_date) - new Date()) / 86400000);
    if(days < 0) items.push({ id: `v${v.id}`, kind: 'alert', icon: '⚠️', title: `Vacuna vencida: ${v.vaccine_name}`, desc: `${pet?.pet_name || ''} debía recibirla el ${fmtDate(v.next_due_date)}.`, date: v.next_due_date });
    else if(days <= 30) items.push({ id: `v${v.id}`, kind: 'reminder', icon: '💉', title: `Próxima vacuna: ${v.vaccine_name}`, desc: `${pet?.pet_name || ''} · ${fmtDate(v.next_due_date)} (en ${days} días)`, date: v.next_due_date });
  });
  upcomingItems().filter(i => new Date(i.date) - new Date() <= 7 * 86400000).forEach(i => {
    items.push({ id: `${i.kind[0]}${i.id}`, kind: 'reminder', icon: i.kind === 'appointment' ? '📅' : '⭐', title: i.title, desc: `${fmtDate(i.date)} · ${fmtTime(i.date)}${i.sub ? ' · ' + i.sub : ''}`, date: i.date });
  });
  return items.map(i => ({ ...i, read: read.has(i.id) })).sort((a, b) => new Date(b.date) - new Date(a.date));
}

function filterNotif(btn){
  const tabs = [...document.querySelectorAll('.filter-tab')];
  notifFilter = tabs.indexOf(btn);
  tabs.forEach(t => t.classList.toggle('active', t === btn));
  renderNotifications();
}

function markNotifRead(id){
  const read = new Set(lsGet(clientKey('read_notifs'), []));
  read.add(id);
  lsSet(clientKey('read_notifs'), [...read]);
  renderNotifications(); renderHeader();
}

function renderNotifications(){
  const el = $('notifList');
  if(!el) return;
  const all = getNotificationItems();
  let list = all;
  if(notifFilter === 1) list = all.filter(n => n.kind === 'reminder' || n.kind === 'alert');
  if(notifFilter === 2) list = all.filter(n => !n.read);

  const hl = document.querySelector('.notif-highlight');
  if(hl){
    const next = upcomingItems().find(i => i.kind === 'appointment');
    hl.querySelector('h3').textContent = next ? `${next.title}${next.sub ? ' de ' + next.sub : ''}` : 'Todo al día';
    hl.querySelector('p').textContent = next ? `Próxima cita: ${fmtDate(next.date, { weekday: 'long', day: 'numeric', month: 'long' })} a las ${fmtTime(next.date)}` : 'No tienes citas próximas con la clínica.';
    const count = hl.querySelector('.count');
    if(count) count.textContent = all.filter(n => !n.read).length;
  }
  const label = document.querySelector('#view-notifications .section-label');
  if(label) label.textContent = 'Recientes';

  el.innerHTML = list.length ? list.map(n => `
    <div class="notif-item ${n.kind} ${n.read ? '' : 'unread'}" onclick="markNotifRead('${n.id}')">
      <div class="notif-ico">${n.icon}</div>
      <div><div class="notif-title">${esc(n.title)}</div><div class="notif-desc">${esc(n.desc)}</div></div>
      <div class="notif-time">${fmtDate(n.date, { day: '2-digit', month: 'short' })}</div>
    </div>`).join('') : `<p class="empty">No hay notificaciones aquí.</p>`;
}

/* ============================================================
   CONFIGURACIÓN DE LA CUENTA (modales)
   ============================================================ */
function openChangePasswordModal(){
  openModal('Cambiar contraseña', `
    <div class="form-field"><label>Nueva contraseña</label><input type="password" id="pwNew" autocomplete="new-password"></div>
    <div class="form-field"><label>Confirmar contraseña</label><input type="password" id="pwNew2" autocomplete="new-password"></div>
    <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn-primary" onclick="changePassword()">Guardar</button></div>`);
}
// "Code of access to Doppy" es la contraseña de la cuenta (nunca se muestra).
function openAccessCodeModal(){ openChangePasswordModal(); }

async function changePassword(){
  const p1 = $('pwNew').value, p2 = $('pwNew2').value;
  if(p1.length < 6){ showToast('La contraseña debe tener al menos 6 caracteres.'); return; }
  if(p1 !== p2){ showToast('Las contraseñas no coinciden.'); return; }
  const { error } = await supabaseClient.auth.updateUser({ password: p1 });
  if(error){ showToast('❌ ' + error.message); return; }
  closeModal();
  showToast('✅ Contraseña actualizada');
}

/* Preferencias y privacidad: LOCAL */
function prefsModal(title, key, options){
  const prefs = lsGet(clientKey(key), {});
  openModal(title, options.map(([k, label, def]) => `
    <label class="check-row">${label}<input type="checkbox" data-pref="${k}" ${(prefs[k] ?? def) ? 'checked' : ''}></label>`).join('') + `
    <div class="modal-actions"><button class="btn-primary" onclick="savePrefs('${key}')">Guardar</button></div>`);
}
function savePrefs(key){
  const prefs = {};
  document.querySelectorAll('#modalBox [data-pref]').forEach(i => { prefs[i.dataset.pref] = i.checked; });
  lsSet(clientKey(key), prefs);
  closeModal();
  showToast('✅ Preferencias guardadas');
}
function openNotifPrefsModal(){
  prefsModal('Preferencias de notificación', 'notif_prefs', [
    ['vaccines', 'Recordatorios de vacunas', true],
    ['appointments', 'Recordatorios de citas', true],
    ['wall', 'Actividad en el muro de mascotas', false],
    ['email', 'Recibir resúmenes por correo', false]
  ]);
}
function openPrivacyModal(){
  prefsModal('Configuración de privacidad', 'privacy_prefs', [
    ['showName', 'Mostrar mi nombre en el muro de mascotas', true],
    ['shareClinic', 'Compartir el historial con mis clínicas afiliadas', true],
    ['location', 'Usar mi ubicación en el modo de emergencia', true]
  ]);
}

function openLanguageModal(){
  const lang = lsGet('doppy_language', 'es');
  openModal('Idioma', `<div class="choice-list">
    <button class="${lang === 'es' ? 'active' : ''}" onclick="setLanguage('es')">🇪🇸 Español</button>
    <button class="${lang === 'en' ? 'active' : ''}" onclick="setLanguage('en')">🇺🇸 Inglés</button></div>`);
}
function setLanguage(lang){
  lsSet('doppy_language', lang);
  $('languageValue').textContent = lang === 'en' ? 'Inglés' : 'Español';
  closeModal();
  showToast(lang === 'en' ? 'Preferencia guardada. La traducción completa del panel llegará pronto.' : 'Idioma: Español');
}

function openHelpModal(){
  openModal('Centro de ayuda', `
    <div class="history-item"><b>¿Cómo afilio a mi mascota a una clínica?</b>En el panel, en "Datos del veterinario", toca 📷 y escanea el QR o escribe el código que te dio la clínica. La clínica debe aprobar la solicitud.</div>
    <div class="history-item"><b>¿Quién registra las vacunas?</b>Tu veterinario, desde su panel. Aparecen automáticamente en el carné de vacunación.</div>
    <div class="history-item"><b>¿Cómo pido una cita?</b>Con "+ Nueva cita" en el panel. Tu mascota tiene que estar afiliada a una clínica.</div>
    <div class="history-item"><b>¿Necesitas más ayuda?</b>Escríbenos a <a href="mailto:Doppybussines@outlook.com" style="color:var(--blue)">Doppybussines@outlook.com</a></div>`, { wide: true });
}

function openAllPetsModal(){
  openModal('Mis mascotas', (pets.length ? pets.map(p => `
    <div class="my-pet-item ${String(p.id) === String(currentPetId) ? 'current' : ''}" onclick="selectPet('${p.id}');closeModal();">
      <div class="my-pet-thumb"><img src="${esc(petPhoto(p) || speciesToIcon(p.petTypes))}" alt=""></div>
      <div><div class="my-pet-name">${esc(p.pet_name)}</div><div class="my-pet-sub">${esc(speciesLabel(p.petTypes))} · ${esc(p.pet_breed || '—')} · ${esc(ageText(p))}</div></div>
    </div>`).join('') : '<p class="empty">Todavía no registraste mascotas.</p>') +
    `<div class="modal-actions"><button class="btn-primary" onclick="location.href='selpetdu.html'">+ Agregar mascota</button></div>`, { wide: true });
}

/* ============================================================
   EMERGENCIA (Google Maps + Places)
   ============================================================ */
let mapsReady = false;
let emgMap = null;
let emgUserPos = null;
let emgMarkers = [];
let emergencyClinics = [];
let emgSelectedClinic = null;
let emgPetId = null;
let emgStarted = false;
let placesService = null;

// Callback del script de Google Maps (&callback=initMap en el HTML)
function initMap(){
  mapsReady = true;
  if($('view-emergency')?.classList.contains('active')) locateUserAndFindClinics();
}
window.initMap = initMap;
window.gm_authFailure = function(){
  mapsReady = false;
  setMapBadge('No se pudo cargar Google Maps (revisa la API key).', false);
};

function setMapBadge(text, spinning){
  const badge = $('emgMapBadge');
  if(!badge) return;
  if(!text){ badge.style.display = 'none'; return; }
  badge.style.display = 'flex';
  badge.querySelector('.spin').style.display = spinning ? 'inline-block' : 'none';
  $('emgMapBadgeText').textContent = text;
}
function setLocationStatus(text, state){
  const st = $('emgLocationStatus');
  st.textContent = text;
  st.className = 'status' + (state ? ' ' + state : '');
  $('emgLocationRetryBtn').style.display = state === 'error' ? 'inline-block' : 'none';
}

function startEmergency(){
  if(!emgPetId) emgPetId = currentPetId;
  renderEmergencyPets();
  renderEmergencyMedicalSummary();
  renderEmergencySelectedClinic();
  restoreShare();
  if(emgStarted) return;
  emgStarted = true;
  locateUserAndFindClinics();
}

function locateUserAndFindClinics(){
  setLocationStatus('buscando…', '');
  if(!navigator.geolocation){
    $('emgLocationDesc').textContent = 'Tu navegador no permite obtener la ubicación.';
    setLocationStatus('sin ubicación', 'error');
    showFallbackClinics();
    return;
  }
  setMapBadge('Obteniendo tu ubicación…', true);
  navigator.geolocation.getCurrentPosition(pos => {
    emgUserPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    $('emgLocationDesc').textContent = `Lat ${emgUserPos.lat.toFixed(4)}, Lng ${emgUserPos.lng.toFixed(4)} (±${Math.round(pos.coords.accuracy)} m)`;
    setLocationStatus('ubicación encontrada', 'ok');
    findNearbyClinics();
  }, err => {
    console.warn('[Doppy] geolocation', err);
    $('emgLocationDesc').textContent = err.code === 1 ? 'Permiso de ubicación denegado.' : 'No se pudo obtener tu ubicación.';
    setLocationStatus('sin ubicación', 'error');
    setMapBadge('', false);
    showFallbackClinics();
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
}

function findNearbyClinics(){
  if(!mapsReady || !window.google?.maps){
    setMapBadge('El mapa no está disponible. Mostrando tus clínicas.', false);
    showFallbackClinics();
    return;
  }
  if(!emgMap){
    emgMap = new google.maps.Map($('emgMapCanvas'), { center: emgUserPos, zoom: 14, disableDefaultUI: true, zoomControl: true });
    placesService = new google.maps.places.PlacesService(emgMap);
  }
  emgMap.setCenter(emgUserPos);
  emgMarkers.forEach(m => m.setMap(null)); emgMarkers = [];
  emgMarkers.push(new google.maps.Marker({
    position: emgUserPos, map: emgMap, title: 'Tú',
    icon: { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: '#087cbf', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 }
  }));
  setMapBadge('Buscando veterinarias abiertas…', true);
  placesService.nearbySearch({ location: emgUserPos, radius: 6000, type: 'veterinary_care', openNow: true }, (results, status) => {
    setMapBadge('', false);
    if(status !== google.maps.places.PlacesServiceStatus.OK || !results?.length){
      setMapBadge('No encontramos veterinarias abiertas cerca.', false);
      showFallbackClinics();
      return;
    }
    emergencyClinics = results.map(r => ({
      placeId: r.place_id, name: r.name, address: r.vicinity, rating: r.rating,
      lat: r.geometry.location.lat(), lng: r.geometry.location.lng(), open: true,
      dist: distanceKm(emgUserPos, { lat: r.geometry.location.lat(), lng: r.geometry.location.lng() })
    })).sort((a, b) => a.dist - b.dist).slice(0, 8);
    emergencyClinics.forEach((c, i) => {
      const mk = new google.maps.Marker({ position: { lat: c.lat, lng: c.lng }, map: emgMap, title: c.name, label: { text: String(i + 1), color: '#fff', fontWeight: '700' } });
      mk.addListener('click', () => selectEmergencyClinic(i));
      emgMarkers.push(mk);
    });
    emgSelectedClinic = emergencyClinics[0];
    renderEmergencyClinics();
    renderEmergencySelectedClinic();
  });
}

/* Sin mapa: se ofrecen las clínicas afiliadas del dueño */
function showFallbackClinics(){
  emergencyClinics = Object.values(clinicsById).map(c => ({
    name: c.clinic_name, address: clinicAddress(c), phone: c.phone, open: null, dist: null, clinicId: c.id_veterinary
  }));
  emgSelectedClinic = emergencyClinics[0] || null;
  renderEmergencyClinics();
  renderEmergencySelectedClinic();
}

function distanceKm(a, b){
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function renderEmergencyClinics(){
  const el = $('emgVetList');
  if(!el) return;
  el.innerHTML = emergencyClinics.length ? emergencyClinics.map((c, i) => `
    <div class="emg-clinic ${c === emgSelectedClinic ? 'sel' : ''}" onclick="selectEmergencyClinic(${i})">
      <div class="icon-round">🏥</div>
      <div class="emg-clinic-info">
        <div class="emg-clinic-name">${i + 1}. ${esc(c.name)} ${c.open ? '<span class="open-tag">Abierta</span>' : ''}</div>
        <div class="emg-clinic-sub">${esc(c.address || '')}${c.rating ? ' · ⭐ ' + c.rating : ''}</div>
      </div>
      ${c.dist !== null && c.dist !== undefined ? `<div class="emg-dist">${c.dist.toFixed(1)} km</div>` : ''}
    </div>`).join('') : `<p class="empty">No hay clínicas para mostrar. Activa tu ubicación o afíliate a una clínica.</p>`;
}

function selectEmergencyClinic(i){
  emgSelectedClinic = emergencyClinics[i] || null;
  if(emgMap && emgSelectedClinic?.lat) emgMap.panTo({ lat: emgSelectedClinic.lat, lng: emgSelectedClinic.lng });
  renderEmergencyClinics();
  renderEmergencySelectedClinic();
}

function renderEmergencySelectedClinic(){
  const el = $('emgVetSelectedPanel');
  if(!el) return;
  const c = emgSelectedClinic;
  el.innerHTML = c ? `
    <h3>Veterinaria seleccionada</h3>
    <div style="font-weight:800;font-size:15px;margin-bottom:4px">${esc(c.name)}</div>
    <div style="font-size:13px;color:var(--text-muted);margin-bottom:10px">${esc(c.address || '')}</div>
    ${c.dist !== null && c.dist !== undefined ? `<div class="open-tag" style="display:inline-block">${c.dist.toFixed(1)} km de ti</div>` : ''}`
    : `<h3>Veterinaria seleccionada</h3><p class="empty">Ninguna todavía.</p>`;
}

function renderEmergencyPets(){
  const el = $('emgPetList');
  if(!el) return;
  if(!emgPetId) emgPetId = currentPetId;
  el.innerHTML = pets.length ? pets.map(p => `
    <div class="emg-pet ${String(p.id) === String(emgPetId) ? 'sel' : ''}" onclick="selectEmergencyPet('${p.id}')">
      <div class="my-pet-thumb"><img src="${esc(petPhoto(p) || speciesToIcon(p.petTypes))}" alt=""></div>
      <div><div class="my-pet-name">${esc(p.pet_name)}</div><div class="my-pet-sub">${esc(speciesLabel(p.petTypes))} · ${esc(ageText(p))}</div></div>
    </div>`).join('') : `<p class="empty">No tienes mascotas registradas.</p>`;
}

function selectEmergencyPet(id){
  emgPetId = String(id);
  // El resumen médico usa las vacunas de la mascota actual: se cambia también la actual.
  if(String(currentPetId) !== emgPetId) selectPet(emgPetId);
  renderEmergencyPets();
  renderEmergencyMedicalSummary();
}

function renderEmergencyMedicalSummary(){
  const el = $('emgMedicalSummary');
  if(!el) return;
  const pet = petById(emgPetId || currentPetId);
  if(!pet){ el.innerHTML = '<p class="empty">Selecciona una mascota.</p>'; return; }
  const clinic = clinicForPet(pet), staff = staffForPet(pet);
  const late = vaccinations.filter(v => vaccStatus(v) === 'late').map(v => v.vaccine_name);
  const last = vaccinations.slice(-3).map(v => v.vaccine_name).join(', ');
  const phone = (currentClient && 'phone' in currentClient) ? currentClient.phone : lsGet(clientKey('phone'), '');
  const rows = [
    ['Mascota', pet.pet_name], ['Especie', speciesLabel(pet.petTypes)], ['Raza', pet.pet_breed || '—'],
    ['Edad', ageText(pet)], ['Sexo', genderText(pet)],
    ['Vacunas', late.length ? `⚠️ Vencidas: ${late.join(', ')}` : (vaccinations.length ? 'Al día' : 'Sin registros')],
    ['Últimas vacunas', last || '—'], ['Clínica', clinic?.clinic_name || '—'], ['Veterinario', staff?.nombre || '—'],
    ['Contacto del dueño', phone || currentClient?.email || '—']
  ];
  el.innerHTML = rows.map(([k, v]) => `<div class="row"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('');
}

function handleEmergencyCall(){
  const c = emgSelectedClinic;
  if(c?.phone){ callPhone(c.phone); return; }
  if(c?.placeId && placesService){
    placesService.getDetails({ placeId: c.placeId, fields: ['formatted_phone_number', 'international_phone_number'] }, (d, status) => {
      const phone = d?.international_phone_number || d?.formatted_phone_number;
      if(status === google.maps.places.PlacesServiceStatus.OK && phone) callPhone(phone);
      else callAssignedVetPhone();
    });
    return;
  }
  callAssignedVetPhone();
}

function handleEmergencyNavigate(){
  const c = emgSelectedClinic;
  if(!c){ showToast('Selecciona una veterinaria.'); return; }
  const dest = c.lat ? `${c.lat},${c.lng}` : encodeURIComponent(`${c.name} ${c.address || ''}`);
  const url = `https://www.google.com/maps/dir/?api=1&destination=${dest}${c.placeId ? '&destination_place_id=' + c.placeId : ''}`;
  window.open(url, '_blank');
}

/* Avisa al veterinario asignado en la tabla notifications (staff_id, title, message),
   las mismas columnas que lee dashboardda.js. */
async function handleEmergencyNotifyVet(){
  const pet = petById(emgPetId || currentPetId);
  if(!pet){ showToast('Selecciona una mascota.'); return; }
  if(!pet.assigned_veterinarian_id){ showToast('Tu mascota todavía no tiene veterinario asignado. Llama a la clínica.'); return; }
  const where = emgSelectedClinic ? ` Se dirige a: ${emgSelectedClinic.name}.` : '';
  const { error } = await supabaseClient.from('notifications').insert({
    staff_id: pet.assigned_veterinarian_id,
    title: `🚨 Emergencia: ${pet.pet_name}`,
    message: `${currentClient?.name || 'El dueño'} reporta una emergencia con ${pet.pet_name} (${speciesLabel(pet.petTypes)}).${where}`
  });
  if(error){ console.error('[Doppy] notify vet', error); showToast('❌ No se pudo avisar: ' + error.message); return; }
  showToast('✅ Aviso enviado a tu veterinario');
}

/* ---------- Compartir historial con QR ----------
   El enlace lleva el resumen médico dentro (#share=...) y la hora de
   vencimiento. Al abrirlo, esta misma página muestra el resumen en solo
   lectura si no venció. Como los datos viajan en el enlace, "Eliminar"
   solo lo oculta en este dispositivo: el vencimiento es la protección real. */
let shareTimer = null;

function openShareDurationModal(){
  if(!petById(emgPetId || currentPetId)){ showToast('Selecciona una mascota.'); return; }
  openModal('¿Por cuánto tiempo?', `<div class="choice-list">
    <button onclick="generateShare(15)">15 minutos</button>
    <button onclick="generateShare(60)">1 hora</button>
    <button onclick="generateShare(1440)">24 horas</button></div>`);
}

function buildShareRecord(minutes){
  const pet = petById(emgPetId || currentPetId);
  const clinic = clinicForPet(pet), staff = staffForPet(pet);
  return {
    n: pet.pet_name, s: speciesLabel(pet.petTypes), b: pet.pet_breed || '', a: ageText(pet), g: genderText(pet),
    o: currentClient?.name || '', c: clinic?.clinic_name || '', v: staff?.nombre || '',
    vx: vaccinations.slice(-10).map(v => [v.vaccine_name, v.created_at ? v.created_at.slice(0, 10) : '', v.next_due_date || '']),
    e: Date.now() + minutes * 60000
  };
}
function encodeShare(obj){
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeShare(str){
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(decodeURIComponent(escape(atob(b64 + '==='.slice((b64.length + 3) % 4)))));
}

function generateShare(minutes){
  const rec = buildShareRecord(minutes);
  const url = location.origin + location.pathname + '#share=' + encodeShare(rec);
  lsSet(clientKey('share'), { url, expires: rec.e, pet: rec.n, rec });
  closeModal();
  showShare();
  showToast('✅ QR generado');
}

function restoreShare(){
  const s = lsGet(clientKey('share'), null);
  if(s && s.expires > Date.now()) showShare();
  else hideShare();
}

function showShare(){
  const s = lsGet(clientKey('share'), null);
  if(!s) return hideShare();
  $('emgShareInitial').style.display = 'none';
  $('emgShareActive').style.display = 'block';
  $('emgShareInfoPet').textContent = s.pet;
  $('emgShareInfoExpiry').textContent = new Date(s.expires).toLocaleString('es');
  const box = $('emgQrCanvas');
  box.innerHTML = '';
  if(typeof QRCode === 'function'){
    new QRCode(box, { text: s.url, width: 200, height: 200, colorDark: '#0F172A', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.L });
  } else {
    box.innerHTML = '<div style="width:200px;padding:20px;font-size:12px;color:#64748B">No se pudo cargar el generador de QR. Usa "Copiar enlace".</div>';
  }
  clearInterval(shareTimer);
  const tick = () => {
    const left = s.expires - Date.now();
    if(left <= 0){ hideShare(); showToast('El enlace compartido venció.'); return; }
    const h = Math.floor(left / 3600000), m = Math.floor(left % 3600000 / 60000), sec = Math.floor(left % 60000 / 1000);
    $('emgShareCountdown').textContent = `Vence en ${h ? h + ' h ' : ''}${m} min ${String(sec).padStart(2, '0')} s`;
  };
  tick();
  shareTimer = setInterval(tick, 1000);
}

function hideShare(){
  clearInterval(shareTimer);
  if($('emgShareInitial')) $('emgShareInitial').style.display = 'block';
  if($('emgShareActive')) $('emgShareActive').style.display = 'none';
}

function revokeShareLink(){
  localStorage.removeItem(clientKey('share'));
  hideShare();
  showToast('Enlace eliminado de este dispositivo.');
}

function copyShareLink(){
  const s = lsGet(clientKey('share'), null);
  if(!s) return;
  navigator.clipboard?.writeText(s.url).then(() => showToast('🔗 Enlace copiado')).catch(() => prompt('Copia el enlace:', s.url));
}

function sharedRecordHtml(rec){
  const vx = (rec.vx || []).map(v => `<tr><td>${esc(v[0])}</td><td>${fmtDate(v[1])}</td><td>${fmtDate(v[2])}</td></tr>`).join('')
    || '<tr><td colspan="3" class="empty">Sin vacunas registradas</td></tr>';
  return `
    <div class="emg-info-panel" style="margin-bottom:14px">
      ${[['Mascota', rec.n], ['Especie', rec.s], ['Raza', rec.b || '—'], ['Edad', rec.a], ['Sexo', rec.g], ['Dueño', rec.o || '—'], ['Clínica', rec.c || '—'], ['Veterinario', rec.v || '—']]
        .map(([k, v]) => `<div class="row"><span>${k}</span><span>${esc(v)}</span></div>`).join('')}
    </div>
    <table class="vacc-table"><thead><tr><th>Vacuna</th><th>Aplicada</th><th>Próxima</th></tr></thead><tbody>${vx}</tbody></table>
    <p class="empty">Válido hasta ${new Date(rec.e).toLocaleString('es')}.</p>`;
}

function previewSharedRecord(){
  const s = lsGet(clientKey('share'), null);
  if(!s) return;
  openModal('Así lo verá el veterinario', sharedRecordHtml(s.rec), { wide: true });
}

/* Si la página se abre con #share=..., se muestra el historial compartido. */
function handleShareHash(){
  if(!location.hash.startsWith('#share=')) return false;
  try {
    const rec = decodeShare(location.hash.slice(7));
    if(!rec.e || rec.e < Date.now()){
      openModal('Enlace vencido', '<p>Este historial compartido ya venció. Pide al dueño que genere un QR nuevo.</p>');
    } else {
      openModal(`Historial médico de ${esc(rec.n)}`, sharedRecordHtml(rec), { wide: true });
    }
  } catch (e) {
    console.error('[Doppy] share hash', e);
    openModal('Enlace no válido', '<p>No se pudo leer el historial compartido.</p>');
  }
  return true;
}

/* ============================================================
   EVENTOS DE LA INTERFAZ
   ============================================================ */
function bindUI(){
  $('menuToggle')?.addEventListener('click', openSidebar);
  $('overlay')?.addEventListener('click', closeSidebar);
  $('bellBtn')?.addEventListener('click', () => showView('notifications'));
  $('avatarBtn')?.addEventListener('click', e => {
    e.stopPropagation();
    $('avatarMenu').classList.toggle('open');
    $('avatarChev').classList.toggle('open');
  });
  document.addEventListener('click', e => { if(!e.target.closest('.avatar-dropdown')) closeAvatarMenu(); });
  $('modalOverlay')?.addEventListener('click', e => { if(e.target === $('modalOverlay')) closeModal(); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape') closeModal(); });

  $('addPetBtn')?.addEventListener('click', () => { window.location.href = 'selpetdu.html'; });
  $('addNewPetBtn2')?.addEventListener('click', () => { window.location.href = 'selpetdu.html'; });
  $('newAppointmentBtn')?.addEventListener('click', openNewAppointmentModal);
  $('newEventBtn')?.addEventListener('click', () => openNewEventModal());

  $('searchInput')?.addEventListener('input', e => {
    wallSearch = e.target.value.trim();
    if(!$('view-petwall').classList.contains('active')) showView('petwall', document.querySelector('[data-view=petwall]'));
    renderPosts();
  });

  // Fotos (LOCAL): se reducen antes de guardarlas para no llenar el almacenamiento.
  $('petPhotoInput')?.addEventListener('change', async e => {
    const file = e.target.files[0]; e.target.value = '';
    const pet = currentPet();
    if(!file || !pet) return;
    try {
      const data = await resizeImage(file, 600);
      if(!lsSet(`doppy_pet_photo_${pet.id}`, data)){ showToast('La imagen es muy grande para guardarla.'); return; }
      showToast('📷 Foto guardada en este dispositivo');
      renderAll();
    } catch (err) { showToast('No se pudo leer la imagen.'); }
  });
  $('vetPhotoInput')?.addEventListener('change', async e => {
    const file = e.target.files[0]; e.target.value = '';
    const clinic = clinicForPet(currentPet());
    if(!file) return;
    if(!clinic){ showToast('Primero afíliate a una clínica.'); return; }
    try {
      const data = await resizeImage(file, 600);
      if(lsSet(`doppy_clinic_photo_${clinic.id_veterinary}`, data)){ showToast('📷 Foto guardada en este dispositivo'); renderVetInfo(); }
    } catch (err) { showToast('No se pudo leer la imagen.'); }
  });

  // Edición en línea: se guarda al salir del campo; Enter = guardar.
  document.addEventListener('focusin', e => {
    if(e.target.isContentEditable) e.target.dataset.orig = e.target.textContent.trim();
  });
  document.addEventListener('focusout', e => {
    const el = e.target;
    if(el.isContentEditable && el.dataset.orig !== undefined) saveEditable(el);
  });
  document.addEventListener('keydown', e => {
    if(e.key === 'Enter' && e.target.isContentEditable){ e.preventDefault(); e.target.blur(); }
  });
  // Que el botón "Editar/Guardar" no le quite el foco al campo antes del clic.
  document.querySelectorAll('.info-row .btn-outline').forEach(b => b.addEventListener('mousedown', e => e.preventDefault()));

  // Botones con onclick de ejemplo en el HTML: se reemplazan por la acción real.
  const ownerCall = document.querySelector('.owner-card .call');
  if(ownerCall) ownerCall.onclick = () => {
    const phone = (currentClient && 'phone' in currentClient) ? currentClient.phone : lsGet(clientKey('phone'), '');
    callPhone(phone);
  };
  const vetMapBtn = document.querySelector('.vet-card .actions .icon-round:nth-child(2)');
  if(vetMapBtn) vetMapBtn.onclick = () => {
    const clinic = clinicForPet(currentPet());
    if(!clinic){ showToast('Aún no hay clínica afiliada.'); return; }
    window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${clinic.clinic_name} ${clinicAddress(clinic)}`), '_blank');
  };
  document.querySelectorAll('.view-toggle button').forEach(b => {
    const label = b.textContent.trim();
    if(label === 'Mes') b.onclick = () => {};
    if(label === 'Semana' || label === 'Lista') b.onclick = () => showToast(`La vista "${label}" estará disponible pronto.`);
  });
}

function applySavedTheme(){
  if(lsGet('doppy_dark_mode', false)) document.body.classList.add('dark');
}

/* ============================================================
   ARRANQUE
   ============================================================ */
async function bootDu(){
  applySavedTheme();
  bindUI();
  const isShare = handleShareHash();

  if(!supabaseClient){
    setDbStatus('error', 'Sin conexión con Supabase');
    return;
  }

  const { data: { user } } = await supabaseClient.auth.getUser();
  if(!user){
    setDbStatus('error', 'Sin sesión activa');
    if(!isShare){
      showToast('Inicia sesión para ver tu panel.');
      setTimeout(() => { window.location.href = 'logindu.html'; }, 1400);
    }
    return;
  }
  currentUser = user;

  await loadClient();
  if(!currentClient){
    setDbStatus('error', 'No se encontró tu perfil de dueño');
    showToast('❌ No se pudo cargar tu perfil.');
    return;
  }
  setDbStatus('ok', 'Conectado a Supabase');
  personalEvents = lsGet(clientKey('events'), []);

  await loadPets();
  await Promise.all([
    loadAffiliationsAndClinics(),
    loadAppointments(),
    loadVaccinations(),
    loadEvents(),
    loadPosts(),
    loadNotifications()
  ]);
  renderAll();
}

bootDu();
