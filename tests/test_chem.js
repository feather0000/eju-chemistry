/* 化学互动演示公式的数值检查：node tests/test_chem.js */
var P = require('../assets/chem.js'), n = 0, bad = 0;
function ok(name, got, exp, tol) { n++; tol = tol == null ? 1e-6 : tol; var e = Math.abs(got - exp) <= tol * Math.max(1, Math.abs(exp));
  if (!e) { bad++; console.log('FAIL', name, got, 'expected', exp); } }
function T(name, c) { n++; if (!c) { bad++; console.log('FAIL', name); } }
/* 滴定：强酸 */
ok('0.10 M HCl 初始 pH=1', P.titrPH(0.1, 10, Infinity, 0.1, 0), 1, 1e-3);
ok('强酸 中和点 pH=7', P.titrPH(0.1, 10, Infinity, 0.1, 10), 7, 1e-3);
ok('过量 5 mL NaOH pH=14+log(0.02)', P.titrPH(0.1, 10, Infinity, 0.1, 15), 14 + Math.log10(0.5 / 25), 1e-3);
ok('Veq = CaVa/Cb', P.titrVeq(0.1, 10, 0.05), 20);
/* 弱酸 */
var Ka = 1.74e-5, h = (-Ka + Math.sqrt(Ka * Ka + 4 * Ka * 0.1)) / 2;
ok('弱酸初始 pH（二次方程精确解）', P.titrPH(0.1, 10, Ka, 0.1, 0), -Math.log10(h), 1e-3);
ok('半中和点 pH≈pKa', P.titrPH(0.1, 10, Ka, 0.1, 5), -Math.log10(Ka), 3e-3);
var Cs = 0.05, Kb = 1e-14 / Ka; ok('中和点 pH（盐的水解）', P.titrPH(0.1, 10, Ka, 0.1, 10), 14 + Math.log10(Math.sqrt(Kb * Cs)), 3e-3);
T('弱酸中和点在碱性侧', P.titrPH(0.1, 10, Ka, 0.1, 10) > 8);
T('pH 随滴定量单调增', (function () { var p = -1; for (var v = 0; v <= 30; v += 0.5) { var q = P.titrPH(0.1, 10, Ka, 0.1, v); if (q < p - 1e-9) return false; p = q; } return true; })());
/* 理想气体 */
ok('1 mol, 273.15 K, 22.4 L ≈ 1.013×10⁵ Pa', P.gasP(1, 273.15, 22.4), 1.0132e5, 3e-3);
ok('站内题 0.50 mol 400 K 8.3 L', P.gasP(0.5, 400, 8.3), 2.0e5, 3e-3);
/* 饱和蒸气压 */
ok('psat 27 °C 表值', P.psat(27), 3.567); ok('psat 100 °C', P.psat(100), 101.42); ok('psat 线性插值 22.5', P.psat(22.5), (2.3393 + 3.1699) / 2);
var w = P.waterBox(0.1, 8.3, 27); T('站内题：0.10 mol 水 8.3 L 27 °C 有液体', w.liquid); ok('分压=饱和蒸气压', w.pw, 3.567);
w = P.waterBox(0.001, 10, 60); T('少量水全部气化', !w.liquid); ok('全部气化时 p=nRT/V', w.pw, 0.001 * 8314 * 333.15 / 10 / 1000);
/* N2O4 ⇌ 2NO2 */
var r = P.n2o4(298.15, 1); ok('Kp(298)=0.15', r.K, 0.15, 1e-9); ok('分压满足 Kp', r.pNO2 * r.pNO2 / r.pN2O4, r.K, 1e-9); ok('分压和=总压', r.pNO2 + r.pN2O4, 1, 1e-12);
T('升温 α 增大（吸热）', P.n2o4(350, 1).alpha > r.alpha); T('加压 α 减小', P.n2o4(298.15, 3).alpha < r.alpha);
ok('定容加 Ar 不移动', P.n2o4Inert(298.15, 1, 0.5, 'V').alpha, r.alpha); T('定压加 Ar 向右', P.n2o4Inert(298.15, 1, 0.5, 'P').alpha > r.alpha);
ok('范特霍夫：ΔH 由两温度的 K 还原', -8.314 * Math.log(P.KpT(350) / P.KpT(300)) / (1 / 350 - 1 / 300), 57.2e3, 1e-9);
/* 法拉第 */
ok('5.0 A × 1930 s = 0.10 mol e⁻', P.faraday(5, 1930, 'Ag').ne, 0.1, 2e-4);
ok('Ag 1.0 A 965 s ≈ 1.08 g', P.faraday(1, 965, 'Ag').m, 1.079, 2e-3);
ok('0.40 mol e⁻ → O₂ 2.24 L', P.faraday(0.4 * 96485, 1, 'O2').V, 2.24, 1e-9);
ok('Cu: 2.0 A 965 s → 0.635 g', P.faraday(2, 965, 'Cu').m, 0.6355, 2e-3);
console.log(n + ' demo formula checks, ' + bad + ' failures'); process.exit(bad ? 1 : 0);
