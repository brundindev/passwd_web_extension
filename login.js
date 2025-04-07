document.addEventListener('DOMContentLoaded', function() {
  // Elementos del DOM
  const loginForm = document.getElementById('loginForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const errorMessage = document.getElementById('errorMessage');
  const loginButton = document.getElementById('loginButton');
  const loader = document.getElementById('loader');
  
  // Configuración de Firebase (Ya actualizada con tus valores)
  const firebaseConfig = {
    apiKey: "AIzaSyDYSZWktCMW2u_pzpYBi_A_ZszwQRyk6ac",
    authDomain: "passwd-brundindev.firebaseapp.com",
    projectId: "passwd-brundindev",
    storageBucket: "passwd-brundindev.firebasestorage.app",
    messagingSenderId: "252776703139",
    appId: "1:252776703139:web:60db327548b9f10d564b16"
  };
  
  // Inicializar Firebase
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    console.log('Firebase inicializado correctamente');
  } catch (e) {
    console.error('Error al inicializar Firebase:', e);
    errorMessage.textContent = 'Error al inicializar el sistema de autenticación. Por favor, intenta de nuevo más tarde.';
    return;
  }
  
  // Comprobar si ya hay sesión iniciada
  checkAuthState();
  
  // Manejar envío del formulario
  loginForm.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    if (!email || !password) {
      errorMessage.textContent = 'Por favor, completa todos los campos.';
      return;
    }
    
    // Mostrar loader y deshabilitar botón
    loader.style.display = 'block';
    loginButton.disabled = true;
    errorMessage.textContent = '';
    
    // Intentar iniciar sesión
    firebase.auth().signInWithEmailAndPassword(email, password)
      .then((userCredential) => {
        // Usuario ha iniciado sesión correctamente
        console.log('Usuario autenticado:', userCredential.user.email);
        
        // Guardar estado de autenticación
        chrome.storage.local.set({ 
          'userAuthenticated': true,
          'userEmail': userCredential.user.email,
          'userId': userCredential.user.uid
        }, () => {
          console.log('Estado de autenticación guardado');
          
          // Cambiar el popup por defecto
          chrome.action.setPopup({ popup: 'popup.html' });
          
          // Redirigir al popup principal
          window.location.href = 'popup.html';
        });
      })
      .catch((error) => {
        // Manejar errores de autenticación
        console.error('Error de autenticación:', error);
        loader.style.display = 'none';
        loginButton.disabled = false;
        
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
          errorMessage.textContent = 'Credenciales incorrectas. Por favor, verifica tu email y contraseña.';
        } else if (error.code === 'auth/too-many-requests') {
          errorMessage.textContent = 'Demasiados intentos fallidos. Por favor, intenta más tarde.';
        } else {
          errorMessage.textContent = 'Error al iniciar sesión: ' + error.message;
        }
      });
  });
  
  // Función para verificar el estado de autenticación
  function checkAuthState() {
    firebase.auth().onAuthStateChanged((user) => {
      if (user) {
        // Usuario ya está autenticado
        console.log('Usuario ya autenticado:', user.email);
        
        // Guardar estado en storage
        chrome.storage.local.set({ 
          'userAuthenticated': true,
          'userEmail': user.email,
          'userId': user.uid
        }, () => {
          console.log('Estado de autenticación restaurado');
          
          // Cambiar el popup por defecto
          chrome.action.setPopup({ popup: 'popup.html' });
          
          // Redirigir al popup principal
          window.location.href = 'popup.html';
        });
      } else {
        // Usuario no autenticado
        console.log('Usuario no autenticado');
        chrome.storage.local.set({ 'userAuthenticated': false });
      }
    });
  }
});
