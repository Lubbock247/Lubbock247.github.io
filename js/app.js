const USUARIO = 'Lubbock247';
const CLAVE_TOKEN = 'lubbock-token';
const MAX_REPOS = 50;

const COLORES = {
  JavaScript: '#e8c547', TypeScript: '#3178c6', HTML: '#e06a4f', CSS: '#663399', SCSS: '#c6538c',
  'C#': '#8a6ad8', Java: '#c08a3a', Python: '#3572a5', PHP: '#4f5d95', Kotlin: '#a97bff',
  Shell: '#89e051', Lua: '#3e6fd8', 'C++': '#f34b7d', C: '#999', Vue: '#41b883', Dart: '#00b4ab'
};

const MESES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const $ = id => document.getElementById(id);
const token = () => { try { return localStorage.getItem(CLAVE_TOKEN) || ''; } catch { return ''; } };
const p2 = n => String(n).padStart(2, '0');

async function api(ruta) {
  const h = { Accept: 'application/vnd.github+json' };
  if (token()) h.Authorization = 'Bearer ' + token();
  const r = await fetch('https://api.github.com' + ruta, { headers: h });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

async function graphql(query) {
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  if (!r.ok) throw new Error(r.status);
  const j = await r.json();
  if (j.errors) throw new Error(j.errors[0].message);
  return j.data;
}

function hace(fecha) {
  const s = (Date.now() - new Date(fecha)) / 1000;
  const t = [[31536000, 'y'], [2592000, 'mo'], [604800, 'w'], [86400, 'd'], [3600, 'h'], [60, 'm']];
  for (const [seg, u] of t) if (s >= seg) return Math.floor(s / seg) + u;
  return 'now';
}

function esc(t) {
  return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Dates as local YYYY-MM-DD, so a day never shifts because of the time zone.
const fechaLocal = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const aFecha = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

function reloj() {
  const d = new Date();
  $('reloj').textContent = `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

function pintarPerfil(u) {
  $('avatar').src = u.avatar_url;
  if (u.name) {
    const partes = u.name.trim().split(/\s+/);
    const corto = partes.length > 2 ? partes.slice(0, 2) : partes;
    $('nombre').innerHTML = corto.map(esc).join('<br>');
    $('nombre').dataset.text = corto.join('\n');
  }
  $('avatar-mini').src = u.avatar_url;
  $('perfil').href = u.html_url;
  $('n-sig').textContent = $('t-sig').textContent = u.following;
  $('n-seg').textContent = $('t-seg').textContent = u.followers;
}

function pintarRepos(repos) {
  // The count only includes the repos the list can show (not this site's own repo, not archived ones).
  const visibles = repos
    .filter(r => !r.archived && r.name.toLowerCase() !== (USUARIO + '.github.io').toLowerCase())
    .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at));
  const lista = visibles.slice(0, MAX_REPOS);
  $('n-repos').textContent = visibles.length;
  $('t-repos').textContent = visibles.length;

  $('repos').innerHTML = lista.map(r => `
    <a class="row" href="${esc(r.html_url)}">
      <span class="r">▸</span>
      <span class="nm">${esc(r.name)}${r.private ? '<span class="lock">PRIVATE</span>' : ''}${r.fork ? '<span class="fork">fork</span>' : ''}</span>
      <span>${r.language ? `<i class="dot" style="background:${COLORES[r.language] || '#888'}"></i>${esc(r.language)}` : '<span class="m">—</span>'}</span>
      <span class="hide-sm">${r.stargazers_count}</span>
      <span class="m">${hace(r.pushed_at)}</span>
    </a>`).join('');

  const cuenta = {};
  repos.forEach(r => { if (r.language) cuenta[r.language] = (cuenta[r.language] || 0) + 1; });
  const total = Object.values(cuenta).reduce((a, b) => a + b, 0) || 1;
  const top = Object.entries(cuenta).sort((a, b) => b[1] - a[1]).slice(0, 4);

  $('stack').textContent = top.slice(0, 3).map(([l]) => l === 'JavaScript' ? 'JS' : l).join(' · ') || '—';
  $('langs').innerHTML = top.map(([l, n], i) => `
    ${esc(l)} <span class="m">${Math.round(n / total * 100)}%</span>
    <div class="bar${i % 2 ? ' alt' : ''}"><i style="width:${Math.round(n / total * 100)}%"></i></div>`).join('');
}

function nivel(n, max) {
  if (!n) return '#1e1210';
  const f = n / max;
  return f > .75 ? '#3ee6d8' : f > .5 ? '#ff5a3c' : f > .25 ? '#b0402c' : '#5a1f15';
}

// Calendar data and title, kept so it can be redrawn when its width changes.
let calDias = [];
let calTitulo = '';
let calAncho = 0;

// The calendar fills the width of its area; the row height follows the column width, within limits.
function ajustarCal() {
  const cal = $('cal');
  const cols = +cal.dataset.cols || 13;
  const ancho = (cal.clientWidth - 4 - 3 * (cols - 1)) / cols;
  cal.style.setProperty('--alto', Math.round(Math.max(10, Math.min(ancho, 28))) + 'px');
}

function pintarCeldas(dias, titulo) {
  calDias = dias;
  calTitulo = titulo;
  calAncho = $('cal').clientWidth;
  dibujarCal();
}

// Never scrolls: if the whole range does not fit with cells of at least 10px, it shows the latest weeks that do.
function dibujarCal() {
  let dias = calDias;
  if (!dias.length) return;
  const caben = Math.max(4, Math.floor(($('cal').clientWidth - 4 + 3) / 13));
  const hueco0 = aFecha(dias[0].fecha).getDay();
  const semanas = Math.ceil((dias.length + hueco0) / 7);
  if (semanas > caben) dias = dias.slice((semanas - caben) * 7 - hueco0);
  $('act-titulo').textContent = semanas > caben
    ? `// ACTIVITY.LOG — ${Math.round(dias.length / 30.4)}MO`
    : calTitulo;

  const max = Math.max(1, ...dias.map(d => d.n));
  const hueco = aFecha(dias[0].fecha).getDay();
  const celdas = Array(hueco).fill('<span class="vacia"></span>');
  dias.forEach(d => celdas.push(`<span data-n="${d.n}" data-fecha="${d.fecha}" style="background:${nivel(d.n, max)}"></span>`));
  $('cells').innerHTML = celdas.join('');

  const cols = Math.ceil(celdas.length / 7);
  $('cal').dataset.cols = cols;
  $('cal').style.setProperty('--cols', cols);
  ajustarCal();

  const etiquetas = Array(cols).fill('');
  const marcas = [];
  dias.forEach((d, i) => {
    const f = aFecha(d.fecha);
    if (f.getDate() === 1) marcas.push([Math.floor((i + hueco) / 7), f.getMonth()]);
  });
  if (dias.length && (!marcas.length || marcas[0][0] >= 3)) marcas.unshift([0, aFecha(dias[0].fecha).getMonth()]);
  marcas.forEach(([col, mes]) => { etiquetas[col] = MESES[mes].slice(0, 3).toUpperCase(); });
  $('meses').innerHTML = etiquetas.map(t => `<span>${t}</span>`).join('');
}

function textoDia(n, fecha) {
  const f = aFecha(fecha);
  const d = f.getDate();
  const suf = (d % 10 === 1 && d !== 11) ? 'st' : (d % 10 === 2 && d !== 12) ? 'nd' : (d % 10 === 3 && d !== 13) ? 'rd' : 'th';
  const cuantas = n ? `${n} contribution${n === 1 ? '' : 's'}` : 'No contributions';
  return `${cuantas} on ${MESES[f.getMonth()]} ${d}${suf}.`;
}

function mostrarTip(celda) {
  const tip = $('tip');
  tip.textContent = textoDia(+celda.dataset.n, celda.dataset.fecha);
  tip.hidden = false;
  const r = celda.getBoundingClientRect();
  const centro = r.left + r.width / 2;
  const w = tip.offsetWidth;
  const x = Math.min(Math.max(centro, w / 2 + 8), innerWidth - w / 2 - 8);
  tip.style.left = x + 'px';
  tip.style.top = r.top + 'px';
  tip.style.setProperty('--flecha', (centro - x + w / 2) + 'px');
}

const ocultarTip = () => { $('tip').hidden = true; };

function pintarCalendario(cal) {
  $('act-total').textContent = `${cal.totalContributions} CONTRIB · LAST YEAR`;
  pintarCeldas(cal.weeks.flatMap(w => w.contributionDays).map(x => ({ fecha: x.date, n: x.contributionCount })),
    '// ACTIVITY.LOG — 365D');
}

// With a key: the live calendar from the GraphQL API.
async function actividadCompleta() {
  const d = await graphql(`{ user(login:"${USUARIO}") { contributionsCollection { contributionCalendar {
    totalContributions weeks { contributionDays { date contributionCount } } } } } }`);
  pintarCalendario(d.user.contributionsCollection.contributionCalendar);
}

// Without a key: the same calendar, saved once a day by the GitHub Action in data/contrib.json.
async function actividadGuardada() {
  const r = await fetch('data/contrib.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error(r.status);
  const j = await r.json();
  pintarCalendario(j.data.user.contributionsCollection.contributionCalendar);
}

async function actividadPublica() {
  const eventos = await api(`/users/${USUARIO}/events/public?per_page=100`);
  const porDia = {};
  let total = 0;
  eventos.forEach(e => {
    const f = fechaLocal(new Date(e.created_at));
    const n = e.type === 'PushEvent' ? (e.payload.size || 1) : 1;
    porDia[f] = (porDia[f] || 0) + n;
  });
  const hoy = new Date();
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - hoy.getDay() - 7 * 12);
  const dias = [];
  for (let d = new Date(inicio); d <= hoy; d.setDate(d.getDate() + 1)) {
    const f = fechaLocal(d);
    total += porDia[f] || 0;
    dias.push({ fecha: f, n: porDia[f] || 0 });
  }
  $('act-total').textContent = `${total} CONTRIB · LAST 90D`;
  pintarCeldas(dias, '// ACTIVITY.LOG — 90D');
}

async function cargar() {
  const conToken = !!token();
  $('estado').textContent = conToken ? '● ROOT' : '● ONLINE';
  try {
    const u = await api(conToken ? '/user' : `/users/${USUARIO}`);
    pintarPerfil(u);
    const repos = conToken
      ? await api('/user/repos?per_page=100&affiliation=owner&sort=pushed')
      : await api(`/users/${USUARIO}/repos?per_page=100&sort=pushed`);
    pintarRepos(repos);
    // A token that only reaches public repos (the default when creating one) shows nothing private.
    if (conToken && !repos.some(r => r.private)) $('estado').textContent = '● ROOT · PUBLIC ONLY';
  } catch (e) {
    $('estado').textContent = '● OFFLINE';
    $('repos').innerHTML = '<div class="row"><span class="r">!</span><span class="m">connection lost</span></div>';
    if (conToken && String(e.message) === '401') localStorage.removeItem(CLAVE_TOKEN);
    return;
  }
  api(`/users/${USUARIO}/starred?per_page=100`).then(s => { $('t-stars').textContent = s.length; }).catch(() => {});
  try {
    if (conToken) await actividadCompleta(); else await actividadGuardada();
  } catch {
    try { await actividadGuardada(); } catch {
      try { await actividadPublica(); } catch {}
    }
  }
}

// ---- Followers / following view (#followers, #following) ----

const red = { listas: null, detalles: {} };

async function listasRed() {
  if (!red.listas) {
    const [followers, following] = await Promise.all([
      api(`/users/${USUARIO}/followers?per_page=100`),
      api(`/users/${USUARIO}/following?per_page=100`)
    ]);
    red.listas = { followers, following };
  }
  return red.listas;
}

function tarjeta(u, mutuo) {
  const d = red.detalles[u.login] || {};
  const etiquetas = (mutuo ? '<span class="lock">MUTUAL</span>' : '') + (u.type === 'Organization' ? '<span class="fork">ORG</span>' : '');
  const sub = [d.name, d.location].filter(Boolean).map(esc).join(' · ');
  const stats = d.login
    ? `<span class="c">${d.public_repos}</span> repo${d.public_repos === 1 ? '' : 's'}` +
      (d.followers != null ? ` · <span class="c">${d.followers}</span> follower${d.followers === 1 ? '' : 's'}` : '')
    : '';
  return `
    <a class="persona" href="${esc(u.html_url)}">
      <img class="pav" src="${esc(u.avatar_url)}&s=112" alt="" loading="lazy">
      <div class="pdatos">
        <div class="plogin">${esc(u.login)}${etiquetas}</div>
        ${sub ? `<div class="pnombre m">${sub}</div>` : ''}
        ${d.bio ? `<div class="pbio">${esc(d.bio)}</div>` : ''}
        ${stats ? `<div class="m">${stats}</div>` : ''}
      </div>
    </a>`;
}

async function pintarRed(tipo) {
  $('red-dir').textContent = tipo;
  $('gente').innerHTML = '<div class="vacio m">loading…</div>';
  let listas;
  try { listas = await listasRed(); } catch {
    $('gente').innerHTML = '<div class="vacio r">! connection lost</div>';
    return;
  }
  const otra = new Set(listas[tipo === 'followers' ? 'following' : 'followers'].map(u => u.login));
  const pintar = () => {
    if (location.hash.slice(1) !== tipo) return;
    const lista = listas[tipo];
    $('gente').innerHTML = lista.length
      ? lista.map(u => tarjeta(u, otra.has(u.login))).join('')
      : '<div class="vacio m">// empty</div>';
  };
  pintar();
  const faltan = listas[tipo].filter(u => !red.detalles[u.login]);
  if (faltan.length) {
    await Promise.all(faltan.map(u => api(`/users/${u.login}`).then(d => { red.detalles[u.login] = d; }).catch(() => {})));
    pintar();
  }
}

function vista() {
  const v = location.hash.slice(1);
  const enRed = v === 'followers' || v === 'following';
  $('vista-repos').hidden = enRed;
  $('vista-red').hidden = !enRed;
  document.querySelectorAll('[data-vista]').forEach(a => a.classList.toggle('on', a.dataset.vista === v));
  if (enRed) pintarRed(v);
}

addEventListener('hashchange', vista);

$('cells').addEventListener('pointerover', e => {
  const celda = e.target.closest('[data-n]');
  if (celda) mostrarTip(celda); else ocultarTip();
});
$('cells').addEventListener('pointerleave', ocultarTip);
addEventListener('scroll', ocultarTip, true);
addEventListener('resize', ocultarTip);
new ResizeObserver(() => {
  const ancho = $('cal').clientWidth;
  if (ancho === calAncho) return;
  calAncho = ancho;
  dibujarCal();
}).observe($('cal'));

$('id-btn').addEventListener('click', () => {
  // Always empty, so a new key is never pasted after the old one.
  $('token').value = '';
  $('token').placeholder = token() ? 'a key is saved · paste a new one to replace it' : 'github_pat_…';
  $('token-err').textContent = '';
  $('token-err').classList.remove('ok');
  $('ajustes').showModal();
});

$('guardar').addEventListener('click', async e => {
  e.preventDefault();
  const t = $('token').value.replace(/\s+/g, '');
  const err = $('token-err');
  err.classList.remove('ok');
  if (!t) { err.textContent = 'empty key'; return; }
  if (!/^(github_pat_|ghp_)/.test(t)) { err.textContent = 'this does not look like a GitHub key (it should start with github_pat_)'; return; }
  const h = { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json' };
  let r;
  try { r = await fetch('https://api.github.com/user', { headers: h }); } catch {
    err.textContent = 'network error, try again'; return;
  }
  if (r.status === 401) { err.textContent = 'GitHub rejects this key: it was deleted, regenerated, expired or copied incomplete'; return; }
  if (!r.ok) { err.textContent = `GitHub refused the key (error ${r.status}). Check that the resource owner is Lubbock247`; return; }
  localStorage.setItem(CLAVE_TOKEN, t);
  cargar();
  // Say what the key can see, so a key limited to public repos is obvious.
  let privados = 0;
  try {
    const repos = await (await fetch('https://api.github.com/user/repos?per_page=100&affiliation=owner', { headers: h })).json();
    privados = repos.filter(x => x.private).length;
  } catch {}
  if (privados) {
    err.classList.add('ok');
    err.textContent = `key ok · ${privados} private repos visible`;
    setTimeout(() => { if ($('ajustes').open) $('ajustes').close(); }, 1500);
  } else {
    err.classList.remove('ok');
    err.textContent = 'key saved, but it only sees public repos. On GitHub, edit the key: Repository access → All repositories, Contents → Read-only.';
  }
});

$('borrar').addEventListener('click', () => {
  localStorage.removeItem(CLAVE_TOKEN);
  $('ajustes').close();
  cargar();
});

$('token').addEventListener('input', () => { $('token-err').textContent = ''; });

reloj();
setInterval(reloj, 30000);
cargar();
vista();
