/* ============================================================
   Doppy — ¿Qué tipo de usuario eres? (typeofuser.html)
   Cada tarjeta ya es un enlace (logindu.html / logindv.html).
   Aquí solo se recuerda la elección y se maneja el botón de ayuda.
   ============================================================ */

function selectUserType(type) {
  // 'owner' → dueño de mascota, 'vet' → personal de clínica veterinaria.
  try {
    localStorage.setItem('doppy_user_type', type);
  } catch (e) {
    console.warn('[Doppy] No se pudo guardar el tipo de usuario:', e);
  }
}

// Marca la tarjeta elegida la última vez, para que el usuario la reconozca.
(function highlightLastChoice() {
  let last = null;
  try { last = localStorage.getItem('doppy_user_type'); } catch (e) {}
  if (!last) return;
  const href = last === 'owner' ? 'logindu.html' : 'logindv.html';
  const card = document.querySelector(`.type-card[href="${href}"]`);
  if (card) card.classList.add('selected');
})();

// Botón "?" de la barra superior.
document.querySelector('button.r-btn')?.addEventListener('click', () => {
  alert(
    'Dueño de mascota: registra a tus mascotas, revisa sus vacunas y citas, y afíliate a tu clínica.\n\n' +
    'Personal de clínica veterinaria: veterinarios y administradores de la clínica. ' +
    'Tu cuenta la crea la clínica.'
  );
});
