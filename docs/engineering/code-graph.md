# 업무센터 코드 그래프

자동 생성: `npm run graph:write`. 직접 수정하지 마세요.

## 모듈 의존 (가중치 2 이상)

```mermaid
flowchart LR
  m01_storage_js["01-storage<br/>107줄"]
  m02_shell_js["02-shell<br/>129줄"]
  m03_data_js["03-data<br/>130줄"]
  m04_timers_keys_js["04-timers-keys<br/>73줄"]
  m05_views_js["05-views<br/>111줄"]
  m06_today_js["06-today<br/>147줄"]
  m07_charts_js["07-charts<br/>64줄"]
  m08_approval_mail_js["08-approval-mail<br/>65줄"]
  m09_search_board_js["09-search-board<br/>85줄"]
  m10_calendar_budget_js["10-calendar-budget<br/>263줄"]
  m11_attendance_js["11-attendance<br/>62줄"]
  m12_report_settings_js["12-report-settings<br/>62줄"]
  m13_detail_pane_js["13-detail-pane<br/>469줄"]
  m14_hide_snooze_undo_to_do_js["14-hide-snooze-undo-to-do<br/>110줄"]
  m15_overlays_palette_help_menus_js["15-overlays-palette-help-menus<br/>182줄"]
  m16_events_js["16-events<br/>309줄"]
  m17_lifecycle_js["17-lifecycle<br/>36줄"]
  m18_command_console_js["18-command-console<br/>481줄"]
  m19_draft_engine_js["19-draft-engine<br/>516줄"]
  m20_recorder_js["20-recorder<br/>343줄"]
  m21_governance_js["21-governance<br/>156줄"]
  m22_expense_js["22-expense<br/>84줄"]
  m23_ai_js["23-ai<br/>111줄"]
  m24_resource_js["24-resource<br/>135줄"]
  m25_home_js["25-home<br/>64줄"]
  m26_changelog_js["26-changelog<br/>17줄"]
  m01_storage_js -->|2| m14_hide_snooze_undo_to_do_js
  m03_data_js -->|6| m01_storage_js
  m03_data_js -->|2| m16_events_js
  m03_data_js -->|5| m05_views_js
  m03_data_js -->|2| m02_shell_js
  m03_data_js -->|2| m14_hide_snooze_undo_to_do_js
  m03_data_js -->|2| m13_detail_pane_js
  m04_timers_keys_js -->|2| m17_lifecycle_js
  m04_timers_keys_js -->|3| m02_shell_js
  m04_timers_keys_js -->|7| m15_overlays_palette_help_menus_js
  m04_timers_keys_js -->|10| m14_hide_snooze_undo_to_do_js
  m04_timers_keys_js -->|4| m13_detail_pane_js
  m04_timers_keys_js -->|6| m05_views_js
  m04_timers_keys_js -->|2| m18_command_console_js
  m04_timers_keys_js -->|2| m23_ai_js
  m05_views_js -->|6| m01_storage_js
  m05_views_js -->|3| m13_detail_pane_js
  m05_views_js -->|4| m02_shell_js
  m05_views_js -->|5| m09_search_board_js
  m05_views_js -->|2| m08_approval_mail_js
  m05_views_js -->|3| m10_calendar_budget_js
  m05_views_js -->|2| m11_attendance_js
  m05_views_js -->|3| m24_resource_js
  m05_views_js -->|2| m12_report_settings_js
  m05_views_js -->|3| m03_data_js
  m06_today_js -->|9| m05_views_js
  m06_today_js -->|5| m01_storage_js
  m06_today_js -->|2| m02_shell_js
  m07_charts_js -->|6| m01_storage_js
  m08_approval_mail_js -->|4| m01_storage_js
  m08_approval_mail_js -->|2| m02_shell_js
  m08_approval_mail_js -->|5| m05_views_js
  m09_search_board_js -->|11| m01_storage_js
  m09_search_board_js -->|3| m05_views_js
  m09_search_board_js -->|2| m02_shell_js
  m09_search_board_js -->|2| m16_events_js
  m09_search_board_js -->|2| m14_hide_snooze_undo_to_do_js
  m10_calendar_budget_js -->|11| m01_storage_js
  m10_calendar_budget_js -->|2| m02_shell_js
  m10_calendar_budget_js -->|4| m05_views_js
  m10_calendar_budget_js -->|2| m16_events_js
  m11_attendance_js -->|8| m01_storage_js
  m11_attendance_js -->|2| m02_shell_js
  m11_attendance_js -->|3| m05_views_js
  m12_report_settings_js -->|4| m02_shell_js
  m12_report_settings_js -->|7| m05_views_js
  m12_report_settings_js -->|8| m01_storage_js
  m12_report_settings_js -->|2| m03_data_js
  m12_report_settings_js -->|2| mworkcenter_browser_js
  m13_detail_pane_js -->|4| m02_shell_js
  m13_detail_pane_js -->|9| m01_storage_js
  m13_detail_pane_js -->|5| m05_views_js
  m13_detail_pane_js -->|2| m16_events_js
  m13_detail_pane_js -->|2| m03_data_js
  m14_hide_snooze_undo_to_do_js -->|6| m01_storage_js
  m14_hide_snooze_undo_to_do_js -->|3| m03_data_js
  m14_hide_snooze_undo_to_do_js -->|2| m16_events_js
  m14_hide_snooze_undo_to_do_js -->|4| m05_views_js
  m14_hide_snooze_undo_to_do_js -->|6| m13_detail_pane_js
  m15_overlays_palette_help_menus_js -->|7| m01_storage_js
  m15_overlays_palette_help_menus_js -->|5| m02_shell_js
  m15_overlays_palette_help_menus_js -->|7| m05_views_js
  m15_overlays_palette_help_menus_js -->|4| m03_data_js
  m15_overlays_palette_help_menus_js -->|3| m13_detail_pane_js
  m15_overlays_palette_help_menus_js -->|3| m19_draft_engine_js
  m15_overlays_palette_help_menus_js -->|3| m21_governance_js
  m16_events_js -->|4| m02_shell_js
  m16_events_js -->|17| m01_storage_js
  m16_events_js -->|14| m15_overlays_palette_help_menus_js
  m16_events_js -->|5| m03_data_js
  m16_events_js -->|7| m05_views_js
  m16_events_js -->|16| m13_detail_pane_js
  m16_events_js -->|2| m17_lifecycle_js
  m16_events_js -->|14| m14_hide_snooze_undo_to_do_js
  m16_events_js -->|4| m18_command_console_js
  m16_events_js -->|9| m19_draft_engine_js
  m16_events_js -->|10| m24_resource_js
  m16_events_js -->|6| m23_ai_js
  m16_events_js -->|6| m22_expense_js
  m16_events_js -->|8| m21_governance_js
  m16_events_js -->|11| m20_recorder_js
  m16_events_js -->|3| m09_search_board_js
  m16_events_js -->|6| m10_calendar_budget_js
  m16_events_js -->|4| m12_report_settings_js
  m17_lifecycle_js -->|2| m01_storage_js
  m17_lifecycle_js -->|2| m15_overlays_palette_help_menus_js
  m17_lifecycle_js -->|2| m05_views_js
  m17_lifecycle_js -->|4| m21_governance_js
  m17_lifecycle_js -->|6| m02_shell_js
  m17_lifecycle_js -->|3| m04_timers_keys_js
  m18_command_console_js -->|2| m02_shell_js
  m18_command_console_js -->|4| m01_storage_js
  m18_command_console_js -->|3| m05_views_js
  m18_command_console_js -->|2| m16_events_js
  m18_command_console_js -->|5| m13_detail_pane_js
  m18_command_console_js -->|2| m19_draft_engine_js
  m19_draft_engine_js -->|3| m01_storage_js
  m19_draft_engine_js -->|3| m02_shell_js
  m19_draft_engine_js -->|2| m16_events_js
  m19_draft_engine_js -->|2| m13_detail_pane_js
  m20_recorder_js -->|4| m02_shell_js
  m20_recorder_js -->|4| m19_draft_engine_js
  m20_recorder_js -->|5| m01_storage_js
  m21_governance_js -->|2| m02_shell_js
  m21_governance_js -->|7| m01_storage_js
  m21_governance_js -->|2| mworkcenter_browser_js
  m22_expense_js -->|2| m02_shell_js
  m22_expense_js -->|2| m16_events_js
  m22_expense_js -->|2| m01_storage_js
  m23_ai_js -->|3| m01_storage_js
  m23_ai_js -->|2| m02_shell_js
  m23_ai_js -->|2| m05_views_js
  m24_resource_js -->|2| m01_storage_js
  m24_resource_js -->|2| m02_shell_js
  m24_resource_js -->|2| m21_governance_js
  m24_resource_js -->|2| m05_views_js
  m25_home_js -->|4| m01_storage_js
  m25_home_js -->|2| m05_views_js
  m26_changelog_js -->|3| m01_storage_js
  m26_changelog_js -->|2| mworkcenter_browser_js
  m26_changelog_js -->|2| m02_shell_js
```

## 화면 이벤트 -> 처리 함수 (일부)

```mermaid
flowchart LR
  a_refresh(["refresh"])
  a_refresh --> f_refresh["refresh()"]
  a_applyRefresh(["applyRefresh"])
  a_applyRefresh --> f_render["render()"]
  a_close(["close"])
  a_close --> f_close["close()"]
  a_home(["home"])
  a_home --> f_goHome["goHome()"]
  a_apOpen(["apOpen"])
  a_apOpen --> f_findDoc["findDoc()"]
  a_apOpen --> f_leavePane["leavePane()"]
  a_apOpen --> f_renderMain["renderMain()"]
  a_copyErrors(["copyErrors"])
  a_copyErrors --> f_copyText["copyText()"]
  a_setTodayTab(["setTodayTab"])
  a_setTodayTab --> f_renderMain["renderMain()"]
  a_stateFilter(["stateFilter"])
  a_stateFilter --> f_renderMain["renderMain()"]
  a_rowMenu(["rowMenu"])
  a_rowMenu --> f_closeOverlay["closeOverlay()"]
  a_rowMenu --> f_openMenu["openMenu()"]
  a_markDone(["markDone"])
  a_markDone --> f_markDoneKeys["markDoneKeys()"]
  a_coach(["coach"])
  a_coach --> f_startCoach["startCoach()"]
  a_coachNext(["coachNext"])
  a_coachNext --> f_coachNext["coachNext()"]
  a_coachEnd(["coachEnd"])
  a_coachEnd --> f_endCoach["endCoach()"]
  a_openCmd(["openCmd"])
  a_openCmd --> f_openCommandConsole["openCommandConsole()"]
  a_openHistory(["openHistory"])
  a_openHistory --> f_openActionHistory["openActionHistory()"]
  a_submitCmd(["submitCmd"])
  a_submitCmd --> f_$["$()"]
  a_submitCmd --> f_executeCommandWorkflow["executeCommandWorkflow()"]
  a_runPreset(["runPreset"])
  a_runPreset --> f_executeCommandWorkflow["executeCommandWorkflow()"]
  a_clearHistory(["clearHistory"])
  a_clearHistory --> f_openActionHistory["openActionHistory()"]
  a_clearHistory --> f_toast["toast()"]
  a_mailToDraft(["mailToDraft"])
  a_mailToDraft --> f_mailToDraft["mailToDraft()"]
  a_quickDraft(["quickDraft"])
  a_quickDraft --> f_openResultPlanPicker["openResultPlanPicker()"]
  a_quickDraft --> f_autoStartDraft["autoStartDraft()"]
  a_openPay(["openPay"])
  a_openPay --> f_openPaymentHub["openPaymentHub()"]
  a_openChangelog(["openChangelog"])
  a_openChangelog --> f_openChangelog["openChangelog()"]
  a_goResource(["goResource"])
  a_goResource --> f_closeOverlay["closeOverlay()"]
  a_goResource --> f_go["go()"]
  a_resSel(["resSel"])
  a_resSel --> f_resSel["resSel()"]
  a_resDay(["resDay"])
  a_resDay --> f_resDay["resDay()"]
  a_resGo(["resGo"])
  a_resGo --> f_resGo["resGo()"]
  a_resFree(["resFree"])
  a_resFree --> f_resFree["resFree()"]
  a_resCheck(["resCheck"])
  a_resCheck --> f_resCheck["resCheck()"]
  a_resBook(["resBook"])
  a_resBook --> f_resBook["resBook()"]
  a_resCancelForm(["resCancelForm"])
  a_resCancelForm --> f_resCancelForm["resCancelForm()"]
  a_resReload(["resReload"])
  a_resReload --> f_resState["resState()"]
  a_resReload --> f_renderMain["renderMain()"]
  a_resReload --> f_resLoad["resLoad()"]
  a_openAi(["openAi"])
  a_openAi --> f_openAi["openAi()"]
  a_aiSetup(["aiSetup"])
  a_aiSetup --> f_aiSetup["aiSetup()"]
  a_aiSaveKey(["aiSaveKey"])
  a_aiSaveKey --> f_aiSaveKey["aiSaveKey()"]
  a_aiAsk(["aiAsk"])
  a_aiAsk --> f_aiAsk["aiAsk()"]
  a_aiForget(["aiForget"])
  a_aiForget --> f_aiForget["aiForget()"]
  a_aiClose(["aiClose"])
  a_aiClose --> f_aiClose["aiClose()"]
  a_expOpen(["expOpen"])
  a_expOpen --> f_expOpen["expOpen()"]
  a_expAdd(["expAdd"])
  a_expAdd --> f_expAdd["expAdd()"]
  a_expDel(["expDel"])
  a_expDel --> f_expDel["expDel()"]
```

## 규모

| 파일 | 줄 | 정의 |
|---|---|---|
| 01-storage.js | 107 | 32 |
| 02-shell.js | 129 | 13 |
| 03-data.js | 130 | 22 |
| 04-timers-keys.js | 73 | 5 |
| 05-views.js | 111 | 24 |
| 06-today.js | 147 | 6 |
| 07-charts.js | 64 | 7 |
| 08-approval-mail.js | 65 | 6 |
| 09-search-board.js | 85 | 14 |
| 10-calendar-budget.js | 263 | 21 |
| 11-attendance.js | 62 | 2 |
| 12-report-settings.js | 62 | 6 |
| 13-detail-pane.js | 469 | 30 |
| 14-hide-snooze-undo-to-do.js | 110 | 16 |
| 15-overlays-palette-help-menus.js | 182 | 20 |
| 16-events.js | 309 | 5 |
| 17-lifecycle.js | 36 | 7 |
| 18-command-console.js | 481 | 21 |
| 19-draft-engine.js | 516 | 42 |
| 20-recorder.js | 343 | 32 |
| 21-governance.js | 156 | 19 |
| 22-expense.js | 84 | 13 |
| 23-ai.js | 111 | 13 |
| 24-resource.js | 135 | 15 |
| 25-home.js | 64 | 2 |
| 26-changelog.js | 17 | 1 |
