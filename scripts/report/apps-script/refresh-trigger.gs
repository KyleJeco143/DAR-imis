// Google Apps Script — bound to the "REGION 1 ARF INFRA MONITORING FORM NO. 1"
// Google Sheet. Debounces edits on the REG.1 tab and, ~2 minutes after editing
// stops, asks GitHub Actions to regenerate reports/pangasinan-report.html —
// so the "Infra Reports" page in the app reflects sheet edits within a few
// minutes instead of waiting for the daily 06:00 refresh.
//
// Setup (one-time, ~5 minutes). See scripts/report/README.md for the full
// walkthrough — short version:
//   1. Open the Google Sheet → Extensions → Apps Script.
//   2. Paste this file's contents into Code.gs (replacing what's there).
//   3. Project Settings (gear icon) → Script Properties → add a property
//      named GITHUB_TOKEN with a GitHub fine-grained personal access token
//      scoped to just this repo, "Actions: Read and write" permission only.
//   4. Run installTrigger() once from the function dropdown above and
//      approve the authorization prompt. One-time step; survives reloads.
//
// After that, every edit on the REG.1 tab (re)schedules a refresh for
// DEBOUNCE_MINUTES after the *last* edit, so a burst of edits triggers one
// refresh, not one per keystroke.

const GITHUB_OWNER = 'KyleJeco143';
const GITHUB_REPO = 'DAR-imis';
const GITHUB_WORKFLOW_FILE = 'refresh-report.yml';
const GITHUB_REF = 'main';
const DEBOUNCE_MINUTES = 2;
const WATCHED_SHEET_NAME = 'REG.1';
const TRIGGER_ID_PROPERTY = 'refreshTriggerId';

/**
 * Installable "on edit" trigger target — wired up via installTrigger(), not
 * the Apps Script editor's trigger dropdown, so it runs with the permissions
 * needed to call UrlFetchApp.
 */
function onSheetEdit(e) {
  if (!e || !e.range) return;
  if (e.range.getSheet().getName() !== WATCHED_SHEET_NAME) return;
  scheduleRefresh();
}

/** Run once from the Apps Script editor to wire up the installable trigger. */
function installTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'onSheetEdit'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger('onSheetEdit')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();

  Logger.log('Installed. Edits to the "%s" tab will now trigger a report refresh.', WATCHED_SHEET_NAME);
}

/**
 * (Re)schedules a single debounced call to triggerGithubRefresh(), cancelling
 * any pending one first so rapid edits collapse into a single run.
 */
function scheduleRefresh() {
  const props = PropertiesService.getScriptProperties();
  const existingId = props.getProperty(TRIGGER_ID_PROPERTY);
  if (existingId) {
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getUniqueId() === existingId) ScriptApp.deleteTrigger(t);
    });
  }

  const trigger = ScriptApp.newTrigger('triggerGithubRefresh')
    .timeBased()
    .after(DEBOUNCE_MINUTES * 60 * 1000)
    .create();

  props.setProperty(TRIGGER_ID_PROPERTY, trigger.getUniqueId());
}

/** Fires the GitHub Actions workflow_dispatch that regenerates the report. */
function triggerGithubRefresh() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(TRIGGER_ID_PROPERTY);

  const token = props.getProperty('GITHUB_TOKEN');
  if (!token) {
    Logger.log('GITHUB_TOKEN script property is not set — see the setup steps at the top of this file.');
    return;
  }

  const url = 'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO +
    '/actions/workflows/' + GITHUB_WORKFLOW_FILE + '/dispatches';

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
    },
    payload: JSON.stringify({ ref: GITHUB_REF }),
    muteHttpExceptions: true,
  });

  const code = response.getResponseCode();
  if (code !== 204) {
    Logger.log('GitHub dispatch failed (%s): %s', code, response.getContentText());
  } else {
    Logger.log('Report refresh triggered — check the Actions tab in a minute or two.');
  }
}
