/* 首页知识导图（四站同一份 assets/map.js）
   - 悬停 / 键盘经过：无关分支调淡（.mp-off）；聚焦某节点时锁定在该节点
   - 单击章：把该章的专题重新围成一圈（或弧），镜头对准章心，其它章淡出；再点专题则小节围着专题成环\n   - 单击专题：平滑放大并显示图鉴式说明卡（简介来自 #mp-data，不新编）
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
  var justDragged = false;
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
        scheduleReflow({ flush: true });
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
        scheduleReflow({ flush: true });
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
        if (!lodHold) { updateLOD(); scheduleReflow(); }
      })
      .on('end', function (event) {
        if (event.sourceEvent && panning && moved) startInertia();
        else dragTrace = [];
        panning = false;
        if (moved) {
          justDragged = true;
          requestAnimationFrame(function () {
            setTimeout(function () { justDragged = false; moved = false; }, 0);
          });
        } else {
          moved = false;
        }
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
  var reflowTimer = null;
  var reflowAnim = null;

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
      var sc = easeOutCubic(u);
      br.setAttribute('transform', 'translate(' + x0 + ' ' + y0 + ') scale(' + sc + ') translate(' + (-x0) + ' ' + (-y0) + ')');
      br.style.opacity = (0.65 * sc).toFixed(3);
    });
    Array.prototype.forEach.call(nodes, function (node, i) {
      var u = (t - 0.32 - i * 0.07) / 0.45;
      if (u < 0) u = 0; if (u > 1) u = 1;
      var grow = 0.72 + 0.28 * easeOutCubic(u);
      var cx = +node.getAttribute('data-cx'), cy = +node.getAttribute('data-cy');
      var s = +node.getAttribute('data-s') || 1;
      node.style.opacity = String(u);
      var gi = node.querySelector('.mp-subg') || node;
      gi.setAttribute('transform', 'translate(' + cx + ' ' + cy + ') scale(' + (s * grow).toFixed(4) + ')');
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
    if (reflowTimer) { clearTimeout(reflowTimer); reflowTimer = null; }
    if (reflowAnim) { cancelAnimationFrame(reflowAnim); reflowAnim = null; }
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

  function kidScale() {
    var k = (cam._cur && cam._cur.k) || st.k || 1;
    if (k < 1) k = 1;
    /* 略大于总览字号，放大后保持大约恒定的屏幕大小 */
    var s = 1.35 / k;
    return s > 1 ? 1 : s;
  }

  function visibleLayoutRect() {
    var vis = visibleUserRect();
    var k = (cam._cur && cam._cur.k) || st.k || 1;
    var p = 16 / k;
    var bottomFrac = (card && !card.hasAttribute('hidden')) ? 0.32 : 0.14;
    return { x: vis.x + p, y: vis.y + p, w: vis.w - 2 * p, h: vis.h * (1 - bottomFrac) - p };
  }

  function elemUserRect(el) {
    if (!el) return null;
    var r = el.getBoundingClientRect();
    if (!r || !r.width) return null;
    var p1 = clientToView(r.left, r.top);
    var p2 = clientToView(r.right, r.bottom);
    var k = (cam._cur && cam._cur.k) || st.k || 1;
    var tx = cam._cur ? cam._cur.tx : st.tx;
    var ty = cam._cur ? cam._cur.ty : st.ty;
    var x1 = (p1.x - tx) / k, y1 = (p1.y - ty) / k;
    var x2 = (p2.x - tx) / k, y2 = (p2.y - ty) / k;
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
  }
  function parentGeom(parent) {
    var boxEl = parent.querySelector('.mp-box') || parent;
    var pb = elemUserRect(boxEl);
    if (!pb || !pb.width) {
      try {
        var bb = boxEl.getBBox();
        pb = { x: bb.x, y: bb.y, width: bb.width, height: bb.height };
      } catch (err) {
        pb = { x: 0, y: 0, width: 80, height: 40 };
      }
    }
    var c = { x: pb.x + pb.width / 2, y: pb.y + pb.height / 2 };
    return { pb: pb, c: c };
  }

  function labelSizes(kids) {
    function fitText(str, size, maxW) {
      str = (str || '') + '';
      if (!str) return '';
      if (tw(str, size) <= maxW) return str;
      var t = str;
      while (t.length > 1 && tw(t + '…', size) > maxW) t = t.slice(0, -1);
      return t + '…';
    }
    var MAXW = 168;
    return kids.map(function (k) {
      var f = fitText(k.f, 10, MAXW - 20);
      var w = Math.max(tw(k.zh, 11.4), tw(f, 10), 80) + 20;
      return { f: f, w: Math.min(Math.max(w, 88), MAXW), h: f ? 44 : 32 };
    });
  }

  function neighborRects(parent) {
    var others = [];
    Array.prototype.forEach.call(svg.querySelectorAll('a.mp-tn, a.mp-chn, a.mp-root'), function (el) {
      if (el === parent) return;
      var box = el.querySelector('.mp-box') || el.querySelector('circle');
      var b = elemUserRect(box);
      if (b && b.width && b.height) others.push(b);
    });
    return others;
  }

  function computeKidLayout(parent) {
    var kids = kidsFor(parent.getAttribute('data-slug'));
    if (!kids.length) return null;
    var geom = parentGeom(parent);
    var pb = geom.pb, c = geom.c;
    var boxes = labelSizes(kids);
    var s = kidScale();
    var vis = visibleLayoutRect();
    var gap = 14 * s;
    var stem = Math.max(24 * s, 14 * s);
    var items = boxes.map(function (b) {
      return { w: b.w, h: b.h, vw: b.w * s, vh: b.h * s, f: b.f };
    });
    var others = neighborRects(parent);

    function hitsRect(p, r, pad) {
      return !(p.x + p.vw / 2 < r.x - pad || p.x - p.vw / 2 > r.x + r.width + pad ||
               p.y + p.vh / 2 < r.y - pad || p.y - p.vh / 2 > r.y + r.height + pad);
    }
    function overlapsParent(pts) {
      for (var i = 0; i < pts.length; i++) if (hitsRect(pts[i], pb, 8 * s)) return true;
      return false;
    }
    function overlap(pts) {
      if (overlapsParent(pts)) return true;
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        for (var o = 0; o < others.length; o++) if (hitsRect(p, others[o], 8 * s)) return true;
      }
      for (var i2 = 0; i2 < pts.length; i2++) for (var j = i2 + 1; j < pts.length; j++) {
        var dx = Math.abs(pts[i2].x - pts[j].x), dy = Math.abs(pts[i2].y - pts[j].y);
        if (dx < (pts[i2].vw + pts[j].vw) / 2 + 8 * s && dy < (pts[i2].vh + pts[j].vh) / 2 + 8 * s) return true;
      }
      return false;
    }
    function inView(pts) {
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        if (p.x - p.vw / 2 < vis.x || p.x + p.vw / 2 > vis.x + vis.w ||
            p.y - p.vh / 2 < vis.y || p.y + p.vh / 2 > vis.y + vis.h) return false;
      }
      return true;
    }
    function finish(pts) {
      for (var i = 0; i < pts.length; i++) {
        pts[i].a = Math.atan2(pts[i].y - c.y, pts[i].x - c.x);
        pts[i].s = s;
      }
      return { pts: pts, s: s, c: c, pb: pb };
    }

    function clearRoom(dir) {
      var room;
      if (dir === 'R') room = (vis.x + vis.w) - (pb.x + pb.width);
      else if (dir === 'L') room = pb.x - vis.x;
      else if (dir === 'B') room = (vis.y + vis.h) - (pb.y + pb.height);
      else room = pb.y - vis.y;
      for (var oi = 0; oi < others.length; oi++) {
        var o = others[oi];
        if (dir === 'R' || dir === 'L') {
          if (o.y + o.height < pb.y - 8 || o.y > pb.y + pb.height + 8) continue;
          if (dir === 'R' && o.x >= pb.x + pb.width * 0.5) room = Math.min(room, o.x - (pb.x + pb.width));
          if (dir === 'L' && o.x + o.width <= pb.x + pb.width * 0.5) room = Math.min(room, pb.x - (o.x + o.width));
        } else {
          if (o.x + o.width < pb.x - 8 || o.x > pb.x + pb.width + 8) continue;
          if (dir === 'B' && o.y >= pb.y + pb.height * 0.5) room = Math.min(room, o.y - (pb.y + pb.height));
          if (dir === 'T' && o.y + o.height <= pb.y + pb.height * 0.5) room = Math.min(room, pb.y - (o.y + o.height));
        }
      }
      return room;
    }
    var roomR = clearRoom('R'), roomL = clearRoom('L'), roomB = clearRoom('B'), roomT = clearRoom('T');
    var sides = [
      { name: 'R', room: roomR, ang: 0 },
      { name: 'L', room: roomL, ang: Math.PI },
      { name: 'B', room: roomB, ang: Math.PI / 2 },
      { name: 'T', room: roomT, ang: -Math.PI / 2 }
    ];
    sides.sort(function (a, b) { return b.room - a.room; });

    function packColumn(side, cols) {
      var n = items.length;
      var nCol = cols || 1;
      var groups = [];
      var per = Math.ceil(n / nCol);
      for (var g = 0; g < nCol; g++) groups.push([]);
      for (var i = 0; i < n; i++) groups[Math.floor(i / per) % nCol].push(i);
      /* 尽量均分 */
      if (nCol === 2) {
        groups = [[], []];
        for (var i2 = 0; i2 < n; i2++) groups[i2 % 2].push(i2);
      }
      var pts = new Array(n);
      if (side.name === 'R' || side.name === 'L') {
        var colW = [];
        var colH = [];
        for (var ci = 0; ci < groups.length; ci++) {
          var mw = 0, th = 0;
          for (var j = 0; j < groups[ci].length; j++) {
            var it = items[groups[ci][j]];
            if (it.vw > mw) mw = it.vw;
            th += it.vh + (j ? gap : 0);
          }
          colW.push(mw); colH.push(th);
        }
        var totalW = colW.reduce(function (a, b) { return a + b; }, 0) + gap * (groups.length - 1);
        var need = stem + totalW;
        if (need > side.room + 4 * s) return null;
        var x0 = side.name === 'R' ? (pb.x + pb.width + stem + colW[0] / 2)
                                   : (pb.x - stem - colW[0] / 2);
        for (var ci2 = 0; ci2 < groups.length; ci2++) {
          var x = side.name === 'R'
            ? (ci2 === 0 ? x0 : x0 + (colW[0] + colW[ci2]) / 2 + gap * ci2)
            : (ci2 === 0 ? x0 : x0 - (colW[0] + colW[ci2]) / 2 - gap * ci2);
          var th2 = colH[ci2];
          var y = c.y - th2 / 2;
          var minY = vis.y, maxY = vis.y + vis.h - th2;
          if (maxY < minY) return null;
          if (y < minY) y = minY;
          if (y > maxY) y = maxY;
          for (var j2 = 0; j2 < groups[ci2].length; j2++) {
            var idx = groups[ci2][j2], it2 = items[idx];
            y += it2.vh / 2;
            pts[idx] = { x: x, y: y, vw: it2.vw, vh: it2.vh, w: it2.w, h: it2.h, f: it2.f };
            y += it2.vh / 2 + gap;
          }
        }
      } else {
        var rowH = [];
        var rowW = [];
        for (var ri = 0; ri < groups.length; ri++) {
          var mh = 0, twid = 0;
          for (var j3 = 0; j3 < groups[ri].length; j3++) {
            var it3 = items[groups[ri][j3]];
            if (it3.vh > mh) mh = it3.vh;
            twid += it3.vw + (j3 ? gap : 0);
          }
          rowH.push(mh); rowW.push(twid);
        }
        var totalH = rowH.reduce(function (a, b) { return a + b; }, 0) + gap * (groups.length - 1);
        if (stem + totalH > side.room + 4 * s) return null;
        var y0 = side.name === 'B' ? (pb.y + pb.height + stem + rowH[0] / 2)
                                   : (pb.y - stem - rowH[0] / 2);
        for (var ri2 = 0; ri2 < groups.length; ri2++) {
          var yb = side.name === 'B'
            ? (ri2 === 0 ? y0 : y0 + (rowH[0] + rowH[ri2]) / 2 + gap * ri2)
            : (ri2 === 0 ? y0 : y0 - (rowH[0] + rowH[ri2]) / 2 - gap * ri2);
          var tw2 = rowW[ri2];
          var x = c.x - tw2 / 2;
          var minX = vis.x, maxX = vis.x + vis.w - tw2;
          if (maxX < minX) return null;
          if (x < minX) x = minX;
          if (x > maxX) x = maxX;
          for (var j4 = 0; j4 < groups[ri2].length; j4++) {
            var idx2 = groups[ri2][j4], it4 = items[idx2];
            x += it4.vw / 2;
            pts[idx2] = { x: x, y: yb, vw: it4.vw, vh: it4.vh, w: it4.w, h: it4.h, f: it4.f };
            x += it4.vw / 2 + gap;
          }
        }
      }
      if (!pts.every(Boolean)) return null;
      if (overlap(pts) || !inView(pts)) return null;
      return finish(pts);
    }


    function packKidRadial() {
      var n = items.length;
      if (!n) return null;
      var maxHalf = 0;
      for (var i = 0; i < n; i++) {
        var hh = Math.hypot(items[i].vw, items[i].vh) / 2;
        if (hh > maxHalf) maxHalf = hh;
      }
      var inner = Math.max(pb.width, pb.height) / 2 + 22 * s;
      var minR = inner + maxHalf + 16 * s;
      var need = maxHalf * 2 + 16 * s;
      var nInner = n > 10 ? Math.ceil(n / 2) : n;
      var Rchord = nInner <= 1 ? minR : need / (2 * Math.sin(Math.PI / nInner));
      var R = Math.max(minR, Rchord);
      var maxR = Math.min(
        c.x - vis.x, vis.x + vis.w - c.x,
        c.y - vis.y, vis.y + vis.h - c.y
      ) - maxHalf - 8 * s;
      var kind = 'ring';
      if (maxR < minR * 0.6) return null;
      if (R > maxR + 2 && n <= 10) { kind = 'arc'; R = Math.max(minR, maxR); }
      if (n > 10) R = Math.min(R, Math.max(minR, maxR * 0.7));
      else if (maxR > minR) R = Math.min(Math.max(R, minR * 1.12), maxR * 0.78);
      var start = -Math.PI / 2;
      /* 朝空位最大的一侧作为弧的朝向 / 环的起始参考 */
      if (kind === 'arc') start = sides[0].ang;
      function ptsAt(radius, count, phase, offset, take) {
        var step, a0;
        if (kind === 'arc' && count > 1) {
          var span = Math.min(Math.PI * 1.2, 2.6);
          step = span / (count - 1);
          a0 = phase - span / 2;
        } else if (count <= 1) {
          step = 0; a0 = phase;
        } else {
          step = Math.PI * 2 / count;
          a0 = phase;
        }
        var pts = [];
        for (var j = 0; j < take.length; j++) {
          var it = items[take[j]];
          var ang = a0 + step * j;
          pts.push({ x: c.x + radius * Math.cos(ang), y: c.y + radius * Math.sin(ang), vw: it.vw, vh: it.vh, w: it.w, h: it.h, f: it.f, i: take[j] });
        }
        return pts;
      }
      var pts;
      if (n > 10) {
        var n1 = Math.ceil(n / 2);
        var idx1 = [], idx2 = [];
        for (var k = 0; k < n; k++) (k < n1 ? idx1 : idx2).push(k);
        pts = ptsAt(R, n1, start, 0, idx1).concat(ptsAt(R * 1.42, n - n1, start + Math.PI / Math.max(n - n1, 1), 0, idx2));
        var ordered = new Array(n);
        for (var p = 0; p < pts.length; p++) ordered[pts[p].i] = pts[p];
        pts = ordered;
      } else {
        var idx = [];
        for (var i2 = 0; i2 < n; i2++) idx.push(i2);
        pts = ptsAt(R, n, start, 0, idx);
      }
      if (!pts.every(Boolean)) return null;
      if (overlapsParent(pts)) return null;
      /* 环上允许略微靠近邻居，但不画出视野 */
      if (!inView(pts) && kind === 'ring') {
        kind = 'arc';
        return null;
      }
      if (!inView(pts)) return null;
      return finish(pts);
    }

    var chosen = packKidRadial();
    var tried;
    for (var si = 0; si < sides.length && !chosen; si++) {
      chosen = packColumn(sides[si], 1);
      if (!chosen && items.length > 3) chosen = packColumn(sides[si], 2);
    }

    function packWrapped(side) {
      var maxW, maxH;
      if (side.name === 'T' || side.name === 'B') {
        maxW = Math.max(40, vis.w - 8 * s);
        var rows = [], row = [], rw = 0;
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          if (row.length && rw + gap + it.vw > maxW) { rows.push({ items: row, w: rw, h: 0 }); row = []; rw = 0; }
          row.push(it);
          rw += it.vw + (row.length > 1 ? gap : 0);
        }
        if (row.length) rows.push({ items: row, w: rw, h: 0 });
        for (var r = 0; r < rows.length; r++) {
          var mh = 0;
          for (var j = 0; j < rows[r].items.length; j++) if (rows[r].items[j].vh > mh) mh = rows[r].items[j].vh;
          rows[r].h = mh;
        }
        var totalH = 0;
        for (var r2 = 0; r2 < rows.length; r2++) totalH += rows[r2].h + (r2 ? gap : 0);
        var y0 = side.name === 'B' ? (pb.y + pb.height + stem) : (pb.y - stem - totalH);
        var pts = new Array(items.length);
        var y = y0;
        var ii = 0;
        for (var r3 = 0; r3 < rows.length; r3++) {
          var rw2 = rows[r3].w;
          var x = Math.max(vis.x, Math.min(c.x - rw2 / 2, vis.x + vis.w - rw2));
          for (var j2 = 0; j2 < rows[r3].items.length; j2++) {
            var it2 = rows[r3].items[j2];
            x += it2.vw / 2;
            pts[ii] = { x: x, y: y + rows[r3].h / 2, vw: it2.vw, vh: it2.vh, w: it2.w, h: it2.h, f: it2.f };
            x += it2.vw / 2 + gap;
            ii++;
          }
          y += rows[r3].h + gap;
        }
        return pts.every(Boolean) ? finish(pts) : null;
      }
      maxH = Math.max(40, vis.h - 8 * s);
      var cols = [], col = [], ch = 0;
      for (var i3 = 0; i3 < items.length; i3++) {
        var it3 = items[i3];
        if (col.length && ch + gap + it3.vh > maxH) { cols.push({ items: col, h: ch, w: 0 }); col = []; ch = 0; }
        col.push(it3);
        ch += it3.vh + (col.length > 1 ? gap : 0);
      }
      if (col.length) cols.push({ items: col, h: ch, w: 0 });
      for (var c0 = 0; c0 < cols.length; c0++) {
        var mw = 0;
        for (var j3 = 0; j3 < cols[c0].items.length; j3++) if (cols[c0].items[j3].vw > mw) mw = cols[c0].items[j3].vw;
        cols[c0].w = mw;
      }
      var totalW = 0;
      for (var c1 = 0; c1 < cols.length; c1++) totalW += cols[c1].w + (c1 ? gap : 0);
      var x0 = side.name === 'R' ? (pb.x + pb.width + stem) : (pb.x - stem - totalW);
      var pts2 = new Array(items.length);
      var x2 = x0;
      var ii2 = 0;
      for (var c2 = 0; c2 < cols.length; c2++) {
        var ch2 = cols[c2].h;
        var y2 = Math.max(vis.y, Math.min(c.y - ch2 / 2, vis.y + vis.h - ch2));
        for (var j4 = 0; j4 < cols[c2].items.length; j4++) {
          var it4 = cols[c2].items[j4];
          y2 += it4.vh / 2;
          pts2[ii2] = { x: x2 + cols[c2].w / 2, y: y2, vw: it4.vw, vh: it4.vh, w: it4.w, h: it4.h, f: it4.f };
          y2 += it4.vh / 2 + gap;
          ii2++;
        }
        x2 += cols[c2].w + gap;
      }
      return pts2.every(Boolean) ? finish(pts2) : null;
    }

    if (!chosen) {
      for (var wi = 0; wi < sides.length && !chosen; wi++) {
        var wrapped = packWrapped(sides[wi]);
        if (wrapped && !overlapsParent(wrapped.pts) && inView(wrapped.pts)) chosen = wrapped;
        else if (wrapped && !overlapsParent(wrapped.pts) && !chosen) chosen = wrapped; /* 优先不压专题，允许略出画框 */

      }
    }

    if (!chosen) {
      /* 退回扇形：朝向空隙最大的一侧，用视觉尺寸 */
      var heading = sides[0].ang;
      var o = mapCenter();
      var outward = Math.atan2(c.y - o.y, c.x - o.x);
      var heads = [sides[0].ang, sides[1].ang, outward, outward + 0.5, outward - 0.5];
      function fan(h, r) {
        var n = items.length;
        var tree = d3.hierarchy({ children: items.map(function (_, i) { return { i: i }; }) });
        var need = 0;
        for (var i = 0; i < n; i++) need += items[i].vw + 12 * s;
        var span = n <= 1 ? 0.001 : Math.min(2.6, need / Math.max(r, 1));
        d3.cluster().size([span, r])(tree);
        var pts = new Array(n);
        tree.leaves().forEach(function (d) {
          var i2 = d.data.i;
          var ang = n === 1 ? h : (h - span / 2 + d.x);
          pts[i2] = {
            x: c.x + d.y * Math.cos(ang),
            y: c.y + d.y * Math.sin(ang),
            vw: items[i2].vw, vh: items[i2].vh,
            w: items[i2].w, h: items[i2].h, f: items[i2].f
          };
        });
        return pts;
      }
      var r0 = Math.max(pb.width, pb.height) / 2 + stem + items[0].vw / 2;
      for (var hi = 0; hi < heads.length && !chosen; hi++) {
        for (var step = 0; step < 10 && !chosen; step++) {
          var pts = fan(heads[hi], r0 + step * 16 * s);
          if (!overlap(pts) && inView(pts)) chosen = finish(pts);
        }
      }
      if (!chosen) {
        /* 最后：先钳进视野，再把压到专题框上的节点推到空隙最大的一边 */
        function clampPt(p) {
          p.x = Math.max(vis.x + p.vw / 2, Math.min(p.x, vis.x + vis.w - p.vw / 2));
          p.y = Math.max(vis.y + p.vh / 2, Math.min(p.y, vis.y + vis.h - p.vh / 2));
        }
        function shoveOff(pts) {
          var candidates = [
            { name: 'R', x: function (p) { return pb.x + pb.width + stem + p.vw / 2; }, y: function (p) { return p.y; } },
            { name: 'L', x: function (p) { return pb.x - stem - p.vw / 2; }, y: function (p) { return p.y; } },
            { name: 'B', x: function (p) { return p.x; }, y: function (p) { return pb.y + pb.height + stem + p.vh / 2; } },
            { name: 'T', x: function (p) { return p.x; }, y: function (p) { return pb.y - stem - p.vh / 2; } }
          ];
          candidates.sort(function (a, b) {
            var ra = sides.filter(function (s) { return s.name === a.name; })[0];
            var rb = sides.filter(function (s) { return s.name === b.name; })[0];
            return (rb ? rb.room : 0) - (ra ? ra.room : 0);
          });
          for (var i = 0; i < pts.length; i++) {
            var p = pts[i];
            if (!hitsRect(p, pb, 8 * s)) continue;
            for (var ci = 0; ci < candidates.length; ci++) {
              var q = { x: candidates[ci].x(p), y: candidates[ci].y(p), vw: p.vw, vh: p.vh, w: p.w, h: p.h, f: p.f };
              clampPt(q);
              if (!hitsRect(q, pb, 4 * s)) { pts[i] = q; break; }
            }
            if (hitsRect(pts[i], pb, 4 * s)) clampPt(pts[i]);
          }
        }
        var pts2 = fan(sides[0].ang, r0 + 20 * s);
        for (var k = 0; k < pts2.length; k++) clampPt(pts2[k]);
        shoveOff(pts2);
        /* 若仍压在专题上，改沿空隙最大的一侧紧凑排列（允许略超出后再钳） */
        if (overlap(pts2)) {
          var tight = packColumn(sides[0], items.length > 3 ? 2 : 1);
          if (!tight) {
            var saved = sides[0].room;
            sides[0].room = 1e9;
            tight = packColumn(sides[0], items.length > 3 ? 2 : 1);
            sides[0].room = saved;
          }
          if (tight) {
            chosen = tight;
          } else {
            shoveOff(pts2);
            chosen = finish(pts2);
          }
        } else {
          chosen = finish(pts2);
        }
      }
    }
    return chosen;
  }

  function rayEdge(cx0, cy0, hw, hh, ang) {
    var dx = Math.cos(ang), dy = Math.sin(ang);
    var tx = !dx ? 1e9 : hw / Math.abs(dx);
    var ty = !dy ? 1e9 : hh / Math.abs(dy);
    var tt = Math.min(tx, ty);
    return { x: cx0 + tt * dx, y: cy0 + tt * dy };
  }

  function branchEnds(c, pb, pt) {
    var ang = Math.atan2(pt.y - c.y, pt.x - c.x);
    var p0 = rayEdge(c.x, c.y, pb.width / 2 + 1, pb.height / 2 + 1, ang);
    var back = Math.atan2(c.y - pt.y, c.x - pt.x);
    var p1 = rayEdge(pt.x, pt.y, pt.vw / 2 + 1, pt.vh / 2 + 1, back);
    return { x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y };
  }

  function writeBranch(br, ends, s) {
    var w0 = Math.max(0.55, 1.8 * s), w1 = Math.max(0.22, 0.4 * s);
    br.setAttribute('d', taperPath(ends.x0, ends.y0, ends.x1, ends.y1, w0, w1));
    br.setAttribute('data-x0', ends.x0.toFixed(2));
    br.setAttribute('data-y0', ends.y0.toFixed(2));
    br.setAttribute('data-x1', ends.x1.toFixed(2));
    br.setAttribute('data-y1', ends.y1.toFixed(2));
  }

  function writeNodePos(node, pt, grow) {
    if (grow == null) grow = node.classList.contains('mp-in') || kidsPhase === 'on' ? 1 : 0.72;
    node.setAttribute('data-cx', pt.x.toFixed(2));
    node.setAttribute('data-cy', pt.y.toFixed(2));
    node.setAttribute('data-s', pt.s.toFixed(4));
    node.setAttribute('data-vw', pt.vw.toFixed(2));
    node.setAttribute('data-vh', pt.vh.toFixed(2));
    var gi = node.querySelector('.mp-subg') || node;
    gi.setAttribute('transform', 'translate(' + pt.x + ' ' + pt.y + ') scale(' + (pt.s * grow).toFixed(4) + ')');
  }

  function applyKidPositions(g, layout, opts) {
    opts = opts || {};
    if (!g || !layout) return;
    var nodes = g.querySelectorAll('a.mp-sub');
    var inst = !!(opts.instant || reduced());
    var grow = (kidsPhase === 'on' || opts.grown) ? 1 : (opts.grow != null ? opts.grow : 0);
    var dest = layout.pts;
    if (inst || !opts.animate || reduced()) {
      if (reflowAnim) { cancelAnimationFrame(reflowAnim); reflowAnim = null; }
      Array.prototype.forEach.call(nodes, function (node) {
        var i = +node.getAttribute('data-i');
        writeNodePos(node, dest[i], kidsPhase === 'on' || kidsPhase === 'opening' && node.classList.contains('mp-in') ? 1 : (kidsPhase === 'on' ? 1 : null));
        var br = g.querySelector('.mp-subbr[data-i="' + i + '"]');
        if (br) writeBranch(br, branchEnds(layout.c, layout.pb, dest[i]), layout.s);
      });
      /* opening 时保留当前生长进度，由 setKidsProgress 接着播 */
      if (kidsPhase === 'on') {
        Array.prototype.forEach.call(nodes, function (node) {
          var i = +node.getAttribute('data-i');
          writeNodePos(node, dest[i], 1);
        });
      }
      return;
    }
    var from = [];
    Array.prototype.forEach.call(nodes, function (node) {
      var i = +node.getAttribute('data-i');
      var br = g.querySelector('.mp-subbr[data-i="' + i + '"]');
      from[i] = {
        x: +node.getAttribute('data-cx'), y: +node.getAttribute('data-cy'), s: +node.getAttribute('data-s') || layout.s,
        x0: br ? +br.getAttribute('data-x0') : dest[i].x,
        y0: br ? +br.getAttribute('data-y0') : dest[i].y,
        x1: br ? +br.getAttribute('data-x1') : dest[i].x,
        y1: br ? +br.getAttribute('data-y1') : dest[i].y
      };
    });
    if (reflowAnim) { cancelAnimationFrame(reflowAnim); reflowAnim = null; }
    var t0 = performance.now(), dur = 340;
    function lerp(a, b, e) { return a + (b - a) * e; }
    (function tick(now) {
      var u = Math.min(1, (now - t0) / dur);
      var e = easeOutCubic(u);
      Array.prototype.forEach.call(nodes, function (node) {
        var i = +node.getAttribute('data-i');
        var a = from[i], b = dest[i];
        var pt = {
          x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e),
          s: lerp(a.s, b.s, e),
          vw: lerp((+node.getAttribute('data-vw') || b.vw), b.vw, e),
          vh: lerp((+node.getAttribute('data-vh') || b.vh), b.vh, e),
          w: b.w, h: b.h, f: b.f
        };
        writeNodePos(node, pt, 1);
        var br = g.querySelector('.mp-subbr[data-i="' + i + '"]');
        if (br) {
          var ends = {
            x0: lerp(a.x0, branchEnds(layout.c, layout.pb, b).x0, e),
            y0: lerp(a.y0, branchEnds(layout.c, layout.pb, b).y0, e),
            x1: lerp(a.x1, branchEnds(layout.c, layout.pb, b).x1, e),
            y1: lerp(a.y1, branchEnds(layout.c, layout.pb, b).y1, e)
          };
          writeBranch(br, ends, pt.s);
        }
      });
      if (u < 1) reflowAnim = requestAnimationFrame(tick);
      else {
        reflowAnim = null;
        Array.prototype.forEach.call(nodes, function (node) {
          var i = +node.getAttribute('data-i');
          writeNodePos(node, dest[i], 1);
          var br = g.querySelector('.mp-subbr[data-i="' + i + '"]');
          if (br) writeBranch(br, branchEnds(layout.c, layout.pb, dest[i]), layout.s);
        });
      }
    })(t0);
  }

  function reflowKids(opts) {
    opts = opts || {};
    if (kidsPhase !== 'on') return;
    var g = cam.querySelector('.mp-subs');
    if (!g || !shownSlug) return;
    var parent = svg.querySelector('a.mp-tn[data-slug="' + shownSlug + '"]');
    if (!parent) return;
    var layout = computeKidLayout(parent);
    if (!layout) return;
    applyKidPositions(g, layout, { animate: !opts.instant && !reduced(), instant: !!opts.instant || reduced() });
  }

  function scheduleReflow(opts) {
    opts = opts || {};
    if (reflowTimer) { clearTimeout(reflowTimer); reflowTimer = null; }
    if (kidsPhase !== 'on') return;
    if (reduced() || opts.instant || opts.flush) {
      reflowKids({ instant: reduced() || opts.instant });
      return;
    }
    reflowTimer = setTimeout(function () {
      reflowTimer = null;
      reflowKids({ instant: false });
    }, 120);
  }

  function placeKids(parent) {
    var slug = parent.getAttribute('data-slug');
    var kids = kidsFor(slug);
    var existing = cam.querySelector('.mp-subs');
    if (!kids.length) {
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      shownSlug = null;
      return null;
    }
    var layout = computeKidLayout(parent);
    if (!layout) return null;
    var ch = parent.getAttribute('data-ch') || '';

    if (existing && existing.getAttribute('data-slug') === slug &&
        existing.querySelectorAll('a.mp-sub').length === kids.length) {
      shownSlug = slug;
      applyKidPositions(existing, layout, { animate: false, instant: true });
      return existing;
    }
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    var g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'mp-subs mp-c' + ch);
    g.setAttribute('data-slug', slug);
    cam.appendChild(g);
    var geom = { c: layout.c, pb: layout.pb };

    kids.forEach(function (kid, i) {
      var pt = layout.pts[i];
      var a = document.createElementNS(NS, 'a');
      a.setAttribute('class', 'mp-d mp-sub mp-c' + ch);
      a.setAttribute('data-ch', ch);
      a.setAttribute('data-slug', slug);
      a.setAttribute('data-i', String(i));
      if (kid.id) a.setAttribute('data-sid', kid.id);
      a.setAttribute('data-title', kid.zh);
      a.setAttribute('href', kid.href || ('topics/' + slug + '/'));
      if (kid.more) a.setAttribute('data-more', '1');
      var lab = kid.zh + (kid.f ? '：' + kid.f : '');
      a.setAttribute('aria-label', lab);
      a.setAttribute('tabindex', '-1');
      var dispF = pt.f || '';
      var bw = pt.w, bh = pt.h;
      var hitW = Math.max(bw, 80), hitH = Math.max(bh, 64);
      var ends = branchEnds(geom.c, geom.pb, pt);
      var br = document.createElementNS(NS, 'path');
      br.setAttribute('class', 'mp-subbr');
      br.setAttribute('data-i', String(i));
      br.style.opacity = '0';
      br.setAttribute('aria-hidden', 'true');
      br.setAttribute('pointer-events', 'none');
      writeBranch(br, ends, layout.s);
      g.appendChild(br);

      var gi = document.createElementNS(NS, 'g');
      gi.setAttribute('class', 'mp-subg');
      var hit = document.createElementNS(NS, 'rect');
      hit.setAttribute('class', 'mp-hit');
      hit.setAttribute('x', (-hitW / 2).toFixed(1));
      hit.setAttribute('y', (-hitH / 2).toFixed(1));
      hit.setAttribute('width', hitW.toFixed(1));
      hit.setAttribute('height', hitH.toFixed(1));
      var rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('class', 'mp-box');
      rect.setAttribute('x', (-bw / 2).toFixed(1));
      rect.setAttribute('y', (-bh / 2).toFixed(1));
      rect.setAttribute('width', bw.toFixed(1));
      rect.setAttribute('height', bh.toFixed(1));
      var title = document.createElementNS(NS, 'text');
      title.setAttribute('class', 'mp-t');
      title.setAttribute('x', '0');
      title.setAttribute('y', dispF ? '-4' : '4');
      title.setAttribute('text-anchor', 'middle');
      title.textContent = kid.zh;
      gi.appendChild(hit); gi.appendChild(rect); gi.appendChild(title);
      if (dispF) {
        var ft = document.createElementNS(NS, 'text');
        ft.setAttribute('class', 'mp-f');
        ft.setAttribute('x', '0');
        ft.setAttribute('y', '13');
        ft.setAttribute('text-anchor', 'middle');
        ft.textContent = dispF;
        gi.appendChild(ft);
      }
      a.appendChild(gi);
      writeNodePos(a, pt, 0.72);
      a.style.opacity = '0';
      g.appendChild(a);
    });
    shownSlug = slug;
    kidsVisible = false;
    g.setAttribute('aria-hidden', 'true');
    setKidsProgress(g, 0);
    return g;
  }

  function hideKids() { retractKids({ instant: true }); }

  /* 用视觉尺寸（含 1/k 反缩放）算包围盒 */
  function unionBox(el) {
    var b = el.getBBox();
    var g = cam.querySelector('.mp-subs');
    if (!g) return b;
    var x = b.x, y = b.y, r = b.x + b.width, bo = b.y + b.height;
    Array.prototype.forEach.call(g.querySelectorAll('a.mp-sub'), function (node) {
      var cx = +node.getAttribute('data-cx'), cy = +node.getAttribute('data-cy');
      var vw = +node.getAttribute('data-vw'), vh = +node.getAttribute('data-vh');
      if (!vw) return;
      x = Math.min(x, cx - vw / 2); y = Math.min(y, cy - vh / 2);
      r = Math.max(r, cx + vw / 2); bo = Math.max(bo, cy + vh / 2);
    });
    return { x: x, y: y, width: r - x, height: bo - y };
  }

  function unionOverflows(topic) {
    var box = unionBox(topic);
    var vis = visibleLayoutRect();
    return box.x < vis.x || box.y < vis.y ||
      box.x + box.width > vis.x + vis.w ||
      box.y + box.height > vis.y + vis.h;
  }

  function fitUnion(topic) {
    /* 视野内重排优先，镜头只做极小平移，不改倍率 */
    if (!cam.querySelector('.mp-subs')) return false;
    if (!unionOverflows(topic)) return false;
    var box = unionBox(topic);
    var vis = visibleUserRect();
    var dx = 0, dy = 0;
    if (box.x < vis.x + 12) dx = (vis.x + 12) - box.x;
    if (box.x + box.width > vis.x + vis.w - 12) dx = (vis.x + vis.w - 12) - (box.x + box.width);
    if (box.y < vis.y + 12) dy = (vis.y + 12) - box.y;
    if (box.y + box.height > vis.y + vis.h * 0.70) dy = (vis.y + vis.h * 0.70) - (box.y + box.height);
    if (!dx && !dy) return false;
    /* 用户坐标平移 vis 等价于相机 tx/ty 增减 dx*k */
    var k = (cam._cur && cam._cur.k) || st.k || 1;
    st.tx += dx * k;
    st.ty += dy * k;
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
    motion: function () { return root.getAttribute('data-motion'); },
    reflow: function (instant) { reflowKids({ instant: !!instant }); },
    kidScale: kidScale
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

  function easeInOutCubic(u) {
    return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  }

  /* ---------- 章 / 专题环绕重排 ---------- */
  var CH_IN = 1.52, CH_OUT = 1.18;
  var CH_TOPIC_IN = 2.35, CH_TOPIC_OUT = 1.95;
  var radialMode = 'off'; /* off | chapter | topic */
  var radialCh = null;
  var radialViaChapter = false;
  var layoutAnim = null;
  var spokeLayer = null;

  function homeCenter(el) {
    if (el.__home) return el.__home;
    var star = el.querySelector('.mp-star');
    if (star && star.getAttribute('cx')) {
      el.__home = { x: +star.getAttribute('cx'), y: +star.getAttribute('cy') };
      return el.__home;
    }
    var cir = el.querySelector('.mp-nr, .mp-nb, .mp-rr, .mp-rb, circle');
    if (cir && cir.getAttribute('cx')) {
      el.__home = { x: +cir.getAttribute('cx'), y: +cir.getAttribute('cy') };
      return el.__home;
    }
    var box = el.querySelector('.mp-box');
    if (box && box.getAttribute('x')) {
      el.__home = {
        x: +box.getAttribute('x') + (+box.getAttribute('width') || 0) / 2,
        y: +box.getAttribute('y') + (+box.getAttribute('height') || 0) / 2
      };
      return el.__home;
    }
    try {
      var b = el.getBBox();
      el.__home = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    } catch (err) {
      el.__home = { x: 0, y: 0 };
    }
    return el.__home;
  }

  function boxCenter(el) {
    var box = el.querySelector('.mp-box');
    if (box && box.getAttribute('x')) {
      return {
        x: +box.getAttribute('x') + (+box.getAttribute('width') || 0) / 2,
        y: +box.getAttribute('y') + (+box.getAttribute('height') || 0) / 2
      };
    }
    return homeCenter(el);
  }

  function nodeBoxSize(el) {
    var box = el.querySelector('.mp-box');
    if (box && box.getAttribute('width')) {
      return { w: +box.getAttribute('width'), h: +box.getAttribute('height') };
    }
    var cir = el.querySelector('.mp-nb, .mp-nr, .mp-rb, circle');
    if (cir && cir.getAttribute('r')) {
      var r = +cir.getAttribute('r');
      return { w: r * 2, h: r * 2 };
    }
    try {
      var b = el.getBBox();
      return { w: b.width, h: b.height };
    } catch (err) {
      return { w: 80, h: 40 };
    }
  }

  function layoutOf(el) {
    return {
      dx: +el.getAttribute('data-ldx') || 0,
      dy: +el.getAttribute('data-ldy') || 0,
      s: el.hasAttribute('data-ls') ? +el.getAttribute('data-ls') : 1
    };
  }

  function ensureLayWrap(el) {
    var g = null;
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 1 && (n.getAttribute('class') || '') === 'mp-lay') { g = n; break; }
    }
    if (g) return g;
    g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'mp-lay');
    while (el.firstChild) g.appendChild(el.firstChild);
    el.appendChild(g);
    return g;
  }

  function applyNodeTF(el, driftX, driftY) {
    var L = layoutOf(el);
    var c = homeCenter(el);
    var dx = L.dx + (driftX || 0);
    var dy = L.dy + (driftY || 0);
    var s = L.s;
    var t = 'translate(' + (c.x + dx) + ' ' + (c.y + dy) + ')';
    if (Math.abs(s - 1) > 0.001) t += ' scale(' + s.toFixed(4) + ')';
    t += ' translate(' + (-c.x) + ' ' + (-c.y) + ')';
    var g = ensureLayWrap(el);
    g.setAttribute('transform', t);
    el.removeAttribute('transform');
  }

  function writeLayout(el, dx, dy, s) {
    el.setAttribute('data-ldx', dx.toFixed(3));
    el.setAttribute('data-ldy', dy.toFixed(3));
    el.setAttribute('data-ls', s.toFixed(4));
    applyNodeTF(el, 0, 0);
  }

  function layoutNodes() {
    return svg.querySelectorAll('a.mp-tn, a.mp-chn, a.mp-root');
  }

  function cancelLayoutAnim() {
    if (layoutAnim) { cancelAnimationFrame(layoutAnim); layoutAnim = null; }
  }

  function animateLayouts(targets, opts, onDone) {
    opts = opts || {};
    cancelLayoutAnim();
    var inst = !!(opts.instant || reduced());
    if (inst) {
      for (var i = 0; i < targets.length; i++) {
        writeLayout(targets[i].el, targets[i].dx, targets[i].dy, targets[i].s);
      }
      if (onDone) onDone();
      return;
    }
    var from = [];
    for (var j = 0; j < targets.length; j++) {
      var L = layoutOf(targets[j].el);
      from.push({ dx: L.dx, dy: L.dy, s: L.s });
    }
    var t0 = performance.now();
    var dur = 560;
    (function tick(now) {
      var u = Math.min(1, (now - t0) / dur);
      var e = easeInOutCubic(u);
      for (var i = 0; i < targets.length; i++) {
        var a = from[i], b = targets[i];
        writeLayout(b.el, a.dx + (b.dx - a.dx) * e, a.dy + (b.dy - a.dy) * e, a.s + (b.s - a.s) * e);
      }
      updateSpokes();
      if (u < 1) layoutAnim = requestAnimationFrame(tick);
      else {
        layoutAnim = null;
        for (var k = 0; k < targets.length; k++) {
          writeLayout(targets[k].el, targets[k].dx, targets[k].dy, targets[k].s);
        }
        updateSpokes();
        if (onDone) onDone();
      }
    })(t0);
  }

  function topicScaleForK(k) {
    if (k < 1) k = 1;
    var s = 1.25 / k;
    return s > 1 ? 1 : s;
  }

  function chapterTopics(ch) {
    return Array.prototype.filter.call(svg.querySelectorAll('a.mp-tn'), function (a) {
      return a.getAttribute('data-ch') === ch;
    });
  }

  /* 按原方位排序后均匀铺在环或弧上；超过 10 个用双环。 */
  function placeOnRing(center, items, vis, k) {
    var n = items.length;
    if (!n) return [];
    var s = topicScaleForK(k);
    var i, it, maxHalf = 0;
    for (i = 0; i < n; i++) {
      it = items[i];
      it.s = s;
      it.vw = it.size.w * s;
      it.vh = it.size.h * s;
      var half = Math.hypot(it.vw, it.vh) / 2;
      if (half > maxHalf) maxHalf = half;
    }
    var inner = (items.innerR || 42) + 28 * s;
    var minR = inner + maxHalf + 26 * s;
    var need = maxHalf * 2 + 22 * s;
    var ranked = items.slice().sort(function (a, b) {
      var aa = Math.atan2(a.home.y - center.y, a.home.x - center.x);
      var bb = Math.atan2(b.home.y - center.y, b.home.x - center.x);
      return aa - bb;
    });
    var start = Math.atan2(ranked[0].home.y - center.y, ranked[0].home.x - center.x);
    var availW = vis.w / 2 - maxHalf - 12;
    var availH = vis.h / 2 - maxHalf - 12;
    var maxR = Math.min(availW, availH);
    var useTwo = n > 10;
    var nInner = useTwo ? Math.ceil(n / 2) : n;
    var nOuter = n - nInner;
    var Rchord = nInner <= 1 ? minR : (need) / (2 * Math.sin(Math.PI / Math.max(nInner, 2)));
    var R = Math.max(minR, Rchord);
    if (maxR > minR) R = Math.max(R, Math.min(maxR * 0.74, minR * 1.3));
    var kind = 'ring';
    if (R > maxR + 2 && !useTwo) {
      kind = 'arc';
      R = Math.max(minR, maxR);
    }
    if (useTwo) {
      R = Math.min(Math.max(minR, Rchord), maxR * 0.72);
    }
    var out = new Array(n);
    function put(list, radius, phase, count) {
      var step = count <= 1 ? 0 : (kind === 'arc' ? Math.min((Math.PI * 1.15), 2.4) / Math.max(1, count - 1) : (Math.PI * 2) / count);
      var a0;
      if (kind === 'arc' && count > 1) {
        a0 = phase - step * (count - 1) / 2;
      } else if (count <= 1) {
        a0 = phase;
      } else {
        a0 = phase;
      }
      for (var j = 0; j < list.length; j++) {
        var ang = a0 + step * j;
        var node = list[j];
        node.x = center.x + radius * Math.cos(ang);
        node.y = center.y + radius * Math.sin(ang);
        node.ang = ang;
        node.s = s;
        out[items.indexOf(node)] = node;
      }
    }
    if (n <= 1) start = -Math.PI / 2;
    if (useTwo) {
      put(ranked.slice(0, nInner), R, start, nInner);
      put(ranked.slice(nInner), R * 1.42, start + Math.PI / Math.max(nOuter, 1), nOuter);
    } else if (kind === 'arc') {
      /* 朝视野中空余较大的一侧张开 */
      var room = [
        { ang: 0, r: (vis.x + vis.w) - center.x },
        { ang: Math.PI, r: center.x - vis.x },
        { ang: Math.PI / 2, r: (vis.y + vis.h) - center.y },
        { ang: -Math.PI / 2, r: center.y - vis.y }
      ];
      room.sort(function (a, b) { return b.r - a.r; });
      put(ranked, R, room[0].ang, n);
    } else {
      put(ranked, R, start, n);
    }
    for (i = 0; i < out.length; i++) if (!out[i]) out[i] = items[i];
    return out;
  }

  function visAt(k, cx, cy, bottomFrac) {
    var V = vb();
    var tx = V.w * 0.50 - k * cx;
    var ty = V.h * (bottomFrac == null ? 0.40 : bottomFrac) - k * cy;
    var pad = 16 / k;
    var bf = (card && !card.hasAttribute('hidden')) ? 0.30 : 0.14;
    if (bottomFrac != null) bf = 1 - bottomFrac * 2 > 0 ? 0.14 : 0.30;
    return {
      x: (V.x - tx) / k + pad,
      y: (V.y - ty) / k + pad,
      w: V.w / k - 2 * pad,
      h: (V.h / k) * (1 - ((card && !card.hasAttribute('hidden')) ? 0.30 : 0.14)) - pad
    };
  }

  function frameOn(cx, cy, k) {
    var V = vb();
    st.k = clampK(k);
    st.tx = V.w * 0.50 - st.k * cx;
    st.ty = V.h * 0.40 - st.k * cy;
  }

  function chooseChapterK(n) {
    if (n <= 1) return 2.05;
    if (n <= 3) return 1.9;
    if (n <= 6) return 1.72;
    if (n <= 10) return 1.52;
    return 1.38;
  }

  function ensureSpokes() {
    if (spokeLayer && spokeLayer.parentNode) return spokeLayer;
    spokeLayer = document.createElementNS(NS, 'g');
    spokeLayer.setAttribute('class', 'mp-radial-spokes');
    spokeLayer.setAttribute('aria-hidden', 'true');
    var hook = cam.querySelector('.mp-br');
    if (hook && hook.parentNode === cam) cam.insertBefore(spokeLayer, hook);
    else cam.appendChild(spokeLayer);
    return spokeLayer;
  }

  function clearSpokes() {
    if (!spokeLayer) return;
    while (spokeLayer.firstChild) spokeLayer.removeChild(spokeLayer.firstChild);
  }

  function hideStarTwigs(ch, hidden) {
    Array.prototype.forEach.call(svg.querySelectorAll('.mp-tw, .mp-tr, .mp-ic'), function (el) {
      var ech = el.getAttribute('data-ch');
      if (ch && ech && ech !== ch) return;
      if (ch && !ech) return;
      el.style.opacity = hidden ? '0' : '';
      if (hidden) el.setAttribute('data-radial-hide', '1');
      else el.removeAttribute('data-radial-hide');
    });
  }

  function currentCenter(el) {
    var h = homeCenter(el);
    var L = layoutOf(el);
    return { x: h.x + L.dx, y: h.y + L.dy };
  }

  function updateSpokes() {
    if (radialMode === 'off' || !radialCh) { clearSpokes(); return; }
    var chn = svg.querySelector('a.mp-chn[data-ch="' + radialCh + '"]');
    if (!chn) return;
    var c = currentCenter(chn);
    var size = nodeBoxSize(chn);
    var L = layoutOf(chn);
    var hw = (size.w * L.s) / 2, hh = (size.h * L.s) / 2;
    var g = ensureSpokes();
    var topics = chapterTopics(radialCh);
    if (radialMode === 'topic' && focused && focused.classList.contains('mp-tn')) {
      topics = [focused];
    }
    /* rebuild if count changed */
    var paths = g.querySelectorAll('.mp-radial-spoke');
    if (paths.length !== topics.length) {
      clearSpokes();
      for (var i = 0; i < topics.length; i++) {
        var p = document.createElementNS(NS, 'path');
        p.setAttribute('class', 'mp-radial-spoke');
        p.setAttribute('data-slug', topics[i].getAttribute('data-slug') || '');
        g.appendChild(p);
      }
      paths = g.querySelectorAll('.mp-radial-spoke');
    }
    for (var j = 0; j < topics.length; j++) {
      var tn = topics[j];
      var tc = currentCenter(tn);
      var ts = layoutOf(tn);
      var tb = nodeBoxSize(tn);
      var ang = Math.atan2(tc.y - c.y, tc.x - c.x);
      var p0 = rayEdge(c.x, c.y, hw + 1, hh + 1, ang);
      var back = Math.atan2(c.y - tc.y, c.x - tc.x);
      var p1 = rayEdge(tc.x, tc.y, (tb.w * ts.s) / 2 + 1, (tb.h * ts.s) / 2 + 1, back);
      var w0 = Math.max(0.7, 2.0 * Math.min(L.s, 1));
      var w1 = Math.max(0.25, 0.45 * Math.min(ts.s, 1));
      paths[j].setAttribute('d', taperPath(p0.x, p0.y, p1.x, p1.y, w0, w1));
      paths[j].setAttribute('data-slug', tn.getAttribute('data-slug') || '');
    }
  }


  function blurMapFocus() {
    var ae = document.activeElement;
    if (ae && svg.contains(ae) && ae.blur) ae.blur();
  }

  function applyRecede(ch, keepSlug) {
    root.classList.add('mp-radial-on');
    Array.prototype.forEach.call(svg.querySelectorAll('a.mp-tn, a.mp-chn, a.mp-root'), function (el) {
      var recede;
      if (el.classList.contains('mp-root')) recede = true;
      else if (el.classList.contains('mp-chn')) recede = keepSlug ? true : el.getAttribute('data-ch') !== String(ch);
      else if (keepSlug) recede = el.getAttribute('data-slug') !== keepSlug;
      else recede = el.getAttribute('data-ch') !== String(ch);
      el.classList.toggle('mp-recede', recede);
    });
    Array.prototype.forEach.call(svg.querySelectorAll('.mp-br, .mp-xl, .mp-ic, .mp-tw, .mp-tr'), function (el) {
      var recede;
      var ech = el.getAttribute('data-ch');
      if (ech) recede = ech !== String(ch);
      else if (el.classList.contains('mp-br')) {
        var m = (el.getAttribute('class') || '').match(/mp-c(\d+)/);
        recede = !m || m[1] !== String(ch);
      } else recede = true;
      el.classList.toggle('mp-recede', recede);
    });
  }

  function clearRecede() {
    root.classList.remove('mp-radial-on');
    Array.prototype.forEach.call(svg.querySelectorAll('.mp-recede'), function (el) {
      el.classList.remove('mp-recede');
    });
  }

  function targetsHome() {
    var list = [];
    Array.prototype.forEach.call(layoutNodes(), function (el) {
      list.push({ el: el, dx: 0, dy: 0, s: 1 });
    });
    return list;
  }

  function targetsForChapter(chn, k) {
    var ch = chn.getAttribute('data-ch');
    var dest = mapCenter();
    var vis = visAt(k, dest.x, dest.y);
    var topics = chapterTopics(ch);
    var items = [];
    for (var i = 0; i < topics.length; i++) {
      items.push({
        el: topics[i],
        home: boxCenter(topics[i]),
        size: nodeBoxSize(topics[i])
      });
    }
    var cir = chn.querySelector('.mp-nb, .mp-nr, circle');
    items.innerR = cir && cir.getAttribute('r') ? +cir.getAttribute('r') : 42;
    var placed = placeOnRing(dest, items, vis, k);
    var list = [];
    var cs = Math.min(1, 1.35 / k);
    if (cs < 0.85) cs = 0.85;
    var chHome = homeCenter(chn);
    list.push({ el: chn, dx: dest.x - chHome.x, dy: dest.y - chHome.y, s: cs });
    for (var j = 0; j < placed.length; j++) {
      var p = placed[j];
      var h = p.home;
      list.push({ el: p.el, dx: p.x - h.x, dy: p.y - h.y, s: p.s });
    }
    Array.prototype.forEach.call(layoutNodes(), function (el) {
      if (el === chn || el.getAttribute('data-ch') === ch) return;
      list.push({ el: el, dx: 0, dy: 0, s: 1 });
    });
    return { list: list, center: dest, k: k };
  }

  function enterChapterRadial(chn, opts) {
    if (!chn) return;
    opts = opts || {};
    var ch = chn.getAttribute('data-ch');
    var n = chapterTopics(ch).length;
    var k = chooseChapterK(n);
    var plan = targetsForChapter(chn, k);
    /* 若环仍超出视野，略为缩小倍率再算一次 */
    var vis = visAt(k, plan.center.x, plan.center.y);
    var overflow = false;
    for (var i = 0; i < plan.list.length; i++) {
      var t = plan.list[i];
      if (t.el.getAttribute('data-ch') !== ch) continue;
      var h = homeCenter(t.el);
      var sz = nodeBoxSize(t.el);
      var x = h.x + t.dx, y = h.y + t.dy;
      var hw = sz.w * t.s / 2, hh = sz.h * t.s / 2;
      if (x - hw < vis.x || x + hw > vis.x + vis.w || y - hh < vis.y || y + hh > vis.y + vis.h) overflow = true;
    }
    if (overflow && k > 1.25) {
      k = Math.max(1.25, k * 0.88);
      plan = targetsForChapter(chn, k);
    }
    radialMode = 'chapter';
    root.classList.remove('mp-radial-topic');
    blurMapFocus();
    radialCh = ch;
    radialViaChapter = true;
    focused = chn;
    setEngaged(true);
    showCard(chn);
    lockDim(chn);
    markNow(chn, null);
    applyRecede(ch);
    hideStarTwigs(ch, true);
    ensureSpokes();
    frameOn(plan.center.x, plan.center.y, plan.k);
    lodHold = true;
    var inst = !!(opts.instant || reduced());
    applyCam(!inst, function () { lodHold = false; });
    animateLayouts(plan.list, { instant: inst }, function () {
      lodHold = false;
      updateSpokes();
    });
  }

  function enterTopicRadial(tn, opts) {
    if (!tn) return;
    opts = opts || {};
    var ch = tn.getAttribute('data-ch');
    var via = radialMode === 'chapter' || radialViaChapter;
    if (via && ch && radialMode !== 'topic') {
      /* 保持章环上的专题位置，只把镜头移到该专题 */
      radialViaChapter = true;
      radialCh = ch;
    } else if (!via) {
      /* 从总览点进专题：专题大致留在原位，镜头聚焦；其它章淡出 */
      radialViaChapter = false;
      radialCh = ch;
    }
    radialMode = 'topic';
    root.classList.add('mp-radial-topic');
    blurMapFocus();
    if (ch) applyRecede(ch, tn.getAttribute('data-slug'));
    if (ch) hideStarTwigs(ch, true);
    updateSpokes();
  }

  function resetRadial(opts) {
    opts = opts || {};
    var inst = !!(opts.instant || reduced());
    var had = radialMode !== 'off';
    radialMode = 'off';
    radialCh = null;
    radialViaChapter = false;
    root.classList.remove('mp-radial-topic');
    hideStarTwigs(null, false);
    blurMapFocus();
    clearRecede();
    clearSpokes();
    if (!had && !opts.force) return;
    animateLayouts(targetsHome(), { instant: inst }, function () {
      clearSpokes();
    });
  }

  function nearestChapter(pt, maxd) {
    var best = null, bd = maxd;
    Array.prototype.forEach.call(svg.querySelectorAll('a.mp-chn'), function (a) {
      var c = currentCenter(a);
      var d = Math.hypot(c.x - pt.x, c.y - pt.y);
      if (d < bd) { bd = d; best = a; }
    });
    return best;
  }


  function updateLOD() {
    if (lodHold) return;
    var kNow = (cam._cur && cam._cur.k) || st.k || 1;
    var V = vb();
    var k = (cam._cur && cam._cur.k) || st.k || 1;
    var tx = cam._cur ? cam._cur.tx : st.tx;
    var ty = cam._cur ? cam._cur.ty : st.ty;
    var mid = { x: (V.x + V.w / 2 - tx) / k, y: (V.y + V.h * 0.40 - ty) / k };

    /* 章环绕态：再放大靠近专题才长出小节；缩小过阈值则退回总览 */
    if (radialMode === 'chapter') {
      if (kNow <= CH_OUT) {
        goBack({ instant: reduced() });
        return;
      }
      if (kNow >= CH_TOPIC_IN) {
        var nearT = nearestTopic(mid, 280 / kNow);
        if (nearT && kidsFor(nearT.getAttribute('data-slug')).length) {
          var slug = nearT.getAttribute('data-slug');
          if (shownSlug === slug && (kidsVisible || kidsPhase === 'opening' || kidsPhase === 'on')) return;
          focused = nearT;
          setEngaged(true);
          showCard(nearT);
          lockDim(nearT);
          markNow(nearT, nearT);
          enterTopicRadial(nearT, { instant: reduced() });
          revealForTopic(nearT, { instant: reduced(), fit: false });
        }
      }
      return;
    }
    if (radialMode === 'topic') {
      var leaveK = radialViaChapter ? CH_TOPIC_OUT : LOD_OUT;
      if (kNow <= leaveK) {
        if (kidsPhase !== 'off' && kidsPhase !== 'closing') retractKids({ instant: reduced() });
        if (radialViaChapter && radialCh) {
          var chn = svg.querySelector('a.mp-chn[data-ch="' + radialCh + '"]');
          if (chn) { enterChapterRadial(chn, { instant: reduced() }); return; }
        }
        resetRadial({ instant: reduced() });
        clearFocusLight();
        return;
      }
      var aT = topicForLod();
      if (aT && kidsFor(aT.getAttribute('data-slug')).length) {
        var slugT = aT.getAttribute('data-slug');
        if (shownSlug === slugT && (kidsVisible || kidsPhase === 'opening' || kidsPhase === 'on')) return;
        revealForTopic(aT, { instant: reduced(), fit: false });
      }
      return;
    }

    if (focused && (focused.classList.contains('mp-chn') || focused.classList.contains('mp-root'))) {
      if (kNow <= LOD_OUT && kidsPhase !== 'off' && kidsPhase !== 'closing') retractKids({ instant: reduced() });
      return;
    }
    if (kNow >= LOD_IN) {
      var a = topicForLod();
      if (a && kidsFor(a.getAttribute('data-slug')).length) {
        var slug = a.getAttribute('data-slug');
        if (shownSlug === slug && (kidsVisible || kidsPhase === 'opening' || kidsPhase === 'on')) return;
        enterTopicRadial(a, { instant: reduced() });
        revealForTopic(a, { instant: reduced(), fit: false });
        return;
      }
    }
    if (kNow >= CH_IN && radialMode === 'off') {
      var chn2 = nearestChapter(mid, 320 / kNow);
      if (chn2) {
        enterChapterRadial(chn2, { instant: reduced() });
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
      if (a.classList.contains('mp-root')) {
        if (kidsVisible || shownSlug) retractKids({ instant: !!opts.instant || reduced() });
        resetRadial({ instant: !!opts.instant || reduced() });
        restore(opts);
        return;
      }
      if (kidsVisible || shownSlug) retractKids({ instant: !!opts.instant || reduced() });
      enterChapterRadial(a, opts);
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
    enterTopicRadial(a, opts);
    var destT = mapCenter();
    var bc = boxCenter(a);
    var tk = 2.15;
    var ts = topicScaleForK(tk);
    animateLayouts([{ el: a, dx: destT.x - bc.x, dy: destT.y - bc.y, s: ts }], opts);
    frameOn(destT.x, destT.y, tk);
    lodHold = true;
    applyCam(!opts.instant && !reduced(), function () {
      lodHold = false;
      if (focused !== a) return;
      revealForTopic(a, { instant: reduced() || opts.instant, fit: false });
    });
  }

  function restore(opts) {
    opts = opts || {};
    lodHold = true;
    var prev = focused;
    focused = null;
    retractKids({ instant: reduced() || !!opts.instant });
    resetRadial({ instant: reduced() || !!opts.instant, force: true });
    st.k = 1; st.tx = 0; st.ty = 0;
    applyCam(!opts.instant, function () { lodHold = false; });
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

  /* 漂浮：每个节点 8.2–13.8 秒一个来回的正弦摆动，幅度约 4.2–5.9 用户单位。不用 d3-force 随机撞击。 */
  var driftTick = null;
  var driftItems = [];
  function stopDrift() {
    if (driftTick) { cancelAnimationFrame(driftTick); driftTick = null; }
  }
  function clearDriftTransforms() {
    Array.prototype.forEach.call(svg.querySelectorAll('a.mp-tn, a.mp-chn, a.mp-root'), function (n) {
      applyNodeTF(n, 0, 0);
    });
  }
  function armDrift() {
    Array.prototype.forEach.call(layoutNodes(), function (el) { ensureLayWrap(el); applyNodeTF(el, 0, 0); });
    stopDrift();
    if (reduced()) {
      root.classList.remove('mp-live');
      root.setAttribute('data-motion', 'reduced');
      clearDriftTransforms();
      return;
    }
    driftItems = [];
    Array.prototype.forEach.call(svg.querySelectorAll('a.mp-tn, a.mp-chn'), function (n, i) {
      var period = 8.2 + (i * 1.13) % 5.6;
      var amp = 4.2 + (i % 4) * 0.55;
      driftItems.push({
        el: n,
        ax: (i % 2 ? 1 : -1) * amp,
        ay: (i % 3 === 0 ? 1 : i % 3 === 1 ? -1 : 0.7) * amp * 0.72,
        p1: period,
        p2: period * 1.18,
        ph: i * 0.73
      });
    });
    root.classList.add('mp-live');
    root.setAttribute('data-motion', 'live');
    (function tick(now) {
      if (reduced()) { driftTick = null; return; }
      var t = now / 1000;
      for (var i = 0; i < driftItems.length; i++) {
        var it = driftItems[i];
        if (layoutAnim) {
          applyNodeTF(it.el, 0, 0);
          continue;
        }
        if (it.el.classList.contains('mp-now')) {
          applyNodeTF(it.el, 0, 0);
          continue;
        }
        var dx = it.ax * Math.sin((t * Math.PI * 2) / it.p1 + it.ph);
        var dy = it.ay * Math.sin((t * Math.PI * 2) / it.p2 + it.ph * 1.15);
        applyNodeTF(it.el, dx, dy);
      }
      driftTick = requestAnimationFrame(tick);
    })(performance.now());
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
    if (radialMode === 'topic' && radialViaChapter && radialCh) {
      var chnB = svg.querySelector('a.mp-chn[data-ch="' + radialCh + '"]');
      retractKids({ instant: reduced() || !!opts.instant });
      if (chnB) {
        enterChapterRadial(chnB, opts);
        if (opts.returnFocus && chnB.focus) { try { chnB.focus({ preventScroll: true }); } catch (e) { chnB.focus(); } }
        return;
      }
    }
    restore(opts);
  }

  /* ---------- 事件 ---------- */
  function modifierClick(e) {
    return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1;
  }

  svg.addEventListener('click', function (e) {
    if ((moved || justDragged) && !nodeAnchor(e.target)) { e.preventDefault(); return; }
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
