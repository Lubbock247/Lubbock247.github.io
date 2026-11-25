// ---- Stars page (#stars) ----
// Repos the account has starred, newest star first. Visitors get the public list from the
// GitHub API (GitHub leaves private repos out for them). With the main key the owner also
// sees starred private repos and can unstar / star again from here (Starring permission).

const paginaEstrellas = { lista: null, cargadoCon: null, cargando: null, texto: '', quitadas: new Set(), ocupadas: new Set(), aviso: '' };

async function pedirEstrellas(ruta, clave) {
  const h = { Accept: 'application/vnd.github.star+json' };
  if (clave) h.Authorization = 'Bearer ' + clave;
  const r = await fetch('https://api.github.com' + ruta, { headers: h, cache: 'no-cache' });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

async function cargarEstrellasPagina() {
  const ep = paginaEstrellas;
  ep.cargadoCon = !!token();
  ep.quitadas = new Set();
  ep.aviso = '';
  let datos = null;
  if (token()) { try { datos = await pedirEstrellas('/user/starred?per_page=100&sort=created', token()); } catch {} }
  if (!datos) {
    try { datos = await pedirEstrellas(`/users/${USUARIO}/starred?per_page=100&sort=created`); } catch {
      datos = [];
      ep.aviso = '! COULD NOT LOAD THE STARS · TRY AGAIN IN A MINUTE';
    }
  }
  ep.lista = datos.filter(x => x && x.repo).map(x => ({ ...x.repo, cuando: x.starred_at }));
}

function asegurarEstrellasPagina() {
  const ep = paginaEstrellas;
  if (ep.cargando || (ep.lista && ep.cargadoCon === !!token())) return;
  ep.cargando = cargarEstrellasPagina().finally(() => { ep.cargando = null; pintarEstrellasPagina(); });
}

// Called by js/app.js when the page switches to #stars.
function abrirEstrellas() {
  asegurarEstrellasPagina();
  pintarEstrellasPagina();
}

function filaEstrella(r) {
  const dueno = esDueno();
  const quitada = paginaEstrellas.quitadas.has(r.full_name);
  const temas = (r.topics || []).slice(0, 4);
  const boton = dueno
    ? `<button type="button" class="estrella${quitada ? '' : ' on'}" data-quitar="${esc(r.full_name)}" title="${quitada ? 'star again' : 'unstar'}"${paginaEstrellas.ocupadas.has(r.full_name) ? ' disabled' : ''}>${quitada ? '☆' : '★'} ${r.stargazers_count}</button>`
    : `<a class="estrella" href="${esc(r.html_url)}" title="open on GitHub">★ ${r.stargazers_count}</a>`;
  return `
    <div class="srow${quitada ? ' quitada' : ''}">
      <img class="sav" src="${esc(r.owner.avatar_url)}&s=64" alt="" loading="lazy">
      <div class="snombre">
        <div class="slinea"><a href="${enlaceRepo(r.full_name)}"><span class="m">${esc(r.owner.login)} /</span> ${esc(r.name)}</a>${r.private ? '<span class="lock">PRIVATE</span>' : ''}${r.archived ? '<span class="fork">ARCHIVED</span>' : ''}${r.fork ? '<span class="fork">fork</span>' : ''}</div>
        ${r.description ? `<div class="rdesc">${esc(r.description)}</div>` : ''}
        ${temas.length ? `<div class="tetis">${temas.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
      </div>
      <span class="hide-sm">${r.language ? `<i class="dot" style="background:${COLORES[r.language] || '#888'}"></i>${esc(r.language)}` : '<span class="m">—</span>'}</span>
      <span>${boton}</span>
      <span class="m hide-sm" title="${esc(r.cuando || '')}">${r.cuando ? hace(r.cuando) : ''}</span>
    </div>`;
}

function pintarEstrellasPagina() {
  if (location.hash !== '#stars') return;
  const ep = paginaEstrellas;
  $('s-estado').innerHTML = ep.aviso ? `<span class="r">${esc(ep.aviso)}</span>` : '';
  if (!ep.lista) { $('s-lista').innerHTML = '<div class="vacio m">loading…</div>'; return; }
  const t = ep.texto.toLowerCase();
  const lista = ep.lista.filter(r => !t || [r.full_name, r.description, r.language, ...(r.topics || [])]
    .some(x => (x || '').toLowerCase().includes(t)));
  if (!lista.length) {
    $('s-lista').innerHTML = `<div class="vacio m">${ep.lista.length ? '// no stars match' : '// no starred repos yet'}</div>`;
    return;
  }
  $('s-lista').innerHTML = `<div class="srow cab m"><span></span><span>REPO</span><span class="hide-sm">LANG</span><span>STARS</span><span class="hide-sm">STARRED</span></div>`
    + lista.map(filaEstrella).join('');
}

// Unstar keeps the row (dimmed) so it can be starred again straight away.
async function alternarEstrellaPagina(completo) {
  const ep = paginaEstrellas;
  const r = (ep.lista || []).find(x => x.full_name === completo);
  if (!r || ep.ocupadas.has(completo)) return;
  const quitar = !ep.quitadas.has(completo);
  const aplicar = q => {
    if (q) ep.quitadas.add(completo); else ep.quitadas.delete(completo);
    r.stargazers_count = Math.max(0, r.stargazers_count + (q ? -1 : 1));
    const tab = $('t-stars');
    if (/^\d+$/.test(tab.textContent)) tab.textContent = Math.max(0, +tab.textContent + (q ? -1 : 1));
    // Keep the stars on the repositories page in step.
    if (cv.estrellas) { if (q) cv.estrellas.delete(completo.toLowerCase()); else cv.estrellas.add(completo.toLowerCase()); }
    const propio = reposLista && reposLista.find(x => (x.full_name || '').toLowerCase() === completo.toLowerCase());
    if (propio) propio.stargazers_count = r.stargazers_count;
  };
  ep.ocupadas.add(completo);
  ep.aviso = '';
  aplicar(quitar);
  pintarEstrellasPagina();
  let hecho = false;
  let rechazada = false;
  for (const k of clavesEstrella()) {
    try {
      const res = await fetch(`https://api.github.com/user/starred/${completo}`, {
        method: quitar ? 'DELETE' : 'PUT',
        headers: { Authorization: 'Bearer ' + k, Accept: 'application/vnd.github+json' }
      });
      if (res.ok) { hecho = true; break; }
      if (res.status === 401) rechazada = true;
    } catch {}
  }
  ep.ocupadas.delete(completo);
  if (!hecho) {
    aplicar(!quitar);
    ep.aviso = rechazada ? '! KEY REJECTED' : '! YOUR KEY NEEDS STARRING → READ AND WRITE';
  }
  pintarEstrellasPagina();
}

$('s-buscar').addEventListener('input', e => { paginaEstrellas.texto = e.target.value; pintarEstrellasPagina(); });
$('s-lista').addEventListener('click', e => {
  const b = e.target.closest('[data-quitar]');
  if (b && esDueno()) alternarEstrellaPagina(b.dataset.quitar);
});
