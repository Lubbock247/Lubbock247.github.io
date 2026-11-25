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
  // Every folder (and /unsorted) starts closed; only the ones opened in this visit are open.
  sinCarpetaAbierta: false, abiertas: new Set(),
  tipo: 'all', modo: 'carpetas', texto: '',
  editando: null, menuDe: null, colorDe: null, colorOriginal: null, hsv: { h: 0, s: 1, v: 1 },
  estrellas: null, estrellando: new Set(),
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
    // no-store: GitHub lets browsers keep this answer for 60 s, and an old copy breaks the next save.
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO_SITIO}/contents/${RUTA_CARPETAS}?ref=main`, {
        headers: { Authorization: 'Bearer ' + token(), Accept: 'application/vnd.github+json' },
        cache: 'no-store'
      });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
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
  cv.estrellas = null;
  if (esDueno()) cargarEstrellas();
  if (location.hash === '#repositories') abrirCarpetas();
}

// ---- Stars ----
// With the key, the star in each row stars or unstars the repo (the key needs Starring → Read and write).
// Visitors get a link to the repo on GitHub, where they can star it themselves.
const nombreCompleto = r => (r.full_name || `${USUARIO}/${r.name}`).toLowerCase();
const clavesEstrella = () => [token(), claveEscritura()].filter((k, i, a) => k && a.indexOf(k) === i);

async function cargarEstrellas() {
  for (const k of clavesEstrella()) {
    try {
      const r = await fetch('https://api.github.com/user/starred?per_page=100', {
        headers: { Authorization: 'Bearer ' + k, Accept: 'application/vnd.github+json' }, cache: 'no-store'
      });
      if (!r.ok) continue;
      cv.estrellas = new Set((await r.json()).map(x => x.full_name.toLowerCase()));
      pintarCarpetas();
      return;
    } catch {}
  }
}

async function alternarEstrella(nombre) {
  const r = reposLista.find(x => x.name === nombre);
  if (!r || cv.estrellando.has(nombre)) return;
  const completo = nombreCompleto(r);
  if (!cv.estrellas) cv.estrellas = new Set();
  const tenia = cv.estrellas.has(completo);
  // Show it straight away; undo if GitHub says no.
  const cambiar = poner => {
    if (poner) cv.estrellas.add(completo); else cv.estrellas.delete(completo);
    r.stargazers_count = Math.max(0, r.stargazers_count + (poner ? 1 : -1));
    const t = $('t-stars');
    if (/^\d+$/.test(t.textContent)) t.textContent = Math.max(0, +t.textContent + (poner ? 1 : -1));
  };
  cv.estrellando.add(nombre);
  cambiar(!tenia);
  pintarCarpetas();
  let hecho = false;
  let rechazada = false;
  for (const k of clavesEstrella()) {
    try {
      const res = await fetch(`https://api.github.com/user/starred/${completo}`, {
        method: tenia ? 'DELETE' : 'PUT',
        headers: { Authorization: 'Bearer ' + k, Accept: 'application/vnd.github+json' }
      });
      if (res.ok) { hecho = true; break; }
      if (res.status === 401) rechazada = true;
    } catch {}
  }
  cv.estrellando.delete(nombre);
  if (!hecho) {
    cambiar(tenia);
    cv.estado = 'aviso';
    cv.mensaje = rechazada ? '! KEY REJECTED' : '! YOUR KEY NEEDS STARRING → READ AND WRITE';
  }
  pintarCarpetas();
}

const carpetaDe = nombre => cv.carpetas.find(c => c.repos.includes(nombre));

function filtrados() {
  const t = cv.texto.toLowerCase();
  return reposLista
    .filter(r => cv.tipo === 'all' || (cv.tipo === 'private') === !!r.private)
    .filter(r => !t || [r.name, r.description, r.language].some(x => (x || '').toLowerCase().includes(t)));
}

function estrella(r, dueno) {
  if (!dueno) return `<a class="estrella" href="${esc(r.html_url)}" title="star it on GitHub">★ ${r.stargazers_count}</a>`;
  const on = !!cv.estrellas && cv.estrellas.has(nombreCompleto(r));
  return `<button type="button" class="estrella${on ? ' on' : ''}" data-star="${esc(r.name)}" title="${on ? 'unstar' : 'star'}"${cv.estrellando.has(r.name) ? ' disabled' : ''}>${on ? '★' : '☆'} ${r.stargazers_count}</button>`;
}

function fila(r, ultima, plano) {
  const c = carpetaDe(r.name);
  const dueno = esDueno();
  return `
    <div class="rrow" draggable="${dueno}" data-repo="${esc(r.name)}">
      <span class="rama">${plano ? '<span class="r">▸</span>' : (ultima ? '└─' : '├─')}</span>
      <div class="rnombre">
        <a href="${esc(r.html_url)}"${dueno ? ' draggable="false"' : ''}>${esc(r.name)}</a>${r.private ? '<span class="lock">PRIVATE</span>' : ''}${r.fork ? '<span class="fork">fork</span>' : ''}${plano && c ? `<span class="ftag"><i style="background:${c.color}"></i>/${esc(c.nombre)}</span>` : ''}
        ${r.description ? `<div class="rdesc">${esc(r.description)}</div>` : ''}
      </div>
      <span class="hide-sm">${r.language ? `<i class="dot" style="background:${COLORES[r.language] || '#888'}"></i>${esc(r.language)}` : '<span class="m">—</span>'}</span>
      <span class="hide-sm">${estrella(r, dueno)}</span>
      <span class="m">${hace(r.pushed_at)}</span>
    </div>`;
}

function bloque(c, lista) {
  const id = c ? c.id : '';
  const abierta = c ? cv.abiertas.has(c.id) : cv.sinCarpetaAbierta;
  const editando = c && cv.editando === id;
  const nombre = editando
    ? `<input id="renombrar" value="${esc(c.nombre)}" maxlength="24" aria-label="folder name">`
    : '/' + esc(c ? c.nombre : 'unsorted');
  const acciones = c ? `<span class="acciones">
      <button type="button" class="acc${cv.menuDe === id ? ' on' : ''}" data-acc="menu" aria-haspopup="menu" aria-expanded="${cv.menuDe === id}">EDIT ▾</button></span>` : '';
  const menu = c && cv.menuDe === id ? `<div class="menu-edit" role="menu">
      <button type="button" role="menuitem" data-acc="renombrar">RENAME</button>
      <button type="button" role="menuitem" data-acc="color">COLOR</button>
      <button type="button" role="menuitem" data-acc="borrar" class="r">DELETE</button>
    </div>` : '';
  const paleta = c && cv.colorDe === id ? `<div class="paleta">
      ${PALETA.map(p => `<button type="button" class="psw${p === c.color ? ' on' : ''}" data-color="${p}" style="background:${p}" title="${p}"></button>`).join('')}
      <div class="pcustom">
        <div class="tag">// CUSTOM</div>
        <div class="sv" style="--h:${Math.round(cv.hsv.h)}"><i class="sv-punto" style="left:${cv.hsv.s * 100}%;top:${(1 - cv.hsv.v) * 100}%"></i></div>
        <div class="hue"><i class="hue-punto" style="left:${cv.hsv.h / 3.6}%"></i></div>
        <label class="hexfila"><span class="pprev" style="background:${c.color}"></span><span class="m">#</span><input class="hex" value="${c.color.slice(1)}" maxlength="6" spellcheck="false" autocomplete="off" aria-label="hex colour"></label>
      </div>
      <div class="pbotones">
        <button type="button" class="fb on" data-acc="aplicar">UPDATE</button>
        <button type="button" class="fb" data-acc="cancelar">CANCEL</button>
      </div>
    </div>` : '';
  return `
    <section class="carpeta${abierta ? '' : ' cerrada'}" data-carpeta="${esc(id)}">
      <div class="chead"${c && esDueno() && !editando ? ' draggable="true"' : ''}>
        <span class="flecha">▾</span>
        <span class="sw" style="${c ? `background:${c.color}` : 'border:1px dashed #8a7671'}"></span>
        <span class="cnombre">${nombre}</span>
        <span class="ccount">${lista.length}</span>
        ${acciones}
      </div>
      ${menu}${paleta}
      <div class="crepos">
        ${lista.length ? lista.map((r, i) => fila(r, i === lista.length - 1, false)).join('')
          : `<div class="vacia-c">${esDueno() ? '// empty · drag repos here' : '// empty'}</div>`}
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
  if (cv.estado === 'aviso') { e.innerHTML = `<span class="r">${esc(cv.mensaje)}</span>`; return; }
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
  $('c-nuevo').hidden = !dueno;
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
    if (dentro.length || (dueno && !cv.texto && cv.tipo === 'all')) html.push(bloque(c, dentro));
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

// A short confirmation, then the status row goes away.
function ocultarConfirmacion() {
  setTimeout(() => { if (cv.estado === 'guardado' || cv.estado === 'local') { cv.estado = ''; pintarEstado(); } }, 4000);
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
  if (texto === cv.publicadoTexto) { cv.estado = 'local'; pintarEstado(); ocultarConfirmacion(); return; }

  // A separate write key if there is one; otherwise try the main key (it works if it has Contents → Read and write).
  const usandoPrincipal = !claveEscritura();
  const clave = claveEscritura() || token();
  if (!clave) return;
  cv.guardando = true;
  cv.estado = 'guardando';
  pintarEstado();
  const h = { Authorization: 'Bearer ' + clave, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' };
  const url = `https://api.github.com/repos/${REPO_SITIO}/contents/${RUTA_CARPETAS}`;
  const leerSha = async () => {
    const g = await fetch(url + '?ref=main', { headers: h, cache: 'no-store' });
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
    // The file changed since it was read (another tab, or a save still landing):
    // read it again and retry, waiting a little longer each time.
    for (let intento = 1; (r.status === 409 || r.status === 422) && intento <= 3; intento++) {
      await new Promise(ok => setTimeout(ok, 700 * intento));
      cv.sha = await leerSha();
      r = await subir(cv.sha);
    }
    if (r.status === 401) throw new Error('rechazada');
    if (r.status === 403 || r.status === 404) throw new Error('permiso');
    if (!r.ok) throw new Error(String(r.status));
    cv.sha = (await r.json()).content.sha;
    cv.publicadoTexto = texto;
    cv.estado = 'guardado';
    ocultarConfirmacion();
  } catch (e) {
    cv.sha = null;
    const m = e.message;
    if (m === 'rechazada') {
      if (!usandoPrincipal) { try { localStorage.removeItem(CLAVE_ESCRITURA); } catch {} }
      error(usandoPrincipal ? '! YOUR KEY WAS REJECTED' : '! WRITE KEY REJECTED');
    } else if (m === 'permiso') {
      error(usandoPrincipal
        ? '! NOT PUBLISHED · YOUR KEY CAN ONLY READ'
        : '! THE WRITE KEY CANNOT EDIT THIS REPO (CONTENTS → READ AND WRITE)');
      if (usandoPrincipal) abrirClaveEscritura();
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
  if (destino) destino.repos.push(repo);
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
  else if (cv.abiertas.has(id)) cv.abiertas.delete(id);
  else cv.abiertas.add(id);
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
  const est = e.target.closest('[data-star]');
  if (est) { alternarEstrella(est.dataset.star); return; }
  const sec = e.target.closest('.carpeta');
  if (!sec || sec.dataset.carpeta === undefined) return;
  const id = sec.dataset.carpeta;
  const c = cv.carpetas.find(x => x.id === id);
  const sw = e.target.closest('.psw');
  if (sw && c) { cv.hsv = hexAHsv(sw.dataset.color); aplicarColor(sec, false); return; }
  const acc = e.target.closest('[data-acc]');
  if (acc && c) {
    const que = acc.dataset.acc;
    if (que === 'menu') { cv.menuDe = cv.menuDe === id ? null : id; cerrarColor(); }
    if (que === 'renombrar') { cv.menuDe = null; cv.editando = id; }
    if (que === 'color') { cv.menuDe = null; cv.colorDe = id; cv.colorOriginal = c.color; cv.hsv = hexAHsv(c.color); }
    if (que === 'borrar') { cv.menuDe = null; cv.carpetas = cv.carpetas.filter(x => x.id !== id); marcarCambio(); }
    if (que === 'aplicar') {
      // The colour only counts once UPDATE is pressed.
      const cambiado = c.color !== cv.colorOriginal;
      cv.colorDe = cv.colorOriginal = null;
      if (cambiado) marcarCambio();
    }
    if (que === 'cancelar') cerrarColor();
    pintarCarpetas();
    return;
  }
  if (e.target.closest('.paleta, .menu-edit')) return;
  if (e.target.closest('input')) return;
  if (e.target.closest('.chead')) plegar(id);
});

$('arbol').addEventListener('keydown', e => {
  if (e.target.id !== 'renombrar') return;
  if (e.key === 'Enter') guardarNombre();
  if (e.key === 'Escape') { cv.editando = null; pintarCarpetas(); }
});
$('arbol').addEventListener('focusout', e => { if (e.target.id === 'renombrar' && cv.editando !== null) guardarNombre(); });

// Custom colour: a saturation/brightness square, a hue bar and a hex field, all live.
function hsvAHex({ h, s, v }) {
  const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return '#' + [f(5), f(3), f(1)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}
function hexAHsv(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}

// Puts the folder back to its colour if the picker is closed without UPDATE.
function cerrarColor() {
  if (cv.colorDe === null) return;
  const c = cv.carpetas.find(x => x.id === cv.colorDe);
  if (c && cv.colorOriginal) c.color = cv.colorOriginal;
  cv.colorDe = cv.colorOriginal = null;
}

// Previews the colour on the folder and the picker in place (no redraw, so dragging keeps working).
// Nothing is saved until UPDATE.
function aplicarColor(sec, desdeHex) {
  const c = cv.carpetas.find(x => x.id === sec.dataset.carpeta);
  if (!c) return;
  c.color = hsvAHex(cv.hsv);
  sec.querySelector('.chead .sw').style.background = c.color;
  sec.querySelector('.sv').style.setProperty('--h', Math.round(cv.hsv.h));
  Object.assign(sec.querySelector('.sv-punto').style, { left: cv.hsv.s * 100 + '%', top: (1 - cv.hsv.v) * 100 + '%' });
  sec.querySelector('.hue-punto').style.left = cv.hsv.h / 3.6 + '%';
  sec.querySelector('.pprev').style.background = c.color;
  if (!desdeHex) sec.querySelector('.hex').value = c.color.slice(1);
  sec.querySelectorAll('.psw').forEach(b => b.classList.toggle('on', b.dataset.color === c.color));
}

$('arbol').addEventListener('pointerdown', e => {
  const zona = e.target.closest('.sv, .hue');
  if (!zona) return;
  e.preventDefault();
  const sec = zona.closest('.carpeta');
  const mover = ev => {
    const r = zona.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
    if (zona.classList.contains('sv')) { cv.hsv.s = x; cv.hsv.v = 1 - y; } else cv.hsv.h = Math.min(x * 360, 359.9);
    aplicarColor(sec, false);
  };
  zona.setPointerCapture(e.pointerId);
  mover(e);
  zona.onpointermove = mover;
  zona.onpointerup = zona.onpointercancel = () => { zona.onpointermove = zona.onpointerup = zona.onpointercancel = null; };
});
$('arbol').addEventListener('input', e => {
  if (!e.target.classList.contains('hex')) return;
  const v = e.target.value.replace(/[^0-9a-f]/gi, '');
  if (v.length !== 6) return;
  cv.hsv = hexAHsv('#' + v.toLowerCase());
  aplicarColor(e.target.closest('.carpeta'), true);
});

// Clicking elsewhere or pressing Esc closes the EDIT menu, and the colour picker without applying it.
document.addEventListener('click', e => {
  let cambio = false;
  if (cv.menuDe !== null && !e.target.closest('.menu-edit, [data-acc="menu"]')) { cv.menuDe = null; cambio = true; }
  if (cv.colorDe !== null && !e.target.closest('.paleta, .menu-edit')) { cerrarColor(); cambio = true; }
  if (cambio) pintarCarpetas();
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || (cv.menuDe === null && cv.colorDe === null)) return;
  cv.menuDe = null;
  cerrarColor();
  pintarCarpetas();
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
  err.textContent = 'key ok · saving…';
  setTimeout(() => { if ($('d-escritura').open) $('d-escritura').close(); }, 800);
  // The write key is also used by the projects page (js/projects.js) to publish its public list.
  if (cv.carpetas) guardarCarpetas();
  if (typeof publicarProyectos === 'function') publicarProyectos();
});
$('w-borrar').addEventListener('click', () => {
  try { localStorage.removeItem(CLAVE_ESCRITURA); } catch {}
  $('d-escritura').close();
});
$('w-token').addEventListener('input', () => { $('w-err').textContent = ''; });
