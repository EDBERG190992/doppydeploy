/* ============================================================
   Doppy — Landing (index.html)
   Sin Supabase: esta página solo es informativa. Maneja el menú
   móvil, las animaciones de entrada y a dónde lleva cada botón.
   ============================================================ */

// Marca que el JS cargó: el CSS solo oculta los .fade-in si existe esta clase.
document.documentElement.classList.add('js');

/* ---------- Menú hamburguesa (móvil) ---------- */
const hamburger = document.getElementById('hamburger');
const navLinks  = document.getElementById('navLinks');

if (hamburger && navLinks) {
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    navLinks.classList.toggle('open');
  });
  // Al elegir una sección, se cierra el menú.
  navLinks.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      hamburger.classList.remove('open');
      navLinks.classList.remove('open');
    });
  });
}

/* ---------- Sombra del nav al hacer scroll ---------- */
const navEl = document.querySelector('nav');
function updateNavShadow() {
  if (navEl) navEl.classList.toggle('scrolled', window.scrollY > 10);
}
window.addEventListener('scroll', updateNavShadow, { passive: true });
updateNavShadow();

/* ---------- Animación de entrada (.fade-in) ---------- */
const fadeEls = document.querySelectorAll('.fade-in');
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  fadeEls.forEach(el => observer.observe(el));
} else {
  fadeEls.forEach(el => el.classList.add('visible'));
}

/* ---------- Barras del panel de ejemplo ----------
   Arrancan en 0 y crecen hasta su altura cuando el panel aparece. */
const chartBars = document.getElementById('chartBars');
if (chartBars) {
  const bars = chartBars.querySelectorAll('.bar');
  const heights = Array.from(bars).map(b => b.style.height);
  bars.forEach(b => { b.style.height = '0%'; });

  const grow = () => bars.forEach((b, i) => { setTimeout(() => { b.style.height = heights[i]; }, i * 80); });
  if ('IntersectionObserver' in window) {
    const barObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) { grow(); barObserver.disconnect(); }
    }, { threshold: 0.4 });
    barObserver.observe(chartBars);
  } else {
    grow();
  }
}

/* ---------- Botones ---------- */
// "Explorar panel" está en la sección para veterinarios → login de veterinaria.
document.querySelector('.btn-blue')?.addEventListener('click', () => {
  window.location.href = 'logindv.html';
});

// Planes: son para clínicas. "Empezar ahora" lleva a elegir tipo de usuario;
// "Hablar con ventas" abre un correo a la cuenta de Doppy del footer.
document.querySelectorAll('.btn-plan').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('outline')) {
      window.location.href = 'mailto:Doppybussines@outlook.com?subject=' + encodeURIComponent('Doppy Tailored — cotización');
    } else {
      window.location.href = 'typeofuser.html';
    }
  });
});

// Botón de la sección final.
document.querySelector('.cta-buttons .btn-white')?.addEventListener('click', () => {
  window.location.href = 'signupdu.html';
});
