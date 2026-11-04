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
