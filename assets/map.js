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
    if (!animate || reduced()) { setCam(to.k, to.tx, to.ty); updateLOD(); return; }
    var from = cam._cur || { k: 1, tx: 0, ty: 0 };
    var t0 = performance.now(), dur = 500;
    (function tick(now) {
      var u = Math.min(1, (now - t0) / dur);
      var e = easeInOut(u);
      setCam(from.k + (to.k - from.k) * e, from.tx + (to.tx - from.tx) * e, from.ty + (to.ty - from.ty) * e);
      if (u < 1) camAnim = requestAnimationFrame(tick);
      else { camAnim = null; setCam(to.k, to.tx, to.ty); updateLOD(); }
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
    updateLOD();
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
  var LOD_K = 1.65;
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
    return { x: (V.x + V.w / 2 - st.tx) / st.k, y: (V.y + V.h / 2 - st.ty) / st.k };
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
    var clear = Math.max(pb.width, pb.height) / 2 + 22;
    var rOff = clear + 36;
    function anglesFor(idxs, h, r, boxsrc) {
      var n = idxs.length, angs = [];
      if (n === 1) return [h];
      var need = 0, sum = 0;
      for (var i = 0; i < n; i++) { need += boxsrc[idxs[i]].w + 12; sum += boxsrc[idxs[i]].w; }
      var sp = Math.min(need / Math.max(r, 1), 2.7);
      var acc = 0;
      for (var k = 0; k < n; k++) {
        acc += boxsrc[idxs[k]].w / 2;
        angs.push(h - sp / 2 + sp * (acc / sum));
        acc += boxsrc[idxs[k]].w / 2;
      }
      return angs;
    }
    function layout(h, r) {
      var n = kids.length, idxs = [];
      for (var i = 0; i < n; i++) idxs.push(i);
      var angs = anglesFor(idxs, h, r, boxes);
      var pts = [];
      for (var i2 = 0; i2 < n; i2++) {
        pts.push({
          x: c.x + r * Math.cos(angs[i2]),
          y: c.y + r * Math.sin(angs[i2]),
          a: angs[i2], w: boxes[i2].w, h: boxes[i2].h, f: boxes[i2].f
        });
      }
      return { pts: pts };
    }
    function layout2(h, r, gap) {
      var n = kids.length, n0 = Math.ceil(n / 2);
      var row0 = [], row1 = [];
      for (var i = 0; i < n; i++) (i < n0 ? row0 : row1).push(i);
      var pts = new Array(n);
      function put(idxs, rr) {
        var angs = anglesFor(idxs, h, rr, boxes);
        for (var j = 0; j < idxs.length; j++) {
          var i2 = idxs[j];
          pts[i2] = {
            x: c.x + rr * Math.cos(angs[j]),
            y: c.y + rr * Math.sin(angs[j]),
            a: angs[j], w: boxes[i2].w, h: boxes[i2].h, f: boxes[i2].f
          };
        }
      }
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
    return g;
  }

  function setKidsVisible(on) {
    root.classList.toggle('mp-kids-on', !!on);
    var g = cam.querySelector('.mp-subs');
    if (!g) return;
    var nodes = g.querySelectorAll('a.mp-sub');
    Array.prototype.forEach.call(nodes, function (n) {
      n.setAttribute('tabindex', on ? '0' : '-1');
      if (on) n.classList.add('mp-in');
      else n.classList.remove('mp-in');
    });
    if (reduced()) {
      /* 无动画，直接显隐 */
    }
  }

  function hideKids() {
    setKidsVisible(false);
    var g = cam.querySelector('.mp-subs');
    if (g) {
      /* 保留节点直到下次放置，避免切走时闪断；下次 placeKids 会替换 */
      if (!focused || !focused.classList.contains('mp-sub')) {
        /* keep until replaced */
      }
    }
    if (!focused || (!focused.classList.contains('mp-tn') && !focused.classList.contains('mp-sub'))) {
      if (g && g.parentNode) g.parentNode.removeChild(g);
      shownSlug = null;
    }
  }

  function unionBox(el) {
    var b = el.getBBox();
    var g = cam.querySelector('.mp-subs');
    if (!g || !root.classList.contains('mp-kids-on')) return b;
    var gb = g.getBBox();
    var x = Math.min(b.x, gb.x), y = Math.min(b.y, gb.y);
    var r = Math.max(b.x + b.width, gb.x + gb.width), bo = Math.max(b.y + b.height, gb.y + gb.height);
    return { x: x, y: y, width: r - x, height: bo - y };
  }

  function revealForTopic(a, opts) {
    opts = opts || {};
    if (!a || !a.classList.contains('mp-tn')) return;
    var slug = a.getAttribute('data-slug');
    if (shownSlug !== slug) placeKids(a);
    setKidsVisible(true);
  }

  function nearestTopic(pt, maxd) {
    var best = null, bd = maxd;
    Array.prototype.forEach.call(svg.querySelectorAll('a.mp-tn'), function (a) {
      var c = topicCenter(a);
      var d = Math.hypot(c.x - pt.x, c.y - pt.y);
      if (d < bd) { bd = d; best = a; }
    });
    return best;
  }

  function updateLOD() {
    if (focused && (focused.classList.contains('mp-tn') || focused.classList.contains('mp-sub'))) return;
    if (st.k >= LOD_K) {
      var a = nearestTopic(viewCenterUser(), 160);
      if (a && kidsFor(a.getAttribute('data-slug')).length) {
        revealForTopic(a);
        return;
      }
    }
    hideKids();
  }

  /* 聚焦：把节点放到图板偏上的中央，为下方说明卡留空，缩放限制在 1.8–3.2 */
  function focusNode(a, opts) {
    if (!a) return;
    opts = opts || {};
    var topic = a.classList.contains('mp-sub')
      ? svg.querySelector('a.mp-tn[data-slug="' + a.getAttribute('data-slug') + '"]')
      : (a.classList.contains('mp-tn') ? a : null);
    if (topic) revealForTopic(topic);
    else hideKids();
    if (topic && a.classList.contains('mp-tn')) setKidsVisible(true);
    var box = (topic && a.classList.contains('mp-tn')) ? unionBox(a) : a.getBBox();
    var V = vb();
    var padW = box.width + 48, padH = box.height + 48;
    var k = Math.min(V.w / padW, (V.h * 0.70) / padH, a.classList.contains('mp-sub') ? 3.4 : 2.8);
    k = clampK(Math.max(k, a.classList.contains('mp-sub') ? 1.9 : 1.55));
    var cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    st.k = k;
    st.tx = V.w * 0.50 - k * cx;
    st.ty = V.h * 0.40 - k * cy;
    focused = a;
    setEngaged(true);
    showCard(a);
    lockDim(topic || a);
    Array.prototype.forEach.call(svg.querySelectorAll('a.mp-now'), function (n) { n.classList.remove('mp-now'); });
    a.classList.add('mp-now');
    if (topic) topic.classList.add('mp-now');
    applyCam(!opts.instant);
  }

  function restore(opts) {
    opts = opts || {};
    st.k = 1; st.tx = 0; st.ty = 0;
    applyCam(!opts.instant);
    Array.prototype.forEach.call(svg.querySelectorAll('a.mp-now'), function (n) { n.classList.remove('mp-now'); });
    var prev = focused;
    focused = null;
    hideKids();
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
    if (nodeAnchor(e.target)) { lastP = { x: e.clientX, y: e.clientY }; moved = false; return; }
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
