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

// Calendario
const calendarGrid=document.getElementById('calendar-grid');
const monthYearDisplay=document.getElementById('month-year');
const prevMonthBtn=document.getElementById('prev-month');
const nextMonthBtn=document.getElementById('next-month');
let currentDate=new Date();

// Menú móvil
if(menuToggle && navBar){
 menuToggle.addEventListener('click',()=>{ const open=navBar.classList.toggle('open'); menuToggle.classList.toggle('open',open); menuToggle.setAttribute('aria-expanded',open?'true':'false'); });
 document.addEventListener('click',e=>{ if(!navBar.classList.contains('open')) return; if(e.target===menuToggle||menuToggle.contains(e.target)||navBar.contains(e.target)) return; navBar.classList.remove('open'); menuToggle.classList.remove('open'); menuToggle.setAttribute('aria-expanded','false'); });
}

// Indicadores nuevos
let lastSeen={ anuncios:0, agenda:0, actividades:0, sustituciones:0 }; // updated to include sustituciones
const latestMax={ anuncios:0, agenda:0, actividades:0, sustituciones:0 }; // updated
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
  if(!filtrados.length){ if(tbody){ for(let s=1;s<=5;s++){ const tr=document.createElement('tr'); tr.innerHTML=`<td style="border:1px solid #e5e7eb; padding:6px; font-weight:600; text-align:center; background:#f9fafb;">${s}</td>`; ['Lunes','Martes','Miércoles','Jueves','Viernes'].forEach(()=>{ const td=document.createElement('td'); td.style.cssText='border:1px solid #e5e7eb; padding:6px; min-width:140px;'; tr.appendChild(td); }); tbody.appendChild(tr);} } if(contLegacy) contLegacy.innerHTML='<p class="loading-message">No hay sustituciones registradas.</p>'; return; }
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
      tr.innerHTML=`<td style="border:1px solid #e5e7eb; padding:6px; font-weight:600; text-align:center; background:#f9fafb;">${s}</td>`;
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
function renderizarCalendario(){ const year=currentDate.getFullYear(); const month=currentDate.getMonth(); monthYearDisplay.textContent=new Date(year,month).toLocaleString('es-ES',{month:'long',year:'numeric'}); calendarGrid.querySelectorAll('.day-cell,.other-month').forEach(c=>c.remove()); const first=new Date(year,month,1); const last=new Date(year,month+1,0); const offset=(first.getDay()+6)%7; for(let i=0;i<offset;i++){ const e=document.createElement('div'); e.className='day-cell other-month'; calendarGrid.appendChild(e);} for(let d=1; d<=last.getDate(); d++){ const cell=document.createElement('div'); cell.className='day-cell'; cell.dataset.date=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; cell.innerHTML=`<span class='day-number'>${d}</span>`; calendarGrid.appendChild(cell);} document.querySelectorAll('.day-cell').forEach(c=>{ if(!c.classList.contains('other-month')) c.activities=actividadesMapCache.get(c.dataset.date)||[]; }); renderizarActividades(); }
function renderizarActividades(){ const filtro=filtroCursosSelect?[...filtroCursosSelect.selectedOptions].map(o=>o.value):[]; document.querySelectorAll('.day-cell').forEach(cell=>{ [...cell.querySelectorAll('.activity-item')].forEach(a=>a.remove()); (cell.activities||[]).forEach(act=>{ if(filtro.length){ const cs=Array.isArray(act.curso)?act.curso:(act.curso?[act.curso]:[]); if(!cs.some(c=>filtro.includes(c))) return; } const item=document.createElement('div'); item.className='activity-item'; const tipo=(act.tipo||'').toLowerCase(); if(['dentro','salida'].includes(tipo)) item.classList.add('tipo-'+tipo); else if(tipo) item.classList.add('tipo-otro'); item.dataset.id=act.id; const tt=document.createElement('span'); tt.textContent=act.title||''; item.appendChild(tt); const cs=Array.isArray(act.curso)?act.curso:(act.curso?[act.curso]:[]); if(cs.length){ const wrap=document.createElement('div'); wrap.className='curso-tags'; cs.slice(0,2).forEach(c=>{ const s=document.createElement('span'); s.className='curso-tag'; s.textContent=abreviarCurso(c); wrap.appendChild(s); }); if(cs.length>2){ const extra=document.createElement('span'); extra.className='curso-tag out'; extra.textContent='+'+(cs.length-2); wrap.appendChild(extra);} item.appendChild(wrap);} const canManage=canWrite && (isAdmin||(act.createdBy?act.createdBy===userId:true)); if(canManage){ const del=document.createElement('button'); del.className='delete-btn'; del.textContent='×'; del.dataset.id=act.id; item.appendChild(del); item.setAttribute('draggable','true'); item.addEventListener('dragstart',ev=>{ try{ev.dataTransfer.effectAllowed='move';}catch{} dragActivity=act; dragSourceDate=cell.dataset.date; item.classList.add('dragging'); }); item.addEventListener('dragend',()=>{ dragActivity=null; dragSourceDate=null; item.classList.remove('dragging'); document.querySelectorAll('.day-cell.drag-over').forEach(c=>c.classList.remove('drag-over')); }); } cell.appendChild(item); }); }); }

// Firestore listeners
function setupFirestoreListeners(){
 onSnapshot(getPublicCollection('documentos'),qs=>{ const arr=[]; qs.forEach(d=>arr.push({id:d.id,...d.data()})); renderizarDocumentos(arr); });
 onSnapshot(getPublicCollection('anuncios'),qs=>{ const arr=[]; qs.forEach(d=>arr.push({id:d.id,...d.data()})); arr.sort((a,b)=>a.timestamp-b.timestamp); renderizarAnuncios(arr); marcarNuevos('anuncios',arr); });
 onSnapshot(getPublicCollection('actividades'),qs=>{ actividadesMapCache=new Map(); const all=[]; qs.forEach(ds=>{ const data=ds.data(); const k=data.date; if(!actividadesMapCache.has(k)) actividadesMapCache.set(k,[]); const obj={id:ds.id,...data}; actividadesMapCache.get(k).push(obj); all.push(obj); }); document.querySelectorAll('.day-cell').forEach(c=>{ if(!c.classList.contains('other-month')) c.activities=actividadesMapCache.get(c.dataset.date)||[]; }); renderizarActividades(); marcarNuevos('actividades',all); });
 onSnapshot(getPublicCollection('agenda'),qs=>{ const arr=[]; qs.forEach(d=>arr.push({id:d.id,...d.data()})); renderizarAgenda(arr); marcarNuevos('agenda',arr); });
	// Sustituciones
	onSnapshot(getPublicCollection('sustituciones'),qs=>{ const arr=[]; qs.forEach(d=>arr.push({id:d.id,...d.data()})); renderizarSustituciones(arr); marcarNuevos('sustituciones',arr); });
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
onAuthStateChanged(auth, async user=>{ if(!user && lastRedirectResultChecked && localStorage.getItem(LS_REDIRECT_MARK)) localStorage.removeItem(LS_REDIRECT_MARK); if(user){ userId=user.uid; let tok=null; try{ tok=await getIdTokenResult(user,true); isAdmin=!!(tok&&tok.claims&&tok.claims.admin);}catch{} canWrite=computeCanWrite(user,isAdmin); console.debug('AUTH STATE', {uid:user.uid,email:user.email,isAdmin,canWrite,claims:tok?.claims}); const email=(user.email||'').toLowerCase()||'(sin email)'; userDisplay.textContent=`${email}${isAdmin?' (admin)':(!canWrite?' (solo lectura)':'')}`; try{ btnSubirDocumento.style.display=canWrite?'inline-flex':'none'; formAnuncio.querySelector('button[type="submit"]').disabled=!canWrite; formAgenda.querySelector('button[type="submit"]').disabled=!canWrite; }catch{} btnLogout&&(btnLogout.style.display='inline-block'); if(btnLoginGoogle) btnLoginGoogle.style.display=user.isAnonymous?'inline-block':'none'; if(!actividadesMapCache.size){ setupFirestoreListeners(); renderizarCalendario(); seedDemoDataIfRequested(); } didManualLogout=false; return; } if(didManualLogout){ userDisplay.textContent='No conectado'; btnLogout&&(btnLogout.style.display='none'); btnLoginGoogle&&(btnLoginGoogle.style.display='inline-block'); return; } if(!localStorage.getItem(LS_REDIRECT_MARK)){ try{ await signInAnonymously(auth); }catch{} } userDisplay.textContent='Usuario anónimo'; canWrite=false; try{ btnSubirDocumento.style.display='none'; formAnuncio.querySelector('button[type="submit"]').disabled=true; formAgenda.querySelector('button[type="submit"]').disabled=true; }catch{} btnLogout&&(btnLogout.style.display='none'); btnLoginGoogle&&(btnLoginGoogle.style.display='inline-block'); });
}

// Login/Logout
btnLogout?.addEventListener('click',async()=>{ try{ didManualLogout=true; await signOut(auth); }catch{} });
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

// Helpers
function requireAuth(){ if(!auth||!auth.currentUser){ notifyWarn('Inicia sesión para continuar'); return false; } return true; }
function fileToBase64(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); }); }

// Init
initAuth();
