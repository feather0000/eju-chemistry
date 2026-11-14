/* EJU 互动演示（原生 JS + canvas；进入视口才初始化，离开视口暂停） */
(function () {
  'use strict';
  var P = window.SCI, RM = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var COL = {}, ALL = [], REG = {};
  function readCols() {
    var cs = getComputedStyle(document.documentElement);
    ['ink', 'ink-2', 'ink-3', 'line', 'surface', 'surface-2', 'accent', 'accent-soft', 'warn', 'good', 'c1', 'c2', 'c3', 'c4', 'bg'].forEach(function (k) {
      COL[k] = cs.getPropertyValue('--' + k).trim() || '#888';
    });
    COL.dark = document.documentElement.getAttribute('data-theme') === 'dark';
  }
  function fx(v, d) { if (!isFinite(v)) return '∞'; d = d == null ? 2 : d; var s = Math.abs(v) < 1e-9 ? (0).toFixed(d) : v.toFixed(d); return s.replace('-', '−'); }
  function sci(v, d) { if (v === 0) return '0'; var e = Math.floor(Math.log10(Math.abs(v))), m = v / Math.pow(10, e); return fx(m, d == null ? 2 : d) + '×10<sup>' + String(e).replace('-', '−') + '</sup>'; }
  function h(tag, attrs, parent, text) { var e = document.createElement(tag); for (var k in attrs || {}) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; }

  function Demo(root, spec) {
    var d = this; d.root = root; d.spec = spec; d.handles = []; d.playing = false; d.visible = false; d.t = 0;
    root.classList.add('demo-on');
    var stage = h('div', { 'class': 'demo-stage' }, root);
    d.cv = h('canvas', { role: 'img', 'aria-label': root.getAttribute('data-title') || '互动演示' }, stage);
    d.ctx = d.cv.getContext('2d');
    d.ctl = h('div', { 'class': 'demo-ctl' }, root);
    d.outEl = h('div', { 'class': 'demo-out', 'aria-live': 'polite' }, root);
    d.aspect = spec.aspect || 1.6; /* 可为函数 aspect(宽度px)：窄屏可取更高的画面 */
    d.resize = function () {
      var w = stage.clientWidth || 300, asp = typeof d.aspect === 'function' ? d.aspect(w) : d.aspect, hgt = Math.min(Math.round(w / asp), spec.maxH || 520);
      var r = Math.min(window.devicePixelRatio || 1, 2);
      d.W = w; d.H = hgt; d.cv.width = Math.round(w * r); d.cv.height = Math.round(hgt * r);
      d.cv.style.height = hgt + 'px'; d.ctx.setTransform(r, 0, 0, r, 0, 0);
      if (spec.resize) spec.resize(d);
      d.draw();
    };
    d.draw = function () { var c = d.ctx; c.clearRect(0, 0, d.W, d.H); c.save(); spec.draw(d, c); c.restore(); d.drawHandles(c); };
    var raf = 0, last = 0;
    function frame(ts) {
      raf = 0; var dt = last ? Math.min((ts - last) / 1000, 0.05) : 0; last = ts;
      if (spec.step && dt > 0) spec.step(d, dt);
      d.draw();
      if (d.playing && d.visible) raf = requestAnimationFrame(frame); else last = 0;
    }
    d.kick = function () { if (!raf && d.playing && d.visible) { last = 0; raf = requestAnimationFrame(frame); } };
    d.redraw = function () { if (!raf) { raf = requestAnimationFrame(function (ts) { raf = 0; d.draw(); d.kick(); }); } };
    d.setVisible = function (v) { d.visible = v; if (v) d.kick(); };
    d.play = function (on) { d.playing = on; if (d.playBtn) { d.playBtn.textContent = on ? '暂停' : '播放'; d.playBtn.setAttribute('aria-pressed', on); } if (on) d.kick(); else d.redraw(); };
    /* —— 控件 —— */
    d.slider = function (label, min, max, step, val, fmt, on) {
      var w = h('label', { 'class': 'demo-sl' }, d.ctl), sp = h('span', null, w), inp = h('input', { type: 'range', min: min, max: max, step: step, value: val }, w);
      var o = { v: +val, el: inp, set: function (x) { o.v = +x; inp.value = x; sp.innerHTML = label + '　<b>' + fmt(o.v) + '</b>'; } };
      o.set(val);
      inp.addEventListener('input', function () { o.set(inp.value); if (on) on(o.v); d.redraw(); });
      return o;
    };
    d.seg = function (label, opts, val, on) {
      var w = h('div', { 'class': 'demo-seg', role: 'group', 'aria-label': label }, d.ctl); h('span', null, w, label);
      var o = { v: val, btns: [] };
      opts.forEach(function (op) {
        var b = h('button', { type: 'button', 'aria-pressed': op[0] === val }, w, op[1]);
        b.addEventListener('click', function () { o.v = op[0]; o.btns.forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); if (on) on(o.v); d.redraw(); });
        o.btns.push(b);
      });
      o.set = function (v) { o.v = v; o.btns.forEach(function (x, i) { x.setAttribute('aria-pressed', opts[i][0] === v); }); };
      return o;
    };
    d.button = function (label, on) { if (!d.row) d.row = h('div', { 'class': 'demo-row' }, d.ctl); var b = h('button', { type: 'button', 'class': 'demo-btn' }, d.row, label); b.addEventListener('click', function () { on(); d.redraw(); }); return b; };
    d.playToggle = function () { d.playBtn = d.button('播放', function () { d.play(!d.playing); }); d.playBtn.setAttribute('aria-pressed', 'false'); };
    d.out = function (rows, note) {
      var s = '<dl>' + rows.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('') + '</dl>';
      if (note) s += '<p>' + note + '</p>';
      if (s !== d._lastOut) { d.outEl.innerHTML = s; d._lastOut = s; }
    };
    /* —— 可拖动把手（显示 r≈9px，触控命中半径 24px ⇒ 48px 目标） —— */
    d.handle = function (o) { o.r = o.r || 9; d.handles.push(o); return o; };
    /* —— 可抓取物体：抓住拖动、松手按平滑后的手势速度抛出 ——
       o = { get()→[x,y] 物体中心, r 物体半径 px（数或函数）, set(x,y) 新中心（已扣除抓取点偏移）,
             start(x,y) 抓起, release(vx,vy) 松手（px/s；手指停住后松手 ⇒ 0）, hidden(), autoplay: false 可关闭“抓起即播放” }
       命中：距中心 ≤ max(24, r+10) px；物体由 demo 自己画（框架不画把手圆点） */
    d.grab = function (o) { o.body = true; o.r = o.r || 12; d.handles.push(o); return o; };
    function rad(o) { return typeof o.r === 'function' ? o.r() : o.r; }
    d.drawHandles = function (c) {
      d.handles.forEach(function (o) {
        if (o.body || (o.hidden && o.hidden())) return;
        var p = o.get(); c.save(); c.beginPath(); c.arc(p[0], p[1], o.r + 6, 0, 7); c.fillStyle = COL.dark ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.07)'; c.fill();
        c.beginPath(); c.arc(p[0], p[1], o.r, 0, 7); c.fillStyle = o.color ? o.color() : COL.accent; c.fill();
        c.lineWidth = 2; c.strokeStyle = COL.surface; c.stroke(); c.restore();
      });
    };
    function pos(e) { var b = d.cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }
    function hit(p) { /* 物体按“到边缘的距离”比较，大物体内部优先于附近的小把手 */
      var best = null, bs = Infinity;
      d.handles.forEach(function (o) {
        if (o.hidden && o.hidden()) return;
        var q = o.get(), dd = Math.hypot(q[0] - p[0], q[1] - p[1]), rr = o.body ? rad(o) : 0;
        if (dd <= Math.max(24, rr + 10) && dd - rr < bs) { bs = dd - rr; best = o; }
      });
      return best;
    }
    var drag = null, pid = null, off = [0, 0], samp = [];
    function now() { return window.performance ? performance.now() : Date.now(); }
    function vel() { /* 最近 ~100 ms 的平均速度；手指停住 >80 ms 视为 0 */
      var n = samp.length, l = samp[n - 1], j = n - 1;
      if (n < 2 || now() - l[0] > 80) return [0, 0];
      while (j > 0 && l[0] - samp[j - 1][0] <= 100) j--;
      if (j === n - 1) j--;
      var dt = (l[0] - samp[j][0]) / 1000;
      return dt > 0.004 ? [(l[1] - samp[j][1]) / dt, (l[2] - samp[j][2]) / dt] : [0, 0];
    }
    function sample(p) { var t = now(); samp.push([t, p[0], p[1]]); while (samp.length > 2 && t - samp[0][0] > 160) samp.shift(); }
    d.cv.addEventListener('touchstart', function (e) { var t = e.touches[0], b = d.cv.getBoundingClientRect(); if (drag || hit([t.clientX - b.left, t.clientY - b.top])) e.preventDefault(); }, { passive: false });
    d.cv.addEventListener('pointerdown', function (e) {
      if (drag) return; var p = pos(e), o = hit(p); if (!o) return;
      drag = o; pid = e.pointerId; d.cv.setPointerCapture(e.pointerId); e.preventDefault(); d.cv.classList.add('grabbing');
      if (o.body) {
        var q = o.get(); off = [p[0] - q[0], p[1] - q[1]]; samp = []; sample(p); d.grabbed = true;
        if (o.start) o.start(q[0], q[1]);
        if (d.playBtn && o.autoplay !== false) d.play(true);
      } else if (o.start) o.start();
    });
    d.cv.addEventListener('pointermove', function (e) {
      var p = pos(e);
      if (drag) { if (e.pointerId !== pid) return; if (drag.body) { sample(p); drag.set(p[0] - off[0], p[1] - off[1]); } else drag.set(p[0], p[1]); d.redraw(); return; }
      if (e.pointerType === 'mouse') d.cv.classList.toggle('grab', !!hit(p));
    });
    function up(e) {
      if (drag && e && e.pointerId !== pid) return;
      if (drag && drag.body && drag.release) { var v = e && e.type === 'pointerup' ? vel() : [0, 0]; drag.release(v[0], v[1]); }
      if (drag && drag.end) drag.end();
      drag = null; pid = null; d.cv.classList.remove('grabbing'); d.redraw();
    }
    d.cv.addEventListener('pointerup', up); d.cv.addEventListener('pointercancel', up);
    d.dragging = function (o) { return o ? drag === o : !!drag; };
    d.grabVel = function () { return drag && drag.body ? vel() : [0, 0]; }; /* 拖动中的平滑手势速度 px/s */
    spec.init(d);
    if (spec.animated) { d.playToggle(); d.playing = !RM.matches; d.play(d.playing); }
    if (window.ResizeObserver) new ResizeObserver(function () { if (stage.clientWidth !== d.W) d.resize(); }).observe(stage);
    d.resize();
  }
  /* —— 绘图工具 —— */
  function arrow(c, x1, y1, x2, y2, col, w, label, lpos) {
    var L = Math.hypot(x2 - x1, y2 - y1); c.save(); c.strokeStyle = c.fillStyle = col; c.lineWidth = w || 2.5;
    if (L > 1) {
      var a = Math.atan2(y2 - y1, x2 - x1), hd = Math.min(10, L * 0.45);
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2 - Math.cos(a) * hd * 0.6, y2 - Math.sin(a) * hd * 0.6); c.stroke();
      c.beginPath(); c.moveTo(x2, y2); c.lineTo(x2 - hd * Math.cos(a - 0.4), y2 - hd * Math.sin(a - 0.4)); c.lineTo(x2 - hd * Math.cos(a + 0.4), y2 - hd * Math.sin(a + 0.4)); c.closePath(); c.fill();
    }
    if (label) { c.font = '600 13px system-ui,"PingFang SC","Hiragino Sans","Noto Sans CJK SC","Noto Serif CJK SC",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; var lp = lpos || 14, ang = Math.atan2(y2 - y1, x2 - x1);
      txt(c, label, x2 + Math.cos(ang) * lp, y2 + Math.sin(ang) * lp, col); }
    c.restore();
  }
  function txt(c, s, x, y, col, font, align, base) {
    c.save(); c.font = font || '13px system-ui,"PingFang SC","Noto Sans CJK SC","Noto Serif CJK SC",sans-serif'; c.textAlign = align || 'center'; c.textBaseline = base || 'middle';
    c.lineWidth = 3; c.strokeStyle = COL.surface; c.lineJoin = 'round'; c.strokeText(s, x, y); c.fillStyle = col || COL.ink; c.fillText(s, x, y); c.restore();
  }
  function line(c, pts, col, w, dash) { c.save(); c.strokeStyle = col; c.lineWidth = w || 1.5; if (dash) c.setLineDash(dash); c.beginPath(); pts.forEach(function (p, i) { i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); }); c.stroke(); c.restore(); }
  function dot(c, x, y, r, col) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = col; c.fill(); }
  /* 线性映射：世界坐标 → 屏幕 */
  function Map(x0, x1, y0, y1, L, R, T, B) {
    var m = { x0: x0, x1: x1, y0: y0, y1: y1, L: L, R: R, T: T, B: B };
    m.X = function (x) { return m.L + (x - m.x0) / (m.x1 - m.x0) * (m.R - m.L); };
    m.Y = function (y) { return m.B - (y - m.y0) / (m.y1 - m.y0) * (m.B - m.T); };
    m.ix = function (X) { return m.x0 + (X - m.L) / (m.R - m.L) * (m.x1 - m.x0); };
    m.iy = function (Y) { return m.y0 + (m.B - Y) / (m.B - m.T) * (m.y1 - m.y0); };
    m.dx = function (px) { return px * (m.x1 - m.x0) / (m.R - m.L); };   /* 屏幕位移/速度 → 世界 */
    m.dy = function (py) { return -py * (m.y1 - m.y0) / (m.B - m.T); };
    return m;
  }
  function axes(c, m, xl, yl, xt, yt) {
    c.save(); c.strokeStyle = COL.line; c.lineWidth = 1; c.font = '11px system-ui,"PingFang SC","Hiragino Sans","Noto Sans CJK SC","Noto Serif CJK SC",sans-serif'; c.fillStyle = COL['ink-3'];
    if (xt) for (var x = Math.ceil(m.x0 / xt) * xt; x <= m.x1 + 1e-9; x += xt) { c.beginPath(); c.moveTo(m.X(x), m.T); c.lineTo(m.X(x), m.B); c.stroke(); c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(+x.toFixed(6), m.X(x), m.B + 3); }
    if (yt) for (var y = Math.ceil(m.y0 / yt) * yt; y <= m.y1 + 1e-9; y += yt) { c.beginPath(); c.moveTo(m.L, m.Y(y)); c.lineTo(m.R, m.Y(y)); c.stroke(); c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(+y.toFixed(6), m.L - 4, m.Y(y)); }
    c.strokeStyle = COL['ink-3']; c.lineWidth = 1.5; var zy = Math.max(m.T, Math.min(m.B, m.Y(0))), zx = Math.max(m.L, Math.min(m.R, m.X(0)));
    c.beginPath(); c.moveTo(m.L, zy); c.lineTo(m.R, zy); c.moveTo(zx, m.T); c.lineTo(zx, m.B); c.stroke(); c.restore();
    if (xl) txt(c, xl, m.R - 4, zy - 10, COL['ink-2'], null, 'right');
    if (yl) txt(c, yl, zx + 6, m.T + 8, COL['ink-2'], null, 'left');
  }
  function bars(c, x, y, w, hgt, items, max, title) { /* 竖直柱状图 items=[[label,val,col]] */
    var n = items.length, bw = w / n; txt(c, title || '', x + w / 2, y - 10, COL['ink-2'], '600 12px system-ui,"PingFang SC","Hiragino Sans","Noto Sans CJK SC","Noto Serif CJK SC",sans-serif');
    line(c, [[x, y + hgt], [x + w, y + hgt]], COL['ink-3'], 1);
    items.forEach(function (it, i) {
      var v = it[1], bh = Math.min(Math.abs(v) / (max || 1), 1.05) * hgt * (v < 0 ? 0 : 1);
      c.fillStyle = it[2]; c.fillRect(x + i * bw + bw * 0.18, y + hgt - bh, bw * 0.64, bh);
      txt(c, it[0], x + i * bw + bw / 2, y + hgt + 11, COL['ink-2'], '12px system-ui,"PingFang SC","Hiragino Sans","Noto Sans CJK SC","Noto Serif CJK SC",sans-serif');
    });
  }
  /* —— 真实化外观（可复用；全部只用 canvas 2D，无外部资源） —— */
  var FONT = 'system-ui,"PingFang SC","Hiragino Sans","Noto Sans CJK SC","Noto Serif CJK SC",sans-serif', RGB = {};
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rgb(col) {
    if (RGB[col]) return RGB[col];
    var m, r = [136, 136, 136];
    if ((m = /^#([0-9a-f]{3,8})$/i.exec(col))) { var s = m[1]; if (s.length < 6) s = s.replace(/./g, '$&$&'); r = [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]; }
    else if ((m = /rgba?\(([^)]+)\)/.exec(col))) r = m[1].split(/[ ,\/]+/).filter(Boolean).slice(0, 3).map(parseFloat);
    return (RGB[col] = r);
  }
  function shade(col, k) { var t = k < 0 ? 0 : 255, a = Math.min(Math.abs(k), 1); return 'rgb(' + rgb(col).map(function (v) { return Math.round(v + (t - v) * a); }).join(',') + ')'; } /* k>0 提亮，k<0 压暗 */
  function alpha(col, a) { return 'rgba(' + rgb(col).join(',') + ',' + a + ')'; }
  function mix(c1, c2, f) { var a = rgb(c1), b = rgb(c2); f = clamp(f, 0, 1); return 'rgb(' + a.map(function (v, i) { return Math.round(v + (b[i] - v) * f); }).join(',') + ')'; } /* 两色线性插值 */
  function rrect(c, x, y, w, hgt, r) { r = Math.min(r, w / 2, hgt / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + hgt, r); c.arcTo(x + w, y + hgt, x, y + hgt, r); c.arcTo(x, y + hgt, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  /* 柔和接触阴影（椭圆径向渐变） */
  function shadow(c, x, y, rx, ry, a) {
    if (!(rx > 0.5)) return; c.save(); c.translate(x, y); c.scale(1, Math.max(ry, 0.5) / rx);
    var g = c.createRadialGradient(0, 0, 0, 0, 0, rx), k = Math.min(0.6, (a == null ? 0.28 : a) * (COL.dark ? 1.6 : 1));
    g.addColorStop(0, 'rgba(0,0,0,' + k + ')'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, 7); c.fill(); c.restore();
  }
  /* 立体小球（分子、原子）：o = { label, alpha, flat 残影用的平面圆, shadowY 地面 y（画投影） } */
  function drawBall(c, x, y, r, col, o) {
    o = o || {}; c.save(); if (o.alpha != null) c.globalAlpha *= o.alpha;
    if (o.shadowY != null) shadow(c, x, o.shadowY, r * 1.05, r * 0.3, 0.32);
    c.beginPath(); c.arc(x, y, r, 0, 7);
    if (o.flat) { c.fillStyle = col; c.fill(); c.restore(); return; }
    var g = c.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.08, x, y, r * 1.02);
    g.addColorStop(0, shade(col, 0.6)); g.addColorStop(0.4, col); g.addColorStop(1, shade(col, -0.5)); c.fillStyle = g; c.fill();
    c.beginPath(); c.arc(x, y, r - 0.5, 0, 7); c.lineWidth = 1; c.strokeStyle = shade(col, -0.6); c.stroke();
    c.beginPath(); c.ellipse(x - r * 0.36, y - r * 0.44, r * 0.26, r * 0.16, -0.6, 0, 7); c.fillStyle = 'rgba(255,255,255,.55)'; c.fill();
    if (o.label) label(c, o.label, x, y + 0.5, r);
    c.restore();
  }
  function label(c, s, x, y, r) { c.font = '600 ' + Math.round(clamp(r * 0.8, 10, 14)) + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round'; c.lineWidth = 2.5; c.strokeStyle = 'rgba(0,0,0,.45)'; c.strokeText(s, x, y); c.fillStyle = '#fff'; c.fillText(s, x, y); }
  /* 木纹：离屏画一块可无缝平铺的纹理，按主题缓存，作为 pattern 使用（每帧零额外绘制成本） */
  var WOOD = {};
  function woodTile(tone) {
    var key = (COL.dark ? 'd' : 'l') + tone; if (WOOD[key]) return WOOD[key];
    var S = 2, w = 160, hh = 64, cv = document.createElement('canvas'); cv.width = w * S; cv.height = hh * S;
    var g = cv.getContext('2d'), base = COL.dark ? [112, 82, 54] : [216, 176, 124], seed = 11 + tone * 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    g.scale(S, S); g.fillStyle = 'rgb(' + base.map(function (v) { return Math.round(v * (1 - tone * 0.18)); }).join(',') + ')'; g.fillRect(0, 0, w, hh);
    for (var i = 0; i < 26; i++) {
      var y0 = rnd() * hh, amp = 0.6 + rnd() * 2.4, k = 1 + (i % 3), ph = rnd() * 6.283;
      g.strokeStyle = (COL.dark ? 'rgba(28,16,6,' : 'rgba(110,64,26,') + (0.07 + rnd() * 0.2).toFixed(3) + ')'; g.lineWidth = 0.5 + rnd() * 1.3;
      for (var dy = -hh; dy <= hh; dy += hh) { g.beginPath(); for (var x = 0; x <= w; x += 4) { var yy = y0 + dy + amp * Math.sin(x / w * 6.2832 * k + ph); x ? g.lineTo(x, yy) : g.moveTo(x, yy); } g.stroke(); }
    }
    return (WOOD[key] = { cv: cv, S: S, key: key });
  }
  function woodPattern(c, tone) { /* 返回可作 fillStyle 的木纹；tone 0 浅色木、1 深色木 */
    var t = woodTile(tone || 0), pc = c.__wood || (c.__wood = {}), p = pc[t.key];
    if (!p) { p = pc[t.key] = c.createPattern(t.cv, 'repeat'); if (p.setTransform && window.DOMMatrix) p.setTransform(new DOMMatrix().scale(1 / t.S)); }
    return p;
  }
  function wood(c, x, y, w, hgt, o) { /* 木纹矩形（带明暗与描边）；o = { tone, stroke: false } */
    o = o || {}; c.save(); c.fillStyle = woodPattern(c, o.tone); c.fillRect(x, y, w, hgt);
    var g = c.createLinearGradient(0, y, 0, y + hgt); g.addColorStop(0, 'rgba(255,255,255,.18)'); g.addColorStop(1, 'rgba(0,0,0,.16)'); c.fillStyle = g; c.fillRect(x, y, w, hgt);
    if (o.stroke !== false) { c.lineWidth = 1; c.strokeStyle = COL.dark ? 'rgba(0,0,0,.6)' : 'rgba(80,50,20,.55)'; c.strokeRect(x + 0.5, y + 0.5, w - 1, hgt - 1); }
    c.restore();
  }
  /* 物块：中心 (x,y)，o = { angle 旋转(rad), label, wood: true 木块 / false 金属块, alpha } */
  function drawBlock(c, x, y, w, hgt, col, o) {
    o = o || {}; c.save(); c.translate(x, y); if (o.angle) c.rotate(o.angle); if (o.alpha != null) c.globalAlpha *= o.alpha;
    shadow(c, 0, hgt / 2 + 1, w * 0.6, 3, 0.4);
    if (o.wood !== false) wood(c, -w / 2, -hgt / 2, w, hgt, { tone: o.tone == null ? 1 : o.tone });
    else { var g = c.createLinearGradient(0, -hgt / 2, 0, hgt / 2); g.addColorStop(0, shade(col, 0.35)); g.addColorStop(1, shade(col, -0.35)); c.fillStyle = g; c.fillRect(-w / 2, -hgt / 2, w, hgt); c.strokeStyle = shade(col, -0.55); c.strokeRect(-w / 2 + 0.5, -hgt / 2 + 0.5, w - 1, hgt - 1); }
    if (col && o.wood !== false) { c.fillStyle = col; c.fillRect(-w / 2 + 1, -hgt / 2 + 1, w - 2, 3); } /* 色条：区分是哪一个物体 */
    if (o.label) label(c, o.label, 0, 1, Math.min(w, hgt) * 0.55);
    c.restore();
  }
  /* 轨迹残影缓冲：push(时间, a, b) 至少间隔 gap 记一个点，最多 n 个；时间倒退自动清空。
     each(fn(a, b, f 新旧程度 0→1, t)) 由 demo 决定怎么画。prefers-reduced-motion 下仍保留：它是静态信息 */
  function Trail(n, gap) {
    var t = { pts: [], n: n || 12, gap: gap || 0, last: -Infinity };
    t.push = function (time, a, b) { if (time < t.last - 1e-9) t.clear(); if (time - t.last < t.gap) return; t.last = time; t.pts.push([a, b, time]); if (t.pts.length > t.n) t.pts.shift(); };
    t.clear = function () { t.pts.length = 0; t.last = -Infinity; };
    t.each = function (fn) { var k = t.pts.length; t.pts.forEach(function (p, i) { fn(p[0], p[1], (i + 1) / (k + 1), p[2]); }); };
    return t;
  }
  /* 平滑过渡：指数逼近目标（时间常数 tau 秒）；减少动态效果时直接跳到目标 */
  function approach(cur, tgt, dt, tau) { return RM.matches || !(tau > 0) ? tgt : tgt + (cur - tgt) * Math.exp(-dt / tau); }
  function hint(c, s, x, y, align) { txt(c, s, x, y, COL['ink-3'], '12px ' + FONT, align || 'left'); }
  /* 柔光：径向渐变光晕（加热板、电极反应处） */
  function glow(c, x, y, r, col, a) {
    if (!(r > 0.5)) return; var g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, alpha(col, a == null ? 0.6 : a)); g.addColorStop(1, alpha(col, 0));
    c.save(); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.restore();
  }
  /* 离屏缓存小图（按主题、像素比缓存）：大量相同的分子用 drawImage 画，免去每帧逐个做渐变 */
  var SPR = {}, nSPR = 0;
  function sprite(key, w, hgt, fn) {
    var S = Math.min(window.devicePixelRatio || 1, 2), k = key + '|' + (COL.dark ? 'd' : 'l') + w + 'x' + hgt + '@' + S;
    if (SPR[k]) return SPR[k]; if (++nSPR > 300) { SPR = {}; nSPR = 1; }
    var cv = document.createElement('canvas'); cv.width = Math.ceil(w * S); cv.height = Math.ceil(hgt * S); var g = cv.getContext('2d'); g.scale(S, S); fn(g, w, hgt); return (SPR[k] = cv);
  }
  function ballSprite(r, col) { var s = Math.ceil(2 * r + 2); return sprite('ball' + col + r, s, s, function (g) { drawBall(g, s / 2, s / 2, r, col); }); } /* 立体小球的缓存图，边长 ⌈2r+2⌉ px */
  function blit(c, img, x, y, w, hgt) { c.drawImage(img, x - w / 2, y - hgt / 2, w, hgt); } /* 以 (x,y) 为中心画缓存图，w×hgt 为显示尺寸（CSS px） */
  /* 导线：铜色、带高光；o = { w 线宽, col } */
  function wire(c, pts, o) {
    o = o || {}; var w = o.w || 2; c.save(); c.lineJoin = 'round'; c.lineCap = 'round'; c.beginPath(); pts.forEach(function (p, i) { i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); });
    c.strokeStyle = o.col || (COL.dark ? '#c08a55' : '#8a5a2b'); c.lineWidth = w + 1; c.stroke();
    c.strokeStyle = COL.dark ? 'rgba(255,225,190,.4)' : 'rgba(255,228,196,.75)'; c.lineWidth = Math.max(0.7, w * 0.35); c.stroke(); c.restore();
  }
  /* 指针式仪表（电流表、压力计）：中心 (x,y)、半径 r；frac = 读数 / 满偏（截在 −0.02–1.04）；o = { label 'A' / 'p', max 满偏标注, text 表下读数 } */
  function drawMeter(c, x, y, r, frac, o) {
    o = o || {}; c.save(); shadow(c, x, y + r + 1, r * 0.9, 3, 0.3);
    var g = c.createLinearGradient(0, y - r, 0, y + r); g.addColorStop(0, '#6b717c'); g.addColorStop(1, '#2b2e35');
    c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = g; c.fill();
    c.beginPath(); c.arc(x, y, r * 0.84, 0, 7); c.fillStyle = COL.dark ? '#e2dfd6' : '#fbfaf4'; c.fill();
    var px = x, py = y + r * 0.38, R = r * 0.92, a0 = -Math.PI * 0.8, a1 = -Math.PI * 0.2, i, a;
    c.strokeStyle = '#3a3e46'; c.lineWidth = 1; c.beginPath(); c.arc(px, py, R * 0.86, a0, a1);
    for (i = 0; i <= 10; i++) { a = a0 + (a1 - a0) * i / 10; var k = i % 5 ? 0.78 : 0.7; c.moveTo(px + Math.cos(a) * R * 0.86, py + Math.sin(a) * R * 0.86); c.lineTo(px + Math.cos(a) * R * k, py + Math.sin(a) * R * k); }
    c.stroke();
    if (r >= 17 && o.max != null) { c.fillStyle = '#3a3e46'; c.font = Math.round(r * 0.24) + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('0', px + Math.cos(a0) * R * 0.52, py + Math.sin(a0) * R * 0.52 + 2); c.fillText(String(o.max), px + Math.cos(a1) * R * 0.5, py + Math.sin(a1) * R * 0.5 + 2); }
    if (o.label) { c.fillStyle = '#3a3e46'; c.font = '700 ' + Math.round(r * 0.34) + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(o.label, x, y + r * 0.6); }
    a = a0 + (a1 - a0) * clamp(isFinite(frac) ? frac : 1.04, -0.02, 1.04);
    c.strokeStyle = '#c0392b'; c.lineWidth = 1.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(px, py); c.lineTo(px + Math.cos(a) * R * 0.9, py + Math.sin(a) * R * 0.9); c.stroke();
    c.beginPath(); c.arc(px, py, Math.max(1.8, r * 0.09), 0, 7); c.fillStyle = '#2b2e35'; c.fill(); c.restore();
    if (o.text) txt(c, o.text, x, y + r + 10, COL['ink-2'], '600 12px ' + FONT);
  }
  /* —— 化学实验器材（多个 demo 共用） —— */
  function GLS() { return COL.dark ? { fill: 'rgba(170,200,235,.10)', edge: 'rgba(200,220,240,.78)', hl: 'rgba(255,255,255,.30)' } : { fill: 'rgba(190,220,245,.32)', edge: 'rgba(64,92,124,.78)', hl: 'rgba(255,255,255,.9)' }; }
  /* 玻璃器皿：path(c) 建立外形路径（可不闭合，开口处不描边）。
     o = { liquid: { y 液面, col, x0, x1 液面左右端（有 wave 时必填）, wave 波幅 px, ph 相位 }, hl: [[x0,y0,x1,y1], …] 高光线, lw 描边宽 } */
  function glass(c, path, o) {
    o = o || {}; var g = GLS(), lq = o.liquid; c.save();
    path(c); c.fillStyle = g.fill; c.fill();
    if (lq && lq.col) {
      c.save(); path(c); c.clip();
      var y = lq.y, wv = lq.wave || 0, x0 = lq.x0 == null ? -1e4 : lq.x0, x1 = lq.x1 == null ? 1e4 : lq.x1, x, sx = Math.max(4, (x1 - x0) / 24);
      var surf = function () { c.moveTo(x0, y); if (wv && x1 - x0 < 2e3) for (x = x0 + sx; x < x1; x += sx) c.lineTo(x, y + wv * Math.sin(x * 0.09 + (lq.ph || 0))); c.lineTo(x1, y); };
      c.beginPath(); surf(); c.lineTo(x1, 1e4); c.lineTo(x0, 1e4); c.closePath(); c.fillStyle = lq.col; c.fill();
      var dg = c.createLinearGradient(0, y, 0, y + 80); dg.addColorStop(0, 'rgba(255,255,255,.16)'); dg.addColorStop(1, 'rgba(0,0,0,.07)'); c.fillStyle = dg; c.fill();
      c.beginPath(); surf(); c.lineWidth = 1.5; c.strokeStyle = alpha(shade(lq.col, 0.35), 0.9); c.stroke(); /* 液面（弯月面）高光 */
      c.restore();
    }
    if (o.hl) { c.strokeStyle = g.hl; c.lineWidth = 2; c.lineCap = 'round'; c.beginPath(); o.hl.forEach(function (s) { c.moveTo(s[0], s[1]); c.lineTo(s[2], s[3]); }); c.stroke(); }
    path(c); c.lineWidth = o.lw || 1.6; c.lineJoin = 'round'; c.strokeStyle = g.edge; c.stroke();
    c.restore();
  }
  /* 锥形瓶（kind 'conical'，默认）或烧杯（'beaker'）：底边中心 (x, yb)，最大宽 w，高 hgt。
     o = { level 液深 px（从内底算）, liq 液体颜色, wave, ph, grad 烧杯刻度条数 }
     返回 { top 口沿 y, bot 内底 y, mouth: [xl, xr], wAt(y) 该高度的内宽, surf 液面 y } */
  function drawFlask(c, x, yb, w, hgt, o) {
    o = o || {}; var bk = o.kind === 'beaker', top = yb - hgt, nw = bk ? w : w * 0.34, nh = bk ? 0 : hgt * 0.3, rr = Math.min(8, w * 0.08), bot = yb - 2;
    function wAt(y) { return bk || y <= top + nh ? nw : nw + (w - nw) * (y - top - nh) / (hgt - nh); }
    function path(g) {
      g.beginPath();
      if (bk) { g.moveTo(x - w / 2 - 4, top - 2); g.lineTo(x - w / 2, top + 3); g.lineTo(x - w / 2, yb - rr); g.quadraticCurveTo(x - w / 2, yb, x - w / 2 + rr, yb); g.lineTo(x + w / 2 - rr, yb); g.quadraticCurveTo(x + w / 2, yb, x + w / 2, yb - rr); g.lineTo(x + w / 2, top + 1); g.lineTo(x + w / 2 + 1.5, top); }
      else { g.moveTo(x - nw / 2 - 2.5, top); g.lineTo(x - nw / 2, top + 3); g.lineTo(x - nw / 2, top + nh); g.lineTo(x - w / 2 + rr * 0.5, yb - rr); g.quadraticCurveTo(x - w / 2, yb, x - w / 2 + rr, yb); g.lineTo(x + w / 2 - rr, yb); g.quadraticCurveTo(x + w / 2, yb, x + w / 2 - rr * 0.5, yb - rr); g.lineTo(x + nw / 2, top + nh); g.lineTo(x + nw / 2, top + 3); g.lineTo(x + nw / 2 + 2.5, top); }
    }
    shadow(c, x, yb + 1, w * 0.56, 3.5, 0.3);
    var sy = bot - Math.max(0, o.level || 0), hw = wAt(sy) / 2;
    var hl = bk ? [[x - w / 2 + 5, top + 10, x - w / 2 + 5, yb - 10]] : [[x - nw / 2 + 3, top + 6, x - nw / 2 + 3, top + nh - 2], [x - nw / 2 - 2, top + nh + 8, x - w / 2 + rr + 6, yb - rr - 6]];
    glass(c, path, { liquid: o.level > 0 && o.liq ? { y: sy, col: o.liq, x0: x - hw, x1: x + hw, wave: o.wave, ph: o.ph } : null, hl: hl });
    if (bk && o.grad) { c.save(); c.strokeStyle = GLS().edge; c.lineWidth = 1; c.beginPath(); for (var i = 1; i <= o.grad; i++) { var gy = Math.round(yb - (hgt - 8) * i / (o.grad + 1)) + 0.5; c.moveTo(x + w / 2 - 4, gy); c.lineTo(x + w / 2 - (i % 2 ? 10 : 16), gy); } c.stroke(); c.restore(); }
    return { top: top, bot: bot, mouth: [x - nw / 2, x + nw / 2], wAt: wAt, surf: sy };
  }
  /* 活塞气缸（竖直、上口开，下底封闭）：内底中心 (x, yb)，内宽 w，筒高 hgt；活塞下表面距内底 hg px。
     o = { gas 气体着色, liq: { h, col } 底部液体, inside(c, box) 在气体区画分子等（box = { L, R, T, B }）,
           ticks: [[距内底 px, 文字], …] 外壁刻度, label 筒身文字 }
     返回 { py 活塞下表面 y, top 筒口 y, L, R 内壁 x, knob [x, y] 活塞杆把手中心 } */
  function drawCylinder(c, x, yb, w, hgt, hg, o) {
    o = o || {}; var L = x - w / 2, R = x + w / 2, top = yb - hgt, py = yb - hg, pt = Math.max(8, Math.min(14, w * 0.1)), th = 4, lh = o.liq && o.liq.h > 0 ? Math.min(o.liq.h, hg) : 0;
    shadow(c, x, yb + th + 1, w * 0.64, 4, 0.3);
    if (o.gas) { c.fillStyle = o.gas; c.fillRect(L, py, w, yb - py); }
    if (lh) { c.fillStyle = o.liq.col; c.fillRect(L, yb - lh, w, lh); c.fillStyle = alpha(shade(o.liq.col, 0.4), 0.9); c.fillRect(L, yb - lh, w, 1.5); }
    if (o.inside) { c.save(); c.beginPath(); c.rect(L, py, w, yb - lh - py); c.clip(); o.inside(c, { L: L, R: R, T: py, B: yb - lh }); c.restore(); }
    /* 玻璃筒壁与底（U 形） */
    glass(c, function (g) { g.beginPath(); g.moveTo(L - th, top); g.lineTo(L - th, yb + th); g.lineTo(R + th, yb + th); g.lineTo(R + th, top); g.lineTo(R, top); g.lineTo(R, yb); g.lineTo(L, yb); g.lineTo(L, top); g.closePath(); },
      { hl: [[L + 5, top + 8, L + 5, yb - 8], [R - 7, top + 14, R - 7, top + hgt * 0.35]] });
    if (o.ticks) { c.save(); c.strokeStyle = GLS().edge; c.fillStyle = COL['ink-3']; c.lineWidth = 1; c.font = '10px ' + FONT; c.textAlign = 'right'; c.textBaseline = 'middle'; c.beginPath();
      o.ticks.forEach(function (t) { var ty = Math.round(yb - t[0]) + 0.5; c.moveTo(L - th, ty); c.lineTo(L - th - (t[1] ? 6 : 3), ty); if (t[1]) c.fillText(t[1], L - th - 8, ty); }); c.stroke(); c.restore(); }
    /* 活塞（金属，带两道密封圈）与活塞杆 */
    var kn = [x, Math.max(py - pt - 26, 8)], mg = c.createLinearGradient(0, py - pt, 0, py);
    mg.addColorStop(0, '#e6e9ee'); mg.addColorStop(0.5, '#a9afb9'); mg.addColorStop(1, '#6d737e');
    var rg = c.createLinearGradient(x - 3, 0, x + 3, 0); rg.addColorStop(0, '#7d838d'); rg.addColorStop(0.5, '#eef0f3'); rg.addColorStop(1, '#7d838d');
    c.fillStyle = rg; c.fillRect(x - 3, kn[1], 6, py - pt - kn[1]);
    c.fillStyle = mg; c.fillRect(L + 0.5, py - pt, w - 1, pt); c.fillStyle = '#2b2e35'; c.fillRect(L + 0.5, py - pt * 0.72, w - 1, 1.6); c.fillRect(L + 0.5, py - pt * 0.32, w - 1, 1.6);
    rrect(c, x - 16, kn[1] - 6, 32, 12, 6); var kg = c.createLinearGradient(0, kn[1] - 6, 0, kn[1] + 6); kg.addColorStop(0, '#5b606b'); kg.addColorStop(1, '#1f2228'); c.fillStyle = kg; c.fill();
    if (o.label) txt(c, o.label, x, yb + th + 12, COL['ink-2'], '12px ' + FONT);
    return { py: py, top: top, L: L, R: R, knob: kn };
  }
  /* 温度计：玻璃管从 yTop 到 yBot（下端液泡），液柱比例 frac（0 = 刻度起点，1 = 刻度终点）；
     o = { ticks: [[frac, 文字], …], col 液柱色 }。返回液柱顶端 [x, y]；刻度区为 [yBot − 16, yTop + 8] */
  function drawThermo(c, x, yTop, yBot, frac, o) {
    o = o || {}; var y0 = yBot - 16, y1 = yTop + 8, col = o.col || '#d43a2f', ty = y0 + (y1 - y0) * clamp(frac, -0.03, 1.03);
    glass(c, function (g) { g.beginPath(); g.moveTo(x - 4, yBot - 7); g.lineTo(x - 4, yTop + 4); g.arc(x, yTop + 4, 4, Math.PI, 0); g.lineTo(x + 4, yBot - 7); g.arc(x, yBot, 7.5, -1.03, Math.PI + 1.03); g.closePath(); }, { lw: 1.2 });
    c.save(); c.fillStyle = col; c.fillRect(x - 1.6, ty, 3.2, yBot - ty); c.beginPath(); c.arc(x, yBot, 5.2, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.arc(x - 1.8, yBot - 1.8, 1.6, 0, 7); c.fill();
    if (o.ticks) { c.strokeStyle = COL['ink-3']; c.fillStyle = COL['ink-3']; c.lineWidth = 1; c.font = '10px ' + FONT; c.textAlign = 'left'; c.textBaseline = 'middle'; c.beginPath();
      o.ticks.forEach(function (t) { var yy = Math.round(y0 + (y1 - y0) * t[0]) + 0.5; c.moveTo(x + 4, yy); c.lineTo(x + (t[1] ? 9 : 7), yy); if (t[1]) c.fillText(t[1], x + 11, yy); }); c.stroke(); }
    c.restore(); return [x, ty];
  }
  /* 加热/冷却台：顶面中心 (x, y)，宽 w、机身高 hgt；heat ∈ [−1, 1]（>0 红色加热光晕，<0 蓝色冷却光晕）；o = { label } */
  function drawHeater(c, x, y, w, hgt, heat, o) {
    o = o || {}; heat = clamp(heat || 0, -1, 1);
    drawBlock(c, x, y + 4 + hgt / 2, w, hgt, COL.dark ? '#6b717c' : '#d5d9df', { wood: false });
    var pg = c.createLinearGradient(0, y, 0, y + 4), hot = heat > 0 ? mix('#9aa0aa', '#ff5a2a', heat) : mix('#9aa0aa', '#6ec3ff', -heat);
    pg.addColorStop(0, shade(hot, 0.3)); pg.addColorStop(1, shade(hot, -0.3)); c.fillStyle = pg; rrect(c, x - w / 2 + 3, y, w - 6, 4.5, 2); c.fill();
    if (Math.abs(heat) > 0.02) glow(c, x, y, w * 0.55, heat > 0 ? '#ff6a2a' : '#58b4ff', Math.abs(heat) * 0.55);
    var kx = x + w / 2 - 15, ky = y + 4 + hgt / 2, ka = -Math.PI / 2 + heat * 2.2; /* 旋钮指向反映设定 */
    c.beginPath(); c.arc(kx, ky, Math.min(8, hgt * 0.32), 0, 7); c.fillStyle = '#2b2e35'; c.fill();
    c.strokeStyle = '#eef0f3'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(kx, ky); c.lineTo(kx + Math.cos(ka) * 6, ky + Math.sin(ka) * 6); c.stroke();
    c.fillStyle = heat > 0.02 ? '#ff6a2a' : heat < -0.02 ? '#3fa2ff' : '#6b717c'; c.beginPath(); c.arc(x - w / 2 + 12, ky, 2.5, 0, 7); c.fill(); /* 指示灯 */
    if (o.label) txt(c, o.label, x - 2, ky, COL.dark ? '#eef0f3' : '#2b2e35', '11px ' + FONT);
  }
  /* 旋塞（活栓）：中心 (x,y)，栓体半径 r，把手方向 ang（rad，画布方向）；把手与管平行 = 全开（孔道与把手同向）。
     o = { len 把手长, col 把手色 }。返回把手末端 [x, y]（抓取点） */
  function drawStopcock(c, x, y, r, ang, o) {
    o = o || {}; var L = o.len || r * 2.8, ca = Math.cos(ang), sa = Math.sin(ang), col = o.col || '#2f6db3';
    glass(c, function (g) { g.beginPath(); g.ellipse(x, y, r * 1.25, r, 0, 0, 7); }, { lw: 1.2 });
    c.save(); c.lineCap = 'round';
    c.strokeStyle = shade(col, -0.35); c.lineWidth = r * 0.95; c.beginPath(); c.moveTo(x - ca * r * 0.6, y - sa * r * 0.6); c.lineTo(x + ca * L, y + sa * L); c.stroke();
    c.strokeStyle = col; c.lineWidth = r * 0.65; c.stroke();
    c.beginPath(); c.arc(x, y, r * 0.62, 0, 7); c.fillStyle = COL.dark ? '#e6e9ee' : '#f6f7f9'; c.fill(); c.lineWidth = 1; c.strokeStyle = '#7d838d'; c.stroke();
    c.strokeStyle = '#4a4f59'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x - ca * r * 0.5, y - sa * r * 0.5); c.lineTo(x + ca * r * 0.5, y + sa * r * 0.5); c.stroke(); /* 孔道 */
    c.restore(); return [x + ca * L, y + sa * L];
  }
  /* 实验台：台面 y，从 x0 到 x1，厚 dp（木纹台面） */
  function bench(c, x0, x1, y, dp) { dp = dp || 12; wood(c, x0, y, x1 - x0, dp, { tone: 0 }); c.save(); c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(x0, y, x1 - x0, 1.5); c.restore(); }
  /* 分子盒：n 个分子在单位正方形内匀速运动、碰壁反射；step(dt, sx, sy) 横/纵速率（盒宽/秒、盒高/秒，sy 缺省 = sx；
     传 速率px ÷ 盒的宽、高，盒子被压扁时分子的实际速率不变）；each(k, fn(u, v, i)) 取前 k 个 */
  function Molecules(n) {
    var m = { p: [] }; for (var i = 0; i < n; i++) { var a = Math.random() * 6.283; m.p.push([Math.random(), Math.random(), Math.cos(a), Math.sin(a)]); }
    m.step = function (dt, s, sy) { if (sy == null) sy = s; m.p.forEach(function (q) { q[0] += q[2] * s * dt; q[1] += q[3] * sy * dt; if (q[0] < 0 || q[0] > 1) { q[2] = -q[2]; q[0] = clamp(q[0], 0, 1); } if (q[1] < 0 || q[1] > 1) { q[3] = -q[3]; q[1] = clamp(q[1], 0, 1); } }); };
    m.each = function (k, fn) { for (var i = 0; i < Math.min(k, n); i++) fn(m.p[i][0], m.p[i][1], i); };
    return m;
  }
  var DM = window.EJUDemo = { reg: function (n, f) { REG[n] = f; }, P: P, COL: COL, fx: fx, sci: sci, arrow: arrow, txt: txt, line: line, dot: dot, Map: Map, axes: axes, bars: bars,
    FONT: FONT, clamp: clamp, shade: shade, alpha: alpha, mix: mix, rrect: rrect, shadow: shadow, drawBall: drawBall, drawBlock: drawBlock, wood: wood, woodPattern: woodPattern,
    trail: Trail, approach: approach, hint: hint, reduced: function () { return RM.matches; }, glow: glow, sprite: sprite, ballSprite: ballSprite, blit: blit, wire: wire, drawMeter: drawMeter,
    glass: glass, drawFlask: drawFlask, drawCylinder: drawCylinder, drawThermo: drawThermo, drawHeater: drawHeater, drawStopcock: drawStopcock, bench: bench, molecules: Molecules };
  function boot() {
    readCols();
    var els = [].slice.call(document.querySelectorAll('.demo[data-demo]'));
    function init(el) { if (el._demo || !REG[el.getAttribute('data-demo')]) return; try { el._demo = new Demo(el, REG[el.getAttribute('data-demo')]()); ALL.push(el._demo); } catch (err) { el.textContent = '演示加载失败'; throw err; } }
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) init(e.target); if (e.target._demo) e.target._demo.setVisible(e.isIntersecting); }); }, { rootMargin: '150px 0px' });
      els.forEach(function (el) { io.observe(el); });
    } else els.forEach(function (el) { init(el); el._demo.setVisible(true); });
    new MutationObserver(function () { readCols(); ALL.forEach(function (d) { d.redraw(); }); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    if (RM.addEventListener) RM.addEventListener('change', function () { if (RM.matches) ALL.forEach(function (d) { if (d.playBtn) d.play(false); }); });
  }
  DM.boot = boot;
})();
