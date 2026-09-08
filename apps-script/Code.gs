/**
 * Lead intake for the patient leak calculator.
 *
 * Setup
 *   1. sheets.new  ->  Extensions  ->  Apps Script
 *   2. Replace the default Code.gs with this file, and Save.
 *   3. Deploy  ->  New deployment  ->  type "Web app"
 *        Execute as:      Me
 *        Who has access:  Anyone            <- required, the page posts anonymously
 *   4. Copy the /exec URL into LEAD_ENDPOINT in leak-calculator.html
 *   5. Open the /exec URL once in a browser. It should return {"ok":true,...}
 *
 * Re-deploy as a NEW VERSION after any edit, or the live URL keeps running the old code.
 */

var SHEET_NAME = 'Leads';

var COLUMNS = [
  'Received', 'Name', 'Clinic', 'Phone', 'Lead ID',
  'Page', 'Referrer',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'User agent'
];

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json_({ ok: false, error: 'busy' });
  }

  try {
    if (!e || !e.postData || !e.postData.contents) return json_({ ok: false, error: 'empty body' });

    var lead;
    try {
      lead = JSON.parse(e.postData.contents);
    } catch (err) {
      return json_({ ok: false, error: 'bad json' });
    }

    var name = clean_(lead.name);
    var clinic = clean_(lead.clinic);
    var phone = clean_(lead.phone);
    if (name.length < 2 || clinic.length < 2 || phone.length < 8) {
      return json_({ ok: false, error: 'missing required fields' });
    }

    var sheet = getSheet_();
    var leadId = clean_(lead.leadId);

    // The page retries anything it could not confirm, so the same lead can arrive twice.
    if (leadId && seen_(sheet, leadId)) return json_({ ok: true, duplicate: true });

    sheet.appendRow([
      lead.capturedAt ? new Date(lead.capturedAt) : new Date(),
      name,
      clinic,
      phone,
      leadId,
      clean_(lead.page),
      clean_(lead.referrer),
      clean_(lead.utm_source),
      clean_(lead.utm_medium),
      clean_(lead.utm_campaign),
      clean_(lead.utm_term),
      clean_(lead.utm_content),
      clean_(lead.userAgent)
    ]);

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return json_({ ok: true, service: 'patient leak calculator lead intake' });
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(COLUMNS);
    sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    // Phone must stay text, or Sheets eats the leading + and reformats the number.
    sheet.getRange(1, 4, sheet.getMaxRows(), 1).setNumberFormat('@');
    sheet.getRange(1, 1, sheet.getMaxRows(), 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
    sheet.setColumnWidth(1, 150);
    sheet.setColumnWidth(2, 170);
    sheet.setColumnWidth(3, 200);
    sheet.setColumnWidth(4, 150);
  }

  return sheet;
}

function seen_(sheet, leadId) {
  var last = sheet.getLastRow();
  if (last < 2) return false;
  var ids = sheet.getRange(2, 5, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === leadId) return true;
  }
  return false;
}

function clean_(v) {
  return String(v == null ? '' : v).trim().slice(0, 500);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
