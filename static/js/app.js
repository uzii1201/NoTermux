// ═══════════════════════════════════════════════════════
//  Generador de nombres de sesión
// ═══════════════════════════════════════════════════════
const ADJETIVOS = [
  'rojo','azul','verde','dorado','plateado','morado','naranja','celeste',
  'blanco','negro','gris','rosa','lila','turquesa','coral','beige',
  'oscuro','brillante','veloz','sabio','libre','fuerte','suave','claro'
];
const SUSTANTIVOS = [
  'puma','condor','jaguar','ciervo','aguila','lobo','zorro','oso',
  'lince','bisonte','delfin','halcon','tigre','nutria','tapir','llama',
  'rio','monte','lago','bosque','pampa','cerro','valle','campo'
];

function generarNombre() {
  const a = ADJETIVOS[Math.floor(Math.random() * ADJETIVOS.length)];
  const s = SUSTANTIVOS[Math.floor(Math.random() * SUSTANTIVOS.length)];
  const n = Math.floor(Math.random() * 900) + 100;
  return `${a}-${s}-${n}`;
}

// ═══════════════════════════════════════════════════════
//  Estado global
// ═══════════════════════════════════════════════════════
const state = {
  user:    localStorage.getItem('notas_user') || '',
  session: null,
  notes:   [],
  todos:   [],
  editingNoteId: null,
};

// ═══════════════════════════════════════════════════════
//  Utilidades de UI
// ═══════════════════════════════════════════════════════
const APP_NAME = 'NoTermux';

function setTitle(suffix) {
  document.title = suffix ? `${suffix} — ${APP_NAME}` : APP_NAME;
}

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function showModal(id) { document.getElementById(id).classList.remove('hidden'); }
function hideModal(id) { document.getElementById(id).classList.add('hidden'); }

function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function shake(id) {
  const el = document.getElementById(id);
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 400);
}

let _toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

function fmtFecha(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('es', { day:'2-digit', month:'2-digit', year:'2-digit' })
    + ' ' + d.toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' });
}

// Aplicar formato al editor (se llama desde el HTML)
function fmt(cmd) {
  const ed = document.getElementById('note-editor');
  ed.focus();
  document.execCommand(cmd, false, null);
}

// ═══════════════════════════════════════════════════════
//  LOGIN
// ═══════════════════════════════════════════════════════
document.getElementById('login-btn').addEventListener('click', hacerLogin);
document.getElementById('username-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') hacerLogin();
});

function hacerLogin() {
  const nombre = document.getElementById('username-input').value.trim();
  if (!nombre) return shake('username-input');
  state.user = nombre;
  localStorage.setItem('notas_user', nombre);
  irASesiones();
}

// Si ya tiene usuario guardado, ir directo a sesiones
if (state.user) {
  irASesiones();
} else {
  setTitle(null);
  showView('view-login');
}

// ═══════════════════════════════════════════════════════
//  SESIONES
// ═══════════════════════════════════════════════════════
function irASesiones() {
  setTitle(null);
  document.getElementById('user-display').textContent = state.user;
  document.getElementById('session-name-input').value = generarNombre();
  showView('view-sessions');
  cargarSesiones();
}

document.getElementById('refresh-btn').addEventListener('click', () => {
  cargarSesiones();
  toast('Lista actualizada');
});

document.getElementById('logout-btn').addEventListener('click', () => {
  state.user = '';
  localStorage.removeItem('notas_user');
  showView('view-login');
  document.getElementById('username-input').value = '';
});

document.getElementById('generate-name-btn').addEventListener('click', () => {
  document.getElementById('session-name-input').value = generarNombre();
});

document.getElementById('create-session-btn').addEventListener('click', async () => {
  const nombre = document.getElementById('session-name-input').value.trim();
  if (!nombre) return shake('session-name-input');
  try {
    await API.createSession(nombre, state.user);
    await entrarSesion(nombre);
  } catch (e) {
    if (e.message === 'La sesión ya existe') {
      toast('Ese nombre ya existe — usa "Unirse" o genera otro nombre.');
    } else {
      toast(e.message);
    }
  }
});

document.getElementById('join-btn').addEventListener('click', unirseASesion);
document.getElementById('join-name-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') unirseASesion();
});

async function unirseASesion() {
  const nombre = document.getElementById('join-name-input').value.trim();
  if (!nombre) return shake('join-name-input');
  try {
    await API.getSession(nombre);
    await entrarSesion(nombre);
  } catch {
    toast('Sesión no encontrada. Verificá el nombre.');
  }
}

async function cargarSesiones() {
  try {
    const sesiones = await API.getSessions();
    renderSesiones(sesiones);
  } catch {
    toast('No se pudieron cargar las sesiones.');
  }
}

function renderSesiones(sesiones) {
  const el = document.getElementById('sessions-list');
  const label = document.getElementById('sessions-section-label');
  if (!sesiones.length) {
    label.textContent = 'Sesiones';
    el.innerHTML = `
      <div class="empty-state">
        <span>No hay sesiones. ¡Crea una!</span>
      </div>`;
    return;
  }
  label.textContent = `Sesiones (${sesiones.length})`;
  el.innerHTML = sesiones.map(s => `
    <div class="session-card" onclick="entrarSesion('${esc(s.name)}')">
      <div class="session-card-header">
        <span class="session-card-name">${esc(s.name)}</span>
        <button class="session-del-btn" title="Eliminar sesión"
          onclick="event.stopPropagation(); eliminarSesion('${esc(s.name)}')">✕</button>
      </div>
      <div class="session-card-meta">
        <span>Por ${esc(s.created_by)}</span>
        <span>${s.note_count} nota${s.note_count !== 1 ? 's' : ''}</span>
        <span>${s.todo_pending} pendiente${s.todo_pending !== 1 ? 's' : ''}</span>
      </div>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════════════
//  WORKSPACE
// ═══════════════════════════════════════════════════════
async function eliminarSesion(nombre) {
  if (!confirm(`¿Eliminar la sesión "${nombre}" y todo su contenido? Esta acción no se puede deshacer.`)) return;
  try {
    await API.deleteSession(nombre);
    toast(`Sesión "${nombre}" eliminada`);
    cargarSesiones();
  } catch {
    toast('Error al eliminar la sesión.');
  }
}

async function entrarSesion(nombre) {
  try {
    const sesion = await API.getSession(nombre);
    state.session = sesion;
    state.notes   = sesion.notes  || [];
    state.todos   = sesion.todos  || [];
    document.getElementById('session-display').textContent  = nombre;
    document.getElementById('workspace-user').textContent   = state.user;
    setTitle(nombre);
    showView('view-workspace');
    mostrarTab('notes');
    renderNotas();
    renderTodos();
  } catch {
    toast('No se pudo entrar a la sesión.');
  }
}

document.getElementById('back-btn').addEventListener('click', () => {
  state.session = null;
  irASesiones();
});

// Tabs
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => mostrarTab(btn.dataset.tab));
});

function mostrarTab(tab) {
  document.querySelectorAll('.tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(c =>
    c.classList.toggle('hidden', c.id !== `tab-${tab}`));
}

// ═══════════════════════════════════════════════════════
//  NOTAS
// ═══════════════════════════════════════════════════════
document.getElementById('new-note-btn').addEventListener('click', () => {
  abrirModalNota(null);
});

document.getElementById('save-note-btn').addEventListener('click', guardarNota);
document.getElementById('cancel-note-btn').addEventListener('click', () => cerrarModalNota());
document.getElementById('modal-backdrop').addEventListener('click', () => cerrarModalNota());

function cerrarModalNota() {
  if (state.session) setTitle(state.session.name);
  hideModal('modal-note');
}

document.getElementById('delete-note-btn').addEventListener('click', async () => {
  if (!state.editingNoteId) return;
  if (!confirm('¿Eliminar esta nota?')) return;
  try {
    await API.deleteNote(state.session.name, state.editingNoteId);
    state.notes = state.notes.filter(n => n.id !== state.editingNoteId);
    renderNotas();
    cerrarModalNota();
  } catch {
    toast('Error al eliminar la nota.');
  }
});

// Atajos de teclado en el editor (Ctrl+S para guardar)
document.getElementById('note-editor').addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    guardarNota();
  }
});

function abrirModalNota(nota) {
  state.editingNoteId = nota ? nota.id : null;
  document.getElementById('modal-note-title').textContent = nota ? 'Editar nota' : 'Nueva nota';
  document.getElementById('note-title').value = nota ? nota.title : '';
  document.getElementById('note-editor').innerHTML = nota ? nota.content : '';
  document.getElementById('delete-note-btn').style.display = nota ? '' : 'none';
  if (nota) setTitle(nota.title);
  showModal('modal-note');
  setTimeout(() => document.getElementById('note-title').focus(), 80);
}

async function guardarNota() {
  const titulo   = document.getElementById('note-title').value.trim() || 'Sin título';
  const contenido = document.getElementById('note-editor').innerHTML;
  const sNombre  = state.session.name;

  try {
    if (state.editingNoteId) {
      const actualizada = await API.updateNote(sNombre, state.editingNoteId, {
        title: titulo, content: contenido, updated_by: state.user,
      });
      state.notes = state.notes.map(n => n.id === actualizada.id ? actualizada : n);
    } else {
      const nueva = await API.createNote(sNombre, {
        title: titulo, content: contenido, created_by: state.user,
      });
      state.notes.unshift(nueva);
    }
    renderNotas();
    cerrarModalNota();
  } catch {
    toast('Error al guardar la nota.');
  }
}

function renderNotas() {
  const el = document.getElementById('notes-list');
  if (!state.notes.length) {
    el.innerHTML = `
      <div class="empty-state">
        <span>Sin notas aun. Crea la primera.</span>
      </div>`;
    return;
  }
  el.innerHTML = state.notes.map(n => `
    <div class="note-card" onclick="abrirModalNota(state.notes.find(x=>x.id==='${n.id}'))">
      <div class="note-header">
        <span class="note-title">${esc(n.title)}</span>
        <button class="note-delete-btn" title="Eliminar"
          onclick="event.stopPropagation(); borrarNota('${n.id}')">✕</button>
      </div>
      <div class="note-preview">${n.content}</div>
      <div class="note-meta">
        <span>${esc(n.updated_by || n.created_by)}</span>
        <span>${fmtFecha(n.updated_at)}</span>
      </div>
    </div>
  `).join('');
}

async function borrarNota(id) {
  if (!confirm('¿Eliminar esta nota?')) return;
  try {
    await API.deleteNote(state.session.name, id);
    state.notes = state.notes.filter(n => n.id !== id);
    renderNotas();
  } catch {
    toast('Error al eliminar la nota.');
  }
}

// ═══════════════════════════════════════════════════════
//  TO-DO
// ═══════════════════════════════════════════════════════
document.getElementById('add-todo-btn').addEventListener('click', agregarTodo);
document.getElementById('new-todo-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') agregarTodo();
});

async function agregarTodo() {
  const texto = document.getElementById('new-todo-input').value.trim();
  if (!texto) return shake('new-todo-input');
  try {
    const todo = await API.createTodo(state.session.name, {
      text: texto, created_by: state.user,
    });
    state.todos.unshift(todo);
    document.getElementById('new-todo-input').value = '';
    renderTodos();
  } catch {
    toast('Error al agregar la tarea.');
  }
}

async function toggleTodo(id) {
  const todo = state.todos.find(t => t.id === id);
  if (!todo) return;
  try {
    const actualizado = await API.updateTodo(state.session.name, id, {
      done: !todo.done, updated_by: state.user,
    });
    state.todos = state.todos.map(t => t.id === actualizado.id ? actualizado : t);
    renderTodos();
  } catch {
    toast('Error al actualizar la tarea.');
  }
}

async function borrarTodo(id) {
  try {
    await API.deleteTodo(state.session.name, id);
    state.todos = state.todos.filter(t => t.id !== id);
    renderTodos();
  } catch {
    toast('Error al eliminar la tarea.');
  }
}

function renderTodos() {
  const el = document.getElementById('todos-list');
  if (!state.todos.length) {
    el.innerHTML = `
      <div class="empty-state">
        <span>Sin tareas. Agrega la primera.</span>
      </div>`;
    return;
  }

  const pendientes  = state.todos.filter(t => !t.done);
  const completadas = state.todos.filter(t => t.done);

  const renderItem = t => `
    <div class="todo-item ${t.done ? 'done' : ''}">
      <input type="checkbox" ${t.done ? 'checked' : ''}
             onchange="toggleTodo('${t.id}')" />
      <span class="todo-text">${esc(t.text)}</span>
      <span class="todo-author">${esc(t.created_by)}</span>
      <button class="todo-del" title="Eliminar" onclick="borrarTodo('${t.id}')">×</button>
    </div>
  `;

  let html = pendientes.map(renderItem).join('');

  if (completadas.length) {
    html += `<div class="done-divider">Completadas (${completadas.length})</div>`;
    html += completadas.map(renderItem).join('');
  }

  el.innerHTML = html;
}
