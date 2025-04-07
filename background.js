// Registra eventos de instalación y actualización
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension PASSWD instalada o actualizada:', details.reason);
  
  // Configurar popup según estado de autenticación
  chrome.storage.local.get('userAuthenticated', (data) => {
    if (data.userAuthenticated) {
      chrome.action.setPopup({ popup: 'popup.html' });
    } else {
      chrome.action.setPopup({ popup: 'login.html' });
    }
  });
});

// Verifica estado de autenticación al arrancar la extensión
chrome.runtime.onStartup.addListener(() => {
  checkAuthenticationAndRedirect();
});

// Función para verificar autenticación
function checkAuthenticationAndRedirect() {
  chrome.storage.local.get('userAuthenticated', (data) => {
    if (data.userAuthenticated) {
      chrome.action.setPopup({ popup: 'popup.html' });
    } else {
      chrome.action.setPopup({ popup: 'login.html' });
    }
  });
}

// Log cuando la extensión se inicia
console.log('Servicio background de PASSWD iniciado en:', new Date().toISOString());

// Variables globales para tracking
const credencialesCache = new Map();
const contentScriptsReady = new Map();
const formFillResponses = new Map();

// Configuración de la conexión al servicio Flutter
const FLUTTER_SERVER = {
  HOST: 'localhost',
  PORT: 8080,
  API_PATH: '/api', // Cambiar esto si la ruta API es diferente en tu servicio Flutter
  SEARCH_ENDPOINT: '/search',
  STATUS_ENDPOINT: '/status',
  GET_CREDENTIALS_ENDPOINT: '/get-credentials', // Endpoint original que podría estar usando
  SAVE_CREDENTIAL_ENDPOINT: '/guardar-credencial' // Cambiado a guion para seguir el patrón de get-credentials
};

// Función para construir URLs del servidor
function getServerUrl(endpoint, queryParams = {}) {
  // Determinar si hay que incluir el API_PATH
  let fullEndpoint = endpoint;
  
  // Si el endpoint no empieza con / o con el API_PATH, añadir el API_PATH
  if (!endpoint.startsWith('/')) {
    fullEndpoint = '/' + endpoint;
  }
  
  // Si el endpoint es uno de los definidos en FLUTTER_SERVER y no comienza ya con API_PATH
  if (endpoint !== FLUTTER_SERVER.STATUS_ENDPOINT && 
      !fullEndpoint.startsWith(FLUTTER_SERVER.API_PATH)) {
    const usesDefinedEndpoint = Object.values(FLUTTER_SERVER).includes(endpoint);
    
    if (usesDefinedEndpoint) {
      fullEndpoint = FLUTTER_SERVER.API_PATH + fullEndpoint;
      console.log(`Añadiendo API_PATH al endpoint: ${fullEndpoint}`);
    }
  }
  
  const url = new URL(`http://${FLUTTER_SERVER.HOST}:${FLUTTER_SERVER.PORT}${fullEndpoint}`);
  
  // Añadir parámetros de consulta si existen
  Object.keys(queryParams).forEach(key => {
    url.searchParams.append(key, queryParams[key]);
  });
  
  console.log(`URL construida: ${url.toString()}`);
  return url.toString();
}

// Función para extraer el dominio base de una URL (versión global)
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

// Función para filtrar credenciales por dominio de manera consistente
function filtrarCredencialesPorDominio(credenciales, dominio) {
  try {
    if (!credenciales || !dominio) return [];
    
    const baseDomain = getBaseDomain(dominio);
    console.log(`Filtrando credenciales para dominio: ${dominio} (base: ${baseDomain})`);
    
    return credenciales.filter(cred => {
      if (!cred.sitio) return false;
      
      const credDomain = getBaseDomain(cred.sitio);
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

// Función para guardar credenciales en caché y asegurar coherencia
function guardarCredencialesEnCache(dominio, credenciales) {
  try {
    if (!dominio || !credenciales) return;
    
    // Filtrar credenciales para el dominio específico
    const credencialesFiltradas = filtrarCredencialesPorDominio(credenciales, dominio);
    
    // Actualizar caché
    credencialesCache.set(dominio, {
      credenciales: credencialesFiltradas,
      timestamp: Date.now()
    });
    
    console.log(`Guardadas ${credencialesFiltradas.length} credenciales para ${dominio} en caché`);
    return credencialesFiltradas;
  } catch (e) {
    console.error('Error al guardar credenciales en caché:', e);
    return credenciales;
  }
}

// Cargar scripts de Firebase de forma más robusta
function loadFirebaseScripts() {
  try {
    // Usar rutas absolutas con chrome.runtime.getURL para evitar problemas de importación
    const appScriptUrl = chrome.runtime.getURL('firebase/firebase-app-compat.js');
    const authScriptUrl = chrome.runtime.getURL('firebase/firebase-auth-compat.js');
    const firestoreScriptUrl = chrome.runtime.getURL('firebase/firebase-firestore-compat.js');

    // Log para depuración
    console.log('Intentando cargar Firebase desde URLs:');
    console.log('- App:', appScriptUrl);
    console.log('- Auth:', authScriptUrl);
    console.log('- Firestore:', firestoreScriptUrl);
    
    // Usar importScripts con las rutas absolutas
    importScripts(appScriptUrl);
    importScripts(authScriptUrl);
    importScripts(firestoreScriptUrl);
    
    console.log('Scripts de Firebase cargados correctamente en background.js');
    return true;
  } catch (e) {
    console.error('Error al cargar scripts de Firebase en background.js:', e);
    return false;
  }
}

// Intentar cargar los scripts de Firebase
const firebaseLoaded = loadFirebaseScripts();
if (!firebaseLoaded) {
  console.error('No se pudieron cargar los scripts de Firebase. Algunas funcionalidades no estarán disponibles.');
}

// Inicializar Firebase
try {
  importScripts('firebase_service.js');
  
  let firebaseService = null;
  try {
    if (typeof FirebaseService !== 'undefined') {
      firebaseService = new FirebaseService();
      console.log('FirebaseService inicializado en background.js');
    } else {
      console.error('FirebaseService no está definido, asegúrate de que firebase_service.js se carga antes que background.js');
    }
  } catch (e) {
    console.error('Error al inicializar FirebaseService:', e);
  }
} catch (e) {
  console.error('Error al importar firebase_service.js:', e);
}

// Función para guardar credenciales en Firebase
async function guardarCredencialesEnFirebase(credencial) {
  console.log('Iniciando guardarCredencialesEnFirebase:', credencial ? credencial.sitio : 'credencial vacía');
  
  // Verificar datos completos
  if (!credencial || !credencial.sitio || !credencial.usuario || !credencial.contraseña) {
    console.error('Error: Credenciales incompletas', credencial);
    return { success: false, error: 'Datos incompletos' };
  }
  
  try {
    // Verificar si Firebase está cargado
    let firebaseReady = typeof firebase !== 'undefined' && firebase.apps.length > 0;
    console.log('Estado inicial de Firebase:', firebaseReady ? 'Listo' : 'No inicializado');
    
    // Si Firebase no está cargado, intentar cargarlo
    if (!firebaseReady) {
      console.log('Intentando cargar Firebase...');
      try {
        // Cargar scripts de Firebase usando rutas absolutas
        const appScriptUrl = chrome.runtime.getURL('firebase/firebase-app-compat.js');
        const authScriptUrl = chrome.runtime.getURL('firebase/firebase-auth-compat.js');
        const firestoreScriptUrl = chrome.runtime.getURL('firebase/firebase-firestore-compat.js');
        
        console.log('Cargando scripts de Firebase desde:', appScriptUrl);
        importScripts(appScriptUrl);
        importScripts(authScriptUrl);
        importScripts(firestoreScriptUrl);
        
        // Verificar si se cargó correctamente
        if (typeof firebase === 'undefined') {
          console.error('Error crítico: No se pudieron cargar los scripts de Firebase');
          return { success: false, error: 'No se pudieron cargar los scripts de Firebase' };
        }
        
        console.log('Scripts de Firebase cargados correctamente');
        
        // Inicializar Firebase si es necesario
        if (!firebase.apps.length) {
          console.log('Inicializando Firebase...');
          const firebaseConfig = {
            apiKey: "AIzaSyDYSZWktCMW2u_pzpYBi_A_ZszwQRyk6ac",
            authDomain: "passwd-brundindev.firebaseapp.com",
            projectId: "passwd-brundindev",
            storageBucket: "passwd-brundindev.firebasestorage.app",
            messagingSenderId: "252776703139",
            appId: "1:252776703139:web:60db327548b9f10d564b16"
          };
          
          firebase.initializeApp(firebaseConfig);
          console.log('Firebase inicializado correctamente');
        }
        
        firebaseReady = true;
      } catch (error) {
        console.error('Error al cargar o inicializar Firebase:', error);
        return { success: false, error: 'Error al cargar Firebase: ' + error.message };
      }
    }
    
    // Verificar si el usuario está autenticado
    console.log('Verificando autenticación del usuario...');
    const user = firebase.auth().currentUser;
    
    if (!user) {
      console.error('Error: Usuario no autenticado');
      return { success: false, error: 'Debes iniciar sesión para guardar credenciales' };
    }
    
    console.log('Usuario autenticado:', user.uid, user.email);
    
    // Crear una referencia a la colección donde guardaremos las credenciales
    // Siguiendo la estructura /usuarios/{userId}/pass/{documentId}
    const userId = user.uid;
    const db = firebase.firestore();
    
    // Usar la colección correcta según las reglas de seguridad
    const passCollection = db.collection('usuarios').doc(userId).collection('pass');
    
    console.log('Guardando credencial en Firestore, colección:', `usuarios/${userId}/pass`);
    
    // Verificar si ya existe esta credencial
    const querySnapshot = await passCollection
      .where('sitio', '==', credencial.sitio)
      .where('usuario', '==', credencial.usuario)
      .get();
    
    let docRef;
    
    if (!querySnapshot.empty) {
      // Ya existe, actualizar
      docRef = querySnapshot.docs[0].ref;
      console.log('Actualizando credencial existente, ID:', docRef.id);
      
      await docRef.update({
        sitio: credencial.sitio,
        usuario: credencial.usuario,
        contraseña: credencial.contraseña,
        actualizado: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      console.log('Credencial actualizada correctamente');
      return { success: true, updated: true, id: docRef.id };
    } else {
      // No existe, crear nueva
      console.log('Creando nueva credencial');
      
      // Añadir timestamps
      const credencialConTimestamp = {
        ...credencial,
        creado: firebase.firestore.FieldValue.serverTimestamp(),
        actualizado: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      const newDocRef = await passCollection.add(credencialConTimestamp);
      console.log('Credencial creada correctamente, ID:', newDocRef.id);
      
      return { success: true, updated: false, id: newDocRef.id };
    }
  } catch (error) {
    console.error('Error general al guardar credenciales:', error);
    
    // Categorizar los errores para respuestas más útiles
    let errorMessage = error.message || 'Error desconocido';
    
    if (errorMessage.includes('permission-denied') || errorMessage.includes('permission denied')) {
      errorMessage = 'Error de permisos. Verifica que has iniciado sesión.';
    } else if (errorMessage.includes('network')) {
      errorMessage = 'Error de red. Verifica tu conexión a internet.';
    } else if (errorMessage.includes('quota')) {
      errorMessage = 'Error de cuota excedida. Intenta más tarde.';
    }
    
    return { success: false, error: errorMessage };
  }
}

// Almacenamiento global para credenciales pendientes de guardar
// Usamos una variable global, NO window.pendingCredentials que causa problemas
var pendingCredentials = new Map();

// Manejador de mensajes de la extensión
chrome.runtime.onMessage.addListener(function(mensaje, sender, sendResponse) {
  console.log('Mensaje recibido en background:', mensaje);
  console.log('Sender:', sender);
  
  // Si el mensaje es para verificar si la extensión está activa
  if (mensaje.action === 'ping') {
    sendResponse({ status: 'ok', message: 'PASSWD Extension activa' });
    return true;
  }

  // Mensaje para obtener credenciales para un sitio
  if (mensaje.action === 'get_credentials_for_site') {
    try {
      const tab = sender.tab;
      if (!tab || !tab.url) {
        console.warn('No hay tab o URL válida en la solicitud de credenciales');
        sendResponse({ error: 'Tab o URL inválida' });
        return true;
      }

      const url = new URL(mensaje.url || tab.url);
      const dominio = url.hostname;
      
      console.log(`Solicitando credenciales para: ${dominio}`);
      
      // Verificar caché
      if (credencialesCache.has(dominio)) {
        const cacheData = credencialesCache.get(dominio);
        const ahora = Date.now();
        
        if (ahora - cacheData.timestamp < 15 * 60 * 1000) {
          console.log(`Usando credenciales en caché para ${dominio}`);
          
          sendResponse({ 
            credenciales: cacheData.credenciales,
            fuente: 'cache',
            timestamp: Date.now()
          });
          return true;
        }
      }
      
      // No hay caché válida, obtener del servidor
      obtenerCredenciales(dominio)
        .then(credenciales => {
          console.log(`Obtenidas ${credenciales.length} credenciales para ${dominio}`);
          
          // Guardar en caché y filtrar
          const credencialesFiltradas = guardarCredencialesEnCache(dominio, credenciales);
          
          // Enviar respuesta
          sendResponse({ 
            credenciales: credencialesFiltradas,
            fuente: 'servidor',
            timestamp: Date.now()
          });
        })
        .catch(error => {
          console.error('Error al obtener credenciales:', error);
          sendResponse({ error: 'Error al obtener credenciales del servidor' });
        });
      
      return true; // Indica que la respuesta se enviará asincrónicamente
    } catch (e) {
      console.error('Error al procesar solicitud de credenciales:', e);
      sendResponse({ error: e.message || 'Error desconocido' });
      return true;
    }
  }
  
  // Mensaje para rellenar un formulario
  if (mensaje.action === 'fill_form') {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) {
          console.warn('No hay tabs activas para rellenar formulario');
          sendResponse({ error: 'No hay tabs activas' });
          return;
        }
        
        const activeTab = tabs[0];
        chrome.tabs.sendMessage(activeTab.id, {
          accion: 'fill_form',
          credencial: mensaje.credencial
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Error al enviar mensaje a content script:', chrome.runtime.lastError);
            sendResponse({ error: chrome.runtime.lastError.message });
          } else {
            sendResponse(response);
          }
        });
      });
      
      return true; // Indicar que la respuesta se enviará de forma asíncrona
    } catch (e) {
      console.error('Error al procesar fill_form:', e);
      sendResponse({ error: e.message });
      return true;
    }
  }

  // Notificación de que el content script está listo
  if (mensaje.action === 'content_script_ready') {
    try {
      const tab = sender.tab;
      if (!tab) {
        console.warn('Mensaje content_script_ready sin tab válida');
        return;
      }
      
      console.log(`Content script listo en tab ${tab.id}: ${tab.url}`);
      
      // Enviamos las credenciales para esta página
      setTimeout(() => {
        try {
          enviarCredencialesCacheadas(tab);
        } catch (e) {
          console.error('Error al enviar credenciales después de ready:', e);
        }
      }, 500);
      
      sendResponse({ status: 'ok' });
    } catch (e) {
      console.error('Error al procesar content_script_ready:', e);
      sendResponse({ error: e.message });
    }
    return true;
  }
  
  // Añadir un manejador para compartir credenciales desde el popup
  if (mensaje.action === 'share_credentials_from_popup') {
    try {
      if (!mensaje.credenciales || !mensaje.dominio) {
        console.warn('Datos incompletos en share_credentials_from_popup');
        sendResponse({ error: 'Datos incompletos' });
        return true;
      }
      
      const dominio = mensaje.dominio;
      const credenciales = mensaje.credenciales;
      
      console.log(`Recibiendo ${credenciales.length} credenciales desde popup para ${dominio}`);
      
      // Guardar en caché sin filtrar (ya vienen filtradas del popup)
      credencialesCache.set(dominio, {
        credenciales: credenciales,
        timestamp: Date.now()
      });
      
      console.log(`Guardadas ${credenciales.length} credenciales en caché para ${dominio}`);
      
      // Enviar a la pestaña actual si existe
      if (mensaje.tabId) {
        console.log(`Enviando credenciales a tab ${mensaje.tabId}`);
        
        // Verificar primero si el content script está listo
        chrome.tabs.sendMessage(mensaje.tabId, { accion: 'check_ready' })
          .then(response => {
            if (response && response.ready) {
              // Content script está listo, enviar credenciales
              return chrome.tabs.sendMessage(mensaje.tabId, {
                accion: 'set_credentials',
                credenciales: credenciales
              });
            } else {
              throw new Error('Content script no está listo');
            }
          })
          .then(() => {
            console.log('Credenciales compartidas con éxito al content script');
            sendResponse({ success: true });
          })
          .catch(e => {
            console.error('Error al comunicar con content script, inyectando script...', e);
            
            // Intentar inyectar el content script
      chrome.scripting.executeScript({
              target: { tabId: mensaje.tabId },
              files: ['content.js']
            })
            .then(() => {
              console.log('Content script inyectado, esperando 1 segundo antes de enviar credenciales');
              
              // Esperar a que el script se inicialice
              setTimeout(() => {
                chrome.tabs.sendMessage(mensaje.tabId, {
                  accion: 'set_credentials',
                  credenciales: credenciales
                })
                .then(() => {
                  console.log('Credenciales enviadas después de inyección');
                  sendResponse({ success: true, injected: true });
                })
                .catch(err => {
                  console.error('Error al enviar credenciales después de inyección:', err);
                  sendResponse({ error: 'Error al enviar credenciales después de inyección' });
                });
              }, 1000);
            })
            .catch(err => {
              console.error('Error al inyectar content script:', err);
              sendResponse({ error: 'No se pudo inyectar el content script' });
            });
          });
        
        return true; // Indicar que la respuesta será asíncrona
      }
      
      sendResponse({ success: true, cached: true });
    } catch (e) {
      console.error('Error al procesar share_credentials_from_popup:', e);
      sendResponse({ error: e.message });
    }
    return true;
  }
  
  // Manejador para guardar nuevas credenciales capturadas del formulario
  if (mensaje.accion === 'guardar_credenciales') {
    try {
      if (!mensaje.credencial) {
        console.warn('Datos incompletos en guardar_credenciales');
        sendResponse({ success: false, error: 'No se proporcionaron credenciales' });
        return true;
      }
      
      const credencial = mensaje.credencial;
      console.log('Procesando solicitud para guardar nuevas credenciales:', credencial.sitio);
      
      // Log adicional para depuración
      console.log('Detalles de credencial a guardar:', {
        sitio: credencial.sitio,
        usuario: credencial.usuario,
        contraseña: credencial.contraseña ? '******' : 'vacía',
        estructura: JSON.stringify(credencial)
      });
      
      // Realizar la petición para guardar las credenciales directamente
      guardarCredencialesEnFirebase(credencial)
        .then(resultado => {
          console.log('Resultado de guardar credenciales:', resultado);
          
          // Si hay error de autenticación, intentar mostrar popup de login
          if (!resultado.success && resultado.error && 
              (resultado.error.includes('autenticado') || resultado.error.includes('iniciar sesión'))) {
            console.log('Error de autenticación, intentando mostrar popup de login');
            try {
              // Cambiar el popup activo al de login
              chrome.action.setPopup({ popup: 'login.html' }, () => {
                if (chrome.runtime.lastError) {
                  console.error('Error al cambiar popup:', chrome.runtime.lastError);
                } else {
                  console.log('Popup cambiado a login.html');
                  // Intentar abrir el popup
                  try {
                    chrome.action.openPopup();
                  } catch (popupErr) {
                    console.warn('No se pudo abrir el popup automáticamente');
                  }
                }
              });
            } catch (popupErr) {
              console.error('Error al intentar mostrar popup de login:', popupErr);
            }
          }
          
          sendResponse(resultado);
        })
        .catch(error => {
          console.error('Error al guardar credenciales en Firebase:', error);
          sendResponse({ success: false, error: error.message || 'Error desconocido al guardar' });
        });
      
      return true; // Indicar que sendResponse se llamará de forma asíncrona
    } catch (e) {
      console.error('Error al procesar guardar_credenciales:', e);
      sendResponse({ success: false, error: e.message });
      return true;
    }
  }
  
  // Manejador para mostrar el popup de login cuando se solicita
  if (mensaje.action === 'show_login_popup') {
    try {
      console.log('Solicitando cambio a popup de login');
      
      // Cambiar el popup activo al de login
      chrome.action.setPopup({ popup: 'login.html' }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error al cambiar popup:', chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          console.log('Popup cambiado a login.html');
          sendResponse({ success: true });
          
          // Intentar abrir el popup para que el usuario inicie sesión
          try {
            chrome.action.openPopup();
          } catch (e) {
            console.log('No se pudo abrir el popup automáticamente, el usuario deberá hacerlo manualmente');
          }
        }
      });
      
      return true; // Indicar que la respuesta se enviará de forma asíncrona
    } catch (e) {
      console.error('Error al procesar solicitud de login popup:', e);
      sendResponse({ success: false, error: e.message });
      return true;
    }
  }
  
  // Manejador para mostrar notificación de guardado
  if (mensaje.action === 'show_save_notification') {
    try {
      if (!mensaje.data || !mensaje.data.sitio || !mensaje.data.usuario) {
        console.warn('Datos incompletos para notificación');
        sendResponse({ success: false, error: 'Datos incompletos' });
        return true;
      }
      
      console.log('Mostrando notificación del sistema para guardar credenciales');
      console.log('Datos de la notificación:', mensaje.data);
      
      // Usar la variable global pendingCredentials directamente, no window.pendingCredentials
      console.log('Estado actual de pendingCredentials:', pendingCredentials ? 
               `Map con ${pendingCredentials.size} elementos` : 
               'No definido');
      
      // Crear un ID único para esta notificación
      const notificationId = `passwd_save_${Date.now()}`;
      
      // Mostrar notificación
      chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/logo_passwd.JPEG'),
        title: 'PASSWD - Guardar Credenciales',
        message: `¿Deseas guardar la contraseña para ${mensaje.data.usuario} en ${mensaje.data.sitio}?`,
        buttons: [
          { title: 'Guardar' },
          { title: 'Cancelar' }
        ],
        priority: 2,
        requireInteraction: true // Mantener la notificación hasta que el usuario interactúe
      }, (notificationIdCreated) => {
        if (chrome.runtime.lastError) {
          console.error('Error al crear notificación:', chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          console.log('Notificación mostrada con ID:', notificationIdCreated);
          sendResponse({ success: true, notificationId: notificationIdCreated });
        }
      });
      
      return true; // Indicar que se enviará respuesta asíncrona
    } catch (e) {
      console.error('Error al mostrar notificación:', e);
      sendResponse({ success: false, error: e.message });
      return true;
    }
  }
  
  // Mensaje para preparar credenciales para guardar
  if (mensaje.action === 'prepare_credentials') {
    try {
      if (!mensaje.credencial || !mensaje.credencial.sitio || !mensaje.credencial.usuario || !mensaje.credencial.contraseña) {
        console.warn('Credenciales incompletas para preparar guardado');
        sendResponse({ success: false, error: 'Credenciales incompletas' });
        return true;
      }
      
      console.log('Mensaje prepare_credentials recibido:', mensaje.credencial);
      
      // Generar un ID basado en el sitio y usuario
      const credentialId = `${mensaje.credencial.sitio}_${mensaje.credencial.usuario}`;
      
      // Guardar las credenciales temporalmente usando nuestra variable global
      pendingCredentials.set(credentialId, {
        credencial: mensaje.credencial,
        timestamp: Date.now()
      });
      
      console.log('Credenciales preparadas para guardar con ID:', credentialId);
      console.log('Estado de pendingCredentials:', 
                 `Map con ${pendingCredentials.size} elementos`);
      
      // Configurar un timer para limpiar las credenciales después de 5 minutos
      setTimeout(() => {
        if (pendingCredentials.has(credentialId)) {
          console.log('Limpiando credenciales preparadas (timeout) para:', credentialId);
          pendingCredentials.delete(credentialId);
        }
      }, 5 * 60 * 1000);
      
      sendResponse({ success: true, id: credentialId });
    } catch (e) {
      console.error('Error al preparar credenciales:', e);
      sendResponse({ success: false, error: e.message });
    }
    
    return true;
  }
  
  // Añadir handler para cerrar sesión
  if (mensaje.action === 'logout_user') {
    try {
      console.log('Procesando solicitud de cierre de sesión');
      
      // Verificar si Firebase está disponible
      if (typeof firebase === 'undefined' || !firebase.apps.length) {
        // Intentar cargar Firebase
        try {
          // Cargar scripts de Firebase usando rutas absolutas
          const appScriptUrl = chrome.runtime.getURL('firebase/firebase-app-compat.js');
          const authScriptUrl = chrome.runtime.getURL('firebase/firebase-auth-compat.js');
          
          importScripts(appScriptUrl);
          importScripts(authScriptUrl);
          
          // Verificar si se cargó correctamente
          if (typeof firebase === 'undefined') {
            console.error('No se pudo cargar Firebase para cerrar sesión');
            sendResponse({ success: false, error: 'No se pudo cargar Firebase' });
            return true;
          }
          
          // Inicializar Firebase si es necesario
          if (!firebase.apps.length) {
            const firebaseConfig = {
              apiKey: "AIzaSyDYSZWktCMW2u_pzpYBi_A_ZszwQRyk6ac",
              authDomain: "passwd-brundindev.firebaseapp.com",
              projectId: "passwd-brundindev",
              storageBucket: "passwd-brundindev.firebasestorage.app",
              messagingSenderId: "252776703139",
              appId: "1:252776703139:web:60db327548b9f10d564b16"
            };
            
            firebase.initializeApp(firebaseConfig);
          }
        } catch (error) {
          console.error('Error al cargar Firebase para cerrar sesión:', error);
          sendResponse({ success: false, error: error.message });
          return true;
        }
      }
      
      // Intentar usar firebaseService si está disponible
      if (typeof firebaseService !== 'undefined') {
        console.log('Usando firebaseService para cerrar sesión');
        firebaseService.logout()
          .then(result => {
            console.log('Resultado de cierre de sesión:', result);
            
            if (result.success) {
              // Actualizar storage
              chrome.storage.local.set({ 'userAuthenticated': false }, () => {
                // Cambiar popup
                chrome.action.setPopup({ popup: 'login.html' });
                sendResponse({ success: true });
              });
            } else {
              sendResponse({ success: false, error: result.error });
            }
          })
          .catch(error => {
            console.error('Error al cerrar sesión con firebaseService:', error);
            sendResponse({ success: false, error: error.message });
          });
      } else {
        // Usar Firebase directamente
        console.log('Usando Firebase auth directamente para cerrar sesión');
        firebase.auth().signOut()
          .then(() => {
            console.log('Sesión cerrada correctamente');
            
            // Actualizar storage
            chrome.storage.local.set({ 'userAuthenticated': false }, () => {
              // Cambiar popup
              chrome.action.setPopup({ popup: 'login.html' });
              sendResponse({ success: true });
            });
          })
          .catch(error => {
            console.error('Error al cerrar sesión:', error);
            sendResponse({ success: false, error: error.message });
          });
      }
      
      return true; // Indicar que se enviará respuesta asíncrona
    } catch (error) {
      console.error('Error general al procesar cierre de sesión:', error);
      sendResponse({ success: false, error: error.message });
      return true;
    }
  }
  
  // Si llegamos aquí, no se procesó el mensaje
  sendResponse({ error: 'Mensaje no reconocido' });
  return true;
});

// Escuchar clics en notificaciones
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  console.log(`Clic en botón ${buttonIndex} de notificación ${notificationId}`);
  
  // Verificar que es una notificación de PASSWD
  if (notificationId.startsWith('passwd_save_')) {
    console.log(`Estado de pendingCredentials: Map con ${pendingCredentials.size} elementos`);
    
    if (buttonIndex === 0) {
      // Botón Guardar (primer botón)
      console.log('Usuario eligió guardar credenciales');
      
      // Buscar las credenciales guardadas temporalmente
      const credentials = Array.from(pendingCredentials.values())
        .sort((a, b) => b.timestamp - a.timestamp) // Ordenar por timestamp, más reciente primero
        .map(entry => entry.credencial);
      
      console.log(`Se encontraron ${credentials.length} credenciales pendientes`);
      
      if (credentials.length > 0) {
        // Tomar la credencial más reciente
        const credencial = credentials[0];
        console.log('Guardando credencial para:', credencial.sitio);
        
        // Guardar la credencial
        guardarCredencialesEnFirebase(credencial)
          .then(resultado => {
            console.log('Resultado de guardar credenciales:', resultado);
            
            // Mostrar notificación de resultado
            chrome.notifications.create({
              type: 'basic',
              iconUrl: chrome.runtime.getURL('icons/logo_passwd.JPEG'),
              title: 'PASSWD - Resultado',
              message: resultado.success ? 
                'Credenciales guardadas correctamente.' : 
                `Error al guardar: ${resultado.error || 'Desconocido'}`,
              priority: 1
            });
            
            // Limpiar todas las credenciales pendientes
            pendingCredentials.clear();
          })
          .catch(error => {
            console.error('Error al guardar credenciales:', error);
            
            // Mostrar error
            chrome.notifications.create({
              type: 'basic',
              iconUrl: chrome.runtime.getURL('icons/logo_passwd.JPEG'),
              title: 'PASSWD - Error',
              message: `Error al guardar: ${error.message || 'Desconocido'}`,
              priority: 1
            });
          });
      } else {
        console.error('No se encontraron credenciales pendientes');
        
        chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/logo_passwd.JPEG'),
          title: 'PASSWD - Error',
          message: 'No se encontraron credenciales para guardar.',
          priority: 1
        });
      }
    } else {
      // Botón Cancelar (segundo botón)
      console.log('Usuario eligió cancelar guardado de credenciales');
      
      // Limpiar las credenciales pendientes
      pendingCredentials.clear();
      
      // Informar al usuario
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/logo_passwd.JPEG'),
        title: 'PASSWD - Cancelado',
        message: 'Guardado de credenciales cancelado.',
        priority: 1
      });
    }
    
    // Cerrar la notificación
    chrome.notifications.clear(notificationId);
  }
});

// Función para obtener credenciales del servidor local
async function obtenerCredenciales(dominio) {
  try {
    if (!dominio) {
      console.warn('No se proporcionó dominio para obtener credenciales');
      return [];
    }
    
    // Extraer el dominio base para búsqueda en el servidor
    const dominioBase = getBaseDomain(dominio);
    console.log(`Obteniendo credenciales para: ${dominio} (dominio base: ${dominioBase})`);
    
    // Intentaremos múltiples endpoints y formatos para asegurar compatibilidad
    const endpoints = [
      // Nuevo endpoint API con POST
      { 
        url: getServerUrl(`${FLUTTER_SERVER.API_PATH}${FLUTTER_SERVER.SEARCH_ENDPOINT}`),
        method: 'POST',
        body: JSON.stringify({ term: dominioBase }),
        contentType: 'application/json'
      },
      // Endpoint antiguo con GET
      { 
        url: getServerUrl(FLUTTER_SERVER.GET_CREDENTIALS_ENDPOINT, { sitio: dominioBase }),
        method: 'GET',
        contentType: 'application/json'
      },
      // Alternativa para GET con parámetro diferente
      { 
        url: getServerUrl(FLUTTER_SERVER.GET_CREDENTIALS_ENDPOINT, { domain: dominioBase }),
        method: 'GET',
        contentType: 'application/json'
      }
    ];
    
    // Para Google, añadir búsqueda alternativa
    if (dominioBase.includes('google.com') || dominio.includes('google.com')) {
      endpoints.push(
        { 
          url: getServerUrl(`${FLUTTER_SERVER.API_PATH}${FLUTTER_SERVER.SEARCH_ENDPOINT}`),
          method: 'POST',
          body: JSON.stringify({ term: 'google' }),
          contentType: 'application/json'
        },
        { 
          url: getServerUrl(FLUTTER_SERVER.GET_CREDENTIALS_ENDPOINT, { sitio: 'google' }),
          method: 'GET',
          contentType: 'application/json'
        }
      );
    }
    
    // Probar cada endpoint hasta encontrar uno que funcione
    let lastError = null;
    for (const endpoint of endpoints) {
      try {
        console.log(`Intentando con: ${endpoint.method} ${endpoint.url}`);
        
        const response = await fetch(endpoint.url, {
          method: endpoint.method,
          headers: {
            'Content-Type': endpoint.contentType
          },
          body: endpoint.method === 'POST' ? endpoint.body : undefined
        });
        
        console.log(`Respuesta del servidor: ${response.status} ${response.statusText}`);
        
        if (response.ok) {
          const data = await response.json();
          console.log('Datos recibidos:', data);
          
          const credenciales = processCredentialsData(data);
          if (credenciales.length > 0) {
            console.log(`Se encontraron ${credenciales.length} credenciales con endpoint: ${endpoint.method} ${endpoint.url}`);
            return credenciales;
          } else {
            console.log(`No se encontraron credenciales con endpoint: ${endpoint.method} ${endpoint.url}`);
          }
        } else {
          console.log(`Error con endpoint ${endpoint.method} ${endpoint.url}: ${response.status}`);
          lastError = new Error(`Error al obtener credenciales: ${response.status} ${response.statusText}`);
        }
      } catch (e) {
        console.warn(`Error al intentar endpoint ${endpoint.method} ${endpoint.url}:`, e);
        lastError = e;
      }
    }
    
    // Si llegamos aquí, ningún endpoint funcionó
    if (lastError) {
      throw lastError;
    } else {
      throw new Error('No se pudo conectar con el servidor de credenciales');
    }
  } catch (e) {
    console.error(`Error al obtener credenciales para ${dominio}:`, e);
    return [];
  }
}

// Función auxiliar para procesar diferentes formatos de datos de credenciales
function processCredentialsData(data) {
  if (data && Array.isArray(data.items)) {
    console.log(`Se encontraron ${data.items.length} credenciales (formato items)`);
    return data.items.map(item => ({
      id: item.id || '',
      sitio: item.site || item.sitio || '',
      usuario: item.username || item.usuario || '',
      password: item.password || item.pass || item.contraseña || '',
      notas: item.notes || item.notas || ''
    }));
  } else if (data && Array.isArray(data.credenciales)) {
    console.log(`Se encontraron ${data.credenciales.length} credenciales (formato credenciales)`);
    return data.credenciales.map(item => ({
      id: item.id || '',
      sitio: item.sitio || item.site || '',
      usuario: item.usuario || item.username || '',
      password: item.password || item.contraseña || item.pass || '',
      notas: item.notas || item.notes || ''
    }));
  } else if (data && Array.isArray(data)) {
    console.log(`Se encontraron ${data.length} credenciales (formato array)`);
    return data.map(item => ({
      id: item.id || '',
      sitio: item.site || item.sitio || '',
      usuario: item.username || item.usuario || '',
      password: item.password || item.contraseña || item.pass || '',
      notas: item.notes || item.notas || ''
    }));
  }
  
  console.log('No se encontró un formato de datos reconocible');
  return [];
}

// Enviar credenciales cacheadas al content script para un tab específico
function enviarCredencialesCacheadas(tab) {
  try {
    if (!tab || !tab.url || !tab.id) {
      console.warn('Tab inválido para enviar credenciales');
      return;
    }

    const url = new URL(tab.url);
    const dominio = url.hostname;
    
    if (!dominio) {
      console.warn('No se pudo extraer el dominio de:', tab.url);
      return;
    }
    
    console.log(`Enviando credenciales para dominio: ${dominio}`);
    
    // Verificar caché
    if (credencialesCache.has(dominio)) {
      const cacheData = credencialesCache.get(dominio);
      const ahora = Date.now();
      
      // Si el caché tiene menos de 15 minutos, usarlo
      if (ahora - cacheData.timestamp < 15 * 60 * 1000) {
        console.log(`Usando caché para ${dominio}, ${cacheData.credenciales.length} credenciales`);
        
        // Enviar credenciales sin filtrar (ya están filtradas)
        chrome.tabs.sendMessage(tab.id, {
          accion: 'set_credentials',
          credenciales: cacheData.credenciales
        }).catch(e => {
          console.error('Error al enviar credenciales desde caché:', e);
          // No reintentamos inmediatamente, el content script solicitará si es necesario
        });
        
        return;
      }
    }
    
    // Si no hay caché válida, cargar del servidor
    obtenerCredenciales(dominio)
      .then(credenciales => {
        console.log(`Obtenidas ${credenciales.length} credenciales del servidor`);
        
        if (credenciales.length === 0) {
          console.log('No se encontraron credenciales, no actualizando caché');
          return;
        }
        
        // Guardar en caché y filtrar
        const credencialesFiltradas = guardarCredencialesEnCache(dominio, credenciales);
        
        // Enviar al content script
        return chrome.tabs.sendMessage(tab.id, {
          accion: 'set_credentials',
          credenciales: credencialesFiltradas
        }).catch(e => {
          console.error('Error al enviar credenciales:', e);
          // No reintentamos inmediatamente, el content script solicitará si es necesario
        });
      })
      .catch(e => {
        console.error('Error al cargar credenciales para enviar:', e);
      });
  } catch (e) {
    console.error('Error al procesar URL para credenciales:', e);
  }
}

// Escuchar cambios de tabs para garantizar que los content scripts estén listos
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
    console.log('Tab actualizada (completa):', tabId, tab.url);
    
    // Esperar un poco antes de inyectar el script para asegurar que la página está lista
    setTimeout(() => {
      // Forzar inyección del content script
      inyectarContentScript(tabId, tab);
      
      // Proactivamente cargar y enviar credenciales para este dominio,
      // sin esperar a que el content script las solicite
      precargarCredencialesParaTab(tab);
    }, 500);
  }
});

// Función para inyectar el content script
function inyectarContentScript(tabId, tab) {
  // Verificar primero si el content script ya está activo
  chrome.tabs.sendMessage(tabId, { accion: 'check_ready' }, (response) => {
    const error = chrome.runtime.lastError;
    if (error) {
      // Mostrar mensaje de error específico para ayudar a debuggear
      console.log(`Content script no responde en tab ${tabId}, error:`, JSON.stringify(error));
      console.log(`Inyectando script en tab ${tabId}...`);
      // Inyectar el script directamente sin verificación adicional
      injectScript(tabId, tab);
    } else if (response && response.ready) {
      console.log(`Content script ya activo en tab ${tabId}`);
      // El script está listo, intentar enviar credenciales cacheadas si las hay
      enviarCredencialesCacheadas(tab);
    } else {
      console.log(`Respuesta inesperada del content script en tab ${tabId}:`, response);
      // Inyectar de todos modos para asegurarnos
      injectScript(tabId, tab);
    }
  });
}

// Función simplificada para la inyección directa de scripts
function injectScript(tabId, tab) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: ['content.js']
  })
  .then(() => {
    console.log(`Content script inyectado con éxito en tab ${tabId}`);
    // Esperar un poco y luego verificar si el script está activo
    setTimeout(() => {
      verifyAndSendCredentials(tabId, tab);
    }, 300);
  })
  .catch(error => {
    // Manejar el error específicamente
    console.error(`Error al inyectar script en tab ${tabId}:`, error.message);
    if (error.message.includes('Cannot access contents of url')) {
      console.log(`No se puede acceder al contenido de la página ${tab.url} - podría ser una página restringida`);
    }
  });
}

// Verificar si el content script está listo y enviar credenciales
function verifyAndSendCredentials(tabId, tab) {
  // Intentar contactar al content script
  chrome.tabs.sendMessage(tabId, { accion: 'check_ready' })
    .then(response => {
      if (response && response.ready) {
        console.log(`Content script está listo en tab ${tabId}, enviando credenciales...`);
        
        // Enviar credenciales inmediatamente
        enviarCredencialesAlTab(tabId, tab);
        
        // También registrar que el script está listo
        if (!contentScriptsReady.has(tabId)) {
          contentScriptsReady.set(tabId, {
            timestamp: Date.now(),
            url: tab.url
          });
        }
      } else {
        console.log(`Content script respondió pero no está listo en tab ${tabId}`);
        // Reintentar después de un breve retraso
        setTimeout(() => verifyAndSendCredentials(tabId, tab), 1000);
      }
    })
    .catch(error => {
      console.error(`Error al verificar si el content script está listo: ${error}`);
      // Probablemente el content script no está inyectado todavía o no responde
      // Reintentar menos frecuentemente
      setTimeout(() => verifyAndSendCredentials(tabId, tab), 2000);
    });
}

// Enviar credenciales al tab, usando caché si está disponible o cargando del servidor
function enviarCredencialesAlTab(tabId, tab) {
  try {
    if (!tab || !tab.url) {
      console.warn('Tab inválido para enviar credenciales');
      return;
    }

    const url = new URL(tab.url);
    const dominio = url.hostname;
    
    if (!dominio) {
      console.warn('No se pudo extraer el dominio de:', tab.url);
      return;
    }
    
    console.log(`📤 Enviando credenciales al tab ${tabId} para dominio: ${dominio}`);
    
    // Verificar caché
    if (credencialesCache.has(dominio)) {
      const cacheData = credencialesCache.get(dominio);
      const ahora = Date.now();
      
      // Si el caché tiene menos de 15 minutos, usarlo
      if (ahora - cacheData.timestamp < 15 * 60 * 1000) {
        console.log(`📋 Usando caché para ${dominio}, enviando ${cacheData.credenciales.length} credenciales`);
        
        // Enviar credenciales inmediatamente
        chrome.tabs.sendMessage(tabId, {
          accion: 'set_credentials',
          credenciales: cacheData.credenciales
        }).catch(e => {
          console.error('Error al enviar credenciales desde caché:', e);
        });
        
        return;
      }
    }
    
    // No hay caché válida, intentar cargar del servidor y enviar
    console.log(`🔄 No hay caché para ${dominio}, cargando del servidor...`);
    obtenerCredenciales(dominio)
      .then(credenciales => {
        // Guardar en caché para uso futuro
        const credencialesFiltradas = guardarCredencialesEnCache(dominio, credenciales);
        
        console.log(`📤 Enviando ${credencialesFiltradas.length} credenciales al tab ${tabId}`);
        
        // Enviar al content script
        return chrome.tabs.sendMessage(tabId, {
          accion: 'set_credentials',
          credenciales: credencialesFiltradas
        });
      })
      .catch(e => {
        console.error(`❌ Error al cargar/enviar credenciales: ${e.message}`);
      });
  } catch (e) {
    console.error('Error al procesar URL para enviar credenciales:', e);
  }
}

// Conectarse con el gestor de contraseñas y obtener credenciales según la URL
chrome.action.onClicked.addListener(async (tab) => {
  console.log('Boton de extension clickeado en tab:', tab.id, tab.url);
  
  try {
    // Obtenemos la URL del dominio actual
    if (!tab.url) {
      console.error('La pestana no tiene URL');
      return;
    }
    
    const url = new URL(tab.url);
    const dominio = url.hostname;
    console.log('Dominio detectado:', dominio);
    
    // Comprobamos conexión con el gestor
    try {
      console.log('Verificando conexion con PASSWD...');
      const testResponse = await fetch('http://localhost:8080/status', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        mode: 'cors'
      }).catch(error => {
        console.error('Error al conectar con el servidor de PASSWD:', error);
        throw new Error('No se pudo conectar con el gestor de contraseñas');
      });
      
      if (!testResponse || !testResponse.ok) {
        console.error('El servidor de PASSWD no está respondiendo correctamente');
        // Intentar con la ruta de prueba alternativa
        const altTestResponse = await fetch('http://localhost:8080/get-credentials?sitio=test', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          mode: 'cors'
        });
        
        if (!altTestResponse) {
          throw new Error('No se pudo conectar con el servidor de PASSWD');
        }
      }
      
      console.log('Conexión con PASSWD verificada');
      
    } catch (connectionError) {
      console.error('Error al verificar conexion:', connectionError);
      throw new Error('No se pudo conectar con el gestor de contrasenas. Verifique que la aplicacion PASSWD este en ejecucion.');
    }
    
    // Verificar que el content script está activo e inyectarlo si no
    inyectarContentScript(tab.id, tab);
    
    // Abrir el popup
    setTimeout(() => {
      console.log('Abriendo popup...');
      chrome.action.openPopup();
    }, 500);
    
  } catch (error) {
    console.error('Error en background script:', error);
    chrome.action.openPopup();
  }
  });

// Nueva función para precargar credenciales sin esperar solicitud
async function precargarCredencialesParaTab(tab) {
  if (!tab || !tab.url) return;
  
  try {
    const url = new URL(tab.url);
    const dominio = url.hostname;
    
    if (!dominio) return;
    
    console.log(`🔍 Precargando credenciales para: ${dominio}`);
    
    // Verificar si ya tenemos credenciales en caché
    if (credencialesCache.has(dominio)) {
      const cacheData = credencialesCache.get(dominio);
      const ahora = Date.now();
      
      // Si el caché es reciente (menos de 15 minutos), usarlo
      if (ahora - cacheData.timestamp < 15 * 60 * 1000) {
        console.log(`✓ Usando caché para precargar ${dominio} - ${cacheData.credenciales.length} credenciales`);
        // Las credenciales se enviarán cuando el content script esté listo
        return;
      }
    }
    
    // No hay caché reciente, obtener del servidor en segundo plano
    console.log(`🔄 Obteniendo credenciales para ${dominio} del servidor...`);
    obtenerCredenciales(dominio)
      .then(credenciales => {
        if (credenciales.length > 0) {
          console.log(`✅ Precargadas ${credenciales.length} credenciales para ${dominio}`);
          // Guardar en caché para uso futuro
          guardarCredencialesEnCache(dominio, credenciales);
        } else {
          console.log(`ℹ️ No se encontraron credenciales para ${dominio}`);
        }
      })
      .catch(error => {
        console.error(`❌ Error al precargar credenciales: ${error.message}`);
      });
    
  } catch (error) {
    console.error('Error al precargar credenciales:', error);
  }
}