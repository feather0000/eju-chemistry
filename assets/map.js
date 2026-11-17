/* 首页知识导图（四站同一份 assets/map.js）
   - 悬停 / 键盘经过：无关分支调淡（.mp-off）；聚焦某节点时锁定在该节点
   - 单击章 / 专题：平滑放大并显示图鉴式说明卡（简介来自 #mp-data，不新编）
     Ctrl/⌘/Shift/中键单击仍按链接打开对应页
   - 空白处、说明卡「返回」、Esc：还原
   - 滚轮：默认需按住 Ctrl 或 ⌘（避免抢走页面滚动）；点进图中（.mp-engaged）后可直接滚动缩放、拖动平移
   - 触屏：未点进图中时单指仍滚动页面；双指缩放；点进图中后可单指拖动。双指也会进入已启用状态
   - 节点轻微漂浮、星点闪烁、联系弧虚线缓缓流动；prefers-reduced-motion 时全部取消，缩放瞬间到位 */
(function () {
  'use strict';
  var root = document.querySelector('#map');
  if (!root) return;
  var svg = root.querySelector('.mp-svg');
  if (!svg) return;
  var figure = root.querySelector('figure.mp') || root;
  var scroll = root.querySelector('.mp-scroll') || svg.parentNode;
  var NS = 'http://www.w3.org/2000/svg';
  var RM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener: function () {} };
  var data = { subject: '', chapters: {}, topics: {} };
  var raw = document.getElementById('mp-data');
  if (raw) {
    try { data = JSON.parse(raw.textContent); } catch (e) {}
  }

  /* ---------- 把图心内容包进 .mp-cam，双线框和图注留在外层 ---------- */
  var cam = svg.querySelector('.mp-cam');
  if (!cam) {
    cam = document.createElementNS(NS, 'g');
    cam.setAttribute('class', 'mp-cam');
    var keep = [];
    Array.prototype.forEach.call(svg.childNodes, function (n) {
      if (n.nodeType !== 1) return;
      var tag = n.tagName.toLowerCase();
      var cls = n.getAttribute('class') || '';
      if (tag === 'title' || tag === 'defs' || /(^|\s)mp-frame(\s|$)/.test(cls)) keep.push(n);
    });
    var moving = [];
    Array.prototype.forEach.call(svg.childNodes, function (n) {
      if (n.nodeType === 1 && keep.indexOf(n) < 0) moving.push(n);
    });
    moving.forEach(function (n) { cam.appendChild(n); });
    var frame = svg.querySelector('.mp-frame');
    if (frame) svg.insertBefore(cam, frame);
    else svg.appendChild(cam);
  }
  /* 相机用 SVG transform（用户坐标），避免 CSS px 与 viewBox 单位不一致 */

  /* ---------- 说明卡 ---------- */
  var card = figure.querySelector('.mp-card');
  if (!card) {
    card = document.createElement('aside');
    card.className = 'mp-card';
    card.setAttribute('hidden', '');
    card.setAttribute('role', 'region');
    card.setAttribute('aria-live', 'polite');
    card.innerHTML = '<p class="mp-card-k"></p><h3 class="mp-card-h" tabindex="-1"></h3>' +
      '<p class="mp-card-ja" lang="ja"></p><p class="mp-card-intro"></p>' +
      '<p class="mp-card-acts"><a class="mp-card-go" href="#"></a>' +
      '<button type="button" class="mp-card-back">返回</button></p>';
    var cap = figure.querySelector('figcaption');
    if (cap) figure.insertBefore(card, cap);
    else figure.appendChild(card);
  }
  var elK = card.querySelector('.mp-card-k');
  var elH = card.querySelector('.mp-card-h');
  var elJa = card.querySelector('.mp-card-ja');
  var elIn = card.querySelector('.mp-card-intro');
  var elGo = card.querySelector('.mp-card-go');
  var elBack = card.querySelector('.mp-card-back');

  var hint = document.getElementById('mp-hint');
  var HINT_IDLE = '点节点可放大查看简介。电脑上按住 Ctrl 或 ⌘ 滚动缩放；点进图中后可直接滚动缩放并拖动。触屏用双指缩放，点进图中后可单指拖动。Esc 或「返回」还原。';
  var HINT_ON = '已可拖动与缩放。Esc 或「返回」还原全图。';
  if (hint) hint.textContent = HINT_IDLE;

  /* ---------- 相机状态 ---------- */
  var KMIN = 1, KMAX = 4.2;
  var st = { k: 1, tx: 0, ty: 0 };
  var focused = null;
  var engaged = false;
  var panning = false;
  var moved = false;
  var pid = null, lastP = null;
  var pointers = {};
  var pinch0 = null;

  function reduced() { return !!(RM && RM.matches); }

  var camAnim = null;
  cam._cur = { k: 1, tx: 0, ty: 0 };
  function setCam(k, tx, ty) {
    cam.setAttribute('transform', 'translate(' + tx + ' ' + ty + ') scale(' + k + ')');
    cam._cur = { k: k, tx: tx, ty: ty };
  }
  function easeInOut(u) { return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; }
  function applyCam(animate) {
    if (camAnim) { cancelAnimationFrame(camAnim); camAnim = null; }
    var to = { k: st.k, tx: st.tx, ty: st.ty };
    if (!animate || reduced()) { setCam(to.k, to.tx, to.ty); return; }
    var from = cam._cur || { k: 1, tx: 0, ty: 0 };
    var t0 = performance.now(), dur = 500;
    (function tick(now) {
      var u = Math.min(1, (now - t0) / dur);
      var e = easeInOut(u);
      setCam(from.k + (to.k - from.k) * e, from.tx + (to.tx - from.tx) * e, from.ty + (to.ty - from.ty) * e);
      if (u < 1) camAnim = requestAnimationFrame(tick);
      else { camAnim = null; setCam(to.k, to.tx, to.ty); }
    })(t0);
  }

  function vb() {
    var v = svg.viewBox && svg.viewBox.baseVal;
    if (v && v.width) return { x: v.x, y: v.y, w: v.width, h: v.height };
    return { x: 0, y: 0, w: svg.clientWidth || 1160, h: svg.clientHeight || 1240 };
  }

  function clientToView(cx, cy) {
    var pt = svg.createSVGPoint();
    pt.x = cx; pt.y = cy;
    var m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    return pt.matrixTransform(m.inverse());
  }

  function clampK(k) { return k < KMIN ? KMIN : k > KMAX ? KMAX : k; }

  function zoomAt(cx, cy, factor) {
    var p = clientToView(cx, cy);
    var k2 = clampK(st.k * factor);
    if (k2 === st.k) return;
    st.tx = p.x - (p.x - st.tx) * (k2 / st.k);
    st.ty = p.y - (p.y - st.ty) * (k2 / st.k);
    st.k = k2;
    applyCam(false);
    if (st.k > 1.02) setEngaged(true);
  }

  function setEngaged(on) {
    engaged = !!on;
    figure.classList.toggle('mp-engaged', engaged);
    root.classList.toggle('mp-engaged', engaged);
    if (scroll) scroll.style.touchAction = engaged ? 'none' : 'pan-y';
    if (hint) hint.textContent = engaged ? HINT_ON : HINT_IDLE;
  }

  function nodeAnchor(el) {
    if (!el || !el.closest) return null;
    var a = el.closest('a');
    if (!a || !svg.contains(a)) return null;
    if (a.classList.contains('mp-tn') || a.classList.contains('mp-chn')) return a;
    return null;
  }

  function infoFor(a) {
    if (!a) return null;
    var slug = a.getAttribute('data-slug');
    var ch = a.getAttribute('data-ch');
    if (slug && data.topics && data.topics[slug]) {
      var t = data.topics[slug];
      var chd = (t.ch && data.chapters[t.ch]) || (ch && data.chapters[ch]) || {};
      return {
        k: (chd.zh ? ('第 ' + (t.ch || ch) + ' 章 · ' + chd.zh) : '专题'),
        zh: t.zh || '', ja: t.ja || '', intro: t.intro || '',
        href: t.href || a.getAttribute('href'),
        go: '打开专题'
      };
    }
    if (ch && data.chapters && data.chapters[ch]) {
      var c = data.chapters[ch];
      return {
        k: '第 ' + ch + ' 章',
        zh: c.zh || '', ja: c.ja || '', intro: c.intro || '',
        href: c.href || a.getAttribute('href'),
        go: '查看该章目次'
      };
    }
    return {
      k: '', zh: (a.getAttribute('aria-label') || '').split('：')[0], ja: '', intro: '',
      href: a.getAttribute('href'), go: '打开'
    };
  }

  function showCard(a) {
    var info = infoFor(a);
    if (!info) { hideCard(); return; }
    elK.textContent = info.k;
    elH.textContent = info.zh;
    if (info.ja) { elJa.textContent = info.ja; elJa.removeAttribute('hidden'); }
    else { elJa.textContent = ''; elJa.setAttribute('hidden', ''); }
    elIn.textContent = info.intro || '';
    elGo.setAttribute('href', info.href || '#');
    elGo.textContent = info.go;
    card.removeAttribute('hidden');
    card.classList.add('on');
    card.setAttribute('aria-label', (info.zh || '节点说明') + '的简介');
  }

  function hideCard() {
    card.classList.remove('on');
    card.setAttribute('hidden', '');
  }

  /* 聚焦：把节点放到图板偏上的中央，为下方说明卡留空，缩放限制在 1.8–3.2 */
  function focusNode(a, opts) {
    if (!a) return;
    opts = opts || {};
    var box = a.getBBox();
    var V = vb();
    var pad = Math.max(box.width, box.height, 80) * 1.8 + 36;
    var k = Math.min(V.w / pad, (V.h * 0.62) / pad, 3.2);
    k = clampK(Math.max(k, 1.8));
    var cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    st.k = k;
    st.tx = V.w * 0.50 - k * cx;
    st.ty = V.h * 0.38 - k * cy;
    applyCam(!opts.instant);
    focused = a;
    setEngaged(true);
    showCard(a);
    lockDim(a);
    a.classList.add('mp-now');
    Array.prototype.forEach.call(svg.querySelectorAll('a.mp-now'), function (n) {
      if (n !== a) n.classList.remove('mp-now');
    });
  }

  function restore(opts) {
    opts = opts || {};
    st.k = 1; st.tx = 0; st.ty = 0;
    applyCam(!opts.instant);
    if (focused) focused.classList.remove('mp-now');
    var prev = focused;
    focused = null;
    hideCard();
    unlockDim();
    if (!opts.keepEngaged) setEngaged(false);
    if (prev && typeof prev.focus === 'function' && opts.returnFocus) {
      try { prev.focus({ preventScroll: true }); } catch (e) { prev.focus(); }
    }
  }

  /* ---------- 调淡（悬停；聚焦时锁定） ---------- */
  var ds = function () { return svg.querySelectorAll('.mp-d'); };
  function show(a) {
    var nodes = ds();
    var ch = a && a.getAttribute('data-ch'), slug = a && a.getAttribute('data-slug');
    if (!ch) { Array.prototype.forEach.call(nodes, function (d) { d.classList.remove('mp-off'); }); return; }
    var mine = {}, keep = {};
    Array.prototype.forEach.call(svg.querySelectorAll('.mp-tn[data-ch="' + ch + '"]'), function (t) {
      mine[t.getAttribute('data-slug')] = 1;
    });
    Array.prototype.forEach.call(nodes, function (d) {
      var x = d.getAttribute('data-a'), y = d.getAttribute('data-b'), on;
      if (x) {
        on = slug ? (x === slug || y === slug) : (mine[x] || mine[y]);
        if (on) { keep[x] = keep[y] = 1; }
        d.classList.toggle('mp-off', !on);
      }
    });
    Array.prototype.forEach.call(nodes, function (d) {
      if (d.getAttribute('data-a')) return;
      var on = d.getAttribute('data-ch') === ch || (d.classList.contains('mp-tn') && keep[d.getAttribute('data-slug')]);
      d.classList.toggle('mp-off', !on);
    });
  }
  var dimLocked = false;
  function lockDim(a) { dimLocked = true; show(a); }
  function unlockDim() {
    dimLocked = false;
    var f = nodeAnchor(document.activeElement);
    show(f && svg.contains(f) ? f : null);
  }

  /* ---------- 装饰星点（沿已有的轨道圆，只闪烁不新造图案） ---------- */
  function placeStars() {
    var grid = svg.querySelector('.mp-grid');
    if (!grid || grid.querySelector('.mp-twinkle')) return;
    var rings = Array.prototype.map.call(grid.querySelectorAll('circle'), function (c) {
      return { cx: +c.getAttribute('cx'), cy: +c.getAttribute('cy'), r: +c.getAttribute('r') };
    }).filter(function (c) { return c.r > 0; });
    if (rings.length < 2) return;
    var pick = rings.slice(Math.max(0, rings.length - 3));
    var g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'mp-twinkle');
    g.setAttribute('aria-hidden', 'true');
    var n = 0;
    pick.forEach(function (ring, ri) {
      var count = ri === pick.length - 1 ? 24 : 16;
      for (var i = 0; i < count; i++) {
        var ang = (i + (ri % 2 ? 0.5 : 0)) * (2 * Math.PI / count);
        var c = document.createElementNS(NS, 'circle');
        c.setAttribute('class', 'mp-sk');
        c.setAttribute('cx', (ring.cx + ring.r * Math.sin(ang)).toFixed(1));
        c.setAttribute('cy', (ring.cy - ring.r * Math.cos(ang)).toFixed(1));
        c.setAttribute('r', i % 5 === 0 ? '1.6' : '1.1');
        c.style.animationDelay = ((n * 0.37) % 7).toFixed(2) + 's';
        g.appendChild(c);
        n++;
      }
    });
    grid.appendChild(g);
  }
  placeStars();

  /* 漂浮：各节点不同周期与方向，幅度约 2–3px */
  function armDrift() {
    if (reduced()) { root.classList.remove('mp-live'); return; }
    var nodes = svg.querySelectorAll('a.mp-tn, a.mp-chn');
    Array.prototype.forEach.call(nodes, function (n, i) {
      var t = 11 + (i * 1.37) % 9;
      var a = 2 + (i % 3) * 0.4;
      var dx = (i % 2 ? a : -a).toFixed(1) + 'px';
      var dy = ((i % 3 === 0 ? a : i % 3 === 1 ? -a : a * 0.6)).toFixed(1) + 'px';
      n.style.setProperty('--mp-t', t.toFixed(2) + 's');
      n.style.setProperty('--mp-dx', dx);
      n.style.setProperty('--mp-dy', dy);
      n.style.setProperty('--mp-t2', (t * 1.15).toFixed(2) + 's');
    });
    root.classList.add('mp-live');
  }
  armDrift();
  if (RM && RM.addEventListener) RM.addEventListener('change', function () {
    if (reduced()) {
      root.classList.remove('mp-live');
      applyCam(false);
    } else armDrift();
  });

  /* ---------- 事件 ---------- */
  function modifierClick(e) {
    return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1;
  }

  svg.addEventListener('click', function (e) {
    if (moved) { e.preventDefault(); return; }
    var a = nodeAnchor(e.target);
    if (a) {
      if (modifierClick(e)) return; /* 让浏览器按链接打开 */
      e.preventDefault();
      if (focused === a) {
        /* 再点同一节点：跟随链接进入专题 / 本章 */
        var href = (infoFor(a) || {}).href || a.getAttribute('href');
        if (href) window.location.href = href;
        return;
      }
      focusNode(a);
      return;
    }
    if (e.target.closest && e.target.closest('a.mp-root')) {
      e.preventDefault();
      if (focused || st.k > 1.02) restore({ returnFocus: false });
      return;
    }
    /* 点空白：已放大则还原；仅启用时再点一次退出；否则进入可拖动状态 */
    if (focused || st.k > 1.02) {
      restore({ keepEngaged: false, returnFocus: false });
    } else if (engaged) {
      setEngaged(false);
    } else {
      setEngaged(true);
    }
  });

  elBack.addEventListener('click', function () { restore({ returnFocus: true }); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (focused || st.k > 1.02 || engaged) {
        e.preventDefault();
        restore({ returnFocus: true });
      }
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && document.activeElement) {
      var a = nodeAnchor(document.activeElement);
      if (!a) return;
      e.preventDefault();
      if (focused === a) {
        var href = (infoFor(a) || {}).href || a.getAttribute('href');
        if (href) window.location.href = href;
      } else {
        focusNode(a);
      }
    }
  });

  svg.addEventListener('pointerover', function (e) {
    if (dimLocked) return;
    var a = nodeAnchor(e.target); if (a) show(a);
  });
  svg.addEventListener('pointerout', function (e) {
    if (dimLocked) return;
    if (!nodeAnchor(e.relatedTarget)) {
      var f = nodeAnchor(document.activeElement);
      show(f && svg.contains(f) ? f : null);
    }
  });
  svg.addEventListener('focusin', function (e) {
    if (dimLocked) return;
    show(nodeAnchor(e.target));
  });
  svg.addEventListener('focusout', function (e) {
    if (dimLocked) return;
    if (!svg.contains(e.relatedTarget)) show(null);
  });

  /* 拖动平移：已启用，或已经缩放过 */
  function canPan() { return engaged || st.k > 1.02; }

  scroll.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 && e.pointerType !== 'touch') return;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var n = Object.keys(pointers).length;
    if (n === 2) {
      var ids = Object.keys(pointers);
      var a = pointers[ids[0]], b = pointers[ids[1]];
      pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), k: st.k, tx: st.tx, ty: st.ty };
      setEngaged(true);
      panning = false;
      try { scroll.setPointerCapture(e.pointerId); } catch (err) {}
      return;
    }
    if (!canPan()) { lastP = { x: e.clientX, y: e.clientY }; moved = false; return; }
    panning = true; moved = false; pid = e.pointerId;
    lastP = { x: e.clientX, y: e.clientY };
    try { scroll.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });

  scroll.addEventListener('pointermove', function (e) {
    if (pointers[e.pointerId]) pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length >= 2 && pinch0) {
      var a = pointers[ids[0]], b = pointers[ids[1]];
      var d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0.d > 8 && d > 0) {
        var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        var factor = d / pinch0.d;
        /* 以双指中点为基准，从捏合开始时的倍率算 */
        var p = clientToView(mx, my);
        var k2 = clampK(pinch0.k * factor);
        st.tx = p.x - (p.x - pinch0.tx) * (k2 / pinch0.k);
        st.ty = p.y - (p.y - pinch0.ty) * (k2 / pinch0.k);
        st.k = k2;
        applyCam(false);
      }
      e.preventDefault();
      return;
    }
    if (!panning || e.pointerId !== pid || !lastP) return;
    var dx = e.clientX - lastP.x, dy = e.clientY - lastP.y;
    if (Math.hypot(dx, dy) > 4) moved = true;
    if (!moved) return;
    var V = vb();
    var rect = svg.getBoundingClientRect();
    var sx = V.w / (rect.width || 1), sy = V.h / (rect.height || 1);
    st.tx += dx * sx;
    st.ty += dy * sy;
    lastP = { x: e.clientX, y: e.clientY };
    applyCam(false);
    e.preventDefault();
  });

  function endPointer(e) {
    delete pointers[e.pointerId];
    if (Object.keys(pointers).length < 2) pinch0 = null;
    if (e.pointerId === pid) { panning = false; pid = null; }
    /* click 处理器会读 moved；稍后再清，避免 click 先于 pointerup 丢失 */
    setTimeout(function () { if (!panning) moved = false; }, 0);
  }
  scroll.addEventListener('pointerup', endPointer);
  scroll.addEventListener('pointercancel', endPointer);

  scroll.addEventListener('wheel', function (e) {
    var allow = engaged || e.ctrlKey || e.metaKey;
    if (!allow) return;
    e.preventDefault();
    var f = Math.exp(-e.deltaY * 0.0018);
    if (e.deltaMode === 1) f = Math.exp(-e.deltaY * 0.08);
    zoomAt(e.clientX, e.clientY, f);
  }, { passive: false });

  if (scroll) scroll.style.touchAction = 'pan-y';
})();
