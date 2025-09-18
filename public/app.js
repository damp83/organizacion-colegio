// ================== Notificaciones (in-app + push stub) ==================
// Estructura colección Firestore propuesta:
// artifacts/{appId}/public/data/notificaciones/{id}
// Campos: tipo ('anuncio','agenda','tarea_compartida','actividad'), refId, titulo, cuerpo, timestamp, createdBy
// Lectura pública (como anuncios) pero filtraremos cliente-side.
// Estados de lectura por usuario en localStorage (para simplicidad; alternativa: subcolección per-user o aggregated map)
const notifBtn = document.getElementById('btn-notificaciones');
const notifBadge = document.getElementById('badge-notificaciones');
const notifPanel = document.getElementById('panel-notificaciones');
const notifList = document.getElementById('lista-notificaciones');
const notifMarkAllBtn = document.getElementById('marcar-notif-leidas');
const notifCloseBtn = document.getElementById('cerrar-panel-notif');
let notificacionesCache = [];
let unreadCount = 0;
let unsubscribeNotificaciones = null;
// === Global unsubscribe management ===
// (eliminado: ya declarado arriba en bloque global unsubscribe)
let unsubscribeAnuncios=null, unsubscribeActividades=null, unsubscribeAgenda=null, unsubscribeSustituciones=null, unsubscribeDocumentos=null;
// Encuestas ya usa encuestasUnsubscribe más abajo
const __allUnsubs=[];
function __track(unsub){ if(typeof unsub==='function'){ __allUnsubs.push(unsub); } return unsub; }
function __clearAllUnsubs(){
  while(__allUnsubs.length){ try{ (__allUnsubs.pop())(); }catch{} }
  unsubscribeNotificaciones=unsubscribeTareasPersonales=unsubscribeTareasCompartidas=null;
  unsubscribeAnuncios=unsubscribeActividades=unsubscribeAgenda=unsubscribeSustituciones=unsubscribeDocumentos=null;
  if(typeof encuestasUnsubscribe==='function'){ try{ encuestasUnsubscribe(); }catch{} encuestasUnsubscribe=null; }
  // Limpiar caches para forzar re-suscripción y re-render tras login
  try{ actividadesMapCache=new Map(); }catch{}
  try{ cacheSustituciones=[]; }catch{}
}
const MAX_NOTIFS = 30;

function loadNotifReadSet(){ try{ const raw = localStorage.getItem('notif_read_'+appId); if(!raw) return new Set(); const arr=JSON.parse(raw); if(Array.isArray(arr)) return new Set(arr); return new Set(); }catch{ return new Set(); } }
function saveNotifReadSet(set){ try{ localStorage.setItem('notif_read_'+appId, JSON.stringify([...set].slice(-300))); }catch{} }
let notifReadSet = loadNotifReadSet();
let notifReadFetchedRemote=false;
async function syncNotifReadFromRemote(){
  if(!db||!auth||!auth.currentUser||notifReadFetchedRemote) return;
  try{
    const uid=auth.currentUser.uid;
    const qRef = collection(db, `artifacts/${appId}/users/${uid}/notificaciones_leidas`);
    const snap = await getDocs(qRef);
    snap.forEach(d=>{ notifReadSet.add(d.id); });
    notifReadFetchedRemote=true; saveNotifReadSet(notifReadSet); actualizarBadgeNotificaciones(); renderNotificaciones();
  }catch{}
}
async function persistNotifReadRemote(id){
  if(!db||!auth||!auth.currentUser) return;
  try{
    const uid=auth.currentUser.uid;
    await setDoc(doc(db, `artifacts/${appId}/users/${uid}/notificaciones_leidas/${id}`), { read:true, ts:Date.now() }, { merge:true });
  }catch{}
}

 function renderNotificaciones(){ if(!notifList) return; notifList.innerHTML=''; if(!notificacionesCache.length){ const p=document.createElement('p'); p.className='notif-empty'; p.textContent='Sin notificaciones recientes'; notifList.appendChild(p); } const hoyStr=(new Date()).toLocaleDateString('sv-SE'); notificacionesCache.slice(0,MAX_NOTIFS).forEach(n=>{ const item=document.createElement('div'); const isUnread = !notifReadSet.has(n.id); item.className='notif-item'+(isUnread?' unread':''); const title=document.createElement('p'); title.className='notif-title'; const pill=document.createElement('span'); pill.className='notif-pill'; const baseMap={anuncio:'Anuncio',agenda:'Agenda',tarea_compartida:'Tarea',actividad:'Actividad',sustitucion:'Sustitución',update_agenda:'Agenda ↑',update_actividad:'Actividad ↑',update_sustitucion:'Sustitución ↑'}; pill.textContent=(baseMap[n.tipo]||n.tipo||'Info');
  if(n.tipo?.startsWith('update_')){ pill.classList.add('update'); if(n.tipo==='update_sustitucion') pill.classList.add('update-sust'); }
  // Heurística urgencia: actualización de sustitución misma jornada y cuerpo incluye 'Hora'
  if(n.tipo==='update_sustitucion' && /Hora/i.test(n.cuerpo||'')){
    // Consideramos mismo día si timestamp es hoy (comparación de fecha local ISO yyyy-mm-dd)
    const fechaNoti=new Date(n.timestamp||Date.now()); const fStr=fechaNoti.toLocaleDateString('sv-SE'); if(fStr===hoyStr) pill.classList.add('urgent');
  }
  title.appendChild(pill); const spanT=document.createElement('span'); spanT.textContent=' '+(n.titulo||''); title.appendChild(spanT); const body=document.createElement('div'); body.className='notif-body'; body.textContent=n.cuerpo||''; const meta=document.createElement('div'); meta.className='notif-meta'; const fecha=new Date(n.timestamp||Date.now()); meta.innerHTML=`<span>${fecha.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit'})} ${fecha.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</span>`; const actions=document.createElement('div'); actions.className='notif-actions'; const btnLeer=document.createElement('button'); btnLeer.type='button'; btnLeer.textContent=isUnread? 'Marcar leída':'Abrir'; btnLeer.addEventListener('click',()=>{ if(isUnread){ notifReadSet.add(n.id); saveNotifReadSet(notifReadSet); persistNotifReadRemote(n.id); actualizarBadgeNotificaciones(); item.classList.remove('unread'); btnLeer.textContent='Abrir'; } // Navegación contextual
  if(n.tipo==='anuncio'){ cambiarSeccion('anuncios'); }
  else if(n.tipo==='agenda' || n.tipo==='update_agenda'){ cambiarSeccion('agenda'); }
  else if(n.tipo==='tarea_compartida'){ cambiarSeccion('tareas'); }
  else if(n.tipo==='actividad' || n.tipo==='update_actividad'){ cambiarSeccion('calendario'); }
  else if(n.tipo==='sustitucion' || n.tipo==='update_sustitucion'){ cambiarSeccion('sustituciones'); }
      }); actions.appendChild(btnLeer); item.append(title,body,meta,actions); notifList.appendChild(item); }); }

function actualizarBadgeNotificaciones(){ if(!notifBadge) return; unreadCount = notificacionesCache.reduce((acc,n)=> acc + (notifReadSet.has(n.id)?0:1), 0); if(unreadCount>0){ notifBadge.style.display='inline-block'; notifBadge.textContent = unreadCount>99? '99+': String(unreadCount); notifBtn?.classList.add('has-unread'); } else { notifBadge.style.display='none'; notifBtn?.classList.remove('has-unread'); } }

function togglePanelNotificaciones(force){ if(!notifPanel) return; const visible = force!=null? force : (notifPanel.style.display!=='flex'); notifPanel.style.display= visible? 'flex':'none'; if(visible){ notifPanel.style.flexDirection='column'; } }

function iniciarNotificacionesListener(){ if(unsubscribeNotificaciones){ try{unsubscribeNotificaciones();}catch{} unsubscribeNotificaciones=null; } try { const col=getPublicCollection('notificaciones'); unsubscribeNotificaciones=__track(onSnapshot(col,qs=>{ const arr=[]; qs.forEach(d=>arr.push({id:d.id,...d.data()}));
  arr.sort((a,b)=>(b.timestamp||0)-(a.timestamp||0)); notificacionesCache=arr.slice(0,MAX_NOTIFS); renderNotificaciones(); actualizarBadgeNotificaciones(); }, err=>{ if(err?.code!=='permission-denied') console.error('[Snapshot error] notificaciones',err); })); }catch(err){ console.warn('No se pudo iniciar listener de notificaciones', err); } }

function maybeInitNotifications(){ if(!notifBtn) return; // Mostrar campana sólo si hay usuario autenticado (aunque sea anónimo) para tracking de leídas
  if(auth?.currentUser){ notifBtn.style.display='inline-flex'; iniciarNotificacionesListener(); } else { notifBtn.style.display='none'; if(unsubscribeNotificaciones){ try{unsubscribeNotificaciones();}catch{} unsubscribeNotificaciones=null; } }
}

notifBtn?.addEventListener('click',()=>{ const willOpen = notifPanel?.style.display==='none' || notifPanel?.style.display==='' ; togglePanelNotificaciones(willOpen); if(willOpen){ // marcar vista (no forzamos leídas automáticamente)
  renderNotificaciones(); }
});
notifCloseBtn?.addEventListener('click',()=>togglePanelNotificaciones(false));
notifMarkAllBtn?.addEventListener('click',()=>{ let changed=false; const toPersist=[]; notificacionesCache.forEach(n=>{ if(!notifReadSet.has(n.id)){ notifReadSet.add(n.id); toPersist.push(n.id); changed=true; } }); if(changed){ saveNotifReadSet(notifReadSet); actualizarBadgeNotificaciones(); renderNotificaciones(); toPersist.forEach(id=>persistNotifReadRemote(id)); } });

// Solicitud de permiso para Push (placeholder: se integrará con FCM más adelante)
async function requestPushPermissionIfNeeded(){ if(!('Notification' in window)) return; try{ if(Notification.permission==='default'){ const r=await Notification.requestPermission(); if(r!=='granted') return; } }catch{} }

// Llamar tras login
// (Fragmento duplicado eliminado: cabecera incompleta + listeners agenda)
// LIMPIO: app.js reconstruido (versión completa restaurada)
// Funciones: Auth (Google/Microsoft + anónimo), allowlist, CRUD (documentos base64, anuncios, actividades calendario drag&drop, agenda)

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence, signInAnonymously, onAuthStateChanged, connectAuthEmulator, getIdTokenResult, signOut, GoogleAuthProvider, signInWithRedirect, getRedirectResult, signInWithPopup } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, doc, getDoc, addDoc, updateDoc, deleteDoc, setDoc, onSnapshot, collection, setLogLevel, connectFirestoreEmulator, getDocs } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

setLogLevel('error');

// Estado
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
let firebaseConfig={}; try{ const raw=typeof __firebase_config!=='undefined'?__firebase_config:null; firebaseConfig=typeof raw==='string'?JSON.parse(raw||'{}'):(raw||{});}catch{ firebaseConfig={}; }
// Autodetección de modo auth: si el entorno tiene políticas COOP/COEP que puedan bloquear window.close en popups,
// hacemos fallback a 'redirect'. (El warning Cross-Origin-Opener-Policy indica posible bloqueo de close()).
const AUTH_MODE = (()=>{
  try {
    if (window.crossOriginIsolated) return 'redirect';
    // Prueba rápida de popup cerrable
    const w = window.open('', '', 'width=100,height=100');
    if (w) {
      try { w.close(); }catch{}
      // Algunos navegadores marcan w.closed inmediatamente; si no se cierra asumimos restricción
      if (!w.closed) return 'redirect';
    }
  } catch { return 'redirect'; }
  return 'popup';
})();
console.debug('[Auth] Modo seleccionado:', AUTH_MODE);

// Secciones protegidas: calendario, agenda, sustituciones, encuestas, tareas
function actualizarAccesoSecciones(){
  const allowed = !!canWrite; // allowlist o admin ya calculado
  const protectedIds=['calendario','agenda','sustituciones','encuestas','tareas'];
  protectedIds.forEach(id=>{
    const sec=document.getElementById('seccion-'+id);
    if(!sec) return;
    const restricted=sec.querySelector('.restricted-msg');
    if(!restricted) return;
    if(allowed){
      restricted.style.display='none';
      // Mostrar contenido real (ya está en el DOM); nada extra
      [...sec.children].forEach(ch=>{ if(ch.classList && ch.classList.contains('restricted-msg')) return; ch.style.display=''; });
    } else {
      restricted.style.display='block';
      // Ocultar el resto de elementos funcionales
      [...sec.children].forEach(ch=>{ if(ch.classList && ch.classList.contains('restricted-msg')) return; ch.style.display='none'; });
    }
  });
}
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

// DOM refs
const navButtons=document.querySelectorAll('.nav-bar button');
const sections=document.querySelectorAll('.seccion');
const documentosGrid=document.querySelector('.documentos-grid');
const userDisplay=document.querySelector('.user-info');
const btnLogout=document.getElementById('btn-logout');
const btnLoginGoogle=document.getElementById('btn-login-google');
// Botón Microsoft eliminado
const menuToggle=document.getElementById('menu-toggle');
const navBar=document.getElementById('nav-secciones');
const filtroCursosSelect=document.getElementById('filtro-cursos');
const filtroCursosClear=document.getElementById('filtro-cursos-clear');
const btnSubirDocumento=document.getElementById('btn-subir-documento');
const modalDocumento=document.getElementById('modal-documento');
const formDocumento=document.getElementById('form-documento');
const closeModalDocBtn=document.querySelector('.close-btn-doc');
const formAnuncio=document.getElementById('form-anuncio');
const listaAnuncios=document.getElementById('lista-anuncios');
const formAgenda=document.getElementById('form-agenda');
const listaAgenda=document.getElementById('lista-agenda');
// Sustituciones
const formSustituciones=document.getElementById('form-sustituciones');
const listaSustituciones=document.getElementById('lista-sustituciones');
const inputSustId=document.getElementById('sustitucion-id');
const filtroSustCurso=document.getElementById('filtro-sust-curso');
const filtroSustAsig=document.getElementById('filtro-sust-asig');
const filtroSustClear=document.getElementById('filtro-sust-clear');
const modalConfirmacion=document.getElementById('modal-confirmacion');
const btnConfirmar=document.getElementById('btn-confirmar');
const btnCancelar=document.getElementById('btn-cancelar');
const closeConfirmBtn=document.querySelector('#modal-confirmacion .close-btn');
let confirmationCallback=null;

// Actividades
const modalActividad=document.getElementById('modal-actividad');
const formActividad=document.getElementById('form-actividad');
const btnActividadCancelar=document.getElementById('actividad-cancelar');
const cursosSelect=document.getElementById('actividad-curso');
const closeBtnAct=document.querySelector('.close-btn-act');
const inputActId=document.getElementById('actividad-id');
const inputActNombre=document.getElementById('actividad-nombre');
const inputActFecha=document.getElementById('actividad-fecha');
const inputActHora=document.getElementById('actividad-hora');
const inputActDuracion=document.getElementById('actividad-duracion');
const inputActTipo=document.getElementById('actividad-tipo');
const inputActCurso=document.getElementById('actividad-curso');
const inputActPersonal=document.getElementById('actividad-personal');
const modalActividadDetalle=document.getElementById('modal-actividad-detalle');
const btnDetalleCerrar=document.getElementById('actividad-detalle-cerrar');
const btnDetalleEditar=document.getElementById('actividad-detalle-editar');
const detalleBody=document.getElementById('actividad-detalle-body');
// === Tareas (Gestión) ===
const formTarea=document.getElementById('form-tarea');
const listaTareasPersonales=document.getElementById('lista-tareas-personales');
const listaTareasCompartidas=document.getElementById('lista-tareas-compartidas');
const inputTareaTitulo=document.getElementById('tarea-titulo');
const selectTareaTitulo=document.getElementById('tarea-titulo-select');
const inputFechaLimite=document.getElementById('tarea-fecha-limite');
// Compartir tareas (multi-select de docentes)
const selectTareaTipo=document.getElementById('tarea-tipo');
const compartirWrapper=document.getElementById('tarea-compartir-wrapper');
const selectCompartirEmails=document.getElementById('tarea-compartir-emails');
// Filtro estado tareas
let tareasEstadoFiltro='ALL'; // ALL | Pendiente | 'En proceso' | 'Enviada' | 'Completada'

function ensureTareasFiltroToolbar(){
  const cont=document.getElementById('seccion-tareas');
  if(!cont || cont.querySelector('.tareas-filtro-toolbar')) return;
  const bar=document.createElement('div');
  bar.className='tareas-filtro-toolbar';
  bar.style.cssText='display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 14px;';
  const estados=[{k:'ALL',label:'Todas'},{k:'Pendiente',label:'Pendientes'},{k:'En proceso',label:'En proceso'},{k:'Enviada',label:'Enviadas'},{k:'Completada',label:'Completadas'}];
  estados.forEach(e=>{ const btn=document.createElement('button'); btn.type='button'; btn.textContent=e.label; btn.dataset.filtro=e.k; btn.style.cssText='padding:4px 10px;font-size:.6rem;border:1px solid #d1d5db;border-radius:14px;background:#f3f4f6;cursor:pointer;font-weight:600;'; if(e.k===tareasEstadoFiltro) btn.style.background='#2563eb',btn.style.color='#fff',btn.style.borderColor='#2563eb'; btn.addEventListener('click',()=>{ tareasEstadoFiltro=e.k; [...bar.querySelectorAll('button')].forEach(b=>{ b.style.background='#f3f4f6'; b.style.color='#111827'; b.style.borderColor='#d1d5db';}); btn.style.background='#2563eb'; btn.style.color='#fff'; btn.style.borderColor='#2563eb'; // re-render listas
    // Re-render forcing current cached snapshot by triggering iniciarListenersTareas logic pick (listeners already active -> we'll just call a light refresh by mutating arrays?) Simpler: store last arrays in global and re-render.
    try{ if(window.__lastTareasPersonales) renderizarTareas(listaTareasPersonales, window.__lastTareasPersonales,'personales'); if(window.__lastTareasCompartidas) renderizarTareas(listaTareasCompartidas, window.__lastTareasCompartidas,'compartidas'); }catch{}
  }); bar.appendChild(btn); });
  // Insert before the two columns grid (lista contenedor) -> find first h3 "Personales"
  const gridWrap=cont.querySelector('div[style*="grid-template"]');
  cont.insertBefore(bar, gridWrap);
}
let unsubscribeTareasPersonales=null, unsubscribeTareasCompartidas=null;
// Registro para deshacer borrado de tarea
let lastDeletedTarea=null; let lastDeletedTimeout=null;
// === Modal edición tareas (creación dinámica) ===
let tareaEditModal=null; let tareaEditForm=null; let tareaEditId=null; let tareaEditRef=null;
function ensureTareaEditModal(){
  if(tareaEditModal) return;
  tareaEditModal=document.createElement('div');
  tareaEditModal.id='modal-editar-tarea';
  tareaEditModal.style.cssText='position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.45);z-index:10000;padding:20px;';
  tareaEditModal.innerHTML=`<div style="background:#fff;max-width:520px;width:100%;padding:18px 20px;border-radius:12px;box-shadow:0 8px 24px -4px rgba(0,0,0,.25);display:flex;flex-direction:column;gap:14px;position:relative;">
    <button type="button" id="tarea-edit-close" style="position:absolute;top:8px;right:8px;background:#e5e7eb;border:none;width:28px;height:28px;border-radius:50%;cursor:pointer;font-weight:600;">×</button>
    <h3 style="margin:0;font-size:0.95rem;">Editar tarea</h3>
    <form id="form-editar-tarea" style="display:flex;flex-direction:column;gap:10px;">
      <div style="display:flex;flex-direction:column;gap:4px;">
        <label style="font-size:.6rem;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Título predefinido</label>
        <select name="tituloPreset" style="padding:6px 8px;font-size:.68rem;border:1px solid #d1d5db;border-radius:6px;">
          <option value="">-- Selecciona --</option>
          <option>Acta de evaluación inicial</option>
          <option>Reunión padres (1º trimestre)</option>
          <option>Reunión padres (2º trimestre)</option>
          <option>Reunión padres (3º trimestre)</option>
          <option>Acta evaluación (1º trimestre)</option>
          <option>Acta evaluación (2º trimestre)</option>
          <option>Acta evaluación (3º trimestre)</option>
          <option>Programación docente</option>
          <option>Informes</option>
          <option>PAP</option>
          <option>Actas equipo docente</option>
          <option>Práctica docente</option>
          <option value="__custom">Otro (personalizado)</option>
        </select>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;">
        <label style="font-size:.65rem;font-weight:600;">Título</label>
        <input name="titulo" required maxlength="300" style="padding:6px 8px;font-size:.72rem;border:1px solid #d1d5db;border-radius:6px;" />
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;">
        <label style="font-size:.65rem;font-weight:600;">Descripción</label>
        <textarea name="descripcion" rows="3" maxlength="4000" style="padding:6px 8px;font-size:.72rem;border:1px solid #d1d5db;border-radius:6px;resize:vertical;"></textarea>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;">
        <label style="font-size:.65rem;font-weight:600;">Enlace Drive / Docs</label>
        <input name="driveLink" type="url" placeholder="https://..." maxlength="500" style="padding:6px 8px;font-size:.72rem;border:1px solid #d1d5db;border-radius:6px;" />
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;">
        <label style="font-size:.65rem;font-weight:600;">Fecha límite</label>
        <input type="date" name="fechaLimite" style="padding:6px 8px;font-size:.72rem;border:1px solid #d1d5db;border-radius:6px;" />
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;">
        <label style="font-size:.65rem;font-weight:600;">Estado</label>
        <select name="estado" style="padding:6px 8px;font-size:.72rem;border:1px solid #d1d5db;border-radius:6px;">
          <option>Pendiente</option>
          <option>En proceso</option>
          <option>Enviada</option>
          <option>Completada</option>
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="tarea-edit-completada" />
        <label for="tarea-edit-completada" style="font-size:.65rem;">Marcar completada</label>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px;">
        <button type="button" id="tarea-edit-cancel" class="btn-accion" style="background:#6b7280;">Cancelar</button>
        <button type="submit" class="btn-accion" style="background:#2563eb;">Guardar</button>
      </div>
    </form>
  </div>`;
  document.body.appendChild(tareaEditModal);
  tareaEditForm=tareaEditModal.querySelector('#form-editar-tarea');
  tareaEditModal.addEventListener('click',e=>{ if(e.target===tareaEditModal) closeTareaEditModal(); });
  tareaEditModal.querySelector('#tarea-edit-close').addEventListener('click',closeTareaEditModal);
  tareaEditModal.querySelector('#tarea-edit-cancel').addEventListener('click',closeTareaEditModal);
  tareaEditForm.addEventListener('submit',onSubmitEditarTarea);
  const estadoSelect=tareaEditForm.querySelector('select[name="estado"]');
  const chk=tareaEditForm.querySelector('#tarea-edit-completada');
  const presetSelect=tareaEditForm.querySelector('select[name="tituloPreset"]');
  const tituloInput=tareaEditForm.querySelector('input[name="titulo"]');
  const fechaInput=tareaEditForm.querySelector('input[name="fechaLimite"]');
  chk.addEventListener('change',()=>{
    if(chk.checked) estadoSelect.value='Completada';
    else if(estadoSelect.value==='Completada') estadoSelect.value='Pendiente';
  });
  estadoSelect.addEventListener('change',()=>{
    if(estadoSelect.value==='Completada') chk.checked=true; else if(chk.checked && estadoSelect.value!=='Completada') chk.checked=false;
  });
  if(presetSelect && tituloInput){
    presetSelect.addEventListener('change',()=>{
      if(presetSelect.value==='__custom' || presetSelect.value===''){ tituloInput.value=''; tituloInput.focus(); return; }
      tituloInput.value=presetSelect.value;
    });
  }
}
function openTareaEditModal(t){ ensureTareaEditModal(); tareaEditId=t.id; tareaEditRef=t._ref||null; const f=tareaEditForm; if(!f) return; const presetSelect=f.querySelector('select[name="tituloPreset"]'); const tituloInput=f.titulo; const fechaInput=f.querySelector('input[name="fechaLimite"]'); const driveInput=f.querySelector('input[name="driveLink"]');
  const presetValues=["Acta de evaluación inicial","Reunión padres (1º trimestre)","Reunión padres (2º trimestre)","Reunión padres (3º trimestre)","Acta evaluación (1º trimestre)","Acta evaluación (2º trimestre)","Acta evaluación (3º trimestre)","Programación docente","Informes","PAP","Actas equipo docente","Práctica docente"]; const tituloActual=t.titulo||''; if(presetSelect){ if(presetValues.includes(tituloActual)) presetSelect.value=tituloActual; else if(tituloActual) presetSelect.value='__custom'; else presetSelect.value=''; }
  tituloInput.value=tituloActual; f.descripcion.value=t.descripcion||''; if(driveInput) driveInput.value=t.driveLink||''; if(fechaInput){ if(t.fechaLimite){ try{ const d=new Date(t.fechaLimite); const iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; fechaInput.value=iso; }catch{ fechaInput.value=''; } } else fechaInput.value=''; }
  const estado=t.estado|| (t.completada?'Completada':'Pendiente'); f.estado.value=['Pendiente','En proceso','Enviada','Completada'].includes(estado)?estado:'Pendiente'; const chk=f.querySelector('#tarea-edit-completada'); chk.checked= (f.estado.value==='Completada') || !!t.completada; tareaEditModal.style.display='flex'; }
function closeTareaEditModal(){ if(tareaEditModal) tareaEditModal.style.display='none'; tareaEditId=null; tareaEditRef=null; }
async function onSubmitEditarTarea(e){ e.preventDefault(); if(!requireAuth()) return; if(!tareaEditId || !tareaEditRef) return; const f=tareaEditForm; const titulo=f.titulo.value.trim(); if(!titulo){ notifyWarn('Título requerido'); return; } const descripcion=f.descripcion.value.trim(); const driveLink=(f.driveLink && f.driveLink.value.trim())?f.driveLink.value.trim():null; const estado=f.estado.value; const chk=f.querySelector('#tarea-edit-completada'); const fechaInput=f.querySelector('input[name="fechaLimite"]'); const completada=estado==='Completada' || chk.checked; let tipoActual='Personal'; let fechaLimite=null; if(fechaInput && fechaInput.value){ try{ const d=new Date(fechaInput.value+'T00:00:00'); if(!isNaN(d.getTime())) fechaLimite=d.getTime(); }catch{} }
  let existingCreatedBy=null; try{ const d=await getDoc(tareaEditRef); if(d.exists()){ const data=d.data(); if(data.tipo) tipoActual=data.tipo; if(data.createdBy) existingCreatedBy=data.createdBy; } }catch{}
  if(!existingCreatedBy){ try{ existingCreatedBy = auth?.currentUser?.uid || userId; }catch{} }
  const patch={ titulo, descripcion:descripcion||'', driveLink:driveLink||null, estado, completada, timestamp:Date.now(), tipo:tipoActual, createdBy: existingCreatedBy }; if(fechaLimite!=null) patch.fechaLimite=fechaLimite; if(completada) patch.fechaFin=Date.now(); else patch.fechaFin=null; try{ await updateDoc(tareaEditRef,patch); notifySuccess('Tarea actualizada'); closeTareaEditModal(); }catch(err){ console.error('Update tarea error', {path:tareaEditRef.path, patch}, err); notifyError('No se pudo actualizar'); } }

function renderizarTareas(cont, tareas, tipo){
  if(!cont) return; cont.innerHTML='';
  // Si no hay usuario autenticado aún, no mostrar ninguna lista (requisito solicitado)
  if(!auth || !auth.currentUser){
    cont.innerHTML='<p class="loading-message">Inicia sesión para ver las tareas</p>';
    return;
  }
  if(!tareas.length){ cont.innerHTML=`<p class="loading-message">Sin tareas ${tipo}</p>`; return; }
  // Orden: pendientes primero; dentro de pendientes por fechaLimite asc (sin fecha al final), luego por timestamp desc.
  tareas.sort((a,b)=>{
    // Pendientes antes de completadas
    if(!!a.completada!==!!b.completada) return a.completada?1:-1;
    const aLim = a.fechaLimite!=null ? a.fechaLimite : Number.POSITIVE_INFINITY;
    const bLim = b.fechaLimite!=null ? b.fechaLimite : Number.POSITIVE_INFINITY;
    if(aLim!==bLim) return aLim-bLim; // más próxima primero
    // Si misma fecha límite (o ninguna), timestamp reciente primero
    return (b.timestamp||0)-(a.timestamp||0);
  });
  // Guardar última copia para filtros
  if(tipo==='personales') window.__lastTareasPersonales=tareas.slice(); else if(tipo==='compartidas') window.__lastTareasCompartidas=tareas.slice();
  // Agrupar
  const hoy=new Date(); hoy.setHours(0,0,0,0);
  const grupos={ urgentes:[], semana:[], proximas:[], sinFecha:[], completadas:[] };
  tareas.forEach(t=>{
    const estadoActual=t.estado || (t.completada?'Completada':'Pendiente');
    if(tareasEstadoFiltro!=='ALL' && estadoActual!==tareasEstadoFiltro) return; // filtro
    if(t.completada){ grupos.completadas.push(t); return; }
    if(t.fechaLimite){
      const dif=Math.round((t.fechaLimite - hoy.getTime())/86400000);
      if(dif<=0) grupos.urgentes.push(t);
      else if(dif<=7) grupos.semana.push(t);
      else grupos.proximas.push(t);
    } else grupos.sinFecha.push(t);
  });
    // Guardar última copia para filtros
    if(tipo==='personales') window.__lastTareasPersonales=tareas.slice(); else if(tipo==='compartidas') window.__lastTareasCompartidas=tareas.slice();
  const ordenRender=[['urgentes','Urgentes / Vencen ya'],['semana','Esta semana'],['proximas','Próximas'],['sinFecha','Sin fecha límite'],['completadas','Completadas']];
  // Orden especial para completadas: por fechaFin desc, luego timestamp desc
  grupos.completadas.sort((a,b)=>{ const af=a.fechaFin||0; const bf=b.fechaFin||0; if(bf!==af) return bf-af; return (b.timestamp||0)-(a.timestamp||0); });
  const collapsedState = window.__tareasCollapsedState || (window.__tareasCollapsedState={});
  let rendered=false;
  ordenRender.forEach(([key,label])=>{
    const list=grupos[key]; if(!list.length) return;
    rendered=true;
  const wrapper=document.createElement('div'); wrapper.style.marginBottom='6px';
  const heading=document.createElement('h4'); heading.innerHTML=`<span>${label} (${list.length})</span>`; heading.style.cssText='margin:8px 0 4px;font-size:.7rem;text-transform:uppercase;letter-spacing:.5px;color:#374151;display:flex;align-items:center;gap:6px;cursor:pointer;';
  const toggle=document.createElement('button'); toggle.type='button'; toggle.textContent= collapsedState[key]?'▶':'▼'; toggle.setAttribute('aria-label','Colapsar grupo'); toggle.style.cssText='background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;font-size:.55rem;padding:2px 6px;cursor:pointer;';
  heading.prepend(toggle);
  const groupBody=document.createElement('div'); groupBody.style.display= collapsedState[key] ? 'none':'flex'; groupBody.style.flexDirection='column'; groupBody.style.gap='8px';
  toggle.addEventListener('click',()=>{ collapsedState[key]= !collapsedState[key]; groupBody.style.display= collapsedState[key] ? 'none':'flex'; toggle.textContent= collapsedState[key] ? '▶':'▼'; });
  wrapper.appendChild(heading); wrapper.appendChild(groupBody); cont.appendChild(wrapper);
  list.forEach(t=>{
      // Filtrar tareas compartidas restringidas: si tiene compartirCon no vacío y el usuario no está incluido ni es creador -> omitir
      if(t.tipo==='Compartida' && Array.isArray(t.compartirCon) && t.compartirCon.length>0){
        const emailActual=auth?.currentUser?.email; const uidActual=auth?.currentUser?.uid; if(!(t.compartirCon.includes(emailActual) || t.createdBy===emailActual || t.createdBy===uidActual)) return;
      }
      // (Elemento tarea original reutilizado)
      const el=document.createElement('div');
      el.className='tarea-item';
      el.style.cssText='background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;position:relative;';
      const header=document.createElement('div'); header.style.cssText='display:flex;align-items:flex-start;justify-content:space-between;gap:8px;';
      const title=document.createElement('div'); title.textContent=t.titulo||''; title.style.cssText='font-weight:600;font-size:0.85rem;flex:1;'; if(t.completada){ title.style.textDecoration='line-through'; title.style.opacity='.6'; }
      const estadoBadge=document.createElement('span'); const estado=t.estado || (t.completada?'Completada':'Pendiente'); estadoBadge.textContent=estado; estadoBadge.style.cssText='font-size:.55rem;padding:3px 6px;border-radius:12px;font-weight:600;line-height:1;';
      const colorMap={Pendiente:'#9ca3af', 'En proceso':'#2563eb', 'Enviada':'#d97706', 'Completada':'#059669'}; estadoBadge.style.background=colorMap[estado]||'#9ca3af'; estadoBadge.style.color='#fff';
      header.append(title,estadoBadge);
      const desc=document.createElement('div'); desc.textContent=t.descripcion||''; desc.style.cssText='font-size:0.7rem;color:#4b5563;white-space:pre-wrap;'; if(!t.descripcion) desc.style.display='none';
      const meta=document.createElement('div'); meta.style.cssText='font-size:.55rem;color:#64748b;';
      let extraFecha='';
      if(t.fechaLimite){
        try{ const d=new Date(t.fechaLimite); const dif=Math.round((d.getTime()-hoy.getTime())/86400000); const fechaStr=d.toLocaleDateString('es-ES'); let etiqueta=`Límite ${fechaStr}`; let badgeColor='#2563eb'; if(dif<0){ etiqueta=`Vencida (${fechaStr})`; badgeColor='#b91c1c'; } else if(dif===0){ etiqueta=`Hoy (${fechaStr})`; badgeColor='#dc2626'; } else if(dif===1){ etiqueta=`Mañana (${fechaStr})`; badgeColor='#d97706'; } else if(dif<=3){ etiqueta=`${dif} días (${fechaStr})`; badgeColor='#f59e0b'; } else if(dif<=7){ etiqueta=`${dif} días (${fechaStr})`; badgeColor='#2563eb'; } else { etiqueta=`${fechaStr}`; badgeColor='#64748b'; } extraFecha=` | <span style="display:inline-block;background:${badgeColor};color:#fff;padding:2px 6px;border-radius:12px;font-size:.55rem;line-height:1;font-weight:600;">${etiqueta}</span>`; }catch{}
      }
      meta.innerHTML=t.completada?`Completada ${t.fechaFin?new Date(t.fechaFin).toLocaleDateString('es-ES'):''}${extraFecha}`:`Creada ${t.timestamp?new Date(t.timestamp).toLocaleDateString('es-ES'):''}${extraFecha}`;
      const actions=document.createElement('div'); actions.style.cssText='display:flex;gap:6px;flex-wrap:wrap;';
      const btnEdit=document.createElement('button'); btnEdit.type='button'; btnEdit.textContent='Editar'; btnEdit.className='btn-accion editar'; btnEdit.style.cssText='margin-top:0;padding:4px 8px;font-size:.6rem;'; btnEdit.addEventListener('click',()=>openTareaEditModal(t));
  const btnComplete=document.createElement('button'); btnComplete.type='button'; btnComplete.textContent=t.completada?'Reabrir':'Completar'; btnComplete.className='btn-accion'; btnComplete.style.cssText='margin-top:0;padding:4px 8px;font-size:.6rem;'; btnComplete.addEventListener('click',async()=>{ if(!requireAuth()) return; const ref=t._ref; if(!ref) return; const nowCompleted=!t.completada; let createdByOriginal=t.createdBy; if(!createdByOriginal){ try{ const snap=await getDoc(ref); if(snap.exists()) createdByOriginal=snap.data().createdBy; }catch{} } if(!createdByOriginal) createdByOriginal=auth?.currentUser?.uid||userId; const patch={ titulo:t.titulo||'(sin título)', descripcion:t.descripcion||'', completada:nowCompleted, timestamp:Date.now(), tipo:t.tipo|| (tipo==='personales'?'Personal':'Compartida'), createdBy:createdByOriginal }; if(t.driveLink) patch.driveLink=t.driveLink; if(t.fechaLimite) patch.fechaLimite=t.fechaLimite; if(Array.isArray(t.compartirCon)) patch.compartirCon=[...t.compartirCon]; if(nowCompleted){ patch.fechaFin=Date.now(); patch.estado='Completada'; } else { patch.fechaFin=null; if(t.estado==='Completada') patch.estado='Pendiente'; else if(t.estado) patch.estado=t.estado; } try{ await updateDoc(ref, patch); notifySuccess(nowCompleted?'Tarea completada':'Marcada como pendiente'); }catch(err){ console.error('Toggle completar error', {path:ref.path, original:t, patch, err}); notifyError('No se pudo actualizar'); } });
      const btnDel=document.createElement('button'); btnDel.type='button'; btnDel.textContent='Eliminar'; btnDel.className='btn-accion eliminar'; btnDel.style.cssText='margin-top:0;padding:4px 8px;font-size:.6rem;'; btnDel.addEventListener('click',()=>{ if(!requireAuth()) return; showConfirmation('¿Eliminar tarea?', async()=>{ try{ const ref=t._ref; if(!ref) return; const backupData={...t}; delete backupData._ref; await deleteDoc(ref); lastDeletedTarea={ ref, data: backupData }; if(lastDeletedTimeout) clearTimeout(lastDeletedTimeout); lastDeletedTimeout=setTimeout(()=>{ lastDeletedTarea=null; },15000); notifyWithAction('Tarea eliminada','Deshacer',async()=>{ if(!lastDeletedTarea) return; const {ref:restoreRef,data}=lastDeletedTarea; lastDeletedTarea=null; try{ const restore={...data}; if(!restore.createdBy) restore.createdBy=userId; if(!restore.timestamp) restore.timestamp=Date.now(); if(restore.tipo!=='Personal' && restore.tipo!=='Compartida') restore.tipo = (tipo==='personales'?'Personal':'Compartida'); await setDoc(restoreRef,restore); notifySuccess('Restaurada'); }catch{ notifyError('No se pudo restaurar'); } }, { type:'warn', timeout:15000 }); }catch{ notifyError('Error al eliminar'); } }, { title:'Eliminar', danger:true }); });
      actions.append(btnEdit,btnComplete,btnDel);
      if(t.driveLink){
        const link=document.createElement('a'); link.href=t.driveLink; link.target='_blank'; link.rel='noopener'; link.textContent='Archivo'; link.style.cssText='position:absolute;top:8px;right:8px;font-size:.55rem;background:#e0f2fe;color:#0369a1;padding:2px 6px;border-radius:12px;text-decoration:none;font-weight:600;'; el.appendChild(link); }
      // Recipients display
      if(t.tipo==='Compartida' && Array.isArray(t.compartirCon)){
        const rec=document.createElement('div'); rec.style.cssText='font-size:.55rem;color:#475569;display:flex;flex-wrap:wrap;gap:2px;';
        if(t.compartirCon.length===0) rec.innerHTML='<em>Compartida con todo el claustro</em>';
        else rec.innerHTML = 'Con: ' + t.compartirCon.map(e=>`<span style="background:#e2e8f0;padding:2px 4px;border-radius:4px;">${e}</span>`).join(' ');
        el.appendChild(rec);
      }
      el.append(header,desc,meta,actions); groupBody.appendChild(el);
    });
  });
  if(!rendered) cont.innerHTML='<p class="loading-message">No hay tareas con ese filtro</p>';
  ensureTareasFiltroToolbar();
  return; // grouping path returns
  // (Legacy single flat render retained below but unreachable)
  tareas.forEach(t=>{
    const el=document.createElement('div');
    el.className='tarea-item';
    el.style.cssText='background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;position:relative;';
    const header=document.createElement('div'); header.style.cssText='display:flex;align-items:flex-start;justify-content:space-between;gap:8px;';
    const title=document.createElement('div'); title.textContent=t.titulo||''; title.style.cssText='font-weight:600;font-size:0.85rem;flex:1;'; if(t.completada){ title.style.textDecoration='line-through'; title.style.opacity='.6'; }
    const estadoBadge=document.createElement('span'); const estado=t.estado || (t.completada?'Completada':'Pendiente'); estadoBadge.textContent=estado; estadoBadge.style.cssText='font-size:.55rem;padding:3px 6px;border-radius:12px;font-weight:600;line-height:1;';
    const colorMap={Pendiente:'#9ca3af', 'En proceso':'#2563eb', 'Enviada':'#d97706', 'Completada':'#059669'}; estadoBadge.style.background=colorMap[estado]||'#9ca3af'; estadoBadge.style.color='#fff';
    header.append(title,estadoBadge);
    const desc=document.createElement('div'); desc.textContent=t.descripcion||''; desc.style.cssText='font-size:0.7rem;color:#4b5563;white-space:pre-wrap;'; if(!t.descripcion) desc.style.display='none';
  const meta=document.createElement('div'); meta.style.cssText='font-size:.55rem;color:#64748b;';
    let extraFecha='';
    if(t.fechaLimite){
      try{
        const d=new Date(t.fechaLimite); const hoy=new Date(); hoy.setHours(0,0,0,0); const dif=Math.round((d.getTime()-hoy.getTime())/86400000); const fechaStr=d.toLocaleDateString('es-ES');
        let etiqueta=`Límite ${fechaStr}`; let badgeColor='#2563eb';
        if(dif<0){ etiqueta=`Vencida (${fechaStr})`; badgeColor='#b91c1c'; }
        else if(dif===0){ etiqueta=`Hoy (${fechaStr})`; badgeColor='#dc2626'; }
        else if(dif===1){ etiqueta=`Mañana (${fechaStr})`; badgeColor='#d97706'; }
        else if(dif<=3){ etiqueta=`${dif} días (${fechaStr})`; badgeColor='#f59e0b'; }
        else if(dif<=7){ etiqueta=`${dif} días (${fechaStr})`; badgeColor='#2563eb'; }
        else { etiqueta=`${fechaStr}`; badgeColor='#64748b'; }
        extraFecha=` | <span style="display:inline-block;background:${badgeColor};color:#fff;padding:2px 6px;border-radius:12px;font-size:.55rem;line-height:1;font-weight:600;">${etiqueta}</span>`;
      }catch{}
    }
    meta.innerHTML = t.completada?`Completada ${t.fechaFin?new Date(t.fechaFin).toLocaleDateString('es-ES'):''}${extraFecha}`:`Creada ${t.timestamp?new Date(t.timestamp).toLocaleDateString('es-ES'):''}${extraFecha}`;
    const actions=document.createElement('div'); actions.style.cssText='display:flex;gap:6px;flex-wrap:wrap;';
    const btnEdit=document.createElement('button'); btnEdit.type='button'; btnEdit.textContent='Editar'; btnEdit.className='btn-accion editar'; btnEdit.style.cssText='margin-top:0;padding:4px 8px;font-size:.6rem;'; btnEdit.addEventListener('click',()=>openTareaEditModal(t));
    const btnComplete=document.createElement('button'); btnComplete.type='button'; btnComplete.textContent=t.completada?'Reabrir':'Completar'; btnComplete.className='btn-accion'; btnComplete.style.cssText='margin-top:0;padding:4px 8px;font-size:.6rem;';
  btnComplete.addEventListener('click',async()=>{ if(!requireAuth()) return; const ref=t._ref; if(!ref) return; const nowCompleted=!t.completada; let createdByOriginal=t.createdBy; if(!createdByOriginal){ try{ const snap=await getDoc(ref); if(snap.exists()) createdByOriginal=snap.data().createdBy; }catch{} } if(!createdByOriginal) createdByOriginal=auth?.currentUser?.uid||userId; const patch={ titulo:t.titulo||'(sin título)', descripcion:t.descripcion||'', completada:nowCompleted, timestamp:Date.now(), tipo:t.tipo|| (tipo==='personales'?'Personal':'Compartida'), createdBy:createdByOriginal }; if(t.driveLink) patch.driveLink=t.driveLink; if(t.fechaLimite) patch.fechaLimite=t.fechaLimite; if(nowCompleted){ patch.fechaFin=Date.now(); patch.estado='Completada'; } else { patch.fechaFin=null; if(t.estado==='Completada') patch.estado='Pendiente'; else if(t.estado) patch.estado=t.estado; } try{ await updateDoc(ref, patch); notifySuccess(nowCompleted?'Tarea completada':'Marcada como pendiente'); }catch(err){ console.error('Toggle completar error', {path:ref.path, original:t, patch, err}); notifyError('No se pudo actualizar'); } });
    const btnDel=document.createElement('button'); btnDel.type='button'; btnDel.textContent='Eliminar'; btnDel.className='btn-accion eliminar'; btnDel.style.cssText='margin-top:0;padding:4px 8px;font-size:.6rem;';
    btnDel.addEventListener('click',()=>{ if(!requireAuth()) return; showConfirmation('¿Eliminar tarea?', async()=>{ try{ const ref=t._ref; if(!ref) return; // guardar datos para deshacer
          const backupData={...t}; delete backupData._ref; // limpiar ref
          await deleteDoc(ref);
          // preparar undo
          lastDeletedTarea={ ref, data: backupData };
          if(lastDeletedTimeout) clearTimeout(lastDeletedTimeout);
          lastDeletedTimeout=setTimeout(()=>{ lastDeletedTarea=null; },15000);
          notifyWithAction('Tarea eliminada','Deshacer',async()=>{
            if(!lastDeletedTarea) return; const {ref:restoreRef,data}=lastDeletedTarea; lastDeletedTarea=null; try{ // Asegurar campos obligatorios reglas
              const restore={ ...data };
              if(!restore.createdBy) restore.createdBy=userId;
              if(!restore.timestamp) restore.timestamp=Date.now();
              if(restore.tipo!=='Personal' && restore.tipo!=='Compartida') restore.tipo = (tipo==='personales'?'Personal':'Compartida');
              await setDoc(restoreRef, restore); notifySuccess('Restaurada');
            }catch{ notifyError('No se pudo restaurar'); }
          }, { type:'warn', timeout:15000 });
        }catch{ notifyError('Error al eliminar'); } }, { title:'Eliminar', danger:true }); });
    actions.append(btnEdit,btnComplete,btnDel);
    el.append(header,desc,meta,actions);
    cont.appendChild(el);
  });
}

function setupTareas(){ if(!formTarea) return; if(formTarea.dataset.bind==='1') return; formTarea.dataset.bind='1';
  // Sincroniza select de títulos con input
  if(selectTareaTitulo && inputTareaTitulo){
    selectTareaTitulo.addEventListener('change',()=>{
      if(selectTareaTitulo.value==='__custom' || selectTareaTitulo.value===''){ inputTareaTitulo.value=''; inputTareaTitulo.focus(); return; }
      inputTareaTitulo.value=selectTareaTitulo.value;
    });
  }

  // Poblar multi-select con allowlist (si disponible) solo una vez
  if(selectCompartirEmails && selectCompartirEmails.options.length===0 && typeof ALLOWLIST_EMAILS!=='undefined'){
    try{ [...ALLOWLIST_EMAILS].sort().forEach(email=>{ const o=document.createElement('option'); o.value=email; o.textContent=email; selectCompartirEmails.appendChild(o); }); }catch{}
  }

  // Mostrar/ocultar wrapper según tipo seleccionada
  function toggleCompartir(){ if(!selectTareaTipo || !compartirWrapper) return; if(selectTareaTipo.value==='Compartida'){ compartirWrapper.style.display='flex'; } else { compartirWrapper.style.display='none'; if(selectCompartirEmails){ [...selectCompartirEmails.options].forEach(o=>o.selected=false); } } }
  if(selectTareaTipo){ selectTareaTipo.addEventListener('change',toggleCompartir); toggleCompartir(); }
  ensureTareasFiltroToolbar();
  formTarea.addEventListener('submit',async e=>{ e.preventDefault(); if(!requireAuth()) return; const rawTitulo=inputTareaTitulo.value.trim(); if(!rawTitulo){ notifyWarn('Título requerido'); return; } const descripcion=document.getElementById('tarea-descripcion').value.trim(); const driveLinkInput=document.getElementById('tarea-drive-link'); const driveLink=(driveLinkInput && driveLinkInput.value.trim())?driveLinkInput.value.trim():null; let tipo=(selectTareaTipo?selectTareaTipo.value:document.getElementById('tarea-tipo')?.value)||'Personal'; if(tipo!=='Personal' && tipo!=='Compartida') tipo='Personal'; const uid=auth?.currentUser?.uid; if(!uid){ notifyWarn('Usuario aún no inicializado, intenta de nuevo'); return; } if(!userId) userId=uid; let fechaLimite=null; if(inputFechaLimite && inputFechaLimite.value){ try{ const d=new Date(inputFechaLimite.value+'T00:00:00'); if(!isNaN(d.getTime())) fechaLimite=d.getTime(); }catch{} }
    const data={ titulo:rawTitulo, descripcion:descripcion||'', driveLink:driveLink||null, tipo, completada:false, estado:'Pendiente', fechaFin:null, fechaLimite, timestamp:Date.now(), createdBy:uid };
    if(tipo==='Compartida'){
      let compartirCon=[]; if(selectCompartirEmails){ compartirCon=[...selectCompartirEmails.options].filter(o=>o.selected).map(o=>o.value); }
      if(Array.isArray(compartirCon)) data.compartirCon=compartirCon; else data.compartirCon=[];
    }
    try{ if(tipo==='Personal'){ const col=collection(db,`artifacts/${appId}/users/${uid}/tareas`); await addDoc(col,data); notifySuccess('Tarea personal añadida'); } else { const col=collection(db,`artifacts/${appId}/public/data/tareas_compartidas`); await addDoc(col,data); notifySuccess('Tarea compartida añadida'); } formTarea.reset(); if(selectTareaTitulo) selectTareaTitulo.value=''; toggleCompartir(); }
    catch(err){ console.error('Error creando tarea',err); notifyError('No se pudo guardar (revise consola)'); }
  }); }

function iniciarListenersTareas(){ if(!userId || !db) return; if(unsubscribeTareasPersonales){ try{unsubscribeTareasPersonales();}catch{} unsubscribeTareasPersonales=null; } if(unsubscribeTareasCompartidas){ try{unsubscribeTareasCompartidas();}catch{} unsubscribeTareasCompartidas=null; } try{ const colPers=collection(db,`artifacts/${appId}/users/${userId}/tareas`); unsubscribeTareasPersonales=__track(onSnapshot(colPers,qs=>{ const arr=[]; qs.forEach(d=>arr.push({id:d.id,_ref:doc(colPers,d.id),...d.data()})); renderizarTareas(listaTareasPersonales,arr,'personales'); }, err=>{ if(err?.code!=='permission-denied') console.error('[Snapshot error] tareas personales',err); })); }catch{} try{ const colComp=collection(db,`artifacts/${appId}/public/data/tareas_compartidas`); unsubscribeTareasCompartidas=__track(onSnapshot(colComp,qs=>{ const arr=[]; qs.forEach(d=>arr.push({id:d.id,_ref:doc(colComp,d.id),...d.data()})); renderizarTareas(listaTareasCompartidas,arr,'compartidas'); }, err=>{ if(err?.code!=='permission-denied') console.error('[Snapshot error] tareas compartidas',err); })); }catch{} }

// Intento puntual de borrar tarea legacy concreta por título (manual)
async function forceDeleteLegacyTareaPorTitulo(tituloBuscado){
  if(!db||!auth?.currentUser) return;
  const uid=auth.currentUser.uid;
  try{
    const colRef=collection(db,`artifacts/${appId}/users/${uid}/tareas`);
    const snap=await getDocs(colRef);
    for(const d of snap.docs){
      const data=d.data();
      if((data.titulo||'').toLowerCase().trim()===tituloBuscado.toLowerCase().trim()){
        try{ await deleteDoc(doc(colRef,d.id)); console.info('Legacy tarea eliminada forzada:', d.id, data.titulo); }catch(err){ console.warn('No se pudo borrar legacy tarea', d.id, err); }
      }
    }
  }catch(err){ console.warn('Error buscando tareas legacy', err); }
}
// Exponer en window para ejecutar desde consola si se desea
window.forceDeleteLegacyTareaPorTitulo=forceDeleteLegacyTareaPorTitulo;

// Migración ligera de tareas legacy: añade campos mínimos faltantes para pasar reglas
let legacyMigrationRan=false;
async function migrateLegacyTareas(tareas,tipo){
  if(legacyMigrationRan) return;
  const key='legacy_tareas_migrated_v1';
  if(localStorage.getItem(key)==='1') { legacyMigrationRan=true; return; }
  const fixes=[];
  tareas.forEach(t=>{
    const patch={};
    let needs=false;
    if(typeof t.completada !== 'boolean'){ patch.completada=false; needs=true; }
    if(!t.tipo || (t.tipo!=='Personal' && t.tipo!=='Compartida')){ patch.tipo = (tipo==='personales'?'Personal':'Compartida'); needs=true; }
    if(typeof t.timestamp !== 'number'){ patch.timestamp = Date.now(); needs=true; }
    // No tocamos createdBy para no romper ownership de email
    if(needs && t._ref) fixes.push({ref:t._ref,patch});
  });
  if(!fixes.length){ legacyMigrationRan=true; localStorage.setItem(key,'1'); return; }
  for(const f of fixes){ try{ await updateDoc(f.ref,f.patch); }catch(err){ console.warn('Migración tarea legacy falló', f.ref?.path, err); } }
  legacyMigrationRan=true; localStorage.setItem(key,'1');
}

// Hook migration after each render (arrays almacenadas globalmente)
const _origRenderTareas = renderizarTareas;
renderizarTareas = function(cont,tareas,tipo){ const r=_origRenderTareas(cont,tareas,tipo); try{ migrateLegacyTareas(tareas,tipo); }catch{} return r; };

// Calendario
const calendarGrid=document.getElementById('calendar-grid');
const monthYearDisplay=document.getElementById('month-year');
const prevMonthBtn=document.getElementById('prev-month');
const nextMonthBtn=document.getElementById('next-month');
const calendarToggleScroll=document.getElementById('calendar-toggle-scroll');
const calendarPrintBtn=document.getElementById('calendar-print');
let currentDate=new Date();

// Menú móvil
if(menuToggle && navBar){
 menuToggle.addEventListener('click',()=>{ const open=navBar.classList.toggle('open'); menuToggle.classList.toggle('open',open); menuToggle.setAttribute('aria-expanded',open?'true':'false'); });
 document.addEventListener('click',e=>{ if(!navBar.classList.contains('open')) return; if(e.target===menuToggle||menuToggle.contains(e.target)||navBar.contains(e.target)) return; navBar.classList.remove('open'); menuToggle.classList.remove('open'); menuToggle.setAttribute('aria-expanded','false'); });
}

// Indicadores nuevos
let lastSeen={ anuncios:0, agenda:0, actividades:0, sustituciones:0, encuestas:0 }; // include encuestas
const latestMax={ anuncios:0, agenda:0, actividades:0, sustituciones:0, encuestas:0 }; // include encuestas
const saveLastSeen=()=>{ try{localStorage.setItem('lastSeenIndicators',JSON.stringify(lastSeen));}catch{} };
const marcarNuevos=(tipo,docs)=>{ try{ const max=docs.reduce((m,d)=>d.timestamp?Math.max(m,d.timestamp):m,0); if(max>latestMax[tipo]) latestMax[tipo]=max; if(max && max>(lastSeen[tipo]||0)){ const btn=document.getElementById(`btn-${tipo}`); const visible=document.getElementById(`seccion-${tipo}`)?.classList.contains('active'); if(btn && !visible) btn.classList.add('has-unread'); lastSeen[tipo]=max; saveLastSeen(); } }catch{} };

// Toast
let toastBox=null; function toast(msg){ if(!toastBox){ toastBox=document.createElement('div'); toastBox.style.cssText='position:fixed;top:12px;right:12px;display:flex;flex-direction:column;gap:8px;z-index:9999'; document.body.appendChild(toastBox);} const el=document.createElement('div'); el.textContent=msg; el.style.cssText='background:#111827;color:#fff;padding:8px 12px;font-size:.75rem;border-radius:6px;opacity:0;transform:translateY(-4px);transition:.3s'; toastBox.appendChild(el); requestAnimationFrame(()=>{ el.style.opacity='1'; el.style.transform='translateY(0)';}); setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(-4px)'; setTimeout(()=>el.remove(),300);},3000); }
// Notificaciones amigables
function notify(msg,type='info'){ const palette={info:'#2563eb',success:'#059669',warn:'#d97706',error:'#dc2626'}; if(!toastBox){ toastBox=document.createElement('div'); toastBox.style.cssText='position:fixed;top:12px;right:12px;display:flex;flex-direction:column;gap:8px;z-index:9999'; document.body.appendChild(toastBox);} const el=document.createElement('div'); el.textContent=msg; const bg=palette[type]||palette.info; el.style.cssText=`background:${bg};color:#fff;padding:8px 12px;font-size:.74rem;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,.15);opacity:0;transform:translateY(-4px);transition:.3s;font-weight:500;`; toastBox.appendChild(el); requestAnimationFrame(()=>{ el.style.opacity='1'; el.style.transform='translateY(0)';}); setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(-4px)'; setTimeout(()=>el.remove(),300);},4000); }
const notifySuccess=m=>notify(m,'success'); const notifyError=m=>notify(m,'error'); const notifyWarn=m=>notify(m,'warn');
function notifyWithAction(msg,actionLabel,callback,{type='info',timeout=6000}={}){ if(!toastBox){ toastBox=document.createElement('div'); toastBox.style.cssText='position:fixed;top:12px;right:12px;display:flex;flex-direction:column;gap:8px;z-index:9999'; document.body.appendChild(toastBox);} const palette={info:'#2563eb',success:'#059669',warn:'#d97706',error:'#dc2626'}; const bg=palette[type]||palette.info; const el=document.createElement('div'); el.style.cssText=`background:${bg};color:#fff;padding:8px 12px;font-size:.74rem;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,.15);display:flex;gap:12px;align-items:center;opacity:0;transform:translateY(-4px);transition:.3s;`; const span=document.createElement('span'); span.textContent=msg; const btn=document.createElement('button'); btn.textContent=actionLabel; btn.style.cssText='background:rgba(255,255,255,.15);color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-weight:600;font-size:.7rem;'; btn.addEventListener('click',()=>{ try{callback&&callback();}catch{} el.style.opacity='0'; el.style.transform='translateY(-4px)'; setTimeout(()=>el.remove(),250); }); el.append(span,btn); toastBox.appendChild(el); requestAnimationFrame(()=>{ el.style.opacity='1'; el.style.transform='translateY(0)';}); setTimeout(()=>{ if(!el.isConnected) return; el.style.opacity='0'; el.style.transform='translateY(-4px)'; setTimeout(()=>el.remove(),300); },timeout); }

// Firestore helper
const getPublicCollection=name=>collection(db,`artifacts/${appId}/public/data/${name}`);

// Utilidad: eliminar documentos por nombre (campo "nombre") o por nombre de archivo (campo "archivo") desde consola
async function deleteDocumentoPorNombre(nombreBuscado){
  try{
    if(!db||!auth?.currentUser){ console.warn('Auth requerido'); return; }
    const objetivo=nombreBuscado.trim().toLowerCase();
    const snap=await getDocs(getPublicCollection('documentos'));
    let eliminados=0;
    for(const d of snap.docs){
      const data=d.data();
      const n=(data.nombre||'').trim().toLowerCase();
      const a=(data.archivo||'').trim().toLowerCase();
      if(n===objetivo || a===objetivo){
        try{ await deleteDoc(doc(getPublicCollection('documentos'),d.id)); eliminados++; }
        catch(e){ console.error('Error eliminando', d.id, e); }
      }
    }
    console.info('Documentos eliminados que coinciden (nombre o archivo) con', nombreBuscado, ':', eliminados);
  }catch(e){ console.error('Fallo listando documentos', e); }
}
// Variante por fecha y nombre exactos (fecha formato mostrado en campo `fecha`)
async function deleteDocumentoPorFechaNombre(fecha,nombreBuscado){
  try{
    if(!db||!auth?.currentUser){ console.warn('Auth requerido'); return; }
    const snap=await getDocs(getPublicCollection('documentos'));
    let eliminados=0;
    for(const d of snap.docs){
      const data=d.data();
      const candidato=(data.archivo||data.nombre||'').trim().toLowerCase();
      if(candidato===nombreBuscado.trim().toLowerCase() && (data.fecha||'')===fecha){
        try{ await deleteDoc(doc(getPublicCollection('documentos'),d.id)); eliminados++; }
        catch(e){ console.error('Error eliminando', d.id, e); }
      }
    }
    console.info(`Documentos eliminados (${eliminados}) para fecha ${fecha} y nombre ${nombreBuscado}`);
  }catch(e){ console.error('Fallo listando documentos', e); }
}
window.deleteDocumentoPorNombre=deleteDocumentoPorNombre;
window.deleteDocumentoPorFechaNombre=deleteDocumentoPorFechaNombre;
async function deleteDocumentoPorId(id){
  try{ if(!db||!auth?.currentUser){ console.warn('Auth requerido'); return; }
    await deleteDoc(doc(getPublicCollection('documentos'),id));
    console.info('Documento eliminado por id', id);
  }catch(e){ console.error('Error eliminando por id', id, e); }
}
window.deleteDocumentoPorId=deleteDocumentoPorId;

// Listar documentos (id, archivo, nombre, createdBy) para localizar legacy
async function listDocumentos(){
  if(!db){ console.warn('DB no init'); return; }
  const snap=await getDocs(getPublicCollection('documentos'));
  const out=[];
  snap.forEach(d=>{ const data=d.data(); out.push({id:d.id, archivo:data.archivo, nombre:data.nombre, createdBy:data.createdBy||null, fecha:data.fecha}); });
  console.table(out);
  return out;
}
window.listDocumentos=listDocumentos;

// Normalizar (adoptar) documento legacy estableciendo createdBy actual y timestamp, por id o por nombre
async function normalizarDocumentoPorId(id){
  if(!db||!auth?.currentUser){ console.warn('Auth requerido'); return; }
  const ref=doc(getPublicCollection('documentos'),id);
  try{
    const snap=await getDoc(ref);
    if(!snap.exists()){ console.warn('No existe doc',id); return; }
    const data=snap.data();
    if(data.createdBy){ console.info('Ya tiene createdBy'); return; }
    await updateDoc(ref,{ createdBy:auth.currentUser.uid, timestamp: Date.now() });
    console.info('Normalizado', id);
  }catch(e){ console.error('Error normalizando',id,e); }
}
window.normalizarDocumentoPorId=normalizarDocumentoPorId;

async function normalizarDocumento(nombreBuscado){
  const objetivo=nombreBuscado.trim().toLowerCase();
  const docs=await listDocumentos();
  const match=docs.filter(d=> (d.nombre||'').trim().toLowerCase()===objetivo || (d.archivo||'').trim().toLowerCase()===objetivo);
  if(!match.length){ console.warn('Sin coincidencias'); return; }
  for(const m of match){ await normalizarDocumentoPorId(m.id); }
}
window.normalizarDocumento=normalizarDocumento;

// Seed demo
async function seedDemoDataIfRequested(){ try{ const params=new URLSearchParams(location.search); if(!params.get('seed')) return; const sets=['documentos','anuncios','actividades','agenda']; for(const c of sets){ const snap=await getDocs(getPublicCollection(c)); if(!snap.empty) continue; const now=Date.now(); if(c==='documentos') await addDoc(getPublicCollection('documentos'),{ nombre:'Documento Ejemplo', archivo:'ejemplo.txt', archivoBase64:btoa('Contenido ejemplo'), mimeType:'text/plain', size:16, fecha:new Date().toLocaleDateString('es-ES'), timestamp:now, createdBy:userId||null }); if(c==='anuncios') await addDoc(getPublicCollection('anuncios'),{ texto:'Aviso inicial', timestamp:now, createdBy:userId||null }); if(c==='actividades'){ const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(Math.min(28,d.getDate())).padStart(2,'0'); await addDoc(getPublicCollection('actividades'),{ title:'Reunión', date:`${y}-${m}-${day}`, tipo:'dentro', curso:['1º Primaria A'], timestamp:now, createdBy:userId||null }); } if(c==='agenda'){ const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(Math.min(28,d.getDate())).padStart(2,'0'); await addDoc(getPublicCollection('agenda'),{ title:'Seguimiento', date:`${y}-${m}-${day}`, status:'Programada', description:'Revisión', documento:'', timestamp:now, createdBy:userId||null }); } } }catch{} }

// Cursos
function poblarCursos(){ if(!cursosSelect || cursosSelect.options.length) return; const niveles=[]; for(let e=3;e<=5;e++){ ['A','B'].forEach(g=>niveles.push(`Infantil ${e} ${g}`)); } for(let c=1;c<=6;c++){ ['A','B'].forEach(g=>niveles.push(`${c}º Primaria ${g}`)); } niveles.forEach(n=>{ const o=document.createElement('option'); o.value=n; o.textContent=n; cursosSelect.appendChild(o); }); if(filtroCursosSelect && filtroCursosSelect.options.length===0){ niveles.forEach(n=>{ const o=document.createElement('option'); o.value=n; o.textContent=n; filtroCursosSelect.appendChild(o); }); } }

// Modal actividad
function abrirModalActividad(fechaISO,act=null){ if(!canWrite){ notifyWarn('No tienes permisos para crear o editar actividades'); return; } poblarCursos(); formActividad?.reset(); inputActId.value=act?act.id:''; inputActNombre.value=act?(act.title||''):''; inputActFecha.value=act?(act.date||fechaISO):fechaISO; inputActHora.value=act&&act.time?act.time:''; inputActDuracion.value=act&&act.duration?act.duration:''; inputActTipo.value=act&&act.tipo?act.tipo:'dentro'; [...inputActCurso.options].forEach(o=>o.selected=false); const cursos=act&&act.curso?(Array.isArray(act.curso)?act.curso:[act.curso]):[]; (cursos.length?cursos:[inputActCurso.options[0]?.value]).forEach(v=>{ const opt=[...inputActCurso.options].find(o=>o.value===v); if(opt) opt.selected=true; }); inputActPersonal.value=act&&act.personal?(Array.isArray(act.personal)?act.personal.join(', '):act.personal):''; const titleEl=document.getElementById('modal-act-title'); if(titleEl) titleEl.textContent=act?'Editar Actividad':'Nueva Actividad'; modalActividad.style.display='flex'; }
function cerrarModalActividad(){ modalActividad.style.display='none'; }
closeBtnAct?.addEventListener('click',cerrarModalActividad);
btnActividadCancelar?.addEventListener('click',cerrarModalActividad);
window.addEventListener('click',e=>{ if(e.target===modalActividad) cerrarModalActividad(); });

// Detalle actividad
function cerrarModalActividadDetalle(){ if(modalActividadDetalle) modalActividadDetalle.style.display='none'; }
btnDetalleCerrar?.addEventListener('click',cerrarModalActividadDetalle);
function mostrarDetalleActividad(act){ if(!detalleBody) return; detalleBody.innerHTML=''; const row=(l,v)=>{ const p=document.createElement('p'); p.innerHTML=`<strong>${l}:</strong> ${v||''}`; detalleBody.appendChild(p); }; row('Nombre',act.title); row('Fecha',act.date); row('Hora',act.time||''); row('Duración', act.duration!=null?act.duration:''); row('Tipo', act.tipo==='salida'?'Salida':'Dentro'); row('Cursos', Array.isArray(act.curso)?act.curso.join(', '):(act.curso||'')); row('Personal', act.personal?act.personal.join(', '):''); const canManage=canWrite && (isAdmin||(act.createdBy?act.createdBy===userId:true)); if(btnDetalleEditar){ btnDetalleEditar.style.display=canManage?'inline-block':'none'; btnDetalleEditar.onclick=()=>{ cerrarModalActividadDetalle(); abrirModalActividad(act.date,act); }; } modalActividadDetalle.style.display='flex'; }

// Submit actividad
formActividad?.addEventListener('submit',async e=>{ e.preventDefault(); if(!requireAuth()) return; const title=inputActNombre.value.trim(); const date=inputActFecha.value; if(!title||!date){ notifyWarn('Indica al menos nombre y fecha'); return; } const data={ title, date, time:inputActHora.value||null, duration:inputActDuracion.value?parseInt(inputActDuracion.value,10):null, tipo:inputActTipo.value, curso:[...inputActCurso.selectedOptions].map(o=>o.value), personal:inputActPersonal.value.trim()?inputActPersonal.value.split(/\s*,\s*/).filter(Boolean):[], timestamp:Date.now(), createdBy:userId||null }; try{ if(inputActId.value){ await updateDoc(doc(getPublicCollection('actividades'),inputActId.value),data); notifySuccess('Actividad actualizada'); } else { await addDoc(getPublicCollection('actividades'),data); notifySuccess('Actividad creada'); } cerrarModalActividad(); }catch{ notifyError('No se pudo guardar la actividad'); }});

// Render helpers
function abreviarCurso(n){ if(!n) return ''; const p=n.split(/\s+/); if(p[0]==='Infantil') return `I${p[1]||''}${p[2]||''}`; const grado=(p[0]||'').replace('º',''); const grupo=p[2]||p[1]||''; return `${grado}P${grupo}`; }
function renderizarDocumentos(docs){ documentosGrid.innerHTML=''; if(!docs.length){ documentosGrid.innerHTML='<p class="loading-message">No hay documentos</p>'; return; } docs.forEach(d=>{ const card=document.createElement('div'); card.className='documento-card'; card.innerHTML=`<h3>${d.nombre||''}</h3><p><strong>Archivo:</strong> ${d.archivo||''}</p><p><strong>Fecha:</strong> ${d.fecha||''}</p>`; if(d.archivoBase64){ const b=document.createElement('button'); b.type='button'; b.textContent='Descargar'; b.className='btn-accion descargar'; b.onclick=()=>{ try{ const bytes=atob(d.archivoBase64); const arr=new Uint8Array(bytes.length); for(let i=0;i<bytes.length;i++) arr[i]=bytes.charCodeAt(i); const blob=new Blob([arr],{type:d.mimeType||'application/octet-stream'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=d.archivo||'archivo'; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(url); a.remove();},1200);}catch{ notifyError('Error al preparar la descarga'); } }; card.appendChild(b);} const canManage=canWrite && (isAdmin||(d.createdBy?d.createdBy===userId:true)); if(canManage){ const edit=document.createElement('button'); edit.className='btn-accion editar'; edit.dataset.id=d.id; edit.textContent='Editar'; const del=document.createElement('button'); del.className='btn-accion eliminar'; del.dataset.id=d.id; del.textContent='Eliminar'; card.append(edit,del);} documentosGrid.appendChild(card); }); }
function renderizarAnuncios(list){ listaAnuncios.innerHTML=''; if(!list.length){ listaAnuncios.innerHTML='<p class="loading-message">No hay anuncios</p>'; return; } list.forEach(a=>{ const item=document.createElement('div'); item.className='anuncio-item'; const span=document.createElement('span'); span.textContent=a.texto||''; item.appendChild(span); if(canWrite && (isAdmin||(a.createdBy?a.createdBy===userId:true))){ const b=document.createElement('button'); b.className='btn-accion eliminar'; b.dataset.id=a.id; b.textContent='Eliminar'; b.style.marginLeft='auto'; item.appendChild(b);} listaAnuncios.appendChild(item); }); }
function renderizarAgenda(items){ items.sort((a,b)=>new Date(a.date)-new Date(b.date)); listaAgenda.innerHTML=''; if(!items.length){ listaAgenda.innerHTML='<p class="loading-message">No hay reuniones</p>'; return; } items.forEach(it=>{ const cont=document.createElement('div'); cont.className='agenda-item'; const h=document.createElement('div'); h.className='item-header'; const t=document.createElement('h4'); t.textContent=it.title||''; const actions=document.createElement('div'); actions.className='actions'; const badge=document.createElement('span'); badge.className='status-badge'; badge.textContent=it.status||''; actions.appendChild(badge); const canManage=canWrite && (isAdmin||(it.createdBy?it.createdBy===userId:true)); if(canManage){ const e=document.createElement('button'); e.className='btn-accion editar'; e.dataset.id=it.id; e.textContent='Editar'; const d=document.createElement('button'); d.className='btn-accion eliminar'; d.dataset.id=it.id; d.textContent='Eliminar'; actions.append(e,d);} h.append(t,actions); const pf=document.createElement('p'); pf.innerHTML=`<strong>Fecha:</strong> ${it.date||''}`; const pd=document.createElement('p'); pd.innerHTML=`<strong>Descripción:</strong> ${it.description||''}`; cont.append(h,pf,pd); if(it.documento){ try{ const url=new URL(it.documento); const p=document.createElement('p'); p.innerHTML=`<strong>Documento:</strong> <a target="_blank" href="${url.href}">Ver</a>`; cont.appendChild(p);}catch{} } listaAgenda.appendChild(cont); }); }
// Sustituciones
let cacheSustituciones=[];
function filtroSust(it){
  const fc=(filtroSustCurso?.value||'').trim().toLowerCase();
  const fa=(filtroSustAsig?.value||'').trim().toLowerCase();
  if(fc && !(it.curso||'').toLowerCase().includes(fc)) return false;
  if(fa && !(it.asignatura||'').toLowerCase().includes(fa)) return false;
  return true;
}
function renderizarSustituciones(items){
  cacheSustituciones=items.slice();
  if(!listaSustituciones) return;
  const tabla=document.getElementById('tabla-sustituciones');
  const tbody=tabla?.querySelector('tbody');
  const contLegacy=document.getElementById('sustituciones-sin-slot');
  if(tbody) tbody.innerHTML='';
  if(contLegacy) contLegacy.innerHTML='';
  const filtrados=items.filter(filtroSust);
  const sessionRange=(s)=>{
    switch(String(s)){
      case '1': return '09:00-10:00 / 09:00-10:30';
      case '2': return '10:00-11:30 / 10:30-11:30';
      case '4': return '12:00-13:00';
      case '5': return '13:00-14:00';
      default: return '';
    }
  };
  if(!filtrados.length){ if(tbody){ for(let s=1;s<=5;s++){ const tr=document.createElement('tr'); tr.innerHTML=`<td style="border:1px solid #e5e7eb; padding:6px; font-weight:600; text-align:center; background:#f9fafb;">${s}</td><td style="border:1px solid #e5e7eb; padding:6px; font-size:.55rem; background:#f9fafb; color:#374151;">${sessionRange(s)}</td>`; ['Lunes','Martes','Miércoles','Jueves','Viernes'].forEach(()=>{ const td=document.createElement('td'); td.style.cssText='border:1px solid #e5e7eb; padding:6px; min-width:140px;'; tr.appendChild(td); }); tbody.appendChild(tr);} } if(contLegacy) contLegacy.innerHTML='<p class="loading-message">No hay sustituciones registradas.</p>'; return; }
  // Agrupar por día+sesión (dia, sesion)
  const slotMap=new Map();
  const legacy=[];
  filtrados.forEach(it=>{
    if(it.dia && it.sesion){
      const key=`${it.dia}__${it.sesion}`;
      if(!slotMap.has(key)) slotMap.set(key,[]);
      slotMap.get(key).push(it);
    } else legacy.push(it);
  });
  // Render 5 sesiones x 5 días
  if(tbody){
    for(let s=1;s<=5;s++){
      const tr=document.createElement('tr');
      tr.innerHTML=`<td style="border:1px solid #e5e7eb; padding:6px; font-weight:600; text-align:center; background:#f9fafb;">${s}</td><td style="border:1px solid #e5e7eb; padding:6px; font-size:.55rem; background:#f9fafb; color:#374151;">${sessionRange(s)}</td>`;
      ['Lunes','Martes','Miércoles','Jueves','Viernes'].forEach(d=>{
        const td=document.createElement('td');
        td.style.cssText='border:1px solid #e5e7eb; padding:6px; vertical-align:top; min-width:140px; position:relative;';
        const key=`${d}__${s}`;
        const list=slotMap.get(key)||[];
        list.sort((a,b)=> (a.curso||'').localeCompare(b.curso||''));
        list.forEach(it=>{
          const box=document.createElement('div');
          box.style.cssText='background:#ffffff;border:1px solid #d1d5db;border-radius:6px;padding:4px 6px;margin-bottom:4px;position:relative;display:flex;flex-direction:column;gap:2px;';
          const top=document.createElement('div'); top.style.display='flex'; top.style.justifyContent='space-between'; top.style.alignItems='center';
          const title=document.createElement('strong'); title.textContent=it.sustituto||'';
          const horaSpan=document.createElement('span'); horaSpan.textContent=it.hora||''; horaSpan.style.cssText='font-size:.55rem;background:#1e3a8a;color:#fff;padding:2px 4px;border-radius:4px;';
          top.append(title,horaSpan);
          const curso=document.createElement('div'); curso.textContent=it.curso||''; curso.style.cssText='font-size:.6rem;color:#111827;font-weight:500;';
          const asig=document.createElement('div'); asig.textContent=it.asignatura||''; asig.style.cssText='font-size:.55rem;color:#374151;';
          const instr=(it.instrucciones||'').trim(); if(instr){ const insEl=document.createElement('div'); insEl.textContent=instr; insEl.style.cssText='font-size:.5rem;color:#4b5563;line-height:1.1;'; box.appendChild(insEl); }
          const actions=document.createElement('div'); actions.style.cssText='display:flex; gap:4px; margin-top:2px;';
          const canManage=canWrite && (isAdmin||(it.createdBy?it.createdBy===userId:true));
          if(canManage){
            const btnE=document.createElement('button'); btnE.textContent='E'; btnE.title='Editar'; btnE.dataset.id=it.id; btnE.className='btn-accion editar'; btnE.style.cssText='padding:2px 6px;font-size:.55rem;';
            const btnD=document.createElement('button'); btnD.textContent='X'; btnD.title='Eliminar'; btnD.dataset.id=it.id; btnD.className='btn-accion eliminar'; btnD.style.cssText='padding:2px 6px;font-size:.55rem;background:#b91c1c;';
            actions.append(btnE,btnD);
          }
          box.append(top,curso,asig,actions);
          td.appendChild(box);
        });
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
  }
  if(legacy.length && contLegacy){
    const wrap=document.createElement('div'); wrap.innerHTML='<p style="font-weight:600; font-size:.65rem; margin:4px 0;">Registros sin día/sesión (anteriores):</p>';
    legacy.forEach(it=>{
      const cont=document.createElement('div'); cont.className='agenda-item'; cont.style.margin='4px 0';
      cont.innerHTML=`<strong>${it.sustituto||''}</strong> → ${it.curso||''} | ${it.asignatura||''} <span style="background:#1e3a8a;color:#fff;padding:2px 4px;border-radius:4px;font-size:.55rem;">${it.hora||''}</span>`;
      wrap.appendChild(cont);
    });
    contLegacy.appendChild(wrap);
  }
}
function renderizarCalendario(){ const year=currentDate.getFullYear(); const month=currentDate.getMonth(); monthYearDisplay.textContent=new Date(year,month).toLocaleString('es-ES',{month:'long',year:'numeric'}); calendarGrid.querySelectorAll('.day-cell,.other-month').forEach(c=>c.remove()); const first=new Date(year,month,1); const last=new Date(year,month+1,0); const offset=(first.getDay()+6)%7; for(let i=0;i<offset;i++){ const e=document.createElement('div'); e.className='day-cell other-month'; calendarGrid.appendChild(e);} for(let d=1; d<=last.getDate(); d++){ const cell=document.createElement('div'); cell.className='day-cell'; cell.dataset.date=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; cell.innerHTML=`<span class='day-number'>${d}</span>`; calendarGrid.appendChild(cell);} document.querySelectorAll('.day-cell').forEach(c=>{ if(!c.classList.contains('other-month')) c.activities=actividadesMapCache.get(c.dataset.date)||[]; }); renderizarActividades(); limitarActividadesMovil(); }
function renderizarActividades(){ const filtro=filtroCursosSelect?[...filtroCursosSelect.selectedOptions].map(o=>o.value):[]; document.querySelectorAll('.day-cell').forEach(cell=>{ [...cell.querySelectorAll('.activity-item,.more-acts')].forEach(a=>a.remove()); (cell.activities||[]).forEach(act=>{ if(filtro.length){ const cs=Array.isArray(act.curso)?act.curso:(act.curso?[act.curso]:[]); if(!cs.some(c=>filtro.includes(c))) return; } const item=document.createElement('div'); item.className='activity-item'; const tipo=(act.tipo||'').toLowerCase(); if(['dentro','salida'].includes(tipo)) item.classList.add('tipo-'+tipo); else if(tipo) item.classList.add('tipo-otro'); item.dataset.id=act.id; const tt=document.createElement('span'); tt.textContent=act.title||''; item.appendChild(tt); const cs=Array.isArray(act.curso)?act.curso:(act.curso?[act.curso]:[]); if(cs.length){ const wrap=document.createElement('div'); wrap.className='curso-tags'; cs.slice(0,2).forEach(c=>{ const s=document.createElement('span'); s.className='curso-tag'; s.textContent=abreviarCurso(c); wrap.appendChild(s); }); if(cs.length>2){ const extra=document.createElement('span'); extra.className='curso-tag out'; extra.textContent='+'+(cs.length-2); wrap.appendChild(extra);} item.appendChild(wrap);} const canManage=canWrite && (isAdmin||(act.createdBy?act.createdBy===userId:true)); if(canManage){ const del=document.createElement('button'); del.className='delete-btn'; del.textContent='×'; del.dataset.id=act.id; item.appendChild(del); item.setAttribute('draggable','true'); item.addEventListener('dragstart',ev=>{ try{ev.dataTransfer.effectAllowed='move';}catch{} dragActivity=act; dragSourceDate=cell.dataset.date; item.classList.add('dragging'); }); item.addEventListener('dragend',()=>{ dragActivity=null; dragSourceDate=null; item.classList.remove('dragging'); document.querySelectorAll('.day-cell.drag-over').forEach(c=>c.classList.remove('drag-over')); }); } cell.appendChild(item); }); }); limitarActividadesMovil(); }

function limitarActividadesMovil(){ const isMobilePortrait=window.matchMedia('(max-width: 600px) and (orientation: portrait)').matches; if(!isMobilePortrait) return; document.querySelectorAll('.day-cell').forEach(cell=>{ const acts=[...cell.querySelectorAll('.activity-item')]; const max=2; if(acts.length>max){ acts.slice(max).forEach(a=>a.remove()); if(!cell.querySelector('.more-acts')){ const more=document.createElement('div'); more.className='more-acts'; more.textContent=`+${acts.length-max}`; cell.appendChild(more); } } }); }

// Toggle scroll interno
if(calendarToggleScroll){
  calendarToggleScroll.addEventListener('click',()=>{
    const enabled=calendarGrid.classList.toggle('calendar-scroll-interno');
    calendarToggleScroll.textContent=enabled?'Modo compacto':'Modo scroll interno';
    // Re-render para quitar o añadir +N
    renderizarActividades();
  });
}

// Impresión calendario
if(calendarPrintBtn){
  calendarPrintBtn.addEventListener('click',()=>{
  try{ calendarGrid.classList.remove('calendar-scroll-interno'); }catch{}
  renderizarActividades(); // asegurar vista compacta estable
  document.body.classList.add('print-calendario');
  setTimeout(()=>{ window.print(); setTimeout(()=>document.body.classList.remove('print-calendario'),150); },60);
  });
}

// Firestore listeners
function setupFirestoreListeners(){
  // Documentos
  if(!unsubscribeDocumentos) unsubscribeDocumentos=__track(onSnapshot(getPublicCollection('documentos'), qs=>{ const arr=[]; qs.forEach(d=>arr.push({id:d.id,...d.data()})); renderizarDocumentos(arr); }, err=>{ if(err?.code!=='permission-denied') console.error('[Snapshot error] documentos',err); }));
  // Anuncios
  if(!unsubscribeAnuncios) unsubscribeAnuncios=__track(onSnapshot(getPublicCollection('anuncios'), qs=>{ const arr=[]; qs.forEach(d=>arr.push({id:d.id,...d.data()})); arr.sort((a,b)=>a.timestamp-b.timestamp); renderizarAnuncios(arr); marcarNuevos('anuncios',arr); }, err=>{ if(err?.code!=='permission-denied') console.error('[Snapshot error] anuncios',err); }));
  // Actividades
  if(!unsubscribeActividades) unsubscribeActividades=__track(onSnapshot(getPublicCollection('actividades'), qs=>{ actividadesMapCache=new Map(); const all=[]; qs.forEach(ds=>{ const data=ds.data(); const k=data.date; if(!actividadesMapCache.has(k)) actividadesMapCache.set(k,[]); const obj={id:ds.id,...data}; actividadesMapCache.get(k).push(obj); all.push(obj); }); document.querySelectorAll('.day-cell').forEach(c=>{ if(!c.classList.contains('other-month')) c.activities=actividadesMapCache.get(c.dataset.date)||[]; }); renderizarActividades(); marcarNuevos('actividades',all); }, err=>{ if(err?.code!=='permission-denied') console.error('[Snapshot error] actividades',err); }));
  // Agenda
  if(!unsubscribeAgenda) unsubscribeAgenda=__track(onSnapshot(getPublicCollection('agenda'), qs=>{ const arr=[]; qs.forEach(d=>arr.push({id:d.id,...d.data()})); renderizarAgenda(arr); marcarNuevos('agenda',arr); }, err=>{ if(err?.code!=='permission-denied') console.error('[Snapshot error] agenda',err); }));
  // Sustituciones
  if(!unsubscribeSustituciones) unsubscribeSustituciones=__track(onSnapshot(getPublicCollection('sustituciones'), qs=>{ const arr=[]; qs.forEach(d=>arr.push({id:d.id,...d.data()})); renderizarSustituciones(arr); marcarNuevos('sustituciones',arr); }, err=>{ if(err?.code!=='permission-denied') console.error('[Snapshot error] sustituciones',err); }));
  // Encuestas
  if(typeof setupEncuestasRealtime==='function') setupEncuestasRealtime();
  setupTareas(); iniciarListenersTareas();
}

// ================= ENCUESTAS =================
let encuestasUnsubscribe=null; let encuestasCache=[];
// Gestión votos single/multiple
function obtenerVoto(enc){ try{ const raw=localStorage.getItem('voto_encuesta_'+enc.id); if(raw==null) return enc.multiple?[]:null; if(enc.multiple){ try{ const arr=JSON.parse(raw); return Array.isArray(arr)?arr:[]; }catch{return []; } } return parseInt(raw,10);}catch{return enc.multiple?[]:null;}}
function guardarVoto(enc,valor){ try{ const key='voto_encuesta_'+enc.id; if(enc.multiple) localStorage.setItem(key,JSON.stringify(valor)); else localStorage.setItem(key,String(valor)); }catch{} }
function renderizarEncuestas(){
 const cont=document.getElementById('lista-encuestas');
 if(!cont) return;
 cont.innerHTML='';
 if(!encuestasCache.length){ cont.innerHTML='<p class="loading-message">Sin encuestas todavía</p>'; return; }
 encuestasCache.sort((a,b)=>b.timestamp-a.timestamp);
 encuestasCache.forEach(enc=>{
   const wrap=document.createElement('div');
   wrap.className='encuesta-item';
   wrap.style.cssText='border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;margin-bottom:10px;background:#fff;display:flex;flex-direction:column;gap:8px;';
   const q=document.createElement('h4'); q.textContent=enc.pregunta||''; q.style.cssText='margin:0;font-size:0.85rem;';
   wrap.appendChild(q);
   const canManage = canWrite && (isAdmin || (enc.createdBy ? enc.createdBy===userId : false));
   wrap.dataset.id=enc.id;
  const prev=obtenerVoto(enc);
  const voted=enc.multiple? (Array.isArray(prev)&&prev.length>0) : (prev!=null);
  wrap.dataset.voted=voted? '1':'0';
   // Actions row
   if(canManage){
     const actions=document.createElement('div');
     actions.style.cssText='display:flex; gap:6px; flex-wrap:wrap;';
     const btnEdit=document.createElement('button'); btnEdit.type='button'; btnEdit.textContent='Editar'; btnEdit.className='btn-accion encuesta-editar'; btnEdit.dataset.id=enc.id; btnEdit.style.fontSize='.6rem';
     const btnSave=document.createElement('button'); btnSave.type='button'; btnSave.textContent='Guardar'; btnSave.className='btn-accion encuesta-guardar'; btnSave.dataset.id=enc.id; btnSave.style.fontSize='.6rem'; btnSave.style.display='none';
     const btnCancel=document.createElement('button'); btnCancel.type='button'; btnCancel.textContent='Cancelar'; btnCancel.className='btn-accion encuesta-cancelar'; btnCancel.dataset.id=enc.id; btnCancel.style.fontSize='.6rem'; btnCancel.style.display='none';
     const btnDelete=document.createElement('button'); btnDelete.type='button'; btnDelete.textContent='Borrar'; btnDelete.className='btn-accion eliminar encuesta-borrar'; btnDelete.dataset.id=enc.id; btnDelete.style.fontSize='.6rem';
     actions.append(btnEdit,btnSave,btnCancel,btnDelete);
     wrap.appendChild(actions);
   }
   // Resultados + botones de voto/cambio
   const total=enc.opciones.reduce((s,o)=>s+(o.votos||0),0)||0;
   const list=document.createElement('div'); list.style.display='flex'; list.style.flexDirection='column'; list.style.gap='6px';
   enc.opciones.forEach((op,i)=>{
     const pct=total?Math.round((op.votos||0)*100/total):0;
     const row=document.createElement('div'); row.style.display='flex'; row.style.flexDirection='column'; row.style.gap='2px';
     const label=document.createElement('div'); label.style.display='flex'; label.style.justifyContent='space-between'; label.style.fontSize='.65rem';
     const active=enc.multiple? (Array.isArray(prev)&&prev.includes(i)) : (prev===i);
     label.innerHTML=`<span>${op.texto||''}</span><strong>${op.votos||0} (${pct}%)</strong>`;
     const barWrap=document.createElement('div'); barWrap.style.cssText='width:100%;background:#f3f4f6;border-radius:4px;height:8px;overflow:hidden;';
     const bar=document.createElement('div'); bar.style.cssText=`height:100%;width:${pct}%;background:${active?'#059669':'#2563eb'};transition:width .4s;`;
     barWrap.appendChild(bar); row.append(label,barWrap);
     const btn=document.createElement('button'); btn.type='button'; btn.className='btn-accion opcion-voto'; btn.dataset.id=enc.id; btn.dataset.index=i.toString(); btn.textContent= enc.multiple? (active?'Quitar':'Añadir') : (active? 'Cambiar voto':'Votar'); btn.style.cssText='font-size:.55rem;align-self:flex-start;margin-top:4px;padding:4px 8px;';
     row.appendChild(btn);
     list.appendChild(row);
   });
   wrap.appendChild(list);
   if(voted){ const badge=document.createElement('span'); badge.textContent= enc.multiple? 'Has seleccionado opciones (puedes ajustar)' : 'Has votado (puedes cambiar)'; badge.style.cssText='align-self:flex-start;font-size:.55rem;background:#059669;color:#fff;padding:2px 6px;border-radius:12px;'; wrap.appendChild(badge); }
   if(enc.multiple){ const hint=document.createElement('small'); hint.textContent='Pregunta de selección múltiple'; hint.style.cssText='font-size:.5rem;color:#374151;margin-top:-4px;'; wrap.appendChild(hint); }
   cont.appendChild(wrap);
 });
}
// (Funciones antiguas haVotado/marcarVotado eliminadas)
function setupEncuestas(){
  const form=document.getElementById('form-encuestas');
  const addBtn=document.getElementById('encuestas-add-opcion');
  const contOps=document.getElementById('encuestas-opciones');
  if(!form||!addBtn||!contOps) return;
  function crearCampo(valor=''){
    const wrap=document.createElement('div'); wrap.style.cssText='display:flex; gap:6px;';
    const input=document.createElement('input'); input.type='text'; input.placeholder='Opción'; input.required=true; input.value=valor; input.style.cssText='flex:1;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:.7rem;';
    const del=document.createElement('button'); del.type='button'; del.textContent='×'; del.className='btn-accion eliminar'; del.style.cssText='padding:0 10px;background:#b91c1c;';
    del.addEventListener('click',()=>{ wrap.remove(); });
    wrap.append(input,del); return wrap;
  }
  // Semillas iniciales
  if(!contOps.children.length){ contOps.appendChild(crearCampo()); contOps.appendChild(crearCampo()); }
  addBtn.addEventListener('click',()=>{ contOps.appendChild(crearCampo()); });
  form.addEventListener('submit',async e=>{
    e.preventDefault(); if(!requireAuth()||!canWrite){ notifyWarn('No tienes permisos'); return; }
  const pregunta=document.getElementById('encuesta-pregunta').value.trim();
  const multiple=document.getElementById('encuesta-multiple')?.checked||false;
  const opciones=[...contOps.querySelectorAll('input')].map(i=>i.value.trim()).filter(Boolean);
  if(!pregunta||opciones.length<2){ notifyWarn('Pregunta y al menos dos opciones'); return; }
  const docData={ pregunta, multiple: multiple?true:false, opciones:opciones.map(t=>({texto:t,votos:0})), timestamp:Date.now(), createdBy:userId||null };
    try{ await addDoc(getPublicCollection('encuestas'),docData); notifySuccess('Encuesta creada'); form.reset(); contOps.innerHTML=''; contOps.appendChild(crearCampo()); contOps.appendChild(crearCampo()); }
    catch{ notifyError('No se pudo crear la encuesta'); }
  });
  const lista=document.getElementById('lista-encuestas');
  lista?.addEventListener('click',async e=>{
    const btn=e.target.closest('.opcion-voto'); if(!btn) return;
    // Nueva restricción: sólo usuarios registrados permitidos (canWrite ya implica allowlist/admin)
    if(!requireAuth()){ return; }
    if(!canWrite){ notifyWarn('Sólo usuarios del claustro pueden votar'); return; }
    const encuestaId=btn.dataset.id; const index=parseInt(btn.dataset.index,10);
    const enc=encuestasCache.find(x=>x.id===encuestaId); if(!enc) return;
    const prev=obtenerVoto(enc);
    try{
      // Guardamos subcolección de votos: artifacts/appId/public/data/encuestas/{id}/votos/{userId}
      const votosColl=collection(db, `artifacts/${appId}/public/data/encuestas/${encuestaId}/votos`);
      const votoRef=doc(votosColl, userId);
      const votoSnap=await getDoc(votoRef);
      if(enc.multiple){
        const arr=Array.isArray(prev)?prev.slice():[];
        const was=arr.includes(index);
        if(was){ enc.opciones[index].votos=Math.max(0,(enc.opciones[index].votos||0)-1); guardarVoto(enc,arr.filter(i=>i!==index)); }
        else { enc.opciones[index].votos=(enc.opciones[index].votos||0)+1; arr.push(index); guardarVoto(enc,arr); }
      } else {
        if(prev!=null && prev!==index && enc.opciones[prev]) enc.opciones[prev].votos=Math.max(0,(enc.opciones[prev].votos||0)-1);
        if(prev===index){ /* mismo */ } else enc.opciones[index].votos=(enc.opciones[index].votos||0)+1;
        guardarVoto(enc,index);
      }
      renderizarEncuestas();
      // Persistir: usamos transaction simple (lee doc actual, incrementa campo anidado)
      const encRef=doc(getPublicCollection('encuestas'),encuestaId);
      const encSnap=await getDoc(encRef);
      if(encSnap.exists()){
        const data=encSnap.data();
        const arr=data.opciones||[];
        if(enc.multiple){
          const previousArray=Array.isArray(prev)?prev:[];
          const was=previousArray.includes(index);
            if(was){ if(arr[index]) arr[index].votos=Math.max(0,(arr[index].votos||0)-1); }
            else { if(arr[index]) arr[index].votos=(arr[index].votos||0)+1; }
        } else {
          if(prev!=null && prev!==index && arr[prev]) arr[prev].votos=Math.max(0,(arr[prev].votos||0)-1);
          if(prev!==index && arr[index]) arr[index].votos=(arr[index].votos||0)+1;
        }
        try {
          await updateDoc(encRef,{
            opciones:arr,
            timestamp:Date.now(),
            // aseguramos campos inmutables presentes para pasar reglas
            pregunta:data.pregunta,
            createdBy:data.createdBy||null,
            multiple: data.multiple==true
          });
        } catch(errUpd){
          console.error('Error update encuesta', errUpd, {encuestaId, data});
          throw errUpd;
        }
      }
      if(enc.multiple){ try{ await setDoc(votoRef,{ uid:userId, ts:Date.now(), indices: obtenerVoto(enc) }); }catch{} notifySuccess('Selección actualizada'); }
      else { try { await setDoc(votoRef,{ uid:userId, ts:Date.now(), index }); }catch{} notifySuccess(prev!=null && prev!==index ? 'Voto cambiado' : 'Voto registrado'); }
    }catch(err){ console.error('Voto error',err); notifyError('No se pudo votar'); }
  });
  // Acciones edición/borrado encuestas
  lista?.addEventListener('click',async e=>{
    const editBtn=e.target.closest('.encuesta-editar');
    const saveBtn=e.target.closest('.encuesta-guardar');
    const cancelBtn=e.target.closest('.encuesta-cancelar');
    const delBtn=e.target.closest('.encuesta-borrar');
    if(editBtn){
      if(!requireAuth()||!canWrite){ notifyWarn('Sin permisos'); return; }
      const id=editBtn.dataset.id; const wrap=editBtn.closest('.encuesta-item'); if(!wrap) return;
      const enc=encuestasCache.find(x=>x.id===id); if(!enc) return;
      // Convertir a modo edición
      wrap.classList.add('editing');
      const h4=wrap.querySelector('h4'); if(h4){ const input=document.createElement('input'); input.type='text'; input.value=enc.pregunta||''; input.style.cssText='width:100%;padding:6px 8px;font-size:.75rem;border:1px solid #d1d5db;border-radius:6px;'; input.className='encuesta-edit-pregunta'; h4.replaceWith(input); }
  // Toggle multiple
  const toggle=document.createElement('label'); toggle.style.cssText='display:flex;align-items:center;gap:6px;font-size:.55rem;font-weight:600;text-transform:uppercase;color:#374151;margin-top:4px;';
  toggle.innerHTML=`<input type="checkbox" class="encuesta-edit-multiple" ${enc.multiple?'checked':''} style="transform:scale(1.1);" /> Selección múltiple`;
  wrap.insertBefore(toggle, editBtn.parentElement);
      // Quitar resultados o botones de voto
      [...wrap.querySelectorAll('.opcion-voto, .encuesta-result-row, div > div > .activity-item')];
      const existingBlocks=[...wrap.querySelectorAll('div')].filter(d=>d!==wrap.querySelector('div:has(button.encuesta-editar)'));
      existingBlocks.forEach(b=>{ if(!b.querySelector('.encuesta-editar') && !b.contains(editBtn.parentElement)) b.remove(); });
      // Crear lista editable
      const editList=document.createElement('div'); editList.className='encuesta-edit-list'; editList.style.cssText='display:flex; flex-direction:column; gap:6px;';
      enc.opciones.forEach((op,i)=>{
        const row=document.createElement('div'); row.style.cssText='display:flex; gap:6px; align-items:center;';
        const inp=document.createElement('input'); inp.type='text'; inp.value=op.texto||''; inp.dataset.index=i; inp.style.cssText='flex:1;padding:6px 8px;font-size:.65rem;border:1px solid #d1d5db;border-radius:6px;';
        const votos=document.createElement('span'); votos.textContent=op.votos+' v'; votos.style.cssText='font-size:.55rem;color:#374151;';
        const btnDel=document.createElement('button'); btnDel.type='button'; btnDel.textContent='×'; btnDel.className='btn-accion eliminar'; btnDel.style.cssText='padding:0 8px;background:#b91c1c;font-size:.65rem;'; btnDel.addEventListener('click',()=>{ row.remove(); });
        row.append(inp,votos,btnDel); editList.appendChild(row);
      });
      const addOp=document.createElement('button'); addOp.type='button'; addOp.textContent='Añadir opción'; addOp.className='btn-accion'; addOp.style.cssText='align-self:flex-start;font-size:.6rem;background:#374151;'; addOp.addEventListener('click',()=>{
        const row=document.createElement('div'); row.style.cssText='display:flex; gap:6px; align-items:center;';
        const inp=document.createElement('input'); inp.type='text'; inp.placeholder='Nueva opción'; inp.style.cssText='flex:1;padding:6px 8px;font-size:.65rem;border:1px solid #d1d5db;border-radius:6px;';
        const votos=document.createElement('span'); votos.textContent='0 v'; votos.style.cssText='font-size:.55rem;color:#374151;';
        const btnDel=document.createElement('button'); btnDel.type='button'; btnDel.textContent='×'; btnDel.className='btn-accion eliminar'; btnDel.style.cssText='padding:0 8px;background:#b91c1c;font-size:.65rem;'; btnDel.addEventListener('click',()=>{ row.remove(); });
        row.append(inp,votos,btnDel); editList.appendChild(row);
      });
      wrap.insertBefore(editList, editBtn.parentElement); // before actions
      wrap.insertBefore(addOp, editBtn.parentElement);
      // Toggle buttons
      editBtn.style.display='none';
      wrap.querySelector('.encuesta-guardar').style.display='inline-block';
      wrap.querySelector('.encuesta-cancelar').style.display='inline-block';
    }
    if(cancelBtn){
      const id=cancelBtn.dataset.id; const wrap=cancelBtn.closest('.encuesta-item'); if(!wrap) return; // simplemente re-render
      renderizarEncuestas();
      return;
    }
    if(saveBtn){
      if(!requireAuth()||!canWrite){ notifyWarn('Sin permisos'); return; }
      const id=saveBtn.dataset.id; const wrap=saveBtn.closest('.encuesta-item'); if(!wrap) return;
      const enc=encuestasCache.find(x=>x.id===id); if(!enc) return;
      const preguntaInput=wrap.querySelector('.encuesta-edit-pregunta');
      const newPregunta=(preguntaInput?.value||'').trim(); if(!newPregunta){ notifyWarn('Pregunta requerida'); return; }
      const optionInputs=[...wrap.querySelectorAll('.encuesta-edit-list input')];
      const opciones=optionInputs.map(i=>({ texto:i.value.trim(), votos: enc.opciones[i.dataset.index]? enc.opciones[i.dataset.index].votos : 0 })).filter(o=>o.texto);
      if(opciones.length<2){ notifyWarn('Mínimo 2 opciones'); return; }
      const multiple=wrap.querySelector('.encuesta-edit-multiple')?.checked||false;
      try{
        const encuestaRef=doc(getPublicCollection('encuestas'),id);
        if(enc.multiple !== multiple){
          // Migración de votos
          const votosColl=collection(db, `artifacts/${appId}/public/data/encuestas/${id}/votos`);
          const snapVotes=await getDocs(votosColl);
          const counts=new Array(opciones.length).fill(0);
          let dropped=0;
          for(const v of snapVotes.docs){
            const dataV=v.data()||{};
            if(multiple){ // single -> multiple
              let indices=[];
              if(Array.isArray(dataV.indices)) indices=dataV.indices; else if(Number.isInteger(dataV.index)) indices=[dataV.index];
              indices=indices.filter(n=>Number.isInteger(n)&&n>=0&&n<opciones.length);
              // acumular conteos
              const uniq=[...new Set(indices)];
              if(!uniq.length){ dropped++; continue; }
              uniq.forEach(i=>{ counts[i]++; });
              try{ await setDoc(v.ref,{ uid:dataV.uid||v.id, ts:Date.now(), indices:uniq }); }catch{}
            } else { // multiple -> single
              let idx=null;
              if(Number.isInteger(dataV.index)) idx=dataV.index; else if(Array.isArray(dataV.indices)&&dataV.indices.length) idx=dataV.indices[0];
              if(Number.isInteger(idx) && idx>=0 && idx<opciones.length){ counts[idx]++; try{ await setDoc(v.ref,{ uid:dataV.uid||v.id, ts:Date.now(), index:idx }); }catch{} }
              else { dropped++; }
            }
          }
          const opcionesFinal=opciones.map((o,i)=>({ texto:o.texto, votos:counts[i] }));
          await updateDoc(encuestaRef,{ pregunta:newPregunta, opciones:opcionesFinal, multiple: multiple?true:false, timestamp:Date.now(), createdBy:enc.createdBy||userId||null });
          notifySuccess('Encuesta actualizada (migrados votos'+(dropped?`, descartados ${dropped}`:'')+')');
        } else {
          await updateDoc(encuestaRef, { pregunta:newPregunta, opciones, multiple: multiple?true:false, timestamp:Date.now(), createdBy:enc.createdBy||userId||null });
          notifySuccess('Encuesta actualizada');
        }
      }catch{ notifyError('No se pudo actualizar'); }
    }
    if(delBtn){
      if(!requireAuth()||!canWrite){ notifyWarn('Sin permisos'); return; }
      const id=delBtn.dataset.id; const enc=encuestasCache.find(x=>x.id===id); if(!enc) return;
      showConfirmation('¿Eliminar encuesta?', async()=>{
        const ref=doc(getPublicCollection('encuestas'),id);
        let dataClone=null; try{ const snap=await getDoc(ref); if(snap.exists()) dataClone=snap.data(); }catch{}
        try{ await deleteDoc(ref); notifyWithAction('Encuesta eliminada','Deshacer', async()=>{ if(dataClone) try{ await setDoc(ref,dataClone); notifySuccess('Encuesta restaurada'); }catch{ notifyError('No se pudo restaurar'); } }, {type:'warn'}); }
        catch{ notifyError('Error eliminando'); }
      });
    }
  });
}
function setupEncuestasRealtime(){
  if(encuestasUnsubscribe) return; // evitar duplicar
  encuestasUnsubscribe=__track(onSnapshot(getPublicCollection('encuestas'),async qs=>{
    const arr=[]; qs.forEach(d=>arr.push({id:d.id,...d.data()}));
    encuestasCache=arr;
    renderizarEncuestas();
    marcarNuevos('encuestas',arr);
  }, err=>{ if(err?.code!=='permission-denied') console.error('[Snapshot error] encuestas',err); }));
  setupEncuestas();
}

// Navegación
function cambiarSeccion(id){ navButtons.forEach(b=>b.classList.remove('active')); sections.forEach(s=>s.classList.remove('active')); const btn=document.getElementById(`btn-${id}`); const sec=document.getElementById(`seccion-${id}`); if(btn){ btn.classList.add('active'); btn.classList.remove('has-unread'); } if(sec) sec.classList.add('active'); }
navButtons.forEach(b=>b.addEventListener('click',()=>cambiarSeccion(b.id.replace('btn-',''))));

// Calendario eventos
calendarGrid.addEventListener('click',e=>{ const cell=e.target.closest('.day-cell'); if(cell && !e.target.classList.contains('delete-btn') && !e.target.closest('.activity-item')) abrirModalActividad(cell.dataset.date,null); if(e.target.classList.contains('delete-btn')){ if(!canWrite){notifyWarn('No tienes permisos para eliminar');return;} const id=e.target.dataset.id; showConfirmation('¿Eliminar actividad?', async()=>{ const ref=doc(getPublicCollection('actividades'),id); let data=null; try{ const snap=await getDoc(ref); if(snap.exists()) data=snap.data(); }catch{} await deleteDoc(ref); notifyWithAction('Actividad eliminada','Deshacer',async()=>{ if(data) try{ await setDoc(ref,data); notifySuccess('Actividad restaurada'); }catch{ notifyError('No se pudo restaurar'); } },{type:'warn'}); }); } const actEl=e.target.closest('.activity-item'); if(actEl && !e.target.classList.contains('delete-btn')){ const id=actEl.dataset.id; const dateKey=actEl.closest('.day-cell')?.dataset.date; const list=actividadesMapCache.get(dateKey)||[]; const act=list.find(a=>a.id===id); if(act) mostrarDetalleActividad(act); } });
calendarGrid.addEventListener('dblclick',e=>{ const actEl=e.target.closest('.activity-item'); if(!actEl) return; const dateKey=actEl.closest('.day-cell')?.dataset.date; const act=(actividadesMapCache.get(dateKey)||[]).find(a=>a.id===actEl.dataset.id); if(!act) return; if(!(canWrite && (isAdmin||(act.createdBy?act.createdBy===userId:true)))) return; actEl.click(); });
document.addEventListener('dragover',e=>{ if(dragActivity) try{e.preventDefault();}catch{} });
calendarGrid.addEventListener('dragenter',e=>{ const c=e.target.closest('.day-cell'); if(!c||c.classList.contains('other-month')||!dragActivity||!canWrite) return; c.classList.add('drag-over'); });
calendarGrid.addEventListener('dragleave',e=>{ const c=e.target.closest('.day-cell'); if(!c) return; if(!c.contains(e.relatedTarget)) c.classList.remove('drag-over'); });
calendarGrid.addEventListener('drop',async e=>{ if(!dragActivity) return; const c=e.target.closest('.day-cell'); if(!c||c.classList.contains('other-month')) return; try{e.preventDefault();}catch{} const newDate=c.dataset.date; if(!newDate||newDate===dragActivity.date) return; if(!(canWrite && (isAdmin||(dragActivity.createdBy?dragActivity.createdBy===userId:true)))){ notifyWarn('No puedes mover esta actividad'); return; } try{ await updateDoc(doc(getPublicCollection('actividades'),dragActivity.id),{ date:newDate, timestamp:Date.now() }); notifySuccess('Actividad movida'); }catch{ notifyError('No se pudo mover'); } document.querySelectorAll('.day-cell.drag-over').forEach(x=>x.classList.remove('drag-over')); });

// Filtros
filtroCursosSelect?.addEventListener('change',renderizarActividades);
filtroCursosClear?.addEventListener('click',()=>{ [...(filtroCursosSelect?.options||[])].forEach(o=>o.selected=false); renderizarActividades(); });
prevMonthBtn.addEventListener('click',()=>{ currentDate.setMonth(currentDate.getMonth()-1); renderizarCalendario(); });
nextMonthBtn.addEventListener('click',()=>{ currentDate.setMonth(currentDate.getMonth()+1); renderizarCalendario(); });


// Documentos
btnSubirDocumento?.addEventListener('click',()=>{ if(!canWrite){notifyWarn('No tienes permisos para subir documentos');return;} const title=document.getElementById('modal-doc-title'); if(title) title.textContent='Subir Documento'; document.getElementById('documento-id').value=''; document.getElementById('documento-has-file').value='0'; const info=document.getElementById('documento-archivo-info'); if(info) info.style.display='none'; const file=document.getElementById('documento-archivo'); if(file){ file.required=true; file.value=''; } modalDocumento.style.display='flex'; modalDocumento.setAttribute('aria-hidden','false'); setTimeout(()=>document.getElementById('documento-titulo')?.focus(),0); });
closeModalDocBtn?.addEventListener('click',()=>{ modalDocumento.style.display='none'; modalDocumento.setAttribute('aria-hidden','true'); formDocumento.reset(); document.getElementById('documento-id').value=''; document.getElementById('documento-has-file').value='0'; const info=document.getElementById('documento-archivo-info'); if(info) info.style.display='none'; const title=document.getElementById('modal-doc-title'); if(title) title.textContent='Subir Documento'; const f=document.getElementById('documento-archivo'); if(f) f.required=true; });
window.addEventListener('click',e=>{ if(e.target===modalDocumento){ modalDocumento.style.display='none'; modalDocumento.setAttribute('aria-hidden','true'); formDocumento.reset(); }});
formDocumento?.addEventListener('submit',async e=>{ e.preventDefault(); if(!requireAuth()||!canWrite){notifyWarn('No tienes permisos para subir');return;} const id=document.getElementById('documento-id').value; const titulo=document.getElementById('documento-titulo').value.trim(); const fileInput=document.getElementById('documento-archivo'); const file=fileInput.files[0]; if(!titulo){ notifyWarn('Indica un título'); return; } if(!id && !file){ notifyWarn('Selecciona un archivo'); return; } const MAX=700*1024; if(file && file.size>MAX){ notifyWarn('El archivo supera 700KB'); return;} try{ if(id){ let payload={ nombre:titulo, timestamp:Date.now() }; if(file){ const dataUrl=await fileToBase64(file); const base64=dataUrl.split(',')[1]; Object.assign(payload,{ archivo:file.name, mimeType:file.type||'application/octet-stream', size:file.size, archivoBase64:base64 }); } await updateDoc(doc(getPublicCollection('documentos'),id),payload); notifySuccess('Documento actualizado'); } else { const dataUrl=await fileToBase64(file); const base64=dataUrl.split(',')[1]; await addDoc(getPublicCollection('documentos'),{ nombre:titulo, archivo:file.name, mimeType:file.type||'application/octet-stream', size:file.size, archivoBase64:base64, fecha:new Date().toLocaleDateString('es-ES'), timestamp:Date.now(), createdBy:userId||null }); notifySuccess('Documento subido'); } modalDocumento.style.display='none'; modalDocumento.setAttribute('aria-hidden','true'); formDocumento.reset(); document.getElementById('documento-id').value=''; document.getElementById('documento-has-file').value='0'; const info=document.getElementById('documento-archivo-info'); if(info) info.style.display='none'; const title=document.getElementById('modal-doc-title'); if(title) title.textContent='Subir Documento'; fileInput.required=true; } catch{ notifyError(id?'Error actualizando documento':'Error subiendo documento'); } });
documentosGrid?.addEventListener('click',e=>{ if(e.target.classList.contains('eliminar')){ if(!requireAuth()||!canWrite){notifyWarn('Sin permisos para eliminar');return;} const id=e.target.dataset.id; showConfirmation('¿Eliminar documento?', async()=>{ const ref=doc(getPublicCollection('documentos'),id); let data=null; try{ const snap=await getDoc(ref); if(snap.exists()) data=snap.data(); }catch{} await deleteDoc(ref); notifyWithAction('Documento eliminado','Deshacer',async()=>{ if(data) try{ await setDoc(ref,data); notifySuccess('Documento restaurado'); }catch{ notifyError('No se pudo restaurar'); } },{type:'warn'}); }); } if(e.target.classList.contains('editar')){ if(!requireAuth()||!canWrite){notifyWarn('Sin permisos para editar');return;} const id=e.target.dataset.id; (async()=>{ try{ const snap=await getDoc(doc(getPublicCollection('documentos'),id)); if(!snap.exists()) return; const d=snap.data(); document.getElementById('documento-id').value=id; document.getElementById('documento-titulo').value=d.nombre||''; document.getElementById('documento-has-file').value='1'; const file=document.getElementById('documento-archivo'); if(file){ file.value=''; file.required=false; } const info=document.getElementById('documento-archivo-info'); if(info){ info.style.display='block'; info.textContent=`Archivo actual: ${d.archivo||'sin nombre'} — deja vacío para mantenerlo`; } const title=document.getElementById('modal-doc-title'); if(title) title.textContent='Editar Documento'; modalDocumento.style.display='flex'; modalDocumento.setAttribute('aria-hidden','false'); }catch{ notifyError('No se pudo cargar el documento'); } })(); } });

// Anuncios
formAnuncio?.addEventListener('submit',async e=>{ e.preventDefault(); if(!requireAuth()||!canWrite){notifyWarn('No puedes publicar anuncios');return;} const texto=document.getElementById('anuncio-texto').value.trim(); if(!texto){ notifyWarn('Escribe un texto'); return; } await addDoc(getPublicCollection('anuncios'),{ texto, timestamp:Date.now(), createdBy:userId||null }); formAnuncio.reset(); notifySuccess('Anuncio publicado'); });
listaAnuncios?.addEventListener('click',e=>{ if(e.target.classList.contains('eliminar')){ if(!requireAuth()||!canWrite){notifyWarn('Sin permisos para eliminar');return;} const id=e.target.dataset.id; showConfirmation('¿Eliminar anuncio?', async()=>{ const ref=doc(getPublicCollection('anuncios'),id); let data=null; try{ const snap=await getDoc(ref); if(snap.exists()) data=snap.data(); }catch{} await deleteDoc(ref); notifyWithAction('Anuncio eliminado','Deshacer',async()=>{ if(data) try{ await setDoc(ref,data); notifySuccess('Anuncio restaurado'); }catch{ notifyError('No se pudo restaurar'); } },{type:'warn'}); }); }});

// Agenda
formAgenda?.addEventListener('submit',async e=>{ e.preventDefault(); if(!requireAuth()||!canWrite){notifyWarn('No puedes modificar la agenda');return;} const id=document.getElementById('agenda-id').value; const titulo=document.getElementById('agenda-titulo').value; const fecha=document.getElementById('agenda-fecha').value; const estado=document.getElementById('agenda-estado').value; const documento=document.getElementById('agenda-documento').value; const descripcion=document.getElementById('agenda-descripcion').value; if(id){ await updateDoc(doc(getPublicCollection('agenda'),id),{ title:titulo, date:fecha, status:estado, documento, description:descripcion }); notifySuccess('Reunión actualizada'); } else { await addDoc(getPublicCollection('agenda'),{ title:titulo, date:fecha, status:estado, documento, description:descripcion, timestamp:Date.now(), createdBy:userId||null }); notifySuccess('Reunión creada'); } formAgenda.reset(); document.getElementById('agenda-id').value=''; });
listaAgenda?.addEventListener('click',async e=>{ if(e.target.classList.contains('eliminar')){ if(!requireAuth()||!canWrite){notifyWarn('Sin permisos para eliminar');return;} const id=e.target.dataset.id; showConfirmation('¿Eliminar reunión?', async()=>{ const ref=doc(getPublicCollection('agenda'),id); let data=null; try{ const snap=await getDoc(ref); if(snap.exists()) data=snap.data(); }catch{} await deleteDoc(ref); notifyWithAction('Reunión eliminada','Deshacer',async()=>{ if(data) try{ await setDoc(ref,data); notifySuccess('Reunión restaurada'); }catch{ notifyError('No se pudo restaurar'); } },{type:'warn'}); }); } if(e.target.classList.contains('editar')){ const id=e.target.dataset.id; try{ const snap=await getDoc(doc(getPublicCollection('agenda'),id)); if(snap.exists()){ const it=snap.data(); document.getElementById('agenda-id').value=snap.id; document.getElementById('agenda-titulo').value=it.title; document.getElementById('agenda-fecha').value=it.date; document.getElementById('agenda-estado').value=it.status; document.getElementById('agenda-documento').value=it.documento||''; document.getElementById('agenda-descripcion').value=it.description; } }catch{} } });
listaAgenda?.addEventListener('dblclick',async e=>{ const cont=e.target.closest('.agenda-item'); if(!cont) return; const btn=cont.querySelector('.btn-accion.editar'); if(!btn) return; const id=btn.dataset.id; try{ const snap=await getDoc(doc(getPublicCollection('agenda'),id)); if(snap.exists()){ const it=snap.data(); document.getElementById('agenda-id').value=snap.id; document.getElementById('agenda-titulo').value=it.title; document.getElementById('agenda-fecha').value=it.date; document.getElementById('agenda-estado').value=it.status; document.getElementById('agenda-documento').value=it.documento||''; document.getElementById('agenda-descripcion').value=it.description; try{ document.getElementById('form-agenda').scrollIntoView({behavior:'smooth',block:'start'});}catch{} } }catch{} });

// Sustituciones CRUD
formSustituciones?.addEventListener('submit',async e=>{
	e.preventDefault();
	if(!requireAuth()||!canWrite){ notifyWarn('No tienes permisos para gestionar sustituciones'); return; }
	const sustituto=document.getElementById('sustitucion-sustituto').value.trim();
  const curso=document.getElementById('sustitucion-curso').value.trim();
  const asignatura=document.getElementById('sustitucion-asignatura').value.trim();
  const dia=document.getElementById('sustitucion-dia')?.value||'';
  const sesion=document.getElementById('sustitucion-sesion')?.value||'';
  const inicio=document.getElementById('sustitucion-hora-inicio').value.trim();
  const fin=document.getElementById('sustitucion-hora-fin').value.trim();
  let hora='';
  if(inicio && fin){ hora=`${inicio}-${fin}`; }
	const instrucciones=document.getElementById('sustitucion-instrucciones').value.trim();
  if(!sustituto||!curso||!asignatura||!hora||!dia||!sesion){ notifyWarn('Completa todos los campos'); return; }
	try{
		const existing=inputSustId.value;
    if(existing){
      await updateDoc(doc(getPublicCollection('sustituciones'),existing),{ sustituto, curso, asignatura, hora, instrucciones, dia, sesion, timestamp:Date.now(), createdBy:userId||null });
      notifySuccess('Sustitución actualizada');
    } else {
      await addDoc(getPublicCollection('sustituciones'),{ sustituto, curso, asignatura, hora, instrucciones, dia, sesion, timestamp:Date.now(), createdBy:userId||null });
      notifySuccess('Sustitución añadida');
    }
    formSustituciones.reset(); inputSustId.value='';
    try{
      document.getElementById('sustitucion-curso').selectedIndex=0;
      document.getElementById('sustitucion-asignatura').selectedIndex=0;
      document.getElementById('sustitucion-hora-inicio').selectedIndex=0;
      document.getElementById('sustitucion-hora-fin').selectedIndex=0;
    }catch{}
	}catch(err){
		console.error('Error add sustitucion',err);
		notifyError('Error guardando sustitución');
	}
});
listaSustituciones?.addEventListener('click',e=>{
  if(e.target.classList.contains('eliminar')){
    if(!requireAuth()||!canWrite){ notifyWarn('Sin permisos'); return; }
    const id=e.target.dataset.id;
    showConfirmation('¿Eliminar sustitución?', async()=>{ const ref=doc(getPublicCollection('sustituciones'),id); let data=null; try{ const snap=await getDoc(ref); if(snap.exists()) data=snap.data(); }catch{} await deleteDoc(ref); notifyWithAction('Sustitución eliminada','Deshacer',async()=>{ if(data) try{ await setDoc(ref,data); notifySuccess('Sustitución restaurada'); }catch{ notifyError('No se pudo restaurar'); } },{type:'warn'}); });
  }
  if(e.target.classList.contains('editar')){
    if(!requireAuth()||!canWrite){ notifyWarn('Sin permisos'); return; }
    const id=e.target.dataset.id;
    const it=cacheSustituciones.find(x=>x.id===id);
    if(!it) return;
    inputSustId.value=it.id;
    document.getElementById('sustitucion-sustituto').value=it.sustituto||'';
    document.getElementById('sustitucion-curso').value=it.curso||'';
    document.getElementById('sustitucion-asignatura').value=it.asignatura||'';
    if(document.getElementById('sustitucion-dia')) document.getElementById('sustitucion-dia').value=it.dia||'';
    if(document.getElementById('sustitucion-sesion')) document.getElementById('sustitucion-sesion').value=it.sesion||'';
    try{
      if(it.hora && it.hora.includes('-')){
        const [ini,fin]=it.hora.split('-');
        document.getElementById('sustitucion-hora-inicio').value=ini.trim();
        document.getElementById('sustitucion-hora-fin').value=fin.trim();
      } else {
        document.getElementById('sustitucion-hora-inicio').selectedIndex=0;
        document.getElementById('sustitucion-hora-fin').selectedIndex=0;
      }
    }catch{}
    document.getElementById('sustitucion-instrucciones').value=it.instrucciones||'';
    try{ formSustituciones.scrollIntoView({behavior:'smooth',block:'start'});}catch{}
  }
});

// Limpiar semana (elimina todos los docs de sustituciones tras confirmación)
document.getElementById('btn-limpiar-semana-sust')?.addEventListener('click',()=>{
  if(!requireAuth()||!canWrite){ notifyWarn('Sin permisos'); return; }
  showConfirmation('¿Eliminar TODAS las sustituciones de la semana?', async()=>{
    // Capturamos snapshot previo para poder rehacer
    const snapshot = cacheSustituciones.map(it=>{ const d={...it}; delete d.id; return { id: it.id, data: d }; });
    try{
      for(const it of snapshot){ await deleteDoc(doc(getPublicCollection('sustituciones'),it.id)); }
      notifyWithAction('Semana limpiada','Deshacer', async()=>{
        try{
          for(const it of snapshot){ await setDoc(doc(getPublicCollection('sustituciones'),it.id), it.data); }
          notifySuccess('Sustituciones restauradas');
        }catch{ notifyError('No se pudieron restaurar todas'); }
      }, { type:'warn', timeout:8000 });
    }catch{ notifyError('Error eliminando sustituciones'); }
  }, { title:'Limpiar semana', danger:true, extra:'Esta acción no se puede deshacer.', confirmText:'Eliminar todo', cancelText:'Cancelar' });
});

// Confirmación
function showConfirmation(msg,cb,opts={}){ const { title='Confirmar', danger=false, extra='', confirmText='Confirmar', cancelText='Cancelar' }=opts||{}; const titleEl=document.getElementById('confirm-title'); if(titleEl) titleEl.textContent=title; const msgEl=document.getElementById('confirm-message'); if(msgEl) msgEl.textContent=msg; const extraEl=document.getElementById('confirm-extra'); if(extraEl){ if(extra){ extraEl.style.display='block'; extraEl.textContent=extra; } else extraEl.style.display='none'; } const btnOk=document.getElementById('btn-confirmar'); const btnCancel=document.getElementById('btn-cancelar'); if(btnOk){ btnOk.textContent=confirmText; btnOk.classList.toggle('eliminar',danger); } if(btnCancel) btnCancel.textContent=cancelText; modalConfirmacion.style.display='flex'; modalConfirmacion.setAttribute('aria-hidden','false'); confirmationCallback=cb; }
btnConfirmar?.addEventListener('click',()=>{ if(confirmationCallback) confirmationCallback(); modalConfirmacion.style.display='none'; modalConfirmacion.setAttribute('aria-hidden','true'); confirmationCallback=null; });
btnCancelar?.addEventListener('click',()=>{ modalConfirmacion.style.display='none'; modalConfirmacion.setAttribute('aria-hidden','true'); confirmationCallback=null; });
closeConfirmBtn?.addEventListener('click',()=>{ modalConfirmacion.style.display='none'; modalConfirmacion.setAttribute('aria-hidden','true'); confirmationCallback=null; });
window.addEventListener('click',e=>{ if(e.target===modalConfirmacion){ modalConfirmacion.style.display='none'; modalConfirmacion.setAttribute('aria-hidden','true'); confirmationCallback=null; } });

// Auth init
async function initAuth(){ if(location.protocol==='file:'){ notifyWarn('Abra la aplicación mediante HTTP/HTTPS'); return; } if(!firebaseConfig.apiKey){ userDisplay.textContent='Config Firebase faltante'; return; } const app=initializeApp(firebaseConfig); auth=getAuth(app); try{ await setPersistence(auth,browserLocalPersistence); }catch{} db=getFirestore(app); try{ const rr=await getRedirectResult(auth); if(rr) localStorage.removeItem(LS_REDIRECT_MARK); lastRedirectResultChecked=true; }catch{} const useEmu=(location.hostname==='localhost'||location.hostname==='127.0.0.1'); if(useEmu){ try{connectAuthEmulator(auth,'http://localhost:9099');}catch{} try{connectFirestoreEmulator(db,'localhost',8080);}catch{} }
 onAuthStateChanged(auth, async user=>{ if(!user && lastRedirectResultChecked && localStorage.getItem(LS_REDIRECT_MARK)) localStorage.removeItem(LS_REDIRECT_MARK); if(user){ userId=user.uid; let tok=null; try{ tok=await getIdTokenResult(user,true); isAdmin=!!(tok&&tok.claims&&tok.claims.admin);}catch{} canWrite=computeCanWrite(user,isAdmin); console.debug('AUTH STATE', {uid:user.uid,email:user.email,isAdmin,canWrite,claims:tok?.claims}); const email=(user.email||'').toLowerCase()||'(sin email)'; userDisplay.textContent=`${email}${isAdmin?' (admin)':(!canWrite?' (solo lectura)':'')}`; try{ btnSubirDocumento.style.display=canWrite?'inline-flex':'none'; formAnuncio.querySelector('button[type="submit"]').disabled=!canWrite; formAgenda.querySelector('button[type="submit"]').disabled=!canWrite; }catch{} btnLogout&&(btnLogout.style.display='inline-block'); if(btnLoginGoogle) btnLoginGoogle.style.display=user.isAnonymous?'inline-block':'none'; // Siempre re-montar listeners tras login
  setupFirestoreListeners(); renderizarCalendario(); seedDemoDataIfRequested(); iniciarListenersTareas(); maybeInitNotifications(); requestPushPermissionIfNeeded(); syncNotifReadFromRemote(); actualizarAccesoSecciones(); didManualLogout=false; return; } // user signed out
 __clearAllUnsubs();
 if(didManualLogout){ userDisplay.textContent='No conectado'; btnLogout&&(btnLogout.style.display='none'); btnLoginGoogle&&(btnLoginGoogle.style.display='inline-block'); actualizarAccesoSecciones(); return; } if(!localStorage.getItem(LS_REDIRECT_MARK)){ try{ await signInAnonymously(auth); }catch{} } userDisplay.textContent='Usuario anónimo'; canWrite=false; try{ btnSubirDocumento.style.display='none'; formAnuncio.querySelector('button[type="submit"]').disabled=true; formAgenda.querySelector('button[type="submit"]').disabled=true; }catch{} btnLogout&&(btnLogout.style.display='none'); btnLoginGoogle&&(btnLoginGoogle.style.display='inline-block'); iniciarListenersTareas(); maybeInitNotifications(); actualizarAccesoSecciones(); });
}

// Login/Logout
btnLogout?.addEventListener('click',async()=>{ try{ didManualLogout=true; __clearAllUnsubs(); await signOut(auth); }catch{} });
btnLoginGoogle?.addEventListener('click',async()=>{ if(btnLoginGoogle.disabled) return; didManualLogout=false; const provider=new GoogleAuthProvider(); provider.setCustomParameters({ prompt:'select_account' }); lastLoginAttempt={ provider:'google', ts:Date.now() }; try{ if(AUTH_MODE==='popup'){ await signInWithPopup(auth,provider); } else { localStorage.setItem(LS_REDIRECT_MARK,'google'); await signInWithRedirect(auth,provider); } }catch(e){ const code=e?.code||''; if(code.includes('popup-blocked')||code.includes('popup-closed-by-user')){ try{ btnLoginGoogle.disabled=true; btnLoginGoogle.textContent='Redirigiendo...'; localStorage.setItem(LS_REDIRECT_MARK,'google'); await signInWithRedirect(auth,provider); }catch{} } } });
// Lógica Microsoft eliminada

// Accesibilidad (Escape)
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    if(modalDocumento?.style.display==='flex'){
      modalDocumento.style.display='none';
      modalDocumento.setAttribute('aria-hidden','true');
      formDocumento.reset();
    }
    if(modalConfirmacion?.style.display==='flex'){
      modalConfirmacion.style.display='none';
      modalConfirmacion.setAttribute('aria-hidden','true');
      confirmationCallback=null;
    }
    if(modalActividad?.style.display==='flex') cerrarModalActividad();
    if(modalActividadDetalle?.style.display==='flex') cerrarModalActividadDetalle();
  }
});

// Inicializar opciones de horas (intervalos de 30 min 08:30-17:00 por ejemplo)
(function initHorasSustituciones(){
  const selIni=document.getElementById('sustitucion-hora-inicio');
  const selFin=document.getElementById('sustitucion-hora-fin');
  if(!selIni||!selFin) return;
  // Si ya hay más de la opción placeholder, no repetir
  if(selIni.options.length>1) return;
  const generarSlots=(inicio,fin,stepMin)=>{ // HH:MM strings
    const out=[];
    const toMins=s=>{ const [h,m]=s.split(':').map(Number); return h*60+m; };
    for(let t=toMins(inicio); t<=toMins(fin); t+=stepMin){
      const h=Math.floor(t/60).toString().padStart(2,'0');
      const m=(t%60).toString().padStart(2,'0');
      out.push(`${h}:${m}`);
    }
    return out;
  };
  const slots=generarSlots('08:30','17:00',30);
  slots.forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; selIni.appendChild(o.cloneNode(true)); });
  slots.forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; selFin.appendChild(o.cloneNode(true)); });
})();

// ================== SESIONES -> INTERVALOS PREDEFINIDOS ==================
// Reglas solicitadas:
//  - Sesión 5: 13:00 - 14:00 (fija)
//  - Sesión 4: 12:00 - 13:00 (fija)
//  - Sesión 1: puede ser 09:00-10:00 ó 09:00-10:30
//  - Sesión 2: puede ser 10:00-11:30 ó 10:30-11:30
//  - Sesión 3: sin especificación -> se deja libre (todas las horas disponibles)
// Implementación: al elegir sesión se restringen (o fijan) las horas de inicio/fin.
(function configurarIntervalosPorSesion(){
  const sesSel=document.getElementById('sustitucion-sesion');
  const selIni=document.getElementById('sustitucion-hora-inicio');
  const selFin=document.getElementById('sustitucion-hora-fin');
  if(!sesSel||!selIni||!selFin) return;

  // Guardamos copia original completa (sin el placeholder índice 0)
  const originalInicios=[...selIni.options].slice(1).map(o=>o.value);
  const originalFines=[...selFin.options].slice(1).map(o=>o.value);

  const SESSION_INTERVALS={
    '1': [ ['09:00','10:00'], ['09:00','10:30'] ],
    '2': [ ['10:00','11:30'], ['10:30','11:30'] ],
    '4': [ ['12:00','13:00'] ],
    '5': [ ['13:00','14:00'] ]
  };

  function setOptions(select, values){
    const placeholder=select.options[0];
    select.innerHTML='';
    select.appendChild(placeholder);
    values.forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; select.appendChild(o); });
  }

  function restoreOriginal(){
    setOptions(selIni, originalInicios);
    setOptions(selFin, originalFines);
    selIni.disabled=false;
    selFin.disabled=false;
  }

  function aplicar(){
    const ses=sesSel.value;
    if(!SESSION_INTERVALS[ses]){ restoreOriginal(); return; }
    const pares=SESSION_INTERVALS[ses];
    const inicios=[...new Set(pares.map(p=>p[0]))];
    setOptions(selIni, inicios);
    selIni.value=inicios[0]||'';
    selIni.disabled = inicios.length===1; // fija
    actualizarFines();
  }

  function actualizarFines(){
    const ses=sesSel.value;
    const pares=SESSION_INTERVALS[ses];
    if(!pares){ return; }
    const start=selIni.value;
    const fines=pares.filter(p=>p[0]===start).map(p=>p[1]);
    setOptions(selFin, fines);
    selFin.value=fines[0]||'';
    selFin.disabled = fines.length===1; // fija
  }

  sesSel.addEventListener('change', aplicar);
  selIni.addEventListener('change', actualizarFines);

  // Si ya viene seleccionada (al editar) aplicamos tras un tick
  setTimeout(()=>{ if(sesSel.value) aplicar(); },0);
})();

// Helpers
function requireAuth(){ if(!auth||!auth.currentUser){ notifyWarn('Inicia sesión para continuar'); return false; } return true; }
function fileToBase64(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); }); }

// Init
initAuth();

// Ocultar barra inferior al hacer scroll hacia abajo en móvil y mostrar al subir
let lastScrollY=window.scrollY; let hideTimeout=null;
window.addEventListener('scroll',()=>{
  const nav=document.getElementById('nav-secciones'); if(!nav) return;
  const isMobile=window.matchMedia('(max-width: 768px)').matches;
  if(!isMobile){ nav.classList.remove('nav-hidden'); return; }
  const current=window.scrollY;
  if(current>lastScrollY+10){ // scroll down
    nav.classList.add('nav-hidden');
  } else if(current<lastScrollY-10){ // scroll up
    nav.classList.remove('nav-hidden');
  }
  lastScrollY=current;
  if(hideTimeout) clearTimeout(hideTimeout);
  // auto show after inactivity
  hideTimeout=setTimeout(()=>{ nav.classList.remove('nav-hidden'); },1200);
});

// Colapsado manual del menú inferior en móvil
const navBarBottom = document.getElementById('nav-secciones');
const collapseBtn = null;

// Botón de colapsar nav eliminado

window.addEventListener('resize',()=>{ const isMobile=window.matchMedia('(max-width: 768px)').matches; if(!isMobile){ navBarBottom.classList.remove('collapsed'); } });
