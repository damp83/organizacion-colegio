import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, doc, getDoc, addDoc, updateDoc, deleteDoc, onSnapshot, collection, setLogLevel } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

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
let auth, db, userId;
// Cache de actividades para mantenerlas al cambiar de mes
let actividadesMapCache = new Map();

// --- Funciones de la base de datos ---
const getPublicCollection = (collectionName) => {
    return collection(db, `artifacts/${appId}/public/data/${collectionName}`);
};

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
        documentosGrid.innerHTML = '<p class="loading-message">No hay documentos para mostrar.</p>';
        return;
    }
    documentos.forEach(doc => {
        const card = document.createElement('div');
        card.className = 'documento-card';
        card.innerHTML = `
            <h3>${doc.nombre}</h3>
            <p><strong>Archivo:</strong> ${doc.archivo}</p>
            <p><strong>Fecha de subida:</strong> ${doc.fecha}</p>
            <button class="btn-accion eliminar" data-id="${doc.id}">Eliminar</button>
        `;
        documentosGrid.appendChild(card);
    });
}

function renderizarAnuncios(anuncios) {
    listaAnuncios.innerHTML = '';
    if (anuncios.length === 0) {
        listaAnuncios.innerHTML = '<p class="loading-message">No hay anuncios para mostrar.</p>';
        return;
    }
    anuncios.forEach(anuncio => {
        const item = document.createElement('div');
        item.className = 'anuncio-item';
        const text = document.createElement('span');
        text.textContent = anuncio.texto;
        const btn = document.createElement('button');
        btn.className = 'btn-accion eliminar';
        btn.style.marginLeft = 'auto';
        btn.dataset.id = anuncio.id;
        btn.textContent = 'Eliminar';
        item.appendChild(text);
        item.appendChild(btn);
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
            activityItem.innerHTML = `
                <span>${act.title}</span>
                <button class="delete-btn" data-id="${act.id}">&times;</button>
            `;
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
        const statusClass = `status-${item.status.toLowerCase().replace(/\s+/g, '-')}`;
        const div = document.createElement('div');
        div.className = 'agenda-item';
        div.innerHTML = `
            <div class="item-header">
                <h4>${item.title}</h4>
                <div class="actions">
                    <span class="status-badge ${statusClass}">${item.status}</span>
                    <button class="btn-accion editar" data-id="${item.id}">Editar</button>
                    <button class="btn-accion eliminar" data-id="${item.id}">Eliminar</button>
                </div>
            </div>
            <p><strong>Fecha:</strong> ${item.date}</p>
            <p><strong>Descripción:</strong> ${item.description}</p>
            ${item.documento ? `<p><strong>Documento:</strong> <a href="${item.documento}" target="_blank">Ver documento</a></p>` : ''}
        `;
        listaAgenda.appendChild(div);
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
            timestamp: Date.now()
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

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            userId = user.uid;
            userDisplay.textContent = `ID de Usuario: ${userId}`;
            setupFirestoreListeners();
            renderizarCalendario();
        } else {
            userDisplay.textContent = "Usuario anónimo";
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
            timestamp: Date.now()
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
        timestamp: Date.now()
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
            timestamp: Date.now()
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
