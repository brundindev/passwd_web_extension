// Asegúrate de que este archivo también está correctamente creado
try {
  // Cargar scripts de Firebase de forma más robusta
  function loadFirebaseScripts() {
    try {
      // Usar rutas absolutas con chrome.runtime.getURL para evitar problemas de importación
      const appScriptUrl = chrome.runtime.getURL('firebase/firebase-app-compat.js');
      const authScriptUrl = chrome.runtime.getURL('firebase/firebase-auth-compat.js');
      const firestoreScriptUrl = chrome.runtime.getURL('firebase/firebase-firestore-compat.js');
      
      // Usar importScripts con las rutas absolutas
      importScripts(appScriptUrl);
      importScripts(authScriptUrl);
      importScripts(firestoreScriptUrl);
      
      console.log('Firebase scripts cargados correctamente');
      return true;
    } catch (e) {
      console.error('Error al cargar scripts de Firebase:', e);
      return false;
    }
  }

  // Intentar cargar los scripts
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
      
      if (!firebase.apps.length) {
        firebase.initializeApp(this.firebaseConfig);
      }
      
      console.log('Firebase inicializado correctamente desde FirebaseService');
      this.auth = firebase.auth();
      this.db = firebase.firestore();
      this.firebaseAvailable = true;
    } catch (e) {
      console.error('Error al inicializar Firebase:', e);
      this.firebaseAvailable = false;
    }
  }
  
  // Obtener usuario actual
  getCurrentUser() {
    if (!this.firebaseAvailable) return null;
    return this.auth ? this.auth.currentUser : null;
  }
  
  // Verificar si hay usuario autenticado
  isUserAuthenticated() {
    try {
      if (!this.firebaseAvailable) return false;
      const user = this.auth ? this.auth.currentUser : null;
      return user !== null;
    } catch (e) {
      console.error('Error al verificar autenticación:', e);
      return false;
    }
  }
  
  // Obtener ID del usuario
  getUserId() {
    if (!this.firebaseAvailable) return null;
    const user = this.auth ? this.auth.currentUser : null;
    return user ? user.uid : null;
  }
  
  // Cerrar sesión
  async logout() {
    try {
      if (!this.firebaseAvailable) {
        return { success: false, error: 'Firebase no disponible' };
      }
      await this.auth.signOut();
      return { success: true };
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      return { success: false, error: error.message };
    }
  }
  
  // Guardar credenciales en Firebase
  async saveCredential(credential) {
    try {
      console.log('SaveCredential llamado con:', {
        sitio: credential.sitio,
        usuario: credential.usuario,
        contraseña: credential.contraseña ? 'presente' : 'ausente'
      });
      
      if (!this.firebaseAvailable) {
        console.error('Firebase no disponible al intentar guardar credencial');
        return { success: false, error: 'Firebase no disponible. La contraseña no se puede guardar.' };
      }
      
      if (!this.auth) {
        console.error('Auth de Firebase no disponible');
        return { success: false, error: 'Servicio de autenticación no disponible' };
      }
      
      const user = this.auth.currentUser;
      console.log('Usuario actual:', user ? user.uid : 'No autenticado');
      
      if (!user) {
        console.error('Usuario no autenticado en saveCredential');
        return { success: false, error: 'Usuario no autenticado' };
      }
      
      // Verificar que tenemos todos los campos necesarios
      if (!credential.sitio || !credential.usuario || !credential.contraseña) {
        console.error('Faltan campos obligatorios en saveCredential');
        const camposFaltantes = [];
        if (!credential.sitio) camposFaltantes.push('sitio');
        if (!credential.usuario) camposFaltantes.push('usuario');
        if (!credential.contraseña) camposFaltantes.push('contraseña');
        
        return { 
          success: false, 
          error: `Faltan campos obligatorios: ${camposFaltantes.join(', ')}`
        };
      }
      
      // Log para identificar la estructura de la BD
      console.log(`Guardando en Firestore: usuarios/${user.uid}/pass/[nuevo-documento]`);

      // Crear objeto limpio para guardar
      const dataToSave = {
        sitio: credential.sitio,
        usuario: credential.usuario,
        contraseña: credential.contraseña,
        fechaCreacion: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      console.log('Estructura de datos a guardar:', Object.keys(dataToSave));
      
      // Usar la estructura correcta según las reglas de Firestore:
      // /usuarios/{userId}/pass/{documentId}
      const docRef = await this.db.collection('usuarios').doc(user.uid).collection('pass').add(dataToSave);
      
      console.log('Credencial guardada con ID:', docRef.id);
      return { success: true, id: docRef.id };
    } catch (error) {
      console.error('Error detallado al guardar credencial en Firebase:', error);
      // Verificar si es un error de permisos
      if (error.code === 'permission-denied') {
        console.error('Error de permisos al guardar credencial');
        return { 
          success: false, 
          error: 'permission-denied: No tienes permisos para guardar en esta ubicación. Verifica la configuración de reglas de Firestore.' 
        };
      }
      return { success: false, error: error.message || 'Error desconocido al guardar' };
    }
  }
  
  // Obtener todas las credenciales del usuario
  async getAllCredentials() {
    try {
      const user = this.auth.currentUser;
      if (!user) {
        throw new Error('Usuario no autenticado');
      }
      
      // Usar la estructura correcta según las reglas: /usuarios/{userId}/pass
      const snapshot = await this.db.collection('usuarios').doc(user.uid).collection('pass').get();
      
      const credenciales = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        credenciales.push({
          id: doc.id,
          sitio: data.sitio,
          usuario: data.usuario,
          password: data.contraseña, // Nota: Cambiamos el nombre para mantener compatibilidad
          fechaCreacion: data.fechaCreacion
        });
      });
      
      console.log(`Se encontraron ${credenciales.length} credenciales para el usuario ${user.email}`);
      return credenciales;
    } catch (error) {
      console.error('Error al obtener credenciales de Firebase:', error);
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
}

// Crear instancia global para usar en otros scripts
const firebaseService = new FirebaseService();
