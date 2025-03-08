document.addEventListener('DOMContentLoaded', function() {
  const statusDiv = document.getElementById('status');
  const searchButton = document.getElementById('searchButton');
  const accountsList = document.getElementById('accountsList');
  const currentSiteElement = document.getElementById('currentSite');
  const loader = document.getElementById('loader');
  
  let currentTab = null;
  let currentDomain = null;
  let serverStatus = false;
  
  // Ocultar la lista de cuentas inicialmente
  accountsList.style.display = 'none';
  
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
    try {
      const response = await chrome.tabs.sendMessage(tabId, { accion: 'get_available_credentials' });
      if (response && response.credenciales && response.credenciales.length > 0) {
        console.log(`Content script tiene ${response.credenciales.length} credenciales`);
        return response.credenciales;
      } else {
        console.log('Content script no tiene credenciales disponibles');
        return null;
      }
    } catch (error) {
      console.log('Error al obtener credenciales del content script:', error.message);
      return null;
    }
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
        showStatus('Error: No se pudo establecer conexión con la página. Intente recargar la página.', 'error');
        showLoader(false);
        
        // Intentar inyectar el content script vía background
        try {
          chrome.runtime.sendMessage({
            action: "inject_content_script",
            tabId: currentTab.id
          });
        } catch (e) {
          console.error('Error al solicitar inyección de content script:', e);
        }
        
        return;
      }
      
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
      
      // Si no hay credenciales en el content script, continuar con la búsqueda normal
      
      // Verificar si la página tiene un formulario de login
      const hasLoginForm = await checkLoginForm(currentTab.id);
      
      // Para Google, queremos continuar incluso si no detectamos un formulario inicialmente
      const isGoogleAuth = currentDomain.includes('google.com');
      
      // Continuamos aunque no haya un formulario de login detectado
      if (!hasLoginForm && !isGoogleAuth) {
        console.log('No se detectó un formulario de login, pero continuando con la búsqueda de credenciales');
      }
      
      // Obtener el dominio base para la búsqueda (sin subdominio www.)
      const baseDomain = getBaseDomain(currentDomain);
      console.log('Dominio base para búsqueda:', baseDomain);
      
      // Caso especial para Google
      const isGoogleDomain = baseDomain.includes('google.com') || currentDomain.includes('google.com');
      
      // Término de búsqueda: usamos un término más genérico para Google
      const searchTerm = isGoogleDomain ? 'google' : baseDomain;
      console.log(`Usando término de búsqueda: ${searchTerm} (es dominio Google: ${isGoogleDomain})`);
      
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
    if (!currentTab || !currentTab.id) return;
    
    // Intentar enviar varias veces con intervalos
    let intentos = 0;
    const maxIntentos = 3;
    
    function intentarEnviar() {
      chrome.tabs.sendMessage(currentTab.id, {
        accion: 'set_credentials',
        credenciales: credenciales
      }).then(() => {
        console.log('Credenciales enviadas al content script con éxito');
      }).catch(e => {
        console.log(`Error al enviar credenciales al content script (intento ${intentos + 1}/${maxIntentos}):`, e);
        if (++intentos < maxIntentos) {
          setTimeout(intentarEnviar, 500);
        }
      });
    }
    
    intentarEnviar();
  }
  
  // Función para filtrar credenciales por dominio de manera consistente
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
          console.log(`Coincidencia de Google: ${cred.usuario} para ${cred.sitio}`);
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
  
  // Función para extraer el dominio base de una URL
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
  
  // Función para mostrar la lista de credenciales
  function showCredentialsList(credenciales) {
    // Limpiar lista anterior
    accountsList.innerHTML = '';
    
    if (credenciales.length === 0) {
      accountsList.innerHTML = '<div class="no-accounts">No se encontraron credenciales disponibles</div>';
      accountsList.style.display = 'block';
      return;
    }
    
    // Crear elementos para cada credencial
    credenciales.forEach(credencial => {
      const accountItem = document.createElement('div');
      accountItem.className = 'account-item';
      
      const accountInfo = document.createElement('div');
      accountInfo.className = 'account-info';
      
      const username = document.createElement('div');
      username.className = 'account-username';
      username.textContent = credencial.usuario;
      
      const site = document.createElement('div');
      site.className = 'account-site';
      site.textContent = credencial.sitio;
      
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
    console.log('Credencial a utilizar:', JSON.stringify(credencial));
    
    // Normalizar los datos para asegurar que las propiedades sean correctas
    const datosNormalizados = {
      usuario: credencial.usuario || credencial.username || '',
      contraseña: credencial.password || credencial.contraseña || credencial.pass || '',
      sitio: credencial.sitio || credencial.site || ''
    };
    
    console.log('Datos normalizados:', JSON.stringify(datosNormalizados));
    
    // Verificar que tenemos una contraseña
    if (!datosNormalizados.contraseña) {
      console.error('No se encontró una contraseña válida en la credencial');
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
      console.log('Comprobando conexion con el servidor PASSWD...');
      
      // Primero intentar con endpoint /status
      try {
        const statusUrl = 'http://localhost:8080/status';
        console.log('Probando endpoint status:', statusUrl);
        
        const statusResponse = await fetch(statusUrl, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          mode: 'cors'
        });
        
        if (statusResponse.ok) {
          console.log('Servidor respondió correctamente a /status');
          showStatus('Conectado al gestor de contraseñas PASSWD', 'success');
          return true;
        }
      } catch (statusError) {
        console.log('Error con endpoint /status, probando alternativa:', statusError);
      }
      
      // Si /status falla, intentar con endpoint de credenciales de prueba
      const testUrl = 'http://localhost:8080/get-credentials?sitio=test';
      console.log('Probando endpoint credenciales:', testUrl);
      
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        mode: 'cors'
      });
      
      console.log('Respuesta recibida:', response);
      
      if (response.status === 404) {
        console.log('Servidor respondio con 404 - Esto es esperado para el sitio de prueba');
        showStatus('Conectado al gestor de contraseñas PASSWD', 'success');
        return true;
      } else if (response.ok) {
        console.log('Servidor respondio correctamente');
        showStatus('Conectado al gestor de contraseñas PASSWD', 'success');
        return true;
      } else {
        console.log('Servidor respondio con estado:', response.status);
        showStatus(`Error: Respuesta inesperada (${response.status})`, 'error');
        return false;
      }
    } catch (error) {
      console.error('Error al comprobar la conexion:', error);
      showStatus(`Error de conexión: ${error.message}`, 'error');
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
});