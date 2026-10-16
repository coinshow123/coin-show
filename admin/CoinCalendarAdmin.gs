/**
 * The Coin Calendar admin panel for Google Sheets
 * -----------------------------------------------
 * Paste this whole file into Extensions > Apps Script, save, and reload the sheet.
 * A "Coin Calendar" menu appears at the top of the sheet.
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
var BB_COL = 'Added to site';
// Older sheets used a column named "Bourse Board"; both names work.
function bbIdx_(H) { var i = H.indexOf('added to site'); return i > -1 ? i : H.indexOf('bourse board'); }

var SHOW_COLUMNS = ['status', 'show_id', 'start_date', 'end_date', 'show_name', 'city', 'state', 'venue', 'address', 'zip', 'tier',
  'hours', 'admission', 'dealer_tables', 'parking', 'specialties', 'auction', 'grading', 'appraisals', 'exhibits', 'kids',
  'door_prizes', 'talks', 'hotel', 'website', 'organizer', 'notes', 'description', 'photos', 'photo_credit', 'confirm_dates', 'featured', 'lat', 'lon',
  'contact', 'source', 'last_checked', 'contact_name', 'contact_phone', 'contact_email', 'public_contact', 'dealer_application', 'dealer_list_file'];
// Never published: your private research notes on how to reach the organizer.
var PRIVATE_COLUMNS = ['contact'];
// Published ONLY when the promoter ticked "show my contact info" (public_contact). Otherwise blanked on publish.
var OPT_IN_COLUMNS = ['contact_name', 'contact_phone', 'contact_email'];
var CHECKBOX_COLUMNS = ['appraisals', 'exhibits', 'kids', 'door_prizes', 'talks', 'confirm_dates', 'featured', 'public_contact'];
var DEALER_COLUMNS = ['status', 'show_id', 'dealer', 'table', 'city', 'state', 'check', 'source'];
var PAID_COLUMNS = ['customer', 'email', 'bought', 'show_id_or_note', 'amount', 'paid_on', 'expires', 'notes'];
var STATUS_LIST = ['approved', 'pending', 'hidden'];
var TIER_LIST = ['major', 'regional', 'local', 'dealer'];
var PAID_TYPES = ['Featured show', 'Dealer Pro', 'Coin shop ad', 'Email sponsor', 'Other'];
var STATES = {AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'};

/* ===================== menu ===================== */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Coin Calendar')
    .addItem('Publish site now', 'publishNow')
    .addItem('Check for problems', 'checkProblems')
    .addItem('Review show updates', 'reviewUpdates')
    .addItem('Approve selected submission', 'approveSubmission')
    .addSeparator()
    .addItem('Archive past shows', 'archivePastShows')
    .addItem("What's expiring (paid)", 'expiringReport')
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Settings')
      .addItem('1. Set up admin sheet (run once)', 'setupAdmin')
      .addItem('2. Connect to GitHub (run once)', 'connectGitHub')
      .addItem('3. Create the update form (run once)', 'createUpdateForm')
      .addItem('4. Create the organizer upload form (run once)', 'createUploadForm')
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
  if (form && col_(form, 'added to site') === 0 && col_(form, 'bourse board') === 0) {
    form.getRange(1, form.getLastColumn() + 1).setValue(BB_COL).setFontWeight('bold');
  }

  ensureIds_();
  buildOverview_();
  ui_().alert('Admin sheet is ready.\n\nNext: Coin Calendar > Settings > 2. Connect to GitHub.');
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
    ['The Coin Calendar', ''],
    ['', ''],
    ['Upcoming shows on the site', '=COUNTIFS(' + S('status') + ',"approved",' + S('end_date') + ',">="&TODAY())'],
    ['Shows this month', '=COUNTIFS(' + S('status') + ',"approved",' + S('start_date') + ',">="&EOMONTH(TODAY(),-1)+1,' + S('start_date') + ',"<="&EOMONTH(TODAY(),0))'],
    ['Waiting for review (pending)', '=COUNTIF(' + S('status') + ',"pending")'],
    ['Featured shows', '=COUNTIFS(' + S('featured') + ',TRUE,' + S('end_date') + ',">="&TODAY())'],
    ['Dealers listed', '=COUNTIF(' + D('status') + ',"approved")'],
    ['New form submissions', form ? "=MAX(0,COUNTA('" + form.getName() + "'!A:A)-1-COUNTIF('" + form.getName() + "'!" + letter_(Math.max(col_(form, 'added to site') || col_(form, 'bourse board'), 1)) + ':' + letter_(Math.max(col_(form, 'added to site') || col_(form, 'bourse board'), 1)) + ',"Added*"))' : 'Connect your Google Form'],
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
  var b = ui.prompt('Connect to GitHub (2 of 3)', 'Repository name (for example: coin-show):', ui.ButtonSet.OK_CANCEL);
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
  if (!p.token) throw new Error('Not connected to GitHub yet. Use Coin Calendar > Settings > 2. Connect to GitHub.');
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
  var keep = H.map(function (h, i) { return PRIVATE_COLUMNS.indexOf(h) === -1 ? i : -1; }).filter(function (i) { return i > -1; });
  var pub = H.indexOf('public_contact');
  var pick = function (r) {
    var isPublic = pub > -1 && truthy_(r[pub]);
    return keep.map(function (i) { return (!isPublic && OPT_IN_COLUMNS.indexOf(H[i]) > -1) ? '' : r[i]; });
  };
  var out = { shows: csv_(keep.map(function (i) { return H[i]; }), approved.map(pick)), showCount: approved.length, dealers: null, dealerCount: 0 };
  if (dealers && dealers.getLastRow() > 1) {
    var DH = headers_(dealers), di = DH.indexOf('status');
    var drows = dealers.getRange(2, 1, dealers.getLastRow() - 1, DH.length).getValues()
      .filter(function (r) { return String(r[di] || 'approved').toLowerCase() === 'approved' && String(r[DH.indexOf('dealer')]).trim() !== ''; });
    // "check" and "source" are your own notes; they stay in the sheet
    var dkeep = DH.map(function (h, i) { return i; }).filter(function (i) { return DH[i] && ['check', 'source'].indexOf(DH[i]) === -1; });
    out.dealers = csv_(dkeep.map(function (i) { return DH[i]; }), drows.map(function (r) { return dkeep.map(function (i) { return r[i]; }); })); out.dealerCount = drows.length;
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
  ensureIds_();
  var x = exportCsv_(), stamp = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm');
  var changed = putFile_('data/shows.csv', x.shows, 'Update shows from Google Sheet (' + stamp + ')');
  if (x.dealers !== null) changed = putFile_('data/dealers.csv', x.dealers, 'Update dealers from Google Sheet (' + stamp + ')') || changed;
  var upf = props_().getProperty('uploadForm');
  if (upf) changed = putFile_('data/upload-form.json', JSON.stringify(JSON.parse(upf), null, 2) + '\n', 'Connect the dealer application upload form') || changed;
  var uf = props_().getProperty('updateForm');
  if (uf) changed = putFile_('data/update-form.json', JSON.stringify(JSON.parse(uf), null, 2) + '\n', 'Connect the "Update this show" form') || changed;
  if (changed) { props_().setProperty('lastPublished', stamp); try { buildOverview_(); } catch (e) { console.error(e); } }
  x.changed = changed;
  return x;
}

/* Called by the nightly trigger. No pop-ups. */
function publishSilently() { try { autoApproveLists_(); } catch (e) { console.error(e); } try { doPublish_(); } catch (e) { console.error(e); } }

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
  var bb = bbIdx_(H);
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
    '<li><b>Promoter submission:</b> Form Responses tab → click the row → Coin Calendar › Approve selected submission.</li>' +
    '<li><b>Go live:</b> Coin Calendar › Publish site now. The site updates in 2–3 minutes.</li>' +
    '<li><b>Paid listing:</b> tick featured, and add a row in Paid with the expiry date.</li></ul>' +
    '<h3>Colors in the Shows tab</h3><ul><li>Yellow = pending</li><li>Gold = featured</li><li>Gray = show is over</li><li>Red cell = required info missing</li></ul>' +
    '<h3>Making a GitHub token</h3><ol><li>GitHub › your photo › Settings › Developer settings › Personal access tokens › Fine-grained tokens › Generate new token.</li>' +
    '<li>Name: Coin Calendar sheet. Expiration: 1 year.</li><li>Repository access: Only select repositories › your site repository.</li>' +
    '<li>Permissions › Repository permissions › Contents: Read and write.</li><li>Generate, copy it, then use Settings › 2. Connect to GitHub.</li></ol>' +
    '<p>Keep the token private. When it expires, make a new one and connect again.</p></div>').setWidth(560).setHeight(520);
  ui_().showModalDialog(html, 'Coin Calendar help');
}

/* ===================== "Update this show" form =====================
   One Google Form, made for you by Settings > 3. Create the update form.
   - Every show page on the website links to it with that show's details already filled in.
   - The "List your show" page uses the same form, empty, for new shows.
   - Answers land in the "Show Updates" tab. Coin Calendar > Review show updates shows only what changed.
   - Emails on the "Trusted Promoters" tab go live automatically (except date changes and cancellations). */

var UPDATES = 'Show Updates', TRUSTED = 'Trusted Promoters';
var UPDATE_FIELDS = [
  // key, question, help text, kind, filled in from this Shows column
  ['show_id', 'Show ID', "Please don't change this. It tells us which show you're updating. Leave it empty for a new show.", 'text', 'show_id'],
  ['still_on', 'Is this show still happening?', '', 'choice', ''],
  ['show_name', 'Show name', '', 'text', 'show_name'],
  ['start_date', 'First day', 'Like 2026-11-14', 'text', 'start_date'],
  ['end_date', 'Last day', 'Same as the first day for a one-day show', 'text', 'end_date'],
  ['hours', 'Public hours', 'Like: Sat 9am-5pm, Sun 9am-3pm', 'text', 'hours'],
  ['admission', 'Admission', 'Like: Free, or $5 (kids free)', 'text', 'admission'],
  ['venue', 'Venue name', '', 'text', 'venue'],
  ['address', 'Street address', '', 'text', 'address'],
  ['city', 'City', '', 'text', 'city'],
  ['state', 'State', 'Two letters, like CA', 'text', 'state'],
  ['zip', 'ZIP code', '', 'text', 'zip'],
  ['dealer_tables', 'Number of dealer tables', '', 'text', 'dealer_tables'],
  ['website', 'Show or club website', '', 'text', 'website'],
  ['specialties', 'What will be for sale?', 'Like: U.S. coins, paper money, world coins, bullion', 'text', 'specialties'],
  ['extras', 'Anything else at the show?', 'For example: auction, free appraisals, grading, kids table, door prizes, free parking', 'paragraph', ''],
  ['dealers', 'Dealers setting up (optional)', 'One per line: Business name, table number, city, state', 'paragraph', ''],
  ['organizer', 'Club or promoter name', '', 'text', 'organizer'],
  ['contact_name', 'Your name', '', 'text', ''],
  ['email', 'Your email', 'Kept private unless you choose to show it below.', 'email', ''],
  ['contact_phone', 'Your phone (optional)', 'Kept private unless you choose to show it below.', 'text', ''],
  ['public_contact', "Show your name, email and phone on this show's page?", 'Collectors and dealers can then contact you directly. You can change this any time.', 'publicchoice', ''],
  ['authorized', 'Confirmation', '', 'check', '']
];
var STILL_ON = ['Yes, as listed', 'Yes, but some details changed', 'Postponed', 'Canceled'];
var PUBLIC_CHOICES = ['Yes, show them on the show page', 'No, keep them private'];
var AUTHORIZED = 'I organize this show or am allowed to update it';

function createUpdateForm() {
  var ui = ui_(), p = props_();
  if (p.getProperty('updateFormId')) {
    var r = ui.alert('You already have an update form', 'Make a new one anyway? (The old one keeps working until you delete it.)', ui.ButtonSet.YES_NO);
    if (r !== ui.Button.YES) return;
  }
  var ss = ss_(), before = ss.getSheets().map(function (s) { return s.getSheetId(); });
  if (ss.getSheetByName(SHOWS)) ensureSheet_(SHOWS, SHOW_COLUMNS);
  var form = FormApp.create('Update your coin show | The Coin Calendar');
  form.setDescription('Add or correct the details collectors see on The Coin Calendar. It is free. We check every update and usually publish it within two days.')
    .setConfirmationMessage('Thank you! We will review your update and publish it soon. Questions? Reply to the email you receive or write hello@thecoincalendar.com.')
    .setAllowResponseEdits(false).setCollectEmail(false).setShowLinkToRespondAgain(false);
  var ids = {};
  UPDATE_FIELDS.forEach(function (f) {
    var item;
    if (f[3] === 'paragraph') item = form.addParagraphTextItem();
    else if (f[3] === 'choice') item = form.addMultipleChoiceItem().setChoiceValues(STILL_ON).setRequired(true);
    else if (f[3] === 'publicchoice') item = form.addMultipleChoiceItem().setChoiceValues(PUBLIC_CHOICES).setRequired(true);
    else if (f[3] === 'check') item = form.addCheckboxItem().setChoiceValues([AUTHORIZED]).setRequired(true);
    else {
      item = form.addTextItem();
      if (f[3] === 'email') item.setRequired(true).setValidation(FormApp.createTextValidation().requireTextIsEmail().setHelpText('Please enter an email address').build());
      if (f[0] === 'show_name' || f[0] === 'start_date' || f[0] === 'city' || f[0] === 'state' || f[0] === 'contact_name') item.setRequired(true);
    }
    item.setTitle(f[1]);
    if (f[2]) item.setHelpText(f[2]);
    ids[f[0]] = item.getId();
  });
  // Build a pre-filled link with placeholders, then read the field codes out of it.
  var resp = form.createResponse();
  UPDATE_FIELDS.forEach(function (f) {
    if (!f[4]) return;
    resp.withItemResponse(form.getItemById(ids[f[0]]).asTextItem().createResponse('__' + f[0] + '__'));
  });
  var pre = resp.toPrefilledUrl(), entries = {};
  pre.replace(/entry\.(\d+)=__([a-z_]+)__/g, function (m, id, key) { entries[key] = 'entry.' + id; return m; });
  var base = pre.split('?')[0];

  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  SpreadsheetApp.flush();
  var sheet = null;
  ss.getSheets().forEach(function (s) { if (before.indexOf(s.getSheetId()) === -1) sheet = s; });
  if (sheet) {
    var old = ss.getSheetByName(UPDATES);
    if (old && old.getSheetId() !== sheet.getSheetId()) old.setName(UPDATES + ' (old ' + iso_(new Date()) + ')');
    sheet.setName(UPDATES);
    sheet.getRange(1, sheet.getLastColumn() + 1, 1, 2).setValues([['Review status', 'Reviewed on']]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  var trusted = ensureSheet_(TRUSTED, ['email', 'name', 'trusted_on']);
  trusted.setColumnWidth(1, 260);

  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'onShowUpdate') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('onShowUpdate').forForm(form).onFormSubmit().create();

  var info = { url: base, entries: entries, made: iso_(new Date()) };
  p.setProperties({ updateFormId: form.getId(), updateForm: JSON.stringify(info) });
  var pushed = false;
  try { pushed = !!p.getProperty('token') && putFile_('data/update-form.json', JSON.stringify(info, null, 2) + '\n', 'Connect the "Update this show" form'); } catch (e) { }
  ui.alert('Your update form is ready',
    'Form: ' + form.getPublishedUrl() + '\n\nAnswers go to the "' + UPDATES + '" tab. ' +
    (pushed ? 'The website will show "Update this show" buttons in about 3 minutes.' : 'Press "Publish site now" to add the "Update this show" buttons to your website.'),
    ui.ButtonSet.OK);
}

/* Runs by itself each time someone sends the form. */
function onShowUpdate(e) {
  var sh = ss_().getSheetByName(UPDATES);
  if (!sh) return;
  var row = sh.getLastRow(), u = readUpdate_(sh, row);
  var trusted = isTrusted_(u.email);
  var found = findShow_(u.show_id);
  var safe = trusted && found && /^yes/i.test(u.still_on || '') &&
    (!u.start_date || normDate_(u.start_date) === normDate_(found.obj.start_date)) &&
    (!u.end_date || normDate_(u.end_date) === normDate_(found.obj.end_date || found.obj.start_date));
  if (safe) {
    applyUpdate_(row, false);
    try { doPublish_(); } catch (err) { console.error(err); }
    return;
  }
  try {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
      'Show update to review: ' + (u.show_name || 'new show'),
      (u.show_name || 'A show') + ' was ' + (found ? 'updated' : 'submitted') + ' by ' + (u.email || 'someone') + '.\n\n' +
      'Open your Coin Calendar sheet and choose Coin Calendar > Review show updates.\n' + ss_().getUrl());
  } catch (err) { console.error(err); }
}

/* ---------- reading and comparing ---------- */
function updateHeaders_(sh) {
  // Map form question titles back to our keys.
  var H = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String), map = {};
  H.forEach(function (h, i) {
    UPDATE_FIELDS.forEach(function (f) { if (h.trim() === f[1]) map[f[0]] = i; });
    if (/^timestamp$/i.test(h.trim())) map.timestamp = i;
    if (h.trim() === 'Review status') map.review = i;
    if (h.trim() === 'Reviewed on') map.reviewed_on = i;
  });
  return map;
}
function readUpdate_(sh, row) {
  var map = updateHeaders_(sh), v = sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0], u = { _row: row };
  Object.keys(map).forEach(function (k) { u[k] = v[map[k]]; });
  Object.keys(u).forEach(function (k) { if (typeof u[k] === 'string') u[k] = u[k].trim(); });
  return u;
}
function normDate_(v) {
  if (!v) return '';
  if (v instanceof Date) return iso_(v);
  var s = String(v).trim(), m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))) { var y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2); }
  var d = new Date(s);
  return isNaN(d) ? s : iso_(d);
}
function asDateCell_(v) {
  var s = normDate_(v), m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : v;
}
function findShow_(id) {
  if (!id) return null;
  var sh = ss_().getSheetByName(SHOWS), H = headers_(sh), ci = H.indexOf('show_id');
  if (ci === -1 || sh.getLastRow() < 2) return null;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, H.length).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][ci]).trim().toUpperCase() === String(id).trim().toUpperCase()) {
      var obj = {};
      H.forEach(function (h, j) { obj[h] = vals[i][j]; });
      return { row: i + 2, obj: obj, H: H };
    }
  }
  return null;
}
var COMPARE = ['show_name', 'start_date', 'end_date', 'hours', 'admission', 'venue', 'address', 'city', 'state', 'zip', 'dealer_tables', 'website', 'specialties', 'organizer', 'contact_name', 'contact_phone'];
var wantsPublic_ = function (v) { return /^yes/i.test(String(v || '')); };
/* Returns [{field, old, new}] for fields the promoter changed. Blank answers never erase what we have. */
function diffUpdate_(show, u) {
  var out = [];
  COMPARE.forEach(function (k) {
    var nv = u[k];
    if (nv === undefined || nv === null || String(nv).trim() === '') return;
    var ov = show ? show[k] : '';
    var a = /date/.test(k) ? normDate_(ov) : String(ov == null ? '' : ov).trim();
    var b = /date/.test(k) ? normDate_(nv) : String(nv).trim();
    if (k === 'state') b = b.toUpperCase();
    if (a !== b) out.push({ field: k, old: a, 'new': b });
  });
  if (u.still_on && !/^yes/i.test(u.still_on)) out.push({ field: 'status', old: show ? 'on' : '', 'new': u.still_on });
  if (u.extras) out.push({ field: 'extras', old: '', 'new': u.extras });
  if (u.dealers) out.push({ field: 'dealers', old: '', 'new': String(u.dealers).split(/\n+/).filter(String).length + ' dealer(s)' });
  if (u.public_contact) {
    var was = show && truthy_(show.public_contact) ? 'public' : 'private', now = wantsPublic_(u.public_contact) ? 'public' : 'private';
    if (was !== now || !show) out.push({ field: 'contact info on site', old: show ? was : '', 'new': now });
  }
  if (u.email && (!show || String(show.contact_email || '').trim().toLowerCase() !== String(u.email).trim().toLowerCase())) out.push({ field: 'contact email', old: show ? String(show.contact_email || '') : '', 'new': u.email });
  return out;
}
function parseDealers_(text) {
  return String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(String).map(function (l) {
    var p = l.split(/\s*,\s*/);
    var st = (p[3] || '').toUpperCase(), table = String(p[1] || '').replace(/^#/, '');
    if (!/^\d+[a-z]?$/i.test(table) && p.length === 3) { st = (p[2] || '').toUpperCase(); p = [p[0], '', p[1], p[2]]; table = ''; }
    return { dealer: p[0], table: table, city: p[2] || '', state: STATES[st] ? st : '' };
  });
}
function extrasFlags_(text) {
  var t = String(text || '').toLowerCase(), f = {};
  if (/auction/.test(t)) f.auction = 'yes';
  if (/grading|pcgs|ngc|pmg/.test(t)) f.grading = 'yes';
  if (/apprais/.test(t)) f.appraisals = true;
  if (/kid|youth|young/.test(t)) f.kids = true;
  if (/door prize|raffle/.test(t)) f.door_prizes = true;
  if (/exhibit/.test(t)) f.exhibits = true;
  if (/talk|seminar|speaker/.test(t)) f.talks = true;
  if (/free parking/.test(t)) f.parking = 'Free parking';
  return f;
}

/* ---------- applying ---------- */
function applyUpdate_(row, trust) {
  ensureSheet_(SHOWS, SHOW_COLUMNS); // adds any new columns (contact, dealer application) to older sheets
  var ss = ss_(), up = ss.getSheetByName(UPDATES), u = readUpdate_(up, row), map = updateHeaders_(up);
  var shows = ss.getSheetByName(SHOWS), found = findShow_(u.show_id), H = found ? found.H : headers_(shows);
  var set = {};
  COMPARE.forEach(function (k) { if (u[k] !== undefined && String(u[k]).trim() !== '') set[k] = u[k]; });
  if (set.state) set.state = String(set.state).toUpperCase();
  var flags = extrasFlags_(u.extras);
  Object.keys(flags).forEach(function (k) { set[k] = flags[k]; });
  if (u.email) set.contact_email = String(u.email).trim();
  if (u.public_contact) set.public_contact = wantsPublic_(u.public_contact);
  if (u.still_on === 'Canceled') { set.status = 'hidden'; }
  if (u.still_on === 'Postponed') { set.confirm_dates = true; }
  set.last_checked = new Date();
  var note = u.extras ? String(u.extras) : '';
  if (u.still_on === 'Canceled' || u.still_on === 'Postponed') note = (u.still_on + ' (organizer update ' + iso_(new Date()) + '). ' + note).trim();
  var rowNum;
  if (found) {
    rowNum = found.row;
    if (note && !String(found.obj.notes || '').trim()) set.notes = note;
    if (u.email && !String(found.obj.contact || '').trim()) set.contact = u.email;
    if (!/organizer update/.test(String(found.obj.source || ''))) set.source = (String(found.obj.source || '') + ' organizer update').trim();
  } else {
    // A new show from the "List your show" page
    shows.appendRow(H.map(function () { return ''; }));
    rowNum = shows.getLastRow();
    var id = (String(u.state || '').toUpperCase() + '-' + String(u.city || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-') + '-' + normDate_(u.start_date)).replace(/-+/g, '-');
    set.show_id = id; set.status = set.status || 'approved'; set.tier = 'local';
    set.contact = u.email || ''; set.notes = note; set.source = 'organizer update';
    if (!set.end_date) set.end_date = set.start_date;
  }
  H.forEach(function (h, j) {
    if (!(h in set)) return;
    var val = /^(start_date|end_date)$/.test(h) ? asDateCell_(set[h]) : set[h];
    if (h === 'zip') val = String(val);
    shows.getRange(rowNum, j + 1).setValue(val);
  });
  // dealers
  var list = parseDealers_(u.dealers);
  if (list.length) {
    var dealers = ensureSheet_(DEALERS, DEALER_COLUMNS), DH = headers_(dealers);
    var showId = found ? String(found.obj.show_id) : set.show_id;
    var have = dealers.getLastRow() > 1 ? dealers.getRange(2, 1, dealers.getLastRow() - 1, DH.length).getValues() : [];
    var key = function (sid, name) { return String(sid).toUpperCase() + '|' + String(name).toLowerCase().replace(/[^a-z0-9]/g, ''); };
    var seen = {};
    have.forEach(function (r) { seen[key(r[DH.indexOf('show_id')], r[DH.indexOf('dealer')])] = true; });
    list.forEach(function (d) {
      if (seen[key(showId, d.dealer)]) return;
      var r = DH.map(function (h) { return h === 'status' ? 'approved' : h === 'show_id' ? showId : h === 'dealer' ? d.dealer : d[h] || ''; });
      dealers.appendRow(r);
    });
  }
  up.getRange(row, map.review + 1, 1, 2).setValues([[found ? (trust === false ? 'Auto-applied (trusted)' : 'Approved') : 'Added as new show', new Date()]]);
  if (trust === true && u.email) trustEmail_(u.email, u.organizer);
}
function isTrusted_(email) {
  var t = ss_().getSheetByName(TRUSTED);
  if (!email || !t || t.getLastRow() < 2) return false;
  return t.getRange(2, 1, t.getLastRow() - 1, 1).getValues().some(function (r) { return String(r[0]).trim().toLowerCase() === String(email).trim().toLowerCase(); });
}
function trustEmail_(email, name) {
  if (isTrusted_(email)) return;
  ensureSheet_(TRUSTED, ['email', 'name', 'trusted_on']).appendRow([email, name || '', new Date()]);
}

/* ---------- the review window ---------- */
function reviewUpdates() {
  var sh = ss_().getSheetByName(UPDATES);
  if (!sh && !ss_().getSheetByName(UPLOADS)) { ui_().alert('No forms yet. Use Coin Calendar > Settings > 3 and 4 to create them.'); return; }
  var html = HtmlService.createHtmlOutput(reviewHtml_()).setWidth(760).setHeight(620);
  ui_().showModalDialog(html, 'Review show updates');
}
function pendingUpdates_() {
  var sh = ss_().getSheetByName(UPDATES), out = [];
  if (!sh || sh.getLastRow() < 2) return out;
  var map = updateHeaders_(sh);
  for (var r = 2; r <= sh.getLastRow(); r++) {
    var u = readUpdate_(sh, r);
    if (String(u.review || '').trim()) continue;
    var found = findShow_(u.show_id);
    out.push({ row: r, name: u.show_name || '(no name)', email: u.email || '', trusted: isTrusted_(u.email), isNew: !found,
      when: u.timestamp instanceof Date ? iso_(u.timestamp) : String(u.timestamp || ''), changes: diffUpdate_(found ? found.obj : null, u) });
  }
  return out;
}
function reviewHtml_() {
  var items = pendingUpdates_(), apps = pendingUploads_();
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var body = items.length ? items.map(function (it) {
    return '<div class="card" id="r' + it.row + '"><div class="top"><b>' + esc(it.name) + '</b>' + (it.isNew ? ' <span class="new">NEW SHOW</span>' : '') +
      '<span class="who">' + esc(it.email) + (it.trusted ? ' · trusted' : '') + ' · ' + esc(it.when) + '</span></div>' +
      (it.changes.length ? '<table>' + it.changes.map(function (c) {
        return '<tr><td class="f">' + esc(c.field.replace(/_/g, ' ')) + '</td><td class="o">' + esc(c.old || '(empty)') + '</td><td class="n">' + esc(c['new']) + '</td></tr>';
      }).join('') + '</table>' : '<p class="same">No changes. The organizer confirmed the listing as it is.</p>') +
      '<div class="btns"><button class="ok" onclick="go(' + it.row + ',\'approve\')">Approve</button>' +
      '<button onclick="go(' + it.row + ',\'trust\')">Approve and trust this email</button>' +
      '<button class="no" onclick="go(' + it.row + ',\'reject\')">Reject</button></div></div>';
  }).join('') : (apps.length ? '' : '<p>Nothing to review. 🎉</p>');
  return '<style>body{font:14px Arial,sans-serif;color:#14231D}.card{border:1px solid #DCE0D8;border-radius:8px;padding:12px;margin:0 0 12px}' +
    '.top{margin-bottom:8px}.who{float:right;color:#55635C;font-size:12px}.new{background:#B8933F;color:#14231D;font-size:11px;font-weight:bold;padding:1px 6px;border-radius:4px}' +
    'table{width:100%;border-collapse:collapse}td{border-top:1px solid #EEF0EB;padding:5px;vertical-align:top}.f{width:22%;color:#55635C}.o{width:35%;color:#9A9A9A;text-decoration:line-through}.n{font-weight:bold;color:#134A37}' +
    '.same{color:#55635C}.btns{margin-top:10px}button{font:inherit;padding:6px 12px;margin-right:6px;border-radius:5px;border:1px solid #1C5B45;background:#fff;color:#1C5B45;cursor:pointer}' +
    'button.ok{background:#1C5B45;color:#fff}button.no{border-color:#A3361B;color:#A3361B}.done{opacity:.45}</style>' +
    '<div id="list">' + body + uploadsHtml_(apps, esc) + '</div><p style="color:#55635C;font-size:12px">Approved changes go to the Shows tab. Press "Publish site now" when you are done (or let nightly publish do it).</p>' +
    '<script>function go(row,act){var c=document.getElementById("r"+row);c.className="card done";c.querySelectorAll("button").forEach(function(b){b.disabled=true});' +
    'google.script.run.withSuccessHandler(function(msg){c.querySelector(".btns").textContent=msg}).withFailureHandler(function(e){c.className="card";c.querySelector(".btns").textContent="Error: "+e.message}).decideUpdate(row,act)}</script>';
}
function decideUpload(row, action) {
  var up = ss_().getSheetByName(UPLOADS), map = uploadHeaders_(up);
  if (action === 'reject') { up.getRange(row, map.review + 1, 1, 2).setValues([['Rejected', new Date()]]); return 'Rejected. The file was not published.'; }
  var r = applyUpload_(row);
  if (action === 'trust' && r.email) trustEmail_(r.email, r.name);
  return 'Approved. ' + r.message;
}
function decideUpdate(row, action) {
  var up = ss_().getSheetByName(UPDATES), map = updateHeaders_(up);
  if (action === 'reject') { up.getRange(row, map.review + 1, 1, 2).setValues([['Rejected', new Date()]]); return 'Rejected.'; }
  applyUpdate_(row, action === 'trust');
  return action === 'trust' ? 'Approved. Future updates from this email go live by themselves.' : 'Approved and saved to the Shows tab.';
}

/* Every show needs a permanent ID so the website's "Update this show" link can find it. */
function ensureIds_() {
  var sh = ss_().getSheetByName(SHOWS);
  if (!sh || sh.getLastRow() < 2) return 0;
  var H = headers_(sh), ci = H.indexOf('show_id'), n = 0;
  if (ci === -1) return 0;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, H.length).getValues(), seen = {};
  v.forEach(function (r) { if (String(r[ci]).trim()) seen[String(r[ci]).trim().toUpperCase()] = true; });
  v.forEach(function (r, i) {
    if (String(r[ci]).trim() || !r[H.indexOf('show_name')]) return;
    var base = (String(r[H.indexOf('state')]).toUpperCase() + '-' + String(r[H.indexOf('city')]).toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 30) + '-' + normDate_(r[H.indexOf('start_date')])).replace(/-+/g, '-');
    var id = base, k = 2;
    while (seen[id]) id = base + '-' + (k++);
    seen[id] = true;
    sh.getRange(i + 2, ci + 1).setValue(id); n++;
  });
  return n;
}


/* ===================== Organizer file uploads: dealer applications and dealer lists =====================
   Settings > 4 makes one small Google Form where a show's organizer uploads a file for their show:
     - Dealer application: dealers download it from the show page.
     - Dealer list (PDF, Excel or CSV): read automatically into the Dealers tab, then shown on the show page.
   Google asks uploaders to sign in, so you always know who sent the file. You approve each file once;
   trusted organizers' files go live by themselves (dealer lists only when every row was read cleanly). */
var UPLOADS = 'Organizer Uploads';
var UPLOAD_FIELDS = [
  ['kind', 'What are you uploading?', ''],
  ['show_id', 'Show ID', "Please don't change this. It tells us which show the file is for."],
  ['show_name', 'Show name', ''],
  ['name', 'Your name', ''],
  ['authorized', 'Confirmation', '']
];
var KIND_APP = 'Dealer application (dealers download it from your show page)';
var KIND_LIST = 'Dealer list (who is setting up, with table numbers)';
var UPLOAD_FILE_TITLE = 'Your file';

function createUploadForm() {
  var ui = ui_(), p = props_();
  if (p.getProperty('uploadFormId')) {
    if (ui.alert('You already have an upload form', 'Make a new one anyway?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  }
  var ss = ss_(), before = ss.getSheets().map(function (x) { return x.getSheetId(); });
  if (ss.getSheetByName(SHOWS)) ensureSheet_(SHOWS, SHOW_COLUMNS);
  ensureSheet_(DEALERS, DEALER_COLUMNS);
  var form = FormApp.create('Upload a file for your coin show | The Coin Calendar');
  form.setDescription('For show organizers. Upload your dealer application or your dealer list (PDF, Excel or CSV). Dealer applications become a Download button on your show page. Dealer lists become the "Dealers at this show" list, A to Z with table numbers. We check every file before it goes live.')
    .setConfirmationMessage('Thank you! We will check the file and add it to your show page soon.')
    .setCollectEmail(true).setAllowResponseEdits(false).setShowLinkToRespondAgain(false);
  var ids = {};
  UPLOAD_FIELDS.forEach(function (f) {
    var item = f[0] === 'authorized' ? form.addCheckboxItem().setChoiceValues([AUTHORIZED]).setRequired(true)
      : f[0] === 'kind' ? form.addMultipleChoiceItem().setChoiceValues([KIND_LIST, KIND_APP]).setRequired(true)
      : form.addTextItem().setRequired(true);
    item.setTitle(f[1]);
    if (f[2]) item.setHelpText(f[2]);
    ids[f[0]] = item.getId();
  });
  var resp = form.createResponse();
  ['show_id', 'show_name'].forEach(function (k) { resp.withItemResponse(form.getItemById(ids[k]).asTextItem().createResponse('__' + k + '__')); });
  var pre = resp.toPrefilledUrl(), entries = {};
  pre.replace(/entry\.(\d+)=__([a-z_]+)__/g, function (m, id, key) { entries[key] = 'entry.' + id; return m; });
  // the "what are you uploading" answers, so each button on the site can pre-select one
  var kindUrl = form.createResponse().withItemResponse(form.getItemById(ids.kind).asMultipleChoiceItem().createResponse(KIND_LIST)).toPrefilledUrl();
  var km = kindUrl.match(/entry\.(\d+)=/);
  if (km) entries.kind = 'entry.' + km[1];
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  SpreadsheetApp.flush();
  var sheet = null;
  ss.getSheets().forEach(function (x) { if (before.indexOf(x.getSheetId()) === -1) sheet = x; });
  if (sheet) {
    var old = ss.getSheetByName(UPLOADS);
    if (old && old.getSheetId() !== sheet.getSheetId()) old.setName(UPLOADS + ' (old ' + iso_(new Date()) + ')');
    sheet.setName(UPLOADS);
    sheet.setFrozenRows(1);
  }
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'onApplicationUpload') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('onApplicationUpload').forForm(form).onFormSubmit().create();
  var info = { url: pre.split('?')[0], entries: entries, kinds: { list: KIND_LIST, application: KIND_APP }, made: iso_(new Date()) };
  p.setProperties({ uploadFormId: form.getId(), uploadForm: JSON.stringify(info) });
  try { if (p.getProperty('token')) putFile_('data/upload-form.json', JSON.stringify(info, null, 2) + '\n', 'Connect the organizer upload form'); } catch (e) { }
  ui.alert('Almost done: add the file box (1 minute)',
    'Google does not let a script add the file-upload box, so please add it yourself:\n\n' +
    '1. Open: ' + form.getEditUrl() + '\n' +
    '2. Click the + (Add question) button, then change the question type to "File upload". Click Continue if Google asks.\n' +
    '3. Question title: ' + UPLOAD_FILE_TITLE + '\n' +
    '4. Turn on "Allow only specific file types" and tick PDF, Document, Spreadsheet and Image.\n' +
    '5. Maximum number of files: 1. Maximum file size: 10 MB. Turn on Required.\n\n' +
    'Then press "Publish site now". Every show page gets "Upload dealer list" and "Upload dealer application" buttons for organizers.', ui.ButtonSet.OK);
}

function uploadHeaders_(sh) {
  var H = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String), map = {};
  H.forEach(function (h, i) {
    var t = h.trim();
    UPLOAD_FIELDS.forEach(function (f) { if (t === f[1]) map[f[0]] = i; });
    if (t === UPLOAD_FILE_TITLE || (/file upload|dealer application file/i.test(t) && map.file === undefined)) map.file = i;
    if (/^timestamp$/i.test(t)) map.timestamp = i;
    if (/^email address$/i.test(t)) map.email = i;
    if (t === 'Review status') map.review = i;
    if (t === 'Reviewed on') map.reviewed_on = i;
    if (t === 'Reading') map.reading = i;
  });
  if (map.review === undefined) {
    var n = sh.getLastColumn();
    sh.getRange(1, n + 1, 1, 3).setValues([['Review status', 'Reviewed on', 'Reading']]).setFontWeight('bold');
    map.review = n; map.reviewed_on = n + 1; map.reading = n + 2;
  } else if (map.reading === undefined) {
    var m2 = sh.getLastColumn();
    sh.getRange(1, m2 + 1).setValue('Reading').setFontWeight('bold'); map.reading = m2;
  }
  return map;
}
function readUpload_(sh, row) {
  var map = uploadHeaders_(sh), v = sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0], u = { _row: row };
  Object.keys(map).forEach(function (k) { u[k] = typeof v[map[k]] === 'string' ? v[map[k]].trim() : v[map[k]]; });
  var m = String(u.file || '').match(/[-\w]{25,}/);
  u.fileId = m ? m[0] : '';
  u.isList = /dealer list/i.test(String(u.kind || ''));
  return u;
}

/* ---------- dealer lists: the file goes to GitHub, the "Read dealer lists" workflow reads it ---------- */
function listBase_(u) { return safeName_(u.show_id) + '-r' + u._row; }
function fileExt_(name) { return (String(name || '').match(/\.([a-z0-9]{2,5})$/i) || [, 'pdf'])[1].toLowerCase(); }
function sendListForReading_(u) {
  var file = DriveApp.getFileById(u.fileId), ext = fileExt_(file.getName());
  if (['pdf', 'xlsx', 'xls', 'csv', 'txt'].indexOf(ext) === -1) throw new Error('Dealer lists must be a PDF, Excel or CSV file (this one is .' + ext + ').');
  putBinary_('incoming/dealer-lists/' + listBase_(u) + '.' + ext, file.getBlob().getBytes(), 'Dealer list to read: ' + (u.show_name || u.show_id));
  return ext;
}
function getRepoText_(path) {
  var p = props_().getProperties();
  if (!p.token) return null;
  var res = UrlFetchApp.fetch('https://api.github.com/repos/' + p.owner + '/' + p.repo + '/contents/' + path + '?ref=' + encodeURIComponent(p.branch),
    { headers: { Authorization: 'Bearer ' + p.token, Accept: 'application/vnd.github.raw+json', 'X-GitHub-Api-Version': '2022-11-28' }, muteHttpExceptions: true });
  return res.getResponseCode() === 200 ? res.getContentText() : null;
}
function readListResult_(u) {
  var t = getRepoText_('incoming/dealer-lists/' + listBase_(u) + '.json');
  return t ? JSON.parse(t) : null;
}
function deleteRepoFile_(path) {
  var p = props_().getProperties(); if (!p.token) return;
  var url = 'https://api.github.com/repos/' + p.owner + '/' + p.repo + '/contents/' + path;
  var got = UrlFetchApp.fetch(url + '?ref=' + encodeURIComponent(p.branch), { headers: gh_(p.token), muteHttpExceptions: true });
  if (got.getResponseCode() !== 200) return;
  UrlFetchApp.fetch(url, { method: 'delete', headers: gh_(p.token), contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ message: 'Clean up ' + path, sha: JSON.parse(got.getContentText()).sha, branch: p.branch }) });
}

function pendingUploads_() {
  var sh = ss_().getSheetByName(UPLOADS), out = [];
  if (!sh || sh.getLastRow() < 2) return out;
  for (var r = 2; r <= sh.getLastRow(); r++) {
    var u = readUpload_(sh, r);
    if (String(u.review || '').trim()) continue;
    var found = findShow_(u.show_id);
    var item = { row: r, isList: u.isList, show: found ? found.obj.show_name : (u.show_name || '(unknown show)'), known: !!found, email: u.email || '', name: u.name || '',
      trusted: isTrusted_(u.email), file: u.fileId ? 'https://drive.google.com/file/d/' + u.fileId + '/view' : '', when: u.timestamp instanceof Date ? iso_(u.timestamp) : String(u.timestamp || '') };
    if (u.isList) { try { item.result = readListResult_(u); } catch (e) { item.result = null; } }
    out.push(item);
  }
  return out;
}
function uploadsHtml_(apps, esc) {
  if (!apps.length) return '';
  var lists = apps.filter(function (a) { return a.isList; }), appsOnly = apps.filter(function (a) { return !a.isList; });
  var card = function (a, inner, buttons) {
    return '<div class="card" id="a' + a.row + '"><div class="top"><b>' + esc(a.show) + '</b>' + (a.known ? '' : ' <span class="new">SHOW NOT FOUND</span>') +
      '<span class="who">' + esc(a.name) + ' · ' + esc(a.email) + (a.trusted ? ' · trusted' : '') + ' · ' + esc(a.when) + '</span></div>' + inner +
      '<div class="btns">' + buttons + '<button class="no" onclick="goA(' + a.row + ',\'reject\')">Reject</button></div></div>';
  };
  var html = '';
  if (lists.length) html += '<h3 style="margin:18px 0 8px">Dealer lists to review</h3>' + lists.map(function (a) {
    var r = a.result, inner;
    if (!r) inner = '<p class="same">Still reading the file. This takes about 2 minutes after the upload. Close this window and open it again shortly.</p>';
    else if (!r.ok) inner = '<p style="color:#A3361B">Could not read this file: ' + esc(r.error) + '</p>';
    else inner = '<p><b>' + r.count + ' dealers found</b>' + (r.needsLook ? ', <span style="background:#FFF4C2;padding:0 4px">' + r.needsLook + ' need a look</span>' : ', all read cleanly') +
      ' · <a href="' + esc(a.file) + '" target="_blank">Open the original file</a></p>' +
      '<table><tr><td class="f">Table</td><td class="f">Dealer</td><td class="f">City, state</td></tr>' + r.dealers.slice(0, 80).map(function (d) {
        return '<tr' + (d.flag ? ' style="background:#FFF4C2"' : '') + '><td>' + esc(d.table ? '#' + d.table : '') + '</td><td><b>' + esc(d.name) + '</b></td><td>' + esc([d.city, d.state].filter(String).join(', ')) + (d.flag ? ' <i style="color:#7A5C1C">(' + esc(d.flag) + ')</i>' : '') + '</td></tr>';
      }).join('') + '</table>' + (r.count > 80 ? '<p class="same">…and ' + (r.count - 80) + ' more.</p>' : '');
    var ok = a.known && r && r.ok && r.count;
    return card(a, inner, ok ? '<button class="ok" onclick="goA(' + a.row + ',\'approve\')">Approve list</button><button onclick="goA(' + a.row + ',\'trust\')">Approve and trust this email</button>' : '');
  }).join('') + '<p class="same">After you approve, rows that need a look are yellow in the Dealers tab. Fix them there, then Publish.</p>';
  if (appsOnly.length) html += '<h3 style="margin:18px 0 8px">Dealer applications to review</h3>' + appsOnly.map(function (a) {
    return card(a, a.file ? '<p><a href="' + esc(a.file) + '" target="_blank">Open the uploaded file</a> and check it before you approve.</p>' : '<p class="same">No file attached.</p>',
      a.known && a.file ? '<button class="ok" onclick="goA(' + a.row + ',\'approve\')">Approve and publish file</button><button onclick="goA(' + a.row + ',\'trust\')">Approve and trust this email</button>' : '');
  }).join('');
  return html + '<script>function goA(row,act){var c=document.getElementById("a"+row);c.className="card done";c.querySelectorAll("button").forEach(function(b){b.disabled=true});' +
    'google.script.run.withSuccessHandler(function(msg){c.querySelector(".btns").textContent=msg}).withFailureHandler(function(e){c.className="card";c.querySelector(".btns").textContent="Error: "+e.message}).decideUpload(row,act)}</script>';
}
function safeName_(s) { return String(s || 'show').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'show'; }

/* Copies the approved file to the website (or shares it from Drive if GitHub is not connected) and links it to the show.
   For a dealer list it also writes the dealers into the Dealers tab, replacing that show's earlier list. */
function applyUpload_(row) {
  ensureSheet_(SHOWS, SHOW_COLUMNS);
  var up = ss_().getSheetByName(UPLOADS), map = uploadHeaders_(up), u = readUpload_(up, row);
  var found = findShow_(u.show_id);
  if (!found) throw new Error('No show with ID "' + u.show_id + '" in the Shows tab.');
  if (!u.fileId) throw new Error('This upload has no file.');
  var file = DriveApp.getFileById(u.fileId), blob = file.getBlob();
  if (blob.getBytes().length > 10 * 1024 * 1024) throw new Error('The file is larger than 10 MB. Ask the organizer for a smaller file.');
  var ext = fileExt_(file.getName()), shows = ss_().getSheetByName(SHOWS), H = found.H, message = '', added = 0, toCheck = 0;
  var folder = u.isList ? 'dealer-lists/' : 'applications/', col = u.isList ? 'dealer_list_file' : 'dealer_application', link;
  if (u.isList) {
    var r = readListResult_(u);
    if (!r) throw new Error('The file has not been read yet. Try again in a minute or two.');
    if (!r.ok) throw new Error('This file could not be read: ' + r.error);
    var dealers = ensureSheet_(DEALERS, DEALER_COLUMNS), DH = headers_(dealers), sid = String(found.obj.show_id).toUpperCase();
    // the new list replaces this show's earlier dealers
    if (dealers.getLastRow() > 1) {
      var vals = dealers.getRange(2, 1, dealers.getLastRow() - 1, DH.length).getValues();
      vals.forEach(function (v, i) {
        if (String(v[DH.indexOf('show_id')]).toUpperCase() === sid && String(v[DH.indexOf('status')]).toLowerCase() === 'approved') {
          dealers.getRange(i + 2, DH.indexOf('status') + 1).setValue('hidden');
          dealers.getRange(i + 2, DH.indexOf('source') + 1).setValue('replaced by new list ' + iso_(new Date()));
        }
      });
    }
    var stamp = 'list upload ' + iso_(new Date());
    var newRows = r.dealers.map(function (d) {
      if (d.flag) toCheck++;
      return DH.map(function (h) { return { status: 'approved', show_id: sid, dealer: d.name, table: d.table || '', city: d.city || '', state: d.state || '', check: d.flag || '', source: stamp }[h] || ''; });
    });
    if (newRows.length) dealers.getRange(dealers.getLastRow() + 1, 1, newRows.length, DH.length).setValues(newRows);
    added = newRows.length;
    markDealerChecks_(dealers);
  }
  if (props_().getProperty('token')) {
    link = safeName_(found.obj.show_id) + '.' + ext;
    putBinary_(folder + link, blob.getBytes(), (u.isList ? 'Dealer list for ' : 'Dealer application for ') + found.obj.show_name);
  } else {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    link = 'https://drive.google.com/uc?export=download&id=' + u.fileId;
  }
  shows.getRange(found.row, H.indexOf(col) + 1).setValue(link);
  shows.getRange(found.row, H.indexOf('last_checked') + 1).setValue(new Date());
  if (u.email && !String(found.obj.contact_email || '').trim()) shows.getRange(found.row, H.indexOf('contact_email') + 1).setValue(u.email);
  up.getRange(row, map.review + 1, 1, 2).setValues([['Approved', new Date()]]);
  if (u.isList) {
    try { deleteRepoFile_('incoming/dealer-lists/' + listBase_(u) + '.' + ext); deleteRepoFile_('incoming/dealer-lists/' + listBase_(u) + '.json'); } catch (e) { console.error(e); }
    message = added + ' dealers added to the Dealers tab' + (toCheck ? ' (' + toCheck + ' yellow rows need a look)' : '') + '. Press Publish when ready.';
  } else message = 'The file is on your website. It shows on the show page after the next publish.';
  return { email: u.email, name: u.name, message: message, link: link, added: added, toCheck: toCheck };
}
/* Yellow rows in the Dealers tab = the reader was not sure. Clear the "check" cell when fixed. */
function markDealerChecks_(dealers) {
  var DH = headers_(dealers), c = letter_(DH.indexOf('check') + 1);
  var rng = dealers.getRange(2, 1, Math.max(dealers.getMaxRows() - 1, 1), DH.length);
  var rules = dealers.getConditionalFormatRules().filter(function (r) { return !/check/.test(JSON.stringify(r.getBooleanCondition && r.getBooleanCondition() ? r.getBooleanCondition().getCriteriaValues() : [])); });
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + c + '2<>""').setBackground('#FFF4C2').setRanges([rng]).build());
  dealers.setConditionalFormatRules(rules);
}
/* Saves a binary file (PDF, image) to GitHub. */
function putBinary_(path, bytes, message) {
  var p = props_().getProperties();
  var url = 'https://api.github.com/repos/' + p.owner + '/' + p.repo + '/contents/' + path;
  var got = UrlFetchApp.fetch(url + '?ref=' + encodeURIComponent(p.branch), { headers: gh_(p.token), muteHttpExceptions: true });
  var body = { message: message, content: Utilities.base64Encode(bytes), branch: p.branch };
  if (got.getResponseCode() === 200) body.sha = JSON.parse(got.getContentText()).sha;
  var put = UrlFetchApp.fetch(url, { method: 'put', headers: gh_(p.token), contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true });
  if (put.getResponseCode() >= 300) throw new Error('GitHub error ' + put.getResponseCode() + ' saving ' + path + ': ' + put.getContentText().slice(0, 200));
}
/* Runs by itself each time an organizer uploads a file. */
function onApplicationUpload(e) {
  var sh = ss_().getSheetByName(UPLOADS);
  if (!sh) return;
  var row = sh.getLastRow(), u = readUpload_(sh, row), map = uploadHeaders_(sh);
  if (u.isList) {
    var note = '';
    try {
      if (!props_().getProperty('token')) throw new Error('GitHub is not connected (Settings > 2), so the list cannot be read automatically.');
      sendListForReading_(u);
      sh.getRange(row, map.reading + 1).setValue('Sent for reading ' + iso_(new Date()));
      note = 'It is being read now. It will be ready to review in about 2 minutes.';
    } catch (err) { note = 'It could not be sent for reading: ' + err.message; sh.getRange(row, map.reading + 1).setValue(err.message); }
    try {
      MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Dealer list to review: ' + (u.show_name || u.show_id),
        (u.name || 'Someone') + ' (' + (u.email || 'no email') + ') uploaded a dealer list for ' + (u.show_name || u.show_id) + '. ' + note + '\n\n' +
        'Open your Coin Calendar sheet and choose Coin Calendar > Review show updates.\n' + ss_().getUrl());
    } catch (err) { console.error(err); }
    return;
  }
  if (isTrusted_(u.email) && findShow_(u.show_id) && u.fileId) {
    var applied = false;
    try { applyUpload_(row); applied = true; } catch (err) { console.error(err); }
    if (applied) { try { doPublish_(); } catch (err) { console.error(err); } return; }
  }
  try {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Dealer application to review: ' + (u.show_name || u.show_id),
      (u.name || 'Someone') + ' (' + (u.email || 'no email') + ') uploaded a dealer application for ' + (u.show_name || u.show_id) + '.\n\n' +
      'Open your Coin Calendar sheet and choose Coin Calendar > Review show updates.\n' + ss_().getUrl());
  } catch (err) { console.error(err); }
}
/* Nightly: trusted organizers' dealer lists that were read cleanly go live by themselves. */
function autoApproveLists_() {
  var sh = ss_().getSheetByName(UPLOADS); if (!sh || sh.getLastRow() < 2) return 0;
  var n = 0;
  pendingUploads_().forEach(function (a) {
    if (a.isList && a.trusted && a.known && a.result && a.result.ok && a.result.count && !a.result.needsLook) {
      try { applyUpload_(a.row); n++; } catch (e) { console.error(e); }
    }
  });
  return n;
}
