// ---- Editing a project board from the site (owner only) ----
// With the classic projects key (project scope) the owner can add cards, drag them between
// columns or reorder them, open one to edit its title and description, change its status,
// or delete it. Changes show at once, go to GitHub one after another, and if GitHub refuses
// one the board reloads from GitHub. Public projects then refresh data/projects.json.

const MUTACIONES = {
  crear: `mutation($p: ID!, $t: String!) { addProjectV2DraftIssue(input: { projectId: $p, title: $t }) {
    projectItem { id content { ... on DraftIssue { id } } } } }`,
  estado: `mutation($p: ID!, $i: ID!, $f: ID!, $o: String!) { updateProjectV2ItemFieldValue(input: {
    projectId: $p, itemId: $i, fieldId: $f, value: { singleSelectOptionId: $o } }) { projectV2Item { id } } }`,
  sinEstado: `mutation($p: ID!, $i: ID!, $f: ID!) { clearProjectV2ItemFieldValue(input: {
    projectId: $p, itemId: $i, fieldId: $f }) { projectV2Item { id } } }`,
  posicion: `mutation($p: ID!, $i: ID!, $a: ID) { updateProjectV2ItemPosition(input: {
    projectId: $p, itemId: $i, afterId: $a }) { clientMutationId } }`,
  editar: `mutation($d: ID!, $t: String!, $b: String) { updateProjectV2DraftIssue(input: {
    draftIssueId: $d, title: $t, body: $b }) { draftIssue { id } } }`,
  borrar: `mutation($p: ID!, $i: ID!) { deleteProjectV2Item(input: { projectId: $p, itemId: $i }) { deletedItemId } }`
};

const tb = { cola: Promise.resolve(), pendientes: 0, arrastrada: null, destino: null, abierta: null, confirmar: null, publicar: null };

function proyectoActual() {
  const m = location.hash.match(/^#projects\/(\d+)$/);
  return m && pv.lista ? pv.lista.find(p => p.number === +m[1]) : null;
}

function recontar(p) {
  p.estados = contarEstados(p.tareas);
  p.items = p.tareas.length;
}

// Every change waits for the previous one, so GitHub gets them in order.
function encolar(trabajo) {
  tb.pendientes++;
  pv.dEstado = '<span class="c">SAVING…</span>';
  pintarProyectos();
  tb.cola = tb.cola.then(trabajo).then(() => {
    tb.pendientes--;
    if (!tb.pendientes) {
      pv.dEstado = '<span class="c">✓ SAVED ON GITHUB</span>';
      setTimeout(() => { if (!tb.pendientes && pv.dEstado.includes('SAVED')) { pv.dEstado = ''; pintarProyectos(); } }, 3000);
      // A public project also refreshes what visitors see.
      clearTimeout(tb.publicar);
      tb.publicar = setTimeout(publicarProyectos, 2500);
    }
    pintarProyectos();
  }).catch(e => {
    tb.pendientes = 0;
    tb.cola = Promise.resolve();
    pv.dEstado = `<span class="r">! ${esc(e.message)} · reloaded from GitHub</span>`;
    pv.lista = null;
    asegurarProyectos();
  });
}

function ponerEstado(p, x, nombre) {
  if (!p.campoId) return Promise.resolve();
  if (!nombre) return gqlProyectos(MUTACIONES.sinEstado, { p: p.id, i: x.id, f: p.campoId });
  const opcion = p.opcionIds[nombre];
  if (!opcion) return Promise.reject(new Error(`the column "${nombre}" no longer exists`));
  return gqlProyectos(MUTACIONES.estado, { p: p.id, i: x.id, f: p.campoId, o: opcion });
}

// ---- Changes ----

function crearTarjeta(p, columna, titulo) {
  const x = hacerTarea(columna, 'DRAFT', titulo, { cuerpo: '', pendiente: true });
  p.tareas.push(x);
  recontar(p);
  encolar(async () => {
    const d = await gqlProyectos(MUTACIONES.crear, { p: p.id, t: titulo });
    x.id = d.addProjectV2DraftIssue.projectItem.id;
    x.draftId = d.addProjectV2DraftIssue.projectItem.content.id;
    if (columna) await ponerEstado(p, x, columna);
    x.pendiente = false;
  });
}

// Moves a card to a column, before another card (or to the end of that column).
function moverTarjeta(p, i, columna, antesDe) {
  const x = p.tareas[i];
  const antes = antesDe === null ? null : p.tareas[antesDe];
  if (!x || antes === x) return;
  const cambiaEstado = x.status !== columna;
  p.tareas.splice(p.tareas.indexOf(x), 1);
  if (antes) p.tareas.splice(p.tareas.indexOf(antes), 0, x);
  else {
    const ultima = p.tareas.map(t => t.status).lastIndexOf(columna);
    p.tareas.splice(ultima < 0 ? p.tareas.length : ultima + 1, 0, x);
  }
  x.status = columna;
  recontar(p);
  encolar(async () => {
    if (cambiaEstado) await ponerEstado(p, x, columna);
    // GitHub keeps one order for the whole project: put it right after the card above it in this column.
    const mismas = p.tareas.filter(t => t.status === x.status);
    const previa = mismas[mismas.indexOf(x) - 1];
    await gqlProyectos(MUTACIONES.posicion, { p: p.id, i: x.id, a: previa ? previa.id : null });
  });
}

function editarTarjeta(p, x, titulo, cuerpo, estado) {
  const cambiaTexto = x.tipo === 'DRAFT' && (titulo !== x.titulo || cuerpo !== x.cuerpo);
  const cambiaEstado = estado !== x.status;
  if (!cambiaTexto && !cambiaEstado) return;
  if (cambiaTexto) { x.titulo = titulo; x.cuerpo = cuerpo; }
  if (cambiaEstado) {
    // Changing the status from the window sends the card to the end of its new column.
    p.tareas.splice(p.tareas.indexOf(x), 1);
    const ultima = p.tareas.map(t => t.status).lastIndexOf(estado);
    p.tareas.splice(ultima < 0 ? p.tareas.length : ultima + 1, 0, x);
    x.status = estado;
  }
  recontar(p);
  encolar(async () => {
    if (cambiaTexto) await gqlProyectos(MUTACIONES.editar, { d: x.draftId, t: titulo, b: cuerpo });
    if (cambiaEstado) {
      await ponerEstado(p, x, estado);
      const mismas = p.tareas.filter(t => t.status === x.status);
      const previa = mismas[mismas.indexOf(x) - 1];
      await gqlProyectos(MUTACIONES.posicion, { p: p.id, i: x.id, a: previa ? previa.id : null });
    }
  });
}

function borrarTarjeta(p, x) {
  p.tareas.splice(p.tareas.indexOf(x), 1);
  recontar(p);
  encolar(() => gqlProyectos(MUTACIONES.borrar, { p: p.id, i: x.id }));
}

// ---- Card window ----

function abrirTarea(i) {
  const p = proyectoActual();
  const x = p && p.tareas[i];
  if (!x || x.pendiente) return;
  tb.abierta = x;
  tb.confirmar = null;
  const borrador = x.tipo === 'DRAFT';
  const oculta = x.tipo === 'PRIVADO';
  $('dt-tag').textContent = borrador ? '// DRAFT' : oculta ? '// PRIVATE ITEM' : `// ${x.tipo === 'PR' ? 'PULL REQUEST' : 'ISSUE'}`;
  $('dt-titulo').hidden = !borrador;
  $('dt-cuerpo').hidden = !borrador;
  $('dt-titulo').value = borrador ? x.titulo : '';
  $('dt-cuerpo').value = borrador ? (x.cuerpo || '') : '';
  $('dt-fijo').hidden = borrador;
  $('dt-fijo').textContent = oculta ? "▒▒▒▒ private item · your projects key can't read its repo" : x.titulo;
  $('dt-meta').innerHTML = borrador || oculta ? '' : `${etiquetaTipo(x)}${x.repo ? `<span>${esc(x.repo)}</span>` : ''}
    ${x.url ? `<a class="chip" href="${esc(x.url)}" target="_blank" rel="noopener">OPEN ON GITHUB ↗</a>` : ''}`;
  $('dt-meta').hidden = borrador || oculta;
  const nombres = [...p.opciones];
  p.tareas.forEach(t => { if (t.status && !nombres.includes(t.status)) nombres.push(t.status); });
  tb.estadoElegido = x.status;
  pintarEstadosVentana(nombres);
  $('dt-borrar').textContent = borrador ? 'DELETE' : 'REMOVE FROM PROJECT';
  $('d-tarea').showModal();
  if (borrador) $('dt-titulo').focus();
}

function pintarEstadosVentana(nombres) {
  chips('dt-status', [...nombres.map(n => [n, n.toUpperCase()]), ['', 'NO STATUS']], tb.estadoElegido, 'estado');
}

$('dt-status').addEventListener('click', e => {
  const b = e.target.closest('[data-estado]');
  if (!b) return;
  tb.estadoElegido = b.dataset.estado;
  $('dt-status').querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b));
});

$('dt-form').addEventListener('submit', e => {
  e.preventDefault();
  const p = proyectoActual();
  const x = tb.abierta;
  if (!p || !x) return;
  const titulo = $('dt-titulo').value.trim();
  if (x.tipo === 'DRAFT' && !titulo) { $('dt-titulo').focus(); return; }
  $('d-tarea').close();
  editarTarjeta(p, x, x.tipo === 'DRAFT' ? titulo : x.titulo, x.tipo === 'DRAFT' ? $('dt-cuerpo').value : x.cuerpo, tb.estadoElegido);
});

// Deleting asks for a second click.
$('dt-borrar').addEventListener('click', () => {
  const p = proyectoActual();
  const x = tb.abierta;
  if (!p || !x) return;
  if (tb.confirmar !== x) {
    tb.confirmar = x;
    $('dt-borrar').textContent = 'SURE? CLICK AGAIN';
    setTimeout(() => {
      if (tb.confirmar === x) { tb.confirmar = null; $('dt-borrar').textContent = x.tipo === 'DRAFT' ? 'DELETE' : 'REMOVE FROM PROJECT'; }
    }, 3000);
    return;
  }
  $('d-tarea').close();
  borrarTarjeta(p, x);
});
$('dt-cerrar').addEventListener('click', () => $('d-tarea').close());

// ---- Board events ----

$('p-detalle').addEventListener('click', e => {
  const p = proyectoActual();
  if (!p || !tableroEditable(p)) return;
  const anadir = e.target.closest('[data-anadir]');
  if (anadir) {
    pv.anadiendo = anadir.dataset.anadir;
    if (pv.modo === 'tabla') pv.modo = 'tablero';
    pintarProyectos();
    return;
  }
  const tarjeta = e.target.closest('.tarea.editable, .trow.editable');
  if (tarjeta) abrirTarea(+tarjeta.dataset.i);
});

$('p-detalle').addEventListener('keydown', e => {
  if (e.target.id === 'd-nueva') {
    const p = proyectoActual();
    if (e.key === 'Escape') { pv.anadiendo = null; pintarProyectos(); return; }
    if (e.key !== 'Enter' || !p) return;
    e.preventDefault();
    const titulo = e.target.value.trim();
    if (!titulo) { pv.anadiendo = null; pintarProyectos(); return; }
    // The box stays open for the next card, like on GitHub.
    crearTarjeta(p, pv.anadiendo, titulo);
    return;
  }
  const tarjeta = e.target.closest('.tarea.editable, .trow.editable');
  if (tarjeta && e.key === 'Enter') abrirTarea(+tarjeta.dataset.i);
});

// Leaving the box empty closes it.
$('p-detalle').addEventListener('focusout', e => {
  if (e.target.id !== 'd-nueva' || e.target.value.trim()) return;
  setTimeout(() => {
    const caja = $('d-nueva');
    if (pv.anadiendo !== null && (!caja || (document.activeElement !== caja && !caja.value.trim()))) {
      pv.anadiendo = null;
      pintarProyectos();
    }
  }, 150);
});

const limpiarArrastre = () => document.querySelectorAll('#p-detalle .arrastrando, #p-detalle .antes, #p-detalle .al-final, #p-detalle .sobre')
  .forEach(n => n.classList.remove('arrastrando', 'antes', 'al-final', 'sobre'));

$('p-detalle').addEventListener('dragstart', e => {
  const c = e.target.closest('.tarea.editable');
  const p = proyectoActual();
  if (!c || !p) return;
  const x = p.tareas[+c.dataset.i];
  if (!x || x.pendiente) { e.preventDefault(); return; }
  tb.arrastrada = +c.dataset.i;
  c.classList.add('arrastrando');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(tb.arrastrada));
});

$('p-detalle').addEventListener('dragover', e => {
  const col = e.target.closest('.columna');
  if (!col || tb.arrastrada === null) return;
  e.preventDefault();
  document.querySelectorAll('#p-detalle .antes, #p-detalle .al-final, #p-detalle .sobre').forEach(n => n.classList.remove('antes', 'al-final', 'sobre'));
  col.classList.add('sobre');
  const tarjetas = [...col.querySelectorAll('.tarea.editable')].filter(c => +c.dataset.i !== tb.arrastrada);
  const siguiente = tarjetas.find(c => { const r = c.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
  if (siguiente) siguiente.classList.add('antes'); else col.querySelector('.ctareas').classList.add('al-final');
  tb.destino = { columna: col.dataset.col, antesDe: siguiente ? +siguiente.dataset.i : null };
});

$('p-detalle').addEventListener('drop', e => {
  const p = proyectoActual();
  if (!p || tb.arrastrada === null || !tb.destino) return;
  e.preventDefault();
  const { columna, antesDe } = tb.destino;
  const i = tb.arrastrada;
  tb.arrastrada = tb.destino = null;
  limpiarArrastre();
  moverTarjeta(p, i, columna, antesDe);
  pintarProyectos();
});

$('p-detalle').addEventListener('dragend', () => {
  tb.arrastrada = tb.destino = null;
  limpiarArrastre();
});
