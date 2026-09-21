/* ============================================================
   Doppy — Veterinary Dashboard (dashboarddv)
   Conectado a Supabase. Antes todo esto era 100% mock data.
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

let CURRENT_STAFF_ID = null;
let CURRENT_VETERINARY_ID = null;
let currentStaffContext = { name: null, role: null, email: null, phone: null, specialty: null, license: null, clinicName: null };

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/* ---------- helpers compartidos ---------- */
function speciesToIcon(petTypes){
  const key = (petTypes || '').toLowerCase();
  const map = { dog:'assets/dogd.png', cat:'assets/catd.png', bird:'assets/parrotd.png', turtle:'assets/turtled.png', rabbit:'assets/rabitd.png', lizard:'assets/lizardd.png' };
  return map[key] || 'assets/PawB.png';
}
function ageToText(age, isYears){ return `${age ?? 0} ${isYears ? 'year' : 'month'}${age === 1 ? '' : 's'}`; }
function dateKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function timeAgoDv(iso){
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if(mins < 1) return 'Just now';
  if(mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if(hrs < 24) return hrs + 'h ago';
  return Math.floor(hrs / 24) + 'd ago';
}
function setTextDv(id, val){ const el = document.getElementById(id); if(el) el.textContent = val; }
function getInitials(name){
  return (name || '').split(' ').filter(Boolean).slice(0,2).map(part => part[0].toUpperCase()).join('');
}

/* ============================================================
   SESIÓN: resolver qué veterinario/staff está logueado y a qué
   clínica pertenece (auth.users -> veterinary_staff.auth_user_id)
   ============================================================ */
async function loadCurrentStaffContext(){
  try{
    const { data: { user }, error: authErr } = await supabaseClient.auth.getUser();
    if(authErr || !user){
      console.warn('[Doppy] No active session for the vet portal.');
      return;
    }
    const { data: staff, error } = await supabaseClient
      .from('veterinary_staff')
      .select('id, nombre, rol, email, telefono, specialty, license_number, veterinary_id')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if(error || !staff){
      console.warn('[Doppy] Logged-in user has no matching row in "veterinary_staff".', error);
      return;
    }
    CURRENT_STAFF_ID = staff.id;
    CURRENT_VETERINARY_ID = staff.veterinary_id;

    const { data: clinic } = await supabaseClient
      .from('veterinary').select('clinic_name').eq('id_veterinary', staff.veterinary_id).maybeSingle();

    currentStaffContext = {
      name: staff.nombre || 'Veterinarian',
      role: staff.rol || 'Veterinarian',
      email: staff.email || '—',
      phone: staff.telefono || '—',
      specialty: staff.specialty || '—',
      license: staff.license_number || '—',
      clinicName: clinic?.clinic_name || '—'
    };
  }catch(e){
    console.error('[Doppy] loadCurrentStaffContext failed:', e);
  }
}

function initAccountView(){
  const name = currentStaffContext.name || 'Veterinarian';
  const initials = getInitials(name) || 'VS';

  const topbarAvatarEl = document.getElementById('topbar-avatar');
  const topbarNameEl = document.getElementById('topbar-username');
  const topbarRoleEl = document.getElementById('topbar-userrole');
  const heroTitleEl = document.querySelector('.hero h2');
  const heroSubtitleEl = document.querySelector('.hero p');
  const avatarEl = document.querySelector('.profile-card .profile-avatar');
  const profileNameEl = document.getElementById('profile-name');
  const profileRoleEl = document.getElementById('profile-role');
  const profileInfoEl = document.getElementById('profile-info');
  const dbNoteEl = document.getElementById('profile-db-note');

  if(topbarAvatarEl) topbarAvatarEl.textContent = initials;
  if(topbarNameEl) topbarNameEl.textContent = name;
  if(topbarRoleEl) topbarRoleEl.textContent = currentStaffContext.role;
  if(heroTitleEl) heroTitleEl.textContent = `Welcome back, ${name.split(' ')[0]}!`;
  if(heroSubtitleEl) heroSubtitleEl.textContent = `Here's a summary of your clinic today.`;
  if(avatarEl) avatarEl.textContent = initials;
  if(profileNameEl) profileNameEl.textContent = name;
  if(profileRoleEl) profileRoleEl.textContent = `${currentStaffContext.role} · ${currentStaffContext.clinicName}`;

  if(profileInfoEl){
    const items = [
      ['Email', currentStaffContext.email],
      ['Phone', currentStaffContext.phone],
      ['Clinic', currentStaffContext.clinicName],
      ['Specialty', currentStaffContext.specialty],
      ['License', currentStaffContext.license]
    ];
    profileInfoEl.innerHTML = items.map(item =>
      `<div class="info-row"><span class="info-label">${item[0]}</span><span class="info-val">${item[1]}</span></div>`
    ).join('');
  }

  if(dbNoteEl){
    dbNoteEl.textContent = CURRENT_VETERINARY_ID
      ? '🔗 Connected to Supabase.'
      : '⚠️ No active session — sign in to see your real clinic data.';
  }
}

/* ============================================================
   PETS
   ============================================================ */
let pets = [];

async function loadPetsFromSupabase(){
  if(!CURRENT_VETERINARY_ID){ pets = []; return; }
  const { data, error } = await supabaseClient
    .from('pets')
    .select(`
      id, pet_name, pet_breed, petTypes, pet_gender, pet_age, pet_year,
      owner_id, assigned_veterinarian_id,
      users:owner_id ( name, phone ),
      vaccination_record ( vaccine_name, next_due_date ),
      appointments ( appointment_date )
    `)
    .eq('primary_clinic_id', CURRENT_VETERINARY_ID);

  if(error){ console.error('[Doppy] loadPetsFromSupabase', error); pets = []; return; }

  pets = (data || []).map(p => {
    const dueDates = (p.vaccination_record || []).map(v => v.next_due_date).filter(Boolean).sort();
    const nextDue = dueDates[0];
    let vaccine = 'Up to date';
    if(nextDue){
      const days = (new Date(nextDue) - new Date()) / 86400000;
      if(days < 0) vaccine = 'Pending';
      else if(days <= 30) vaccine = 'Next';
    }
    const apptDates = (p.appointments || []).map(a => a.appointment_date).sort();
    const now = Date.now();
    const past = apptDates.filter(d => new Date(d).getTime() < now);
    const future = apptDates.filter(d => new Date(d).getTime() >= now);

    return {
      id: p.id,
      name: p.pet_name || 'No name',
      img: speciesToIcon(p.petTypes),
      breed: p.pet_breed || '—',
      age: ageToText(p.pet_age, p.pet_year !== false),
      weight: '—',
      type: p.petTypes || 'Pet',
      color: '—',
      owner: p.users?.name || '—',
      phone: p.users?.phone || '—',
      lastVisit: past.length ? new Date(past[past.length-1]).toLocaleDateString('en-GB') : 'N/A',
      nextVisit: future.length ? new Date(future[0]).toLocaleDateString('en-GB') : 'N/A',
      vaccine,
      notes: '',
      affiliated: true,
      assignedVeterinarianId: p.assigned_veterinarian_id,
      medicalRecords: [], prescriptions: [], privateNotes: [], appts: []
    };
  });
}

function renderPetAvatar(p){
  return p.img ? `<img src="${p.img}" alt="${p.name}" class="pet-avatar-img">` : '';
}

function buildPetsGrid(search=''){
  const vcBc = { 'Up to date':'b-green', 'Next':'b-blue', 'Pending':'b-orange' };
  const query = search.trim().toLowerCase();
  const el = document.getElementById('pets-grid');
  if(!el) return;
  const filtered = pets.filter(p => {
    const text = `${p.name} ${p.breed} ${p.owner} ${p.notes}`.toLowerCase();
    return !query || text.includes(query);
  });
  el.innerHTML = filtered.map(p => `
    <div class="pet-card" onclick="openPet(${p.id})">
      <div class="emo">${renderPetAvatar(p)}</div>
      <div class="pname">${p.name}</div>
      <div class="pbreed">${p.breed}</div>
      <div class="pbreed">${p.age}</div>
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
        <span class="badge ${vcBc[p.vaccine]||'b-orange'}">${p.vaccine}</span>
        <span class="badge ${p.affiliated?'b-green':'b-red'}">${p.affiliated?'Affiliated':'Not affiliated'}</span>
      </div>
    </div>`).join('') || `<p style="color:#6B7280;font-size:13px;padding:12px;">No pets found.</p>`;
}

function buildPetOptions(){
  const select = document.getElementById('f-pet');
  if(!select) return;
  select.innerHTML = `<option value="">Select pet...</option>` + pets.map(p =>
    `<option value="${p.id}">${p.name} – ${p.breed}</option>`
  ).join('');
}

function applySearch(){
  const query = document.getElementById('top-search')?.value || '';
  buildPetsGrid(query);
  buildAppts(query);
}

async function newPet(){
  if(!CURRENT_VETERINARY_ID){ alert('No clinic linked to this account yet.'); return; }
  const name = prompt('Pet name');
  if(!name) return;
  const breed = prompt('Pet breed');
  if(!breed) return;
  const { error } = await supabaseClient.from('pets').insert({
    pet_name: name.trim(), pet_breed: breed.trim(), petTypes: 'Dog',
    primary_clinic_id: CURRENT_VETERINARY_ID, assigned_veterinarian_id: CURRENT_STAFF_ID
  });
  if(error){ console.error('[Doppy] newPet', error); alert('Error registering pet: ' + error.message); return; }
  await loadPetsFromSupabase();
  buildPetsGrid();
  buildPetOptions();
  alert('Pet successfully registered.');
}

/* ============================================================
   PET DETAIL (medical records, prescriptions, private notes)
   ============================================================ */
async function openPet(id){
  const p = pets.find(x => x.id === id);
  if(!p) return;

  document.getElementById('page-title').textContent = p.name;
  showView('pet');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('pet-detail').innerHTML = `<p style="padding:20px;color:#6B7280;">Loading...</p>`;

  const [recordsRes, rxRes, notesRes, vaccRes] = await Promise.all([
    supabaseClient.from('clinical_records').select('id, record_type, description, created_at').eq('pet_id', id).order('created_at', { ascending: false }),
    supabaseClient.from('prescriptions').select('id, medicine, instructions, created_at').eq('pet_id', id).order('created_at', { ascending: false }),
    supabaseClient.from('vet_private_notes').select('id, note, created_at').eq('pet_id', id).order('created_at', { ascending: false }),
    supabaseClient.from('vaccination_record').select('id, vaccine_name, dose_number, next_due_date, created_at').eq('pet_id', id).order('created_at', { ascending: false })
  ]);

  p.medicalRecords = (recordsRes.data || []).map(r => ({ date: new Date(r.created_at).toLocaleDateString('en-GB'), summary: r.description || r.record_type || '—' }));
  p.prescriptions = (rxRes.data || []).map(r => ({ date: new Date(r.created_at).toLocaleDateString('en-GB'), medicine: r.medicine, instructions: r.instructions || '' }));
  p.privateNotes = (notesRes.data || []).map(n => ({ date: new Date(n.created_at).toLocaleDateString('en-GB'), note: n.note }));
  p.vaccinations = (vaccRes.data || []).map(v => ({
    date: new Date(v.created_at).toLocaleDateString('en-GB'),
    name: v.vaccine_name,
    dose: v.dose_number || 1,
    next: v.next_due_date ? new Date(v.next_due_date).toLocaleDateString('en-GB') : '—'
  }));

  const vcBc = { 'Up to date':'b-green', 'Next':'b-blue', 'Pending':'b-orange' };
  const recordsHtml = p.medicalRecords.map(r => `
      <div class="info-row"><span class="info-label">${r.date}</span><span class="info-val">${r.summary}</span></div>
    `).join('') || `<p style="font-size:13px;color:#6B7280">No medical records available.</p>`;
  const prescriptionHtml = p.prescriptions.length ? p.prescriptions.map(r => `
      <div class="info-row"><span class="info-label">${r.date}</span><span class="info-val">${r.medicine} — ${r.instructions}</span></div>
    `).join('') : `<p style="font-size:13px;color:#6B7280">No prescriptions have been added yet.</p>`;
  const privateNotesHtml = p.privateNotes.length ? p.privateNotes.map(n => `
      <div class="info-row"><span class="info-label">${n.date}</span><span class="info-val">${n.note}</span></div>
    `).join('') : `<p style="font-size:13px;color:#6B7280">No private notes yet.</p>`;
  const vaccinationsHtml = (p.vaccinations||[]).length ? p.vaccinations.map(v => `
      <div class="info-row"><span class="info-label">${v.date}</span><span class="info-val">${v.name} (dose ${v.dose}) — next due: ${v.next}</span></div>
    `).join('') : `<p style="font-size:13px;color:#6B7280">No vaccines recorded yet.</p>`;

  document.getElementById('pet-detail').innerHTML = `
    <div class="pet-profile-card">
      <div class="pet-big-emo">${renderPetAvatar(p)}</div>
      <div>
        <div style="font-size:19px;font-weight:700">${p.name}</div>
        <div style="font-size:13px;color:#6B7280">${p.breed} · ${p.age} · ${p.weight}</div>
        <div class="pet-tags">
          <span class="pet-tag">${p.type}</span>
          <span class="pet-tag">Color: ${p.color}</span>
          <span class="badge ${vcBc[p.vaccine]||'b-orange'}">${p.vaccine}</span>
          <span class="badge ${p.affiliated?'b-green':'b-red'}">${p.affiliated?'Affiliated':'Not affiliated'}</span>
        </div>
      </div>
    </div>
    <div class="info2">
      <div class="info-card">
        <h3>Owner</h3>
        <div class="info-row"><span class="info-label">Name</span><span class="info-val">${p.owner}</span></div>
        <div class="info-row"><span class="info-label">Phone</span><span class="info-val">${p.phone}</span></div>
      </div>
      <div class="info-card">
        <h3>History</h3>
        <div class="info-row"><span class="info-label">Last visit</span><span class="info-val">${p.lastVisit}</span></div>
        <div class="info-row"><span class="info-label">Next appointment</span><span class="info-val">${p.nextVisit}</span></div>
      </div>
    </div>
    <div class="section-card" style="margin-bottom:12px">
      <div class="section-header"><span class="section-title">Medical records</span></div>
      ${recordsHtml}
    </div>
    <div class="section-card" style="margin-bottom:12px">
      <div class="section-header"><span class="section-title">Vaccinations</span></div>
      ${vaccinationsHtml}
      <div style="margin-top:12px">
        <div class="form-group">
          <label>Vaccine name</label>
          <input id="new-vaccine-name" type="text" style="width:100%;border:1px solid #E5E7EB;border-radius:8px;padding:10px;font-size:13px" placeholder="Example: Rabies, Distemper, Parvovirus, Bordetella...">
        </div>
        <div class="form-row" style="display:flex;gap:12px;margin-top:10px">
          <div class="form-group" style="flex:1">
            <label>Dose number</label>
            <input id="new-vaccine-dose" type="number" min="1" value="1" style="width:100%;border:1px solid #E5E7EB;border-radius:8px;padding:10px;font-size:13px">
          </div>
          <div class="form-group" style="flex:1">
            <label>Next due date (optional)</label>
            <input id="new-vaccine-next" type="date" style="width:100%;border:1px solid #E5E7EB;border-radius:8px;padding:10px;font-size:13px">
          </div>
        </div>
        <button class="btn-submit" style="margin-top:12px" onclick="saveVaccination(${p.id})">Save vaccine</button>
      </div>
    </div>
    <div class="section-card" style="margin-bottom:12px">
      <div class="section-header"><span class="section-title">Prescriptions</span></div>
      ${prescriptionHtml}
      <div style="margin-top:12px">
        <div class="form-group">
          <label>Prescription details</label>
          <textarea id="new-prescription" style="width:100%;border:1px solid #E5E7EB;border-radius:8px;padding:10px;font-size:13px;min-height:80px;resize:vertical" placeholder="Example: Amoxicillin 250 mg, twice daily for 7 days."></textarea>
        </div>
        <button class="btn-submit" onclick="savePrescription(${p.id})">Save prescription</button>
      </div>
    </div>
    <div class="section-card">
      <div class="section-header"><span class="section-title">Private veterinarian notes</span></div>
      ${privateNotesHtml}
      <div style="margin-top:12px">
        <div class="form-group">
          <label>Note for veterinarian</label>
          <textarea id="new-private-note" style="width:100%;border:1px solid #E5E7EB;border-radius:8px;padding:10px;font-size:13px;min-height:80px;resize:vertical" placeholder="Example: Follow up after surgery in 2 weeks."></textarea>
        </div>
        <button class="btn-submit" onclick="savePrivateNote(${p.id})">Save note</button>
      </div>
    </div>`;
}

async function saveVaccination(petId){
  const name = document.getElementById('new-vaccine-name')?.value.trim();
  const dose = parseInt(document.getElementById('new-vaccine-dose')?.value, 10) || 1;
  const next = document.getElementById('new-vaccine-next')?.value || null;
  if(!name){ alert('Enter the vaccine name.'); return; }

  const { error } = await supabaseClient.from('vaccination_record').insert({
    pet_id: petId, veterinary_id: CURRENT_VETERINARY_ID,
    vaccine_name: name, dose_number: dose, next_due_date: next
  });
  if(error){ console.error('[Doppy] saveVaccination', error); alert('Error saving vaccine: ' + error.message); return; }

  // El estado de vacunación de la mascota (Up to date/Next/Pending) depende
  // de esto, así que se recarga la lista completa de pacientes también.
  await loadPetsFromSupabase();
  openPet(petId);
}

async function savePrescription(petId){
  const text = document.getElementById('new-prescription')?.value.trim();
  if(!text){ alert('Enter the prescription details.'); return; }
  const { error } = await supabaseClient.from('prescriptions').insert({
    pet_id: petId, veterinarian_id: CURRENT_STAFF_ID,
    medicine: text.split('.')[0] || text, instructions: text
  });
  if(error){ console.error('[Doppy] savePrescription', error); alert('Error saving prescription: ' + error.message); return; }
  openPet(petId);
}

async function savePrivateNote(petId){
  const text = document.getElementById('new-private-note')?.value.trim();
  if(!text){ alert('Enter the private note.'); return; }
  const { error } = await supabaseClient.from('vet_private_notes').insert({
    pet_id: petId, veterinarian_id: CURRENT_STAFF_ID, note: text
  });
  if(error){ console.error('[Doppy] savePrivateNote', error); alert('Error saving note: ' + error.message); return; }
  openPet(petId);
}

/* ============================================================
   APPOINTMENTS (dashboard mini-list + full calendar)
   ============================================================ */
let allAppts = [];
let clinicStaff = [];

const APPT_TYPE_COLOR = { vaccination:'blue', consultation:'green', review:'orange', dermatology:'purple', deworming:'orange', grooming:'blue', checkup:'blue', other:'blue' };
const APPT_TYPE_LABEL_TO_KEY = { 'Vaccination':'vaccination', 'Consultation':'consultation', 'Review':'review', 'Dermatology check':'dermatology', 'Deworming':'deworming' };

async function loadAppointmentsFromSupabase(){
  if(!CURRENT_VETERINARY_ID){ allAppts = []; return; }
  const { data, error } = await supabaseClient
    .from('appointments')
    .select('id, pet_id, veterinarian_id, title, appointment_date, type, status')
    .eq('veterinary_id', CURRENT_VETERINARY_ID)
    .order('appointment_date', { ascending: true });
  if(error){ console.error('[Doppy] loadAppointmentsFromSupabase', error); allAppts = []; return; }
  allAppts = (data || []).map(a => {
    const d = new Date(a.appointment_date);
    return {
      id: a.id,
      petId: a.pet_id,
      date: dateKey(d),
      time: d.toTimeString().slice(0,5),
      type: a.title || a.type,
      color: APPT_TYPE_COLOR[a.type] || 'blue',
      vet: a.veterinarian_id
    };
  });
}

async function loadClinicStaffFromSupabase(){
  if(!CURRENT_VETERINARY_ID){ clinicStaff = []; return; }
  const { data, error } = await supabaseClient
    .from('veterinary_staff').select('id, nombre').eq('veterinary_id', CURRENT_VETERINARY_ID);
  if(error){ console.error('[Doppy] loadClinicStaffFromSupabase', error); clinicStaff = []; return; }
  clinicStaff = data || [];
}

function populateVetSelects(){
  const opts = clinicStaff.map(v => `<option value="${v.id}">${v.nombre}</option>`).join('');
  const filterVet = document.getElementById('filter-vet');
  if(filterVet) filterVet.innerHTML = `<option value="">All veterinarians</option>` + opts;
  const fVet = document.getElementById('f-vet');
  if(fVet) fVet.innerHTML = opts || (CURRENT_STAFF_ID ? `<option value="${CURRENT_STAFF_ID}">${currentStaffContext.name}</option>` : '');
}

function buildAppts(search=''){
  const query = search.trim().toLowerCase();
  const todayKey = dateKey(new Date());
  const el = document.getElementById('appt-list');
  if(!el) return;
  const todays = allAppts.filter(a => a.date === todayKey);
  el.innerHTML = todays.filter(a => {
    const p = pets.find(x => x.id === a.petId) || {};
    const text = `${p.name||''} ${p.breed||''} ${a.type} ${a.time}`.toLowerCase();
    return !query || text.includes(query);
  }).map(a => {
    const p = pets.find(x => x.id === a.petId);
    if(!p) return '';
    const bc = { blue:'b-blue', green:'b-green', orange:'b-orange', purple:'b-blue' }[a.color] || 'b-blue';
    return `<div class="appt-item" onclick="openPet(${p.id})">
      <span class="appt-time">${fmtTime(a.time)}</span>
      <div class="pet-thumb">${renderPetAvatar(p)}</div>
      <div class="appt-info">
        <div class="appt-name">${p.name}</div>
        <div class="appt-breed">${p.breed} · ${p.age}</div>
      </div>
      <span class="badge ${bc}">${a.type}</span>
    </div>`;
  }).join('') || `<p style="color:#6B7280;font-size:13px;padding:8px 0;">No appointments today.</p>`;
}

let reminders = [];

async function loadRemindersFromSupabase(){
  const petIds = pets.map(p => p.id);
  if(!petIds.length){ reminders = []; return; }
  const { data, error } = await supabaseClient
    .from('vaccination_record')
    .select('pet_id, vaccine_name, next_due_date')
    .in('pet_id', petIds)
    .not('next_due_date', 'is', null)
    .order('next_due_date', { ascending: true })
    .limit(6);
  if(error){ console.error('[Doppy] loadRemindersFromSupabase', error); reminders = []; return; }
  reminders = (data || []).map(r => {
    const pet = pets.find(p => p.id === r.pet_id);
    const days = (new Date(r.next_due_date) - new Date()) / 86400000;
    const status = days < 0 ? 'Expired' : (days <= 14 ? 'Next' : 'Pending');
    const bc = status === 'Expired' ? 'b-red' : (status === 'Next' ? 'b-blue' : 'b-orange');
    const ico = status === 'Expired' ? '⚠️' : (status === 'Next' ? '🔔' : 'ℹ️');
    const dateLabel = days < 0
      ? `Expired: ${new Date(r.next_due_date).toLocaleDateString('en-GB')}`
      : `Next dose: ${new Date(r.next_due_date).toLocaleDateString('en-GB')}`;
    return { ico, title: `${pet?.name || 'Pet'} ${r.vaccine_name}`, date: dateLabel, status, bc };
  });
}

function buildReminders(){
  const bcMap = { 'b-blue':'#EFF6FF', 'b-red':'#FEF2F2', 'b-orange':'#FFFBEB' };
  const el = document.getElementById('reminders');
  if(!el) return;
  el.innerHTML = reminders.length ? reminders.map(r => `
    <div class="reminder">
      <div class="rem-ico" style="background:${bcMap[r.bc]||'#F3F4F6'}">${r.ico}</div>
      <div style="flex:1;min-width:0">
        <div class="rem-title">${r.title}</div>
        <div class="rem-date">${r.date}</div>
      </div>
      <span class="rem-status badge ${r.bc}">${r.status}</span>
    </div>`).join('') : `<p style="color:#6B7280;font-size:13px;padding:8px 0;">No reminders right now.</p>`;
}

/* ---- dashboard stats + recent activity ---- */
let clinicalRecordsCount = 0;
let recentActivity = [];

async function loadClinicalRecordsCount(){
  const petIds = pets.map(p => p.id);
  if(!petIds.length){ clinicalRecordsCount = 0; return; }
  const { count } = await supabaseClient.from('clinical_records').select('id', { count:'exact', head:true }).in('pet_id', petIds);
  clinicalRecordsCount = count || 0;
}

async function loadRecentActivityFromSupabase(){
  if(!CURRENT_VETERINARY_ID){ recentActivity = []; return; }
  const { data, error } = await supabaseClient
    .from('activity_log').select('*').eq('veterinary_id', CURRENT_VETERINARY_ID)
    .order('created_at', { ascending:false }).limit(6);
  if(error){ recentActivity = []; return; }
  recentActivity = data || [];
}

function renderDashboardStats(){
  setTextDv('statRegisteredPets', pets.length);
  setTextDv('statApptsToday', allAppts.filter(a => a.date === dateKey(new Date())).length);
  setTextDv('statClinicalRecords', clinicalRecordsCount);
  setTextDv('statReminders', reminders.length);
}

function buildRecentActivity(){
  const el = document.querySelector('#view-dash .activity-grid');
  if(!el) return;
  if(!recentActivity.length){
    el.innerHTML = `<p style="color:#6B7280;font-size:13px;padding:8px 0;">No recent activity yet.</p>`;
    return;
  }
  el.innerHTML = recentActivity.map(a => `
    <div class="act-item">
      <div class="act-ico" style="background:#EFF6FF">📌</div>
      <div>
        <div class="act-name">${(a.action_type || 'Activity').replace(/_/g,' ')}</div>
        <div class="act-sub">${a.description || ''}</div>
        <span class="act-tag">${new Date(a.created_at).toLocaleDateString('en-GB')}</span>
      </div>
    </div>`).join('');
}

/* ============================================================
   MINI CALENDAR (dashboard widget)
   ============================================================ */
let calDate = new Date();

function buildCal(){
  const y = calDate.getFullYear(), m = calDate.getMonth();
  document.getElementById('cal-title').textContent = `${MONTHS[m]} ${y}`;
  const first = new Date(y, m, 1);
  const last  = new Date(y, m+1, 0);
  const startDay = (first.getDay() + 6) % 7;
  const apptDays = new Set(allAppts.filter(a => {
    const [ay, am] = a.date.split('-');
    return parseInt(ay) === y && parseInt(am) - 1 === m;
  }).map(a => parseInt(a.date.split('-')[2])));
  const today = new Date();
  let html = '';
  for(let i = 0; i < startDay; i++) html += `<div class="day empty"></div>`;
  for(let d = 1; d <= last.getDate(); d++){
    const isToday = d === today.getDate() && m === today.getMonth() && y === today.getFullYear();
    const hasA = apptDays.has(d);
    html += `<div class="day${isToday?' today':''}${hasA?' has-appt':''}">${d}</div>`;
  }
  document.getElementById('cal-days').innerHTML = html;
  buildTimeline();
}

function buildTimeline(){
  const hours = [8,9,10,11,12,13,14,15,16];
  const todayKey = dateKey(new Date());
  const todays = allAppts.filter(a => a.date === todayKey);
  document.getElementById('timeline').innerHTML = hours.map(h => {
    const evs = todays.filter(a => parseInt(a.time.split(':')[0]) === h);
    const evHTML = evs.length ? evs.map(a => {
      const p = pets.find(x => x.id === a.petId);
      return `<div class="tl-ev ${a.color}">${p ? p.name : 'Pet'} · ${a.type}</div>`;
    }).join('') : `<div class="tl-empty"></div>`;
    return `<div class="tl-row"><span class="tl-hour">${h}:00</span><div class="tl-events">${evHTML}</div></div>`;
  }).join('');
}

function changeMonth(d){ calDate = new Date(calDate.getFullYear(), calDate.getMonth()+d, 1); buildCal(); }
function goToday(){ calDate = new Date(); buildCal(); }

/* ============================================================
   NAVIGATION
   ============================================================ */
function showView(name){
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('view-' + name);
  if(el) el.classList.add('active');
}

function nav(page){
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navEl = document.querySelector(`[data-page="${page}"]`);
  if(navEl) navEl.classList.add('active');
  const titles = { dash:'Dashboard', calendar:'Calendar', pets:'Pets', forum:'Forum', profile:'Profile' };
  document.getElementById('page-title').textContent = titles[page] || '';
  if(page === 'dash')          showView('dash');
  else if(page === 'calendar') { showView('calendar'); initFullCal(); }
  else if(page === 'pets')     { showView('pets'); buildPetsGrid(); }
  else if(page === 'forum')    { showView('forum'); initForum(); }
  else if(page === 'profile')  showView('profile');
}

/* ============================================================
   FULL CALENDAR
   ============================================================ */
let fcDate = new Date();
let mcDate = new Date();
let selectedDay = new Date().getDate();
let calFilterMode = 'today';

function fmtTime(t){ const [h,m] = t.split(':'); const hr = parseInt(h); return `${hr>12?hr-12:hr||12}:${m} ${hr>=12?'PM':'AM'}`; }
function fmtDateLabel(d){
  const days = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
  const ms = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  return `${days[d.getDay()]} ${d.getDate()} ${ms[d.getMonth()]}`;
}

function getFilteredAppts(){
  const today = dateKey(new Date());
  const tmrwDate = new Date(); tmrwDate.setDate(tmrwDate.getDate()+1);
  const tomorrow = dateKey(tmrwDate);
  const typeF = document.getElementById('filter-type')?.value || '';
  const vetF  = document.getElementById('filter-vet')?.value  || '';
  return allAppts.filter(a => {
    if(calFilterMode === 'today' && a.date !== today) return false;
    if(calFilterMode === 'tomorrow' && a.date !== tomorrow) return false;
    const selDate = `${fcDate.getFullYear()}-${String(fcDate.getMonth()+1).padStart(2,'0')}-${String(selectedDay).padStart(2,'0')}`;
    if(calFilterMode === 'all' && a.date !== selDate) return false;
    if(typeF && a.type !== typeF) return false;
    if(vetF && String(a.vet) !== vetF) return false;
    return true;
  });
}

function buildFCSchedule(){
  const hours = [8,9,10,11,12,13,14,15,16,17];
  const filtered = getFilteredAppts();
  const byHour = {};
  filtered.forEach(a => { const h = parseInt(a.time.split(':')[0]); if(!byHour[h]) byHour[h] = []; byHour[h].push(a); });

  const nowHour = new Date().getHours();
  document.getElementById('fc-schedule').innerHTML = hours.map(h => {
    const events = byHour[h] || [];
    const isCurrent = h === nowHour;
    const evHTML = events.map(a => {
      const p = pets.find(x => x.id === a.petId);
      if(!p) return '';
      return `<div class="appt-block color-${a.color}">
        <div class="appt-pet-emo">${renderPetAvatar(p)}</div>
        <div class="appt-block-info">
          <div class="appt-block-name">${p.name}</div>
          <div class="appt-block-sub">${p.breed} · ${p.age}</div>
        </div>
        <div class="appt-block-right">
          <div class="appt-block-time">${fmtTime(a.time)}</div>
          <div class="appt-block-type">${a.type}</div>
        </div>
        <div class="appt-block-menu" title="Options">⋮</div>
      </div>`;
    }).join('');
    return `<div class="schedule-row">
      <div class="schedule-hour">${fmtTime(h+':00')}</div>
      <div class="schedule-slot${isCurrent?' current-hour':''}">
        ${evHTML}
      </div>
    </div>`;
  }).join('');

  const selDate = calFilterMode === 'tomorrow'
    ? (() => { const d = new Date(); d.setDate(d.getDate()+1); return d; })()
    : new Date(fcDate.getFullYear(), fcDate.getMonth(), selectedDay);
  document.getElementById('fc-day-label').textContent = fmtDateLabel(selDate);
  buildFCUpcoming();
}

function buildFCUpcoming(){
  const upcoming = allAppts.slice().sort((a,b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).slice(0,6);
  document.getElementById('fc-upcoming').innerHTML = upcoming.map(a => {
    const p = pets.find(x => x.id === a.petId);
    if(!p) return '';
    const [,m,d] = a.date.split('-');
    return `<div class="upcoming-item">
      <div class="up-emo">${renderPetAvatar(p)}</div>
      <div class="upcoming-info">
        <div class="upcoming-name">${p.name}</div>
        <div class="upcoming-type">${a.type}</div>
      </div>
      <div class="upcoming-date">${d} ${MONTHS[parseInt(m)-1].slice(0,3)}<br>${fmtTime(a.time)}</div>
    </div>`;
  }).join('') || `<p style="color:#6B7280;font-size:13px;padding:8px 0;">No upcoming appointments.</p>`;
}

function buildFCMonthNav(){
  const prev = new Date(fcDate.getFullYear(), fcDate.getMonth()-1, 1);
  const next = new Date(fcDate.getFullYear(), fcDate.getMonth()+1, 1);
  document.getElementById('fc-prev-label').textContent = MONTHS[prev.getMonth()].slice(0,3).toUpperCase();
  document.getElementById('fc-cur-label').textContent  = MONTHS[fcDate.getMonth()].slice(0,3).toUpperCase();
  document.getElementById('fc-next-label').textContent = MONTHS[next.getMonth()].slice(0,3).toUpperCase();
}

function buildMiniCal(){
  const y = mcDate.getFullYear(), m = mcDate.getMonth();
  document.getElementById('mc-title').textContent = `${MONTHS[m]} ${y}`;
  const first = new Date(y,m,1), last = new Date(y,m+1,0);
  const startDay = (first.getDay()+6) % 7;
  const apptDays = new Set(allAppts.filter(a => {
    const [ay,am] = a.date.split('-'); return parseInt(ay) === y && parseInt(am)-1 === m;
  }).map(a => parseInt(a.date.split('-')[2])));
  const today = new Date();
  let html = '';
  for(let i=0;i<startDay;i++) html += `<div class="mday mempty"></div>`;
  for(let d=1; d<=last.getDate(); d++){
    const isTd = d === today.getDate() && m === today.getMonth() && y === today.getFullYear();
    const isSel = d === selectedDay && m === mcDate.getMonth() && y === mcDate.getFullYear();
    const hasA = apptDays.has(d);
    html += `<div class="mday${isTd?' mtoday':''}${isSel&&!isTd?' mselected':''}${hasA?' mhas-appt':''}" onclick="selectDay(${d})">${d}</div>`;
  }
  document.getElementById('mc-days').innerHTML = html;
}

function selectDay(d){
  selectedDay = d;
  fcDate = new Date(mcDate.getFullYear(), mcDate.getMonth(), d);
  calFilterMode = 'all';
  document.querySelectorAll('.cal-filter-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('filt-all').classList.add('active');
  buildMiniCal();
  buildFCSchedule();
}

function fcChangeMonth(dir){
  fcDate = new Date(fcDate.getFullYear(), fcDate.getMonth()+dir, 1);
  mcDate = new Date(fcDate);
  selectedDay = 1;
  buildFCMonthNav();
  buildMiniCal();
  buildFCSchedule();
}

function mcChangeMonth(dir){
  mcDate = new Date(mcDate.getFullYear(), mcDate.getMonth()+dir, 1);
  buildMiniCal();
}

function calFilter(mode){
  calFilterMode = mode;
  document.querySelectorAll('.cal-filter-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('filt-'+mode).classList.add('active');
  buildFCSchedule();
}

function applyFilters(){ buildFCSchedule(); }

function initFullCal(){
  populateVetSelects();
  buildFCMonthNav();
  buildMiniCal();
  buildFCSchedule();
}

/* ============================================================
   MODAL — Nuevo turno
   ============================================================ */
function openModal(){
  populateVetSelects();
  buildPetOptions();
  document.getElementById('f-date').value = dateKey(new Date());
  document.getElementById('f-time').value = '09:00';
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal(){ document.getElementById('modal-overlay').classList.remove('open'); }
function closeModalOutside(e){ if(e.target === document.getElementById('modal-overlay')) closeModal(); }

async function saveAppt(){
  const petId = document.getElementById('f-pet').value;
  const date = document.getElementById('f-date').value;
  const time = document.getElementById('f-time').value;
  const type = document.getElementById('f-type').value;
  const vetId = document.getElementById('f-vet').value || CURRENT_STAFF_ID;
  const notes = document.getElementById('f-notes')?.value.trim() || null;
  if(!petId || !date || !time || !type){ alert('Please complete all required fields.'); return; }

  const isoDateTime = new Date(`${date}T${time}:00`).toISOString();
  const { error } = await supabaseClient.from('appointments').insert({
    pet_id: Number(petId), veterinary_id: CURRENT_VETERINARY_ID, veterinarian_id: vetId ? Number(vetId) : null,
    title: type, appointment_date: isoDateTime, type: APPT_TYPE_LABEL_TO_KEY[type] || 'other',
    status: 'scheduled', notes
  });
  if(error){ console.error('[Doppy] saveAppt', error); alert('Error saving appointment: ' + error.message); return; }

  closeModal();
  await loadAppointmentsFromSupabase();
  buildFCSchedule(); buildMiniCal(); buildAppts(); buildCal();
  alert(`✅ Appointment saved:\n${type} on ${date} at ${time}`);
}

/* ============================================================
   FORUM — comparte las tablas posts/post_likes/post_comments con
   dashboarddu.js. Dar like/comentar queda solo local por ahora:
   esas tablas tienen user_id con FK a users(id_client), que es
   la tabla de DUEÑOS — un veterinario no tiene fila ahí, así que
   escribir de ese lado necesitaría otro ajuste de esquema aparte.
   Publicar posts SÍ es real (posts.author_id no tiene ese problema).
   ============================================================ */
let forumPosts = [];
let forumFilter = { tab:'all', pet:'all', topic:'all' };
let composeType = 'post';
let composeImageData = null;
let dvEvents = [];

async function loadForumPostsFromSupabase(){
  const { data, error } = await supabaseClient
    .from('posts')
    .select('id, author_id, author_type, title, content, image_url, category, post_type, created_at')
    .order('created_at', { ascending:false })
    .limit(30);
  if(error){ console.error('[Doppy] loadForumPostsFromSupabase', error); forumPosts = []; return; }
  const rows = data || [];
  if(!rows.length){ forumPosts = []; return; }

  const ownerIds = [...new Set(rows.filter(r => r.author_type === 'owner').map(r => r.author_id))];
  const staffIds = [...new Set(rows.filter(r => r.author_type === 'staff').map(r => r.author_id))];

  const [ownersRes, staffRes, likesRes, commentsRes] = await Promise.all([
    ownerIds.length ? supabaseClient.from('users').select('id_client, name').in('id_client', ownerIds) : Promise.resolve({ data: [] }),
    staffIds.length ? supabaseClient.from('veterinary_staff').select('id, nombre').in('id', staffIds) : Promise.resolve({ data: [] }),
    supabaseClient.from('post_likes').select('post_id'),
    supabaseClient.from('post_comments').select('post_id')
  ]);

  const ownerMap = {}; (ownersRes.data || []).forEach(u => { ownerMap[u.id_client] = u.name; });
  const staffMap = {}; (staffRes.data || []).forEach(s => { staffMap[s.id] = s.nombre; });
  const likeCounts = {}; (likesRes.data || []).forEach(l => { likeCounts[l.post_id] = (likeCounts[l.post_id]||0)+1; });
  const commentCounts = {}; (commentsRes.data || []).forEach(c => { commentCounts[c.post_id] = (commentCounts[c.post_id]||0)+1; });

  forumPosts = rows.map(r => {
    const isStaff = r.author_type === 'staff';
    const authorName = isStaff ? (staffMap[r.author_id] || 'Veterinarian') : (ownerMap[r.author_id] || 'Community member');
    const badge = r.post_type === 'tip' ? 'vet' : (r.post_type === 'event' ? 'event' : 'community');
    const badgeLabel = r.post_type === 'tip' ? 'Veterinary Tip' : (r.post_type === 'event' ? 'Event' : 'Community');
    return {
      id: r.id, author: authorName, role: isStaff ? 'Veterinarian' : 'Pet owner',
      clinic: isStaff ? currentStaffContext.clinicName : 'Community',
      initials: getInitials(authorName) || '—', color: isStaff ? '#3B82F6' : '#10B981',
      time: timeAgoDv(r.created_at), badge, badgeLabel, type: r.post_type || 'community',
      title: r.title, body: r.content || '', img: r.image_url ? '🖼️' : '',
      likes: likeCounts[r.id] || 0, comments: commentCounts[r.id] || 0,
      petFilter: 'all', topic: r.category || 'all', saved: false, liked: false
    };
  });
}

async function loadEventsFromSupabase(){
  const { data, error } = await supabaseClient
    .from('events').select('id, title, description, event_date, location, category')
    .order('event_date', { ascending:true }).limit(3);
  if(error){ console.error('[Doppy] loadEventsFromSupabase', error); dvEvents = []; return; }
  dvEvents = data || [];
}

function buildForumEvents(){
  const el = document.getElementById('dv-upcoming-events');
  if(!el) return;
  if(!dvEvents.length){
    el.innerHTML = `<p style="color:#6B7280;font-size:13px;">No upcoming events yet.</p>`;
    return;
  }
  el.innerHTML = dvEvents.map(e => `
    <div class="event-card">
      <div class="event-img">🎉</div>
      <div class="event-body">
        <div class="event-title">${e.title}</div>
        <div class="event-meta">📅 ${new Date(e.event_date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}<br>📍 ${e.location || '—'}</div>
      </div>
    </div>`).join('');
}

function buildTrending(){
  const tips = forumPosts.filter(p => p.badge === 'vet').sort((a,b) => b.likes - a.likes).slice(0,5);
  const el = document.getElementById('trending-list');
  if(!el) return;
  el.innerHTML = tips.length ? tips.map((t,i) => `
    <div class="trending-item" style="cursor:pointer" onclick="openForumPostDetail(${t.id})">
      <div class="trending-num">${i+1}</div>
      <span class="trending-text">${t.title}</span>
    </div>`).join('') : `<p style="color:#6B7280;font-size:13px;padding:8px 0;">No vet tips posted yet.</p>`;
}

function openForumPostDetail(id){
  const el = document.getElementById('post-' + id);
  if(el) setTimeout(() => el.scrollIntoView({ behavior:'smooth', block:'center' }), 50);
}

function buildPosts(){
  let posts = forumPosts.slice();
  if(forumFilter.tab === 'vet')       posts = posts.filter(p => p.badge === 'vet');
  if(forumFilter.tab === 'community') posts = posts.filter(p => p.badge === 'community');
  if(forumFilter.tab === 'events')    posts = posts.filter(p => p.badge === 'event');

  const badgeMap = { vet:'pb-vet', community:'pb-community', event:'pb-event' };
  const el = document.getElementById('posts-container');
  if(!el) return;

  el.innerHTML = posts.map(p => {
    const hasImg = p.img;
    return `<div class="post-card" id="post-${p.id}">
      <div class="post-header">
        <div class="post-avatar" style="background:${p.color}">${p.initials}</div>
        <div>
          <div class="post-author-name">${p.author} ${p.badge==='vet'?'✓':''}
            <span class="post-badge ${badgeMap[p.badge]||'pb-community'}">${p.badgeLabel}</span>
          </div>
          <div class="post-meta">${p.clinic} · ${p.time}</div>
        </div>
        <button class="post-menu" onclick="postMenu(${p.id})">⋮</button>
      </div>
      ${hasImg?`<div class="post-img">${p.img}</div>`:''}
      <div class="post-body">
        <strong>${p.title}</strong>
        ${p.body.replace(/\n/g,'<br>')}
      </div>
      <div class="post-footer">
        <button class="post-action${p.liked?' liked':''}" onclick="toggleLike(${p.id})">
          <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          <span id="likes-${p.id}">${p.likes}</span>
        </button>
        <button class="post-action" onclick="toggleComments(${p.id})">
          <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          ${p.comments}
        </button>
        <button class="post-action post-action-save${p.saved?' liked':''}" onclick="toggleSave(${p.id})">
          <svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
          ${p.saved?'Saved':'Save'}
        </button>
        <button class="post-action" onclick="sharePost(${p.id})">
          <svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          Share
        </button>
      </div>
      <div id="comments-${p.id}" style="display:none;margin-top:10px;border-top:1px solid #F3F4F6;padding-top:10px">
        <div style="font-size:12px;color:#6B7280;margin-bottom:8px">Comments (local preview only — see note in code)</div>
        <div id="comments-list-${p.id}"></div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <div class="compose-avatar" style="width:28px;height:28px;font-size:11px">${getInitials(currentStaffContext.name)||'VS'}</div>
          <input type="text" placeholder="Write a comment..." style="flex:1;border:1px solid #E5E7EB;border-radius:8px;padding:6px 10px;font-size:12px;outline:none;font-family:inherit" id="comment-input-${p.id}" onkeydown="if(event.key==='Enter')addComment(${p.id})"/>
          <button onclick="addComment(${p.id})" style="padding:6px 12px;background:#3B82F6;color:#fff;border:none;border-radius:8px;font-size:12px;cursor:pointer;font-weight:600">Send</button>
        </div>
      </div>
    </div>`;
  }).join('') || `<p style="color:#6B7280;font-size:13px;padding:12px;">No posts yet.</p>`;
}

function toggleLike(id){
  const p = forumPosts.find(x => x.id === id);
  p.liked = !p.liked; p.likes += p.liked ? 1 : -1;
  const btn = document.querySelector(`#post-${id} .post-action`);
  btn.classList.toggle('liked', p.liked);
  document.getElementById(`likes-${id}`).textContent = p.likes;
}
function toggleSave(id){
  const p = forumPosts.find(x => x.id === id); p.saved = !p.saved;
  buildPosts();
}
function sharePost(id){
  navigator.clipboard?.writeText(window.location.href+'#post-'+id).catch(()=>{});
  alert('Link copied to clipboard! 🔗');
}
function postMenu(id){
  alert('Options:\nReport post\nHide post\nCopy link');
}
function toggleComments(id){
  const el = document.getElementById(`comments-${id}`);
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}
function addComment(id){
  const input = document.getElementById(`comment-input-${id}`);
  const text = input.value.trim(); if(!text) return;
  const list = document.getElementById(`comments-list-${id}`);
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:flex-start';
  div.innerHTML = `<div class="compose-avatar" style="width:26px;height:26px;font-size:10px;flex-shrink:0">${getInitials(currentStaffContext.name)||'VS'}</div>
    <div style="background:#F9FAFB;border-radius:8px;padding:6px 10px;flex:1">
      <div style="font-size:11px;font-weight:600;margin-bottom:2px">${currentStaffContext.name || 'Veterinarian'}</div>
      <div style="font-size:12px;color:#374151">${text}</div>
    </div>`;
  list.appendChild(div);
  const p = forumPosts.find(x => x.id === id); p.comments++;
  input.value = '';
}

function setFeedTab(el, tab){
  document.querySelectorAll('.ftab').forEach(t => t.classList.remove('active'));
  el.classList.add('active'); forumFilter.tab = tab; buildPosts();
}

function autoResize(el){ el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }

function handleImageUpload(e){
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    composeImageData = ev.target.result;
    document.getElementById('img-preview-area').innerHTML = `
      <div style="position:relative;margin-top:8px">
        <img src="${ev.target.result}" style="width:100%;max-height:180px;object-fit:cover;border-radius:8px;border:1px solid #E5E7EB"/>
        <button onclick="removeImage()" style="position:absolute;top:6px;right:6px;width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,.5);color:#fff;border:none;font-size:14px;cursor:pointer;line-height:1">×</button>
      </div>`;
  };
  reader.readAsDataURL(file);
}
function removeImage(){ composeImageData = null; document.getElementById('img-preview-area').innerHTML = ''; }

async function submitPost(){
  const title = document.getElementById('compose-title').value.trim();
  const text = document.getElementById('compose-text').value.trim();
  if(!title){ alert('Add a title for your post.'); return; }
  if(!text){ alert('Write something before posting.'); return; }
  if(!CURRENT_STAFF_ID){ alert('No active session — sign in to post.'); return; }

  const typeMap = { tip:'tip', event:'event', poll:'poll', post:'community' };
  const postType = typeMap[composeType] || 'community';

  const { error } = await supabaseClient.from('posts').insert({
    author_id: CURRENT_STAFF_ID, author_type: 'staff', title, content: text,
    image_url: null, category: 'General', post_type: postType
  });
  if(error){ console.error('[Doppy] submitPost', error); alert('Error publishing post: ' + error.message); return; }

  document.getElementById('compose-title').value = '';
  document.getElementById('compose-text').value = '';
  removeImage(); composeType = 'post';
  forumFilter.tab = 'all';
  document.querySelectorAll('.ftab').forEach(t => t.classList.remove('active'));
  document.querySelector('.ftab').classList.add('active');
  await loadForumPostsFromSupabase();
  buildPosts();
  buildTrending();
  document.getElementById('forum-feed').scrollTo({ top:0, behavior:'smooth' });
}

function openForumPost(){
  document.getElementById('compose-title').focus();
  document.getElementById('forum-feed').scrollTo({ top:0, behavior:'smooth' });
}

function showComingSoon(){ alert('Coming soon! This feature will be available in the next version.'); }

function initForum(){ buildTrending(); buildPosts(); buildForumEvents(); }

/* ============================================================
   BOOT
   ============================================================ */
async function bootDv(){
  await loadCurrentStaffContext();
  initAccountView();

  await Promise.all([
    loadPetsFromSupabase(),
    loadClinicStaffFromSupabase(),
    loadEventsFromSupabase(),
    loadForumPostsFromSupabase()
  ]);
  await loadAppointmentsFromSupabase();
  await Promise.all([
    loadRemindersFromSupabase(),
    loadClinicalRecordsCount(),
    loadRecentActivityFromSupabase()
  ]);

  buildAppts();
  buildReminders();
  buildCal();
  initFullCal();
  renderDashboardStats();
  buildRecentActivity();
  buildTrending();
  buildForumEvents();
}

bootDv();