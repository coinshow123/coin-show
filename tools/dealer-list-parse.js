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
    loc: /^(location|locations|from|hometown|address|city,?\s*(state|st)\.?(\s*\/\s*(website|web|url))?|city\s*\/\s*(state|st)\.?|(city,?\s*)?(state|st)\s*\/\s*website|website|web site)$/i
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
  var ACRO = {LLC:1,USA:1,US:1,PCGS:1,NGC:1,PMG:1,CAC:1,ANA:1,ANS:1,ANACS:1,APMEX:1,JRS:1,RCG:1,SPMC:1,CNG:1,UK:1,TV:1,II:1,III:1,IV:1,CSNS:1,PNG:1,NFL:1,MLB:1,NBA:1};
  var SMALL = {OF:1,AND:1,THE:1,FOR:1,A:1,AN:1,IN:1,ON:1,AT:1,BY:1,TO:1,OR:1};
  var SPECIAL = {INC:'Inc',CO:'Co',CORP:'Corp',LTD:'Ltd',INTL:'Intl',MT:'Mt',FT:'Ft',ST:'St'};
  /* "A COIN & SILVER SHOP $" -> "A Coin & Silver Shop". Only touches names typed in ALL CAPS. */
  function tidyName(s) {
    var t = String(s || '').replace(/(\s*[*$\u2020\u2021\u00a7^~+]+)+\s*$/, '').replace(/^\s*[*$\u2020\u2021]+\s*/, '').trim();
    if (/[a-z]/.test(t) || !/[A-Z]{2}/.test(t)) return t;
    if (/^(www\.)?[A-Z0-9-]+(\.[A-Z]{2,})+$/.test(t)) return t.toLowerCase();
    return t.split(/(\s+)/).map(function (w, i) {
      if (/^\s+$/.test(w) || !w) return w;
      if (/\d/.test(w) || /^([A-Z]\.){2,}$/.test(w)) return w;
      if (/^(www\.)?[A-Z0-9-]+\.(COM|NET|ORG|US|BIZ|INFO)$/.test(w)) return w.toLowerCase();
      return w.split(/([-\/&])/).map(function (part) {
        var core = part.replace(/[^A-Z']/g, ''), base = core.replace(/'S$/, '');
        if (!core) return part;
        if (ACRO[base]) return part;
        if (SPECIAL[base]) return part.replace(base, SPECIAL[base]);
        if (SMALL[core] && i > 0) return part.toLowerCase();
        if (base.length <= 3 && !/[AEIOUY]/.test(base)) return part;
        return part.charAt(0) + part.slice(1).toLowerCase().replace(/(mc)([a-z])/, function (m, a, b) { return a + b.toUpperCase(); });
      }).join('');
    }).join('');
  }
  /* "ABBOTT, MIKE" -> "Mike Abbott" (people listed last name first) */
  function personName(s) {
    var m = s.match(/^([A-Za-z'.-]+),\s+([A-Za-z]+(?:\s+[A-Za-z]\.?)?)$/);
    if (m && !/^(inc|llc|ltd|co|corp|intl|jr|sr)\.?$/i.test(m[2])) return m[2] + ' ' + m[1];
    return s;
  }
  var isWeb = function (p) { return /^(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|us|biz|info|co|coin|coins|store|shop)(\/\S*)?$/i.test(p.trim()); };
  /* "NEW YORK, NY / NUMISMATICS.ORG" -> {city, state, website}. Slogans like "BUYING & SELLING" are ignored. */
  function readLoc(text, cityIndex) {
    var out = { city: '', state: '', website: '', unknown: '' };
    String(text || '').split(/\s+\/\s+|\s*;\s*/).forEach(function (part) {
      part = part.trim(); if (!part) return;
      if (isWeb(part)) { if (!out.website) out.website = part.toLowerCase().replace(/^https?:\/\//, ''); return; }
      if (out.state) return;
      var m = part.match(/^(.*?)[,\s]+([A-Za-z]{2}|[A-Za-z][A-Za-z ]{3,})\.?$/);
      if (m && stateCode(m[2]) && m[1].trim()) { out.city = m[1].replace(/,\s*$/, '').trim(); out.state = stateCode(m[2]); return; }
      if (cityIndex) {
        var hits = Object.keys(cityIndex).filter(function (st) { return cityIndex[st][norm(part)]; });
        if (hits.length === 1) { out.city = part; out.state = hits[0]; return; }
      }
      if (!out.unknown) out.unknown = part;
    });
    return out;
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
          d._loc = get('loc');
          var L = readLoc(d._loc, cityIndex);
          d.city = d.city || L.city; d.state = d.state || L.state; d.website = L.website; d._unknown = L.unknown;
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
      // a wrapped line: no table number, continuing the row above
      var prev = out[out.length - 1];
      if (header && prev && !d.table && prev.table) {
        if (!d.name && d._loc !== undefined) {
          var L2 = readLoc((prev._loc || '') + ' / ' + d._loc, cityIndex);
          prev._loc = (prev._loc || '') + ' / ' + d._loc;
          prev.city = prev.city || L2.city; prev.state = prev.state || L2.state; prev.website = prev.website || L2.website;
          prev.flag = flagFor(prev); return;
        }
        if (/[\/&-]\s*$/.test(prev.name)) { prev.name = clean(prev.name + ' ' + d.name); prev.flag = flagFor(prev); return; }
      }
      if (!d.name) { skipped.push(joined); return; }
      // headings above the first real dealer line ("Our Dealers") are not dealers
      if (!header && !out.length && !d.table && !d.state) { skipped.push(joined); return; }
      d.flag = flagFor(d);
      out.push(d);
    });
    // lists with no city or state column at all: nothing to check there
    function flagFor(d) {
      var why = [], hasPlace = !header || header.loc !== undefined || header.city !== undefined || header.state !== undefined;
      if (hasPlace) {
        if (header && header.loc !== undefined && !header.city && !header.state) {
          // only flag a location we could not understand (a website or nothing at all is fine)
          if (d._unknown && !d.state) why.push('city and state');
        } else {
          if (!d.state || !STATES[d.state]) why.push('state');
          if (!d.city) why.push('city');
        }
      }
      return why.length ? 'check ' + why.join(' and ') : '';
    }
    var anyTable = out.some(function (d) { return d.table; });
    out.forEach(function (d) {
      d.name = personName(tidyName(d.name));
      d.city = tidyName(d.city);
      if (d.table) d.table = String(d.table).replace(/\s*,\s*/g, ', ');
      if (anyTable && !d.table) d.flag = d.flag ? d.flag + ', table' : 'check table';
      if (!d.website) delete d.website;
      delete d._loc; delete d._unknown;
    });
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
  var api = { tidyName: tidyName, parse: parse, linesFromPdfItems: linesFromPdfItems, linesFromTable: linesFromTable, cityIndexFrom: cityIndexFrom, stateCode: stateCode };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.DealerList = api;
})(this);
