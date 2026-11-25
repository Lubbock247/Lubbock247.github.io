// ---- New repository window (owner only, from the repositories page) ----
// Creates the repo through the GitHub API with the main key, which needs
// Administration → Read and write. While GitHub works, the window turns into a terminal
// that types out each step, and at the end it can drop the new repo into a folder.

const GITIGNORES = [['', 'NONE'], ['Node', 'NODE'], ['Java', 'JAVA'], ['Python', 'PYTHON'], ['Godot', 'GODOT'], ['Unity', 'UNITY'], ['VisualStudio', 'VISUAL STUDIO']];
const LICENCIAS = [['', 'NONE'], ['mit', 'MIT'], ['apache-2.0', 'APACHE 2.0'], ['gpl-3.0', 'GPL 3.0']];
const nr = { privado: true, readme: true, gitignore: '', licencia: '', carpeta: '', creando: false };

const dormir = ms => new Promise(ok => setTimeout(ok, ms));
const nombreRepo = t => t.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);

function chips(id, opciones, valor, clave) {
  $(id).innerHTML = opciones.map(([v, t]) =>
    `<button type="button" class="chip${v === valor ? ' on' : ''}" data-${clave}="${esc(v)}">${esc(t)}</button>`).join('');
}

function pintarFormulario() {
  chips('nr-vis', [['private', 'PRIVATE'], ['public', 'PUBLIC']], nr.privado ? 'private' : 'public', 'vis');
  chips('nr-readme', [['si', 'ADD README'], ['no', 'NO']], nr.readme ? 'si' : 'no', 'readme');
  chips('nr-git', GITIGNORES, nr.gitignore, 'git');
  chips('nr-lic', LICENCIAS, nr.licencia, 'lic');
  const carpetas = (cv.carpetas || []).map(c => [c.id, '/' + c.nombre]);
  chips('nr-carpeta', [['', '/UNSORTED'], ...carpetas], nr.carpeta, 'carpeta');
  comprobarNombre();
}

// Shows the name GitHub will actually use, and warns if it is taken.
function comprobarNombre() {
  const crudo = $('nr-nombre').value;
  const nombre = nombreRepo(crudo);
  const aviso = $('nr-aviso');
  let valido = false;
  aviso.className = 'nr-aviso m';
  if (!crudo.trim()) aviso.textContent = '';
  else if (!nombre) { aviso.textContent = '! use letters, numbers, - _ or .'; aviso.classList.add('r'); }
  else if ((reposLista || []).some(r => r.name.toLowerCase() === nombre.toLowerCase()) || nombre.toLowerCase() === `${USUARIO}.github.io`.toLowerCase()) {
    aviso.textContent = `! ${nombre} already exists`;
    aviso.classList.add('r');
  } else {
    aviso.textContent = nombre === crudo.trim() ? `→ github.com/${USUARIO}/${nombre}` : `→ it will be created as ${nombre}`;
    valido = true;
  }
  $('nr-crear').disabled = !valido;
  return valido ? nombre : '';
}

function abrirNuevoRepo() {
  if (!esDueno()) return;
  Object.assign(nr, { privado: true, readme: true, gitignore: '', licencia: '', carpeta: '' });
  $('nr-nombre').value = '';
  $('nr-desc').value = '';
  $('nr-formulario').hidden = false;
  $('nr-term').hidden = true;
  pintarFormulario();
  $('d-nuevo').showModal();
  $('nr-nombre').focus();
}

// ---- The terminal ----

// Shared with js/nuevo-proyecto.js: "donde" is the terminal's lines box.
async function escribirLinea(texto, clase = '', donde = $('nr-lineas')) {
  const linea = document.createElement('div');
  linea.className = clase;
  donde.appendChild(linea);
  for (let i = 0; i < texto.length; i += 2) {
    linea.textContent = texto.slice(0, i + 2);
    await dormir(10);
  }
  return linea;
}

// One step: "> text ......" with dots growing until the work finishes, then ok or fail.
async function paso(texto, trabajo, donde = $('nr-lineas')) {
  const linea = await escribirLinea('> ' + texto + ' ', '', donde);
  const puntos = document.createElement('span');
  puntos.className = 'm';
  linea.appendChild(puntos);
  let n = 0;
  const reloj = setInterval(() => { n = (n + 1) % 18; puntos.textContent = '.'.repeat(n + 1); }, 60);
  try {
    const [res] = await Promise.all([trabajo, dormir(450)]);
    clearInterval(reloj);
    puntos.textContent = '.'.repeat(Math.max(3, 30 - texto.length)) + ' ';
    linea.insertAdjacentHTML('beforeend', '<span class="c">ok</span>');
    return res;
  } catch (e) {
    clearInterval(reloj);
    puntos.textContent = '... ';
    linea.insertAdjacentHTML('beforeend', '<span class="r">fail</span>');
    throw e;
  }
}

async function crearRepo() {
  const nombre = comprobarNombre();
  if (!nombre || nr.creando) return;
  nr.creando = true;
  const descripcion = $('nr-desc').value.trim();
  const carpeta = nr.carpeta;
  const nombreCarpeta = carpeta && (cv.carpetas || []).find(c => c.id === carpeta);

  $('nr-formulario').hidden = true;
  const term = $('nr-term');
  term.hidden = false;
  term.classList.remove('listo');
  term.classList.remove('pinta');
  void term.offsetWidth;
  term.classList.add('pinta');
  $('nr-lineas').innerHTML = '';
  $('nr-fin').hidden = true;
  $('nr-volver').hidden = true;
  $('nr-abrir').hidden = true;

  // The request starts right away; the terminal shows it as it goes.
  const peticion = fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token(), Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: nombre,
      description: descripcion || undefined,
      private: nr.privado,
      auto_init: nr.readme,
      gitignore_template: nr.gitignore || undefined,
      license_template: nr.licencia || undefined
    })
  }).then(async r => {
    const j = await r.json().catch(() => ({}));
    if (r.ok) return j;
    const detalle = (j.errors && j.errors[0] && (j.errors[0].message || j.errors[0].code)) || j.message || '';
    throw new Error(r.status === 401 ? 'GitHub rejected the key'
      : r.status === 403 || r.status === 404 ? 'your key needs Administration → Read and write'
        : r.status === 422 ? (/exists/i.test(detalle) ? 'that name already exists on GitHub' : detalle || 'GitHub did not accept the name')
          : `GitHub answered ${r.status}`);
  });

  const usuario = USUARIO.toLowerCase();
  await escribirLinea(`$ gh repo create ${usuario}/${nombre} --${nr.privado ? 'private' : 'public'}`, 'cmd');
  try {
    await paso('checking name', Promise.resolve());
    const repo = await paso('creating repository', peticion);
    const archivos = [nr.readme && 'README.md', nr.gitignore && '.gitignore', nr.licencia && 'LICENSE'].filter(Boolean);
    if (archivos.length) await paso('writing ' + archivos.join(' + '), Promise.resolve());

    // Add it to the lists straight away, then file it.
    reposLista.unshift(repo);
    pintarRepos([...reposLista]);
    if (nombreCarpeta) {
      await paso(`filing in /${nombreCarpeta.nombre}`, Promise.resolve().then(() => moverRepo(repo.name, carpeta)));
    }
    pintarCarpetas();
    await escribirLinea(' ');
    await escribirLinea(`✓ ${usuario}/${repo.name} is ready`, 'c');
    $('nr-abrir').href = repo.html_url;
    $('nr-abrir').hidden = false;
  } catch (e) {
    await escribirLinea(' ');
    await escribirLinea(`✗ ${e.message}`, 'r');
    $('nr-volver').hidden = false;
  }
  term.classList.add('listo');
  $('nr-fin').hidden = false;
  nr.creando = false;
}

// ---- Events ----

$('c-nuevo').addEventListener('click', abrirNuevoRepo);
$('nr-nombre').addEventListener('input', comprobarNombre);
$('nr-formulario').addEventListener('submit', e => { e.preventDefault(); crearRepo(); });
$('nr-cancelar').addEventListener('click', () => $('d-nuevo').close());
$('nr-listo').addEventListener('click', () => $('d-nuevo').close());
$('nr-volver').addEventListener('click', () => {
  $('nr-term').hidden = true;
  $('nr-formulario').hidden = false;
  pintarFormulario();
  $('nr-nombre').focus();
});
$('nr-formulario').addEventListener('click', e => {
  const b = e.target.closest('.chip');
  if (!b) return;
  if (b.dataset.vis !== undefined) nr.privado = b.dataset.vis === 'private';
  if (b.dataset.readme !== undefined) nr.readme = b.dataset.readme === 'si';
  if (b.dataset.git !== undefined) nr.gitignore = b.dataset.git;
  if (b.dataset.lic !== undefined) nr.licencia = b.dataset.lic;
  if (b.dataset.carpeta !== undefined) nr.carpeta = b.dataset.carpeta;
  pintarFormulario();
});
