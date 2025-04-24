// Importar Firebase
import './firebase/firebase-app-compat.js';
import './firebase/firebase-auth-compat.js'; 
import './firebase/firebase-firestore-compat.js';

// Importar FirebaseService desde el módulo
import { FirebaseService, firebaseService as importedFirebaseService } from './firebase_service.js';

// Registrar éxito de importaciones
console.log('Firebase y FirebaseService importados correctamente como módulos ES6');

// Variables globales para el script
const contentScriptsReady = new Map();  // Mapeo de tab ID a estado de contenido
const credencialesCache = new Map();    // Caché de credenciales por dominio
const formFillResponses = new Map();    // Callbacks de respuestas para llenado de formularios
const pendingNotificationsCredentials = new Map(); // Mapa para credenciales pendientes de guardar
let firebaseInitializationAttempts = 0;  // Contador de intentos de inicialización
let firebaseService = importedFirebaseService;  // Usar la instancia importada

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
  
  // Inicializar Firebase inmediatamente en la instalación
  initializeFirebaseWithRetry().then(() => {
    // Ejecutar diagnóstico después de inicializar
    setTimeout(diagnosticarEstadoFirebase, 1000);
    
    // Intentar login automático si corresponde
    setTimeout(intentarLoginAutomatico, 2000);
  });
});

// Verifica estado de autenticación al arrancar la extensión
chrome.runtime.onStartup.addListener(() => {
  checkAuthenticationAndRedirect();
  
  // Inicializar Firebase inmediatamente al arrancar
  initializeFirebaseWithRetry().then(() => {
    // Ejecutar diagnóstico después de inicializar
    setTimeout(diagnosticarEstadoFirebase, 1000);
    
    // Intentar login automático si corresponde
    setTimeout(intentarLoginAutomatico, 2000);
  });
});

// Función para inicializar Firebase con reintentos
async function initializeFirebaseWithRetry(delay = 2000, maxAttempts = 3) {
  console.log(`Intento de inicialización de Firebase #${firebaseInitializationAttempts + 1}`);
  
  // Verificar si Firebase ya está cargado
  const firebaseLoaded = typeof firebase !== 'undefined' && firebase.apps.length > 0;
  if (!firebaseLoaded) {
    console.error('Firebase no está disponible aunque debería estar importado como módulo ES6.');
    
    // Programar reintento si no excedimos el número máximo
    if (firebaseInitializationAttempts < maxAttempts) {
      firebaseInitializationAttempts++;
      console.log(`Programando reintento en ${delay}ms...`);
      setTimeout(() => initializeFirebaseWithRetry(delay * 2, maxAttempts), delay);
    }
    return;
  }
  
  // Intentar inicializar o usar FirebaseService
  try {
    // En el archivo firebase_service.js se crea una variable global 'firebaseService'
    if (typeof self.firebaseService !== 'undefined') {
      // En service workers, usamos 'self' en lugar de 'window'
      firebaseService = self.firebaseService;
      console.log('Usando instancia global de FirebaseService de self.firebaseService');
      firebaseInitializationAttempts = 0;
      return;
    } else if (typeof firebaseService !== 'undefined' && firebaseService !== null) {
      // Si la variable global ya está directamente disponible
      console.log('Variable global firebaseService ya disponible');
      firebaseInitializationAttempts = 0;
      return;
    } else if (typeof FirebaseService !== 'undefined') {
      // Si la clase está disponible pero no hay instancia, la creamos
      if (!firebaseService) {
        firebaseService = new FirebaseService();
        console.log('FirebaseService inicializado correctamente');
      }
      firebaseInitializationAttempts = 0;
    } else {
      console.error('No se encontró la variable global firebaseService ni la clase FirebaseService');
      
      // Programar reintento
      if (firebaseInitializationAttempts < maxAttempts) {
        firebaseInitializationAttempts++;
        console.log(`Programando reintento en ${delay}ms...`);
        setTimeout(() => initializeFirebaseWithRetry(delay * 2, maxAttempts), delay);
      }
    }
  } catch (e) {
    console.error('Error al inicializar FirebaseService:', e);
    
    // Programar reintento
    if (firebaseInitializationAttempts < maxAttempts) {
      firebaseInitializationAttempts++;
      console.log(`Programando reintento en ${delay}ms...`);
      setTimeout(() => initializeFirebaseWithRetry(delay * 2, maxAttempts), delay);
    }
  }
}

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

// Función para extraer el dominio base de una URL (versión global)
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

// Función para filtrar credenciales por dominio de manera consistente
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
    console.log('Cargando Firebase en un Service Worker tipo módulo');
    
    // En un módulo ES6 no podemos usar importScripts
    // En su lugar, podemos verificar si Firebase ya está disponible
    // o informar que debe importarse correctamente en el archivo como módulo
    
    if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
      console.log('Firebase ya está cargado y disponible');
      return true;
    }
    
    console.log('Firebase no está disponible. En módulos ES6 debes importarlo explícitamente al inicio del archivo');
    console.log('Añade: import "./firebase/firebase-app-compat.js" y los demás módulos necesarios');
    
    // Para módulos ES6, debemos modificar el enfoque de carga
    // Firebase debería importarse al inicio del archivo usando import
    return false;
  } catch (e) {
    console.error('Error al intentar cargar Firebase en background.js:', e);
    return false;
  }
}

// Intentar cargar los scripts de Firebase
const firebaseLoaded = loadFirebaseScripts();
if (!firebaseLoaded) {
  console.error('No se pudieron cargar los scripts de Firebase. Algunas funcionalidades no estarán disponibles.');
}

// Iniciar proceso de inicialización con reintentos
initializeFirebaseWithRetry();

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
        loadFirebaseScripts();
        
        // Verificar si se cargó correctamente
        if (typeof firebase === 'undefined') {
          console.error('Error crítico: No se pudieron cargar los scripts de Firebase');
          return { success: false, error: 'No se pudieron cargar los scripts de Firebase' };
        }
        
        firebaseReady = true;
      } catch (loadError) {
        console.error('Error al cargar scripts de Firebase:', loadError);
        return { success: false, error: 'Error al cargar Firebase: ' + loadError.message };
      }
    }
    
    // Verificar si tenemos servicio de Firebase
    if (!firebaseService) {
      console.log('Servicio de Firebase no inicializado, intentando inicializar');
      const initialized = await reinitializeFirebaseService();
      if (!initialized) {
        console.error('No se pudo inicializar FirebaseService');
        return { success: false, error: 'Servicio de Firebase no disponible' };
      }
    }
    
    // Verificar autenticación
    const isAuthenticated = await firebaseService.isUserAuthenticated();
    console.log('Estado de autenticación:', isAuthenticated ? 'Autenticado' : 'No autenticado');
    
    if (!isAuthenticated) {
      console.error('Usuario no autenticado, no se pueden guardar credenciales');
      return { 
        success: false, 
        error: 'Usuario no autenticado', 
        requiresAuth: true
      };
    }
    
    // Guardar credencial usando la nueva estructura de parámetros
    console.log('Intentando guardar credencial en Firebase con los datos:', {
      sitio: credencial.sitio,
      usuario: credencial.usuario,
      contraseña: 'presente (oculta)'
    });
    
    try {
      // Llamar a saveCredential con el objeto de credenciales
      const credentialData = await firebaseService.saveCredential(credencial);
      
      console.log('Credencial guardada exitosamente con ID:', credentialData.id);
      
      // Si guardamos correctamente, eliminamos de la caché para forzar una recarga
      const dominio = getBaseDomain(credencial.sitio);
      console.log(`Invalidando caché para dominio ${dominio} tras guardar nueva credencial`);
        credencialesCache.delete(dominio);
      
      return { 
        success: true, 
        message: 'Credencial guardada correctamente',
        id: credentialData.id
      };
    } catch (error) {
      console.error('Error al guardar credencial en Firebase:', error);
      
      // Verificar si es un error de autenticación
      if (error.message && error.message.includes('no autenticado')) {
        return { 
          success: false, 
          error: 'Usuario no autenticado', 
          requiresAuth: true
        };
      }
      
      // Verificar si es un error de permisos
      if (error.message && error.message.includes('permisos')) {
        return {
          success: false,
          error: 'Error de permisos: No tienes acceso para guardar credenciales',
          permissionDenied: true
        };
      }
      
      return { 
        success: false, 
        error: error.message || 'Error al guardar credencial'
      };
    }
  } catch (error) {
    console.error('Error general al guardar credenciales en Firebase:', error);
    return { success: false, error: error.message || 'Error desconocido' };
  }
}

// Función para reintentar la inicialización de Firebase Service
async function reinitializeFirebaseService() {
  console.log('Intentando reinicializar FirebaseService...');
  
  // Verificar si ya está inicializado
  if (firebaseService !== null && typeof firebaseService === 'object') {
    console.log('FirebaseService ya está inicializado');
    return true;
  }

  // Cargar scripts de Firebase si es necesario
  let firebaseLoaded = typeof firebase !== 'undefined' && firebase.apps.length > 0;
  if (!firebaseLoaded) {
    console.log('Firebase no está cargado, intentando verificar disponibilidad...');
    firebaseLoaded = loadFirebaseScripts();
    if (!firebaseLoaded) {
      console.error('No se pudieron cargar los scripts de Firebase.');
      return false;
    }
  }
  
  // En un módulo ES6, intentar acceder a la variable global firebaseService
  try {
    // Intentar acceder a la variable global definida en firebase_service.js
    if (typeof self.firebaseService !== 'undefined') {
      // En service workers, usamos 'self' en lugar de 'window'
      firebaseService = self.firebaseService;
      console.log('Obtenida instancia global de FirebaseService desde self.firebaseService');
        return true;
    } else if (typeof firebaseService !== 'undefined' && firebaseService !== null) {
      // La variable global ya está asignada
      console.log('Variable global firebaseService ya disponible');
      return true;
    } else if (typeof FirebaseService !== 'undefined') {
      // Si la clase está disponible, crear una nueva instancia
      firebaseService = new FirebaseService();
      console.log('FirebaseService reinicializado con éxito usando la clase');
      return true;
    } else {
      console.error('No se pudo obtener FirebaseService desde la variable global ni desde la clase');
      return false;
    }
  } catch (e) {
    console.error('Error al inicializar FirebaseService:', e);
    return false;
  }
}

// Añadir un método para verificar el estado completo de Firebase y la autenticación
async function diagnosticarEstadoFirebase() {
  console.log('=== DIAGNÓSTICO FIREBASE SERVICE ===');
  
  // 1. Verificar importaciones y disponibilidad
  console.log(`- Firebase disponible: ${typeof firebase !== 'undefined'}`);
  if (typeof firebase !== 'undefined') {
    console.log(`- Firebase apps inicializadas: ${firebase.apps.length}`);
  }
  
  console.log(`- Clase FirebaseService disponible: ${typeof FirebaseService !== 'undefined'}`);
  console.log(`- Instancia firebaseService: ${firebaseService !== null ? 'Presente' : 'Null'}`);
  
  if (firebaseService !== null) {
    console.log(`- firebaseService.firebaseAvailable: ${firebaseService.firebaseAvailable}`);
    console.log(`- firebaseService.auth disponible: ${firebaseService.auth !== undefined}`);
    
    try {
      const user = await firebaseService.getCurrentUser();
      console.log(`- Usuario actual: ${user ? user.email : 'No autenticado'}`);
      
      // Verificar almacenamiento local
      chrome.storage.local.get('userAuthenticated', (data) => {
        console.log(`- Estado userAuthenticated en storage: ${data.userAuthenticated ? 'Autenticado' : 'No autenticado'}`);
      });
    } catch (e) {
      console.error('Error al obtener usuario actual:', e);
    }
  }
  
  console.log('=== FIN DIAGNÓSTICO ===');
}

// Modificar handleCheckAuthStatus para diagnosticar el problema
async function handleCheckAuthStatus(sendResponse) {
  try {
    console.log('Verificando estado de autenticación...');
    
    // Ejecutar diagnóstico
    await diagnosticarEstadoFirebase();
    
    // Verificar si firebaseService está inicializado
    if (!firebaseService) {
      console.log('FirebaseService no disponible, intentando reinicializar...');
      const initialized = await reinitializeFirebaseService();
      if (!initialized) {
        console.error('No se pudo inicializar FirebaseService');
          sendResponse({ 
          success: false, 
          error: 'Servicio de Firebase no disponible', 
          authenticated: false 
        });
        return;
      }
    }
    
    // Intentar login automático si es necesario
    console.log('Verificando si es necesario reconectar la sesión...');
    await intentarLoginAutomatico();
    
    // Intentar obtener estado de autenticación
    let isAuthenticated = false;
    try {
      isAuthenticated = await firebaseService.isUserAuthenticated();
      console.log('Estado de autenticación desde Firebase:', isAuthenticated);
    } catch (authError) {
      console.error('Error al verificar autenticación:', authError);
      // Intentar verificar con almacenamiento local
      chrome.storage.local.get('userAuthenticated', (data) => {
        console.log('Usando estado de autenticación desde almacenamiento:', data.userAuthenticated);
        isAuthenticated = data.userAuthenticated === true;
      });
    }
    
    let user = null;
    if (isAuthenticated) {
      try {
        user = await firebaseService.getCurrentUser();
        console.log('Usuario obtenido:', user ? user.email : 'ninguno');
      } catch (userError) {
        console.error('Error al obtener usuario actual:', userError);
      }
    }
    
    console.log(`Estado de autenticación final: ${isAuthenticated ? 'Autenticado' : 'No autenticado'}`);
    
    // Actualizar estado local
    chrome.storage.local.set({ userAuthenticated: isAuthenticated });
    
    // Actualizar popup
    if (isAuthenticated) {
      chrome.action.setPopup({ popup: 'popup.html' });
    } else {
      chrome.action.setPopup({ popup: 'login.html' });
    }
    
    sendResponse({ 
      success: true, 
      authenticated: isAuthenticated,
      user: user ? { 
        email: user.email, 
        uid: user.uid,
        displayName: user.displayName
      } : null
    });
    } catch (e) {
    console.error('Error en handleCheckAuthStatus:', e);
    sendResponse({ success: false, error: e.message, authenticated: false });
  }
}

// Obtener credenciales directamente desde Firebase
async function obtenerCredenciales(dominio) {
  console.log(`Obteniendo credenciales para dominio: ${dominio}`);
  
  try {
    // 1. Verificar si hay caché válida
    if (credencialesCache.has(dominio)) {
      const cacheEntry = credencialesCache.get(dominio);
      const ahora = Date.now();
      
      // Caché válida por 5 minutos (300000 ms)
      if (ahora - cacheEntry.timestamp < 300000) {
        console.log(`Usando credenciales en caché para ${dominio} (${cacheEntry.credenciales.length} encontradas)`);
        return { 
          success: true, 
          mensaje: 'Obtenidas de caché', 
          credenciales: cacheEntry.credenciales,
          fromCache: true
        };
          } else {
        console.log(`Caché expirada para ${dominio}, solicitando nuevas credenciales`);
      }
    }
    
    // 2. Verificar si Firebase está disponible
    if (!firebaseService) {
      console.log('Servicio de Firebase no disponible, intentando reinicializar...');
      const initialized = await reinitializeFirebaseService();
      if (!initialized) {
        console.error('Servicio de Firebase no disponible');
        return { success: false, error: 'Servicio de Firebase no disponible' };
      }
    }
    
    // 3. Verificar si el usuario está autenticado según Firebase
    let isAuthenticated = false;
    try {
      isAuthenticated = await firebaseService.isUserAuthenticated();
      console.log('Estado de autenticación según Firebase:', isAuthenticated);
    } catch (e) {
      console.error('Error al verificar autenticación en Firebase:', e);
    }

    // 4. Verificar si el usuario debería estar autenticado según storage
    const authFromStorage = await new Promise(resolve => {
      chrome.storage.local.get('userAuthenticated', (data) => {
        console.log('Estado de autenticación según storage:', data.userAuthenticated);
        resolve(data.userAuthenticated === true);
        });
      });
      
    // 5. Si hay discrepancia (debería estar autenticado pero no lo está), intentar reconciliar
    if (authFromStorage && !isAuthenticated) {
      console.log('Discrepancia en estado de autenticación, intentando inicio de sesión automático...');
      
      // Intentar iniciar sesión automáticamente con credenciales almacenadas
      const loginExitoso = await intentarLoginAutomatico();
      
      if (loginExitoso) {
        console.log('Inicio de sesión automático exitoso, continuando con la obtención de credenciales');
        isAuthenticated = true;
      } else {
        console.log('No se pudo iniciar sesión automáticamente');
        
        // Intentar reconectar una última vez usando el diagnóstico
        await diagnosticarEstadoFirebase();
        
        // Esperar un momento y reinicializar FirebaseService
        await new Promise(resolve => setTimeout(resolve, 1000));
        await reinitializeFirebaseService();
        
        // Verificar nuevamente autenticación
        isAuthenticated = await firebaseService.isUserAuthenticated();
        console.log('Estado de autenticación después de intento final:', isAuthenticated);
      }
    }
    
    // 6. Si sigue sin estar autenticado, devolver error
    if (!isAuthenticated) {
      console.error('Usuario no autenticado, no se pueden obtener credenciales');
      return { 
        success: false, 
        error: 'Usuario no autenticado', 
        requiresAuth: true,
        credenciales: []
      };
    }
    
    // 7. Obtener credenciales de Firebase
    console.log('Consultando Firebase para obtener credenciales...');
    const allCredentials = await firebaseService.getAllCredentials();
    
    // Verificar que las credenciales tengan contraseñas
    const credencialesConContraseña = allCredentials.map(cred => {
      // Si no hay contraseña en el objeto, usar una propiedad alternativa
      if (!cred.contraseña) {
        cred.contraseña = cred.password || '';
        console.log(`Añadiendo contraseña faltante para ${cred.usuario} (${cred.sitio})`);
      }
      
      // Asegurar que tengamos ambas propiedades: contraseña y password
      return {
        ...cred,
        contraseña: cred.contraseña || '',
        password: cred.contraseña || cred.password || ''
      };
    });
    
    // Log para debug
    console.log(`Se encontraron ${allCredentials.length} credenciales en Firebase`);
    console.log('Muestra de propiedades de credenciales:', allCredentials.slice(0, 3).map(c => ({
      sitio: c.sitio,
      usuario: c.usuario,
      tieneContraseña: !!c.contraseña || !!c.password,
      propiedades: Object.keys(c)
    })));
    
    // 8. Filtrar por dominio
    const credencialesFiltradas = filtrarCredencialesPorDominio(credencialesConContraseña, dominio);
    console.log(`Se encontraron ${credencialesFiltradas.length} credenciales en Firebase para ${dominio}`);
    
    // 9. Actualizar caché
    guardarCredencialesEnCache(dominio, credencialesConContraseña);
    
    return {
      success: true,
      mensaje: 'Credenciales obtenidas desde Firebase',
      credenciales: credencialesFiltradas,
      fromCache: false
    };
  } catch (error) {
    console.error('Error al obtener credenciales:', error);
    return { success: false, error: error.message, credenciales: [] };
  }
}

// Procesar datos de las credenciales para la respuesta
function processCredentialsData(data) {
  if (!data || !data.credenciales) {
    return { credenciales: [] };
  }
  
  try {
    // Información detallada para diagnóstico
    console.log('Procesando datos de credenciales recibidos:', 
      data.credenciales.map(c => ({
        sitio: c.sitio || c.site || c.url,
        usuario: c.usuario || c.username || c.email,
        propiedades: Object.keys(c)
      }))
    );

    // Convertir objetos de credenciales a formato esperado por content script
    const credencialesProcesadas = data.credenciales.map(cred => {
      // Extraer valores con compatibilidad para distintos nombres de campos
      const sitio = cred.sitio || cred.site || cred.url || cred.domain || cred.dominio || '';
      const usuario = cred.usuario || cred.username || cred.email || cred.correo || '';
      const contraseña = cred.contraseña || cred.password || cred.pass || '';
      
      // Asegurarse de que todos los campos necesarios estén presentes
      return {
        id: cred.id || `cred_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        sitio: sitio,
        site: sitio, // Duplicado para compatibilidad
        url: sitio, // Duplicado para compatibilidad
        usuario: usuario,
        username: usuario, // Para compatibilidad
        email: usuario, // Para compatibilidad
        contraseña: contraseña, // Nombre en español
        password: contraseña, // Nombre en inglés
        pass: contraseña, // Otro nombre común
        timestamp: cred.timestamp || Date.now()
      };
    });
    
    console.log('Credenciales procesadas y normalizadas:', 
      credencialesProcesadas.map(c => ({
        sitio: c.sitio,
        usuario: c.usuario,
        tieneContraseña: !!c.contraseña,
        propiedades: Object.keys(c)
      }))
    );
    
    return { 
      credenciales: credencialesProcesadas,
      credentials: credencialesProcesadas, // Duplicado para compatibilidad con ambos nombres
      success: true
    };
        } catch (e) {
    console.error('Error al procesar datos de credenciales:', e);
    return { 
      credenciales: [],
      credentials: [], 
      success: false,
      error: e.message
    };
  }
}

// Enviar credenciales cacheadas al tab especificado
function enviarCredencialesCacheadas(tab) {
  if (!tab || !tab.url) {
    console.warn('No se puede enviar información sin una URL válida del tab');
    return Promise.resolve({ credenciales: [] });
  }
  
  try {
    // Obtener el dominio base
    const url = new URL(tab.url);
    const dominio = getBaseDomain(url.hostname);
    
    // Verificar caché
    if (credencialesCache.has(dominio)) {
      const data = credencialesCache.get(dominio);
      console.log(`Enviando ${data.credenciales.length} credenciales cacheadas para ${dominio}`)
      
      return Promise.resolve({
        credenciales: data.credenciales.map(cred => ({
          url: cred.sitio,
          username: cred.usuario,
          password: cred.password,
          id: cred.id
        }))
      });
    } else {
      console.log(`No hay credenciales en caché para ${dominio}`);
      return Promise.resolve({ credenciales: [] });
    }
    } catch (e) {
    console.error('Error al enviar credenciales cacheadas:', e);
    return Promise.resolve({ credenciales: [] });
  }
}

// Registrar listeners para mensajes
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    // Registrar todos los mensajes recibidos para depuración
    console.log('Mensaje recibido en background:', message.action);
    
    // Manejar diferentes tipos de mensajes
    if (message.action === 'check_auth_status') {
      handleCheckAuthStatus(sendResponse);
    }
    
    // Nuevo handler para sincronizar estado de autenticación desde el popup/página de login
    else if (message.action === 'sync_auth_state') {
      console.log('Sincronizando estado de autenticación:', message.authenticated ? 'Autenticado' : 'No autenticado');
      
      if (message.authenticated) {
        // Actualizar storage con estado de autenticación
        chrome.storage.local.set({
          userAuthenticated: true,
          userEmail: message.email,
          userId: message.uid,
          lastAuthTime: Date.now()
        }, () => {
          console.log('Estado de autenticación sincronizado en background');
          
          // Si hay que guardar contraseña, guardarla en storage local
          if (message.guardarPassword && message.password) {
            chrome.storage.local.set({
              savedEmail: message.email,
              savedPassword: message.password
            }, () => {
              console.log('Credenciales guardadas en storage para auto-login futuro');
            });
          }
          
          // Intentar verificar con firebaseService que el usuario esté autenticado
          if (firebaseService && firebaseService.auth) {
            const currentUser = firebaseService.auth.currentUser;
            if (!currentUser) {
              console.log('Firebase auth en background no tiene usuario, intentando re-autenticar...');
              // No intentamos auto-login aquí para evitar loops, solo reportamos el estado
            } else {
              console.log('Usuario también autenticado en firebaseService del background:', currentUser.email);
            }
          }
          
          sendResponse({ success: true, message: 'Estado sincronizado correctamente' });
              });
            } else {
        // Limpiar estado de autenticación
        chrome.storage.local.set({
          userAuthenticated: false,
          userEmail: null,
          userId: null,
          lastAuthTime: null
        }, () => {
          console.log('Estado de no-autenticación sincronizado en background');
          sendResponse({ success: true, message: 'Estado de cierre de sesión sincronizado' });
        });
      }
      
      return true; // Mantener el canal abierto para sendResponse asíncrono
    }
    
    // Notificación de cambio de popup predeterminado
    else if (message.action === 'popup_changed') {
      console.log('Recibida notificación de cambio de popup predeterminado');
            sendResponse({ success: true });
      return false;
    }
    
    // Respuesta asíncrona
    let asyncResponseRequired = false;
    
    // Procesar solicitud según acción
    switch (message.action) {
      case 'content_script_ready':
        handleContentScriptReady(sender.tab, sendResponse);
        asyncResponseRequired = true;
        break;
        
      case 'get_credentials_for_site':
        handleGetCredentials(message, sender.tab, sendResponse);
        asyncResponseRequired = true;
        break;
        
      case 'fill_form_response':
        handleFormFillResponse(message, sender.tab, sendResponse);
        break;
        
      case 'guardar_credenciales':
        handleSaveCredentials(message, sender.tab, sendResponse);
        asyncResponseRequired = true;
        break;
        
      case 'login_with_credentials':
        handleLoginWithCredentials(message, sendResponse);
        asyncResponseRequired = true;
        break;
        
      case 'register_user':
        handleRegisterUser(message, sendResponse);
        asyncResponseRequired = true;
        break;
        
      case 'logout_user':
        handleLogoutUser(sendResponse);
        asyncResponseRequired = true;
        break;
        
      case 'show_login_popup':
        handleShowLoginPopup(message, sender.tab, sendResponse);
        asyncResponseRequired = true;
        break;
        
      case 'show_save_notification':
        handleShowSaveNotification(message, sender.tab, sendResponse);
        asyncResponseRequired = true;
        break;
      
      case 'log_message':
        // Simple handler for log messages from content scripts
        console.log(`[Content Log][${sender.tab?.id}]: ${message.text || '(No message)'}`);
        if (message.level === 'error') {
          console.error(`[Content Error][${sender.tab?.id}]: ${message.text || '(No message)'}`);
        }
        sendResponse({ success: true });
        break;
        
      default:
        console.warn(`Acción desconocida: ${message.action}`);
        sendResponse({ success: false, error: 'Acción no soportada' });
    }
    
    // Debemos retornar true para indicar que la respuesta se enviará asincrónicamente
    return asyncResponseRequired;
  } catch (error) {
    console.error('Error al procesar mensaje en background:', error);
    sendResponse({ success: false, error: error.message });
    return false;
  }
});

// Handler para cuando el content script notifica que está listo
async function handleContentScriptReady(tab, sendResponse) {
  try {
    if (!tab || !tab.id) {
      console.error('Tab no válido en handleContentScriptReady');
      sendResponse({ success: false, error: 'Tab no válido' });
      return;
    }
    
    console.log(`Content script listo en tab ${tab.id}: ${tab.url}`);
    contentScriptsReady.set(tab.id, { ready: true, url: tab.url, timestamp: Date.now() });
    
    // Precargar credenciales para este dominio
    const credenciales = await precargarCredencialesParaTab(tab);
    
          sendResponse({ 
      success: true, 
      message: 'Background listo para procesar solicitudes',
      credenciales: credenciales
          });
    } catch (e) {
    console.error('Error en handleContentScriptReady:', e);
      sendResponse({ success: false, error: e.message });
  }
}

// Handler para obtener credenciales
async function handleGetCredentials(message, tab, sendResponse) {
  try {
    if (!tab || !tab.url) {
      console.error('Tab no válido en handleGetCredentials');
      sendResponse({ success: false, error: 'Tab no válido', credenciales: [], credentials: [] });
      return;
    }
    
    const url = message.url || tab.url;
    console.log(`Solicitando credenciales para: ${url}`);
    const dominio = getBaseDomain(new URL(url).hostname);
    console.log(`Dominio base para búsqueda: ${dominio}`);
    
    // Verificar y reparar el estado de autenticación antes de obtener credenciales
    console.log('Verificando estado de autenticación antes de obtener credenciales...');
    const estadoAutenticacion = await checkAndRepairAuthState();
    
    if (!estadoAutenticacion) {
      console.log('Usuario no autenticado después de intentar reparar, solicitando login manual');
      // Enviar mensaje al content script para mostrar mensaje de login
      if (tab.id) {
        try {
          chrome.tabs.sendMessage(tab.id, { 
            action: 'mostrar_login_requerido',
            mensaje: 'Es necesario iniciar sesión para ver las credenciales'
          });
        } catch (e) {
          console.error('Error al enviar mensaje de login requerido:', e);
        }
      }
      
      sendResponse({ 
        success: false, 
        error: 'Requiere autenticación', 
        credenciales: [], 
        credentials: []
      });
      return;
    }
    
    // Obtener credenciales de Firebase
    const result = await obtenerCredenciales(dominio);
    
    if (result.success) {
      // Procesar datos para asegurar formato correcto
      const processedData = processCredentialsData(result);
      
      // Verificar que las credenciales tengan contraseñas
      const tienenContraseñas = processedData.credenciales.some(c => 
        !!c.contraseña || !!c.password || !!c.pass
      );
      
      if (!tienenContraseñas && processedData.credenciales.length > 0) {
        console.warn('⚠️ ADVERTENCIA: Las credenciales no tienen contraseñas');
        // Información de depuración
        console.log('Credenciales sin procesar:', 
          result.credenciales.map(c => ({
            sitio: c.sitio, 
            usuario: c.usuario, 
            props: Object.keys(c)
          }))
        );
      }
      
      // Información detallada para diagnóstico sobre lo que se está devolviendo
      console.log(`Enviando ${processedData.credenciales.length} credenciales al solicitante con el siguiente formato:`, 
        processedData.credenciales.length > 0 ? 
          {
            ejemplo: processedData.credenciales[0],
            campos: Object.keys(processedData.credenciales[0])
          } : 'No hay credenciales'
      );
      
      // Asegurar que las credenciales estén disponibles bajo ambos nombres para compatibilidad
      processedData.credentials = processedData.credenciales;
      processedData.success = true;
      
      sendResponse(processedData);
    } else {
      console.error('Error al obtener credenciales:', result.error);
      sendResponse({ 
        success: false, 
        error: result.error, 
        credenciales: [], 
        credentials: []
      });
    }
  } catch (e) {
    console.error('Error en handleGetCredentials:', e);
    sendResponse({ 
      success: false, 
      error: e.message, 
      credenciales: [], 
      credentials: []
    });
  }
}

// Handler para guardar credenciales
async function handleSaveCredentials(message, tab, sendResponse) {
  try {
    console.log('Procesando solicitud de guardar credenciales', message);
    
    // Verificar si tenemos todos los datos necesarios
    if (!message.credencial || !message.credencial.sitio || !message.credencial.usuario || !message.credencial.contraseña) {
      console.error('Error: Datos incompletos para guardar credenciales', message);
      sendResponse({ success: false, error: 'Datos incompletos' });
      return;
    }
    
    // Guardar credenciales en Firebase
    const resultado = await guardarCredencialesEnFirebase(message.credencial);
    
    if (resultado.success) {
      console.log('Credenciales guardadas correctamente en Firebase');
      
      // Actualizar la caché local para este dominio
      await precargarCredencialesParaTab(tab);
      
      sendResponse({ success: true, message: 'Credenciales guardadas correctamente' });
          } else {
      console.error('Error al guardar credenciales:', resultado.error);
      
      // Si es un error de autenticación, intentar mostrar el popup de login
      if (resultado.error.includes('autenticación') || resultado.error.includes('autenticado')) {
        chrome.tabs.sendMessage(tab.id, { action: 'mostrar_login_error', error: resultado.error });
      }
      
      sendResponse({ success: false, error: resultado.error });
    }
  } catch (error) {
    console.error('Error inesperado al guardar credenciales:', error);
    sendResponse({ success: false, error: 'Error interno al guardar credenciales' });
  }
}

// Handler para respuesta de llenado de formulario
function handleFormFillResponse(message, tab, sendResponse) {
  try {
    const { requestId, success, error } = message;
    
    if (requestId && formFillResponses.has(requestId)) {
      const callback = formFillResponses.get(requestId);
      formFillResponses.delete(requestId);
      
      if (success) {
        console.log(`Formulario llenado correctamente (${requestId})`);
        callback({ success: true });
    } else {
        console.error(`Error al llenar formulario (${requestId}): ${error}`);
        callback({ success: false, error });
      }
    } else {
      console.warn(`Recibida respuesta para solicitud desconocida: ${requestId}`);
    }
    
    sendResponse({ success: true });
  } catch (e) {
    console.error('Error en handleFormFillResponse:', e);
    sendResponse({ success: false, error: e.message });
  }
}

// Handler para iniciar sesión con credenciales
async function handleLoginWithCredentials(message, sendResponse) {
  try {
    if (!message.email || !message.password) {
      console.error('Faltan credenciales para iniciar sesión');
      sendResponse({ success: false, error: 'Datos incompletos' });
      return;
    }

    console.log(`Iniciando sesión con email: ${message.email}`);
    
    // Iniciar sesión en Firebase
    const result = await firebaseService.login(message.email, message.password);
    
    if (result.success) {
      console.log('Sesión iniciada correctamente');
      
      // Determinar si se debe guardar la contraseña
      const guardarPassword = message.guardarPassword !== undefined ? message.guardarPassword : true;
      console.log(`¿Guardar contraseña para login automático? ${guardarPassword ? 'Sí' : 'No'}`);
      
      // Guardar estado de autenticación y email siempre, contraseña solo si se solicita
      if (guardarPassword) {
        // Guardar todo incluyendo la contraseña para login automático 
        chrome.storage.local.set({ 
          userAuthenticated: true, 
          userEmail: message.email,
          userPassword: message.password
        });
        console.log('Credenciales completas guardadas para login automático');
      } else {
        // Guardar solo el estado de autenticación y el email
        chrome.storage.local.set({ 
          userAuthenticated: true, 
          userEmail: message.email,
          userPassword: null // No guardar contraseña
        });
        console.log('Contraseña no guardada para login automático');
      }
      
      // Cambiar popup
      chrome.action.setPopup({ popup: 'popup.html' });
      
      // Verificar si hay credenciales pendientes por guardar
      chrome.storage.local.get('pendingCredentials', async (data) => {
        if (data.pendingCredentials) {
          console.log('Intentando guardar credenciales pendientes...');
          
          // Guardar credenciales pendientes
          await guardarCredencialesEnFirebase(data.pendingCredentials);
          
          // Eliminar credenciales pendientes
          chrome.storage.local.remove('pendingCredentials');
        }
      });
      
      sendResponse({ success: true, user: result.user });
    } else {
      console.error('Error al iniciar sesión:', result.error);
      sendResponse({ success: false, error: result.error });
    }
  } catch (e) {
    console.error('Error en handleLoginWithCredentials:', e);
    sendResponse({ success: false, error: e.message });
  }
}

// Handler para registrar usuario
async function handleRegisterUser(message, sendResponse) {
  try {
    if (!message.email || !message.password) {
      console.error('Faltan datos para registrar usuario');
      sendResponse({ success: false, error: 'Datos incompletos' });
          return;
        }
        
    console.log(`Registrando usuario con email: ${message.email}`);
    
    // Registrar usuario en Firebase
    const result = await firebaseService.registerUser(message.email, message.password);
    
    if (result.success) {
      console.log('Usuario registrado correctamente');
      
      // Guardar estado de autenticación y credenciales para login automático posterior
      chrome.storage.local.set({ 
        userAuthenticated: true,
        userEmail: message.email,
        userPassword: message.password // Almacenamos contraseña para permitir login automático
      });
      
      // Cambiar popup
      chrome.action.setPopup({ popup: 'popup.html' });
      
      sendResponse({ success: true, user: result.user });
    } else {
      console.error('Error al registrar usuario:', result.error);
      sendResponse({ success: false, error: result.error });
    }
  } catch (e) {
    console.error('Error en handleRegisterUser:', e);
    sendResponse({ success: false, error: e.message });
  }
}

// Handler para cerrar sesión
async function handleLogoutUser(sendResponse) {
  try {
    console.log('Cerrando sesión...');
    
    // Cerrar sesión en Firebase
    const result = await firebaseService.logout();
    
    if (result.success) {
      console.log('Sesión cerrada correctamente');
      
      // Actualizar estado de autenticación y eliminar credenciales almacenadas
      chrome.storage.local.set({ 
        userAuthenticated: false,
        userEmail: null,
        userPassword: null
      });
      
      // Cambiar popup
      chrome.action.setPopup({ popup: 'login.html' });
      
      // Limpiar caché
      credencialesCache.clear();
      
      sendResponse({ success: true });
    } else {
      console.error('Error al cerrar sesión:', result.error);
      sendResponse({ success: false, error: result.error });
    }
  } catch (e) {
    console.error('Error en handleLogoutUser:', e);
    sendResponse({ success: false, error: e.message });
  }
}

// Handler para mostrar popup de login
async function handleShowLoginPopup(message, tab, sendResponse) {
  try {
    console.log('Mostrando popup de login...');
    
    // Cambiar popup
    chrome.action.setPopup({ popup: 'login.html' });
    
    // Abrir popup
    chrome.action.openPopup();
    
    sendResponse({ success: true });
  } catch (e) {
    console.error('Error en handleShowLoginPopup:', e);
    sendResponse({ success: false, error: e.message });
  }
}

// Handler para mostrar notificación de guardar
function handleShowSaveNotification(message, tab, sendResponse) {
  try {
    if (!message.sitio || !message.usuario || !message.contraseña) {
      console.error('Faltan datos para mostrar notificación de guardar');
      sendResponse({ success: false, error: 'Datos incompletos' });
      return;
    }

    console.log(`Mostrando notificación para guardar: ${message.sitio} (Usuario: ${message.usuario})`);
    
    // Generar ID único para la notificación
    const notificationId = `save_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Guardar credenciales pendientes
    pendingNotificationsCredentials.set(notificationId, {
      sitio: message.sitio,
      usuario: message.usuario,
      contraseña: message.contraseña,
      timestamp: Date.now()
    });
    
    // Crear notificación
    chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/logo_passwd.JPEG'),
      title: 'PASSWD - Guardar credenciales',
      message: `¿Quieres guardar tus credenciales para ${getBaseDomain(message.sitio)}?`,
      buttons: [
        { title: 'Guardar' },
        { title: 'Cancelar' }
      ],
      priority: 2,
      requireInteraction: true
    });
    
    // Configurar listener para botón de notificación (si no está configurado ya)
    if (!chrome.notifications.onButtonClicked.hasListeners()) {
      chrome.notifications.onButtonClicked.addListener(async (notifId, buttonIndex) => {
        // Verificar si es una de nuestras notificaciones
        if (pendingNotificationsCredentials.has(notifId)) {
          const credentials = pendingNotificationsCredentials.get(notifId);
          
          // Botón 0 = Guardar, Botón 1 = Cancelar
          if (buttonIndex === 0) {
            console.log(`Usuario eligió guardar credenciales de notificación ${notifId}`);
            
            // Guardar credenciales
            const result = await guardarCredencialesEnFirebase(credentials);
            if (result.success) {
              chrome.notifications.create({
                type: 'basic',
                iconUrl: chrome.runtime.getURL('icons/logo_passwd.JPEG'),
                title: 'PASSWD - Éxito',
                message: 'Credenciales guardadas correctamente',
                priority: 0
              });
            } else {
              chrome.notifications.create({
                type: 'basic',
                iconUrl: chrome.runtime.getURL('icons/logo_passwd.JPEG'),
                title: 'PASSWD - Error',
                message: `Error al guardar: ${result.error}`,
                priority: 0
              });
            }
          } else {
            console.log(`Usuario eligió cancelar guardar credenciales de notificación ${notifId}`);
          }
          
          // Limpiar de la colección
          pendingNotificationsCredentials.delete(notifId);
          
          // Cerrar la notificación
          chrome.notifications.clear(notifId);
        }
      });
    }
    
    sendResponse({ success: true, notificationId });
  } catch (e) {
    console.error('Error en handleShowSaveNotification:', e);
    sendResponse({ success: false, error: e.message });
  }
}

// Función para precargar credenciales para un tab
async function precargarCredencialesParaTab(tab) {
  try {
    if (!tab || !tab.url) return [];
    
    const url = new URL(tab.url);
    const dominio = getBaseDomain(url.hostname);
    
    console.log(`Precargando credenciales para dominio: ${dominio}`);
    
    // Verificar si hay usuario autenticado
    if (!firebaseService) {
      console.log('Servicio de Firebase no disponible, no se pueden precargar credenciales');
      return [];
    }
    
    const isAuthenticated = await firebaseService.isUserAuthenticated();
    if (!isAuthenticated) {
      console.log('Usuario no autenticado, no se pueden precargar credenciales');
      return [];
    }
    
    // Obtener credenciales
    const resultado = await obtenerCredenciales(dominio);
    
    if (resultado.success) {
      const processedData = processCredentialsData(resultado);
      return processedData.credenciales;
    } else {
      console.error('Error al precargar credenciales:', resultado.error);
      return [];
    }
  } catch (e) {
    console.error('Error al precargar credenciales:', e);
    return [];
  }
}

// Función para intentar iniciar sesión automáticamente con credenciales almacenadas
async function intentarLoginAutomatico() {
  console.log('Intentando iniciar sesión automáticamente si hay credenciales almacenadas...');
  
  try {
    // Verificar si hay credenciales de Firebase almacenadas localmente
    const data = await new Promise(resolve => {
      chrome.storage.local.get(['userEmail', 'userPassword', 'userAuthenticated'], resolve);
    });
    
    console.log(`Estado de autenticación en storage: ${data.userAuthenticated ? 'Autenticado' : 'No autenticado'}`);
    console.log(`Email en storage: ${data.userEmail ? 'Disponible' : 'No disponible'}`);
    console.log(`Contraseña en storage: ${data.userPassword ? 'Disponible' : 'No disponible'}`);
    
    // Si tenemos email y contraseña, y deberíamos estar autenticados pero no lo estamos, intentar login
    if (data.userEmail && data.userPassword && data.userAuthenticated && 
        (!firebaseService || !(await firebaseService.isUserAuthenticated()))) {
      
      console.log(`Intentando reconectar sesión para: ${data.userEmail}`);
      
      // Verificar si Firebase está disponible
      if (!firebaseService) {
        console.log('Firebase Service no disponible, intentando reinicializar...');
        await reinitializeFirebaseService();
        if (!firebaseService) {
          console.error('No se pudo inicializar Firebase Service');
          return false;
        }
      }
      
      // Intentar login
      const result = await firebaseService.login(data.userEmail, data.userPassword);
      
      if (result.success) {
        console.log(`Sesión recuperada exitosamente para ${data.userEmail}`);
        
        // Actualizar estado
        chrome.storage.local.set({ userAuthenticated: true });
        
        // Actualizar popup
        chrome.action.setPopup({ popup: 'popup.html' });
        
        return true;
      } else {
        console.error('No se pudo recuperar la sesión:', result.error);
        
        // Si hubo un error de autenticación, limpiar datos de autenticación para evitar reintentos fallidos
        if (result.error.includes('credentials') || result.error.includes('password') || 
            result.error.includes('auth/user-not-found')) {
          console.log('Limpiando credenciales almacenadas debido a error de autenticación');
          chrome.storage.local.set({ 
            userAuthenticated: false,
            userPassword: null 
          });
        }
        
        return false;
      }
    } else if (!data.userAuthenticated) {
      console.log('Usuario no está marcado como autenticado en storage');
      return false;
    } else if (firebaseService && (await firebaseService.isUserAuthenticated())) {
      console.log('Usuario ya está autenticado, no es necesario reconectar');
      return true;
    } else {
      console.log('No hay suficiente información para intentar reconectar sesión');
      return false;
    }
  } catch (error) {
    console.error('Error al intentar login automático:', error);
    return false;
  }
}

// Función para verificar y reparar el estado de autenticación
function checkAndRepairAuthState() {
  console.log('=== VERIFICANDO Y REPARANDO ESTADO DE AUTENTICACIÓN ===');
  
  return new Promise((resolve) => {
    // Verificar estado en storage
    chrome.storage.local.get(['userAuthenticated', 'userEmail', 'userId', 'savedEmail', 'savedPassword', 'lastAuthTime'], async (data) => {
      const estadoAlmacenado = data.userAuthenticated ? 'Autenticado' : 'No autenticado';
      const emailAlmacenado = data.userEmail ? data.userEmail : 'No disponible';
      const passwordAlmacenada = data.savedPassword ? 'Disponible' : 'No disponible';
      
      console.log('Estado almacenado:', estadoAlmacenado);
      console.log('Email almacenado:', emailAlmacenado);
      console.log('Contraseña almacenada:', passwordAlmacenada);
      
      // Verificar estado en Firebase
      let usuarioActual = null;
      try {
        if (firebaseService && firebaseService.auth) {
          usuarioActual = await firebaseService.getCurrentUser();
        }
      } catch (error) {
        console.error('Error al obtener usuario actual:', error);
      }
      
      console.log('Usuario actual en Firebase:', usuarioActual ? usuarioActual.email : 'No autenticado');
      
      // Determinar el estado real basado en Firebase (más confiable)
      const estadoRealAutenticacion = usuarioActual !== null;
      console.log('Estado real de autenticación:', estadoRealAutenticacion ? 'Autenticado' : 'No autenticado');
      
      // Verificar si hay discrepancia
      if (estadoRealAutenticacion !== data.userAuthenticated) {
        console.log('Discrepancia detectada: Storage indica', estadoAlmacenado, 'pero Firebase indica', estadoRealAutenticacion ? 'autenticado' : 'no autenticado');
        
        // Caso 1: Storage dice autenticado pero Firebase no
        if (data.userAuthenticated && !estadoRealAutenticacion) {
          console.log('Intentando recuperar sesión con credenciales guardadas...');
          
          // Verificar si tenemos credenciales guardadas para recuperar la sesión
          if (data.savedEmail && data.savedPassword) {
            try {
              // Intentar iniciar sesión nuevamente
              const resultado = await firebaseService.login(data.savedEmail, data.savedPassword);
              if (resultado.success) {
                console.log('Sesión recuperada exitosamente para:', data.savedEmail);
                // No necesitamos actualizar storage porque ya está como autenticado
                resolve(true);
        return;
              } else {
                console.error('Error al intentar recuperar sesión:', resultado.error);
              }
            } catch (error) {
              console.error('Excepción al intentar recuperar sesión:', error);
            }
        } else {
            console.log('No hay credenciales suficientes para recuperar la sesión');
          }
          
          // Si llegamos aquí, no se pudo recuperar la sesión
          chrome.storage.local.set({ 
            'userAuthenticated': false,
            'lastAuthTime': null 
          }, () => {
            console.log('Estado de autenticación corregido a: No autenticado');
            resolve(false);
          });
        }
        // Caso 2: Storage dice no autenticado pero Firebase sí
        else if (!data.userAuthenticated && estadoRealAutenticacion) {
          console.log('Firebase indica autenticado pero storage no, actualizando storage...');
          chrome.storage.local.set({ 
            'userAuthenticated': true,
            'userEmail': usuarioActual.email,
            'userId': usuarioActual.uid,
            'lastAuthTime': Date.now()
          }, () => {
            console.log('Estado de autenticación corregido a: Autenticado');
            resolve(true);
          });
        }
      } else {
        console.log('Estado coherente:', data.userAuthenticated ? 'Autenticado tanto en Firebase como en Storage' : 'No autenticado ni en Firebase ni en Storage');
        resolve(estadoRealAutenticacion);
      }
      
      // Verificar si hay que renovar el token (cada 45 minutos)
      if (estadoRealAutenticacion && data.lastAuthTime) {
        const tiempoTranscurrido = Date.now() - data.lastAuthTime;
        const MAX_TOKEN_AGE = 45 * 60 * 1000; // 45 minutos en milisegundos
        
        if (tiempoTranscurrido > MAX_TOKEN_AGE) {
          console.log('Token antiguo, actualizando timestamp para mantener la sesión fresca');
          chrome.storage.local.set({ 'lastAuthTime': Date.now() });
        }
      }
      
      console.log('=== FIN DE VERIFICACIÓN Y REPARACIÓN ===');
    });
  });
}