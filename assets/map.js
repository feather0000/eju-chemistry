/* 首页知识导图：悬停或键盘聚焦章 / 专题节点时，把无关的分支与联系弧调淡（.mp-off）。
   保持清晰的：本章全部（树干、树枝、插图、章节点、专题）、与该节点相连的联系弧、弧另一端的专题。中心科目名恢复全图 */
(function () {
  var svg = document.querySelector('#map .mp-svg'); if (!svg) return;
  var ds = svg.querySelectorAll('.mp-d');
  function show(a) {
    var ch = a && a.getAttribute('data-ch'), slug = a && a.getAttribute('data-slug');
    if (!ch) { ds.forEach(function (d) { d.classList.remove('mp-off'); }); return; }
    var mine = {}, keep = {};
    svg.querySelectorAll('.mp-tn[data-ch="' + ch + '"]').forEach(function (t) { mine[t.getAttribute('data-slug')] = 1; });
    ds.forEach(function (d) {
      var x = d.getAttribute('data-a'), y = d.getAttribute('data-b'), on;
      if (x) {
        on = slug ? (x === slug || y === slug) : (mine[x] || mine[y]);
        if (on) { keep[x] = keep[y] = 1; }
        d.classList.toggle('mp-off', !on);
      }
    });
    ds.forEach(function (d) {
      if (d.getAttribute('data-a')) return;
      var on = d.getAttribute('data-ch') === ch || (d.classList.contains('mp-tn') && keep[d.getAttribute('data-slug')]);
      d.classList.toggle('mp-off', !on);
    });
  }
  function node(e) { return e && e.closest ? e.closest('a') : null; }
  function rest() { var f = node(document.activeElement); show(f && svg.contains(f) ? f : null); }
  svg.addEventListener('pointerover', function (e) { var a = node(e.target); if (a) show(a); });
  svg.addEventListener('pointerout', function (e) { if (!node(e.relatedTarget)) rest(); });
  svg.addEventListener('focusin', function (e) { show(node(e.target)); });
  svg.addEventListener('focusout', function (e) { if (!svg.contains(e.relatedTarget)) show(null); });
})();
