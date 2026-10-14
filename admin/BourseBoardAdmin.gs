/**
 * Bourse Board admin panel for Google Sheets
 * ------------------------------------------
 * Paste this whole file into Extensions > Apps Script, save, and reload the sheet.
 * A "Bourse Board" menu appears at the top of the sheet.
 *
 * Tabs it uses:
 *   Shows      your show list (import data/shows.csv here)
 *   Dealers    dealers at each show (import data/dealers.csv here)
 *   Paid       who paid for what, and when it expires (created for you)
 *   Archive    past shows moved out of the way (created for you)
 *   Overview   your dashboard (created for you)
 *   Form Responses 1   promoter submissions from your Google Form (optional)
 */

var SHOWS = 'Shows', DEALERS = 'Dealers', PAID = 'Paid', ARCHIVE = 'Archive', OVERVIEW = 'Overview';
var BB_COL = 'Bourse Board';

var SHOW_COLUMNS = ['status', 'show_id', 'start_date', 'end_date', 'show_name', 'city', 'state', 'venue', 'address', 'zip', 'tier',
  'hours', 'admission', 'dealer_tables', 'parking', 'specialties', 'auction', 'grading', 'appraisals', 'exhibits', 'kids',
  'door_prizes', 'talks', 'hotel', 'website', 'organizer', 'notes', 'description', 'photos', 'confirm_dates', 'featured', 'lat', 'lon'];
var CHECKBOX_COLUMNS = ['appraisals', 'exhibits', 'kids', 'door_prizes', 'talks', 'confirm_dates', 'featured'];
var DEALER_COLUMNS = ['status', 'show_id', 'dealer', 'table', 'city', 'state'];
var PAID_COLUMNS = ['customer', 'email', 'bought', 'show_id_or_note', 'amount', 'paid_on', 'expires', 'notes'];
var STATUS_LIST = ['approved', 'pending', 'hidden'];
var TIER_LIST = ['major', 'regional', 'local', 'dealer'];
var PAID_TYPES = ['Featured show', 'Dealer Pro', 'Coin shop ad', 'Email sponsor', 'Other'];
var STATES = {AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'};

/* ===================== menu ===================== */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Bourse Board')
    .addItem('Publish site now', 'publishNow')
    .addItem('Check for problems', 'checkProblems')
    .addItem('Approve selected submission', 'approveSubmission')
    .addSeparator()
    .addItem('Archive past shows', 'archivePastShows')
    .addItem("What's expiring (paid)", 'expiringReport')
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Settings')
      .addItem('1. Set up admin sheet (run once)', 'setupAdmin')
      .addItem('2. Connect to GitHub (run once)', 'connectGitHub')
      .addItem('Turn nightly auto-publish on or off', 'toggleNightly'))
    .addItem('Help', 'showHelp')
    .addToUi();
}

/* ===================== helpers ===================== */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function ui_() { return SpreadsheetApp.getUi(); }
function tz_() { return ss_().getSpreadsheetTimeZone(); }
function props_() { return PropertiesService.getScriptProperties(); }

function headers_(sh) {
  if (sh.getLastColumn() === 0) return [];
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim().toLowerCase(); });
}
function col_(sh, name) { return headers_(sh).indexOf(name) + 1; }
function letter_(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

function ensureSheet_(name, columns) {
  var sh = ss_().getSheetByName(name);
  if (!sh) { sh = ss_().insertSheet(name); }
  var have = headers_(sh);
  var missing = columns.filter(function (c) { return have.indexOf(c) === -1; });
  if (missing.length) sh.getRange(1, have.filter(String).length + 1, 1, missing.length).setValues([missing]);
  styleHeader_(sh);
  return sh;
}
function styleHeader_(sh) {
  var n = Math.max(sh.getLastColumn(), 1);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, n).setFontWeight('bold').setBackground('#1F1A1B').setFontColor('#FFFFFF');
}

function asDate_(v) {
  if (v instanceof Date && !isNaN(v)) return v;
  var s = String(v || '').trim(), m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return new Date(+m[1], +m[2] - 1, +m[3]);
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))) return new Date(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1] - 1, +m[2]);
  return null;
}
function iso_(d) { return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd'); }
function today_() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function stateCode_(v) {
  var s = String(v || '').trim();
  if (STATES[s.toUpperCase()]) return s.toUpperCase();
  for (var c in STATES) if (STATES[c].toLowerCase() === s.toLowerCase()) return c;
  return '';
}
function truthy_(v) { return v === true || /^(y|yes|true|x|1)$/i.test(String(v || '').trim()); }

function csv_(headers, rows) {
  var esc = function (v) {
    if (v instanceof Date) v = iso_(v);
    else if (v === true) v = 'yes';
    else if (v === false || v === null || v === undefined) v = '';
    v = String(v);
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  return [headers.map(esc).join(',')].concat(rows.map(function (r) { return r.map(esc).join(','); })).join('\n') + '\n';
}

/* ===================== 1. setup ===================== */

function setupAdmin() {
  var ss = ss_();
  var shows = ss.getSheetByName(SHOWS);
  if (!shows) {
    var first = ss.getSheets()[0];
    if (headers_(first).indexOf('show_name') > -1) { first.setName(SHOWS); shows = first; }
    else { ui_().alert('First import data/shows.csv into this spreadsheet (File > Import), then run this again.'); return; }
  }
  shows = ensureSheet_(SHOWS, SHOW_COLUMNS);
  var last = Math.max(shows.getLastRow(), 2), maxRows = shows.getMaxRows();
  var H = headers_(shows), c = function (n) { return H.indexOf(n) + 1; };

  // fill blank end dates and turn yes/blank into checkboxes
  if (shows.getLastRow() > 1) {
    var data = shows.getRange(2, 1, shows.getLastRow() - 1, H.length).getValues();
    data.forEach(function (r) {
      if (r[c('start_date') - 1] !== '' && r[c('end_date') - 1] === '') r[c('end_date') - 1] = r[c('start_date') - 1];
      CHECKBOX_COLUMNS.forEach(function (k) { if (c(k)) r[c(k) - 1] = truthy_(r[c(k) - 1]); });
    });
    shows.getRange(2, 1, data.length, H.length).setValues(data);
  }
  var rows = maxRows - 1;
  shows.getRange(2, c('status'), rows).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUS_LIST, true).setAllowInvalid(false).build());
  shows.getRange(2, c('tier'), rows).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(TIER_LIST, true).setAllowInvalid(false).build());
  shows.getRange(2, c('state'), rows).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(Object.keys(STATES), true).setAllowInvalid(false).build());
  ['start_date', 'end_date'].forEach(function (k) {
    shows.getRange(2, c(k), rows).setNumberFormat('yyyy-mm-dd')
      .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).setHelpText('Enter a date, like 2027-01-07').build());
  });
  CHECKBOX_COLUMNS.forEach(function (k) { if (c(k)) shows.getRange(2, c(k), rows).insertCheckboxes(); });
  shows.getRange(2, c('zip'), rows).setNumberFormat('@');

  // colors: past = gray, pending = yellow, featured = gold, missing info = red
  var L = function (n) { return letter_(c(n)); };
  var all = shows.getRange(2, 1, rows, H.length);
  var rules = [
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($' + L('start_date') + '2<>"",IF($' + L('end_date') + '2<>"",$' + L('end_date') + '2,$' + L('start_date') + '2)<TODAY())')
      .setBackground('#EFEFEF').setFontColor('#9A9A9A').setRanges([all]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + L('status') + '2="pending"').setBackground('#FFF4C2').setRanges([all]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + L('featured') + '2=TRUE').setBackground('#FFF0D1').setRanges([all]).build()
  ];
  ['show_name', 'start_date', 'city', 'state', 'tier'].forEach(function (k) {
    rules.unshift(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($' + L('status') + '2<>"",' + L(k) + '2="")')
      .setBackground('#F8C9C4').setRanges([shows.getRange(2, c(k), rows)]).build());
  });
  shows.setConditionalFormatRules(rules);
  shows.setColumnWidth(c('show_name'), 280);
  shows.setColumnWidths(c('description'), 1, 260);

  // dealers
  var dealers = ensureSheet_(DEALERS, DEALER_COLUMNS);
  var dr = dealers.getMaxRows() - 1, DH = headers_(dealers);
  dealers.getRange(2, DH.indexOf('status') + 1, dr).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUS_LIST, true).build());
  dealers.getRange(2, DH.indexOf('state') + 1, dr).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(Object.keys(STATES), true).build());
  dealers.setColumnWidth(DH.indexOf('dealer') + 1, 240);

  // paid
  var paid = ensureSheet_(PAID, PAID_COLUMNS);
  var PH = headers_(paid), pr = paid.getMaxRows() - 1, pc = function (n) { return PH.indexOf(n) + 1; };
  paid.getRange(2, pc('bought'), pr).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(PAID_TYPES, true).build());
  paid.getRange(2, pc('amount'), pr).setNumberFormat('$#,##0.00');
  ['paid_on', 'expires'].forEach(function (k) { paid.getRange(2, pc(k), pr).setNumberFormat('yyyy-mm-dd'); });
  var exp = letter_(pc('expires')), prow = paid.getRange(2, 1, pr, PH.length);
  paid.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($' + exp + '2<>"",$' + exp + '2<TODAY())').setBackground('#F8C9C4').setRanges([prow]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($' + exp + '2<>"",$' + exp + '2<=TODAY()+14)').setBackground('#FFE0B8').setRanges([prow]).build()
  ]);

  ensureSheet_(ARCHIVE, headers_(shows));

  var form = formSheet_();
  if (form && col_(form, BB_COL.toLowerCase()) === 0) {
    form.getRange(1, form.getLastColumn() + 1).setValue(BB_COL).setFontWeight('bold');
  }

  buildOverview_();
  ui_().alert('Admin sheet is ready.\n\nNext: Bourse Board > Settings > 2. Connect to GitHub.');
}

function formSheet_() {
  var sheets = ss_().getSheets();
  for (var i = 0; i < sheets.length; i++) if (/^form responses/i.test(sheets[i].getName())) return sheets[i];
  return null;
}

function buildOverview_() {
  var ss = ss_(), ov = ss.getSheetByName(OVERVIEW) || ss.insertSheet(OVERVIEW, 0);
  var shows = ss.getSheetByName(SHOWS), paid = ss.getSheetByName(PAID), dealers = ss.getSheetByName(DEALERS);
  var S = function (n) { return "Shows!$" + letter_(col_(shows, n)) + ":$" + letter_(col_(shows, n)); };
  var P = function (n) { return "Paid!$" + letter_(col_(paid, n)) + ":$" + letter_(col_(paid, n)); };
  var D = function (n) { return "Dealers!$" + letter_(col_(dealers, n)) + ":$" + letter_(col_(dealers, n)); };
  var form = formSheet_();
  var rows = [
    ['Bourse Board', ''],
    ['', ''],
    ['Upcoming shows on the site', '=COUNTIFS(' + S('status') + ',"approved",' + S('end_date') + ',">="&TODAY())'],
    ['Shows this month', '=COUNTIFS(' + S('status') + ',"approved",' + S('start_date') + ',">="&EOMONTH(TODAY(),-1)+1,' + S('start_date') + ',"<="&EOMONTH(TODAY(),0))'],
    ['Waiting for review (pending)', '=COUNTIF(' + S('status') + ',"pending")'],
    ['Featured shows', '=COUNTIFS(' + S('featured') + ',TRUE,' + S('end_date') + ',">="&TODAY())'],
    ['Dealers listed', '=COUNTIF(' + D('status') + ',"approved")'],
    ['New form submissions', form ? "=MAX(0,COUNTA('" + form.getName() + "'!A:A)-1-COUNTIF('" + form.getName() + "'!" + letter_(Math.max(col_(form, 'bourse board'), 1)) + ':' + letter_(Math.max(col_(form, 'bourse board'), 1)) + ',"Added*"))' : 'Connect your Google Form'],
    ['', ''],
    ['Paid this year', '=SUMIFS(' + P('amount') + ',' + P('paid_on') + ',">="&DATE(YEAR(TODAY()),1,1))'],
    ['Paid this month', '=SUMIFS(' + P('amount') + ',' + P('paid_on') + ',">="&EOMONTH(TODAY(),-1)+1)'],
    ['Expiring in the next 14 days', '=COUNTIFS(' + P('expires') + ',">="&TODAY(),' + P('expires') + ',"<="&TODAY()+14)'],
    ['', ''],
    ['Last published', props_().getProperty('lastPublished') || 'Not yet'],
    ['Nightly auto-publish', props_().getProperty('nightly') === 'on' ? 'On (about 5am)' : 'Off']
  ];
  ov.clear();
  ov.getRange(1, 1, rows.length, 2).setValues(rows);
  ov.getRange('A1').setFontSize(20).setFontWeight('bold').setFontFamily('Georgia');
  ov.getRange('A3:A15').setFontSize(12);
  ov.getRange('B3:B15').setFontSize(14).setFontWeight('bold').setHorizontalAlignment('right');
  ov.getRange('B10:B11').setNumberFormat('$#,##0');
  ov.setColumnWidth(1, 300); ov.setColumnWidth(2, 200);
  ov.setHiddenGridlines(true);
}

/* ===================== 2. GitHub connection ===================== */

function connectGitHub() {
  var ui = ui_();
  var a = ui.prompt('Connect to GitHub (1 of 3)', 'Your GitHub username (for example: huytran):', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  var b = ui.prompt('Connect to GitHub (2 of 3)', 'Repository name (for example: bourse-board):', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  var t = ui.prompt('Connect to GitHub (3 of 3)', 'Paste your GitHub access token (see the Help page for how to make one):', ui.ButtonSet.OK_CANCEL);
  if (t.getSelectedButton() !== ui.Button.OK) return;
  var owner = a.getResponseText().trim(), repo = b.getResponseText().trim(), token = t.getResponseText().trim();
  var res = UrlFetchApp.fetch('https://api.github.com/repos/' + owner + '/' + repo, { headers: gh_(token), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    ui.alert('GitHub did not accept that (code ' + res.getResponseCode() + '). Check the username, repository name and token, then try again.');
    return;
  }
  var branch = JSON.parse(res.getContentText()).default_branch || 'main';
  props_().setProperties({ owner: owner, repo: repo, token: token, branch: branch });
  ui.alert('Connected to ' + owner + '/' + repo + '. You can now use "Publish site now".');
}
function gh_(token) {
  return { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
}

/* Saves one file to GitHub. Returns true if it changed. */
function putFile_(path, content, message) {
  var p = props_().getProperties();
  if (!p.token) throw new Error('Not connected to GitHub yet. Use Bourse Board > Settings > 2. Connect to GitHub.');
  var url = 'https://api.github.com/repos/' + p.owner + '/' + p.repo + '/contents/' + path;
  var got = UrlFetchApp.fetch(url + '?ref=' + encodeURIComponent(p.branch), { headers: gh_(p.token), muteHttpExceptions: true });
  var sha = null;
  if (got.getResponseCode() === 200) {
    var j = JSON.parse(got.getContentText());
    sha = j.sha;
    if (j.content) {
      var old = Utilities.newBlob(Utilities.base64Decode(j.content.replace(/\n/g, ''))).getDataAsString('UTF-8');
      if (old === content) return false;
    }
  } else if (got.getResponseCode() !== 404) {
    throw new Error('GitHub error ' + got.getResponseCode() + ' reading ' + path + '. Your token may have expired.');
  }
  var body = { message: message, content: Utilities.base64Encode(content, Utilities.Charset.UTF_8), branch: p.branch };
  if (sha) body.sha = sha;
  var put = UrlFetchApp.fetch(url, { method: 'put', headers: gh_(p.token), contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true });
  if (put.getResponseCode() >= 300) throw new Error('GitHub error ' + put.getResponseCode() + ' saving ' + path + ': ' + put.getContentText().slice(0, 200));
  return true;
}

/* ===================== publish ===================== */

function exportCsv_() {
  var shows = ss_().getSheetByName(SHOWS), dealers = ss_().getSheetByName(DEALERS);
  if (!shows) throw new Error('No "Shows" tab found. Run Settings > 1. Set up admin sheet.');
  var H = headers_(shows), si = H.indexOf('status');
  var rows = shows.getLastRow() > 1 ? shows.getRange(2, 1, shows.getLastRow() - 1, H.length).getValues() : [];
  var zi = H.indexOf('zip');
  var approved = rows.filter(function (r) { return String(r[si]).toLowerCase() === 'approved'; }).map(function (r) {
    if (zi > -1 && typeof r[zi] === 'number') r[zi] = String(r[zi]).padStart(5, '0');
    return r;
  });
  var out = { shows: csv_(H, approved), showCount: approved.length, dealers: null, dealerCount: 0 };
  if (dealers && dealers.getLastRow() > 1) {
    var DH = headers_(dealers), di = DH.indexOf('status');
    var drows = dealers.getRange(2, 1, dealers.getLastRow() - 1, DH.length).getValues()
      .filter(function (r) { return String(r[di] || 'approved').toLowerCase() === 'approved' && String(r[DH.indexOf('dealer')]).trim() !== ''; });
    out.dealers = csv_(DH, drows); out.dealerCount = drows.length;
  }
  return out;
}

function publishNow() {
  var ui = ui_();
  var problems = findProblems_();
  if (problems.length) {
    var r = ui.alert('Found ' + problems.length + ' problem(s)', problems.slice(0, 12).join('\n') + (problems.length > 12 ? '\n…and more. Use "Check for problems" to see all.' : '') + '\n\nRows with problems are skipped by the website. Publish anyway?', ui.ButtonSet.YES_NO);
    if (r !== ui.Button.YES) return;
  }
  try {
    var r2 = doPublish_();
    ui.alert(r2.changed ? 'Published ' + r2.showCount + ' shows and ' + r2.dealerCount + ' dealers.\n\nYour website updates in about 2–3 minutes.' : 'Nothing has changed since the last publish.');
  } catch (e) { ui.alert('Could not publish', e.message, ui.ButtonSet.OK); }
}

function doPublish_() {
  var x = exportCsv_(), stamp = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm');
  var changed = putFile_('data/shows.csv', x.shows, 'Update shows from Google Sheet (' + stamp + ')');
  if (x.dealers !== null) changed = putFile_('data/dealers.csv', x.dealers, 'Update dealers from Google Sheet (' + stamp + ')') || changed;
  if (changed) { props_().setProperty('lastPublished', stamp); buildOverview_(); }
  x.changed = changed;
  return x;
}

/* Called by the nightly trigger. No pop-ups. */
function publishSilently() { try { doPublish_(); } catch (e) { console.error(e); } }

function toggleNightly() {
  var on = props_().getProperty('nightly') === 'on';
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'publishSilently') ScriptApp.deleteTrigger(t); });
  if (!on) {
    ScriptApp.newTrigger('publishSilently').timeBased().everyDays(1).atHour(5).create();
    props_().setProperty('nightly', 'on');
    ui_().alert('Nightly auto-publish is ON. Your changes go live every morning around 5am, even if you forget to press Publish.');
  } else {
    props_().setProperty('nightly', 'off');
    ui_().alert('Nightly auto-publish is OFF. Use "Publish site now" after you make changes.');
  }
  buildOverview_();
}

/* ===================== check for problems ===================== */

function findProblems_() {
  var shows = ss_().getSheetByName(SHOWS);
  if (!shows || shows.getLastRow() < 2) return [];
  var H = headers_(shows), c = function (n) { return H.indexOf(n); };
  var rows = shows.getRange(2, 1, shows.getLastRow() - 1, H.length).getValues();
  var out = [], seen = {};
  rows.forEach(function (r, i) {
    var line = i + 2, status = String(r[c('status')]).toLowerCase();
    if (!status || status === 'hidden') return;
    var name = String(r[c('show_name')]).trim(), tag = 'Row ' + line + (name ? ' (' + name.slice(0, 40) + ')' : '') + ': ';
    if (STATUS_LIST.indexOf(status) === -1) out.push(tag + 'status should be approved, pending or hidden');
    if (!name) out.push(tag + 'missing show name');
    var s = asDate_(r[c('start_date')]), e = r[c('end_date')] === '' ? s : asDate_(r[c('end_date')]);
    if (!s) out.push(tag + 'start date missing or not a date');
    if (r[c('end_date')] !== '' && !e) out.push(tag + 'end date is not a date');
    if (s && e && e < s) out.push(tag + 'end date is before start date');
    if (!stateCode_(r[c('state')])) out.push(tag + 'state should be a 2-letter code like CA');
    if (!String(r[c('city')]).trim()) out.push(tag + 'missing city');
    if (TIER_LIST.indexOf(String(r[c('tier')]).toLowerCase()) === -1) out.push(tag + 'show size (tier) should be major, regional, local or dealer');
    var w = String(r[c('website')] || '').trim();
    if (w && /\s/.test(w)) out.push(tag + 'website has spaces in it');
    if (s && name) { var k = name.toLowerCase() + '|' + iso_(s); if (seen[k]) out.push(tag + 'looks like a duplicate of row ' + seen[k]); else seen[k] = line; }
  });
  return out;
}

function checkProblems() {
  var p = findProblems_();
  if (!p.length) { ui_().alert('No problems found. Everything looks good to publish.'); return; }
  var html = HtmlService.createHtmlOutput('<div style="font-family:Arial;font-size:14px;line-height:1.5"><p><b>' + p.length + ' thing(s) to fix in the Shows tab:</b></p><ul>' +
    p.map(function (x) { return '<li>' + x.replace(/[<>&]/g, '') + '</li>'; }).join('') + '</ul></div>').setWidth(560).setHeight(420);
  ui_().showModalDialog(html, 'Check for problems');
}

/* ===================== approve a form submission ===================== */

function approveSubmission() {
  var ui = ui_(), sh = SpreadsheetApp.getActiveSheet();
  if (!/^form responses/i.test(sh.getName())) { ui.alert('Go to the "Form Responses" tab, click any cell in the submission you want, then choose this again.'); return; }
  var row = SpreadsheetApp.getActiveRange().getRow();
  if (row < 2) { ui.alert('Click a cell in a submission row (not the header), then try again.'); return; }
  var H = headers_(sh), v = sh.getRange(row, 1, 1, H.length).getValues()[0];
  var bb = H.indexOf('bourse board');
  if (bb === -1) { bb = H.length; sh.getRange(1, bb + 1).setValue(BB_COL).setFontWeight('bold'); }
  if (/^added/i.test(String(v[bb] || ''))) { if (ui.alert('This submission was already added. Add it again?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return; }

  var find = function (words) {
    for (var i = 0; i < H.length; i++) for (var j = 0; j < words.length; j++) if (H[i].indexOf(words[j]) > -1) return v[i];
    return '';
  };
  var start = asDate_(find(['first day', 'start date', 'start'])), end = asDate_(find(['last day', 'end date', 'end']));
  var extras = String(find(['extras', 'at the show'])).toLowerCase();
  var tables = String(find(['dealer tables', 'tables'])).trim();
  var n = parseInt(tables, 10);
  var show = {
    status: 'approved', start_date: start || '', end_date: end || start || '',
    show_name: find(['show name']), city: find(['city']), state: stateCode_(find(['state'])),
    venue: find(['venue']), address: find(['street', 'address']), zip: String(find(['zip'])).trim(),
    tier: n >= 300 ? 'major' : n >= 60 ? 'regional' : 'local',
    hours: find(['hours']), admission: find(['admission']), dealer_tables: tables, parking: find(['parking']),
    specialties: find(['what collectors will find', 'specialt', 'find']),
    auction: extras.indexOf('auction') > -1 ? 'yes' : '', grading: extras.indexOf('grading') > -1 ? 'yes' : '',
    appraisals: extras.indexOf('apprais') > -1, exhibits: extras.indexOf('exhibit') > -1, kids: extras.indexOf('kid') > -1,
    door_prizes: extras.indexOf('door') > -1, talks: extras.indexOf('talk') > -1 || extras.indexOf('seminar') > -1,
    hotel: find(['hotel']), website: find(['website', 'facebook']), organizer: find(['club', 'organizer', 'host']),
    notes: find(['anything collectors', 'notes', 'anything else']), confirm_dates: false, featured: false
  };
  var r = ui.alert('Add "' + (show.show_name || 'this show') + '" to the website?',
    'YES = add it as approved (goes live next publish)\nNO = add it as pending so you can check it first', ui.ButtonSet.YES_NO_CANCEL);
  if (r === ui.Button.CANCEL || r === ui.Button.CLOSE) return;
  if (r === ui.Button.NO) show.status = 'pending';

  var shows = ss_().getSheetByName(SHOWS), SH = headers_(shows);
  var newRow = SH.map(function (h) { return show.hasOwnProperty(h) ? show[h] : ''; });
  shows.appendRow(newRow);
  var at = shows.getLastRow();
  CHECKBOX_COLUMNS.forEach(function (k) { var ci = SH.indexOf(k); if (ci > -1) shows.getRange(at, ci + 1).insertCheckboxes().setValue(!!show[k]); });
  sh.getRange(row, bb + 1).setValue('Added ' + Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd') + ' (' + show.status + ')');
  sh.getRange(row, 1, 1, H.length).setFontColor('#9A9A9A');
  shows.activate(); shows.setActiveRange(shows.getRange(at, SH.indexOf('show_name') + 1));
  var missing = ['show_name', 'start_date', 'city', 'state'].filter(function (k) { return !show[k]; });
  ui.alert('Added to the Shows tab (row ' + at + ').' + (missing.length ? '\n\nPlease fill in: ' + missing.join(', ') : '') + '\n\nCheck the show size and details, then use "Publish site now".');
}

/* ===================== archive and paid ===================== */

function archivePastShows() {
  var ui = ui_(), shows = ss_().getSheetByName(SHOWS);
  var H = headers_(shows), s = H.indexOf('start_date'), e = H.indexOf('end_date');
  if (shows.getLastRow() < 2) return;
  var rows = shows.getRange(2, 1, shows.getLastRow() - 1, H.length).getValues(), t = today_();
  var past = [];
  rows.forEach(function (r, i) { var d = asDate_(r[e]) || asDate_(r[s]); if (d && d < t) past.push(i + 2); });
  if (!past.length) { ui.alert('No past shows to archive.'); return; }
  if (ui.alert('Move ' + past.length + ' past show(s) to the Archive tab?', 'They already disappear from the website by themselves. This just tidies up your list.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  var arch = ensureSheet_(ARCHIVE, H);
  past.forEach(function (rn) { arch.appendRow(shows.getRange(rn, 1, 1, H.length).getValues()[0]); });
  for (var i = past.length - 1; i >= 0; i--) shows.deleteRow(past[i]);
  ui.alert('Moved ' + past.length + ' show(s) to Archive.');
}

function expiringReport() {
  var paid = ss_().getSheetByName(PAID);
  if (!paid || paid.getLastRow() < 2) { ui_().alert('The Paid tab is empty.'); return; }
  var H = headers_(paid), rows = paid.getRange(2, 1, paid.getLastRow() - 1, H.length).getValues(), t = today_();
  var soon = new Date(t); soon.setDate(t.getDate() + 14);
  var lines = [];
  rows.forEach(function (r) {
    var d = asDate_(r[H.indexOf('expires')]); if (!d || !r[H.indexOf('customer')]) return;
    if (d <= soon) lines.push((d < t ? 'EXPIRED ' : 'Expires ') + iso_(d) + ': ' + r[H.indexOf('customer')] + ' (' + r[H.indexOf('bought')] + ')' + (r[H.indexOf('email')] ? ' ' + r[H.indexOf('email')] : ''));
  });
  ui_().alert(lines.length ? "What's expiring" : 'Nothing expiring', lines.length ? lines.join('\n') + '\n\nRemember to turn off "featured" for expired listings, or email them to renew.' : 'No paid items expire in the next 14 days.', ui_().ButtonSet.OK);
}

/* ===================== help ===================== */

function showHelp() {
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:Arial;font-size:14px;line-height:1.55">' +
    '<h3 style="margin-top:0">Everyday use</h3>' +
    '<ul><li><b>Add a show:</b> new row in Shows. Status = approved.</li>' +
    '<li><b>Hide a show:</b> status = hidden (or pending).</li>' +
    '<li><b>Promoter submission:</b> Form Responses tab → click the row → Bourse Board › Approve selected submission.</li>' +
    '<li><b>Go live:</b> Bourse Board › Publish site now. The site updates in 2–3 minutes.</li>' +
    '<li><b>Paid listing:</b> tick featured, and add a row in Paid with the expiry date.</li></ul>' +
    '<h3>Colors in the Shows tab</h3><ul><li>Yellow = pending</li><li>Gold = featured</li><li>Gray = show is over</li><li>Red cell = required info missing</li></ul>' +
    '<h3>Making a GitHub token</h3><ol><li>GitHub › your photo › Settings › Developer settings › Personal access tokens › Fine-grained tokens › Generate new token.</li>' +
    '<li>Name: Bourse Board sheet. Expiration: 1 year.</li><li>Repository access: Only select repositories › bourse-board.</li>' +
    '<li>Permissions › Repository permissions › Contents: Read and write.</li><li>Generate, copy it, then use Settings › 2. Connect to GitHub.</li></ol>' +
    '<p>Keep the token private. When it expires, make a new one and connect again.</p></div>').setWidth(560).setHeight(520);
  ui_().showModalDialog(html, 'Bourse Board help');
}
