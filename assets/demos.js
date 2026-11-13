/* EJU 化学 互动演示：纯计算（浏览器与 Node 测试共用） */
(function (G) {
  'use strict';
  var P = {};
  P.Kw = 1.0e-14; P.R = 8.314; P.RL = 8.314e3; /* Pa·L/(K·mol) */ P.F = 96485; P.Vm = 22.4;
  /* —— 滴定：一元酸（浓度 Ca, 体积 Va mL, Ka；Ka=Infinity 为强酸）用 NaOH（Cb）滴定，加入 Vb mL 时的 pH —— */
  P.titrPH = function (Ca, Va, Ka, Cb, Vb) {
    var Vt = Va + Vb, Ct = Ca * Va / Vt, Na = Cb * Vb / Vt, lo = -2, hi = 15;
    function f(pH) { var h = Math.pow(10, -pH), A = isFinite(Ka) ? Ct * Ka / (Ka + h) : Ct; return h + Na - P.Kw / h - A; } /* 电荷平衡，随 pH 单调减 */
    for (var i = 0; i < 80; i++) { var m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; }
    return (lo + hi) / 2;
  };
  P.titrVeq = function (Ca, Va, Cb) { return Ca * Va / Cb; };
  P.INDICATORS = [['甲基橙', 3.1, 4.4], ['甲基红', 4.2, 6.2], ['酚酞', 8.0, 9.8]];
  /* —— 理想气体 —— */
  P.gasP = function (n, T, V) { return n * P.RL * T / V; }; /* Pa（V 单位 L） */
  /* —— 水的饱和蒸气压（kPa），表值线性插值，0–100 °C —— */
  P.VP = [[0,0.6113],[5,0.8726],[10,1.2282],[15,1.7058],[20,2.3393],[25,3.1699],[27,3.567],[30,4.247],[35,5.629],[37,6.28],[40,7.3849],[45,9.595],[50,12.352],[55,15.762],[60,19.946],[65,25.042],[70,31.201],[75,38.595],[80,47.414],[85,57.867],[90,70.182],[95,84.608],[100,101.42]];
  P.psat = function (t) { var A = P.VP; if (t <= A[0][0]) return A[0][1]; for (var i = 1; i < A.length; i++) if (t <= A[i][0]) { var a = A[i - 1], b = A[i]; return a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]); } return A[A.length - 1][1]; };
  /* 密闭容器 V L 中 n mol 水，t °C：若全部气化的压力 p（kPa）超过饱和蒸气压则有液体 */
  P.waterBox = function (n, V, t) { var T = t + 273.15, pAll = n * P.RL * T / V / 1000, ps = P.psat(t), liq = pAll > ps;
    return { pAll: pAll, ps: ps, pw: liq ? ps : pAll, liquid: liq, nGas: liq ? ps * 1000 * V / (P.RL * T) : n }; };
  /* —— N2O4 ⇌ 2NO2：Kp(298 K)≈0.15（bar 基准），ΔH°=+57.2 kJ/mol（正反应吸热） —— */
  P.Kp298 = 0.15; P.dH = 57.2e3;
  P.KpT = function (T) { return P.Kp298 * Math.exp(-P.dH / P.R * (1 / T - 1 / 298.15)); };
  P.n2o4 = function (T, Ptot) { var K = P.KpT(T), a = Math.sqrt(K / (K + 4 * Ptot)); return { K: K, alpha: a, xNO2: 2 * a / (1 + a), pNO2: Ptot * 2 * a / (1 + a), pN2O4: Ptot * (1 - a) / (1 + a) }; };
  /* 定容加入惰性气体：反应物分压不变；定压加入：等效于反应混合物的分压降低 */
  P.n2o4Inert = function (T, Ptot, xAr, mode) { if (mode === 'V') return P.n2o4(T, Ptot); return P.n2o4(T, Ptot * (1 - xAr)); };
  /* —— 电解：法拉第定律 —— */
  P.SPECIES = { Ag: { z: 1, M: 107.9, gas: false, zh: 'Ag（阴极析出）' }, Cu: { z: 2, M: 63.55, gas: false, zh: 'Cu（阴极析出）' }, H2: { z: 2, M: 2.016, gas: true, zh: 'H₂（阴极）' }, O2: { z: 4, M: 32.00, gas: true, zh: 'O₂（阳极）' }, Cl2: { z: 2, M: 70.90, gas: true, zh: 'Cl₂（阳极）' } };
  P.faraday = function (I, t, sp) { var s = P.SPECIES[sp], ne = I * t / P.F, n = ne / s.z; return { Q: I * t, ne: ne, n: n, m: n * s.M, V: s.gas ? n * P.Vm : null }; };
  if (typeof module !== 'undefined' && module.exports) module.exports = P; else G.SCI = P;
})(this);
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
(function () {
  'use strict';
  var D = window.EJUDemo, P = D.P, C = D.COL, fx = D.fx, sci = D.sci, arrow = D.arrow, txt = D.txt, line = D.line, dot = D.dot, Map = D.Map, axes = D.axes, bars = D.bars, clamp = D.clamp;
  var F12 = '12px system-ui,"PingFang SC","Hiragino Sans","Noto Sans CJK SC",sans-serif', F11 = '11px ' + D.FONT;
  var WATER = 'rgba(190,220,242,.42)'; /* 无色水溶液 */
  function wide(w) { return w >= 560; }
  /* 画面分区：宽屏左边器材 A、右边图表 G（左侧占 f）；窄屏器材在上、图表在下 */
  function split(W, H, f) {
    if (wide(W)) return { A: { x: 0, y: 0, w: Math.round(W * f), h: H }, G: { L: Math.round(W * f) + 40, R: W - 16, T: 18, B: H - 30 } };
    var hA = Math.round(H * 0.52); return { A: { x: 0, y: 0, w: W, h: hA }, G: { L: 42, R: W - 14, T: hA + 18, B: H - 28 } };
  }
  function now() { return (window.performance ? performance.now() : Date.now()) / 1000; }
  function niceCeil(x) { var e = Math.pow(10, Math.floor(Math.log10(x))), f = x / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; }
  /* 折线上按长度比例 f（0–1）取点 */
  function along(pts, f) {
    var s = [], L = 0, i; for (i = 1; i < pts.length; i++) { s.push(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); L += s[i - 1]; }
    var q = clamp(f, 0, 1) * L; for (i = 0; i < s.length; i++) { if (q <= s[i] || i === s.length - 1) { var k = s[i] ? Math.min(q / s[i], 1) : 0; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k, L]; } q -= s[i]; }
  }
  /* 旋塞把手角度 a → 开度 0–1：把手与管平行为全开。shut 为关闭时的把手方向，dir = −1 逆时针（画面上）转 π/2 打开，+1 顺时针 */
  function cockOpen(a, shut, dir) { var r = dir * (a - shut); while (r > Math.PI) r -= 2 * Math.PI; while (r < -Math.PI) r += 2 * Math.PI; return r < 0 ? 0 : r > Math.PI * 0.5 ? (r > Math.PI * 0.75 ? 0 : 1) : r / (Math.PI / 2); }
  /* 铁架台：底座在台面 by，立杆在 x，夹子伸到 (x2, y) */
  function stand(c, x, by, top, x2, y) {
    var mg = c.createLinearGradient(x - 3, 0, x + 3, 0); mg.addColorStop(0, '#6d737e'); mg.addColorStop(0.5, '#e6e9ee'); mg.addColorStop(1, '#6d737e');
    D.shadow(c, x + 6, by, 34, 3, 0.3); c.fillStyle = C.dark ? '#3a3e46' : '#4a4f59'; D.rrect(c, x - 22, by - 6, 56, 6, 2); c.fill();
    c.fillStyle = mg; c.fillRect(x - 2.5, top, 5, by - 6 - top);
    c.fillStyle = '#7d838d'; c.fillRect(Math.min(x, x2), y - 2.5, Math.abs(x2 - x), 5); c.fillStyle = '#2b2e35'; c.fillRect(x - 5, y - 5, 10, 10); D.rrect(c, x2 - 9, y - 6, 18, 12, 3); c.fill();
  }

  /* ① 中和滴定：滴定管（可转动的旋塞）＋锥形瓶（指示剂变色）＋滴定曲线 */
  D.reg('titr', function () {
    var m, A, B = {}, Vb = 0, kind, pKa, Ca, Cb, ind, open = 0, drops = [], acc = 0, flash = 0, ph = 0, stir = 0, sc = [0, 0], gp = [0, 0];
    /* 指示剂颜色，顺序同 P.INDICATORS（甲基橙、甲基红、酚酞）：[酸性色, 碱性色, 酸性色名, 变色范围内, 碱性色名] */
    var IC = [['#d8322a', '#f0c02a', '红色', '橙色', '黄色'], ['#d4264f', '#f0c02a', '红色', '橙色', '黄色'], ['#cfe3f0', '#d6337f', '无色', '淡红色', '红色']];
    function Ka() { return kind.v === 'strong' ? Infinity : Math.pow(10, -pKa.v); }
    function phAt(v) { return P.titrPH(Ca.v, 10, Ka(), Cb.v, v); }
    function frac(i, pH) { var I = P.INDICATORS[i]; return clamp((pH - I[1]) / (I[2] - I[1]), 0, 1); }
    function solCol(i, pH) { var f = frac(i, pH); return D.alpha(D.mix(IC[i][0], IC[i][1], f), i === 2 ? 0.34 + 0.3 * f : 0.6); }
    function colName(i, pH) { var I = P.INDICATORS[i]; return pH < I[1] ? IC[i][2] : pH > I[2] ? IC[i][4] : IC[i][3]; }
    function range() { m.x1 = Math.max(20, Math.min(60, Math.ceil(P.titrVeq(Ca.v, 10, Cb.v) * 2 / 5) * 5)); Vb = Math.min(Vb, m.x1); } /* 横轴 = 滴定管容量 */
    function rate() { return 2 * open * open; } /* 流速 mL/s：旋塞开度的平方（小开度时逐滴） */
    return { aspect: function (w) { return wide(w) ? 1.5 : 0.8; }, maxH: 560, animated: true,
      init: function (d) {
        kind = d.seg('酸', [['strong', '强酸（HCl）'], ['weak', '弱酸（CH₃COOH 等）']], 'weak');
        pKa = d.slider('弱酸 pK<sub>a</sub>', 2, 10, 0.05, 4.76, function (v) { return fx(v, 2) + '（K<sub>a</sub> = ' + sci(Math.pow(10, -v), 1) + '）'; });
        Ca = d.slider('酸浓度 [mol/L]（10.0 mL）', 0.01, 0.2, 0.01, 0.1, function (v) { return fx(v, 2); });
        Cb = d.slider('NaOH 浓度 [mol/L]', 0.01, 0.2, 0.01, 0.1, function (v) { return fx(v, 2); });
        ind = d.seg('指示剂', [[2, '酚酞'], [0, '甲基橙'], [1, '甲基红']], 2);
        d.grab({ r: 10, get: function () { return sc; }, set: function (x, y) { open = cockOpen(Math.atan2(y - B.sy, x - B.x), 0, -1); if (open < 0.04) open = 0; } });
        d.grab({ r: 7, autoplay: false, get: function () { return gp; }, set: function (x) { Vb = clamp(m.ix(x), 0, m.x1); } });
        d.button('加 1 滴（0.05 mL）', function () { if (Vb < m.x1) { Vb = Math.min(m.x1, Vb + 0.05); if (!D.reduced()) { drops.push([0, 0]); d.play(true); } else flash = 1; } });
        d.button('关闭旋塞', function () { open = 0; });
        d.button('重新装液（读数归零）', function () { open = 0; Vb = 0; drops = []; acc = 0; });
      },
      resize: function (d) {
        var S = split(d.W, d.H, 0.36), a; A = a = S.A; m = Map(0, m ? m.x1 : 30, 0, 14, S.G.L, S.G.R, S.G.T, S.G.B);
        B.by = a.y + a.h - 14; B.x = a.x + a.w * 0.6; B.fw = Math.min(a.w * 0.4, 100, a.h * 0.3); B.fh = B.fw * 1.05; B.hy = B.by - 20;
        B.tip = B.hy - B.fh + 12; B.sy = B.tip - 20; B.yT = a.y + 14; B.g0 = B.yT + 12; B.g1 = B.sy - 22; B.sx = B.x - Math.min(56, a.w * 0.22);
        drops = [];
      },
      step: function (d, dt) {
        range(); stir += dt * 9; ph += dt * 2.4; flash = D.approach(flash, 0, dt, 0.35);
        var q = rate();
        if (q > 0 && Vb < m.x1) { var dv = Math.min(q * dt, m.x1 - Vb); Vb += dv; if (q < 0.8) { acc += dv; while (acc >= 0.05) { acc -= 0.05; if (drops.length < 12) drops.push([0, 0]); } } else { acc = 0; flash = 1; } }
        for (var i = drops.length - 1; i >= 0; i--) { var p = drops[i]; p[1] += 1400 * dt; p[0] += p[1] * dt; if (B.tip + p[0] >= B.surf) { drops.splice(i, 1); flash = 1; } }
        if (!open && !drops.length && D.reduced()) d.play(false);
      },
      draw: function (d, c) {
        range();
        var Kv = Ka(), Veq = P.titrVeq(Ca.v, 10, Cb.v), pH = phAt(Vb), ii = ind.v, a = A, cap = m.x1, x = B.x, q = rate();
        /* —— 滴定曲线（原样）＋可拖的点 —— */
        P.INDICATORS.forEach(function (it, i) { c.fillStyle = [C.c2, C.c3, C.c4][i]; c.globalAlpha = i === ii ? 0.2 : 0.1; c.fillRect(m.L, m.Y(it[2]), m.R - m.L, m.Y(it[1]) - m.Y(it[2])); c.globalAlpha = 1; txt(c, it[0] + ' ' + it[1] + '–' + it[2], m.R - 4, m.Y((it[1] + it[2]) / 2), [C.c2, C.c3, C.c4][i], i === ii ? '600 ' + F12 : F12, 'right'); });
        axes(c, m, 'NaOH [mL]', 'pH', 5, 2);
        var pts = []; for (var i = 0; i <= 240; i++) { var v = m.x1 * i / 240; pts.push([m.X(v), m.Y(P.titrPH(Ca.v, 10, Kv, Cb.v, v))]); }
        line(c, pts, C.c1, 2.5);
        if (Veq <= m.x1) { line(c, [[m.X(Veq), m.T], [m.X(Veq), m.B]], C['ink-3'], 1, [5, 4]); txt(c, '中和点', m.X(Veq), m.T + 8, C['ink-2'], F12); }
        if (isFinite(Kv) && Veq / 2 <= m.x1) { dot(c, m.X(Veq / 2), m.Y(phAt(Veq / 2)), 4, C.c3); txt(c, '半中和 pH≈pKa', m.X(Veq / 2), m.Y(phAt(Veq / 2)) - 14, C.c3, F12); }
        gp = [m.X(Vb), m.Y(pH)]; D.drawBall(c, gp[0], gp[1], 6.5, C.accent);
        /* —— 器材：实验台、铁架台、搅拌器、锥形瓶、滴定管 —— */
        D.bench(c, a.x + 4, a.x + a.w - 4, B.by, 12);
        stand(c, B.sx, B.by, a.y + 6, x, (B.g0 + B.g1) / 2);
        D.drawHeater(c, x, B.hy, B.fw + 26, 16, 0, { label: '搅拌器' });
        var lev = B.fh * 0.6 * (10 + Vb) / (10 + cap) + 4, fl = D.drawFlask(c, x, B.hy, B.fw, B.fh, { level: lev, liq: solCol(ii, pH), wave: D.reduced() ? 0 : 1.1, ph: ph });
        B.surf = fl.surf;
        if (flash > 0.02 && !D.reduced()) D.glow(c, x, fl.surf + 5, B.fw * 0.2, IC[ii][1], flash * 0.75); /* 滴入处局部碱过量：短暂显出碱性色，摇匀后消失 */
        var sw = 4 + 6 * Math.abs(Math.cos(stir)); c.fillStyle = '#f4f5f7'; D.rrect(c, x - sw, fl.bot - 5, sw * 2, 4, 2); c.fill(); c.strokeStyle = '#7d838d'; c.lineWidth = 0.8; c.stroke(); /* 搅拌子 */
        var bw = 12, L = x - bw / 2, R = x + bw / 2, yT = B.yT, sy = B.sy, tip = B.tip, lv = B.g0 + (B.g1 - B.g0) * Vb / cap, empty = Vb >= cap - 1e-9;
        D.glass(c, function (g) { g.beginPath(); g.moveTo(L, yT); g.lineTo(L, sy - 8); g.lineTo(x - 3, sy - 5); g.lineTo(x - 3, sy + 7); g.lineTo(x - 1.3, tip); g.lineTo(x + 1.3, tip); g.lineTo(x + 3, sy + 7); g.lineTo(x + 3, sy - 5); g.lineTo(R, sy - 8); g.lineTo(R, yT); },
          { liquid: { y: empty ? sy + 8 : lv, col: 'rgba(170,205,235,.6)', x0: L, x1: R }, hl: [[L + 2.5, yT + 6, L + 2.5, sy - 14]], lw: 1.3 });
        var ppm = (B.g1 - B.g0) / cap; c.save(); c.strokeStyle = C.dark ? 'rgba(230,236,245,.85)' : 'rgba(40,50,64,.85)'; c.fillStyle = C['ink-2']; c.lineWidth = 1; c.font = '10px ' + D.FONT; c.textAlign = 'left'; c.textBaseline = 'middle'; c.beginPath();
        for (v = 0; v <= cap + 1e-9; v += 1) { if (ppm < 2.5 && v % 5) continue; var yy = Math.round(B.g0 + v * ppm) + 0.5, big = v % 5 === 0; c.moveTo(R, yy); c.lineTo(R - (big ? 7 : 4), yy); if (v % (ppm * 5 >= 14 ? 5 : 10) === 0) c.fillText(String(v), R + 3, yy); }
        c.stroke(); c.restore(); /* 滴定管刻度：上 0、下 cap mL（读数向下增大） */
        if (!empty) { line(c, [[L - 7, lv], [L - 1, lv]], C.accent, 2); txt(c, '读数 ' + fx(Vb, 2) + ' mL', L - 9, lv, C.accent, '600 ' + F11, 'right'); }
        txt(c, 'NaOH aq', L - 9, yT + 6, C['ink-2'], F11, 'right');
        sc = D.drawStopcock(c, x, sy, 5.5, -open * Math.PI / 2, { len: 16 });
        c.fillStyle = 'rgba(170,205,235,.9)';
        if (q >= 0.8 && !empty) line(c, [[x, tip], [x, fl.surf]], 'rgba(170,205,235,.85)', 1 + open * 1.2);
        drops.forEach(function (p) { c.beginPath(); c.ellipse(x, tip + p[0], 1.8, 2.5, 0, 0, 7); c.fill(); });
        txt(c, '酸 10.0 mL', x + B.fw / 2 + 4, B.hy - B.fh * 0.32, C['ink-2'], F11, 'left'); txt(c, '+ ' + P.INDICATORS[ii][0], x + B.fw / 2 + 4, B.hy - B.fh * 0.32 + 14, C['ink-2'], F11, 'left');
        if (!d.grabbed) D.hint(c, '← 拖旋塞（向上＝开）', sc[0] + 8, sy - (open > 0.5 ? 0 : 12));
        else if (empty) D.hint(c, '滴定管已空', R + 18, sy);
        var pe = phAt(Veq), p0 = phAt(0);
        d.out([['加入 NaOH', fx(Vb, 2) + ' mL → pH = ' + fx(pH, 2)], ['中和点', fx(Veq, 2) + ' mL，pH = ' + fx(pe, 2)], ['滴定前 pH', fx(p0, 2)], ['适合的指示剂', pe > 7.5 ? '酚酞（中和点在碱性侧）' : '甲基橙或酚酞都可（pH 突变范围宽）'],
          ['溶液颜色（' + P.INDICATORS[ii][0] + '）', colName(ii, pH)], ['旋塞', open ? fx(q, 2) + ' mL/s' + (q < 0.8 ? '（逐滴）' : '') : '关闭']],
          '弱酸的中和点在碱性侧（生成的弱酸根水解），所以用酚酞；半中和点附近是缓冲区，pH ≈ pK<sub>a</sub>。中和所需 NaOH 的量只取决于酸的物质的量，与强弱无关。操作：抓住旋塞把手向上转（竖直＝全开，稍开＝逐滴）让 NaOH 滴下，滴定管读数就是加入量；也可直接拖曲线上的点，“加 1 滴”＝ 0.05 mL。');
      } };
  });

  /* ② 理想气体 pV = nRT：活塞气缸（可推拉）与 p–V 等温线 */
  D.reg('gas', function () {
    var m, A, G = {}, n, T, V = 12.45, mol = D.molecules(60), tr = D.trail(30, 0.05), last = '', pk = [0, 0], th = [0, 0];
    function p() { return P.gasP(n.v, T.v + 273, V); }
    return { aspect: function (w) { return wide(w) ? 1.7 : 0.8; }, maxH: 560, animated: true,
      init: function (d) {
        n = d.slider('物质的量 n [mol]', 0.1, 2, 0.05, 0.5, function (v) { return fx(v, 2); });
        T = d.slider('温度 t [°C]', -73, 327, 1, 27, function (v) { return fx(v, 0) + '（T = ' + fx(v + 273, 0) + ' K）'; });
        d.grab({ r: function () { return G.w / 2; }, get: function () { return pk; }, set: function (x, y) { V = clamp(Math.round((G.yb - y - 6) / G.hs * 40 * 20) / 20, 2, 40); } });
        d.grab({ r: 6, get: function () { return th; }, set: function (x, y) { T.set(clamp(Math.round(-73 + (G.t0 - y) / (G.t0 - G.t1) * 400), -73, 327)); } });
        d.grab({ r: 7, autoplay: false, get: function () { return [m.X(V), Math.max(m.T, m.Y(p() / 1e5))]; }, set: function (x) { V = clamp(Math.round(m.ix(x) * 20) / 20, 2, 40); } });
      },
      resize: function (d) {
        var S = split(d.W, d.H, 0.42), a; A = a = S.A; m = Map(0, 40, 0, 6, S.G.L, S.G.R, S.G.T, S.G.B);
        G.by = a.y + a.h - 14; G.w = Math.min(a.w * 0.32, 96); G.x = a.x + a.w * 0.5; G.hy = G.by - 20; G.yb = G.hy - 4; G.hgt = G.yb - (a.y + 34); G.hs = G.hgt - 16;
        G.tx = G.x + G.w / 2 + 30; G.tTop = a.y + 30; G.tBot = G.yb - 4; G.t0 = G.tBot - 16; G.t1 = G.tTop + 8; G.gx = a.x + 40; G.gy = G.yb - G.hgt * 0.5;
      },
      step: function (d, dt) { var s = 90 * Math.sqrt((T.v + 273) / 300); mol.step(dt, s / (G.w - 8), s / Math.max(8, G.hs * V / 40 - 8)); }, /* 分子速率 ∝ √T（px/s 与盒子形状无关） */
      draw: function (d, c) {
        var pv = p(), t = T.v, tk = (t + 73) / 400, a = A;
        axes(c, m, 'V [L]', 'p [×10⁵ Pa]', 10, 1);
        [[-73, C.c4], [27, C.c1], [327, C.c2]].forEach(function (q) { var k = n.v * P.RL * (q[0] + 273) / 1e5, pts = []; for (var v = 2; v <= 40; v += 0.25) pts.push([m.X(v), m.Y(Math.min(6.2, k / v))]); line(c, pts, q[1], 1, [4, 4]); });
        var k = n.v * P.RL * (t + 273) / 1e5, pts = []; for (var v = 2; v <= 40; v += 0.25) pts.push([m.X(v), m.Y(Math.min(6.2, k / v))]); line(c, pts, C.accent, 2.5);
        var key = V + ',' + pv; if (key !== last) { tr.push(now(), V, pv); last = key; }
        tr.each(function (v, q, f) { if (q / 1e5 <= 6.2) { c.globalAlpha = f * 0.45; dot(c, m.X(v), m.Y(q / 1e5), 3, C.accent); c.globalAlpha = 1; } });
        D.drawBall(c, m.X(V), Math.max(m.T, m.Y(pv / 1e5)), 6.5, C.accent);
        /* —— 器材：加热/冷却台上的活塞气缸、压力计、温度计 —— */
        D.bench(c, a.x + 4, a.x + a.w - 4, G.by, 12);
        D.drawHeater(c, G.x, G.hy, G.w + 36, 16, (t - 27) / 300, { label: t > 27 ? '加热' : t < 27 ? '冷却' : '' });
        var ticks = []; for (v = 0; v <= 40; v += 5) ticks.push([G.hs * v / 40, v % 10 ? '' : v === 40 ? '40 L' : String(v)]);
        var img = D.ballSprite(3, C.c2), gc = 'rgba(' + Math.round(90 + 150 * tk) + ',' + Math.round(140 - 40 * tk) + ',' + Math.round(230 - 170 * tk) + ',' + (C.dark ? 0.3 : 0.18) + ')';
        var cy = D.drawCylinder(c, G.x, G.yb, G.w, G.hgt, G.hs * V / 40, { gas: gc, ticks: ticks, inside: function (g, b) { mol.each(Math.round(24 * n.v), function (u, w) { D.blit(g, img, b.L + 4 + u * (b.R - b.L - 8), b.T + 4 + w * Math.max(0, b.B - b.T - 8), 8, 8); }); } });
        pk = [G.x, cy.py - 6];
        D.wire(c, [[cy.L - 4, G.yb - 8], [G.gx, G.yb - 8], [G.gx, G.gy + 20]], { w: 3, col: '#8c929c' });
        D.drawMeter(c, G.gx, G.gy, 20, pv / 6e5, { label: 'p', max: 6, text: fx(pv / 1e5, 2) + '×10⁵ Pa' });
        th = D.drawThermo(c, G.tx, G.tTop, G.tBot, tk, { ticks: [[0, '−73'], [0.25, '27'], [0.5, '127'], [0.75, '227'], [1, '327 °C']] });
        txt(c, 'V = ' + fx(V, 1) + ' L', G.x, cy.py + Math.min(16, (G.yb - cy.py) / 2), C.ink, '600 ' + F12);
        if (!d.grabbed) D.hint(c, '可上下推拉活塞；拖温度计液柱改温度', a.x + 8, a.y + 12);
        d.out([['p = nRT / V', sci(pv, 2) + ' Pa'], ['pV', sci(pv * V, 3) + ' Pa·L（= nRT）'], ['T', fx(t + 273, 0) + ' K']],
          '推拉活塞时温度保持不变（玻意耳定律：T 一定时 pV 一定）。虚线是 −73 °C、27 °C、327 °C 的等温线。R = 8.31×10³ Pa·L/(K·mol)，温度一定要换成 K。操作：上下拖动活塞（或等温线上的点）改变体积，拖动温度计液柱改变温度；分子运动速率 ∝ √T。');
      } };
  });

  /* ③ 密闭容器中的水：饱和蒸气压（活塞改变体积、温度计改变温度） */
  D.reg('vapor', function () {
    var m, A, G = {}, t, n, V, mol = D.molecules(120), beads = [], pk = [0, 0], th = [0, 0], gp = [0, 0];
    for (var i = 0; i < 16; i++) beads.push([i % 2, Math.random(), 0.8 + Math.random() * 1.3]); /* 器壁上的凝结水珠 [左/右, 高度比例, 半径] */
    return { aspect: function (w) { return wide(w) ? 1.6 : 0.8; }, maxH: 560, animated: true,
      init: function (d) {
        n = d.slider('水的物质的量 [mol]', 0.01, 0.3, 0.005, 0.1, function (v) { return fx(v, 3); });
        V = d.slider('容器体积 [L]', 1, 30, 0.1, 8.3, function (v) { return fx(v, 1); });
        t = d.slider('温度 [°C]', 0, 100, 1, 27, function (v) { return fx(v, 0); });
        d.grab({ r: function () { return G.w / 2; }, get: function () { return pk; }, set: function (x, y) { V.set(clamp(Math.round((G.yb - y - 6) / G.hs * 30 * 10) / 10, 1, 30)); } });
        d.grab({ r: 6, get: function () { return th; }, set: function (x, y) { t.set(clamp(Math.round((G.t0 - y) / (G.t0 - G.t1) * 100), 0, 100)); } });
        d.grab({ r: 7, autoplay: false, get: function () { return gp; }, set: function (x) { t.set(Math.round(clamp(m.ix(x), 0, 100))); } });
      },
      resize: function (d) {
        var S = split(d.W, d.H, 0.42), a; A = a = S.A; m = Map(0, 100, 0, 110, S.G.L + 4, S.G.R, S.G.T, S.G.B);
        G.by = a.y + a.h - 14; G.w = Math.min(a.w * 0.32, 96); G.x = a.x + a.w * 0.5; G.hy = G.by - 20; G.yb = G.hy - 4; G.hgt = G.yb - (a.y + 34); G.hs = G.hgt - 16;
        G.tx = G.x + G.w / 2 + 30; G.tTop = a.y + 30; G.tBot = G.yb - 4; G.t0 = G.tBot - 16; G.t1 = G.tTop + 8; G.gx = a.x + 40; G.gy = G.yb - G.hgt * 0.5;
      },
      step: function (d, dt) { var s = 80 * Math.sqrt((t.v + 273) / 300); mol.step(dt, s / (G.w - 8), s / Math.max(8, G.hs * V.v / 30 - 8)); },
      draw: function (d, c) {
        var a = A, w = P.waterBox(n.v, V.v, t.v), x;
        axes(c, m, 't [°C]', 'p [kPa]', 10, 20);
        var ps = []; for (x = 0; x <= 100; x += 1) ps.push([m.X(x), m.Y(P.psat(x))]); line(c, ps, C.c1, 2.5); txt(c, '饱和蒸气压曲线', m.X(88), m.Y(P.psat(88)) - 16, C.c1, F12, 'right');
        var pa = []; for (x = 0; x <= 100; x += 1) pa.push([m.X(x), m.Y(Math.min(m.y1 + 5, n.v * P.RL * (x + 273.15) / V.v / 1000))]); line(c, pa, C.c2, 1.5, [5, 4]); txt(c, '假设全部为气体 p = nRT/V', m.X(4), m.Y(Math.min(m.y1, n.v * P.RL * 277 / V.v / 1000)) - 12, C.c2, F12, 'left');
        gp = [m.X(t.v), m.Y(Math.min(m.y1, w.pw))]; D.drawBall(c, gp[0], gp[1], 6.5, C.accent);
        /* —— 器材：活塞气缸里的液态水与水蒸气 —— */
        D.bench(c, a.x + 4, a.x + a.w - 4, G.by, 12);
        D.drawHeater(c, G.x, G.hy, G.w + 36, 16, (t.v - 25) / 75, { label: t.v > 25 ? '加热' : t.v < 25 ? '冷却' : '' });
        var hg = G.hs * V.v / 30, nl = n.v - w.nGas, lh = w.liquid ? clamp(G.hs * 0.2 * nl / 0.3, 2.5, hg * 0.45) : 0, cnt = w.nGas > 0 ? Math.max(1, Math.min(120, Math.round(w.nGas * 600))) : 0;
        var ticks = []; for (var v = 0; v <= 30; v += 5) ticks.push([G.hs * v / 30, v % 10 ? '' : v === 30 ? '30 L' : String(v)]);
        var img = D.ballSprite(2.6, '#4a9be0');
        var cy = D.drawCylinder(c, G.x, G.yb, G.w, G.hgt, hg, { gas: C.dark ? 'rgba(120,170,220,.10)' : 'rgba(120,170,220,.08)', liq: { h: lh, col: 'rgba(70,150,225,.55)' }, ticks: ticks,
          inside: function (g, b) {
            if (w.liquid) { g.fillStyle = 'rgba(120,180,235,.75)'; beads.forEach(function (q) { var yy = b.T + 6 + q[1] * Math.max(0, b.B - b.T - 12); g.beginPath(); g.arc(q[0] ? b.R - 2 : b.L + 2, yy, q[2], 0, 7); g.fill(); }); }
            mol.each(cnt, function (u, vv) { D.blit(g, img, b.L + 4 + u * (b.R - b.L - 8), b.T + 4 + vv * Math.max(0, b.B - b.T - 8), 7, 7); });
          } });
        pk = [G.x, cy.py - 6];
        if (lh) txt(c, '液态水（量放大显示）', G.x, G.yb + 16, C['ink-2'], F11);
        D.wire(c, [[cy.L - 4, G.yb - 8], [G.gx, G.yb - 8], [G.gx, G.gy + 20]], { w: 3, col: '#8c929c' });
        D.drawMeter(c, G.gx, G.gy, 20, w.pw / 120, { label: 'kPa', max: 120, text: fx(w.pw, 1) + ' kPa' });
        th = D.drawThermo(c, G.tx, G.tTop, G.tBot, t.v / 100, { ticks: [[0, '0'], [0.25, ''], [0.5, '50'], [0.75, ''], [1, '100 °C']] });
        if (!d.grabbed) D.hint(c, '可上下推拉活塞；拖温度计液柱改温度', a.x + 8, a.y + 12);
        d.out([['全部气化时的压力', fx(w.pAll, 2) + ' kPa'], ['该温度的饱和蒸气压', fx(w.ps, 2) + ' kPa'], ['实际的水蒸气分压', fx(w.pw, 2) + ' kPa'], ['状态', w.liquid ? '有液态水（气态 ' + fx(w.nGas, 4) + ' mol）' : '全部为水蒸气']],
          '红色虚线在蓝色曲线上方时，水不能全部气化，多余部分凝结，分压被“封顶”在饱和蒸气压。排水集气时：p(气体) = 大气压 − 饱和水蒸气压。饱和蒸气压与容器体积、其他气体无关，只由温度决定。操作：上下拖动活塞改变容器体积，拖动温度计液柱或图上的点改变温度；有液体时压缩容器，压力计读数不变，只是更多水蒸气凝结（液体的量为放大显示）。');
      } };
  });

  /* ④ 勒夏特列原理：N2O4 ⇌ 2NO2（活塞气缸 + Ar 钢瓶阀门 + 温度计） */
  D.reg('lechat', function () {
    var T, Pt, ar, mode, A, G = {}, ad = -1, open = 0, gph = 0, mol = D.molecules(90), pk = [0, 0], th = [0, 0], vk = [0, 0], n0 = 0.010, RL = 0.08314;
    function eq(Pv) { return P.n2o4Inert(T.v, Pv, ar.v, mode.v); }
    function vol(Pv) { var r = eq(Pv); return n0 * (1 + r.alpha) * RL * T.v / (r.pNO2 + r.pN2O4); } /* L：反应混合物 n₀(1+α) mol 处在其分压之和下的体积 */
    function fV(v) { return 0.06 + 0.94 * clamp(Math.log(v / 0.04) / Math.log(1000), 0, 1); } /* 活塞高度：体积 0.04–40 L 的对数刻度 */
    function pFor(Vt) { /* 已知体积反求总压（V 随压强单调减） */
      if (vol(0.1) <= Vt) return 0.1; if (vol(5) >= Vt) return 5;
      var lo = Math.log(0.1), hi = Math.log(5); for (var k = 0; k < 40; k++) { var md = (lo + hi) / 2; if (vol(Math.exp(md)) > Vt) lo = md; else hi = md; } return Math.exp((lo + hi) / 2);
    }
    return { aspect: function (w) { return wide(w) ? 1.8 : 0.85; }, maxH: 560, animated: true,
      init: function (d) {
        T = d.slider('温度 [K]', 260, 400, 1, 298, function (v) { return fx(v, 0) + '（' + fx(v - 273, 0) + ' °C）'; });
        Pt = d.slider('总压 [bar]', 0.1, 5, 0.05, 1, function (v) { return fx(v, 2); });
        ar = d.slider('加入 Ar 的摩尔分数', 0, 0.8, 0.05, 0, function (v) { return fx(v, 2); });
        mode = d.seg('加入 Ar 的方式', [['V', '定容'], ['P', '定压']], 'P');
        d.grab({ r: function () { return G.w / 2; }, get: function () { return pk; }, set: function (x, y) { var f = clamp(((G.yb - y - 6) / G.hs - 0.06) / 0.94, 0, 1); Pt.set(Math.round(pFor(0.04 * Math.pow(1000, f)) * 100) / 100); } });
        d.grab({ r: 6, get: function () { return th; }, set: function (x, y) { T.set(clamp(Math.round(260 + (G.t0 - y) / (G.t0 - G.t1) * 140), 260, 400)); } });
        d.grab({ r: 10, get: function () { return vk; }, set: function (x, y) { open = cockOpen(Math.atan2(y - G.vy, x - G.vx), -Math.PI / 2, 1); if (open < 0.04) open = 0; } });
        d.button('关闭 Ar 阀门', function () { open = 0; });
      },
      resize: function (d) {
        var S = split(d.W, d.H, 0.48), a; A = a = S.A; G.gr = S.G;
        G.by = a.y + a.h - 14; G.w = Math.min(a.w * 0.26, 80); G.x = a.x + Math.max(a.w * 0.44, 110); G.hy = G.by - 20; G.yb = G.hy - 4; G.hgt = G.yb - (a.y + 40); G.hs = G.hgt - 16;
        G.tx = a.x + 16; G.tTop = a.y + 34; G.tBot = G.yb - 4; G.t0 = G.tBot - 16; G.t1 = G.tTop + 8;
        G.bx = Math.min(G.x + G.w / 2 + 64, a.x + a.w - 22); G.bh = Math.min(110, G.hgt * 0.7); G.vy = G.by - G.bh - 22; G.vx = (G.bx + G.x + G.w / 2 + 18) / 2;
      },
      step: function (d, dt) {
        var r = eq(Pt.v); ad = ad < 0 ? r.alpha : D.approach(ad, r.alpha, dt, 0.6); gph += dt;
        if (open > 0 && ar.v < 0.8) ar.set(Math.min(0.8, Math.round((ar.v + 0.12 * open * dt) * 1000) / 1000)); /* 阀门开着时持续通入 Ar */
        var s = 70 * Math.sqrt(T.v / 300), hg = G.hs * fV(vol(Pt.v)); mol.step(dt, s / (G.w - 8), s / Math.max(8, hg - 8));
      },
      draw: function (d, c) {
        var r = eq(Pt.v), base = P.n2o4(298, 1), W = d.W, a = A, g = G.gr, x = G.x, Vv = vol(Pt.v);
        if (ad < 0 || !d.playing || D.reduced()) ad = r.alpha;
        var conc = r.pNO2 / (RL * T.v), cd = 2 * n0 * ad / Vv, pR = r.pNO2 + r.pN2O4, pAr = mode.v === 'P' ? Pt.v * ar.v : pR * ar.v / (1 - ar.v), Ptot = pR + pAr;
        bars(c, g.L, g.T + 22, g.R - g.L, g.B - g.T - 34, [['NO₂ 分压', r.pNO2, C.c2], ['N₂O₄ 分压', r.pN2O4, C.c1], ['Ar 分压', pAr, C['ink-3']]], Math.max(1, Ptot), '分压 [bar]');
        /* —— 器材 —— */
        D.bench(c, a.x + 4, a.x + a.w - 4, G.by, 12);
        D.drawHeater(c, x, G.hy, G.w + 36, 16, (T.v - 298) / 100, { label: T.v > 298 ? '加热' : T.v < 298 ? '冷却' : '' });
        var ticks = [[0.05, ''], [0.1, '0.1 L'], [0.2, ''], [0.5, ''], [1, '1 L'], [2, ''], [5, ''], [10, '10 L'], [20, '']].map(function (q) { return [G.hs * fV(q[0]), q[1]]; });
        var nA = Math.round(12 * (1 - ad)), nB = Math.round(24 * ad), nC = Math.min(40, Math.round(12 * (1 + ad) * ar.v / (1 - ar.v)));
        var sB = D.ballSprite(3.2, '#b4532a'), sA = D.ballSprite(2.6, C.dark ? '#e3dccf' : '#bdb5a6'), sC = D.ballSprite(2.4, '#8c929c');
        var cy = D.drawCylinder(c, x, G.yb, G.w, G.hgt, G.hs * fV(Vv), { gas: 'rgba(165,70,30,' + Math.min(0.9, cd * 9).toFixed(3) + ')', ticks: ticks,
          inside: function (gg, b) {
            var bw = b.R - b.L - 10, bh = Math.max(0, b.B - b.T - 10);
            mol.each(nA + nB + nC, function (u, v, i) { var px = b.L + 5 + u * bw, py = b.T + 5 + v * bh;
              if (i < nA) { D.blit(gg, sA, px - 2.3, py, 7, 7); D.blit(gg, sA, px + 2.3, py, 7, 7); } else D.blit(gg, i < nA + nB ? sB : sC, px, py, 8, 8); });
          } });
        pk = [x, cy.py - 6];
        /* Ar 钢瓶 → 阀门 → 气缸 */
        var bx = G.bx, btop = G.by - G.bh, pipe = [[bx, btop - 8], [bx, G.vy], [cy.R + 18, G.vy], [cy.R + 18, G.yb - 12], [cy.R + 4, G.yb - 12]];
        D.wire(c, pipe, { w: 3, col: '#8c929c' });
        var bg = c.createLinearGradient(bx - 13, 0, bx + 13, 0); bg.addColorStop(0, '#4a4f59'); bg.addColorStop(0.35, '#a9afb9'); bg.addColorStop(1, '#3a3e46');
        D.shadow(c, bx, G.by, 18, 3, 0.35); D.rrect(c, bx - 13, btop, 26, G.bh, 10); c.fillStyle = bg; c.fill(); c.fillStyle = '#2b2e35'; c.fillRect(bx - 4, btop - 8, 8, 9);
        txt(c, 'Ar', bx, btop + G.bh * 0.45, '#fff', '700 12px ' + D.FONT);
        if (open > 0 && ar.v < 0.8 && !D.reduced()) { c.fillStyle = '#8c929c'; for (var k = 0; k < 5; k++) { var q = along(pipe, (gph * (0.25 + 0.5 * open) + k / 5) % 1); dot(c, q[0], q[1], 2, C['ink-3']); } }
        vk = D.drawStopcock(c, G.vx, G.vy, 5.5, -Math.PI / 2 * (1 - open), { len: 16 });
        th = D.drawThermo(c, G.tx, G.tTop, G.tBot, (T.v - 260) / 140, { ticks: [[0, '260'], [40 / 140, '300'], [80 / 140, '340'], [120 / 140, '380 K'], [1, '']] });
        txt(c, (mode.v === 'V' ? '定容' : '定压') + '　V = ' + (Vv < 1 ? fx(Vv * 1000, 0) + ' mL' : fx(Vv, 2) + ' L'), x, G.yb + 16, C['ink-2'], F11);
        if (!d.grabbed) D.hint(c, '推拉活塞改压强 · 拖温度计 · 转 Ar 阀门', a.x + 8, a.y + 12);
        d.out([['K<sub>p</sub>(T)', fx(r.K, 3) + ' bar'], ['N₂O₄ 解离度 α', fx(r.alpha * 100, 1) + ' %'], ['[NO₂]', sci(conc, 2) + ' mol/L'], ['与 298 K・1 bar 相比', r.alpha > base.alpha + 1e-3 ? '向右（生成 NO₂）' : r.alpha < base.alpha - 1e-3 ? '向左（生成 N₂O₄）' : '相同'],
          ['体积（起始 N₂O₄ 0.010 mol）', Vv < 1 ? fx(Vv * 1000, 0) + ' mL' : fx(Vv, 2) + ' L'], ['容器内总压（含 Ar）', fx(Ptot, 2) + ' bar']],
          '正反应吸热（ΔH ≈ +57 kJ/mol）：升温向右，颜色变深；加压向分子数少的左边。定容加入 Ar 平衡不移动，定压加入 Ar 相当于减压，向右移动。K<sub>p</sub>(298 K) ≈ 0.15 bar，用范特霍夫式估算其他温度（教科书近似值）。操作：推拉活塞改变压强（筒壁为体积的对数刻度；定容时“总压”指加入 Ar 前反应气体的压强），拖温度计液柱改变温度，转动 Ar 钢瓶的阀门通入 Ar。压缩时颜色先因浓度增大而变深，随后平衡左移又略变浅。');
      } };
  });

  /* ⑤ 电解：法拉第定律（电解槽、可调电流的直流电源、计时） */
  D.reg('faraday', function () {
    var I, tm, sp, m, A, G = {}, on = false, btn, kn = [0, 0], k0 = 0, s0 = [0, 0], gp = [0, 0], bub = [], ions = [], eph = 0, ph = 0;
    for (var i = 0; i < 18; i++) ions.push([Math.random(), Math.random(), i % 2 ? 1 : -1]);
    /* 电解液与两极：[电解液, 颜色, 阳极材料, 阳极生成物, 阴极材料, 阴极生成物] */
    var WTR = ['NaOH aq（水的电解）', WATER, 'Pt', 'O2', 'Pt', 'H2'];
    var CELL = { Ag: ['AgNO₃ aq', WATER, 'Pt', 'O2', 'Pt', 'Ag'], Cu: ['CuSO₄ aq', 'rgba(60,140,230,.45)', 'Pt', 'O2', 'Pt', 'Cu'], H2: WTR, O2: WTR, Cl2: ['NaCl aq', WATER, 'C', 'Cl2', 'Fe', 'H2'] };
    var NM = { O2: 'O₂', H2: 'H₂', Cl2: 'Cl₂', Ag: 'Ag', Cu: 'Cu' };
    function val(t) { var r = P.faraday(I.v, t, sp.v); return P.SPECIES[sp.v].gas ? r.V : r.m; }
    function niceStep(x) { var e = Math.pow(10, Math.floor(Math.log10(x))), f = x / e; return (f < 2 ? 0.2 : f < 5 ? 0.5 : 1) * e * (f < 2 ? 1 : 1); }
    function power(d, v) { on = v; if (on && tm.v >= 7200) tm.set(0); btn.textContent = on ? '断电' : '通电（计时）'; btn.setAttribute('aria-pressed', on); d.play(on); }
    function amt(s) { var r = P.faraday(I.v, tm.v, s); return P.SPECIES[s].gas ? fx(r.V, 3) + ' L' : '+' + fx(r.m, 3) + ' g'; }
    function plate(c, x, y0, y1, w, mat) { var g = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0), b = mat === 'C' ? '#45484f' : mat === 'Fe' ? '#8e9198' : '#cfd3d9'; g.addColorStop(0, D.shade(b, -0.35)); g.addColorStop(0.4, D.shade(b, 0.3)); g.addColorStop(1, D.shade(b, -0.45)); c.fillStyle = g; c.fillRect(x - w / 2, y0, w, y1 - y0); }
    return { aspect: function (w) { return wide(w) ? 2.0 : 0.85; }, maxH: 560,
      init: function (d) {
        I = d.slider('电流 I [A]', 0.1, 10, 0.1, 1.0, function (v) { return fx(v, 1); });
        tm = d.slider('时间 t [s]', 0, 7200, 5, 965, function (v) { return fx(v, 0) + '（' + fx(v / 60, 1) + ' 分）'; });
        sp = d.seg('生成物', [['Ag', 'Ag'], ['Cu', 'Cu'], ['H2', 'H₂'], ['O2', 'O₂'], ['Cl2', 'Cl₂']], 'Ag', function () { bub = []; });
        btn = d.button('通电（计时）', function () { power(d, !on); }); btn.setAttribute('aria-pressed', 'false');
        d.button('时间归零', function () { tm.set(0); bub = []; });
        d.grab({ r: 12, get: function () { return kn; }, start: function () { k0 = I.v; s0 = kn.slice(); }, set: function (x, y) { I.set(clamp(Math.round((k0 + ((x - s0[0]) - (y - s0[1])) * 0.05) * 10) / 10, 0.1, 10)); } });
        d.grab({ r: 7, get: function () { return gp; }, set: function (x) { tm.set(Math.round(clamp(m.ix(x), 0, 7200) / 5) * 5); } });
      },
      resize: function (d) {
        var S = split(d.W, d.H, 0.5), a; A = a = S.A; m = Map(0, 7200, 0, 1, S.G.L + 12, S.G.R, S.G.T, S.G.B);
        G.by = a.y + a.h - 14; G.sw = Math.min(a.w * 0.3, 104); G.sh = Math.min(62, a.h * 0.3); G.sx = a.x + 8; G.sy = G.by - G.sh;
        G.bw = Math.min(a.w * 0.5, 170); G.bh = Math.min(a.h * 0.56, 140); G.bx = a.x + a.w - G.bw / 2 - 14; G.top = G.by - G.bh; G.eTop = G.top - 26;
        G.ax = G.bx - G.bw * 0.25; G.cx = G.bx + G.bw * 0.25; G.mx = (G.sx + G.sw + G.bx - G.bw / 2) / 2; G.my = G.eTop - 14;
        kn = [G.sx + G.sw - 18, G.sy + G.sh * 0.6]; bub = [];
      },
      step: function (d, dt) {
        if (!on) return;
        var nt = Math.min(7200, tm.v + dt * 120); tm.set(nt); if (nt >= 7200) power(d, false); /* 动画 1 s = 通电 120 s */
        if (D.reduced()) return;
        ph += dt; eph += dt * (10 + 5 * I.v);
        ions.forEach(function (q) { q[0] += q[2] * (0.02 + 0.012 * I.v) * dt; if (q[0] > 1) q[0] -= 1; if (q[0] < 0) q[0] += 1; }); /* 阳离子 → 阴极（右），阴离子 → 阳极（左） */
        var cell = CELL[sp.v], gas = P.SPECIES[sp.v].gas;
        [[G.ax, cell[3]], [G.cx, cell[5]]].forEach(function (e) {
          if (!P.SPECIES[e[1]].gas || Math.random() > dt * (3 + 2.2 * I.v) || bub.length > 70) return;
          bub.push(gas ? [e[0] + (Math.random() - 0.5) * 4, G.tB - 8 - Math.random() * 16, 1 + Math.random() * 1.6, e[0]] : [e[0] + (Math.random() < 0.5 ? -5 : 5), G.surf + 8 + Math.random() * (G.bot - 20 - G.surf), 1 + Math.random() * 1.6, e[0]]);
        });
        for (var i = bub.length - 1; i >= 0; i--) { var b = bub[i]; b[1] -= (30 + 10 * b[2]) * dt; b[0] += Math.sin(ph * 6 + i) * 0.15; if (b[1] < (gas ? G.gasY[b[3] === G.ax ? 0 : 1] : G.surf) + 2) bub.splice(i, 1); }
      },
      draw: function (d, c) {
        var s = P.SPECIES[sp.v], max = val(7200) * 1.05 || 1, a = A, cell = CELL[sp.v], gasMode = s.gas, r = P.faraday(I.v, tm.v, sp.v); m.y1 = max;
        axes(c, m, 't [s]', s.gas ? 'V [L]（标准状况）' : '质量 [g]', 1800, niceStep(max));
        line(c, [[m.X(0), m.Y(0)], [m.X(7200), m.Y(val(7200))]], C.c1, 2.5);
        gp = [m.X(tm.v), m.Y(val(tm.v))]; D.drawBall(c, gp[0], gp[1], 6.5, C.accent);
        /* —— 器材：直流电源（旋钮调电流）、电流表、电解槽 —— */
        D.bench(c, a.x + 4, a.x + a.w - 4, G.by, 12);
        var bx = G.bx, ax = G.ax, cx = G.cx, sx = G.sx, sy = G.sy, sw = G.sw, sh = G.sh;
        D.shadow(c, sx + sw / 2, G.by, sw * 0.55, 3, 0.35);
        var pg = c.createLinearGradient(0, sy, 0, sy + sh); pg.addColorStop(0, C.dark ? '#5b606b' : '#e6e9ee'); pg.addColorStop(1, C.dark ? '#33373f' : '#b7bcc5'); D.rrect(c, sx, sy, sw, sh, 5); c.fillStyle = pg; c.fill(); c.strokeStyle = '#4a4f59'; c.lineWidth = 1; c.stroke();
        c.fillStyle = '#16231a'; D.rrect(c, sx + 7, sy + 8, sw - 44, 18, 3); c.fill(); D.rrect(c, sx + 7, sy + 30, sw - 44, 18, 3); c.fill();
        c.save(); c.fillStyle = on ? '#7dff9a' : '#3f7a4c'; c.font = '600 12px ui-monospace,Menlo,Consolas,monospace'; c.textAlign = 'right'; c.textBaseline = 'middle';
        c.fillText(fx(I.v, 1) + ' A', sx + sw - 42, sy + 17); c.fillText(fx(tm.v, 0) + ' s', sx + sw - 42, sy + 39); c.restore();
        var ka = -Math.PI * 0.75 + (I.v - 0.1) / 9.9 * Math.PI * 1.5, kg = c.createRadialGradient(kn[0] - 3, kn[1] - 3, 1, kn[0], kn[1], 11); kg.addColorStop(0, '#6b717c'); kg.addColorStop(1, '#1f2228');
        c.beginPath(); c.arc(kn[0], kn[1], 11, 0, 7); c.fillStyle = kg; c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 2; c.lineCap = 'round'; c.beginPath(); c.moveTo(kn[0] + Math.sin(ka) * 4, kn[1] - Math.cos(ka) * 4); c.lineTo(kn[0] + Math.sin(ka) * 9, kn[1] - Math.cos(ka) * 9); c.stroke(); c.lineCap = 'butt';
        var tn = sx + sw * 0.25, tp = sx + sw * 0.5; dot(c, tn, sy - 2, 4, '#2b2e35'); dot(c, tp, sy - 2, 4, '#c0392b'); txt(c, '−', tn - 9, sy - 9, C.c1, '700 12px ' + D.FONT); txt(c, '+', tp + 9, sy - 9, C.c2, '700 12px ' + D.FONT);
        /* 电解槽 */
        var fl = D.drawFlask(c, bx, G.by, G.bw, G.bh, { kind: 'beaker', level: G.bh * 0.7, liq: cell[1], grad: 6 }), surf = fl.surf, bot = fl.bot;
        G.surf = surf; G.bot = bot; G.tB = bot - 18;
        var cS = D.ballSprite(2.6, C.c2), aS = D.ballSprite(2.6, C.c1), L0 = bx - G.bw / 2 + 8, L1 = bx + G.bw / 2 - 8;
        ions.forEach(function (q) { D.blit(c, q[2] > 0 ? cS : aS, L0 + q[0] * (L1 - L0), surf + 10 + q[1] * (bot - surf - 22), 7, 7); });
        var tops = [0, 0];
        [[ax, cell[2], cell[3], 0], [cx, cell[4], cell[5], 1]].forEach(function (e) {
          var ex = e[0], gas = P.SPECIES[e[2]].gas, ox = e[3] ? 15 : -15; /* 集气时引线走外侧 */
          if (gasMode) { /* 倒立的集气管：管内原先充满电解液，生成的气体从上面积起 */
            var yT = surf - 30, yB = G.tB, Lt = yB - 8 - yT, Vc = niceCeil(I.v * 7200 / P.F / 2 * P.Vm), Vg = P.faraday(I.v, tm.v, e[2]).V, gh = Lt * clamp(Vg / Vc, 0, 1);
            tops[e[3]] = yT + gh;
            if (e[2] === 'Cl2' && gh > 0) { c.fillStyle = 'rgba(175,205,45,.45)'; c.fillRect(ex - 9, yT + 2, 18, gh); }
            D.glass(c, function (g) { g.beginPath(); g.moveTo(ex - 10, yB); g.lineTo(ex - 10, yT + 10); g.arc(ex, yT + 10, 10, Math.PI, 0); g.lineTo(ex + 10, yB); }, { liquid: { y: yT + gh, col: cell[1], x0: ex - 10, x1: ex + 10 }, hl: [[ex - 6, yT + 8, ex - 6, yB - 6]], lw: 1.3 });
            c.save(); c.strokeStyle = C.dark ? 'rgba(230,236,245,.8)' : 'rgba(40,50,64,.75)'; c.lineWidth = 1; c.beginPath(); for (var k = 0; k <= 10; k++) { var yy = Math.round(yT + 4 + Lt * k / 10) + 0.5; c.moveTo(ex + 10, yy); c.lineTo(ex + (k % 5 ? 6 : 3), yy); } c.stroke(); c.restore();
            D.wire(c, [[ex + ox, G.eTop], [ex + ox, yB + 8], [ex, yB + 8], [ex, yB - 4]], { w: 1.4, col: '#8c929c' }); plate(c, ex, yB - 24, yB - 4, 5, e[1]);
          } else {
            plate(c, ex, G.eTop, bot - 12, 7, e[1]);
            if (!gas) { var mref = P.faraday(10, 7200, e[2]).m, dth = tm.v > 0 ? 0.8 + 4 * Math.sqrt(r.m / mref) : 0; /* 阴极析出的金属层（厚度示意） */
              if (dth) { c.fillStyle = e[2] === 'Cu' ? '#c46a3c' : '#e3e6ea'; c.fillRect(ex - 3.5 - dth, surf + 2, 7 + 2 * dth, bot - 14 - surf); c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 0.6; c.strokeRect(ex - 3.5 - dth, surf + 2, 7 + 2 * dth, bot - 14 - surf); } }
          }
          if (e[2] === sp.v) D.glow(c, ex, gasMode ? G.tB - 14 : (surf + bot) / 2, 22, C.accent, 0.35);
        });
        G.gasY = tops;
        c.fillStyle = C.dark ? 'rgba(235,240,248,.75)' : 'rgba(255,255,255,.85)'; c.strokeStyle = 'rgba(80,100,120,.6)'; c.lineWidth = 0.7;
        bub.forEach(function (b) { c.beginPath(); c.arc(b[0], b[1], b[2], 0, 7); c.fill(); c.stroke(); });
        var hb = c.createLinearGradient(0, G.top - 10, 0, G.top - 4); hb.addColorStop(0, '#5b606b'); hb.addColorStop(1, '#2b2e35'); c.fillStyle = hb; c.fillRect(bx - G.bw / 2 - 8, G.top - 10, G.bw + 16, 6); /* 电极支架 */
        /* 导线：− 极 → 阴极；阳极 → 电流表 → + 极（电子 e⁻ 沿导线由阳极流回电源、由电源流向阴极） */
        var exA = gasMode ? ax - 15 : ax, exC = gasMode ? cx + 15 : cx, wy2 = G.my - 30;
        var wA = [[exA, G.eTop], [exA, G.my], [G.mx + 20, G.my]], wA2 = [[G.mx - 20, G.my], [tp, G.my], [tp, sy - 2]], wC = [[tn, sy - 2], [tn, wy2], [exC, wy2], [exC, G.eTop]];
        D.wire(c, wA); D.wire(c, wA2); D.wire(c, wC);
        if (on && !D.reduced()) [wA, wA2, wC].forEach(function (w) { var Lw = along(w, 0)[2], nE = Math.max(2, Math.floor(Lw / 16)); for (var k = 0; k < nE; k++) { var q = along(w, ((eph / Lw) + k / nE) % 1); dot(c, q[0], q[1], 1.8, C.c1); } });
        D.drawMeter(c, G.mx, G.my, 18, I.v / 10, { label: 'A', max: 10 });
        txt(c, '阳极(+) ' + cell[2], ax + 4, G.top - 18, C.c2, F11, 'left'); txt(c, cell[4] + ' 阴极(−)', cx - 4, G.top - 31, C.c1, F11, 'right'); /* 标在两极之间，错开高度 */
        txt(c, '← ' + NM[cell[3]] + ' ' + amt(cell[3]), bx, bot - 30, cell[3] === sp.v ? C.accent : C['ink-2'], (cell[3] === sp.v ? '600 ' : '') + F11);
        txt(c, NM[cell[5]] + ' ' + amt(cell[5]) + ' →', bx, bot - 14, cell[5] === sp.v ? C.accent : C['ink-2'], (cell[5] === sp.v ? '600 ' : '') + F11);
        txt(c, cell[0], bx, G.by + 6, C['ink-2'], F11);
        if (!d.grabbed) D.hint(c, '拖电源旋钮（向上/右＝增大）调电流', a.x + 8, a.y + 12);
        d.out([['电量 Q = It', fx(r.Q, 0) + ' C'], ['电子 n(e⁻) = Q/F', sci(r.ne, 3) + ' mol'], [s.zh, sci(r.n, 3) + ' mol（每 1 mol 需 ' + s.z + ' mol e⁻）'], [s.gas ? '体积（0 °C, 1.013×10⁵ Pa）' : '质量', s.gas ? fx(r.V, 3) + ' L' : fx(r.m, 3) + ' g']],
          'F = 9.65×10⁴ C/mol。生成量与电量成正比：先求电子的物质的量，再除以 1 mol 生成物需要的电子数（Ag⁺ 1，Cu²⁺ 2，H₂ 2，Cl₂ 2，O₂ 4）。时间一定要用秒。操作：按“通电（计时）”开始电解（动画 1 s ＝ 120 s），拖电源旋钮调电流，或拖图上的点改变时间；槽内同时标出两极的生成量，集气管中 H₂ 的体积是 O₂ 的 2 倍。');
      } };
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', D.boot); else D.boot();
})();
