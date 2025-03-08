// Registra eventos de instalación y actualización
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension PASSWD instalada o actualizada:', details.reason);
  
  // No precargar credenciales para evitar errores
  // precargarCredenciales().catch(e => {
  //   console.error('Error en precarga de credenciales:', e);
  // });
});

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
  GET_CREDENTIALS_ENDPOINT: '/get-credentials' // Endpoint original que podría estar usando
};

// Función para construir URLs del servidor
function getServerUrl(endpoint, queryParams = {}) {
  const url = new URL(`http://${FLUTTER_SERVER.HOST}:${FLUTTER_SERVER.PORT}${endpoint}`);
  
  // Añadir parámetros de consulta si existen
  Object.keys(queryParams).forEach(key => {
    url.searchParams.append(key, queryParams[key]);
  });
  
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

// Escuchar mensajes del content script o popup
chrome.runtime.onMessage.addListener((mensaje, sender, sendResponse) => {
  console.log('Mensaje recibido en background:', mensaje);

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
  
  // Si llegamos aquí, no se procesó el mensaje
  sendResponse({ error: 'Mensaje no reconocido' });
  return true;
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

// Verificar si el script está activo después de la inyección
function verifyAndSendCredentials(tabId, tab) {
  try {
    console.log(`Verificando si el content script está listo en tab ${tabId}`);
    
    chrome.tabs.sendMessage(tabId, { accion: 'check_ready' }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn(`Content script no listo en tab ${tabId}:`, chrome.runtime.lastError.message);
        
        // Si no está listo, intentar inyectarlo
        injectScript(tabId, tab);
        return;
      }
      
      if (response && response.ready) {
        console.log(`Content script listo en tab ${tabId}, enviando credenciales`);
        enviarCredencialesCacheadas(tab);
      } else {
        console.warn(`Respuesta inesperada del content script:`, response);
        injectScript(tabId, tab);
      }
    });
  } catch (e) {
    console.error(`Error al verificar si el content script está listo:`, e);
    injectScript(tabId, tab);
  }
}

// Enviar credenciales almacenadas a la pestaña
function enviarCredencialesAlTab(tabId, tab) {
  if (!tab || !tab.url) return;
  
  try {
    const url = new URL(tab.url);
    const dominio = url.hostname;
    
    // Primero intentar desde la caché
    if (credencialesCache.has(dominio)) {
      const cache = credencialesCache.get(dominio);
      if (Date.now() - cache.timestamp < 5 * 60 * 1000) {
        chrome.tabs.sendMessage(tabId, {
          accion: 'set_credentials',
          credenciales: cache.credenciales
        }).catch(e => console.log('Error al enviar credenciales desde caché:', e));
        return;
      }
    }
    
    // Si no hay caché, intentar desde storage local
    chrome.storage.local.get(dominio, (data) => {
      if (data && data[dominio] && data[dominio].credenciales) {
        const esReciente = (Date.now() - data[dominio].timestamp) < 3600000;
        
        if (esReciente) {
          chrome.tabs.sendMessage(tabId, {
            accion: 'set_credentials',
            credenciales: data[dominio].credenciales
          }).catch(e => console.log('Error al enviar credenciales desde storage:', e));
        }
      }
    });
  } catch (e) {
    console.log('Error al procesar URL para credenciales:', e);
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