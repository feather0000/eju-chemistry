/* EJU 讲义站共用交互（四站同一份 assets/eju-ux.js）：
   1. 顶部阅读进度条：按 <main> 的滚动进度，细条、主色、fixed、不接收指针事件（只在有目录的专题页启用）
   2. 移动端横向目录：当前小节（.on，由页面里的 IntersectionObserver 设置）自动滚入视野
   3. 点击公式复制 LaTeX：从 KaTeX 的 <annotation encoding="application/x-tex">（或 data-tex）取源码，成功后出 toast
   不改动公式的 DOM，不拦截文字选取；所有失败都在内部处理，不抛未捕获错误。 */
(function () {
  'use strict';
  var d = document, w = window;
  var RM = w.matchMedia ? w.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  /* ---------- 1. 阅读进度条 ---------- */
  function progress() {
    var main = d.querySelector('main');
    if (!main || !d.querySelector('nav.toc')) return;
    var bar = d.createElement('div'), fill = d.createElement('i'), queued = false;
    bar.className = 'eju-progress'; bar.setAttribute('aria-hidden', 'true');
    bar.appendChild(fill); d.body.appendChild(bar);
    function update() {
      queued = false;
      var r = main.getBoundingClientRect(), total = r.height - w.innerHeight;
      var p = total > 0 ? -r.top / total : (r.top < 0 ? 1 : 0);
      p = p < 0 ? 0 : p > 1 ? 1 : p;
      fill.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    }
    function queue() { if (!queued) { queued = true; w.requestAnimationFrame(update); } }
    w.addEventListener('scroll', queue, { passive: true });
    w.addEventListener('resize', queue);
    if ('ResizeObserver' in w) new ResizeObserver(queue).observe(main); /* content-visibility 会改变 main 的高度 */
    update();
  }

  /* ---------- 2. 横向目录：当前项滚入视野 ---------- */
  function tocFollow() {
    var ol = d.querySelector('nav.toc ol');
    if (!ol || !('MutationObserver' in w)) return;
    new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) {
        var a = ms[i].target;
        if (!a.classList || !a.classList.contains('on') || ol.scrollWidth <= ol.clientWidth + 1) continue;
        var x = a.offsetLeft - ol.offsetLeft, left = ol.scrollLeft;
        if (x < left + 16 || x + a.offsetWidth > left + ol.clientWidth - 16) {
          var to = Math.max(0, x - 16);
          try { ol.scrollTo({ left: to, behavior: RM.matches ? 'auto' : 'smooth' }); } catch (e) { ol.scrollLeft = to; }
        }
        break;
      }
    }).observe(ol, { subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  /* ---------- 3. 点击公式复制 LaTeX ---------- */
  var toast = null, timer = 0;
  function say(msg) {
    if (!toast) {
      toast = d.createElement('div');
      toast.className = 'eju-toast'; toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite');
      d.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('on');
    clearTimeout(timer);
    timer = setTimeout(function () { toast.classList.remove('on'); }, 1600);
  }
  function texOf(k) {
    var a = k.querySelector('annotation[encoding="application/x-tex"]');
    return ((a && a.textContent) || k.getAttribute('data-tex') || '').trim();
  }
  function fallbackCopy(s) {
    var t = d.createElement('textarea'), back = d.activeElement, ok = false;
    t.value = s; t.setAttribute('readonly', ''); t.setAttribute('aria-hidden', 'true');
    t.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
    d.body.appendChild(t);
    try { t.select(); ok = d.execCommand('copy'); } catch (e) { ok = false; }
    d.body.removeChild(t);
    if (back && back.focus) { try { back.focus({ preventScroll: true }); } catch (e) {} }
    return ok;
  }
  function copy(s) {
    return new Promise(function (resolve, reject) {
      function fb() { fallbackCopy(s) ? resolve() : reject(); }
      try {
        if (navigator.clipboard && w.isSecureContext) navigator.clipboard.writeText(s).then(resolve, fb);
        else fb();
      } catch (e) { fb(); }
    });
  }
  function copyable(t) {
    var k = t && t.closest ? t.closest('.katex') : null;
    if (!k || k.closest('a, button, summary, label, input, select, textarea, [contenteditable], .demo')) return null;
    return k;
  }
  d.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var k = copyable(e.target);
    if (!k) return;
    var sel = w.getSelection ? w.getSelection() : null;
    if (sel && !sel.isCollapsed && String(sel).trim()) return; /* 用户在选取文字：不打断 */
    var s = texOf(k);
    if (!s) return;
    copy(s).then(function () { say('已复制 LaTeX'); }, function () { say('复制失败，可手动选取公式'); });
  });
  d.addEventListener('pointerover', function (e) {
    var k = copyable(e.target);
    if (k && !k.hasAttribute('title')) k.setAttribute('title', '点击复制 LaTeX');
  }, { passive: true });

  function init() { try { progress(); } catch (e) {} try { tocFollow(); } catch (e) {} }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init); else init();
})();
