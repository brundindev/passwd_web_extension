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
        .passwd-dropdown {
          position: absolute;
          width: 350px;
          max-height: 400px;
          overflow-y: auto;
          background-color: #212121;
          border: 1px solid #444;
          border-radius: 8px;
          box-shadow: 0 8px 25px rgba(0,0,0,0.6);
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
          color: #fff;
          animation: passwd-fade-in 0.3s ease-out;
          padding-bottom: 8px;
        }
        
        @keyframes passwd-fade-in {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      
        .passwd-dropdown::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        
        .passwd-dropdown::-webkit-scrollbar-track {
          background: #333;
          border-radius: 8px;
        }
        
        .passwd-dropdown::-webkit-scrollbar-thumb {
          background-color: #555;
          border-radius: 8px;
        }
        
        .passwd-dropdown-header {
          display: flex;
          align-items: center;
          padding: 16px;
          background-color: #333;
          border-bottom: 1px solid #444;
          border-radius: 8px 8px 0 0;
          margin-bottom: 8px;
        }
        
        .passwd-dropdown-header svg {
          margin-right: 10px;
          border-radius: 50%;
          background-color: #4285F4;
          padding: 3px;
          min-width: 18px;
        }
        
        .passwd-dropdown-header span {
          font-weight: 600;
          color: #fff;
          font-size: 14px;
          letter-spacing: 0.5px;
        }
        
        .passwd-dropdown-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          margin: 0 8px 8px 8px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
          background-color: #333;
          border: 1px solid #444;
        }
        
        .passwd-dropdown-item:hover {
          background-color: #3a3a3a;
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        }
        
        .passwd-dropdown-item-info {
          flex-grow: 1;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .passwd-dropdown-item-username {
          font-weight: 500;
          font-size: 14px;
          color: #fff;
          margin-bottom: 3px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .passwd-dropdown-item-site {
          font-size: 12px;
          color: #aaa;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .passwd-dropdown-item .use-button {
          background-color: #4285F4;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-left: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .passwd-dropdown-item .use-button:hover {
          background-color: #5294FF;
          transform: scale(1.05);
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        
        .passwd-error-message {
          display: flex;
          align-items: center;
          padding: 16px;
          color: #e86363;
          font-size: 14px;
          text-align: center;
          margin: 0 8px 8px 8px;
          background-color: #3e0d0d;
          border-radius: 6px;
          border: 1px solid #6b1010;
        }
        
        .passwd-error-message svg {
          margin-right: 10px;
          min-width: 20px;
          flex-shrink: 0;
        }
        
        .passwd-error-message span {
          flex: 1;
        }
        
        .passwd-logo-hint {
          position: fixed !important;
          width: 24px !important;
          height: 24px !important;
          background-color: #212121 !important;
          border-radius: 50% !important;
          cursor: pointer !important;
          z-index: 999998 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          font-weight: bold !important;
          color: #fff !important;
          border: 1px solid #444 !important;
          font-size: 13px !important;
          transition: all 0.2s ease !important;
          box-shadow: 0 2px 5px rgba(0,0,0,0.3) !important;
        }
        
        .passwd-logo-hint:hover {
          background-color: #4285F4 !important;
          transform: scale(1.1) !important;
          box-shadow: 0 3px 8px rgba(0,0,0,0.4) !important;
        }`;

      // Intentar añadir al head si está disponible
      if (document.head) {
        document.head.appendChild(style);
        estilosAñadidos = true;
        logMessage('Estilos añadidos correctamente al head');
      }
      // Si no hay head, intentar añadir al documentElement
      else if (document.documentElement) {
        document.documentElement.appendChild(style);
        estilosAñadidos = true;
        logMessage('Estilos añadidos correctamente al documentElement');
      }
      // Si aún no se puede, reintentar
      else if (intento < maxIntentos) {
        logMessage(`No se pudo añadir estilos, reintentando (intento ${intento + 1}/${maxIntentos})...`);
        setTimeout(() => intentarAñadirEstilos(intento + 1), 500);
      } else {
        logMessage('No se pudieron añadir los estilos después de múltiples intentos', 'error');
      }
    } catch (e) {
      logMessage(`Error al añadir estilos: ${e}`, 'error');
      if (intento < maxIntentos) {
        setTimeout(() => intentarAñadirEstilos(intento + 1), 500);
      }
    }
  };

  // Iniciar el proceso de añadir estilos
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

// Función para mostrar el desplegable de credenciales con mejor diseño
function mostrarDesplegableCredenciales(credenciales, inputElement, mensajeError = null) {
  try {
    // Verificar que tenemos credenciales válidas o un mensaje de error
    if (!mensajeError && (!credenciales || !Array.isArray(credenciales) || credenciales.length === 0)) {
      mensajeError = 'No se encontraron credenciales para este sitio';
    }
    
    logMessage(`Mostrando desplegable${mensajeError ? ' con error' : ` con ${credenciales.length} credenciales`}`);
    
    // Si ya hay un desplegable, eliminarlo primero
    try {
      const desplegableExistente = document.querySelector('.passwd-dropdown');
      if (desplegableExistente) {
        desplegableExistente.remove();
        desplegableVisible = false;
      }
    } catch (e) {
      logMessage(`Error al eliminar desplegable existente: ${e}`, 'warn');
    }
    
    try {
      // Crear el desplegable
      const desplegable = document.createElement('div');
      desplegable.className = 'passwd-dropdown';
      
      // Añadir encabezado
      const header = document.createElement('div');
      header.className = 'passwd-dropdown-header';
      
      // Logo como SVG embebido para evitar problemas de carga
      header.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2">
          <rect width="20" height="14" x="2" y="5" rx="2" />
          <path d="M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
          <path d="M12 12v3" />
        </svg>
        <span>PASSWD${!mensajeError ? `: ${credenciales.length} credenciales encontradas` : ''}</span>
      `;
      
      desplegable.appendChild(header);
      
      // Si hay un mensaje de error, mostrarlo
      if (mensajeError) {
        const errorContainer = document.createElement('div');
        errorContainer.className = 'passwd-error-message';
        errorContainer.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e86363" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>${mensajeError}</span>
        `;
        desplegable.appendChild(errorContainer);
      } else {
        // Añadir cada credencial
        credenciales.forEach(credencial => {
          try {
            const item = document.createElement('div');
            item.className = 'passwd-dropdown-item';
            
            const info = document.createElement('div');
            info.className = 'passwd-dropdown-item-info';
            
            const username = document.createElement('div');
            username.className = 'passwd-dropdown-item-username';
            username.textContent = credencial.usuario || 'Sin usuario';
            
            const site = document.createElement('div');
            site.className = 'passwd-dropdown-item-site';
            site.textContent = credencial.sitio || 'Sin sitio';
            
            info.appendChild(username);
            info.appendChild(site);
            
            const useButton = document.createElement('button');
            useButton.className = 'use-button';
            useButton.textContent = 'Usar';
            
            // Función para rellenar y notificar
            function rellenarYNotificar(credencial) {
              try {
                // Rellenar el formulario
                const resultado = rellenarFormulario(credencial);
                
                // Eliminar el desplegable
                desplegable.remove();
                desplegableVisible = false;
                
                // Notificar al popup sobre el resultado
                try {
                  sendMessageSafely({
                    action: 'form_filled',
                    success: resultado
                  }).catch(e => logMessage(`Error al enviar notificación de relleno: ${e}`, 'warn'));
                } catch (e) {
                  logMessage(`Error al notificar relleno de formulario: ${e}`, 'error');
                }
              } catch (e) {
                logMessage(`Error al rellenar formulario: ${e}`, 'error');
              }
            }
            
            // Agregar eventos
            useButton.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              rellenarYNotificar(credencial);
            });
            
            item.addEventListener('click', (e) => {
              if (e.target !== useButton) {
                e.preventDefault();
                e.stopPropagation();
                rellenarYNotificar(credencial);
              }
            });
            
            item.appendChild(info);
            item.appendChild(useButton);
            desplegable.appendChild(item);
          } catch (e) {
            logMessage(`Error al crear ítem de credencial: ${e}`, 'error');
          }
        });
      }
      
      try {
        // Asegurarnos de que se han añadido los estilos
        addStyleSafely();
        
        // Añadir el desplegable al body
        if (document.body) {
          document.body.appendChild(desplegable);
          desplegableVisible = true;
          
          // Posicionar el desplegable junto al campo de entrada
          const inputRect = inputElement.getBoundingClientRect();
          desplegable.style.top = (inputRect.top + window.scrollY + inputRect.height + 5) + 'px';
          desplegable.style.left = (inputRect.left + window.scrollX) + 'px';
          
          // Asegurar que el desplegable sea visible en la ventana
          setTimeout(() => {
            const desplegableRect = desplegable.getBoundingClientRect();
            
            // Ajustar posición horizontal si se sale por la derecha
            if (desplegableRect.right > window.innerWidth) {
              const ajusteX = desplegableRect.right - window.innerWidth + 10;
              desplegable.style.left = (parseInt(desplegable.style.left) - ajusteX) + 'px';
            }
            
            // Ajustar posición vertical si se sale por abajo
            if (desplegableRect.bottom > window.innerHeight) {
              desplegable.style.top = (inputRect.top + window.scrollY - desplegableRect.height - 5) + 'px';
            }
          }, 0);
          
          // Cerrar el desplegable al hacer clic fuera
          document.addEventListener('click', function cerrarDesplegable(e) {
            if (!desplegable.contains(e.target) && e.target !== inputElement) {
              try {
                desplegable.remove();
              } catch (e) {
                logMessage(`Error al intentar eliminar el desplegable: ${e}`, 'warn');
              }
              document.removeEventListener('click', cerrarDesplegable);
              desplegableVisible = false;
            }
          });
        } else {
          logMessage('No se puede añadir el desplegable: document.body no disponible', 'error');
        }
      } catch (error) {
        logMessage(`Error al posicionar el desplegable: ${error}`, 'error');
      }
    } catch (error) {
      logMessage(`Error al mostrar el desplegable de credenciales: ${error}`, 'error');
      desplegableVisible = false;
    }
  } catch (e) {
    logMessage(`Error grave al mostrar desplegable: ${e}`, 'error');
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
            const newTop = rect.top + window.scrollY + (rect.height / 2) - 11;
            const newLeft = rect.right + window.scrollX - 28;
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
        
        // Crear icono
        const icono = document.createElement('div');
        icono.className = 'passwd-logo-hint';
        icono.textContent = 'P';
        icono.title = 'PASSWD - Haz clic para ver credenciales guardadas';
        icono.setAttribute('data-campo-id', fieldId);
        
        // Calcular posición inicial
        const top = rect.top + window.scrollY + (rect.height / 2) - 11;
        const left = rect.right + window.scrollX - 28;
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
          const newTop = newRect.top + window.scrollY + (newRect.height / 2) - 11;
          const newLeft = newRect.right + window.scrollX - 28;
          icono.style.top = newTop + 'px';
          icono.style.left = newLeft + 'px';
        };
        
        // Configurar evento de clic
        icono.addEventListener('click', (e) => {
          try {
            e.stopPropagation();
            e.preventDefault();
            
            console.log(`Clic en icono para campo ${fieldId}`);
            
            // Si hay un desplegable visible, eliminarlo
            if (desplegableVisible) {
              const desplegableExistente = document.querySelector('.passwd-dropdown');
              if (desplegableExistente) desplegableExistente.remove();
              desplegableVisible = false;
              return;
            }
            
            // Ver si tenemos credenciales disponibles
            if (credencialesDisponibles && credencialesDisponibles.length > 0) {
              console.log(`Mostrando ${credencialesDisponibles.length} credenciales disponibles`);
              mostrarDesplegableCredenciales(credencialesDisponibles, campo);
            } else {
              console.log('Solicitando credenciales al background script...');
              // Mostrar un desplegable con mensaje de carga
              mostrarDesplegableCredenciales([], campo, 'Buscando credenciales...');
              
              // Solicitar credenciales para este sitio
              sendMessageSafely({
                action: 'get_credentials_for_site',
                url: window.location.href
              })
              .then(response => {
                console.log('Respuesta de get_credentials_for_site:', response);
                if (response && response.credenciales && response.credenciales.length > 0) {
                  credencialesDisponibles = response.credenciales;
                  mostrarDesplegableCredenciales(credencialesDisponibles, campo);
                } else {
                  console.log('No se recibieron credenciales válidas');
                  // Mostrar mensaje de error en el desplegable
                  mostrarDesplegableCredenciales([], campo, 'No se encontraron credenciales para este sitio');
                }
              })
              .catch(error => {
                console.error('Error al solicitar credenciales:', error);
                // Mostrar error en el desplegable
                mostrarDesplegableCredenciales([], campo, 'Error al obtener credenciales: ' + (error.message || 'Desconocido'));
              });
            }
          } catch (e) {
            console.error('Error al manejar clic en icono:', e);
            mostrarDesplegableCredenciales([], campo, 'Error al procesar la acción: ' + (e.message || 'Desconocido'));
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
    
    // Eliminar protocolo
    let domain = dominio.replace(/^(https?:\/\/)?(www\.)?/i, '');
    
    // Eliminar ruta y parámetros
    domain = domain.split('/')[0];
    
    // Dividir por puntos
    const parts = domain.split('.');
    
    // Dominios de segundo nivel específicos
    const secondLevelDomains = ['co.uk', 'com.br', 'com.mx', 'com.ar', 'com.co'];
    
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
    
    // Caso especial para Google
    const isGoogle = baseDomain.includes('google') || dominio.includes('google');
    
    return credenciales.filter(cred => {
      if (!cred.sitio) return false;
      
      const credDomain = getBaseDomain(cred.sitio);
      
      // Para Google, ser más permisivo
      if (isGoogle && (credDomain.includes('google') || cred.sitio.includes('google'))) {
        console.log(`Coincidencia Google: ${cred.usuario} para ${cred.sitio}`);
        return true;
      }
      
      // Coincidencia normal por dominio base
      const match = credDomain === baseDomain;
      
      if (match) {
        console.log(`Credencial coincidente: ${cred.usuario} para ${cred.sitio} (${credDomain})`);
      }
      
      return match;
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
  console.log('Solicitando credenciales proactivamente...');
  
  sendMessageSafely({
    action: 'get_credentials_for_site',
    url: window.location.href
  })
  .then(response => {
    waitingForCredentials = false;
    if (response && response.credenciales && response.credenciales.length > 0) {
      console.log(`Recibidas ${response.credenciales.length} credenciales proactivamente`);
      credencialesDisponibles = response.credenciales;
      // Log para debug
      logCredencialesDisponibles();
      // Forzar actualización de iconos
      añadirIconosACamposLogin();
    } else {
      console.log('No se recibieron credenciales en la solicitud proactiva');
    }
  })
  .catch(e => {
    waitingForCredentials = false;
    console.warn('Error al solicitar credenciales proactivamente:', e);
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
function mostrarDialogoGuardarCredenciales(sitio, usuario, password) {
  try {
    logMessage(`!!!FUNCIÓN CRÍTICA!!! Iniciando mostrarDialogoGuardarCredenciales para: ${sitio}, usuario: ${usuario.substring(0, 2)}***`, 'info', true);
    
    // Verificar permisos de notificaciones
    if (chrome.notifications) {
      logMessage('API chrome.notifications está disponible', 'info', true);
    } else {
      logMessage('API chrome.notifications NO está disponible', 'error', true);
    }
    
    // Verificar si runtime está disponible
    if (chrome.runtime && chrome.runtime.id) {
      logMessage(`Runtime disponible con ID: ${chrome.runtime.id}`, 'info', true);
    } else {
      logMessage('Runtime no disponible o sin ID - podría haber problemas de comunicación', 'error', true);
    }
    
    // Verificar que document.body existe
    if (!document.body) {
      logMessage('Error: document.body no está disponible, no se puede mostrar el diálogo', 'error', true);
      
      // Programar un reintento
      setTimeout(() => {
        logMessage('Reintentando mostrar diálogo después de esperar document.body', 'info', true);
        if (document.body) {
          mostrarDialogoGuardarCredenciales(sitio, usuario, password);
        } else {
          logMessage('document.body sigue sin estar disponible, usando método alternativo', 'warn', true);
          // Intentar con notificación del sistema directamente
          mostrarNotificacionSistema();
        }
      }, 1000);
      return;
    }
    
    // Evitar mostrar múltiples diálogos
    if (window.passwdDialogShowing) {
      logMessage('Ya se está mostrando un diálogo de guardar credenciales', 'info', true);
      return;
    }
    
    // Marcar que estamos mostrando un diálogo
    window.passwdDialogShowing = true;
  
    logMessage(`Mostrando diálogo para guardar credenciales: ${sitio} / ${usuario}`, 'info', true);
    
    // Verificar que tenemos todos los datos necesarios
    if (!sitio || !usuario || !password) {
      logMessage('Error: Faltan datos para mostrar el diálogo de guardado', 'error', true);
      console.error('PASSWD: Datos incompletos:', { sitio, usuario: usuario ? 'presente' : 'ausente', password: password ? 'presente' : 'ausente' });
      window.passwdDialogShowing = false;
      return;
    }

    // Variable para rastrear si se mostró algún diálogo
    let dialogoMostrado = false;
    
    // Timer para forzar un método alternativo si nada funciona en 3 segundos
    const timerSeguridad = setTimeout(() => {
      if (!dialogoMostrado) {
        logMessage('TIMER DE SEGURIDAD ACTIVADO: Forzando diálogo tradicional después de 3s sin respuesta', 'error', true);
        mostrarDialogoTradicional();
      }
    }, 3000);
    
    // Función para mostrar notificación del sistema
    function mostrarNotificacionSistema(intentos = 0) {
      try {
        logMessage(`Intentando mostrar notificación del sistema (intento ${intentos + 1})`, 'info', true);
        
        // Agregar diagnóstico de runtime
        if (!chrome.runtime) {
          logMessage('Error crítico: chrome.runtime no está disponible', 'error', true);
          if (intentos < 2) {
            logMessage(`Reintentando en 1s (intento ${intentos + 1})`, 'warn', true);
            setTimeout(() => mostrarNotificacionSistema(intentos + 1), 1000);
          } else {
            logMessage('Agotados intentos de notificación, usando método tradicional', 'error', true);
            mostrarDialogoTradicional();
          }
          return;
        }
        
        if (!chrome.runtime.id) {
          logMessage('Error: chrome.runtime.id no disponible (contexto inválido)', 'error', true);
          if (intentos < 2) {
            setTimeout(() => {
              checkExtensionConnection();
              mostrarNotificacionSistema(intentos + 1);
            }, 1000);
          } else {
            logMessage('Agotados intentos de reconexión, usando método tradicional', 'error', true);
            mostrarDialogoTradicional();
          }
          return;
        }
        
        // Preparar mensaje con datos más claros
        const mensajeCredenciales = {
          action: 'show_save_notification',
          data: {
            sitio: sitio,
            usuario: usuario
          },
          source: 'content_script',
          timestamp: Date.now(),
          tabUrl: window.location.href
        };
        
        logMessage(`Enviando mensaje a background: ${JSON.stringify(mensajeCredenciales)}`, 'info', true);
        
        chrome.runtime.sendMessage(mensajeCredenciales, function(response) {
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message;
            logMessage(`Error al mostrar notificación del sistema: ${errorMsg}`, 'error', true);
            
            // Verificar si es un error de conexión
            if (errorMsg.includes('Extension context invalidated') || 
                errorMsg.includes('disconnected port')) {
              logMessage('Error de contexto de extensión, intentando reconectar...', 'warn', true);
              setTimeout(() => {
                checkExtensionConnection();
                // Si la reconexión fue exitosa, reintentar
                if (extensionContextValid) {
                  setTimeout(() => mostrarNotificacionSistema(intentos + 1), 500);
                } else {
                  mostrarDialogoTradicional();
                }
              }, 500);
              return;
            }
            
            // Llegados a este punto, hacemos doble intento
            if (intentos < 2) {
              logMessage(`Reintentando mostrar notificación (intento ${intentos + 2})`, 'warn', true);
              setTimeout(() => mostrarNotificacionSistema(intentos + 1), 1000);
              return;
            }
            
            // Si seguimos fallando, método tradicional
            logMessage('No se pudo mostrar notificación después de varios intentos, usando método tradicional', 'error', true);
            mostrarDialogoTradicional();
            return;
          }
          
          logMessage(`Respuesta de show_save_notification: ${JSON.stringify(response)}`, 'info', true);
          
          if (response && response.success) {
            logMessage('Notificación del sistema mostrada correctamente', 'success', true);
            // Marcar que se mostró un diálogo
            dialogoMostrado = true;
            clearTimeout(timerSeguridad);
            
            // También preparar las credenciales para cuando el usuario interactúe con la notificación
            const prepareData = {
              action: 'prepare_credentials',
              credencial: {
                sitio: sitio,
                usuario: usuario,
                contraseña: password
              },
              source: 'content_script',
              timestamp: Date.now(),
              notificationId: response.notificationId
            };
            
            logMessage(`Preparando credenciales para guardar: ${JSON.stringify(prepareData)}`, 'info', true);
            
            chrome.runtime.sendMessage(prepareData, function(prepareResponse) {
              logMessage(`Respuesta de prepare_credentials: ${JSON.stringify(prepareResponse)}`, 'info', true);
              
              if (chrome.runtime.lastError) {
                logMessage(`Error al preparar credenciales: ${chrome.runtime.lastError.message}`, 'error', true);
              } else if (prepareResponse && prepareResponse.success) {
                logMessage('Credenciales preparadas correctamente con ID: ' + prepareResponse.id, 'success', true);
              }
            });
            window.passwdDialogShowing = false;
          } else {
            if (intentos < 2) {
              logMessage(`Notificación falló, reintentando (intento ${intentos + 2})`, 'warn', true);
              setTimeout(() => mostrarNotificacionSistema(intentos + 1), 1000);
            } else {
              logMessage('No se pudo mostrar notificación después de varios intentos, usando método tradicional', 'error', true);
              mostrarDialogoTradicional();
            }
          }
        });
      } catch (notifError) {
        logMessage(`Error al intentar mostrar notificación del sistema: ${notifError.message}`, 'error', true);
        console.error('PASSWD: Detalles de error en notificación:', notifError);
        
        // Reintento limitado para errores críticos
        if (intentos < 2) {
          setTimeout(() => mostrarNotificacionSistema(intentos + 1), 1000);
        } else {
          // Continue con el método tradicional después de agotar intentos
          mostrarDialogoTradicional();
        }
      }
    }
    
    // Función para mostrar el diálogo tradicional en DOM
    function mostrarDialogoTradicional() {
      try {
        // Si ya se mostró un diálogo, no mostrar otro
        if (dialogoMostrado) {
          logMessage('Ya se mostró un diálogo, no mostrando el tradicional', 'info', true);
          return;
        }
        
        // Marcar que se mostró un diálogo
        dialogoMostrado = true;
        clearTimeout(timerSeguridad);
        
        logMessage('CREANDO DIÁLOGO TRADICIONAL URGENTE EN DOM', 'info', true);
        
        // Crear contenedor principal
        const dialogContainer = document.createElement('div');
        dialogContainer.id = 'passwd-save-dialog';
        
        // Estilo base del diálogo para asegurar que sea visible
        Object.assign(dialogContainer.style, {
          position: 'fixed',
          top: '20px',
          right: '20px',
          width: '320px',
          maxWidth: '90%',
          backgroundColor: '#fff',
          border: '1px solid #ccc',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
          zIndex: '2147483647',
          padding: '15px',
          fontFamily: 'Arial, sans-serif',
          fontSize: '14px',
          color: '#333',
          display: 'flex',
          flexDirection: 'column',
          animation: 'passwd-fade-in 0.3s'
        });
        
        // Estilo de animación
        const styleElement = document.createElement('style');
        styleElement.textContent = `
          @keyframes passwd-fade-in {
            from { opacity: 0; transform: translateY(-20px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `;
        document.head.appendChild(styleElement);
        
        // Crear el contenido del diálogo
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.marginBottom = '10px';
        
        const title = document.createElement('h3');
        title.textContent = 'PASSWD - Guardar Credenciales';
        title.style.margin = '0';
        title.style.fontSize = '16px';
        title.style.fontWeight = 'bold';
        
        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.style.background = 'none';
        closeButton.style.border = 'none';
        closeButton.style.fontSize = '20px';
        closeButton.style.cursor = 'pointer';
        closeButton.style.padding = '0 5px';
        closeButton.style.marginLeft = '10px';
        
        header.appendChild(title);
        header.appendChild(closeButton);
        
        const content = document.createElement('div');
        content.style.marginBottom = '15px';
        
        // Simplificar la URL para mostrar
        let displayUrl = sitio;
        try {
          const urlObj = new URL(sitio);
          displayUrl = urlObj.hostname;
        } catch (e) {
          // Mantener la URL original si hay error
          console.log('Error al procesar URL:', e);
        }
        
        // Truncar URL si es muy larga
        if (displayUrl.length > 30) {
          displayUrl = displayUrl.substring(0, 27) + '...';
        }
        
        // Aplicar estilo de texto usuario
        let displayUser = usuario;
        if (displayUser.length > 25) {
          displayUser = displayUser.substring(0, 22) + '...';
        }
        
        const message = document.createElement('p');
        message.innerHTML = `¿Deseas guardar la contraseña para <strong>${displayUser}</strong> en <strong>${displayUrl}</strong>?`;
        message.style.margin = '0 0 10px 0';
        
        content.appendChild(message);
        
        const buttons = document.createElement('div');
        buttons.style.display = 'flex';
        buttons.style.justifyContent = 'flex-end';
        
        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancelar';
        cancelButton.style.marginRight = '10px';
        cancelButton.style.padding = '8px 12px';
        cancelButton.style.border = '1px solid #ccc';
        cancelButton.style.borderRadius = '4px';
        cancelButton.style.background = '#f5f5f5';
        cancelButton.style.cursor = 'pointer';
        
        const saveButton = document.createElement('button');
        saveButton.textContent = 'Guardar';
        saveButton.style.padding = '8px 12px';
        saveButton.style.border = '1px solid #4285f4';
        saveButton.style.borderRadius = '4px';
        saveButton.style.background = '#4285f4';
        saveButton.style.color = '#fff';
        saveButton.style.cursor = 'pointer';
        
        buttons.appendChild(cancelButton);
        buttons.appendChild(saveButton);
        
        // Construir el diálogo
        dialogContainer.appendChild(header);
        dialogContainer.appendChild(content);
        dialogContainer.appendChild(buttons);
        
        // Función para cerrar el diálogo
        function cerrarDialogo() {
          try {
            // Si el diálogo ya se cerró o no existe, no hacer nada
            if (!dialogContainer || !dialogContainer.parentNode) {
              return;
            }
            
            // Animación de cierre
            dialogContainer.style.animation = 'passwd-fade-out 0.2s';
            
            setTimeout(() => {
              try {
                if (dialogContainer.parentNode) {
                  dialogContainer.parentNode.removeChild(dialogContainer);
                }
                window.passwdDialogShowing = false;
              } catch (e) {
                console.error('Error al remover diálogo:', e);
              }
            }, 200);
          } catch (e) {
            logMessage(`Error al cerrar diálogo: ${e.message}`, 'error', true);
            // Eliminar el diálogo directamente en caso de error
            try {
              if (dialogContainer.parentNode) {
                dialogContainer.parentNode.removeChild(dialogContainer);
              }
            } catch (e2) {}
            window.passwdDialogShowing = false;
          }
        }
        
        // Función para guardar credenciales
        function guardarCredencialesClick() {
          logMessage('Usuario hizo clic en guardar credenciales', 'info', true);
          cerrarDialogo();
          guardarCredenciales(sitio, usuario, password);
        }
        
        // Agregar listeners a los botones
        saveButton.addEventListener('click', guardarCredencialesClick);
        cancelButton.addEventListener('click', cerrarDialogo);
        closeButton.addEventListener('click', cerrarDialogo);
        
        // Estilo de animación para cerrar (añadir a la hoja de estilos)
        styleElement.textContent += `
          @keyframes passwd-fade-out {
            from { opacity: 1; transform: translateY(0); }
            to { opacity: 0; transform: translateY(-20px); }
          }
        `;
        
        // Agregar el diálogo al DOM
        document.body.appendChild(dialogContainer);
        
        logMessage('Diálogo tradicional mostrado correctamente', 'success', true);
      } catch (dialogError) {
        logMessage(`Error crítico al mostrar diálogo tradicional: ${dialogError.message}`, 'error', true);
        console.error('PASSWD: Error al crear diálogo DOM:', dialogError);
        
        // Intento final: mostrar un diálogo de alerta nativo
        try {
          if (confirm(`PASSWD: ¿Deseas guardar tus credenciales para ${usuario}?`)) {
            guardarCredenciales(sitio, usuario, password);
          }
        } catch (alertError) {
          logMessage(`Error final al mostrar alerta: ${alertError.message}`, 'error', true);
          console.error('PASSWD: No se pudo mostrar ningún tipo de diálogo');
        }
        
        window.passwdDialogShowing = false;
      }
    }
    
    // Intentar mostrar la notificación del sistema primero
    logMessage('Llamando a mostrarNotificacionSistema como primera opción', 'info', true);
    mostrarNotificacionSistema();
    
    // Si llegamos aquí, estamos esperando respuesta de la notificación
    logMessage('Esperando respuesta de la notificación del sistema o timeout de seguridad (3s)', 'info', true);
  } catch (e) {
    logMessage(`Error general en mostrarDialogoGuardarCredenciales: ${e.message}`, 'error', true);
    console.error('PASSWD: Error general al mostrar diálogo:', e);
    window.passwdDialogShowing = false;
  }
}

// Función para enviar las credenciales al background script
function guardarCredenciales(sitio, usuario, password) {
  try {
    logMessage(`Iniciando guardado de credenciales para: ${sitio}`, 'info', true);
    
    // Verificar datos obligatorios
    if (!sitio || !usuario || !password) {
      logMessage('Error: Faltan datos obligatorios para guardar credenciales', 'error', true);
      mostrarNotificacion(false, 'Faltan datos obligatorios');
      return;
    }
    
    // Crear objeto con los datos en el formato correcto para Firebase
    const credencial = {
      sitio: sitio,
      usuario: usuario,
      contraseña: password // Asegurar que la clave es "contraseña" con tilde
    };
    
    logMessage(`Enviando credenciales directamente al background: ${usuario} @ ${sitio}`, 'info', true);
    
    // Enviar mensaje al background para guardar las credenciales
    chrome.runtime.sendMessage({
      accion: 'guardar_credenciales', // Usar "accion" en lugar de "action" para mantener coherencia
      credencial: credencial
    }, function(response) {
      try {
        if (chrome.runtime.lastError) {
          logMessage(`Error de comunicación: ${chrome.runtime.lastError.message}`, 'error', true);
          mostrarNotificacion(false, 'Error de comunicación con la extensión');
          return;
        }
        
        logMessage(`Respuesta recibida: ${JSON.stringify(response)}`, 'info', true);
        
        if (response && response.success) {
          logMessage('Credenciales guardadas correctamente en Firebase', 'success', true);
          mostrarNotificacion(true, 'Contraseña guardada correctamente');
        } else {
          const errorMsg = response && response.error ? response.error : 'Error desconocido';
          
          // Formateo de mensajes de error para mejor comprensión del usuario
          let mensajeUsuario = errorMsg;
          
          if (errorMsg.includes('no autenticado') || errorMsg.includes('Usuario no autenticado')) {
            mensajeUsuario = 'Debes iniciar sesión para guardar contraseñas';
            
            // Intentar mostrar el popup de login
            setTimeout(() => {
              chrome.runtime.sendMessage({ action: 'show_login_popup' });
            }, 1000);
          } else if (errorMsg.includes('Firebase no disponible')) {
            mensajeUsuario = 'No se pudo conectar con el servidor. Verifica tu conexión a internet.';
          } else if (errorMsg.includes('permisos')) {
            mensajeUsuario = 'No tienes permisos para guardar contraseñas. Contacta al administrador.';
          }
          
          logMessage(`Error al guardar credenciales: ${errorMsg}`, 'error', true);
          mostrarNotificacion(false, mensajeUsuario);
        }
      } catch (e) {
        logMessage(`Error al procesar respuesta: ${e.message}`, 'error', true);
        mostrarNotificacion(false, 'Error al procesar la respuesta');
      }
    });
  } catch (e) {
    logMessage(`Error general al guardar credenciales: ${e.message}`, 'error', true);
    mostrarNotificacion(false, 'Error inesperado al guardar credenciales');
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