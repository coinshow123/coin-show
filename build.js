#!/usr/bin/env node
/*
  The Coin Calendar site builder (thecoincalendar.com)
  ---------------------------------------------------
  Turns the show spreadsheet (Google Sheet or data/shows.csv) into a complete
  static website in the "dist" folder.

  Run it:   node build.js            (real site, clean links)
            node build.js --preview  (links end in index.html, for opening files locally)

  Needs Node.js 18 or newer. No other installs.
*/
'use strict';
const fs = require('fs');
const path = require('path');
// A fingerprint of the look and the scripts. It changes whenever style.css or app.js changes,
// so visitors' browsers always load the new files together with the new pages.
const ASSET_V = require('crypto').createHash('md5').update(['style.css', 'app.js'].map(f => require('fs').readFileSync(require('path').join(__dirname, 'assets', f), 'utf8')).join('')).digest('hex').slice(0, 8);

const ROOT = __dirname;
const OUT = path.join(ROOT, 'dist');
const PREVIEW = process.argv.includes('--preview');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const SHEET_URL = process.env.SHEET_CSV_URL || config.sheetCsvUrl || '';
const SITE = (config.siteUrl || 'https://www.thecoincalendar.com').replace(/\/+$/, '');
const NAME = config.siteName || 'The Coin Calendar';
const OPERATOR = config.operator || 'C&C Numismatics LLC';
/* "Update this show" form. Made by the Google Sheet (Settings > 3) and saved as data/update-form.json. */
const readJson = f => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { return null; } };
const UPDATE_FORM = readJson('data/update-form.json');
/* Dealer application upload form for organizers (Settings > 4 in the Google Sheet). */
const UPLOAD_FORM = readJson('data/upload-form.json');
/* "Claim or update this profile" form for dealers (Settings > 5 in the Google Sheet). */
const DEALER_CLAIM_FORM = readJson('data/dealer-claim-form.json');
/* The 5 dealer specialties. Only these show on the site. */
const SPECIALTIES = ['Rare Coins', 'U.S. Paper Money', 'World Paper Money', 'Ancient', 'Bullion'];
const SPEC_ID = { 'Rare Coins': 'rare', 'U.S. Paper Money': 'paper', 'World Paper Money': 'world', 'Ancient': 'ancient', 'Bullion': 'bullion' };
const warnings = [];

/* ---------- states ---------- */
const STATES = {AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'};
const STATE_BY_NAME = Object.fromEntries(Object.entries(STATES).map(([c, n]) => [n.toLowerCase(), c]));
const stateSlug = c => STATES[c].toLowerCase().replace(/[^a-z]+/g, '-');

/* ---------- small helpers ---------- */
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = s => String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAY = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const D = iso => new Date(iso + 'T00:00:00Z');
const isoOf = d => d.toISOString().slice(0, 10);
const addDays = (iso, n) => { const d = D(iso); d.setUTCDate(d.getUTCDate() + n); return isoOf(d); };
const todayISO = new Intl.DateTimeFormat('en-CA', { timeZone: config.timeZone || 'America/Los_Angeles' }).format(new Date());
const buildDateLong = (() => { const d = D(todayISO); return MONTH[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear(); })();

function fmt(s) {
  const a = D(s.start), b = D(s.end);
  const am = a.getUTCMonth(), bm = b.getUTCMonth(), ay = a.getUTCFullYear(), by = b.getUTCFullYear();
  let date, long;
  if (s.start === s.end) {
    date = `${MON[am]} ${a.getUTCDate()}, ${ay}`;
    long = `${DAY[a.getUTCDay()]}, ${MONTH[am]} ${a.getUTCDate()}, ${ay}`;
  } else if (ay !== by) {
    date = `${MON[am]} ${a.getUTCDate()}, ${ay} – ${MON[bm]} ${b.getUTCDate()}, ${by}`;
    long = `${DAY[a.getUTCDay()]}, ${MONTH[am]} ${a.getUTCDate()}, ${ay} – ${DAY[b.getUTCDay()]}, ${MONTH[bm]} ${b.getUTCDate()}, ${by}`;
  } else {
    date = `${MON[am]} ${a.getUTCDate()}–${am === bm ? '' : MON[bm] + ' '}${b.getUTCDate()}, ${by}`;
    long = `${DAY[a.getUTCDay()]}, ${MONTH[am]} ${a.getUTCDate()} – ${DAY[b.getUTCDay()]}, ${MONTH[bm]} ${b.getUTCDate()}, ${by}`;
  }
  const dow = s.start === s.end ? DOW[a.getUTCDay()] : `${DOW[a.getUTCDay()]}–${DOW[b.getUTCDay()]}`;
  return { date, long, dow };
}

/* ---------- CSV ---------- */
function parseCSV(text) {
  const rows = []; let row = [], field = '', q = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const head = (rows.shift() || []).map(h => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  return rows.filter(r => r.some(v => v.trim() !== '')).map((r, i) => {
    const o = { _line: i + 2 }; head.forEach((h, j) => o[h] = (r[j] || '').trim()); return o;
  });
}

function parseDate(v) {
  if (!v) return '';
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
  return '';
}

/* ---------- locations ---------- */
const CITIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cities.json'), 'utf8'));
const ZIP3 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/zip3.json'), 'utf8'));
const CENTERS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/state-centers.json'), 'utf8'));
const normCity = c => c.toLowerCase().replace(/\bst\.?\s/g, 'saint ').replace(/\bft\.?\s/g, 'fort ').replace(/\./g, '').replace(/'/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
function locate(r, st) {
  const la = parseFloat(r.lat), lo = parseFloat(r.lon);
  if (!isNaN(la) && !isNaN(lo)) return [la, lo];
  const hit = CITIES[normCity(r.city) + '|' + st];
  if (hit) return hit;
  if (/^\d{5}/.test(r.zip || '') && ZIP3[r.zip.slice(0, 3)]) return ZIP3[r.zip.slice(0, 3)];
  warnings.push(`Line ${r._line}: could not find "${r.city}, ${st}" on the map. Using the middle of the state. Add a ZIP code or lat/lon to fix distance.`);
  return CENTERS[st] || [39.8, -98.6];
}

/* ---------- load shows ---------- */
async function loadCSV() {
  if (SHEET_URL) {
    console.log('Reading shows from the Google Sheet…');
    const res = await fetch(SHEET_URL, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Could not read the Google Sheet (HTTP ${res.status}). Check that it is published to the web as CSV.`);
    const text = await res.text();
    if (/^\s*</.test(text)) throw new Error('The Google Sheet link returned a web page, not CSV. Use File > Share > Publish to web > CSV.');
    return text;
  }
  console.log('Reading shows from data/shows.csv…');
  return fs.readFileSync(path.join(ROOT, 'data/shows.csv'), 'utf8');
}

function tierOf(v) {
  v = (v || '').toLowerCase();
  if (/major|national/.test(v)) return 'major';
  if (/regional|state/.test(v)) return 'regional';
  if (/dealer/.test(v)) return 'dealer';
  return 'local';
}

const splitList = v => String(v || '').split(/[,;]/).map(x => x.trim()).filter(Boolean);
const yes = v => /^(y|yes|true|x|1)$/i.test(String(v || '').trim());

/* Dealers: a second sheet tab with show_id, dealer, table, city, state, status */
async function loadDealers(shows) {
  const url = process.env.DEALERS_CSV_URL || config.dealersCsvUrl || '';
  let text = '';
  if (url) {
    console.log('Reading dealers from the Google Sheet…');
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Could not read the dealers sheet (HTTP ${res.status}).`);
    text = await res.text();
  } else if (fs.existsSync(path.join(ROOT, 'data/dealers.csv'))) {
    text = fs.readFileSync(path.join(ROOT, 'data/dealers.csv'), 'utf8');
  }
  if (!text) return;
  const byId = {};
  shows.forEach(s => { if (s.id) (byId[s.id] = byId[s.id] || []).push(s); });
  for (const r of parseCSV(text)) {
    if ((r.status || 'approved').toLowerCase() !== 'approved') continue;
    const id = (r.show_id || '').trim().toUpperCase();
    if (!r.dealer) continue;
    if (!byId[id]) { warnings.push(`Dealers line ${r._line}: show_id "${r.show_id}" does not match any show. Add it to the show's show_id column.`); continue; }
    byId[id].forEach(s => s.dealers.push({ name: r.dealer, table: r.table, city: r.city, st: (r.state || '').toUpperCase(), website: (r.website || '').trim() }));
  }
  const key = n => n.toLowerCase().replace(/^the\s+/, '');
  shows.forEach(s => s.dealers.sort((a, b) => key(a.name).localeCompare(key(b.name))));
}

function cleanShows(rows) {
  const out = [], seen = new Set();
  for (const r of rows) {
    if ((r.status || '').toLowerCase() !== 'approved') continue;
    const where = `Line ${r._line} (${r.show_name || 'no name'})`;
    const start = parseDate(r.start_date), end = parseDate(r.end_date) || start;
    let st = (r.state || '').toUpperCase();
    if (!STATES[st]) st = STATE_BY_NAME[(r.state || '').toLowerCase()] || '';
    if (!r.show_name) { warnings.push(`${where}: missing show name, skipped.`); continue; }
    if (!start) { warnings.push(`${where}: start date "${r.start_date}" not understood, skipped. Use 2027-01-07 or 1/7/2027.`); continue; }
    if (!st) { warnings.push(`${where}: state "${r.state}" not understood, skipped.`); continue; }
    if (end < start) { warnings.push(`${where}: end date is before start date, skipped.`); continue; }
    let slug = `${slugify(r.show_name)}-${slugify(r.city)}-${st.toLowerCase()}-${start}`;
    while (seen.has(slug)) slug += '-2';
    seen.add(slug);
    const [la, lo] = locate(r, st);
    const website = /^https?:\/\//i.test(r.website) ? r.website : (r.website ? 'https://' + r.website : '');
    out.push({
      start, end, name: r.show_name, city: r.city, st, venue: r.venue, address: r.address, zip: r.zip,
      tier: tierOf(r.tier), hours: r.hours, admission: r.admission, website, organizer: r.organizer,
      notes: r.notes, confirm: yes(r.confirm_dates), featured: yes(r.featured),
      id: (r.show_id || '').trim().toUpperCase(), tables: r.dealer_tables, parking: r.parking,
      specialties: splitList(r.specialties), auction: r.auction, grading: r.grading,
      appraisals: yes(r.appraisals), exhibits: yes(r.exhibits), kids: yes(r.kids), prizes: yes(r.door_prizes), talks: yes(r.talks),
      hotel: r.hotel, description: r.description, photos: splitList(r.photos), photoCredit: r.photo_credit, dealers: [],
      // organizer contact: only used when the promoter chose to make it public
      publicContact: yes(r.public_contact), contactName: (r.contact_name || '').trim(), contactPhone: (r.contact_phone || '').trim(), contactEmail: (r.contact_email || '').trim(),
      dealerApp: (r.dealer_application || '').trim(), dealerListFile: (r.dealer_list_file || '').trim(), showId: (r.show_id || '').trim(),
      la: Math.round(la * 1000) / 1000, lo: Math.round(lo * 1000) / 1000, slug, path: `show/${slug}/`
    });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || a.st.localeCompare(b.st) || a.name.localeCompare(b.name));
}

/* ---------- dealer pages ----------
   Every dealer in a show's dealer list gets a page listing all the upcoming shows they will be at.
   The same business in the same state is one dealer, even if the name is typed slightly differently. */
/* ---------- one dealer, many spellings ----------
   Organizers type names differently: "Schuch, John - RC" and "John Schuch RC", or a list with no state.
   We match dealers by the words in their name, written the same way (ignoring LLC/Inc/&/punctuation), plus small typos
   like "Rinkor" and "Rinker". Two dealers are only joined when their states agree or one list has no state,
   so "World Coins" in Texas and "World Coins" in Florida stay separate. */
const NAME_SKIP = new Set(['the', 'and', 'inc', 'llc', 'co', 'corp', 'company', 'ltd', 'incorporated', 'l', 'c']);
const nameWords = n => [...new Set(niceDealerName(n).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(t => t && !NAME_SKIP.has(t)))];
/* "Schuch, John - RC" -> "John Schuch RC", "Abbott, Mike" -> "Mike Abbott". Company names like "Rinkor Rare Coins, LLC" stay. */
function niceDealerName(n) {
  const s = String(n).trim().replace(/[’‘]/g, "'"), m = s.match(/^([A-Za-z'’.-]+),\s+([A-Za-z]+(?:\s+[A-Za-z]\.?)?)(?:\s+[-–]\s+(.+))?$/);
  let out = s;
  if (m && !/^(inc|llc|ltd|co|corp|intl|jr|sr)\.?$/i.test(m[2])) out = [m[2], m[1], m[3]].filter(Boolean).join(' ');
  out = out.replace(/^(.+),\s*the$/i, 'The $1');                        // "Penny Lady, The" -> "The Penny Lady"
  // initials that lost their capitals: "Dlrc" -> "DLRC" (no vowels, so not a word)
  out = out.replace(/\b[A-Za-z][bcdfghjklmnpqrstvwxzBCDFGHJKLMNPQRSTVWXZ]{2,4}\b/g, w => /^(mrs?|drs?|st|mt|ft|jr|sr|ltd|llc|inc|bros?)$/i.test(w) || /[aeiouy]/i.test(w) ? w : w.toUpperCase());
  return out;
}
function oneEdit(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}
function sameDealerWords(a, b) {
  if (a.length !== b.length || !a.length) return false;
  let typos = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (a.length < 2 || a[i].length < 5 || !oneEdit(a[i], b[i]) || ++typos > 1) return false;   // never guess on one-word names
  }
  return true;
}
const dealerSlug = (name, st) => slugify(niceDealerName(name).replace(/^the\s+/i, '').replace(/[,.]?\s*\b(inc|llc|l\.l\.c|co|corp|company|ltd)\b\.?$/i, '')) + (st ? '-' + st.toLowerCase() : '');
function collectDealers(upcoming) {
  const recs = [];
  for (const s of upcoming) for (const d of s.dealers) { const w = nameWords(d.name); if (w.length) recs.push({ s, d, w, st: d.st || '' }); }
  // records that know their state go first, so a list without states can join them
  recs.sort((a, b) => (b.st ? 1 : 0) - (a.st ? 1 : 0));
  const groups = [];
  for (const r of recs) {
    const fits = groups.filter(g => sameDealerWords(g.w, r.w) && (!r.st || !g.st || g.st === r.st));
    // without a state, only join when there is exactly one match; otherwise we cannot tell which dealer it is
    let g = r.st ? fits.find(x => x.st === r.st) || fits.find(x => !x.st) : (fits.length === 1 ? fits[0] : null);
    if (!g) { g = { w: r.w, st: r.st, recs: [] }; groups.push(g); }
    if (!g.st && r.st) g.st = r.st;
    g.recs.push(r);
  }
  const used = new Set(), out = [], joined = [];
  for (const g of groups) {
    // the name to show: the spelling used most, written the nice way; a list with a state wins ties
    const votes = {};
    g.recs.forEach(r => { const n = niceDealerName(r.d.name); votes[n] = (votes[n] || 0) + (r.st ? 1.01 : 1); });
    const name = Object.entries(votes).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0];
    const spellings = [...new Set(g.recs.map(r => r.d.name))];
    if (spellings.length > 1) joined.push(spellings.join('  =  '));
    let key = dealerSlug(name, g.st);
    while (used.has(key)) key += '-2';
    used.add(key);
    const withPlace = g.recs.find(r => r.d.city) || {};
    const withWeb = g.recs.find(r => r.d.website) || {};
    const e = { key, name, city: withPlace.d ? withPlace.d.city : '', st: g.st, stops: [], path: 'dealer/' + key + '/', website: withWeb.d ? withWeb.d.website : '', specs: [], groups: [], store: '', phone: '', email: '', logo: '', verified: false };
    for (const r of g.recs) {
      r.d.name = name; r.d.path = e.path;
      if (!r.d.st && g.st) { r.d.st = g.st; if (!r.d.city) r.d.city = e.city; }
      if (!e.stops.some(x => x.s === r.s)) e.stops.push({ s: r.s, table: r.d.table });
    }
    e.stops.sort((a, b) => a.s.start.localeCompare(b.s.start));
    out.push(e);
  }
  if (joined.length) console.log(`Matched ${joined.length} dealer(s) spelled differently on different lists:\n` + joined.map(j => '   ' + j).join('\n'));
  // keep each show's own list A to Z with the nicer names
  for (const s of upcoming) s.dealers.sort((a, b) => a.name.replace(/^the\s+/i, '').localeCompare(b.name.replace(/^the\s+/i, '')));
  return out.sort((a, b) => a.name.replace(/^the\s+/i, '').localeCompare(b.name.replace(/^the\s+/i, '')));
}

/* ---------- links ---------- */
function linker(depth) {
  const up = '../'.repeat(depth);
  return p => {
    const [pathPart, hash] = p.split('#');
    let u = up + pathPart;
    if (PREVIEW && (pathPart === '' || pathPart.endsWith('/'))) u += 'index.html';
    if (u === '') u = './';
    return u + (hash ? '#' + hash : '');
  };
}

/* ---------- pieces ---------- */
const TIER_LABEL = { major: 'National', regional: 'State / regional', local: 'Local club', dealer: 'Dealers only' };
const isFree = s => /free/i.test(s.admission || '');

function shortDate(s) {
  const f = fmt(s), y = String(D(todayISO).getUTCFullYear());
  return s.start.slice(0, 4) === y && s.end.slice(0, 4) === y ? f.date.replace(/, \d{4}$/, '') : f.date;
}
function dateTile(s) {
  const a = D(s.start), b = D(s.end), f = fmt(s);
  const m = a.getUTCMonth() === b.getUTCMonth() ? MON[a.getUTCMonth()] : MON[a.getUTCMonth()] + '–' + MON[b.getUTCMonth()];
  const d = s.start === s.end ? String(a.getUTCDate()) : a.getUTCDate() + '–' + b.getUTCDate();
  return `<span class="dtile" aria-hidden="true"><span class="tm">${m.toUpperCase()}</span><span class="td">${d}</span><span class="tw">${f.dow}</span></span>`;
}
function showRow(s, h) {
  const f = fmt(s);
  const badges = (s.featured ? '<span class="tag tag-feat">Featured</span>' : '') + (s.tier === 'dealer' ? '<span class="tag tag-dealer">Dealers only</span>' : '') + (s.tier === 'major' ? '<span class="tag tag-major">National</span>' : '') + (isFree(s) ? '<span class="tag tag-free">Free</span>' : '');
  return `<tr data-s="${s.start}" data-e="${s.end}"${isFree(s) ? ' data-free="1"' : ''}${s.tier === 'major' ? ' class="is-major"' : ''}>
<td class="c-date"><span class="d">${esc(shortDate(s))}</span><span class="dow">${esc(f.dow)}</span>${dateTile(s)}</td>
<td class="c-st">${s.st}</td>
<td class="c-name"><a href="${h(s.path)}">${esc(s.name)}</a>${badges}<span class="sub">${esc(s.city)}<span class="st-in">, ${s.st}</span>${s.venue ? ' · ' + esc(s.venue) : ''}</span></td>
</tr>`;
}

function listSection(shows, h, o) {
  const id = o.id || 'list-all';
  const opts = Object.keys(STATES).filter(c => o.counts[c]).sort((a, b) => STATES[a].localeCompare(STATES[b]))
    .map(c => `<option value="${h('state/' + stateSlug(c) + '/')}"${c === o.curState ? ' selected' : ''}>${STATES[c]} (${o.counts[c]})</option>`).join('');
  return `<section id="all" class="block" aria-labelledby="h-all">
<div class="block-head">
<div><h2 id="h-all">${esc(o.title)}</h2><p class="muted" data-range-for="${id}">${shows.length} upcoming show${shows.length === 1 ? '' : 's'}</p></div>
<label class="state-pick" for="state-pick">State
<select id="state-pick" data-nav><option value="${h('')}#all"${o.curState ? '' : ' selected'}>All states</option>${opts}</select></label>
</div>
${o.chips ? `<div class="fchips" role="group" aria-label="Show only" data-chips-for="${id}"><button type="button" class="fchip" data-f="all" aria-pressed="true">All</button><button type="button" class="fchip" data-f="weekend" aria-pressed="false">This weekend</button><button type="button" class="fchip" data-f="major" aria-pressed="false">Major only</button></div>` : ''}
<div class="table-wrap"><table class="shows" id="${id}" data-per="20"${o.filter ? ` data-filter="${o.filter}"` : ''}>
<thead><tr><th scope="col" class="c-date">Date</th><th scope="col" class="c-st">State</th><th scope="col">Name of the coin show</th></tr></thead>
<tbody>
${shows.map(s => showRow(s, h)).join('\n')}
</tbody></table></div>
<p class="empty" data-empty-for="${id}"${shows.length ? ' hidden' : ''}>${o.empty}</p>
<nav class="pager" data-pager-for="${id}" aria-label="Pages of shows"></nav>
</section>`;
}

/* ---------- near me ----------
   One ZIP form per page (id near-form). On the home page it sits in the banner and the
   results open right under it; on other pages it is a block near the bottom. */
function nearForm() {
  return `<form id="near-form" class="near-form" novalidate role="search" aria-label="Find coin shows near a ZIP code">
<label for="near-zip" class="near-label">Your ZIP code</label>
<div class="zip-row">
<input id="near-zip" name="zip" type="text" inputmode="numeric" autocomplete="postal-code" maxlength="5" placeholder="Your ZIP code">
<button type="submit" class="btn btn-primary">Find shows</button>
</div>
<button type="button" class="linkish" id="near-gps"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.2"/><path d="M10 1.5v3M10 15.5v3M1.5 10h3M15.5 10h3"/><circle cx="10" cy="10" r="6.2"/></svg>Or use my location</button>
<p class="err" id="near-err" role="alert" hidden></p>
</form>`;
}
function nearResults(hidden) {
  return `<section id="near" class="near-out" aria-labelledby="h-near"${hidden ? ' hidden' : ''}>
<div class="near-head"><h2 id="h-near">Coin shows near you</h2>
<div class="near-tools"><label for="near-radius">Within <select id="near-radius" name="radius"><option value="50">50 miles</option><option value="100">100 miles</option><option value="150" selected>150 miles</option><option value="300">300 miles</option></select></label>
<button type="button" class="linkish" id="near-clear">Change ZIP</button></div></div>
<div id="near-results" aria-live="polite"></div>
</section>`;
}
function nearSection() {
  return `<section class="block near" aria-labelledby="h-near-find">
<h2 id="h-near-find">Coin shows near me</h2>
<p class="muted">Enter your ZIP code to see shows within driving distance, nearest dates first.</p>
${nearForm()}
${nearResults(true)}
</section>`;
}

/* ---------- date strip: the next 14 days, with a show count on each ---------- */
function dateStrip() {
  const { upcoming } = SITEDATA;
  const days = [];
  for (let i = 0; i < 14; i++) {
    const iso = addDays(todayISO, i), d = D(iso);
    const n = upcoming.filter(s => s.start <= iso && s.end >= iso).length;
    const first = i === 0 || d.getUTCDate() === 1;
    days.push(`<li><button type="button" class="day${n ? '' : ' zero'}" data-day="${iso}" aria-pressed="false"${n ? '' : ' disabled'} aria-label="${DAY[d.getUTCDay()]}, ${MONTH[d.getUTCMonth()]} ${d.getUTCDate()}: ${n ? n + ' show' + (n === 1 ? '' : 's') : 'no shows'}">${first ? `<span class="dm">${MON[d.getUTCMonth()].toUpperCase()}</span>` : '<span class="dm" aria-hidden="true">&nbsp;</span>'}<span class="dw">${i === 0 ? 'Today' : DOW[d.getUTCDay()]}</span><span class="dn">${d.getUTCDate()}</span><span class="dc">${n ? n + (n === 1 ? ' show' : ' shows') : '–'}</span></button></li>`);
  }
  return `<section class="strip" aria-labelledby="h-strip">
<div class="strip-head"><h2 id="h-strip">The next two weeks</h2><span class="muted">Tap a day to see its shows</span></div>
<ul class="days" id="days">${days.join('')}</ul>
</section>`;
}

function sponsorCard(h) {
  const sp = config.sponsor || {};
  return `<aside class="sponsor-card" aria-label="Sponsor"><div><span class="sp-k">Sponsor</span><p class="sp-h">Selling a collection? ${esc(sp.line || '')}</p><p class="sp-s">${esc(sp.sub || '')}</p></div><a class="btn btn-ghost" href="${h('sell-your-coins/')}">Get a fair offer</a></aside>`;
}

function signupBox() {
  const url = config.emailSignupUrl
    || `mailto:${config.contactEmail}?subject=${encodeURIComponent('Sign me up: monthly coin shows')}&body=${encodeURIComponent('Please send me coin shows near my ZIP code once a month.\n\nMy ZIP code: ')}`;
  const ext = /^https?:/i.test(url);
  return `<section class="signup" aria-labelledby="h-signup">
<div><h2 id="h-signup">Shows near you, once a month</h2><p>One short email with the coin shows coming up near your ZIP code. No spam. Unsubscribe anytime.</p></div>
<a class="btn btn-gold" href="${esc(url)}"${ext ? ' target="_blank" rel="noopener"' : ''}>Sign me up, free</a>
</section>`;
}

/* ---------- home banner: engraved banknote pattern, gold coin, tagline, ZIP finder ---------- */
const LOGO = '<svg class="logo-mark" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="#B8933F"/><circle cx="20" cy="20" r="15.5" fill="#D9B867"/><circle cx="20" cy="20" r="13.5" fill="none" stroke="#A07E33" stroke-width="1" stroke-dasharray="1.4 1.4"/><text x="20" y="25.5" text-anchor="middle" font-family="Georgia,serif" font-size="14.5" font-weight="700" fill="#6E520F">CC</text></svg>';
function guillocheSVG() {
  const ring = (cx, cy, R, amp, n, lobes, sx, sy, cls, op) => {
    let out = '';
    for (let k = 0; k < n; k++) {
      let d = '';
      for (let i = 0; i < 96; i++) {
        const a = i / 96 * Math.PI * 2, r = R + amp * Math.cos(lobes * a + k * 0.27);
        d += (i ? 'L' : 'M') + Math.round(cx + Math.cos(a) * r * sx) + ' ' + Math.round(cy + Math.sin(a) * r * sy);
      }
      out += `<path d="${d}Z"/>`;
    }
    return `<g class="${cls}" stroke-opacity="${op}">${out}</g>`;
  };
  return `<svg class="hero-art" viewBox="0 0 1200 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
<g fill="none" stroke="var(--wine)" stroke-width="1.1">
${ring(980, 210, 180, 12, 9, 11, 1.25, 1, 'gu-spin', .16)}
${ring(980, 210, 122, 9, 7, 9, 1.25, 1, 'gu-spin-rev', .2)}
${ring(980, 210, 66, 6, 5, 7, 1.25, 1, 'gu-spin', .24)}
</g>
<g fill="none" stroke="var(--brass)" stroke-width="1">${ring(140, 380, 170, 12, 6, 13, 1.4, 1, 'gu-spin-rev', .28)}</g>
</svg>`;
}
function coinSVG() {
  let reed = '';
  for (let i = 0; i < 120; i++) {
    const a = i / 120 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    reed += `M${(100 + c * 91).toFixed(1)} ${(100 + s * 91).toFixed(1)}L${(100 + c * 99).toFixed(1)} ${(100 + s * 99).toFixed(1)}`;
  }
  let stars = '';
  for (let j = 0; j < 13; j++) { const a = Math.PI * (0.18 + j * 0.0533); stars += `<circle cx="${(100 + Math.cos(a) * 70).toFixed(1)}" cy="${(100 + Math.sin(a) * 70).toFixed(1)}" r="2.3"/>`; }
  return `<svg class="hero-coin" viewBox="0 0 220 220" role="img" aria-label="Coin Calendar coin">
<defs><clipPath id="coin-clip"><circle cx="100" cy="100" r="99"/></clipPath><path id="coin-arc" d="M38 104 A62 62 0 0 1 162 104"/></defs>
<circle cx="110" cy="112" r="99" fill="var(--ink)" opacity=".18"/>
<circle cx="100" cy="100" r="99" fill="#B8933F"/>
<path d="${reed}" stroke="#7A5C1C" stroke-width="2.2"/>
<circle cx="100" cy="100" r="87" fill="#D9B867"/>
<circle cx="100" cy="100" r="84" fill="none" stroke="#A07E33" stroke-width="2.4"/>
<g fill="#8A6A24">${stars}</g>
<text font-family="Georgia,serif" font-size="12" font-weight="700" fill="#6E520F" letter-spacing="1.6"><textPath href="#coin-arc" startOffset="50%" text-anchor="middle">${esc(NAME.toUpperCase())}</textPath></text>
<text x="100" y="118" text-anchor="middle" font-family="Georgia,serif" font-size="50" font-weight="700" fill="#6E520F">CC</text>
<g clip-path="url(#coin-clip)"><rect class="coin-shine" x="-60" y="-20" width="34" height="240" fill="#fff" opacity=".38"/></g>
</svg>`;
}
/* Brand name with the key word in bold: "The <b>Coin</b> Calendar" */
function brandHTML() {
  const w = NAME.split(' '), k = w.length > 1 && /^the$/i.test(w[0]) ? 1 : 0;
  return w.map((x, i) => i === k ? `<b>${esc(x)}</b>` : `<span class="bw">${esc(x)}</span>`).join(' ');
}
function heroSection(h) {
  const { counts, upcoming } = SITEDATA;
  return `<section class="hero" aria-labelledby="h-hero">
${guillocheSVG()}
<div class="hero-coin-wrap">${coinSVG()}</div>
<div class="hero-text">
<p class="eyebrow">Updated daily · ${upcoming.length} shows<span class="eb-long"> in ${Object.keys(counts).length} states</span></p>
<h1 id="h-hero" class="hero-h1">Find a coin show near you</h1>
<span class="hero-rule" aria-hidden="true"></span>
<p class="hero-tag">${esc(config.tagline || '')}</p>
${nearForm()}
</div>
</section>`;
}

/* ---------- cover pictures ----------
   Every show gets a banknote-style cover drawn automatically.
   If the sheet has a photo for the show, the first photo is used instead. */
const COVER_COLORS = config.coverColors || [
  { bg: '#1C5B45', line: '#D9B867', text: '#FFFFFF', sub: '#E8D9A8' },
  { bg: '#14231D', line: '#B8933F', text: '#FFFFFF', sub: '#E8D9A8' },
  { bg: '#234A3E', line: '#C9B27A', text: '#FFFFFF', sub: '#E6D9B5' },
  { bg: '#3B2E1A', line: '#D9B867', text: '#FFFFFF', sub: '#E8D9A8' }
];
const MAJOR_COVER = config.majorCoverColors || { bg: '#14231D', line: '#D9B867', text: '#FFFFFF', sub: '#D9B867' };
const hashStr = str => { let x = 2166136261; for (const ch of str) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619); } return x >>> 0; };
const xml = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function coverSVG(s) {
  const W = 640, H = 360, hv = hashStr(s.slug), pal = s.tier === 'major' ? MAJOR_COVER : COVER_COLORS[hv % COVER_COLORS.length];
  const lobes = 7 + (hv % 6), cx = 505, cy = H / 2;
  let paths = '';
  [[128, 10, 6, .55], [92, 7, 5, .45], [56, 5, 4, .35]].forEach(([R, amp, n, op], ri) => {
    for (let k = 0; k < n; k++) {
      let d = '';
      for (let i = 0; i < 84; i++) {
        const a = i / 84 * Math.PI * 2, rad = R + amp * Math.cos(lobes * a + k * 0.32 + ri);
        d += (i ? 'L' : 'M') + Math.round(cx + Math.cos(a) * rad * 1.15) + ' ' + Math.round(cy + Math.sin(a) * rad * 0.95);
      }
      paths += `<path d="${d}Z" stroke="${pal.line}" stroke-opacity="${op}"/>`;
    }
  });
  const city = s.city.toUpperCase(), size = city.length <= 9 ? 54 : city.length <= 14 ? 42 : city.length <= 20 ? 32 : 26;
  const f = fmt(s);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${xml(s.name)}">
<rect width="${W}" height="${H}" fill="${pal.bg}"/>
<g fill="none" stroke-width="1.1">${paths}</g>
<rect x="12" y="12" width="${W - 24}" height="${H - 24}" fill="none" stroke="${pal.line}" stroke-opacity=".7" stroke-width="1.5"/>
<rect x="19" y="19" width="${W - 38}" height="${H - 38}" fill="none" stroke="${pal.line}" stroke-opacity=".35"/>
<g font-family="Georgia, 'Times New Roman', serif">
<text x="40" y="70" fill="${pal.sub}" font-size="15" letter-spacing="3">${xml(s.tier === 'major' ? 'NATIONAL COIN SHOW' : s.tier === 'regional' ? 'STATE & REGIONAL SHOW' : s.tier === 'dealer' ? 'DEALERS ONLY' : 'COIN SHOW')}</text>
<text x="38" y="${170 + (54 - size) / 2}" fill="${pal.text}" font-size="${size}" font-weight="700" letter-spacing="1">${xml(city)}</text>
<text x="40" y="${214}" fill="${pal.text}" font-size="22" opacity=".9">${xml(STATES[s.st])}</text>
<line x1="40" y1="246" x2="110" y2="246" stroke="${pal.line}" stroke-width="2"/>
<text x="40" y="290" fill="${pal.sub}" font-size="24" font-weight="700">${xml(f.date)}</text>
</g>
</svg>`;
}
const coverSrc = (s, h) => s.photos.length ? (/^https?:\/\//i.test(s.photos[0]) ? s.photos[0] : h('photos/' + s.photos[0].replace(/^\/+/, ''))) : h('covers/' + s.slug + '.svg');

function majorSlider(majors, h) {
  if (!majors.length) return '';
  const cards = majors.map(s => {
    const days = Math.round((D(s.start) - D(todayISO)) / 864e5);
    const when = days <= 0 ? 'Happening now' : days < 45 ? `In ${days} days` : `In about ${Math.round(days / 30)} months`;
    return `<li class="mcard"><a href="${h(s.path)}"><img class="m-img" src="${esc(coverSrc(s, h))}" alt="" width="640" height="360" loading="lazy"><span class="m-body"><span class="m-date">${esc(fmt(s).date)}</span><span class="m-name">${esc(s.name)}</span><span class="m-place">${esc(s.city)}, ${STATES[s.st]}</span><span class="m-when" data-countdown="${s.start}">${when}</span></span></a></li>`;
  }).join('\n');
  return `<section id="major" class="block" aria-labelledby="h-major">
<div class="block-head">
<div><h2 id="h-major">Major shows</h2><p class="muted">The national conventions worth planning a trip around. Swipe or use the arrows.</p></div>
<div class="arrows"><button type="button" class="arrow" data-slide="-1" aria-controls="major-track" aria-label="Previous major shows"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6"/></svg></button><button type="button" class="arrow arrow-next" data-slide="1" aria-controls="major-track" aria-label="Next major shows"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 4 6 6-6 6"/></svg></button></div>
</div>
<ul class="mtrack" id="major-track">
${cards}
</ul>
</section>`;
}

function featuredStrip(feat, h) {
  if (!feat.length) return '';
  return `<section class="featured" aria-label="Featured shows">${feat.slice(0, 3).map(s => `<a class="fcard" href="${h(s.path)}"><span class="tag tag-feat">Featured show</span><span class="f-name">${esc(s.name)}</span><span class="f-meta">${esc(fmt(s).date)} · ${esc(s.city)}, ${s.st}</span></a>`).join('')}</section>`;
}

function listBox(h) {
  return `<aside class="callout"><p><strong>Don't see your club's show?</strong> Listing is free and takes about 3 minutes.</p><a class="btn btn-primary" href="${h('submit/')}">List your show</a></aside>`;
}

/* ---------- layout ---------- */
let SITEDATA; // filled in main()

function page({ p, title, desc, active, body, jsonld, noindex, near, image }) {
  const depth = p ? p.split('/').filter(Boolean).length : 0;
  const h = linker(depth);
  const { counts, upcoming, weekendCount, majorCount } = SITEDATA;
  const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 10).sort((a, b) => STATES[a].localeCompare(STATES[b]));
  const nav = (key, href, label) => `<a class="nv${active === key ? ' on' : ''}" href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`;
  const stOn = active === 'states' || (active && active.startsWith('st:'));
  const ga = config.googleAnalyticsId ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(config.googleAnalyticsId)}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${esc(config.googleAnalyticsId)}');</script>` : '';
  const canonical = SITE + '/' + p;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${esc(canonical)}">`}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(NAME)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
${image ? `<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image">` : ''}
<meta name="theme-color" content="#14231D">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Ccircle cx='20' cy='20' r='19' fill='%23B8933F'/%3E%3Ccircle cx='20' cy='20' r='15.5' fill='%23D9B867'/%3E%3Ctext x='20' y='26' text-anchor='middle' font-family='Georgia' font-size='16' font-weight='700' fill='%236E520F'%3ECC%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,600;7..72,700&family=Atkinson+Hyperlegible:wght@400;700&display=swap">
<link rel="stylesheet" href="${h('assets/style.css')}?v=${ASSET_V}">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
${ga}
</head>
<body data-root="${depth ? '../'.repeat(depth) : './'}" data-preview="${PREVIEW ? '1' : '0'}">
<a class="skip" href="#content">Skip to main content</a>
<header class="top" data-open="false">
<div class="wrap top-in">
<a class="logo" href="${h('')}" aria-label="${esc(NAME)} home">${LOGO}<span>${brandHTML()}</span></a>
<button type="button" class="nav-btn" aria-expanded="false" aria-controls="site-nav"><svg viewBox="0 0 22 22" aria-hidden="true"><path d="M3 6h16M3 11h16M3 16h16"/></svg><span>Menu</span></button>
<nav class="nav" id="site-nav" aria-label="Main">
${nav('all', h('') + '#all', 'All shows')}
${nav('weekend', h('this-weekend/'), 'This weekend')}
${nav('major', h('major-coin-shows/'), 'Major shows')}
${(SITEDATA.dealerCount || 0) >= (config.dealersInMenuAt || 10) ? nav('dealers', h('dealers/'), 'Dealers') : ''}
<details class="nv-dd"><summary class="nv${stOn ? ' on' : ''}">By state</summary>
<div class="dd"><ul>${top.map(c => `<li><a href="${h('state/' + stateSlug(c) + '/')}"${active === 'st:' + c ? ' aria-current="page"' : ''}><span>${STATES[c]}</span><span class="n">${counts[c]}</span></a></li>`).join('')}</ul>
<a class="dd-all" href="${h('states/')}">See all 50 states →</a></div></details>
<a class="nv-cta${active === 'submit' ? ' on' : ''}" href="${h('submit/')}">List your show</a>
</nav>
</div>
</header>
<main id="content" class="wrap main">
${body(h)}
</main>
<footer class="foot">
<div class="wrap foot-in">
<div><p class="foot-name">${brandHTML()}</p><p class="foot-tag">${esc(config.tagline || '')}${config.founderLine ? ' ' + esc(config.founderLine) : ''}</p><p>Show dates can change. Always confirm with the organizer before you travel.</p><p>${esc(NAME)} is operated by ${esc(OPERATOR)}, which also sponsors this site.</p></div>
<nav aria-label="Footer"><a href="${h('') + '#all'}">All shows</a><a href="${h('this-weekend/')}">This weekend</a><a href="${h('major-coin-shows/')}">Major shows</a><a href="${h('states/')}">All states</a><a href="${h('dealers/')}">Dealers</a><a href="${h('submit/')}">List your show</a><a href="${h('sell-your-coins/')}">Sell your coins</a><a href="${h('about/')}">About</a><a href="${h('privacy/')}">Privacy</a><a href="${h('terms/')}">Terms</a></nav>
</div>
<p class="wrap copy">© ${D(todayISO).getUTCFullYear()} ${esc(NAME)}. Listings updated ${buildDateLong}.</p>
</footer>
<script src="${h('assets/app.js')}?v=${ASSET_V}" defer></script>
</body>
</html>`;
  const file = path.join(OUT, p, 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  if (!noindex) SITEDATA.pages.push(p);
}

/* ---------- calendar helpers ---------- */
const compact = iso => iso.replace(/-/g, '');
const fullAddress = s => [s.venue, s.address, `${s.city}, ${s.st}${s.zip ? ' ' + s.zip : ''}`].filter(Boolean).join(', ');
function googleCal(s) {
  const details = [s.hours && 'Hours: ' + s.hours, s.admission && 'Admission: ' + s.admission, SITE + '/' + s.path].filter(Boolean).join('\n');
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(s.name) + '&dates=' + compact(s.start) + '/' + compact(addDays(s.end, 1)) + '&location=' + encodeURIComponent(fullAddress(s)) + '&details=' + encodeURIComponent(details);
}
function ics(s) {
  const e = t => String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const host = SITE.replace(/^https?:\/\//, '') || 'thecoincalendar.com';
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${NAME}//EN`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${s.slug}@${host}`, `DTSTAMP:${compact(todayISO)}T000000Z`, `DTSTART;VALUE=DATE:${compact(s.start)}`, `DTEND;VALUE=DATE:${compact(addDays(s.end, 1))}`,
    `SUMMARY:${e(s.name)}`, `LOCATION:${e(fullAddress(s))}`, `DESCRIPTION:${e([s.hours && 'Hours: ' + s.hours, s.admission && 'Admission: ' + s.admission, 'Confirm dates with the organizer before you travel.'].filter(Boolean).join('\n'))}`,
    `URL:${SITE}/${s.path}`, 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
}

/* ---------- promoter tools: update link, dealer application, public contact ---------- */
const PREFILL = { show_id: s => s.showId, show_name: s => s.name, start_date: s => s.start, end_date: s => s.end, hours: s => s.hours,
  admission: s => s.admission, venue: s => s.venue, address: s => s.address, city: s => s.city, state: s => s.st, zip: s => s.zip,
  dealer_tables: s => s.tables, website: s => s.website, specialties: s => s.specialties.join(', '), dealer_application: s => s.dealerApp, organizer: s => s.organizer };
/* Link to the "Update this show" form with this show's public details already filled in.
   Before the form exists, falls back to an email with the details. Never pre-fills private contact info. */
function updateLink(s) {
  if (UPDATE_FORM && UPDATE_FORM.url && UPDATE_FORM.entries) {
    const q = Object.entries(UPDATE_FORM.entries).map(([k, entry]) => {
      const v = PREFILL[k] ? PREFILL[k](s) : '';
      return v ? entry + '=' + encodeURIComponent(String(v)).slice(0, 600) : '';
    }).filter(Boolean);
    return UPDATE_FORM.url + '?usp=pp_url&' + q.join('&');
  }
  const f = fmt(s);
  const body = `Show: ${s.name}\nDates on the site: ${f.date}\nShow ID: ${s.showId || s.slug}\n\nWhat should we change or add? (hours, admission, venue, dealer tables, dealer list, dealer application link)\n\n\nYour name:\nYour phone (optional):\nShow your name, email and phone on the show page? Yes / No\n`;
  return `mailto:${config.contactEmail}?subject=${encodeURIComponent('Update my show: ' + s.name + ' (' + f.date + ')')}&body=${encodeURIComponent(body)}`;
}
/* Organizer uploads this show's dealer application. Before the form exists: email with the file attached. */
function uploadLink(s, kind) {
  if (UPLOAD_FORM && UPLOAD_FORM.url && UPLOAD_FORM.entries) {
    const kindValue = kind && UPLOAD_FORM.kinds ? UPLOAD_FORM.kinds[kind] : '';
    const q = [['kind', kindValue], ['show_id', s.showId], ['show_name', s.name]].filter(([k, v]) => UPLOAD_FORM.entries[k] && v)
      .map(([k, v]) => UPLOAD_FORM.entries[k] + '=' + encodeURIComponent(v));
    return UPLOAD_FORM.url + '?usp=pp_url&' + q.join('&');
  }
  const f = fmt(s);
  if (kind === 'list') return `mailto:${config.contactEmail}?subject=${encodeURIComponent('Dealer list: ' + s.name + ' (' + f.date + ')')}&body=${encodeURIComponent(`Please attach your dealer list (PDF, Excel or CSV) to this email.\n\nShow: ${s.name}\nDates: ${f.date}\nShow ID: ${s.showId || s.slug}\nYour name:\n`)}`;
  return `mailto:${config.contactEmail}?subject=${encodeURIComponent('Dealer application: ' + s.name + ' (' + f.date + ')')}&body=${encodeURIComponent(`Please attach your dealer application (PDF) to this email.\n\nShow: ${s.name}\nDates: ${f.date}\nShow ID: ${s.showId || s.slug}\nYour name:\n`)}`;
}
const listHref = (s, h) => /^https?:\/\//i.test(s.dealerListFile) ? s.dealerListFile : h('dealer-lists/' + s.dealerListFile.replace(/^\/+/, ''));
const appHref = (s, h) => /^https?:\/\//i.test(s.dealerApp) ? s.dealerApp : h('applications/' + s.dealerApp.replace(/^\/+/, ''));
const appLabel = s => /\.pdf($|\?)/i.test(s.dealerApp) ? 'Download dealer application (PDF)' : 'Download dealer application';
const showsContact = s => s.publicContact && (s.contactName || s.contactPhone || s.contactEmail);

/* ---------- pages ---------- */
function buildPages(shows) {
  const { counts, upcoming, weekend, fri, sun } = SITEDATA;
  const majors = upcoming.filter(s => s.tier === 'major');
  const dealers = collectDealers(upcoming); // before the show pages, so dealer names can link to dealer pages
  applyDealerProfiles(dealers);
  fs.writeFileSync(path.join(OUT, 'assets/dealers.json'), JSON.stringify(dealers.map(e => ({ k: e.key, n: e.name, c: e.city || '', st: e.st || '', w: e.website || '', shows: e.stops.length }))));
  SITEDATA.dealerCount = dealers.length;
  const feat = upcoming.filter(s => s.featured);
  const yr = D(todayISO).getUTCFullYear(), years = `${yr}–${yr + 1}`;

  // Home
  page({ p: '', active: 'home', near: true, title: `${NAME}: Coin Shows Near You, ${years} Calendar`,
    desc: `Find coin shows near you. ${upcoming.length} upcoming U.S. coin, currency and bullion shows in ${Object.keys(counts).length} states, from FUN and ANA to local club shows.`,
    jsonld: { '@context': 'https://schema.org', '@type': 'WebSite', name: NAME, url: SITE + '/' },
    body: h => `<div class="home-top">${heroSection(h)}
${dateStrip()}
${nearResults(true)}</div>
${majorSlider(majors.slice(0, 10), h)}
${featuredStrip(feat, h)}
${sponsorCard(h)}
${listSection(upcoming, h, { title: 'All upcoming coin shows', counts, chips: true, empty: 'No upcoming shows are listed yet.' })}
${signupBox()}
${listBox(h)}` });

  // This weekend
  const wkTitle = `${MON[D(fri).getUTCMonth()]} ${D(fri).getUTCDate()}–${D(fri).getUTCMonth() === D(sun).getUTCMonth() ? '' : MON[D(sun).getUTCMonth()] + ' '}${D(sun).getUTCDate()}`;
  page({ p: 'this-weekend/', active: 'weekend', near: true, title: `Coin Shows This Weekend (${wkTitle}) | ${NAME}`,
    desc: `Coin shows happening this weekend across the U.S., ${wkTitle}. Dates, cities and directions.`,
    body: h => `<div class="page-head"><p class="crumb"><a href="${h('')}">Home</a> › This weekend</p><h1>Coin shows this weekend</h1><p class="lede">Friday through Sunday, ${wkTitle}. Pick your state, or enter your ZIP code below to see what's close.</p></div>
${listSection(weekend, h, { title: `${weekend.length} show${weekend.length === 1 ? '' : 's'} this weekend`, counts, filter: 'weekend', empty: 'No shows are listed for this weekend. See all upcoming shows on the home page.' })}
${nearSection()}
${sponsorCard(h)}
${signupBox()}` });

  // Major shows
  page({ p: 'major-coin-shows/', active: 'major', title: `Major Coin Shows ${years}: FUN, ANA, Baltimore, Long Beach | ${NAME}`,
    desc: `Dates and locations for the major national coin conventions: FUN, ANA World's Fair of Money, National Money Show, Central States, Baltimore, Long Beach and more.`,
    body: h => `<div class="page-head"><p class="crumb"><a href="${h('')}">Home</a> › Major shows</p><h1>Major coin shows</h1><p class="lede">The big national conventions, with hundreds of dealers and major auctions. Worth planning a trip around.</p></div>
${listSection(majors, h, { title: 'Upcoming national conventions', counts, empty: 'No major shows are listed right now.' })}` });

  // All states
  page({ p: 'states/', active: 'states', title: `Coin Shows by State | ${NAME}`,
    desc: 'Browse upcoming coin shows in every U.S. state.',
    body: h => `<div class="page-head"><p class="crumb"><a href="${h('')}">Home</a> › All states</p><h1>Coin shows by state</h1><p class="lede">Pick a state to see every upcoming show there, soonest first.</p></div>
<ul class="state-grid">${Object.keys(STATES).sort((a, b) => STATES[a].localeCompare(STATES[b])).map(c => `<li><a href="${h('state/' + stateSlug(c) + '/')}"><span>${STATES[c]}</span><span class="n">${counts[c] ? counts[c] + ' show' + (counts[c] === 1 ? '' : 's') : 'None yet'}</span></a></li>`).join('')}</ul>
${listBox(h)}` });

  // State pages
  for (const c of Object.keys(STATES)) {
    const list = upcoming.filter(s => s.st === c), n = STATES[c];
    const f = feat.filter(s => s.st === c);
    page({ p: `state/${stateSlug(c)}/`, active: 'st:' + c, near: true, title: `Coin Shows in ${n} ${years} | ${NAME}`,
      desc: list.length ? `${list.length} upcoming coin shows in ${n}: dates, cities and venues for ${years}. Find coin and currency shows near you.` : `Upcoming coin shows in ${n}. Know a show? List it free on ${NAME}.`,
      body: h => `<div class="page-head"><p class="crumb"><a href="${h('')}">Home</a> › <a href="${h('states/')}">States</a> › ${n}</p><h1>Coin shows in ${n}</h1><p class="lede">${list.length ? `${list.length} upcoming coin, currency and bullion show${list.length === 1 ? '' : 's'} in ${n}, soonest first.` : `No upcoming shows are listed in ${n} yet. If your club runs one, list it free.`}</p></div>
${featuredStrip(f, h)}
${listSection(list, h, { title: `Upcoming shows in ${n}`, counts, curState: c, empty: `No upcoming shows in ${n} yet. Enter your ZIP code below; a show just over the state line may be closer than you think.` })}
${nearSection()}
${sponsorCard(h)}
${signupBox()}
${listBox(h)}` });
  }

  // Show pages
  const splitHours = v => String(v || '').split(/,\s*(?![^()]*\))/).map(x => x.trim()).filter(Boolean);
  const photoSrc = (p, h) => /^https?:\/\//i.test(p) ? p : h('photos/' + p.replace(/^\/+/, ''));
  for (const s of upcoming) {
    const f = fmt(s), n = STATES[s.st];
    const more = upcoming.filter(x => x.st === s.st && x !== s).slice(0, 6);
    const ld = { '@context': 'https://schema.org', '@type': 'Event', name: s.name, startDate: s.start, endDate: s.end,
      eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: { '@type': 'Place', name: s.venue || `${s.city}, ${s.st}`, address: { '@type': 'PostalAddress', streetAddress: s.address || undefined, addressLocality: s.city, addressRegion: s.st, postalCode: s.zip || undefined, addressCountry: 'US' } },
      description: s.description || s.notes || `${TIER_LABEL[s.tier]} coin show in ${s.city}, ${n}.`, url: `${SITE}/${s.path}` };
    if (s.organizer) ld.organizer = { '@type': 'Organization', name: s.organizer, url: s.website || undefined };
    if (isFree(s)) ld.isAccessibleForFree = true;
    const rich = s.featured || s.tier === 'major';
    if (rich && s.photos.length) ld.image = s.photos.map(p => /^https?:/i.test(p) ? p : `${SITE}/photos/${p}`);
    const days = Math.round((D(s.start) - D(todayISO)) / 864e5);
    const when = days <= 0 ? 'Happening now' : days === 1 ? 'Tomorrow' : days < 45 ? `In ${days} days` : `In about ${Math.round(days / 30)} months`;
    const facts = [
      s.dealers.length ? `<a href="#dealers">${s.dealers.length} dealers listed ↓</a>` : s.tables && `${esc(s.tables)}${/table|dealer/i.test(s.tables) ? '' : ' dealer tables'}`,
      s.admission && (isFree(s) ? 'Free admission' : 'Admission: ' + esc(s.admission)),
      s.parking && (/^free/i.test(s.parking) ? 'Free parking' : 'Parking: ' + esc(s.parking)),
      s.appraisals && 'Free appraisals',
      s.auction && 'Auction on site',
      `<span data-countdown="${s.start}">${when}</span>`
    ].filter(Boolean);
    const extras = [
      s.auction && ['Auction', yes(s.auction) ? '' : esc(s.auction)],
      s.grading && ['Grading submissions on site', yes(s.grading) ? '' : esc(s.grading)],
      s.appraisals && ['Free appraisals', 'Bring a few pieces for an informal opinion'],
      s.exhibits && ['Exhibits', 'Collector and museum displays'],
      s.kids && ["Kids' program", 'Activities for young collectors'],
      s.prizes && ['Door prizes', ''],
      s.talks && ['Talks and seminars', 'Free educational programs']
    ].filter(Boolean);
    const hours = splitHours(s.hours);
    const addrLine = [s.address, `${s.city}, ${s.st}${s.zip ? ' ' + s.zip : ''}`].filter(Boolean).join(', ');
    const q = encodeURIComponent(fullAddress(s));
    const dir = 'https://www.google.com/maps/search/?api=1&query=' + q;
    const pageUrl = `${SITE}/${s.path}`;
    const shareText = `${s.name}, ${f.date}, ${s.city}, ${s.st}: ${pageUrl}`;
    const fixMail = `mailto:${config.contactEmail}?subject=${encodeURIComponent('Correction: ' + s.name + ' (' + f.date + ')')}&body=${encodeURIComponent('What should we fix?\n\n' + pageUrl)}`;
    page({ p: s.path, active: 'st:' + s.st, title: `${s.name}, ${f.date} | ${s.city}, ${s.st} Coin Show`,
      desc: `${s.name}: ${f.date} in ${s.city}, ${n}${s.venue ? ' at ' + s.venue : ''}. Hours, admission, parking, dealers, directions and add-to-calendar.`,
      jsonld: ld,
      image: s.photos.length ? (/^https?:/i.test(s.photos[0]) ? s.photos[0] : `${SITE}/photos/${s.photos[0]}`) : '',
      body: h => `<article class="show">
<p class="crumb"><a href="${h('')}">Home</a> › <a href="${h('state/' + stateSlug(s.st) + '/')}">${n}</a> › ${esc(s.name)}</p>
<div class="show-head">
<figure class="show-cover"><img src="${esc(coverSrc(s, h))}" alt="${s.photos.length ? esc(s.name) + ' photo' : ''}" width="640" height="360">${s.photos.length && s.photoCredit ? `<figcaption>Photo: ${esc(s.photoCredit)}</figcaption>` : ''}</figure>
<div class="show-text">
<div class="tags"><span class="tag tag-${s.tier}">${TIER_LABEL[s.tier]}</span>${s.featured ? '<span class="tag tag-feat">Featured</span>' : ''}${isFree(s) ? '<span class="tag tag-free">Free admission</span>' : ''}</div>
<h1>${esc(s.name)}</h1>
<p class="show-date">${esc(f.long)}</p>
<p class="show-where">${esc(s.venue ? s.venue + ' · ' : '')}${esc(s.city)}, ${n}</p>
<div class="actions">
<a class="btn btn-light" href="${esc(googleCal(s))}" target="_blank" rel="noopener">Add to Google Calendar</a>
<a class="btn btn-outline-light" href="event.ics" download="${esc(s.slug)}.ics">Apple or Outlook calendar</a>
<a class="btn btn-outline-light" href="${esc(dir)}" target="_blank" rel="noopener">Get directions</a>
${s.website ? `<a class="btn btn-outline-light" href="${esc(s.website)}" target="_blank" rel="noopener">Official website</a>` : ''}
</div>
</div>
</div>
<ul class="facts" aria-label="Quick facts">${facts.map(x => `<li>${x}</li>`).join('')}</ul>
${s.confirm ? '<p class="warn"><strong>Please confirm these dates.</strong> Listings for this show disagreed or were incomplete. Check with the organizer before you travel.</p>' : ''}
<div class="show-body">

<div class="pair">
<section class="block card" aria-labelledby="h-hours"><h2 id="h-hours">Show hours</h2>
${hours.length ? `<dl class="hours">${hours.map(x => { const m = x.match(/^([A-Za-z]{3,9}\.?(?:\s*[–-]\s*[A-Za-z]{3,9})?)\s+(.*)$/); return m ? `<div><dt>${esc(m[1])}</dt><dd>${esc(m[2])}</dd></div>` : `<div><dd>${esc(x)}</dd></div>`; }).join('')}</dl>` : `<p class="muted">Hours not posted yet. ${s.website ? 'Check the official website.' : 'Check with the organizer.'}</p>`}
<p class="muted small">${esc(f.long)}</p>
</section>
<section class="block card" aria-labelledby="h-find"><h2 id="h-find">What you'll find</h2>
${s.specialties.length ? `<ul class="chips">${s.specialties.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted">U.S. and world coins, currency and bullion are typical. The organizer has not posted specialties yet.</p>'}
${s.dealers.length ? `<p class="small"><a href="#dealers">See all ${s.dealers.length} dealers and their table numbers</a></p>` : s.tables ? `<p class="small">${esc(s.tables)}${/table|dealer/i.test(s.tables) ? '' : ' dealer tables'}</p>` : ''}
</section>
</div>

${extras.length ? `<section class="block" aria-labelledby="h-at"><h2 id="h-at">At the show</h2>
<ul class="checks">${extras.map(([k, v]) => `<li><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10.5 4 4 8-9"/></svg><span><strong>${k}</strong>${v ? `<span class="muted"> · ${v}</span>` : ''}</span></li>`).join('')}</ul>
</section>` : ''}

${rich && (s.description || s.photos.length > 1) ? `<section class="block" aria-labelledby="h-about"><h2 id="h-about">About this show</h2>
${s.photos.length > 1 ? `<div class="photos">${s.photos.slice(1, 7).map((p, i) => `<img src="${esc(photoSrc(p, h))}" alt="${esc(s.name)} photo ${i + 1}" loading="lazy">`).join('')}</div>` : ''}
${s.description ? `<div class="prose">${s.description.split(/\n{2,}|\r\n\r\n/).map(par => `<p>${esc(par)}</p>`).join('')}</div>` : ''}
</section>` : (s.notes ? `<section class="block" aria-labelledby="h-about"><h2 id="h-about">About this show</h2><p>${esc(s.notes)}</p></section>` : '')}

<section class="block" aria-labelledby="h-get"><h2 id="h-get">Getting there</h2>
<div class="getting">
<div class="map"><iframe title="Map of ${esc(s.venue || s.city)}" src="https://maps.google.com/maps?q=${q}&amp;z=14&amp;output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe><a class="map-fallback" href="${esc(dir)}" target="_blank" rel="noopener">Open the map</a></div>
<dl class="kvs">
${s.venue ? `<div class="kv"><dt>Venue</dt><dd>${esc(s.venue)}</dd></div>` : ''}
<div class="kv"><dt>Address</dt><dd>${esc(addrLine)}</dd></div>
<div class="kv"><dt>Parking</dt><dd>${s.parking ? esc(s.parking) : '<span class="muted">Not posted yet</span>'}</dd></div>
${s.hotel ? `<div class="kv"><dt>Hotel</dt><dd>${esc(s.hotel)}</dd></div>` : ''}
${s.organizer ? `<div class="kv"><dt>Host</dt><dd>${esc(s.organizer)}</dd></div>` : ''}
${showsContact(s) ? `<div class="kv kv-contact"><dt>Contact</dt><dd>${s.contactName ? `<span class="ct-name">${esc(s.contactName)}</span>` : ''}${s.contactPhone ? `<a href="tel:${esc(s.contactPhone.replace(/[^0-9+]/g, ''))}">${esc(s.contactPhone)}</a>` : ''}${s.contactEmail ? `<a href="mailto:${esc(s.contactEmail)}?subject=${encodeURIComponent(s.name)}">${esc(s.contactEmail)}</a>` : ''}<span class="muted small">Shared by the organizer</span></dd></div>` : ''}
</dl>
</div>
<p><a class="btn btn-primary" href="${esc(dir)}" target="_blank" rel="noopener">Get directions</a></p>
</section>

<section class="block" id="dealers" aria-labelledby="h-dealers"><div class="block-head"><div><h2 id="h-dealers">Dealers at this show</h2>
<p class="muted">${s.dealers.length ? `${s.dealers.length} dealer${s.dealers.length === 1 ? '' : 's'}, A to Z` : 'The dealer list has not been posted yet.'}${s.dealerListFile ? ` · <a href="${esc(listHref(s, h))}" target="_blank" rel="noopener"${!/^https?:/i.test(s.dealerListFile) ? ' download' : ''}>Organizer's full list${/\.pdf($|\?)/i.test(s.dealerListFile) ? ' (PDF)' : ''}</a>` : ''}</p></div>
${s.dealers.length > 15 ? `<div class="dealer-search dealer-search-head" role="search"><label for="dealer-find">Find a dealer</label><input id="dealer-find" type="search" placeholder="Dealer name or table number" autocomplete="off" data-filter-list="dealer-list"></div>` : ''}</div>
${s.dealers.length ? `<ul class="dealers" id="dealer-list"${s.dealers.length > 40 ? ' data-paginate="40"' : ''}>${s.dealers.map(d => `<li><span class="dl-name">${d.path ? `<a href="${h(d.path)}">${esc(d.name)}</a>` : esc(d.name)}</span>${d.table ? ` <span class="dl-table">#${esc(String(d.table).replace(/^#/, ''))}</span>` : ''}${d.city || d.st ? ` <span class="dl-loc">${esc([d.city, d.st].filter(Boolean).join(', '))}</span>` : ''}</li>`).join('')}</ul>
<nav class="pager" data-pager-for="dealer-list" aria-label="Dealer list pages" hidden></nav>
<p class="empty" data-empty-for-filter="dealer-list" hidden>No dealer matches that search.</p>` : `<p class="small app-none">Organizer? <a href="${esc(uploadLink(s, 'list'))}" target="_blank" rel="noopener">Upload your dealer list</a> (PDF, Excel or CSV) and we will add it here.</p>`}
${s.dealerApp ? `<div class="dealer-app"><div><strong>Want a table at this show?</strong><span class="muted"> Download the organizer's dealer application, fill it out and send it to them.</span></div><a class="btn btn-primary" href="${esc(appHref(s, h))}" target="_blank" rel="noopener"${!/^https?:/i.test(s.dealerApp) ? ' download' : ''}>${appLabel(s)}</a></div>` : `<p class="small app-none">The dealer application for this show has not been posted yet. <a href="${esc(uploadLink(s, 'application'))}" target="_blank" rel="noopener">Organizer? Upload it here.</a></p>`}

</section>

<aside class="promoter-box" aria-labelledby="h-promo-${esc(s.slug)}"><div><span class="sp-k">For the organizer</span><h2 id="h-promo-${esc(s.slug)}">Run this show? Update it free.</h2>
<p>Fix the date or hours, add your dealer list, upload your dealer application so dealers can download it, and choose whether to show your contact info here.</p></div>
<div class="promo-btns"><a class="btn btn-gold" href="${esc(updateLink(s))}" target="_blank" rel="noopener">Update this show</a><a class="btn btn-ghost" href="${esc(uploadLink(s, 'list'))}" target="_blank" rel="noopener">${s.dealers.length ? 'Replace dealer list' : 'Upload dealer list'}</a><a class="btn btn-ghost" href="${esc(uploadLink(s, 'application'))}" target="_blank" rel="noopener">${s.dealerApp ? 'Replace dealer application' : 'Upload dealer application'}</a></div></aside>

${more.length ? `<section class="block" aria-labelledby="h-more"><h2 id="h-more">More coin shows in ${n}</h2>
<div class="table-wrap"><table class="shows"><thead><tr><th scope="col" class="c-date">Date</th><th scope="col" class="c-st">State</th><th scope="col">Name of the coin show</th></tr></thead><tbody>${more.map(x => showRow(x, h)).join('')}</tbody></table></div>
<p><a href="${h('state/' + stateSlug(s.st) + '/')}">See all shows in ${n}</a></p></section>` : ''}

<section class="block share" aria-labelledby="h-share"><h2 id="h-share">Tell a friend about this show</h2>
<div class="share-row">
<a class="btn btn-ghost only-phone" href="sms:?&amp;body=${encodeURIComponent(shareText)}">Text a friend</a>
<a class="btn btn-ghost" href="mailto:?subject=${encodeURIComponent(s.name + ' coin show')}&amp;body=${encodeURIComponent('Thought you might like this coin show:\n\n' + shareText)}">Email a friend</a>
<button type="button" class="btn btn-ghost" data-copy="${esc(pageUrl)}">Copy link</button>
</div>
<p class="small">See a wrong date or detail? <a href="${esc(fixMail)}">Report it</a>, or email <strong class="sel">${esc(config.contactEmail)}</strong>. We fix listings quickly.</p>
</section>

<aside class="sponsor-wide"><span class="sp-k">Sponsor</span><h2>Selling coins at this show?</h2><p>${esc(config.sponsor.name)} buys U.S. coins and paper money. Talk to them before the show.</p><a class="btn btn-gold" href="${h('sell-your-coins/')}">How to sell your coins</a></aside>
<p class="muted small">Details come from the organizer and public show calendars. Dates can change, so confirm with the organizer before you travel. Page updated ${buildDateLong}.</p>
</div>
</article>` });
    fs.writeFileSync(path.join(OUT, s.path, 'event.ics'), ics(s));
    fs.mkdirSync(path.join(OUT, 'covers'), { recursive: true });
    fs.writeFileSync(path.join(OUT, 'covers', s.slug + '.svg'), coverSVG(s));
  }

  // Submit
  const formUrl = config.submitFormUrl || (UPDATE_FORM && UPDATE_FORM.url) || '';
  const form = formUrl
    ? `<div class="form-embed"><iframe src="${esc(formUrl)}${formUrl.includes('?') ? '&' : '?'}embedded=true" title="Submit your coin show" loading="lazy"></iframe></div><p class="muted">Form not showing? <a href="${esc(formUrl)}" target="_blank" rel="noopener">Open the form in a new tab</a>. Already listed? Use the <strong>Update this show</strong> button on your show's page instead.</p>`
    : `<div class="callout"><p>Email your show details to <strong class="sel">${esc(config.contactEmail)}</strong> and we'll add it.</p></div>`;
  page({ p: 'submit/', active: 'submit', title: `List Your Coin Show Free | ${NAME}`,
    desc: `Clubs and promoters: list your coin show free on ${NAME} so collectors near you can find it.`,
    body: h => `<div class="page-head"><p class="crumb"><a href="${h('')}">Home</a> › List your show</p><h1>List your coin show free</h1><p class="lede">Tell collectors when and where your show is. We check every listing and usually publish it within two business days.</p></div>
<div class="two">
<section class="block"><h2>Show details</h2>${form}</section>
<aside class="stack">
<div class="card"><h2>How it works</h2><ol><li>Fill out the form. It takes about 3 minutes.</li><li>We check the details with your club or website.</li><li>Your show goes live with its own page, map link and calendar button.</li></ol></div>
<div class="card"><h2>What to have ready</h2><ul><li>Show name and dates</li><li>Venue name and street address</li><li>Public hours and admission</li><li>Number of dealer tables</li><li>Website or Facebook page</li><li>Dealer application link (optional)</li><li>Your name and email (private unless you choose to show them)</li></ul></div>
<div class="card card-gold"><h2>Featured listing${config.featuredPrice ? ' · ' + esc(config.featuredPrice) : ''}</h2><p>Top of your state's list for 30 days, a gold Featured badge, and a spot on the home page.</p><p>Email <strong class="sel">${esc(config.contactEmail)}</strong> to reserve.</p></div>
</aside>
</div>` });

  // Sell your coins
  page({ p: 'sell-your-coins/', active: 'sell', title: `Selling a Coin Collection? How to Get a Fair Offer | ${NAME}`,
    desc: 'Inherited coins or paper money? How to sell at a coin show and get fair offers, from a working dealer.',
    body: h => `<div class="page-head"><p class="crumb"><a href="${h('')}">Home</a> › Sell your coins</p><h1>Selling a coin collection?</h1><p class="lede">Inherited coins or paper money can be worth more than you think. A few simple steps protect you from low offers.</p></div>
<section class="block prose"><h2>Five tips before you sell</h2><ol>
<li><strong>Don't clean anything.</strong> Cleaning can cut a coin's value in half or more. Leave coins and notes exactly as they are.</li>
<li><strong>Keep sets and holders together.</strong> Original mint packaging, albums and graded holders (PCGS, NGC, PMG) all matter.</li>
<li><strong>Get more than one offer.</strong> A coin show puts dozens of dealers in one room. Ask two or three before you decide.</li>
<li><strong>Know the bullion value.</strong> Silver and gold coins have a floor price based on metal. Check the day's spot price.</li>
<li><strong>Ask how the offer was made.</strong> A good dealer explains which pieces carry the value and why.</li>
</ol>
<p><a href="${h('')}#near">Find a coin show near you</a> to get offers in person.</p></section>
<aside class="sponsor-wide"><span class="sp-k">Our sponsor</span><h2>${esc(config.sponsor.name)}</h2><p>A professional U.S. coin and paper money dealer, set up at FUN, ANA and West Coast regional shows. Fair, no-pressure offers on single pieces and full collections.</p><a class="btn btn-gold" href="${esc(config.sponsor.url)}" target="_blank" rel="noopener">Contact ${esc(config.sponsor.name)}</a></aside>
<p class="muted small">${esc(NAME)} is operated by ${esc(OPERATOR)}. We tell you this so you can weigh our sponsor's offer like any other.</p>` });

  // Dealers: one page per dealer + an A to Z index
  for (const e of dealers) {
    const loc = [e.city, e.st && STATES[e.st] ? e.st : ''].filter(Boolean).join(', ');
    const next = e.stops[0], nf = fmt(next.s);
    const tableNo = t => t ? '#' + esc(String(t).replace(/^#/, '')) : '';
    // thin pages stay out of Google until they have something to offer (2+ shows, specialties or a verified profile)
    const rich = e.stops.length > 1 || e.verified || e.specs.length || e.groups.length;
    fs.mkdirSync(path.join(OUT, e.path), { recursive: true });
    fs.writeFileSync(path.join(OUT, e.path, 'shows.ics'), dealerIcs(e));
    page({ p: e.path, active: 'dealers', noindex: !rich, title: `${e.name}: Upcoming Coin Shows${loc ? ' | ' + loc : ''} | ${NAME}`,
      desc: `Where is ${e.name} next? ${e.stops.length} upcoming coin show${e.stops.length === 1 ? '' : 's'}${loc ? ' for this ' + loc + ' dealer' : ''}, with dates, cities and table numbers.`,
      jsonld: { '@context': 'https://schema.org', '@type': 'Organization', name: e.name, url: e.website ? webHref(e.website) : `${SITE}/${e.path}`, logo: e.logo ? `${SITE}/dealer-logos/${e.logo}` : undefined, telephone: e.phone || undefined, address: loc ? { '@type': 'PostalAddress', addressLocality: e.city || undefined, addressRegion: e.st || undefined, addressCountry: 'US' } : undefined },
      body: h => `<div class="dealer-top"><div class="page-head"><p class="crumb"><a href="${h('')}">Home</a> › <a href="${h('dealers/')}">Dealers</a> › ${esc(e.name)}</p>
${e.logo ? `<div class="dealer-id"><img class="dealer-logo" src="${h('dealer-logos/' + e.logo)}" alt="${esc(e.name)} logo" width="88" height="88"><div>` : ''}<h1>${esc(e.name)}${verifiedTag(e)}</h1><p class="lede">${loc ? `Coin dealer from ${esc(loc)}. ` : ''}${e.stops.length === 1 ? 'Find them at their next show.' : `${e.stops.length} upcoming shows where you can find them.`}</p>${e.logo ? '</div></div>' : ''}</div>
${e.specs.length || e.groups.length ? `<div class="dealer-tags">${e.specs.length ? `<div><span class="dt-k">Specialties</span><ul class="chips dealer-specs">${e.specs.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}${e.groups.length ? `<div><span class="dt-k">Member of</span><ul class="chips dealer-groups">${e.groups.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}</div>` : ''}
<div class="dealer-actions">${e.website ? `<a class="btn btn-ghost da-wide" href="${esc(webHref(e.website))}" target="_blank" rel="noopener nofollow">Website · ${esc(webLabel(e.website))}</a>` : ''}${e.phone ? `<a class="btn btn-ghost" href="${esc(telHref(e.phone))}" aria-label="Call ${esc(e.phone)}">Call<span class="da-num">&nbsp;${esc(e.phone)}</span></a>` : ''}${e.email ? `<a class="btn btn-ghost" href="mailto:${esc(e.email)}">Email</a>` : ''}${e.store ? `<a class="btn btn-ghost" href="${esc(webHref(e.store))}" target="_blank" rel="noopener nofollow">Shop online</a>` : ''}
<details class="cal-menu"><summary class="btn btn-ghost">Add their shows to my calendar</summary><div class="cal-pop"><p class="small muted">New shows for ${esc(e.name)} appear in your calendar by themselves.</p><a class="btn btn-primary" data-ics-sub="shows.ics" href="shows.ics">iPhone, Mac or Outlook</a><a class="btn btn-ghost" data-ics-google="shows.ics" href="shows.ics" target="_blank" rel="noopener">Google Calendar</a><a class="cal-dl" href="shows.ics" download="${esc(e.key)}-shows.ics">Download the calendar file</a></div></details></div>
<a class="dealer-next" href="${h(next.s.path)}"><span class="dn-k">Next show</span><span class="dn-name">${esc(next.s.name)}</span><span class="dn-meta">${esc(nf.date)} · ${esc(next.s.city)}, ${next.s.st}${next.s.venue ? ' · ' + esc(next.s.venue) : ''}</span>${next.table ? `<span class="dn-table">Table ${tableNo(next.table)}</span>` : ''}<span class="dn-go">Show hours, address and directions →</span></a></div>
${e.stops.length > 1 ? `<section class="block" aria-labelledby="h-dshows"><h2 id="h-dshows">All upcoming shows</h2>
<div class="table-wrap"><table class="shows"><thead><tr><th scope="col" class="c-date">Date</th><th scope="col" class="c-mi">Table</th><th scope="col">Coin show</th></tr></thead><tbody>
${e.stops.map(({ s: x, table }) => { const f = fmt(x); return `<tr><td class="c-date"><span class="d">${esc(shortDate(x))}</span><span class="dow">${esc(f.dow)}</span>${dateTile(x)}</td><td class="c-mi">${tableNo(table) || '<span class="muted">–</span>'}</td><td class="c-name"><a href="${h(x.path)}">${esc(x.name)}</a><span class="sub">${esc(x.city)}<span class="st-in">, ${x.st}</span>${x.venue ? ' · ' + esc(x.venue) : ''}</span></td></tr>`; }).join('\n')}
</tbody></table></div></section>` : ''}
<aside class="callout"><p><strong>${e.verified ? 'Is this your business?' : 'Is this your business? Claim it free.'}</strong> Add your specialties, logo, website and store${e.verified ? ', or correct your listing' : ' and get a ✓ Verified dealer badge'}.</p><a class="btn btn-ghost" href="${esc(dealerClaimLink(e))}" target="_blank" rel="noopener">${e.verified ? 'Update this profile' : 'Claim this profile'}</a></aside>` });
  }
  // where each dealer is based (their city), for "dealers near me"
  const dealerLL = e => { const c = e.city && e.st ? CITIES[normCity(e.city) + '|' + e.st] : null; return c || null; };
  const dStates = [...new Set(dealers.map(e => e.st).filter(st => STATES[st]))].sort((a, b) => STATES[a].localeCompare(STATES[b]));
  page({ p: 'dealers/', active: 'dealers', noindex: dealers.length < 10, title: `Coin Dealers Near You | ${NAME}`,
    desc: `Find coin dealers near you and the next show where you can meet them. ${dealers.length} dealers listed from show organizers' dealer lists.`,
    body: h => `<div class="page-head"><p class="crumb"><a href="${h('')}">Home</a> › Dealers</p><h1>Find a coin dealer near you</h1><p class="lede">Find dealers by name, specialty or state, and the next show where you can meet them at their table. Enter your ZIP code to see dealers based near you first.</p></div>
${dealers.length ? `<section class="block dealer-finder" aria-label="Dealers">
<form id="dealer-near" class="near-form dealer-near" novalidate role="search" aria-label="Find dealers near a ZIP code">
<label for="dealer-zip" class="near-label">Your ZIP code</label>
<div class="zip-row"><input id="dealer-zip" type="text" inputmode="numeric" autocomplete="postal-code" maxlength="5" placeholder="Your ZIP code"><button type="submit" class="btn btn-primary">Find dealers</button></div>
<p class="err" id="dealer-err" role="alert" hidden></p>
</form>
<div class="dealer-filter-row">${dealers.length > 15 ? `<div class="dealer-search" role="search"><label for="dealer-find">Find a dealer by name</label><input id="dealer-find" type="search" placeholder="Dealer name" autocomplete="off" data-filter-list="dealer-index"></div>` : ''}
${dStates.length > 1 ? `<label class="dealer-state" for="dealer-state">State<select id="dealer-state"><option value="">All states</option>${dStates.map(st => `<option value="${st}">${STATES[st]}</option>`).join('')}</select></label>` : ''}</div>
${dealers.some(e => e.specs.length) ? `<div class="fchips dealer-spec-chips" role="group" aria-label="Specialty"><button type="button" class="fchip" data-spec="" aria-pressed="true">All dealers</button>${SPECIALTIES.filter(sp => dealers.some(e => e.specs.includes(sp))).map(sp => `<button type="button" class="fchip" data-spec="${SPEC_ID[sp]}" aria-pressed="false">${esc(sp)}</button>`).join('')}</div>` : ''}
<p class="muted dl-count-note" id="dealer-sort-note" data-noloc="${dealers.filter(e => !dealerLL(e)).length}">${dealers.length} dealer${dealers.length === 1 ? '' : 's'}, A to Z</p>
<ul class="dealers" id="dealer-index"${dealers.length > 40 ? ' data-paginate="40"' : ''}>${dealers.map(e => { const ll = dealerLL(e); return `<li data-st="${esc(e.st || '')}" data-sp="${e.specs.map(x => SPEC_ID[x]).join(' ')}"${ll ? ` data-la="${ll[0]}" data-lo="${ll[1]}"` : ''}><span class="dl-name"><a href="${h(e.path)}">${esc(e.name)}</a>${e.verified ? ' <span class="dl-ok" title="Verified dealer">✓</span>' : ''}</span><span class="dl-table dl-count"><span class="dl-mi"></span>${e.stops.length > 1 ? e.stops.length + ' shows' : ''}</span><span class="dl-loc">${e.city || e.st ? esc([e.city, e.st].filter(Boolean).join(', ')) : '<span class="dl-noloc">Location not listed</span>'} · Next: <a href="${h(e.stops[0].s.path)}">${esc(e.stops[0].s.name)}</a>, ${esc(shortDate(e.stops[0].s))}${e.specs.length ? `<span class="dl-specs">${e.specs.map(x => esc(x)).join(' · ')}</span>` : ''}</span></li>`; }).join('')}</ul>
<nav class="pager" data-pager-for="dealer-index" aria-label="Dealer pages" hidden></nav>
<p class="empty" data-empty-for-filter="dealer-index" hidden>No dealer matches that search.</p>
<p class="muted small">Dealers come from show organizers' dealer lists and are listed by the city they are based in. Some lists do not include a city. Many dealers do business mainly at shows, so check their next show.</p></section>` : '<p class="muted">No dealer lists have been posted yet.</p>'}
<aside class="callout"><p><strong>Run a coin show?</strong> Open your show's page and tap <strong>Upload dealer list</strong>. A PDF, Excel or CSV file works. It is free.</p></aside>` });

  // About
  page({ p: 'about/', active: 'about', title: `About ${NAME}`,
    desc: `${NAME} lists every U.S. coin show we can confirm, run by people who work the bourse floor.`,
    body: h => `<div class="page-head"><p class="crumb"><a href="${h('')}">Home</a> › About</p><h1>About ${esc(NAME)}</h1></div>
<section class="block prose">
<p>${esc(NAME)} lists every U.S. coin, currency and bullion show we can confirm, from the national conventions to the Sunday club show at the Legion hall, so collectors can find one near them.</p>
<h2>Where the listings come from</h2>
<p>Show organizers send us their dates, and we check public show calendars and club websites. We rewrite each listing in our own words and link to the organizer. Dates can change, so always confirm before you travel.</p>
<h2>Who runs it</h2>
<p>${esc(NAME)} is operated by ${esc(OPERATOR)}, a professional coin and paper money dealer that sets up at shows across the country. ${esc(config.sponsor.name)} also sponsors the site.</p>
<h2 id="advertise">Advertise or sponsor</h2>
<p>Grading services, supply companies, auction houses and dealers can reach active collectors here. Email <strong class="sel">${esc(config.contactEmail)}</strong>.</p>
<h2>Fix a listing</h2>
<p>See a wrong date or a show that was canceled? Email <strong class="sel">${esc(config.contactEmail)}</strong> and we'll correct it quickly.</p>
</section>` });

  // Privacy
  page({ p: 'privacy/', active: 'privacy', title: `Privacy Policy | ${NAME}`, desc: `How ${NAME} handles your information.`,
    body: h => `<div class="page-head"><h1>Privacy policy</h1><p class="lede">Last updated ${buildDateLong}.</p></div>
<section class="block prose">
<p><strong>The short version:</strong> we collect very little, and we never sell your information.</p>
<h2>What we collect</h2>
<ul><li><strong>ZIP code searches</strong> stay in your own browser. "Near me" runs on your device; your ZIP or location is not sent to us. Your last ZIP may be remembered in your browser for next time.</li>
<li><strong>Show submissions</strong> you send (show details, your name and email) are used only to check and publish your listing.</li>
<li><strong>Email sign-ups</strong>, if you join our list, are stored by our email provider. Every email has an unsubscribe link.</li>
${config.googleAnalyticsId ? '<li><strong>Visitor statistics.</strong> We use Google Analytics to count visits and see which pages help people. It uses cookies. You can block them in your browser.</li>' : ''}</ul>
<h2>Links to other sites</h2><p>Show pages link to organizers, maps and calendars. Those sites have their own privacy policies.</p>
<h2>Contact</h2><p>Questions or a request to delete your information: <strong class="sel">${esc(config.contactEmail)}</strong>.</p>
</section>` });

  // Terms
  page({ p: 'terms/', active: 'terms', title: `Terms of Use | ${NAME}`, desc: `Terms of use for ${NAME}.`,
    body: h => `<div class="page-head"><h1>Terms of use</h1><p class="lede">Last updated ${buildDateLong}.</p></div>
<section class="block prose">
<h2>Listings are for information</h2><p>We work to keep show details accurate, but dates, hours, venues and admission can change or be canceled without notice. Confirm with the organizer before you travel. ${esc(NAME)} is not responsible for costs or losses from relying on a listing.</p>
<h2>We are not part of your purchases</h2><p>Buying, selling and trading at shows happens between you and the dealer or promoter. We do not guarantee any dealer, item or price.</p>
<h2>Submissions</h2><p>By sending a listing you confirm the details are accurate and that you may share them. We may edit, decline or remove any listing.</p>
<h2>Paid listings and sponsors</h2><p>Featured listings and sponsor messages are labeled. ${esc(NAME)} is operated by ${esc(OPERATOR)}, which also sponsors the site.</p>
<h2>Contact</h2><p><strong class="sel">${esc(config.contactEmail)}</strong></p>
</section>` });

  // 404
  page({ p: '404/', active: '', noindex: true, title: `Page not found | ${NAME}`, desc: 'Page not found.',
    body: h => `<div class="page-head"><h1>We couldn't find that page</h1><p class="lede">The show may have ended, or the link may be old.</p></div><p><a class="btn btn-primary" href="${h('')}">See upcoming coin shows</a></p>` });
  SITEDATA.pages = SITEDATA.pages.filter(p => p !== '404/');
}

/* ---------- dealer profiles: the "Dealer Profiles" tab (specialties, website, verified) ---------- */
/* data/dealer-profiles.csv: key, specialties, memberships, website, store, phone, public_email, logo, verified. No private data. */
function applyDealerProfiles(dealers) {
  const f = path.join(ROOT, 'data/dealer-profiles.csv');
  if (!fs.existsSync(f)) return;
  const byKey = new Map(dealers.map(e => [e.key, e]));
  for (const r of parseCSV(fs.readFileSync(f, 'utf8'))) {
    const e = byKey.get((r.key || '').trim());
    if (!e) continue;
    const want = splitList(r.specialties).map(x => SPECIALTIES.find(sp => sp.toLowerCase() === x.toLowerCase())).filter(Boolean);
    e.specs = SPECIALTIES.filter(sp => want.includes(sp));
    if ((r.website || '').trim()) e.website = r.website.trim();
    e.groups = splitList(r.memberships);
    e.store = (r.store || '').trim(); e.phone = (r.phone || '').trim(); e.email = (r.public_email || '').trim();
    e.logo = (r.logo || '').trim().replace(/[^\w.-]/g, '');
    e.verified = yes(r.verified);
  }
}
const webHref = w => /^https?:\/\//i.test(w) ? w : 'https://' + w;
const webLabel = w => w.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
/* One calendar file with every upcoming show for a dealer. Subscribed calendars refresh by themselves. */
function dealerIcs(e) {
  const x = t => String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const host = SITE.replace(/^https?:\/\//, '') || 'thecoincalendar.com';
  const ev = e.stops.map(({ s, table }) => ['BEGIN:VEVENT', `UID:${e.key}-${s.slug}@${host}`, `DTSTAMP:${compact(todayISO)}T000000Z`,
    `DTSTART;VALUE=DATE:${compact(s.start)}`, `DTEND;VALUE=DATE:${compact(addDays(s.end, 1))}`,
    `SUMMARY:${x(e.name + ' at ' + s.name + (table ? ' (table #' + String(table).replace(/^#/, '') + ')' : ''))}`,
    `LOCATION:${x(fullAddress(s))}`, `DESCRIPTION:${x('Confirm dates with the organizer before you travel.')}`, `URL:${SITE}/${s.path}`, 'END:VEVENT'].join('\r\n'));
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${NAME}//EN`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${x(e.name + ' coin shows')}`, 'REFRESH-INTERVAL;VALUE=DURATION:P1D', 'X-PUBLISHED-TTL:P1D', ...ev, 'END:VCALENDAR', ''].join('\r\n');
}
function dealerClaimLink(e) {
  if (DEALER_CLAIM_FORM && DEALER_CLAIM_FORM.url && DEALER_CLAIM_FORM.entries) {
    const q = [['dealer_key', e.key], ['dealer_name', e.name]].filter(([k]) => DEALER_CLAIM_FORM.entries[k]).map(([k, v]) => DEALER_CLAIM_FORM.entries[k] + '=' + encodeURIComponent(v));
    return DEALER_CLAIM_FORM.url + '?usp=pp_url&' + q.join('&');
  }
  return `mailto:${config.contactEmail}?subject=${encodeURIComponent('My dealer profile: ' + e.name)}&body=${encodeURIComponent(`Profile: ${SITE}/${e.path}\nDealer ID: ${e.key}\n\nYour name and role:\nSpecialties (Rare Coins, U.S. Paper Money, World Paper Money, Ancient, Bullion):\nMember of (ANA, PNG...):\nWebsite:\nOnline store:\nPhone for customers:\nEmail for customers:\n\nAttach your logo if you have one.`)}`;
}
const telHref = p => 'tel:' + String(p).replace(/[^\d+]/g, '');
const verifiedTag = e => e.verified ? ' <span class="tag tag-verified">✓ Verified dealer</span>' : '';

/* ---------- main ---------- */
async function main() {
  const csv = await loadCSV();
  const shows = cleanShows(parseCSV(csv));
  await loadDealers(shows);
  const upcoming = shows.filter(s => s.end >= todayISO);
  if (!upcoming.length) throw new Error('No approved upcoming shows were found. Check the "status" column says approved.');

  const dow = D(todayISO).getUTCDay();
  const fri = addDays(todayISO, dow === 0 ? -2 : dow === 6 ? -1 : 5 - dow), sun = addDays(fri, 2);
  const weekend = upcoming.filter(s => s.start <= sun && s.end >= fri);
  const counts = {}; upcoming.forEach(s => counts[s.st] = (counts[s.st] || 0) + 1);
  SITEDATA = { counts, upcoming, weekend, fri, sun, weekendCount: weekend.length, majorCount: upcoming.filter(s => s.tier === 'major').length, pages: [] };

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
  for (const f of ['style.css', 'app.js']) fs.copyFileSync(path.join(ROOT, 'assets', f), path.join(OUT, 'assets', f));
  fs.copyFileSync(path.join(ROOT, 'data/zip3.json'), path.join(OUT, 'assets/zip3.json'));
  if (fs.existsSync(path.join(ROOT, 'photos'))) fs.cpSync(path.join(ROOT, 'photos'), path.join(OUT, 'photos'), { recursive: true });
  // dealer applications you upload yourself (PDFs), referenced by file name in the dealer_application column
  if (fs.existsSync(path.join(ROOT, 'applications'))) fs.cpSync(path.join(ROOT, 'applications'), path.join(OUT, 'applications'), { recursive: true });
  // organizers' original dealer lists, linked from each show page
  if (fs.existsSync(path.join(ROOT, 'dealer-lists'))) fs.cpSync(path.join(ROOT, 'dealer-lists'), path.join(OUT, 'dealer-lists'), { recursive: true });
  // dealer logos from approved profiles
  if (fs.existsSync(path.join(ROOT, 'dealer-logos'))) fs.cpSync(path.join(ROOT, 'dealer-logos'), path.join(OUT, 'dealer-logos'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'assets/shows.json'), JSON.stringify(upcoming.map(s => ({ n: s.name, c: s.city, st: s.st, v: s.venue, s: s.start, e: s.end, la: s.la, lo: s.lo, p: s.path }))));

  buildPages(shows);
  fs.renameSync(path.join(OUT, '404/index.html'), path.join(OUT, '404.html'));
  fs.rmSync(path.join(OUT, '404'), { recursive: true, force: true });

  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${SITEDATA.pages.map(p => `<url><loc>${SITE}/${p}</loc><lastmod>${todayISO}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
  if (config.customDomain) fs.writeFileSync(path.join(OUT, 'CNAME'), config.customDomain.trim() + '\n');
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

  console.log(`Done. ${upcoming.length} upcoming shows, ${SITEDATA.pages.length} pages written to dist/.`);
  if (warnings.length) { console.log(`\n${warnings.length} thing(s) to check in the spreadsheet:`); warnings.forEach(w => console.log(' - ' + w)); }
}

main().catch(err => { console.error('\nBuild stopped: ' + err.message); process.exit(1); });
