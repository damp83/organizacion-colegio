// LIMPIO: app.js reconstruido
// Funciones: Auth (Google/Microsoft + anónimo), allowlist, CRUD (documentos base64, anuncios, actividades con calendario y drag&drop, agenda)

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence, signInAnonymously, onAuthStateChanged, connectAuthEmulator, getIdTokenResult, signOut, GoogleAuthProvider, OAuthProvider, signInWithRedirect, getRedirectResult, signInWithPopup } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, doc, getDoc, addDoc, updateDoc, deleteDoc, onSnapshot, collection, setLogLevel, connectFirestoreEmulator, getDocs } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

setLogLevel('error');

// Estado principal
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
let firebaseConfig={}; try { const raw = typeof __firebase_config!=='undefined'?__firebase_config:null; firebaseConfig = typeof raw==='string'?JSON.parse(raw||'{}'):(raw||{});} catch { firebaseConfig={}; }
const AUTH_MODE='popup';
const LS_REDIRECT_MARK='pendingRedirectProvider';
let auth, db, userId=null, isAdmin=false, canWrite=false, didManualLogout=false;
let lastRedirectResultChecked=false; let lastLoginAttempt=null;
let actividadesMapCache=new Map();
let dragActivity=null, dragSourceDate=null;

// Allowlist
const ALLOWLIST_EMAILS=new Set([
	"alejandra.fernandez@murciaeduca.es","anaadela.cordoba@murciaeduca.es","anabelen.cano@murciaeduca.es","anama.villacieros@murciaeduca.es","andres.alcaraz@murciaeduca.es","begona.tornel@murciaeduca.es","belen.martinez2@murciaeduca.es","carmenmarta.perez@murciaeduca.es","catalina.alcazar@murciaeduca.es","catalina.mendez2@murciaeduca.es","celiam.requena@murciaeduca.es","cristina.martinez25@murciaeduca.es","cristina.vivo@murciaeduca.es","estela.garcia@murciaeduca.es","fulgencio.osete2@murciaeduca.es","josefa.soto@murciaeduca.es","josefrancisco.nicolas@murciaeduca.es","josejuan.martinez@murciaeduca.es","juanjose.almagro@murciaeduca.es","laura.garcia6@murciaeduca.es","luis.rodriguez5@murciaeduca.es","luisfelipe.murcia@murciaeduca.es","mariaangeles.noguera@murciaeduca.es","mariaaraceli.cases@murciaeduca.es","mariaester.carrillo@murciaeduca.es","mariafrancisc.franco@murciaeduca.es","mariajosefa.caballero@murciaeduca.es","mariateresa.martinez4@murciaeduca.es","marta.martinez3@murciaeduca.es","nuria.alvarez@murciaeduca.es","paloma.crespo@murciaeduca.es","pedro.martinez39@murciaeduca.es","rita.bohajar@murciaeduca.es","sonia.escamez@murciaeduca.es","teresa.fernandez2@murciaeduca.es","diegoalberto.moya@murciaeduca.es"
]);
const computeCanWrite=(u,admin)=>!!u && (admin || ALLOWLIST_EMAILS.has((u.email||'').toLowerCase()));

// DOM
const navButtons=document.querySelectorAll('.nav-bar button');
const sections=document.querySelectorAll('.seccion');
const documentosGrid=document.querySelector('.documentos-grid');

// Evento del formulario de agenda
formAgenda.addEventListener('submit', async (e) => {
	e.preventDefault();
	if (!requireAuthForWrites() || !canWrite) { try { alert('No tienes permisos para crear o editar reuniones.'); } catch(_){} return; }
	const id = document.getElementById('agenda-id').value;
	const titulo = document.getElementById('agenda-titulo').value;
	const fecha = document.getElementById('agenda-fecha').value;
	const estado = document.getElementById('agenda-estado').value;
	const documento = document.getElementById('agenda-documento').value;
	const descripcion = document.getElementById('agenda-descripcion').value;

	if (id) {
		// Modo edición
		const docRef = doc(getPublicCollection('agenda'), id);
	await updateDoc(docRef, {
			title: titulo,
			date: fecha,
			status: estado,
			documento: documento,
			description: descripcion
		});
	} else {
		// Modo creación
		const newMeeting = {
			title: titulo,
			date: fecha,
			status: estado,
			documento: documento,
			description: descripcion,
			timestamp: Date.now(),
			createdBy: userId || null
		};
		await addDoc(getPublicCollection('agenda'), newMeeting);
	}
	formAgenda.reset();
	document.getElementById('agenda-id').value = '';
});
        
// Eventos de la lista de agenda (delegación de eventos)
listaAgenda.addEventListener('click', async (e) => {
	if (e.target.classList.contains('eliminar')) {
		if (!requireAuthForWrites() || !canWrite) { try { alert('No tienes permisos para eliminar reuniones.'); } catch(_){} return; }
		const id = e.target.dataset.id;
		showConfirmationModal('¿Estás seguro de que quieres eliminar esta reunión?', async () => {
			await deleteDoc(doc(getPublicCollection('agenda'), id));
		});
	}
	if (e.target.classList.contains('editar')) {
		const id = e.target.dataset.id;
		const docRef = doc(getPublicCollection('agenda'), id);
		try {
			const docSnap = await getDoc(docRef);
			if (docSnap.exists()) {
				const itemToEdit = docSnap.data();
				document.getElementById('agenda-id').value = docSnap.id;
				document.getElementById('agenda-titulo').value = itemToEdit.title;
				document.getElementById('agenda-fecha').value = itemToEdit.date;
				document.getElementById('agenda-estado').value = itemToEdit.status;
				document.getElementById('agenda-documento').value = itemToEdit.documento || '';
				document.getElementById('agenda-descripcion').value = itemToEdit.description;
			}
		} catch (error) {
			console.error("Error al obtener el documento para edición:", error);
		}
	}
});

// Doble clic en item de agenda para editar (sin necesidad del botón)
listaAgenda.addEventListener('dblclick', async (e) => {
	const container = e.target.closest('.agenda-item');
	if (!container) return;
	// Obtener id buscando en acciones (botón editar) si existe
	let id = null;
	const editBtn = container.querySelector('.btn-accion.editar');
	if (editBtn) id = editBtn.dataset.id;
	// fallback: intentar localizar por data-id futuro (si se añade)
	if (!id) return;
	try {
		const docRef = doc(getPublicCollection('agenda'), id);
		const docSnap = await getDoc(docRef);
		if (docSnap.exists()) {
			const item = docSnap.data();
			document.getElementById('agenda-id').value = docSnap.id;
			document.getElementById('agenda-titulo').value = item.title;
			document.getElementById('agenda-fecha').value = item.date;
			document.getElementById('agenda-estado').value = item.status;
			document.getElementById('agenda-documento').value = item.documento || '';
			document.getElementById('agenda-descripcion').value = item.description;
			// Scroll a formulario para visibilidad
			try { document.getElementById('form-agenda').scrollIntoView({ behavior:'smooth', block:'start' }); } catch(_){ }
		}
	} catch(err) {
		console.warn('No se pudo cargar la reunión para edición', err);
	}
});

// Eventos del modal de confirmación
btnConfirmar.addEventListener('click', () => {
	if (confirmationCallback) {
		confirmationCallback();
	}
	modalConfirmacion.style.display = 'none';
	modalConfirmacion.setAttribute('aria-hidden', 'true');
	confirmationCallback = null;
});

btnCancelar.addEventListener('click', () => {
	modalConfirmacion.style.display = 'none';
	modalConfirmacion.setAttribute('aria-hidden', 'true');
	confirmationCallback = null;
});

closeConfirmBtn.addEventListener('click', () => {
	modalConfirmacion.style.display = 'none';
	modalConfirmacion.setAttribute('aria-hidden', 'true');
	confirmationCallback = null;
});

window.addEventListener('click', (event) => {
	if (event.target === modalConfirmacion) {
		modalConfirmacion.style.display = 'none';
		modalConfirmacion.setAttribute('aria-hidden', 'true');
		confirmationCallback = null;
	}
});

// Accesibilidad: cerrar modales con Escape y controlar foco
document.addEventListener('keydown', (e) => {
	if (e.key === 'Escape') {
		if (modalDocumento.style.display === 'flex') {
			modalDocumento.style.display = 'none';
			modalDocumento.setAttribute('aria-hidden', 'true');
			formDocumento.reset();
		}
		if (modalConfirmacion.style.display === 'flex') {
			modalConfirmacion.style.display = 'none';
			modalConfirmacion.setAttribute('aria-hidden', 'true');
			confirmationCallback = null;
		}
	}
});

// Inicializar
initializeAppClient();

// Requiere sesión para acciones de escritura
function requireAuthForWrites() {
	if (!auth || !auth.currentUser) {
		try { alert('Inicia sesión para realizar esta acción.'); } catch (_) {}
		return false;
	}
	return true;
}

// Utilidad convertir archivo a base64
function fileToBase64(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}
