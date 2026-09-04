/* =========================================================================
   SUPABASE CONFIGURATION
   ========================================================================= */
const SUPABASE_URL = 'https://xyiebwrjkmvmcpdhenjk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5aWVid3Jqa212bWNwZGhlbmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NDc3OTMsImV4cCI6MjA5NzEyMzc5M30.ABcKRjoz9Cd5lSngSON8BblpBpljcPaZk-8lfh91RU8';

/* --- Defensive Supabase client creation ---
   Previously this assumed window.supabase already existed and called
   window.supabase.createClient(...) directly. If the Supabase CDN <script>
   doesn't load in time (blocked network, adblocker, CSP, artifact preview,
   etc.), window.supabase stays undefined and that call throws an unhandled
   TypeError on the first executable line of the script. Since it's a
   top-level error, it stopped execution of the ENTIRE rest of the file:
   renderMyPets(), renderSchedule(), renderNotifications(), renderCalendar(),
   renderPosts(), showView(...), loadAllDataFromSupabase(), etc. never ran.
   That's why nothing rendered. Now it's wrapped in try/catch and checks that
   window.supabase exists before using it, so the rest of the script keeps
   running with mock data in memory if Supabase isn't available. */
let supabaseClient = null;
try {
  if (typeof window.supabase !== 'undefined'
      && !SUPABASE_URL.includes('TU-PROYECTO')
      && !SUPABASE_ANON_KEY.includes('TU-ANON-KEY')) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    console.warn('[Doppy] Supabase SDK not available or credentials not configured — using mock data.');
  }
} catch (err) {
  console.error('[Doppy] Error initializing Supabase, mock data will be used:', err);
}

const USE_SUPABASE = !!supabaseClient;

/* =========================================================================
   CURRENT CLIENT IDENTIFICATION (auth.users -> users.auth_user_id -> id_client)
   ========================================================================= */
let currentClientId = null; // id_client (int4) from the "users" table

async function getCurrentClientId(){
  if(!USE_SUPABASE) return null;
  try{
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if(authError || !user){
      console.warn('[Doppy] No active session yet.', authError);
      return null;
    }

    let { data, error } = await supabaseClient
      .from('users')
      .select('id_client')
      .eq('auth_user_id', user.id)
      .single();

    if(error || !data){
      console.warn('[Doppy] No record in "users" for this auth_user_id yet, creating one now.');
      const { data: inserted, error: insertErr } = await supabaseClient
        .from('users')
        .insert([{ auth_user_id: user.id, name: user.email ? user.email.split('@')[0] : 'User', email: user.email }])
        .select('id_client')
        .single();
      if(insertErr || !inserted){
        console.error('[Doppy] Could not create record in "users":', insertErr);
        return null;
      }
      data = inserted;
    }
    return data.id_client;
  }catch(err){
    console.error('[Doppy] Error getting current client:', err);
    return null;
  }
}

function setDbStatus(state, text){
  const el = document.getElementById('dbStatus');
  const txt = document.getElementById('dbStatusText');
  el.classList.remove('ok','err');
  if(state) el.classList.add(state);
  txt.textContent = text;
  el.title = text;
}

/* ---- Helpers compartidos para mapear columnas reales de Supabase ---- */
function splitDateTime(iso){
  const d = new Date(iso);
  return {
    date: d.toISOString().slice(0, 10),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  };
}
const APPT_TYPE_ICON = {
  vaccination: '💉', consultation: '🩺', review: '🔎', grooming: '✂️',
  dermatology: '🧴', deworming: '💊', checkup: '🩺', other: '📌'
};
function timeAgo(iso){
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if(mins < 1) return 'Just now';
  if(mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if(hrs < 24) return hrs + 'h ago';
  return Math.floor(hrs / 24) + 'd ago';
}

/* =========================================================================
   CALENDAR (Schedule + Upcoming Events) — tablas reales: appointments, events
   ========================================================================= */
let communityEventsAll = [];   // todos los eventos públicos (para "descubrir")
let rsvpedEventIds = new Set(); // a cuáles ya dijo "agregar a mi calendario"

async function loadCalendarDataFromSupabase(){
  let apptRows = [];
  const petIds = pets.map(p => p.id);
  if(petIds.length){
    const { data, error } = await supabaseClient
      .from('appointments')
      .select('id, pet_id, title, appointment_date, type, status')
      .in('pet_id', petIds)
      .order('appointment_date', { ascending: true });
    if(error) console.warn('[Doppy][Supabase] Could not load appointments:', error);
    else apptRows = data || [];
  }

  const { data: eventRows, error: evErr } = await supabaseClient
    .from('events')
    .select('id, title, description, event_date, location, category')
    .order('event_date', { ascending: true })
    .limit(30);
  if(evErr) console.warn('[Doppy][Supabase] Could not load events:', evErr);
  communityEventsAll = eventRows || [];

  // Qué eventos agregó este dueño a SU calendario (opt-in, no automático).
  rsvpedEventIds = new Set();
  if(currentClientId && communityEventsAll.length){
    const { data: rsvps, error: rsvpErr } = await supabaseClient
      .from('event_rsvps').select('event_id').eq('user_id', currentClientId);
    if(rsvpErr) console.warn('[Doppy][Supabase] Could not load event_rsvps:', rsvpErr);
    else (rsvps || []).forEach(r => rsvpedEventIds.add(r.event_id));
  }

  const mappedAppts = apptRows.map(r => {
    const { date, time } = splitDateTime(r.appointment_date);
    return { id: 'appt-' + r.id, date, title: r.title, time, place: '—', type: 'appointment', icon: APPT_TYPE_ICON[r.type] || '🩺' };
  });
  // Solo se agregan al calendario personal los eventos públicos que el
  // dueño explícitamente agregó (RSVP) — no todos los eventos existentes.
  const mappedRsvpedEvents = communityEventsAll
    .filter(r => rsvpedEventIds.has(r.id))
    .map(r => {
      const { date, time } = splitDateTime(r.event_date);
      return { id: 'evt-' + r.id, date, title: r.title, time, place: r.location || '—', type: 'event', icon: '🎉' };
    });

  events = [...mappedAppts, ...mappedRsvpedEvents];
  appointments = apptRows.map(r => ({
    id: r.id,
    date: new Date(r.appointment_date).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
    label: r.title
  }));
}

async function rsvpToEvent(eventId){
  if(!currentClientId){ showToast('Sign in to add events to your calendar'); return; }
  if(rsvpedEventIds.has(eventId)){
    // ya lo tenía agregado -> lo saca
    const { error } = await supabaseClient.from('event_rsvps').delete().eq('event_id', eventId).eq('user_id', currentClientId);
    if(error){ console.error('[Doppy][Supabase] Error removing RSVP:', error); showToast('Could not update your calendar'); return; }
    showToast('Removed from your calendar');
  } else {
    const { error } = await supabaseClient.from('event_rsvps').insert({ event_id: eventId, user_id: currentClientId });
    if(error){ console.error('[Doppy][Supabase] Error saving RSVP:', error); showToast('Could not add to your calendar'); return; }
    showToast('🎉 Added to your calendar');
  }
  await loadCalendarDataFromSupabase();
  renderCalendar();
  renderUpcoming();
}

/* =========================================================================
   PET WALL (posts) — tabla real: posts (+ post_likes, post_comments, post_saves)
   Los likes/comentarios no son columnas contadoras: se cuentan desde sus
   tablas propias. El autor puede ser un dueño (users) o un veterinario
   (veterinary_staff), según posts.author_type.
   ========================================================================= */
async function loadPostsFromSupabase(){
  const { data, error } = await supabaseClient
    .from('posts')
    .select('id, author_id, author_type, title, content, image_url, category, post_type, created_at')
    .order('created_at', { ascending: false })
    .limit(30);
  if(error){ console.warn('[Doppy][Supabase] Could not load posts:', error); return; }
  const rows = data || [];
  if(!rows.length){ posts = []; return; }

  const ownerIds = [...new Set(rows.filter(r => r.author_type === 'owner').map(r => r.author_id))];
  const staffIds = [...new Set(rows.filter(r => r.author_type === 'staff').map(r => r.author_id))];

  const [ownersRes, staffRes, likesRes, commentsRes] = await Promise.all([
    ownerIds.length ? supabaseClient.from('users').select('id_client, name').in('id_client', ownerIds) : Promise.resolve({ data: [] }),
    staffIds.length ? supabaseClient.from('veterinary_staff').select('id, nombre').in('id', staffIds) : Promise.resolve({ data: [] }),
    supabaseClient.from('post_likes').select('post_id'),
    supabaseClient.from('post_comments').select('post_id')
  ]);

  const ownerNameMap = {}; (ownersRes.data || []).forEach(u => { ownerNameMap[u.id_client] = u.name; });
  const staffNameMap = {}; (staffRes.data || []).forEach(s => { staffNameMap[s.id] = s.nombre; });
  const likeCounts = {}; (likesRes.data || []).forEach(l => { likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1; });
  const commentCounts = {}; (commentsRes.data || []).forEach(c => { commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1; });

  let myLikes = new Set(), mySaves = new Set();
  if(currentClientId){
    const [likedRes, savedRes] = await Promise.all([
      supabaseClient.from('post_likes').select('post_id').eq('user_id', currentClientId),
      supabaseClient.from('post_saves').select('post_id').eq('user_id', currentClientId)
    ]);
    myLikes = new Set((likedRes.data || []).map(x => x.post_id));
    mySaves = new Set((savedRes.data || []).map(x => x.post_id));
  }

  const POST_TAGS = {
    tip: { label: 'Veterinary Tip', bg: 'var(--blue-pale)', color: 'var(--blue-mid)' },
    community: { label: 'Community', bg: '#e6f8ee', color: '#1c8a52' },
    event: { label: 'Event', bg: '#fde3e9', color: '#c23662' },
    poll: { label: 'Poll', bg: '#fdf1d3', color: '#8a6d18' }
  };

  posts = rows.map(r => {
    const authorName = r.author_type === 'staff' ? (staffNameMap[r.author_id] || 'Veterinarian') : (ownerNameMap[r.author_id] || 'Community member');
    const tagInfo = POST_TAGS[r.post_type] || POST_TAGS.community;
    return {
      id: r.id,
      author: authorName,
      avatar: r.author_type === 'staff' ? '👨‍⚕️' : '👤',
      time: timeAgo(r.created_at),
      tag: tagInfo.label, tagBg: tagInfo.bg, tagColor: tagInfo.color,
      category: r.category || 'General',
      img: r.image_url || 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=400&q=80',
      title: r.title,
      text: r.content || '',
      more: null,
      likes: likeCounts[r.id] || 0,
      comments: commentCounts[r.id] || 0,
      liked: myLikes.has(r.id),
      saved: mySaves.has(r.id)
    };
  });
}

/* =========================================================================
   VACCINATION CARD (Dashboard) — tabla real: vaccination_record
   ========================================================================= */
async function loadVaccinationCardFromSupabase(){
  const pet = getProfileSelectedPet();
  const bars = { Rabies: 0, Distemper: 0, Parvovirus: 0, Bordetella: 0 };
  if(pet && USE_SUPABASE){
    try{
      const { data, error } = await supabaseClient
        .from('vaccination_record')
        .select('vaccine_name, dose_number')
        .eq('pet_id', pet.id);
      if(!error && data){
        data.forEach(r => {
          const key = Object.keys(bars).find(k => (r.vaccine_name || '').toLowerCase().includes(k.toLowerCase()));
          if(key) bars[key] = Math.max(bars[key], r.dose_number || 1);
        });
      } else if(error){
        console.warn('[Doppy][Supabase] Could not load vaccination_record:', error);
      }
    }catch(err){ console.warn('[Doppy][Supabase] Error loading vaccination card:', err); }
  }
  renderVaccinationCard(bars);
}

function renderVaccinationCard(bars){
  const barsEl = document.querySelector('#view-dashboard .bars');
  if(!barsEl) return;
  const maxScale = 2.5; // coincide con el eje Y del gráfico (0 a 2.5 dosis)
  const colors = { Rabies: '#7ee0f0', Distemper: '#4fc3e8', Parvovirus: '#2e86d6', Bordetella: '#1e5fa8' };
  const groupsHtml = Object.keys(colors).map(name => {
    const pct = Math.min(100, (bars[name] / maxScale) * 100);
    return `<div class="bar-group"><div class="bar" style="height:${pct}%;background:${colors[name]}"></div><div class="bar-label">${name}</div></div>`;
  }).join('');
  barsEl.innerHTML = `<div class="y-axis"><span>2.5</span><span>2.0</span><span>1.5</span><span>1.0</span><span>0.5</span><span>0.0</span></div>${groupsHtml}`;
}

/* =========================================================================
   IN-MEMORY DATA (mock, used as fallback if Supabase isn't configured)
   ========================================================================= */
let pets = [
  {id:1, name:'Bruno', species:'🐕', breed:'Golden Retriever', gender:'♂', age:'2 years old', primary:true, photo:null, allergies:'Penicillin'},
  {id:2, name:'Luna', species:'🐈', breed:'Tabby', gender:'♀', age:'1 year old', primary:false, photo:null, allergies:null}
];

let appointments = [
  {id:1, date:'Feb 05, 2025', label:'Leo\'s Checkup Appointment'},
  {id:2, date:'Feb 16, 2025', label:'Leo\'s Grooming Session'},
  {id:3, date:'Mar 02, 2025', label:'Vaccine booster'}
];

let events = [
  // date in YYYY-MM-DD format so the calendar can place them
  {id:1, date:'2025-01-05', title:'Leo\'s Checkup Appointment', time:'9:00 AM', place:'Happy Paws Clinic', type:'appointment', icon:'🩺'},
  {id:2, date:'2025-01-22', title:'Pet Summer Festival', time:'10:00 AM', place:'Central Park', type:'event', icon:'🐾'},
  {id:3, date:'2025-01-16', title:'Leo\'s Grooming Session', time:'11:00 AM', place:'Happy Paws Grooming', type:'appointment', icon:'✂️'},
  {id:4, date:'2025-01-28', title:'Vaccination Booster', time:'3:00 PM', place:'Happy Paws Clinic', type:'appointment', icon:'💉'},
  {id:5, date:'2025-01-30', title:'Pet Training Workshop', time:'5:00 PM', place:'Community Center', type:'event', icon:'🎓'}
];

let notifications = [
  {id:1, title:'New Training Tip', desc:'Teach your dog a new trick with positive reinforcement. Start with short sessions!', time:'10:30 AM', tag:'Tip', tagBg:'#ece9fb', tagColor:'#5b4fd6', icon:'🐾', iconBg:'#6b5ce0', unread:true},
  {id:2, title:'Luna\'s Grooming Reminder', desc:'Don\'t forget Luna\'s grooming appointment tomorrow.', time:'9:15 AM', tag:'Reminder', tagBg:'#fdf1d3', tagColor:'#8a6d18', icon:'🐶', iconBg:'#f4c430', unread:true},
  {id:3, title:'Upcoming Event', desc:'Pet Adoption Weekend is this Saturday!', time:'Yesterday', tag:'Event', tagBg:'#fde3e9', tagColor:'#c23662', icon:'🎆', iconBg:'#f0507a', unread:false}
];

let posts = [
  {id:1, author:'María González', avatar:'👩', time:'2h ago', tag:'Pet Care Tips', tagBg:'#e6f8ee', tagColor:'#1c8a52', category:'Health',
   img:'https://images.unsplash.com/photo-1552053831-71594a27632d?w=400&q=80', title:'What to do if your dog has a minor cut 🩹',
   text:'Minor cuts are common in dogs, especially during walks or outdoor play. Here are the basic steps you can take at home to keep your pet safe.',
   more:'Clean the wound gently with saline solution, apply a pet-safe antiseptic, and keep an eye on it for signs of infection over the next 48 hours. If it does not close or your pet keeps licking it, visit your vet.',
   likes:128, comments:24, liked:false, saved:false},
  {id:2, author:'Carlos Ramírez', avatar:'👨', time:'4h ago', tag:'Community', tagBg:'var(--blue-pale)', tagColor:'var(--blue-mid)', category:'New Events',
   img:'https://images.unsplash.com/photo-1612195583950-b8fd34c87093?w=400&q=80', title:'Meet Bruno! 🐾',
   text:'Today we celebrated Bruno\'s 1st birthday! He\'s the most energetic and loving companion. Grateful for every moment with him 💙 #BrunoTheCorgi',
   more:null, likes:95, comments:18, liked:false, saved:false},
  {id:3, author:'Lucía Fernández', avatar:'👩', time:'6h ago', tag:'Training', tagBg:'#fdf1d3', tagColor:'#8a6d18', category:'Training',
   img:'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=400&q=80', title:'How to teach your dog to bring the ball back 🎾',
   text:'Positive reinforcement and patience are key. Here are some simple steps that really work.',
   more:'Start in a distraction-free space, reward every partial return with a treat, and slowly increase distance. Consistency across short daily sessions beats long occasional ones.',
   likes:61, comments:9, liked:false, saved:false}
];

let vaccinations = [
  {name:'Rabies', applied:'03/12/24', next:'03/12/25', status:'ontime'},
  {name:'Distemper', applied:'01/20/24', next:'01/20/25', status:'ontime'},
  {name:'Parvovirus', applied:'06/02/23', next:'06/02/24', status:'lost'}
];

let calState = { year:2025, month:0 }; // month 0 = January (Date uses 0-index)
let notifPrefs = { email:true, push:true, sms:false };
let privacyPrefs = { profileVisible:true, shareLocation:false };

/* ---- Emergency: data and state ---- */
let emergencyClinics = [
  {id:1, name:'Happy Paws Veterinary Hospital', status:'open', h24:true, distance:'2.1 km', time:'6 min drive', species:'Dogs · Cats · Rabbits', rating:'4.8 (128)', phone:'(507) 123-4567'},
  {id:2, name:'Animal Care Colón', status:'open', h24:false, distance:'3.5 km', time:'9 min drive', species:'Dogs · Cats', rating:'4.6 (94)', phone:'(507) 234-5678'},
  {id:3, name:'Pet Life Clinic', status:'open', h24:false, distance:'4.2 km', time:'12 min drive', species:'Dogs · Cats · Birds', rating:'4.5 (76)', phone:'(507) 345-6789'},
  {id:4, name:'Colón Vet Center', status:'closed', h24:false, distance:'5.1 km', time:'15 min drive', species:'Dogs · Cats', rating:'4.3 (52)', phone:'(507) 456-7890'}
];
let emergencyState = { selectedPetId: pets[0]?.id || null, selectedClinicId: emergencyClinics[0]?.id || null };

/* =========================================================================
   VIEW NAVIGATION
   ========================================================================= */
const searchPlaceholders = {
  dashboard: null,
  profile: null,
  notifications: null,
  petprofile: 'Search the community',
  calendar: 'Search for events, appointments',
  petwall: 'Search the community',
  emergency: null
};

function showView(name, navEl){
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if(navEl){ navEl.classList.add('active'); }
  else {
    const match = document.querySelector('.nav-item[data-view="' + name + '"]');
    if(match) match.classList.add('active');
  }

  const searchBox = document.getElementById('searchBox');
  const placeholder = searchPlaceholders[name];
  const searchInput = document.getElementById('searchInput');
  if(placeholder){
    searchBox.style.display = 'flex';
    searchInput.placeholder = placeholder;
    searchInput.value = '';
  } else {
    searchBox.style.display = 'none';
  }

  if(name === 'notifications'){
    // when opening notifications, mark them as seen (same as WhatsApp/Gmail on entry)
    document.getElementById('bellBadge').style.display = 'none';
  }

  if(name === 'emergency'){
    renderEmergencyPets();
    renderEmergencyClinics();
    ensureEmergencyMap();
    renderShareQr();
  }

  sidebar.classList.remove('open');
  overlay.classList.remove('show');
  closeAvatarMenu();
  window.scrollTo(0,0);
}

/* ---------- Responsive menu (mobile sidebar) ---------- */
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menuToggle');
const overlay = document.getElementById('overlay');
menuToggle.addEventListener('click', () => {
  sidebar.classList.toggle('open');
  overlay.classList.toggle('show');
});
overlay.addEventListener('click', () => {
  sidebar.classList.remove('open');
  overlay.classList.remove('show');
});

/* ---------- Avatar dropdown ---------- */
document.getElementById('avatarBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('avatarMenu').classList.toggle('show');
});
function closeAvatarMenu(){ document.getElementById('avatarMenu').classList.remove('show'); }
document.addEventListener('click', (e) => {
  if(!e.target.closest('.avatar-dropdown')) closeAvatarMenu();
  if(!e.target.closest('.dropdown-wrap')) document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
});
document.getElementById('bellBtn').addEventListener('click', () => showView('notifications'));

function handleLogout(){
  closeAvatarMenu();
  if(USE_SUPABASE){
    supabaseClient.auth.signOut().catch(err => console.error('[Doppy][Supabase] Error signing out:', err));
  }
  currentClientId = null;
  showToast('Signed out');
}

/* =========================================================================
   TOAST
   ========================================================================= */
let toastTimer;
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* =========================================================================
   DARK MODE
   ========================================================================= */
function toggleDarkMode(){
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  const label = document.getElementById('appearanceValue');
  if(label) label.textContent = isDark ? 'Dark' : 'Light';
  showToast(isDark ? 'Dark mode enabled' : 'Light mode enabled');
  // TODO: persist preference in users_settings.tema
}

/* =========================================================================
   CONFIRMATION BEFORE ENTERING EMERGENCY MODE
   ========================================================================= */
function confirmEmergency(navEl){
  openModal(`
    <div style="text-align:center;">
      <div style="width:56px;height:56px;border-radius:50%;background:#fde8e8;display:flex;align-items:center;justify-content:center;font-size:26px;margin:0 auto 14px;">🚨</div>
      <h3 style="justify-content:center; color:#dc2626;">Are you sure this is an emergency?</h3>
      <p style="font-size:13.5px; color:var(--text-muted); margin:-8px 0 20px;">This will activate Emergency Mode and immediately show you the nearest veterinary clinics.</p>
      <div class="modal-actions" style="justify-content:center;">
        <button class="btn-secondary" onclick="closeModal()">No, cancel</button>
        <button class="btn-danger" onclick="closeModal(); showView('emergency', document.querySelector('[data-view=emergency]'));">Yes, it's an emergency</button>
      </div>
    </div>
  `);
}

/* =========================================================================
   GENERIC MODAL
   ========================================================================= */
function openModal(html){
  document.getElementById('modalBox').innerHTML = html;
  document.getElementById('modalOverlay').classList.add('show');
}
function closeModal(){
  document.getElementById('modalOverlay').classList.remove('show');
  stopQrScanner();
}
document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if(e.target.id === 'modalOverlay') closeModal();
});

/* =========================================================================
   VETERINARY CLINIC AFFILIATION (scan QR or enter code)
   ========================================================================= */
let affQrStream = null;
let affQrRafId = null;

function openAffiliateModal(){
  openModal(`
    <h3>📷 Affiliate veterinary clinic</h3>
    <div class="filter-tabs" style="margin-bottom:16px;">
      <button class="filter-tab active" id="affTabQr" onclick="switchAffiliateTab('qr')">Scan QR</button>
      <button class="filter-tab" id="affTabCode" onclick="switchAffiliateTab('code')">Enter code</button>
    </div>

    <div id="affQrPane">
      <div style="position:relative; border-radius:14px; overflow:hidden; background:#000; min-height:240px; display:flex; align-items:center; justify-content:center;">
        <video id="affQrVideo" autoplay playsinline muted style="width:100%; max-height:280px; object-fit:cover; display:block;"></video>
      </div>
      <p id="affQrStatus" style="font-size:12.5px; color:var(--text-muted); margin:10px 0 0;">Point the camera at the clinic's QR code.</p>
    </div>

    <div id="affCodePane" style="display:none;">
      <div class="form-group">
        <label>Affiliation code</label>
        <input id="affCodeInput" placeholder="e.g. DOPPY-9X7K-2L1M" style="text-transform:uppercase;">
      </div>
      <button class="btn-outline" style="width:100%; justify-content:center; display:flex; margin-bottom:6px;" onclick="pasteAffiliationCode()">📋 Paste from clipboard</button>
    </div>

    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeAffiliateModal()">Cancel</button>
      <button class="btn-primary" id="affSubmitBtn" style="display:none;" onclick="submitAffiliationFromInput()">Affiliate</button>
    </div>
  `);
  switchAffiliateTab('qr');
}

function switchAffiliateTab(tab){
  const qrPane = document.getElementById('affQrPane');
  const codePane = document.getElementById('affCodePane');
  const qrTab = document.getElementById('affTabQr');
  const codeTab = document.getElementById('affTabCode');
  const submitBtn = document.getElementById('affSubmitBtn');
  if(!qrPane || !codePane) return;

  if(tab === 'qr'){
    qrPane.style.display = 'block';
    codePane.style.display = 'none';
    qrTab.classList.add('active');
    codeTab.classList.remove('active');
    submitBtn.style.display = 'none';
    startQrScanner();
  } else {
    qrPane.style.display = 'none';
    codePane.style.display = 'block';
    qrTab.classList.remove('active');
    codeTab.classList.add('active');
    submitBtn.style.display = 'inline-flex';
    stopQrScanner();
  }
}

async function startQrScanner(){
  stopQrScanner();
  const video = document.getElementById('affQrVideo');
  const statusEl = document.getElementById('affQrStatus');
  if(!video) return;
  try{
    affQrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = affQrStream;
    await video.play();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const tick = () => {
      if(!affQrStream) return;
      if(video.readyState === video.HAVE_ENOUGH_DATA){
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = (typeof jsQR === 'function') ? jsQR(imageData.data, imageData.width, imageData.height) : null;
        if(code && code.data){
          if(statusEl) statusEl.textContent = 'Code detected, affiliating...';
          processAffiliationCode(code.data.trim());
          return;
        }
      }
      affQrRafId = requestAnimationFrame(tick);
    };
    affQrRafId = requestAnimationFrame(tick);
  }catch(err){
    console.error('[Doppy] Could not access the camera:', err);
    if(statusEl) statusEl.textContent = 'Could not access the camera. Use "Enter code" instead.';
  }
}

function stopQrScanner(){
  if(affQrRafId){ cancelAnimationFrame(affQrRafId); affQrRafId = null; }
  if(affQrStream){
    affQrStream.getTracks().forEach(t => t.stop());
    affQrStream = null;
  }
}

function closeAffiliateModal(){
  stopQrScanner();
  closeModal();
}

function pasteAffiliationCode(){
  if(navigator.clipboard && navigator.clipboard.readText){
    navigator.clipboard.readText().then(text => {
      const input = document.getElementById('affCodeInput');
      if(input) input.value = text.trim().toUpperCase();
    }).catch(() => showToast('Could not read the clipboard'));
  } else {
    showToast('Your browser does not allow reading the clipboard automatically');
  }
}

function submitAffiliationFromInput(){
  const input = document.getElementById('affCodeInput');
  const code = input ? input.value.trim() : '';
  if(!code){ showToast('Enter or paste an affiliation code'); return; }
  processAffiliationCode(code);
}

async function processAffiliationCode(code){
  if(!USE_SUPABASE){ showToast('Configure Supabase to be able to affiliate'); return; }
  if(!currentClientId){ showToast('Sign in to affiliate with a clinic'); return; }

  // The pet gets linked automatically to the one currently selected/primary,
  // since this button lives in the general "Vet features" card (not inside
  // a specific pet's profile). If the person has no pets yet, ask them to
  // add one first — an affiliation always needs a pet_id on the admin side.
  const pet = getProfileSelectedPet();
  if(!pet){ showToast('Add a pet first, then affiliate with a clinic'); return; }

  showToast('Looking up code...');
  try{
    // The code lives in "affiliations" (one row per code, generated by the
    // clinic's admin panel), NOT in "veterinary.affiliation_code" anymore —
    // that was the old, clinic-wide model this scanner used to point to.
    const { data: afil, error: findErr } = await supabaseClient
      .from('affiliations')
      .select('id, status, veterinary_id')
      .eq('code', code.toUpperCase())
      .maybeSingle();
    if(findErr) throw findErr;

    if(!afil){ showToast('Invalid code, check and try again'); return; }
    if(afil.status !== 'unclaimed'){
      const messages = {
        pending: 'This code already has a pending request',
        active: 'This code has already been used',
        rejected: 'This code is no longer valid',
        expired: 'This code has expired'
      };
      showToast(messages[afil.status] || 'This code is not available right now');
      return;
    }

    // Claim the code: link it to this owner + pet and mark it pending so it
    // shows up under "Affiliation Requests" on the clinic's admin dashboard.
    const { error: updateErr } = await supabaseClient
      .from('affiliations')
      .update({
        id_client: currentClientId,
        pet_id: pet.id,
        status: 'pending',
        requested_at: new Date().toISOString()
      })
      .eq('id', afil.id);
    if(updateErr) throw updateErr;

    const { data: clinic } = await supabaseClient
      .from('veterinary')
      .select('clinic_name')
      .eq('id_veterinary', afil.veterinary_id)
      .maybeSingle();

    stopQrScanner();
    closeModal();
    showToast(`Affiliation request sent to ${clinic?.clinic_name || 'the clinic'} 🎉`);
    loadVetInfoFromSupabase(currentClientId);
    loadAssociatedClinicsFromSupabase(currentClientId);
  }catch(err){
    console.error('[Doppy][Supabase] Error affiliating clinic:', err);
    showToast('Could not complete the affiliation');
  }
}

/* ---------- Modal: Add Pet ---------- */
function openAddPetModal(){
  openModal(`
    <h3>🐾 Add a new pet</h3>
    <div class="form-group"><label>Pet name</label><input id="np_name" placeholder="e.g. Max"></div>
    <div class="form-row">
      <div class="form-group"><label>Species</label>
        <select id="np_species"><option value="Dog">Dog</option><option value="Cat">Cat</option><option value="Bird">Bird</option><option value="Other">Other</option></select>
      </div>
      <div class="form-group"><label>Gender</label>
        <select id="np_gender"><option value="true">Male</option><option value="false">Female</option></select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Breed</label><input id="np_breed" placeholder="e.g. Corgi"></div>
      <div class="form-group"><label>Age</label><input id="np_age" type="number" min="0" placeholder="e.g. 2"></div>
      <div class="form-group"><label>Age unit</label>
        <select id="np_age_unit"><option value="true">Years</option><option value="false">Months</option></select>
      </div>
    </div>
    <div class="form-group"><label>Allergies</label><input id="np_allergies" placeholder="e.g. Penicillin"></div>
    <div class="form-group"><label>Photo</label><input type="file" id="np_photo" accept="image/*"></div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="submitAddPet()">Save pet</button>
    </div>
  `);
}
// Helpers to translate between Supabase's real columns (pets) and the
// format the UI uses internally (species emoji, gender symbol, age as text).
function speciesToEmoji(type){
  const map = { Dog:'🐕', Cat:'🐈', Bird:'🐦' };
  return map[type] || '🐾';
}
function genderToSymbol(isMale){
  return isMale ? '♂' : '♀';
}
function ageToText(age, isYears){
  return `${age} ${isYears ? 'year' : 'month'}${age === 1 ? '' : 's'} old`;
}

async function submitAddPet(){
  const name = document.getElementById('np_name').value.trim();
  if(!name){ showToast('Please enter a pet name'); return; }

  // Antes esto confiaba en la variable global currentClientId, que se
  // resuelve una sola vez al cargar la página. Si el dueño se acaba de
  // registrar y agrega una mascota muy rápido, esa variable todavía podía
  // estar en null y la mascota quedaba guardada sin dueño (owner_id NULL).
  // Ahora se vuelve a resolver la sesión acá mismo, justo antes de insertar.
  if(USE_SUPABASE && !currentClientId){
    currentClientId = await getCurrentClientId();
  }
  if(USE_SUPABASE && !currentClientId){
    showToast('⚠️ Could not confirm your account — sign in again and retry adding the pet');
    return;
  }

  const petType = document.getElementById('np_species').value; // 'Dog' | 'Cat' | 'Bird' | 'Other'
  const isMale = document.getElementById('np_gender').value === 'true';
  const breed = document.getElementById('np_breed').value || '—';
  const ageNum = parseInt(document.getElementById('np_age').value, 10) || 0;
  const isYears = document.getElementById('np_age_unit').value === 'true';
  const allergies = document.getElementById('np_allergies').value.trim() || null;

  if(USE_SUPABASE){
    try{
      const { data, error } = await supabaseClient
        .from('pets')
        .insert([{
          pet_name: name,
          petTypes: petType,
          pet_gender: isMale,
          pet_breed: breed,
          pet_age: ageNum,
          pet_year: isYears,
          owner_id: currentClientId
        }])
        .select();
      if(error) throw error;
      const row = data[0];
      pets.push({
        id: row.id, name: row.pet_name, species: speciesToEmoji(row.petTypes),
        breed: row.pet_breed, gender: genderToSymbol(row.pet_gender),
        age: ageToText(row.pet_age, row.pet_year), primary: pets.length === 0,
        photo: row.photo_url || null, allergies
      });
    }catch(err){
      console.error('[Doppy][Supabase] Error saving pet:', err);
      showToast('Could not save to Supabase, saved locally instead');
      pets.push({
        id: Date.now(), name, species: speciesToEmoji(petType), breed,
        gender: genderToSymbol(isMale), age: ageToText(ageNum, isYears), primary: pets.length === 0,
        photo: null, allergies
      });
    }
  } else {
    pets.push({
      id: Date.now(), name, species: speciesToEmoji(petType), breed,
      gender: genderToSymbol(isMale), age: ageToText(ageNum, isYears), primary: pets.length === 0,
      photo: null, allergies
    });
  }

  renderMyPets();
  closeModal();
  showToast(name + ' was added to your pets 🎉');
}

/* ---------- Modal: New Appointment ---------- */
function openNewAppointmentModal(){
  const petOptions = pets.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
  openModal(`
    <h3>📅 New appointment</h3>
    <div class="form-group"><label>Pet</label><select id="ap_pet">${petOptions}</select></div>
    <div class="form-row">
      <div class="form-group"><label>Date</label><input type="date" id="ap_date"></div>
      <div class="form-group"><label>Time</label><input type="time" id="ap_time"></div>
    </div>
    <div class="form-group"><label>Reason / Appointment</label><input id="ap_reason" placeholder="e.g. Annual checkup"></div>
    <div class="form-group"><label>Vet / Clinic</label><input id="ap_vet" placeholder="e.g. Happy Paws Clinic"></div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="submitNewAppointment()">Save appointment</button>
    </div>
  `);
}
async function submitNewAppointment(){
  const petName = document.getElementById('ap_pet').value;
  const pet = pets.find(p => p.name === petName) || getProfileSelectedPet();
  const date = document.getElementById('ap_date').value;
  const time = document.getElementById('ap_time').value || '09:00';
  const reason = document.getElementById('ap_reason').value.trim();
  const place = document.getElementById('ap_vet').value || '—';
  if(!date || !reason){ showToast('Please fill in date and reason'); return; }
  if(!pet){ showToast('Add a pet first'); return; }
  const niceDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {month:'short', day:'2-digit', year:'numeric'});
  const isoDateTime = new Date(`${date}T${time}:00`).toISOString();

  let newId = Date.now();
  if(USE_SUPABASE){
    try{
      const { data, error } = await supabaseClient
        .from('appointments')
        .insert([{ pet_id: pet.id, veterinary_id: currentVetId, title: reason, appointment_date: isoDateTime, type: 'other', status: 'scheduled' }])
        .select();
      if(error) throw error;
      newId = data[0].id;
    }catch(err){
      console.error('[Doppy][Supabase] Error saving appointment:', err);
      showToast('Could not save to Supabase, saved locally instead');
    }
  }

  appointments.unshift({id:newId, date:niceDate, label:reason});
  events.push({id:'appt-'+newId, date:date, title:reason, time, place, type:'appointment', icon:'🩺'});
  renderSchedule();
  renderUpcoming();
  renderCalendar();
  closeModal();
  showToast('Appointment saved for ' + niceDate);
}

/* ---------- Modal: New Event (Calendar) ---------- */
function openNewEventModal(){
  openModal(`
    <h3>🎉 New event</h3>
    <div class="form-group"><label>Title</label><input id="ev_title" placeholder="e.g. Pet Adoption Day"></div>
    <div class="form-row">
      <div class="form-group"><label>Date</label><input type="date" id="ev_date"></div>
      <div class="form-group"><label>Time</label><input type="time" id="ev_time"></div>
    </div>
    <div class="form-group"><label>Location</label><input id="ev_place" placeholder="e.g. Central Park"></div>
    <div class="form-group"><label>Type</label>
      <select id="ev_type"><option value="event">Event</option><option value="appointment">Appointment</option></select>
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="submitNewEvent()">Save event</button>
    </div>
  `);
}
async function submitNewEvent(){
  const title = document.getElementById('ev_title').value.trim();
  const date = document.getElementById('ev_date').value;
  if(!title || !date){ showToast('Please fill in title and date'); return; }
  const type = document.getElementById('ev_type').value;
  const time = document.getElementById('ev_time').value || '09:00';
  const place = document.getElementById('ev_place').value || '—';
  const isoDateTime = new Date(`${date}T${time}:00`).toISOString();

  let newId = Date.now();
  if(USE_SUPABASE){
    try{
      if(type === 'appointment'){
        const pet = getProfileSelectedPet();
        if(!pet){ showToast('Add a pet first to create an appointment'); return; }
        const { data, error } = await supabaseClient
          .from('appointments')
          .insert([{ pet_id: pet.id, veterinary_id: currentVetId, title, appointment_date: isoDateTime, type: 'other', status: 'scheduled' }])
          .select();
        if(error) throw error;
        newId = data[0].id;
      } else {
        const { data, error } = await supabaseClient
          .from('events')
          .insert([{ title, description: null, event_date: isoDateTime, location: place }])
          .select();
        if(error) throw error;
        newId = data[0].id;
      }
    }catch(err){
      console.error('[Doppy][Supabase] Error saving event:', err);
      showToast('Could not save to Supabase, saved locally instead');
    }
  }

  const icon = type === 'event' ? '🎉' : '🩺';
  events.push({ id: (type==='appointment'?'appt-':'evt-')+newId, date, title, time, place, type, icon });
  const d = new Date(date + 'T00:00:00');
  calState.year = d.getFullYear();
  calState.month = d.getMonth();
  renderCalendar();
  renderUpcoming();
  closeModal();
  showToast('Event "' + title + '" added to your calendar');
}

/* ---------- Modal: Change password ---------- */
function openChangePasswordModal(){
  openModal(`
    <h3>🔒 Change password</h3>
    <div class="form-group"><label>Current password</label><input type="password" id="pw_current"></div>
    <div class="form-group"><label>New password</label><input type="password" id="pw_new"></div>
    <div class="form-group"><label>Confirm new password</label><input type="password" id="pw_confirm"></div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="submitPasswordChange()">Update password</button>
    </div>
  `);
}
function submitPasswordChange(){
  const cur = document.getElementById('pw_current').value;
  const n = document.getElementById('pw_new').value;
  const c = document.getElementById('pw_confirm').value;
  if(!cur || !n || !c){ showToast('Please fill in all fields'); return; }
  if(n !== c){ showToast('New passwords do not match'); return; }
  closeModal();
  showToast('Password updated successfully');
  // Note: the real password change should use supabaseClient.auth.updateUser({ password: n })
  // once Supabase Auth is configured (not just the data table).
}

/* ---------- Modal: Notification preferences ---------- */
function openNotifPrefsModal(){
  openModal(`
    <h3>🔔 Notification preferences</h3>
    <div class="checkbox-row"><input type="checkbox" id="np_email" ${notifPrefs.email ? 'checked':''}> Email notifications</div>
    <div class="checkbox-row"><input type="checkbox" id="np_push" ${notifPrefs.push ? 'checked':''}> Push notifications</div>
    <div class="checkbox-row"><input type="checkbox" id="np_sms" ${notifPrefs.sms ? 'checked':''}> SMS notifications</div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="saveNotifPrefs()">Save preferences</button>
    </div>
  `);
}
async function saveNotifPrefs(){
  notifPrefs.email = document.getElementById('np_email').checked;
  notifPrefs.push = document.getElementById('np_push').checked;
  notifPrefs.sms = document.getElementById('np_sms').checked;
  if(USE_SUPABASE){
    try{
      const { error } = await supabaseClient.from('user_settings').upsert([{ id: 1, notif_email: notifPrefs.email, notif_push: notifPrefs.push, notif_sms: notifPrefs.sms }]);
      if(error) throw error;
    }catch(err){ console.error('[Doppy][Supabase] Error saving preferences:', err); }
  }
  closeModal();
  showToast('Notification preferences saved');
}

/* ---------- Modal: Language ---------- */
const doppyTranslations = {
  en: {
    navDashboard: 'Dashboard', navCalendar: 'Calendar', navPetWall: 'Pet Wall', navProfile: 'Profile',
    addPet: 'Add pet',
    searchCommunity: 'Search the community',
    petWallTitle: 'The Pet Wall', petWallSubtitle: 'A space to share, learn and connect with pet lovers.',
    calendarTitle: 'Pet Schedule', calendarSubtitle: "Keep track of all your pet's important events and appointments.",
    profileTitle: 'Profile', profileSubtitle: 'Manage your personal information and preferences.'
  },
  es: {
    navDashboard: 'Inicio', navCalendar: 'Calendario', navPetWall: 'Muro de mascotas', navProfile: 'Perfil',
    addPet: 'Agregar mascota',
    searchCommunity: 'Buscar en la comunidad',
    petWallTitle: 'El Muro de Mascotas', petWallSubtitle: 'Un espacio para compartir, aprender y conectar con otros amantes de las mascotas.',
    calendarTitle: 'Agenda de tu mascota', calendarSubtitle: 'Llevá el control de los eventos y turnos importantes de tu mascota.',
    profileTitle: 'Perfil', profileSubtitle: 'Administrá tu información personal y tus preferencias.'
  }
};

// NOTA HONESTA: esta app tiene cientos de textos escritos directo en el
// HTML (posts, turnos, mensajes de toast, etc.) — traducir eso TODO es un
// trabajo en sí mismo. Esto sí cambia de verdad el idioma de la navegación,
// los títulos de página y los textos fijos principales, y lo guarda para
// la próxima visita — no es solo un label como antes.
function applyLanguage(lang){
  const t = doppyTranslations[lang] || doppyTranslations.en;

  const navLabels = document.querySelectorAll('.nav-label');
  const navKeys = ['navDashboard','navCalendar','navPetWall','navProfile'];
  navLabels.forEach((el, i) => { if(navKeys[i]) el.textContent = t[navKeys[i]]; });

  const addPetBtns = document.querySelectorAll('#addPetBtn, #addNewPetBtn2');
  addPetBtns.forEach(btn => {
    if(btn.id === 'addPetBtn') btn.innerHTML = `${t.addPet} <span>+</span>`;
  });

  const searchInput = document.getElementById('searchInput');
  if(searchInput) searchInput.placeholder = t.searchCommunity;

  const pwTitle = document.querySelector('#view-petwall .page-title h1');
  const pwSub = document.querySelector('#view-petwall .page-title p');
  if(pwTitle) pwTitle.textContent = t.petWallTitle + ' ♡';
  if(pwSub) pwSub.textContent = t.petWallSubtitle;

  const calTitle = document.querySelector('#view-calendar .page-title h1');
  const calSub = document.querySelector('#view-calendar .page-title p');
  if(calTitle) calTitle.textContent = t.calendarTitle;
  if(calSub) calSub.textContent = t.calendarSubtitle;

  const profTitle = document.querySelector('#view-profile .page-title h1');
  const profSub = document.querySelector('#view-profile .page-title p');
  if(profTitle) profTitle.textContent = t.profileTitle;
  if(profSub) profSub.textContent = t.profileSubtitle;

  const languageValueEl = document.getElementById('languageValue');
  if(languageValueEl) languageValueEl.textContent = lang === 'es' ? 'Español' : 'English';

  localStorage.setItem('doppy_lang', lang);
}

function openLanguageModal(){
  const current = document.getElementById('languageValue').textContent;
  openModal(`
    <h3>🌐 Language</h3>
    <div class="form-group"><label>Choose your language</label>
      <select id="lang_select">
        <option value="en" ${current === 'English' ? 'selected':''}>English</option>
        <option value="es" ${current === 'Español' ? 'selected':''}>Español</option>
      </select>
    </div>
    <p style="font-size:12.5px; color:var(--text-muted); margin-top:-6px;">This switches the app's navigation, page titles and main labels. Content you or others typed (posts, notes) stays as written.</p>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="saveLanguage()">Save</button>
    </div>
  `);
}
function saveLanguage(){
  const lang = document.getElementById('lang_select').value;
  applyLanguage(lang);
  closeModal();
  showToast(lang === 'es' ? '🌐 Idioma cambiado a Español' : '🌐 Language set to English');
}

/* ---------- Modal: Privacy settings ---------- */
function openPrivacyModal(){
  openModal(`
    <h3>🛡️ Privacy settings</h3>
    <div class="checkbox-row"><input type="checkbox" id="pv_profile" ${privacyPrefs.profileVisible ? 'checked':''}> Make my profile visible to the community</div>
    <div class="checkbox-row"><input type="checkbox" id="pv_location" ${privacyPrefs.shareLocation ? 'checked':''}> Share my location for nearby recommendations</div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="savePrivacy()">Save</button>
    </div>
  `);
}
function savePrivacy(){
  privacyPrefs.profileVisible = document.getElementById('pv_profile').checked;
  privacyPrefs.shareLocation = document.getElementById('pv_location').checked;
  closeModal();
  showToast('Privacy settings saved');
  // TODO: PATCH /api/users/privacy-settings
}

/* ---------- Modal: Help Center ---------- */
function openHelpModal(){
  openModal(`
    <h3>❓ Help Center</h3>
    <p style="font-size:14px; color:var(--text-muted); line-height:1.6;">Frequently asked questions:</p>
    <ul style="font-size:13.5px; color:var(--text-dark); line-height:1.9; padding-left:18px;">
      <li>How do I add a new pet?</li>
      <li>How do I change my appointment reminders?</li>
      <li>How is my data used?</li>
    </ul>
    <p style="font-size:13px;">Still need help? <a href="mailto:support@oppy.app" style="color:var(--blue-mid); font-weight:600;">support@oppy.app</a></p>
    <div class="modal-actions"><button class="btn-primary" onclick="closeModal()">Got it</button></div>
  `);
}

function getProfileSelectedPet(){
  const storedPetId = Number(localStorage.getItem('pet_row_id') || localStorage.getItem('selectedPetId') || 0);
  const fromStorage = storedPetId ? pets.find(p => p.id === storedPetId) : null;
  return fromStorage || pets.find(p => p.primary) || pets[0] || null;
}

let currentPetVetPhone = null;

async function loadPetVeterinarianCard(){
  const pet = getProfileSelectedPet();
  const nameEl = document.getElementById('petVetName');
  const specEl = document.getElementById('petVetSpecialty');
  const placeEl = document.getElementById('petVetPlace');
  if (!nameEl) return;
  currentPetVetPhone = null;

  if (!pet || !pet.assignedVeterinarianId || !USE_SUPABASE) {
    nameEl.textContent = 'No veterinarian assigned yet';
    if (specEl) specEl.textContent = '';
    if (placeEl) placeEl.textContent = '';
    return;
  }

  try {
    const { data: staff, error } = await supabaseClient
      .from('veterinary_staff')
      .select('nombre, specialty, telefono, veterinary_id')
      .eq('id', pet.assignedVeterinarianId)
      .maybeSingle();

    if (error || !staff) {
      nameEl.textContent = 'No veterinarian assigned yet';
      if (specEl) specEl.textContent = '';
      if (placeEl) placeEl.textContent = '';
      return;
    }

    nameEl.textContent = staff.nombre || 'Veterinarian';
    if (specEl) specEl.textContent = staff.specialty || '';
    currentPetVetPhone = staff.telefono || null;

    if (staff.veterinary_id && placeEl) {
      const { data: clinic } = await supabaseClient
        .from('veterinary')
        .select('clinic_name, location')
        .eq('id_veterinary', staff.veterinary_id)
        .maybeSingle();
      placeEl.textContent = clinic ? (clinic.clinic_name || clinic.location || '') : '';
    } else if (placeEl) {
      placeEl.textContent = '';
    }
  } catch (err) {
    console.warn('[Doppy] Error loading assigned veterinarian:', err);
  }
}

function callAssignedVetPhone(){
  if (currentPetVetPhone) {
    window.location.href = 'tel:' + currentPetVetPhone.replace(/[^\d+]/g, '');
  } else {
    showToast('No phone number on file for this veterinarian');
  }
}

function selectPetProfile(id){
  localStorage.setItem('selectedPetId', String(id));
  localStorage.setItem('pet_row_id', String(id));
  emergencyState.selectedPetId = id;
  renderMyPets();
  renderProfileHero();
  loadVaccinationCardFromSupabase();
  loadVaccinationTableFromSupabase();
  loadPetVeterinarianCard();
  showView('petprofile');
}

function ensureSelectedPetInStorage(){
  const storedPetId = Number(localStorage.getItem('pet_row_id') || localStorage.getItem('selectedPetId') || 0);
  if(!storedPetId && pets.length){
    const primaryPet = pets[0];
    localStorage.setItem('selectedPetId', String(primaryPet.id));
    localStorage.setItem('pet_row_id', String(primaryPet.id));
    emergencyState.selectedPetId = primaryPet.id;
  }
}

function updatePetProfileFields(pet){
  const petNameEl = document.getElementById('petProfileName');
  const petAgeEl = document.getElementById('petProfileAge');
  const petGenderEl = document.getElementById('petProfileGender');
  const petBreedEl = document.getElementById('petProfileBreed');
  const petPhotoEl = document.getElementById('petProfilePhotoImg');
  const petPhotoPlaceholder = document.getElementById('petProfilePhotoPlaceholder');

  if(petNameEl) petNameEl.textContent = pet ? pet.name : 'No pet selected';
  if(petAgeEl) petAgeEl.textContent = pet ? pet.age : '—';
  if(petGenderEl) petGenderEl.textContent = pet ? pet.gender : '—';
  if(petBreedEl) petBreedEl.textContent = pet ? pet.breed : '—';
  if(petPhotoEl){
    if(pet && pet.photo){
      // Hay una foto real subida por el dueño: se muestra tal cual.
      petPhotoEl.src = pet.photo;
      petPhotoEl.style.display = 'block';
      if(petPhotoPlaceholder) petPhotoPlaceholder.style.display = 'none';
    } else {
      // Sin foto real: en vez de mostrar una foto de stock de un perro
      // (que quedaba mal para gatos, pájaros, tortugas, etc.), se muestra
      // un placeholder neutro con el emoji real de la especie de la mascota.
      petPhotoEl.style.display = 'none';
      petPhotoEl.removeAttribute('src');
      if(petPhotoPlaceholder){
        petPhotoPlaceholder.textContent = pet ? (pet.species || '🐾') : '🐾';
        petPhotoPlaceholder.style.display = 'flex';
      }
    }
  }
}

function renderProfileHero(){
  const pet = getProfileSelectedPet();
  const el = document.getElementById('profilePetName');

  if(!pet){
    if(el) el.textContent = 'No pet selected';
    updatePetProfileFields(null);
    return;
  }

  if(el) el.textContent = `${pet.name} (${pet.breed})`;
  updatePetProfileFields(pet);
}

/* =========================================================================
   RENDER: DASHBOARD PET FEATURES (name/age/photo of the primary pet)
   ========================================================================= */
function renderDashboardPetFeatures(){
  const nameEl = document.getElementById('dashPetName');
  const ageEl = document.getElementById('dashPetAge');
  if(!nameEl || !ageEl) return;
  const pet = getProfileSelectedPet();
  nameEl.textContent = pet ? pet.name : 'No pet';
  ageEl.textContent = pet ? pet.age : '—';
  renderDashboardPetPhoto(pet);
}

function renderDashboardPetPhoto(pet){
  const wrap = document.getElementById('dashPetPhotoWrap');
  const img = document.getElementById('dashPetPhotoImg');
  if(!wrap || !img) return;
  if(pet && pet.photo){
    img.src = pet.photo;
    img.style.display = 'block';
    wrap.classList.add('has-photo');
  } else {
    img.style.display = 'none';
    wrap.classList.remove('has-photo');
  }
}

/* ---- Upload the selected pet's photo to the "pet-photos" bucket ---- */
async function handleDashPetPhotoUpload(file){
  if(!file) return;
  const pet = getProfileSelectedPet();
  if(!pet){ showToast('Select a pet first'); return; }
  if(!USE_SUPABASE){ showToast('Configure Supabase to be able to upload photos'); return; }

  showToast('Uploading photo...');
  try{
    const fileExt = file.name.split('.').pop();
    const filePath = `${currentClientId || 'anon'}/${pet.id}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabaseClient
      .storage
      .from('pet-photos')
      .upload(filePath, file);
    if(uploadError) throw uploadError;

    const { data: publicUrlData } = supabaseClient
      .storage
      .from('pet-photos')
      .getPublicUrl(filePath);
    const photoUrl = publicUrlData.publicUrl;

    const { error: updateError } = await supabaseClient
      .from('pets')
      .update({ photo_url: photoUrl })
      .eq('id', pet.id);
    if(updateError) throw updateError;

    pet.photo = photoUrl;
    renderDashboardPetPhoto(pet);
    updatePetProfileFields(pet);
    showToast('Photo updated 🎉');
  }catch(err){
    console.error('[Doppy][Supabase] Error uploading photo:', err);
    showToast('Could not upload the photo');
  }
}

/* =========================================================================
   RENDER: MY PETS (Profile)
   ========================================================================= */
function renderMyPets(){
  const el = document.getElementById('myPetsList');
  if(!el) return;
  const selectedPetId = getProfileSelectedPet()?.id;
  el.innerHTML = pets.map(p => `
    <div class="pet-list-item ${selectedPetId === p.id ? 'selected' : ''}" style="cursor:pointer;" onclick="selectPetProfile(${p.id})">
      <div class="pet-avatar">${p.photo ? `<img src="${p.photo}" style="width:100%;height:100%;object-fit:cover;">` : p.species}</div>
      <div class="info">
        <h4>${p.name} ${p.primary ? '<span class="primary-tag">🐾 Primary Pet</span>' : ''}</h4>
        <p>${p.breed}</p>
        <p>${p.gender} ${p.age}</p>
      </div>
    </div>
  `).join('');
  renderProfileHero();
  renderDashboardPetFeatures();
}

/* =========================================================================
   RENDER: SCHEDULE (Dashboard)
   ========================================================================= */
function renderSchedule(){
  const el = document.getElementById('scheduleList');
  if(!el) return;
  el.innerHTML = appointments.slice(0,3).map(a => `
    <div class="schedule-item">
      <div class="left">📅 <span>${a.date}</span></div>
      <span>${a.label}</span>
    </div>
  `).join('');
}

/* =========================================================================
   RENDER: NOTIFICATIONS
   ========================================================================= */
let notifFilter = 'All';
function filterNotif(el){
  document.querySelectorAll('#view-notifications .filter-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  notifFilter = el.textContent.trim();
  renderNotifications();
}
function renderNotifications(){
  const el = document.getElementById('notifList');
  if(!el) return;
  let list = notifications;
  if(notifFilter === 'Reminders') list = list.filter(n => n.tag === 'Reminder');
  if(notifFilter === 'Not Seen') list = list.filter(n => n.unread);

  if(list.length === 0){
    el.innerHTML = `<p style="color:var(--text-muted); font-size:14px;">No notifications here yet.</p>`;
    return;
  }

  el.innerHTML = list.map(n => `
    <div class="notif-item ${n.unread ? '' : 'read'}">
      <span class="unread-dot"></span>
      <div class="notif-icon" style="background:${n.iconBg};">${n.icon}</div>
      <div class="info">
        <h4>${n.title}</h4>
        <p>${n.desc}</p>
      </div>
      <div class="notif-meta">
        <span class="notif-time">${n.time}</span>
        <span class="notif-tag" style="background:${n.tagBg};color:${n.tagColor};">${n.tag}</span>
      </div>
      <div class="dropdown-wrap">
        <span class="notif-dots" onclick="toggleDropdown(event, 'nd-${n.id}')">⋮</span>
        <div class="dropdown-menu" id="nd-${n.id}">
          <button onclick="markNotifRead(${n.id})">✓ Mark as ${n.unread ? 'read' : 'unread'}</button>
          <button onclick="deleteNotif(${n.id})">🗑 Delete</button>
        </div>
      </div>
    </div>
  `).join('');
}
function toggleDropdown(e, id){
  e.stopPropagation();
  const menu = document.getElementById(id);
  const wasOpen = menu.classList.contains('show');
  document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
  if(!wasOpen) menu.classList.add('show');
}
async function markNotifRead(id){
  const n = notifications.find(x => x.id === id);
  if(n) n.unread = !n.unread;
  renderNotifications();
  // NOTA: la tabla "notifications" no tiene una columna de leído/no leído
  // todavía, así que esto por ahora es solo un cambio visual local.
}
async function deleteNotif(id){
  notifications = notifications.filter(x => x.id !== id);
  renderNotifications();
  showToast('Notification deleted');
  if(USE_SUPABASE){
    try{
      const { error } = await supabaseClient.from('notifications').delete().eq('id_notification', id);
      if(error) throw error;
    }catch(err){ console.error('[Doppy][Supabase] Error deleting notification:', err); }
  }
}

/* =========================================================================
   RENDER: VACCINATION TABLE (Pet profile)
   ========================================================================= */
async function loadVaccinationTableFromSupabase(){
  const pet = getProfileSelectedPet();
  vaccinations = [];
  if (pet && USE_SUPABASE) {
    try {
      const { data, error } = await supabaseClient
        .from('vaccination_record')
        .select('id, vaccine_name, created_at, next_due_date')
        .eq('pet_id', pet.id)
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('[Doppy][Supabase] Could not load vaccination_record:', error);
      } else {
        vaccinations = (data || []).map(r => {
          const applied = r.created_at ? new Date(r.created_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) : '—';
          const next = r.next_due_date ? new Date(r.next_due_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) : '—';
          const isOverdue = r.next_due_date && new Date(r.next_due_date) < new Date();
          return { id: r.id, name: r.vaccine_name || 'Vaccine', applied, next, status: isOverdue ? 'lost' : 'ontime' };
        });
      }
    } catch (err) {
      console.warn('[Doppy] Error loading vaccination table:', err);
    }
  }
  renderVaccTable();
}

// El estado (Lost/On time) ahora se calcula solo a partir de next_due_date
// en vaccination_record — ya no es un toggle manual del dueño (no había
// ninguna columna real donde guardar ese click, por eso antes no persistía).
function renderVaccTable(){
  const el = document.getElementById('vaccTableBody');
  if(!el) return;
  if (!vaccinations.length) {
    el.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:16px;">No vaccination records yet.</td></tr>`;
    return;
  }
  el.innerHTML = vaccinations.map((v) => `
    <tr>
      <td>${v.name}</td>
      <td>${v.applied}</td>
      <td>${v.next}</td>
      <td><span class="radio-dot ${v.status === 'lost' ? 'on' : ''}"></span></td>
      <td><span class="radio-dot ${v.status === 'ontime' ? 'on' : ''}"></span></td>
    </tr>
  `).join('');
}

/* =========================================================================
   RENDER: PET WALL (posts)
   ========================================================================= */
let wallFilter = 'All';
function filterWall(el){
  document.querySelectorAll('#view-petwall .wall-filter').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  wallFilter = el.textContent.trim();
  renderPosts();
}
function renderPosts(){
  const el = document.getElementById('postsList');
  renderPetWallTrendingTips();
  if(!el) return;
  const searchTerm = (searchPlaceholders_current === 'petwall') ? (document.getElementById('searchInput').value || '').toLowerCase() : '';

  let list = posts;
  if(wallFilter !== 'All') list = list.filter(p => p.category === wallFilter);
  if(searchTerm) list = list.filter(p => (p.title + ' ' + p.text).toLowerCase().includes(searchTerm));

  if(list.length === 0){
    el.innerHTML = `<p style="color:var(--text-muted); font-size:14px;">No posts match your search.</p>`;
    return;
  }

  el.innerHTML = list.map(p => `
    <div class="post-card">
      <div class="post-head">
        <div class="av">${p.avatar}</div>
        <div><h4>${p.author}</h4><span class="time">${p.time}</span></div>
        <span class="post-tag" style="background:${p.tagBg};color:${p.tagColor};">${p.tag}</span>
        <div class="dropdown-wrap">
          <span class="notif-dots" onclick="toggleDropdown(event, 'pd-${p.id}')">⋯</span>
          <div class="dropdown-menu" id="pd-${p.id}">
            <button onclick="togglePostSave(${p.id})">🔖 ${p.saved ? 'Unsave' : 'Save'}</button>
            <button onclick="reportPost(${p.id})">🚩 Report</button>
          </div>
        </div>
      </div>
      <div class="post-body">
        <div class="post-img"><span class="paw">🐾</span><img src="${p.img}" alt="${p.title}"></div>
        <div class="post-text">
          <h5>${p.title}</h5>
          <p id="ptext-${p.id}">${p.expanded ? (p.text + ' ' + (p.more || '')) : p.text}</p>
          ${p.more ? `<br><a href="#" onclick="event.preventDefault(); toggleReadMore(${p.id})">${p.expanded ? 'Show less' : 'Read more'}</a>` : ''}
        </div>
      </div>
      <div class="post-actions">
        <div class="act ${p.liked ? 'liked':''}" onclick="toggleLike(${p.id})">👍 ${p.likes}</div>
        <div class="act" onclick="addComment(${p.id})">💬 ${p.comments}</div>
        <div class="act save ${p.saved ? 'saved':''}" onclick="togglePostSave(${p.id})">🔖 ${p.saved ? 'Saved' : 'Save'}</div>
      </div>
    </div>
  `).join('');
}
function toggleReadMore(id){
  const p = posts.find(x => x.id === id);
  p.expanded = !p.expanded;
  renderPosts();
}
async function toggleLike(id){
  const p = posts.find(x => x.id === id);
  p.liked = !p.liked;
  p.likes += p.liked ? 1 : -1;
  renderPosts();
  if(USE_SUPABASE && currentClientId){
    try{
      if(p.liked){
        const { error } = await supabaseClient.from('post_likes').insert({ post_id: id, user_id: currentClientId });
        if(error) throw error;
      } else {
        const { error } = await supabaseClient.from('post_likes').delete().eq('post_id', id).eq('user_id', currentClientId);
        if(error) throw error;
      }
    }catch(err){ console.error('[Doppy][Supabase] Error updating like:', err); }
  }
}
async function togglePostSave(id){
  const p = posts.find(x => x.id === id);
  p.saved = !p.saved;
  renderPosts();
  showToast(p.saved ? 'Post saved' : 'Post removed from saved');
  if(USE_SUPABASE && currentClientId){
    try{
      if(p.saved){
        const { error } = await supabaseClient.from('post_saves').insert({ post_id: id, user_id: currentClientId });
        if(error) throw error;
      } else {
        const { error } = await supabaseClient.from('post_saves').delete().eq('post_id', id).eq('user_id', currentClientId);
        if(error) throw error;
      }
    }catch(err){ console.error('[Doppy][Supabase] Error saving post:', err); }
  }
}
async function addComment(id){
  const text = prompt('Write a comment:');
  if(text && text.trim()){
    const p = posts.find(x => x.id === id);
    p.comments += 1;
    renderPosts();
    showToast('Comment added');
    if(USE_SUPABASE && currentClientId){
      try{
        const { error } = await supabaseClient.from('post_comments').insert({ post_id: id, user_id: currentClientId, comment: text.trim() });
        if(error) throw error;
      }catch(err){ console.error('[Doppy][Supabase] Error saving comment:', err); }
    }
  }
}
function reportPost(id){
  document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
  showToast('Post reported. Our team will review it.');
  // TODO: POST /api/posts/{id}/report
}

/* =========================================================================
   RENDER: CALENDAR
   ========================================================================= */
const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function renderCalendar(){
  const grid = document.getElementById('calGrid');
  const label = document.getElementById('calMonthLabel');
  if(!grid || !label) return;

  label.textContent = monthNames[calState.month] + ' ' + calState.year;

  const firstDay = new Date(calState.year, calState.month, 1).getDay();
  const daysInMonth = new Date(calState.year, calState.month + 1, 0).getDate();
  const daysInPrevMonth = new Date(calState.year, calState.month, 0).getDate();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === calState.year && today.getMonth() === calState.month;

  let cellsHtml = '';
  // previous month's fill-in days
  for(let i = firstDay - 1; i >= 0; i--){
    cellsHtml += `<div class="cal-cell muted"><span class="num">${daysInPrevMonth - i}</span></div>`;
  }
  // current month's days
  for(let d = 1; d <= daysInMonth; d++){
    const dateStr = `${calState.year}-${String(calState.month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    let dayEvents = events.filter(e => e.date === dateStr);
    if(calTypeFilter !== 'all') dayEvents = dayEvents.filter(e => e.type === calTypeFilter);
    const isToday = isCurrentMonth && today.getDate() === d;
    const eventsHtml = dayEvents.map(e => `<div class="cal-event ${e.type === 'event' ? 'yellow' : 'blue'}" title="${e.title}">● ${e.title}</div>`).join('');
    cellsHtml += `<div class="cal-cell" onclick="showDayEvents('${dateStr}')"><span class="num ${isToday ? 'today':''}">${d}</span>${eventsHtml}</div>`;
  }
  // trailing fill-in days to complete the week
  const totalCells = firstDay + daysInMonth;
  const remaining = (7 - (totalCells % 7)) % 7;
  for(let i = 1; i <= remaining; i++){
    cellsHtml += `<div class="cal-cell muted"><span class="num">${i}</span></div>`;
  }

  grid.innerHTML = `
    <div class="cal-dow">Sun</div><div class="cal-dow">Mon</div><div class="cal-dow">Tue</div><div class="cal-dow">Wed</div><div class="cal-dow">Thu</div><div class="cal-dow">Fri</div><div class="cal-dow">Sat</div>
    ${cellsHtml}
  `;
}
let calTypeFilter = 'all';
function setCalFilter(el, type){
  document.querySelectorAll('#view-calendar .cal-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  calTypeFilter = type;
  renderCalendar();
}
function changeMonth(delta){
  calState.month += delta;
  if(calState.month > 11){ calState.month = 0; calState.year++; }
  if(calState.month < 0){ calState.month = 11; calState.year--; }
  renderCalendar();
}
function goToToday(){
  const t = new Date();
  calState.year = t.getFullYear();
  calState.month = t.getMonth();
  renderCalendar();
  showToast('Jumped to today');
}
function showDayEvents(dateStr){
  const dayEvents = events.filter(e => e.date === dateStr);
  if(dayEvents.length === 0){
    showToast('No events on ' + dateStr + ' — click "New Event" to add one');
  } else {
    showToast(dayEvents.length + ' event(s) on ' + dateStr + ': ' + dayEvents.map(e => e.title).join(', '));
  }
}

function renderDiscoverEvents(){
  const el = document.getElementById('discoverEventsList');
  if(!el) return;
  const sorted = [...communityEventsAll].sort((a,b) => a.event_date.localeCompare(b.event_date)).slice(0,6);
  if(!sorted.length){
    el.innerHTML = `<p style="color:var(--text-muted); font-size:13px;">No public events right now.</p>`;
    return;
  }
  el.innerHTML = sorted.map(e => {
    const { date, time } = splitDateTime(e.event_date);
    const added = rsvpedEventIds.has(e.id);
    return `
    <div class="upcoming-item">
      <div class="ic" style="background:#fdf1d3;">🎉</div>
      <div style="flex:1;">
        <h4>${e.title}</h4>
        <p>📅 ${date} • ${time}</p>
        <p>📍 ${e.location || '—'}</p>
        <button class="btn-outline" style="margin-top:6px;padding:5px 12px;font-size:12px;" onclick="rsvpToEvent('${e.id}')">
          ${added ? '✓ In your calendar' : '+ Add to calendar'}
        </button>
      </div>
    </div>`;
  }).join('');
}

function renderUpcoming(){
  const el = document.getElementById('upcomingEventsList');
  renderDiscoverEvents();
  if(!el) return;
  const sorted = [...events].sort((a,b) => a.date.localeCompare(b.date)).slice(0,4);
  el.innerHTML = sorted.map(e => `
    <div class="upcoming-item">
      <div class="ic" style="background:${e.type === 'event' ? '#fdf1d3' : 'var(--blue-pale)'};">${e.icon}</div>
      <div>
        <h4>${e.title}</h4>
        <p>📅 ${e.date} • ${e.time}</p>
        <p>📍 ${e.place}</p>
      </div>
    </div>
  `).join('');
}

/* =========================================================================
   SEARCH (topbar)
   ========================================================================= */
let searchPlaceholders_current = null;
document.getElementById('searchInput').addEventListener('input', (e) => {
  const activeView = document.querySelector('.view.active').id.replace('view-','');
  searchPlaceholders_current = activeView;
  if(activeView === 'petwall') renderPosts();
  if(activeView === 'calendar') filterUpcomingBySearch(e.target.value);
});
function filterUpcomingBySearch(term){
  term = term.toLowerCase();
  const el = document.getElementById('upcomingEventsList');
  if(!el) return;
  const filtered = term ? events.filter(e => e.title.toLowerCase().includes(term)) : [...events].sort((a,b)=>a.date.localeCompare(b.date)).slice(0,4);
  el.innerHTML = filtered.map(e => `
    <div class="upcoming-item">
      <div class="ic" style="background:${e.type === 'event' ? '#fdf1d3' : 'var(--blue-pale)'};">${e.icon}</div>
      <div><h4>${e.title}</h4><p>📅 ${e.date} • ${e.time}</p><p>📍 ${e.place}</p></div>
    </div>
  `).join('') || `<p style="color:var(--text-muted); font-size:13px;">No events found.</p>`;
}

/* =========================================================================
   EMERGENCY — PETS
   ========================================================================= */
function renderEmergencyPets(){
  const el = document.getElementById('emgPetList');
  if(!el) return;
  el.innerHTML = pets.map(p => `
    <div class="emg-pet-item ${emergencyState.selectedPetId === p.id ? 'selected' : ''}" onclick="selectEmergencyPet(${p.id})">
      <div class="av">${p.species}</div>
      <div>
        <h4>${p.name}</h4>
        <p>${p.breed} · ${p.age}</p>
      </div>
      <div class="check">✓</div>
    </div>
  `).join('') || '<p style="color:var(--text-muted); font-size:14px;">You have not added any pets yet.</p>';
  renderEmergencyMedicalSummary();
}
function selectEmergencyPet(id){
  emergencyState.selectedPetId = id;
  renderEmergencyPets();
  loadEmergencyMedicalSummaryFromDb(id);
}
async function loadEmergencyMedicalSummaryFromDb(petId){
  if(!USE_SUPABASE) return;
  try{
    const { data, error } = await supabaseClient.from('medical_records').select('*').eq('mascota_id', petId).maybeSingle();
    if(error) throw error;
    if(data){
      const pet = pets.find(p => p.id === petId);
      if(pet) pet.allergies = data.alergias || pet.allergies;
      const el = document.getElementById('emgMedicalSummary');
      if(el){
        el.innerHTML = `
          <p style="font-size:13px; color:var(--text-muted);">Allergies: ${data.alergias || 'Not on file'}</p>
          <p style="font-size:13px; color:var(--text-muted);">Conditions: ${data.condiciones || 'Not on file'}</p>
          <p style="font-size:13px; color:var(--text-muted);">Medications: ${data.medicamentos || 'Not on file'}</p>
        `;
      }
    }
  }catch(err){ console.error('[Doppy][Supabase] Error loading medical summary:', err); }
}
function renderEmergencyMedicalSummary(){
  const el = document.getElementById('emgMedicalSummary');
  if(!el) return;
  const pet = pets.find(p => p.id === emergencyState.selectedPetId);
  if(!pet){
    el.innerHTML = '<p style="color:var(--text-muted); font-size:13px;">Select a pet to see its medical summary.</p>';
    return;
  }
  el.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;">
      <div class="av" style="width:44px;height:44px;border-radius:50%;background:var(--blue-pale);display:flex;align-items:center;justify-content:center;font-size:20px;">${pet.species}</div>
      <div>
        <h4 style="margin:0; font-size:14.5px;">${pet.name}</h4>
        <p style="margin:2px 0 0; font-size:12px; color:var(--text-muted);">${pet.breed} · ${pet.age}</p>
      </div>
    </div>
    <div class="emg-vitals">
      <span class="emg-vital-tag">⚠️ Allergies: ${pet.allergies || 'None on file'}</span>
    </div>
    <p style="font-size:12px; color:var(--text-muted); margin:8px 0 0;">Connected to table medical_records(mascota_id, alergias, condiciones, medicamentos, ultima_vacuna)</p>
  `;
}

/* =========================================================================
   EMERGENCY — REAL MAP (Google Maps + Places Nearby Search + OpenStreetMap)
   ========================================================================= */
let mapsApiReady = false;
let emgMap = null;
let placesService = null;
let directionsService = null;
let directionsRenderer = null;
let emgUserMarker = null;
let emgClinicMarkers = [];
let emgUserLocation = null;
let emgActiveRouteClinicId = null;
const EMG_DEFAULT_CENTER = { lat: 9.3592, lng: -79.9014 }; // fallback before we have real geolocation

// Global callback invoked by the Google Maps script (callback=initMap).
function initMap(){
  mapsApiReady = true;
  console.log('[Doppy] Google Maps API loaded successfully');
  const emergencyViewActive = document.getElementById('view-emergency')?.classList.contains('active');
  if(emergencyViewActive) ensureEmergencyMap();
}

function showEmgMapBadge(text, show){
  const badge = document.getElementById('emgMapBadge');
  const badgeText = document.getElementById('emgMapBadgeText');
  if(!badge) return;
  if(badgeText) badgeText.textContent = text;
  badge.style.display = show ? 'flex' : 'none';
}

function showEmgLocationStatus(text, state){
  const statusEl = document.getElementById('emgLocationStatus');
  const descEl = document.getElementById('emgLocationDesc');
  const retryBtn = document.getElementById('emgLocationRetryBtn');
  if(!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.color = state === 'error' ? '#dc2626' : '';
  if(descEl){
    if(state === 'error') descEl.textContent = 'We could not detect your location automatically.';
    else if(state === 'ok') descEl.textContent = 'We have automatically detected your current location.';
    else descEl.textContent = 'Detecting your current location...';
  }
  if(retryBtn) retryBtn.style.display = state === 'error' ? 'inline-block' : 'none';
}

// Lazy init: the Google map is only created once the Emergency view is
// actually visible and has real dimensions (not display:none).
function ensureEmergencyMap(){
  const container = document.getElementById('emgMapCanvas');
  if(!container) return;

  if(!mapsApiReady){
    console.warn('[Doppy] Waiting for the Google Maps API to load...');
    showEmgMapBadge('Loading map...', true);
    setTimeout(ensureEmergencyMap, 300);
    return;
  }

  requestAnimationFrame(() => {
    if(container.offsetWidth === 0 || container.offsetHeight === 0){
      console.warn('[Doppy] Map container still has no dimensions, retrying...');
      setTimeout(ensureEmergencyMap, 150);
      return;
    }

    if(!emgMap){
      console.log('[Doppy] Initializing emergency map (lazy init)');
      emgMap = new google.maps.Map(container, {
        center: EMG_DEFAULT_CENTER,
        zoom: 12,
        disableDefaultUI: true,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
      });
      placesService = new google.maps.places.PlacesService(emgMap);
      directionsService = new google.maps.DirectionsService();
      directionsRenderer = new google.maps.DirectionsRenderer({
        suppressMarkers: true,
        preserveViewport: false,
        polylineOptions: { strokeColor: '#2e86d6', strokeWeight: 5, strokeOpacity: 0.9 }
      });
      directionsRenderer.setMap(emgMap);
    } else {
      google.maps.event.trigger(emgMap, 'resize');
      if(emgUserLocation) emgMap.setCenter(emgUserLocation);
    }

    if(!emgUserLocation){
      locateUserAndFindClinics();
    }
    showEmgMapBadge('', false);
  });
}

function locateUserAndFindClinics(){
  showEmgLocationStatus('Detecting your location...', 'loading');
  showEmgMapBadge('Detecting your location...', true);

  if(!navigator.geolocation){
    console.warn('[Doppy] Geolocation not available in this browser');
    showEmgLocationStatus('Geolocation is not available in this browser. We cannot show you nearby vets without your location.', 'error');
    showEmgMapBadge('', false);
    emergencyClinics = [];
    renderEmergencyClinics();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      emgUserLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      console.log('[Doppy] Location detected:', emgUserLocation);
      placeUserMarker();
      if(emgMap){ emgMap.setCenter(emgUserLocation); emgMap.setZoom(13); }
      searchNearbyVets();
    },
    (err) => {
      console.error('[Doppy] Geolocation error:', err);
      showEmgLocationStatus('Could not detect your location. Enable it in your browser settings and press retry.', 'error');
      showEmgMapBadge('', false);
      emergencyClinics = [];
      renderEmergencyClinics();
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

function placeUserMarker(){
  if(!emgMap) return;
  if(emgUserMarker) emgUserMarker.setMap(null);
  emgUserMarker = new google.maps.Marker({
    position: emgUserLocation,
    map: emgMap,
    title: 'Your location',
    zIndex: 999,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: '#2e86d6',
      fillOpacity: 1,
      strokeColor: '#fff',
      strokeWeight: 3,
      scale: 9
    }
  });
}

function haversineDistanceKm(lat1, lon1, lat2, lon2){
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateDriveTime(km){
  const minutes = Math.max(3, Math.round((km / 35) * 60)); // ~35 km/h average city speed
  return minutes + ' min drive';
}

function searchNearbyVets(){
  if(!emgUserLocation){ return; }
  if(!placesService){ searchNearbyVetsOSM(); return; }
  showEmgLocationStatus('Searching for nearby vets...', 'loading');
  showEmgMapBadge('Searching for nearby vets...', true);

  placesService.nearbySearch({
    location: emgUserLocation,
    radius: 8000,
    type: 'veterinary_care'
  }, (results, status) => {
    if(status !== google.maps.places.PlacesServiceStatus.OK || !results || !results.length){
      console.warn('[Doppy] Places Nearby Search found no vets. Status:', status);
      if(status === 'REQUEST_DENIED'){
        console.error('[Doppy] ❌ REQUEST_DENIED: check that the "Places API" is ENABLED in Google Cloud Console and that billing is active for that project. Also check the API key restrictions (HTTP referrers / allowed APIs).');
      } else if(status === 'ZERO_RESULTS'){
        console.warn('[Doppy] ZERO_RESULTS: Google found no vets within an 8km radius of your current location.');
      } else if(status === 'OVER_QUERY_LIMIT'){
        console.error('[Doppy] ❌ OVER_QUERY_LIMIT: the API quota was exceeded, or billing is not active on the Google Cloud project.');
      }
      console.log('[Doppy] Switching to OpenStreetMap search near your real location...');
      searchNearbyVetsOSM();
      return;
    }

    const allClinics = results.map((r) => {
      const loc = r.geometry && r.geometry.location;
      const lat = loc ? loc.lat() : null;
      const lng = loc ? loc.lng() : null;
      const distKm = (lat != null) ? haversineDistanceKm(emgUserLocation.lat, emgUserLocation.lng, lat, lng) : null;
      return {
        id: r.place_id,
        placeId: r.place_id,
        name: r.name, // real original name returned by Google Places
        status: r.opening_hours ? (r.opening_hours.open_now ? 'open' : 'closed') : 'unknown',
        h24: false,
        distance: distKm != null ? distKm.toFixed(1) + ' km' : '—',
        distanceValue: distKm != null ? distKm : 9999,
        time: distKm != null ? estimateDriveTime(distKm) : '—',
        species: r.vicinity || 'Veterinary consultation',
        rating: r.rating ? `${r.rating} (${r.user_ratings_total || 0})` : 'No rating',
        phone: null,
        lat, lng
      };
    }).sort((a, b) => a.distanceValue - b.distanceValue);

    // Only vets that are OPEN right now are shown, sorted nearest to farthest.
    const openClinics = allClinics.filter(c => c.status === 'open');

    if(openClinics.length){
      emergencyClinics = openClinics;
      showEmgLocationStatus('✓ Location detected', 'ok');
    } else {
      // If none show as open (or Places doesn't report hours), show the nearest ones anyway.
      emergencyClinics = allClinics;
      showEmgLocationStatus('✓ Location detected — no confirmed open vets, showing the nearest ones', 'ok');
    }
    emergencyState.selectedClinicId = emergencyClinics[0] ? emergencyClinics[0].id : null;

    console.log('[Doppy] Nearby vets found:', allClinics.length, '| open:', openClinics.length);
    showEmgMapBadge('', false);
    renderEmergencyClinics();

    // Fetch phone number (and precise hours) for the visible clinics via getDetails
    emergencyClinics.slice(0, 8).forEach(fetchClinicDetails);
  });
}

function fetchClinicDetails(clinic){
  if(!placesService || !clinic.placeId) return;
  placesService.getDetails({
    placeId: clinic.placeId,
    fields: ['formatted_phone_number', 'international_phone_number', 'opening_hours']
  }, (place, status) => {
    if(status === google.maps.places.PlacesServiceStatus.OK && place){
      clinic.phone = place.formatted_phone_number || place.international_phone_number || null;
      if(place.opening_hours){
        const wasOpen = clinic.status === 'open';
        clinic.status = place.opening_hours.open_now ? 'open' : 'closed';
        const periods = place.opening_hours.periods || [];
        clinic.h24 = periods.some(p => p.open && p.open.time === '0000' && !p.close);
        // If the precise check shows it's actually closed, remove it from the visible list.
        if(wasOpen && clinic.status === 'closed'){
          emergencyClinics = emergencyClinics.filter(c => c.id !== clinic.id);
          if(emergencyState.selectedClinicId === clinic.id){
            emergencyState.selectedClinicId = emergencyClinics[0] ? emergencyClinics[0].id : null;
          }
          console.log('[Doppy] Removed from list (actually closed):', clinic.name);
        }
      }
      renderEmergencyClinics();
    }
  });
}

// Fallback if Google Places fails: instead of fixed data for a single city,
// query OpenStreetMap (Overpass API, free and no billing needed) to find
// REAL nearby vets around the user's current location, wherever that is.
async function searchNearbyVetsOSM(){
  if(!emgUserLocation) return;
  showEmgLocationStatus('Searching for nearby vets (OpenStreetMap)...', 'loading');
  showEmgMapBadge('Searching for nearby vets...', true);
  const { lat, lng } = emgUserLocation;
  const query = `[out:json][timeout:25];(node["amenity"="veterinary"](around:12000,${lat},${lng});way["amenity"="veterinary"](around:12000,${lat},${lng}););out center tags;`;

  try{
    const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query });
    if(!res.ok) throw new Error('Overpass HTTP ' + res.status);
    const data = await res.json();
    const elements = data.elements || [];

    if(!elements.length){
      console.warn('[Doppy] OpenStreetMap also found no registered vets within 12km');
      showEmgLocationStatus('✓ Location detected — no registered vets found near you', 'ok');
      showEmgMapBadge('', false);
      emergencyClinics = [];
      renderEmergencyClinics();
      return;
    }

    const clinics = elements.map(el => {
      const elLat = el.lat ?? (el.center && el.center.lat);
      const elLng = el.lon ?? (el.center && el.center.lon);
      const tags = el.tags || {};
      const distKm = (elLat != null) ? haversineDistanceKm(lat, lng, elLat, elLng) : 9999;
      const addressParts = [tags['addr:street'], tags['addr:housenumber'], tags['addr:city']].filter(Boolean);
      return {
        id: 'osm-' + el.id,
        placeId: null,
        name: tags.name || tags['name:es'] || 'Vet clinic (name not registered on the map)',
        status: 'unknown', // OpenStreetMap doesn't reliably report live hours
        h24: false,
        distance: distKm.toFixed(1) + ' km',
        distanceValue: distKm,
        time: estimateDriveTime(distKm),
        species: addressParts.length ? addressParts.join(' ') : 'Approximate location',
        rating: 'No rating (source: OpenStreetMap)',
        phone: tags.phone || tags['contact:phone'] || null,
        lat: elLat, lng: elLng
      };
    }).sort((a, b) => a.distanceValue - b.distanceValue).slice(0, 12);

    emergencyClinics = clinics;
    emergencyState.selectedClinicId = clinics[0] ? clinics[0].id : null;
    console.log('[Doppy] Real nearby vets found via OpenStreetMap:', clinics.length);
    showEmgLocationStatus('✓ Location detected — real nearest vets to you', 'ok');
    showEmgMapBadge('', false);
    renderEmergencyClinics();
  }catch(err){
    console.error('[Doppy] Error querying OpenStreetMap:', err);
    showEmgLocationStatus('Could not load nearby vets right now. Try again.', 'error');
    showEmgMapBadge('', false);
    emergencyClinics = [];
    renderEmergencyClinics();
  }
}

function plotClinicMarkers(){
  if(!emgMap) return;
  emgClinicMarkers.forEach(m => m.setMap(null));
  emgClinicMarkers = [];
  emergencyClinics.forEach((c, i) => {
    if(c.lat == null || c.lng == null) return;
    const selected = emergencyState.selectedClinicId === c.id;
    const marker = new google.maps.Marker({
      position: { lat: c.lat, lng: c.lng },
      map: emgMap,
      title: c.name,
      label: { text: String(i + 1), color: '#fff', fontWeight: '700', fontSize: '12px' },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: '#dc2626', // all vet clinics are marked in red
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: selected ? 4 : 2,
        scale: selected ? 16 : 14
      },
      zIndex: selected ? 500 : 1
    });
    marker.addListener('click', () => selectEmergencyClinic(c.id));
    emgClinicMarkers.push(marker);
  });
}

function renderEmergencyClinics(){
  const el = document.getElementById('emgVetList');
  if(!el) return;
  el.innerHTML = emergencyClinics.map((c, i) => `
    <div class="emg-vet-item ${emergencyState.selectedClinicId === c.id ? 'selected' : ''}" onclick="selectEmergencyClinic('${c.id}')">
      <div class="num">${i+1}</div>
      <div class="info">
        <h4>${c.name}</h4>
        <div style="margin-bottom:4px;">
          <span class="emg-tag ${c.status === 'open' ? 'open' : (c.status === 'closed' ? 'closed' : '')}">${c.status === 'open' ? 'Open' : (c.status === 'closed' ? 'Closed' : 'Hours not available')}</span>
          ${c.h24 ? '<span class="emg-tag h24">24/7 Emergencies</span>' : ''}
        </div>
        <p>${c.distance} · ${c.time} · ${c.species}</p>
        <p>⭐ ${c.rating}</p>
      </div>
   
    </div>
  `).join('');
  plotClinicMarkers();
  renderEmergencySelectedClinic();
}
function selectEmergencyClinic(id){
  emergencyState.selectedClinicId = id;
  renderEmergencyClinics();
  const clinic = emergencyClinics.find(c => c.id === id);
  if(clinic && clinic.lat != null && emgMap){
    emgMap.panTo({ lat: clinic.lat, lng: clinic.lng });
  }
}

// Draws the real route inside the same embedded map (without leaving the app),
// using Google Maps' DirectionsService. If for any reason it can't be
// calculated (no Directions API, no location, etc.) the person is warned and
// the "Open in Google Maps" button remains as a fallback for turn-by-turn navigation.
function drawRouteToClinic(clinic){
  if(!emgMap || !emgUserLocation){
    showToast('We do not have your location yet to calculate the route');
    return;
  }
  if(clinic.lat == null || clinic.lng == null){
    showToast('This clinic does not have exact coordinates yet, use "Open in Google Maps"');
    return;
  }
  if(!directionsService || !directionsRenderer){
    console.warn('[Doppy] DirectionsService is not ready yet');
    showToast('The map is still loading, try again in a moment');
    return;
  }

  emgActiveRouteClinicId = clinic.id;
  showEmgMapBadge('Calculating route...', true);

  directionsService.route({
    origin: emgUserLocation,
    destination: { lat: clinic.lat, lng: clinic.lng },
    travelMode: google.maps.TravelMode.DRIVING
  }, (result, status) => {
    showEmgMapBadge('', false);
    if(status === 'OK' && result.routes && result.routes.length){
      directionsRenderer.setDirections(result);
      const leg = result.routes[0].legs[0];
      clinic.distance = leg.distance.text;
      clinic.time = leg.duration.text;
      console.log('[Doppy] Route calculated on the map towards', clinic.name, '-', leg.distance.text, leg.duration.text);
      renderEmergencyClinics();
    } else {
      console.error('[Doppy] Could not calculate the route on the map. Status:', status);
      showToast('Could not plot the route on the map — you can use "Open in Google Maps"');
    }
  });
}

function viewRouteOnMap(id){
  selectEmergencyClinic(id);
  const clinic = emergencyClinics.find(c => c.id === id);
  if(!clinic){ showToast('Select a clinic first'); return; }
  drawRouteToClinic(clinic);
}

function renderEmergencySelectedClinic(){
  const el = document.getElementById('emgVetSelectedPanel');
  if(!el) return;
  const clinic = emergencyClinics.find(c => c.id === emergencyState.selectedClinicId);
  if(!clinic){
    el.innerHTML = '<p style="color:var(--text-muted); font-size:13px;">Select a clinic.</p>';
    return;
  }
  el.innerHTML = `
    <h3 style="margin:0 0 10px; font-size:15px;">Clinic information</h3>
    <h4 style="margin:0 0 6px; font-size:14.5px;">${clinic.name}</h4>
    <div style="margin-bottom:8px;">
      <span class="emg-tag ${clinic.status === 'open' ? 'open' : (clinic.status === 'closed' ? 'closed' : '')}">${clinic.status === 'open' ? 'Open now' : (clinic.status === 'closed' ? 'Closed' : 'Hours not available')}</span>
      ${clinic.h24 ? '<span class="emg-tag h24">24/7 Emergencies</span>' : ''}
    </div>
    <p style="margin:4px 0; font-size:13px; color:var(--text-muted);">📍 ${clinic.distance} · ${clinic.time}</p>
    <p style="margin:4px 0; font-size:13px; color:var(--text-muted);">📞 ${clinic.phone || 'Not available'}</p>
    <p style="margin:4px 0 12px; font-size:13px; color:var(--text-muted);">⭐ ${clinic.rating}</p>
    ${emgActiveRouteClinicId === clinic.id ? '<p style="margin:0 0 10px; font-size:12px; color:var(--blue-mid); font-weight:700;">🧭 Route shown on the map above</p>' : ''}
    <div style="display:flex; gap:8px; margin-bottom:8px;">
      <button class="btn-primary" style="flex:1; justify-content:center;" onclick="callClinic('${clinic.id}')">📞 Call</button>
      <button class="btn-primary" style="flex:1; justify-content:center;" onclick="viewRouteOnMap('${clinic.id}')">🧭 View route</button>
    </div>
    <button class="btn-outline" style="width:100%; justify-content:center; display:flex;" onclick="handleEmergencyNavigate()">📍 Open in Google Maps</button>
  `;
}

function buildDirectionsUrl(clinic){
  if(clinic.placeId){
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(clinic.name)}&destination_place_id=${clinic.placeId}`;
  }
  if(clinic.lat != null && clinic.lng != null){
    return `https://www.google.com/maps/dir/?api=1&destination=${clinic.lat},${clinic.lng}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(clinic.name)}`;
}

function handleEmergencyNavigate(){
  const clinic = emergencyClinics.find(c => c.id === emergencyState.selectedClinicId);
  if(!clinic){ showToast('Select a clinic first'); return; }
  console.log('[Doppy] Opening route towards:', clinic.name);
  window.open(buildDirectionsUrl(clinic), '_blank');
}
function callClinic(id){
  const clinic = emergencyClinics.find(c => c.id === id);
  if(!clinic){ showToast('Select a clinic first'); return; }
  if(clinic.phone){
    console.log('[Doppy] Calling:', clinic.name, clinic.phone);
    window.location.href = 'tel:' + clinic.phone.replace(/[^\d+]/g, '');
  } else {
    showToast(`${clinic.name} — phone number not available`);
  }
}
function handleEmergencyCall(){
  const clinic = emergencyClinics.find(c => c.id === emergencyState.selectedClinicId);
  if(!clinic){ showToast('Select a clinic first'); return; }
  callClinic(clinic.id);
}
function handleEmergencyViewRoute(){
  const clinic = emergencyClinics.find(c => c.id === emergencyState.selectedClinicId);
  if(!clinic){ showToast('Select a clinic first'); return; }
  drawRouteToClinic(clinic);
}
async function handleEmergencyNotifyVet(){
  showToast('Notifying your primary veterinarian...');
  if(USE_SUPABASE){
    try{
      const { error } = await supabaseClient.from('emergency_alerts').insert([{ mascota_id: emergencyState.selectedPetId, clinica_id: emergencyState.selectedClinicId }]);
      if(error) throw error;
    }catch(err){ console.error('[Doppy][Supabase] Error notifying veterinarian:', err); }
  }
}

/* =========================================================================
   EMERGENCY — SHARE MEDICAL RECORD VIA QR CODE (with configurable expiration)
   The QR itself contains a token with the emergency data and the expiration
   date, so it works on any device without needing a session or a Supabase
   connection. If Supabase is available, a record is also saved in
   `emergency_shares` so it can be revoked from the backend.
   ========================================================================= */
let emgShareState = { token: null, url: null, expiresAt: null, countdownTimer: null };

function openShareDurationModal(){
  openModal(`
    <h3>⏱️ How long do you want to share the record for?</h3>
    <p style="font-size:13px; color:var(--text-muted); margin:-8px 0 16px;">After that time, the QR code and the link will stop working automatically.</p>
    <div class="form-group">
      <label>Duration</label>
      <select id="share_duration">
        <option value="15">15 minutes</option>
        <option value="60" selected>1 hour</option>
        <option value="360">6 hours</option>
        <option value="1440">24 hours</option>
        <option value="4320">3 days</option>
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="generateEmergencyShareQr()">Generate QR</button>
    </div>
  `);
}

async function generateEmergencyShareQr(){
  const minutes = parseInt(document.getElementById('share_duration').value, 10) || 60;
  const pet = pets.find(p => p.id === emergencyState.selectedPetId) || getProfileSelectedPet();
  if(!pet){ showToast('Select a pet first'); closeModal(); return; }
  if(!USE_SUPABASE){ showToast('A Supabase connection is required to generate a live share link'); closeModal(); return; }

  const expiresAt = new Date(Date.now() + minutes * 60 * 1000);
  const token = (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  try{
    const { error } = await supabaseClient.from('emergency_shares').insert([{
      token, mascota_id: pet.id, expires_at: expiresAt.toISOString(), revoked: false
    }]);
    if(error) throw error;
  }catch(err){
    console.error('[Doppy][Supabase] Error creating the share link:', err);
    showToast('Could not generate the QR code');
    return;
  }

  const url = `${location.origin}${location.pathname}?share=${token}`;
  emgShareState.token = token;
  emgShareState.url = url;
  emgShareState.expiresAt = expiresAt.getTime();

  closeModal();
  renderShareQr();
  showToast('QR code generated — valid for ' + minutes + ' minutes');
  console.log('[Doppy] Live emergency share generated for', pet.name, '- expires:', expiresAt.toLocaleString());
}

function renderShareQr(){
  const initialEl = document.getElementById('emgShareInitial');
  const activeEl = document.getElementById('emgShareActive');
  const qrCanvas = document.getElementById('emgQrCanvas');
  if(!initialEl || !activeEl || !qrCanvas) return;

  if(!emgShareState.token){
    initialEl.style.display = 'block';
    activeEl.style.display = 'none';
    clearInterval(emgShareState.countdownTimer);
    return;
  }

  initialEl.style.display = 'none';
  activeEl.style.display = 'block';
  qrCanvas.innerHTML = '';

  // The QR image is generated with an image service (no JS library
  // dependency that could fail to load) — it only needs an internet connection.
  const qrImg = document.createElement('img');
  qrImg.width = 170;
  qrImg.height = 170;
  qrImg.alt = 'QR code for the emergency record';
  qrImg.style.display = 'block';
  qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=170x170&data=' + encodeURIComponent(emgShareState.url);
  qrImg.onerror = () => {
    console.error('[Doppy] Could not load the QR code image (check your internet connection)');
    qrCanvas.innerHTML = '<p style="font-size:12px; color:var(--text-muted); max-width:170px;">Could not generate the QR image — check your internet connection. Meanwhile, use the link below.</p>';
  };
  qrCanvas.appendChild(qrImg);

  // Important notice: if this file is opened locally (file://) instead of
  // being hosted on a server with https, the generated link won't open from
  // another phone when scanning the QR — it will only work once the app is published.
  const isLocalFile = location.protocol === 'file:';
  let warningEl = document.getElementById('emgShareLocalWarning');
  if(isLocalFile){
    if(!warningEl){
      warningEl = document.createElement('p');
      warningEl.id = 'emgShareLocalWarning';
      warningEl.style.cssText = 'font-size:12px; color:#c23662; background:#fde3e9; padding:8px 12px; border-radius:8px; margin:0 0 14px;';
      warningEl.textContent = '⚠️ You are opening this file locally (file://). The QR generates fine, but it won\'t open from another phone until you upload this app to a server with https (e.g. Vercel, Netlify, or your own hosting).';
      qrCanvas.parentElement.insertBefore(warningEl, qrCanvas.parentElement.firstChild);
    }
    console.warn('[Doppy] ⚠️ File opened via file:// — the QR link (', emgShareState.url, ') will not be reachable from another device until the app is published on a real server.');
  } else if(warningEl){
    warningEl.remove();
  }

  const pet = pets.find(p => p.id === emergencyState.selectedPetId);
  const petNameEl = document.getElementById('emgShareInfoPet');
  const expiryEl = document.getElementById('emgShareInfoExpiry');
  if(petNameEl) petNameEl.textContent = pet ? pet.name : '—';
  if(expiryEl) expiryEl.textContent = new Date(emgShareState.expiresAt).toLocaleString();

  clearInterval(emgShareState.countdownTimer);
  emgShareState.countdownTimer = setInterval(updateShareCountdown, 1000);
  updateShareCountdown();
}

function updateShareCountdown(){
  const el = document.getElementById('emgShareCountdown');
  if(!el || !emgShareState.expiresAt) return;
  const remaining = emgShareState.expiresAt - Date.now();
  if(remaining <= 0){
    el.textContent = 'This QR code has already expired.';
    clearInterval(emgShareState.countdownTimer);
    return;
  }
  const totalSecs = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  el.textContent = hours > 0
    ? `Expires in ${hours}h ${mins}m`
    : `Expires in ${mins}m ${secs}s`;
}

function previewSharedRecord(){
  if(!emgShareState.url){ showToast('Generate a QR code first'); return; }
  console.log('[Doppy] Opening preview of the shared record in a new tab:', emgShareState.url);
  const win = window.open(emgShareState.url, '_blank');
  if(!win){
    showToast('Your browser blocked the new window. Enable pop-ups or use "Copy link" and paste it in a new tab.');
  }
}

function copyShareLink(){
  if(!emgShareState.url){ showToast('Generate a QR code first'); return; }
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(emgShareState.url)
      .then(() => showToast('Link copied to clipboard'))
      .catch(() => showToast('Could not copy automatically — copy the link manually'));
  } else {
    showToast('Your browser does not allow copying automatically — copy the link manually');
  }
}

async function revokeShareLink(){
  const oldToken = emgShareState.token;
  clearInterval(emgShareState.countdownTimer);
  emgShareState = { token: null, url: null, expiresAt: null, countdownTimer: null };
  renderShareQr();
  showToast('Link revoked — the QR will no longer be valid');
  if(USE_SUPABASE && oldToken){
    try{
      const { error } = await supabaseClient.from('emergency_shares').update({ revoked: true }).eq('token', oldToken);
      if(error) throw error;
    }catch(err){ console.warn('[Doppy][Supabase] Could not mark the share as revoked:', err); }
  }
}

/* ---- Read-only view that opens when scanning the QR (?share=TOKEN) ---- */
async function fetchLiveMedicalRecord(petId){
  const { data: pet, error } = await supabaseClient
    .from('pets')
    .select('id, pet_name, petTypes, pet_breed, pet_gender, pet_age, pet_year, owner_id, assigned_veterinarian_id')
    .eq('id', petId)
    .maybeSingle();
  if (error || !pet) return null;

  const { data: owner } = await supabaseClient
    .from('users').select('name, phone').eq('id_client', pet.owner_id).maybeSingle();

  let vetName = 'No affiliated vet', vetPhone = '—';
  if (pet.assigned_veterinarian_id) {
    const { data: vet } = await supabaseClient
      .from('veterinary_staff').select('nombre, telefono').eq('id', pet.assigned_veterinarian_id).maybeSingle();
    if (vet) { vetName = vet.nombre || vetName; vetPhone = vet.telefono || vetPhone; }
  }

  // medical_records es opcional — si todavía no existe esa tabla, se
  // muestra el mensaje por defecto en vez de romper la carga.
  let medicalSummary = 'No medical information on file yet.';
  try {
    const { data: med, error: medErr } = await supabaseClient
      .from('medical_records').select('*').eq('mascota_id', petId).maybeSingle();
    if (!medErr && med) {
      medicalSummary = `Allergies: ${med.alergias || 'None on file'}\nConditions: ${med.condiciones || 'None on file'}\nMedications: ${med.medicamentos || 'None on file'}`;
    }
  } catch (e) { /* tabla no disponible todavía, se mantiene el default */ }

  return {
    name: pet.pet_name || 'Pet',
    species: speciesToEmoji(pet.petTypes),
    breed: pet.pet_breed || '—',
    gender: genderToSymbol(!!pet.pet_gender),
    age: ageToText(pet.pet_age ?? 0, pet.pet_year !== false),
    medicalSummary,
    ownerName: owner?.name || 'No name on file',
    ownerPhone: owner?.phone || '—',
    vetName, vetPhone
  };
}

// Ahora consulta Supabase EN VIVO en cada escaneo, en vez de decodificar
// una "foto" de los datos guardada dentro del link. El token solo es una
// llave de acceso: se valida contra "emergency_shares" (vencido/revocado)
// y recién ahí se traen los datos reales y actuales de la mascota.
async function checkForSharedRecordView(){
  const params = new URLSearchParams(location.search);
  const token = params.get('share');
  if(!token) return false;

  if(!USE_SUPABASE){
    renderSharedRecordMessage('❌', 'Not available', 'This preview needs an internet connection to Supabase.');
    return true;
  }

  try{
    const { data: share, error } = await supabaseClient
      .from('emergency_shares')
      .select('mascota_id, expires_at, revoked')
      .eq('token', token)
      .maybeSingle();

    if (error || !share) {
      console.error('[Doppy] Invalid or unknown share token:', error);
      renderSharedRecordMessage('❌', 'Invalid link', 'This emergency record link is not valid or is corrupted.');
      return true;
    }
    if (share.revoked) {
      renderSharedRecordMessage('🚫', 'Link revoked', 'The pet owner has revoked access to this record.');
      return true;
    }
    if (new Date(share.expires_at) < new Date()) {
      console.warn('[Doppy] The shared record has already expired:', share.expires_at);
      renderSharedRecordMessage('⏳', 'Expired link', 'This QR code has already expired. Ask the pet owner to generate a new one.');
      return true;
    }

    const liveData = await fetchLiveMedicalRecord(share.mascota_id);
    if (!liveData) {
      renderSharedRecordMessage('❌', 'Record not found', 'This pet no longer exists.');
      return true;
    }
    liveData.expiresAt = new Date(share.expires_at).getTime();

    console.log('[Doppy] Showing LIVE shared emergency record for', liveData.name);
    renderSharedRecordView(liveData);
  }catch(err){
    console.error('[Doppy] Error loading the shared record:', err);
    renderSharedRecordMessage('❌', 'Something went wrong', 'Could not load this record right now. Try again.');
  }
  return true;
}

function renderSharedRecordMessage(icon, title, message){
  document.body.innerHTML = `
    <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; font-family:'Segoe UI',Roboto,Arial,sans-serif; background:#f4f8fb;">
      <div style="max-width:420px; text-align:center; background:#fff; border:1px solid #e3edf5; border-radius:16px; padding:36px 28px; box-shadow:0 4px 14px rgba(20,60,100,.06);">
        <div style="font-size:42px; margin-bottom:14px;">${icon}</div>
        <h2 style="margin:0 0 10px; color:#12324f; font-size:20px;">${title}</h2>
        <p style="color:#6b8299; font-size:14px; margin:0; line-height:1.6;">${message}</p>
      </div>
    </div>
  `;
}

function renderSharedRecordView(payload){
  const expiresDate = new Date(payload.expiresAt).toLocaleString();
  document.body.innerHTML = `
    <div style="min-height:100vh; background:#f4f8fb; font-family:'Segoe UI',Roboto,Arial,sans-serif; padding:24px 16px;">
      <div style="max-width:480px; margin:0 auto;">
        <div style="background:#fde8e8; border-radius:14px; padding:16px 20px; margin-bottom:20px; display:flex; gap:14px; align-items:flex-start;">
          <div style="width:42px;height:42px;border-radius:50%;background:#dc2626;color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">🚨</div>
          <div>
            <h2 style="margin:0 0 4px; font-size:18px; color:#dc2626;">Emergency record</h2>
            <p style="margin:0; font-size:13px; color:#9d3b3b;">Temporarily shared by the pet owner — read-only access.</p>
          </div>
        </div>

        <div style="background:#fff; border:1px solid #e3edf5; border-radius:16px; padding:20px 22px; margin-bottom:16px;">
          <h3 style="margin:0 0 12px; font-size:16px; color:#12324f;">🐾 ${payload.name || 'Pet'}</h3>
          <p style="margin:4px 0; font-size:14px; color:#6b8299;">${payload.species || ''} ${payload.breed || ''} · ${payload.gender || ''} · ${payload.age || ''}</p>
          <hr style="border:none; border-top:1px solid #eef3f8; margin:14px 0;">
          <p style="margin:0 0 6px; font-size:13px; font-weight:700; color:#dc2626;">⚠️ Emergency medical summary</p>
          <p style="margin:0; font-size:13.5px; color:#12324f; white-space:pre-line; line-height:1.6;">${(payload.medicalSummary || payload.allergies || 'No medical information on file.')}</p>
        </div>

        <div style="background:#fff; border:1px solid #e3edf5; border-radius:16px; padding:20px 22px; margin-bottom:16px;">
          <h3 style="margin:0 0 12px; font-size:15px; color:#12324f;">👤 Owner</h3>
          <p style="margin:4px 0; font-size:13.5px; color:#12324f;">${payload.ownerName || '—'}</p>
          <p style="margin:4px 0; font-size:13.5px;"><a href="tel:${(payload.ownerPhone||'').replace(/[^\d+]/g,'')}" style="color:#2e86d6; font-weight:600; text-decoration:none;">📞 ${payload.ownerPhone || '—'}</a></p>
        </div>

        <div style="background:#fff; border:1px solid #e3edf5; border-radius:16px; padding:20px 22px; margin-bottom:16px;">
          <h3 style="margin:0 0 12px; font-size:15px; color:#12324f;">🏥 Regular veterinarian</h3>
          <p style="margin:4px 0; font-size:13.5px; color:#12324f;">${payload.vetName || 'No affiliated vet'}</p>
          <p style="margin:4px 0; font-size:13.5px;"><a href="tel:${(payload.vetPhone||'').replace(/[^\d+]/g,'')}" style="color:#2e86d6; font-weight:600; text-decoration:none;">📞 ${payload.vetPhone || '—'}</a></p>
        </div>

        <p style="text-align:center; font-size:12px; color:#6b8299;">This link stops working on: ${expiresDate}</p>
      </div>
    </div>
  `;
}

/* =========================================================================
   USER PROFILE (name, phone, email, access code, age)
   ========================================================================= */
async function loadUserProfileFromSupabase(clientId){
  const nameEl = document.getElementById('profileUserName');
  const phoneEl = document.getElementById('profilePhone');
  const emailEl = document.getElementById('profileEmail');
  const accessCodeEl = document.getElementById('profileAccessCode');
  const ownerAgeEl = document.getElementById('profileOwnerAge');
  if(!nameEl) return;

  if(!USE_SUPABASE || clientId === null){
    nameEl.textContent = 'Sign in';
    return;
  }

  try{
    // FIX: .single() throws an error when it finds 0 rows (very common if the
    // id_client has no row in "users" yet, or if RLS blocks the select). With
    // .maybeSingle() 0 rows is a valid result (data = null) instead of a
    // generic error, so we can distinguish "the row doesn't exist" from
    // "Supabase rejected the query" and show the real reason on screen.
    // FIX: the column "contra" does not exist in your "users" table —
    // requesting it in the select broke the ENTIRE query (Postgres rejects
    // the whole select if a single column doesn't exist), which is why
    // name/email were also failing even though they do exist. It's removed
    // from the select; the access code is shown as a fixed placeholder since
    // a real password should never be read back.
    const { data, error } = await supabaseClient
      .from('users')
      .select('name, email')
      .eq('id_client', clientId)
      .maybeSingle();
    if(error) throw error;

    if(!data){
      nameEl.textContent = 'Profile not found';
      if(emailEl) emailEl.textContent = `No row in "users" for id_client = ${clientId} (check RLS or the value)`;
      return;
    }

    nameEl.textContent = data.name || 'No name';
    if(emailEl) emailEl.textContent = data.email || '—';
    if(accessCodeEl) accessCodeEl.textContent = '*********';
  }catch(err){
    console.error('[Doppy][Supabase] Error loading user profile:', err);
    nameEl.textContent = 'Error loading profile';
    if(emailEl) emailEl.textContent = err && err.message ? err.message : 'Unknown Supabase error';
  }
}

/* =========================================================================
   ASSOCIATED CLINIC(S) ("Details" card in profile)
   ========================================================================= */
async function loadAssociatedClinicsFromSupabase(clientId){
  const el = document.getElementById('profileAssocClinics');
  if(!el) return;
  if(!USE_SUPABASE || clientId === null){
    el.textContent = 'Sign in to see your affiliated clinics';
    return;
  }
  try{
    const { data: affs, error: affErr } = await supabaseClient
      .from('affiliations')
      .select('veterinary_id, status')
      .eq('id_client', clientId);
    if(affErr) throw affErr;

    const activeIds = (affs || []).filter(a => a.status === 'active').map(a => a.veterinary_id);
    if(!activeIds.length){
      el.textContent = 'No affiliated clinics (affiliate by scanning your vet\'s QR code)';
      return;
    }

    const { data: clinics, error: clinicErr } = await supabaseClient
      .from('veterinary')
      .select('id_veterinary, location, clinic_name')
      .in('id_veterinary', activeIds);
    if(clinicErr) throw clinicErr;

    el.textContent = (clinics || [])
      .map(c => c.location || c.clinic_name || ('Clinic #' + c.id_veterinary))
      .join(', ') || 'No affiliated clinics';
  }catch(err){
    console.error('[Doppy][Supabase] Error loading affiliated clinics:', err);
    el.textContent = 'Could not load your affiliated clinics';
  }
}

/* =========================================================================
   AFFILIATED CLINIC ("Vet features" card)
   ========================================================================= */
async function loadVetInfoFromSupabase(clientId){
  const nombreEl = document.getElementById('vetNombre');
  const veterinarioEl = document.getElementById('vetVeterinario');
  const lugarEl = document.getElementById('vetLugar');
  const telefonoEl = document.getElementById('vetTelefono');
  const hoursEl = document.getElementById('vetHours');
  if(!nombreEl) return;

  if(!USE_SUPABASE || clientId === null){
    hoursEl.innerHTML = '<div>Sign in to see your affiliated clinic</div>';
    renderVetPhoto(null);
    return;
  }

  try{
    const { data: affs, error: affErr } = await supabaseClient
      .from('affiliations')
      .select('veterinary_id, status, created_at')
      .eq('id_client', clientId)
      .order('created_at', { ascending: false });
    if(affErr) throw affErr;

    const activeAff = (affs || []).find(a => a.status === 'active');
    const pendingAff = (affs || []).find(a => a.status === 'pending');

    if(!activeAff){
      if(pendingAff){
        nombreEl.textContent = 'Affiliation pending approval';
        veterinarioEl.textContent = '—';
        lugarEl.textContent = '—';
        telefonoEl.textContent = '—';
        hoursEl.innerHTML = '<div>The clinic still needs to approve your request. You will see the clinic\'s info here once they accept it.</div>';
      } else {
        nombreEl.textContent = 'No affiliated clinic';
        veterinarioEl.textContent = '—';
        lugarEl.textContent = '—';
        telefonoEl.textContent = '—';
        hoursEl.innerHTML = '<div>You do not have an affiliated clinic yet</div>';
      }
      currentVetId = null;
      renderVetPhoto(null);
      return;
    }
    currentVetId = activeAff.veterinary_id;

    const { data: clinic, error: clinicErr } = await supabaseClient
      .from('veterinary')
      .select('*')
      .eq('id_veterinary', activeAff.veterinary_id)
      .maybeSingle();
    if(clinicErr) throw clinicErr;
    if(!clinic){
      nombreEl.textContent = 'Affiliated clinic not found';
      hoursEl.innerHTML = `<div>There is an affiliation but no row was found in "veterinary" with id_veterinary = ${activeAff.veterinary_id}</div>`;
      return;
    }

    const { data: staff, error: staffErr } = await supabaseClient
      .from('veterinary_staff')
      .select('nombre, telefono, email, rol')
      .eq('veterinary_id', activeAff.veterinary_id);
    if(staffErr) throw staffErr;
    const mainStaff = (staff || [])[0];

    nombreEl.textContent = clinic.clinic_name || ('Clinic #' + activeAff.veterinary_id);
    veterinarioEl.textContent = mainStaff?.nombre || clinic.email || '—';
    lugarEl.textContent = clinic.location || '—';
    telefonoEl.textContent = mainStaff?.telefono || '—';
    renderVetPhoto(clinic.photo_url || null);

    if(clinic.open){
      const openDate = new Date(clinic.open);
      hoursEl.innerHTML = isNaN(openDate) ? `<div>${clinic.open}</div>` : `<div>Open since: ${openDate.toLocaleString()}</div>`;
    } else {
      hoursEl.innerHTML = '<div>Hours not available</div>';
    }
  }catch(err){
    console.error('[Doppy][Supabase] Error loading affiliated clinic:', err);
    hoursEl.innerHTML = `<div>Error loading: ${err && err.message ? err.message : 'unknown error'}</div>`;
  }
}

let currentVetId = null;

function renderVetPhoto(photoUrl){
  const wrap = document.getElementById('vetPhotoWrap');
  const img = document.getElementById('vetPhotoImg');
  if(!wrap || !img) return;
  if(photoUrl){
    img.src = photoUrl;
    img.style.display = 'block';
    wrap.classList.add('has-photo');
  } else {
    img.style.display = 'none';
    wrap.classList.remove('has-photo');
  }
}

/* ---- Upload the affiliated clinic's photo to the "clinic-photos" bucket ---- */
async function handleVetPhotoUpload(file){
  if(!file) return;
  if(!currentVetId){ showToast('You need to be affiliated with a clinic first'); return; }
  if(!USE_SUPABASE){ showToast('Configure Supabase to be able to upload photos'); return; }

  showToast('Uploading clinic photo...');
  try{
    const fileExt = file.name.split('.').pop();
    const filePath = `${currentVetId}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabaseClient
      .storage
      .from('clinic-photos')
      .upload(filePath, file);
    if(uploadError) throw uploadError;

    const { data: publicUrlData } = supabaseClient
      .storage
      .from('clinic-photos')
      .getPublicUrl(filePath);
    const photoUrl = publicUrlData.publicUrl;

    const { error: updateError } = await supabaseClient
      .from('veterinary')
      .update({ photo_url: photoUrl })
      .eq('id_veterinary', currentVetId);
    if(updateError) throw updateError;

    renderVetPhoto(photoUrl);
    showToast('Clinic photo updated 🎉');
  }catch(err){
    console.error('[Doppy][Supabase] Error uploading clinic photo:', err);
    showToast('Could not upload the photo');
  }
}

async function loadAllDataFromSupabase(){
  if(!USE_SUPABASE){
    setDbStatus('', 'Using sample data (Supabase not configured)');
    return;
  }
  setDbStatus('', 'Connecting to Supabase...');

  let anyOk = false;
  let anyErr = false;

  currentClientId = await getCurrentClientId();

  // ---- pets: mapped to your real columns, including photo_url ----
  let petsQueryFailed = false;
  let petsRealCount = 0;
  try{
    let petsQuery = supabaseClient.from('pets').select('*').order('id');
    if(currentClientId !== null){
      petsQuery = petsQuery.eq('owner_id', currentClientId);
    }
    const { data, error } = await petsQuery;
    if(error) throw error;

    // FIX: previously, if the query succeeded but returned 0 rows (owner with
    // no pets registered, or the owner_id filter found nothing), the code
    // silently kept the mocks (Bruno/Luna) WITHOUT warning — and the badge
    // still said "Connected (live pets)", giving a false sense that it was
    // real data. Now it reflects reality: if Supabase responded fine but
    // there are no rows, pets[] is truly emptied (not mock).
    petsRealCount = (data || []).length;
    if(petsRealCount > 0){
      const storedPetId = Number(localStorage.getItem('pet_row_id') || localStorage.getItem('selectedPetId') || 0);
      pets = data.map(r => ({
        id: r.id,
        name: r.pet_name || 'No name',
        species: speciesToEmoji(r.petTypes),
        breed: r.pet_breed || '—',
        gender: genderToSymbol(!!r.pet_gender),
        age: ageToText(r.pet_age ?? 0, r.pet_year !== false),
        primary: false,
        photo: r.photo_url || null,
        allergies: r.allergies || null,
        assignedVeterinarianId: r.assigned_veterinarian_id || null
      }));
      const selectedPet = storedPetId ? pets.find(p => p.id === storedPetId) : null;
      if(selectedPet){
        selectedPet.primary = true;
        emergencyState.selectedPetId = selectedPet.id;
      } else if(pets.length){
        pets[0].primary = true;
        emergencyState.selectedPetId = pets[0]?.id ?? null;
        localStorage.setItem('selectedPetId', String(pets[0].id));
        localStorage.setItem('pet_row_id', String(pets[0].id));
      }
    } else {
      // Real, successful connection, but truly no pets for this user yet.
      pets = [];
      emergencyState.selectedPetId = null;
    }
    anyOk = true;
  }catch(err){
    console.error('[Doppy][Supabase] "pets" table not available:', err);
    anyErr = true;
    petsQueryFailed = true;
  }

  await loadVetInfoFromSupabase(currentClientId);
  await loadUserProfileFromSupabase(currentClientId);
  await loadAssociatedClinicsFromSupabase(currentClientId);
  await loadCalendarDataFromSupabase();
  await loadPostsFromSupabase();
  await loadVaccinationCardFromSupabase();
  await loadVaccinationTableFromSupabase();
  await loadPetVeterinarianCard();

  const optionalTables = [
    { table:'notifications', apply: (data) => { notifications = data.map(r => ({
        id:r.id_notification, title:r.title, desc:r.message, time:new Date(r.created_at).toLocaleString('en-US'),
        tag:r.type || 'Info', tagBg:'#ece9fb', tagColor:'#5b4fd6', icon:'🔔', iconBg:'#6b5ce0', unread:true
      })); }, order:'created_at', ascending:false }
  ];

  for(const t of optionalTables){
    try{
      let q = supabaseClient.from(t.table).select('*');
      q = q.order(t.order, { ascending: t.ascending !== false });
      const { data, error } = await q;
      if(error) throw error;
      if(data && data.length) t.apply(data);
      anyOk = true;
    }catch(err){
      console.warn(`[Doppy][Supabase] Table "${t.table}" not available yet, using the sample data.`);
    }
  }

  if(petsQueryFailed) setDbStatus('err', 'Error reading "pets" — check the console/RLS. Showing sample data.');
  else if(petsRealCount > 0) setDbStatus('ok', `Connected to Supabase — ${petsRealCount} real pet(s)`);
  else setDbStatus('', 'Connected to Supabase — this user has no pets registered yet');

  ensureSelectedPetInStorage();
  renderMyPets();
  renderSchedule();
  renderNotifications();
  renderVaccTable();
  renderCalendar();
  renderUpcoming();
  renderPosts();
  renderEmergencyPets();
}

/* =========================================================================
   MAIN BUTTON BINDINGS
   ========================================================================= */
document.getElementById('addPetBtn').addEventListener('click', openAddPetModal);
document.getElementById('addNewPetBtn2').addEventListener('click', openAddPetModal);
document.getElementById('newAppointmentBtn').addEventListener('click', openNewAppointmentModal);
document.getElementById('newEventBtn').addEventListener('click', openNewEventModal);

document.getElementById('petPhotoInput')?.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if(file) handleDashPetPhotoUpload(file);
});
document.getElementById('vetPhotoInput')?.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if(file) handleVetPhotoUpload(file);
});

/* =========================================================================
   ADDITIONAL ACTIONS
   ========================================================================= */

/* ---- Vet features: history ---- */
function openVetHistoryModal(){
  openModal(`
    <h3>📋 Visit history</h3>
    <div class="attr-row"><span class="ic">🩺</span><span class="lbl">Annual checkup</span><span class="val">Jan 12, 2025</span></div>
    <div class="attr-row"><span class="ic">💉</span><span class="lbl">Vaccination</span><span class="val">Sep 03, 2024</span></div>
    <div class="attr-row"><span class="ic">✂️</span><span class="lbl">Grooming</span><span class="val">Jul 20, 2024</span></div>
    <p style="font-size:12.5px; color:var(--text-muted); margin-top:10px;">Connected to table vet_visits(mascota_id, tipo, fecha, notas)</p>
    <div class="modal-actions"><button class="btn-primary" onclick="closeModal()">Close</button></div>
  `);
}

/* ---- Quick actions: Settings -> Profile + scroll ---- */
function goToSettings(){
  showView('profile', document.querySelector('[data-view="profile"]'));
  setTimeout(() => {
    const el = document.querySelectorAll('#view-profile .card')[4];
    if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
  }, 60);
}

/* ---- Profile: Edit inline fields ---- */
function editField(btnEl){
  const row = btnEl.closest('.info-row');
  const valueEl = row.querySelector('.value');
  if(valueEl.getAttribute('contenteditable') !== 'true'){ return; }
  valueEl.style.outline = '2px solid var(--blue-mid)';
  valueEl.style.borderRadius = '6px';
  valueEl.style.padding = '2px 6px';
  valueEl.focus();
  document.execCommand('selectAll', false, null);

  const finishEdit = async () => {
    valueEl.style.outline = 'none';
    valueEl.style.padding = '0';
    const field = valueEl.getAttribute('data-field');
    const value = valueEl.textContent.trim();
    showToast('Saved "' + field + '": ' + value);
    valueEl.removeEventListener('blur', finishEdit);
    if(USE_SUPABASE){
      try{
        const { error } = await supabaseClient.from('users').update({ [field]: value }).eq('id', 1);
        if(error) throw error;
      }catch(err){ console.error('[Doppy][Supabase] Error saving user field:', err); }
    }
  };
  valueEl.addEventListener('blur', finishEdit, {once:true});
}
function openAccessCodeModal(){
  openModal(`
    <h3>🪪 Change access code</h3>
    <div class="form-group"><label>Current code</label><input type="password" id="ac_current"></div>
    <div class="form-group"><label>New code</label><input type="password" id="ac_new"></div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="submitAccessCode()">Save code</button>
    </div>
  `);
}
function submitAccessCode(){
  const cur = document.getElementById('ac_current').value;
  const n = document.getElementById('ac_new').value;
  if(!cur || !n){ showToast('Please fill in both fields'); return; }
  closeModal();
  showToast('Access code updated');
}

/* ---- My Pets: View all (with option to remove) ---- */
function openAllPetsModal(){
  const rows = pets.map(p => `
    <div class="info-row">
      <div class="left">${p.species} ${p.name} ${p.primary ? '<span class="primary-tag">Primary</span>' : ''}</div>
      <div class="value">${p.breed} · ${p.gender} ${p.age}</div>
      <button class="btn-outline" onclick="deletePetFromModal(${p.id})">Remove</button>
    </div>
  `).join('') || '<p style="color:var(--text-muted); font-size:14px;">You have not added any pets yet.</p>';

  openModal(`
    <h3>🐾 All my pets</h3>
    ${rows}
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Close</button>
      <button class="btn-primary" onclick="closeModal(); openAddPetModal();">+ Add another pet</button>
    </div>
  `);
}
async function deletePetFromModal(id){
  pets = pets.filter(p => p.id !== id);
  renderMyPets();
  openAllPetsModal();
  showToast('Pet removed');
  if(USE_SUPABASE){
    try{
      const { error } = await supabaseClient.from('pets').delete().eq('id', id);
      if(error) throw error;
    }catch(err){ console.error('[Doppy][Supabase] Error deleting pet:', err); }
  }
}

/* ---- Vaccination card: real download ---- */
function downloadVaccinationCard(){
  const lines = [
    'DOPPY - Vaccination Card',
    '========================',
    ''
  ];
  vaccinations.forEach(v => {
    lines.push(`${v.name} | Applied: ${v.applied} | Next: ${v.next} | Status: ${v.status === 'ontime' ? 'On time' : 'Lost'}`);
  });
  const blob = new Blob([lines.join('\n')], {type:'text/plain'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'vaccination-card.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Vaccination card downloaded');
}

/* ---- Calendar / Pet Wall: Upcoming Events "View all" ---- */
function openAllEventsModal(){
  const sorted = [...events].sort((a,b) => a.date.localeCompare(b.date));
  const rows = sorted.map(e => `
    <div class="upcoming-item">
      <div class="ic" style="background:${e.type === 'event' ? '#fdf1d3' : 'var(--blue-pale)'};">${e.icon}</div>
      <div><h4>${e.title}</h4><p>📅 ${e.date} • ${e.time}</p><p>📍 ${e.place}</p></div>
    </div>
  `).join('') || '<p style="color:var(--text-muted); font-size:14px;">No events yet.</p>';

  openModal(`
    <h3>📅 All upcoming events</h3>
    ${rows}
    <div class="modal-actions"><button class="btn-primary" onclick="closeModal()">Close</button></div>
  `);
}

/* ---- Trending Tips: reales, sacados de los posts tipo "tip" del Pet Wall ---- */
function renderPetWallTrendingTips(){
  const el = document.getElementById('petWallTrendingTips');
  if(!el) return;
  const tips = posts.filter(p => p.tag === 'Veterinary Tip').sort((a,b) => b.likes - a.likes).slice(0, 5);
  if(!tips.length){
    el.innerHTML = `<li style="color:var(--text-muted); font-size:13px;">No vet tips posted yet.</li>`;
    return;
  }
  el.innerHTML = tips.map((t, i) => `
    <li style="cursor:pointer;" onclick="openTipDetail(${t.id})"><span class="num">${i+1}</span> ${t.title}</li>
  `).join('');
}
function openTrendingTipsModal(){
  const tips = posts.filter(p => p.tag === 'Veterinary Tip').sort((a,b) => b.likes - a.likes);
  const rows = tips.length
    ? tips.map(t => `<div class="attr-row" style="cursor:pointer;" onclick="closeModal();openTipDetail(${t.id})"><span class="ic">💡</span><span class="lbl" style="flex:1; font-weight:400;">${t.title}</span></div>`).join('')
    : `<p style="color:var(--text-muted); font-size:13.5px;">No vet tips posted yet.</p>`;
  openModal(`<h3>🔥 Trending Tips</h3>${rows}<div class="modal-actions"><button class="btn-primary" onclick="closeModal()">Close</button></div>`);
}
function openTipDetail(postId){
  const p = posts.find(x => x.id === postId);
  if(!p){ showToast('This tip is no longer available'); return; }
  openModal(`
    <h3>💡 ${p.title}</h3>
    <p style="font-size:12.5px; color:var(--text-muted); margin:-8px 0 14px;">By ${p.author} · ${p.time}</p>
    <p style="font-size:14px; line-height:1.7; color:var(--text-dark);">${p.text}</p>
    <div class="modal-actions"><button class="btn-primary" onclick="closeModal()">Got it</button></div>
  `);
}

/* ---- Upcoming Events (Pet Wall): reales, tabla "events" ---- */
/* ---- Upcoming Events (Pet Wall): sacado por privacidad — ver "Calendar" ---- */

/* =========================================================================
   INITIALIZATION
   ========================================================================= */
renderMyPets();
renderSchedule();
renderNotifications();
renderVaccTable();
renderCalendar();
renderUpcoming();
renderPosts();
showView('dashboard', document.querySelector('[data-view="dashboard"]'));

async function initApp(){
  if(!USE_SUPABASE){
    setDbStatus('', 'Using sample data (Supabase not configured)');
    return;
  }
  try{
    // If Supabase takes too long to respond (blocked network, CORS, paused
    // project, etc.) we don't leave the app waiting forever: after 6s it
    // releases and the app shows with sample data, with the reason on screen.
    const sessionPromise = supabaseClient.auth.getSession();
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ timedOut:true }), 6000));
    const result = await Promise.race([sessionPromise, timeoutPromise]);

    if(result && result.timedOut){
      console.error('[Doppy][Supabase] Timed out waiting for the session check.');
      setDbStatus('err', 'Supabase did not respond in time — check your connection/CORS');
      showToast('Supabase did not respond in time. Showing sample data.');
      return;
    }

    // No login screen: real data loads if there's a session, or sample data
    // is shown if there isn't (without blocking the person).
    await loadAllDataFromSupabase();

    // React to live session changes (e.g. if the token expires or the session ends in another tab)
    supabaseClient.auth.onAuthStateChange(() => {
      loadAllDataFromSupabase();
    });
  }catch(err){
    // Any failure here (paused project, invalid URL/key, CORS, blocked network...)
    // is shown on screen instead of staying only in the console.
    console.error('[Doppy][Supabase] Error checking the session:', err);
    setDbStatus('err', 'Supabase connection error');
    showToast('Supabase error: ' + (err && err.message ? err.message : 'could not connect'));
  }
}

(async function boot(){
  applyLanguage(localStorage.getItem('doppy_lang') || 'en');
  const handled = await checkForSharedRecordView();
  if(!handled){
    initApp();
    // Refresca eventos/turnos cada 5 minutos, sin que la persona tenga
    // que recargar la página para ver eventos públicos nuevos.
    setInterval(async () => {
      try{
        await loadCalendarDataFromSupabase();
        renderCalendar();
        renderUpcoming();
      }catch(err){ console.warn('[Doppy] Periodic events refresh failed:', err); }
    }, 5 * 60 * 1000);
  }
})();