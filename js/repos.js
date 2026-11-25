// ---- Repositories page with visual folders (#repositories) ----
// Folders only exist on this site; nothing changes on GitHub.
// They are saved in data/folders.json in this site's repo, so every visitor sees them.
// That file only ever lists public repos. Which folder each private repo goes in
// is kept in the owner's browser, so private names never reach the public file.
// Only the owner (with the access key) can change folders, and every change saves by itself.

const REPO_SITIO = `${USUARIO}/${USUARIO}.github.io`;
const RUTA_CARPETAS = 'data/folders.json';
const CLAVE_ESCRITURA = 'lubbock-write';
const CLAVE_PRIVADOS = 'lubbock-private-folders';
const PALETA = ['#ff5a3c', '#e06a4f', '#ff9a3c', '#e8c547', '#89e051', '#3ee6d8', '#3178c6', '#a97bff', '#c6538c', '#8a7671'];
const ESPERA_GUARDADO = 1200;

const cv = {
  carpetas: null, cargadoComoDueno: null, cargando: null,
  sinCarpetaAbierta: true, cerradas: new Set(),
  tipo: 'all', modo: 'carpetas', texto: '',
  editando: null, colorDe: null, moverDe: null,
  arrastrado: null, carpetaArrastrada: null,
  // Autosave
  publicadoTexto: null, sha: null, temporizador: null,
  guardando: false, pendiente: false, estado: '', mensaje: ''
};

const esDueno = () => !!token();
const leerLocal = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
const escribirLocal = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const claveEscritura = () => { try { return localStorage.getItem(CLAVE_ESCRITURA) || ''; } catch { return ''; } };

function aBase64(texto) {
  let s = '';
  new TextEncoder().encode(texto).forEach(b => { s += String.fromCharCode(b); });
  return btoa(s);
}
const deBase64 = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));

const colorValido = c => /^#[0-9a-f]{6}$/i.test(c) ? c : PALETA[0];
const limpiarNombre = n => String(n).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_.-]/g, '').slice(0, 24);

// What goes in the public file: folders in order, each with only its public repos.
function textoPublico(carpetas, esPublico) {
  return JSON.stringify({
    folders: carpetas.map(c => ({ id: c.id, name: c.nombre, color: c.color, repos: c.repos.filter(esPublico) }))
  }, null, 2) + '\n';
}

async function cargarCarpetas() {
  const dueno = esDueno();
  let datos = null;
  cv.sha = null;
  if (dueno) {
    // The owner reads the file straight from the repo, so a save shows up before the site redeploys.
    try {
      const j = await api(`/repos/${REPO_SITIO}/contents/${RUTA_CARPETAS}?ref=main`);
      datos = JSON.parse(deBase64(j.content));
      cv.sha = j.sha;
    } catch {}
  }
  if (!datos) {
    try {
      const r = await fetch(RUTA_CARPETAS, { cache: 'no-cache' });
      if (r.ok) datos = await r.json();
    } catch {}
  }
  cv.carpetas = ((datos && datos.folders) || []).map(f => ({
    id: String(f.id),
    nombre: limpiarNombre(f.name) || 'folder',
    color: colorValido(f.color),
    repos: Array.isArray(f.repos) ? f.repos.map(String) : []
  }));
  // The file as it is now (it only has public repos), to know later whether a change needs publishing.
  cv.publicadoTexto = textoPublico(cv.carpetas, () => true);
  if (dueno) {
    for (const [repo, id] of Object.entries(leerLocal(CLAVE_PRIVADOS, {}))) {
      const c = cv.carpetas.find(x => x.id === id);
      if (c && !c.repos.includes(repo)) c.repos.push(repo);
    }
  }
  cv.cargadoComoDueno = dueno;
}

function asegurarCarpetas() {
  if (cv.carpetas && cv.cargadoComoDueno === esDueno()) return;
  if (cv.cargando) return;
  cv.cargando = cargarCarpetas().finally(() => { cv.cargando = null; pintarCarpetas(); });
}

// Called by js/app.js when the page opens on #repositories or switches to it.
function abrirCarpetas() {
  asegurarCarpetas();
  pintarCarpetas();
}

// Called by js/app.js every time the repo list loads (also after saving a key).
function alCargarRepos() {
  if (location.hash === '#repositories') abrirCarpetas();
}

const carpetaDe = nombre => cv.carpetas.find(c => c.repos.includes(nombre));

function filtrados() {
  const t = cv.texto.toLowerCase();
  return reposLista
    .filter(r => cv.tipo === 'all' || (cv.tipo === 'private') === !!r.private)
    .filter(r => !t || [r.name, r.description, r.language].some(x => (x || '').toLowerCase().includes(t)));
}

function fila(r, ultima, plano) {
  const c = carpetaDe(r.name);
  const dueno = esDueno();
  const menu = cv.moverDe === r.name ? `
      <div class="mover">
        <div class="tag">// MOVE TO</div>
        ${cv.carpetas.map(x => `<button type="button" data-mover="${esc(x.id)}" class="${c === x ? 'on' : ''}">
          <span class="sw" style="background:${x.color}"></span>/${esc(x.nombre)}</button>`).join('')}
        <button type="button" data-mover="" class="${c ? '' : 'on'}"><span class="sw" style="border:1px dashed #8a7671"></span>/unsorted</button>
      </div>` : '';
  return `
    <div class="rrow" draggable="${dueno}" data-repo="${esc(r.name)}">
      <button type="button" class="asa" title="move to a folder (or drag)">⋮⋮</button>
      <span class="rama">${plano ? '<span class="r">▸</span>' : (ultima ? '└─' : '├─')}</span>
      <div class="rnombre">
        <a href="${esc(r.html_url)}">${esc(r.name)}</a>${r.private ? '<span class="lock">PRIVATE</span>' : ''}${r.fork ? '<span class="fork">fork</span>' : ''}${plano && c ? `<span class="ftag" style="color:${c.color}">/${esc(c.nombre)}</span>` : ''}
        ${r.description ? `<div class="rdesc">${esc(r.description)}</div>` : ''}
      </div>
      <span class="hide-sm">${r.language ? `<i class="dot" style="background:${COLORES[r.language] || '#888'}"></i>${esc(r.language)}` : '<span class="m">—</span>'}</span>
      <span class="hide-sm">★ ${r.stargazers_count}</span>
      <span class="m">${hace(r.pushed_at)}</span>
      ${menu}
    </div>`;
}

function bloque(c, lista, pos, total) {
  const id = c ? c.id : '';
  const abierta = c ? !cv.cerradas.has(c.id) : cv.sinCarpetaAbierta;
  const editando = c && cv.editando === id;
  const nombre = editando
    ? `<input id="renombrar" value="${esc(c.nombre)}" maxlength="24" aria-label="folder name">`
    : '/' + esc(c ? c.nombre : 'unsorted');
  const acciones = c ? `<span class="acciones">
      <button type="button" class="acc" data-acc="subir" title="move folder up"${pos === 0 ? ' disabled' : ''}>↑</button>
      <button type="button" class="acc" data-acc="bajar" title="move folder down"${pos === total - 1 ? ' disabled' : ''}>↓</button>
      <button type="button" class="acc" data-acc="renombrar">RENAME</button>
      <button type="button" class="acc" data-acc="color">COLOR</button>
      <button type="button" class="acc" data-acc="borrar">DELETE</button></span>` : '';
  const paleta = c && cv.colorDe === id ? `<div class="paleta">
      ${PALETA.map(p => `<button type="button" class="psw${p === c.color ? ' on' : ''}" data-color="${p}" style="background:${p}" title="${p}"></button>`).join('')}
      <label class="pcustom">CUSTOM <input type="color" value="${c.color}"></label>
    </div>` : '';
  return `
    <section class="carpeta${abierta ? '' : ' cerrada'}" data-carpeta="${esc(id)}">
      <div class="chead"${c && esDueno() && !editando ? ' draggable="true"' : ''}>
        ${c ? '<span class="asa asa-c" title="drag to reorder">⋮⋮</span>' : ''}
        <span class="flecha">▾</span>
        <span class="sw" style="${c ? `background:${c.color}` : 'border:1px dashed #8a7671'}"></span>
        <span class="cnombre">${nombre}</span>
        <span class="ccount">${lista.length}</span>
        ${acciones}
      </div>
      ${paleta}
      <div class="crepos">
        ${lista.length ? lista.map((r, i) => fila(r, i === lista.length - 1, false)).join('')
          : `<div class="vacia-c">${esDueno() ? '// empty · drag repos here or use ⋮⋮' : '// empty'}</div>`}
      </div>
    </section>`;
}

function pintarEstado() {
  const e = $('c-estado');
  if (!esDueno()) { e.innerHTML = ''; return; }
  const textos = {
    esperando: '<span class="m">● CHANGES · SAVING SOON</span>',
    guardando: '<span class="c">SAVING…</span>',
    guardado: '<span class="c">✓ SAVED · LIVE FOR VISITORS IN ~1 MIN</span>',
    local: '<span class="c">✓ SAVED</span>'
  };
  if (textos[cv.estado]) { e.innerHTML = textos[cv.estado]; return; }
  if (cv.estado === 'error') {
    e.innerHTML = `<span class="r">${esc(cv.mensaje)}</span>
      <button type="button" class="chip on" id="c-reintentar">${claveEscritura() ? 'RETRY' : 'ADD WRITE KEY'}</button>`;
    return;
  }
  e.innerHTML = '';
}

function pintarCarpetas() {
  if (location.hash !== '#repositories') return;
  const dueno = esDueno();
  $('vista-carpetas').classList.toggle('solo-lectura', !dueno);
  pintarEstado();
  if (!reposLista || !cv.carpetas || cv.cargadoComoDueno !== dueno) {
    $('arbol').innerHTML = '<div class="vacio m">loading…</div>';
    return;
  }
  const priv = reposLista.filter(r => r.private).length;
  $('c-tipos').hidden = !priv;
  $('k-all').textContent = reposLista.length;
  $('k-public').textContent = reposLista.length - priv;
  $('k-private').textContent = priv;

  const lista = filtrados();
  const conocidos = new Set(reposLista.map(r => r.name));
  const usadas = cv.carpetas.filter(c => c.repos.some(n => conocidos.has(n)));
  const n = (k, palabra) => `${k} ${palabra}${k === 1 ? '' : 'S'}`;
  $('c-resumen').textContent = [
    n(lista.length, 'REPO'),
    n(dueno ? cv.carpetas.length : usadas.length, 'FOLDER'),
    n(new Set(lista.map(r => r.language).filter(Boolean)).size, 'LANGUAGE')
  ].join(' · ');

  if (cv.modo === 'plano') {
    $('arbol').innerHTML = lista.length
      ? `<section class="carpeta"><div class="crepos">${lista.map(r => fila(r, false, true)).join('')}</div></section>`
      : '<div class="vacio m">// no repos match</div>';
    return;
  }
  const html = [];
  cv.carpetas.forEach((c, i) => {
    const dentro = lista.filter(r => c.repos.includes(r.name));
    // Visitors don't see folders that have nothing public in them.
    if (dentro.length || (dueno && !cv.texto && cv.tipo === 'all')) html.push(bloque(c, dentro, i, cv.carpetas.length));
  });
  const sueltos = lista.filter(r => !carpetaDe(r.name));
  if (sueltos.length || (dueno && !cv.texto)) html.push(bloque(null, sueltos));
  if (dueno) html.push('<button type="button" class="nueva" id="nueva">+ NEW FOLDER</button>');
  $('arbol').innerHTML = html.join('') || '<div class="vacio m">// no repos match</div>';
  const inp = $('renombrar');
  if (inp) { inp.focus(); inp.select(); }
}

// ---- Saving ----

// Every change keeps the private placements in this browser right away,
// and publishes the public file a moment later (several quick changes become one save).
function marcarCambio() {
  const privados = new Set(reposLista.filter(r => r.private).map(r => r.name));
  const mapa = {};
  cv.carpetas.forEach(c => c.repos.forEach(n => { if (privados.has(n)) mapa[n] = c.id; }));
  escribirLocal(CLAVE_PRIVADOS, mapa);
  cv.estado = 'esperando';
  clearTimeout(cv.temporizador);
  cv.temporizador = setTimeout(guardarCarpetas, ESPERA_GUARDADO);
  pintarEstado();
}

function error(mensaje) {
  cv.estado = 'error';
  cv.mensaje = mensaje;
}

async function guardarCarpetas() {
  clearTimeout(cv.temporizador);
  // Don't publish while a folder name is still being typed.
  if (cv.editando !== null) { cv.temporizador = setTimeout(guardarCarpetas, ESPERA_GUARDADO); return; }
  if (cv.guardando) { cv.pendiente = true; return; }
  const publicos = new Set(reposLista.filter(r => !r.private).map(r => r.name));
  const texto = textoPublico(cv.carpetas, n => publicos.has(n));
  // Only private repos moved: nothing public changed, so there is nothing to publish.
  if (texto === cv.publicadoTexto) { cv.estado = 'local'; pintarEstado(); return; }

  const clave = claveEscritura();
  if (!clave) {
    error('! NOT PUBLISHED · A WRITE KEY IS NEEDED');
    pintarEstado();
    abrirClaveEscritura();
    return;
  }
  cv.guardando = true;
  cv.estado = 'guardando';
  pintarEstado();
  const h = { Authorization: 'Bearer ' + clave, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' };
  const url = `https://api.github.com/repos/${REPO_SITIO}/contents/${RUTA_CARPETAS}`;
  const leerSha = async () => {
    const g = await fetch(url + '?ref=main', { headers: h });
    if (g.ok) return (await g.json()).sha;
    if (g.status === 401) throw new Error('rechazada');
    if (g.status === 404) return null;
    throw new Error('permiso');
  };
  const subir = sha => fetch(url, {
    method: 'PUT',
    headers: h,
    body: JSON.stringify({ message: 'Update repo folders', content: aBase64(texto), branch: 'main', ...(sha ? { sha } : {}) })
  });
  try {
    if (!cv.sha) cv.sha = await leerSha();
    let r = await subir(cv.sha);
    if (r.status === 409 || r.status === 422) {
      // The file changed since it was read (another tab, or a save still landing): read it again and retry once.
      cv.sha = await leerSha();
      r = await subir(cv.sha);
    }
    if (r.status === 401) throw new Error('rechazada');
    if (r.status === 403 || r.status === 404) throw new Error('permiso');
    if (!r.ok) throw new Error(String(r.status));
    cv.sha = (await r.json()).content.sha;
    cv.publicadoTexto = texto;
    cv.estado = 'guardado';
  } catch (e) {
    cv.sha = null;
    const m = e.message;
    if (m === 'rechazada') {
      try { localStorage.removeItem(CLAVE_ESCRITURA); } catch {}
      error('! WRITE KEY REJECTED');
    } else if (m === 'permiso') {
      error('! THE WRITE KEY CANNOT EDIT THIS REPO (CONTENTS → READ AND WRITE)');
    } else {
      error('! COULD NOT SAVE · ' + m);
    }
  }
  cv.guardando = false;
  pintarEstado();
  if (cv.pendiente) { cv.pendiente = false; guardarCarpetas(); }
}

function abrirClaveEscritura() {
  if ($('d-escritura').open) return;
  $('w-token').value = '';
  $('w-token').placeholder = claveEscritura() ? 'a key is saved · paste a new one to replace it' : 'github_pat_…';
  $('w-err').textContent = '';
  $('w-err').classList.remove('ok');
  $('d-escritura').showModal();
}

// ---- Changes ----

function moverRepo(repo, idDestino) {
  cv.carpetas.forEach(c => { c.repos = c.repos.filter(n => n !== repo); });
  const destino = cv.carpetas.find(c => c.id === idDestino);
  if (destino) { destino.repos.push(repo); cv.cerradas.delete(destino.id); }
  marcarCambio();
}

function moverCarpeta(id, nuevaPos) {
  const i = cv.carpetas.findIndex(c => c.id === id);
  if (i < 0) return;
  const [c] = cv.carpetas.splice(i, 1);
  cv.carpetas.splice(Math.max(0, Math.min(nuevaPos, cv.carpetas.length)), 0, c);
  marcarCambio();
}

function guardarNombre() {
  const inp = $('renombrar');
  const c = cv.carpetas.find(x => x.id === cv.editando);
  cv.editando = null;
  if (inp && c) {
    const nuevo = limpiarNombre(inp.value) || c.nombre;
    if (nuevo !== c.nombre) { c.nombre = nuevo; marcarCambio(); }
  }
  pintarCarpetas();
}

function plegar(id) {
  if (id === '') cv.sinCarpetaAbierta = !cv.sinCarpetaAbierta;
  else if (cv.cerradas.has(id)) cv.cerradas.delete(id);
  else cv.cerradas.add(id);
  pintarCarpetas();
}

// ---- Events ----

const elegirChip = (grupo, clave) => $(grupo).addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  cv[clave] = b.dataset[clave];
  $(grupo).querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === b));
  pintarCarpetas();
});
elegirChip('c-tipos', 'tipo');
elegirChip('c-modo', 'modo');
$('c-buscar').addEventListener('input', e => { cv.texto = e.target.value; pintarCarpetas(); });

$('c-estado').addEventListener('click', e => {
  if (e.target.id !== 'c-reintentar') return;
  if (claveEscritura()) guardarCarpetas(); else abrirClaveEscritura();
});

$('arbol').addEventListener('click', e => {
  if (!esDueno()) {
    const cab = e.target.closest('.chead');
    if (cab) plegar(cab.closest('.carpeta').dataset.carpeta);
    return;
  }
  if (e.target.id === 'nueva') {
    const c = {
      id: 'f' + Date.now().toString(36),
      nombre: 'new-folder',
      color: PALETA.find(p => !cv.carpetas.some(x => x.color === p)) || PALETA[0],
      repos: []
    };
    cv.carpetas.push(c);
    cv.editando = c.id;
    marcarCambio();
    pintarCarpetas();
    return;
  }
  const destino = e.target.closest('[data-mover]');
  if (destino) {
    moverRepo(cv.moverDe, destino.dataset.mover);
    cv.moverDe = null;
    pintarCarpetas();
    return;
  }
  const asa = e.target.closest('.rrow .asa');
  if (asa) {
    const repo = asa.closest('.rrow').dataset.repo;
    cv.moverDe = cv.moverDe === repo ? null : repo;
    cv.colorDe = null;
    pintarCarpetas();
    return;
  }
  const sec = e.target.closest('.carpeta');
  if (!sec || sec.dataset.carpeta === undefined) return;
  const id = sec.dataset.carpeta;
  const c = cv.carpetas.find(x => x.id === id);
  const sw = e.target.closest('.psw');
  if (sw && c) { c.color = sw.dataset.color; cv.colorDe = null; marcarCambio(); pintarCarpetas(); return; }
  if (e.target.closest('.paleta')) return;
  const acc = e.target.closest('.acc');
  if (acc && c) {
    const pos = cv.carpetas.indexOf(c);
    if (acc.dataset.acc === 'subir') moverCarpeta(id, pos - 1);
    if (acc.dataset.acc === 'bajar') moverCarpeta(id, pos + 1);
    if (acc.dataset.acc === 'renombrar') cv.editando = id;
    if (acc.dataset.acc === 'color') { cv.colorDe = cv.colorDe === id ? null : id; cv.moverDe = null; }
    if (acc.dataset.acc === 'borrar') { cv.carpetas = cv.carpetas.filter(x => x.id !== id); marcarCambio(); }
    pintarCarpetas();
    return;
  }
  if (e.target.closest('input')) return;
  if (e.target.closest('.chead')) plegar(id);
});

$('arbol').addEventListener('keydown', e => {
  if (e.target.id !== 'renombrar') return;
  if (e.key === 'Enter') guardarNombre();
  if (e.key === 'Escape') { cv.editando = null; pintarCarpetas(); }
});
$('arbol').addEventListener('focusout', e => { if (e.target.id === 'renombrar' && cv.editando !== null) guardarNombre(); });

// Custom colour: preview while choosing, close the picker when done.
$('arbol').addEventListener('input', e => {
  if (e.target.type !== 'color') return;
  const sec = e.target.closest('.carpeta');
  const c = cv.carpetas.find(x => x.id === sec.dataset.carpeta);
  c.color = e.target.value;
  sec.querySelector('.chead .sw').style.background = c.color;
  marcarCambio();
});
$('arbol').addEventListener('change', e => {
  if (e.target.type === 'color') { cv.colorDe = null; pintarCarpetas(); }
});

// Clicking elsewhere or pressing Esc closes the colour picker and the move menu.
document.addEventListener('click', e => {
  if (cv.colorDe !== null && !e.target.closest('.paleta') && !e.target.closest('[data-acc="color"]')) { cv.colorDe = null; pintarCarpetas(); }
  if (cv.moverDe !== null && !e.target.closest('.mover') && !e.target.closest('.rrow .asa')) { cv.moverDe = null; pintarCarpetas(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && (cv.colorDe !== null || cv.moverDe !== null)) { cv.colorDe = cv.moverDe = null; pintarCarpetas(); }
});

// Drag and drop: a repo onto a folder (or /unsorted), or a folder above/below another to reorder.
const limpiarMarcas = () => document.querySelectorAll('.arrastrando, .drop, .antes, .despues')
  .forEach(x => x.classList.remove('arrastrando', 'drop', 'antes', 'despues'));

$('arbol').addEventListener('dragstart', e => {
  if (!esDueno()) return;
  const cab = e.target.closest('.chead[draggable="true"]');
  if (cab) {
    cv.carpetaArrastrada = cab.closest('.carpeta').dataset.carpeta;
    cab.closest('.carpeta').classList.add('arrastrando');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', cv.carpetaArrastrada);
    return;
  }
  const f = e.target.closest('.rrow');
  if (!f) return;
  cv.arrastrado = f.dataset.repo;
  f.classList.add('arrastrando');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', cv.arrastrado);
});
$('arbol').addEventListener('dragend', () => {
  cv.arrastrado = cv.carpetaArrastrada = null;
  limpiarMarcas();
});
$('arbol').addEventListener('dragover', e => {
  const sec = e.target.closest('.carpeta[data-carpeta]');
  if (!sec) return;
  if (cv.carpetaArrastrada) {
    e.preventDefault();
    document.querySelectorAll('.antes, .despues').forEach(x => x.classList.remove('antes', 'despues'));
    if (sec.dataset.carpeta === cv.carpetaArrastrada) return;
    if (sec.dataset.carpeta === '') { sec.classList.add('antes'); return; }
    const r = sec.getBoundingClientRect();
    sec.classList.add(e.clientY < r.top + r.height / 2 ? 'antes' : 'despues');
    return;
  }
  if (!cv.arrastrado) return;
  e.preventDefault();
  document.querySelectorAll('.drop').forEach(x => { if (x !== sec) x.classList.remove('drop'); });
  sec.classList.add('drop');
});
$('arbol').addEventListener('drop', e => {
  const sec = e.target.closest('.carpeta[data-carpeta]');
  if (!sec) return;
  e.preventDefault();
  if (cv.carpetaArrastrada) {
    const id = cv.carpetaArrastrada;
    const destino = sec.dataset.carpeta;
    if (destino !== id) {
      const sinElla = cv.carpetas.filter(c => c.id !== id);
      let pos = destino === '' ? sinElla.length : sinElla.findIndex(c => c.id === destino);
      if (destino !== '' && sec.classList.contains('despues')) pos += 1;
      moverCarpeta(id, pos);
    }
  } else if (cv.arrastrado) {
    moverRepo(cv.arrastrado, sec.dataset.carpeta);
  }
  cv.arrastrado = cv.carpetaArrastrada = null;
  limpiarMarcas();
  pintarCarpetas();
});

addEventListener('beforeunload', e => {
  if (cv.estado === 'esperando' || cv.guardando) e.preventDefault();
});

// Write key dialog
$('w-guardar').addEventListener('click', async e => {
  e.preventDefault();
  const t = $('w-token').value.replace(/\s+/g, '');
  const err = $('w-err');
  err.classList.remove('ok');
  if (!t) { err.textContent = 'empty key'; return; }
  if (!/^(github_pat_|ghp_)/.test(t)) { err.textContent = 'this does not look like a GitHub key (it should start with github_pat_)'; return; }
  let r;
  try {
    r = await fetch(`https://api.github.com/repos/${REPO_SITIO}`, { headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json' } });
  } catch { err.textContent = 'network error, try again'; return; }
  if (r.status === 401) { err.textContent = 'GitHub rejects this key: it was deleted, regenerated, expired or copied incomplete'; return; }
  if (!r.ok) { err.textContent = `this key cannot see ${REPO_SITIO} (error ${r.status})`; return; }
  try { localStorage.setItem(CLAVE_ESCRITURA, t); } catch {}
  err.classList.add('ok');
  err.textContent = 'key ok · saving folders…';
  setTimeout(() => { if ($('d-escritura').open) $('d-escritura').close(); }, 800);
  guardarCarpetas();
});
$('w-borrar').addEventListener('click', () => {
  try { localStorage.removeItem(CLAVE_ESCRITURA); } catch {}
  $('d-escritura').close();
});
$('w-token').addEventListener('input', () => { $('w-err').textContent = ''; });
