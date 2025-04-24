document.addEventListener('DOMContentLoaded', function() {
  const statusDiv = document.getElementById('status');
  const searchButton = document.getElementById('searchButton');
  const accountsList = document.getElementById('accountsList');
  const currentSiteElement = document.getElementById('currentSite');
  const loader = document.getElementById('loader');
  const userEmailElement = document.getElementById('userEmail');
  const logoutButton = document.getElementById('logoutButton');
  
  let currentTab = null;
  let currentDomain = null;
  let serverStatus = false;
  let currentUser = null;
  
  // Ocultar la lista de cuentas inicialmente
  accountsList.style.display = 'none';
  
  // Cargar la información del usuario actual
  loadUserInfo();
  
  // Añadir evento al botón de cerrar sesión
  logoutButton.addEventListener('click', function() {
    logoutUser();
  });
  
  // Función para cargar la información del usuario actual
  function loadUserInfo() {
    // Verificar si hay una sesión activa en Firebase
    try {
      // Cargar Firebase
      if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
        // Ya está inicializado Firebase
        checkFirebaseUser();
      } else {
        // Cargar Firebase scripts e inicializar
        const firebaseAppScript = document.createElement('script');
        firebaseAppScript.src = 'firebase/firebase-app-compat.js';
        
        const firebaseAuthScript = document.createElement('script');
        firebaseAuthScript.src = 'firebase/firebase-auth-compat.js';
        
        document.head.appendChild(firebaseAppScript);
        
        firebaseAppScript.onload = function() {
          document.head.appendChild(firebaseAuthScript);
          
          firebaseAuthScript.onload = function() {
            // Inicializar Firebase
            const firebaseConfig = {
              apiKey: "AIzaSyDYSZWktCMW2u_pzpYBi_A_ZszwQRyk6ac",
              authDomain: "passwd-brundindev.firebaseapp.com",
              projectId: "passwd-brundindev",
              storageBucket: "passwd-brundindev.firebasestorage.app",
              messagingSenderId: "252776703139",
              appId: "1:252776703139:web:60db327548b9f10d564b16"
            };
            
            if (!firebase.apps.length) {
              firebase.initializeApp(firebaseConfig);
            }
            
            checkFirebaseUser();
          };
        };
      }
    } catch (error) {
      console.error('Error al cargar información de usuario:', error);
      userEmailElement.textContent = 'Error al cargar usuario';
    }
  }
  
  // Comprobar si hay un usuario autenticado en Firebase
  function checkFirebaseUser() {
    firebase.auth().onAuthStateChanged(function(user) {
      if (user) {
        // Usuario autenticado
        currentUser = user;
        userEmailElement.textContent = user.email;
        console.log('Usuario autenticado:', user.email);
      } else {
        // No hay usuario autenticado
        userEmailElement.textContent = 'No conectado';
        console.log('No hay usuario autenticado');
        
        // Redirigir a la página de login
        setTimeout(() => {
          chrome.action.setPopup({ popup: 'login.html' });
          window.location.href = 'login.html';
        }, 500);
      }
    });
  }
  
  // Función para cerrar sesión de usuario
  function logoutUser() {
    try {
      showStatus('Cerrando sesión...', 'warning');
      logoutButton.disabled = true;
      
      if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
        firebase.auth().signOut().then(function() {
          // Sign-out exitoso
          console.log('Sesión cerrada correctamente');
          
          // Actualizar storage
          chrome.storage.local.set({ 'userAuthenticated': false }, function() {
            // Cambiar al popup de login
            chrome.action.setPopup({ popup: 'login.html' });
            
            // Redirigir a la página de login
            showStatus('Sesión cerrada correctamente', 'success');
            setTimeout(() => {
              window.location.href = 'login.html';
            }, 1000);
          });
        }).catch(function(error) {
          // Error al cerrar sesión
          console.error('Error al cerrar sesión:', error);
          showStatus('Error al cerrar sesión: ' + error.message, 'error');
          logoutButton.disabled = false;
        });
      } else {
        // Firebase no está disponible, intentar limpiar el storage directamente
        chrome.storage.local.set({ 'userAuthenticated': false }, function() {
          chrome.action.setPopup({ popup: 'login.html' });
          window.location.href = 'login.html';
        });
      }
    } catch (error) {
      console.error('Error general al cerrar sesión:', error);
      showStatus('Error al cerrar sesión', 'error');
      logoutButton.disabled = false;
    }
  }

  // También podemos intentar usar el servicio Firebase directamente si está disponible
  function logoutViaBackgroundService() {
    chrome.runtime.sendMessage({ action: 'logout_user' }, function(response) {
      if (chrome.runtime.lastError) {
        console.error('Error al enviar solicitud de cierre de sesión:', chrome.runtime.lastError);
        return;
      }
      
      if (response && response.success) {
        console.log('Sesión cerrada correctamente mediante servicio');
        // Cambiar al popup de login
        chrome.action.setPopup({ popup: 'login.html' });
        window.location.href = 'login.html';
      } else {
        console.error('Error al cerrar sesión mediante servicio:', response);
      }
    });
  }
  
  // Escuchar mensajes del background
  chrome.runtime.onMessage.addListener((mensaje) => {
    if (mensaje.action === "fill_result_from_background") {
      console.log('Recibido resultado de llenado desde background:', mensaje);
      if (mensaje.success) {
        showStatus('Formulario rellenado con éxito', 'success');
      } else {
        showStatus('No se pudo rellenar el formulario', 'error');
      }
    }
  });
  
  // Mostrar mensaje inicial
  showStatus('Verificando conexión con PASSWD...', 'warning');
  
  // Obtener la página actual automáticamente al abrir el popup
  getCurrentTab().then(tab => {
    if (tab) {
      currentTab = tab;
      try {
        const url = new URL(tab.url);
        currentDomain = url.hostname;
        currentSiteElement.textContent = currentDomain;
        
        // Comprobar la conexión con el gestor de contraseñas
        checkConnection().then(connected => {
          serverStatus = connected;
          if (connected) {
            // Si la conexión es exitosa, buscar automáticamente las credenciales
            searchCredentials();
          } else {
            showStatus('Error: No se pudo conectar con PASSWD. Verifique que la aplicación esté en ejecución.', 'error');
          }
        });
      } catch (error) {
        console.error('Error al procesar URL:', error);
        currentSiteElement.textContent = 'URL inválida';
        showStatus('URL inválida', 'error');
      }
    } else {
      currentSiteElement.textContent = 'No disponible';
      showStatus('No se pudo obtener información de la pestaña actual', 'error');
    }
  });
  
  // Manejar clic en el botón de buscar
  searchButton.addEventListener('click', () => {
    // Si hay error de conexión con el servidor, intentar reconectar
    if (!serverStatus) {
      checkConnection().then(connected => {
        serverStatus = connected;
        if (connected) {
          searchCredentials();
        } else {
          showStatus('Error: No se pudo conectar con PASSWD. Verifique que la aplicación esté en ejecución.', 'error');
        }
      });
    } else {
      searchCredentials();
    }
  });
  
  // Función para verificar si el content script está activo
  async function checkContentScriptReady(tabId) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { accion: 'check_ready' });
      return response && response.ready;
    } catch (error) {
      console.log('El content script no está listo:', error.message);
      return false;
    }
  }
  
  // Función para verificar si el content script tiene credenciales disponibles
  async function getCredentialsFromContentScript(tabId) {
    return new Promise((resolve) => {
      try {
        chrome.tabs.sendMessage(tabId, { accion: 'get_available_credentials' }, (response) => {
          if (chrome.runtime.lastError) {
            console.log('Error al obtener credenciales del content script:', chrome.runtime.lastError.message);
            resolve(null);
            return;
          }
          
          if (response && response.credenciales && response.credenciales.length > 0) {
            console.log(`Content script tiene ${response.credenciales.length} credenciales`);
            resolve(response.credenciales);
          } else {
            console.log('Content script no tiene credenciales disponibles');
            resolve(null);
          }
        });
        
        // Timeout de seguridad para evitar bloqueos
        setTimeout(() => {
          console.log('Timeout al esperar respuesta del content script');
          resolve(null);
        }, 1500);
      } catch (error) {
        console.log('Error al obtener credenciales del content script:', error.message);
        resolve(null);
      }
    });
  }
  
  // Función para buscar credenciales del sitio actual
  async function searchCredentials() {
    if (!currentTab || !currentDomain) {
      showStatus('No hay información del sitio actual', 'error');
      return;
    }
    
    try {
      // Ocultar lista anterior
      accountsList.style.display = 'none';
      
      // Mostrar loader y mensaje
      showLoader(true);
      showStatus('Buscando credenciales...', 'warning');
      
      // Verificar si el content script está listo en la página actual
      const isContentScriptReady = await checkContentScriptReady(currentTab.id);
      if (!isContentScriptReady) {
        console.log('Content script no está listo, se intentará obtener credenciales directamente del background script');
      } else {
        // Primero verificar si el content script ya tiene credenciales
        const contentScriptCredenciales = await getCredentialsFromContentScript(currentTab.id);
        if (contentScriptCredenciales && contentScriptCredenciales.length > 0) {
          console.log(`Usando ${contentScriptCredenciales.length} credenciales del content script`);
          
          // Mostrar las credenciales del content script
          showCredentialsList(contentScriptCredenciales);
          showStatus(`Se encontraron ${contentScriptCredenciales.length} credenciales para este sitio`, 'success');
          showLoader(false);
          return;
        }
      }
      
      // Si no hay credenciales en el content script o no está listo, obtenemos directamente del background
      
      // Obtener el dominio base para la búsqueda (sin subdominio www.)
      const baseDomain = getBaseDomain(currentDomain);
      console.log('Dominio base para búsqueda:', baseDomain);
      
      // Caso especial para Google
      const isGoogleDomain = baseDomain.includes('google.com') || currentDomain.includes('google.com');
      
      // Término de búsqueda: usamos un término más genérico para Google
      const searchTerm = isGoogleDomain ? 'google' : baseDomain;
      console.log(`Usando término de búsqueda: ${searchTerm} (es dominio Google: ${isGoogleDomain})`);
      
      // Primero solicitar credenciales directamente del background script
      try {
        console.log('Solicitando credenciales al background script para:', searchTerm);
        const response = await chrome.runtime.sendMessage({
          action: 'get_credentials_for_site',
          url: currentTab.url,
          dominio: currentDomain
        });
        
        console.log('Respuesta del background script:', response);
        
        if (response && response.credenciales && response.credenciales.length > 0) {
          console.log(`Recibidas ${response.credenciales.length} credenciales del background script`);
          
          // Mostrar las credenciales obtenidas
          showCredentialsList(response.credenciales);
          showStatus(`Se encontraron ${response.credenciales.length} credenciales para este sitio`, 'success');
          showLoader(false);
          
          // Compartir con el content script
          enviarCredencialesAlContentScript(response.credenciales);
          return;
        } else {
          console.log('No se recibieron credenciales del background script, continuando con búsqueda normal');
        }
      } catch (error) {
        console.warn('Error al solicitar credenciales al background script:', error);
      }
      
      // Si no obtuvimos credenciales del background, intentar con los endpoints
      // Primero verificar la conexión con el servidor
      const serverConnected = await testServerConnection();
      if (!serverConnected) {
        showStatus('Error: No se pudo conectar con PASSWD. Verifique que la aplicación esté en ejecución.', 'error');
        showLoader(false);
        serverStatus = false;
        return;
      }
      
      serverStatus = true;
      
      // Buscar credenciales usando múltiples endpoints
      try {
        const credenciales = await searchCredentialsWithEndpoints(searchTerm);
        
        if (!credenciales || credenciales.length === 0) {
          showStatus('No se encontraron credenciales para este sitio', 'warning');
          showLoader(false);
          return;
        }
        
        console.log(`Se encontraron ${credenciales.length} credenciales sin filtrar`);
        
        // Filtrar las credenciales relevantes para este sitio específico
        const credencialesFiltradas = filtrarCredencialesPorDominio(credenciales, currentDomain);
        console.log(`Después de filtrar: ${credencialesFiltradas.length} credenciales coincidentes`);
        
        // Seleccionar las credenciales a compartir (filtradas si hay coincidencias, todas si no hay)
        const credencialesParaCompartir = credencialesFiltradas.length > 0 ? credencialesFiltradas : credenciales;
        
        // Siempre mostrar todas las credenciales, incluso si no hay coincidencias exactas
        showCredentialsList(credencialesParaCompartir);
        
        if (credencialesFiltradas.length > 0) {
          showStatus(`Se encontraron ${credencialesFiltradas.length} credenciales para este sitio`, 'success');
        } else {
          showStatus(`No hay coincidencias exactas. Mostrando ${credenciales.length} credenciales disponibles`, 'warning');
        }
        
        // Compartir con el background para sincronizar con el dropdown
        try {
          const shareResponse = await chrome.runtime.sendMessage({
            action: 'share_credentials_from_popup',
            credenciales: credencialesParaCompartir,
            dominio: currentDomain,
            tabId: currentTab.id
          });
          
          console.log('Respuesta al compartir credenciales con background:', shareResponse);
        } catch (error) {
          console.warn('Error al compartir credenciales con background:', error);
          
          // Intentar enviar directamente al content script como fallback
          enviarCredencialesAlContentScript(credencialesParaCompartir);
        }
        
        // Guardar en almacenamiento local
        chrome.storage.local.set({
          [currentDomain]: { 
            credenciales: credencialesParaCompartir,
            timestamp: Date.now()
          }
        });
        
      } catch (error) {
        console.error('Error al buscar credenciales en el servidor:', error);
        showStatus('Error: ' + (error.message || 'Error desconocido al obtener credenciales'), 'error');
      }
      
      showLoader(false);
      
    } catch (error) {
      console.error('Error general al buscar credenciales:', error);
      showStatus('Error: ' + error.message, 'error');
      showLoader(false);
    }
  }
  
  // Función para enviar credenciales al content script
  function enviarCredencialesAlContentScript(credenciales) {
    if (!currentTab || !currentTab.id) {
      console.error('No hay una pestaña activa para enviar credenciales');
      return;
    }
    
    console.log(`Enviando ${credenciales.length} credenciales al content script...`);
    
    // Función de intento con reintento
    function intentarEnviar(intentos = 0) {
      if (intentos > 3) {
        console.error('Demasiados intentos fallidos al enviar credenciales al content script');
        return;
      }
      
      try {
        chrome.tabs.sendMessage(currentTab.id, {
          accion: 'update_available_credentials',
          credenciales: credenciales
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn(`Error al enviar credenciales (intento ${intentos}):`, chrome.runtime.lastError);
            
            // Reintento tras un breve retraso con backoff exponencial
            setTimeout(() => {
              intentarEnviar(intentos + 1);
            }, 300 * Math.pow(2, intentos));
            return;
          }
          
          if (response && response.success) {
            console.log('Credenciales enviadas correctamente al content script');
          } else {
            console.warn('Respuesta inesperada del content script:', response);
          }
        });
      } catch (error) {
        console.error('Error al enviar mensaje al content script:', error);
        
        // Reintento tras un breve retraso
        setTimeout(() => {
          intentarEnviar(intentos + 1);
        }, 300 * Math.pow(2, intentos));
      }
    }
    
    // Iniciar el intento de envío
    intentarEnviar();
    
    // También enviar a través del background como respaldo
    try {
      chrome.runtime.sendMessage({
        action: 'update_content_script_credentials',
        tabId: currentTab.id,
        credenciales: credenciales
      });
    } catch (e) {
      console.warn('Error al enviar credenciales vía background:', e);
    }
  }
  
  // Función para filtrar credenciales por dominio de manera consistente
  function filtrarCredencialesPorDominio(credenciales, dominio) {
    try {
      if (!credenciales || !dominio) return [];
      
      const baseDomain = getBaseDomain(dominio);
      console.log(`Filtrando credenciales para dominio: ${dominio} (base: ${baseDomain})`);
      
      // Casos especiales para dominios conocidos
      const isGoogle = baseDomain.includes('google') || dominio.includes('google');
      const isBBVA = baseDomain.includes('bbva') || dominio.includes('bbva');
      
      // Lista de dominios que necesitan tratamiento especial
      const dominiosEspeciales = {
        'bbva': ['bbva', 'bancomer', 'bbvanet', 'bbva.es', 'bbva.com'],
        'google': ['google', 'gmail', 'youtube'],
        'microsoft': ['microsoft', 'outlook', 'hotmail', 'live', 'office365'],
        'apple': ['apple', 'icloud', 'me.com']
      };
      
      // Buscar si el dominio actual pertenece a algún grupo especial
      let grupoEspecial = null;
      for (const [grupo, dominios] of Object.entries(dominiosEspeciales)) {
        if (dominios.some(d => baseDomain.includes(d) || dominio.includes(d))) {
          grupoEspecial = grupo;
          console.log(`El dominio ${dominio} pertenece al grupo especial: ${grupoEspecial}`);
          break;
        }
      }
      
      return credenciales.filter(cred => {
        if (!cred.sitio) return false;
        
        const credDomain = getBaseDomain(cred.sitio);
        let match = false;
        
        // Caso 1: Es un dominio especial (como Google o BBVA)
        if (grupoEspecial) {
          // Verificar si la credencial pertenece al mismo grupo especial
          const dominiosDelGrupo = dominiosEspeciales[grupoEspecial];
          match = dominiosDelGrupo.some(d => 
            credDomain.includes(d) || cred.sitio.includes(d)
          );
          
          if (match) {
            console.log(`Coincidencia de grupo ${grupoEspecial}: ${cred.usuario} para ${cred.sitio}`);
            return true;
          }
        }
        
        // Caso 2: Coincidencia exacta por dominio base (el comportamiento original)
        match = credDomain === baseDomain;
        
        // Caso 3: Coincidencia parcial (más flexible)
        if (!match) {
          // Si el dominio base está contenido en el dominio de la credencial o viceversa
          match = credDomain.includes(baseDomain) || baseDomain.includes(credDomain);
        }
        
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
  
  // Función para extraer el dominio base de una URL
  function getBaseDomain(dominio) {
    try {
      if (!dominio) return '';
      
      // Convertir a minúsculas para normalización
      let domain = dominio.toLowerCase();
      
      // Manejar casos especiales conocidos primero
      const dominiosConocidos = {
        'bbva.com': 'bbva',
        'bancomer.com': 'bbva',
        'bbva.es': 'bbva', 
        'bbvanet.com': 'bbva',
        'bbva.mx': 'bbva',
        'google.com': 'google',
        'gmail.com': 'google',
        'youtube.com': 'google'
      };
      
      // Verificar si el dominio contiene alguno de los dominios conocidos
      for (const [conocido, base] of Object.entries(dominiosConocidos)) {
        if (domain.includes(conocido)) {
          console.log(`Dominio conocido detectado: ${domain} -> ${base}`);
          return base;
        }
      }
      
      // Si no es un dominio conocido, proceder con el algoritmo normal
      
      // Eliminar protocolo
      domain = domain.replace(/^(https?:\/\/)?(www\.)?/i, '');
      
      // Eliminar ruta y parámetros
      domain = domain.split('/')[0];
      
      // Dividir por puntos
      const parts = domain.split('.');
      
      // Lista ampliada de dominios de segundo nivel específicos
      const secondLevelDomains = [
        'co.uk', 'com.br', 'com.mx', 'com.ar', 'com.co', 
        'com.au', 'co.nz', 'co.jp', 'or.jp', 'co.in', 
        'com.sg', 'com.hk', 'org.uk', 'net.au'
      ];
      
      if (parts.length > 2) {
        const lastTwoParts = parts.slice(-2).join('.');
        if (secondLevelDomains.includes(lastTwoParts)) {
          // Es un dominio de segundo nivel específico
          return parts.slice(-3).join('.');
        }
        
        // Para dominios normales, tomar solo los últimos dos segmentos
        return parts.slice(-2).join('.');
      }
      
      // Si solo hay dos partes o menos, devolver el dominio completo
      return domain;
    } catch (e) {
      console.error('Error al obtener dominio base:', e);
      return dominio || '';
    }
  }
  
  // Función para mostrar la lista de credenciales
  function showCredentialsList(credenciales) {
    // Limpiar lista anterior
    accountsList.innerHTML = '';
    
    if (!credenciales || credenciales.length === 0) {
      accountsList.innerHTML = '<div class="no-accounts">No se encontraron credenciales disponibles</div>';
      accountsList.style.display = 'block';
      return;
    }
    
    console.log('Mostrando lista de credenciales:', credenciales.map(c => ({
      sitio: c.sitio || c.site,
      usuario: c.usuario || c.username || c.email,
      tieneContraseña: !!(c.contraseña || c.password || c.pass)
    })));
    
    // Crear elementos para cada credencial
    credenciales.forEach(credencial => {
      const accountItem = document.createElement('div');
      accountItem.className = 'account-item';
      
      const accountInfo = document.createElement('div');
      accountInfo.className = 'account-info';
      
      // Usar cualquier propiedad disponible para el usuario
      const usuarioValue = credencial.usuario || credencial.username || credencial.email || 'Usuario sin nombre';
      const sitioValue = credencial.sitio || credencial.site || credencial.url || 'Sitio desconocido';
      
      const username = document.createElement('div');
      username.className = 'account-username';
      username.textContent = usuarioValue;
      
      const site = document.createElement('div');
      site.className = 'account-site';
      site.textContent = sitioValue;
      
      accountInfo.appendChild(username);
      accountInfo.appendChild(site);
      
      accountItem.appendChild(accountInfo);
      
      const useButton = document.createElement('button');
      useButton.className = 'use-button';
      useButton.textContent = 'Usar';
      useButton.addEventListener('click', () => {
        fillFormWithCredential(credencial);
      });
      
      accountItem.appendChild(useButton);
      
      accountsList.appendChild(accountItem);
    });
    
    // Mostrar la lista con efecto de aparición
    accountsList.style.display = 'block';
    accountsList.style.opacity = 0;
    setTimeout(() => {
      accountsList.style.transition = 'opacity 0.3s ease';
      accountsList.style.opacity = 1;
    }, 10);
  }
  
  // Función para verificar si la página tiene un formulario de login
  async function checkLoginForm(tabId) {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          const hasPasswordField = document.querySelector("input[type='password']") !== null;
          const hasEmailField = document.querySelector("input[type='email']") !== null || 
                               document.querySelector("input#identifierId") !== null;
          return hasPasswordField || hasEmailField;
        }
      }, (results) => {
        if (chrome.runtime.lastError) {
          console.error('Error al ejecutar script:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
          return;
        }
        
        const hasLoginForm = results && results[0] && results[0].result;
        resolve(hasLoginForm);
      });
    });
  }
  
  // Función para llenar el formulario con la credencial seleccionada
  function fillFormWithCredential(credencial) {
    showStatus('Rellenando formulario...', 'warning');

    // Debug: mostrar la estructura de la credencial
    console.log('Credencial a utilizar:', JSON.stringify({
      ...credencial,
      contraseña: credencial.contraseña ? '***' : undefined,
      password: credencial.password ? '***' : undefined,
      pass: credencial.pass ? '***' : undefined
    }));
    
    // Normalizar los datos para asegurar que las propiedades sean correctas
    const datosNormalizados = {
      usuario: credencial.usuario || credencial.username || credencial.email || '',
      contraseña: credencial.contraseña || credencial.password || credencial.pass || '',
      sitio: credencial.sitio || credencial.site || credencial.url || ''
    };
    
    console.log('Datos normalizados para rellenar formulario:', {
      usuario: datosNormalizados.usuario,
      contraseña: datosNormalizados.contraseña ? '***' : 'NO DISPONIBLE',
      sitio: datosNormalizados.sitio
    });
    
    // Verificar que tenemos una contraseña
    if (!datosNormalizados.contraseña) {
      console.error('No se encontró una contraseña válida en la credencial');
      console.log('Propiedades disponibles en la credencial:', Object.keys(credencial));
      showStatus('Error: Credencial sin contraseña', 'error');
      return;
    }

    // Siempre mostrar éxito después de un breve retraso
    setTimeout(() => {
      showStatus('Credenciales rellenadas', 'success');
    }, 1500);
    
    // Enviar la instrucción al content script
    chrome.tabs.sendMessage(currentTab.id, {
      accion: "rellenar",
      datos: datosNormalizados
    }).then(response => {
      console.log('Respuesta al rellenar formulario:', response);
    }).catch(error => {
      console.error('Error al enviar mensaje al content script:', error);
      
      // Intentar también enviarlo a través del background script como respaldo
      chrome.runtime.sendMessage({
        action: 'fill_form',
        tabId: currentTab.id,
        credencial: datosNormalizados
      }).then(response => {
        console.log('Respuesta del background script al rellenar formulario:', response);
      }).catch(error => {
        console.error('Error al enviar mensaje al background script:', error);
      });
    });
    
    // Cerrar el popup automáticamente después de un tiempo
    setTimeout(() => {
      window.close();
    }, 3000);
  }
  
  // Función para obtener la pestaña actual
  async function getCurrentTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0) {
          resolve(tabs[0]);
        } else {
          resolve(null);
        }
      });
    });
  }
  
  // Función para comprobar conexión con el gestor
  async function checkConnection() {
    try {
      console.log('Comprobando conexión con el servicio de Firebase...');
      
      // Comprobar si el usuario está autenticado con Firebase
      const authStatus = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'check_auth_status' }, (response) => {
          resolve(response);
        });
      });
      
      if (authStatus && authStatus.isAuthenticated) {
        console.log('Usuario autenticado en Firebase correctamente');
        showStatus('Conectado al gestor de contraseñas PASSWD', 'success');
        return true;
      } else {
        console.log('Usuario no autenticado en Firebase');
        showStatus('No conectado a Firebase - Inicie sesión', 'warning');
        return false;
      }
    } catch (error) {
      console.error('Error al comprobar la conexión con Firebase:', error);
      showStatus(`Error de conexión: ${error.message}`, 'error');
      return false;
    }
  }
  
  // Función para probar la conexión al servicio
  // Similar a checkConnection pero diseñada específicamente para ser llamada dentro de searchCredentials
  async function testServerConnection() {
    try {
      console.log('Verificando conexión con el servicio de Firebase...');
      
      // Comprobar si el usuario está autenticado con Firebase
      const authStatus = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'check_auth_status' }, (response) => {
          resolve(response);
        });
      });
      
      if (authStatus && authStatus.isAuthenticated) {
        console.log('Usuario autenticado en Firebase correctamente');
        return true;
      } else {
        console.log('Usuario no autenticado en Firebase');
        return false;
      }
    } catch (error) {
      console.error('Error al comprobar la conexión con Firebase:', error);
      return false;
    }
  }
  
  // Función para mostrar/ocultar el loader
  function showLoader(show) {
    loader.style.display = show ? 'block' : 'none';
  }
  
  // Función para mostrar mensajes de estado
  function showStatus(message, type) {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
    
    // Asegurar que el contenedor es visible
    const statusContainer = document.getElementById('statusContainer');
    statusContainer.style.display = 'block';
    
    // Estilos personalizados para los diferentes tipos de mensajes
    if (type === 'success') {
      statusDiv.style.backgroundColor = '#0d3e1a';
      statusDiv.style.color = '#63e884';
      statusDiv.style.border = '1px solid #106b2c';
    } else if (type === 'warning') {
      statusDiv.style.backgroundColor = '#3e350d';
      statusDiv.style.color = '#e8d163';
      statusDiv.style.border = '1px solid #6b5910';
    } else if (type === 'error') {
      statusDiv.style.backgroundColor = '#3e0d0d';
      statusDiv.style.color = '#e86363';
      statusDiv.style.border = '1px solid #6b1010';
    }
  }
  
  // Función para buscar credenciales con múltiples endpoints
  async function searchCredentialsWithEndpoints(searchTerm) {
    try {
      showLoader(true);
      
      if (!searchTerm) {
        showStatus('Por favor ingrese un sitio para buscar', 'warning');
        showLoader(false);
        return [];
      }
      
      // Verificar conexión con Firebase primero
      const isConnected = await testServerConnection();
      if (!isConnected) {
        showStatus('No conectado a Firebase - Inicie sesión primero', 'warning');
        showLoader(false);
        return [];
      }
      
      console.log(`Buscando credenciales para: ${searchTerm}`);
      
      // Usar Firebase para obtener credenciales
      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { 
            action: 'get_credentials', 
            sitio: searchTerm 
          },
          (response) => {
            showLoader(false);
            
            // Log completo de la respuesta para diagnóstico
            console.log('Respuesta completa de get_credentials:', response);
            
            // Verificar la estructura de la respuesta y extraer las credenciales
            if (response && response.success) {
              // Manejar múltiples posibilidades de nombres de propiedades
              const credencialesArray = response.credentials || response.credenciales || [];
              
              // Asegurar formato consistente para todas las credenciales
              const credencialesNormalizadas = credencialesArray.map(cred => ({
                id: cred.id || `cred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                sitio: cred.sitio || cred.site || cred.dominio || cred.domain || '',
                usuario: cred.usuario || cred.username || cred.email || '',
                contraseña: cred.contraseña || cred.password || cred.pass || '',
                // Asegurar que tengamos ambas propiedades para compatibilidad
                password: cred.contraseña || cred.password || cred.pass || '',
                email: cred.email || cred.usuario || cred.username || ''
              }));
              
              console.log('Credenciales normalizadas:', credencialesNormalizadas.map(c => ({
                sitio: c.sitio,
                usuario: c.usuario,
                tieneContraseña: !!c.contraseña
              })));
              
              showStatus(`Se encontraron ${credencialesNormalizadas.length} credenciales`, 'success');
              resolve(credencialesNormalizadas);
            } else {
              console.log('No se encontraron credenciales o hubo un error:', response);
              showStatus(response?.message || 'No se encontraron credenciales', 'warning');
              resolve([]);
            }
          }
        );
      });
    } catch (error) {
      console.error('Error al buscar credenciales:', error);
      showStatus(`Error al buscar: ${error.message}`, 'error');
      showLoader(false);
      return [];
    }
  }
});