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
