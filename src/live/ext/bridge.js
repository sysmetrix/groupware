// GW 비서 · 확장 프로그램 다리 (그룹웨어 화면의 GW 비서 <-> 확장 서비스 워커)
// 그룹웨어 화면의 GW 비서는 확장 API를 직접 쓸 수 없어서, 이 작은 중계 스크립트가 구글 일정 읽기와 AI 프록시 요청만 전달한다.
(function () {
  'use strict';
  if (window.top !== window) return;
  document.documentElement.setAttribute('data-bwyfgw-gcal', '1');
  document.documentElement.setAttribute('data-bwyfgw-ai', '1');
  var aiPorts = Object.create(null);
  var AI_OPS = Object.assign(Object.create(null), {status: 1, save: 1, setModel: 1, clear: 1, request: 1, abort: 1});
  window.addEventListener('message', function (ev) {
    if (ev.source !== window || ev.origin !== location.origin) return;
    var m = ev.data;
    if (!m || typeof m.id !== 'string' || !m.id || m.id.length > 60) return;
    if (m.bwyfgw === 'gcal-read') {
      if (!Array.isArray(m.dates) || m.dates.length > 60) return;
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
      return;
    }
    if (m.bwyfgw === 'ai-proxy') {
      if (typeof m.op !== 'string' || !AI_OPS[m.op]) return;
      if (m.op === 'abort') {
        var ap = aiPorts[m.id];
        if (ap) { delete aiPorts[m.id]; try { ap.disconnect(); } catch (e) { /* ignore */ } }
        return;
      }
      var done = false;
      function aiReply(obj) { window.postMessage(Object.assign({bwyfgw: 'ai-reply', id: m.id}, obj), location.origin); }
      function aiFinish(obj) { if (done) return; done = true; delete aiPorts[m.id]; aiReply(obj); }
      var aPort;
      if (aiPorts[m.id]) { try { aiPorts[m.id].disconnect(); } catch (e) { /* ignore */ } delete aiPorts[m.id]; }
      try { aPort = chrome.runtime.connect({name: 'ai-proxy'}); } catch (e) { aiFinish({type: 'result', ok: false, error: 'no-extension'}); return; }
      aiPorts[m.id] = aPort;
      aPort.onMessage.addListener(function (r) {
        if (!r || typeof r !== 'object') return;
        if (r.type === 'chunk') { if (!done) aiReply({type: 'chunk', text: String(r.text || '')}); return; }
        if (r.type === 'result') { aiFinish(r); try { aPort.disconnect(); } catch (e) { /* ignore */ } }
      });
      aPort.onDisconnect.addListener(function () { aiFinish({type: 'result', ok: false, error: 'disconnected'}); });
      var payload = {op: m.op};
      if (m.op === 'save') { payload.key = m.key; payload.model = m.model; payload.sessionOnly = m.sessionOnly === true; }
      else if (m.op === 'setModel') { payload.model = m.model; }
      else if (m.op === 'request') { payload.path = m.path; payload.body = m.body; payload.stream = m.stream === true; if (m.key) payload.key = m.key; }
      try { aPort.postMessage(payload); } catch (e) { aiFinish({type: 'result', ok: false, error: 'post-failed'}); try { aPort.disconnect(); } catch (e2) { /* ignore */ } }
    }
  });
})();
