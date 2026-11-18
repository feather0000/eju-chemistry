/* 首页知识导图（四站同一份 assets/map.js）
   - 悬停 / 键盘经过：无关分支调淡（.mp-off）；聚焦某节点时锁定在该节点
   - 单击章 / 专题：平滑放大并显示图鉴式说明卡（简介来自 #mp-data，不新编）
     Ctrl/⌘/Shift/中键单击仍按链接打开对应页
   - 空白处、说明卡「返回」、Esc：还原
   - 滚轮：默认需按住 Ctrl 或 ⌘（避免抢走页面滚动）；点进图中（.mp-engaged）后可直接滚动缩放、拖动平移
   - 触屏：未点进图中时单指仍滚动页面；双指缩放；点进图中后可单指拖动。双指也会进入已启用状态
   - 镜头（缩放、平移、惯性）由 d3-zoom 驱动，过渡用 d3-transition / d3-ease 缓动，滚轮有追逐插值，拖动松手有惯性
   - 节点漂动由 d3-force 在原作者坐标附近做弱力模拟；小节扇形布局用 d3-hierarchy 的 cluster
   - 星点闪烁、联系弧虚线流动仍用 CSS；prefers-reduced-motion 时全部取消，缩放与展开瞬间到位
   - 专题小节只在放大聚焦或自由缩放到阈值以上后从该专题长出，总览图不画这些分支；缩回总览时平滑收回（带滞回） */
(function () {
  'use strict';
  var root = document.querySelector('#map');
  if (!root) return;
  var svg = root.querySelector('.mp-svg');
  if (!svg) return;
  if (!window.d3 || typeof d3.zoom !== 'function') return;
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
  var lodHold = false;
  var camTick = null;
  var inertiaV = { vx: 0, vy: 0 };
  var dragTrace = [];
  var zoomer = null;
  var zsel = null;

  function reduced() { return !!(RM && RM.matches); }

  cam._cur = { k: 1, tx: 0, ty: 0 };
  function setCam(k, tx, ty) {
    cam.setAttribute('transform', 'translate(' + tx + ' ' + ty + ') scale(' + k + ')');
    cam._cur = { k: k, tx: tx, ty: ty };
  }
  setCam(1, 0, 0);
  function nearly(a, b, eps) { return Math.abs(a - b) <= (eps || 0.0008); }
  function zoomT(k, tx, ty) { return d3.zoomIdentity.translate(tx, ty).scale(k); }
  function stopCamTick() {
    if (camTick) { cancelAnimationFrame(camTick); camTick = null; }
    inertiaV.vx = 0;
    inertiaV.vy = 0;
    if (zsel) zsel.interrupt();
  }
  function applyZoom(t, animate, onDone) {
    if (!zoomer || !zsel) {
      setCam(t.k, t.x, t.y);
      if (!lodHold) updateLOD();
      if (onDone) onDone();
      return;
    }
    zsel.interrupt();
    if (!animate || reduced()) {
      zsel.call(zoomer.transform, t);
      if (onDone) onDone();
      return;
    }
    zsel.transition('mp-cam')
      .duration(520)
      .ease(d3.easeCubicInOut)
      .call(zoomer.transform, t)
      .on('end.mp', function () { if (onDone) onDone(); });
  }
  function applyCam(animate, onDone) {
    stopCamTick();
    applyZoom(zoomT(st.k, st.tx, st.ty), animate, onDone);
  }
  function chaseCam() {
    if (reduced() || !zoomer) { applyCam(false); return; }
    zsel.interrupt();
    inertiaV.vx = 0;
    inertiaV.vy = 0;
    if (camTick) return;
    (function tick() {
      var cur = d3.zoomTransform(svg);
      var a = 0.2;
      var nk = cur.k + (st.k - cur.k) * a;
      var ntx = cur.x + (st.tx - cur.x) * a;
      var nty = cur.y + (st.ty - cur.y) * a;
      if (nearly(nk, st.k) && nearly(ntx, st.tx, 0.12) && nearly(nty, st.ty, 0.12)) {
        zsel.call(zoomer.transform, zoomT(st.k, st.tx, st.ty));
        camTick = null;
        return;
      }
      zsel.call(zoomer.transform, zoomT(nk, ntx, nty));
      camTick = requestAnimationFrame(tick);
    })();
  }
  function startInertia() {
    if (reduced() || !zoomer || dragTrace.length < 2) { dragTrace = []; return; }
    var b = dragTrace[dragTrace.length - 1];
    var a = b;
    for (var i = dragTrace.length - 2; i >= 0; i--) {
      if (b.t - dragTrace[i].t > 90) break;
      a = dragTrace[i];
    }
    dragTrace = [];
    var dt = b.t - a.t;
    if (dt < 20) return;
    var vx = (b.tx - a.tx) / dt * 16.7;
    var vy = (b.ty - a.ty) / dt * 16.7;
    var sp = Math.hypot(vx, vy);
    if (sp < 1.2) return;
    var cap = 52;
    if (sp > cap) { vx *= cap / sp; vy *= cap / sp; }
    inertiaV = { vx: vx, vy: vy };
    if (camTick) return;
    (function tick() {
      st.tx += inertiaV.vx;
      st.ty += inertiaV.vy;
      inertiaV.vx *= 0.92;
      inertiaV.vy *= 0.92;
      if (Math.hypot(inertiaV.vx, inertiaV.vy) < 0.18) {
        inertiaV.vx = 0;
        inertiaV.vy = 0;
        zsel.call(zoomer.transform, zoomT(st.k, st.tx, st.ty));
        camTick = null;
        return;
      }
      zsel.call(zoomer.transform, zoomT(st.k, st.tx, st.ty));
      camTick = requestAnimationFrame(tick);
    })();
  }

  function vb() {
    var v = svg.viewBox && svg.viewBox.baseVal;
    if (v && v.width) return { x: v.x, y: v.y, w: v.width, h: v.height };
    return { x: 0, y: 0, w: svg.clientWidth || 1160, h: svg.clientHeight || 1240 };
  }

  function visibleUserRect() {
    var V = vb();
    var k = (cam._cur && cam._cur.k) || st.k || 1;
    var tx = cam._cur ? cam._cur.tx : st.tx;
    var ty = cam._cur ? cam._cur.ty : st.ty;
    return { x: (V.x - tx) / k, y: (V.y - ty) / k, w: V.w / k, h: V.h / k };
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
    var kFrom = st.k;
    var k2 = clampK(kFrom * factor);
    if (k2 === kFrom) return;
    st.tx = p.x - (p.x - st.tx) * (k2 / kFrom);
    st.ty = p.y - (p.y - st.ty) * (k2 / kFrom);
    st.k = k2;
    chaseCam();
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
    if (a.classList.contains('mp-tn') || a.classList.contains('mp-chn') || a.classList.contains('mp-sub')) return a;
    return null;
  }

  function bindZoom() {
    zsel = d3.select(svg);
    zoomer = d3.zoom()
      .scaleExtent([KMIN, KMAX])
      .clickDistance(5)
      .filter(function (event) {
        if (event.type === 'wheel') return false;
        if (event.button && event.button !== 0) return false;
        if (event.type === 'mousedown') {
          if (nodeAnchor(event.target)) return false;
          return engaged || st.k > 1.02;
        }
        if (event.type === 'touchstart') {
          var n = (event.touches && event.touches.length) || 0;
          if (n >= 2) { setEngaged(true); return true; }
          if (nodeAnchor(event.target)) return false;
          return engaged || st.k > 1.02;
        }
        return !event.ctrlKey;
      })
      .on('start', function (event) {
        if (event.sourceEvent) {
          lodHold = false;
          stopCamTick();
          dragTrace = [{ t: performance.now(), tx: event.transform.x, ty: event.transform.y }];
          panning = true;
          moved = false;
        }
      })
      .on('zoom', function (event) {
        var t = event.transform;
        setCam(t.k, t.x, t.y);
        if (event.sourceEvent) {
          st.k = t.k;
          st.tx = t.x;
          st.ty = t.y;
          dragTrace.push({ t: performance.now(), tx: t.x, ty: t.y });
          if (dragTrace.length > 8) dragTrace.shift();
          if (Math.hypot(t.x - dragTrace[0].tx, t.y - dragTrace[0].ty) > 4 || Math.abs(t.k - 1) > 0.02) moved = true;
          var typ = event.sourceEvent.type || '';
          if (typ.indexOf('touch') === 0 || typ === 'wheel' || t.k > 1.02) {
            if (typ.indexOf('touch') === 0 && ((event.sourceEvent.touches && event.sourceEvent.touches.length >= 2) || typ === 'touchmove')) setEngaged(true);
          }
        }
        if (!lodHold) updateLOD();
      })
      .on('end', function (event) {
        if (event.sourceEvent && panning && moved) startInertia();
        else dragTrace = [];
        panning = false;
        setTimeout(function () { if (!panning) moved = false; }, 0);
      });
    zsel.call(zoomer).on('dblclick.zoom', null);
    zsel.call(zoomer.transform, zoomT(1, 0, 0));
  }
  bindZoom();

  function infoFor(a) {
    if (!a) return null;
    var slug = a.getAttribute('data-slug');
    var ch = a.getAttribute('data-ch');
    if (a.classList.contains('mp-sub') && slug && data.topics && data.topics[slug]) {
      var sid = a.getAttribute('data-sid');
      var kids = data.topics[slug].children || [];
      var kid = null;
      for (var i = 0; i < kids.length; i++) {
        if ((sid && kids[i].id === sid) || (!sid && kids[i].more && kids[i].zh === (a.getAttribute('data-title') || ''))) { kid = kids[i]; break; }
      }
      if (!kid && a.getAttribute('data-title')) {
        for (var j = 0; j < kids.length; j++) if (kids[j].zh === a.getAttribute('data-title')) { kid = kids[j]; break; }
      }
      var parent = data.topics[slug];
      var chd0 = (parent.ch && data.chapters[parent.ch]) || (ch && data.chapters[ch]) || {};
      if (kid) {
        return {
          k: (parent.zh || '专题') + (kid.more ? '' : ' · 小节'),
          zh: kid.zh || '', ja: kid.ja || '', intro: kid.intro || '',
          href: kid.href || a.getAttribute('href'),
          go: kid.more ? '打开专题' : '打开该小节'
        };
      }
    }
    if (slug && data.topics && data.topics[slug] && !a.classList.contains('mp-sub')) {
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


  /* ---------- 第三层小节（专题聚焦或放大越过阈值时出现） ---------- */
  var LOD_IN = 1.75;
  var LOD_OUT = 1.35;
  var kidsVisible = false;
  var kidsPhase = 'off';
  var kidAnim = null;

  function cancelKidAnim() {
    if (kidAnim) { cancelAnimationFrame(kidAnim); kidAnim = null; }
  }
  function easeOutCubic(u) { return 1 - Math.pow(1 - u, 3); }

  function setKidsProgress(g, t) {
    if (!g) return;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var branches = g.querySelectorAll('.mp-subbr');
    var nodes = g.querySelectorAll('a.mp-sub');
    Array.prototype.forEach.call(branches, function (br, i) {
      var x0 = +br.getAttribute('data-x0'), y0 = +br.getAttribute('data-y0');
      var u = (t - i * 0.05) / 0.55;
      if (u < 0) u = 0; if (u > 1) u = 1;
      var s = easeOutCubic(u);
      br.setAttribute('transform', 'translate(' + x0 + ' ' + y0 + ') scale(' + s + ') translate(' + (-x0) + ' ' + (-y0) + ')');
      br.style.opacity = (0.65 * s).toFixed(3);
    });
    Array.prototype.forEach.call(nodes, function (node, i) {
      var u = (t - 0.32 - i * 0.07) / 0.45;
      if (u < 0) u = 0; if (u > 1) u = 1;
      var s = 0.72 + 0.28 * easeOutCubic(u);
      node.style.opacity = String(u);
      node.style.transform = 'scale(' + s + ')';
      var on = u >= 0.85;
      node.setAttribute('tabindex', on ? '0' : '-1');
      node.setAttribute('aria-hidden', on ? 'false' : 'true');
      if (on) node.classList.add('mp-in');
      else node.classList.remove('mp-in');
    });
  }

  function growKids(opts) {
    opts = opts || {};
    var g = cam.querySelector('.mp-subs');
    if (!g) { if (opts.onDone) opts.onDone(); return; }
    cancelKidAnim();
    root.classList.add('mp-kids-on');
    root.classList.remove('mp-kids-grown');
    g.setAttribute('aria-hidden', 'false');
    if (kidsPhase === 'opening' && !opts.instant) return;
    kidsPhase = 'opening';
    if (reduced() || opts.instant) {
      setKidsProgress(g, 1);
      kidsVisible = true;
      kidsPhase = 'on';
      root.classList.add('mp-kids-grown');
      if (opts.onDone) opts.onDone();
      return;
    }
    var t0 = performance.now(), dur = 480;
    (function tick(now) {
      var u = Math.min(1, (now - t0) / dur);
      setKidsProgress(g, u);
      if (u < 1) kidAnim = requestAnimationFrame(tick);
      else {
        kidAnim = null;
        setKidsProgress(g, 1);
        kidsVisible = true;
        kidsPhase = 'on';
        root.classList.add('mp-kids-grown');
        if (opts.onDone) opts.onDone();
      }
    })(t0);
  }

  function retractKids(opts) {
    opts = opts || {};
    var g = cam.querySelector('.mp-subs');
    function finish() {
      g = cam.querySelector('.mp-subs');
      if (g && g.parentNode) g.parentNode.removeChild(g);
      shownSlug = null;
      kidsVisible = false;
      kidsPhase = 'off';
      root.classList.remove('mp-kids-on');
      root.classList.remove('mp-kids-grown');
      if (opts.onDone) opts.onDone();
    }
    if (!g) { finish(); return; }
    if (kidsPhase === 'closing' && !opts.instant) return;
    cancelKidAnim();
    kidsPhase = 'closing';
    g.setAttribute('aria-hidden', 'true');
    if (reduced() || opts.instant) { setKidsProgress(g, 0); finish(); return; }
    var t0 = performance.now(), dur = 400;
    (function tick(now) {
      var u = Math.min(1, (now - t0) / dur);
      setKidsProgress(g, 1 - u);
      if (u < 1) kidAnim = requestAnimationFrame(tick);
      else { kidAnim = null; finish(); }
    })(t0);
  }

  var shownSlug = null;

  function topicCenter(a) {
    var star = a.querySelector('.mp-star');
    if (star && star.getAttribute('cx')) return { x: +star.getAttribute('cx'), y: +star.getAttribute('cy') };
    var b = a.getBBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }
  function mapCenter() {
    var r = svg.querySelector('a.mp-root circle, a.mp-root');
    if (r && r.getAttribute && r.getAttribute('cx')) return { x: +r.getAttribute('cx'), y: +r.getAttribute('cy') };
    if (r && r.getBBox) { var b = r.getBBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }
    var V = vb(); return { x: V.x + V.w / 2, y: V.y + V.h / 2 };
  }
  function viewCenterUser() {
    var V = vb();
    var k = (cam._cur && cam._cur.k) || st.k;
    var tx = cam._cur ? cam._cur.tx : st.tx;
    var ty = cam._cur ? cam._cur.ty : st.ty;
    return { x: (V.x + V.w / 2 - tx) / k, y: (V.y + V.h / 2 - ty) / k };
  }
  function tw(s, fs) {
    s = (s || '') + '';
    var w = 0;
    for (var i = 0; i < s.length; i++) {
      var code = s.charCodeAt(i);
      w += (code > 0x2FF) ? fs * 1.02 : fs * 0.62;
    }
    return w;
  }

  function taperPath(x0, y0, x1, y1, w0, w1) {
    var ang = Math.atan2(y1 - y0, x1 - x0);
    var nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2);
    function p(x, y) { return x.toFixed(1) + ' ' + y.toFixed(1); }
    return 'M' + p(x0 + nx * w0, y0 + ny * w0) +
      'L' + p(x0 - nx * w0, y0 - ny * w0) +
      'L' + p(x1 - nx * w1, y1 - ny * w1) +
      'L' + p(x1 + nx * w1, y1 + ny * w1) + 'Z';
  }

  function kidsFor(slug) {
    return (data.topics && data.topics[slug] && data.topics[slug].children) || [];
  }

  function placeKids(parent) {
    var slug = parent.getAttribute('data-slug');
    var kids = kidsFor(slug);
    var g = cam.querySelector('.mp-subs');
    if (g) g.parentNode.removeChild(g);
    shownSlug = null;
    if (!kids.length) return null;
    g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'mp-subs mp-c' + (parent.getAttribute('data-ch') || ''));
    g.setAttribute('data-slug', slug);
    cam.appendChild(g);

    var boxEl = parent.querySelector('.mp-box');
    var pb, c;
    if (boxEl) {
      var bx = +boxEl.getAttribute('x'), by = +boxEl.getAttribute('y');
      var bw0 = +boxEl.getAttribute('width'), bh0 = +boxEl.getAttribute('height');
      pb = { x: bx, y: by, width: bw0, height: bh0 };
      c = { x: bx + bw0 / 2, y: by + bh0 / 2 };
    } else {
      var bb = parent.getBBox();
      pb = { x: bb.x, y: bb.y, width: bb.width, height: bb.height };
      c = { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
    }
    var star = topicCenter(parent);
    var o = mapCenter();
    var heading = Math.atan2(c.y - o.y, c.x - o.x);
    var ch = parent.getAttribute('data-ch') || '';
    function fitText(s, size, maxW) {
      s = (s || '') + '';
      if (!s) return '';
      if (tw(s, size) <= maxW) return s;
      var t = s;
      while (t.length > 1 && tw(t + '…', size) > maxW) t = t.slice(0, -1);
      return t + '…';
    }
    var MAXW = 168;
    var labels = kids.map(function (k) {
      var f = fitText(k.f, 10, MAXW - 20);
      var w = Math.max(tw(k.zh, 11.4), tw(f, 10), 80) + 20;
      return { f: f, w: Math.min(Math.max(w, 88), MAXW), h: f ? 44 : 32 };
    });
    var boxes = labels;
    var V = vb();
    var mL = V.x + 48, mR = V.x + V.w - 48, mT = V.y + 48, mB = V.y + V.h - 80;
    if (st.k >= 1.2) {
      var vis = visibleUserRect();
      mL = Math.max(mL, vis.x + 24);
      mR = Math.min(mR, vis.x + vis.w - 24);
      mT = Math.max(mT, vis.y + 24);
      mB = Math.min(mB, vis.y + vis.h * 0.68);
      if (mR - mL < 80) { mL = vis.x + 12; mR = vis.x + vis.w - 12; }
      if (mB - mT < 80) { mT = vis.y + 12; mB = vis.y + vis.h * 0.72; }
    }
    var clear = Math.max(pb.width, pb.height) / 2 + 22;
    var rOff = clear + 36;
    function layout(h, r) {
      var n = kids.length;
      var tree = d3.hierarchy({ children: kids.map(function (_, i) { return { i: i }; }) });
      var need = 0;
      for (var i = 0; i < n; i++) need += boxes[i].w + 12;
      var span = n <= 1 ? 0.001 : Math.min(2.7, need / Math.max(r, 1));
      d3.cluster().size([span, r])(tree);
      var pts = new Array(n);
      tree.leaves().forEach(function (d) {
        var i2 = d.data.i;
        var ang = n === 1 ? h : (h - span / 2 + d.x);
        pts[i2] = {
          x: c.x + d.y * Math.cos(ang),
          y: c.y + d.y * Math.sin(ang),
          a: ang, w: boxes[i2].w, h: boxes[i2].h, f: boxes[i2].f
        };
      });
      return { pts: pts };
    }
    function layout2(h, r, gap) {
      var n = kids.length, n0 = Math.ceil(n / 2);
      var pts = new Array(n);
      function put(idxs, rr) {
        if (!idxs.length) return;
        var tree = d3.hierarchy({ children: idxs.map(function (i) { return { i: i }; }) });
        var need = 0;
        for (var j = 0; j < idxs.length; j++) need += boxes[idxs[j]].w + 12;
        var span = idxs.length <= 1 ? 0.001 : Math.min(2.7, need / Math.max(rr, 1));
        d3.cluster().size([span, rr])(tree);
        tree.leaves().forEach(function (d) {
          var i2 = d.data.i;
          var ang = idxs.length === 1 ? h : (h - span / 2 + d.x);
          pts[i2] = {
            x: c.x + d.y * Math.cos(ang),
            y: c.y + d.y * Math.sin(ang),
            a: ang, w: boxes[i2].w, h: boxes[i2].h, f: boxes[i2].f
          };
        });
      }
      var row0 = [], row1 = [];
      for (var i = 0; i < n; i++) (i < n0 ? row0 : row1).push(i);
      put(row0, r);
      put(row1, r + (gap || 56));
      return { pts: pts };
    }

    function inPlate(pts) {
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        if (p.x - p.w / 2 < mL || p.x + p.w / 2 > mR || p.y - p.h / 2 < mT || p.y + p.h / 2 > mB) return false;
      }
      return true;
    }
    var others = [];
    Array.prototype.forEach.call(svg.querySelectorAll('a.mp-tn, a.mp-chn, a.mp-root'), function (el) {
      if (el === parent) return;
      try {
        var b = el.getBBox();
        others.push({ x: b.x, y: b.y, width: b.width, height: b.height });
      } catch (err) {}
    });
    function hitsRect(p, r, pad) {
      return !(p.x + p.w / 2 < r.x - pad || p.x - p.w / 2 > r.x + r.width + pad ||
               p.y + p.h / 2 < r.y - pad || p.y - p.h / 2 > r.y + r.height + pad);
    }
    function overlap(pts) {
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        if (hitsRect(p, pb, 10)) return true;
        for (var o = 0; o < others.length; o++) if (hitsRect(p, others[o], 12)) return true;
      }
      for (var i2 = 0; i2 < pts.length; i2++) for (var j = i2 + 1; j < pts.length; j++) {
        var dx = Math.abs(pts[i2].x - pts[j].x), dy = Math.abs(pts[i2].y - pts[j].y);
        if (dx < (pts[i2].w + pts[j].w) / 2 + 8 && dy < (pts[i2].h + pts[j].h) / 2 + 8) return true;
      }
      return false;
    }
    var fan = heading, chosen = null;
    var needW = 0;
    for (var ni = 0; ni < boxes.length; ni++) needW += boxes[ni].w + 12;
    var rMin = kids.length <= 1 ? rOff : Math.max(rOff, needW / 2.7);
    var turns = [0, 0.35, -0.35, 0.6, -0.6, 0.9, -0.9, 1.15, -1.15, 1.45, -1.45, 1.75, -1.75, 3.1416];
    function tryAt(fn, h, r) {
      var L = fn(h, r);
      if (!overlap(L.pts) && inPlate(L.pts)) { chosen = L; fan = h; return true; }
      return false;
    }
    for (var t = 0; t < turns.length && !chosen; t++) {
      for (var step = 0; step < 18 && !chosen; step++) {
        tryAt(layout, heading + turns[t], rMin + step * 20);
      }
    }
    if (!chosen) {
      for (var t2 = 0; t2 < turns.length && !chosen; t2++) {
        for (var step2 = 0; step2 < 14 && !chosen; step2++) {
          var L2 = layout2(heading + turns[t2], Math.max(rOff, rMin * 0.62) + step2 * 18, 58);
          if (!overlap(L2.pts) && inPlate(L2.pts)) { chosen = L2; fan = heading + turns[t2]; }
        }
      }
    }
    if (!chosen) {
      function layoutGreedy() {
        var pts = [];
        var dA = 0.16;
        for (var i = 0; i < kids.length; i++) {
          var found = null;
          for (var step = 0; step < 24 && !found; step++) {
            var r = rOff + 24 + step * 16;
            var nAng = Math.floor((2 * Math.PI) / dA);
            for (var k = 0; k < nAng && !found; k++) {
              var sign = (k % 2) ? 1 : -1;
              var off = Math.ceil(k / 2) * dA;
              var ang = heading + sign * off;
              var p = { x: c.x + r * Math.cos(ang), y: c.y + r * Math.sin(ang), a: ang, w: boxes[i].w, h: boxes[i].h, f: boxes[i].f };
              if (!overlap(pts.concat([p])) && inPlate([p])) found = p;
            }
          }
          if (!found) {
            var ang0 = heading + (i - (kids.length - 1) / 2) * 0.45;
            var rr = Math.max(rMin, rOff + 80);
            found = { x: c.x + rr * Math.cos(ang0), y: c.y + rr * Math.sin(ang0), a: ang0, w: boxes[i].w, h: boxes[i].h, f: boxes[i].f };
          }
          pts.push(found);
        }
        return { pts: pts };
      }
      var Lg = layoutGreedy();
      var allOk = !overlap(Lg.pts) && inPlate(Lg.pts);
      chosen = allOk || !chosen ? Lg : chosen;
      if (!allOk) chosen = Lg;
    }
    if (!chosen) { chosen = layout(heading + 3.1416, Math.max(rMin, rOff + 80)); }

    (function separate(pts) {
      var pad = 10;
      function hitsParent(p) { return hitsRect(p, pb, 10); }
      function hitsOther(p) {
        for (var o = 0; o < others.length; o++) if (hitsRect(p, others[o], 8)) return true;
        return false;
      }
      for (var iter = 0; iter < 10; iter++) {
        var moved = false;
        for (var i = 0; i < pts.length; i++) {
          for (var j = i + 1; j < pts.length; j++) {
            var a = pts[i], b = pts[j];
            var dx = b.x - a.x, dy = b.y - a.y;
            var needX = (a.w + b.w) / 2 + pad, needY = (a.h + b.h) / 2 + pad;
            if (Math.abs(dx) < needX && Math.abs(dy) < needY) {
              var ox = needX - Math.abs(dx), oy = needY - Math.abs(dy);
              var ax = a.x, ay = a.y, bx = b.x, by = b.y;
              if (ox < oy) {
                var sx = (dx < 0 ? -1 : 1) * (ox / 2 + 0.5);
                if (!dx) sx = (i % 2 ? 1 : -1) * (ox / 2 + 0.5);
                a.x -= sx; b.x += sx;
              } else {
                var sy = (dy < 0 ? -1 : 1) * (oy / 2 + 0.5);
                if (!dy) sy = (i % 2 ? 1 : -1) * (oy / 2 + 0.5);
                a.y -= sy; b.y += sy;
              }
              if (hitsParent(a) || hitsParent(b) || hitsOther(a) || hitsOther(b)) {
                a.x = ax; a.y = ay; b.x = bx; b.y = by;
              } else {
                moved = true;
              }
            }
          }
          pts[i].a = Math.atan2(pts[i].y - c.y, pts[i].x - c.x);
        }
        if (!moved) break;
      }
    })(chosen.pts);

    kids.forEach(function (kid, i) {
      var pt = chosen.pts[i];
      var x = pt.x, y = pt.y, bw = pt.w, bh = pt.h;
      var bx = x - bw / 2, by = y - bh / 2;
      var a = document.createElementNS(NS, 'a');
      a.setAttribute('class', 'mp-d mp-sub mp-c' + ch);
      a.setAttribute('data-ch', ch);
      a.setAttribute('data-slug', slug);
      if (kid.id) a.setAttribute('data-sid', kid.id);
      a.setAttribute('data-title', kid.zh);
      a.setAttribute('href', kid.href || ('topics/' + slug + '/'));
      if (kid.more) a.setAttribute('data-more', '1');
      var lab = kid.zh + (kid.f ? '：' + kid.f : '');
      a.setAttribute('aria-label', lab);
      a.setAttribute('tabindex', '-1');
      var dispF = pt.f || '';
      var hitW = Math.max(bw, 80), hitH = Math.max(bh, 64);
      /* 树枝从父框外缘接到子框内侧，不画进父框，也不放进 <a> */
      function rayEdge(cx0, cy0, hw, hh, ang) {
        var dx = Math.cos(ang), dy = Math.sin(ang);
        var tx = !dx ? 1e9 : hw / Math.abs(dx);
        var ty = !dy ? 1e9 : hh / Math.abs(dy);
        var tt = Math.min(tx, ty);
        return { x: cx0 + tt * dx, y: cy0 + tt * dy };
      }
      var p0 = rayEdge(c.x, c.y, pb.width / 2 + 1, pb.height / 2 + 1, pt.a);
      var back = Math.atan2(c.y - y, c.x - x);
      var p1 = rayEdge(x, y, bw / 2 + 1, bh / 2 + 1, back);
      var x0 = p0.x, y0 = p0.y, innerX = p1.x, innerY = p1.y;
      var br = document.createElementNS(NS, 'path');
      br.setAttribute('class', 'mp-subbr');
      br.setAttribute('d', taperPath(x0, y0, innerX, innerY, 1.8, 0.4));
      br.setAttribute('data-x0', x0.toFixed(2));
      br.setAttribute('data-y0', y0.toFixed(2));
      br.style.opacity = '0';
      br.setAttribute('aria-hidden', 'true');
      br.setAttribute('pointer-events', 'none');
      g.insertBefore(br, g.firstChild);
      var hit = document.createElementNS(NS, 'rect');
      hit.setAttribute('class', 'mp-hit');
      hit.setAttribute('x', (x - hitW / 2).toFixed(1));
      hit.setAttribute('y', (y - hitH / 2).toFixed(1));
      hit.setAttribute('width', hitW.toFixed(1));
      hit.setAttribute('height', hitH.toFixed(1));
      var rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('class', 'mp-box');
      rect.setAttribute('x', bx.toFixed(1));
      rect.setAttribute('y', by.toFixed(1));
      rect.setAttribute('width', bw.toFixed(1));
      rect.setAttribute('height', bh.toFixed(1));
      var title = document.createElementNS(NS, 'text');
      title.setAttribute('class', 'mp-t');
      title.setAttribute('x', x.toFixed(1));
      title.setAttribute('y', (y + (dispF ? -4 : 4)).toFixed(1));
      title.setAttribute('text-anchor', 'middle');
      title.textContent = kid.zh;
      a.appendChild(hit); a.appendChild(rect); a.appendChild(title);
      if (dispF) {
        var ft = document.createElementNS(NS, 'text');
        ft.setAttribute('class', 'mp-f');
        ft.setAttribute('x', x.toFixed(1));
        ft.setAttribute('y', (y + 13).toFixed(1));
        ft.setAttribute('text-anchor', 'middle');
        ft.textContent = dispF;
        a.appendChild(ft);
      }
      g.appendChild(a);
    });
    shownSlug = slug;
    kidsVisible = false;
    g.setAttribute('aria-hidden', 'true');
    setKidsProgress(g, 0);
    return g;
  }

  function hideKids() { retractKids({ instant: true }); }

  /* 用小节框的属性算包围盒，不受生长动画的 scale(0) 影响 */
  function unionBox(el) {
    var b = el.getBBox();
    var g = cam.querySelector('.mp-subs');
    if (!g) return b;
    var x = b.x, y = b.y, r = b.x + b.width, bo = b.y + b.height;
    Array.prototype.forEach.call(g.querySelectorAll('a.mp-sub .mp-box'), function (rect) {
      var rx = +rect.getAttribute('x'), ry = +rect.getAttribute('y');
      var rw = +rect.getAttribute('width'), rh = +rect.getAttribute('height');
      x = Math.min(x, rx); y = Math.min(y, ry);
      r = Math.max(r, rx + rw); bo = Math.max(bo, ry + rh);
    });
    return { x: x, y: y, width: r - x, height: bo - y };
  }

  function unionOverflows(topic) {
    var box = unionBox(topic);
    var vis = visibleUserRect();
    var pad = 20;
    return box.x < vis.x + pad || box.y < vis.y + pad ||
      box.x + box.width > vis.x + vis.w - pad ||
      box.y + box.height > vis.y + vis.h * 0.70;
  }

  function fitUnion(topic) {
    if (!cam.querySelector('.mp-subs')) return false;
    if (!unionOverflows(topic)) return false;
    frameBox(unionBox(topic), 'topic');
    return true;
  }

  function revealForTopic(a, opts) {
    opts = opts || {};
    if (!a || !a.classList.contains('mp-tn')) { if (opts.onDone) opts.onDone(); return; }
    var slug = a.getAttribute('data-slug');
    if (!kidsFor(slug).length) { if (opts.onDone) opts.onDone(); return; }
    if (shownSlug === slug && kidsVisible && !opts.force) { if (opts.onDone) opts.onDone(); return; }
    if (shownSlug && shownSlug !== slug) retractKids({ instant: true });
    if (shownSlug !== slug || !cam.querySelector('.mp-subs')) placeKids(a);
    function startGrow() { growKids({ instant: opts.instant, onDone: opts.onDone }); }
    if (opts.fit !== false && fitUnion(a) && !reduced() && !opts.instant) applyCam(true, startGrow);
    else startGrow();
  }

  window.__ejuMap = {
    cancelKidAnim: cancelKidAnim,
    setKidsT: function (t) {
      var g = cam.querySelector('.mp-subs');
      if (!g) return;
      setKidsProgress(g, t);
      if (t >= 1) { kidsVisible = true; kidsPhase = 'on'; root.classList.add('mp-kids-grown'); g.setAttribute('aria-hidden', 'false'); }
      if (t <= 0) { kidsVisible = false; kidsPhase = 'off'; root.classList.remove('mp-kids-grown'); }
    },
    cam: function () { return { k: cam._cur.k, tx: cam._cur.tx, ty: cam._cur.ty, tk: st.k, ttx: st.tx, tty: st.ty }; },
    motion: function () { return root.getAttribute('data-motion'); }
  };

  function nearestTopic(pt, maxd) {
    var best = null, bd = maxd;
    Array.prototype.forEach.call(svg.querySelectorAll('a.mp-tn'), function (a) {
      var c = topicCenter(a);
      var d = Math.hypot(c.x - pt.x, c.y - pt.y);
      if (d < bd) { bd = d; best = a; }
    });
    return best;
  }

  function clearFocusLight() {
    if (!focused) return;
    if (!(focused.classList.contains('mp-tn') || focused.classList.contains('mp-sub'))) return;
    focused = null;
    Array.prototype.forEach.call(svg.querySelectorAll('a.mp-now'), function (n) { n.classList.remove('mp-now'); });
    hideCard();
    unlockDim();
  }
  function topicForLod() {
    if (focused && focused.classList.contains('mp-sub')) {
      return svg.querySelector('a.mp-tn[data-slug="' + focused.getAttribute('data-slug') + '"]');
    }
    if (focused && focused.classList.contains('mp-tn')) return focused;
    return nearestTopic(viewCenterUser(), 260);
  }
  function updateLOD() {
    if (lodHold) return;
    var kNow = (cam._cur && cam._cur.k) || st.k || 1;
    if (focused && (focused.classList.contains('mp-chn') || focused.classList.contains('mp-root'))) {
      if (kNow <= LOD_OUT && kidsPhase !== 'off' && kidsPhase !== 'closing') retractKids({ instant: reduced() });
      return;
    }
    if (kNow >= LOD_IN) {
      var a = topicForLod();
      if (a && kidsFor(a.getAttribute('data-slug')).length) {
        var slug = a.getAttribute('data-slug');
        if (shownSlug === slug && (kidsVisible || kidsPhase === 'opening' || kidsPhase === 'on')) return;
        revealForTopic(a, { instant: reduced(), fit: false });
        return;
      }
    } else if (kNow <= LOD_OUT) {
      if (kidsPhase !== 'off' && kidsPhase !== 'closing') retractKids({ instant: reduced() });
      else if (kidsPhase === 'off' && (kidsVisible || shownSlug)) retractKids({ instant: reduced() });
      clearFocusLight();
    }
  }

  function frameBox(box, kind) {
    var V = vb();
    var padW = box.width + 48, padH = box.height + 48;
    var kMax = kind === 'child' ? 3.4 : 2.8;
    var kMin = kind === 'child' ? 1.9 : 1.55;
    var k = Math.min(V.w / padW, (V.h * 0.70) / padH, kMax);
    k = clampK(Math.max(k, kMin));
    var cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    st.k = k;
    st.tx = V.w * 0.50 - k * cx;
    st.ty = V.h * 0.40 - k * cy;
  }

  function markNow(a, topic) {
    Array.prototype.forEach.call(svg.querySelectorAll('a.mp-now'), function (n) { n.classList.remove('mp-now'); });
    a.classList.add('mp-now');
    if (topic) topic.classList.add('mp-now');
  }

  /* 先把专题本身放大，再从节点长出小节分支，而不是连分支一起缩放原图 */
  function focusNode(a, opts) {
    if (!a) return;
    opts = opts || {};
    var topic = a.classList.contains('mp-sub')
      ? svg.querySelector('a.mp-tn[data-slug="' + a.getAttribute('data-slug') + '"]')
      : (a.classList.contains('mp-tn') ? a : null);

    if (!topic) {
      if (kidsVisible || shownSlug) retractKids({ instant: !!opts.instant || reduced() });
      frameBox(a.getBBox(), 'chapter');
      focused = a;
      setEngaged(true);
      showCard(a);
      lockDim(a);
      markNow(a, null);
      applyCam(!opts.instant);
      return;
    }

    if (a.classList.contains('mp-sub')) {
      if (shownSlug !== topic.getAttribute('data-slug') || !kidsVisible) {
        placeKids(topic);
        growKids({ instant: true });
      }
      frameBox(a.getBBox(), 'child');
      focused = a;
      setEngaged(true);
      showCard(a);
      lockDim(topic);
      markNow(a, topic);
      applyCam(!opts.instant);
      return;
    }

    var slug = a.getAttribute('data-slug');
    var comingBack = kidsVisible && shownSlug === slug;
    focused = a;
    setEngaged(true);
    showCard(a);
    lockDim(a);
    markNow(a, topic);

    if (comingBack) {
      frameBox(unionBox(a), 'topic');
      applyCam(!opts.instant);
      return;
    }

    if (shownSlug && shownSlug !== slug) retractKids({ instant: true });
    frameBox(a.getBBox(), 'topic');
    lodHold = true;
    applyCam(!opts.instant && !reduced(), function () {
      lodHold = false;
      if (focused !== a) return;
      revealForTopic(a, { instant: reduced() || opts.instant });
    });
  }

  function restore(opts) {
    opts = opts || {};
    lodHold = false;
    var prev = focused;
    focused = null;
    retractKids({ instant: reduced() || !!opts.instant });
    st.k = 1; st.tx = 0; st.ty = 0;
    applyCam(!opts.instant);
    Array.prototype.forEach.call(svg.querySelectorAll('a.mp-now'), function (n) { n.classList.remove('mp-now'); });
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
      if (d.classList.contains('mp-sub')) on = d.getAttribute('data-slug') === slug || (!slug && d.getAttribute('data-ch') === ch);
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

  /* 漂浮：d3-force 把节点轻轻推离作者坐标，再用 forceX/Y 拉回，位移限制在约 9 用户单位。 */
  var driftSim = null;
  var driftNodes = [];
  function clearDriftTransforms() {
    Array.prototype.forEach.call(svg.querySelectorAll('a.mp-tn, a.mp-chn'), function (n) {
      n.removeAttribute('transform');
    });
  }
  function stopDrift() {
    if (driftSim) { driftSim.stop(); driftSim = null; }
  }
  function armDrift() {
    stopDrift();
    if (reduced()) {
      root.classList.remove('mp-live');
      root.setAttribute('data-motion', 'reduced');
      clearDriftTransforms();
      return;
    }
    driftNodes = [];
    Array.prototype.forEach.call(svg.querySelectorAll('a.mp-tn, a.mp-chn'), function (n, i) {
      var c = topicCenter(n);
      driftNodes.push({
        el: n,
        x: c.x, y: c.y,
        x0: c.x, y0: c.y,
        vx: (i % 2 ? 1 : -1) * 0.35,
        vy: (i % 3 === 0 ? 1 : -1) * 0.28
      });
      var ang = i * 1.17, rad = 5.5 + (i % 3) * 1.2;
      driftNodes[driftNodes.length - 1].x = c.x + rad * Math.cos(ang);
      driftNodes[driftNodes.length - 1].y = c.y + rad * Math.sin(ang);
    });
    root.classList.add('mp-live');
    root.setAttribute('data-motion', 'live');
    function brownian() {
      for (var i = 0; i < driftNodes.length; i++) {
        var d = driftNodes[i];
        d.vx += (Math.random() - 0.5) * 0.55;
        d.vy += (Math.random() - 0.5) * 0.55;
      }
    }
    driftSim = d3.forceSimulation(driftNodes)
      .force('x', d3.forceX(function (d) { return d.x0; }).strength(0.045))
      .force('y', d3.forceY(function (d) { return d.y0; }).strength(0.045))
      .force('brownian', brownian)
      .velocityDecay(0.18)
      .alpha(0.2)
      .alphaDecay(0)
      .alphaTarget(0.14)
      .on('tick', function () {
        for (var i = 0; i < driftNodes.length; i++) {
          var d = driftNodes[i];
          var dx = d.x - d.x0, dy = d.y - d.y0;
          var m = Math.hypot(dx, dy), cap = 9;
          if (m > cap) { dx = dx * cap / m; dy = dy * cap / m; d.x = d.x0 + dx; d.y = d.y0 + dy; }
          if (d.el.classList.contains('mp-now')) d.el.setAttribute('transform', 'translate(0 0)');
          else d.el.setAttribute('transform', 'translate(' + dx.toFixed(2) + ' ' + dy.toFixed(2) + ')');
        }
      });
  }
  armDrift();
  if (RM && RM.addEventListener) RM.addEventListener('change', function () {
    if (reduced()) {
      root.classList.remove('mp-live');
      root.setAttribute('data-motion', 'reduced');
      stopDrift();
      clearDriftTransforms();
      stopCamTick();
      applyCam(false);
    } else armDrift();
  });

  function goBack(opts) {
    opts = opts || {};
    if (focused && focused.classList.contains('mp-sub')) {
      var par = svg.querySelector('a.mp-tn[data-slug="' + focused.getAttribute('data-slug') + '"]');
      if (par) { focusNode(par, opts); if (opts.returnFocus && par.focus) { try { par.focus({ preventScroll: true }); } catch (e) { par.focus(); } } return; }
    }
    restore(opts);
  }

  /* ---------- 事件 ---------- */
  function modifierClick(e) {
    return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1;
  }

  svg.addEventListener('click', function (e) {
    if (moved && !nodeAnchor(e.target)) { e.preventDefault(); return; }
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
    /* 点空白：逐级返回（小节→专题→全图） */
    if (focused) {
      goBack({ returnFocus: false });
    } else if (st.k > 1.02) {
      restore({ keepEngaged: false, returnFocus: false });
    } else if (engaged) {
      setEngaged(false);
    } else {
      setEngaged(true);
    }
  });

  elBack.addEventListener('click', function () { goBack({ returnFocus: true }); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (focused || st.k > 1.02 || engaged) {
        e.preventDefault();
        goBack({ returnFocus: true });
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
      return;
    }
    var inMap = engaged || (document.activeElement && root.contains(document.activeElement));
    if (!inMap) return;
    if (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_') {
      e.preventDefault();
      setEngaged(true);
      var r = svg.getBoundingClientRect();
      zoomAt(r.left + r.width / 2, r.top + r.height / 2, e.key === '-' || e.key === '_' ? 1 / 1.18 : 1.18);
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

  /* 平移、双指缩放由 d3-zoom 处理；滚轮走追逐插值，避免逐步跳变。 */
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
