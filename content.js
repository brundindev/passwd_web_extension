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

// Función para mostrar logs solo en modo verbose o cuando son importantes
function logMessage(message, level = 'info', forceShow = false) {
  // Si estamos en modo silencioso y no es un mensaje forzado, no mostrar
  if (silentMode && !forceShow) return;
  
  // Solo mostrar mensajes de reconexión cada 10 segundos para evitar spam
  if (message.includes('reconectar') || message.includes('Runtime no disponible')) {
    const now = Date.now();
    if (now - lastReconnectMessage < 10000 && !forceShow) return;
    lastReconnectMessage = now;
  }
  
  switch (level) {
    case 'error':
      console.error(message);
      break;
    case 'warn':
      console.warn(message);
      break;
    case 'debug':
      console.debug(message);
      break;
    default:
      console.log(message);
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

// Función para detectar envíos de formularios y ofrecer guardar credenciales
function detectarEnvioFormularios() {
  logMessage('Configurando detector de envíos de formularios', 'info');
  
  // Escuchar eventos de envío de formularios
  document.addEventListener('submit', async function(event) {
    try {
      // Solo procesamos formularios que probablemente sean de login/registro
      const form = event.target;
      logMessage(`Formulario enviado: ${form.id || form.name || 'sin nombre'}`, 'debug');
      
      // Buscamos campos de contraseña en el formulario
      const passwordFields = form.querySelectorAll('input[type="password"]');
      if (passwordFields.length === 0) {
        logMessage('Ignorando formulario - no contiene campos de contraseña', 'debug');
        return; // No es un formulario con contraseña
      }
      
      // Buscamos campos de usuario (email, text, etc.)
      const userFields = form.querySelectorAll('input[type="email"], input[type="text"]');
      if (userFields.length === 0) {
        logMessage('Ignorando formulario - no contiene campos de usuario', 'debug');
        return; // No encontramos campo de usuario
      }
      
      // Esperamos un poco para que el formulario se envíe
      setTimeout(async () => {
        try {
          // Obtenemos los valores de los campos
          const passwordValue = passwordFields[0].value;
          
          if (!passwordValue) {
            logMessage('Ignorando formulario - el campo de contraseña está vacío', 'debug');
            return;
          }
          
          // Intentamos encontrar el campo de usuario más probable (primero email, luego otros)
          let userValue = '';
          let userField = null;
          
          for (const field of userFields) {
            // Priorizamos campos con nombres comunes para usuarios
            const name = (field.name || '').toLowerCase();
            const id = (field.id || '').toLowerCase();
            const placeholder = (field.placeholder || '').toLowerCase();
            
            const isLikelyUsername = 
              name.includes('user') || name.includes('email') || name.includes('login') || 
              id.includes('user') || id.includes('email') || id.includes('login') ||
              placeholder.includes('user') || placeholder.includes('email') || placeholder.includes('login');
            
            // Solo consideramos campos con valor
            if (isLikelyUsername && field.value) {
              userValue = field.value;
              userField = field;
              logMessage(`Campo de usuario detectado: ${name || id || 'sin nombre'}`, 'debug');
              break;
            }
          }
          
          // Si no encontramos valor de usuario por heurística, tomamos el primer campo con valor
          if (!userValue) {
            for (const field of userFields) {
              if (field.value) {
                userValue = field.value;
                userField = field;
                logMessage(`Usando primer campo con valor como usuario: ${field.name || field.id || 'sin nombre'}`, 'debug');
                break;
              }
            }
          }
          
          // Si tenemos usuario y contraseña, mostramos el diálogo
          if (userValue && passwordValue) {
            // Obtenemos el dominio del sitio web actual
            const sitioWeb = window.location.hostname;
            logMessage(`Detectado envío de credenciales en ${sitioWeb}: Usuario=${userValue}, Contraseña=********`, 'info');
            
            // Mostramos el diálogo para guardar
            mostrarDialogoGuardarCredenciales(sitioWeb, userValue, passwordValue);
          } else {
            logMessage('No se pudo determinar el usuario o la contraseña del formulario', 'warn');
          }
        } catch (error) {
          logMessage(`Error al procesar formulario: ${error.message}`, 'error');
        }
      }, 500); // Esperamos 500ms para que el formulario se envíe primero
    } catch (e) {
      logMessage(`Error en el detector de formularios: ${e.message}`, 'error');
    }
  });
}

// Función para mostrar el diálogo preguntando si quiere guardar las credenciales
function mostrarDialogoGuardarCredenciales(sitio, usuario, password) {
  // Comprobamos si ya existe un diálogo abierto y lo eliminamos
  const dialogoExistente = document.querySelector('.passwd-guardar-dialogo');
  if (dialogoExistente) {
    dialogoExistente.remove();
  }
  
  // Creamos el diálogo
  const dialogo = document.createElement('div');
  dialogo.className = 'passwd-guardar-dialogo';
  
  // Estilo del diálogo con animación de entrada
  dialogo.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: 320px;
    background-color: #212121;
    color: #fff;
    border: 1px solid #444;
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 8px 25px rgba(0,0,0,0.6);
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    animation: passwd-dialog-fade-in 0.3s ease-out;
  `;
  
  // Contenido del diálogo
  dialogo.innerHTML = `
    <style>
      @keyframes passwd-dialog-fade-in {
        from { opacity: 0; transform: translateY(-20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .passwd-guardar-titulo {
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 10px;
        display: flex;
        align-items: center;
      }
      .passwd-guardar-icono {
        width: 20px;
        height: 20px;
        margin-right: 8px;
        background-color: #4285F4;
        border-radius: 4px;
        padding: 2px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .passwd-guardar-info {
        margin-bottom: 12px;
        font-size: 14px;
        color: #aaa;
      }
      .passwd-guardar-datos {
        background-color: #333;
        border-radius: 6px;
        padding: 10px;
        margin-bottom: 16px;
        font-size: 13px;
      }
      .passwd-guardar-dato {
        display: flex;
        justify-content: space-between;
        margin-bottom: 6px;
      }
      .passwd-guardar-dato:last-child {
        margin-bottom: 0;
      }
      .passwd-guardar-etiqueta {
        color: #aaa;
      }
      .passwd-guardar-valor {
        color: #fff;
        font-weight: 500;
        max-width: 180px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .passwd-guardar-botones {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }
      .passwd-guardar-boton {
        padding: 8px 16px;
        border-radius: 4px;
        border: none;
        font-weight: 600;
        cursor: pointer;
        font-size: 13px;
        transition: all 0.2s ease;
      }
      .passwd-guardar-boton-cancelar {
        background-color: #333;
        color: #aaa;
      }
      .passwd-guardar-boton-cancelar:hover {
        background-color: #444;
        color: #fff;
      }
      .passwd-guardar-boton-guardar {
        background-color: #4285F4;
        color: white;
      }
      .passwd-guardar-boton-guardar:hover {
        background-color: #5294FF;
      }
    </style>
    <div class="passwd-guardar-titulo">
      <div class="passwd-guardar-icono">P</div>
      Guardar en PASSWD
    </div>
    <div class="passwd-guardar-info">
      ¿Quieres guardar estas credenciales en tu gestor PASSWD?
    </div>
    <div class="passwd-guardar-datos">
      <div class="passwd-guardar-dato">
        <span class="passwd-guardar-etiqueta">Sitio:</span>
        <span class="passwd-guardar-valor">${sitio}</span>
      </div>
      <div class="passwd-guardar-dato">
        <span class="passwd-guardar-etiqueta">Usuario:</span>
        <span class="passwd-guardar-valor">${usuario}</span>
      </div>
      <div class="passwd-guardar-dato">
        <span class="passwd-guardar-etiqueta">Contraseña:</span>
        <span class="passwd-guardar-valor">••••••••</span>
      </div>
    </div>
    <div class="passwd-guardar-botones">
      <button class="passwd-guardar-boton passwd-guardar-boton-cancelar">Cancelar</button>
      <button class="passwd-guardar-boton passwd-guardar-boton-guardar">Guardar</button>
    </div>
  `;
  
  // Añadimos el diálogo al DOM
  document.body.appendChild(dialogo);
  
  // Configuramos los eventos de los botones
  const botonCancelar = dialogo.querySelector('.passwd-guardar-boton-cancelar');
  const botonGuardar = dialogo.querySelector('.passwd-guardar-boton-guardar');
  
  // Auto-cerrar después de 30 segundos
  const timeoutId = setTimeout(() => {
    if (document.body.contains(dialogo)) {
      dialogo.remove();
    }
  }, 30000);
  
  // Evento para cancelar
  botonCancelar.addEventListener('click', () => {
    clearTimeout(timeoutId);
    dialogo.remove();
  });
  
  // Evento para guardar
  botonGuardar.addEventListener('click', () => {
    clearTimeout(timeoutId);
    
    // Animación de salida antes de eliminar
    dialogo.style.animation = 'passwd-dialog-fade-out 0.3s ease-out forwards';
    dialogo.addEventListener('animationend', () => {
      dialogo.remove();
    });
    
    // Enviamos las credenciales al background script
    guardarCredenciales(sitio, usuario, password);
  });
  
  // Añadimos animación de salida al CSS
  const style = document.createElement('style');
  style.textContent = `
    @keyframes passwd-dialog-fade-out {
      from { opacity: 1; transform: translateY(0); }
      to { opacity: 0; transform: translateY(-20px); }
    }
  `;
  document.head.appendChild(style);
}

// Función para enviar las credenciales al background script
function guardarCredenciales(sitio, usuario, password) {
  chrome.runtime.sendMessage({
    accion: 'guardar_credenciales',
    credencial: {
      sitio: sitio,
      usuario: usuario,
      password: password
    }
  })
  .then(response => {
    logMessage(`Respuesta al guardar credenciales: ${JSON.stringify(response)}`, 'info');
    if (response && response.success) {
      mostrarNotificacionGuardado(true);
    } else {
      mostrarNotificacionGuardado(false, response?.error || 'Error desconocido');
    }
  })
  .catch(error => {
    logMessage(`Error al guardar credenciales: ${error.message}`, 'error');
    mostrarNotificacionGuardado(false, 'Error de comunicación con la extensión');
  });
}

// Función para mostrar notificación de resultado
function mostrarNotificacionGuardado(exito, mensaje = '') {
  const notificacion = document.createElement('div');
  notificacion.className = 'passwd-notificacion';
  
  notificacion.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 16px;
    border-radius: 8px;
    color: white;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    font-size: 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 2147483647;
    animation: passwd-notif-fade-in 0.3s ease-out;
  `;
  
  if (exito) {
    notificacion.style.backgroundColor = '#0d3e1a';
    notificacion.style.border = '1px solid #106b2c';
    notificacion.innerText = '✓ Credenciales guardadas correctamente';
  } else {
    notificacion.style.backgroundColor = '#3e0d0d';
    notificacion.style.border = '1px solid #6b1010';
    notificacion.innerText = `✗ Error al guardar: ${mensaje}`;
  }
  
  // Añadimos la notificación al DOM
  document.body.appendChild(notificacion);
  
  // Añadimos animación de entrada y salida
  const style = document.createElement('style');
  style.textContent = `
    @keyframes passwd-notif-fade-in {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes passwd-notif-fade-out {
      from { opacity: 1; transform: translateY(0); }
      to { opacity: 0; transform: translateY(20px); }
    }
  `;
  document.head.appendChild(style);
  
  // Auto-eliminar después de 4 segundos
  setTimeout(() => {
    notificacion.style.animation = 'passwd-notif-fade-out 0.3s ease-out forwards';
    notificacion.addEventListener('animationend', () => {
      notificacion.remove();
    });
  }, 4000);
}

// Función para inicializar los componentes
function initialize() {
  // Registrar el script está cargado
  console.log('PASSWD Content Script inicializado en:', window.location.href);
  
  try {
    // Notificar que está listo lo antes posible
    notifyReady();
    
    // Solicitar credenciales inmediatamente al iniciar
    setTimeout(() => {
      if (!credencialesDisponibles || credencialesDisponibles.length === 0) {
        console.log('Solicitando credenciales al inicializar...');
        requestCredentials();
      }
    }, 1000);
    
    // Configurar detección de campos de login lo antes posible
    añadirIconosACamposLogin();
    
    // Configurar un intervalo para verificar nuevos campos que pueden aparecer dinámicamente
    setInterval(() => {
      if (extensionContextValid) {
        añadirIconosACamposLogin();
      }
    }, 3000);
    
    // Reiniciar la extensión si se detecta un cambio de contexto o error
    setupContextCheckInterval();
    
    // Configurar detector de envío de formularios
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', detectarEnvioFormularios);
    } else {
      detectarEnvioFormularios();
    }
  } catch (e) {
    console.error('Error durante la inicialización del content script:', e);
    // En caso de error durante la inicialización, programar un reinicio
    setTimeout(reinitializeExtension, 2000);
  }
}

// Llamar a la inicialización
initialize();