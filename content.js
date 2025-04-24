// Log para verificar que el content script se carga
console.log('Content script de PASSWD cargado en:', window.location.href);

// Variable para verificar si ya enviamos el mensaje de listo
let readyMessageSent = false;
let initAttempts = 0;
const MAX_INIT_ATTEMPTS = 5;

// Variables de estado
let extensionContextValid = true;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let dominioActual = '';
let waitingForCredentials = false;
let lastCredentialsCheck = 0;
let silentMode = false;
let lastReconnectMessage = 0;

// Variables de configuración
let DEBUG_MODE = true; // Activar para diagnóstico

// Notificar a la extensión que el content script está listo
function notifyReady() {
  if (readyMessageSent || initAttempts >= MAX_INIT_ATTEMPTS) return;
  
  initAttempts++;
  
  if (!extensionContextValid) {
    console.warn('Intentando notificar con contexto inválido');
    if (checkExtensionConnection()) {
      console.log('Contexto restaurado, enviando mensaje ready');
    } else {
      setTimeout(notifyReady, 500 * initAttempts);
      return;
    }
  }
  
  console.log('Enviando mensaje ready...');
  
  sendMessageSafely({ 
    action: "content_script_ready", 
    url: window.location.href,
    timestamp: Date.now()
  })
  .then(() => {
    readyMessageSent = true;
    console.log('Mensaje ready enviado correctamente');
    // Solicitar credenciales después de notificar ready
    setTimeout(requestCredentials, 1000);
  })
  .catch(e => {
    console.error('Error al enviar mensaje ready:', e);
    if (initAttempts < MAX_INIT_ATTEMPTS) {
      setTimeout(notifyReady, 500 * initAttempts);
    }
  });
}

// Intentar notificar inmediatamente
notifyReady();
// Y también después de un breve retraso para asegurar que todo está inicializado
setTimeout(notifyReady, 500);
// Intentar una vez más después de que la página esté completamente cargada
window.addEventListener('load', () => {
  setTimeout(notifyReady, 1000);
});

// Estado global para desplegable
let desplegableVisible = false;
let credencialesDisponibles = [];
let estilosAñadidos = false;

// Función para añadir los estilos de forma segura
function addStyleSafely() {
  if (estilosAñadidos) return;
  
  const maxIntentos = 10;
  const intentarAñadirEstilos = (intento = 0) => {
    try {
      // Si ya se añadieron los estilos en otro intento, salir
      if (estilosAñadidos) return;

      // Verificar si document está listo
      if (!document || !document.documentElement) {
        if (intento < maxIntentos) {
          console.log(`Documento no disponible, reintentando (intento ${intento + 1}/${maxIntentos})...`);
          setTimeout(() => intentarAñadirEstilos(intento + 1), 500);
        }
        return;
      }

      // Crear el elemento style
      const style = document.createElement('style');
      style.textContent = `
        /* Animaciones base */
        @keyframes passwd-fade-in {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes passwd-fade-out {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(-10px); }
        }
        
        @keyframes passwd-pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.08); }
          100% { transform: scale(1); }
        }
        
        @keyframes passwd-shine {
          0% { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
        
        @keyframes passwd-rotate {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        /* Estilos del menú desplegable */
        .passwd-dropdown {
          position: absolute;
          width: 350px;
          max-height: 400px;
          overflow-y: auto;
          background-color: rgba(20, 20, 20, 0.95);
          border: none;
          border-radius: 12px;
          box-shadow: 0 5px 30px rgba(0,0,0,0.5), 0 0 0 1px rgba(128, 0, 255, 0.2);
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', sans-serif;
          color: #fff;
          animation: passwd-fade-in 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
          padding-bottom: 8px;
          backdrop-filter: blur(20px);
        }
        
        /* Estilos específicos para el dropdown de credenciales */
        .passwd-credentials-dropdown {
          position: absolute;
          top: 100px;
          left: 100px;
          min-width: 280px;
          max-width: 350px;
          background-color: rgba(20, 20, 20, 0.95);
          color: #fff;
          border-radius: 12px;
          box-shadow: 0 5px 20px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(128, 0, 255, 0.2);
          z-index: 99999999;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', sans-serif;
          padding: 0;
          border: none;
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
          overflow: hidden;
        }
        
        .passwd-credentials-dropdown.passwd-dropdown-visible {
          display: block;
          opacity: 1;
          transform: translateY(0);
        }
        
        .passwd-dropdown-title {
          font-weight: 600;
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          margin-bottom: 0;
          font-size: 15px;
          color: #fff;
          background-color: rgba(128, 0, 255, 0.2);
          letter-spacing: -0.2px;
        }
        
        .passwd-credentials-container {
          padding: 8px;
        }
        
        .passwd-credential-item {
          padding: 10px 12px;
          margin-bottom: 8px;
          border-radius: 8px;
          background-color: rgba(40, 40, 40, 0.8);
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: all 0.2s ease;
          border: 1px solid rgba(128, 0, 255, 0.1);
        }
        
        .passwd-credential-item:hover {
          background-color: rgba(50, 50, 50, 1);
          transform: translateY(-1px);
          box-shadow: 0 2px 5px rgba(128, 0, 255, 0.2);
          border-color: rgba(128, 0, 255, 0.3);
        }
        
        .passwd-credential-user {
          flex-grow: 1;
          padding-right: 10px;
          font-size: 14px;
          color: #fff;
          font-weight: 500;
        }
        
        .passwd-credential-actions {
          display: flex;
        }
        
        .passwd-fill-button {
          background: linear-gradient(135deg, #6a11cb, #8a3bd8);
          color: white;
          border: none;
          border-radius: 6px;
          padding: 6px 12px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: -0.01em;
          transition: all 0.2s ease;
        }
        
        .passwd-fill-button:hover {
          background: linear-gradient(135deg, #7b21dc, #9b4ce9);
          transform: scale(1.03);
          box-shadow: 0 2px 8px rgba(128, 0, 255, 0.3);
        }
        
        .passwd-fill-button:active {
          background: linear-gradient(135deg, #5a01bb, #7a2bc8);
          transform: scale(0.98);
        }
        
        .passwd-credential-error {
          color: #ff75c3;
          padding: 12px;
          text-align: center;
          font-style: normal;
          font-size: 13px;
          font-weight: 400;
          background-color: rgba(255, 59, 148, 0.1);
          border-radius: 8px;
          margin: 8px;
        }
        
        .passwd-dropdown.closing {
          animation: passwd-fade-out 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }
      
        .passwd-dropdown::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        
        .passwd-dropdown::-webkit-scrollbar-track {
          background: rgba(30, 30, 30, 0.8);
          border-radius: 8px;
        }
        
        .passwd-dropdown::-webkit-scrollbar-thumb {
          background-color: rgba(128, 0, 255, 0.5);
          border-radius: 8px;
          transition: all 0.3s ease;
        }
        
        .passwd-dropdown::-webkit-scrollbar-thumb:hover {
          background-color: rgba(128, 0, 255, 0.7);
        }
        
        /* Encabezado del menú */
        .passwd-dropdown-header {
          display: flex;
          align-items: center;
          padding: 16px;
          background: linear-gradient(135deg, #2b1331, #5a1b96);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px 12px 0 0;
          margin-bottom: 0;
        }
        
        .passwd-dropdown-header svg {
          margin-right: 10px;
          border-radius: 50%;
          background-color: rgba(255, 255, 255, 0.2);
          padding: 3px;
          min-width: 18px;
          transition: transform 0.3s ease;
          color: rgba(255, 255, 255, 0.9);
        }
        
        .passwd-dropdown-header span {
          font-weight: 600;
          color: #fff;
          font-size: 14px;
          letter-spacing: -0.2px;
        }
        
        /* Icono del botón flotante */
        .passwd-logo-hint {
          position: absolute;
          width: 28px;
          height: 28px;
          background: linear-gradient(135deg, #4285F4, #34A853);
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          z-index: 9999;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
          border: 2px solid rgba(255, 255, 255, 0.8);
          transition: all 0.2s ease;
          user-select: none;
        }
        
        .passwd-logo-hint:hover {
          transform: scale(1.1);
          box-shadow: 0 3px 10px rgba(0, 0, 0, 0.6);
        }
        
        .passwd-logo-hint.active {
          background: linear-gradient(135deg, #EA4335, #FBBC05);
          animation: passwd-pulse 0.5s infinite;
        }
      `;

        document.head.appendChild(style);
        estilosAñadidos = true;
      console.log('Estilos de PASSWD añadidos correctamente');
    } catch (e) {
      console.error('Error al añadir estilos:', e);
      if (intento < maxIntentos) {
        setTimeout(() => intentarAñadirEstilos(intento + 1), 500);
      }
    }
  };

  intentarAñadirEstilos();
}

// Añadir estilos de forma segura
addStyleSafely();

// Función para rellenar formularios con credenciales
function rellenarFormulario(datos) {
  try {
    // Verificar que tenemos datos válidos
    if (!datos) {
      logMessage('Datos inválidos para rellenar formulario', 'error');
      return false;
    }
    
    // Debug: Mostrar los datos recibidos
    logMessage('Datos recibidos para rellenar: ' + JSON.stringify(datos), 'info', true);
    
    // Obtener los campos de usuario y contraseña que están visibles
    const camposUsuario = document.querySelectorAll("input[type='email'], input[type='text'][name*='user'], input[id*='user'], input[name='username'], input[id='username'], input[name='login'], input[id='login'], input#identifierId");
    const camposPassword = document.querySelectorAll("input[type='password']");
    
    logMessage(`Campos detectados: ${camposUsuario.length} usuario(s), ${camposPassword.length} contraseña(s)`, 'info', true);
    
    let rellenadoUsuario = false;
    let rellenadoPassword = false;
    
    // Obtener el valor de la contraseña, considerando diferentes propiedades posibles
    const usuario = datos.usuario || '';
    const contraseña = datos.contraseña || datos.password || datos.pass || '';
    
    logMessage(`Valor de usuario: ${usuario}, Valor de contraseña disponible: ${contraseña ? 'Sí' : 'No'}`, 'info', true);
    
    // Rellenar campos de usuario
    if (usuario && camposUsuario.length > 0) {
      camposUsuario.forEach(campo => {
        try {
          if (campo.value !== usuario) {
            // Establecer valor y disparar eventos para simular interacción del usuario
            campo.value = usuario;
            campo.dispatchEvent(new Event('input', { bubbles: true }));
            campo.dispatchEvent(new Event('change', { bubbles: true }));
            logMessage(`Campo de usuario rellenado: ${campo.id || campo.name || 'sin id/nombre'}`, 'info');
            rellenadoUsuario = true;
          }
        } catch (e) {
          logMessage(`Error al rellenar campo de usuario: ${e}`, 'error');
        }
      });
    }
    
    // Rellenar campos de contraseña
    if (contraseña && camposPassword.length > 0) {
      camposPassword.forEach(campo => {
        try {
          if (campo.value !== contraseña) {
            // Establecer valor y disparar eventos para simular interacción del usuario
            campo.value = contraseña;
            campo.dispatchEvent(new Event('input', { bubbles: true }));
            campo.dispatchEvent(new Event('change', { bubbles: true }));
            logMessage(`Campo de contraseña rellenado: ${campo.id || campo.name || 'sin id/nombre'}`, 'info');
            rellenadoPassword = true;
          }
        } catch (e) {
          logMessage(`Error al rellenar campo de contraseña: ${e}`, 'error');
        }
      });
    }
    
    return rellenadoUsuario || rellenadoPassword;
  } catch (e) {
    logMessage(`Error al rellenar formulario: ${e}`, 'error');
    return false;
  }
}

// Función para mostrar el desplegable de credenciales
function mostrarDesplegableCredenciales(targetElement, credenciales = null, mensajeError = null) {
  try {
    // Si se proporcionan credenciales, actualizar la variable global
    if (credenciales) {
      credencialesDisponibles = credenciales;
    }

    // Asegurar que los estilos estén añadidos
    if (!estilosAñadidos) {
      addStyleSafely();
    }

    // Eliminar cualquier desplegable existente
    const existingDropdown = document.getElementById('passwd-credentials-dropdown');
    if (existingDropdown) {
      existingDropdown.remove();
    }

    // Crear el nuevo desplegable
    const dropdown = document.createElement('div');
    dropdown.id = 'passwd-credentials-dropdown';
    dropdown.className = 'passwd-credentials-dropdown';

    // Añadir encabezado con icono
    const header = document.createElement('div');
    header.className = 'passwd-dropdown-header';
    
    // Icono de llave (SVG)
    const iconSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#bb86fc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 3px rgba(187, 134, 252, 0.5));">
        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
      </svg>
    `;
    
    // Título con icono
    header.innerHTML = `${iconSvg}<span>Contraseñas guardadas</span>`;
    dropdown.appendChild(header);

    // Contenedor para las credenciales
    const credentialsContainer = document.createElement('div');
    credentialsContainer.className = 'passwd-credentials-container';

    // Si hay un mensaje de error o no hay credenciales disponibles, mostrar mensaje
    if (mensajeError || !credencialesDisponibles || credencialesDisponibles.length === 0) {
      const mensaje = mensajeError || 'No hay credenciales disponibles para mostrar';
      logMessage(mensaje, 'warn', true);
      
      // Añadir mensaje al desplegable
      const errorMsg = document.createElement('div');
      errorMsg.className = 'passwd-credential-error';
      errorMsg.textContent = mensaje;
      credentialsContainer.appendChild(errorMsg);
    } else {
      logMessage(`Mostrando desplegable con ${credencialesDisponibles.length} credenciales`, 'info', true);
      
      // Realizar un log detallado de las credenciales disponibles para diagnóstico
      credencialesDisponibles.forEach((cred, index) => {
        // Log más detallado para diagnóstico
        const tienePassword = !!(cred.contraseña || cred.password || cred.pass);
        logMessage(`Credencial #${index}: usuario=${cred.usuario}, tiene contraseña=${tienePassword}`, 'info', true);
      });

      // Añadir cada credencial
      credencialesDisponibles.forEach(credencial => {
        const credItem = document.createElement('div');
        credItem.className = 'passwd-credential-item';
        
        // Asegurar que existe un valor para mostrar como usuario
        const usuarioDisplay = credencial.usuario || credencial.email || credencial.correo || 'Usuario sin nombre';
        
        // Comprobar explícitamente todas las posibles fuentes de contraseña
        const contraseña = credencial.contraseña || credencial.password || credencial.pass || '';
        
        // Log de diagnóstico para cada item que se añade al desplegable
        logMessage(`Añadiendo credencial al desplegable: ${usuarioDisplay} con contraseña=${contraseña ? 'presente' : 'ausente'}`, 'info', true);

        // Crear elemento para el usuario
        const userDiv = document.createElement('div');
        userDiv.className = 'passwd-credential-user';
        userDiv.textContent = usuarioDisplay;
        credItem.appendChild(userDiv);

        // Crear contenedor para acciones
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'passwd-credential-actions';

        // Botón para rellenar
        const fillButton = document.createElement('button');
        fillButton.className = 'passwd-fill-button';
        fillButton.textContent = 'Rellenar';
        
        // Añadir evento click para rellenar el formulario
        fillButton.addEventListener('click', () => {
          logMessage(`Rellenando formulario con credencial: ${usuarioDisplay}`, 'info', true);
          rellenarFormulario({
            usuario: credencial.usuario || credencial.email || credencial.correo,
            contraseña: contraseña
          });
          dropdown.remove();
          desplegableVisible = false;
        });

        actionsDiv.appendChild(fillButton);
        credItem.appendChild(actionsDiv);
        credentialsContainer.appendChild(credItem);
      });
    }

    dropdown.appendChild(credentialsContainer);

    // Posicionar el desplegable
    if (targetElement && targetElement.getBoundingClientRect) {
      const rect = targetElement.getBoundingClientRect();
      dropdown.style.top = `${window.scrollY + rect.bottom + 5}px`;
      dropdown.style.left = `${window.scrollX + rect.left}px`;
    } else {
      // Posición predeterminada si no hay targetElement
      dropdown.style.top = `${window.scrollY + 100}px`;
      dropdown.style.left = `${window.scrollX + 100}px`;
    }

    // Añadir al DOM con efecto de aparición
    document.body.appendChild(dropdown);
    desplegableVisible = true;
    
    // Aplicar animación de entrada
    dropdown.style.opacity = '0';
    dropdown.style.transform = 'translateY(-10px)';
    
    // Forzar reflow
    dropdown.offsetHeight;
    
    // Animar entrada
    dropdown.style.transition = 'opacity 0.3s, transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
    dropdown.style.opacity = '1';
    dropdown.style.transform = 'translateY(0)';
    
    console.log("Desplegable añadido al DOM y establecido como visible:", dropdown);

    // Cerrar al hacer clic fuera
    document.addEventListener('click', function closeDropdown(e) {
      if (!dropdown.contains(e.target) && e.target !== targetElement) {
        // Animación de salida
        dropdown.style.opacity = '0';
        dropdown.style.transform = 'translateY(-10px)';
        dropdown.style.transition = 'opacity 0.3s, transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
        
        setTimeout(() => {
          if (document.body.contains(dropdown)) {
            dropdown.remove();
            desplegableVisible = false;
          }
        }, 300);
        
        document.removeEventListener('click', closeDropdown);
      }
    });
  } catch (error) {
    console.error("Error al mostrar desplegable:", error);
    // Intento de solución de emergencia
    try {
      const emergencyDiv = document.createElement('div');
      emergencyDiv.style.position = 'fixed';
      emergencyDiv.style.top = '10px';
      emergencyDiv.style.left = '10px';
      emergencyDiv.style.backgroundColor = 'red';
      emergencyDiv.style.color = 'white';
      emergencyDiv.style.padding = '10px';
      emergencyDiv.style.zIndex = '9999999999';
      emergencyDiv.textContent = `Error al mostrar credenciales: ${error.message}`;
      document.body.appendChild(emergencyDiv);
      setTimeout(() => emergencyDiv.remove(), 5000);
    } catch (e) {
      // Si todo falla, al menos mostrar por consola
      console.error("Error crítico al mostrar credenciales:", e);
    }
  }
}

// Función para añadir iconos a los campos de login
function añadirIconosACamposLogin() {
  if (!extensionContextValid) {
    console.warn('Intentando añadir iconos con contexto inválido');
    return;
  }
  
  // Verificar que document.body existe
  if (!document.body) {
    console.log('document.body no disponible, reintentando en 500ms...');
    setTimeout(añadirIconosACamposLogin, 500);
    return;
  }

  try {
    // Solo remover iconos que ya no están asociados a campos válidos
    const iconosExistentes = document.querySelectorAll('.passwd-logo-hint');
    iconosExistentes.forEach(icono => {
      try {
        const campoAsociado = icono.getAttribute('data-campo-id');
        if (campoAsociado) {
          const campo = document.querySelector(`[data-passwd-field-id="${campoAsociado}"]`);
          if (!campo || !document.body.contains(campo)) {
            icono.remove();
          }
        }
      } catch (e) {
        console.warn('Error al verificar icono existente:', e);
      }
    });
    
    const camposUsuario = document.querySelectorAll("input[type='email'], input[type='text'][name*='user'], input[id*='user'], input[name='username'], input[id='username'], input[name='login'], input[id='login'], input#identifierId");
    const camposPassword = document.querySelectorAll("input[type='password']");
    
    const todosCampos = [...camposUsuario, ...camposPassword];
    console.log(`Campos detectados: ${todosCampos.length} (${camposUsuario.length} usuario, ${camposPassword.length} contraseña)`);
    
    if (todosCampos.length === 0) {
      console.log('No se encontraron campos de login en esta página');
      return;
    }
    
    todosCampos.forEach((campo, index) => {
      try {
        // Generar un ID único para el campo si no lo tiene
        if (!campo.getAttribute('data-passwd-field-id')) {
          const uniqueId = `passwd-field-${Date.now()}-${index}`;
          campo.setAttribute('data-passwd-field-id', uniqueId);
        }
        
        // Verificar si ya existe un icono para este campo
        const fieldId = campo.getAttribute('data-passwd-field-id');
        const iconoExistente = document.querySelector(`.passwd-logo-hint[data-campo-id="${fieldId}"]`);
        
        if (iconoExistente) {
          // Actualizar posición del icono existente
          const rect = campo.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const newTop = rect.top + window.scrollY + (rect.height / 2) - 14;
            const newLeft = rect.right + window.scrollX - 35;
            iconoExistente.style.top = newTop + 'px';
            iconoExistente.style.left = newLeft + 'px';
          }
          return; // No crear un nuevo icono
        }
        
        // Solo crear nuevo icono si el campo es visible
        const rect = campo.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          return;
        }
        
        // Crear icono mejorado con sombra y gradientes
        const icono = document.createElement('div');
        icono.className = 'passwd-logo-hint';
        icono.textContent = 'P';
        icono.title = 'PASSWD - Haz clic para ver credenciales guardadas';
        icono.setAttribute('data-campo-id', fieldId);
        
        // Calcular posición inicial (centrado verticalmente)
        const top = rect.top + window.scrollY + (rect.height / 2) - 14;
        const left = rect.right + window.scrollX - 35;
        icono.style.top = top + 'px';
        icono.style.left = left + 'px';
        
        // Función para actualizar posición
        const updatePosition = () => {
          if (!document.body.contains(campo)) {
            icono.remove();
            return;
          }
          
          const newRect = campo.getBoundingClientRect();
          if (newRect.width <= 0 || newRect.height <= 0) {
            icono.style.display = 'none';
            return;
          }
          
          icono.style.display = 'flex';
          const newTop = newRect.top + window.scrollY + (newRect.height / 2) - 14;
          const newLeft = newRect.right + window.scrollX - 35;
          icono.style.top = newTop + 'px';
          icono.style.left = newLeft + 'px';
        };
        
        // Configurar evento de clic
        icono.addEventListener('click', function() {
          // Definir targetElement como el icono en el que se ha hecho clic
          const targetElement = icono;
          
          try {
            // Si el desplegable ya está visible y tiene la clase activa, cerrarlo
            if (desplegableVisible && icono.classList.contains('active')) {
              console.log('Cerrando desplegable existente');
              const dropdown = document.getElementById('passwd-credentials-dropdown');
              if (dropdown) {
                dropdown.style.opacity = '0';
                dropdown.style.transform = 'translateY(-10px)';
                dropdown.style.transition = 'opacity 0.3s, transform 0.3s';
                setTimeout(() => {
                  if (document.body.contains(dropdown)) {
                    dropdown.remove();
              desplegableVisible = false;
                  }
                }, 200);
              }
              // Quitar clase activa
              icono.classList.remove('active');
              return;
            }
            
            // Añadir clase activa
            icono.classList.add('active');
            
            // Ver si tenemos credenciales disponibles
            if (credencialesDisponibles && credencialesDisponibles.length > 0) {
              console.log(`Mostrando ${credencialesDisponibles.length} credenciales disponibles`);
              mostrarDesplegableCredenciales(targetElement, credencialesDisponibles);
            } else {
              console.log('Solicitando credenciales al background script...');
              // Mostrar un desplegable con mensaje de carga
              mostrarDesplegableCredenciales(targetElement, null, 'Buscando credenciales...');
              
              // Solicitar credenciales para este sitio
              sendMessageSafely({
                action: 'get_credentials_for_site',
                url: window.location.href
              })
              .then(response => {
                console.log('Respuesta de get_credentials_for_site:', response);
                if (response && response.credenciales && response.credenciales.length > 0) {
                  credencialesDisponibles = response.credenciales;
                  mostrarDesplegableCredenciales(targetElement, credencialesDisponibles);
                } else {
                  console.log('No se recibieron credenciales válidas');
                  // Mostrar mensaje de error en el desplegable
                  mostrarDesplegableCredenciales(targetElement, null, 'No se encontraron credenciales para este sitio');
                }
              })
              .catch(error => {
                console.error('Error al solicitar credenciales:', error);
                // Mostrar error en el desplegable
                mostrarDesplegableCredenciales(targetElement, null, 'Error al obtener credenciales: ' + (error.message || 'Desconocido'));
              });
            }
          } catch (e) {
            console.error('Error al manejar clic en icono:', e);
            mostrarDesplegableCredenciales(targetElement, null, 'Error al procesar la acción: ' + (e.message || 'Desconocido'));
          }
        });
        
        // Añadir el icono al DOM
        document.body.appendChild(icono);
        console.log(`Icono añadido para campo ${fieldId}`);
        
        // Configurar observadores de posición
        const observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              updatePosition();
              icono.style.display = 'flex';
            } else {
              icono.style.display = 'none';
            }
          });
        }, { threshold: 0.1 });
        
        observer.observe(campo);
        
        // Eventos para actualizar posición
        window.addEventListener('scroll', updatePosition, { passive: true });
        window.addEventListener('resize', updatePosition, { passive: true });
        window.addEventListener('orientationchange', updatePosition, { passive: true });
        
        // Eventos del campo
        campo.addEventListener('focus', () => {
          if (!credencialesDisponibles || credencialesDisponibles.length === 0) {
            sendMessageSafely({
              action: 'get_credentials_for_site',
              url: window.location.href
            })
            .then(response => {
              if (response && response.credenciales) {
                credencialesDisponibles = response.credenciales;
                if (credencialesDisponibles.length > 0) {
                  icono.style.backgroundColor = '#4285F4';
                  icono.style.borderColor = '#4285F4';
                }
              }
            })
            .catch(error => {
              console.warn('Error al obtener credenciales en focus:', error);
            });
          } else if (credencialesDisponibles.length > 0) {
            icono.style.backgroundColor = '#4285F4';
            icono.style.borderColor = '#4285F4';
          }
        });
      } catch (e) {
        console.error(`Error al procesar campo #${index}:`, e);
      }
    });
  } catch (e) {
    console.error('Error general al añadir iconos:', e);
  }
}

// Reducir la frecuencia de actualización
const iconUpdateInterval = setInterval(añadirIconosACamposLogin, 5000);

// Ejecutar la primera vez después de que la página esté lista
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(añadirIconosACamposLogin, 500);
  });
} else {
  setTimeout(añadirIconosACamposLogin, 500);
}

// También ejecutar cuando el DOM cambie
const observer = new MutationObserver((mutations) => {
  let needsUpdate = false;
  
  mutations.forEach(mutation => {
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      for (let node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === 'INPUT' || node.querySelector('input')) {
            needsUpdate = true;
            break;
          }
        }
      }
    }
  });
  
  if (needsUpdate) {
    añadirIconosACamposLogin();
  }
});

try {
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    // Si document.body aún no está disponible, esperar y reintentar
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }
} catch (e) {
  console.error('Error al inicializar el observer:', e);
}

// Escuchar mensajes del script de fondo (background.js)
window.addEventListener('message', (event) => {
  // Solo aceptar mensajes de nuestra extensión
  if (event.source !== window) return;
  
  console.log('Mensaje recibido en window.postMessage:', event.data);
  
  const mensaje = event.data;
  if (mensaje && mensaje.accion === 'rellenar') {
    const resultado = rellenarFormulario(mensaje.datos);
    console.log('Resultado de rellenar formulario:', resultado);
    
    // Enviar resultado al background script
    try {
      sendMessageSafely({
        action: 'form_filled',
        success: resultado
      });
    } catch (error) {
      console.error('Error al enviar mensaje de resultado:', error);
    }
  }
});

// Función para extraer el dominio base
function getBaseDomain(dominio) {
  try {
    if (!dominio) return '';
    
    // Convertir a minúsculas para normalización
    let domain = dominio.toLowerCase();
    
    // Definir grupos de servicios relacionados
    const serviciosRelacionados = {
      'google': ['google', 'gmail', 'youtube', 'drive.google', 'docs.google', 'photos.google', 'meet.google', 'play.google', 'maps.google', 'calendar.google'],
      'microsoft': ['microsoft', 'outlook', 'live', 'hotmail', 'office365', 'onedrive', 'sharepoint', 'office.com', 'msn', 'skype', 'bing', 'xbox'],
      'apple': ['apple', 'icloud', 'me.com', 'itunes', 'appleid'],
      'amazon': ['amazon', 'aws.amazon', 'kindle', 'audible', 'prime'],
      'meta': ['facebook', 'instagram', 'whatsapp', 'messenger', 'oculus', 'meta'],
      'adobe': ['adobe', 'creativesuite', 'photoshop.com', 'acrobat.com'],
      'yahoo': ['yahoo', 'flickr', 'tumblr']
    };
    
    // Verificar si el dominio pertenece a algún grupo de servicios
    for (const [grupo, servicios] of Object.entries(serviciosRelacionados)) {
      if (servicios.some(servicio => domain.includes(servicio))) {
        console.log(`Grupo de servicios detectado: ${dominio} -> ${grupo}`);
        return grupo;
      }
    }
    
    // Continuar con el algoritmo normal si no es un servicio conocido
    
    // Eliminar protocolo
    domain = domain.replace(/^(https?:\/\/)?(www\.)?/i, '');
    
    // Eliminar ruta y parámetros
    domain = domain.split('/')[0];
    
    // Dividir por puntos
    const parts = domain.split('.');
    
    // Dominios de segundo nivel específicos
    const secondLevelDomains = ['co.uk', 'com.br', 'com.mx', 'com.ar', 'com.co', 'co.jp', 'co.in', 'co.nz', 'com.au', 'org.uk'];
    
    if (parts.length > 2) {
      const lastTwoParts = parts.slice(-2).join('.');
      if (secondLevelDomains.includes(lastTwoParts)) {
        // Es un dominio de segundo nivel específico
        return parts.slice(-3).join('.');
      }
      
      // Casos normales: tomar los últimos dos segmentos
      return parts.slice(-2).join('.');
    }
    
    return domain;
  } catch (e) {
    console.error('Error al extraer dominio base:', e);
    return dominio || '';
  }
}

// Función para filtrar credenciales por dominio
function filtrarCredencialesPorDominio(credenciales, dominio) {
  try {
    if (!credenciales || !dominio) return [];
    
    const baseDomain = getBaseDomain(dominio);
    console.log(`Filtrando credenciales para dominio: ${dominio} (base: ${baseDomain})`);
    
    // Grupos de servicios identificados por su dominio base normalizado
    const gruposServicios = ['google', 'microsoft', 'apple', 'amazon', 'meta', 'adobe', 'yahoo'];
    
    // Verificar si estamos tratando con un grupo de servicios
    const esGrupoServicios = gruposServicios.includes(baseDomain);
    
    return credenciales.filter(cred => {
      if (!cred.sitio) return false;
      
      const credDomain = getBaseDomain(cred.sitio);
      
      // Si estamos en un grupo de servicios, comparar por grupo
      if (esGrupoServicios) {
        const match = credDomain === baseDomain;
        if (match) {
          console.log(`Credencial coincidente por grupo de servicios: ${cred.usuario} para ${cred.sitio} (${credDomain})`);
        }
        return match;
      }
      
      // Coincidencia normal por dominio base
      const match = credDomain === baseDomain;
      
    });
  } catch (e) {
    console.error('Error al filtrar credenciales:', e);
    return [];
  }
}

// Añadir mecanismo de debug para ver qué credenciales están disponibles
function logCredencialesDisponibles() {
  console.log('==== CREDENCIALES DISPONIBLES ====');
  if (!credencialesDisponibles || credencialesDisponibles.length === 0) {
    console.log('No hay credenciales disponibles');
  } else {
    console.log(`${credencialesDisponibles.length} credenciales disponibles:`);
    credencialesDisponibles.forEach((cred, index) => {
      console.log(`${index + 1}. ${cred.usuario} para ${cred.sitio}`);
    });
  }
  console.log('===============================');
}

// Escuchar mensajes del popup o background script con mejor manejo de errores
chrome.runtime.onMessage.addListener((mensaje, sender, sendResponse) => {
  try {
    if (!extensionContextValid) {
      logMessage('Mensaje recibido con contexto inválido', 'warn');
      extensionContextValid = true; // Si recibimos un mensaje, el contexto debería ser válido
      logMessage('Contexto restaurado tras recibir mensaje');
    }
    
    logMessage('Mensaje recibido:', JSON.stringify({
      action: mensaje.accion,
      timestamp: Date.now(),
      url: window.location.href
    }));
    
    // Mensaje para verificar si el content script está activo
    if (mensaje.accion === 'check_ready') {
      sendResponse({ ready: true });
      return true;
    }
    
    // Mensaje para obtener las credenciales disponibles
    if (mensaje.accion === 'get_available_credentials') {
      try {
        // Log detallado de las credenciales disponibles
        logCredencialesDisponibles();
        
        sendResponse({ 
          credenciales: credencialesDisponibles || [],
          dominio: dominioActual || window.location.hostname,
          timestamp: Date.now()
        });
      } catch (e) {
        logMessage(`Error al enviar credenciales disponibles: ${e}`, 'error');
        sendResponse({ error: e.message, credenciales: [] });
      }
      return true;
    }
    
    // Mensaje para rellenar formulario
    if (mensaje.accion === 'rellenar') {
      try {
        const resultado = rellenarFormulario(mensaje.datos);
        logMessage('Formulario rellenado, resultado: ' + resultado, 'info', true);
        
        // Asegurarse de enviar respuesta inmediatamente
        sendResponse({ success: resultado });
        
        // Y también enviar mensaje al background script como respaldo
        setTimeout(() => {
          try {
            sendMessageSafely({
              action: 'form_filled',
              success: resultado
            }).catch(e => logMessage(`Error al enviar form_filled al background: ${e}`, 'error'));
          } catch (e) {
            logMessage(`Error al enviar mensaje de respaldo: ${e}`, 'error');
          }
        }, 100);
        
        return true;
      } catch (e) {
        logMessage(`Error al rellenar formulario: ${e}`, 'error', true);
        sendResponse({ success: false, error: e.message });
        return true;
      }
    }
    
    // Recibir credenciales
    if (mensaje.accion === 'set_credentials') {
      try {
        // Actualizar timestamp de última verificación
        lastCredentialsCheck = Date.now();
        waitingForCredentials = false;
        
        // Guardar las credenciales
        if (mensaje.credenciales && mensaje.credenciales.length > 0) {
          logMessage(`Recibidas ${mensaje.credenciales.length} credenciales válidas`);
          credencialesDisponibles = mensaje.credenciales;
          // Log para debug
          logCredencialesDisponibles();
          // Actualizar los iconos ya que tenemos credenciales
          añadirIconosACamposLogin();
        } else {
          logMessage('No se recibieron credenciales válidas');
          credencialesDisponibles = [];
        }
        
        sendResponse({ 
          status: 'ok', 
          count: mensaje.credenciales ? mensaje.credenciales.length : 0,
          dominio: dominioActual
        });
      } catch (e) {
        logMessage(`Error al procesar credenciales: ${e}`, 'error');
        sendResponse({ error: e.message });
      }
      return true;
    }
  } catch (e) {
    logMessage(`Error al procesar mensaje: ${e}`, 'error');
    try {
      sendResponse({ error: e.message || String(e) });
    } catch (respError) {
      logMessage(`No se pudo enviar respuesta de error: ${respError}`, 'error');
    }
  }
  
  return true; // Indica que sendResponse se llamará de forma asíncrona
});

// Función para registrar mensajes de forma unificada
function logMessage(message, type = 'info', force = false) {
  try {
    if (silentMode && !force && !DEBUG_MODE) {
      return;
    }
    
    const timestamp = new Date().toLocaleTimeString();
    const formattedMessage = `🔒 PASSWD: [${timestamp}] ${message}`;
    
    if (DEBUG_MODE) {
      console.log('DEBUG:', formattedMessage);
    }
    
    // Si estamos en modo debug o forzamos el mensaje, mostrarlo
    if (window.passwdDebugMode || force) {
      const prefix = '🔒 PASSWD: ';
      
      // Agregar un prefijo distintivo para facilitar el filtrado en la consola
      const formattedMessage = `${prefix}[${timestamp}] ${message}`;
      
      // Elegir el método según el tipo
      switch (type.toLowerCase()) {
    case 'error':
          console.error(formattedMessage);
      break;
    case 'warn':
          console.warn(formattedMessage);
      break;
        case 'success':
          console.log('%c' + formattedMessage, 'color: green; font-weight: bold;');
      break;
        case 'info':
    default:
          console.log('%c' + formattedMessage, 'color: #4285F4;');
          break;
      }
      
      // Enviar el log también al background script para consolidar registros
      try {
        chrome.runtime.sendMessage({
          action: 'log_message',
          data: {
            message: message,
            type: type,
            timestamp: new Date().toISOString(),
            url: window.location.href
          }
        }).catch(() => {}); // Ignorar errores en este envío
      } catch (e) {
        // Ignorar errores de comunicación al enviar logs
      }
    }
  } catch (e) {
    // Si hay error en el log, intentar un último mensaje directo
    try {
      console.error('PASSWD Error en sistema de logs:', e);
    } catch (finalError) {
      // No podemos hacer nada más aquí
    }
  }
}

// Mejorar la función para verificar la conexión
function checkExtensionConnection() {
  try {
    if (chrome.runtime && chrome.runtime.id) {
      const port = chrome.runtime.connect();
      if (port) {
        port.disconnect();
        extensionContextValid = true;
        reconnectAttempts = 0;
        silentMode = true; // Activar modo silencioso cuando todo funciona
        logMessage('Conexión con la extensión verificada correctamente');
        return true;
      }
    } else {
      // Mensaje menos frecuente para evitar spam en la consola
      logMessage('chrome.runtime no disponible o sin ID', 'warn');
      extensionContextValid = false;
      return false;
    }
  } catch (e) {
    extensionContextValid = false;
    logMessage(`Error al verificar conexión: ${e.message}`, 'warn');
    return false;
  }
  return false;
}

// Función para reinicializar la extensión
function reinitializeExtension() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('Máximo número de intentos de reconexión alcanzado');
    return;
  }

  reconnectAttempts++;
  
  try {
    // Limpiar estado anterior
    const iconosExistentes = document.querySelectorAll('.passwd-logo-hint');
    iconosExistentes.forEach(icono => icono.remove());
    
    const desplegableExistente = document.querySelector('.passwd-dropdown');
    if (desplegableExistente) desplegableExistente.remove();
    
    // Reinicializar variables de estado
    desplegableVisible = false;
    credencialesDisponibles = [];
    estilosAñadidos = false;
    
    // Verificar conexión
    if (checkExtensionConnection()) {
      // Reinicializar componentes
      addStyleSafely();
      setTimeout(añadirIconosACamposLogin, 500);
      
      // Notificar que estamos listos
      notifyReady();
    } else {
      // Reintentar después de un delay
      setTimeout(reinitializeExtension, 1000 * Math.pow(2, reconnectAttempts));
    }
  } catch (e) {
    console.error('Error al reinicializar la extensión:', e);
    setTimeout(reinitializeExtension, 1000 * Math.pow(2, reconnectAttempts));
  }
}

// Función segura para enviar mensajes
function sendMessageSafely(message) {
  if (!chrome.runtime || !chrome.runtime.id) {
    console.warn('Runtime no disponible, intentando reconectar');
    extensionContextValid = false;
    setTimeout(reinitializeExtension, 1000);
    return Promise.reject(new Error('Runtime no disponible'));
  }
  
  if (!extensionContextValid) {
    console.warn('Intentando enviar mensaje con contexto inválido');
    setTimeout(reinitializeExtension, 1000);
    return Promise.reject(new Error('Extension context invalid'));
  }
  
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, response => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          const errorInfo = {
            message: lastError ? (lastError.message || 'Error desconocido') : 'Error nulo',
            action: message.action,
            timestamp: Date.now(),
            url: window.location.href
          };
          console.warn('Error detallado al enviar mensaje:', JSON.stringify(errorInfo, null, 2));
          
          // Si el error está relacionado con el contexto de la extensión
          if (lastError.message && (
              lastError.message.includes('Extension context invalidated') ||
              lastError.message.includes('Extension context was invalidated'))) {
            extensionContextValid = false;
            setTimeout(reinitializeExtension, 1000);
          }
          
          reject(new Error(`Error de comunicación: ${lastError.message || 'Error desconocido'}`));
        } else if (!response) {
          console.warn('No se recibió respuesta del background script');
          resolve(null);
        } else {
          resolve(response);
        }
      });
    } catch (e) {
      const errorInfo = {
        type: 'RuntimeError',
        message: e.message || String(e),
        stack: e.stack,
        action: message.action,
        timestamp: Date.now(),
        url: window.location.href
      };
      console.error('Error al enviar mensaje:', JSON.stringify(errorInfo, null, 2));
      
      if (e.message && e.message.includes('Extension context invalidated')) {
        extensionContextValid = false;
        setTimeout(reinitializeExtension, 1000);
      }
      reject(e);
    }
  });
}

// Detectar cuando el contexto se invalida usando eventos compatibles con políticas de seguridad
// No usamos 'unload' porque está bloqueado en muchos sitios como Google
window.addEventListener('pagehide', () => {
  console.log('Evento pagehide detectado, marcando contexto como inválido');
  extensionContextValid = false;
});

// También usamos visibilitychange como respaldo
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    console.log('Página oculta, preparando para posible descarga');
    // No marcamos como inválido inmediatamente ya que el usuario puede volver a la pestaña
    // Pero registramos el evento por si acaso
  }
});

// Función para reinicializar el contexto periódicamente
function setupContextCheckInterval() {
  // Verificar el contexto cada 30 segundos
  setInterval(() => {
    try {
      if (!extensionContextValid) {
        console.log('Intentando restablecer contexto...');
        if (checkExtensionConnection()) {
          notifyReady();
          console.log('Contexto restablecido, notificando disponibilidad');
        }
      } else if (!waitingForCredentials && (Date.now() - lastCredentialsCheck) > 60000) {
        // Si hace más de 1 minuto que no recibimos credenciales, solicitarlas
        lastCredentialsCheck = Date.now();
        requestCredentials();
      }
    } catch (e) {
      console.warn('Error al verificar contexto periódicamente:', e);
    }
  }, 30000);
}

// Función para solicitar credenciales de forma proactiva
function requestCredentials() {
  if (!extensionContextValid || waitingForCredentials) return;
  
  waitingForCredentials = true;
  logMessage('Solicitando credenciales para este sitio...', 'info', true);
  
  sendMessageSafely({
    action: 'get_credentials_for_site',
    url: window.location.href
  })
  .then(response => {
    waitingForCredentials = false;
    
    if (response && response.credenciales && response.credenciales.length > 0) {
      logMessage(`Recibidas ${response.credenciales.length} credenciales desde el background script`, 'info', true);
      
      // Asegurar que cada credencial tenga su contraseña correctamente establecida
      const credencialesCompletas = response.credenciales.map(cred => {
        // Log diagnóstico para cada credencial recibida
        logMessage(`Credencial recibida: usuario=${cred.usuario}, contraseña=${cred.contraseña ? 'presente' : 'ausente'}, password=${cred.password ? 'presente' : 'ausente'}`, 'info', true);
        
        // Asegurar que la contraseña esté disponible en el campo 'contraseña' (además de cualquier otro campo)
        if (!cred.contraseña && (cred.password || cred.pass)) {
          cred.contraseña = cred.password || cred.pass;
          logMessage('Añadida contraseña al campo "contraseña" desde campos alternativos', 'info', true);
        }
        
        return cred;
      });
      
      // Actualizar la lista global
      credencialesDisponibles = credencialesCompletas;
      
      // Log para debug
      logCredencialesDisponibles();
      
      // Actualizar iconos
      añadirIconosACamposLogin();
      
      return true;
    } else {
      if (response && response.error) {
        logMessage(`Error al solicitar credenciales: ${response.error}`, 'warn', true);
        
        // Si el error es de autenticación, podemos mostrar un mensaje sutil
        if (response.requiresAuth) {
          logMessage('Se requiere autenticación para ver credenciales guardadas', 'warn', true);
        }
      } else {
        logMessage('No se encontraron credenciales para este sitio', 'info', true);
      }
      
      // Limpiar las credenciales actuales
      credencialesDisponibles = [];
      return false;
    }
  })
  .catch(error => {
    waitingForCredentials = false;
    logMessage(`Error al solicitar credenciales: ${error}`, 'error', true);
    return false;
  });
}

// Función auxiliar para determinar si un input es probablemente un campo de usuario
function esInputUsuario(input) {
  try {
    const idName = (input.id || '').toLowerCase();
    const name = (input.name || '').toLowerCase();
    const placeholder = (input.placeholder || '').toLowerCase();
    const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();
    
    // Patrones comunes para campos de usuario
    const patronesUsuario = ['user', 'email', 'login', 'username', 'account', 'correo', 'mail'];
    
    for (const patron of patronesUsuario) {
      if (idName.includes(patron) || name.includes(patron) || 
          placeholder.includes(patron) || ariaLabel.includes(patron)) {
        return true;
      }
    }
    
    return false;
  } catch (e) {
    logMessage(`Error al verificar si es campo de usuario: ${e.message}`, 'error', true);
    return false;
  }
}

// Modificación del sistema para detectar envío de formularios
function detectarEnvioFormularios() {
  try {
    // Activar debug para este proceso crítico
    const DEBUG_MODE = true;
    logMessage('⚠️ ACTIVANDO DETECCIÓN AGRESIVA DE FORMULARIOS', 'info', DEBUG_MODE);
    
    // Variables para seguimiento de credenciales capturadas
    let credencialesCapturadas = null;
    let datosCompletos = false;
    let ultimoFormularioEnviado = null;
    let ultimoTiempoEnvio = 0;
    
    // Variables para seguimiento de campos
    let campoUsuarioActual = null;
    let campoPasswordActual = null;
    
    // Determinar si el dominio actual es parte de los que queremos auto-guardar
    const esDominioDeAutoguardado = () => {
      const dominiosAutoguardado = ['google.com', 'gmail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com', 'amazon.com'];
      const dominio = window.location.hostname;
      return dominiosAutoguardado.some(d => dominio.includes(d));
    };
    
    // Función para validar datos de credenciales
    const validarDatosCredenciales = (sitio, usuario, password) => {
      if (!sitio || !usuario || !password) {
        logMessage('Datos de credenciales incompletos para validar', 'warn', DEBUG_MODE);
        return false;
      }
      
      // Verificar que la contraseña no esté vacía
      if (password.trim() === '') {
        logMessage('Contraseña vacía, ignorando', 'warn', DEBUG_MODE);
        return false;
      }
      
      // Verificar longitud de usuario
      if (usuario.trim().length < 3) {
        logMessage('Usuario muy corto, podría no ser válido', 'warn', DEBUG_MODE);
        return false;
      }
      
      logMessage(`Credenciales validadas correctamente para ${sitio}`, 'info', DEBUG_MODE);
      return true;
    };
    
    // ESTRATEGIA 1: Detectar envíos de formularios con el evento submit
    logMessage('Configurando detección de envío de formularios (estrategia 1: evento submit)', 'info', DEBUG_MODE);
    
    // Capturar todos los formularios en la página
    const todosLosFormularios = document.querySelectorAll('form');
    logMessage(`Se detectaron ${todosLosFormularios.length} formularios en la página`, 'info', DEBUG_MODE);
    
    // Función para añadir listener a un formulario
    const añadirListenerFormulario = (formulario, index) => {
      try {
        // Solo procesar formularios que no tengan listener ya
        if (formulario.dataset.passwdProcessed === 'true') {
          return;
        }
        
        formulario.dataset.passwdProcessed = 'true';
        formulario.dataset.passwdFormId = `form_${Date.now()}_${index}`;
        
        logMessage(`Analizando formulario #${index}: ${formulario.id || formulario.name || 'sin identificador'}`, 'info', DEBUG_MODE);
        
        // Verificar si el formulario parece de login
        const esFormularioLogin = parecerFormularioLogin(formulario);
        formulario.dataset.passwdLoginForm = esFormularioLogin ? 'true' : 'false';
        
        if (esFormularioLogin) {
          logMessage(`Formulario #${index} detectado como FORMULARIO DE LOGIN`, 'info', DEBUG_MODE);
          
          // Extraer campos
          const campos = obtenerCamposCredenciales(formulario);
          if (campos.usuario && campos.password) {
            logMessage(`Formulario #${index} tiene campos de usuario (${campos.usuario.id || campos.usuario.name || 'sin id'}) y contraseña`, 'info', DEBUG_MODE);
            
            // Datos para el listener
            const formInfo = {
              form: formulario,
              campoUsuario: campos.usuario,
              campoPassword: campos.password,
              id: formulario.dataset.passwdFormId
            };
            
            // Agregar listener al evento submit
            formulario.addEventListener('submit', function(e) {
              const ahora = Date.now();
              logMessage(`⚡ EVENTO SUBMIT en formulario ${formInfo.id} a las ${new Date().toISOString()}`, 'info', true);
              
              // Evitar procesamiento duplicado (eventos muy cercanos)
              if (ultimoFormularioEnviado === formInfo.id && ahora - ultimoTiempoEnvio < 2000) {
                logMessage('Ignorando submit duplicado (mismo formulario en menos de 2s)', 'warn', DEBUG_MODE);
                return;
              }
              
              // Registrar envío
              ultimoFormularioEnviado = formInfo.id;
              ultimoTiempoEnvio = ahora;
              
              // Capturar credenciales
              const sitio = window.location.href;
              const usuario = formInfo.campoUsuario.value.trim();
              const password = formInfo.campoPassword.value;
              
              logMessage(`Capturadas credenciales en submit: sitio=${sitio}, usuario=${usuario.substring(0, 2)}***`, 'info', DEBUG_MODE);
              
              // Validar datos
              if (validarDatosCredenciales(sitio, usuario, password)) {
                // Si es un dominio prioritario, guardar automáticamente
                if (esDominioDeAutoguardado()) {
                  logMessage(`Dominio en lista de autoguardado: ${window.location.hostname}`, 'info', DEBUG_MODE);
                  
                  // Mostrar diálogo con un pequeño retraso para permitir que el formulario se envíe
        setTimeout(() => {
          mostrarDialogoGuardarCredenciales(sitio, usuario, password);
                  }, 1000);
                } else {
                  // Guardar para posible uso posterior (después de verificar respuesta XHR/fetch)
                  credencialesCapturadas = { sitio, usuario, password };
                  datosCompletos = true;
                  
                  // En formularios normales, mostrar después de un retraso
                  setTimeout(() => {
                    // Si no se ha mostrado por otra estrategia, mostrarlo ahora
                    logMessage('Mostrando diálogo después de tiempo de espera post-submit', 'info', DEBUG_MODE);
                    mostrarDialogoGuardarCredenciales(sitio, usuario, password);
                  }, 2000);
                }
              }
            });
            
            logMessage(`Listener de submit agregado a formulario #${index}`, 'info', DEBUG_MODE);
          } else {
            logMessage(`Formulario #${index} no tiene campos completos de usuario y/o contraseña`, 'warn', DEBUG_MODE);
          }
        } else {
          logMessage(`Formulario #${index} NO parece ser de login`, 'info', DEBUG_MODE);
        }
      } catch (formError) {
        logMessage(`Error al procesar formulario #${index}: ${formError.message}`, 'error', DEBUG_MODE);
      }
    };
    
    // Procesar formularios existentes
    todosLosFormularios.forEach(añadirListenerFormulario);
    
    // ESTRATEGIA 2: Sobrescribir método submit nativo
    logMessage('Configurando detección de formularios (estrategia 2: sobrescribir método submit)', 'info', DEBUG_MODE);
    
    // Guardar referencia al método submit original
    const submitOriginal = HTMLFormElement.prototype.submit;
    
    // Sobrescribir el método submit
    HTMLFormElement.prototype.submit = function() {
      try {
        logMessage(`⚡ MÉTODO SUBMIT llamado en formulario ${this.id || this.name || 'sin ID'}`, 'info', true);
        
        // Verificar si es un formulario de login
        let esLoginForm = this.dataset.passwdLoginForm === 'true';
        
        // Si no tiene la propiedad, verificamos
        if (this.dataset.passwdLoginForm === undefined) {
          esLoginForm = parecerFormularioLogin(this);
          this.dataset.passwdLoginForm = esLoginForm ? 'true' : 'false';
        }
        
        if (esLoginForm) {
          logMessage('Formulario de login detectado en método submit sobrescrito', 'info', DEBUG_MODE);
          
          // Obtener campos
          const campos = obtenerCamposCredenciales(this);
          
          if (campos.usuario && campos.password) {
            const sitio = window.location.href;
            const usuario = campos.usuario.value.trim();
            const password = campos.password.value;
            
            logMessage(`Credenciales capturadas en método submit: sitio=${sitio}, usuario=${usuario.substring(0, 2)}***`, 'info', DEBUG_MODE);
            
            // Validar y mostrar
            if (validarDatosCredenciales(sitio, usuario, password)) {
              // Si es un dominio prioritario, guardar automáticamente
              if (esDominioDeAutoguardado()) {
                logMessage(`Dominio en lista de autoguardado (método submit): ${window.location.hostname}`, 'info', DEBUG_MODE);
                
                // Programar mostrar diálogo
                setTimeout(() => {
                  mostrarDialogoGuardarCredenciales(sitio, usuario, password);
                }, 1000);
              } else {
                // Guardar para uso posterior
                credencialesCapturadas = { sitio, usuario, password };
                datosCompletos = true;
                
                // En formularios normales, mostrar después de un retraso
                setTimeout(() => {
                  logMessage('Mostrando diálogo después de tiempo de espera post-método-submit', 'info', DEBUG_MODE);
                  mostrarDialogoGuardarCredenciales(sitio, usuario, password);
                }, 2000);
              }
            }
          }
        }
      } catch (e) {
        logMessage(`Error en método submit sobrescrito: ${e.message}`, 'error', DEBUG_MODE);
      }
      
      // Llamar al método original
      return submitOriginal.apply(this, arguments);
    };
    
    logMessage('Método submit sobrescrito correctamente', 'info', DEBUG_MODE);
    
    // ESTRATEGIA 3: Observar keypresses en campos de contraseña
    logMessage('Configurando detección de keypresses en campos de password (estrategia 3)', 'info', DEBUG_MODE);
    
    // Función para capturar eventos de keydown en campos de contraseña
    const capturarKeypressPassword = (e) => {
      try {
        // Solo procesar Enter y Tab
        if (e.key !== 'Enter' && e.key !== 'Tab') {
          return;
        }
        
        const target = e.target;
        
        // Verificar si es un campo de contraseña
        if (target.type === 'password') {
          logMessage(`Tecla ${e.key} presionada en campo de contraseña`, 'info', DEBUG_MODE);
          
          // Buscar un formulario padre
          const formularioPadre = target.closest('form');
          if (formularioPadre) {
            logMessage('Campo de contraseña dentro de un formulario', 'info', DEBUG_MODE);
            
            // Localizar el campo de usuario
            const campos = obtenerCamposCredenciales(formularioPadre);
            
            if (campos.usuario && campos.password) {
              const sitio = window.location.href;
              const usuario = campos.usuario.value.trim();
              const password = campos.password.value;
              
              logMessage(`Credenciales capturadas en keypress: sitio=${sitio}, usuario=${usuario.substring(0, 2)}***`, 'info', DEBUG_MODE);
              
              // Validar y procesarlas con retraso si es Enter
              if (e.key === 'Enter' && validarDatosCredenciales(sitio, usuario, password)) {
                setTimeout(() => {
                  logMessage('Mostrando diálogo después de detección de tecla Enter', 'info', DEBUG_MODE);
                  mostrarDialogoGuardarCredenciales(sitio, usuario, password);
                }, 2000);
              }
              
              // Guardar en variables de seguimiento
              credencialesCapturadas = { sitio, usuario, password };
              datosCompletos = true;
            }
          } else {
            logMessage('Campo de contraseña fuera de un formulario, buscando campo de usuario cercano', 'info', DEBUG_MODE);
            
            // Intentar encontrar campo de usuario cercano
            const camposPassword = document.querySelectorAll('input[type="password"]');
            const indexActual = Array.from(camposPassword).indexOf(target);
            
            if (indexActual !== -1) {
              // Buscar campos de texto cercanos
              const camposInput = document.querySelectorAll('input:not([type="password"])');
              let mejorCampoUsuario = null;
              let mejorPuntuacion = 0;
              
              for (const campo of camposInput) {
                const puntuacion = calcularPuntuacionCampoUsuario(campo);
                if (puntuacion > mejorPuntuacion) {
                  mejorPuntuacion = puntuacion;
                  mejorCampoUsuario = campo;
                }
              }
              
              if (mejorCampoUsuario && mejorPuntuacion > 3) {
                const sitio = window.location.href;
                const usuario = mejorCampoUsuario.value.trim();
                const password = target.value;
                
                logMessage(`Credenciales sin formulario: sitio=${sitio}, usuario=${usuario.substring(0, 2)}***`, 'info', DEBUG_MODE);
                
                // Validar y mostrar si es Enter
                if (e.key === 'Enter' && validarDatosCredenciales(sitio, usuario, password)) {
                  setTimeout(() => {
                    logMessage('Mostrando diálogo después de detección de tecla Enter (sin formulario)', 'info', DEBUG_MODE);
                    mostrarDialogoGuardarCredenciales(sitio, usuario, password);
                  }, 2000);
                }
                
                // Guardar en variables de seguimiento
                credencialesCapturadas = { sitio, usuario, password };
                datosCompletos = true;
              }
            }
          }
        }
      } catch (keyError) {
        logMessage(`Error en evento keydown: ${keyError.message}`, 'error', DEBUG_MODE);
      }
    };
    
    // Agregar listener global para keydown
    document.addEventListener('keydown', capturarKeypressPassword);
    logMessage('Evento keydown configurado para campos de contraseña', 'info', DEBUG_MODE);
    
    // ESTRATEGIA 4: Observar cambios en DOM para detectar login exitoso
    logMessage('Configurando MutationObserver para detectar cambios post-login (estrategia 4)', 'info', DEBUG_MODE);
    
    // Función para verificar si un cambio parece indicar login exitoso
    const pareceCambioLoginExitoso = (mutaciones) => {
      // Signos típicos de login exitoso:
      // 1. Redirect a dashboard
      // 2. Aparición de elementos de usuario (avatar, nombre)
      // 3. Desaparición del formulario de login
      
      for (const mutacion of mutaciones) {
        // Verificar nodos añadidos que puedan indicar login exitoso
        for (const nodo of mutacion.addedNodes) {
          if (nodo.nodeType === Node.ELEMENT_NODE) {
            // Buscar elementos que indiquen dashboard o panel de usuario
            const el = nodo;
            
            // Buscar clases o IDs típicos
            const elementText = el.textContent ? el.textContent.toLowerCase() : '';
            const clasesBuscadas = ['dashboard', 'account', 'profile', 'user', 'avatar', 'logged', 'welcome'];
            
            // Verificar clases
            if (el.className && typeof el.className === 'string') {
              for (const clase of clasesBuscadas) {
                if (el.className.toLowerCase().includes(clase)) {
                  return true;
                }
              }
            }
            
            // Verificar ID
            if (el.id) {
              for (const clase of clasesBuscadas) {
                if (el.id.toLowerCase().includes(clase)) {
                  return true;
                }
              }
            }
            
            // Verificar texto de bienvenida
            if (elementText.includes('welcome') || 
                elementText.includes('hello') || 
                elementText.includes('hi,') ||
                elementText.includes('bienvenido') || 
                elementText.includes('hola,')) {
              return true;
            }
          }
        }
        
        // Verificar nodos eliminados (como el formulario de login)
        for (const nodo of mutacion.removedNodes) {
          if (nodo.nodeType === Node.ELEMENT_NODE) {
            const el = nodo;
            
            // Si era un formulario que teníamos marcado como login
            if (el.tagName === 'FORM' && el.dataset && el.dataset.passwdLoginForm === 'true') {
              return true;
            }
          }
        }
      }
      
      return false;
    };
    
    // Crear un MutationObserver
    const observador = new MutationObserver((mutaciones) => {
      try {
        // Si tenemos credenciales capturadas y hay cambios que indican login exitoso
        if (credencialesCapturadas && datosCompletos && pareceCambioLoginExitoso(mutaciones)) {
          logMessage('MutationObserver detectó cambios que indican login exitoso', 'info', DEBUG_MODE);
          
          // Mostrar diálogo
          setTimeout(() => {
            logMessage('Mostrando diálogo después de detección MutationObserver', 'info', DEBUG_MODE);
            mostrarDialogoGuardarCredenciales(
              credencialesCapturadas.sitio,
              credencialesCapturadas.usuario,
              credencialesCapturadas.password
            );
          }, 1000);
        }
      } catch (obsError) {
        logMessage(`Error en MutationObserver: ${obsError.message}`, 'error', DEBUG_MODE);
      }
    });
    
    // Iniciar observación
    observador.observe(document, { childList: true, subtree: true });
    logMessage('MutationObserver inicializado para detección de cambios post-login', 'info', DEBUG_MODE);
    
    // ESTRATEGIA 5: Capturar focus y blur en campos relevantes
    logMessage('Configurando captura de focus/blur en campos de login (estrategia 5)', 'info', DEBUG_MODE);
    
    // Función para capturar focus
    const capturarFocus = (e) => {
      try {
        const target = e.target;
        
        // Si es un input
        if (target.tagName === 'INPUT') {
          // Determinar tipo de campo
          if (target.type === 'password') {
            logMessage('Focus en campo de contraseña', 'info', DEBUG_MODE);
            campoPasswordActual = target;
          } else if (esInputUsuario(target)) {
            logMessage('Focus en campo de usuario', 'info', DEBUG_MODE);
            campoUsuarioActual = target;
          }
        }
      } catch (focusError) {
        logMessage(`Error en evento focus: ${focusError.message}`, 'error', DEBUG_MODE);
      }
    };
    
    // Función para capturar blur
    const capturarBlur = (e) => {
      // No hacemos nada, solo mantenemos las referencias
    };
    
    // Agregar listeners globales
    document.addEventListener('focus', capturarFocus, true);
    document.addEventListener('blur', capturarBlur, true);
    logMessage('Eventos focus/blur configurados', 'info', DEBUG_MODE);
    
    // ESTRATEGIA 6: Interceptar XMLHttpRequest
    logMessage('Configurando intercepción de XMLHttpRequest (estrategia 6)', 'info', DEBUG_MODE);
    
    // Guardar referencia al constructor original
    const XHROriginal = window.XMLHttpRequest;
    
    // Sobrescribir con versión instrumentada
    window.XMLHttpRequest = function() {
      const xhr = new XHROriginal();
      
      // Interceptar método open
      const openOriginal = xhr.open;
      xhr.open = function() {
        try {
          const method = arguments[0];
          const url = arguments[1];
          
          // Registrar petición
          logMessage(`XHR interceptado: ${method} ${url}`, 'info', DEBUG_MODE);
          
          // Guardar URL para uso posterior
          xhr._passwdUrl = url;
          xhr._passwdMethod = method;
        } catch (e) {
          logMessage(`Error en intercepción XHR.open: ${e.message}`, 'error', DEBUG_MODE);
        }
        
        return openOriginal.apply(xhr, arguments);
      };
      
      // Interceptar onreadystatechange
      const setOriginal = xhr.setRequestHeader;
      xhr.setRequestHeader = function() {
        try {
          const header = arguments[0];
          // const value = arguments[1];
          
          // Detectar headers de login (Content-Type: application/json)
          if (header.toLowerCase() === 'content-type') {
            xhr._passwdContentType = arguments[1];
          }
        } catch (e) {
          logMessage(`Error en intercepción XHR.setRequestHeader: ${e.message}`, 'error', DEBUG_MODE);
        }
        
        return setOriginal.apply(xhr, arguments);
      };
      
      // Sobrescribir onreadystatechange
      const listenerOriginal = xhr.addEventListener;
      xhr.addEventListener = function(tipo, listener) {
        try {
          if (tipo === 'load' || tipo === 'loadend') {
            // Interceptar eventos load/loadend
            const wrapperListener = function(event) {
              try {
                // Verificar si es una respuesta exitosa
                if (xhr.readyState === 4 && xhr.status >= 200 && xhr.status < 300) {
                  logMessage(`XHR exitoso: ${xhr._passwdMethod} ${xhr._passwdUrl} (${xhr.status})`, 'info', DEBUG_MODE);
                  
                  // Si hay credenciales capturadas, mostrar el diálogo
                  if (credencialesCapturadas && datosCompletos) {
                    logMessage('Mostrando diálogo post-XHR exitoso', 'info', DEBUG_MODE);
                    setTimeout(() => {
                      mostrarDialogoGuardarCredenciales(
                        credencialesCapturadas.sitio,
                        credencialesCapturadas.usuario,
                        credencialesCapturadas.password
                      );
                    }, 1000);
                  } else if (campoUsuarioActual && campoPasswordActual) {
                    // Intentar capturar de los campos que teníamos en foco
                    if (campoUsuarioActual.value && campoPasswordActual.value) {
                      const sitioActual = window.location.href;
                      const usuarioValor = campoUsuarioActual.value.trim();
                      const passwordValor = campoPasswordActual.value;
                      
                      const datosValidos = validarDatosCredenciales(sitioActual, usuarioValor, passwordValor);
                      if (datosValidos) {
                        logMessage('Mostrando diálogo con credenciales capturadas de campos en foco después de XHR', 'info', DEBUG_MODE);
                        setTimeout(() => {
                          mostrarDialogoGuardarCredenciales(sitioActual, usuarioValor, passwordValor);
                        }, 1000);
                      }
                    }
                  }
                }
              } catch (e) {
                logMessage(`Error en wrapper de XHR listener: ${e.message}`, 'error', DEBUG_MODE);
              }
              
              // Llamar listener original
              return listener.apply(this, arguments);
            };
            
            // Llamar al método original con el wrapper
            return listenerOriginal.call(xhr, tipo, wrapperListener);
          }
        } catch (e) {
          logMessage(`Error en intercepción XHR.addEventListener: ${e.message}`, 'error', DEBUG_MODE);
        }
        
        // Pasar directamente para otros tipos de eventos
        return listenerOriginal.apply(xhr, arguments);
      };
      
      return xhr;
    };
    
    logMessage('XMLHttpRequest interceptado correctamente', 'info', DEBUG_MODE);
    
    // ESTRATEGIA 7: Interceptar fetch
    logMessage('Configurando intercepción de fetch (estrategia 7)', 'info', DEBUG_MODE);
    
    // Guardar referencia al fetch original
    const originalFetch = window.fetch;
    
    // Sobrescribir con versión instrumentada
    window.fetch = function() {
      try {
        const recurso = arguments[0];
        const opciones = arguments[1] || {};
        
        // Obtener información de la petición
        let url = '';
        if (typeof recurso === 'string') {
          url = recurso;
        } else if (recurso instanceof Request) {
          url = recurso.url;
        }
        
        const method = opciones.method || 'GET';
        
        logMessage(`Fetch interceptado: ${method} ${url}`, 'info', DEBUG_MODE);
        
        // Llamar al fetch original
        const promesa = originalFetch.apply(this, arguments);
        
        // Interceptar respuesta
        return promesa.then(response => {
          try {
            // Verificar si es una respuesta exitosa
            if (response.ok) {
              logMessage(`Respuesta exitosa de posible login fetch: ${response.status}`, 'info', DEBUG_MODE);
              
              // Similar a la lógica de XHR
              if (credencialesCapturadas && datosCompletos) {
                logMessage('Mostrando diálogo post-fetch login exitoso', 'info', DEBUG_MODE);
                setTimeout(() => {
                  mostrarDialogoGuardarCredenciales(
                    credencialesCapturadas.sitio,
                    credencialesCapturadas.usuario,
                    credencialesCapturadas.password
                  );
                }, 1000);
              } else if (campoUsuarioActual && campoPasswordActual) {
                // Intentar capturar de los campos que teníamos en foco
                if (campoUsuarioActual.value && campoPasswordActual.value) {
                  const sitioActual = window.location.href;
                  const usuarioValor = campoUsuarioActual.value.trim();
                  const passwordValor = campoPasswordActual.value;
                  
                  const datosValidos = validarDatosCredenciales(sitioActual, usuarioValor, passwordValor);
                  if (datosValidos) {
                    logMessage('Mostrando diálogo con credenciales capturadas de campos en foco después de fetch', 'info', DEBUG_MODE);
                    setTimeout(() => {
                      mostrarDialogoGuardarCredenciales(sitioActual, usuarioValor, passwordValor);
                    }, 1000);
                  }
                }
              }
            }
            return response;
          } catch (e) {
            logMessage(`Error en intercepción de respuesta fetch: ${e.message}`, 'error', DEBUG_MODE);
            return response;
          }
        });
      } catch (e) {
        logMessage(`Error en intercepción fetch: ${e.message}`, 'error', DEBUG_MODE);
        return originalFetch.apply(this, arguments);
      }
    };
    
    logMessage('Fetch interceptado correctamente', 'info', DEBUG_MODE);
    logMessage('🔴 TODAS LAS ESTRATEGIAS DE DETECCIÓN DE FORMULARIOS ACTIVADAS', 'success', true);
  } catch (e) {
    logMessage(`Error al inicializar detectores de formularios: ${e.message}`, 'error', true);
  }
}

// Función para mostrar el diálogo preguntando si quiere guardar las credenciales
function mostrarDialogoGuardarCredenciales(credenciales) {
  // Evitar que se muestre si ya hay un diálogo visible
  if (document.getElementById('passwd-dialog')) {
    console.log("[PASSWD] Ya existe un diálogo. No se creará otro.");
    return;
  }
  
  console.log("[PASSWD] Mostrando diálogo para guardar credenciales:", credenciales);

  try {
    // Intentar mostrar la notificación del sistema primero
    chrome.runtime.sendMessage({
      action: "show_save_notification",
      credenciales: credenciales
    }, response => {
      console.log("[PASSWD] Respuesta de notificación del sistema:", response);
      
      // Si no se pudo mostrar la notificación del sistema o hubo un error, mostrar el diálogo tradicional
      if (!response || !response.success) {
        console.log("[PASSWD] No se pudo mostrar la notificación del sistema, mostrando diálogo tradicional");
        // Asegurarnos de que document.body existe
        if (document.body) {
          setTimeout(() => mostrarDialogoTradicional(credenciales), 500);
        } else {
          console.error("[PASSWD] document.body no está disponible para mostrar el diálogo");
        }
      }
    });
  } catch (error) {
    console.error("[PASSWD] Error al intentar mostrar notificación:", error);
    
    // Fallback al diálogo tradicional en caso de error
    if (document.body) {
      setTimeout(() => mostrarDialogoTradicional(credenciales), 500);
    } else {
      console.error("[PASSWD] document.body no está disponible para mostrar el diálogo");
    }
  }
}

/**
 * Muestra un diálogo tradicional en el DOM para guardar credenciales
 * @param {Object} credenciales - Credenciales a guardar 
 */
function mostrarDialogoTradicional(credenciales) {
  logMessage('Mostrando diálogo tradicional para guardar credenciales', 'info', true);
  
  // Prevenir múltiples diálogos
  if (document.getElementById('passwd-extension-dialog')) {
    logMessage('Ya hay un diálogo abierto, no se muestra otro', 'warning', true);
    return;
  }

  // Asegurar que document.body existe
  if (!document.body) {
    logMessage('Error: document.body no disponible', 'error', true);
    return;
  }
  
  try {
    // Crear el contenedor del diálogo con efectos visuales mejorados
    const dialogContainer = document.createElement('div');
    dialogContainer.id = 'passwd-extension-dialog';
    dialogContainer.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: 320px;
      max-width: 90vw;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15), 0 3px 10px rgba(0, 0, 0, 0.08);
    z-index: 2147483647;
      overflow: hidden;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      transition: all 0.3s cubic-bezier(0.2, 0, 0.2, 1);
      border: 1px solid rgba(0, 0, 0, 0.08);
      padding: 0;
      opacity: 0;
      transform: translateY(-10px) scale(0.98);
      backdrop-filter: blur(5px);
    `;

    // Agregar animaciones CSS para efectos visuales
  const style = document.createElement('style');
  style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-10px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes fadeOut {
        from { opacity: 1; transform: translateY(0) scale(1); }
        to { opacity: 0; transform: translateY(-10px) scale(0.98); }
      }
      @keyframes pulse {
        0% { transform: scale(1) translateZ(0); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15), 0 3px 10px rgba(0, 0, 0, 0.08); }
        50% { transform: scale(1.02) translateZ(0); box-shadow: 0 10px 35px rgba(0, 0, 0, 0.2), 0 3px 12px rgba(0, 0, 0, 0.1); }
        100% { transform: scale(1) translateZ(0); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15), 0 3px 10px rgba(0, 0, 0, 0.08); }
      }
      @keyframes shine {
        from { background-position: -200px; }
        to { background-position: calc(100% + 200px); }
      }
      @keyframes shimmerButton {
        0% { background-position: -100px; }
        100% { background-position: 200px; }
    }
  `;
  document.head.appendChild(style);
  
    // Crear la cabecera del diálogo
    const dialogHeader = document.createElement('div');
    dialogHeader.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 16px;
      background: linear-gradient(135deg, #4d90fe, #3367d6);
      color: white;
      border-bottom: 1px solid rgba(0, 0, 0, 0.05);
    `;
    
    // Título del diálogo
    const title = document.createElement('h3');
    title.textContent = 'Guardar contraseña';
    title.style.cssText = `
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    `;
    
    // Botón de cerrar
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '&times;';
    closeButton.style.cssText = `
      background: none;
      border: none;
      color: white;
      font-size: 22px;
      cursor: pointer;
      padding: 0 4px;
      line-height: 1;
      opacity: 0.9;
      transition: opacity 0.2s, transform 0.2s;
      font-weight: bold;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
    `;
    closeButton.addEventListener('mouseover', () => {
      closeButton.style.opacity = '1';
      closeButton.style.transform = 'scale(1.1)';
      closeButton.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    });
    closeButton.addEventListener('mouseout', () => {
      closeButton.style.opacity = '0.9';
      closeButton.style.transform = 'scale(1)';
      closeButton.style.backgroundColor = 'transparent';
    });
    
    dialogHeader.appendChild(title);
    dialogHeader.appendChild(closeButton);
    
    // Crear el cuerpo del diálogo
    const dialogBody = document.createElement('div');
    dialogBody.style.cssText = `
      padding: 16px;
      color: #333;
    `;
    
    // Mensaje
    const messageContent = document.createElement('p');
    messageContent.style.cssText = `
      margin: 0 0 16px 0;
      font-size: 14px;
      line-height: 1.5;
      color: #424242;
    `;
    messageContent.textContent = '¿Quieres guardar esta contraseña para este sitio?';
    
    // Información del sitio
    const siteInfo = document.createElement('div');
    siteInfo.style.cssText = `
      margin-bottom: 16px;
      padding: 12px;
      background-color: rgba(0, 0, 0, 0.02);
      border-radius: 8px;
      font-size: 14px;
      border: 1px solid rgba(0, 0, 0, 0.06);
    `;
    
    // URL (solo dominio)
    const siteDomain = document.createElement('div');
    siteDomain.style.cssText = `
      margin-bottom: 10px;
      display: flex;
      align-items: center;
    `;
    
    const siteIcon = document.createElement('span');
    siteIcon.style.cssText = `
      display: inline-block;
      margin-right: 10px;
      font-size: 16px;
      color: #5f6368;
    `;
    siteIcon.textContent = '🌐';
    
    // Obtener solo el dominio para mostrar
    let displayUrl = credenciales.sitio;
    try {
      const url = new URL(credenciales.sitio);
      displayUrl = url.hostname;
    } catch (e) {
      logMessage('No se pudo parsear URL, mostrando tal cual: ' + credenciales.sitio, 'warning');
    }
    
    const siteText = document.createElement('span');
    siteText.style.cssText = `
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
      font-weight: 500;
      max-width: 230px;
    `;
    siteText.textContent = displayUrl;
    siteText.title = credenciales.sitio; // URL completa en tooltip
    
    siteDomain.appendChild(siteIcon);
    siteDomain.appendChild(siteText);
    
    // Usuario
    const userInfo = document.createElement('div');
    userInfo.style.cssText = `
      display: flex;
      align-items: center;
    `;
    
    const userIcon = document.createElement('span');
    userIcon.style.cssText = `
      display: inline-block;
      margin-right: 10px;
      font-size: 16px;
      color: #5f6368;
    `;
    userIcon.textContent = '👤';
    
    const userText = document.createElement('span');
    userText.style.cssText = `
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
      max-width: 230px;
    `;
    userText.textContent = credenciales.usuario;
    userText.title = credenciales.usuario; // Usuario completo en tooltip
    
    userInfo.appendChild(userIcon);
    userInfo.appendChild(userText);
    
    siteInfo.appendChild(siteDomain);
    siteInfo.appendChild(userInfo);
    
    // Botones de acción
    const actions = document.createElement('div');
    actions.style.cssText = `
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 8px;
    `;
    
    // Botón Cancelar
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancelar';
    cancelButton.style.cssText = `
      background: none;
      border: 1px solid rgba(0, 0, 0, 0.08);
      padding: 8px 14px;
      font-size: 14px;
      cursor: pointer;
      color: #3367d6;
      font-weight: 500;
      border-radius: 4px;
      transition: all 0.2s ease;
    `;
    cancelButton.addEventListener('mouseover', () => {
      cancelButton.style.backgroundColor = 'rgba(51, 103, 214, 0.05)';
      cancelButton.style.borderColor = 'rgba(51, 103, 214, 0.2)';
    });
    cancelButton.addEventListener('mouseout', () => {
      cancelButton.style.backgroundColor = 'transparent';
      cancelButton.style.borderColor = 'rgba(0, 0, 0, 0.08)';
    });
    cancelButton.addEventListener('mousedown', () => {
      cancelButton.style.transform = 'scale(0.98)';
    });
    cancelButton.addEventListener('mouseup', () => {
      cancelButton.style.transform = 'scale(1)';
    });
    
    // Botón Guardar
    const saveButton = document.createElement('button');
    saveButton.textContent = 'Guardar';
    saveButton.style.cssText = `
      background-color: #3367d6;
      color: white;
      border: none;
      padding: 8px 18px;
      font-size: 14px;
      font-weight: 500;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
      overflow: hidden;
    `;
    saveButton.addEventListener('mouseover', () => {
      saveButton.style.backgroundColor = '#4285f4';
      saveButton.style.transform = 'translateY(-1px)';
      saveButton.style.boxShadow = '0 2px 5px rgba(66, 133, 244, 0.3)';
    });
    saveButton.addEventListener('mouseout', () => {
      saveButton.style.backgroundColor = '#3367d6';
      saveButton.style.transform = 'translateY(0)';
      saveButton.style.boxShadow = 'none';
    });
    saveButton.addEventListener('mousedown', () => {
      saveButton.style.transform = 'scale(0.98)';
    });
    saveButton.addEventListener('mouseup', () => {
      saveButton.style.transform = 'scale(1)';
    });
    
    actions.appendChild(cancelButton);
    actions.appendChild(saveButton);
    
    // Ensamblar el diálogo
    dialogBody.appendChild(messageContent);
    dialogBody.appendChild(siteInfo);
    dialogBody.appendChild(actions);
    
    dialogContainer.appendChild(dialogHeader);
    dialogContainer.appendChild(dialogBody);
    
    document.body.appendChild(dialogContainer);
    
    // Activar la animación de aparición
      setTimeout(() => {
      dialogContainer.style.opacity = '1';
      dialogContainer.style.transform = 'translateY(0) scale(1)';
    }, 10);
    
    // Efecto visual para llamar la atención
    setTimeout(() => {
      dialogContainer.style.animation = 'pulse 2s ease-in-out infinite';
    }, 1000);
    
    // Manejadores de eventos para cerrar el diálogo
    const cerrarDialogo = () => {
      dialogContainer.style.animation = '';
      dialogContainer.style.opacity = '0';
      dialogContainer.style.transform = 'translateY(-10px) scale(0.98)';
      
      setTimeout(() => {
        if (dialogContainer.parentNode) {
          dialogContainer.parentNode.removeChild(dialogContainer);
        }
        if (style.parentNode) {
          style.parentNode.removeChild(style);
        }
      }, 300);
    };
    
    closeButton.addEventListener('click', cerrarDialogo);
    cancelButton.addEventListener('click', cerrarDialogo);
    
    // Manejador para guardar las credenciales
    saveButton.addEventListener('click', async () => {
      const loadingText = saveButton.textContent;
      saveButton.disabled = true;
      saveButton.textContent = 'Guardando...';
      
      // Efecto visual mientras se guarda
      const shine = document.createElement('div');
      shine.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(
          to right,
          rgba(255, 255, 255, 0) 0%,
          rgba(255, 255, 255, 0.6) 50%,
          rgba(255, 255, 255, 0) 100%
        );
        background-size: 200px 100%;
        animation: shimmerButton 1.5s infinite linear;
        pointer-events: none;
      `;
      saveButton.appendChild(shine);
      
      try {
        // Guardar las credenciales
        logMessage('Enviando credenciales para guardar...', 'info', true);
        const response = await sendMessageSafely({
          action: 'guardar_credenciales',
          datos: credenciales
        });
        
        if (response && response.success) {
          logMessage('Credenciales guardadas correctamente', 'success', true);
          
          // Cambiar el mensaje para mostrar éxito
          messageContent.textContent = '¡Contraseña guardada correctamente!';
          messageContent.style.color = '#0f9d58';
          
          // Cambiar botones
          saveButton.textContent = '✓ Guardado';
          saveButton.style.backgroundColor = '#0f9d58';
          saveButton.disabled = true;
          
          if (shine.parentNode) {
            shine.parentNode.removeChild(shine);
          }
          
          // Cerrar automáticamente después de 2 segundos
          setTimeout(cerrarDialogo, 2000);
        } else {
          logMessage('Error al guardar credenciales: ' + (response?.error || 'Desconocido'), 'error', true);
          
          if (response && response.requiresAuth) {
            // Problema de autenticación
            messageContent.textContent = 'Necesitas iniciar sesión para guardar contraseñas.';
            messageContent.style.color = '#d93025';
            
            // Cambiar el botón de guardar a "Iniciar sesión"
            saveButton.textContent = 'Iniciar sesión';
            saveButton.style.backgroundColor = '#d93025';
            saveButton.disabled = false;
            
            if (shine.parentNode) {
              shine.parentNode.removeChild(shine);
            }
            
            // Cambiar el evento click para iniciar sesión
            saveButton.removeEventListener('click', arguments.callee);
            saveButton.addEventListener('click', async () => {
              // Solicitar login
              await sendMessageSafely({
                action: 'mostrar_login'
              });
              cerrarDialogo();
            });
          } else {
            // Otro tipo de error
            messageContent.textContent = `Error: ${response?.error || 'No se pudo guardar la contraseña'}`;
            messageContent.style.color = '#d93025';
            
            // Restaurar el botón
            saveButton.textContent = 'Reintentar';
            saveButton.style.backgroundColor = '#3367d6';
            saveButton.disabled = false;
            
            if (shine.parentNode) {
              shine.parentNode.removeChild(shine);
            }
          }
        }
      } catch (error) {
        logMessage('Error al guardar credenciales: ' + error.message, 'error', true);
        
        // Mostrar mensaje de error
        messageContent.textContent = `Error: ${error.message || 'No se pudo guardar la contraseña'}`;
        messageContent.style.color = '#d93025';
        
        // Restaurar el botón
        saveButton.textContent = 'Reintentar';
        saveButton.style.backgroundColor = '#3367d6';
        saveButton.disabled = false;
        
        if (shine.parentNode) {
          shine.parentNode.removeChild(shine);
        }
      }
    });
    
    // Cerrar el diálogo al hacer clic fuera de él (opcional)
    const clickOutside = (e) => {
      if (!dialogContainer.contains(e.target) && e.target !== dialogContainer) {
        document.removeEventListener('click', clickOutside);
        cerrarDialogo();
      }
    };
    
    // Activar después de un breve retraso para evitar que se cierre inmediatamente
    setTimeout(() => {
      document.addEventListener('click', clickOutside);
    }, 300);
    
    logMessage('Diálogo para guardar credenciales creado correctamente', 'success', true);
  } catch (error) {
    logMessage('Error al crear diálogo de guardar credenciales: ' + error.message, 'error', true);
    // Intentar mostrar una notificación simple como respaldo
    mostrarNotificacion(false, 'Error al mostrar diálogo: ' + error.message);
  }
}

// Función para guardar credenciales en la base de datos
function guardarCredenciales(sitio, usuario, password) {
  try {
    logMessage(`Guardando credenciales para ${sitio}`, 'info', true);
    
    // Validar datos básicos
    if (!sitio || !usuario || !password) {
      logMessage('Datos de credenciales incompletos', 'error', true);
      mostrarNotificacion(false, 'Datos incompletos o inválidos');
      return false;
    }
    
    // Verificar si es una URL válida
    try {
      new URL(sitio);
    } catch (e) {
      logMessage(`URL inválida: ${sitio}`, 'error', true);
      mostrarNotificacion(false, 'La URL proporcionada no es válida');
      return false;
    }
    
    // Preparar datos para enviar
    const credencial = {
      sitio: sitio,
      usuario: usuario,
      contraseña: password
    };
    
    logMessage('Enviando credenciales al background script...', 'info', true);
    
    // Enviar la credencial con la nueva estructura
    sendMessageSafely({
      action: 'guardar_credenciales',
      credencial: credencial
    })
    .then(resultado => {
      if (resultado && resultado.success) {
        logMessage('Credenciales guardadas correctamente', 'success', true);
        mostrarNotificacion(true, 'Credenciales guardadas correctamente');
        return true;
      } else if (resultado) {
        logMessage(`Error al guardar credenciales: ${resultado.error}`, 'error', true);
        
        // Si el error es de autenticación, mostrar diálogo de login
        if (resultado.requiresAuth) {
          logMessage('Se requiere autenticación, mostrando popup de login', 'warn', true);
          sendMessageSafely({ action: 'show_login_popup' });
        }
        
        mostrarNotificacion(false, resultado.error || 'Error al guardar credenciales');
        return false;
      } else {
        logMessage('No se recibió respuesta al guardar credenciales', 'error', true);
        mostrarNotificacion(false, 'Error de comunicación al guardar credenciales');
        return false;
      }
    })
    .catch(error => {
      logMessage(`Error al guardar credenciales: ${error}`, 'error', true);
      mostrarNotificacion(false, 'Error al guardar credenciales: ' + error.message);
      return false;
    });
    
    return true; // Indicar que el proceso comenzó correctamente
  } catch (e) {
    logMessage(`Error general al guardar credenciales: ${e}`, 'error', true);
    mostrarNotificacion(false, 'Error al procesar credenciales');
    return false;
  }
}

// Función para mostrar una notificación de resultado
function mostrarNotificacion(exito, mensaje = '') {
  try {
    // Eliminar notificación existente si la hay
    const notificacionExistente = document.getElementById('passwd-notificacion');
    if (notificacionExistente) {
      notificacionExistente.remove();
    }
    
    // Crear nueva notificación
  const notificacion = document.createElement('div');
    notificacion.id = 'passwd-notificacion';
    
    // Estilo base
    Object.assign(notificacion.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: '2147483647',
      padding: '12px 20px',
      borderRadius: '6px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      fontSize: '14px',
      fontFamily: 'Arial, sans-serif',
      color: 'white',
      maxWidth: '320px',
      minWidth: '200px',
      opacity: '0',
      transform: 'translateY(-20px)',
      transition: 'opacity 0.3s, transform 0.3s',
      textAlign: 'left',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    });
    
    // Estilo condicional según resultado
    notificacion.style.backgroundColor = exito ? '#28a745' : '#dc3545';
    
    // Icono de estado
    const icono = document.createElement('span');
    icono.innerHTML = exito ? '✓' : '✕';
    icono.style.marginRight = '10px';
    icono.style.fontSize = '16px';
    
    // Contenido del mensaje
    const contenido = document.createElement('span');
    contenido.style.flex = '1';
    
    // Mensaje personalizado o mensaje por defecto
    const mensajeTexto = mensaje || (exito ? 'Contraseña guardada correctamente' : 'Error al guardar la contraseña');
    contenido.textContent = mensajeTexto;
    
    // Botón de cerrar
    const cerrar = document.createElement('span');
    cerrar.innerHTML = '×';
    cerrar.style.marginLeft = '10px';
    cerrar.style.fontSize = '20px';
    cerrar.style.cursor = 'pointer';
    cerrar.style.opacity = '0.8';
    cerrar.style.fontWeight = 'bold';
    cerrar.addEventListener('click', () => {
      notificacion.style.opacity = '0';
      notificacion.style.transform = 'translateY(-20px)';
      setTimeout(() => notificacion.remove(), 300);
    });
    
    // Construcción de la notificación
    notificacion.appendChild(icono);
    notificacion.appendChild(contenido);
    notificacion.appendChild(cerrar);
  
  // Añadir al DOM
  document.body.appendChild(notificacion);
  
    // Mostrar con animación
  setTimeout(() => {
      notificacion.style.opacity = '1';
      notificacion.style.transform = 'translateY(0)';
    }, 10);
    
    // Auto-desaparecer después de 5 segundos
    setTimeout(() => {
      if (document.body.contains(notificacion)) {
        notificacion.style.opacity = '0';
        notificacion.style.transform = 'translateY(-20px)';
        setTimeout(() => {
          if (document.body.contains(notificacion)) {
            notificacion.remove();
      }
    }, 300);
      }
  }, 5000);
    
    // Guardar registro del resultado
    logMessage(`Notificación mostrada: ${mensajeTexto}`, exito ? 'success' : 'error');
    
  } catch (error) {
    // Fallback en caso de error
    console.error('Error al mostrar notificación:', error);
    alert(exito ? 'Contraseña guardada correctamente' : `Error: ${mensaje || 'No se pudo guardar la contraseña'}`);
  }
}

// Función para configurar la detección de campos de login
function setupLoginFieldsDetection() {
  try {
    logMessage('Configurando detección de campos de login...', 'info');
    
    // Iniciar la primera detección de campos
    añadirIconosACamposLogin();
    
    // Configurar el intervalo de actualización
    if (typeof iconUpdateInterval === 'undefined') {
      // Ya se configuró en otra parte del código, no es necesario hacerlo de nuevo
      logMessage('El intervalo de actualización ya está configurado', 'info');
    }
    
    // Configurar observer para detectar cambios en el DOM si aún no está configurado
    if (typeof observer === 'undefined' || !observer) {
      logMessage('Configurando nuevo observer para cambios en el DOM', 'info');
      
      const newObserver = new MutationObserver((mutations) => {
        let needsUpdate = false;
        
        mutations.forEach(mutation => {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            for (let node of mutation.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.tagName === 'INPUT' || node.querySelector('input')) {
                  needsUpdate = true;
                  break;
                }
              }
            }
          }
        });
        
        if (needsUpdate) {
          añadirIconosACamposLogin();
        }
      });
      
      if (document.body) {
        newObserver.observe(document.body, { childList: true, subtree: true });
        logMessage('Observer configurado correctamente', 'info');
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          if (document.body) {
            newObserver.observe(document.body, { childList: true, subtree: true });
            logMessage('Observer configurado después de DOMContentLoaded', 'info');
          }
        });
      }
    }
    
    logMessage('Detección de campos de login configurada correctamente', 'info');
    return true;
  } catch (e) {
    logMessage(`Error al configurar detección de campos de login: ${e}`, 'error');
    return false;
  }
}

// Función para inicializar los componentes
function initialize() {
  logMessage('Inicializando content script PASSWD...', 'info');
  
  // Notificar al background que el content script está listo
  notifyReady();
  
  // Configurar detección de formularios
  detectarEnvioFormularios();
  
  // Añadir estilos necesarios
  addStyleSafely();
  
  // Configurar detección de campos de login
  setupLoginFieldsDetection();
  
  // Otros aspectos de inicialización...
}

// Llamar a la inicialización
initialize();

// Función auxiliar para obtener campos de usuario y contraseña de un formulario
function obtenerCamposCredenciales(formulario) {
  try {
    if (!formulario) return { usuario: null, password: null };

    // Buscar campo de contraseña (suele ser más específico)
    const camposPassword = Array.from(formulario.querySelectorAll('input[type="password"]'));
    if (camposPassword.length === 0) return { usuario: null, password: null };

    // Buscar campo de usuario
    let camposUsuarioPosibles = Array.from(formulario.querySelectorAll(
      'input[type="text"], input[type="email"], input:not([type]), input[name*="user"], input[name*="email"], input[id*="user"], input[id*="email"], input[name*="login"], input[id*="login"]'
    ));

    // Si no hay campos que coincidan con los selectores, buscar todos los inputs de texto
    if (camposUsuarioPosibles.length === 0) {
      camposUsuarioPosibles = Array.from(formulario.querySelectorAll('input')).filter(
        input => input.type !== 'password' && input.type !== 'submit' && input.type !== 'button' && input.type !== 'checkbox'
      );
    }

    // Ordenar campos por probabilidad de ser un campo de usuario
    camposUsuarioPosibles.sort((a, b) => {
      const aScore = calcularPuntuacionCampoUsuario(a);
      const bScore = calcularPuntuacionCampoUsuario(b);
      return bScore - aScore; // Mayor puntuación primero
    });

    // Tomar el campo con mayor puntuación o el primero si hay empate
    const campoUsuario = camposUsuarioPosibles.length > 0 ? camposUsuarioPosibles[0] : null;
    const campoPassword = camposPassword[0];

    return { usuario: campoUsuario, password: campoPassword };
  } catch (e) {
    logMessage(`Error al obtener campos de credenciales: ${e.message}`, 'error', true);
    return { usuario: null, password: null };
  }
}

// Función auxiliar para calcular la puntuación de un campo como probable campo de usuario
function calcularPuntuacionCampoUsuario(input) {
  let score = 0;
  
  // Verificar tipo
  if (input.type === 'email') score += 10;
  if (input.type === 'text') score += 5;
  
  // Verificar atributos
  const id = (input.id || '').toLowerCase();
  const name = (input.name || '').toLowerCase();
  const placeholder = (input.placeholder || '').toLowerCase();
  const classNames = (input.className || '').toLowerCase();
  
  // Patrones comunes para campos de usuario
  const patronesAltaPrioridad = ['username', 'userid', 'email', 'correo'];
  const patronesMediaPrioridad = ['user', 'login', 'account', 'mail'];
  const patronesBajaPrioridad = ['name', 'nombre', 'identifier'];
  
  // Verificar patrones de alta prioridad
  for (const patron of patronesAltaPrioridad) {
    if (id === patron || name === patron) score += 15;
    if (id.includes(patron) || name.includes(patron)) score += 10;
    if (placeholder.includes(patron)) score += 8;
    if (classNames.includes(patron)) score += 5;
  }
  
  // Verificar patrones de media prioridad
  for (const patron of patronesMediaPrioridad) {
    if (id === patron || name === patron) score += 10;
    if (id.includes(patron) || name.includes(patron)) score += 8;
    if (placeholder.includes(patron)) score += 6;
    if (classNames.includes(patron)) score += 4;
  }
  
  // Verificar patrones de baja prioridad
  for (const patron of patronesBajaPrioridad) {
    if (id === patron || name === patron) score += 5;
    if (id.includes(patron) || name.includes(patron)) score += 3;
    if (placeholder.includes(patron)) score += 2;
    if (classNames.includes(patron)) score += 1;
  }
  
  // Bonus para el primer input en el formulario
  if (input.form) {
    const inputs = Array.from(input.form.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"])'));
    if (inputs.indexOf(input) === 0) score += 3;
  }
  
  return score;
}

// Al inicio del script (justo después de las variables globales)
// Activar el modo debug para ver todos los mensajes
window.passwdDebugMode = true;

// Modificar la función initContent para forzar la comprobación de si estamos en Gmail
function initContent() {
  try {
    logMessage('Inicializando content script de PASSWD...', 'info', true);
    
    // Verificar si estamos en un dominio de Google
    const esGoogle = window.location.hostname.includes('google.com') || 
                     window.location.hostname.includes('gmail.com');
    
    if (esGoogle) {
      logMessage('Sitio de Google detectado, activando modo específico para Google', 'info', true);
    }

    // Añadir estilos CSS para nuestros componentes
    addStyleSafely();
    
    // Configurar observer para detectar cambios en el DOM
    setupMutationObserver();
    
    // Notificar que estamos listos
    setTimeout(notifyReady, 500);
    
    // Intentar detectar campos de login
    setTimeout(añadirIconosACamposLogin, 1000);
    
    // Si estamos en Google, forzar la comprobación de credenciales
    if (esGoogle) {
      setTimeout(() => {
        logMessage('Forzando comprobación de credenciales en sitio Google', 'info', true);
        
        // Simular credenciales para prueba
        const testUrl = window.location.href;
        const testUser = 'usuario.prueba@gmail.com';
        
        // Forzar la activación del diálogo de guardar credenciales
        logMessage('Forzando mostrar diálogo de guardar credenciales para pruebas', 'info', true);
        
        // Sólo mostrar el diálogo si no hay uno visible ya
        if (!window.passwdDialogShowing) {
          mostrarDialogoGuardarCredenciales(testUrl, testUser, 'contraseña-prueba');
        }
      }, 3000);
    }
    
    // Iniciar detección de formularios
    detectarEnvioFormularios();
    
    // Log de inicialización completada
    logMessage('Inicialización de content script completada', 'success', true);
  } catch (e) {
    console.error('Error en inicialización de content script:', e);
  }
}

/**
 * Determina si un formulario parece ser de inicio de sesión basado en sus características
 * @param {HTMLFormElement} formulario - El formulario a analizar
 * @returns {boolean} - Verdadero si parece ser un formulario de inicio de sesión
 */
function parecerFormularioLogin(formulario) {
  if (!formulario || !(formulario instanceof HTMLFormElement)) {
    return false;
  }

  // Obtener todos los campos del formulario
  const inputs = formulario.querySelectorAll('input');
  if (inputs.length === 0) return false;

  // Contar tipos de campos relevantes
  let tienePassword = false;
  let tieneUsuario = false;
  let tieneCamposTexto = 0;
  let tieneBotonSubmit = false;
  let camposOcultos = 0;
  let camposTotales = 0;

  // Palabras clave que sugieren un campo de usuario
  const usuarioKeywords = ['user', 'email', 'mail', 'nombre', 'usuario', 'login', 'account', 'id'];
  
  // Palabras clave que sugieren un botón de login
  const loginButtonKeywords = ['login', 'iniciar', 'acceder', 'entrar', 'ingresar', 'sign in', 'acceso'];

  // Analizar cada input en el formulario
  inputs.forEach(input => {
    const type = input.type.toLowerCase();
    const name = (input.name || '').toLowerCase();
    const id = (input.id || '').toLowerCase();
    const placeholder = (input.placeholder || '').toLowerCase();
    
    camposTotales++;
    
    if (type === 'password') {
      tienePassword = true;
    } 
    else if (type === 'text' || type === 'email') {
      tieneCamposTexto++;
      
      // Verificar si parece un campo de usuario
      const atributos = [name, id, placeholder];
      for (const keyword of usuarioKeywords) {
        if (atributos.some(attr => attr.includes(keyword))) {
          tieneUsuario = true;
          break;
        }
      }
    } 
    else if (type === 'submit') {
      tieneBotonSubmit = true;
    } 
    else if (type === 'hidden') {
      camposOcultos++;
    }
  });

  // Buscar también botones que no sean inputs
  const botones = formulario.querySelectorAll('button');
  botones.forEach(boton => {
    const texto = boton.textContent.toLowerCase();
    const tipo = (boton.getAttribute('type') || '').toLowerCase();
    
    if (tipo === 'submit' || !tipo) {
      tieneBotonSubmit = true;
      
      // Si el texto del botón contiene palabras clave de login, es un indicio fuerte
      for (const keyword of loginButtonKeywords) {
        if (texto.includes(keyword)) {
          tieneBotonSubmit = true;
          break;
        }
      }
    }
  });

  // Verificar si la URL o el formulario contienen palabras clave relacionadas con login
  const formAction = (formulario.action || '').toLowerCase();
  const formId = (formulario.id || '').toLowerCase();
  const formClass = (formulario.className || '').toLowerCase();
  const currentUrl = window.location.href.toLowerCase();
  
  const loginUrlKeywords = ['login', 'signin', 'account', 'session', 'acceso', 'acceder', 'iniciar'];
  const tieneLoginEnURL = loginUrlKeywords.some(keyword => 
    currentUrl.includes(keyword) || 
    formAction.includes(keyword) || 
    formId.includes(keyword) || 
    formClass.includes(keyword)
  );

  // Heurísticas para detectar si es un formulario de login
  const esFormularioSimple = camposTotales <= 6 && camposOcultos <= 3;
  const tieneCamposMinimos = tienePassword;
  const tieneIndiciosDeLogin = tieneUsuario || tieneLoginEnURL || (tieneCamposTexto === 1 && tienePassword);
  
  // Algunas páginas no usan botones submit sino JavaScript
  const tieneFormaDeEnvio = tieneBotonSubmit || formulario.querySelector('[onclick]');
  
  // Registrar en log para depuración si cumple condiciones mínimas
  if (tienePassword) {
    logMessage('Análisis de posible formulario login: ' + 
      JSON.stringify({
        url: window.location.href,
        tienePassword,
        tieneUsuario,
        tieneCamposTexto,
        tieneBotonSubmit,
        esFormularioSimple,
        tieneIndiciosDeLogin,
        tieneLoginEnURL
      }), 'info', DEBUG_MODE);
  }
  
  // Decidir si es un formulario de login basado en las heurísticas
  return tieneCamposMinimos && tieneIndiciosDeLogin && esFormularioSimple && tieneFormaDeEnvio;
}

// Manejador para mostrar mensaje que requiere login
function mostrarMensajeLoginRequerido(mensaje = 'Es necesario iniciar sesión para acceder a tus credenciales') {
  try {
    // Eliminar cualquier mensaje previo
    const mensajeExistente = document.getElementById('passwd-login-required-message');
    if (mensajeExistente) {
      mensajeExistente.remove();
    }

    // Crear el contenedor principal
    const mensajeContainer = document.createElement('div');
    mensajeContainer.id = 'passwd-login-required-message';
    mensajeContainer.style.position = 'fixed';
    mensajeContainer.style.top = '50%';
    mensajeContainer.style.left = '50%';
    mensajeContainer.style.transform = 'translate(-50%, -50%)';
    mensajeContainer.style.backgroundColor = 'rgba(20, 20, 20, 0.95)';
    mensajeContainer.style.color = '#fff';
    mensajeContainer.style.padding = '24px';
    mensajeContainer.style.borderRadius = '12px';
    mensajeContainer.style.maxWidth = '350px';
    mensajeContainer.style.width = '90%';
    mensajeContainer.style.textAlign = 'center';
    mensajeContainer.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(128, 0, 255, 0.15)';
    mensajeContainer.style.zIndex = '999999999';
    mensajeContainer.style.fontFamily = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif';
    mensajeContainer.style.backdropFilter = 'blur(20px)';
    mensajeContainer.style.border = '1px solid rgba(128, 0, 255, 0.1)';
    mensajeContainer.style.animation = 'passwd-fade-in 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';

    // Logo y encabezado
    const header = document.createElement('div');
    header.style.marginBottom = '20px';
    header.style.display = 'flex';
    header.style.flexDirection = 'column';
    header.style.alignItems = 'center';

    // Icono SVG
    const iconSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#bb86fc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 3px rgba(187, 134, 252, 0.5)); margin-bottom: 12px;">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
      </svg>
    `;
    
    header.innerHTML = iconSvg;

    // Título
    const titulo = document.createElement('h2');
    titulo.textContent = 'PASSWD';
    titulo.style.fontSize = '24px';
    titulo.style.fontWeight = '600';
    titulo.style.marginBottom = '16px';
    titulo.style.background = 'linear-gradient(135deg, #6a11cb, #8a3bd8, #bb86fc)';
    titulo.style.webkitBackgroundClip = 'text';
    titulo.style.webkitTextFillColor = 'transparent';
    titulo.style.backgroundSize = '300% 300%';
    titulo.style.animation = 'passwd-gradient 8s ease infinite';
    header.appendChild(titulo);

    // Crear el CSS para las animaciones
    const animationStyle = document.createElement('style');
    animationStyle.textContent = `
      @keyframes passwd-fade-in {
        from { opacity: 0; transform: translate(-50%, -45%); }
        to { opacity: 1; transform: translate(-50%, -50%); }
      }
      @keyframes passwd-gradient {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      @keyframes passwd-pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); }
      }
    `;
    mensajeContainer.appendChild(animationStyle);

    // Mensaje
    const mensajeTexto = document.createElement('p');
    mensajeTexto.textContent = mensaje;
    mensajeTexto.style.fontSize = '14px';
    mensajeTexto.style.marginBottom = '20px';
    mensajeTexto.style.lineHeight = '1.5';
    mensajeTexto.style.color = 'rgba(255, 255, 255, 0.8)';

    // Botón de inicio de sesión
    const botonLogin = document.createElement('button');
    botonLogin.textContent = 'Iniciar sesión';
    botonLogin.style.background = 'linear-gradient(135deg, #6a11cb, #8a3bd8)';
    botonLogin.style.color = 'white';
    botonLogin.style.border = 'none';
    botonLogin.style.padding = '12px 24px';
    botonLogin.style.borderRadius = '8px';
    botonLogin.style.cursor = 'pointer';
    botonLogin.style.fontWeight = '600';
    botonLogin.style.fontSize = '14px';
    botonLogin.style.transition = 'all 0.3s ease';
    botonLogin.style.boxShadow = '0 4px 15px rgba(128, 0, 255, 0.3)';
    botonLogin.style.display = 'inline-block';
    botonLogin.style.marginTop = '10px';
    botonLogin.style.position = 'relative';
    botonLogin.style.overflow = 'hidden';
    
    // Hover y active para el botón
    botonLogin.onmouseover = function() {
      this.style.background = 'linear-gradient(135deg, #7b21dc, #9b4ce9)';
      this.style.transform = 'translateY(-2px)';
      this.style.boxShadow = '0 6px 20px rgba(128, 0, 255, 0.4)';
    };
    
    botonLogin.onmouseout = function() {
      this.style.background = 'linear-gradient(135deg, #6a11cb, #8a3bd8)';
      this.style.transform = 'translateY(0)';
      this.style.boxShadow = '0 4px 15px rgba(128, 0, 255, 0.3)';
    };
    
    botonLogin.onmousedown = function() {
      this.style.transform = 'translateY(1px)';
      this.style.boxShadow = '0 2px 8px rgba(128, 0, 255, 0.2)';
    };

    // Evento para el botón
    botonLogin.addEventListener('click', function() {
      mensajeContainer.style.opacity = '0';
      mensajeContainer.style.transform = 'translate(-50%, -45%)';
      mensajeContainer.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      
      setTimeout(() => {
        // Intenta abrir la página de login de la extensión
        chrome.runtime.sendMessage({ action: 'open_login_page' });
        mensajeContainer.remove();
      }, 300);
    });

    // Botón para cerrar
    const closeButton = document.createElement('div');
    closeButton.innerHTML = '&times;';
    closeButton.style.position = 'absolute';
    closeButton.style.top = '10px';
    closeButton.style.right = '12px';
    closeButton.style.fontSize = '20px';
    closeButton.style.color = 'rgba(255, 255, 255, 0.5)';
    closeButton.style.cursor = 'pointer';
    closeButton.style.transition = 'color 0.3s ease';
    
    closeButton.onmouseover = function() {
      this.style.color = 'rgba(255, 255, 255, 0.8)';
    };
    
    closeButton.onmouseout = function() {
      this.style.color = 'rgba(255, 255, 255, 0.5)';
    };
    
    closeButton.addEventListener('click', function() {
      mensajeContainer.style.opacity = '0';
      mensajeContainer.style.transform = 'translate(-50%, -45%)';
      mensajeContainer.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      
      setTimeout(() => {
        mensajeContainer.remove();
      }, 300);
    });

    // Ensamblar todo
    mensajeContainer.appendChild(header);
    mensajeContainer.appendChild(mensajeTexto);
    mensajeContainer.appendChild(botonLogin);
    mensajeContainer.appendChild(closeButton);
    document.body.appendChild(mensajeContainer);
    
    // Añadir evento para cerrar al hacer clic fuera
    document.addEventListener('click', function clickOutside(e) {
      if (!mensajeContainer.contains(e.target)) {
        mensajeContainer.style.opacity = '0';
        mensajeContainer.style.transform = 'translate(-50%, -45%)';
        mensajeContainer.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        
        setTimeout(() => {
          mensajeContainer.remove();
          document.removeEventListener('click', clickOutside);
        }, 300);
      }
    });
    
    // Mantener visible por un tiempo mínimo antes de permitir cerrar haciendo clic fuera
    setTimeout(() => {
      // Ya se puede cerrar al hacer clic fuera
    }, 1000);
    
  } catch (error) {
    console.error('Error al mostrar mensaje de login requerido:', error);
  }
}

// Configurar listener para mensajes del background
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  // Log para debugging
  logMessage('Mensaje recibido en content script: ' + message.accion || message.action);
  
  try {
    // Normalizar el nombre de la acción (para compatibilidad)
    const accion = message.accion || message.action;
    
    switch (accion) {
      case 'rellenar':
        // Rellenar formulario con los datos recibidos
        rellenarFormulario(message.datos);
        sendResponse({success: true});
        break;
        
      case 'check_ready':
        // Verificar si el content script está listo
        sendResponse({ready: true});
        break;
        
      case 'get_available_credentials':
        // Obtener credenciales disponibles en el content script
        logMessage('Enviando credenciales disponibles al popup');
        sendResponse({credenciales: credencialesDisponibles || []});
        break;
        
      case 'set_credentials':
        // Recibir credenciales desde el popup o background
        if (message.credenciales && message.credenciales.length > 0) {
          logMessage(`Recibidas ${message.credenciales.length} credenciales desde el popup/background`);
          credencialesDisponibles = message.credenciales;
          sendResponse({success: true});
        } else {
          logMessage('No se recibieron credenciales válidas');
          sendResponse({success: false, error: 'No hay credenciales válidas'});
        }
        break;
        
      case 'mostrar_login_error':
        // Mostrar mensaje de error de autenticación
        mostrarNotificacion(false, message.error || 'Error de autenticación');
        sendResponse({success: true});
        break;
        
      case 'mostrar_login_requerido':
        // Mostrar mensaje que requiere login
        mostrarMensajeLoginRequerido(message.mensaje);
        sendResponse({success: true});
        break;
        
      default:
        logMessage(`Acción desconocida: ${accion}`);
        sendResponse({success: false, error: 'Acción no reconocida'});
    }
  } catch (e) {
    console.error('Error procesando mensaje en content script:', e);
    sendResponse({success: false, error: e.message});
  }
  
  return true; // Importante para permitir respuestas asíncronas
});

// También recibimos credenciales desde el background script
chrome.runtime.onMessage.addListener((message) => {
  if (message && message.action === 'credentials_update') {
    if (message.credentials && Array.isArray(message.credentials)) {
      credencialesDisponibles = message.credentials;
      logMessage(`DEBUG: Credenciales actualizadas desde background: ${credencialesDisponibles.length} disponibles`, 'info', true);
    }
  }
});