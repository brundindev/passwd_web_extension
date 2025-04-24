// Importaciones de módulos ES6 para Firebase
import './firebase/firebase-app-compat.js';
import './firebase/firebase-auth-compat.js';
import './firebase/firebase-firestore-compat.js';

// Asegúrate de que este archivo también está correctamente creado
try {
  // Cargar scripts de Firebase de forma más robusta
  function loadFirebaseScripts() {
    try {
      // En un módulo ES6, las importaciones deben estar al inicio del archivo
      // Las importaciones ya están arriba, así que solo verificamos que Firebase esté disponible
      if (typeof firebase !== 'undefined' && firebase.apps) {
        console.log('Firebase cargado correctamente a través de importaciones ES6');
        return true;
      } else {
        console.error('Firebase no está disponible a pesar de las importaciones');
        return false;
      }
    } catch (e) {
      console.error('Error al cargar scripts de Firebase:', e);
      return false;
    }
  }

  // Intentar verificar que Firebase esté disponible
  const scriptsLoaded = loadFirebaseScripts();
  if (!scriptsLoaded) {
    console.warn('No se pudieron cargar los scripts de Firebase, algunas funcionalidades no estarán disponibles');
  }
} catch (e) {
  console.error('Error general al cargar Firebase:', e);
}

// Clase para manejar todas las operaciones con Firebase
class FirebaseService {
  constructor() {
    // Configuración de Firebase (Ya actualizada con tus valores)
    this.firebaseConfig = {
      apiKey: "AIzaSyDYSZWktCMW2u_pzpYBi_A_ZszwQRyk6ac",
      authDomain: "passwd-brundindev.firebaseapp.com",
      projectId: "passwd-brundindev",
      storageBucket: "passwd-brundindev.firebasestorage.app",
      messagingSenderId: "252776703139",
      appId: "1:252776703139:web:60db327548b9f10d564b16"
    };
    
    this.initializeFirebase();
  }
  
  // Inicializar Firebase
  initializeFirebase() {
    try {
      // Verificar si firebase está definido
      if (typeof firebase === 'undefined') {
        console.warn('Firebase no está disponible, se operará en modo limitado');
        this.firebaseAvailable = false;
        return;
      }
      
      // Detectar si estamos en un Service Worker
      const isServiceWorker = (typeof window === 'undefined' && typeof self !== 'undefined');
      console.log(`Ejecutando en ${isServiceWorker ? 'Service Worker' : 'Contexto de ventana'}`);
      
      // Configurar la persistencia antes de inicializar Firebase - solo si no estamos en un Service Worker
      if (!isServiceWorker) {
        try {
          // Establecer persistencia local para mantener la sesión incluso cuando la app web esté cerrada
          firebase.auth.Auth.Persistence.LOCAL;
          console.log('Persistencia local configurada para Firebase Auth');
        } catch (persistenceError) {
          console.warn('No se pudo configurar la persistencia:', persistenceError);
        }
      } else {
        console.log('Omitiendo configuración de persistencia en Service Worker');
      }
      
      if (!firebase.apps.length) {
        firebase.initializeApp(this.firebaseConfig);
      }
      
      console.log('Firebase inicializado correctamente desde FirebaseService');
      this.auth = firebase.auth();
      
      // Configurar persistencia para la autenticación - solo si no estamos en un Service Worker
      if (!isServiceWorker) {
        this.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
          .then(() => {
            console.log('Persistencia configurada para mantener sesión activa');
          })
          .catch(error => {
            console.error('Error al configurar persistencia:', error);
          });
      }
      
      this.db = firebase.firestore();
      
      // Habilitar caché offline para Firestore - solo si no estamos en un Service Worker
      if (!isServiceWorker) {
        this.db.enablePersistence({synchronizeTabs: true})
          .then(() => {
            console.log('Persistencia de Firestore habilitada para funcionamiento offline');
          })
          .catch(error => {
            if (error.code === 'failed-precondition') {
              console.warn('La persistencia de Firestore no pudo habilitarse. Posiblemente hay múltiples pestañas abiertas.');
            } else if (error.code === 'unimplemented') {
              console.warn('El navegador actual no soporta persistencia de Firestore');
            } else {
              console.error('Error al configurar persistencia de Firestore:', error);
            }
          });
      } else {
        console.log('Omitiendo configuración de persistencia de Firestore en Service Worker');
      }
      
      this.firebaseAvailable = true;
      
      // Inicializar un evento para detectar cambios en el estado de autenticación
      this.auth.onAuthStateChanged(user => {
        if (user) {
          console.log(`Usuario autenticado detectado: ${user.email} (${user.uid})`);
          // Guardar en chrome.storage que el usuario está autenticado
          chrome.storage.local.set({ userAuthenticated: true, userEmail: user.email });
        } else {
          console.log('No hay usuario autenticado');
          chrome.storage.local.set({ userAuthenticated: false, userEmail: null });
        }
      });
    } catch (e) {
      console.error('Error al inicializar Firebase:', e);
      this.firebaseAvailable = false;
    }
  }
  
  // Obtener usuario actual con reintento
  getCurrentUser() {
    if (!this.firebaseAvailable) return null;
    
    return new Promise((resolve) => {
      // Verificar si el usuario ya está disponible
      const user = this.auth ? this.auth.currentUser : null;
      if (user) {
        resolve(user);
        return;
      }
      
      // Si no hay usuario, esperar brevemente por si está cargando
      let intentos = 0;
      const maxIntentos = 5;
      
      const verificarUsuario = () => {
        intentos++;
        const user = this.auth ? this.auth.currentUser : null;
        
        if (user) {
          resolve(user);
        } else if (intentos < maxIntentos) {
          // Esperar y volver a intentar
          setTimeout(verificarUsuario, 300);
        } else {
          // Se agotaron los intentos
          resolve(null);
        }
      };
      
      verificarUsuario();
    });
  }
  
  // Verificar si hay usuario autenticado
  async isUserAuthenticated() {
    try {
      if (!this.firebaseAvailable) return false;
      
      // Primero verificar en chrome.storage
      return new Promise((resolve) => {
        chrome.storage.local.get('userAuthenticated', async (data) => {
          if (data.userAuthenticated) {
            // Verificar si el token aún es válido obteniendo el usuario actual
            const user = await this.getCurrentUser();
            resolve(user !== null);
          } else {
            // No hay información en storage, verificar con Firebase directamente
            const user = await this.getCurrentUser();
            resolve(user !== null);
          }
        });
      });
    } catch (e) {
      console.error('Error al verificar autenticación:', e);
      return false;
    }
  }
  
  // Obtener ID del usuario
  async getUserId() {
    if (!this.firebaseAvailable) return null;
    
    const user = await this.getCurrentUser();
    return user ? user.uid : null;
  }
  
  // Cerrar sesión
  async logout() {
    try {
      if (!this.firebaseAvailable) {
        return { success: false, error: 'Firebase no disponible' };
      }
      
      // Limpia el almacenamiento local antes de cerrar sesión
      chrome.storage.local.set({ 
        userAuthenticated: false, 
        userEmail: null 
      });
      
      await this.auth.signOut();
      console.log('Sesión cerrada y datos de autenticación limpiados');
      return { success: true };
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      return { success: false, error: error.message };
    }
  }
  
  // Guardar credenciales - Acepta tanto un objeto credencial como parámetros individuales
  async saveCredential(credencial) {
    try {
      console.log('Iniciando guardado de credencial en Firebase');
      
      if (!this.firebaseAvailable) {
        console.error('Firebase no disponible al guardar credencial');
        throw new Error('Firebase no está disponible');
      }
      
      if (!this.auth) {
        console.error('Auth no disponible al guardar credencial');
        throw new Error('No se puede acceder a la autenticación');
      }
      
      const user = await this.getCurrentUser();
      if (!user) {
        console.error('Usuario no autenticado en saveCredential');
        throw new Error('Usuario no autenticado');
      }
      
      // Extraer los valores del objeto credencial o usar los parámetros individuales
      let sitio, usuario, contraseña;
      
      if (typeof credencial === 'object' && credencial !== null) {
        // Si se pasó un objeto credencial
        sitio = credencial.sitio;
        usuario = credencial.usuario;
        contraseña = credencial.contraseña;
      } else {
        // Si se usó el formato antiguo con parámetros separados
        console.warn('Uso obsoleto: saveCredential debería recibir un objeto credencial');
        return { error: 'Formato incorrecto: saveCredential requiere un objeto credencial' };
      }
      
      // Validar campos requeridos
      if (!sitio || !usuario || !contraseña) {
        console.error('Faltan campos obligatorios para guardar credencial');
        throw new Error('Todos los campos son obligatorios: sitio, usuario y contraseña');
      }

      console.log(`Guardando credencial para el sitio: ${sitio}, usuario: ${usuario}`);
      console.log(`Usuario autenticado: ${user.email} (${user.uid})`);
      console.log('Guardando en la estructura: usuarios/{userId}/pass/{documentId}');
      
      // Crear objeto con datos normalizados
      const credencialData = {
        sitio: sitio,
        usuario: usuario,
        contraseña: contraseña,
        fechaCreacion: new Date().toISOString(),
        userId: user.uid // Guardamos referencia al userId para consultas futuras
      };

      // Guardamos en la estructura correcta según reglas de Firebase
      const resultado = await this.db.collection('usuarios')
        .doc(user.uid)
        .collection('pass')
        .add(credencialData);
      
      console.log(`✅ Credencial guardada exitosamente con ID: ${resultado.id}`);
      return {
        id: resultado.id,
        ...credencialData
      };
    } catch (error) {
      console.error('Error al guardar credencial:', error);
      
      if (error.code === 'permission-denied') {
        console.error('Error de permisos en Firestore. Verifica las reglas de seguridad.');
        throw new Error('Error de permisos: No puedes guardar credenciales con las reglas actuales');
      }
      
      throw error;
    }
  }
  
  // Obtener todas las credenciales del usuario
  async getAllCredentials() {
    try {
      console.log('Obteniendo todas las credenciales del usuario desde Firebase');

      if (!this.firebaseAvailable) {
        console.error('Firebase no disponible al obtener credenciales');
        return [];
      }

      if (!this.auth) {
        console.error('Auth no disponible al obtener credenciales');
        return [];
      }

      const user = await this.getCurrentUser();
      if (!user) {
        console.error('Usuario no autenticado en getAllCredentials');
        return [];
      }

      console.log(`Consultando credenciales para usuario: ${user.email} (${user.uid})`);
      console.log('Consultando estructura: usuarios/{userId}/pass/{documentId}');
      
      // Obtenemos directamente de la estructura correcta
      const snapshot = await this.db.collection('usuarios')
        .doc(user.uid)
        .collection('pass')
        .get();
        
      if (snapshot.empty) {
        console.log('No se encontraron credenciales para este usuario');
        return [];
      }
      
      const credenciales = [];
      snapshot.forEach(doc => {
        credenciales.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      console.log(`Se encontraron ${credenciales.length} credenciales para el usuario`);
      return credenciales;
    } catch (error) {
      console.error('Error al obtener credenciales:', error);
      
      if (error.code === 'permission-denied') {
        console.error('Error de permisos en Firestore. Verifica las reglas de seguridad.');
        return [];
      }
      
      return [];
    }
  }
  
  // Buscar credenciales por sitio
  async searchCredentialsBySite(site) {
    try {
      const allCredentials = await this.getAllCredentials();
      
      // Filtrar por sitio (búsqueda simple)
      const filteredCredentials = allCredentials.filter(cred => {
        // Normalizar sitios para búsqueda
        const normalizedSite = site.toLowerCase();
        const normalizedCredSite = cred.sitio.toLowerCase();
        
        // Comprobar si hay coincidencia
        return normalizedCredSite.includes(normalizedSite) || 
               normalizedSite.includes(normalizedCredSite);
      });
      
      console.log(`Se encontraron ${filteredCredentials.length} credenciales para el sitio "${site}"`);
      return filteredCredentials;
    } catch (error) {
      console.error('Error al buscar credenciales por sitio:', error);
      return [];
    }
  }
  
  // Iniciar sesión con email y contraseña
  async login(email, password) {
    try {
      const userCredential = await this.auth.signInWithEmailAndPassword(email, password);
      console.log('Usuario autenticado:', userCredential.user.email);
      return { success: true, user: userCredential.user };
    } catch (error) {
      console.error('Error al iniciar sesión:', error);
      return { success: false, error: error.message };
    }
  }
  
  // Registrar nuevo usuario con email y contraseña
  async registerUser(email, password) {
    try {
      if (!this.firebaseAvailable) {
        return { success: false, error: 'Firebase no disponible' };
      }
      
      console.log(`Intentando registrar nuevo usuario: ${email}`);
      const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);
      console.log('Usuario registrado:', userCredential.user.email);
      
      // Crear la colección inicial para este usuario
      const userId = userCredential.user.uid;
      
      // Crear documento del usuario con información básica
      await this.db.collection('usuarios').doc(userId).set({
        email: email,
        fechaCreacion: firebase.firestore.FieldValue.serverTimestamp(),
        ultimoAcceso: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      // Crear la colección de contraseñas vacía (no es necesario crear documentos)
      console.log(`Inicializada estructura de datos para usuario: ${userId}`);
      
      return { success: true, user: userCredential.user };
    } catch (error) {
      console.error('Error al registrar usuario:', error);
      
      // Mensajes más amigables para errores comunes
      let errorMessage = error.message;
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'Este correo electrónico ya está registrado. Intenta iniciar sesión.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'La contraseña es demasiado débil. Debe tener al menos 6 caracteres.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'El formato del correo electrónico no es válido.';
      }
      
      return { success: false, error: errorMessage, code: error.code };
    }
  }
}

// Crear instancia global para usar en otros scripts
const firebaseService = new FirebaseService();

// Exportar FirebaseService como un módulo ES6
export { FirebaseService, firebaseService };

// Asegurar que la variable global también está disponible
self.firebaseService = firebaseService;
