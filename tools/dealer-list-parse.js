/* The Coin Calendar: dealer list reader (shared by the website test page and the GitHub reader).
   Input: rows of cells, each cell {text, x0, x1} (PDF words grouped by position, or spreadsheet columns).
   Output: dealers [{name, table, city, state, flag}] where flag says what needs a human look.
   No libraries. Works in browsers and Node. */
(function (root) {
  'use strict';
  var STATES = {AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'};
  var BY_NAME = {};
  Object.keys(STATES).forEach(function (c) { BY_NAME[STATES[c].toLowerCase()] = c; });
  function stateCode(s) {
    var t = String(s || '').trim().replace(/\.$/, '');
    if (STATES[t.toUpperCase()] && t.length === 2) return t.toUpperCase();
    return BY_NAME[t.toLowerCase()] || '';
  }
  var TABLE_RE = /^(?:table|booth|tbl\.?)?\s*#?\s*(\d{1,4}[A-Za-z]?(?:\s*[-–&,\/]\s*\d{1,4}[A-Za-z]?)*)$/i;
  function tableOf(s) { var m = String(s || '').trim().match(TABLE_RE); return m ? m[1].replace(/\s+/g, '').replace(/–/g, '-') : ''; }
  var HEAD = {
    table: /^(table|tables|table\s*#|tbl|booth|booth\s*#|#|no\.?|number)$/i,
    name: /^(dealer|dealers|dealer name|company|business|business name|name|firm|exhibitor|vendor)$/i,
    city: /^(city|town)$/i,
    state: /^(state|st|st\.)$/i,
    loc: /^(location|city,?\s*state|city\s*\/\s*state|from|hometown)$/i
  };
  function headerMap(cells) {
    var map = {}, hits = 0;
    cells.forEach(function (c, i) {
      var t = c.text.trim();
      Object.keys(HEAD).forEach(function (k) { if (map[k] === undefined && HEAD[k].test(t)) { map[k] = i; hits++; } });
    });
    return hits >= 2 && map.name !== undefined ? map : null;
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/\./g, '').replace(/^st\s/, 'saint ').replace(/^ft\s/, 'fort ').replace(/['-]/g, ' ').replace(/\s+/g, ' ').trim(); }
  /* Split "Name City" when we know the state: try the longest ending that is a real city in that state. */
  function splitCity(text, st, cityIndex) {
    var t = text.replace(/[,|]+\s*$/, '').trim(), m = t.match(/^(.*?)[,|]\s*([^,|]+)$/);
    if (m) return { name: m[1].trim(), city: m[2].trim() };
    if (cityIndex && cityIndex[st]) {
      var w = t.split(/\s+/);
      for (var n = Math.min(4, w.length - 1); n >= 1; n--) {
        var cand = w.slice(w.length - n).join(' ');
        if (cityIndex[st][norm(cand)]) return { name: w.slice(0, w.length - n).join(' '), city: cand };
      }
    }
    return { name: t, city: '' };
  }
  function clean(s) { return String(s || '').replace(/\s+/g, ' ').replace(/^[\s,;|·-]+|[\s,;|·-]+$/g, '').trim(); }
  var JUNK = /^(page\s*\d+|dealer list|bourse|floor plan|updated|subject to change|questions|thank you|www\.|http)/i;

  function parse(lines, opts) {
    opts = opts || {};
    var cityIndex = opts.cityIndex || null, out = [], skipped = [], header = null, cols = null;
    // anything above the column headings (show title, date) is not a dealer
    var firstHead = -1;
    for (var li = 0; li < lines.length && firstHead < 0; li++) if (headerMap(lines[li].filter(function (c) { return String(c.text).trim(); }))) firstHead = li;
    if (firstHead > 0) { lines.slice(0, firstHead).forEach(function (cells) { skipped.push(cells.map(function (c) { return c.text; }).join(' ')); }); lines = lines.slice(firstHead); }
    lines.forEach(function (cells) {
      cells = cells.filter(function (c) { return String(c.text).trim() !== ''; });
      if (!cells.length) return;
      var joined = cells.map(function (c) { return c.text; }).join(' ').trim();
      var h = headerMap(cells);
      if (h) { header = h; cols = cells.map(function (c) { return (c.x0 + c.x1) / 2; }); return; }
      if (!/[A-Za-z]{2}/.test(joined) || JUNK.test(joined)) { skipped.push(joined); return; }
      var d = { name: '', table: '', city: '', state: '' };
      if (header && cols) {
        // put each cell under the nearest header column
        var byCol = {};
        cells.forEach(function (c) {
          var mid = (c.x0 + c.x1) / 2, best = 0, bd = 1e9;
          cols.forEach(function (x, i) { var dd = Math.abs(x - mid); if (c.x0 <= x && x <= c.x1) dd = 0; if (dd < bd) { bd = dd; best = i; } });
          byCol[best] = byCol[best] ? byCol[best] + ' ' + c.text : c.text;
        });
        var get = function (k) { return header[k] !== undefined ? clean(byCol[header[k]] || '') : ''; };
        d.name = get('name'); d.table = tableOf(get('table')) || get('table'); d.city = get('city'); d.state = stateCode(get('state')) || get('state');
        if (header.loc !== undefined) {
          var loc = get('loc'), lm = loc.match(/^(.*?)[,\s]+([A-Za-z]{2}|[A-Za-z ]{4,})$/);
          if (lm && stateCode(lm[2])) { d.city = d.city || clean(lm[1]); d.state = d.state || stateCode(lm[2]); } else if (loc) d.city = d.city || loc;
        }
        if (!d.state && d.city) { var cm = d.city.match(/^(.*?),?\s+([A-Z]{2})$/); if (cm && stateCode(cm[2])) { d.city = clean(cm[1]); d.state = cm[2]; } }
      } else {
        // no header: work it out from the pieces
        var rest = cells.map(function (c) { return clean(c.text); });
        var i;
        for (i = 0; i < rest.length; i++) { var tb = tableOf(rest[i]); if (tb) { d.table = tb; rest.splice(i, 1); break; } }
        if (!d.table) { var tm = rest.length ? rest[0].match(/^(?:table|booth|tbl\.?)?\s*#?\s*(\d{1,4}[A-Za-z]?(?:\s*[-–&\/]\s*\d{1,4}[A-Za-z]?)*)\s+(.*)$/i) : null; if (tm) { d.table = tm[1].replace(/\s+/g, '').replace(/–/g, '-'); rest[0] = tm[2]; } }
        if (!d.table && rest.length) { var te = rest[rest.length - 1].match(/^(.*?)\s+(?:table|booth)?\s*#?(\d{1,4}[A-Za-z]?)$/i); if (te) { d.table = te[2]; rest[rest.length - 1] = te[1]; } }
        for (i = rest.length - 1; i >= 0; i--) { var sc = stateCode(rest[i]); if (sc) { d.state = sc; rest.splice(i, 1); break; } }
        if (!d.state && rest.length) {
          var se = rest[rest.length - 1].match(/^(.*?)[,\s]+([A-Z]{2})$/);
          if (se && stateCode(se[2])) { d.state = se[2]; rest[rest.length - 1] = se[1]; }
        }
        rest = rest.map(clean).filter(String);
        if (rest.length >= 2 && d.state) { d.city = rest.pop(); d.name = rest.join(' '); }
        else if (rest.length >= 2) { d.name = rest[0]; d.city = rest.slice(1).join(' '); }
        else if (rest.length === 1) {
          if (d.state) { var sp = splitCity(rest[0], d.state, cityIndex); d.name = sp.name; d.city = sp.city; } else d.name = rest[0];
        }
      }
      d.name = clean(d.name); d.city = clean(d.city);
      if (!d.name) { skipped.push(joined); return; }
      // headings above the first real dealer line ("Our Dealers") are not dealers
      if (!header && !out.length && !d.table && !d.state) { skipped.push(joined); return; }
      var why = [];
      if (!d.state || !STATES[d.state]) why.push('state');
      if (!d.city) why.push('city');
      d.flag = why.length ? 'check ' + why.join(' and ') : '';
      out.push(d);
    });
    var anyTable = out.some(function (d) { return d.table; });
    if (anyTable) out.forEach(function (d) { if (!d.table) d.flag = d.flag ? d.flag + ', table' : 'check table'; });
    return { dealers: out, skipped: skipped, header: !!header };
  }

  /* PDF words (pdf.js text items) -> rows of cells, using where each word sits on the page. */
  function linesFromPdfItems(items) {
    var words = items.filter(function (it) { return it.str && it.str.trim(); }).map(function (it) {
      var x = it.transform[4], y = it.transform[5], w = it.width || it.str.length * (Math.abs(it.transform[0]) * 0.5);
      return { text: it.str, x0: x, x1: x + w, y: y, h: Math.abs(it.transform[3]) || 10, page: it.page || 0 };
    });
    words.sort(function (a, b) { return a.page - b.page || b.y - a.y || a.x0 - b.x0; });
    var rows = [];
    words.forEach(function (w) {
      var r = rows.length ? rows[rows.length - 1] : null;
      if (r && r.page === w.page && Math.abs(r.y - w.y) <= Math.max(2.5, w.h * 0.35)) r.words.push(w);
      else rows.push({ y: w.y, page: w.page, words: [w] });
    });
    return rows.map(function (r) {
      r.words.sort(function (a, b) { return a.x0 - b.x0; });
      var cells = [];
      r.words.forEach(function (w) {
        var c = cells.length ? cells[cells.length - 1] : null;
        var gap = c ? w.x0 - c.x1 : 1e9, space = w.h * 0.9;
        if (c && gap < space) { c.text += (gap > w.h * 0.12 ? ' ' : '') + w.text; c.x1 = Math.max(c.x1, w.x1); }
        else cells.push({ text: w.text, x0: w.x0, x1: w.x1 });
      });
      return cells;
    });
  }
  /* Spreadsheet or CSV rows -> rows of cells */
  function linesFromTable(rows) {
    return rows.map(function (r) { return r.map(function (v, i) { return { text: v == null ? '' : String(v), x0: i * 100, x1: i * 100 + 90 }; }); });
  }
  /* "the long city list" -> {CA: {"rancho cordova": 1, ...}} */
  function cityIndexFrom(citiesJson) {
    var idx = {};
    Object.keys(citiesJson).forEach(function (k) { var p = k.split('|'); (idx[p[1]] = idx[p[1]] || {})[p[0]] = 1; });
    return idx;
  }
  var api = { parse: parse, linesFromPdfItems: linesFromPdfItems, linesFromTable: linesFromTable, cityIndexFrom: cityIndexFrom, stateCode: stateCode };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.DealerList = api;
})(this);
