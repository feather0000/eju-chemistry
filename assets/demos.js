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
    d.aspect = spec.aspect || 1.6;
    d.resize = function () {
      var w = stage.clientWidth || 300, hgt = Math.min(Math.round(w / d.aspect), spec.maxH || 520);
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
    d.drawHandles = function (c) {
      d.handles.forEach(function (o) {
        if (o.hidden && o.hidden()) return;
        var p = o.get(); c.save(); c.beginPath(); c.arc(p[0], p[1], o.r + 6, 0, 7); c.fillStyle = COL.dark ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.07)'; c.fill();
        c.beginPath(); c.arc(p[0], p[1], o.r, 0, 7); c.fillStyle = o.color ? o.color() : COL.accent; c.fill();
        c.lineWidth = 2; c.strokeStyle = COL.surface; c.stroke(); c.restore();
      });
    };
    function pos(e) { var b = d.cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }
    function hit(p) { var best = null, bd = 24; d.handles.forEach(function (o) { if (o.hidden && o.hidden()) return; var q = o.get(), dd = Math.hypot(q[0] - p[0], q[1] - p[1]); if (dd <= bd) { bd = dd; best = o; } }); return best; }
    var drag = null;
    d.cv.addEventListener('touchstart', function (e) { var t = e.touches[0], b = d.cv.getBoundingClientRect(); if (hit([t.clientX - b.left, t.clientY - b.top])) e.preventDefault(); }, { passive: false });
    d.cv.addEventListener('pointerdown', function (e) { var o = hit(pos(e)); if (!o) return; drag = o; d.cv.setPointerCapture(e.pointerId); e.preventDefault(); d.cv.classList.add('grabbing'); if (o.start) o.start(); });
    d.cv.addEventListener('pointermove', function (e) {
      var p = pos(e);
      if (drag) { drag.set(p[0], p[1]); d.redraw(); return; }
      if (e.pointerType === 'mouse') d.cv.classList.toggle('grab', !!hit(p));
    });
    function up() { if (drag && drag.end) drag.end(); drag = null; d.cv.classList.remove('grabbing'); d.redraw(); }
    d.cv.addEventListener('pointerup', up); d.cv.addEventListener('pointercancel', up);
    d.dragging = function () { return !!drag; };
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
  var DM = window.EJUDemo = { reg: function (n, f) { REG[n] = f; }, P: P, COL: COL, fx: fx, sci: sci, arrow: arrow, txt: txt, line: line, dot: dot, Map: Map, axes: axes, bars: bars };
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
  var D = window.EJUDemo, P = D.P, C = D.COL, fx = D.fx, sci = D.sci, arrow = D.arrow, txt = D.txt, line = D.line, dot = D.dot, Map = D.Map, axes = D.axes, bars = D.bars;
  var F12 = '12px system-ui,"PingFang SC","Hiragino Sans","Noto Sans CJK SC",sans-serif';

  /* ① 中和滴定曲线 */
  D.reg('titr', function () {
    var m, Vb = 0, kind, pKa, Ca, Cb;
    return { aspect: 1.5, maxH: 520,
      init: function (d) {
        kind = d.seg('酸', [['strong', '强酸（HCl）'], ['weak', '弱酸（CH₃COOH 等）']], 'weak');
        pKa = d.slider('弱酸 pK<sub>a</sub>', 2, 10, 0.05, 4.76, function (v) { return fx(v, 2) + '（K<sub>a</sub> = ' + sci(Math.pow(10, -v), 1) + '）'; });
        Ca = d.slider('酸浓度 [mol/L]（10.0 mL）', 0.01, 0.2, 0.01, 0.1, function (v) { return fx(v, 2); });
        Cb = d.slider('NaOH 浓度 [mol/L]', 0.01, 0.2, 0.01, 0.1, function (v) { return fx(v, 2); });
        d.handle({ get: function () { return [m.X(Vb), m.Y(ph())]; }, set: function (x) { Vb = Math.max(0, Math.min(m.x1, m.ix(x))); } });
      },
      resize: function (d) { m = Map(0, 30, 0, 14, 42, d.W - 16, 18, d.H - 30); },
      draw: function (d, c) {
        var Ka = kind.v === 'strong' ? Infinity : Math.pow(10, -pKa.v), Veq = P.titrVeq(Ca.v, 10, Cb.v); m.x1 = Math.max(20, Math.min(60, Math.ceil(Veq * 2 / 5) * 5)); Vb = Math.min(Vb, m.x1);
        P.INDICATORS.forEach(function (ind, i) { c.fillStyle = [C.c2, C.c3, C.c4][i]; c.globalAlpha = 0.13; c.fillRect(m.L, m.Y(ind[2]), m.R - m.L, m.Y(ind[1]) - m.Y(ind[2])); c.globalAlpha = 1; txt(c, ind[0] + ' ' + ind[1] + '–' + ind[2], m.R - 4, m.Y((ind[1] + ind[2]) / 2), [C.c2, C.c3, C.c4][i], F12, 'right'); });
        axes(c, m, 'NaOH [mL]', 'pH', 5, 2);
        var pts = []; for (var i = 0; i <= 240; i++) { var v = m.x1 * i / 240; pts.push([m.X(v), m.Y(P.titrPH(Ca.v, 10, Ka, Cb.v, v))]); }
        line(c, pts, C.c1, 2.5);
        line(c, [[m.X(Veq), m.T], [m.X(Veq), m.B]], C['ink-3'], 1, [5, 4]); txt(c, '中和点', m.X(Veq), m.T + 8, C['ink-2'], F12);
        if (isFinite(Ka)) { dot(c, m.X(Veq / 2), m.Y(P.titrPH(Ca.v, 10, Ka, Cb.v, Veq / 2)), 4, C.c3); txt(c, '半中和 pH≈pKa', m.X(Veq / 2), m.Y(P.titrPH(Ca.v, 10, Ka, Cb.v, Veq / 2)) - 14, C.c3, F12); }
        var pe = P.titrPH(Ca.v, 10, Ka, Cb.v, Veq), p0 = P.titrPH(Ca.v, 10, Ka, Cb.v, 0);
        d.out([['加入 NaOH', fx(Vb, 2) + ' mL → pH = ' + fx(ph(), 2)], ['中和点', fx(Veq, 2) + ' mL，pH = ' + fx(pe, 2)], ['滴定前 pH', fx(p0, 2)], ['适合的指示剂', pe > 7.5 ? '酚酞（中和点在碱性侧）' : '甲基橙或酚酞都可（pH 突变范围宽）']],
          '拖动曲线上的点改变滴定量。弱酸的中和点在碱性侧（生成的弱酸根水解），所以用酚酞；半中和点附近是缓冲区，pH ≈ pK<sub>a</sub>。中和所需 NaOH 的量只取决于酸的物质的量，与强弱无关。');
        function n() { return 0; }
      } };
    function ph() { var Ka = kind.v === 'strong' ? Infinity : Math.pow(10, -pKa.v); return P.titrPH(Ca.v, 10, Ka, Cb.v, Vb); }
  });

  /* ② 理想气体 pV = nRT：活塞容器与 p–V 等温线 */
  D.reg('gas', function () {
    var m, n, T, V, parts = [];
    for (var i = 0; i < 60; i++) parts.push([Math.random(), Math.random(), Math.random() * 6.283]);
    return { aspect: 1.7, maxH: 460, animated: true,
      init: function (d) {
        n = d.slider('物质的量 n [mol]', 0.1, 2, 0.05, 0.5, function (v) { return fx(v, 2); });
        T = d.slider('温度 t [°C]', -73, 327, 1, 27, function (v) { return fx(v, 0) + '（T = ' + fx(v + 273, 0) + ' K）'; });
        d.handle({ get: function () { return [m.X(V), m.Y(p() / 1e5)]; }, set: function (x) { V = Math.max(2, Math.min(40, m.ix(x))); } });
        V = 12.45;
      },
      resize: function (d) { m = Map(0, 40, 0, 6, d.W * 0.42 + 40, d.W - 14, 16, d.H - 28); },
      step: function (d, dt) { var s = Math.sqrt((T.v + 273) / 300) * 0.9; parts.forEach(function (q) { q[0] += Math.cos(q[2]) * s * dt; q[1] += Math.sin(q[2]) * s * dt; if (q[0] < 0 || q[0] > 1) { q[2] = Math.PI - q[2]; q[0] = Math.max(0, Math.min(1, q[0])); } if (q[1] < 0 || q[1] > 1) { q[2] = -q[2]; q[1] = Math.max(0, Math.min(1, q[1])); } }); },
      draw: function (d, c) {
        var bw = d.W * 0.42 - 30, x0 = 16, yb = d.H - 28, h = (yb - 30) * V / 40, top = yb - h;
        c.strokeStyle = C['ink-2']; c.lineWidth = 2; c.strokeRect(x0, 24, bw, yb - 24);
        c.fillStyle = C['ink-3']; c.fillRect(x0 + 2, top - 10, bw - 4, 10); line(c, [[x0 + bw / 2, top - 10], [x0 + bw / 2, 16]], C['ink-3'], 4);
        var cnt = Math.round(12 * n.v * 2); for (var i = 0; i < Math.min(cnt, parts.length); i++) dot(c, x0 + 6 + parts[i][0] * (bw - 12), top + 4 + parts[i][1] * Math.max(2, h - 8), 3, C.c2);
        txt(c, 'V = ' + fx(V, 1) + ' L', x0 + bw / 2, yb + 14, C.ink, F12);
        axes(c, m, 'V [L]', 'p [×10⁵ Pa]', 10, 1);
        [[-73, C.c4], [27, C.c1], [327, C.c2]].forEach(function (q) { var k = n.v * P.RL * (q[0] + 273) / 1e5, pts = []; for (var v = 2; v <= 40; v += 0.25) pts.push([m.X(v), m.Y(Math.min(6.2, k / v))]); line(c, pts, q[1], 1, [4, 4]); });
        var k = n.v * P.RL * (T.v + 273) / 1e5, pts = []; for (var v = 2; v <= 40; v += 0.25) pts.push([m.X(v), m.Y(Math.min(6.2, k / v))]); line(c, pts, C.accent, 2.5);
        d.out([['p = nRT / V', sci(p(), 2) + ' Pa'], ['pV', sci(p() * V, 3) + ' Pa·L（= nRT）'], ['T', fx(T.v + 273, 0) + ' K']],
          '拖动等温线上的点改变体积（玻意耳定律：T 一定时 pV 一定）。虚线是 −73 °C、27 °C、327 °C 的等温线。R = 8.31×10³ Pa·L/(K·mol)，温度一定要换成 K。');
      } };
    function p() { return P.gasP(n.v, T.v + 273, V); }
  });

  /* ③ 密闭容器中的水：饱和蒸气压 */
  D.reg('vapor', function () {
    var m, t, n, V;
    return { aspect: 1.6, maxH: 480,
      init: function (d) {
        n = d.slider('水的物质的量 [mol]', 0.01, 0.3, 0.005, 0.1, function (v) { return fx(v, 3); });
        V = d.slider('容器体积 [L]', 1, 30, 0.1, 8.3, function (v) { return fx(v, 1); });
        t = d.slider('温度 [°C]', 0, 100, 1, 27, function (v) { return fx(v, 0); });
        d.handle({ get: function () { return [m.X(t.v), m.Y(Math.min(m.y1, P.waterBox(n.v, V.v, t.v).pw))]; }, set: function (x) { t.set(Math.round(Math.max(0, Math.min(100, m.ix(x))))); } });
      },
      resize: function (d) { m = Map(0, 100, 0, 110, 46, d.W - 16, 16, d.H - 28); },
      draw: function (d, c) {
        axes(c, m, 't [°C]', 'p [kPa]', 10, 20);
        var ps = []; for (var x = 0; x <= 100; x += 1) ps.push([m.X(x), m.Y(P.psat(x))]); line(c, ps, C.c1, 2.5); txt(c, '饱和蒸气压曲线', m.X(88), m.Y(P.psat(88)) - 16, C.c1, F12, 'right');
        var pa = []; for (x = 0; x <= 100; x += 1) pa.push([m.X(x), m.Y(Math.min(m.y1 + 5, n.v * P.RL * (x + 273.15) / V.v / 1000))]); line(c, pa, C.c2, 1.5, [5, 4]); txt(c, '假设全部为气体 p = nRT/V', m.X(4), m.Y(Math.min(m.y1, n.v * P.RL * 277 / V.v / 1000)) - 12, C.c2, F12, 'left');
        var w = P.waterBox(n.v, V.v, t.v);
        d.out([['全部气化时的压力', fx(w.pAll, 2) + ' kPa'], ['该温度的饱和蒸气压', fx(w.ps, 2) + ' kPa'], ['实际的水蒸气分压', fx(w.pw, 2) + ' kPa'], ['状态', w.liquid ? '有液态水（气态 ' + fx(w.nGas, 4) + ' mol）' : '全部为水蒸气']],
          '红色虚线在蓝色曲线上方时，水不能全部气化，多余部分凝结，分压被“封顶”在饱和蒸气压。排水集气时：p(气体) = 大气压 − 饱和水蒸气压。饱和蒸气压与容器体积、其他气体无关，只由温度决定。');
      } };
  });

  /* ④ 勒夏特列原理：N2O4 ⇌ 2NO2 */
  D.reg('lechat', function () {
    var T, Pt, ar, mode;
    return { aspect: 1.8, maxH: 420,
      init: function (d) {
        T = d.slider('温度 [K]', 260, 400, 1, 298, function (v) { return fx(v, 0) + '（' + fx(v - 273, 0) + ' °C）'; });
        Pt = d.slider('总压 [bar]', 0.1, 5, 0.05, 1, function (v) { return fx(v, 2); });
        ar = d.slider('加入 Ar 的摩尔分数', 0, 0.8, 0.05, 0, function (v) { return fx(v, 2); });
        mode = d.seg('加入 Ar 的方式', [['V', '定容'], ['P', '定压']], 'P');
      },
      draw: function (d, c) {
        var r = P.n2o4Inert(T.v, Pt.v, ar.v, mode.v), base = P.n2o4(298, 1), W = d.W, H = d.H;
        var bx = 20, bw = W * 0.42, by = 20, bh = H - 50, conc = r.pNO2 / (0.08314 * T.v);
        c.fillStyle = 'rgba(165,70,30,' + Math.min(0.9, conc * 9) + ')'; c.fillRect(bx, by, bw, bh); c.strokeStyle = C['ink-2']; c.lineWidth = 2; c.strokeRect(bx, by, bw, bh);
        txt(c, '颜色深浅 ∝ [NO₂]', bx + bw / 2, by + bh + 16, C['ink-2'], F12);
        bars(c, W * 0.52, 40, W * 0.44, H - 90, [['NO₂ 分压', r.pNO2, C.c2], ['N₂O₄ 分压', r.pN2O4, C.c1], ['Ar 分压', mode.v === 'P' ? Pt.v * ar.v : 0, C['ink-3']]], Math.max(1, Pt.v), '分压 [bar]');
        d.out([['K<sub>p</sub>(T)', fx(r.K, 3) + ' bar'], ['N₂O₄ 解离度 α', fx(r.alpha * 100, 1) + ' %'], ['[NO₂]', sci(conc, 2) + ' mol/L'], ['与 298 K・1 bar 相比', r.alpha > base.alpha + 1e-3 ? '向右（生成 NO₂）' : r.alpha < base.alpha - 1e-3 ? '向左（生成 N₂O₄）' : '相同']],
          '正反应吸热（ΔH ≈ +57 kJ/mol）：升温向右，颜色变深；加压向分子数少的左边。定容加入 Ar 平衡不移动，定压加入 Ar 相当于减压，向右移动。K<sub>p</sub>(298 K) ≈ 0.15 bar，用范特霍夫式估算其他温度（教科书近似值）。');
      } };
  });

  /* ⑤ 电解：法拉第定律计算器 */
  D.reg('faraday', function () {
    var I, tm, sp, m;
    return { aspect: 2.0, maxH: 380,
      init: function (d) {
        I = d.slider('电流 I [A]', 0.1, 10, 0.1, 1.0, function (v) { return fx(v, 1); });
        tm = d.slider('时间 t [s]', 0, 7200, 5, 965, function (v) { return fx(v, 0) + '（' + fx(v / 60, 1) + ' 分）'; });
        sp = d.seg('生成物', [['Ag', 'Ag'], ['Cu', 'Cu'], ['H2', 'H₂'], ['O2', 'O₂'], ['Cl2', 'Cl₂']], 'Ag');
        d.handle({ get: function () { return [m.X(tm.v), m.Y(val(tm.v))]; }, set: function (x) { tm.set(Math.round(Math.max(0, Math.min(7200, m.ix(x))) / 5) * 5); } });
      },
      resize: function (d) { m = Map(0, 7200, 0, 1, 52, d.W - 16, 16, d.H - 28); },
      draw: function (d, c) {
        var s = P.SPECIES[sp.v], max = val(7200) * 1.05 || 1; m.y1 = max;
        axes(c, m, 't [s]', s.gas ? 'V [L]（标准状况）' : '质量 [g]', 1800, niceStep(max));
        line(c, [[m.X(0), m.Y(0)], [m.X(7200), m.Y(val(7200))]], C.c1, 2.5);
        var r = P.faraday(I.v, tm.v, sp.v);
        d.out([['电量 Q = It', fx(r.Q, 0) + ' C'], ['电子 n(e⁻) = Q/F', sci(r.ne, 3) + ' mol'], [s.zh, sci(r.n, 3) + ' mol（每 1 mol 需 ' + s.z + ' mol e⁻）'], [s.gas ? '体积（0 °C, 1.013×10⁵ Pa）' : '质量', s.gas ? fx(r.V, 3) + ' L' : fx(r.m, 3) + ' g']],
          'F = 9.65×10⁴ C/mol。生成量与电量成正比：先求电子的物质的量，再除以 1 mol 生成物需要的电子数（Ag⁺ 1，Cu²⁺ 2，H₂ 2，Cl₂ 2，O₂ 4）。时间一定要用秒。');
      } };
    function val(t) { var r = P.faraday(I.v, t, sp.v); return P.SPECIES[sp.v].gas ? r.V : r.m; }
    function niceStep(x) { var e = Math.pow(10, Math.floor(Math.log10(x))), f = x / e; return (f < 2 ? 0.2 : f < 5 ? 0.5 : 1) * e * (f < 2 ? 1 : 1); }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', D.boot); else D.boot();
})();
