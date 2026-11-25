const USUARIO = 'Lubbock247';
const CLAVE_TOKEN = 'lubbock-token';
const MAX_REPOS = 8;

const COLORES = {
  JavaScript: '#e8c547', TypeScript: '#3178c6', HTML: '#e06a4f', CSS: '#663399', SCSS: '#c6538c',
  'C#': '#8a6ad8', Java: '#c08a3a', Python: '#3572a5', PHP: '#4f5d95', Kotlin: '#a97bff',
  Shell: '#89e051', Lua: '#3e6fd8', 'C++': '#f34b7d', C: '#999', Vue: '#41b883', Dart: '#00b4ab'
};

const $ = id => document.getElementById(id);
const token = () => { try { return localStorage.getItem(CLAVE_TOKEN) || ''; } catch { return ''; } };

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

function reloj() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  $('reloj').textContent = `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function pintarPerfil(u) {
  $('avatar').src = u.avatar_url;
  if (u.name) {
    const partes = u.name.trim().split(/\s+/);
    const corto = partes.length > 2 ? partes.slice(0, 2) : partes;
    $('nombre').innerHTML = corto.map(esc).join('<br>');
    $('nombre').dataset.text = corto.join('\n');
  }
  $('n-seg').textContent = u.followers;
  $('n-repos').textContent = (u.public_repos || 0) + (u.total_private_repos || 0);
}

function pintarRepos(repos) {
  const lista = repos
    .filter(r => !r.archived && r.name.toLowerCase() !== (USUARIO + '.github.io').toLowerCase())
    .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))
    .slice(0, MAX_REPOS);

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

function pintarCeldas(dias) {
  const max = Math.max(1, ...dias.map(d => d.n));
  $('cells').innerHTML = dias.map(d => `<span title="${d.fecha}: ${d.n}" style="background:${nivel(d.n, max)}"></span>`).join('');
}

async function actividadCompleta() {
  const d = await graphql(`{ user(login:"${USUARIO}") { contributionsCollection { contributionCalendar {
    totalContributions weeks { contributionDays { date contributionCount } } } } } }`);
  const cal = d.user.contributionsCollection.contributionCalendar;
  $('n-commits').textContent = cal.totalContributions;
  $('act-titulo').textContent = '// ACTIVITY.LOG — 365D';
  pintarCeldas(cal.weeks.flatMap(w => w.contributionDays).map(x => ({ fecha: x.date, n: x.contributionCount })));
}

async function actividadPublica() {
  const eventos = await api(`/users/${USUARIO}/events/public?per_page=100`);
  const porDia = {};
  let commits = 0;
  eventos.forEach(e => {
    const f = e.created_at.slice(0, 10);
    const n = e.type === 'PushEvent' ? (e.payload.size || 1) : 1;
    if (e.type === 'PushEvent') commits += n;
    porDia[f] = (porDia[f] || 0) + n;
  });
  const dias = [];
  const hoy = new Date();
  const inicio = new Date(hoy);
  inicio.setDate(hoy.getDate() - 7 * 13 + 1 - hoy.getDay());
  for (let d = new Date(inicio); d <= hoy; d.setDate(d.getDate() + 1)) {
    const f = d.toISOString().slice(0, 10);
    dias.push({ fecha: f, n: porDia[f] || 0 });
  }
  $('cells').style.gridTemplateColumns = 'repeat(13,1fr)';
  $('n-commits').textContent = commits;
  $('act-titulo').textContent = '// ACTIVITY.LOG — 90D';
  pintarCeldas(dias);
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
  } catch (e) {
    $('estado').textContent = '● OFFLINE';
    $('repos').innerHTML = '<div class="row"><span class="r">!</span><span class="m">connection lost</span></div>';
    if (conToken && String(e.message) === '401') localStorage.removeItem(CLAVE_TOKEN);
    return;
  }
  try {
    if (conToken) await actividadCompleta(); else await actividadPublica();
  } catch {
    try { await actividadPublica(); } catch {}
  }
  api(`/users/${USUARIO}/orgs`).then(orgs => {
    if (orgs[0]) $('org-link').href = 'https://github.com/' + orgs[0].login;
  }).catch(() => {});
}

$('id-btn').addEventListener('click', () => {
  $('token').value = token();
  $('token-err').textContent = '';
  $('ajustes').showModal();
});

$('guardar').addEventListener('click', async e => {
  e.preventDefault();
  const t = $('token').value.trim();
  if (!t) { $('token-err').textContent = 'empty key'; return; }
  const r = await fetch('https://api.github.com/user', { headers: { Authorization: 'Bearer ' + t } });
  if (!r.ok) { $('token-err').textContent = 'invalid key'; return; }
  localStorage.setItem(CLAVE_TOKEN, t);
  $('ajustes').close();
  cargar();
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
