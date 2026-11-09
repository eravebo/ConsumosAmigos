/**
 * ============================================================
 *  API "Gastos viaje a Melo"  (Google Apps Script)
 * ============================================================
 *  Este script convierte tu Google Sheet en una pequeña base de datos
 *  con una API web. La app de GitHub Pages le envía peticiones:
 *
 *    GET  ?accion=listar                -> devuelve todos los consumos
 *    POST {accion:'registrar', ...}     -> agrega un consumo (y su foto)
 *    POST {accion:'eliminar', id:...}   -> borra un consumo
 *
 *  Las fotos se guardan en una carpeta de Google Drive y en la hoja
 *  queda el enlace y una miniatura.
 *
 *  IMPORTANTE: cada vez que cambies este código debes publicar una
 *  NUEVA VERSIÓN de la implementación (ver README.md, paso 3).
 * ============================================================
 */

// ---------- Configuración (edita aquí) ----------
const CONFIG = {
  ID_HOJA_CALCULO: '1lpOoNkSbwt3a4NPL8ecVYJvsAJcKSngidzvzZdwdulA',
  NOMBRE_PESTANA: 'Consumos',
  CARPETA_FOTOS: 'Viaje a Melo - Fotos consumos',
  ZONA_HORARIA: 'America/Bogota'
};

const PERSONAS_VALIDAS = ['Mejia', 'Leidy', 'Camilo', 'Evelyn'];

// Orden de columnas en la hoja (A, B, C, ...)
const COLUMNAS = [
  'ID',                    // A
  'Fecha',                 // B
  'Hora',                  // C
  'Producto',              // D
  'Cantidad',              // E
  'Valor total',           // F
  'Quién consume',         // G
  'Valor por persona',     // H
  'Nota',                  // I
  'Foto (enlace)',         // J
  'Foto',                  // K  (miniatura con =IMAGE)
  'Registrado en servidor', // L
  'Pagó'                    // M  (quién pagó)
];


// ============================================================
//  Puntos de entrada de la API
// ============================================================

/** Peticiones GET: lectura de datos. */
function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.accion === 'listar') return respuesta_({ ok: true, datos: listar_() });
    return respuesta_({ ok: true, mensaje: 'API de Gastos Melo activa' });
  } catch (err) {
    return respuesta_({ ok: false, error: String(err.message || err) });
  }
}

/** Peticiones POST: escritura (registrar / eliminar). */
function doPost(e) {
  let cuerpo;
  try {
    cuerpo = JSON.parse(e.postData.contents);
  } catch (err) {
    return respuesta_({ ok: false, error: 'El cuerpo de la petición no es JSON válido' });
  }

  // El "candado" evita que dos celulares escriban en la misma fila al mismo tiempo.
  const candado = LockService.getScriptLock();
  candado.waitLock(25000);
  try {
    if (cuerpo.accion === 'registrar') return respuesta_({ ok: true, registro: registrar_(cuerpo.datos) });
    if (cuerpo.accion === 'eliminar')  return respuesta_({ ok: true, eliminado: eliminar_(cuerpo.id) });
    return respuesta_({ ok: false, error: 'Acción no reconocida' });
  } catch (err) {
    return respuesta_({ ok: false, error: String(err.message || err) });
  } finally {
    candado.releaseLock();
  }
}

/**
 * Ejecuta esta función UNA VEZ desde el editor (botón "Ejecutar")
 * para dar permisos y crear la pestaña y la carpeta de fotos.
 */
function probar() {
  const hoja = obtenerHoja_();
  const carpeta = obtenerCarpeta_();
  Logger.log('Pestaña lista: ' + hoja.getName());
  Logger.log('Carpeta de fotos: ' + carpeta.getUrl());
}


// ============================================================
//  Lógica
// ============================================================

function registrar_(d) {
  if (!d) throw new Error('Faltan los datos del consumo');

  const producto = String(d.producto || '').trim();
  const valor = Number(d.valor);
  const cantidad = Math.max(1, parseInt(d.cantidad, 10) || 1);
  const personas = (Array.isArray(d.personas) ? d.personas : [])
    .filter(function (p) { return PERSONAS_VALIDAS.indexOf(p) >= 0; });

  if (!producto) throw new Error('El producto es obligatorio');
  if (!(valor > 0)) throw new Error('El valor debe ser mayor a 0');
  if (!personas.length) throw new Error('Elige al menos una persona');

  const pago = PERSONAS_VALIDAS.indexOf(d.pago) >= 0 ? d.pago : '';
  if (!pago) throw new Error('Elige quién pagó');

  const hoja = obtenerHoja_();
  const id = String(d.id || Utilities.getUuid());

  // Si el mismo registro llega dos veces (p. ej. se cortó el wifi justo
  // después de guardar), no lo duplicamos.
  const filaExistente = buscarFila_(hoja, id);
  if (filaExistente) return filaAObjeto_(hoja, filaExistente);

  let fotoUrl = '', formulaFoto = '';
  if (d.foto) {
    const foto = guardarFoto_(d.foto, producto);
    fotoUrl = foto.url;
    formulaFoto = '=IMAGE("https://drive.google.com/thumbnail?id=' + foto.id + '&sz=w200")';
  }

  const ahora = new Date();
  const fila = [
    id,
    d.fecha || Utilities.formatDate(ahora, CONFIG.ZONA_HORARIA, 'yyyy-MM-dd'),
    d.hora  || Utilities.formatDate(ahora, CONFIG.ZONA_HORARIA, 'HH:mm:ss'),
    textoSeguro_(producto),
    cantidad,
    valor,
    personas.join(', '),
    Math.round((valor / personas.length) * 100) / 100,
    textoSeguro_(String(d.nota || '').trim()),
    fotoUrl,
    formulaFoto,
    Utilities.formatDate(ahora, CONFIG.ZONA_HORARIA, 'yyyy-MM-dd HH:mm:ss'),
    pago
  ];

  hoja.appendRow(fila);
  return filaAObjeto_(hoja, hoja.getLastRow());
}

function listar_() {
  const hoja = obtenerHoja_();
  const ultima = hoja.getLastRow();
  if (ultima < 2) return [];

  const rango = hoja.getRange(2, 1, ultima - 1, COLUMNAS.length);
  const valores = rango.getValues();           // números reales
  const textos  = rango.getDisplayValues();    // texto tal como se ve

  return valores
    .map(function (fila, i) { return construirObjeto_(fila, textos[i]); })
    .filter(function (r) { return r.id; });
}

function eliminar_(id) {
  if (!id) throw new Error('Falta el ID');
  const hoja = obtenerHoja_();
  const numFila = buscarFila_(hoja, String(id));
  if (!numFila) return false;

  // Enviamos la foto a la papelera de Drive (si la hay).
  const enlace = String(hoja.getRange(numFila, 10).getValue() || '');
  const fotoId = extraerIdDrive_(enlace);
  if (fotoId) {
    try { DriveApp.getFileById(fotoId).setTrashed(true); } catch (err) { /* ya no existe */ }
  }

  hoja.deleteRow(numFila);
  return true;
}


// ============================================================
//  Utilidades
// ============================================================

function obtenerHoja_() {
  const libro = SpreadsheetApp.openById(CONFIG.ID_HOJA_CALCULO);
  let hoja = libro.getSheetByName(CONFIG.NOMBRE_PESTANA);

  if (!hoja) {
    hoja = libro.insertSheet(CONFIG.NOMBRE_PESTANA);
    hoja.getRange(1, 1, 1, COLUMNAS.length)
      .setValues([COLUMNAS])
      .setFontWeight('bold')
      .setBackground('#0f766e')
      .setFontColor('#ffffff');
    hoja.setFrozenRows(1);
    hoja.getRange('B:C').setNumberFormat('@');          // fecha y hora como texto
    hoja.getRange('F:F').setNumberFormat('#,##0');      // valor total
    hoja.getRange('H:H').setNumberFormat('#,##0.##');   // valor por persona
    hoja.setColumnWidth(1, 90);
    hoja.setColumnWidth(4, 200);
    hoja.setColumnWidth(9, 220);
    hoja.setColumnWidth(11, 110);
  }
  // Si la hoja se creó con una versión anterior, agrega los encabezados que falten.
  if (hoja.getRange(1, COLUMNAS.length).getValue() !== COLUMNAS[COLUMNAS.length - 1]) {
    hoja.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS])
      .setFontWeight('bold').setBackground('#0B4250').setFontColor('#ffffff');
  }
  return hoja;
}

function obtenerCarpeta_() {
  const props = PropertiesService.getScriptProperties();
  const idGuardado = props.getProperty('CARPETA_FOTOS_ID');
  if (idGuardado) {
    try { return DriveApp.getFolderById(idGuardado); } catch (err) { /* fue borrada */ }
  }
  const existentes = DriveApp.getFoldersByName(CONFIG.CARPETA_FOTOS);
  const carpeta = existentes.hasNext() ? existentes.next() : DriveApp.createFolder(CONFIG.CARPETA_FOTOS);
  props.setProperty('CARPETA_FOTOS_ID', carpeta.getId());
  return carpeta;
}

/** Convierte la foto que manda el celular (texto base64) en un archivo de Drive. */
function guardarFoto_(dataUrl, producto) {
  const partes = String(dataUrl).match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  if (!partes) throw new Error('Formato de foto no válido');

  const nombre = Utilities.formatDate(new Date(), CONFIG.ZONA_HORARIA, 'yyyyMMdd_HHmmss') + '_' +
    producto.replace(/[^\wáéíóúñÁÉÍÓÚÑ -]/g, '').slice(0, 40) + '.jpg';

  const blob = Utilities.newBlob(Utilities.base64Decode(partes[2]), partes[1], nombre);
  const archivo = obtenerCarpeta_().createFile(blob);

  // "Cualquiera con el enlace puede ver" para que la miniatura cargue en la app.
  try {
    archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    // Algunas cuentas empresariales no permiten compartir públicamente.
  }
  return { id: archivo.getId(), url: archivo.getUrl() };
}

function buscarFila_(hoja, id) {
  if (hoja.getLastRow() < 2) return 0;
  const celda = hoja.getRange('A2:A').createTextFinder(id).matchEntireCell(true).findNext();
  return celda ? celda.getRow() : 0;
}

function filaAObjeto_(hoja, numFila) {
  const rango = hoja.getRange(numFila, 1, 1, COLUMNAS.length);
  return construirObjeto_(rango.getValues()[0], rango.getDisplayValues()[0]);
}

function construirObjeto_(v, t) {
  return {
    id: String(v[0] || ''),
    fecha: t[1],
    hora: t[2],
    producto: String(v[3] || ''),
    cantidad: Number(v[4]) || 1,
    valor: Number(v[5]) || 0,
    personas: String(v[6] || '').split(',').map(function (s) { return s.trim(); }).filter(String),
    valorPorPersona: Number(v[7]) || 0,
    nota: String(v[8] || ''),
    fotoUrl: String(v[9] || ''),
    fotoId: extraerIdDrive_(v[9]),
    registrado: t[11],
    pago: String(v[12] || '')
  };
}

function extraerIdDrive_(enlace) {
  const m = String(enlace || '').match(/\/d\/([\w-]+)/);
  return m ? m[1] : '';
}

/** Evita que un texto que empiece por = + - @ se interprete como fórmula. */
function textoSeguro_(texto) {
  return /^[=+\-@]/.test(texto) ? "'" + texto : texto;
}

function respuesta_(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}
