/* The Coin Calendar page behavior: main menu, major-show slider, date strip,
   20-per-page lists with filter chips, and "near me" (runs in the browser; the ZIP never leaves the device). */
(function () {
  'use strict';
  var body = document.body;
  var ROOT = body.getAttribute('data-root') || './';
  var PREVIEW = body.getAttribute('data-preview') === '1';
  var PER_PAGE = 20;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  var now = new Date(); now.setHours(0, 0, 0, 0);
  var TODAY = iso(now);
  function link(p) { return ROOT + p + (PREVIEW && /\/$/.test(p) ? 'index.html' : ''); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  var phone = window.matchMedia('(max-width:760px)');

  /* ----- main menu (Menu button on tablets and phones; By state dropdown) ----- */
  var top = document.querySelector('.top');
  var navBtn = document.querySelector('.nav-btn');
  var dd = document.querySelector('.nv-dd');
  function setMenu(open) { if (!top) return; top.setAttribute('data-open', open ? 'true' : 'false'); if (navBtn) navBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); }
  if (navBtn) navBtn.addEventListener('click', function () { setMenu(top.getAttribute('data-open') !== 'true'); });
  document.addEventListener('click', function (e) {
    if (dd && dd.open && !dd.contains(e.target) && !(navBtn && getComputedStyle(navBtn).display !== 'none')) dd.open = false;
    if (top && top.getAttribute('data-open') === 'true' && !top.contains(e.target)) setMenu(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (dd && dd.open) { dd.open = false; dd.querySelector('summary').focus(); }
    if (top && top.getAttribute('data-open') === 'true') { setMenu(false); navBtn.focus(); }
  });
  if (top) top.addEventListener('click', function (e) { if (e.target.closest('.nav a') && top.getAttribute('data-open') === 'true') setMenu(false); });

  /* ----- major shows slider and countdowns ----- */
  var track = document.getElementById('major-track');
  if (track) {
    document.querySelectorAll('[data-slide]').forEach(function (b) {
      b.addEventListener('click', function () {
        var dir = Number(b.getAttribute('data-slide'));
        track.scrollBy({ left: dir * Math.max(286, track.clientWidth - 60), behavior: 'smooth' });
      });
    });
  }
  document.querySelectorAll('[data-countdown]').forEach(function (el) {
    var d = new Date(el.getAttribute('data-countdown') + 'T00:00:00');
    var days = Math.round((d - now) / 864e5);
    el.textContent = days <= 0 ? 'Happening now' : days === 1 ? 'Tomorrow' : days < 45 ? 'In ' + days + ' days' : 'In about ' + Math.round(days / 30) + ' months';
  });

  /* ----- whole list row opens the show ----- */
  document.addEventListener('click', function (e) {
    var tr = e.target.closest && e.target.closest('table.shows tbody tr');
    if (!tr || e.target.closest('a,button,input,select')) return;
    var a = tr.querySelector('.c-name a');
    if (a) location.href = a.href;
  });

  /* ----- state picker ----- */
  document.querySelectorAll('select[data-nav]').forEach(function (s) {
    s.addEventListener('change', function () { if (s.value) location.href = s.value; });
  });

  /* ----- lists: hide ended shows, filter chips, 20 per page ----- */
  function weekendRange() {
    var day = now.getDay(), fri = new Date(now);
    fri.setDate(now.getDate() + (day === 0 ? -2 : day === 6 ? -1 : 5 - day));
    var sun = new Date(fri); sun.setDate(fri.getDate() + 2);
    return [iso(fri), iso(sun)];
  }
  var WK = weekendRange();
  function inWeekend(r) { return r.getAttribute('data-s') <= WK[1] && r.getAttribute('data-e') >= WK[0]; }
  document.querySelectorAll('table.shows[data-per]').forEach(function (table) {
    var id = table.id;
    var per = Number(table.getAttribute('data-per')) || PER_PAGE;
    var onlyWk = table.getAttribute('data-filter') === 'weekend';
    var all = [].slice.call(table.tBodies[0].rows).filter(function (r) {
      var keep = r.getAttribute('data-e') >= TODAY && (!onlyWk || inWeekend(r));
      if (!keep) r.remove();
      return keep;
    });
    var rows = all, filter = 'all', page = 1;
    var pager = document.querySelector('[data-pager-for="' + id + '"]');
    var range = document.querySelector('[data-range-for="' + id + '"]');
    var empty = document.querySelector('[data-empty-for="' + id + '"]');
    var chips = document.querySelector('[data-chips-for="' + id + '"]');
    var section = table.closest('section');
    var emptyText = empty ? empty.textContent : '';
    var NAMES = { weekend: 'this weekend', major: 'major', free: 'free-admission' };

    function apply(f) {
      filter = f;
      rows = all.filter(function (r) {
        var keep = f === 'all' || (f === 'weekend' && inWeekend(r)) || (f === 'major' && r.classList.contains('is-major')) || (f === 'free' && r.getAttribute('data-free') === '1');
        if (!keep) r.hidden = true;
        return keep;
      });
      if (empty) {
        empty.hidden = rows.length > 0;
        empty.textContent = f === 'all' ? emptyText : 'No ' + NAMES[f] + ' shows are listed right now.';
      }
      show(1, false);
    }
    function show(p, scroll) {
      page = p;
      var pages = Math.max(1, Math.ceil(rows.length / per));
      rows.forEach(function (r, i) { r.hidden = i < (page - 1) * per || i >= page * per; });
      if (range) {
        var what = filter === 'weekend' ? ['show', 'shows', ' this weekend'] : filter === 'major' ? ['major show', 'major shows', ''] : ['upcoming show', 'upcoming shows', ''];
        range.textContent = rows.length
          ? 'Showing ' + ((page - 1) * per + 1) + '–' + Math.min(page * per, rows.length) + ' of ' + rows.length + ' ' + what[rows.length === 1 ? 0 : 1] + what[2] + (pages > 1 ? ' · Page ' + page + ' of ' + pages : '')
          : 'No ' + what[1] + ' listed' + what[2] + '.';
      }
      if (pager) {
        pager.innerHTML = '';
        if (pages > 1 && phone.matches) {
          if (page > 1) pager.appendChild(btn('Previous', 'pg-prev', page - 1));
          var info = document.createElement('span'); info.className = 'pg-info'; info.textContent = 'Page ' + page + ' of ' + pages; pager.appendChild(info);
          if (page < pages) pager.appendChild(btn('Next', 'pg-next', page + 1));
        } else if (pages > 1) {
          if (page > 1) pager.appendChild(btn('Previous', 'pg-prev', page - 1));
          for (var i = 1; i <= pages; i++) {
            var b = btn(String(i), '', i);
            b.setAttribute('aria-label', 'Page ' + i);
            if (i === page) b.setAttribute('aria-current', 'page');
            pager.appendChild(b);
          }
          if (page < pages) pager.appendChild(btn('Next page', 'pg-next', page + 1));
        }
      }
      if (scroll && section) section.scrollIntoView({ block: 'start' });
    }
    function btn(label, cls, target) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = label; if (cls) b.className = cls;
      b.addEventListener('click', function () { show(target, true); });
      return b;
    }
    if (chips) {
      chips.addEventListener('click', function (e) {
        var c = e.target.closest('.fchip'); if (!c) return;
        chips.querySelectorAll('.fchip').forEach(function (x) { x.setAttribute('aria-pressed', x === c ? 'true' : 'false'); });
        apply(c.getAttribute('data-f'));
      });
    }
    apply('all');
  });

  /* ----- copy link and dealer search (show pages) ----- */
  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var url = b.getAttribute('data-copy'), old = b.textContent;
      function done(msg) { b.textContent = msg; setTimeout(function () { b.textContent = old; }, 2500); }
      if (navigator.share && /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
        navigator.share({ title: document.title, url: url }).catch(function () {});
        return;
      }
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { done('Link copied'); }, function () { prompt('Copy this link:', url); });
      else prompt('Copy this link:', url);
    });
  });
  document.querySelectorAll('[data-filter-list]').forEach(function (inp) {
    var list = document.getElementById(inp.getAttribute('data-filter-list'));
    var none = document.querySelector('[data-empty-for-filter="' + list.id + '"]');
    var plain = function (t) { return String(t || '').toLowerCase().replace(/[^a-z0-9#]+/g, ' ').trim(); };
    inp.addEventListener('input', function () {
      var q = plain(inp.value), shown = 0;
      [].forEach.call(list.children, function (li) {
        // dealer lists search the name (and the table number); other lists search all their text
        var name = li.querySelector('.dl-name'), tb = li.querySelector('.dl-table:not(.dl-count)');
        var hay = name ? plain(name.textContent) + ' ' + (tb ? plain(tb.textContent) : '') : plain(li.textContent);
        var hit = !q || hay.indexOf(q) > -1 || (tb && plain(tb.textContent).replace(/#/g, '').split(' ').indexOf(q.replace(/#/g, '')) > -1);
        if (list._pager) li._q = !hit; else li.hidden = !hit;
        if (hit) shown++;
      });
      if (list._pager) list._pager(true);
      if (none) none.hidden = shown > 0;
    });
  });

  /* ----- near me and the date strip ----- */
  var form = document.getElementById('near-form');
  var outBox = document.getElementById('near');
  if (!form || !outBox) return;
  var zipIn = document.getElementById('near-zip');
  var radIn = document.getElementById('near-radius');
  var errEl = document.getElementById('near-err');
  var out = document.getElementById('near-results');
  var head = document.getElementById('h-near');
  var gps = document.getElementById('near-gps');
  var clearBtn = document.getElementById('near-clear');
  var radWrap = radIn ? radIn.closest('label') : null;
  var daysEl = document.getElementById('days');
  var data = null, zip3 = null, here = null, mode = '', curDay = '', hits = [], limit = 20;

  var specs = document.querySelector('.dealer-spec-chips');
  if (specs) specs.addEventListener('click', function (e) {
    var c = e.target.closest('.fchip'); if (!c) return;
    specs.querySelectorAll('.fchip').forEach(function (x) { x.setAttribute('aria-pressed', x === c ? 'true' : 'false'); });
    var v = c.getAttribute('data-spec');
    items.forEach(function (li) { li._sp = !!v && (' ' + li.getAttribute('data-sp') + ' ').indexOf(' ' + v + ' ') === -1; if (!list._pager) li.hidden = li._sp || li._st; });
    if (list._pager) list._pager(true);
  });
  var saved = store('bb-zip'); if (saved && /^\d{5}$/.test(saved)) zipIn.value = saved;
  var savedR = store('bb-radius'); if (savedR && radIn) radIn.value = savedR;

  function load() {
    if (data && zip3) return Promise.resolve();
    return Promise.all([
      fetch(link('assets/shows.json')).then(function (r) { return r.json(); }),
      fetch(link('assets/zip3.json')).then(function (r) { return r.json(); })
    ]).then(function (res) { data = res[0].filter(function (s) { return s.e >= TODAY; }); zip3 = res[1]; });
  }
  function miles(a, b, c, d) {
    var r = Math.PI / 180, h = Math.pow(Math.sin((c - a) * r / 2), 2) + Math.cos(a * r) * Math.cos(c * r) * Math.pow(Math.sin((d - b) * r / 2), 2);
    return 3959 * 2 * Math.asin(Math.sqrt(h));
  }
  var M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], W = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  function fmtDate(s, e) {
    var a = new Date(s + 'T00:00:00'), b = new Date(e + 'T00:00:00'), yr = now.getFullYear();
    var y = a.getFullYear() === yr && b.getFullYear() === yr ? '' : ', ' + b.getFullYear();
    var same = a.getMonth() === b.getMonth();
    var date = s === e ? M[a.getMonth()] + ' ' + a.getDate() + y : M[a.getMonth()] + ' ' + a.getDate() + '–' + (same ? '' : M[b.getMonth()] + ' ') + b.getDate() + y;
    var dow = s === e ? W[a.getDay()] : W[a.getDay()] + '–' + W[b.getDay()];
    var tm = same ? M[a.getMonth()] : M[a.getMonth()] + '–' + M[b.getMonth()];
    var td = s === e ? String(a.getDate()) : a.getDate() + '–' + b.getDate();
    return [date, dow, tm.toUpperCase(), td];
  }
  function fail(msg) { errEl.textContent = msg; errEl.hidden = false; }
  function open(scroll) {
    outBox.hidden = false;
    if (scroll) {
      var r = outBox.getBoundingClientRect();
      if (r.top < 0 || r.top > window.innerHeight * 0.55) outBox.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }
  function rowsHTML(list, withMiles) {
    return list.map(function (o) {
      var s = o.s, f = fmtDate(s.s, s.e);
      return '<tr><td class="c-date"><span class="d">' + esc(f[0]) + '</span><span class="dow">' + esc(f[1]) + '</span><span class="dtile" aria-hidden="true"><span class="tm">' + esc(f[2]) + '</span><span class="td">' + esc(f[3]) + '</span><span class="tw">' + esc(f[1]) + '</span></span></td>' +
        (withMiles ? '<td class="c-mi">' + Math.round(o.mi) + ' mi</td>' : '<td class="c-st">' + esc(s.st) + '</td>') +
        '<td class="c-name"><a href="' + esc(link(s.p)) + '">' + esc(s.n) + '</a><span class="sub">' + esc(s.c) + '<span class="st-in">, ' + esc(s.st) + '</span>' + (s.v ? ' · ' + esc(s.v) : '') + '</span></td></tr>';
    }).join('');
  }
  function table(list, withMiles) {
    return '<div class="table-wrap"><table class="shows"><thead><tr><th scope="col" class="c-date">Date</th>' + (withMiles ? '<th scope="col" class="c-mi">Distance</th>' : '<th scope="col" class="c-st">State</th>') + '<th scope="col">Name of the coin show</th></tr></thead><tbody>' + rowsHTML(list, withMiles) + '</tbody></table></div>';
  }
  function withDistance(list) {
    return list.map(function (s) { return { s: s, mi: here ? miles(here.lat, here.lon, s.la, s.lo) : 0 }; });
  }

  /* near-me view: shows within the radius, soonest first */
  function runNear(scroll) {
    mode = 'near'; curDay = '';
    if (daysEl) daysEl.querySelectorAll('.day').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
    var radius = Number(radIn ? radIn.value : 150);
    var all = withDistance(data);
    hits = all.filter(function (o) { return o.mi <= radius; })
      .sort(function (x, y) { return x.s.s < y.s.s ? -1 : x.s.s > y.s.s ? 1 : x.mi - y.mi; });
    limit = 20;
    head.textContent = 'Coin shows near ' + here.label;
    if (radWrap) radWrap.hidden = false;
    if (clearBtn) clearBtn.textContent = 'Change ZIP';
    if (!hits.length) {
      var nearest = all.sort(function (x, y) { return x.mi - y.mi; }).slice(0, 5).sort(function (x, y) { return x.s.s < y.s.s ? -1 : 1; });
      out.innerHTML = '<p class="near-note">No upcoming shows within ' + radius + ' miles. These are the closest ones:</p>' + table(nearest, true);
    } else drawNear();
    open(scroll);
  }
  function drawNear() {
    var radius = radIn ? radIn.value : 150;
    out.innerHTML = '<p class="near-note">' + hits.length + ' show' + (hits.length === 1 ? '' : 's') + ' within ' + radius + ' miles, soonest first.</p>' + table(hits.slice(0, limit), true) +
      (hits.length > limit ? '<button type="button" class="btn btn-ghost more-btn" id="near-more">Show more (' + (hits.length - limit) + ' left)</button>' : '');
    var more = document.getElementById('near-more');
    if (more) more.addEventListener('click', function () { limit += 20; drawNear(); });
  }

  /* day view: every show open that day, nearest first when we know the visitor's ZIP */
  function runDay(day) {
    mode = 'day'; curDay = day;
    daysEl.querySelectorAll('.day').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-day') === day ? 'true' : 'false'); });
    var d = new Date(day + 'T00:00:00');
    var list = withDistance(data.filter(function (s) { return s.s <= day && s.e >= day; }));
    list.sort(here ? function (x, y) { return x.mi - y.mi; } : function (x, y) { return x.s.st < y.s.st ? -1 : x.s.st > y.s.st ? 1 : x.s.n < y.s.n ? -1 : 1; });
    head.textContent = 'Coin shows on ' + DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate();
    if (radWrap) radWrap.hidden = true;
    if (clearBtn) clearBtn.textContent = 'Close';
    out.innerHTML = '<p class="near-note">' + list.length + ' show' + (list.length === 1 ? '' : 's') + (here ? ', nearest to ' + esc(here.label) + ' first.' : '. Enter your ZIP code above to sort by distance.') + '</p>' + table(list, !!here);
    open(true);
  }

  function fromZip(z, scroll) {
    return load().then(function () {
      var p = zip3[z.slice(0, 3)];
      if (!p) { fail('That ZIP code was not found. Check it and try again.'); return false; }
      store('bb-zip', z);
      here = { lat: p[0], lon: p[1], label: z };
      if (mode === 'day' && curDay) runDay(curDay); else runNear(scroll);
      return true;
    });
  }

  zipIn.addEventListener('input', function () { zipIn.value = zipIn.value.replace(/\D/g, '').slice(0, 5); errEl.hidden = true; });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errEl.hidden = true;
    var z = zipIn.value.trim();
    if (!/^\d{5}$/.test(z)) { fail('Enter a 5-digit ZIP code.'); zipIn.focus(); return; }
    mode = 'near';
    fromZip(z, true).catch(function () { fail('Shows could not load. Check your connection and try again.'); });
  });
  if (radIn) radIn.addEventListener('change', function () { store('bb-radius', radIn.value); if (here && mode === 'near') runNear(false); });
  if (clearBtn) clearBtn.addEventListener('click', function () {
    if (mode === 'day') {
      daysEl.querySelectorAll('.day').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
      if (here) { runNear(false); return; }
      outBox.hidden = true; mode = '';
      return;
    }
    zipIn.focus(); zipIn.select();
    form.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
  if (gps) {
    if (!('geolocation' in navigator)) gps.hidden = true;
    var gpsLabel = gps.innerHTML;
    gps.addEventListener('click', function () {
      errEl.hidden = true;
      gps.textContent = 'Finding you…';
      navigator.geolocation.getCurrentPosition(function (pos) {
        gps.innerHTML = gpsLabel;
        load().then(function () {
          here = { lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'you' };
          mode = 'near'; runNear(true);
        }).catch(function () { fail('Shows could not load. Check your connection and try again.'); });
      }, function () {
        gps.innerHTML = gpsLabel;
        fail('Your location is not available. Type your ZIP code instead.');
      }, { timeout: 10000, maximumAge: 600000 });
    });
  }
  if (daysEl) {
    daysEl.querySelectorAll('.day').forEach(function (b) { if (b.getAttribute('data-day') < TODAY) b.parentNode.hidden = true; });
    daysEl.addEventListener('click', function (e) {
      var b = e.target.closest('.day'); if (!b || b.disabled) return;
      var day = b.getAttribute('data-day');
      if (b.getAttribute('aria-pressed') === 'true') { clearBtn.click(); return; }
      load().then(function () { runDay(day); }).catch(function () { fail('Shows could not load. Check your connection and try again.'); });
    });
    /* returning visitor on the home page: show their local shows right away */
    if (saved && /^\d{5}$/.test(saved)) fromZip(saved, false).catch(function () {});
  }
})();

/* ----- Dealers page: nearest dealers to a ZIP code, and a state filter ----- */
(function () {
  'use strict';
  var form = document.getElementById('dealer-near'), list = document.getElementById('dealer-index');
  if (!form || !list) return;
  var zipIn = document.getElementById('dealer-zip'), err = document.getElementById('dealer-err');
  var note = document.getElementById('dealer-sort-note'), stSel = document.getElementById('dealer-state');
  var ROOT = document.body.getAttribute('data-root') || './';
  var items = [].slice.call(list.children), total = items.length;
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function miles(a, b, c, d) { var r = Math.PI / 180, h = Math.pow(Math.sin((c - a) * r / 2), 2) + Math.cos(a * r) * Math.cos(c * r) * Math.pow(Math.sin((d - b) * r / 2), 2); return 3959 * 2 * Math.asin(Math.sqrt(h)); }
  var zip3 = null;
  function run(z, scroll) {
    err.hidden = true;
    (zip3 ? Promise.resolve() : fetch(ROOT + 'assets/zip3.json').then(function (r) { return r.json(); }).then(function (j) { zip3 = j; })).then(function () {
      var p = zip3[z.slice(0, 3)];
      if (!p) { err.textContent = 'That ZIP code was not found. Check it and try again.'; err.hidden = false; return; }
      store('bb-zip', z);
      items.forEach(function (li) {
        var la = parseFloat(li.getAttribute('data-la')), lo = parseFloat(li.getAttribute('data-lo'));
        li._mi = isNaN(la) ? Infinity : miles(p[0], p[1], la, lo);
        li.querySelector('.dl-mi').textContent = !isFinite(li._mi) ? '' : li._mi < 5 ? 'Nearby · ' : Math.round(li._mi) + ' mi · ';
      });
      items.slice().sort(function (a, b) { return a._mi - b._mi; }).forEach(function (li) { list.appendChild(li); });
      if (list._pager) list._pager(true);
      var noloc = parseInt(note.getAttribute('data-noloc'), 10) || 0;
      note.textContent = total + ' dealer' + (total === 1 ? '' : 's') + ', nearest to ' + z + ' first' + (noloc ? ' · ' + noloc + ' without a listed city are at the end' : '');
      if (scroll) list.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }).catch(function () { err.textContent = 'Could not load. Check your connection and try again.'; err.hidden = false; });
  }
  zipIn.addEventListener('input', function () { zipIn.value = zipIn.value.replace(/\D/g, '').slice(0, 5); err.hidden = true; });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!/^\d{5}$/.test(zipIn.value)) { err.textContent = 'Enter a 5-digit ZIP code.'; err.hidden = false; zipIn.focus(); return; }
    run(zipIn.value, true);
  });
  if (stSel) stSel.addEventListener('change', function () {
    var v = stSel.value;
    items.forEach(function (li) { li._st = !!v && li.getAttribute('data-st') !== v; if (!list._pager) li.hidden = li._st; });
    if (list._pager) list._pager(true);
  });
  var specs = document.querySelector('.dealer-spec-chips');
  if (specs) specs.addEventListener('click', function (e) {
    var c = e.target.closest('.fchip'); if (!c) return;
    specs.querySelectorAll('.fchip').forEach(function (x) { x.setAttribute('aria-pressed', x === c ? 'true' : 'false'); });
    var v = c.getAttribute('data-spec');
    items.forEach(function (li) { li._sp = !!v && (' ' + li.getAttribute('data-sp') + ' ').indexOf(' ' + v + ' ') === -1; if (!list._pager) li.hidden = li._sp || li._st; });
    if (list._pager) list._pager(true);
  });
  var saved = store('bb-zip');
  if (saved && /^\d{5}$/.test(saved)) { zipIn.value = saved; run(saved, false); }
})();

/* ----- Long dealer lists: 40 a page, with page buttons. Search and filters page through what is left. ----- */
(function () {
  'use strict';
  document.querySelectorAll('[data-paginate]').forEach(function (list) {
    var per = parseInt(list.getAttribute('data-paginate'), 10) || 40;
    var nav = document.querySelector('[data-pager-for="' + list.id + '"]');
    if (!nav) return;
    var page = 1;
    function btn(label, n, cur, aria) {
      return '<button type="button" class="pg' + (cur ? ' on' : '') + '" data-pg="' + n + '"' + (cur ? ' aria-current="page"' : '') + (aria ? ' aria-label="' + aria + '"' : '') + '>' + label + '</button>';
    }
    function draw(reset) {
      if (reset) page = 1;
      var left = [].filter.call(list.children, function (li) { return !li._q && !li._st && !li._sp; });
      var pages = Math.max(1, Math.ceil(left.length / per));
      if (page > pages) page = pages;
      [].forEach.call(list.children, function (li) { li.hidden = true; });
      left.forEach(function (li, i) { li.hidden = i < (page - 1) * per || i >= page * per; });
      if (left.length <= per) { nav.hidden = true; nav.innerHTML = ''; return; }
      var nums = [], add = function (n) { if (nums.indexOf(n) === -1 && n >= 1 && n <= pages) nums.push(n); };
      add(1); for (var n = page - 1; n <= page + 1; n++) add(n); add(pages);
      nums.sort(function (a, b) { return a - b; });
      var html = page > 1 ? btn('‹ Prev', page - 1, false, 'Previous page') : '';
      nums.forEach(function (n, i) { if (i && n - nums[i - 1] > 1) html += '<span class="pg-gap">…</span>'; html += btn(n, n, n === page, 'Page ' + n); });
      if (page < pages) html += btn('Next ›', page + 1, false, 'Next page');
      var from = (page - 1) * per + 1, to = Math.min(page * per, left.length);
      nav.innerHTML = '<p class="pg-note">Showing ' + from + '–' + to + ' of ' + left.length + '</p><div class="pg-row">' + html + '</div>';
      nav.hidden = false;
    }
    nav.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pg]'); if (!b) return;
      page = parseInt(b.getAttribute('data-pg'), 10); draw(false);
      var top = list.getBoundingClientRect().top + window.pageYOffset - 90;
      if (window.pageYOffset > top) window.scrollTo({ top: top, behavior: 'smooth' });
    });
    list._pager = draw;
    draw(true);
  });
})();

/* ----- "Add their shows to my calendar": subscribe links that work on any web address ----- */
(function () {
  'use strict';
  document.querySelectorAll('[data-ics-sub],[data-ics-google]').forEach(function (a) {
    var file = new URL(a.getAttribute('data-ics-sub') || a.getAttribute('data-ics-google'), location.href);
    var webcal = 'webcal://' + file.host + file.pathname;
    a.href = a.hasAttribute('data-ics-sub') ? webcal : 'https://calendar.google.com/calendar/render?cid=' + encodeURIComponent(webcal);
  });
  // close the calendar menu when tapping elsewhere
  document.addEventListener('click', function (e) {
    document.querySelectorAll('details.cal-menu[open]').forEach(function (d) { if (!d.contains(e.target)) d.removeAttribute('open'); });
  });
})();
