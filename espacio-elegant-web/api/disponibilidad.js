const { JWT } = require('google-auth-library');
const LOGO_DATA_URI = require('./_logo.js');

const PX_DISPONIBLE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAABnElEQVR42gXByQHcMAwDQICHtP2Xl29+qcA2D2SG//7+Md9N5aNyv5P1W2inLK2XWiLkZUG9d8OMDcre3Js0q3iFESzOoDlIL8P6wedtCJlnYm/gm5poul/DiMuXtIBs7yq7F3Fm1FYStj5cHPSxHlj9rA0nqPaZhenZXT1D77CzoYuTjTdcm/1+PqtZqlI8S+XiYs14BItXCxFr93QN66d8yn6/eiDTMIAH55cLzEiw6wXOF4OBDbLNfsEHxs+Fq3WkLQzTjm8ZJV4Gn3rtKmD8qoksb8+c6vWBzk4z28dhDvYzmw6bH+GfYoV2C6ICtsDxMVOIk1TAmKblOs+z7SeCJmLe8RjIx54Pl0cm41RU2dLigyg7kSuAUYKr/aCxhuDGN59FQ3ZSmfv6upTvNAUrcORjI3nd9m5+B0s4TkhsLKNtslgz3g3LIcKmIDyBo5rPKflRtEvrFGXUiZ98Z+djmMs7YViNObNvsXDsll2+2BXXFVgZEY7BNyCHHQqN2kc+VtbzcuzMbLjt94hvE9Mr3wUCKReSvUvw43/Aq1fogfIxkgAAAABJRU5ErkJggg==';
const PX_OCUPADO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAABmklEQVR42gXBiYEENwwDMOqzr8VUkTLT0o4lkQHsv3//wa/q8htkrtZja22kQWRtbG166PuU+UbOEa5jeXKD5cZJpvvRlYFQvhS/uWU+EeWOW+83dP+uZscBpwG6c4Lm/mykP/tp4ZnyMLO6bmLwZZasPsIar/AD9FUYZvNYGF9vcjgwi6VtojBmR2+QrkF57kB/XCk0NyBPbOX6nGyEKMOM6Od5y+gtN8OJVtBecHKqvDnpFgVh13UYH6zEbl5T1wtFaokoz1XnQT2FNRWbEz95OPtatPUGXhLfg8rZzGzpT3MSZg4IkRhETgrPBfkNQif9fc4j1wljgcJki/atrNrfNaKQcux4E915lxwPj4/PRFijC6a+TN59CM1zzoSiEEFMOp1CTuQMFXCmcKiB8YRNIXlhgrZ911xIf41TDcu1ZcxN3wU/0dfodpEc6zqBL8zkdvZp0GkZPJ2C2uU4XKtzrAml8uOaBQPeNAfKPhqra4QAY30r0P2NIvJpz9qanpubRzHXj9bceZ0bCyaMJQdDeGfMgkn9if8DCuhc5Bp/fAgAAAAASUVORK5CYII=';

// ---------------------- CONFIGURACIÓN DEL ESPACIO ----------------------
const START_HOUR = 8;
const END_HOUR = 23;
const SLOT_MINUTES = 30;
const BUFFER_MINUTES = 30;
const NO_BUFFER_TAG = '#sinbuffer';
const BUFFER_BEFORE_TAG = '#bufferantes';
const DAYS_PER_WEEK = 6; // lunes a sábado
const MAX_MONTHS_AHEAD = 1; // deja ver el mes actual completo + el siguiente completo
const TZ_OFFSET_HOURS = 3; // Argentina (Tucumán) = UTC-3, sin horario de verano
// -------------------------------------------------------------------------

const DIAS_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

module.exports = async (req, res) => {
  try {
    const params = req.query || {};

    // "Hoy" en horario de Tucumán, como fecha civil (año/mes/día), sin horas.
    const nowUTC = new Date();
    const tucumanShifted = new Date(nowUTC.getTime() - TZ_OFFSET_HOURS * 3600000);
    const today = civilDate(tucumanShifted.getUTCFullYear(), tucumanShifted.getUTCMonth(), tucumanShifted.getUTCDate());

    // Se puede ver 1 semana hacia atrás además de la actual (referencia/margen).
    const minMonday = addDays(getMonday(today), -7);

    // El mes siguiente recién se "libera" en la vista pública al llegar a la
    // última semana del mes actual (momento en que se confirman las renovaciones
    // con los clientes). Antes de eso, el tope de navegación es fin del mes actual.
    const lastDayOfCurrentMonth = civilDate(today.getUTCFullYear(), today.getUTCMonth() + 1, 0);
    const lastWeekStartOfCurrentMonth = getMonday(lastDayOfCurrentMonth);
    const nextMonthUnlocked = today.getTime() >= lastWeekStartOfCurrentMonth.getTime();

    const maxMonday = nextMonthUnlocked
      ? getMonday(civilDate(today.getUTCFullYear(), today.getUTCMonth() + 1 + MAX_MONTHS_AHEAD, 0))
      : lastWeekStartOfCurrentMonth;

    let monday = params.start ? parseCivilDate(params.start) : today;
    monday = getMonday(monday);
    if (monday.getTime() < minMonday.getTime()) monday = minMonday;
    if (monday.getTime() > maxMonday.getTime()) monday = maxMonday;

    const sunday = addDays(monday, DAYS_PER_WEEK - 1);
    const queryStartUTC = civilDateTimeToUTC(monday, 0, 0);
    const queryEndUTC = civilDateTimeToUTC(addDays(monday, DAYS_PER_WEEK), 0, 0);

    const events = await fetchCalendarEvents(queryStartUTC, queryEndUTC);
    const occupiedByDay = buildOccupiedByDay(events, monday, DAYS_PER_WEEK);

    const html = renderWeekPage({ monday, sunday, occupiedByDay, minMonday, maxMonday, todaysBaseUrl: baseUrl(req) });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store'); // siempre datos frescos, sin problemas de caché
    res.status(200).send(html);
  } catch (err) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(500).send('Ocurrió un error mostrando la disponibilidad: ' + err.message);
  }
};

// ==================== GOOGLE CALENDAR ====================
async function fetchCalendarEvents(timeMinUTC, timeMaxUTC) {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const calendarId = process.env.CALENDAR_ID;

  if (!email || !key || !calendarId) {
    throw new Error('Faltan variables de entorno (GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY o CALENDAR_ID) en la configuración de Vercel.');
  }

  const client = new JWT({
    email: email,
    key: key,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  });
  const tokenResponse = await client.authorize();

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendarId) + '/events');
  url.searchParams.set('timeMin', timeMinUTC.toISOString());
  url.searchParams.set('timeMax', timeMaxUTC.toISOString());
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', '2500');

  const resp = await fetch(url.toString(), {
    headers: { Authorization: 'Bearer ' + tokenResponse.access_token },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error('La API de Calendar respondió ' + resp.status + ': ' + text.substring(0, 300));
  }

  const data = await resp.json();
  return data.items || [];
}

// ==================== FECHAS "CIVILES" (año/mes/día, sin horas) ====================
function civilDate(year, month, day) {
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
}

function parseCivilDate(isoDateStr) {
  var parts = isoDateStr.split('-').map(Number);
  return civilDate(parts[0], parts[1] - 1, parts[2]);
}

function addDays(civil, n) {
  return new Date(civil.getTime() + n * 86400000);
}

function getMonday(civil) {
  var day = civil.getUTCDay(); // 0 = domingo
  var diff = day === 0 ? -6 : 1 - day;
  return addDays(civil, diff);
}

function fmtCivil(civil) {
  var y = civil.getUTCFullYear();
  var m = String(civil.getUTCMonth() + 1).padStart(2, '0');
  var d = String(civil.getUTCDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

function civilDateTimeToUTC(civil, hour, minute) {
  return new Date(civil.getTime() + (hour * 60 + minute) * 60000 + TZ_OFFSET_HOURS * 3600000);
}

// ==================== LÓGICA DE OCUPACIÓN / BUFFER ====================
function buildOccupiedByDay(events, weekMonday, numDays) {
  var byDay = {};

  events.forEach(function (ev) {
    if (!ev.start || !ev.start.dateTime || !ev.end || !ev.end.dateTime) return; // ignora eventos de "todo el día"

    var evStart = new Date(ev.start.dateTime);
    var evEnd = new Date(ev.end.dateTime);
    var text = ((ev.summary || '') + ' ' + (ev.description || '')).toLowerCase();
    var noBuffer = text.indexOf(NO_BUFFER_TAG) !== -1;
    var bufferBefore = !noBuffer && text.indexOf(BUFFER_BEFORE_TAG) !== -1;

    var bufferedStart = bufferBefore ? new Date(evStart.getTime() - BUFFER_MINUTES * 60000) : evStart;
    var bufferedEnd = noBuffer ? evEnd : new Date(evEnd.getTime() + BUFFER_MINUTES * 60000);

    // A qué día de la semana (0-5) corresponde el INICIO del evento, en hora de Tucumán.
    // OJO: acá vamos de UTC -> hora local, así que se RESTA el offset (al revés que
    // civilDateTimeToUTC, que va de local -> UTC y por eso suma).
    var evStartTucuman = new Date(evStart.getTime() - TZ_OFFSET_HOURS * 3600000);
    var evStartCivil = civilDate(evStartTucuman.getUTCFullYear(), evStartTucuman.getUTCMonth(), evStartTucuman.getUTCDate());
    var dayIndex = Math.round((evStartCivil.getTime() - weekMonday.getTime()) / 86400000);

    if (dayIndex < 0 || dayIndex >= numDays) return;

    if (!byDay[dayIndex]) byDay[dayIndex] = [];
    byDay[dayIndex].push({ start: bufferedStart, end: bufferedEnd });
  });

  return byDay;
}

function isSlotOccupied(slotStartUTC, slotEndUTC, intervals) {
  for (var i = 0; i < intervals.length; i++) {
    if (slotStartUTC < intervals[i].end && slotEndUTC > intervals[i].start) return true;
  }
  return false;
}

function buildSlotLabels() {
  var slots = [];
  for (var h = START_HOUR; h <= END_HOUR; h++) {
    slots.push({ h: h, m: 0, label: pad(h) + ':00' });
    if (h !== END_HOUR) slots.push({ h: h, m: 30, label: pad(h) + ':30' });
  }
  return slots;
}

function pad(n) { return (n < 10 ? '0' : '') + n; }

function baseUrl(req) {
  var proto = req.headers['x-forwarded-proto'] || 'https';
  var host = req.headers['x-forwarded-host'] || req.headers.host;
  return proto + '://' + host;
}

// ==================== HTML / ESTILOS (mobile-first) ====================
function renderWeekPage(opts) {
  var monday = opts.monday, sunday = opts.sunday, occupiedByDay = opts.occupiedByDay;
  var minMonday = opts.minMonday, maxMonday = opts.maxMonday, base = opts.todaysBaseUrl;

  var slots = buildSlotLabels();

  var headerCells = '';
  for (var d = 0; d < DAYS_PER_WEEK; d++) {
    var dayDate = addDays(monday, d);
    headerCells += '<th><span class="dname">' + DIAS_CORTO[dayDate.getUTCDay()] + '</span><span class="dnum">' + dayDate.getUTCDate() + '</span></th>';
  }

  var rowsHtml = '';
  for (var s = 0; s < slots.length; s++) {
    var slot = slots[s];
    rowsHtml += '<tr><td class="hour">' + slot.label + '</td>';
    for (var d2 = 0; d2 < DAYS_PER_WEEK; d2++) {
      var dayDate2 = addDays(monday, d2);
      var slotStartUTC = civilDateTimeToUTC(dayDate2, slot.h, slot.m);
      var slotEndUTC = new Date(slotStartUTC.getTime() + SLOT_MINUTES * 60000);
      var intervals = occupiedByDay[d2] || [];
      var occupied = isSlotOccupied(slotStartUTC, slotEndUTC, intervals);
      rowsHtml += '<td class="' + (occupied ? 'ocupado' : 'disponible') + '"></td>';
    }
    rowsHtml += '</tr>';
  }

  var prevMonday = addDays(monday, -7);
  var nextMonday = addDays(monday, 7);
  var canPrev = prevMonday.getTime() >= minMonday.getTime();
  var canNext = nextMonday.getTime() <= maxMonday.getTime();

  var prevBtn = canPrev
    ? '<a class="nav-btn" href="' + base + '/?start=' + fmtCivil(prevMonday) + '">&larr; Anterior</a>'
    : '<span class="nav-btn disabled">&larr; Anterior</span>';
  var nextBtn = canNext
    ? '<a class="nav-btn" href="' + base + '/?start=' + fmtCivil(nextMonday) + '">Siguiente &rarr;</a>'
    : '<span class="nav-btn disabled">Siguiente &rarr;</span>';

  var rangeLabel = monday.getUTCDate() + ' – ' + sunday.getUTCDate() + ' ' + MESES[sunday.getUTCMonth()].substring(0, 3) + '.';
  var footnote = canNext ? '' : '<p class="footnote">Por ahora se pueden ver turnos hasta ' + MESES[maxMonday.getUTCMonth()] + '.</p>';

  return '' +
'<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
'<meta name="viewport" content="width=device-width, initial-scale=1">' +
'<meta name="color-scheme" content="only light">' +
'<title>Espacio Elegant — Disponibilidad</title>' +
'<style>' +
'  :root{color-scheme:only light;--cream:#F7F2E9;--gold:#B08D57;--ink:#2A2420;--ocupado:#C96B5C;--disponible:#EDE7DA;--border:#E3DAC7;}' +
'  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}' +
'  html,body{margin:0;padding:0;background:var(--cream) !important;}' +
'  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:var(--ink);padding:18px 10px 40px;max-width:480px;margin:0 auto;}' +
'  .brand{display:flex;align-items:center;justify-content:center;margin-bottom:2px;}' +
'  .brand-mark{height:46px;width:auto;object-fit:contain;display:block;}' +
'  h1{text-align:center;font-family:Georgia,"Times New Roman",serif;font-size:20px;margin:10px 0 0;font-weight:normal;letter-spacing:.5px;}' +
'  .sub{display:block;text-transform:uppercase;font-size:17px;font-weight:bold;letter-spacing:1.5px;margin-top:2px;color:var(--ink);}' +
'  .nav{display:flex;justify-content:space-between;gap:8px;margin:16px 0;}' +
'  .nav-btn{flex:1;text-align:center;text-decoration:none;color:var(--ink);background:var(--disponible);border:1px solid var(--border);padding:12px 8px;border-radius:10px;font-size:14px;font-weight:600;}' +
'  .nav-btn.disabled{opacity:.35;}' +
'  .color-note{display:flex;justify-content:center;gap:16px;margin:10px 0 4px;font-size:13px;flex-wrap:wrap;}' +
'  .color-note span{display:inline-flex;align-items:center;gap:6px;}' +
'  .color-note b{font-weight:700;}' +
'  .swatch{width:13px;height:13px;border-radius:3px;display:inline-block;border:1px solid var(--border);}' +
'  .swatch.oc{background-image:url(' + PX_OCUPADO + ');background-repeat:repeat;}' +
'  .swatch.disp{background-image:url(' + PX_DISPONIBLE + ');background-repeat:repeat;}' +
'  .table-wrap{border-radius:12px;border:1px solid var(--border);overflow:hidden;}' +
'  table{border-collapse:collapse;width:100%;table-layout:fixed;background:var(--cream);}' +
'  th{background:var(--cream);color:var(--ink);font-size:10px;text-transform:uppercase;letter-spacing:.3px;padding:6px 1px;border-bottom:2px solid var(--gold);text-align:center;line-height:1.3;}' +
'  th .dname{display:block;color:#7a7266;}' +
'  th .dnum{display:block;font-size:13px;font-weight:bold;color:var(--ink);}' +
'  td.hour{width:44px;}' +
'  td{border:1px solid var(--border);height:18px;padding:0;}' +
'  td.hour{font-size:11px;text-align:right;padding-right:5px;color:#5a5245;font-weight:600;white-space:nowrap;background:var(--cream);}' +
'  td.disponible{background-image:url(' + PX_DISPONIBLE + ');background-repeat:repeat;}' +
'  td.ocupado{background-image:url(' + PX_OCUPADO + ');background-repeat:repeat;}' +
'  .footnote{text-align:center;font-size:9px;color:#8a8172;margin:10px 0;line-height:1.4;}' +
'  .legal-small{text-align:center;font-size:9px;color:#a39a8c;margin:0 0 12px;line-height:1.3;padding:0 6px;}' +
'  @media (min-width:480px){ td{height:22px;} th{font-size:12px;padding:9px 2px;} th .dnum{font-size:15px;} td.hour{font-size:13px;} }' +
'</style></head><body>' +
'  <div class="brand"><img class="brand-mark" src="' + LOGO_DATA_URI + '" alt="Espacio Elegant" /></div>' +
'  <h1>Disponibilidad<span class="sub">' + rangeLabel + '</span></h1>' +
'  <div class="color-note"><span><span class="swatch oc"></span><b>Rojo</b> = Ocupado</span><span><span class="swatch disp"></span><b>Beige</b> = Disponible</span></div>' +
'  <div class="nav">' + prevBtn + nextBtn + '</div>' +
'  <p class="legal-small">*Disponibilidad sujeta a cambios. Consultar vigencia al momento de reserva. El alquiler es mínimo una hora.</p>' +
'  <div class="table-wrap"><table><thead><tr><th></th>' + headerCells + '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>' +
  footnote +
'</body></html>';
}
