/* Bourse Board page behavior: menu, major-show slider, 20-per-page lists, and "near me". */
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
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  /* ----- phone menu ----- */
  var side = document.querySelector('.side');
  var menuBtn = document.querySelector('.menu-btn');
  if (side && menuBtn) {
    menuBtn.addEventListener('click', function () {
      var open = side.getAttribute('data-open') !== 'true';
      side.setAttribute('data-open', open ? 'true' : 'false');
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    side.addEventListener('click', function (e) {
      if (e.target.closest('a') && side.getAttribute('data-open') === 'true') {
        side.setAttribute('data-open', 'false');
        menuBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ----- major shows slider ----- */
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

  /* ----- lists: hide ended shows, 20 per page ----- */
  function weekendRange() {
    var day = now.getDay(), fri = new Date(now);
    fri.setDate(now.getDate() + (day === 0 ? -2 : day === 6 ? -1 : 5 - day));
    var sun = new Date(fri); sun.setDate(fri.getDate() + 2);
    return [iso(fri), iso(sun)];
  }
  document.querySelectorAll('table.shows[data-per]').forEach(function (table) {
    var id = table.id;
    var per = Number(table.getAttribute('data-per')) || PER_PAGE;
    var wk = table.getAttribute('data-filter') === 'weekend' ? weekendRange() : null;
    var rows = [].slice.call(table.tBodies[0].rows).filter(function (r) {
      var keep = r.getAttribute('data-e') >= TODAY;
      if (keep && wk) keep = r.getAttribute('data-s') <= wk[1] && r.getAttribute('data-e') >= wk[0];
      if (!keep) r.remove();
      return keep;
    });
    var pager = document.querySelector('[data-pager-for="' + id + '"]');
    var range = document.querySelector('[data-range-for="' + id + '"]');
    var empty = document.querySelector('[data-empty-for="' + id + '"]');
    var pages = Math.max(1, Math.ceil(rows.length / per));
    if (empty) empty.hidden = rows.length > 0;
    var section = table.closest('section');

    function show(page, scroll) {
      rows.forEach(function (r, i) { r.hidden = i < (page - 1) * per || i >= page * per; });
      if (range) {
        range.textContent = rows.length
          ? 'Showing ' + ((page - 1) * per + 1) + '–' + Math.min(page * per, rows.length) + ' of ' + rows.length + ' upcoming show' + (rows.length === 1 ? '' : 's') + (pages > 1 ? ' · Page ' + page + ' of ' + pages : '')
          : 'No upcoming shows listed.';
      }
      if (pager) {
        pager.innerHTML = '';
        if (pages > 1 && window.matchMedia('(max-width:760px)').matches) {
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
    show(1, false);
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
    inp.addEventListener('input', function () {
      var q = inp.value.trim().toLowerCase(), shown = 0;
      [].forEach.call(list.children, function (li) { var hit = !q || li.textContent.toLowerCase().indexOf(q) > -1; li.hidden = !hit; if (hit) shown++; });
      if (none) none.hidden = shown > 0;
    });
  });

  /* ----- near me ----- */
  var form = document.getElementById('near-form');
  if (!form) return;
  var zipIn = document.getElementById('near-zip');
  var radIn = document.getElementById('near-radius');
  var errEl = document.getElementById('near-err');
  var out = document.getElementById('near-results');
  var gps = document.getElementById('near-gps');
  var data = null, zip3 = null, lastHits = [], limit = 20, label = '';

  var saved = store('bb-zip'); if (saved && /^\d{5}$/.test(saved)) zipIn.value = saved;
  var savedR = store('bb-radius'); if (savedR) radIn.value = savedR;

  function load() {
    if (data && zip3) return Promise.resolve();
    return Promise.all([
      fetch(link('assets/shows.json')).then(function (r) { return r.json(); }),
      fetch(link('assets/zip3.json')).then(function (r) { return r.json(); })
    ]).then(function (res) { data = res[0]; zip3 = res[1]; });
  }
  function miles(a, b, c, d) {
    var r = Math.PI / 180, h = Math.pow(Math.sin((c - a) * r / 2), 2) + Math.cos(a * r) * Math.cos(c * r) * Math.pow(Math.sin((d - b) * r / 2), 2);
    return 3959 * 2 * Math.asin(Math.sqrt(h));
  }
  var M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], W = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
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
  function run(lat, lon, what) {
    errEl.hidden = true;
    var radius = Number(radIn.value);
    store('bb-radius', radIn.value);
    lastHits = data.filter(function (s) { return s.e >= TODAY; })
      .map(function (s) { return { s: s, mi: miles(lat, lon, s.la, s.lo) }; })
      .filter(function (o) { return o.mi <= radius; })
      .sort(function (x, y) { return x.s.s < y.s.s ? -1 : x.s.s > y.s.s ? 1 : x.mi - y.mi; });
    label = lastHits.length + ' show' + (lastHits.length === 1 ? '' : 's') + ' within ' + radius + ' miles of ' + what + ', soonest first';
    limit = 20;
    draw();
  }
  function draw() {
    if (!lastHits.length) {
      out.innerHTML = '<p>' + esc(label) + '</p><p class="muted" style="font-weight:400">Try 300 miles, or pick your state in the menu.</p>';
      return;
    }
    var rows = lastHits.slice(0, limit).map(function (o) {
      var f = fmtDate(o.s.s, o.s.e);
      return '<tr><td class="c-date"><span class="d">' + esc(f[0]) + '</span><span class="dow">' + esc(f[1]) + '</span><span class="dtile" aria-hidden="true"><span class="tm">' + esc(f[2]) + '</span><span class="td">' + esc(f[3]) + '</span><span class="tw">' + esc(f[1]) + '</span></span></td>' +
        '<td class="c-mi">' + Math.round(o.mi) + ' mi</td>' +
        '<td class="c-name"><a href="' + esc(link(o.s.p)) + '">' + esc(o.s.n) + '</a><span class="sub">' + esc(o.s.c) + ', ' + esc(o.s.st) + (o.s.v ? ' · ' + esc(o.s.v) : '') + '</span></td></tr>';
    }).join('');
    out.innerHTML = '<p>' + esc(label) + '</p><div class="table-wrap"><table class="shows"><thead><tr><th scope="col" class="c-date">Date</th><th scope="col" class="c-mi">Miles</th><th scope="col">Name of the coin show</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      (lastHits.length > limit ? '<button type="button" class="btn btn-ghost more-btn" id="near-more">Show more (' + (lastHits.length - limit) + ' left)</button>' : '');
    var more = document.getElementById('near-more');
    if (more) more.addEventListener('click', function () { limit += 20; draw(); });
  }

  zipIn.addEventListener('input', function () { zipIn.value = zipIn.value.replace(/\D/g, '').slice(0, 5); errEl.hidden = true; });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var z = zipIn.value.trim();
    if (!/^\d{5}$/.test(z)) { fail('Enter a 5-digit ZIP code.'); zipIn.focus(); return; }
    load().then(function () {
      var p = zip3[z.slice(0, 3)];
      if (!p) { fail('That ZIP code was not found. Check it and try again.'); return; }
      store('bb-zip', z);
      run(p[0], p[1], z);
    }).catch(function () { fail('Shows could not load. Check your connection and try again.'); });
  });
  if (gps) {
    if (!('geolocation' in navigator)) gps.hidden = true;
    gps.addEventListener('click', function () {
      errEl.hidden = true;
      gps.textContent = 'Finding you…';
      navigator.geolocation.getCurrentPosition(function (pos) {
        gps.textContent = 'Use my location';
        load().then(function () { run(pos.coords.latitude, pos.coords.longitude, 'your location'); })
          .catch(function () { fail('Shows could not load. Check your connection and try again.'); });
      }, function () {
        gps.textContent = 'Use my location';
        fail('Your location is not available. Type your ZIP code instead.');
      }, { timeout: 10000, maximumAge: 600000 });
    });
  }
  /* ----- home banner ZIP box: runs the near-me search below ----- */
  var hf = document.getElementById('hero-form');
  if (hf) {
    var hz = document.getElementById('hero-zip'), he = document.getElementById('hero-err'), hg = document.getElementById('hero-gps');
    if (saved && /^\d{5}$/.test(saved)) hz.value = saved;
    hz.addEventListener('input', function () { hz.value = hz.value.replace(/\D/g, '').slice(0, 5); he.hidden = true; });
    var goNear = function () { var sec = document.getElementById('near'); if (sec) sec.scrollIntoView({ block: 'start' }); };
    hf.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!/^\d{5}$/.test(hz.value)) { he.textContent = 'Enter a 5-digit ZIP code.'; he.hidden = false; hz.focus(); return; }
      zipIn.value = hz.value;
      if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true }));
      goNear();
    });
    if (hg) {
      if (!('geolocation' in navigator)) hg.hidden = true;
      hg.addEventListener('click', function () { if (gps) { gps.click(); goNear(); } });
    }
  }
})();
