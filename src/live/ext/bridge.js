// GW 비서 · 확장 프로그램 다리 (그룹웨어 화면의 GW 비서 <-> 확장 서비스 워커)
// 그룹웨어 화면의 GW 비서는 확장 API를 직접 쓸 수 없어서, 이 작은 중계 스크립트가 "구글 일정 읽기" 요청만 전달한다.
// 전달하는 것은 날짜 목록(YYYYMMDD)뿐이다. 돌아오는 것은 구글 일 보기의 일정 문장뿐이다.
(function () {
  'use strict';
  if (window.top !== window) return;
  document.documentElement.setAttribute('data-bwyfgw-gcal', '1');
  window.addEventListener('message', function (ev) {
    if (ev.source !== window || ev.origin !== location.origin) return;
    var m = ev.data;
    if (!m || m.bwyfgw !== 'gcal-read' || typeof m.id !== 'string' || m.id.length > 60 || !Array.isArray(m.dates) || m.dates.length > 60) return;
    var finished = false;
    function reply(obj) { window.postMessage(Object.assign({bwyfgw: 'gcal-reply', id: m.id}, obj), location.origin); }
    function finish(obj) { if (finished) return; finished = true; reply(obj); }
    var dates = m.dates.filter(function (d) { return typeof d === 'string' && /^\d{8}$/.test(d); });
    var port;
    try { port = chrome.runtime.connect({name: 'gcal-read'}); } catch (e) { finish({type: 'result', ok: false, error: 'no-extension'}); return; }
    port.onMessage.addListener(function (r) {
      if (!r || typeof r !== 'object') return;
      if (r.type === 'progress') { if (!finished) reply({type: 'progress', done: +r.done || 0, total: +r.total || 0}); return; }
      if (r.type === 'result') { finish(r); try { port.disconnect(); } catch (e) { /* ignore */ } }
    });
    port.onDisconnect.addListener(function () { finish({type: 'result', ok: false, error: 'disconnected'}); });
    port.postMessage({dates: dates, careful: m.careful === true});
  });
})();
