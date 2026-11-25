// ---- New project window (owner only, from the projects page) ----
// Creates a GitHub Project through GraphQL with the projects key, which for this needs the
// classic "project" scope (read:project alone can only look). Uses the same terminal as the
// new-repo window (escribirLinea / paso in js/nuevo-repo.js).

const np = { publico: false, repo: '', creando: false };

async function gqlProyectos(query, variables) {
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + claveProyectos(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store'
  });
  if (r.status === 401) throw new Error('GitHub rejected the projects key');
  if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
  const j = await r.json();
  if (j.errors) {
    const sinPermiso = j.errors.some(e => e.type === 'INSUFFICIENT_SCOPES' || /scope/i.test(e.message));
    throw new Error(sinPermiso ? 'your projects key needs the project scope (read:project can only look)' : j.errors[0].message);
  }
  return j.data;
}

function pintarFormularioProyecto() {
  chips('np-vis', [['private', 'PRIVATE'], ['public', 'PUBLIC']], np.publico ? 'public' : 'private', 'vis');
  const repos = (reposLista || []).map(r => [r.name, r.name]);
  chips('np-repo', [['', 'NONE'], ...repos], np.repo, 'repo');
  comprobarTitulo();
}

function comprobarTitulo() {
  const titulo = $('np-titulo').value.trim();
  const aviso = $('np-aviso');
  aviso.className = 'nr-aviso m';
  const repetido = titulo && (pv.lista || []).some(p => p.title.toLowerCase() === titulo.toLowerCase());
  aviso.textContent = repetido ? '· you already have a project with this title (allowed, just so you know)' : '';
  $('np-crear').disabled = !titulo;
  return titulo;
}

function abrirNuevoProyecto() {
  if (!esDueno()) return;
  // Without a projects key there is nothing to create with: ask for it first.
  if (!claveProyectos()) { abrirClaveProyectos(); return; }
  Object.assign(np, { publico: false, repo: '' });
  $('np-titulo').value = '';
  $('np-desc').value = '';
  $('np-formulario').hidden = false;
  $('np-term').hidden = true;
  pintarFormularioProyecto();
  $('d-nuevo-p').showModal();
  $('np-titulo').focus();
}

async function crearProyecto() {
  const titulo = comprobarTitulo();
  if (!titulo || np.creando) return;
  np.creando = true;
  const descripcion = $('np-desc').value.trim();
  const repo = np.repo && (reposLista || []).find(r => r.name === np.repo);
  const lineas = $('np-lineas');

  $('np-formulario').hidden = true;
  const term = $('np-term');
  term.hidden = false;
  term.classList.remove('listo', 'pinta');
  void term.offsetWidth;
  term.classList.add('pinta');
  lineas.innerHTML = '';
  $('np-fin').hidden = true;
  $('np-volver').hidden = true;
  $('np-abrir').hidden = true;

  const usuario = USUARIO.toLowerCase();
  await escribirLinea(`$ gh project create --owner ${usuario} --title "${titulo}"`, 'cmd', lineas);
  try {
    const yo = await paso('checking projects key', gqlProyectos('query { viewer { id } }'), lineas);
    const creado = await paso('creating project', gqlProyectos(
      `mutation($o: ID!, $t: String!, $r: ID) {
        createProjectV2(input: { ownerId: $o, title: $t, repositoryId: $r }) { projectV2 { id number url } } }`,
      { o: yo.viewer.id, t: titulo, r: (repo && repo.node_id) || null }
    ), lineas);
    const proyecto = creado.createProjectV2.projectV2;

    // New projects start private and without a description.
    if (descripcion || np.publico) {
      const cambios = [descripcion && 'description', np.publico && 'public'].filter(Boolean).join(' + ');
      await paso(`setting ${cambios}`, gqlProyectos(
        `mutation($p: ID!, $d: String, $v: Boolean) {
          updateProjectV2(input: { projectId: $p, shortDescription: $d, public: $v }) { projectV2 { id } } }`,
        { p: proyecto.id, d: descripcion || null, v: np.publico }
      ), lineas);
    }
    if (repo) await paso(`linked to ${repo.name}`, Promise.resolve(), lineas);

    await escribirLinea(' ', '', lineas);
    await escribirLinea(`✓ project #${proyecto.number} "${titulo}" is ready`, 'c', lineas);
    $('np-abrir').href = proyecto.url;
    $('np-abrir').hidden = false;
    // Reload the list (and the public file, if the new project is public).
    pv.lista = null;
    abrirProyectos();
  } catch (e) {
    await escribirLinea(' ', '', lineas);
    await escribirLinea(`✗ ${e.message}`, 'r', lineas);
    $('np-volver').hidden = false;
  }
  term.classList.add('listo');
  $('np-fin').hidden = false;
  np.creando = false;
}

// ---- Events ----

$('p-nuevo').addEventListener('click', abrirNuevoProyecto);
$('np-titulo').addEventListener('input', comprobarTitulo);
$('np-formulario').addEventListener('submit', e => { e.preventDefault(); crearProyecto(); });
$('np-cancelar').addEventListener('click', () => $('d-nuevo-p').close());
$('np-listo').addEventListener('click', () => $('d-nuevo-p').close());
$('np-volver').addEventListener('click', () => {
  $('np-term').hidden = true;
  $('np-formulario').hidden = false;
  pintarFormularioProyecto();
  $('np-titulo').focus();
});
$('np-formulario').addEventListener('click', e => {
  const b = e.target.closest('.chip');
  if (!b) return;
  if (b.dataset.vis !== undefined) np.publico = b.dataset.vis === 'public';
  if (b.dataset.repo !== undefined) np.repo = b.dataset.repo;
  pintarFormularioProyecto();
});
