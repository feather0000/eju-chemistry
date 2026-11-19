/* 站内搜索：构建时生成 assets/search.json，进入页面后才加载；子串匹配（中日汉字写法归一、片假名→平假名），无结果时用二元组近似匹配 */
(function () {
  'use strict';
  var $ = function (i) { return document.getElementById(i); }, IDX = null, ROOT = '../../', TYPE = '';
  var V = '電电気气圧压熱热運运動动質质線线場场衝冲張张撃击様样単单弾弹転转換换変变発发応应対对塩盐鉄铁銅铜銀银鉛铅亜亚結结価价錯错種种細细遺遗伝传経经脳脑腎肾臓脏葉叶緑绿進进環环態态統统類类計计測测験验検检実实際际関关係系図图円圆軌轨衛卫誘诱導导極极陽阳陰阴離离鏡镜渉涉層层濃浓飽饱騰腾華华昇升両两個个時时間间長长東东車车読读語语説说問问題题習习練练試试録录写写帰归還还決决減减増增効效黒黑楽乐薬药継继異异優优顕显隠隐雑杂純纯殖殖筋筋節节軸轴興兴奮奋覚觉視视聴听網网腸肠膵胰産产費费養养階阶級级遷迁縁缘適适億亿鉱矿鋼钢錫锡帯带軽轻属属蔵藏収收縮缩擬拟広广囲围軸轴転转漸渐窒窒酸酸硝硝碳碳炭炭鍵键復复複复製制転转訳译号号號号積积標标準准縦纵横横総总数数値值数数殻壳歯齿貯贮蓄蓄臨临界界義义虫虫織织組组営营専专団团則则観观察察験验証证誤误差差圧压鉛铅銭钱錬炼鋳铸鍛锻剤剂蒸蒸気气滅灭殺杀菌菌飼饲餌饵鶏鸡魚鱼鳥鸟馬马豊丰栄荣労劳働动閉闭開开関关門门問问間间聞闻陸陆陰阴隣邻隔隔頂顶項项順顺預预領领頭头題题顔颜願愿風风飛飞養养骨骨髄髓体体弁瓣窓窗竜龙仏佛偽伪傷伤価价侵侵促促亀龟絶绝続续綿绵緩缓縁缘纏缠繊纤維维緯纬線线細细紅红紀纪約约級级純纯紙纸紫紫索索累累経经給给絡络統统結结絵绘絹绢';
  var M = {}; for (var i = 0; i < V.length; i += 2) M[V[i]] = V[i + 1];
  function norm(s) { s = String(s); var o = ''; for (var i = 0; i < s.length; i++) { var c = s[i], k = c.charCodeAt(0);
      if (k >= 0xff01 && k <= 0xff5e) c = String.fromCharCode(k - 0xfee0); else if (k >= 0x30a1 && k <= 0x30f6) c = String.fromCharCode(k - 0x60); else if (M[c]) c = M[c];
      o += c.toLowerCase().length === 1 ? c.toLowerCase() : c; } return o; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function bigr(s) { var b = {}; s = s.replace(/\s+/g, ''); for (var i = 0; i < s.length - 1; i++) b[s.substr(i, 2)] = 1; if (s.length === 1) b[s] = 1; return Object.keys(b); }
  /* 摘要里的公式：索引正文保留了 $…$ 源码。截取窗口时不把公式切成两半，公式段原样输出（不加高亮标记），
     结果写入页面后交给 KaTeX 渲染；索引在 900 字处截断留下的半个公式（落单的 $ 之后）不显示。 */
  var MATH = /\$\$[^$]+\$\$|\$[^$]+\$/g;
  function spans(raw) { var m, S = [], end = raw.length, q = 0; MATH.lastIndex = 0;
    while ((m = MATH.exec(raw))) { var d = raw.slice(q, m.index).indexOf('$'); if (d >= 0) { end = q + d; break; } S.push([m.index, m.index + m[0].length]); q = m.index + m[0].length; }
    if (end === raw.length) { var d2 = raw.slice(q).indexOf('$'); if (d2 >= 0) end = q + d2; }
    return { S: S.filter(function (x) { return x[1] <= end; }), end: end }; }
  function snip(raw, nt, toks) {
    var sp = spans(raw), S = sp.S, end = sp.end;
    var p = -1, L = 0; toks.forEach(function (t) { var j = nt.indexOf(t); if (j >= 0 && j < end && (p < 0 || j < p)) { p = j; L = t.length; } });
    var a = p < 0 ? 0 : Math.max(0, p - 40), b = Math.min(end, p < 0 ? 110 : p + L + 70);
    S.forEach(function (x) { if (x[0] < a && a < x[1]) a = x[0]; if (x[0] < b && b < x[1]) b = x[1]; });
    var out = '', i = a, k = 0;
    while (i < b) {
      while (k < S.length && S[k][1] <= i) k++;
      if (k < S.length && S[k][0] === i) { out += '<span class="sx-m">' + esc(raw.slice(i, S[k][1])) + '</span>'; i = S[k][1]; continue; }
      var lim = k < S.length ? Math.min(b, S[k][0]) : b, hit = 0;
      toks.forEach(function (t) { if (t && i + t.length <= lim && nt.substr(i, t.length) === t && t.length > hit) hit = t.length; });
      if (hit) { out += '<mark>' + esc(raw.substr(i, hit)) + '</mark>'; i += hit; } else { out += esc(raw[i]); i++; }
    }
    return (a > 0 ? '…' : '') + out + (raw.length > b ? '…' : '');
  }
  function tex(el) { if (window.renderMathInElement) try { window.renderMathInElement(el, { delimiters: [{ left: '$$', right: '$$', display: false }, { left: '$', right: '$', display: false }], macros: { '\\B': '\\boxed{\\text{#1}}' }, throwOnError: false }); } catch (e) {} }
  var KINDS = ['', '题', '讲解', '公式', '易错', '技巧', '演示', '术语', '数据', '页'];
  function chips() {
    var w = $('sx-types'); w.innerHTML = KINDS.map(function (k) { return '<button type="button" class="chip" aria-pressed="' + (k === TYPE) + '" data-k="' + k + '">' + (k || '全部') + '</button>'; }).join('');
    w.onclick = function (e) { var b = e.target.closest('button'); if (!b) return; TYPE = b.getAttribute('data-k'); chips(); run(); };
  }
  var shown = 60;
  function run(more) {
    var raw = $('sx-q').value.trim(), res = $('sx-res'), stat = $('sx-stat');
    if (!more) shown = 60;
    try { var u = new URL(location.href); if (raw) u.searchParams.set('q', raw); else u.searchParams.delete('q'); history.replaceState(null, '', u); } catch (e) {}
    if (!raw) { res.innerHTML = ''; stat.textContent = '输入关键词（中文、日本語、かな或公式符号都可以），空格分隔多个关键词。'; return; }
    if (!IDX) { stat.textContent = '正在加载索引…'; return; }
    var toks = norm(raw).split(/\s+/).filter(Boolean), R = [];
    IDX.forEach(function (e) { if (TYPE && e[0] !== TYPE) return; var nt = e.nt, ok = true, sc = 0;
      toks.forEach(function (t) { var a = e.ns.indexOf(t), b = nt.indexOf(t); if (a < 0 && b < 0) ok = false; else sc += (a >= 0 ? 10 : 0) + (b >= 0 ? 2 : 0) + (e.ns === t ? 20 : 0); });
      if (ok) R.push([sc + (e[0] === '公式' || e[0] === '术语' || e[0] === '技巧' ? 1 : 0), e]); });
    var fuzzy = false;
    if (!R.length) { var B = bigr(toks.join('')); if (B.length) { fuzzy = true; IDX.forEach(function (e) { if (TYPE && e[0] !== TYPE) return; var h = 0; B.forEach(function (b) { if (e.ns.indexOf(b) >= 0 || e.nt.indexOf(b) >= 0) h++; }); var f = h / B.length; if (f >= 0.6) R.push([f, e]); }); } }
    R.sort(function (a, b) { return b[0] - a[0]; });
    stat.textContent = R.length ? (fuzzy ? '没有完全匹配，下面是相近的 ' : '找到 ') + R.length + ' 条结果' + (R.length > shown ? '，显示前 ' + shown + ' 条' : '') + '。' : '没有找到“' + raw + '”。试试换个写法（日语／中文）或更短的关键词。';
    var hl = fuzzy ? bigr(toks.join('')) : toks;
    res.innerHTML = R.slice(0, shown).map(function (r) { var e = r[1];
      return '<li><span class="k">' + e[0] + '</span><a href="' + ROOT + e[3] + '"><span>' + snip(e[1], e.ns, hl) + '</span></a><p>' + snip(e[2], e.nt, hl) + '</p></li>'; }).join('') +
      (R.length > shown ? '<li><button type="button" class="chip" id="sx-more">显示更多</button></li>' : '');
    tex(res);
    var m = $('sx-more'); if (m) m.onclick = function () { shown += 60; run(true); };
  }
  var tm = 0; $('sx-q').addEventListener('input', function () { clearTimeout(tm); tm = setTimeout(run, 120); });
  try { $('sx-q').value = new URL(location.href).searchParams.get('q') || ''; } catch (e) {}
  chips(); run(); $('sx-q').focus({ preventScroll: true });
  fetch(ROOT + 'assets/search.json').then(function (r) { return r.json(); }).then(function (d) {
    IDX = d; IDX.forEach(function (e) { e.ns = norm(e[1]); e.nt = norm(e[2]); }); window.__sxReady = d.length; run();
  }).catch(function () { $('sx-stat').textContent = '索引加载失败，请检查网络后刷新。'; });
})();
