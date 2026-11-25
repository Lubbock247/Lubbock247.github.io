// ---- Projects page (#projects) ----
// GitHub Projects (boards of issues, pull requests and notes) that belong to the account.
// GitHub only lets classic keys with read:project read a personal account's projects,
// so the owner adds a third key just for this. With it, the page shows every project
// and publishes data/projects.json with the PUBLIC ones only, which is what visitors see.
// In that file, cards that come from private repos are blanked out ("private item").
// #projects lists them; #projects/N opens one inside the site as a board or a table.
// Add ?demo to the address to see sample projects.

const CLAVE_PROYECTOS = 'lubbock-projects';
const RUTA_PROYECTOS = 'data/projects.json';
const DEMO = new URLSearchParams(location.search).has('demo');

const pv = { lista: null, origen: '', cargadoCon: null, cargando: null, filtro: 'open', estado: '', mensaje: '', modo: 'tablero',
  anadiendo: null, dEstado: '' };

const claveProyectos = () => { try { return localStorage.getItem(CLAVE_PROYECTOS) || ''; } catch { return ''; } };
const estadoClaves = () => `${!!token()}|${claveProyectos()}`;

const hace2 = f => new Date(Date.now() - f).toISOString();
const YO = { login: 'Lubbock247', avatar: 'https://github.com/Lubbock247.png?size=40' };
const SITIO = 'Lubbock247.github.io';
const hacerTarea = (status, tipo, titulo, extra = {}) => ({
  tipo, titulo, status, numero: null, url: '', repo: '', estado: '', asignados: [], etiquetas: [], privado: false, ...extra
});
const OPCIONES = ['Todo', 'In Progress', 'Done'];
const PROYECTOS_DEMO = [
  { number: 3, title: 'Portfolio site roadmap', description: 'Ideas, fixes and new pages for this site', public: true, closed: false,
    updatedAt: hace2(2 * 3600e3), url: 'https://github.com/Lubbock247?tab=projects', opciones: OPCIONES, tareas: [
      hacerTarea('Todo', 'DRAFT', 'Banner image for the profile'),
      hacerTarea('Todo', 'ISSUE', 'Mobile menu overlaps the tabs', { numero: 14, repo: SITIO, estado: 'OPEN', etiquetas: ['bug'] }),
      hacerTarea('Todo', 'DRAFT', 'Packages page'),
      hacerTarea('Todo', 'ISSUE', 'Show recent commits on the overview', { numero: 15, repo: SITIO, estado: 'OPEN', etiquetas: ['idea'] }),
      hacerTarea('Todo', 'PRIVADO', ''),
      hacerTarea('Todo', 'DRAFT', 'Light theme, maybe'),
      hacerTarea('In Progress', 'ISSUE', 'Projects interior view', { numero: 12, repo: SITIO, estado: 'OPEN', etiquetas: ['feature'], asignados: [YO] }),
      hacerTarea('In Progress', 'PR', 'Board and table views for projects', { numero: 13, repo: SITIO, estado: 'OPEN', asignados: [YO] }),
      hacerTarea('In Progress', 'DRAFT', 'Write the README'),
      hacerTarea('Done', 'ISSUE', 'Publish the site on GitHub Pages', { numero: 1, repo: SITIO, estado: 'CLOSED', etiquetas: ['setup'] }),
      hacerTarea('Done', 'PR', 'Full-page layout', { numero: 4, repo: SITIO, estado: 'MERGED', asignados: [YO] }),
      hacerTarea('Done', 'ISSUE', 'Repositories page with folders', { numero: 7, repo: SITIO, estado: 'CLOSED', etiquetas: ['feature'] }),
      hacerTarea('Done', 'DRAFT', 'Followers and following pages'),
      hacerTarea('Done', 'PR', 'Custom scrollbar', { numero: 10, repo: SITIO, estado: 'MERGED' })
    ] },
  { number: 2, title: 'Deck builder app', description: 'First release: accounts, decks, sharing with friends', public: false, closed: false,
    updatedAt: hace2(3 * 86400e3), url: 'https://github.com/Lubbock247?tab=projects', opciones: OPCIONES, tareas: [
      hacerTarea('Todo', 'DRAFT', 'Share a deck with a link'),
      hacerTarea('Todo', 'DRAFT', 'Import a list from text'),
      hacerTarea('In Progress', 'DRAFT', 'Card search with filters', { asignados: [YO] }),
      hacerTarea('In Progress', 'DRAFT', 'Deck statistics'),
      hacerTarea('Done', 'DRAFT', 'Accounts and login'),
      hacerTarea('Done', 'DRAFT', 'Create and edit decks'),
      hacerTarea('', 'DRAFT', 'Look at hosting options')
    ] },
  { number: 1, title: 'Game prototype', description: 'Vertical slice for the class showcase', public: true, closed: true,
    updatedAt: hace2(70 * 86400e3), url: 'https://github.com/Lubbock247?tab=projects', opciones: OPCIONES, tareas: [
      hacerTarea('Done', 'DRAFT', 'Player movement'),
      hacerTarea('Done', 'DRAFT', 'First level'),
      hacerTarea('Done', 'DRAFT', 'Enemies and damage'),
      hacerTarea('Done', 'DRAFT', 'Build for the showcase')
    ] }
].map(p => ({ ...p, items: p.tareas.length, estados: contarEstados(p.tareas) }));

// Each project with its Status column names and its first 100 cards.
const CONTENIDO = `title number url state repository { name isPrivate }
  assignees(first: 3) { nodes { login avatarUrl } } labels(first: 4) { nodes { name } }`;
const CONSULTA = `query { viewer { projectsV2(first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes {
  id number title shortDescription public closed updatedAt url
  field(name: "Status") { ... on ProjectV2SingleSelectField { id options { id name } } }
  items(first: 100) { totalCount nodes {
    id type
    fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
    content { ... on DraftIssue { id title body } ... on Issue { ${CONTENIDO} } ... on PullRequest { ${CONTENIDO} } }
  } }
} } } }`;

// Status names vary per project; group them into to do / in progress / done / no status.
function grupoEstado(nombre) {
  const n = (nombre || '').toLowerCase();
  if (!n) return 'none';
  if (/done|complete|closed|finish|shipped|hecho|terminad/.test(n)) return 'done';
  if (/progress|doing|review|testing|curso|haciendo/.test(n)) return 'doing';
  return 'todo';
}

function contarEstados(tareas) {
  const estados = { todo: 0, doing: 0, done: 0, none: 0 };
  tareas.forEach(x => { estados[grupoEstado(x.status)]++; });
  return estados;
}

// A card: a draft note, an issue or a pull request. Items GitHub hides from this key come back
// empty (or as REDACTED) and are kept only as "private item".
function resumirTarea(it) {
  const c = it.content || {};
  const status = (it.fieldValueByName && it.fieldValueByName.name) || '';
  const tipo = it.type === 'DRAFT_ISSUE' ? 'DRAFT' : it.type === 'PULL_REQUEST' ? 'PR' : it.type === 'ISSUE' ? 'ISSUE' : 'PRIVADO';
  // id / draftId / cuerpo are only used to edit from the owner's browser; they are never published.
  if (tipo === 'PRIVADO' || !c.title) return hacerTarea(status, 'PRIVADO', '', { id: it.id });
  return hacerTarea(status, tipo, c.title, {
    id: it.id, draftId: tipo === 'DRAFT' ? c.id : null, cuerpo: c.body || '',
    numero: c.number || null, url: c.url || '', repo: c.repository ? c.repository.name : '',
    estado: c.state || '', privado: !!(c.repository && c.repository.isPrivate),
    asignados: ((c.assignees || {}).nodes || []).map(a => ({ login: a.login, avatar: a.avatarUrl })),
    etiquetas: ((c.labels || {}).nodes || []).map(l => l.name)
  });
}

function resumirProyecto(p) {
  const tareas = p.items.nodes.filter(Boolean).map(resumirTarea);
  return {
    number: p.number, title: p.title, description: p.shortDescription || '', public: p.public, closed: p.closed,
    updatedAt: p.updatedAt, url: p.url, items: p.items.totalCount, estados: contarEstados(tareas),
    opciones: p.field && p.field.options ? p.field.options.map(o => o.name) : [], tareas,
    id: p.id, campoId: p.field ? p.field.id : null,
    opcionIds: Object.fromEntries(((p.field && p.field.options) || []).map(o => [o.name, o.id]))
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
const urlGitHub = u => /^https:\/\/github\.com\//.test(u) ? u : '';
const urlAvatar = u => /^https:\/\/(avatars\.githubusercontent\.com|github\.com)\//.test(u) ? u : '';
const recortar = (x, max) => String(x || '').slice(0, max);

function limpiarTarea(x) {
  const tipo = ['DRAFT', 'ISSUE', 'PR', 'PRIVADO'].includes(x.tipo) ? x.tipo : 'PRIVADO';
  if (tipo === 'PRIVADO') return hacerTarea(recortar(x.status, 60), 'PRIVADO', '');
  return hacerTarea(recortar(x.status, 60), tipo, recortar(x.titulo, 200), {
    numero: parseInt(x.numero, 10) || null, url: urlGitHub(x.url), repo: recortar(x.repo, 100),
    estado: ['OPEN', 'CLOSED', 'MERGED'].includes(x.estado) ? x.estado : '',
    asignados: (Array.isArray(x.asignados) ? x.asignados : []).slice(0, 3)
      .map(a => ({ login: recortar(a.login, 40), avatar: urlAvatar(a.avatar) })),
    etiquetas: (Array.isArray(x.etiquetas) ? x.etiquetas : []).slice(0, 4).map(e => recortar(e, 40))
  });
}

function limpiarProyecto(p) {
  const n = x => Math.max(0, parseInt(x, 10) || 0);
  const e = p.estados || {};
  return {
    number: n(p.number), title: String(p.title || 'untitled'), description: String(p.description || ''),
    public: true, closed: !!p.closed, updatedAt: String(p.updatedAt || ''),
    url: urlGitHub(p.url) || 'https://github.com/Lubbock247?tab=projects',
    items: n(p.items), estados: { todo: n(e.todo), doing: n(e.doing), done: n(e.done), none: n(e.none) },
    opciones: (Array.isArray(p.opciones) ? p.opciones : []).slice(0, 20).map(o => recortar(o, 60)),
    // Files published before the interior view existed have no cards.
    tareas: Array.isArray(p.tareas) ? p.tareas.slice(0, 100).map(limpiarTarea) : null
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
      updatedAt: p.updatedAt, url: p.url, items: p.items, estados: p.estados, opciones: p.opciones,
      tareas: p.tareas.map(x => (x.privado || x.tipo === 'PRIVADO')
        ? { tipo: 'PRIVADO', status: x.status }
        : { tipo: x.tipo, titulo: x.titulo, numero: x.numero, url: x.url, repo: x.repo, estado: x.estado,
            status: x.status, asignados: x.asignados, etiquetas: x.etiquetas })
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
    <a class="proy${p.closed ? ' cerrado' : ''}" href="#projects/${p.number}">
      <div class="ptop">
        <span class="m">#${p.number}</span>
        <span class="ptitulo">${esc(p.title)}</span>
        ${p.public ? '' : '<span class="lock">PRIVATE</span>'}${p.closed ? '<span class="fork">CLOSED</span>' : ''}
        <span class="pir">→</span>
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
  const ruta = location.hash.match(/^#projects(?:\/(\d+))?$/);
  if (!ruta) return;
  const numero = ruta[1] ? +ruta[1] : null;
  $('p-demo').hidden = !DEMO;
  $('p-indice').hidden = numero !== null;
  $('p-detalle').hidden = numero === null;
  $('p-prompt').textContent = numero === null ? 'gh project list --owner lubbock247' : `gh project view ${numero} --owner lubbock247`;
  if (numero !== null) { pintarDetalle(numero); return; }
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

// ---- Interior view (#projects/N) ----

const NOMBRE_TIPO = { DRAFT: 'DRAFT', ISSUE: 'ISSUE', PR: 'PR' };

function etiquetaTipo(x) {
  if (x.tipo === 'DRAFT') return '<span class="ttipo">DRAFT</span>';
  const clase = x.estado === 'MERGED' ? 'r' : x.estado === 'OPEN' ? 'c' : 'm';
  const estado = x.estado ? ` · ${x.estado}` : '';
  return `<span class="ttipo ${clase}">${NOMBRE_TIPO[x.tipo]}${x.numero ? ' #' + x.numero : ''}${estado}</span>`;
}

function avatares(x) {
  return x.asignados.filter(a => a.avatar).map(a =>
    `<img class="tav" src="${esc(a.avatar)}" alt="${esc(a.login)}" title="${esc(a.login)}" loading="lazy">`).join('');
}

// The board can be edited by the owner, with the projects key, on live data (not the demo).
const tableroEditable = p => esDueno() && pv.origen === 'vivo' && !DEMO && !!p.id && typeof abrirTarea === 'function';

function tarjetaTarea(x, editable) {
  const datos = editable ? ` data-i="${x.i}" draggable="true"` : '';
  if (x.tipo === 'PRIVADO') return `<div class="tarea oculta${editable ? ' editable' : ''}"${datos}><span class="m">▒▒▒▒ private item</span></div>`;
  const etiquetas = x.etiquetas.length ? `<div class="tetis">${x.etiquetas.map(e => `<span>${esc(e)}</span>`).join('')}</div>` : '';
  const dentro = `
      <div class="ttitulo">${esc(x.titulo)}</div>
      <div class="tmeta m">${etiquetaTipo(x)}${x.repo ? `<span class="trepo">${esc(x.repo)}</span>` : ''}</div>
      ${etiquetas || x.asignados.length ? `<div class="tpie">${etiquetas}<span class="tavs">${avatares(x)}</span></div>` : ''}`;
  if (editable) return `<div class="tarea editable${x.pendiente ? ' pendiente' : ''}"${datos} tabindex="0">${dentro}</div>`;
  return x.url
    ? `<a class="tarea" href="${esc(x.url)}" target="_blank" rel="noopener">${dentro}</a>`
    : `<div class="tarea">${dentro}</div>`;
}

// Columns follow the project's own Status options, plus "No status" when some card has none.
function columnas(p) {
  const nombres = [...p.opciones];
  p.tareas.forEach(x => { if (x.status && !nombres.includes(x.status)) nombres.push(x.status); });
  const cols = nombres.map(n => ({ nombre: n, tareas: p.tareas.filter(x => x.status === n) }));
  const sin = p.tareas.filter(x => !x.status);
  if (sin.length) cols.push({ nombre: '', tareas: sin });
  return cols;
}

function pintarDetalle(numero) {
  const caja = $('p-detalle');
  if (!pv.lista) { caja.innerHTML = '<div class="vacio m">loading…</div>'; return; }
  const p = pv.lista.find(x => x.number === numero);
  if (!p) {
    caja.innerHTML = `<div class="dbarra"><a class="chip" href="#projects">← PROJECTS</a></div>
      <div class="vacio m">// project #${numero} not found${esDueno() ? '' : ' (or it is private)'}</div>`;
    return;
  }
  const e = p.estados;
  const total = Math.max(1, e.todo + e.doing + e.done + e.none);
  const seg = (k, n) => n ? `<i class="s-${k}" style="width:${n / total * 100}%"></i>` : '';
  const editable = tableroEditable(p);
  if (p.tareas) p.tareas.forEach((x, i) => { x.i = i; });
  let cuerpo;
  if (!p.tareas) cuerpo = '<div class="vacio m">// the cards of this project are not published yet</div>';
  else if (!p.tareas.length && !editable) cuerpo = '<div class="vacio m">// empty board</div>';
  else if (pv.modo === 'tabla') {
    const filas = p.tareas.map(x => x.tipo === 'PRIVADO'
      ? `<div class="trow oculta${editable ? ' editable' : ''}"${editable ? ` data-i="${x.i}"` : ''}><span class="tstatus"><i class="s-${grupoEstado(x.status)}"></i>${esc(x.status || 'No status')}</span><span class="m">▒▒▒▒ private item</span><span></span><span class="hide-sm"></span><span class="hide-sm"></span></div>`
      : editable
        ? `<div class="trow editable" data-i="${x.i}" tabindex="0">
          <span class="tstatus"><i class="s-${grupoEstado(x.status)}"></i>${esc(x.status || 'No status')}</span>
          <span class="ttitulo">${esc(x.titulo)}</span>
          <span>${etiquetaTipo(x)}</span>
          <span class="hide-sm m">${esc(x.repo)}</span>
          <span class="hide-sm tavs">${avatares(x)}</span>
        </div>`
      : `<${x.url ? `a href="${esc(x.url)}" target="_blank" rel="noopener"` : 'div'} class="trow">
          <span class="tstatus"><i class="s-${grupoEstado(x.status)}"></i>${esc(x.status || 'No status')}</span>
          <span class="ttitulo">${esc(x.titulo)}</span>
          <span>${etiquetaTipo(x)}</span>
          <span class="hide-sm m">${esc(x.repo)}</span>
          <span class="hide-sm tavs">${avatares(x)}</span>
        </${x.url ? 'a' : 'div'}>`).join('');
    cuerpo = `<div class="ttabla"><div class="trow cab m"><span>STATUS</span><span>TITLE</span><span>TYPE</span><span class="hide-sm">REPO</span><span class="hide-sm">WHO</span></div>${filas}</div>
      ${editable ? '<button type="button" class="anadir anadir-tabla" data-anadir="">+ ADD ITEM</button>' : ''}`;
  } else {
    const cols = columnas(p);
    // An editable board always shows its columns, even with no cards yet.
    if (!cols.length && editable) cols.push({ nombre: '', tareas: [] });
    cuerpo = `<div class="tablero${editable ? ' editable' : ''}">${cols.map(col => `
      <section class="columna" data-col="${esc(col.nombre)}">
        <div class="ccab"><i class="s-${grupoEstado(col.nombre)}"></i><span>${esc((col.nombre || 'No status').toUpperCase())}</span><span class="ccount">${col.tareas.length}</span></div>
        <div class="ctareas">${col.tareas.length ? col.tareas.map(x => tarjetaTarea(x, editable)).join('') : '<div class="vacia-c m">// empty</div>'}</div>
        ${editable ? (pv.anadiendo === col.nombre
          ? `<div class="anadir-caja"><input id="d-nueva" maxlength="256" placeholder="title, then Enter" autocomplete="off"></div>`
          : `<button type="button" class="anadir" data-anadir="${esc(col.nombre)}">+ ADD ITEM</button>`) : ''}
      </section>`).join('')}</div>`;
  }
  caja.innerHTML = `
    <div class="dbarra">
      <a class="chip" href="#projects">← PROJECTS</a>
      <div class="grupo" id="d-modo">
        <button type="button" class="chip${pv.modo === 'tablero' ? ' on' : ''}" data-modo="tablero">▥ BOARD</button>
        <button type="button" class="chip${pv.modo === 'tabla' ? ' on' : ''}" data-modo="tabla">≡ TABLE</button>
      </div>
      <a class="chip dgit" href="${esc(p.url)}" target="_blank" rel="noopener">OPEN ON GITHUB ↗</a>
    </div>
    <div class="dcab">
      <div class="ptop"><span class="m">#${p.number}</span><h2 class="dtitulo">${esc(p.title)}</h2>
        ${p.public ? '' : '<span class="lock">PRIVATE</span>'}${p.closed ? '<span class="fork">CLOSED</span>' : ''}</div>
      ${p.description ? `<div class="pdesc m">${esc(p.description)}</div>` : ''}
      ${p.items ? `<div class="dprog"><div class="pbar">${seg('done', e.done)}${seg('doing', e.doing)}${seg('todo', e.todo)}${seg('none', e.none)}</div>
        <span class="m"><span class="c">${e.done}</span> / ${p.items} DONE</span></div>` : ''}
      ${p.items > 100 ? '<div class="m nota">// showing the first 100 cards</div>' : ''}
    </div>
    ${editable && pv.dEstado ? `<div class="resumen m"><span class="c-estado">${pv.dEstado}</span></div>` : ''}
    ${cuerpo}`;
  const nueva = $('d-nueva');
  if (nueva) nueva.focus();
}

$('p-detalle').addEventListener('click', e => {
  const b = e.target.closest('[data-modo]');
  if (!b) return;
  pv.modo = b.dataset.modo;
  pintarProyectos();
});

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
    err.textContent = x.message === 'permiso' ? 'this key cannot reach projects: tick project (or read:project) when creating it'
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
