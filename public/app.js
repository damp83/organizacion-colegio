import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, connectAuthEmulator, getIdTokenResult, signOut, GoogleAuthProvider, OAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, doc, getDoc, addDoc, updateDoc, deleteDoc, onSnapshot, collection, setLogLevel, connectFirestoreEmulator, getDocs } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// Establecer nivel de log para depuración de Firestore
setLogLevel('debug');

// Variables globales proporcionadas por el entorno
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
// Permitir que __firebase_config sea objeto o string JSON
let firebaseConfig = {};
try {
	const raw = (typeof __firebase_config !== 'undefined') ? __firebase_config : null;
	if (typeof raw === 'string') {
		firebaseConfig = JSON.parse(raw || '{}');
	} else if (raw && typeof raw === 'object') {
		firebaseConfig = raw;
	} else {
		firebaseConfig = {};
	}
} catch (err) {
	console.error('No se pudo analizar __firebase_config. Asegúrate de definirlo como objeto o JSON válido.', err);
	firebaseConfig = {};
}
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Referencias a elementos del DOM
const navButtons = document.querySelectorAll('.nav-bar button');
const sections = document.querySelectorAll('.seccion');
const documentosGrid = document.querySelector('.documentos-grid');
const userDisplay = document.querySelector('.user-info');
const btnLogout = document.getElementById('btn-logout');
const btnLoginGoogle = document.getElementById('btn-login-google');
const btnLoginMs = document.getElementById('btn-login-ms');

// Calendario
const calendarGrid = document.getElementById('calendar-grid');
const monthYearDisplay = document.getElementById('month-year');
const prevMonthBtn = document.getElementById('prev-month');
const nextMonthBtn = document.getElementById('next-month');

// Documentos
const btnSubirDocumento = document.getElementById('btn-subir-documento');
const modalDocumento = document.getElementById('modal-documento');
const formDocumento = document.getElementById('form-documento');
const closeModalDocBtn = document.querySelector('.close-btn-doc');

// Anuncios
const formAnuncio = document.getElementById('form-anuncio');
const listaAnuncios = document.getElementById('lista-anuncios');

// Agenda
const formAgenda = document.getElementById('form-agenda');
const listaAgenda = document.getElementById('lista-agenda');

// Modal de confirmación
const modalConfirmacion = document.getElementById('modal-confirmacion');
const btnConfirmar = document.getElementById('btn-confirmar');
const btnCancelar = document.getElementById('btn-cancelar');
const closeConfirmBtn = document.querySelector('#modal-confirmacion .close-btn');
let confirmationCallback = null;
        
// Variables de estado
let currentDate = new Date();
let auth, db, userId, isAdmin = false;
let didManualLogout = false;
// Cache de actividades para mantenerlas al cambiar de mes
let actividadesMapCache = new Map();

// --- Funciones de la base de datos ---
const getPublicCollection = (collectionName) => {
	return collection(db, `artifacts/${appId}/public/data/${collectionName}`);
};

// --- Seed de datos de ejemplo (opcional con ?seed=1) ---
async function seedDemoDataIfRequested() {
	try {
		const params = new URLSearchParams(location.search);
		if (!params.has('seed')) return;
		// Solo permitir seed desde localhost salvo que se fuerce con __allow_seed (bandera temporal)
		const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
		const allowSeed = typeof window !== 'undefined' && window.__allow_seed === true;
		if (!isLocal && !allowSeed) {
			console.warn('Seed bloqueado fuera de entorno local.');
			return;
		}

		// Solo sembrar si están vacías
		const colNames = ['documentos', 'anuncios', 'actividades', 'agenda'];
		const empties = [];
		for (const name of colNames) {
			const snap = await getDocs(getPublicCollection(name));
			if (snap.empty) empties.push(name);
		}

		if (empties.length === 0) {
			console.log('Seed: colecciones ya tienen datos, no se insertará.');
			return;
		}

		const now = Date.now();
		if (empties.includes('documentos')) {
			await addDoc(getPublicCollection('documentos'), {
				nombre: 'Proyecto Educativo de Centro',
				archivo: 'pec.pdf',
				fecha: new Date().toLocaleDateString('es-ES'),
				timestamp: now
			});
		}
		if (empties.includes('anuncios')) {
			await addDoc(getPublicCollection('anuncios'), {
				texto: 'Claustro general el próximo viernes a las 12:00.',
				timestamp: now
			});
		}
		if (empties.includes('actividades')) {
			const today = new Date();
			const y = today.getFullYear();
			const m = String(today.getMonth() + 1).padStart(2, '0');
			const d = String(Math.min(28, today.getDate())).padStart(2, '0');
			await addDoc(getPublicCollection('actividades'), {
				title: 'Reunión de ciclo',
				date: `${y}-${m}-${d}`,
				timestamp: now
			});
		}
		if (empties.includes('agenda')) {
			const today = new Date();
			const y = today.getFullYear();
			const m = String(today.getMonth() + 1).padStart(2, '0');
			const d = String(Math.min(28, today.getDate())).padStart(2, '0');
			await addDoc(getPublicCollection('agenda'), {
				title: 'Seguimiento Programación Didáctica',
				date: `${y}-${m}-${d}`,
				status: 'Programada',
				documento: '',
				description: 'Revisión de objetivos y acuerdos del trimestre.',
				timestamp: now
			});
		}
		console.log('Seed: datos de ejemplo insertados.');
	} catch (err) {
		console.error('Seed: error insertando datos de ejemplo:', err);
	}
}

// --- Funciones de UI/Renderizado ---
function cambiarSeccion(targetId) {
	navButtons.forEach(btn => btn.classList.remove('active'));
	sections.forEach(sec => sec.classList.remove('active'));
	const btn = document.getElementById(`btn-${targetId}`);
	const sec = document.getElementById(`seccion-${targetId}`);
	if (btn) btn.classList.add('active');
	if (sec) sec.classList.add('active');
}

function renderizarDocumentos(documentos) {
	documentosGrid.innerHTML = '';
	if (documentos.length === 0) {
		const p = document.createElement('p');
		p.className = 'loading-message';
		p.textContent = 'No hay documentos para mostrar.';
		documentosGrid.appendChild(p);
		return;
	}
	documentos.forEach(d => {
		const card = document.createElement('div');
		card.className = 'documento-card';
		const h3 = document.createElement('h3');
		h3.textContent = d.nombre || '';
		const p1 = document.createElement('p');
		const strong1 = document.createElement('strong');
		strong1.textContent = 'Archivo:';
		p1.appendChild(strong1);
		p1.append(' ' + (d.archivo || ''));
		const p2 = document.createElement('p');
		const strong2 = document.createElement('strong');
		strong2.textContent = 'Fecha de subida:';
		p2.appendChild(strong2);
		p2.append(' ' + (d.fecha || ''));
		const elements = [h3, p1, p2];
		const canManage = isAdmin || (d && d.createdBy && d.createdBy === userId);
		if (canManage) {
			const btn = document.createElement('button');
			btn.className = 'btn-accion eliminar';
			btn.dataset.id = d.id;
			btn.textContent = 'Eliminar';
			elements.push(btn);
		}
		card.append(...elements);
		documentosGrid.appendChild(card);
	});
}

function renderizarAnuncios(anuncios) {
	listaAnuncios.innerHTML = '';
	if (anuncios.length === 0) {
		const p = document.createElement('p');
		p.className = 'loading-message';
		p.textContent = 'No hay anuncios para mostrar.';
		listaAnuncios.appendChild(p);
		return;
	}
	anuncios.forEach(anuncio => {
		const item = document.createElement('div');
		item.className = 'anuncio-item';
		const text = document.createElement('span');
		text.textContent = anuncio.texto || '';
		const elements = [text];
		const canManage = isAdmin || (anuncio && anuncio.createdBy && anuncio.createdBy === userId);
		if (canManage) {
			const btn = document.createElement('button');
			btn.className = 'btn-accion eliminar';
			btn.style.marginLeft = 'auto';
			btn.dataset.id = anuncio.id;
			btn.textContent = 'Eliminar';
			elements.push(btn);
		}
		item.append(...elements);
		listaAnuncios.appendChild(item);
	});
}

function renderizarCalendario() {
	const year = currentDate.getFullYear();
	const month = currentDate.getMonth();
    
	monthYearDisplay.textContent = new Date(year, month).toLocaleString('es-ES', { month: 'long', year: 'numeric' });
    
	// Limpiar la cuadrícula, dejando los encabezados
	const dayCells = calendarGrid.querySelectorAll('.day-cell, .other-month');
	dayCells.forEach(cell => cell.remove());
    
	const firstDay = new Date(year, month, 1);
	const lastDay = new Date(year, month + 1, 0);
	const numDays = lastDay.getDate();

	const weekdayStart = (firstDay.getDay() + 6) % 7;

	for (let i = 0; i < weekdayStart; i++) {
		const emptyCell = document.createElement('div');
		emptyCell.className = 'day-cell other-month';
		calendarGrid.appendChild(emptyCell);
	}
    
	for (let day = 1; day <= numDays; day++) {
		const dayCell = document.createElement('div');
		dayCell.className = 'day-cell';
		dayCell.dataset.date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
		dayCell.innerHTML = `<span class="day-number">${day}</span>`;
		calendarGrid.appendChild(dayCell);
	}

	// Asignar actividades desde el caché y luego renderizar
	document.querySelectorAll('.day-cell').forEach(cell => {
		if (!cell.classList.contains('other-month')) {
			cell.activities = actividadesMapCache.get(cell.dataset.date) || [];
		}
	});
	renderizarActividades();
}

function renderizarActividades() {
	const dayCells = document.querySelectorAll('.day-cell');
	dayCells.forEach(cell => {
		const activities = cell.activities || [];
		// Eliminar actividades antiguas del DOM
		const oldActivities = cell.querySelectorAll('.activity-item');
		oldActivities.forEach(act => act.remove());

		activities.forEach(act => {
			const activityItem = document.createElement('div');
			activityItem.className = 'activity-item';
			const titleSpan = document.createElement('span');
			titleSpan.textContent = act.title || '';
			activityItem.appendChild(titleSpan);
			const canManage = isAdmin || (act && act.createdBy && act.createdBy === userId);
			if (canManage) {
				const del = document.createElement('button');
				del.className = 'delete-btn';
				del.dataset.id = act.id;
				del.textContent = '×';
				activityItem.appendChild(del);
			}
			cell.appendChild(activityItem);
		});
	});
}

function renderizarAgenda(agenda) {
	agenda.sort((a, b) => new Date(a.date) - new Date(b.date));
	listaAgenda.innerHTML = '';
	if (agenda.length === 0) {
		listaAgenda.innerHTML = '<p class="loading-message">No hay reuniones en la agenda.</p>';
		return;
	}
	agenda.forEach(item => {
		const statusClass = `status-${(item.status || '').toLowerCase().replace(/\s+/g, '-')}`;
		const container = document.createElement('div');
		container.className = 'agenda-item';
		const header = document.createElement('div');
		header.className = 'item-header';
		const h4 = document.createElement('h4');
		h4.textContent = item.title || '';
		const actions = document.createElement('div');
		actions.className = 'actions';
		const badge = document.createElement('span');
		badge.className = `status-badge ${statusClass}`;
		badge.textContent = item.status || '';
		actions.append(badge);
		const canManage = isAdmin || (item && item.createdBy && item.createdBy === userId);
		if (canManage) {
			const editBtn = document.createElement('button');
			editBtn.className = 'btn-accion editar';
			editBtn.dataset.id = item.id;
			editBtn.textContent = 'Editar';
			const delBtn = document.createElement('button');
			delBtn.className = 'btn-accion eliminar';
			delBtn.dataset.id = item.id;
			delBtn.textContent = 'Eliminar';
			actions.append(editBtn, delBtn);
		}
		header.append(h4, actions);
		const pFecha = document.createElement('p');
		const s1 = document.createElement('strong'); s1.textContent = 'Fecha:';
		pFecha.append(s1, ' ', item.date || '');
		const pDesc = document.createElement('p');
		const s2 = document.createElement('strong'); s2.textContent = 'Descripción:';
		pDesc.append(s2, ' ', item.description || '');
		container.append(header, pFecha, pDesc);
		if (item.documento) {
			const pDoc = document.createElement('p');
			const s3 = document.createElement('strong'); s3.textContent = 'Documento:';
			const a = document.createElement('a');
			a.target = '_blank';
			try {
				const url = new URL(item.documento);
				a.href = url.href;
				a.textContent = 'Ver documento';
				pDoc.append(s3, ' ', a);
				container.appendChild(pDoc);
			} catch (_) { /* ignore invalid URL */ }
		}
		listaAgenda.appendChild(container);
	});
}

// --- Listeners de Firestore ---
function setupFirestoreListeners() {
	// Documentos
	onSnapshot(getPublicCollection('documentos'), (querySnapshot) => {
		const documentos = [];
		querySnapshot.forEach(doc => {
			documentos.push({ id: doc.id, ...doc.data() });
		});
		renderizarDocumentos(documentos);
	});

	// Anuncios
	onSnapshot(getPublicCollection('anuncios'), (querySnapshot) => {
		const anuncios = [];
		querySnapshot.forEach(doc => {
			anuncios.push({ id: doc.id, ...doc.data() });
		});
		anuncios.sort((a, b) => a.timestamp - b.timestamp);
		renderizarAnuncios(anuncios);
	});

	// Calendario
	onSnapshot(getPublicCollection('actividades'), (querySnapshot) => {
		actividadesMapCache = new Map();
		querySnapshot.forEach(docSnap => {
			const data = docSnap.data();
			const dateKey = data.date;
			if (!actividadesMapCache.has(dateKey)) {
				actividadesMapCache.set(dateKey, []);
			}
			actividadesMapCache.get(dateKey).push({ id: docSnap.id, ...data });
		});
		// Reasignar actividades a los días actualmente visibles
		document.querySelectorAll('.day-cell').forEach(cell => {
			if (!cell.classList.contains('other-month')) {
				cell.activities = actividadesMapCache.get(cell.dataset.date) || [];
			}
		});
		renderizarActividades();
	});

	// Agenda
	onSnapshot(getPublicCollection('agenda'), (querySnapshot) => {
		const agenda = [];
		querySnapshot.forEach(doc => {
			agenda.push({ id: doc.id, ...doc.data() });
		});
		renderizarAgenda(agenda);
	});
}

// --- Lógica del Calendario ---
function agregarFormularioActividad(cell) {
	document.querySelectorAll('.actividad-form').forEach(form => form.remove());
	const form = document.createElement('form');
	form.className = 'actividad-form';
	form.innerHTML = `
		<input type="text" class="input-activity" placeholder="Nueva actividad..." required>
	`;
	cell.appendChild(form);
	const input = form.querySelector('input');
	input.focus();

	form.addEventListener('submit', async (e) => {
		e.preventDefault();
		const titulo = input.value;
		const date = cell.dataset.date;
		await addDoc(getPublicCollection('actividades'), {
			title: titulo,
			date: date,
			timestamp: Date.now(),
			createdBy: userId || null
		});
		form.remove();
	});
}
        
// --- Lógica del modal de confirmación ---
function showConfirmationModal(message, callback) {
	document.getElementById('confirm-message').textContent = message;
	modalConfirmacion.style.display = 'flex';
	confirmationCallback = callback;
}

// --- Inicialización de la aplicación ---
async function initializeAppClient() {
	if (!firebaseConfig.apiKey) {
		console.error("Firebase no está configurado correctamente.");
		userDisplay.textContent = "Error: Firebase no configurado";
		return;
	}
    
	const app = initializeApp(firebaseConfig);
	auth = getAuth(app);
	db = getFirestore(app);

	// Completar flujos de login por redirección (si los hay)
	try {
		await getRedirectResult(auth);
	} catch (e) {
		console.warn('Redirect login no completado:', e?.message || e);
	}

	// Conectar a emuladores si está activado o si estamos en localhost por defecto
	const useEmulators = (typeof window !== 'undefined' && typeof window.__use_emulators !== 'undefined')
		? !!window.__use_emulators
		: (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
	if (useEmulators) {
		try {
			connectAuthEmulator(auth, 'http://localhost:9099');
		} catch (_) {}
		try {
			connectFirestoreEmulator(db, 'localhost', 8080);
		} catch (_) {}
	}

	onAuthStateChanged(auth, async (user) => {
		if (user) {
			userId = user.uid;
			try {
				const res = await getIdTokenResult(user, true);
				isAdmin = !!(res && res.claims && res.claims.admin);
			} catch (_) { isAdmin = false; }
			userDisplay.textContent = `ID de Usuario: ${userId}${isAdmin ? ' (admin)' : ''}`;
			if (btnLogout) btnLogout.style.display = 'inline-block';
			if (btnLoginGoogle) btnLoginGoogle.style.display = 'none';
			if (btnLoginMs) btnLoginMs.style.display = 'none';
			setupFirestoreListeners();
			renderizarCalendario();
			// Seed opcional si se pasó ?seed=1
			seedDemoDataIfRequested();
			// Resetear bandera de logout manual una vez haya sesión
			didManualLogout = false;
		} else {
			// Si el usuario cerró sesión manualmente, no reautenticar automáticamente
			if (didManualLogout) {
				userId = null;
				isAdmin = false;
				userDisplay.textContent = "No conectado";
				if (btnLogout) btnLogout.style.display = 'none';
				if (btnLoginGoogle) btnLoginGoogle.style.display = 'inline-block';
				if (btnLoginMs) btnLoginMs.style.display = 'inline-block';
				return;
			}

			userDisplay.textContent = "Usuario anónimo";
			if (btnLogout) btnLogout.style.display = 'none';
			if (btnLogin) btnLogin.style.display = 'inline-block';
			if (initialAuthToken) {
				try {
					await signInWithCustomToken(auth, initialAuthToken);
				} catch (error) {
					console.error("Error al iniciar sesión con token personalizado:", error);
					await signInAnonymously(auth);
				}
			} else {
				await signInAnonymously(auth);
			}
		}
	});
}

// Logout handler
if (btnLogout) {
	btnLogout.addEventListener('click', async () => {
		try {
			didManualLogout = true;
			await signOut(auth);
		} catch (e) {
			console.error('Error al cerrar sesión', e);
		}
	});
}

if (btnLoginGoogle) {
	btnLoginGoogle.addEventListener('click', async () => {
		try {
			didManualLogout = false;
			const provider = new GoogleAuthProvider();
			provider.setCustomParameters({ prompt: 'select_account' });
			try {
				await signInWithPopup(auth, provider);
			} catch (e) {
				const code = e && e.code ? String(e.code) : '';
				if (code.includes('popup-closed-by-user') || code.includes('popup-blocked') || code.includes('cancelled-popup-request')) {
					await signInWithRedirect(auth, provider);
				} else {
					throw e;
				}
			}
		} catch (e) {
			console.error('Error al iniciar con Google', e);
		}
	});
}

if (btnLoginMs) {
	btnLoginMs.addEventListener('click', async () => {
		try {
			didManualLogout = false;
			const provider = new OAuthProvider('microsoft.com');
			provider.setCustomParameters({ prompt: 'select_account' });
			try {
				await signInWithPopup(auth, provider);
			} catch (e) {
				const code = e && e.code ? String(e.code) : '';
				if (code.includes('popup-closed-by-user') || code.includes('popup-blocked') || code.includes('cancelled-popup-request')) {
					await signInWithRedirect(auth, provider);
				} else {
					throw e;
				}
			}
		} catch (e) {
			console.error('Error al iniciar con Microsoft', e);
		}
	});
}

// --- Event Listeners ---
navButtons.forEach(button => {
	button.addEventListener('click', () => {
		const id = button.id.replace('btn-', '');
		cambiarSeccion(id);
	});
});

// Eventos del calendario
calendarGrid.addEventListener('click', (e) => {
	const cell = e.target.closest('.day-cell');
	// No abrir formulario si el click fue sobre una actividad o el botón eliminar
	if (cell && !e.target.classList.contains('delete-btn') && !e.target.closest('.activity-item')) {
		agregarFormularioActividad(cell);
	}
	// Detección de botón eliminar
	if (e.target.classList.contains('delete-btn')) {
		const activityId = e.target.dataset.id;
		showConfirmationModal('¿Estás seguro de que quieres eliminar esta actividad?', async () => {
			await deleteDoc(doc(getPublicCollection('actividades'), activityId));
		});
	}
});

prevMonthBtn.addEventListener('click', () => {
	currentDate.setMonth(currentDate.getMonth() - 1);
	renderizarCalendario();
});

nextMonthBtn.addEventListener('click', () => {
	currentDate.setMonth(currentDate.getMonth() + 1);
	renderizarCalendario();
});

// Eventos del formulario de documentos
btnSubirDocumento.addEventListener('click', () => {
	modalDocumento.style.display = 'flex';
	modalDocumento.setAttribute('aria-hidden', 'false');
	// Enfocar el primer campo del formulario
	setTimeout(() => document.getElementById('documento-titulo').focus(), 0);
});

closeModalDocBtn.addEventListener('click', () => {
	modalDocumento.style.display = 'none';
	modalDocumento.setAttribute('aria-hidden', 'true');
	formDocumento.reset();
});
        
window.addEventListener('click', (event) => {
	if (event.target === modalDocumento) {
		modalDocumento.style.display = 'none';
		modalDocumento.setAttribute('aria-hidden', 'true');
		formDocumento.reset();
	}
});

formDocumento.addEventListener('submit', async (e) => {
	e.preventDefault();
	const titulo = document.getElementById('documento-titulo').value;
	const archivo = document.getElementById('documento-archivo').files[0];
    
	if (titulo && archivo) {
		const newDocument = {
			nombre: titulo,
			archivo: archivo.name,
			fecha: new Date().toLocaleDateString('es-ES'),
			timestamp: Date.now(),
			createdBy: userId || null
		};
        
		await addDoc(getPublicCollection('documentos'), newDocument);
	}
	modalDocumento.style.display = 'none';
	modalDocumento.setAttribute('aria-hidden', 'true');
	formDocumento.reset();
});

documentosGrid.addEventListener('click', (e) => {
	if (e.target.classList.contains('eliminar')) {
		const id = e.target.dataset.id;
		showConfirmationModal('¿Estás seguro de que quieres eliminar este documento?', async () => {
			await deleteDoc(doc(getPublicCollection('documentos'), id));
		});
	}
});

// Evento del formulario de anuncios
formAnuncio.addEventListener('submit', async (e) => {
	e.preventDefault();
	const textoAnuncio = document.getElementById('anuncio-texto').value;
	await addDoc(getPublicCollection('anuncios'), {
		texto: textoAnuncio,
		timestamp: Date.now(),
		createdBy: userId || null
	});
	formAnuncio.reset();
});

listaAnuncios.addEventListener('click', (e) => {
	if (e.target.classList.contains('eliminar')) {
		const id = e.target.dataset.id;
		showConfirmationModal('¿Estás seguro de que quieres eliminar este anuncio?', async () => {
			await deleteDoc(doc(getPublicCollection('anuncios'), id));
		});
	}
});

// Evento del formulario de agenda
formAgenda.addEventListener('submit', async (e) => {
	e.preventDefault();
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
