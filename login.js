document.addEventListener('DOMContentLoaded', function() {
  // Elementos del DOM
  const loginForm = document.getElementById('loginForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const errorMessage = document.getElementById('errorMessage');
  const loginButton = document.getElementById('loginButton');
  const loader = document.getElementById('loader');
  const registerLink = document.getElementById('registerLink');
  const backToLoginLink = document.getElementById('backToLoginLink');
  const rememberPasswordCheckbox = document.getElementById('rememberPassword');
  
  // Mostrar u ocultar formularios según la página
  const loginFormContainer = document.querySelector('.login-form');
  const registerFormContainer = document.querySelector('.register-form');
  
  // Configuración de Firebase (Ya actualizada con tus valores)
  const firebaseConfig = {
    apiKey: "AIzaSyDYSZWktCMW2u_pzpYBi_A_ZszwQRyk6ac",
    authDomain: "passwd-brundindev.firebaseapp.com",
    projectId: "passwd-brundindev",
    storageBucket: "passwd-brundindev.firebasestorage.app",
    messagingSenderId: "252776703139",
    appId: "1:252776703139:web:60db327548b9f10d564b16"
  };
  
  // Verificar si Firebase está disponible, si no, intentar cargarlo dinámicamente
  if (typeof firebase === 'undefined') {
    console.log('Firebase no está definido. Intentando cargar scripts dinámicamente...');
    
    // Función para cargar un script
    function loadScript(url) {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
    
    // Cargar scripts de Firebase en secuencia
    loadScript('firebase/firebase-app-compat.js')
      .then(() => loadScript('firebase/firebase-auth-compat.js'))
      .then(() => loadScript('firebase/firebase-firestore-compat.js'))
      .then(() => {
        console.log('Scripts de Firebase cargados dinámicamente');
        initializeFirebase();
      })
      .catch(error => {
        console.error('Error al cargar scripts de Firebase:', error);
        showError('Error al cargar el sistema de autenticación. Por favor, recarga la página.');
      });
  } else {
    // Firebase ya está disponible, inicializar
    initializeFirebase();
  }
  
  // Función para inicializar Firebase
  function initializeFirebase() {
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    console.log('Firebase inicializado correctamente');
      
      // Una vez inicializado, continuar con la configuración
      setupAuthAndForm();
  } catch (e) {
    console.error('Error al inicializar Firebase:', e);
      showError('Error al inicializar el sistema de autenticación. Por favor, intenta de nuevo más tarde.');
    }
  }
  
  // Configurar autenticación y formulario después de inicializar Firebase
  function setupAuthAndForm() {
  // Comprobar si ya hay sesión iniciada
  checkAuthState();
    
    // Establecer persistencia en el navegador (no en el Service Worker)
    try {
      firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .then(() => {
          console.log('[Login] Persistencia configurada correctamente para la página de login');
        })
        .catch(error => {
          console.warn('[Login] Error al configurar persistencia:', error);
        });
    } catch (e) {
      console.warn('[Login] Error al intentar configurar persistencia:', e);
    }
    
    // Configurar enlaces para cambiar entre formularios
    if (registerLink) {
      registerLink.addEventListener('click', function(e) {
        e.preventDefault();
        loginFormContainer.style.display = 'none';
        registerFormContainer.style.display = 'block';
      });
    }
    
    if (backToLoginLink) {
      backToLoginLink.addEventListener('click', function(e) {
        e.preventDefault();
        registerFormContainer.style.display = 'none';
        loginFormContainer.style.display = 'block';
      });
    }
  
  // Manejar envío del formulario
    loginForm.addEventListener('submit', handleLoginSubmit);
  }
  
  // Función para manejar el envío del formulario
  function handleLoginSubmit(e) {
    e.preventDefault();
    
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const debeGuardarCredenciales = rememberPasswordCheckbox.checked;
    
    if (!email || !password) {
      showError('Por favor, completa todos los campos');
      return;
    }
    
    // Mostrar loader y deshabilitar botón
    loader.style.display = 'block';
    loginButton.disabled = true;
    errorMessage.textContent = '';
    errorMessage.classList.remove('show');
    
    // Intentar iniciar sesión directamente primero para garantizar persistencia en esta ventana
    firebase.auth().signInWithEmailAndPassword(email, password)
      .then((userCredential) => {
        console.log('[Login] Autenticación directa exitosa para:', userCredential.user.email);
        showSuccess('Inicio de sesión exitoso. Redirigiendo...');
        
        // Guardar estado en el storage
        chrome.storage.local.set({ 
          'userAuthenticated': true,
          'userEmail': userCredential.user.email,
          'userId': userCredential.user.uid,
          'lastAuthTime': Date.now()
        }, () => {
          console.log('[Login] Estado de autenticación guardado en storage');
          
          // Sincronizar con el Service Worker después del login directo
          chrome.runtime.sendMessage({
            action: 'sync_auth_state',
            authenticated: true,
            email: userCredential.user.email,
            uid: userCredential.user.uid,
            guardarPassword: debeGuardarCredenciales,
            password: debeGuardarCredenciales ? password : null
          }, function(response) {
            console.log('[Login] Estado sincronizado con background:', response);
          
            // Esperar un tiempo para asegurar que todo se ha sincronizado
            setTimeout(() => {
              // Verificar el estado de autenticación antes de redirigir
              verifyAndRedirect(email, debeGuardarCredenciales, password);
            }, 1000);
          });
        });
      })
      .catch((error) => {
        console.error('[Login] Error en autenticación directa:', error);
        handleLoginError(error);
        
        // Como respaldo, intentar a través del background si falló la autenticación directa
        tryBackgroundLogin(email, password, debeGuardarCredenciales);
      });
  }

  // Función para mostrar mensaje de error
  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.add('show');
    
    // Ocultar después de 5 segundos
    setTimeout(function() {
      errorMessage.classList.remove('show');
    }, 5000);
  }

  // Función para mostrar mensaje de éxito
  function showSuccess(message) {
    errorMessage.textContent = message;
    errorMessage.style.color = 'green';
    errorMessage.classList.add('show');
    
    // Ocultar después de 5 segundos
    setTimeout(function() {
      errorMessage.classList.remove('show');
      errorMessage.style.color = '';
    }, 5000);
  }
  
  // Función para intentar login a través del background
  function tryBackgroundLogin(email, password, debeGuardarCredenciales) {
    console.log('[Login] Intentando login a través del background script...');
    
    chrome.runtime.sendMessage({
      action: 'login_with_credentials',
      email: email,
      password: password,
      guardarPassword: debeGuardarCredenciales
    }, function(response) {
      if (chrome.runtime.lastError) {
        console.error('[Login] Error al comunicarse con background:', chrome.runtime.lastError);
        showError('Error de comunicación con la extensión. Por favor, reinicia el navegador.');
        loader.style.display = 'none';
        loginButton.disabled = false;
        return;
      }
      
      if (response && response.success) {
        console.log('[Login] Inicio de sesión exitoso vía background');
        showSuccess('Inicio de sesión exitoso. Redirigiendo...');
        
        // Esperar un tiempo para asegurar que todo se ha sincronizado
        setTimeout(() => {
          // Verificar el estado de autenticación antes de redirigir
          verifyAndRedirect(email, debeGuardarCredenciales, password);
        }, 1000);
      } else {
        const error = response ? response.error : 'Error desconocido de comunicación';
        console.error('[Login] Error al iniciar sesión vía background:', error);
        handleLoginError({ message: error, code: response ? response.code : null });
      }
    });
  }
  
  // Verificar estado de autenticación y redirigir
  function verifyAndRedirect(email, debeGuardarCredenciales, password) {
    console.log('[Login] Verificando estado de autenticación antes de redirigir...');
    
    // Verificar en storage
    chrome.storage.local.get(['userAuthenticated', 'userEmail'], function(data) {
      console.log('[Login] Estado en storage:', data.userAuthenticated, data.userEmail);
      
      // Verificar en Firebase
      const currentUser = firebase.auth().currentUser;
      console.log('[Login] Usuario en Firebase:', currentUser ? currentUser.email : 'No autenticado');
      
      // Si hay inconsistencia, intentar repararla
      if (!currentUser && data.userAuthenticated) {
        console.warn('[Login] Inconsistencia detectada: Autenticado en storage pero no en Firebase');
        
        // Intentar reparar
        if (password) {
          console.log('[Login] Intentando reautenticación con credenciales disponibles');
          firebase.auth().signInWithEmailAndPassword(email, password)
            .then(() => {
              console.log('[Login] Reautenticación exitosa');
              completeLoginProcess();
            })
            .catch(error => {
              console.error('[Login] Error en reautenticación:', error);
              resetLoginState();
            });
        } else {
          console.warn('[Login] No se puede reparar: Contraseña no disponible');
          resetLoginState();
        }
      } 
      // Si todo está bien, proceder
      else if (currentUser || data.userAuthenticated) {
        console.log('[Login] Estado de autenticación verificado correctamente');
        completeLoginProcess();
      }
      // Si no hay sesión válida
      else {
        console.error('[Login] No se pudo establecer una sesión válida');
        resetLoginState();
      }
    });
  }
  
  // Completar proceso de login
  function completeLoginProcess() {
    // Cambiar el popup por defecto
    chrome.action.setPopup({ popup: 'popup.html' }, () => {
      console.log('[Login] Popup predeterminado cambiado a popup.html');
      
      // Notificar al background que hemos cambiado el popup
      chrome.runtime.sendMessage({ action: 'popup_changed' }, function() {
        // Redirigir después de un retraso adicional
        setTimeout(() => {
          window.location.href = 'popup.html';
        }, 500);
      });
  });
  }
  
  // Reiniciar estado de login
  function resetLoginState() {
    showError('No se pudo mantener la sesión. Por favor, intenta nuevamente.');
    loader.style.display = 'none';
    loginButton.disabled = false;
    
    // Limpiar el estado
    chrome.storage.local.set({ 
      'userAuthenticated': false,
      'userEmail': null,
      'userId': null
    });
  }
  
  // Manejar errores de login
  function handleLoginError(error) {
    loader.style.display = 'none';
    loginButton.disabled = false;
    
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || 
        error.message.includes('wrong-password') || error.message.includes('user-not-found')) {
      showError('Credenciales incorrectas. Por favor, verifica tu email y contraseña.');
    } else if (error.code === 'auth/too-many-requests' || error.message.includes('too-many-requests')) {
      showError('Demasiados intentos fallidos. Por favor, intenta más tarde.');
    } else {
      showError('Error al iniciar sesión: ' + error.message);
    }
  }
  
  // Función para verificar el estado de autenticación
  function checkAuthState() {
    console.log('[Login] Verificando estado de autenticación...');
    
    // Verificar en Firebase
    firebase.auth().onAuthStateChanged((user) => {
      if (user) {
        // Usuario ya está autenticado en Firebase
        console.log('[Login] Usuario autenticado en Firebase:', user.email);
        
        // Verificar en storage
        chrome.storage.local.get(['userAuthenticated', 'userEmail'], function(data) {
          if (data.userAuthenticated) {
            console.log('[Login] Usuario autenticado en storage:', data.userEmail);
            
            // Todo correcto, redirigir
            chrome.action.setPopup({ popup: 'popup.html' });
            window.location.href = 'popup.html';
          } else {
            console.log('[Login] Inconsistencia: Autenticado en Firebase pero no en storage');
        
        // Guardar estado en storage
        chrome.storage.local.set({ 
          'userAuthenticated': true,
          'userEmail': user.email,
              'userId': user.uid,
              'lastAuthTime': Date.now()
        }, () => {
              console.log('[Login] Estado actualizado en storage');
          
              // Redirigir
          chrome.action.setPopup({ popup: 'popup.html' });
          window.location.href = 'popup.html';
            });
          }
        });
      } else {
        // Usuario no autenticado en Firebase
        console.log('[Login] Usuario no autenticado en Firebase');
        
        // Verificar en storage
        chrome.storage.local.get(['userAuthenticated', 'userEmail', 'savedEmail', 'savedPassword'], function(data) {
          if (data.userAuthenticated) {
            console.log('[Login] Inconsistencia: Autenticado en storage pero no en Firebase');
            
            // Si tenemos credenciales guardadas, intentar iniciar sesión automáticamente
            if (data.savedEmail && data.savedPassword) {
              console.log('[Login] Intentando iniciar sesión automáticamente con credenciales guardadas');
              
              // Autocompletar campos
              emailInput.value = data.savedEmail;
              passwordInput.value = data.savedPassword;
              
              // No hacemos submit automático, dejamos que el usuario decida
            } else {
              console.log('[Login] No hay credenciales guardadas para auto-login');
              
              // Limpiar el estado inconsistente
        chrome.storage.local.set({ 'userAuthenticated': false });
            }
          } else {
            console.log('[Login] Usuario no autenticado ni en Firebase ni en storage');
          }
        });
      }
    });
  }
});
