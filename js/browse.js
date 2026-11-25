// ---- Repo browser (#repo/owner/name/path) ----
// Files, README and code of a repo, drawn in the site's own style. Visitors can open public
// repos; with the main key the owner can also open private ones (Contents read).

const navRepo = { info: {}, hl: null, texto: '' };

const LENGUAJES = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  cs: 'csharp', py: 'python', html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml', css: 'css', scss: 'scss',
  json: 'json', md: 'markdown', sh: 'bash', bash: 'bash', ps1: 'powershell', yml: 'yaml', yaml: 'yaml',
  java: 'java', kt: 'kotlin', lua: 'lua', cpp: 'cpp', hpp: 'cpp', c: 'c', h: 'c', php: 'php', sql: 'sql',
  ini: 'ini', toml: 'ini', cfg: 'ini', gradle: 'groovy', go: 'go', rs: 'rust', rb: 'ruby', swift: 'swift',
  dart: 'dart', vue: 'xml', gd: 'python', shader: 'cpp', hlsl: 'cpp', glsl: 'cpp', bat: 'dos', cmd: 'dos'
};
const IMAGENES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  ico: 'image/x-icon', bmp: 'image/bmp', svg: 'image/svg+xml' };

function rutaRepo() {
  const m = location.hash.match(/^#repo\/([^/]+)\/([^/]+)(?:\/(.*))?$/);
  if (!m) return null;
  const dec = s => { try { return decodeURIComponent(s); } catch { return s; } };
  return { dueno: dec(m[1]), nombre: dec(m[2]), ruta: (m[3] || '').split('/').filter(Boolean).map(dec).join('/') };
}

const trozos = ruta => ruta.split('/').filter(Boolean).map(encodeURIComponent).join('/');
const enlaceRepo = (completo, ruta = '') => '#repo/' + trozos(completo) + (ruta ? '/' + trozos(ruta) : '');

function unirRuta(base, rel) {
  const partes = base ? base.split('/') : [];
  for (const p of rel.split('/')) {
    if (p === '..') partes.pop(); else if (p && p !== '.') partes.push(p);
  }
  return partes.join('/');
}

function peso(n) {
  return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
}

// A key that cannot read the repo falls back to the public request.
async function pedirRepo(ruta, accept = 'application/vnd.github+json', tipo = 'json') {
  const h = { Accept: accept };
  if (token()) h.Authorization = 'Bearer ' + token();
  let r = await fetch('https://api.github.com' + ruta, { headers: h });
  if (!r.ok && h.Authorization && (r.status === 401 || r.status === 403)) {
    delete h.Authorization;
    r = await fetch('https://api.github.com' + ruta, { headers: h });
  }
  if (!r.ok) throw new Error(r.status);
  return tipo === 'json' ? r.json() : r.text();
}

async function infoRepo(completo) {
  const k = completo.toLowerCase();
  if (navRepo.info[k]) return navRepo.info[k];
  const propio = reposLista && reposLista.find(x => (x.full_name || '').toLowerCase() === k);
  return navRepo.info[k] = propio || await pedirRepo('/repos/' + trozos(completo));
}

function cargarHL() {
  return navRepo.hl ||= new Promise(ok => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js';
    s.onload = () => ok(window.hljs || null);
    s.onerror = () => { navRepo.hl = null; ok(null); };
    document.head.append(s);
  });
}

function decodificar(b64) {
  const bytes = Uint8Array.from(atob(b64.replace(/\s/g, '')), ch => ch.charCodeAt(0));
  const binario = bytes.subarray(0, 8000).includes(0);
  return { binario, texto: binario ? '' : new TextDecoder().decode(bytes) };
}

// Called by js/app.js when the page switches to #repo/...
async function abrirRepo() {
  const rr = rutaRepo();
  if (!rr) return;
  const clave = location.hash;
  const completo = rr.dueno + '/' + rr.nombre;
  const propio = rr.dueno.toLowerCase() === USUARIO.toLowerCase();
  pintarPromptRepo(rr, propio, null);
  $('rp-cab').innerHTML = '';
  $('rp-cuerpo').innerHTML = '<div class="vacio m">loading…</div>';
  scrollTo(0, 0);

  let info;
  try { info = await infoRepo(completo); } catch (e) {
    if (location.hash === clave) $('rp-cuerpo').innerHTML = errorRepo(e);
    return;
  }
  if (location.hash !== clave) return;
  pintarCabRepo(info, rr);

  let cont;
  try { cont = await pedirRepo(`/repos/${trozos(completo)}/contents/${trozos(rr.ruta)}`); } catch (e) {
    if (location.hash !== clave) return;
    $('rp-cuerpo').innerHTML = String(e.message) === '404' && !rr.ruta && !info.size
      ? '<div class="vacio m">// empty repository</div>' : errorRepo(e);
    return;
  }
  if (location.hash !== clave) return;
  const esCarpeta = Array.isArray(cont);
  pintarPromptRepo(rr, propio, esCarpeta);
  if (esCarpeta) pintarCarpetaRepo(info, rr, cont, clave); else pintarArchivoRepo(info, rr, cont, clave);
}

function errorRepo(e) {
  const s = String(e.message);
  if (s === '404') return '<div class="vacio m">// not found · it may be private</div>';
  if (s === '403' || s === '429') return '<div class="vacio r">! GITHUB RATE LIMIT · TRY AGAIN IN A WHILE</div>';
  return '<div class="vacio r">! connection lost</div>';
}

function pintarPromptRepo(rr, propio, esCarpeta) {
  const base = propio ? '<a href="#repositories">repos/</a>' : '<a href="#stars">stars/</a>' + esc(rr.dueno) + '/';
  const orden = esCarpeta === false ? 'cat' : 'cd';
  $('rp-prompt').innerHTML = `<a class="r" href="#">~/lubbock247 $</a> ${orden} ${base}${esc(rr.nombre)}${rr.ruta ? '/' + esc(rr.ruta) : ''}<span class="blink r">█</span>`;
}

function pintarCabRepo(info, rr) {
  const completo = info.full_name || rr.dueno + '/' + rr.nombre;
  const partes = rr.ruta ? rr.ruta.split('/') : [];
  const migas = [`<a href="${enlaceRepo(completo)}">${esc(info.name || rr.nombre)}</a>`]
    .concat(partes.map((p, i) => i === partes.length - 1
      ? `<span>${esc(p)}</span>`
      : `<a href="${enlaceRepo(completo, partes.slice(0, i + 1).join('/'))}">${esc(p)}</a>`));
  $('rp-cab').innerHTML = `
    <div class="rp-cab">
      <div class="rp-linea">
        <a class="rp-titulo" href="${enlaceRepo(completo)}"><span class="m">${esc(info.owner ? info.owner.login : rr.dueno)} /</span> ${esc(info.name || rr.nombre)}</a>
        ${info.private ? '<span class="lock">PRIVATE</span>' : ''}${info.archived ? '<span class="fork">ARCHIVED</span>' : ''}${info.fork ? '<span class="fork">fork</span>' : ''}
        <a class="acc rp-gh" href="${esc(info.html_url || 'https://github.com/' + completo)}">GITHUB ↗</a>
      </div>
      ${info.description ? `<div class="rdesc">${esc(info.description)}</div>` : ''}
      <div class="rp-meta m">
        ${info.language ? `<span><i class="dot" style="background:${COLORES[info.language] || '#888'}"></i>${esc(info.language)}</span>` : ''}
        <span>★ ${info.stargazers_count || 0}</span>
        ${info.default_branch ? `<span>⎇ ${esc(info.default_branch)}</span>` : ''}
        ${info.pushed_at ? `<span>updated ${hace(info.pushed_at)}</span>` : ''}
      </div>
    </div>
    ${partes.length ? `<div class="rp-migas">${migas.join('<span class="m"> / </span>')}</div>` : ''}`;
}

function pintarCarpetaRepo(info, rr, lista, clave) {
  const completo = info.full_name || rr.dueno + '/' + rr.nombre;
  const orden = lista.slice().sort((a, b) => (a.type === 'dir' ? 0 : 1) - (b.type === 'dir' ? 0 : 1) || a.name.localeCompare(b.name));
  const arriba = rr.ruta ? `<a class="frow" href="${enlaceRepo(completo, rr.ruta.split('/').slice(0, -1).join('/'))}"><span class="m">▴</span><span class="m">..</span><span></span></a>` : '';
  const filas = orden.map(x => `
    <a class="frow${x.type === 'dir' ? ' dir' : ''}" href="${x.type === 'submodule' ? esc(x.html_url || '#') : enlaceRepo(completo, x.path)}">
      <span class="${x.type === 'dir' ? 'r' : 'm'}">${x.type === 'dir' ? '▸' : x.type === 'submodule' ? '↗' : '·'}</span>
      <span class="fnombre">${esc(x.name)}${x.type === 'dir' ? '<span class="m">/</span>' : ''}</span>
      <span class="m hide-sm">${x.type === 'file' ? peso(x.size) : ''}</span>
    </a>`).join('');
  const readme = lista.find(x => x.type === 'file' && /^readme(\.(md|markdown|txt|rst))?$/i.test(x.name));
  $('rp-cuerpo').innerHTML = `
    <div class="ftabla">${arriba}${filas || '<div class="vacio m">// empty folder</div>'}</div>
    ${readme ? `<div class="rp-readme"><div class="tag">// ${esc(readme.name.toUpperCase())}</div><div class="mdv" id="rp-md"><div class="m">loading…</div></div></div>` : ''}`;
  if (readme) pintarMarkdown(completo, readme.path, rr.ruta, clave);
}

async function pintarMarkdown(completo, ruta, carpeta, clave) {
  let html;
  try { html = await pedirRepo(`/repos/${trozos(completo)}/contents/${trozos(ruta)}`, 'application/vnd.github.html', 'text'); } catch {
    if (location.hash === clave && $('rp-md')) $('rp-md').innerHTML = '<div class="m">// could not load it</div>';
    return;
  }
  if (location.hash !== clave || !$('rp-md')) return;
  const caja = $('rp-md');
  caja.innerHTML = html;
  arreglarEnlaces(caja, completo, carpeta);
}

// GitHub's HTML points at github.com; links inside the same repo stay on this site.
function arreglarEnlaces(caja, completo, carpeta) {
  const propio = new RegExp('^https://github\\.com/' + completo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/(?:blob|tree)/[^/]+/?(.*)$', 'i');
  caja.querySelectorAll('a[href]').forEach(a => {
    const h = a.getAttribute('href');
    if (h.startsWith('#')) { a.dataset.ancla = h.slice(1); return; }
    const m = h.match(propio);
    if (m) { a.href = enlaceRepo(completo, decodeURIComponent(m[1].split(/[?#]/)[0])); return; }
    if (!/^[a-z][a-z0-9+.-]*:|^\/\//i.test(h) && !h.startsWith('/')) a.href = enlaceRepo(completo, unirRuta(carpeta, h.split(/[?#]/)[0]));
    else if (h.startsWith('/')) a.href = 'https://github.com' + h;
  });
  caja.querySelectorAll('img[src]').forEach(img => {
    const s = img.getAttribute('src');
    if (s.startsWith('/') && !s.startsWith('//')) img.src = 'https://github.com' + s;
    else if (!/^[a-z][a-z0-9+.-]*:|^\/\//i.test(s)) img.src = `https://raw.githubusercontent.com/${completo}/HEAD/${unirRuta(carpeta, s)}`;
  });
}

function pintarArchivoRepo(info, rr, f, clave) {
  const completo = info.full_name || rr.dueno + '/' + rr.nombre;
  const ext = (f.name.includes('.') ? f.name.split('.').pop() : '').toLowerCase();
  const carpeta = rr.ruta.split('/').slice(0, -1).join('/');
  const barra = extra => `
    <div class="cbar">
      <span class="c">${esc(f.name)}</span>
      <span class="m">${extra}${peso(f.size)}</span>
      <span class="cbar-acc" id="cb-acc"></span>
    </div>`;

  if (!f.content || f.encoding !== 'base64') {
    $('rp-cuerpo').innerHTML = `<div class="codigo">${barra('')}<div class="vacio m">// too big to show here · <a class="c" href="${esc(f.html_url)}">open it on GitHub ↗</a></div></div>`;
    return;
  }
  if (IMAGENES[ext]) {
    $('rp-cuerpo').innerHTML = `<div class="codigo">${barra('')}<div class="cimg"><img alt="${esc(f.name)}" src="data:${IMAGENES[ext]};base64,${f.content.replace(/\s/g, '')}"></div></div>`;
    return;
  }
  const { binario, texto } = decodificar(f.content);
  if (binario) {
    $('rp-cuerpo').innerHTML = `<div class="codigo">${barra('')}<div class="vacio m">// binary file · <a class="c" href="${esc(f.html_url)}">open it on GitHub ↗</a></div></div>`;
    return;
  }
  navRepo.texto = texto;
  const lineas = texto.replace(/\n$/, '').split('\n');
  const esMd = ext === 'md' || ext === 'markdown';
  $('rp-cuerpo').innerHTML = `
    <div class="codigo">
      ${barra(`${lineas.length} lines · `)}
      ${esMd ? `<div class="mdv cmd" id="rp-md"><div class="m">loading…</div></div>` : ''}
      <div class="cuerpo"${esMd ? ' hidden' : ''} id="rp-src">
        <pre class="nums" aria-hidden="true">${lineas.map((_, i) => i + 1).join('\n')}</pre>
        <pre class="src"><code id="rp-code">${esc(lineas.join('\n'))}</code></pre>
      </div>
    </div>`;
  $('cb-acc').innerHTML = (esMd ? `<button type="button" class="acc on" data-ver="md">PREVIEW</button><button type="button" class="acc" data-ver="src">CODE</button>` : '')
    + `<button type="button" class="acc" data-copiar>COPY</button>`;
  if (esMd) pintarMarkdown(completo, f.path, carpeta, clave);

  const lengua = LENGUAJES[ext] || (/^dockerfile$/i.test(f.name) ? 'dockerfile' : /^makefile$/i.test(f.name) ? 'makefile' : '');
  if (!lengua || texto.length > 400000) return;
  cargarHL().then(hljs => {
    if (!hljs || location.hash !== clave || !$('rp-code') || !hljs.getLanguage(lengua)) return;
    $('rp-code').innerHTML = hljs.highlight(lineas.join('\n'), { language: lengua, ignoreIllegals: true }).value;
  });
}

$('rp-cuerpo').addEventListener('click', e => {
  const ancla = e.target.closest('a[data-ancla]');
  if (ancla) {
    e.preventDefault();
    const id = decodeURIComponent(ancla.dataset.ancla);
    const destino = document.getElementById(id) || document.getElementById('user-content-' + id);
    // GitHub puts the id on a hidden anchor next to the heading.
    if (destino) (destino.offsetParent ? destino : destino.parentElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const ver = e.target.closest('[data-ver]');
  if (ver) {
    const md = ver.dataset.ver === 'md';
    $('rp-md').hidden = !md;
    $('rp-src').hidden = md;
    document.querySelectorAll('#cb-acc [data-ver]').forEach(b => b.classList.toggle('on', b === ver));
    return;
  }
  const copiar = e.target.closest('[data-copiar]');
  if (copiar) {
    navigator.clipboard.writeText(navRepo.texto).then(() => {
      copiar.textContent = 'COPIED';
      setTimeout(() => { copiar.textContent = 'COPY'; }, 2000);
    }).catch(() => {});
  }
});
