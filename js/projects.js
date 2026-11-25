// ---- Projects page (#projects) ----
// GitHub Projects (boards of issues, pull requests and notes) that belong to the account.
// GitHub only lets classic keys with read:project read a personal account's projects,
// so the owner adds a third key just for this. With it, the page shows every project
// and publishes data/projects.json with the PUBLIC ones only (titles and counts, never items),
// which is what visitors see. Add ?demo to the address to see sample projects.

const CLAVE_PROYECTOS = 'lubbock-projects';
const RUTA_PROYECTOS = 'data/projects.json';
const DEMO = new URLSearchParams(location.search).has('demo');

const pv = { lista: null, origen: '', cargadoCon: null, cargando: null, filtro: 'open', estado: '', mensaje: '' };

const claveProyectos = () => { try { return localStorage.getItem(CLAVE_PROYECTOS) || ''; } catch { return ''; } };
const estadoClaves = () => `${!!token()}|${claveProyectos()}`;

const hace2 = f => { const d = new Date(Date.now() - f); return d.toISOString(); };
const PROYECTOS_DEMO = [
  { number: 3, title: 'Portfolio site roadmap', description: 'Ideas, fixes and new pages for this site', public: true, closed: false,
    updatedAt: hace2(2 * 3600e3), url: 'https://github.com/Lubbock247?tab=projects', items: 14, estados: { todo: 6, doing: 3, done: 5, none: 0 } },
  { number: 2, title: 'Deck builder app', description: 'First release: accounts, decks, sharing with friends', public: false, closed: false,
    updatedAt: hace2(3 * 86400e3), url: 'https://github.com/Lubbock247?tab=projects', items: 22, estados: { todo: 9, doing: 4, done: 7, none: 2 } },
  { number: 1, title: 'Game prototype', description: 'Vertical slice for the class showcase', public: true, closed: true,
    updatedAt: hace2(70 * 86400e3), url: 'https://github.com/Lubbock247?tab=projects', items: 9, estados: { todo: 0, doing: 0, done: 9, none: 0 } }
];

const CONSULTA = `query { viewer { projectsV2(first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes {
  number title shortDescription public closed updatedAt url
  items(first: 100) { totalCount nodes { fieldValueByName(name: "Status") {
    ... on ProjectV2ItemFieldSingleSelectValue { name } } } }
} } } }`;

// Status names vary per project; group them into to do / in progress / done / no status.
function grupoEstado(nombre) {
  const n = (nombre || '').toLowerCase();
  if (!n) return 'none';
  if (/done|complete|closed|finish|shipped|hecho|terminad/.test(n)) return 'done';
  if (/progress|doing|review|testing|curso|haciendo/.test(n)) return 'doing';
  return 'todo';
}

function resumirProyecto(p) {
  const estados = { todo: 0, doing: 0, done: 0, none: 0 };
  p.items.nodes.forEach(it => { estados[grupoEstado(it.fieldValueByName && it.fieldValueByName.name)]++; });
  return {
    number: p.number, title: p.title, description: p.shortDescription || '', public: p.public, closed: p.closed,
    updatedAt: p.updatedAt, url: p.url, items: p.items.totalCount, estados
  };
}

async function consultarProyectos(clave) {
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + clave, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: CONSULTA }),
    cache: 'no-store'
  });
  if (r.status === 401) throw new Error('rechazada');
  if (!r.ok) throw new Error(String(r.status));
  const j = await r.json();
  if (j.errors) throw new Error(j.errors.some(e => e.type === 'INSUFFICIENT_SCOPES' || /scope|not accessible/i.test(e.message)) ? 'permiso' : j.errors[0].message);
  return j.data.viewer.projectsV2.nodes.filter(Boolean).map(resumirProyecto);
}

// The public file is written by the owner's browser, but read it defensively anyway.
function limpiarProyecto(p) {
  const n = x => Math.max(0, parseInt(x, 10) || 0);
  const e = p.estados || {};
  return {
    number: n(p.number), title: String(p.title || 'untitled'), description: String(p.description || ''),
    public: true, closed: !!p.closed, updatedAt: String(p.updatedAt || ''),
    url: /^https:\/\/github\.com\//.test(p.url) ? p.url : 'https://github.com/Lubbock247?tab=projects',
    items: n(p.items), estados: { todo: n(e.todo), doing: n(e.doing), done: n(e.done), none: n(e.none) }
  };
}

async function cargarProyectos() {
  pv.cargadoCon = estadoClaves();
  pv.estado = '';
  if (DEMO) { pv.lista = PROYECTOS_DEMO; pv.origen = 'demo'; return; }
  if (esDueno() && claveProyectos()) {
    try {
      pv.lista = await consultarProyectos(claveProyectos());
      pv.origen = 'vivo';
      publicarProyectos();
      return;
    } catch (e) {
      pv.estado = 'aviso';
      pv.mensaje = e.message === 'permiso' ? '! THE PROJECTS KEY NEEDS read:project'
        : e.message === 'rechazada' ? '! PROJECTS KEY REJECTED' : '! COULD NOT READ PROJECTS · ' + e.message;
    }
  }
  let publico = [];
  try {
    const r = await fetch(RUTA_PROYECTOS, { cache: 'no-cache' });
    if (r.ok) publico = ((await r.json()).projects || []).map(limpiarProyecto);
  } catch {}
  pv.lista = publico;
  pv.origen = 'publico';
}

function asegurarProyectos() {
  if (pv.cargando || (pv.lista && pv.cargadoCon === estadoClaves())) return;
  pv.cargando = cargarProyectos().finally(() => { pv.cargando = null; pintarProyectos(); });
}

// Called by js/app.js when the page switches to #projects, and every time the repo list loads.
function abrirProyectos() {
  asegurarProyectos();
  pintarProyectos();
}
function alCargarProyectos() { asegurarProyectos(); }

// ---- Publishing the public list ----

async function publicarProyectos() {
  if (DEMO || pv.origen !== 'vivo') return;
  const texto = JSON.stringify({
    projects: pv.lista.filter(p => p.public).map(p => ({
      number: p.number, title: p.title, description: p.description, closed: p.closed,
      updatedAt: p.updatedAt, url: p.url, items: p.items, estados: p.estados
    }))
  }, null, 2) + '\n';
  const clave = claveEscritura() || token();
  const h = { Authorization: 'Bearer ' + clave, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' };
  const url = `https://api.github.com/repos/${REPO_SITIO}/contents/${RUTA_PROYECTOS}`;
  const leer = async () => {
    const g = await fetch(url + '?ref=main', { headers: h, cache: 'no-store' });
    if (g.ok) return g.json();
    if (g.status === 404) return null;
    throw new Error(g.status === 401 ? 'rechazada' : 'permiso');
  };
  const subir = sha => fetch(url, {
    method: 'PUT',
    headers: h,
    body: JSON.stringify({ message: 'Update public projects list', content: aBase64(texto), branch: 'main', ...(sha ? { sha } : {}) })
  });
  try {
    let actual = await leer();
    // Nothing public changed since the last visit: don't make a commit.
    if (actual && deBase64(actual.content) === texto) { pv.estado = 'aldia'; pintarEstadoProyectos(); return; }
    pv.estado = 'publicando';
    pintarEstadoProyectos();
    let r = await subir(actual && actual.sha);
    for (let i = 1; (r.status === 409 || r.status === 422) && i <= 3; i++) {
      await new Promise(ok => setTimeout(ok, 700 * i));
      actual = await leer();
      r = await subir(actual && actual.sha);
    }
    if (r.status === 401) throw new Error('rechazada');
    if (r.status === 403 || r.status === 404) throw new Error('permiso');
    if (!r.ok) throw new Error(String(r.status));
    pv.estado = 'publicado';
    // A short confirmation, then the row goes away.
    setTimeout(() => { if (pv.estado === 'publicado') { pv.estado = ''; pintarEstadoProyectos(); } }, 4000);
  } catch (e) {
    pv.estado = 'error';
    pv.mensaje = e.message === 'permiso' ? '! PUBLIC LIST NOT UPDATED · YOUR KEY CAN ONLY READ'
      : e.message === 'rechazada' ? '! PUBLIC LIST NOT UPDATED · KEY REJECTED' : '! PUBLIC LIST NOT UPDATED · ' + e.message;
  }
  pintarEstadoProyectos();
}

// ---- Drawing ----

function pintarEstadoProyectos() {
  const e = $('p-estado');
  if (DEMO || !esDueno()) { e.innerHTML = ''; return; }
  if (!claveProyectos()) {
    e.innerHTML = `<span class="m">PRIVATE PROJECTS NEED A PROJECTS KEY</span>
      <button type="button" class="chip on" id="p-anadir">ADD PROJECTS KEY</button>`;
    return;
  }
  const textos = {
    publicando: '<span class="c">UPDATING PUBLIC LIST…</span>',
    publicado: '<span class="c">✓ LIVE · PUBLIC LIST UPDATED FOR VISITORS</span>'
  };
  if (textos[pv.estado]) { e.innerHTML = textos[pv.estado]; return; }
  if (pv.estado === 'error') {
    e.innerHTML = `<span class="r">${esc(pv.mensaje)}</span>
      <button type="button" class="chip on" id="p-clave-escritura">ADD WRITE KEY</button>`;
    return;
  }
  if (pv.estado === 'aviso') {
    e.innerHTML = `<span class="r">${esc(pv.mensaje)}</span>
      <button type="button" class="chip on" id="p-anadir">CHANGE PROJECTS KEY</button>`;
    return;
  }
  e.innerHTML = '';
}

function tarjetaProyecto(p) {
  const e = p.estados;
  const total = Math.max(1, e.todo + e.doing + e.done + e.none);
  const seg = (k, n) => n ? `<i class="s-${k}" style="width:${n / total * 100}%" title="${n}"></i>` : '';
  const leyenda = [['todo', 'TO DO'], ['doing', 'IN PROGRESS'], ['done', 'DONE'], ['none', 'NO STATUS']]
    .filter(([k]) => e[k] || k !== 'none')
    .map(([k, t]) => `<span><i class="s-${k}"></i>${e[k]} ${t}</span>`).join('');
  const hecho = e.done / total;
  return `
    <a class="proy${p.closed ? ' cerrado' : ''}" href="${esc(p.url)}">
      <div class="ptop">
        <span class="m">#${p.number}</span>
        <span class="ptitulo">${esc(p.title)}</span>
        ${p.public ? '' : '<span class="lock">PRIVATE</span>'}${p.closed ? '<span class="fork">CLOSED</span>' : ''}
        <span class="pir">↗</span>
      </div>
      ${p.description ? `<div class="pdesc m">${esc(p.description)}</div>` : ''}
      ${p.items ? `
        <div class="pbar">${seg('done', e.done)}${seg('doing', e.doing)}${seg('todo', e.todo)}${seg('none', e.none)}</div>
        <div class="pley m">${leyenda}</div>` : '<div class="pley m">// empty board</div>'}
      <div class="pfoot m">
        <span><span class="c">${p.items}</span> ITEM${p.items === 1 ? '' : 'S'}${p.items ? ` · <span class="c">${Math.round(hecho * 100)}%</span> DONE` : ''}</span>
        <span>UPDATED ${p.updatedAt ? hace(p.updatedAt).toUpperCase() : '—'}</span>
      </div>
    </a>`;
}

function pintarProyectos() {
  const lista = pv.lista || [];
  const abiertos = lista.filter(p => !p.closed);
  $('t-proj').textContent = pv.lista ? abiertos.length || '' : '';
  if (location.hash !== '#projects') return;
  $('p-demo').hidden = !DEMO;
  $('p-nuevo').hidden = !esDueno() || DEMO;
  pintarEstadoProyectos();
  if (!pv.lista) { $('p-lista').innerHTML = '<div class="vacio m">loading…</div>'; return; }

  $('pk-open').textContent = abiertos.length;
  $('pk-closed').textContent = lista.length - abiertos.length;
  $('pk-all').textContent = lista.length;
  const vis = lista.filter(p => pv.filtro === 'all' || (pv.filtro === 'closed') === p.closed);

  if (vis.length) { $('p-lista').innerHTML = vis.map(tarjetaProyecto).join(''); return; }
  const vacio = !lista.length
    ? (esDueno() ? '// no projects yet' : '// no public projects yet')
    : `// no ${pv.filtro} projects`;
  $('p-lista').innerHTML = `<div class="vacio m">${vacio}</div>`;
}

// ---- Events ----

$('p-filtro').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  pv.filtro = b.dataset.filtro;
  $('p-filtro').querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === b));
  pintarProyectos();
});

$('p-estado').addEventListener('click', e => {
  if (e.target.id === 'p-anadir') abrirClaveProyectos();
  if (e.target.id === 'p-clave-escritura') abrirClaveEscritura();
});

function abrirClaveProyectos() {
  $('p-token').value = '';
  $('p-token').placeholder = claveProyectos() ? 'a key is saved · paste a new one to replace it' : 'ghp_…';
  $('p-err').textContent = '';
  $('p-err').classList.remove('ok');
  $('d-proyectos').showModal();
}

$('p-guardar').addEventListener('click', async e => {
  e.preventDefault();
  const t = $('p-token').value.replace(/\s+/g, '');
  const err = $('p-err');
  err.classList.remove('ok');
  if (!t) { err.textContent = 'empty key'; return; }
  if (!/^ghp_/.test(t)) {
    err.textContent = t.startsWith('github_pat_')
      ? 'that is a fine-grained key: projects need a classic one (it starts with ghp_)'
      : 'this does not look like a classic GitHub key (it should start with ghp_)';
    return;
  }
  let lista;
  try { lista = await consultarProyectos(t); } catch (x) {
    err.textContent = x.message === 'permiso' ? 'this key cannot read projects: tick read:project when creating it'
      : x.message === 'rechazada' ? 'GitHub rejects this key: it was deleted, expired or copied incomplete'
        : 'could not check the key · ' + x.message;
    return;
  }
  try { localStorage.setItem(CLAVE_PROYECTOS, t); } catch {}
  err.classList.add('ok');
  err.textContent = `key ok · ${lista.length} project${lista.length === 1 ? '' : 's'} found`;
  setTimeout(() => { if ($('d-proyectos').open) $('d-proyectos').close(); }, 1200);
  pv.lista = null;
  abrirProyectos();
});
$('p-borrar').addEventListener('click', () => {
  try { localStorage.removeItem(CLAVE_PROYECTOS); } catch {}
  $('d-proyectos').close();
  pv.lista = null;
  abrirProyectos();
});
$('p-token').addEventListener('input', () => { $('p-err').textContent = ''; });

// Demo links keep the demo; leaving it goes back to the real page.
if (DEMO) addEventListener('DOMContentLoaded', () => { if (!location.hash) location.hash = '#projects'; });
