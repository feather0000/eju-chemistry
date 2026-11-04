/* 中日术语卡片 + 闪卡自测（进度存 localStorage）+ 日语朗读（Web Speech API） */
(function () {
  'use strict';
  var D = window.TC_DATA || [], KEY = window.TC_KEY || 'eju-terms', $ = function (i) { return document.getElementById(i); };
  var P = {}; try { P = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} }
  function id(t) { return t[0] + '|' + t[1]; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  /* —— 朗读 —— */
  var SS = window.speechSynthesis, jaV = null;
  function pickVoice() { if (!SS) return; var vs = SS.getVoices() || []; jaV = vs.filter(function (v) { return /^ja(-|_|$)/i.test(v.lang); })[0] || null; voiceUI(); }
  function canSay() { return !!(SS && window.SpeechSynthesisUtterance && jaV); }
  function voiceUI() {
    document.body.classList.toggle('tc-nosay', !canSay());
    $('tc-voice').textContent = canSay() ? '🔊 点 🔊 用日语朗读（语音：' + jaV.name + '）。' : (SS ? '此浏览器／设备暂未提供日语语音，读音按钮已隐藏；可在系统设置中添加日语语音后刷新。' : '此浏览器不支持语音合成，读音按钮已隐藏。');
  }
  function say(t) { if (!canSay()) return; try { SS.cancel(); var u = new SpeechSynthesisUtterance(t[2] && t[2] !== '—' ? t[2] : t[1]); u.lang = 'ja-JP'; u.voice = jaV; u.rate = 0.9; SS.speak(u); } catch (e) {} }
  if (SS) { pickVoice(); if (SS.addEventListener) SS.addEventListener('voiceschanged', pickVoice); else SS.onvoiceschanged = pickVoice; setTimeout(pickVoice, 800); } else voiceUI();
  var st = document.createElement('style'); st.textContent = '.tc-nosay .tc-say,.tc-nosay #tc-say{display:none!important}'; document.head.appendChild(st);
  /* —— 列表 —— */
  var top = $('tc-top'), q = $('tc-q'), list = $('tc-list');
  function norm(s) { return String(s).toLowerCase().replace(/[\u30a1-\u30f6]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); }); }
  function cur() { var s = top.value, k = norm(q.value.trim()); return D.filter(function (t) { return (!s || t[4] === s) && (!k || norm(t.join(' ')).indexOf(k) >= 0); }); }
  function mark(t) { var v = P[id(t)]; return v === 1 ? ' ✓' : v === 0 ? ' ✗' : ''; }
  function renderList() {
    var L = cur();
    list.innerHTML = L.map(function (t, i) {
      return '<div class="tc-it"><div class="row"><span class="ja" lang="ja">' + esc(t[1]) + '</span><button type="button" class="tc-say" data-i="' + D.indexOf(t) + '" aria-label="朗读 ' + esc(t[1]) + '">🔊</button></div>' +
        (t[2] && t[2] !== '—' ? '<span class="kn" lang="ja">' + esc(t[2]) + '</span>' : '') + '<span class="zh">' + esc(t[0]) + '</span><a class="src" href="../' + t[4] + '/#terms">' + esc(t[3]) + mark(t) + '</a></div>';
    }).join('') || '<p>没有匹配的术语。</p>';
  }
  list.addEventListener('click', function (e) { var b = e.target.closest('.tc-say'); if (b) say(D[+b.getAttribute('data-i')]); });
  top.addEventListener('change', function () { renderList(); deck(); }); q.addEventListener('input', function () { renderList(); deck(); });
  /* —— 闪卡 —— */
  var dir = 'jc', order = [], pos = 0, shown = false;
  function deck(shuffle) {
    var L = cur(); if ($('tc-only').checked) L = L.filter(function (t) { return P[id(t)] !== 1; });
    order = L.slice(); if (shuffle) for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = order[i]; order[i] = order[j]; order[j] = x; }
    pos = 0; card();
  }
  function stat() {
    var L = cur(), k = 0, u = 0; L.forEach(function (t) { var v = P[id(t)]; if (v === 1) k++; else if (v === 0) u++; });
    $('tc-stat').textContent = '当前范围 ' + L.length + ' 词：记住 ' + k + '，没记住 ' + u + '，未测 ' + (L.length - k - u) + '。进度只保存在这台设备的浏览器里。';
  }
  function card() {
    shown = false; $('tc-back').hidden = true; $('tc-yes').hidden = $('tc-no').hidden = true; $('tc-flip').hidden = false; stat();
    if (!order.length) { $('tc-front').textContent = '🎉'; $('tc-fkana').textContent = $('tc-only').checked ? '这个范围的词都记住了。' : '没有可练习的术语。'; $('tc-pos').textContent = ''; $('tc-flip').hidden = true; return; }
    if (pos >= order.length) { $('tc-front').textContent = '本轮完成'; $('tc-fkana').textContent = '点“🔀 洗牌”再来一轮。'; $('tc-pos').textContent = order.length + ' / ' + order.length; $('tc-flip').hidden = true; return; }
    var t = order[pos]; $('tc-pos').textContent = (pos + 1) + ' / ' + order.length + mark(t);
    var F = $('tc-front'); if (dir === 'jc') { F.textContent = t[1]; F.lang = 'ja'; $('tc-fkana').textContent = ''; $('tc-bm').textContent = t[0]; $('tc-bm').lang = 'zh-CN'; $('tc-bk').textContent = t[2] && t[2] !== '—' ? t[2] : ''; }
    else { F.textContent = t[0]; F.lang = 'zh-CN'; $('tc-fkana').textContent = ''; $('tc-bm').textContent = t[1]; $('tc-bm').lang = 'ja'; $('tc-bk').textContent = t[2] && t[2] !== '—' ? t[2] : ''; }
    $('tc-src').innerHTML = '出自：<a href="../' + t[4] + '/#terms">' + esc(t[3]) + '</a>';
  }
  function flip() { if (!order[pos]) return; shown = true; $('tc-back').hidden = false; $('tc-flip').hidden = true; $('tc-yes').hidden = $('tc-no').hidden = false; }
  function grade(v) { var t = order[pos]; if (!t) return; P[id(t)] = v; save(); pos++; card(); }
  $('tc-flip').onclick = flip; $('tc-yes').onclick = function () { grade(1); }; $('tc-no').onclick = function () { grade(0); };
  $('tc-say').onclick = function () { if (order[pos]) say(order[pos]); };
  $('tc-shuf').onclick = function () { deck(true); }; $('tc-only').onchange = function () { deck(true); };
  $('tc-reset').onclick = function () { if (confirm('清除本站全部术语自测进度？')) { P = {}; save(); renderList(); deck(); } };
  function seg(a, b, on) { $(a).onclick = function () { $(a).setAttribute('aria-pressed', 'true'); $(b).setAttribute('aria-pressed', 'false'); on(); }; }
  seg('tc-m-list', 'tc-m-fc', function () { $('tc-fc').hidden = true; list.hidden = false; renderList(); });
  seg('tc-m-fc', 'tc-m-list', function () { $('tc-fc').hidden = false; list.hidden = true; deck(true); });
  seg('tc-d-jc', 'tc-d-cj', function () { dir = 'jc'; card(); }); seg('tc-d-cj', 'tc-d-jc', function () { dir = 'cj'; card(); });
  document.addEventListener('keydown', function (e) { if ($('tc-fc').hidden || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return; if (e.key === ' ' || e.key === 'Enter') { if (!shown) { flip(); e.preventDefault(); } } else if (shown && (e.key === 'ArrowRight' || e.key === 'y')) grade(1); else if (shown && (e.key === 'ArrowLeft' || e.key === 'n')) grade(0); });
  renderList(); deck();
})();
