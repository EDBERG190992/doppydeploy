/* ============================================================
   Doppy · Clínica Panel — app.js
   Contains: i18n, HTML body template, icons, data, and all
   application logic (rendering, modals, charts, PDF export).
   ============================================================ */

/* ============ SUPABASE ============
   IMPORTANTE: esta inicialización está envuelta en try/catch a propósito.
   Si la librería de Supabase no cargó (CDN bloqueado, sin internet, key
   inválida, etc.) el resto de la app se sigue mostrando igual — solo
   que sin datos reales — en vez de dejar la pantalla en blanco. */
// TODO: pegá tu anon/publishable key real acá.
const SUPABASE_URL = 'https://xyiebwrjkmvmcpdhenjk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5aWVid3Jqa212bWNwZGhlbmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NDc3OTMsImV4cCI6MjA5NzEyMzc5M30.ABcKRjoz9Cd5lSngSON8BblpBpljcPaZk-8lfh91RU8';

let supabaseClient = null;
try {
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    console.error('[Doppy] Supabase JS library did not load (check the CDN <script> tag in the HTML).');
  }
} catch (e) {
  console.error('[Doppy] Could not initialize the Supabase client:', e);
}

// Se resuelve con la sesión real de Supabase en loadCurrentAdminContext().
// El valor 1 solo se usa como demo/fallback si no hay sesión activa.
let CURRENT_VETERINARY_ID = 1;
// TODO: reemplazar por el staff_id real del admin logueado.
const CURRENT_STAFF_ID = null;
let currentAdminContext = { clinicNombre: null, email: null, isFallback: true };

/* ---------------------------------------------------------
   Busca la clínica real ligada a la sesión de Supabase activa
   (auth.users -> veterinary.auth_user_id). Si el admin llegó acá
   vía logindv, la sesión ya debería existir en el navegador.
   --------------------------------------------------------- */
async function loadCurrentAdminContext(){
  if (!supabaseClient) return;
  try {
    const { data: { user }, error: authErr } = await supabaseClient.auth.getUser();
    // Diagnóstico: esto se imprime SIEMPRE, así queda visible en la consola
    // sin tener que pegar nada a mano cuál es la sesión activa en este navegador.
    console.log('[Doppy][sesión activa] auth_user_id:', user?.id || '(sin sesión)', '| email:', user?.email || '(sin sesión)');
    if (authErr || !user) {
      console.warn('[Doppy] No active session — using demo clinic (id 1). Sign in via logindv to see real data.');
      return;
    }
    const { data: clinic, error } = await supabaseClient
      .from('veterinary')
      .select('id_veterinary, clinic_name, email')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (error || !clinic) {
      console.warn('[Doppy] Logged-in user has no matching row in "veterinary" — using demo clinic (id 1).', error);
      return;
    }
    CURRENT_VETERINARY_ID = clinic.id_veterinary;
    currentAdminContext = { clinicNombre: clinic.clinic_name, email: clinic.email || user.email, isFallback: false };
  } catch (e) {
    console.error('[Doppy] loadCurrentAdminContext failed:', e);
  }
}

function applyAdminContextToUI(){
  const clinicNombre = currentAdminContext.clinicNombre || 'Demo Clínica (not signed in)';
  const email = currentAdminContext.email || '—';
  const initials = clinicNombre.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'AD';

  setText('clinicNombreLabel', clinicNombre);
  setText('adminNombreLabel', clinicNombre);
  setText('adminModalNombre', clinicNombre);
  setText('adminModalCorreo', email);
  setText('adminModalClínica', clinicNombre);
  const avatar = document.getElementById('adminAvatarLabel');
  if (avatar) avatar.textContent = initials;
  const modalAvatar = document.getElementById('adminModalAvatar');
  if (modalAvatar) modalAvatar.textContent = initials;
}

/* ============ I18N ============ */
const translations = {
  en: {
    nav: { dashboard: 'Panel', pacientes: 'Pacientes', personal: 'Personal', afiliaciones: 'Afiliaciones', reportes: 'Informes', config: 'Configuración' },
    promo: { title: 'Improve every pet’s health 💙', text: 'Descubre todas las funciones que Doppy tiene para tu clínica.', button: 'Saber más' },
    logout: 'Cerrar sesión',
    topbar: { searchPlaceholder: 'Search patients, owners, affiliation codes...', clinic: 'Clínica Veterinaria Happy Paws' },
    profile: { myPerfil: 'Mi perfil', config: 'Configuración', logout: 'Cerrar sesión' },
    breadcrumbs: { dashboard: 'Panel', patients: 'Pacientes', patientsList: 'Lista de pacientes', config: 'Configuración', clinicInfo: 'Información de la clínica', reports: 'Informes' },
    patients: { title: 'Pacientes (Pets)', subtitle: 'Gestiona y revisa todas las mascotas registradas en tu clínica.', empty: 'No pets matched those filters.', noResults: 'No results found for this search' },
    filters: { more: 'More filters', clear: 'Limpiar' },
    pets: { table: { pet: 'Pet', species: 'Especie', breed: 'Raza', owner: 'Dueño', vet: 'Veterinario', vaccination: 'Vacunación', nextVisit: 'Próxima visita', actions: 'Acciones' } },
    config: { title: 'Configuración', subtitle: 'Gestiona y personaliza tu clínica y la plataforma Doppy.', clinicInfo: 'Información de la clínica', name: 'Nombre de la clínica', address: 'Dirección', city: 'Ciudad', province: 'Provincia', postalCódigo: 'Código postal', phone: 'Teléfono', email: 'Correo', website: 'Sitio web', language: 'Idioma', save: 'Guardar cambios', cancel: 'Cancelar', plan: 'Tu plan actual', planProfessional: 'Plan Profesional', users: 'Usuarios', patients: 'Pacientes', nextCharge: 'Próximo cobro', managePlan: 'Gestionar suscripción', help: '¿Necesitas ayuda?', helpText: 'Nuestro equipo está listo para ayudarte con cualquier duda.', contactSupport: 'Contactar soporte', toast: { saveSuccess: '✅ Changes saved successfully', discardChanges: 'Changes discarded', managePlan: 'Opening subscription management', contactSupport: 'Connecting to support…' } },
    states: { upToDate: 'Al día', upcoming: 'Próxima', overdue: 'Vencido', active: 'Activo', pending: 'Pendiente', expired: 'Expired', vacation: 'De vacaciones', inactive: 'Inactivo' },
    common: { ok: 'OK' }
  },
  es: {
    nav: { dashboard: 'Panel', pacientes: 'Pacientes', personal: 'Personal', afiliaciones: 'Afiliaciones', reportes: 'Informes', config: 'Configuración' },
    promo: { title: 'Improve every pet’s health 💙', text: 'Descubre todas las funciones que Doppy tiene para tu clínica.', button: 'Saber más' },
    logout: 'Cerrar sesión',
    topbar: { searchPlaceholder: 'Search patients, owners, affiliation codes...', clinic: 'Clínica Veterinaria Happy Paws' },
    profile: { myPerfil: 'Mi perfil', config: 'Configuración', logout: 'Cerrar sesión' },
    breadcrumbs: { dashboard: 'Panel', patients: 'Pacientes', patientsList: 'Lista de pacientes', config: 'Configuración', clinicInfo: 'Información de la clínica', reports: 'Informes' },
    patients: { title: 'Pacientes (Pets)', subtitle: 'Gestiona y revisa todas las mascotas registradas en tu clínica.', empty: 'No pets matched those filters.', noResults: 'No results found for this search' },
    filters: { more: 'More filters', clear: 'Limpiar' },
    pets: { table: { pet: 'Pet', species: 'Especie', breed: 'Raza', owner: 'Dueño', vet: 'Veterinario', vaccination: 'Vacunación', nextVisit: 'Próxima visita', actions: 'Acciones' } },
    config: { title: 'Configuración', subtitle: 'Gestiona y personaliza tu clínica y la plataforma Doppy.', clinicInfo: 'Información de la clínica', name: 'Nombre de la clínica', address: 'Dirección', city: 'Ciudad', province: 'Provincia', postalCódigo: 'Código postal', phone: 'Teléfono', email: 'Correo', website: 'Sitio web', language: 'Idioma', save: 'Guardar cambios', cancel: 'Cancelar', plan: 'Tu plan actual', planProfessional: 'Plan Profesional', users: 'Usuarios', patients: 'Pacientes', nextCharge: 'Próximo cobro', managePlan: 'Gestionar suscripción', help: '¿Necesitas ayuda?', helpText: 'Nuestro equipo está listo para ayudarte con cualquier duda.', contactSupport: 'Contactar soporte', toast: { saveSuccess: '✅ Changes saved successfully', discardChanges: 'Changes discarded', managePlan: 'Opening subscription management', contactSupport: 'Connecting to support…' } },
    states: { upToDate: 'Al día', upcoming: 'Próxima', overdue: 'Vencido', active: 'Activo', pending: 'Pendiente', expired: 'Expired', vacation: 'De vacaciones', inactive: 'Inactivo' },
    common: { ok: 'OK' }
  }
};
let currentLang = localStorage.getItem('doppyLang') || 'en';

function getTranslation(key, fallback) {
  const lang = translations[currentLang] ? currentLang : 'en';
  const parts = key.split('.');
  let value = translations[lang];
  for (const part of parts) {
    value = value?.[part];
    if (value === undefined) break;
  }
  return value ?? fallback ?? key;
}

function applyTranslations() {
  const lang = translations[currentLang] ? currentLang : 'en';
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const value = getTranslation(key, el.textContent);
    if (value !== undefined) el.textContent = value;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const value = getTranslation(key, el.getAttribute('placeholder'));
    if (value !== undefined) el.setAttribute('placeholder', value);
  });
  const cfgIdioma = document.getElementById('cfgIdioma');
  if (cfgIdioma) cfgIdioma.value = lang;
}

function setIdioma(lang) {
  currentLang = lang in translations ? lang : 'en';
  localStorage.setItem('doppyLang', currentLang);
  applyTranslations();
  renderPets();
  renderAfiliaciones();
  renderVets();
  renderPanelTables();
}

/* ============ HTML BODY TEMPLATE ============ */
const __BODY_TEMPLATE__ = () => `
<div class="app">

  <!-- SIDEBAR -->
  <aside class="sidebar" id="sidebar">
    <div class="logo" style="display:flex;justify-content:center;margin-bottom:16px;">
      <img src="assets/Type 2.png" alt="Doppy Logo" width="150" height="130">
    </div>
    <nav class="nav" id="nav">
      <button class="nav-item" data-page="dashboard">${ICON.home} <span data-i18n="nav.dashboard">Panel</span></button>
      <button class="nav-item" data-page="pacientes">${ICON.paw} <span data-i18n="nav.pacientes">Pacientes</span></button>
      <button class="nav-item" data-page="personal">${ICON.staff} <span data-i18n="nav.personal">Personal</span></button>
      <button class="nav-item" data-page="afiliaciones">${ICON.tag} <span data-i18n="nav.afiliaciones">Afiliaciones</span></button>
      <button class="nav-item" data-page="reportes">${ICON.chart} <span data-i18n="nav.reportes">Informes</span></button>
      <button class="nav-item" data-page="configuracion">${ICON.gear} <span data-i18n="nav.config">Configuración</span></button>
    </nav>
    <div class="promo">
      <div style="margin-bottom:4px;">
        <img src="assets/paww.png" alt="Paw" style="width:34px;height:34px;object-fit:contain;display:block;">
      </div>
      <h4 data-i18n="promo.title">Improve every pet’s health 💙</h4>
      <p data-i18n="promo.text">Descubre todas las funciones que Doppy tiene para tu clínica.</p>
      <button id="btnExplore" data-i18n="promo.button">Saber más</button>
    </div>
    <button class="logout-row" id="btnLogout" style="height:30px;">${ICON.logout} <span data-i18n="logout">Cerrar sesión</span></button>
  </aside>
  <div class="sidebar-backdrop" id="sidebarBackdrop"></div>

  <!-- Navbar inferior estilo Instagram, solo visible en mobile (ver CSS) -->
  <nav class="bottom-nav" id="bottomNav">
    <button class="bottom-nav-item" data-page="dashboard" title="Panel">${ICON.home}</button>
    <button class="bottom-nav-item" data-page="pacientes" title="Pacientes">${ICON.paw}</button>
    <button class="bottom-nav-item" data-page="personal" title="Personal">${ICON.staff}</button>
    <button class="bottom-nav-item" data-page="afiliaciones" title="Afiliaciones">${ICON.tag}</button>
    <button class="bottom-nav-item" data-page="reportes" title="Informes">${ICON.chart}</button>
    <button class="bottom-nav-item" data-page="configuracion" title="Configuración">${ICON.gear}</button>
  </nav>

  <!-- MAIN -->
  <div class="main">
    <header class="topbar">
      <button id="btnMenu" class="icon-btn menu-btn">${ICON.menu}</button>
      <div class="search">${ICON.search}<input id="globalSearch" data-i18n-placeholder="topbar.searchPlaceholder" placeholder="Search patients, owners, affiliation codes..."></div>
      <div class="topbar-right">
        <button class="clinic-pill">${ICON.building} <span id="clinicNombreLabel">Clínica Veterinaria Happy Paws</span> ${ICON.chevron}</button>
        <button class="bell" id="btnBell">${ICON.bell}<span class="dot" id="notifDot">3</span>
          <div class="dropdown" id="ddNotif"></div>
        </button>
        <div class="profile" id="btnPerfil">
          <div class="avatar" id="adminAvatarLabel">AD</div>
          <div><div class="name" id="adminNombreLabel">Administrador</div><div class="role">Superadministrador</div></div>
          ${ICON.chevron}
          <div class="dropdown" id="ddPerfil" style="right:0;left:auto;">
            <div class="item" onclick="showAdminPerfil()"><b data-i18n="profile.myPerfil">Mi perfil</b></div>
            <div class="item" onclick="go('configuracion')"><b data-i18n="profile.config">Configuración</b></div>
            <hr>
            <div class="item" id="ddLogout"><b style="color:var(--red)" data-i18n="profile.logout">Cerrar sesión</b></div>
          </div>
        </div>
      </div>
    </header>

    <div class="content" id="content">

      <!-- ================= DASHBOARD ================= -->
      <section class="page active" id="page-dashboard">
        <div class="page-head"><div><h1>Panel</h1><p>Resumen de la actividad general de tu clínica.</p></div></div>

        <div class="stats">
          <div class="stat-card"><div class="top"><div class="stat-icon" style="background:var(--blue-100);">👥</div>
            <div><h3>Total de pacientes</h3><div class="num" id="statDashPacientes">—</div></div></div><div class="delta up" id="statDashPacientesDelta">&nbsp;</div></div>
          <div class="stat-card"><div class="top"><div class="stat-icon" style="background:var(--green-100);">🧑‍🤝‍🧑</div>
            <div><h3>Dueños activos</h3><div class="num" id="statDashDueños">—</div></div></div><div class="delta up" id="statDashDueñosDelta">&nbsp;</div></div>
          <div class="stat-card"><div class="top"><div class="stat-icon" style="background:var(--purple-100);">🩺</div>
            <div><h3>Veterinarios</h3><div class="num" id="statDashVets">—</div></div></div><div class="delta up" id="statDashVetsDelta">&nbsp;</div></div>
          <div class="stat-card"><div class="top"><div class="stat-icon" style="background:var(--amber-100);">🪪</div>
            <div><h3>Afiliaciones pendientes</h3><div class="num" id="statDashPendiente">—</div></div></div><div class="delta down" id="statDashPendienteDelta">&nbsp;</div></div>
        </div>

        <div class="grid-2">
          <div class="card">
            <div class="card-head"><h3>Actividad reciente</h3><button class="link" onclick="toast('Showing full activity history')">Ver todo</button></div>
            <div id="activityList"></div>
          </div>
          <div class="card">
            <div class="card-head"><h3>Acciones rápidas</h3></div>
            <div class="quick-grid">
              <button class="quick-btn" style="background:var(--amber-100);" onclick="go('afiliaciones');setTimeout(()=>generarCodigo(),200)"><div class="qicon">🏷️</div><b>Generar código de afiliación</b><span>Crear un código para un dueño</span></button>
              <button class="quick-btn" style="background:var(--purple-100);" onclick="go('personal');setTimeout(()=>openVetModal(),200)"><div class="qicon">🩺</div><b>Agregar veterinario</b><span>Agregar un doctor a la clínica</span></button>
              <button class="quick-btn" style="background:var(--green-100);" onclick="go('reportes')"><div class="qicon">📊</div><b>Ver informes</b><span>Revisar las estadísticas</span></button>
            </div>
          </div>
        </div>

        <div class="card" style="margin-bottom:18px;">
          <div class="card-head">
            <h3 style="display:flex;align-items:center;gap:8px;">
              <img src="assets/NotiW.png" alt="Affiliation requests" style="width:18px;height:18px;object-fit:contain;display:block;">
              Solicitudes de afiliación
            </h3>
            <span class="badge amber" id="solicitudesCount">0</span>
          </div>
          <p style="margin:-6px 0 12px;color:var(--muted);font-size:12.5px;">When an owner scans a QR code, it appears here so you can decide whether to approve or reject their affiliation.</p>
          <div id="solicitudesBody"></div>
        </div>

        <div class="grid-2">
          <div class="card">
            <div class="card-head"><h3>Gestión de afiliaciones</h3><button class="link" onclick="go('afiliaciones')">Ver todo</button></div>
            <div style="overflow-x:auto;"><table><thead><tr><th>Pet</th><th>Dueño</th><th>Código</th><th>Estado</th><th>Expiration</th><th></th></tr></thead>
            <tbody id="dashAfilBody"></tbody></table></div>
          </div>
          <div class="card">
            <div class="card-head"><h3>Personal veterinario</h3><button class="link" onclick="go('personal')">Ver todo</button></div>
            <div style="overflow-x:auto;"><table><thead><tr><th>Doctor</th><th>Specialty</th><th>Estado</th><th></th></tr></thead>
            <tbody id="dashVetBody"></tbody></table></div>
          </div>
        </div>
      </section>

      <!-- ================= PATIENTS ================= -->
      <section class="page" id="page-pacientes">
        <div class="breadcrumb"><a onclick="go('pacientes')" data-i18n="breadcrumbs.patients">Pacientes</a> / <b data-i18n="breadcrumbs.patientsList">Lista de pacientes</b></div>
        <div class="page-head">
          <div><h1 data-i18n="patients.title">Pacientes (Pets)</h1><p data-i18n="patients.subtitle">Gestiona y revisa todas las mascotas registradas en tu clínica.</p></div>
          <div class="head-actions">
            <button class="btn" onclick="toast('Select a CSV file to import pets')">${ICON.upload} Import</button>
            <button class="btn" onclick="toast('Exporting patient list to CSV…')">${ICON.download} Export</button>
          </div>
        </div>
        <div class="stats">
          <div class="stat-card"><div class="top"><div class="stat-icon" style="background:#fff;"><img src="assets/PawB.png" alt="Pets"></div><div><h3>Total de mascotas</h3><div class="num" id="statTotalPets">—</div></div></div><div class="delta up">&nbsp;</div></div>
          <div class="stat-card"><div class="top"><div class="stat-icon" style="background:#fff;"><img src="assets/CalendarW.png" alt="Appointments"></div><div><h3>Próximas citas</h3><div class="num" id="statPróximaAppts">—</div></div></div><div class="delta up">&nbsp;</div></div>
          <div class="stat-card"><div class="top"><div class="stat-icon" style="background:#fff;"><img src="assets/PawB.png" alt="Vaccines"></div><div><h3>Vacunas pendientes</h3><div class="num" id="statVaccinesDue">—</div></div></div><div class="delta down">&nbsp;</div></div>
          <div class="stat-card"><div class="top"><div class="stat-icon" style="background:#fff;"><img src="assets/dogd.png" alt="Pacientes"></div><div><h3>Pacientes nuevos (Month)</h3><div class="num" id="statNewPacientes">—</div></div></div><div class="delta up">&nbsp;</div></div>
        </div>

        <div class="filters">
          <div class="search" style="max-width:280px;">${ICON.search}<input id="petSearch" placeholder="Search by name, owner, microchip…" oninput="renderPets()"></div>
          <select id="fEspecie" onchange="renderPets()"><option value="">Especie: Todas</option><option>Dog</option><option>Cat</option></select>
          <select id="fEstado" onchange="renderPets()"><option value="">Estado: Todos</option><option>Al día</option><option>Próxima</option><option>Vencido</option></select>
          <button class="btn" onclick="togglePetFilters()">${ICON.filter} More filters</button>
        </div>
        <div class="filter-panel" id="petFilterPanel">
          <div class="field">
            <label>Veterinario</label>
            <select id="fVeterinario" onchange="renderPets()">
              <option value="">All</option>
              <option>Dr. Emily Carter</option>
              <option>Dr. James Wilson</option>
              <option>Dr. Sophia Lee</option>
            </select>
          </div>
          <div class="field">
            <label>Raza</label>
            <select id="fRaza" onchange="renderPets()">
              <option value="">All</option>
              <option>Golden Retriever</option>
              <option>Maine Coon</option>
              <option>Bulldog Francés</option>
              <option>Persa</option>
              <option>Labrador</option>
            </select>
          </div>
          <button class="btn" onclick="clearPetFilters()" data-i18n="filters.clear">Limpiar</button>
        </div>

        <div class="card">
          <div class="pets-table-wrap">
            <table>
              <thead><tr><th>Pet</th><th>Especie</th><th>Raza</th><th>Dueño</th><th>Veterinario</th><th>Vacunación</th><th>Próxima visita</th><th>Acciones</th></tr></thead>
              <tbody id="petsBody"></tbody>
            </table>
          </div>
          <div class="table-foot">
            <span id="petsCount">Loading…</span>
          </div>
        </div>

        <div class="quick-grid quick-grid-4" style="margin-top:18px;">
          <button class="quick-btn" style="background:#fff;border:1px solid var(--line);" onclick="document.getElementById('petSearch').focus();toast('Type to search for a pet')"><div class="qicon" style="background:var(--green-100);"></div><b>Buscar mascota</b><span>Buscar una mascota rápido</span></button>
          <button class="quick-btn" style="background:#fff;border:1px solid var(--line);" onclick="go('afiliaciones')"><div class="qicon" style="background:var(--amber-100);"></div><b>Ver afiliaciones</b><span>Gestionar códigos de dueños</span></button>
          <button class="quick-btn" style="background:#fff;border:1px solid var(--line);" onclick="go('personal')"><div class="qicon" style="background:var(--purple-100);"></div><b>Ver personal</b><span>Revisar el equipo veterinario</span></button>
        </div>
      </section>

      <!-- ================= AFFILIATIONS ================= -->
      <section class="page" id="page-afiliaciones">
        <div class="breadcrumb"><a onclick="go('afiliaciones')">Afiliaciones</a> / <b id="afilTabLabel">Códigos activos</b></div>
        <div class="page-head">
          <div><h1>Afiliaciones</h1><p>Generate and manage affiliation codes so new owners can join your clinic.</p></div>
          <div class="head-actions"><button class="btn primary" onclick="generarCodigo()">${ICON.plus} Generate New Código</button></div>
        </div>
        <div class="stats">
          <div class="stat-card"><div class="top"><div class="stat-icon" style="background:var(--blue-100);">📋</div><div><h3>Códigos activos</h3><div class="num" id="statActivos">—</div></div></div><div class="delta up">Códigos disponibles</div></div>
          <div class="stat-card"><div class="top"><div class="stat-icon" style="background:var(--green-100);">✅</div><div><h3>Códigos usados</h3><div class="num" id="statUsados">—</div></div></div><div class="delta up">&nbsp;</div></div>
          <div class="stat-card"><div class="top"><div class="stat-icon" style="background:var(--amber-100);">⏰</div><div><h3>Vence en 7 días</h3><div class="num" id="statExpiring7">—</div></div></div><div class="delta down">Requiere atención</div></div>
          <div class="stat-card"><div class="top"><div class="stat-icon" style="background:var(--purple-100);">💗</div><div><h3>Total generado</h3><div class="num" id="statTotal">—</div></div></div><div class="delta up">Desde el inicio</div></div>
        </div>

        <div class="tabs">
          <button class="tab active" data-tab="activos" onclick="switchAfilTab('activos')">Activo</button>

        <div class="split">
          <div class="card">
            <div class="filters" style="margin-bottom:14px;">
              <div class="search" style="max-width:280px;">${ICON.search}<input id="afilSearch" placeholder="Search code, used by, email…" oninput="renderAfiliaciones()"></div>
              <select id="afilEstado" onchange="renderAfiliaciones()"><option value="">Estado: Todos</option><option>Activo</option><option>Pendiente</option></select>
            </div>
            <div style="overflow-x:auto;"><table>
              <thead><tr><th>Código</th><th>QR</th><th>Usado por</th><th>Correo</th><th>Estado</th><th>Expiration</th><th>Usos</th><th>Acciones</th></tr></thead>
              <tbody id="afilBody"></tbody>
            </table></div>
            <div class="table-foot">
              <span id="afilCount"></span>
              <div class="pager"><button>‹</button><button class="active">1</button><button onclick="toast('Loading page 2…')">2</button><button onclick="toast('Loading page 3…')">3</button><span>…</span><button onclick="toast('Loading page 5…')">5</button><button>›</button></div>
            </div>
          </div>

          <div class="code-panel" id="codePanel">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <h3 style="margin:0;font-size:15px;">Detalles del código</h3>
              <button class="icon-btn" onclick="document.getElementById('codePanel').style.display='none'">${ICON.close}</button>
            </div>
            <div id="codePanelBody"></div>
          </div>
        </div>


      </section>

      <!-- ================= STAFF ================= -->
      <section class="page" id="page-personal">
        <div class="breadcrumb"><a onclick="go('dashboard')">Panel</a> / <b>Personal</b></div>
        <div class="page-head">
          <div><h1>Personal</h1><p>Gestiona el equipo veterinario y el personal de tu clínica.</p></div>
          <div class="head-actions">
            <button class="btn" onclick="toast('Invitation sent by email')">${ICON.invite} Invite Member</button>
            <button class="btn" onclick="toast('Exporting staff list…')">${ICON.download} Export List</button>
            <button class="btn primary" onclick="openVetModal()">${ICON.plus} Agregar veterinario</button>
          </div>
        </div>
        <div class="stats">
          <div class="stat-card"><div class="top"><div class="stat-icon" style="background:var(--blue-100);">👥</div><div><h3>Total de veterinarios</h3><div class="num" id="statVets">—</div></div></div><div class="delta up">Todo el personal veterinario</div></div>
          <div class="stat-card"><div class="top"><div class="stat-icon" style="background:var(--green-100);">✅</div><div><h3>Personal activo</h3><div class="num" id="statActivoPersonal">—</div></div></div><div class="delta up">Cuentas activas</div></div>
          <div class="stat-card"><div class="top"><div class="stat-icon" style="background:var(--amber-100);">📅</div><div><h3>Disponible hoy</h3><div class="num" id="statAvailableHoy">—</div></div></div><div class="delta up">Veterinarios disponibles</div></div>

        </div>

        <div class="split">
          <div class="card">
            <div class="filters" style="margin-bottom:14px;">
              <div class="search" style="max-width:280px;">${ICON.search}<input id="vetSearch" placeholder="Search veterinarian by name or specialty…" oninput="renderVets()"></div>
              <select id="vetEstado" onchange="renderVets()"><option value="">Estado: Todos</option><option>Activo</option><option>De vacaciones</option><option>Inactivo</option></select>
            </div>
            <div style="overflow-x:auto;"><table>
              <thead><tr><th>Veterinario</th><th>Rol</th><th>Specialty</th><th>Correo</th><th>Horario</th><th>Pacientes</th><th>Estado</th><th>Acciones</th></tr></thead>
              <tbody id="vetsBody"></tbody>
            </table></div>
            <div class="table-foot"><span id="vetsCount"></span></div>
          </div>

          <div class="code-panel" id="vetPanel">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <h3 style="margin:0;font-size:15px;">Perfil</h3>
              <button class="icon-btn" onclick="document.getElementById('vetPanel').style.display='none'">${ICON.close}</button>
            </div>
            <div id="vetPanelBody"></div>
          </div>
        </div>
      </section>

      <!-- ================= SETTINGS ================= -->
      <section class="page" id="page-configuracion">
        <div class="breadcrumb"><a onclick="go('configuracion')" data-i18n="breadcrumbs.config">Configuración</a> / <b data-i18n="breadcrumbs.clinicInfo">Información de la clínica</b></div>
        <div class="page-head"><div><h1 data-i18n="config.title">Configuración</h1><p data-i18n="config.subtitle">Gestiona y personaliza tu clínica y la plataforma Doppy.</p></div></div>

        <div class="split">
          <div class="card">
            <h3 style="margin-top:0;" data-i18n="config.clinicInfo">Información de la clínica</h3>
            <div class="form-grid" style="margin-top:14px;">
              <div class="field full"><label data-i18n="config.name">Nombre de la clínica</label><input id="cfgNombre" value="Clínica Veterinaria Happy Paws"></div>
              <div class="field full"><label data-i18n="config.address">Dirección</label><input id="cfgDireccion" value="123 Veterinarios Ave, Downtown District"></div>
              <div class="field"><label data-i18n="config.city">Ciudad</label><input id="cfgCiudad" value="Panama Ciudad"></div>
              <div class="field"><label data-i18n="config.province">Provincia</label><input id="cfgProvincia" value="Panama"></div>
              <div class="field"><label data-i18n="config.postalCódigo">Código postal</label><input id="cfgCP" value="0801"></div>
              <div class="field"><label data-i18n="config.phone">Teléfono</label><input id="cfgTel" value="+507 1234-5678"></div>
              <div class="field"><label data-i18n="config.email">Correo</label><input id="cfgCorreo" value="info@happypawsvet.com"></div>
              <div class="field"><label data-i18n="config.website">Sitio web</label><input id="cfgWeb" value="www.happypawsvet.com"></div>
              <div class="field"><label data-i18n="config.language">Idioma</label><select id="cfgIdioma" onchange="setIdioma(this.value)"><option value="es">Español</option><option value="en">Inglés</option></select></div>
            </div>
            <div style="margin-top:20px;display:flex;gap:10px;">
              <button class="btn primary" onclick="guardarConfig()" data-i18n="config.save">Guardar cambios</button>
              <button class="btn" onclick="toast(getTranslation('config.toast.discardChanges'))" data-i18n="config.cancel">Cancelar</button>
            </div>
          </div>
          <div>
            <div class="card" style="margin-bottom:14px;">
              <h3 style="margin-top:0;font-size:15px;" data-i18n="config.plan">Tu plan actual</h3>
              <div style="font-weight:700;color:var(--amber);margin:8px 0;" id="planNombreLabel">Plan Profesional</div>
              <div class="kv"><span data-i18n="config.users">Usuarios</span><span id="planUsuariosLabel">—</span></div>
              <div class="kv"><span data-i18n="config.patients">Pacientes</span><span id="planPacientesLabel">—</span></div>
              <div class="kv"><span data-i18n="config.nextCharge">Próximo cobro</span><span id="planNextChargeLabel">—</span></div>
              <button class="btn" style="width:100%;margin-top:12px;" onclick="toast(getTranslation('config.toast.managePlan'))" data-i18n="config.managePlan">Gestionar suscripción</button>
            </div>
            <div class="card" style="margin-bottom:14px;">
              <h3 style="margin-top:0;font-size:15px;" data-i18n="config.help">¿Necesitas ayuda?</h3>
              <p style="color:var(--muted);font-size:13px;" data-i18n="config.helpText">Nuestro equipo está listo para ayudarte con cualquier duda.</p>
              <button class="btn" style="width:100%;" onclick="toast(getTranslation('config.toast.contactSupport'))" data-i18n="config.contactSupport">Contactar soporte</button>
            </div>
          </div>
        </div>
      </section>

      <!-- ================= REPORTS ================= -->
      <section class="page" id="page-reportes">
        <div class="breadcrumb"><a onclick="go('dashboard')">Panel</a> / <b>Informes</b></div>
        <div class="page-head">
          <div><h1>Informes</h1><p>Estadísticas e informes de rendimiento de tu clínica.</p></div>
          <div class="head-actions">
            <select id="repRango" onchange="renderReportes()">
              <option value="7d">Últimos 7 días</option>
              <option value="30d" selected>Últimos 30 días</option>
              <option value="trim">Este trimestre</option>
              <option value="anio">Este año</option>
            </select>
            <button class="btn" onclick="exportarReportePDF()">${ICON.download} Export PDF</button>
          </div>
        </div>

        <div class="stats">
          <div class="stat-card"><div class="top"><div class="stat-icon" style="background:var(--blue-100);">📅</div><div><h3>Total de citas</h3><div class="num" id="repCitas">312</div></div></div><div class="delta up" id="repCitasDelta">↑ 9.4% vs last month</div></div>
          <div class="stat-card"><div class="top"><div class="stat-icon" style="background:var(--green-100);">✅</div><div><h3>Tasa de asistencia</h3><div class="num" id="repAsistencia">94%</div></div></div><div class="delta up" id="repAsistDelta">↑ 2.1% vs last month</div></div>
          <div class="stat-card"><div class="top"><div class="stat-icon" style="background:var(--purple-100);">✨</div><div><h3>Pacientes nuevos</h3><div class="num" id="repNuevos">62</div></div></div><div class="delta up" id="repNuevosDelta">↑ 10.7% vs last month</div></div>

        </div>

        <div class="grid-2">
          <div class="card">
            <div class="card-head"><h3>Pacientes nuevos por mes</h3><button class="link" onclick="toast('Showing full monthly detail')">Ver detalle</button></div>
            <div style="height:260px;"><canvas id="chartMonthly"></canvas></div>
          </div>
          <div class="card">
            <div class="card-head"><h3>Distribución por especie</h3></div>
            <div style="height:260px;"><canvas id="chartEspecie"></canvas></div>
          </div>
        </div>

        <div class="grid-2">
          <div class="card">
            <div class="card-head"><h3>Estado de vacunación</h3></div>
            <div style="height:240px;"><canvas id="chartVac"></canvas></div>
          </div>
          <div class="card">
            <div class="card-head"><h3>Pacientes por veterinario</h3><button class="link" onclick="go('personal')">Ver personal</button></div>
            <div style="height:240px;"><canvas id="chartVets"></canvas></div>
          </div>
        </div>

        <div class="grid-2">
          <div class="card">
            <div class="card-head"><h3>Códigos de afiliación</h3><button class="link" onclick="go('afiliaciones')">Ver todo</button></div>
            <div style="height:220px;"><canvas id="chartAfil"></canvas></div>
          </div>
          <div class="card" id="reportsQuickSummaryCard">
            <div class="card-head"><h3>Resumen rápido</h3></div>
            <div class="kv"><span>Citas canceladas</span><span>19</span></div>
            <div class="kv"><span>Inasistencias</span><span>12 (3.8%)</span></div>
            <div class="kv"><span>Tiempo promedio de uso del código</span><span>4.2 days</span></div>
            <div class="kv"><span>Vaccines administered (month)</span><span>87</span></div>
            <div class="kv"><span>Veterinario más solicitado</span><span>Dr. Emily Carter</span></div>
            <div class="kv"><span>Especialidad más solicitada</span><span>Medicina interna</span></div>
            <button class="btn" style="width:100%;margin-top:14px;" onclick="generarReporteDetallado()">${ICON.file} Generate Detailed Report</button>
          </div>
        </div>
      </section>

    </div>
  </div>
</div>

<!-- MODALS -->
<div class="modal-bg" id="petModalBg">
  <div class="modal">
    <h2>Registrar mascota</h2><p class="sub">Agrega una nueva mascota a tu clínica.</p>
    <div class="form-grid two">
      <div class="field"><label>Nombre</label><input id="mPetNombre" placeholder="E.g. Rocky"></div>
      <div class="field"><label>Especie</label><select id="mPetEspecie"><option>Dog</option><option>Cat</option></select></div>
      <div class="field"><label>Raza</label><input id="mPetRaza" placeholder="E.g. Poodle"></div>
      <div class="field"><label>Correo del dueño</label><input id="mPetDueño" placeholder="owner@email.com"></div>
      <div class="field"><label>Veterinario asignado</label>
        <select id="mPetVet"></select></div>
      <div class="field"><label>Próxima visita</label><input id="mPetDate" type="date"></div>
    </div>
    <div class="modal-foot"><button class="btn" onclick="closeModal('petModalBg')">Cancelar</button><button class="btn primary" onclick="submitPet()">Registrar mascota</button></div>
  </div>
</div>

<div class="modal-bg" id="vetModalBg">
  <div class="modal">
    <h2>Agregar veterinario</h2><p class="sub">Agrega un nuevo doctor al equipo de tu clínica.</p>
    <div class="form-grid two">
      <div class="field"><label>Nombre completo</label><input id="mVetNombre" placeholder="E.g. Dr. Carlos Ruiz"></div>
      <div class="field"><label>Specialty</label><input id="mVetSpec" placeholder="E.g. Dermatology"></div>
      <div class="field"><label>Correo</label><input id="mVetCorreo" placeholder="email@happypawsvet.com"></div>
      <div class="field"><label>Inicio de horario</label><input id="mVetHorarioStart" type="time" value="08:00"></div>
      <div class="field"><label>Fin de horario</label><input id="mVetHorarioEnd" type="time" value="17:00"></div>
    </div>
    <div class="modal-foot"><button class="btn" onclick="closeModal('vetModalBg')">Cancelar</button><button class="btn primary" onclick="submitVet()">Agregar veterinario</button></div>
  </div>
</div>

<div class="modal-bg" id="adminModalBg">
  <div class="modal">
    <h2>Mi perfil</h2><p class="sub">La información de tu cuenta de administrador.</p>
    <div style="text-align:center;margin:14px 0;">
      <div class="avatar" style="width:64px;height:64px;font-size:20px;margin:0 auto 10px;" id="adminModalAvatar">AD</div>
      <div style="font-weight:700;">Administrador <span class="badge green">Activo</span></div>
      <div class="sub" style="color:var(--muted);font-size:12.5px;">Superadministrador</div>
    </div>
    <div class="kv"><span>Nombre</span><span id="adminModalNombre">—</span></div>
    <div class="kv"><span>Correo</span><span id="adminModalCorreo">—</span></div>
    <div class="kv"><span>Teléfono</span><span>+507 6000-0000</span></div>
    <div class="kv"><span>Clínica</span><span id="adminModalClínica">—</span></div>
    <div class="kv"><span>Rol</span><span>Superadministrador</span></div>
    <div class="kv"><span>Último inicio de sesión</span><span id="adminLastLogin">Hoy</span></div>
    <div class="modal-foot">
      <button class="btn" onclick="closeModal('adminModalBg')">Cerrar</button>
      <button class="btn primary" onclick="closeModal('adminModalBg');go('configuracion')">Editar en Configuración</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

`;

/* ============ ICONS ============ */
const ICON = {
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v9a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1v-9"/></svg>`,
  paw: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="8" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="9" cy="4" r="1.8"/><circle cx="15" cy="4" r="1.8"/><path d="M12 12c-3 0-5.5 2.2-5.5 5 0 2 1.7 3 3.5 3 1 0 1.5-.6 2-.6s1 .6 2 .6c1.8 0 3.5-1 3.5-3 0-2.8-2.5-5-5.5-5z"/></svg>`,
  users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`,
  staff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>`,
  file: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/></svg>`,
  doc: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h12l4 4v12H4z"/><path d="M9 13h6M9 17h6M9 9h2"/></svg>`,
  tag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 12.6L12 21 3 12l8.6-8.6H20a1 1 0 011 1v8.2z"/><circle cx="15.5" cy="7.5" r="1.5"/></svg>`,
  chart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21V9M10 21V4M17 21v-7"/></svg>`,
  chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a4 4 0 01-4 4H8l-5 3V6a4 4 0 014-4h10a4 4 0 014 4z"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.6-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>`,
  logout: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>`,
  search: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>`,
  chevron: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`,
  building: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18"/><path d="M9 21v-4h6v4M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1"/></svg>`,
  bell: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>`,
  plus: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`,
  upload: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`,
  download: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>`,
  filter: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16M7 12h10M10 19h4"/></svg>`,
  close: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  invite: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.1V19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h8"/><path d="M22 4l-9 9-3-3M16 3h6v6"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>`,
  more: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`
};

function stubPage(title, desc){
  return `
    <div class="page-head"><div><h1>${title}</h1><p>${desc}</p></div></div>
    <div class="empty-note">🚧 This section is under construction. Soon you'll be able to manage <b>${title.toLowerCase()}</b> directly from here.</div>
  `;
}
/* ============ DATA (cargada desde Supabase) ============ */
let pets = [];
let affiliations = [];
let expiredAfiliaciones = [];
let vets = [];
let activity = [];
let notifications = [];
let solicitudes = [];
let afilTab = 'activos';
let selectedCódigo = null;
const statCounters = { activos: 0, total: 0 };

/* ---------------------------------------------------------
   LOADERS — cada uno hace el SELECT y llena el array de arriba
   en la MISMA forma que usaban los datos de ejemplo, para no
   tener que tocar las funciones de render.
   --------------------------------------------------------- */

function requireSupabase(){
  if (!supabaseClient) {
    toast('⚠️ Not connected to Supabase — check SUPABASE_ANON_KEY and your internet connection');
    return false;
  }
  return true;
}

// Mismas 6 especies que ofrece el wizard de alta (selpetdu.html):
// Dog, Cat, Bird, Turtle, Rabbit, Lizard. Antes esto solo distinguía
// "Cat" de "todo lo demás = Dog", por eso pájaros/tortugas/conejos/
// lagartos aparecían siempre con el ícono de perro.
function speciesToIcon(petTypes){
  const key = (petTypes || '').toLowerCase();
  const map = {
    dog: 'assets/dogd.png',
    cat: 'assets/catd.png',
    bird: 'assets/parrotd.png',
    turtle: 'assets/turtled.png',
    rabbit: 'assets/rabitd.png',
    lizard: 'assets/lizardd.png'
  };
  return map[key] || 'assets/PawB.png';
}

async function loadPets(){
  if (!requireSupabase()) { pets = []; return; }
  const { data, error } = await supabaseClient
    .from('pets')
    .select(`
      id, pet_name, pet_breed, petTypes, pet_code, owner_id, assigned_veterinarian_id,
      users:owner_id ( name ),
      veterinary_staff:assigned_veterinarian_id ( nombre ),
      vaccination_record ( vaccine_name, next_due_date )
    `)
    .eq('primary_clinic_id', CURRENT_VETERINARY_ID);

  if (error) { console.error('loadPets', error); toast('Error loading patients'); pets = []; return; }

  pets = (data || []).map(p => {
    const dueDates = (p.vaccination_record || []).map(v => v.next_due_date).filter(Boolean).sort();
    const nextDue = dueDates[0];
    let vac = 'Al día';
    if (nextDue) {
      const days = (new Date(nextDue) - new Date()) / 86400000;
      if (days < 0) vac = 'Vencido';
      else if (days <= 30) vac = 'Próxima';
    }
    return {
      dbId: p.id,
      name: p.pet_name,
      id: p.pet_code || ('PET-' + String(p.id).padStart(4, '0')),
      species: p.petTypes || '—',
      breed: p.pet_breed || '—',
      owner: p.users?.name || '—',
      vet: p.veterinary_staff?.nombre || 'Not assigned yet',
      vac,
      next: nextDue ? new Date(nextDue).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) : 'No appointment',
      emoji: speciesToIcon(p.petTypes)
    };
  });
}

async function loadVets(){
  if (!requireSupabase()) { vets = []; return; }
  const { data, error } = await supabaseClient
    .from('veterinary_staff')
    .select('id, nombre, rol, specialty, email, schedule_start, schedule_end, status, license_number')
    .eq('veterinary_id', CURRENT_VETERINARY_ID);

  if (error) { console.error('loadVets', error); toast('Error loading staff'); vets = []; return; }

  vets = (data || []).map(v => ({
    dbId: v.id,
    name: v.nombre,
    role: v.rol || 'Veterinario',
    spec: v.specialty || '—',
    email: v.email || '—',
    schedule: (v.schedule_start && v.schedule_end) ? `${v.schedule_start.slice(0,5)} - ${v.schedule_end.slice(0,5)}` : '—',
    patients: 0, // TODO: contar mascotas/turnos asignados a este veterinario
    status: v.status ? (v.status.charAt(0).toUpperCase() + v.status.slice(1).replace('_', ' ')) : 'Activo',
    mv: v.license_number || ('MV-' + v.id)
  }));
}

async function loadAfiliaciones(){
  if (!requireSupabase()) { affiliations = []; expiredAfiliaciones = []; return; }
  const { data, error } = await supabaseClient
    .from('affiliations')
    .select(`
      id, code, status, expiration_date, current_uses, max_uses, requested_at, pet_id,
      pets ( pet_name ),
      users:id_client ( name, email )
    `)
    .eq('veterinary_id', CURRENT_VETERINARY_ID)
    .order('id', { ascending: false });

  if (error) { console.error('loadAfiliaciones', error); toast('Error loading affiliations'); affiliations = []; expiredAfiliaciones = []; return; }

  const statusLabel = { active: 'Activo', pending: 'Pendiente', rejected: 'Rechazared', unclaimed: 'Activo', expired: 'Expired' };

  const mapped = (data || []).map(a => {
    const daysLeft = a.expiration_date ? Math.max(0, Math.ceil((new Date(a.expiration_date) - new Date()) / 86400000)) : 0;
    const isExpired = a.status === 'expired' || (a.expiration_date && daysLeft === 0 && a.status !== 'active');
    return {
      dbId: a.id,
      petId: a.pet_id,
      petNombre: a.pets?.pet_name || null,
      code: a.code,
      owner: a.users?.name || (a.status === 'unclaimed' ? 'Not yet used' : '—'),
      email: a.users?.email || '—',
      status: statusLabel[a.status] || a.status,
      exp: a.expiration_date ? new Date(a.expiration_date).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
      daysLeft,
      uses: `${a.current_uses || 0}/${a.max_uses || 10}`,
      pending: a.status === 'pending',
      _isExpired: isExpired
    };
  });

  affiliations = mapped.filter(a => !a._isExpired);
  expiredAfiliaciones = mapped.filter(a => a._isExpired);

  statCounters.activos = affiliations.filter(a => a.status === 'Activo').length;
  statCounters.total = mapped.length;
  document.getElementById('statActivos') && (document.getElementById('statActivos').textContent = statCounters.activos);
  document.getElementById('statUsados') && (document.getElementById('statUsados').textContent = mapped.filter(a => a.status === 'Activo' && a.uses !== '0/10').length);
  document.getElementById('statExpiring7') && (document.getElementById('statExpiring7').textContent = affiliations.filter(a => a.daysLeft > 0 && a.daysLeft <= 7).length);
  document.getElementById('statTotal') && (document.getElementById('statTotal').textContent = statCounters.total);
}

async function loadSolicitudes(){
  if (!requireSupabase()) { solicitudes = []; return; }
  const { data, error } = await supabaseClient
    .from('affiliations')
    .select('id, code, requested_at, users:id_client ( name, email )')
    .eq('veterinary_id', CURRENT_VETERINARY_ID)
    .eq('status', 'pending');

  if (error) { console.error('loadSolicitudes', error); solicitudes = []; return; }

  solicitudes = (data || []).map(s => ({
    id: s.id,
    code: s.code,
    nombre: s.users?.name || 'New Dueño',
    email: s.users?.email || '—',
    time: s.requested_at ? new Date(s.requested_at).toLocaleString('en-US') : 'Recently'
  }));
}

async function loadActivity(){
  if (!requireSupabase()) { activity = []; return; }
  const { data, error } = await supabaseClient
    .from('activity_log')
    .select('*')
    .eq('veterinary_id', CURRENT_VETERINARY_ID)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) { console.error('loadActivity', error); activity = []; return; }

  const iconMap = { pet_registered: '🐾', owner_affiliated: '🧑\u200d🤝\u200d🧑', vaccination_updated: '💉', staff_added: '🩺', appointment_completed: '✅' };
  const colorMap = { pet_registered: 'var(--blue)', owner_affiliated: 'var(--green)', vaccination_updated: 'var(--amber)', staff_added: 'var(--purple)', appointment_completed: 'var(--green)' };

  activity = (data || []).map(a => ({
    icon: iconMap[a.action_type] || '📌',
    color: colorMap[a.action_type] || 'var(--muted)',
    title: a.action_type ? a.action_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Activity',
    desc: a.description,
    time: new Date(a.created_at).toLocaleString('en-US')
  }));
}

async function loadNotifications(){
  if (!requireSupabase()) { notifications = []; return; }
  let query = supabaseClient.from('notifications').select('*').order('created_at', { ascending: false }).limit(10);
  if (CURRENT_STAFF_ID) query = query.eq('staff_id', CURRENT_STAFF_ID);
  const { data, error } = await query;
  if (error) { console.error('loadNotifications', error); notifications = []; return; }
  notifications = (data || []).map(n => ({ icon: '🔔', title: n.title, desc: n.message, time: new Date(n.created_at).toLocaleString('en-US') }));
}

async function loadPanelStats(){
  if (!requireSupabase()) return;
  const [petsCount, vetsCount, pendingCount, activeAfilCount] = await Promise.all([
    supabaseClient.from('pets').select('id', { count: 'exact', head: true }).eq('primary_clinic_id', CURRENT_VETERINARY_ID),
    supabaseClient.from('veterinary_staff').select('id', { count: 'exact', head: true }).eq('veterinary_id', CURRENT_VETERINARY_ID),
    supabaseClient.from('affiliations').select('id', { count: 'exact', head: true }).eq('veterinary_id', CURRENT_VETERINARY_ID).eq('status', 'pending'),
    supabaseClient.from('affiliations').select('id', { count: 'exact', head: true }).eq('veterinary_id', CURRENT_VETERINARY_ID).eq('status', 'active')
  ]);

  setText('statDashPacientes', petsCount.count ?? 0);
  setText('statDashDueños', activeAfilCount.count ?? 0); // dueños con al menos una afiliación activa
  setText('statDashVets', vetsCount.count ?? 0);
  setText('statDashPendiente', pendingCount.count ?? 0);

  setText('statTotalPets', petsCount.count ?? 0);
  setText('statVets', vetsCount.count ?? 0);
  setText('statActivoPersonal', vets.filter(v => v.status === 'Activo').length);
  setText('statAvailableHoy', vets.filter(v => v.status === 'Activo').length);
  setText('statVaccinesDue', pets.filter(p => p.vac === 'Próxima' || p.vac === 'Vencido').length);
  // TODO: Próximas citas y Pacientes nuevos (mes) requieren la tabla appointments
  // filtrada por rango de fechas; se dejan sin calcular por ahora.
}

function setText(id, value){
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/* ---------------------------------------------------------
   Carga inicial: todo en paralelo, luego se pinta la UI
   --------------------------------------------------------- */
async function loadAll(){
  await loadCurrentAdminContext();
  applyAdminContextToUI();
  try {
    await Promise.all([loadPets(), loadVets(), loadAfiliaciones(), loadSolicitudes(), loadActivity(), loadNotifications()]);
    await loadPanelStats();
  } catch (e) {
    console.error('[Doppy] loadAll failed:', e);
    toast('⚠️ Could not load data from Supabase — showing the app with no data');
  }
  // Estas se llaman pase lo que pase, para que la UI nunca quede vacía/rota.
  renderPets();
  renderVets();
  renderAfiliaciones();
  renderSolicitudes();
  renderPanelTables();
  renderNotifications();
  applyTranslations();
  populateVetSelect();
  if (affiliations.length) showCódigoDetails(affiliations[0].code);
}

function populateVetSelect(){
  const sel = document.getElementById('mPetVet');
  if (!sel) return;
  sel.innerHTML = vets.map(v => `<option value="${v.dbId}">${v.name}</option>`).join('') || '<option value="">Aún no hay veterinarios</option>';
}

/* ============ RENDER HELPERS ============ */
function vacBadge(v){
  const labels = {
    'Al día': getTranslation('states.upToDate', 'Al día'),
    'Próxima': getTranslation('states.upcoming', 'Próxima'),
    'Vencido': getTranslation('states.overdue', 'Vencido')
  };
  const label = labels[v] || v;
  if(v==='Al día') return `<span class="badge green">✓ ${label}</span>`;
  if(v==='Próxima') return `<span class="badge amber">◔ ${label}</span>`;
  return `<span class="badge red">⚠ ${label}</span>`;
}
function statusBadge(s){
  const labels = {
    Activo: getTranslation('states.active', 'Activo'),
    Pendiente: getTranslation('states.pending', 'Pendiente'),
    Expired: getTranslation('states.expired', 'Expired'),
    'De vacaciones': getTranslation('states.vacation', 'De vacaciones'),
    Inactivo: getTranslation('states.inactive', 'Inactivo'),
    Rechazared: 'Rechazared'
  };
  const map = {Activo:'green', Pendiente:'amber', Expired:'red', 'De vacaciones':'amber', Inactivo:'red', Rechazared:'red'};
  return `<span class="badge ${map[s]||'gray'}">${labels[s] || s}</span>`;
}

function togglePetFilters(){
  const panel = document.getElementById('petFilterPanel');
  panel?.classList.toggle('open');
}

function clearPetFilters(){
  document.getElementById('fVeterinario').value = '';
  document.getElementById('fRaza').value = '';
  renderPets();
}

function renderPets(){
  const q = (document.getElementById('petSearch')?.value || '').trim().toLowerCase();
  const especie = document.getElementById('fEspecie')?.value || '';
  const estado = document.getElementById('fEstado')?.value || '';
  const raza = document.getElementById('fRaza')?.value || '';
  const filtered = pets.filter(p => {
    const hayTexto = !q || [p.name, p.owner, p.breed, p.vet, p.species, p.id, p.vac, p.next].join(' ').toLowerCase().includes(q);
    const coincideEspecie = !especie || p.species === especie;
    const coincideEstado = !estado || p.vac === estado;
    const coincideRaza = !raza || p.breed === raza;
    return hayTexto && coincideEspecie && coincideEstado && coincideRaza;
  });

  document.getElementById('petsBody').innerHTML = filtered.map(p => `
    <tr class="table-row">
      <td><div class="cell-person"><div class="thumb"><img src="${p.emoji}" alt="${p.species}" style="width:100%;height:100%;object-fit:cover;border-radius:9px;"></div><div><div><b>${p.name}</b></div><div class="sub">${p.id}</div></div></div></td>
      <td>${p.species}</td><td>${p.breed}</td>
      <td>${p.owner}</td><td>${p.vet}</td>
      <td>${vacBadge(p.vac)}</td><td>${p.next}</td>
      <td><div class="row-actions">
        <button class="icon-btn" title="View" onclick="toast('Opening record for ${p.name}')">${ICON.eye}</button>
        <button class="icon-btn" title="Medical history" onclick="toast('Opening medical history for ${p.name}')">${ICON.file}</button>
        <button class="icon-btn" title="Edit" onclick="toast('Editing data for ${p.name}')">${ICON.edit}</button>
        <button class="icon-btn" title="Delete patient" onclick="eliminarPaciente(${p.dbId}, '${p.name.replace(/'/g, "\\'")}')">${ICON.more}</button>
      </div></td>
    </tr>
  `).join('') || `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:24px;">No se encontraron mascotas con esos filtros.</td></tr>`;

  const countEl = document.getElementById('petsCount');
  if(countEl){
    countEl.textContent = filtered.length ? `Showing 1 to ${filtered.length} of ${filtered.length} pets` : 'No results found for this search';
  }
}

function currentAfilList(){ return afilTab==='activos' ? affiliations : expiredAfiliaciones; }

function renderAfiliaciones(){
  const q = (document.getElementById('afilSearch')?.value || '').toLowerCase();
  const estado = document.getElementById('afilEstado')?.value || '';
  const list = currentAfilList().filter(a =>
    (!q || (a.code+a.owner+a.email).toLowerCase().includes(q)) &&
    (!estado || a.status===estado)
  );
  document.getElementById('afilBody').innerHTML = list.map((a) => `
    <tr class="table-row">
      <td><b>${a.code}</b><br><button class="link" style="padding:0;font-size:11.5px;" onclick="navigator.clipboard && navigator.clipboard.writeText('${a.code}');toast('Código copied to clipboard')">Copy ⧉</button></td>
      <td><button class="thumb" style="width:26px;height:26px;font-size:11px;border:none;cursor:pointer;" title="View QR" onclick="showCódigoDetails('${a.code}')">▦</button></td>
      <td>${a.owner}</td><td>${a.email}</td>
      <td>${statusBadge(a.status)}</td>
      <td>${a.exp}${a.daysLeft?`<div class="sub" style="color:var(--muted);font-size:11.5px;">${a.daysLeft} days left</div>`:''}</td>
      <td>${a.uses}</td>
      <td><div class="row-actions">
        <button class="icon-btn" title="Ver detalles" onclick="showCódigoDetails('${a.code}')">${ICON.eye}</button>
        <button class="icon-btn" title="Regenerate" onclick="regenerarCodigo('${a.code}')">${ICON.edit}</button>
        <button class="icon-btn" title="Delete patient" onclick="eliminarPaciente(${a.petId || 'null'}, '${(a.petNombre || '').replace(/'/g, "\\'")}')">${ICON.more}</button>
      </div></td>
    </tr>
  `).join('') || `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:24px;">No hay códigos que coincidan con tu búsqueda.</td></tr>`;
  document.getElementById('afilCount').textContent = `Showing 1 to ${list.length} of ${currentAfilList().length} ${afilTab==='activos' ? 'active' : 'expired'} codes`;
}

function switchAfilTab(tab){
  afilTab = tab;
  document.querySelectorAll('#page-afiliaciones .tab').forEach(t => t.classList.toggle('active', t.dataset.tab===tab));
  document.getElementById('afilTabLabel').textContent = tab==='activos' ? 'Códigos activos' : 'Expired Códigos';
  renderAfiliaciones();
  const list = currentAfilList();
  if(list.length) showCódigoDetails(list[0].code); else document.getElementById('codePanel').style.display = 'none';
}

// El QR codifica el mismo código alfanumérico que se muestra como texto.
// La futura app del dueño (cámara QR) debe decodificar este texto y llamar
// a recibirSolicitudAfiliacion(code, id_client) para dejar la solicitud
// pendiente de aprobación acá.
function drawQR(containerId, text){
  const el = document.getElementById(containerId);
  if(!el) return;
  el.innerHTML = '';
  if(window.QRCódigo){
    new QRCódigo(el, {text, width:220, height:220, colorDark:'#0F172A', colorLight:'#ffffff', correctLevel:QRCódigo.CorrectLevel.M});
  } else {
    el.innerHTML = `<div style="width:200px;height:200px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:12px;text-align:center;padding:10px;">No se pudo cargar el generador de QR</div>`;
  }
}

function downloadQR(containerId, filename){
  const el = document.getElementById(containerId);
  const img = el?.querySelector('img');
  const canvas = el?.querySelector('canvas');
  const src = img ? img.src : (canvas ? canvas.toDataURL('image/png') : null);
  if(!src){ toast('The QR code is still being generated, please try again'); return; }
  const a = document.createElement('a');
  a.href = src;
  a.download = filename + '.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast('⬇️ QR code downloaded');
}

function shareCódigo(code){
  const shareText = `Join Clínica Veterinaria Happy Paws on Doppy with code: ${code}`;
  if(navigator.share){
    navigator.share({title:'Doppy affiliation code', text:shareText}).catch(()=>{});
  } else if(navigator.clipboard){
    navigator.clipboard.writeText(shareText);
    toast('🔗 Share link copied to clipboard');
  } else {
    toast('🔗 ' + shareText);
  }
}

function randomCódigo(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand = n => Array.from({length:n}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
  return `DOPPY-${rand(4)}-${rand(4)}`;
}

async function eliminarPaciente(petId, petNombre){
  if (!petId) { toast('No patient linked to this row'); return; }
  const confirmed = confirm(`Delete ${petNombre || 'this patient'}? This also removes their vaccination records, appointments and affiliation history. This cannot be undone.`);
  if (!confirmed) return;
  if (!requireSupabase()) return;
  const { error } = await supabaseClient.from('pets').delete().eq('id', petId);
  if (error) { console.error('eliminarPaciente', error); toast('Error deleting patient'); return; }
  toast(`🗑️ ${petNombre || 'Patient'} deleted`);
  await Promise.all([loadPets(), loadAfiliaciones(), loadPanelStats()]);
  renderPets(); renderAfiliaciones(); renderPanelTables();
}

/* ============ AFFILIATIONS: ACCIONES CONTRA SUPABASE ============ */

async function generarCodigo(){
  if (!requireSupabase()) return;
  const code = randomCódigo();
  const expiration = new Date(); expiration.setDate(expiration.getDate() + 30);
  const { error } = await supabaseClient.from('affiliations').insert({
    code,
    veterinary_id: CURRENT_VETERINARY_ID,
    status: 'unclaimed',
    max_uses: 10,
    current_uses: 0,
    expiration_date: expiration.toISOString().slice(0, 10),
    generated_by: CURRENT_STAFF_ID
  });
  if (error) { console.error('generarCodigo', error); toast('Error generating code'); return; }
  toast(`🏷️ Código ${code} generated successfully`);
  await loadAfiliaciones();
  afilTab = 'activos';
  switchAfilTab('activos');
  showCódigoDetails(code);
}

async function regenerarCodigo(oldCódigo){
  if (!requireSupabase()) return;
  const item = currentAfilList().find(x => x.code === oldCódigo);
  if (!item) return;
  const newCódigo = randomCódigo();
  const { error } = await supabaseClient.from('affiliations')
    .update({ code: newCódigo, current_uses: 0, status: 'unclaimed' })
    .eq('id', item.dbId);
  if (error) { console.error('regenerarCodigo', error); toast('Error regenerating code'); return; }
  toast(`🔄 Código regenerated: ${newCódigo}`);
  await loadAfiliaciones();
  renderAfiliaciones();
  if (selectedCódigo === oldCódigo) showCódigoDetails(newCódigo);
}

function showCódigoDetails(code){
  const a = currentAfilList().find(x => x.code===code);
  if(!a) return;
  selectedCódigo = code;
  document.getElementById('codePanel').style.display = 'block';
  document.getElementById('codePanelBody').innerHTML = `
    <div style="text-align:center;margin-top:10px;">
      <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;font-weight:700;">Código de afiliación</div>
      <div style="font-size:22px;font-weight:800;letter-spacing:.03em;font-family:monospace;margin:4px 0 10px;color:var(--ink);">${a.code}</div>
    </div>
    <div class="qr" id="qrTarget" style="display:flex;align-items:center;justify-content:center;margin-bottom:14px;"></div>
    <div style="text-align:center;">
      <div style="margin-bottom:4px;">${statusBadge(a.status)}</div>
      <button class="btn" style="padding:6px 14px;font-size:12px;display:inline-flex;margin-top:4px;" onclick="navigator.clipboard && navigator.clipboard.writeText('${a.code}');toast('Código copied to clipboard')">⧉ Copy Código</button>
      <p style="font-size:11.5px;color:var(--muted);margin:10px 0 0;line-height:1.4;">
        The owner can <b>scan the QR</b> or <b>type this code</b> into the Doppy app: both options do exactly the same thing — they send an affiliation request that appears under <b>Solicitudes de afiliación</b> on the Panel for you to approve or reject.
      </p>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:8px;margin-top:14px;">
      <button class="btn" style="flex:1;justify-content:center;" onclick="downloadQR('qrTarget','${a.code}')">${ICON.download} Download QR</button>
      <button class="btn" style="flex:1;justify-content:center;" onclick="shareCódigo('${a.code}')">${ICON.invite} Share</button>
    </div>
    <div class="kv"><span>Fecha de vencimiento</span><span>${a.exp}</span></div>
    <div class="kv"><span>Usos</span><span>${a.uses}</span></div>
    <div class="kv"><span>Usado por</span><span>${a.owner}</span></div>
    <div class="kv"><span>Correo</span><span>${a.email}</span></div>
    <button class="btn danger" style="width:100%;margin-top:14px;" onclick="regenerarCodigo('${a.code}')">🔄 Regenerate Código</button>
  `;
  drawQR('qrTarget', a.code);
}

/* Solicitudes (afiliaciones con status='pending') */

function renderSolicitudes(){
  const el = document.getElementById('solicitudesBody');
  const count = document.getElementById('solicitudesCount');
  if(!el) return;
  if(count) count.textContent = solicitudes.length;
  const vetOptions = vets.map(v => `<option value="${v.dbId}">${v.name}</option>`).join('') || '<option value="">Aún no hay veterinarios</option>';
  el.innerHTML = solicitudes.length ? solicitudes.map(s => `
    <div class="activity-item" style="align-items:center;">
      <div class="dot-lead" style="background:var(--amber);"></div>
      <div class="txt"><b>📷 ${s.nombre}</b><p>Quiere afiliarse con el código <b>${s.code}</b> · ${s.email}</p></div>
      <div class="row-actions" style="margin-left:auto;align-items:center;">
        <select id="vetSelect-${s.id}" style="padding:6px 8px;border:1px solid var(--line);border-radius:8px;font-size:12px;">${vetOptions}</select>
        <button class="btn primary" style="padding:6px 14px;font-size:12px;" onclick="aprobarSolicitud(${s.id})">Aprobar</button>
        <button class="btn danger" style="padding:6px 14px;font-size:12px;" onclick="rechazarSolicitud(${s.id})">Rechazar</button>
      </div>
    </div>
  `).join('') : `<div class="empty-note" style="padding:16px;">No hay solicitudes de afiliación pendientes por el momento.</div>`;
}

async function aprobarSolicitud(id){
  if (!requireSupabase()) return;
  const vetSelect = document.getElementById(`vetSelect-${id}`);
  const chosenVetId = vetSelect && vetSelect.value ? Number(vetSelect.value) : null;

  const { data: afil, error: findErr } = await supabaseClient.from('affiliations')
    .select('pet_id, current_uses').eq('id', id).maybeSingle();
  if (findErr || !afil) { console.error('aprobarSolicitud (find)', findErr); toast('Error approving request'); return; }

  const { error } = await supabaseClient.from('affiliations')
    .update({ status: 'active', resolved_at: new Date().toISOString(), current_uses: (afil.current_uses || 0) + 1 })
    .eq('id', id);
  if (error) { console.error('aprobarSolicitud', error); toast('Error approving request'); return; }

  // Vincular la mascota a esta clínica Y al veterinario elegido para que
  // aparezca en Pacientes con su doctor asignado, no solo con la clínica.
  if (afil.pet_id) {
    const { error: petErr } = await supabaseClient.from('pets')
      .update({ primary_clinic_id: CURRENT_VETERINARY_ID, assigned_veterinarian_id: chosenVetId })
      .eq('id', afil.pet_id);
    if (petErr) console.error('aprobarSolicitud (link pet)', petErr);
  }

  toast('✅ Request approved');
  await Promise.all([loadSolicitudes(), loadAfiliaciones(), loadPets(), loadPanelStats()]);
  renderSolicitudes(); renderAfiliaciones(); renderPets(); renderPanelTables();
}

async function rechazarSolicitud(id){
  if (!requireSupabase()) return;
  const { error } = await supabaseClient.from('affiliations')
    .update({ status: 'rejected', resolved_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { console.error('rechazarSolicitud', error); toast('Error rejecting request'); return; }
  toast('❌ Request rejected');
  await Promise.all([loadSolicitudes(), loadPanelStats()]);
  renderSolicitudes();
}

/* ============================================================
   PUNTO DE INTEGRACIÓN: afiliación vía QR o código manual
   ------------------------------------------------------------
   Debe llamarse cuando un dueño escanea el QR o tipea el código
   manualmente en la app de dueños. Ambos caminos deben llamar a
   esta misma función para que el resultado sea idéntico.
   ============================================================ */
async function recibirSolicitudAfiliacion(code, idClient, petId){
  if (!requireSupabase()) return;
  const { data: match, error: findErr } = await supabaseClient.from('affiliations')
    .select('id, status').eq('code', code).maybeSingle();
  if (findErr || !match) { toast(`⚠️ Código ${code} is not valid or no longer exists`); return; }
  if (match.status === 'pending') { toast('There is already a pending request for this code'); return; }

  const { error } = await supabaseClient.from('affiliations').update({
    status: 'pending', id_client: idClient, pet_id: petId, requested_at: new Date().toISOString()
  }).eq('id', match.id);
  if (error) { console.error('recibirSolicitudAfiliacion', error); toast('Error registering the request'); return; }

  await loadSolicitudes();
  renderSolicitudes();
  toast(`📷 New affiliation request received for code ${code}`);
}
window.recibirSolicitudAfiliacion = recibirSolicitudAfiliacion;

function showAdminPerfil(){
  document.getElementById('adminLastLogin').textContent = new Date().toLocaleString('en-US', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'});
  document.getElementById('adminModalBg').classList.add('open');
}

/* ============ STAFF ============ */

function renderVets(){
  const q = (document.getElementById('vetSearch')?.value || '').toLowerCase();
  const estado = document.getElementById('vetEstado')?.value || '';
  const filtered = vets.filter(v =>
    (!q || (v.name+v.spec).toLowerCase().includes(q)) &&
    (!estado || v.status===estado)
  );
  document.getElementById('vetsBody').innerHTML = filtered.map(v => `
    <tr class="table-row">
      <td><div class="cell-person"><div class="thumb">🩺</div><div><div><b>${v.name}</b></div><div class="sub">${v.mv}</div></div></div></td>
      <td><span class="badge gray">${v.role}</span></td>
      <td>${v.spec}</td><td>${v.email}</td><td>${v.schedule}</td><td>${v.patients}</td>
      <td>${statusBadge(v.status)}</td>
      <td><div class="row-actions">
        <button class="icon-btn" title="View profile" onclick="showVetDetails('${v.mv}')">${ICON.eye}</button>
        <button class="icon-btn" title="Edit" onclick="toast('Editing profile for ${v.name}')">${ICON.edit}</button>
        <button class="icon-btn" title="More" onclick="toast('More actions for ${v.name}')">${ICON.more}</button>
      </div></td>
    </tr>
  `).join('') || `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:24px;">No hay veterinarios que coincidan.</td></tr>`;
  document.getElementById('vetsCount').textContent = `Showing 1 to ${filtered.length} of ${vets.length} veterinarians`;
  setText('statVets', vets.length);
}

function showVetDetails(mv){
  const v = vets.find(x => x.mv===mv);
  if(!v) return;
  document.getElementById('vetPanel').style.display = 'block';
  document.getElementById('vetPanelBody').innerHTML = `
    <div style="text-align:center;margin:14px 0;">
      <div class="avatar" style="width:64px;height:64px;font-size:20px;margin:0 auto 10px;">${v.name.split(' ').map(w=>w[0]).slice(0,2).join('')}</div>
      <div style="font-weight:700;">${v.name} ${statusBadge(v.status)}</div>
      <div class="sub" style="color:var(--muted);font-size:12.5px;">${v.role} · ${v.spec}</div>
      <div class="sub" style="color:var(--muted);font-size:12px;">${v.mv}</div>
    </div>
    <div class="kv"><span>Correo</span><span>${v.email}</span></div>
    <div class="kv"><span>Horario</span><span>${v.schedule}</span></div>
    <div class="kv"><span>Pacientes asignados</span><span>${v.patients}</span></div>
    <div style="display:flex;gap:8px;margin-top:14px;">
      <button class="btn" style="flex:1;justify-content:center;" onclick="toast('Opening profile editor')">Editar perfil</button>
      <button class="btn" style="flex:1;justify-content:center;" onclick="toast('Message sent to ${v.name}')">Enviar mensaje</button>
    </div>
    <button class="btn danger" style="width:100%;margin-top:8px;" onclick="toast('Account for ${v.name} deactivated')">Desactivar cuenta</button>
  `;
}

async function submitVet(){
  if (!requireSupabase()) return;
  const name = document.getElementById('mVetNombre').value.trim();
  if(!name){ toast('Please enter a name for the veterinarian'); return; }
  const spec = document.getElementById('mVetSpec').value.trim() || 'General Medicine';
  const email = document.getElementById('mVetCorreo').value.trim() || null;
  const start = document.getElementById('mVetHorarioStart').value || null;
  const end = document.getElementById('mVetHorarioEnd').value || null;

  const { error } = await supabaseClient.from('veterinary_staff').insert({
    nombre: name, rol: 'Veterinario', specialty: spec, email,
    schedule_start: start, schedule_end: end,
    veterinary_id: CURRENT_VETERINARY_ID, status: 'active'
  });
  if (error) { console.error('submitVet', error); toast('Error adding veterinarian'); return; }

  closeModal('vetModalBg');
  ['mVetNombre','mVetSpec','mVetCorreo'].forEach(id => document.getElementById(id).value = '');
  await Promise.all([loadVets(), loadPanelStats()]);
  renderVets(); renderPanelTables(); populateVetSelect();
  toast(`✅ ${name} was added to the team`);
}

/* ============ PATIENTS ============ */

async function submitPet(){
  if (!requireSupabase()) return;
  const name = document.getElementById('mPetNombre').value.trim();
  if(!name){ toast('Please enter a name for the pet'); return; }
  const species = document.getElementById('mPetEspecie').value;
  const breed = document.getElementById('mPetRaza').value.trim() || null;
  const ownerCorreo = document.getElementById('mPetDueño').value.trim();
  const date = document.getElementById('mPetDate').value;

  let ownerId = null;
  if (ownerCorreo) {
    const { data: ownerMatch } = await supabaseClient.from('users').select('id_client').eq('email', ownerCorreo).maybeSingle();
    if (!ownerMatch) { toast(`⚠️ No owner found with email ${ownerCorreo}. The pet will be registered without an owner.`); }
    ownerId = ownerMatch?.id_client || null;
  }

  const { data: inserted, error } = await supabaseClient.from('pets').insert({
    pet_name: name, petTypes: species, pet_breed: breed,
    owner_id: ownerId, primary_clinic_id: CURRENT_VETERINARY_ID
  }).select().single();
  if (error) { console.error('submitPet', error); toast('Error registering pet'); return; }

  if (date && inserted) {
    const vetId = document.getElementById('mPetVet').value || null;
    await supabaseClient.from('appointments').insert({
      pet_id: inserted.id, veterinary_id: CURRENT_VETERINARY_ID, veterinarian_id: vetId,
      title: `${name}'s Checkup`, appointment_date: date, type: 'checkup', status: 'scheduled'
    });
  }

  closeModal('petModalBg');
  ['mPetNombre','mPetRaza','mPetDueño','mPetDate'].forEach(id => document.getElementById(id).value = '');
  await Promise.all([loadPets(), loadPanelStats()]);
  renderPets();
  toast(`✅ ${name} was registered successfully`);
}

/* ============ DASHBOARD ============ */

function renderPanelTables(){
  document.getElementById('activityList').innerHTML = activity.length ? activity.map(a => `
    <div class="activity-item">
      <div class="dot-lead" style="background:${a.color};"></div>
      <div class="txt"><b>${a.icon} ${a.title}</b><p>${a.desc}</p></div>
      <div class="time">${a.time}</div>
    </div>`).join('') : `<div class="empty-note" style="padding:16px;">Aún no hay actividad reciente.</div>`;

  document.getElementById('dashAfilBody').innerHTML = affiliations.slice(0,4).map(a => `
    <tr class="table-row"><td>—</td><td>${a.owner}</td>
    <td>${a.code}</td><td>${statusBadge(a.status)}</td><td>${a.exp}</td>
    <td><button class="icon-btn" onclick="go('afiliaciones')">${ICON.eye}</button></td></tr>`).join('');

  document.getElementById('dashVetBody').innerHTML = vets.slice(0,4).map(v => `
    <tr class="table-row"><td>${v.name}</td><td>${v.spec}</td><td>${statusBadge(v.status)}</td>
    <td><button class="icon-btn" onclick="go('personal')">${ICON.eye}</button></td></tr>`).join('');
}

function renderNotifications(){
  const el = document.getElementById('ddNotif');
  const dot = document.getElementById('notifDot');
  if(!el) return;
  el.innerHTML = notifications.length ? notifications.map(n => `
    <div class="item">${n.icon} <div><b>${n.title}</b><span>${n.desc}</span></div></div>
  `).join('') : `<div class="item"><span>No tienes notificaciones nuevas</span></div>`;
  if(dot){
    dot.textContent = notifications.length;
    dot.style.display = notifications.length ? 'flex' : 'none';
  }
}

/* ============ REPORTS (charts, conectado a Supabase) ============ */
let reportCharts = {};

function destroyChart(key){
  if(reportCharts[key]){ reportCharts[key].destroy(); reportCharts[key] = null; }
}

async function countInRange(table, filters, dateField, since, until){
  let q = supabaseClient.from(table).select('id', { count: 'exact', head: true });
  Object.entries(filters).forEach(([k, v]) => { q = q.eq(k, v); });
  if (since) q = q.gte(dateField, since.toISOString());
  if (until) q = q.lt(dateField, until.toISOString());
  const { count, error } = await q;
  if (error) { console.error('countInRange', table, error); return 0; }
  return count || 0;
}

function getBuckets(range, since){
  if (range === '7d') {
    const edges = Array.from({length:7}, (_,i) => new Date(since.getTime() + i*86400000));
    return { size:'day', edges, labels: edges.map(d => d.toLocaleDateString('en-US',{weekday:'short'})) };
  }
  if (range === '30d') {
    const edges = Array.from({length:4}, (_,i) => new Date(since.getTime() + i*7*86400000));
    return { size:'week', edges, labels:['Week 1','Week 2','Week 3','Week 4'] };
  }
  const n = range === 'trim' ? 3 : 12;
  const edges = Array.from({length:n}, (_,i) => { const d = new Date(since); d.setMonth(since.getMonth()+i); return d; });
  return { size:'month', edges, labels: edges.map(d => d.toLocaleDateString('en-US',{month:'short'})) };
}

function bucketCount(dates, edges, size){
  const counts = new Array(edges.length).fill(0);
  const bucketEnd = (i) => {
    if (i+1 < edges.length) return edges[i+1];
    const d = new Date(edges[i]);
    if (size==='day') d.setDate(d.getDate()+1);
    else if (size==='week') d.setDate(d.getDate()+7);
    else d.setMonth(d.getMonth()+1);
    return d;
  };
  dates.forEach(dt => {
    const t = new Date(dt).getTime();
    for (let i = edges.length-1; i >= 0; i--) {
      if (t >= edges[i].getTime() && t < bucketEnd(i).getTime()) { counts[i]++; break; }
    }
  });
  return counts;
}

function setDelta(id, current, previous){
  const el = document.getElementById(id);
  if (!el) return;
  if (!previous) { el.textContent = 'vs previous period'; el.classNombre = 'delta up'; return; }
  const pct = ((current - previous) / previous) * 100;
  const arrow = pct >= 0 ? '↑' : '↓';
  el.textContent = `${arrow} ${Math.abs(pct).toFixed(1)}% vs previous period`;
  el.classNombre = 'delta ' + (pct >= 0 ? 'up' : 'down');
}

async function renderReportes(){
  if (typeof Chart === 'undefined') return;
  if (!requireSupabase()) return;
  const range = document.getElementById('repRango')?.value || '30d';

  const until = new Date();
  const since = new Date();
  if (range === '7d') since.setDate(until.getDate() - 7);
  else if (range === '30d') since.setDate(until.getDate() - 30);
  else if (range === 'trim') since.setMonth(until.getMonth() - 3);
  else since.setFullYear(until.getFullYear() - 1);
  const spanMs = until.getTime() - since.getTime();
  const prevSince = new Date(since.getTime() - spanMs);
  const prevUntil = since;

  // Turnos del período (para KPIs, gráfico de vacunas por veterinario, cancelados/no-shows)
  const { data: apptsData, error: apptsErr } = await supabaseClient
    .from('appointments')
    .select('appointment_date, status, veterinarian_id')
    .eq('veterinary_id', CURRENT_VETERINARY_ID)
    .gte('appointment_date', since.toISOString());
  if (apptsErr) console.error('renderReportes appointments', apptsErr);
  const appts = apptsData || [];

  const totalAppts = appts.length;
  const cancelled = appts.filter(a => a.status === 'cancelled').length;
  const noShows = appts.filter(a => a.status === 'no_show').length;
  const completed = appts.filter(a => a.status === 'completed').length;
  const attendanceBase = totalAppts - cancelled;
  const attendance = attendanceBase > 0 ? Math.round((completed / attendanceBase) * 100) : 0;

  const [prevTotalAppts, newPacientesCount, prevNewPacientesCount] = await Promise.all([
    countInRange('appointments', { veterinary_id: CURRENT_VETERINARY_ID }, 'appointment_date', prevSince, prevUntil),
    countInRange('pets', { primary_clinic_id: CURRENT_VETERINARY_ID }, 'created_at', since, until),
    countInRange('pets', { primary_clinic_id: CURRENT_VETERINARY_ID }, 'created_at', prevSince, prevUntil)
  ]);

  const startOfMonth = new Date(until.getFullYear(), until.getMonth(), 1);
  const vaccinesThisMonth = await countInRange('vaccination_record', { veterinary_id: CURRENT_VETERINARY_ID }, 'created_at', startOfMonth, null);

  // Tiempo promedio de uso de un código (desde generado/pedido hasta aprobado)
  const { data: resolvedAfil } = await supabaseClient
    .from('affiliations')
    .select('requested_at, resolved_at')
    .eq('veterinary_id', CURRENT_VETERINARY_ID)
    .eq('status', 'active')
    .not('resolved_at', 'is', null)
    .not('requested_at', 'is', null);
  let avgUsageDays = '0.0';
  if (resolvedAfil && resolvedAfil.length) {
    const totalDays = resolvedAfil.reduce((sum, a) => sum + Math.max(0, (new Date(a.resolved_at) - new Date(a.requested_at)) / 86400000), 0);
    avgUsageDays = (totalDays / resolvedAfil.length).toFixed(1);
  }

  // Turnos por veterinario (dentro del rango) + más solicitado + especialidad más pedida
  const vetApptCounts = {};
  appts.forEach(a => { if (a.veterinarian_id) vetApptCounts[a.veterinarian_id] = (vetApptCounts[a.veterinarian_id] || 0) + 1; });
  const vetNombres = vets.map(v => v.name.replace('Dr. ', ''));
  const vetPacientes = vets.map(v => vetApptCounts[v.dbId] || 0);
  let mostRequestedVet = '—', mostSpecialty = '—';
  if (vets.length) {
    const topVet = vets.reduce((best, v) => (vetApptCounts[v.dbId] || 0) > (vetApptCounts[best.dbId] || 0) ? v : best, vets[0]);
    if (vetApptCounts[topVet.dbId]) mostRequestedVet = topVet.name;
    const specCounts = {};
    vets.forEach(v => { specCounts[v.spec] = (specCounts[v.spec] || 0) + (vetApptCounts[v.dbId] || 0); });
    const topSpec = Object.entries(specCounts).sort((a,b) => b[1]-a[1])[0];
    if (topSpec && topSpec[1] > 0) mostSpecialty = topSpec[0];
  }

  // "Pacientes nuevos por mes" — mascotas nuevas agrupadas en el rango elegido
  const { data: petsCreated } = await supabaseClient
    .from('pets').select('created_at')
    .eq('primary_clinic_id', CURRENT_VETERINARY_ID)
    .gte('created_at', since.toISOString());
  const buckets = getBuckets(range, since);
  const monthlyValues = bucketCount((petsCreated || []).map(p => p.created_at), buckets.edges, buckets.size);

  // Especies y estado de vacunación: foto actual (no depende del rango de fechas)
  const speciesCounts = {};
  pets.forEach(p => { const key = p.species || 'Other'; speciesCounts[key] = (speciesCounts[key] || 0) + 1; });
  const dogs = speciesCounts['Dog'] || 0, cats = speciesCounts['Cat'] || 0;
  const others = Math.max(0, pets.length - dogs - cats);

  const vacCounts = { 'Al día': 0, 'Próxima': 0, 'Vencido': 0 };
  pets.forEach(p => { vacCounts[p.vac] = (vacCounts[p.vac] || 0) + 1; });

  /* ---- KPIs ---- */
  document.getElementById('repCitas').textContent = totalAppts.toLocaleString('en-US');
  document.getElementById('repAsistencia').textContent = attendance + '%';
  document.getElementById('repNuevos').textContent = newPacientesCount;
  setDelta('repCitasDelta', totalAppts, prevTotalAppts);
  setDelta('repNuevosDelta', newPacientesCount, prevNewPacientesCount);
  const asistDeltaEl = document.getElementById('repAsistDelta');
  if (asistDeltaEl) { asistDeltaEl.textContent = `${completed}/${attendanceBase || 0} completed`; asistDeltaEl.classNombre = 'delta up'; }

  /* ---- Resumen rápido ---- */
  const summaryCard = document.getElementById('reportsQuickSummaryCard');
  if (summaryCard) {
    summaryCard.innerHTML = `
      <div class="card-head"><h3>Resumen rápido</h3></div>
      <div class="kv"><span>Citas canceladas</span><span>${cancelled}</span></div>
      <div class="kv"><span>Inasistencias</span><span>${noShows} (${totalAppts ? ((noShows/totalAppts)*100).toFixed(1) : 0}%)</span></div>
      <div class="kv"><span>Tiempo promedio de uso del código</span><span>${avgUsageDays} days</span></div>
      <div class="kv"><span>Vaccines administered (month)</span><span>${vaccinesThisMonth}</span></div>
      <div class="kv"><span>Veterinario más solicitado</span><span>${mostRequestedVet}</span></div>
      <div class="kv"><span>Especialidad más solicitada</span><span>${mostSpecialty}</span></div>
      <button class="btn" style="width:100%;margin-top:14px;" onclick="generarReporteDetallado()">${ICON.file} Generate Detailed Report</button>
    `;
  }

  /* ---- Charts ---- */
  const inkMuted = '#64748B';
  const gridColor = '#F1F5F9';
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.color = inkMuted;

  destroyChart('monthly');
  reportCharts.monthly = new Chart(document.getElementById('chartMonthly'), {
    type:'line',
    data:{ labels: buckets.labels, datasets:[{
      label:'New patients', data: monthlyValues, borderColor:'#2563EB',
      backgroundColor:'rgba(37,99,235,0.12)', fill:true, tension:0.35, pointRadius:3, pointBackgroundColor:'#2563EB'
    }]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{ y:{ beginAtZero:true, ticks:{precision:0}, grid:{ color: gridColor } }, x:{ grid:{ display:false } } }
    }
  });

  destroyChart('species');
  reportCharts.species = new Chart(document.getElementById('chartEspecie'), {
    type:'doughnut',
    data:{ labels:['Dogs','Cats','Others'], datasets:[{
      data: [dogs, cats, others], backgroundColor:['#2563EB','#7C3AED','#D97706'], borderWidth:0
    }]},
    options:{ responsive:true, maintainAspectRatio:false, cutout:'65%',
      plugins:{ legend:{ position:'bottom', labels:{ boxWidth:10, padding:14 } } }
    }
  });

  destroyChart('vac');
  reportCharts.vac = new Chart(document.getElementById('chartVac'), {
    type:'bar',
    data:{ labels:['Al día','Próxima','Vencido'], datasets:[{
      data: [vacCounts['Al día'], vacCounts['Próxima'], vacCounts['Vencido']],
      backgroundColor:['#16A34A','#D97706','#DC2626'], borderRadius:8, barThickness:44
    }]},
    options:{ responsive:true, maintainAspectRatio:false, indexAxis:'y',
      plugins:{ legend:{ display:false } },
      scales:{ x:{ beginAtZero:true, ticks:{precision:0}, grid:{ color: gridColor } }, y:{ grid:{ display:false } } }
    }
  });

  destroyChart('vets');
  reportCharts.vets = new Chart(document.getElementById('chartVets'), {
    type:'bar',
    data:{ labels: vetNombres, datasets:[{
      data: vetPacientes, backgroundColor:'#818CF8', borderRadius:6, barThickness:22
    }]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{ y:{ beginAtZero:true, ticks:{precision:0}, grid:{ color: gridColor } }, x:{ grid:{ display:false }, ticks:{ maxRotation:0, autoSkip:false, font:{ size:10.5 } } } }
    }
  });

  destroyChart('afil');
  const usedActivoCount = affiliations.filter(a => a.status === 'Activo' && a.uses !== '0/10').length;
  reportCharts.afil = new Chart(document.getElementById('chartAfil'), {
    type:'bar',
    data:{ labels:['Activo','Used','Expired'], datasets:[{
      data:[statCounters.activos, usedActivoCount, expiredAfiliaciones.length],
      backgroundColor:['#2563EB','#16A34A','#DC2626'], borderRadius:8, barThickness:40
    }]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{ y:{ beginAtZero:true, ticks:{precision:0}, grid:{ color: gridColor } }, x:{ grid:{ display:false } } }
    }
  });
}

function exportarReportePDF(){
  if(typeof window.jspdf === 'undefined'){ toast('Could not load the PDF generator'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'pt', format:'a4' });
  const margin = 40;
  let y = margin;

  doc.setFont('helvetica','bold'); doc.setFontSize(18);
  doc.text('Clínica Report — Clínica Veterinaria Happy Paws', margin, y); y += 22;
  doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(100);
  const rangoTexto = document.getElementById('repRango').selectedOptions[0].text;
  doc.text(`Range: ${rangoTexto}  ·  Generated: ${new Date().toLocaleString('en-US')}`, margin, y); y += 24;
  doc.setTextColor(20);

  doc.setFont('helvetica','bold'); doc.setFontSize(12);
  const kpis = [
    ['Total de citas', document.getElementById('repCitas').textContent],
    ['Tasa de asistencia', document.getElementById('repAsistencia').textContent],
    ['Pacientes nuevos', document.getElementById('repNuevos').textContent],
  ];
  doc.setFont('helvetica','normal');
  kpis.forEach(([label,val]) => { doc.text(`${label}: ${val}`, margin, y); y += 18; });
  y += 8;

  const chartSections = [
    {id:'chartMonthly', label:'Pacientes nuevos'},
    {id:'chartEspecie', label:'Especie Distribution'},
    {id:'chartVac', label:'Estado de vacunación'},
    {id:'chartVets', label:'Pacientes por veterinario'},
    {id:'chartAfil', label:'Códigos de afiliación'},
  ];
  chartSections.forEach(({id,label}) => {
    const canvas = document.getElementById(id);
    if(!canvas) return;
    const imgData = canvas.toDataURL('image/png', 1.0);
    const imgWidth = 250, imgHeight = 145;
    if(y + imgHeight + 20 > 800){ doc.addPage(); y = margin; }
    doc.setFont('helvetica','bold'); doc.setFontSize(11);
    doc.text(label, margin, y); y += 10;
    doc.addImage(imgData, 'PNG', margin, y, imgWidth, imgHeight);
    y += imgHeight + 22;
  });

  doc.save(`doppy-report-${Date.now()}.pdf`);
  toast('📄 PDF report downloaded');
}

function generarReporteDetallado(){
  if(typeof window.jspdf === 'undefined'){ toast('Could not load the PDF generator'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'pt', format:'a4' });
  const margin = 40;
  let y = margin;

  const addLine = (text, size=10.5, bold=false) => {
    doc.setFont('helvetica', bold ? 'bold':'normal'); doc.setFontSize(size);
    doc.text(text, margin, y); y += size + 5;
    if(y > 790){ doc.addPage(); y = margin; }
  };

  addLine('Detailed Report — Clínica Veterinaria Happy Paws', 18, true);
  addLine(`Generated: ${new Date().toLocaleString('en-US')}`, 10, false);
  y += 10;

  addLine('Personal veterinario', 13, true);
  vets.forEach(v => addLine(`• ${v.name} — ${v.spec} — ${v.patients} patients — ${v.status}`));
  y += 8;

  addLine('Activo Códigos de afiliación', 13, true);
  affiliations.forEach(a => addLine(`• ${a.code} — ${a.owner} — ${a.status} — uses ${a.uses} — expires ${a.exp}`));
  y += 8;

  addLine('Expired Códigos', 13, true);
  if(!expiredAfiliaciones.length) addLine('No expired codes recorded.');
  expiredAfiliaciones.forEach(a => addLine(`• ${a.code} — ${a.owner} — uses ${a.uses}`));
  y += 8;

  addLine('Pendiente Solicitudes de afiliación', 13, true);
  if(!solicitudes.length) addLine('No pending requests at this time.');
  solicitudes.forEach(s => addLine(`• ${s.nombre} (${s.email}) — code ${s.code} — ${s.time}`));

  doc.save(`doppy-detailed-report-${Date.now()}.pdf`);
  toast('📄 Detailed report generated and downloaded');
}

/* ============ NAVIGATION ============ */
function go(page){
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-'+page)?.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page===page));
  document.querySelectorAll('.bottom-nav-item').forEach(n => n.classList.toggle('active', n.dataset.page===page));
  window.scrollTo({top:0, behavior:'smooth'});
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarBackdrop')?.classList.remove('open');
  if(page==='reportes') setTimeout(renderReportes, 30);
  if(page==='configuracion') setTimeout(loadClínicaConfiguración, 30);
}

/* ============ MODALS ============ */
function openPetModal(){ populateVetSelect(); document.getElementById('petModalBg').classList.add('open'); }
function openVetModal(){ document.getElementById('vetModalBg').classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }

/* ============ CONFIG (conectado a Supabase) ============ */

function setValue(id, value){
  const el = document.getElementById(id);
  if (el) el.value = value || '';
}

let lastLoadedClínica = null;

async function loadClínicaConfiguración(){
  if (!requireSupabase()) return;
  const { data: clinic, error } = await supabaseClient
    .from('veterinary')
    .select('*')
    .eq('id_veterinary', CURRENT_VETERINARY_ID)
    .maybeSingle();
  if (error || !clinic) { console.error('loadClínicaConfiguración', error); toast('Error loading clinic settings'); return; }
  lastLoadedClínica = clinic;

  setValue('cfgNombre', clinic.clinic_name);
  setValue('cfgDireccion', clinic.address);
  setValue('cfgCiudad', clinic.city);
  setValue('cfgProvincia', clinic.province);
  setValue('cfgCP', clinic.postal_code);
  setValue('cfgTel', clinic.phone);
  setValue('cfgCorreo', clinic.email);
  setValue('cfgWeb', clinic.website);
  const idiomaSel = document.getElementById('cfgIdioma');
  if (idiomaSel) idiomaSel.value = clinic.language === 'Español' ? 'es' : 'en';

  const [{ count: staffCount }, { count: petsCount }] = await Promise.all([
    supabaseClient.from('veterinary_staff').select('id', { count: 'exact', head: true }).eq('veterinary_id', CURRENT_VETERINARY_ID),
    supabaseClient.from('pets').select('id', { count: 'exact', head: true }).eq('primary_clinic_id', CURRENT_VETERINARY_ID)
  ]);

  const planNombre = clinic.plan ? clinic.plan.charAt(0).toUpperCase() + clinic.plan.slice(1) : 'Basic';
  setText('planNombreLabel', planNombre + ' Plan');
  setText('planUsuariosLabel', `${staffCount ?? 0} / ${clinic.max_users ?? '—'}`);
  setText('planPacientesLabel', (petsCount ?? 0).toLocaleString('en-US'));
  setText('planNextChargeLabel', clinic.next_charge_date
    ? new Date(clinic.next_charge_date).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
    : '—');
}

async function guardarConfig(){
  const lang = document.getElementById('cfgIdioma')?.value || 'en';
  setIdioma(lang);

  if (!requireSupabase()) return;
  const candidate = {
    clinic_name: document.getElementById('cfgNombre').value.trim(),
    address: document.getElementById('cfgDireccion').value.trim(),
    city: document.getElementById('cfgCiudad').value.trim(),
    province: document.getElementById('cfgProvincia').value.trim(),
    postal_code: document.getElementById('cfgCP').value.trim(),
    phone: document.getElementById('cfgTel').value.trim(),
    email: document.getElementById('cfgCorreo').value.trim(),
    website: document.getElementById('cfgWeb').value.trim(),
    language: lang === 'es' ? 'Español' : 'Inglés'
  };

  // Si ya sabemos qué columnas existen de verdad (porque las cargamos antes con
  // select('*')), solo mandamos esas — así una columna todavía no migrada no
  // hace fallar el guardado entero. Si nunca se cargó, se manda todo igual.
  let payload = candidate;
  if (lastLoadedClínica) {
    payload = {};
    Object.keys(candidate).forEach(k => {
      if (Object.prototype.hasOwnProperty.call(lastLoadedClínica, k)) payload[k] = candidate[k];
    });
  }

  const { error } = await supabaseClient.from('veterinary').update(payload).eq('id_veterinary', CURRENT_VETERINARY_ID);
  if (error) { console.error('guardarConfig', error); toast('Error saving changes'); return; }

  currentAdminContext.clinicNombre = payload.clinic_name || currentAdminContext.clinicNombre;
  applyAdminContextToUI();
  toast(getTranslation('config.toast.saveSuccess', '✅ Changes saved successfully'));
}

/* ============ TOAST ============ */
let toastTimer;
function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ============ INIT ============ */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => go(btn.dataset.page));
  });
  document.querySelectorAll('.bottom-nav-item').forEach(btn => {
    btn.addEventListener('click', () => go(btn.dataset.page));
  });
  document.getElementById('btnBell').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('ddNotif').classList.toggle('open');
    document.getElementById('ddPerfil').classList.remove('open');
  });
  document.getElementById('btnPerfil').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('ddPerfil').classList.toggle('open');
    document.getElementById('ddNotif').classList.remove('open');
  });
  document.addEventListener('click', () => {
    document.getElementById('ddNotif').classList.remove('open');
    document.getElementById('ddPerfil').classList.remove('open');
  });
  document.getElementById('btnLogout').addEventListener('click', () => {
    if(confirm('Cerrar sesión of Doppy?')) toast('Session closed. See you soon!');
  });
  document.getElementById('ddLogout').addEventListener('click', () => {
    if(confirm('Cerrar sesión of Doppy?')) toast('Session closed. See you soon!');
  });
  document.getElementById('btnExplore').addEventListener('click', () => toast('Exploring all of Doppy features…'));
  document.getElementById('cfgIdioma')?.addEventListener('change', (e) => setIdioma(e.target.value));
  document.getElementById('globalSearch').addEventListener('input', (e) => {
    const v = e.target.value.trim();
    const petSearch = document.getElementById('petSearch');
    if (petSearch && document.getElementById('page-pacientes')?.classList.contains('active')) {
      petSearch.value = v;
      renderPets();
    }
  });
  document.querySelectorAll('.modal-bg').forEach(bg => {
    bg.addEventListener('click', (e) => { if(e.target===bg) bg.classList.remove('open'); });
  });

  document.getElementById('btnMenu')?.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebarBackdrop').classList.add('open');
  });
  document.getElementById('sidebarBackdrop')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarBackdrop').classList.remove('open');
  });

  applyTranslations();
  loadAll(); // <-- acá arranca toda la carga real desde Supabase
});

/* ============ MOUNT BODY TEMPLATE ============ */
document.getElementById("root").innerHTML = __BODY_TEMPLATE__();