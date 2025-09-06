import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, connectAuthEmulator, getIdTokenResult, signOut, GoogleAuthProvider, OAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, doc, getDoc, addDoc, updateDoc, deleteDoc, onSnapshot, collection, setLogLevel, connectFirestoreEmulator, getDocs } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
// Eliminado Firebase Storage: se usará Firestore con base64 para archivos pequeños

// Reducir verbosidad de Firestore en consola
setLogLevel('error');

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
// Modo de autenticación preferido: 'redirect' elimina los warnings de popups
// Cambiamos a 'popup' por defecto porque el redirect no devuelve resultado en tu entorno
const AUTH_MODE = (typeof window !== 'undefined' && window.__auth_mode) ? String(window.__auth_mode) : 'popup';

// Referencias a elementos del DOM
const navButtons = document.querySelectorAll('.nav-bar button');
const sections = document.querySelectorAll('.seccion');
const documentosGrid = document.querySelector('.documentos-grid');
const userDisplay = document.querySelector('.user-info');
const btnLogout = document.getElementById('btn-logout');
const btnLoginGoogle = document.getElementById('btn-login-google');
const btnLoginMs = document.getElementById('btn-login-ms');
const menuToggle = document.getElementById('menu-toggle');
const navBar = document.getElementById('nav-secciones');
const filtroCursosSelect = document.getElementById('filtro-cursos');
const filtroCursosClear = document.getElementById('filtro-cursos-clear');
if (menuToggle && navBar) {
	menuToggle.addEventListener('click', () => {
		const open = navBar.classList.toggle('open');
		menuToggle.classList.toggle('open', open);
		menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
	});
	document.addEventListener('click', (e) => {
		if (!navBar.classList.contains('open')) return;
		if (e.target === menuToggle || menuToggle.contains(e.target)) return;
		if (navBar.contains(e.target)) return;
		navBar.classList.remove('open');
		menuToggle.classList.remove('open');
		menuToggle.setAttribute('aria-expanded','false');
	});
}

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

// Modal detalle actividad
const modalActividadDetalle = document.getElementById('modal-actividad-detalle');
const closeBtnActDet = document.querySelector('.close-btn-act-det');
const btnDetalleCerrar = document.getElementById('actividad-detalle-cerrar');
const btnDetalleEditar = document.getElementById('actividad-detalle-editar');
const detalleBody = document.getElementById('actividad-detalle-body');

function cerrarModalActividadDetalle(){ if(modalActividadDetalle) modalActividadDetalle.style.display='none'; }
if (closeBtnActDet) closeBtnActDet.addEventListener('click', cerrarModalActividadDetalle);
if (btnDetalleCerrar) btnDetalleCerrar.addEventListener('click', cerrarModalActividadDetalle);

function mostrarDetalleActividad(act){
	if (!detalleBody) return;
	detalleBody.innerHTML='';
	const rows = [];
	const add = (label, value) => { const p=document.createElement('p'); p.innerHTML=`<span class="label">${label}:</span> ${value||''}`; detalleBody.appendChild(p); };
	add('Nombre', act.title || '');
	add('Fecha', act.date || '');
	add('Hora', act.time || '');
	add('Duración (min)', act.duration != null ? act.duration : '');
	add('Tipo', act.tipo === 'salida' ? 'Salida del centro' : 'Dentro del centro');
	add('Curso/Grupo', act.curso || '');
	// Si es array mostrar coma separada
	if (Array.isArray(act.curso)) {
		const lastP = detalleBody.lastElementChild;
		if (lastP) lastP.innerHTML = `<span class="label">Curso/Grupo:</span> ${act.curso.join(', ')}`;
	}
	add('Personal', act.personal && act.personal.length ? act.personal.join(', ') : '');
	const canManage = canWrite && (isAdmin || (act.createdBy ? act.createdBy === userId : true));
	if (btnDetalleEditar) btnDetalleEditar.style.display = canManage ? 'inline-block' : 'none';
	if (btnDetalleEditar) {
		btnDetalleEditar.onclick = () => {
			cerrarModalActividadDetalle();
			abrirModalActividad(act.date, act);
		};
	}
	if (modalActividadDetalle) modalActividadDetalle.style.display='flex';
	const titleEl = document.getElementById('modal-act-detalle-title');
	if (titleEl) titleEl.textContent = act.title || 'Actividad';
}
        
// Variables de estado
let currentDate = new Date();
let auth, db, userId, isAdmin = false; // storage eliminado
// Permisos de escritura calculados en cliente (coincidir con reglas): admin o email verificado en allowlist
let canWrite = false;
let lastRedirectError = null;
let lastRedirectResultChecked = false;
let lastLoginAttempt = null; // { provider: 'google'|'microsoft', ts: number }
let triedPopupFallback = false;
const LS_REDIRECT_MARK = 'pendingRedirectProvider';
const ALLOWLIST_EMAILS = new Set([
	"alejandra.fernandez@murciaeduca.es",
	"anaadela.cordoba@murciaeduca.es",
	"anabelen.cano@murciaeduca.es",
	"anama.villacieros@murciaeduca.es",
	"andres.alcaraz@murciaeduca.es",
	"begona.tornel@murciaeduca.es",
	"belen.martinez2@murciaeduca.es",
	"carmenmarta.perez@murciaeduca.es",
	"catalina.alcazar@murciaeduca.es",
	"catalina.mendez2@murciaeduca.es",
	"celiam.requena@murciaeduca.es",
	"cristina.martinez25@murciaeduca.es",
	"cristina.vivo@murciaeduca.es",
	"estela.garcia@murciaeduca.es",
	"fulgencio.osete2@murciaeduca.es",
	"josefa.soto@murciaeduca.es",
	"josefrancisco.nicolas@murciaeduca.es",
	"josejuan.martinez@murciaeduca.es",
	"juanjose.almagro@murciaeduca.es",
	"laura.garcia6@murciaeduca.es",
	"luis.rodriguez5@murciaeduca.es",
	"luisfelipe.murcia@murciaeduca.es",
	"mariaangeles.noguera@murciaeduca.es",
	"mariaaraceli.cases@murciaeduca.es",
	"mariaester.carrillo@murciaeduca.es",
	"mariafrancisc.franco@murciaeduca.es",
	"mariajosefa.caballero@murciaeduca.es",
	"mariateresa.martinez4@murciaeduca.es",
	"marta.martinez3@murciaeduca.es",
	"nuria.alvarez@murciaeduca.es",
	"paloma.crespo@murciaeduca.es",
	"pedro.martinez39@murciaeduca.es",
	"rita.bohajar@murciaeduca.es",
	"sonia.escamez@murciaeduca.es",
	"teresa.fernandez2@murciaeduca.es",
	"diegoalberto.moya@murciaeduca.es"
]);
function computeCanWrite(u, adminFlag) {
	if (!u) return false;
	if (adminFlag) return true;
	const email = (u.email || '').toLowerCase();
	return !!ALLOWLIST_EMAILS.has(email);
}

// --- Modal avanzado Actividad ---
const modalActividad = document.getElementById('modal-actividad');
const formActividad = document.getElementById('form-actividad');
const btnActividadCancelar = document.getElementById('actividad-cancelar');
const cursosSelect = document.getElementById('actividad-curso');
const closeBtnAct = document.querySelector('.close-btn-act');
const inputActId = document.getElementById('actividad-id');
const inputActNombre = document.getElementById('actividad-nombre');
const inputActFecha = document.getElementById('actividad-fecha');
const inputActHora = document.getElementById('actividad-hora');
const inputActDuracion = document.getElementById('actividad-duracion');
const inputActTipo = document.getElementById('actividad-tipo');
const inputActCurso = document.getElementById('actividad-curso');
const inputActPersonal = document.getElementById('actividad-personal');

function poblarCursos() {
	if (!cursosSelect) return;
	if (cursosSelect.options.length > 0) return; // ya poblado
	const niveles = [];
	for (let edad = 3; edad <= 5; edad++) { ['A','B'].forEach(gr => niveles.push(`Infantil ${edad} ${gr}`)); }
	for (let curso = 1; curso <= 6; curso++) { ['A','B'].forEach(gr => niveles.push(`${curso}º Primaria ${gr}`)); }
	niveles.forEach(n => { const opt = document.createElement('option'); opt.value = n; opt.textContent = n; cursosSelect.appendChild(opt); });
		// También poblar filtro (sin duplicar)
		if (filtroCursosSelect && filtroCursosSelect.options.length === 0) {
			niveles.forEach(n => { const o=document.createElement('option'); o.value=n; o.textContent=n; filtroCursosSelect.appendChild(o); });
		}
}

function abrirModalActividad(fechaISO, actividad=null) {
	if (!canWrite) { try { alert('No tienes permisos para crear actividades'); } catch(_){} return; }
	poblarCursos();
	if (formActividad) formActividad.reset();
	if (inputActId) inputActId.value = actividad ? actividad.id : '';
	if (inputActNombre) inputActNombre.value = actividad ? (actividad.title||'') : '';
	if (inputActFecha) inputActFecha.value = actividad ? (actividad.date||fechaISO) : fechaISO;
	if (inputActHora) inputActHora.value = actividad && actividad.time ? actividad.time : '';
	if (inputActDuracion) inputActDuracion.value = actividad && actividad.duration ? actividad.duration : '';
	if (inputActTipo) inputActTipo.value = actividad && actividad.tipo ? actividad.tipo : 'dentro';
	if (inputActCurso) {
		// Limpiar selección previa
		[...inputActCurso.options].forEach(o => o.selected = false);
		const valores = actividad && actividad.curso ? (Array.isArray(actividad.curso) ? actividad.curso : [actividad.curso]) : [];
		if (valores.length === 0 && inputActCurso.options[0]) {
			inputActCurso.options[0].selected = true;
		} else {
			valores.forEach(v => {
				const opt = [...inputActCurso.options].find(o => o.value === v);
				if (opt) opt.selected = true;
			});
		}
	}
	if (inputActPersonal) inputActPersonal.value = actividad && actividad.personal ? (Array.isArray(actividad.personal)? actividad.personal.join(', ') : actividad.personal) : '';
	const titleEl = document.getElementById('modal-act-title');
	if (titleEl) titleEl.textContent = actividad ? 'Editar Actividad' : 'Nueva Actividad';
	if (modalActividad) modalActividad.style.display = 'flex';
}
function cerrarModalActividad(){ if (modalActividad) modalActividad.style.display = 'none'; }
if (closeBtnAct) closeBtnAct.addEventListener('click', cerrarModalActividad);
if (btnActividadCancelar) btnActividadCancelar.addEventListener('click', cerrarModalActividad);
window.addEventListener('click', (e)=>{ if (e.target === modalActividad) cerrarModalActividad(); });
if (formActividad) {
	formActividad.addEventListener('submit', async (e) => {
		e.preventDefault();
		if (!requireAuthForWrites()) return;
		const title = inputActNombre.value.trim();
		const date = inputActFecha.value;
		const time = inputActHora.value || null;
		const duration = inputActDuracion.value ? parseInt(inputActDuracion.value,10) : null;
		const tipo = inputActTipo.value;
		const curso = inputActCurso ? [...inputActCurso.selectedOptions].map(o => o.value) : [];
		const personal = inputActPersonal.value.trim() ? inputActPersonal.value.split(/\s*,\s*/).filter(Boolean) : [];
		if (!title || !date) return;
		const baseData = { title, date, time, duration, tipo, curso, personal, timestamp: Date.now(), createdBy: userId || null };
		try {
			if (inputActId.value) {
				await updateDoc(doc(getPublicCollection('actividades'), inputActId.value), baseData);
			} else {
				await addDoc(getPublicCollection('actividades'), baseData);
			}
			cerrarModalActividad();
		} catch(err) {
			console.warn('Error guardando actividad', err);
			alert('No se pudo guardar la actividad');
		}
	});
}
let didManualLogout = false;
// Cache de actividades para mantenerlas al cambiar de mes
let actividadesMapCache = new Map();
// Estado temporal para Drag & Drop
let dragActivity = null; // { id, title, date, createdBy, ... }
let dragSourceDate = null;

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
				timestamp: now,
				createdBy: (userId || (auth && auth.currentUser ? auth.currentUser.uid : null))
			});
		}
		if (empties.includes('anuncios')) {
			await addDoc(getPublicCollection('anuncios'), {
				texto: 'Claustro general el próximo viernes a las 12:00.',
				timestamp: now,
				createdBy: (userId || (auth && auth.currentUser ? auth.currentUser.uid : null))
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
				timestamp: now,
				createdBy: (userId || (auth && auth.currentUser ? auth.currentUser.uid : null))
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
				timestamp: now,
				createdBy: (userId || (auth && auth.currentUser ? auth.currentUser.uid : null))
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
	if (btn) { btn.classList.add('active'); btn.classList.remove('has-unread'); }
	if (sec) sec.classList.add('active');
	// Persistencia de lectura
	if (latestMax[targetId] && latestMax[targetId] > (lastSeen[targetId]||0)) {
		lastSeen[targetId] = latestMax[targetId];
		scheduleSaveLastSeen();
	}
	// Cerrar menú móvil si está abierto
	if (navBar && navBar.classList.contains('open')) {
		navBar.classList.remove('open');
		if (menuToggle) { menuToggle.classList.remove('open'); menuToggle.setAttribute('aria-expanded','false'); }
	}
}

// --- Notificaciones simples ---
// Persistencia de indicadores (lastSeen) en localStorage
let lastSeen = { anuncios: 0, agenda: 0, actividades: 0 };
try {
	const storedLS = localStorage.getItem('lastSeenIndicators');
	if (storedLS) {
		const parsed = JSON.parse(storedLS);
		if (parsed && typeof parsed === 'object') {
			lastSeen = { ...lastSeen, ...parsed };
		}
	}
} catch(_) {}
function saveLastSeen(){
	try { localStorage.setItem('lastSeenIndicators', JSON.stringify(lastSeen)); } catch(_) {}
}
// Guardar periódicamente por seguridad (en caso de múltiples cambios rápidos)
let saveLastSeenDebounce = null;
function scheduleSaveLastSeen(){
	if (saveLastSeenDebounce) cancelAnimationFrame(saveLastSeenDebounce);
	saveLastSeenDebounce = requestAnimationFrame(saveLastSeen);
}
// Último timestamp máximo observado por colección (para marcar leído al entrar)
const latestMax = { anuncios: 0, agenda: 0, actividades: 0 };
function marcarNuevos(tipo, docs) {
	try {
		const maxTs = docs.reduce((m,d)=> d.timestamp && typeof d.timestamp === 'number' ? Math.max(m,d.timestamp) : m, 0);
		latestMax[tipo] = Math.max(latestMax[tipo]||0, maxTs);
		if (!maxTs) return;
			if (maxTs > (lastSeen[tipo]||0)) {
			// si sección no visible marcar
			const btn = document.getElementById(`btn-${tipo}`);
			const secVisible = document.getElementById(`seccion-${tipo}`)?.classList.contains('active');
			if (btn && !secVisible) btn.classList.add('has-unread');
			lastSeen[tipo] = maxTs;
				let msg = 'Nuevo contenido';
				if (tipo === 'anuncios') msg = 'Nuevo anuncio';
				else if (tipo === 'agenda') msg = 'Cambio en agenda';
				else if (tipo === 'actividades') msg = 'Nueva actividad / cambio en calendario';
				mostrarToast(msg);
			scheduleSaveLastSeen();
		}
	} catch(_){}
}

let toastContainer = null;
function ensureToastContainer(){
	if (!toastContainer){
		toastContainer = document.createElement('div');
		toastContainer.style.position='fixed';
		toastContainer.style.top='15px';
		toastContainer.style.right='15px';
		toastContainer.style.zIndex='9999';
		toastContainer.style.display='flex';
		toastContainer.style.flexDirection='column';
		toastContainer.style.gap='8px';
		document.body.appendChild(toastContainer);
	}
}
function mostrarToast(msg){
	ensureToastContainer();
	const el = document.createElement('div');
	el.textContent = msg;
	el.style.background = '#111827';
	el.style.color = '#fff';
	el.style.padding = '10px 14px';
	el.style.fontSize='0.8rem';
	el.style.borderRadius='8px';
	el.style.boxShadow='0 4px 12px rgba(0,0,0,0.25)';
	el.style.opacity='0';
	el.style.transform='translateY(-6px)';
	el.style.transition='all 0.35s ease';
	toastContainer.appendChild(el);
	requestAnimationFrame(()=>{ el.style.opacity='1'; el.style.transform='translateY(0)'; });
	setTimeout(()=>{
		el.style.opacity='0'; el.style.transform='translateY(-6px)';
		setTimeout(()=> el.remove(), 400);
	}, 4000);
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
		const h3 = document.createElement('h3'); h3.textContent = d.nombre || '';
		const p1 = document.createElement('p');
		const strong1 = document.createElement('strong'); strong1.textContent = 'Archivo:';
		p1.append(strong1, ' ' + (d.archivo || d.fileName || ''));
		const p2 = document.createElement('p');
		const strong2 = document.createElement('strong'); strong2.textContent = 'Fecha de subida:';
		p2.append(strong2, ' ' + (d.fecha || ''));
		const details = [h3, p1, p2];
		// Descarga inline si hay base64
		if (d.archivoBase64) {
			const btnDesc = document.createElement('button');
			btnDesc.className = 'btn-accion descargar';
			btnDesc.type = 'button';
			btnDesc.textContent = 'Descargar';
			btnDesc.addEventListener('click', () => {
				try {
					const bytes = atob(d.archivoBase64);
					const arr = new Uint8Array(bytes.length);
					for (let i=0;i<bytes.length;i++) arr[i] = bytes.charCodeAt(i);
					const blob = new Blob([arr], { type: d.mimeType || 'application/octet-stream' });
					const url = URL.createObjectURL(blob);
					const a = document.createElement('a');
					a.href = url;
					a.download = d.archivo || d.fileName || 'documento';
					document.body.appendChild(a);
					a.click();
					setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
				} catch(err) { alert('No se pudo descargar el archivo.'); }
			});
			details.push(btnDesc);
		} else if (d.storagePath) {
			// Documento legado subido cuando existía Storage: indicar no disponible
			const span = document.createElement('span');
			span.className = 'no-file';
			span.textContent = '(Contenido externo no disponible)';
			details.push(span);
		}
		const canManage = canWrite && (isAdmin || (d && (d.createdBy ? d.createdBy === userId : true)));
		if (canManage) {
			const delBtn = document.createElement('button');
			delBtn.className = 'btn-accion eliminar';
			delBtn.dataset.id = d.id;
			delBtn.textContent = 'Eliminar';
			details.push(delBtn);
		}
		card.append(...details);
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
		const canManage = canWrite && (isAdmin || (anuncio && (anuncio.createdBy ? anuncio.createdBy === userId : true)));
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
	// Obtener filtros activos
	let cursosFiltro = [];
	if (filtroCursosSelect) {
		cursosFiltro = [...filtroCursosSelect.selectedOptions].map(o=>o.value);
	}
	dayCells.forEach(cell => {
		const activities = cell.activities || [];
		// Eliminar actividades antiguas del DOM
		const oldActivities = cell.querySelectorAll('.activity-item');
		oldActivities.forEach(act => act.remove());

		activities.forEach(act => {
			// Filtrado por cursos (si actividad tiene array curso)
			if (cursosFiltro.length) {
				const actCursos = Array.isArray(act.curso) ? act.curso : (act.curso ? [act.curso] : []);
				if (!actCursos.some(c => cursosFiltro.includes(c))) return; // no coincide
			}
			const activityItem = document.createElement('div');
			activityItem.className = 'activity-item';
			// Colorear por tipo
			if (act.tipo) {
				const tipoNorm = (act.tipo || '').toString().toLowerCase();
				if (['dentro','salida'].includes(tipoNorm)) {
					activityItem.classList.add('tipo-' + tipoNorm);
				} else if (tipoNorm.trim()) {
					activityItem.classList.add('tipo-otro');
				}
			}
			activityItem.dataset.id = act.id;
			const titleSpan = document.createElement('span');
			titleSpan.textContent = (act.title || '');
			activityItem.appendChild(titleSpan);
			// Tags de cursos (máx 2 visibles + +n)
			const actCursos = Array.isArray(act.curso) ? act.curso : (act.curso ? [act.curso] : []);
			if (actCursos.length) {
				const tagsWrap = document.createElement('div');
				tagsWrap.className = 'curso-tags';
				actCursos.slice(0,2).forEach(c => {
					const span = document.createElement('span');
					span.className = 'curso-tag';
					span.textContent = abreviarCurso(c);
					tagsWrap.appendChild(span);
				});
				if (actCursos.length > 2) {
					const extra = document.createElement('span');
					extra.className = 'curso-tag out';
					extra.textContent = '+' + (actCursos.length - 2);
					tagsWrap.appendChild(extra);
				}
				activityItem.appendChild(tagsWrap);
			}
			const canManage = canWrite && (isAdmin || (act && act.createdBy && act.createdBy === userId));
			if (canManage) {
				const del = document.createElement('button');
				del.className = 'delete-btn';
				del.dataset.id = act.id;
				del.textContent = '×';
				activityItem.appendChild(del);
				// Habilitar drag
				activityItem.setAttribute('draggable', 'true');
				activityItem.addEventListener('dragstart', (ev) => {
					try { ev.dataTransfer.effectAllowed = 'move'; } catch(_){ }
					dragActivity = act;
					dragSourceDate = cell.dataset.date;
					activityItem.classList.add('dragging');
				});
				activityItem.addEventListener('dragend', () => {
					dragActivity = null;
					dragSourceDate = null;
					activityItem.classList.remove('dragging');
					removeDragHighlights();
				});
			}
			cell.appendChild(activityItem);
		});
	});
}

// Helpers drag & drop
function removeDragHighlights() {
	document.querySelectorAll('.day-cell.drag-over').forEach(c => c.classList.remove('drag-over'));
}

// Delegar eventos de dragenter/dragover/dragleave/drop en calendarGrid
calendarGrid.addEventListener('dragenter', (e) => {
	const target = e.target.closest('.day-cell');
	if (!target || target.classList.contains('other-month')) return;
	if (!dragActivity) return;
	if (!canWrite) return;
	target.classList.add('drag-over');
});

calendarGrid.addEventListener('dragover', (e) => {
	if (dragActivity) {
		// Permitir drop
		try { e.preventDefault(); } catch(_) {}
	}
});

calendarGrid.addEventListener('dragleave', (e) => {
	const target = e.target.closest('.day-cell');
	if (!target) return;
	if (!dragActivity) return;
	// Sólo retirar si realmente se abandona la celda
	if (!target.contains(e.relatedTarget)) {
		target.classList.remove('drag-over');
	}
});

calendarGrid.addEventListener('drop', async (e) => {
	if (!dragActivity) return;
	const target = e.target.closest('.day-cell');
	if (!target || target.classList.contains('other-month')) return;
	try { e.preventDefault(); } catch(_) {}
	const newDate = target.dataset.date;
	if (!newDate || newDate === dragActivity.date) {
		removeDragHighlights();
		return;
	}
	// Seguridad: sólo mover si usuario puede gestionar la actividad
	if (!canWrite || !(isAdmin || (dragActivity.createdBy ? dragActivity.createdBy === userId : true))) {
		alert('No tienes permisos para mover esta actividad.');
		removeDragHighlights();
		return;
	}
	try {
		// Actualizar documento Firestore
		await updateDoc(doc(getPublicCollection('actividades'), dragActivity.id), { date: newDate, timestamp: Date.now() });
	} catch(err) {
		console.warn('Error moviendo actividad', err);
		alert('No se pudo mover la actividad.');
	}
	removeDragHighlights();
});

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
	const canManage = canWrite && (isAdmin || (item && (item.createdBy ? item.createdBy === userId : true)));
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
		marcarNuevos('anuncios', anuncios);
	});

	// Calendario
	onSnapshot(getPublicCollection('actividades'), (querySnapshot) => {
		actividadesMapCache = new Map();
		const allActs = [];
		querySnapshot.forEach(docSnap => {
			const data = docSnap.data();
			const dateKey = data.date;
			if (!actividadesMapCache.has(dateKey)) {
				actividadesMapCache.set(dateKey, []);
			}
			actividadesMapCache.get(dateKey).push({ id: docSnap.id, ...data });
			allActs.push({ id: docSnap.id, ...data });
		});
		// Reasignar actividades a los días actualmente visibles
		document.querySelectorAll('.day-cell').forEach(cell => {
			if (!cell.classList.contains('other-month')) {
				cell.activities = actividadesMapCache.get(cell.dataset.date) || [];
			}
		});
		renderizarActividades();
		marcarNuevos('actividades', allActs);
	});

	// Agenda
	onSnapshot(getPublicCollection('agenda'), (querySnapshot) => {
		const agenda = [];
		querySnapshot.forEach(doc => {
			agenda.push({ id: doc.id, ...doc.data() });
		});
		renderizarAgenda(agenda);
		marcarNuevos('agenda', agenda);
	});
}

// --- Lógica del Calendario ---
function agregarFormularioActividad(cell) {
	// Ahora abrimos el modal avanzado con la fecha preseleccionada
	const fecha = cell.dataset.date;
	abrirModalActividad(fecha, null);
}
        
// --- Lógica del modal de confirmación ---
function showConfirmationModal(message, callback) {
	document.getElementById('confirm-message').textContent = message;
	modalConfirmacion.style.display = 'flex';
	confirmationCallback = callback;
}

// --- Inicialización de la aplicación ---
async function initializeAppClient() {
	// Detectar ejecución directa file:// (OAuth no funciona en file://)
	if (location.protocol === 'file:') {
		try { alert('La autenticación OAuth no funciona abriendo el archivo directamente (file://). Debes servir la app desde localhost (firebase hosting:firebase serve) o dominio HTTPS.'); } catch(_){ }
		console.error('[auth] Entorno file:// detectado. Aborta inicialización de Firebase Auth.');
		return;
	}
	if (!firebaseConfig.apiKey) {
		console.error("Firebase no está configurado correctamente.");
		userDisplay.textContent = "Error: Firebase no configurado";
		return;
	}
    
	const app = initializeApp(firebaseConfig);
	auth = getAuth(app);
	db = getFirestore(app);
	// storage eliminado

	// Completar flujos de login por redirección (si los hay)
	try {
		const redirectRes = await getRedirectResult(auth);
		if (redirectRes) {
			console.log('[auth] Resultado redirect:', redirectRes?.user?.uid, redirectRes?.providerId, redirectRes?.user?.email);
			localStorage.removeItem(LS_REDIRECT_MARK);
		} else {
			console.log('[auth] No hay resultado de redirect pendiente');
		}
		lastRedirectResultChecked = true;
	} catch (e) {
		lastRedirectError = e;
		const code = (e && e.code) ? String(e.code) : '';
		const msg = (e && e.message) ? String(e.message) : '';
		console.warn('Redirect login error:', code, msg);
	}

	// Conectar a emuladores si está activado o si estamos en localhost por defecto
	const useEmulators = (typeof window !== 'undefined' && typeof window.__use_emulators !== 'undefined')
		? !!window.__use_emulators
		: (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
	if (useEmulators) {
		try {
			connectAuthEmulator(auth, 'http://localhost:9099');
		} catch (_) {}
		try { connectFirestoreEmulator(db, 'localhost', 8080); } catch (_) {}
		// Sin Storage
	}

	onAuthStateChanged(auth, async (user) => {
		// Si no hay usuario todavía y había un intento de redirect previo sin resultado, alerta diagnóstica
		if (!user && lastRedirectResultChecked) {
			const pending = localStorage.getItem(LS_REDIRECT_MARK);
			if (pending) {
				console.warn('[auth] Redirect marcado pero sin resultado. Posibles causas: dominios no autorizados, bloqueo cookies, política escolar.');
				try { alert('No se completó el inicio de sesión con Google/Microsoft. Revisa: (1) dominios autorizados en Firebase Auth, (2) sin bloqueadores/cookies, (3) vuelve a intentarlo.'); } catch(_){}
				localStorage.removeItem(LS_REDIRECT_MARK);
			}
		}
		if (user) {
			userId = user.uid;
			try {
				const res = await getIdTokenResult(user, true);
				isAdmin = !!(res && res.claims && res.claims.admin);
			} catch (_) { isAdmin = false; }
			canWrite = computeCanWrite(user, isAdmin);
			const emailShown = (user.email || '').toLowerCase() || '(sin email: entra con Google/Microsoft)';
			userDisplay.textContent = `${emailShown}${isAdmin ? ' (admin)' : (!canWrite ? ' (solo lectura)' : '')}`;
			// Alternar UI de escritura
			try {
				btnSubirDocumento.style.display = canWrite ? 'inline-flex' : 'none';
				formAnuncio.querySelector('button[type="submit"]').disabled = !canWrite;
				formAgenda.querySelector('button[type="submit"]').disabled = !canWrite;
			} catch (_) {}
			if (btnLogout) btnLogout.style.display = 'inline-block';
			// Si es anónimo, mantener visibles los botones de login para poder "actualizar" la sesión
			if (btnLoginGoogle) btnLoginGoogle.style.display = (user.isAnonymous ? 'inline-block' : 'none');
			if (btnLoginMs) btnLoginMs.style.display = (user.isAnonymous ? 'inline-block' : 'none');
			setupFirestoreListeners();
			renderizarCalendario();
			// Seed opcional si se pasó ?seed=1
			seedDemoDataIfRequested();
			// Resetear bandera de logout manual una vez haya sesión
			didManualLogout = false;
			// Fallback: si intentamos login con redirect y seguimos anónimos, probar popup una vez
			if (user.isAnonymous && lastLoginAttempt && !triedPopupFallback) {
				const elapsed = Date.now() - lastLoginAttempt.ts;
				if (elapsed < 15000) {
					if (lastLoginAttempt.provider === 'google') {
						try {
							triedPopupFallback = true;
							console.log('[auth] Intentando fallback popup Google');
							const provider = new GoogleAuthProvider();
							provider.setCustomParameters({ prompt: 'select_account' });
							await signInWithPopup(auth, provider);
							return; // esperar siguiente onAuthStateChanged
						} catch (err) {
							console.warn('[auth] Fallback popup Google falló:', err?.code, err?.message);
						}
					}
					if (lastLoginAttempt.provider === 'microsoft') {
						try {
							triedPopupFallback = true;
							console.log('[auth] Intentando fallback popup Microsoft');
							const provider = new OAuthProvider('microsoft.com');
							provider.setCustomParameters({ prompt: 'select_account' });
							await signInWithPopup(auth, provider);
							return;
						} catch (err) {
							console.warn('[auth] Fallback popup Microsoft falló:', err?.code, err?.message);
						}
					}
				}
			}
		} else {
			// Evitar registrar inmediatamente un usuario anónimo si hay un flujo de redirect en curso
			const stillPending = localStorage.getItem(LS_REDIRECT_MARK);
			const recentLogin = lastLoginAttempt && (Date.now() - lastLoginAttempt.ts < 12000);
			if (stillPending || recentLogin) {
				console.log('[auth] Esperando antes de crear sesión anónima (redirect/login reciente pendiente)...');
				setTimeout(async () => {
					if (!auth.currentUser) {
						console.log('[auth] No llegó usuario tras espera. Procediendo a sesión anónima.');
						try { await signInAnonymously(auth); } catch(e){ console.warn('[auth] Falló signInAnonymously (delay):', e); }
					}
				}, 1800);
				return;
			}
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
			canWrite = false;
			try {
				btnSubirDocumento.style.display = 'none';
				formAnuncio.querySelector('button[type="submit"]').disabled = true;
				formAgenda.querySelector('button[type="submit"]').disabled = true;
			} catch (_) {}
			if (btnLogout) btnLogout.style.display = 'none';
			if (btnLoginGoogle) btnLoginGoogle.style.display = 'inline-block';
			if (btnLoginMs) btnLoginMs.style.display = 'inline-block';
			// Si hubo error al redirigir en login, no fuerces anónimo y muestra un aviso
			if (lastRedirectError) {
				const code = (lastRedirectError.code || '').toString();
				if (code.includes('operation-not-allowed')) {
					try { alert('El proveedor no está habilitado en Firebase Auth. Habilítalo en la consola.'); } catch(_){}
				} else if (code.includes('unauthorized-domain')) {
					try { alert('Dominio no autorizado en Firebase Auth. Añade tu dominio en Authentication > Settings > Authorized domains.'); } catch(_){}
				} else {
					try { alert('No se pudo completar el inicio de sesión. Vuelve a intentarlo o usa otro proveedor.'); } catch(_){}
				}
				return;
			}
			if (initialAuthToken) {
				try {
					await signInWithCustomToken(auth, initialAuthToken);
				} catch (error) {
					console.error("Error al iniciar sesión con token personalizado:", error);
					await signInAnonymously(auth);
				}
			} else {
				try { await signInAnonymously(auth); } catch(e){ console.warn('[auth] Falló signInAnonymously:', e); }
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
			lastLoginAttempt = { provider: 'google', ts: Date.now() };
			// Si modo forzado redirect
			if (AUTH_MODE === 'redirect') {
				console.log('[auth] Usando redirect directo (AUTH_MODE=redirect) Google');
				localStorage.setItem(LS_REDIRECT_MARK, 'google');
				await signInWithRedirect(auth, provider);
				return;
			}
			try {
				await signInWithPopup(auth, provider);
				console.log('[auth] Popup Google completado. Usuario actual:', auth.currentUser?.uid, auth.currentUser?.email, 'isAnonymous=', auth.currentUser?.isAnonymous);
			} catch (e) {
				const code = e && e.code ? String(e.code) : '';
				console.warn('[auth] Error popup Google', code, e);
				if (code.includes('popup-closed-by-user')) {
					// Algunos navegadores devuelven esto aunque se cierre automáticamente. Reintentamos con redirect.
					console.log('[auth] Fallback redirect tras popup-closed-by-user (Google)');
					localStorage.setItem(LS_REDIRECT_MARK, 'google');
					await signInWithRedirect(auth, provider);
					return; 
				}
				if (code.includes('unauthorized-domain')) {
					alert('Dominio no autorizado en Firebase Auth. Añádelo en Authentication > Settings > Authorized domains.');
					return;
				}
				if (code.includes('operation-not-allowed')) {
					alert('Proveedor Google no habilitado. Actívalo en Firebase Authentication > Sign-in method.');
					return;
				}
				if (code.includes('popup-blocked') || code.includes('cancelled-popup-request')) {
					localStorage.setItem(LS_REDIRECT_MARK, 'google');
					await signInWithRedirect(auth, provider);
				} else {
					alert('No se pudo iniciar sesión con Google ('+code+'). Revisa consola o configura redirect.');
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
			lastLoginAttempt = { provider: 'microsoft', ts: Date.now() };
			if (AUTH_MODE === 'redirect') {
				console.log('[auth] Usando redirect directo (AUTH_MODE=redirect) Microsoft');
				localStorage.setItem(LS_REDIRECT_MARK, 'microsoft');
				await signInWithRedirect(auth, provider);
				return;
			}
			try {
				await signInWithPopup(auth, provider);
				console.log('[auth] Popup Microsoft completado. Usuario actual:', auth.currentUser?.uid, auth.currentUser?.email, 'isAnonymous=', auth.currentUser?.isAnonymous);
			} catch (e) {
				const code = e && e.code ? String(e.code) : '';
				console.warn('[auth] Error popup Microsoft', code, e);
				if (code.includes('popup-closed-by-user')) {
					console.log('[auth] Fallback redirect tras popup-closed-by-user (Microsoft)');
					localStorage.setItem(LS_REDIRECT_MARK, 'microsoft');
					await signInWithRedirect(auth, provider);
					return;
				}
				if (code.includes('unauthorized-domain')) {
					alert('Dominio no autorizado en Firebase Auth. Añádelo en Authentication > Settings > Authorized domains.');
					return;
				}
				if (code.includes('operation-not-allowed')) {
					alert('Proveedor Microsoft no habilitado. Actívalo en Firebase Authentication > Sign-in method.');
					return;
				}
				if (code.includes('popup-blocked') || code.includes('cancelled-popup-request')) {
					localStorage.setItem(LS_REDIRECT_MARK, 'microsoft');
					await signInWithRedirect(auth, provider);
				} else {
					alert('No se pudo iniciar sesión con Microsoft ('+code+'). Revisa consola o configura redirect.');
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
		if (!canWrite) { try { alert('No tienes permisos para eliminar actividades.'); } catch(_){} return; }
		const activityId = e.target.dataset.id;
		showConfirmationModal('¿Estás seguro de que quieres eliminar esta actividad?', async () => {
			await deleteDoc(doc(getPublicCollection('actividades'), activityId));
		});
	}
	// Click en actividad: mostrar modal detalle (si no es botón eliminar)
	const clickedActivity = e.target.closest('.activity-item');
	if (clickedActivity && !e.target.classList.contains('delete-btn')) {
		const actId = clickedActivity.dataset.id;
		let actData = null;
		const cellDate = clickedActivity.closest('.day-cell')?.dataset.date;
		if (cellDate && actividadesMapCache.has(cellDate)) {
			actData = (actividadesMapCache.get(cellDate) || []).find(a => a.id === actId) || null;
		}
		if (!actData) return;
		mostrarDetalleActividad(actData);
	}
});

// Doble clic fuerza modo edición (útil si en el futuro se cambia el clic simple)
calendarGrid.addEventListener('dblclick', (e) => {
	const activityEl = e.target.closest('.activity-item');
	if (!activityEl) return;
	const activityId = activityEl.dataset.id;
	// localizar fecha (celda) y actividad
	const cell = e.target.closest('.day-cell');
	if (!cell) return;
	const dateKey = cell.dataset.date;
	const list = actividadesMapCache.get(dateKey) || [];
	const actData = list.find(a => a.id === activityId);
	if (!actData) return;
	const canManage = canWrite && (isAdmin || (actData.createdBy ? actData.createdBy === userId : true));
	if (!canManage) return;
	// Simular clic para reutilizar lógica existente
	activityEl.click();
});

// --- Helpers y filtros de cursos ---
function abreviarCurso(nombre) {
	if (!nombre) return '';
	const parts = nombre.split(/\s+/);
	if (parts[0] === 'Infantil') {
		const edad = parts[1] || '';
		const grupo = parts[2] || '';
		return `I${edad}${grupo}`;
	}
	const grado = parts[0] ? parts[0].replace('º','') : '';
	const grupo = parts[2] || parts[1] || '';
	return `${grado}P${grupo}`;
}
if (filtroCursosSelect) {
	filtroCursosSelect.addEventListener('change', () => {
		renderizarActividades();
	});
}
if (filtroCursosClear) {
	filtroCursosClear.addEventListener('click', () => {
		[...(filtroCursosSelect?.options||[])].forEach(o => o.selected = false);
		renderizarActividades();
	});
}

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
	if (!canWrite) { try { alert('No tienes permisos para subir documentos.'); } catch(_){} return; }
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
	if (!requireAuthForWrites() || !canWrite) { try { alert('No tienes permisos para subir documentos.'); } catch(_){} return; }
	const titulo = document.getElementById('documento-titulo').value.trim();
	const archivo = document.getElementById('documento-archivo').files[0];
	if (!titulo || !archivo) { alert('Completa título y archivo.'); return; }
	// Límite ~700KB para mantener margen bajo 1MB Firestore
	const MAX_BYTES = 700 * 1024;
	if (archivo.size > MAX_BYTES) { alert(`Archivo demasiado grande: ${Math.round(archivo.size/1024)} KB (máx ${Math.round(MAX_BYTES/1024)} KB)`); return; }
	try {
		if (auth.currentUser) { try { await auth.currentUser.getIdToken(true); } catch(_) {} }
		console.log('[upload-inline] Preparando base64', { name: archivo.name, type: archivo.type, size: archivo.size });
		const dataUrl = await fileToBase64(archivo);
		const base64Data = dataUrl.split(',')[1];
		await addDoc(getPublicCollection('documentos'), {
			nombre: titulo,
			archivo: archivo.name,
			mimeType: archivo.type || 'application/octet-stream',
			size: archivo.size,
			archivoBase64: base64Data,
			fecha: new Date().toLocaleDateString('es-ES'),
			timestamp: Date.now(),
			createdBy: userId || null
		});
		modalDocumento.style.display = 'none';
		modalDocumento.setAttribute('aria-hidden', 'true');
		formDocumento.reset();
	} catch (err) {
		console.warn('[upload-inline] Error', err);
		alert('Error subiendo: ' + (err?.message || err));
	}
});

documentosGrid.addEventListener('click', (e) => {
	if (e.target.classList.contains('eliminar')) {
		if (!requireAuthForWrites() || !canWrite) { try { alert('No tienes permisos para eliminar documentos.'); } catch(_){} return; }
		const id = e.target.dataset.id;
		showConfirmationModal('¿Estás seguro de que quieres eliminar este documento?', async () => {
			await deleteDoc(doc(getPublicCollection('documentos'), id));
		});
	}
});

// Evento del formulario de anuncios
formAnuncio.addEventListener('submit', async (e) => {
	e.preventDefault();
	if (!requireAuthForWrites() || !canWrite) { try { alert('No tienes permisos para publicar anuncios.'); } catch(_){} return; }
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
		if (!requireAuthForWrites() || !canWrite) { try { alert('No tienes permisos para eliminar anuncios.'); } catch(_){} return; }
		const id = e.target.dataset.id;
		showConfirmationModal('¿Estás seguro de que quieres eliminar este anuncio?', async () => {
			await deleteDoc(doc(getPublicCollection('anuncios'), id));
		});
	}
});

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
