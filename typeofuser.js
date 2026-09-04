// doppy.js
// Handles the user-type selection on the "What type of user are you?" screen.

function selectUserType(type) {
  // Guarda el tipo de usuario elegido (owner | vet) antes de navegar
  // a la pantalla de login correspondiente.
  try {
    localStorage.setItem('doppy_user_type', type);
  } catch (e) {
    console.warn('No se pudo guardar el tipo de usuario:', e);
  }
  // La navegación real la realiza el atributo href del <a>,
  // esta función solo registra la selección antes de que ocurra.
}