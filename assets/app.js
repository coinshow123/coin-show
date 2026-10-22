/* The Coin Calendar page behavior: main menu, major-show slider, date strip,
   20-per-page lists with filter chips, and "near me" (runs in the browser; the ZIP never leaves the device). */
/* Tap counting with GoatCounter (only when the site owner has turned it on): directions, calendar,
   official website, share buttons and ZIP searches. No cookies; nothing that identifies the visitor. */
function countTap(name) {
  try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: name, title: location.pathname, event: true }); } catch (e) {}
}
document.addEventListener('click', function (e) {
  var a = e.target.closest ? e.target.closest('a,button') : null;
  if (!a) return;
  var href = a.getAttribute('href') || '', n = '';
  if (/google\.com\/maps/.test(href)) n = 'directions';
  else if (/calendar\.google\.com/.test(href) || a.hasAttribute('data-ics-google')) n = 'calendar-google';
  else if (/\.ics$/.test(href) || a.hasAttribute('data-ics-sub')) n = 'calendar-apple';
  else if (/facebook\.com\/sharer/.test(href)) n = 'share-facebook';
  else if (/^sms:/.test(href)) n = 'share-text';
  else if (/^mailto:\?/.test(href)) n = 'share-email';
  else if (a.hasAttribute('data-copy')) n = 'share-copy';
  else if (/^Official website$/.test((a.textContent || '').trim())) n = 'official-website';
  if (n) countTap(n);
}, true);
/* publish version, so a new show list is always downloaded fresh */
var DV = '?v=' + (document.documentElement.getAttribute('data-v') || '');
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
      var url = b.getAttribute('data-copy'), lab = b.querySelector('span') || b, old = lab.textContent;
      function done(msg) { lab.textContent = msg; setTimeout(function () { lab.textContent = old; }, 2500); }
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
      fetch(link('assets/shows.json') + DV).then(function (r) { return r.json(); }),
      fetch(link('assets/zip3.json') + DV).then(function (r) { return r.json(); })
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
        (withMiles ? '<td class="c-mi">' + Math.round(o.mi) + ' mi</td>' : '') + '<td class="c-st">' + esc(s.st) + '</td>' +
        '<td class="c-name"><a href="' + esc(link(s.p)) + '">' + esc(s.n) + '</a><span class="sub">' + esc(s.c) + '<span class="st-in">, ' + esc(s.st) + '</span>' + (s.v ? ' · ' + esc(s.v) : '') + '</span></td></tr>';
    }).join('');
  }
  function table(list, withMiles) {
    return '<div class="table-wrap"><table class="shows"><thead><tr><th scope="col" class="c-date">Date</th>' + (withMiles ? '<th scope="col" class="c-mi">Distance</th>' : '') + '<th scope="col" class="c-st">State</th>' + '<th scope="col">Name of the coin show</th></tr></thead><tbody>' + rowsHTML(list, withMiles) + '</tbody></table></div>';
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
    mode = 'near'; countTap('zip-search');
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
          mode = 'near'; countTap('location-search'); runNear(true);
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
    (zip3 ? Promise.resolve() : fetch(ROOT + 'assets/zip3.json' + DV).then(function (r) { return r.json(); }).then(function (j) { zip3 = j; })).then(function () {
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
      nav.classList.add('pager-list');
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

/* For organizers page: badge code that links to the organizer's own show (?show=<id>), dark or light, with a Copy button */
(function () {
  var pre = document.getElementById('badge-code');
  if (!pre) return;
  var site = pre.getAttribute('data-site'), name = pre.getAttribute('data-name');
  var m = location.search.match(/[?&]show=([a-z0-9-]{3,80})/i), id = m ? m[1].toLowerCase() : '';
  function draw() {
    var picked = document.querySelector('input[name="badge-color"]:checked'), color = picked ? picked.value : 'dark';
    pre.textContent = '<a href="' + site + '/' + (id ? 's/' + id + '/' : '') + '"><img src="' + site + '/assets/badge-' + color + '.png" alt="Listed on ' + name + '" width="260" height="64"></a>';
  }
  if (id) {
    var note = document.getElementById('badge-note');
    if (note) note.textContent = 'This code links to your show. Copy it and paste it into your website.';
  }
  document.querySelectorAll('input[name="badge-color"]').forEach(function (r) { r.addEventListener('change', draw); });
  draw();
  document.querySelectorAll('[data-copy-from]').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = document.getElementById(b.getAttribute('data-copy-from')), lab = b.querySelector('span') || b, old = lab.textContent;
      if (!t) return;
      var done = function (msg) { lab.textContent = msg; setTimeout(function () { lab.textContent = old; }, 2000); };
      var sel = function () { var r = document.createRange(); r.selectNodeContents(t); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); };
      if (navigator.clipboard) navigator.clipboard.writeText(t.textContent).then(function () { done('Copied'); }, function () { sel(); done('Press Ctrl+C to copy'); });
      else { sel(); done('Press Ctrl+C to copy'); }
      if (typeof countTap === 'function') countTap('badge-copy');
    });
  });
})();

/* "List your show" form: in the site's design, sends the answers into the Google Form behind it.
   Links from show pages and organizer emails fill it in (?show_id=...&still_on=yes). */
(function () {
  var form = document.getElementById('show-form');
  if (!form) return;
  var info = JSON.parse(document.getElementById('form-info').textContent), E = info.entries || {}, C = info.choices || {};
  var STILL = ['Yes, as listed', 'Yes, but some details changed', 'Postponed', 'Canceled'];
  var REPEAT = ['No, this is a one-time show', 'Yes, every month on the same week and day (for example, every 2nd Sunday)', 'Yes, another schedule (tell us under "Anything else at the show?")'];
  var PUBLIC = ['Yes, show them on the show page', 'No, keep them private'];
  var pick = function (key, i, fallback) { var c = C[key]; return c && c[i] !== undefined ? c[i] : fallback[i]; };
  var $ = function (n) { return form.querySelector('[name="' + n + '"]'); };
  var params = new URLSearchParams(location.search);

  // fill in from the link
  params.forEach(function (v, k) {
    var el = $(k);
    if (el && el.type !== 'radio' && el.type !== 'checkbox') {
      if (el.type === 'date') { var m = String(v).match(/^\d{4}-\d{2}-\d{2}/); el.value = m ? m[0] : ''; }
      else el.value = v;
    }
  });
  var isUpdate = !!params.get('show_id');
  if (isUpdate) {
    document.getElementById('still-on-sec').hidden = false;
    document.getElementById('repeat-sec').hidden = true;
    document.getElementById('sub-h1').textContent = 'Update your coin show';
    document.getElementById('sub-lede').textContent = 'Your show\'s details are filled in. Change anything that\'s different, then press Send.';
    var so = { yes: 0, changed: 1, postponed: 2, cancelled: 3 }[params.get('still_on') || ''];
    if (so !== undefined) form.querySelector('[name="still_on"][value="' + so + '"]').checked = true;
    form.querySelector('button[type=submit] span').textContent = 'Send update';
  }
  if (params.get('public') === 'yes') form.querySelector('[name="public"][value="1"]').checked = true;

  // repeating shows: show the dates we'll add
  var repCount = form.querySelector('.rep-count'), repDates = document.getElementById('rep-dates');
  var monthly = function (start, count) {
    var dow = start.getDay(), n = Math.ceil(start.getDate() / 7), out = [];
    for (var k = 1; k <= count; k++) {
      var y = start.getFullYear(), mo = start.getMonth() + k, last = new Date(y, mo + 1, 0).getDate();
      var day = 1 + (dow - new Date(y, mo, 1).getDay() + 7) % 7 + 7 * (n - 1);
      if (n === 5 || day > last) day = last - (new Date(y, mo, last).getDay() - dow + 7) % 7;
      out.push(new Date(y, mo, day));
    }
    return out;
  };
  var showRepeat = function () {
    var r = form.querySelector('[name="repeat"]:checked'), on = r && r.value === '1';
    repCount.hidden = !on;
    var sd = $('start_date').value;
    if (on && sd) {
      var p = sd.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
      repDates.textContent = 'We\'ll add: ' + monthly(d, +$('repeat_count').value).map(function (x) { return x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }).join(', ');
    } else repDates.textContent = on ? 'Pick the first day above to see the dates.' : '';
  };
  form.addEventListener('change', function (e) { if (/repeat|start_date/.test(e.target.name)) showRepeat(); });
  form.addEventListener('input', function (e) { var f = e.target.closest('.is-bad'); if (f && e.target.checkValidity()) f.classList.remove('is-bad'); });
  form.addEventListener('change', function (e) { var f = e.target.closest('.is-bad'); if (f && (e.target.type === 'radio' || e.target.checkValidity())) f.classList.remove('is-bad'); });
  showRepeat();

  var err = form.querySelector('.form-err'), btn = form.querySelector('button[type=submit]');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    err.hidden = true;
    var bad = Array.prototype.filter.call(form.querySelectorAll('[required]'), function (el) { return el.closest('[hidden]') ? false : !el.checkValidity(); });
    if (isUpdate && !form.querySelector('[name="still_on"]:checked')) bad.unshift(form.querySelector('[name="still_on"]'));
    form.querySelectorAll('.is-bad').forEach(function (x) { x.classList.remove('is-bad'); });
    if (bad.length) {
      bad.forEach(function (el) { var f = el.closest('.fld, .sec, .agree'); if (f) f.classList.add('is-bad'); });
      err.textContent = 'Please fill in: ' + bad.map(function (el) { var l = el.closest('.fld'); return l ? l.querySelector('label').firstChild.textContent.trim() : el.name === 'authorized' ? 'the confirmation box' : 'is the show still happening'; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', ') + '.';
      err.hidden = false;
      (bad[0].focus ? bad[0] : err).focus();
      return;
    }
    if ($('company_site').value) { done(); return; } // a spam robot filled the hidden box
    var body = new URLSearchParams(), add = function (key, val) { if (E[key] && val !== '' && val != null) body.append(E[key], val); };
    ['show_id', 'show_name', 'start_date', 'hours', 'admission', 'venue', 'address', 'city', 'state', 'zip', 'dealer_tables', 'website', 'specialties', 'extras', 'organizer', 'contact_name', 'email', 'contact_phone']
      .forEach(function (k) { var el = $(k); if (el) add(k, el.value.trim()); });
    add('end_date', ($('end_date').value || $('start_date').value).trim());
    var so = form.querySelector('[name="still_on"]:checked');
    add('still_on', pick('still_on', so && isUpdate ? +so.value : 0, STILL));
    if (!isUpdate) {
      var rp = form.querySelector('[name="repeat"]:checked');
      if (rp) add('repeat', pick('repeat', +rp.value, REPEAT));
      if (rp && rp.value === '1') add('repeat_count', $('repeat_count').value);
    }
    var pub = form.querySelector('[name="public"]:checked');
    add('public_contact', pick('public_contact', pub && pub.value === '1' ? 0 : 1, PUBLIC));
    add('authorized', pick('authorized', 0, ['I organize this show or am allowed to update it']));
    btn.disabled = true; btn.querySelector('span').textContent = 'Sending...';
    fetch(form.getAttribute('data-post'), { method: 'POST', mode: 'no-cors', body: body })
      .then(done, function () {
        btn.disabled = false; btn.querySelector('span').textContent = isUpdate ? 'Send update' : 'Send my show';
        err.textContent = 'It did not send. Check your internet connection and try again.'; err.hidden = false;
      });
    if (typeof countTap === 'function') countTap(isUpdate ? 'show-update' : 'show-submit');
  });
  function done() {
    var d = document.getElementById('sub-done');
    document.getElementById('done-email').textContent = $('email').value;
    if (isUpdate) d.querySelector('p').textContent = 'We got your update. Changes usually show on the site within a day, often within the hour.';
    form.hidden = true; d.hidden = false; d.focus(); d.scrollIntoView({ block: 'start' });
  }
})();

/* "Send a dealer list or dealer application": opened from a show page's Upload button (?upload=list&up_show=ID&up_name=...).
   Sends the file to the Google Sheet's upload service, which saves it in Google Drive for review. */
(function () {
  var form = document.getElementById('upload-form');
  if (!form) return;
  var params = new URLSearchParams(location.search), id = params.get('up_show') || '';
  if (!/^[A-Za-z0-9-]{3,80}$/.test(id)) return; // no show chosen: the page explains how to start from the show page
  form.hidden = false;
  document.querySelector('#upload .up-none').hidden = true;
  document.getElementById('up-show_id').value = id;
  document.getElementById('up-show-name').textContent = params.get('up_name') || id;
  var maxMB = +form.getAttribute('data-max') || 10, file = document.getElementById('up-file'), hint = document.getElementById('up-file-hint');
  var TYPES = { list: ['.pdf', '.xlsx', '.xls', '.csv'], application: ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'] };
  var HINT = { list: 'PDF, Excel or CSV, up to ' + maxMB + ' MB', application: 'PDF, Word or a photo, up to ' + maxMB + ' MB' };
  var kind = function () { return form.querySelector('[name="kind"]:checked').value; };
  var setKind = function () { file.setAttribute('accept', TYPES[kind()].join(',')); hint.textContent = HINT[kind()]; };
  if (params.get('upload') === 'application') form.querySelector('[name="kind"][value="application"]').checked = true;
  setKind();
  form.addEventListener('change', function (e) { if (e.target.name === 'kind') setKind(); var f = e.target.closest('.is-bad'); if (f) f.classList.remove('is-bad'); });
  form.addEventListener('input', function (e) { var f = e.target.closest('.is-bad'); if (f && e.target.checkValidity()) f.classList.remove('is-bad'); });
  var err = form.querySelector('.form-err'), btn = form.querySelector('button[type=submit]'), lab = btn.querySelector('span');
  var fail = function (msg) { err.textContent = msg; err.hidden = false; btn.disabled = false; lab.textContent = 'Send file'; err.scrollIntoView({ block: 'center' }); };
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    err.hidden = true;
    form.querySelectorAll('.is-bad').forEach(function (x) { x.classList.remove('is-bad'); });
    var bad = Array.prototype.filter.call(form.querySelectorAll('[required]'), function (el) { return !el.checkValidity(); });
    if (bad.length) {
      bad.forEach(function (el) { var f = el.closest('.fld, .agree'); if (f) f.classList.add('is-bad'); });
      return fail('Please fill in: ' + bad.map(function (el) { return el.type === 'checkbox' ? 'the confirmation box' : el.type === 'file' ? 'your file' : el.closest('.fld').querySelector('label').firstChild.textContent.trim(); }).join(', ') + '.');
    }
    var f = file.files[0], ext = (f.name.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
    if (TYPES[kind()].indexOf(ext) === -1) { file.closest('.fld').classList.add('is-bad'); return fail('That file type does not work here. Use ' + HINT[kind()].split(',  up')[0].replace(/, up to.*/, '') + '.'); }
    if (f.size > maxMB * 1024 * 1024) { file.closest('.fld').classList.add('is-bad'); return fail('The file is larger than ' + maxMB + ' MB. Please send a smaller file, or email it to us.'); }
    if (form.querySelector('[name="company_site"]').value) { return done(); }
    btn.disabled = true; lab.textContent = 'Sending... please keep this page open';
    var rd = new FileReader();
    rd.onerror = function () { fail('Could not read that file. Please choose it again.'); };
    rd.onload = function () {
      var body = JSON.stringify({ kind: kind(), show_id: id, show_name: params.get('up_name') || '', name: document.getElementById('up-name').value.trim(), email: document.getElementById('up-email').value.trim(),
        authorized: form.querySelector('[name="authorized"]').checked, filename: f.name, mime: f.type, data: String(rd.result).split(',')[1] || '' });
      // text/plain keeps this a simple request the upload service can answer
      fetch(form.getAttribute('data-post'), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (j && j.ok) done(); else fail((j && j.error) || 'It did not send. Please try again.'); })
        .catch(function () { fail('It did not send. Check your internet connection and try again, or email the file to us.'); });
      if (typeof countTap === 'function') countTap('upload-' + kind());
    };
    rd.readAsDataURL(f);
  });
  function done() {
    var d = document.getElementById('up-done');
    if (kind() === 'application') document.getElementById('up-done-text').textContent = 'We got your dealer application. We check it and add a Download button to your show page, usually within two business days.';
    form.hidden = true; d.hidden = false; d.focus(); d.scrollIntoView({ block: 'start' });
  }
})();

/* "Already listed? Find your show": search upcoming shows by name, city or state, with Update and Upload buttons. */
(function () {
  var q = document.getElementById('find-q');
  if (!q) return;
  var list = document.getElementById('find-results'), count = document.getElementById('find-count'), rows = null, loading = false, wait = null;
  var norm = function (t) { return String(t || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim(); };
  var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var load = function () {
    if (rows || loading) return; loading = true;
    fetch(q.getAttribute('data-src')).then(function (r) { return r.json(); }).then(function (d) { rows = d.map(function (r) { return { r: r, t: norm([r[0], r[2], r[3], r[4], r[5]].join(' ')) }; }); draw(); })
      .catch(function () { count.textContent = 'Could not load the show list. Please refresh the page.'; });
  };
  var draw = function () {
    var words = norm(q.value).split(' ').filter(Boolean);
    if (!words.length) { list.innerHTML = ''; count.textContent = ''; return; }
    if (!rows) { count.textContent = 'Loading shows...'; return; }
    var hits = rows.filter(function (x) { return words.every(function (w) { return (' ' + x.t).indexOf(' ' + w) > -1; }); });
    count.textContent = hits.length ? (hits.length > 12 ? 'Showing 12 of ' + hits.length + '. Type more to narrow it down.' : hits.length + ' show' + (hits.length === 1 ? '' : 's') + ' found.') : 'No upcoming show matches. Not listed yet? Use the form below to add it.';
    list.innerHTML = hits.slice(0, 12).map(function (x) {
      var r = x.r;
      return '<li><div class="fs-main"><span class="fs-name">' + esc(r[0]) + (r[9] ? ' <span class="tag tag-cancel">Cancelled</span>' : '') + '</span><span class="fs-meta">' + esc(r[1]) + ' · ' + esc(r[2]) + ', ' + esc(r[3]) + (r[5] ? ' · ' + esc(r[5]) : '') + '</span></div>' +
        '<div class="fs-btns"><a class="btn btn-gold btn-sm" href="' + esc(r[6]) + '">Update this show</a><a class="btn btn-ghost btn-sm" href="' + esc(r[7]) + '">Dealer list</a><a class="btn btn-ghost btn-sm" href="' + esc(r[8]) + '">Dealer application</a></div></li>';
    }).join('');
  };
  q.addEventListener('focus', load);
  q.addEventListener('input', function () { load(); clearTimeout(wait); wait = setTimeout(draw, 120); });
  // the links reload this page with the show filled in; make sure the right form is in view
  list.addEventListener('click', function (e) { var a = e.target.closest('a'); if (a && typeof countTap === 'function') countTap('find-show'); });
})();

/* Dealer profile form (Claim this profile / Update this profile). Sends to the Google Sheet's upload service for review. */
(function () {
  var form = document.getElementById('dealer-form');
  if (!form) return;
  var p = new URLSearchParams(location.search), key = p.get('key') || '';
  if (!/^[a-z0-9][a-z0-9-]{1,118}$/.test(key)) return;
  var $ = function (n) { return form.querySelector('[name="' + n + '"]'); };
  form.hidden = false; document.getElementById('dp-none').hidden = true;
  document.getElementById('dp-key').value = key;
  var name = p.get('name') || key;
  document.getElementById('dp-name').textContent = name;
  document.getElementById('dp-crumb').textContent = name;
  document.getElementById('dp-back').setAttribute('href', '../../dealer/' + key + '/');
  if (p.get('v') === '1') {
    document.getElementById('dp-h1').textContent = 'Update your dealer profile';
    document.getElementById('dp-lede').textContent = 'Your current details are filled in. Change anything that\'s different, then press Send.';
    form.querySelector('button[type=submit] span').textContent = 'Send update';
  }
  ['website', 'store', 'phone', 'public_email'].forEach(function (k) { if (p.get(k)) $(k).value = p.get(k); });
  var specs = (p.get('specialties') || '').split(/\s*,\s*/);
  form.querySelectorAll('[name="specialties"]').forEach(function (c) { c.checked = specs.indexOf(c.value) > -1; });
  var groups = (p.get('memberships') || '').split(/\s*,\s*/).filter(Boolean), known = [];
  form.querySelectorAll('[name="groups"]').forEach(function (c) { if (groups.indexOf(c.value) > -1) { c.checked = true; known.push(c.value); } });
  $('groups_other').value = groups.filter(function (g) { return known.indexOf(g) === -1; }).join(', ');
  form.addEventListener('input', function (e) { var f = e.target.closest('.is-bad'); if (f && e.target.checkValidity()) f.classList.remove('is-bad'); });
  form.addEventListener('change', function (e) { var f = e.target.closest('.is-bad'); if (f && e.target.checkValidity()) f.classList.remove('is-bad'); });
  var err = form.querySelector('.form-err'), btn = form.querySelector('button[type=submit]'), lab = btn.querySelector('span'), label0 = lab.textContent;
  var fail = function (m) { err.textContent = m; err.hidden = false; btn.disabled = false; lab.textContent = label0; err.scrollIntoView({ block: 'center' }); };
  form.addEventListener('submit', function (e) {
    e.preventDefault(); err.hidden = true;
    form.querySelectorAll('.is-bad').forEach(function (x) { x.classList.remove('is-bad'); });
    var bad = Array.prototype.filter.call(form.querySelectorAll('input[required], input[type=email], input[type=url]'), function (el) { return !el.checkValidity(); });
    if (bad.length) {
      bad.forEach(function (el) { var f = el.closest('.fld, .agree'); if (f) f.classList.add('is-bad'); });
      return fail('Please check: ' + bad.map(function (el) { return el.type === 'checkbox' ? 'the confirmation box' : el.closest('.fld').querySelector('label').firstChild.textContent.trim(); }).join(', ') + '.');
    }
    if ($('company_site').value) return done();
    var groupsOut = Array.prototype.map.call(form.querySelectorAll('[name="groups"]:checked'), function (c) { return c.value; })
      .concat($('groups_other').value.split(/\s*,\s*/).filter(Boolean));
    var data = { kind: 'dealer', key: key, business_name: name,
      contact_name: $('contact_name').value.trim(), contact_role: $('contact_role').value.trim(), contact_email: $('contact_email').value.trim(), contact_phone: $('contact_phone').value.trim(),
      specialties: Array.prototype.map.call(form.querySelectorAll('[name="specialties"]:checked'), function (c) { return c.value; }), memberships: groupsOut.join(', '),
      website: $('website').value.trim(), store: $('store').value.trim(), phone: $('phone').value.trim(), public_email: $('public_email').value.trim(),
      message: $('message').value.trim(), authorized: $('authorized').checked };
    var send = function () {
      btn.disabled = true; lab.textContent = 'Sending...';
      fetch(form.getAttribute('data-post'), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (j && j.ok) done(); else fail((j && j.error) || 'It did not send. Please try again.'); })
        .catch(function () { fail('It did not send. Check your internet connection and try again.'); });
      if (typeof countTap === 'function') countTap(p.get('v') === '1' ? 'dealer-update' : 'dealer-claim');
    };
    var f = $('logo').files[0];
    if (!f) return send();
    if (!/\.(png|jpe?g|webp)$/i.test(f.name)) { $('logo').closest('.fld').classList.add('is-bad'); return fail('Your logo must be a PNG or JPG picture.'); }
    if (f.size > 2 * 1024 * 1024) { $('logo').closest('.fld').classList.add('is-bad'); return fail('Your logo is larger than 2 MB. Please choose a smaller picture.'); }
    var rd = new FileReader();
    rd.onload = function () { data.logo_name = f.name; data.logo_mime = f.type; data.logo_data = String(rd.result).split(',')[1] || ''; send(); };
    rd.onerror = function () { fail('Could not read that picture. Please choose it again.'); };
    rd.readAsDataURL(f);
  });
  function done() { var d = document.getElementById('dp-done'); form.hidden = true; d.hidden = false; d.focus(); d.scrollIntoView({ block: 'start' }); }
})();
