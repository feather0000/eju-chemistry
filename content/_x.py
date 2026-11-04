# 共用：公式速查 / 易错点 / 术语卡片 / 站内搜索 页面生成（三个理科站点同一份文件）
import glob, importlib.util, os, json, re, html as H
HERE = os.path.dirname(os.path.abspath(__file__))
def others(maxn):
    out = []
    for f in sorted(glob.glob(os.path.join(HERE, '[0-9]*.py'))):
        n = int(os.path.basename(f).split('_')[0])
        if n >= maxn: continue
        s = importlib.util.spec_from_file_location('o%d' % n, f); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); out.append(m.TOPIC)
    return out
def esc(s): return H.escape(s, quote=True)

# ---------- 公式速查 ----------
def formula_sections(TOP, F):
    """F = [(slug, secid, 标题, 日本語, [(latex, 条件), ...]), ...]"""
    by = {t['slug']: t for t in TOP}; secs = []; seen = []
    for slug, sid, tt, ja, rows in F:
        t = by[slug]
        assert sid is None or any(s[0] == sid for s in t['sections']), (slug, sid)
        href = f'../{slug}/' + (f'#{sid}' if sid else '')
        body = '<div class="tw"><table class="ftab"><tr><th>公式</th><th>成立条件・注意</th></tr>' + ''.join(
            f'<tr><td>$${l}$$</td><td>{c}</td></tr>' for l, c in rows) + '</table></div>' + \
            f'<p class="more"><a href="{href}">→ {t["n"]} {t["zh"]}（{t["ja"]}）讲解与练习</a></p>'
        key = 'f-' + slug + ('-' + sid if sid else '')
        secs.append((key, tt, ja, body))
    return secs

# ---------- 易错点 ----------
CATS = {'unit': ('单位换算', '単位'), 'sig': ('有效数字・近似', '有効数字'), 'cond': ('条件・前提', '条件'),
        'sign': ('符号・方向', '符号・向き'), 'concept': ('概念混淆', '概念'), 'read': ('读题・图表', '読み取り')}
def pitfall_sections(TOP, PF):
    """PF = [(cat, 标题, 错误想法, 正确做法, 例(html), [(slug, 'p3' 或 secid), ...]), ...]"""
    by = {t['slug']: t for t in TOP}; groups = {}
    order = [c for c in CATS]; PF = sorted(PF, key=lambda r: order.index(r[0]))
    for i, (cat, tt, wrong, right, ex, links) in enumerate(PF):
        L = []
        for slug, anc in links:
            t = by[slug]
            if anc.startswith('p') and anc[1:].isdigit(): assert int(anc[1:]) <= len(t['problems']), (slug, anc); lab = f'{t["zh"]} 问 {anc[1:]}'
            else: assert any(s[0] == anc for s in t['sections']) or anc in ('practice', 'examples'), (slug, anc); lab = f'{t["zh"]} · ' + next((s[1] for s in t['sections'] if s[0] == anc), anc)
            L.append(f'<a href="../{slug}/#{anc}">{lab}</a>')
        groups.setdefault(cat, []).append(
            f'<article class="q pit" id="pit{i+1}"><div class="q-head"><b>{i+1}. {tt}</b><span class="origin">{CATS[cat][0]}</span></div>'
            f'<p class="pit-x"><span class="tag bad">✗ 常见错误</span> {wrong}</p><p class="pit-o"><span class="tag ok">✓ 正确做法</span> {right}</p>'
            f'<div class="box"><p><strong>例</strong>　{ex}</p></div><p class="more">相关：{"　".join(L)}</p></article>')
    return [('pf-' + c, CATS[c][0], CATS[c][1], ''.join(groups[c])) for c in CATS if c in groups]

# ---------- 术语卡片 ----------
def term_sections(TOP, site):
    seen = set(); D = []
    for t in TOP:
        for row in t['terms']:
            zh, ja, kana = row[0], row[1], row[2]
            k = (zh, ja)
            if k in seen: continue
            seen.add(k); D.append([zh, ja, kana, t['zh'], t['slug']])
    data = json.dumps(D, ensure_ascii=False).replace('</', '<\\/')
    tops = ''.join(f'<option value="{t["slug"]}">{t["n"]} {esc(t["zh"])}</option>' for t in TOP if t['terms'])
    ui = f'''<div class="tc-bar"><label class="tc-f">专题 <select id="tc-top"><option value="">全部（{len(D)} 词）</option>{tops}</select></label>
<label class="tc-f">筛选 <input id="tc-q" type="search" placeholder="中文 / 日本語 / かな" autocomplete="off"></label>
<span class="tc-seg" role="group" aria-label="模式"><button type="button" class="chip" id="tc-m-list" aria-pressed="true">卡片列表</button><button type="button" class="chip" id="tc-m-fc" aria-pressed="false">自测（闪卡）</button></span></div>
<p id="tc-voice" class="jp-sub"></p>
<div id="tc-list" class="tc-grid" aria-live="polite"></div>
<div id="tc-fc" hidden><div class="tc-bar"><span class="tc-seg" role="group" aria-label="方向"><button type="button" class="chip" id="tc-d-jc" aria-pressed="true">看日语 → 想中文</button><button type="button" class="chip" id="tc-d-cj" aria-pressed="false">看中文 → 想日语</button></span>
<button type="button" class="chip" id="tc-shuf">🔀 洗牌</button><label class="tc-f tc-chk"><input type="checkbox" id="tc-only"> 只练没记住的</label><button type="button" class="chip" id="tc-reset">清除进度</button></div>
<div class="tc-card" id="tc-card"><p class="tc-pos" id="tc-pos"></p><p class="tc-front" id="tc-front" lang="ja"></p><p class="tc-kana" id="tc-fkana"></p><div id="tc-back" hidden><p class="tc-backm" id="tc-bm"></p><p class="tc-kana" id="tc-bk"></p><p class="tc-src" id="tc-src"></p></div>
<div class="tc-acts"><button type="button" class="chip" id="tc-say">🔊 读音</button><button type="button" class="chip" id="tc-flip">翻面</button><button type="button" class="chip bad" id="tc-no" hidden>✗ 没记住</button><button type="button" class="chip ok" id="tc-yes" hidden>✓ 记住了</button></div></div>
<p class="jp-sub" id="tc-stat"></p></div>
<script>window.TC_DATA={data};window.TC_KEY="eju-{site}-terms-v1";</script><script src="../../assets/terms.js" defer></script>'''
    return [('cards', '术语卡片', '用語カード', ui)], len(D)

# ---------- 搜索页 ----------
def search_sections():
    ui = '''<form class="sx-form" role="search" onsubmit="return false"><input id="sx-q" type="search" placeholder="例：饱和蒸气压 / 飽和蒸気圧 / 楞次 / pV=nRT" autocomplete="off" aria-label="搜索"><span class="sx-seg" id="sx-types"></span></form>
<p class="jp-sub" id="sx-stat">输入关键词（中文、日本語、かな或公式符号都可以），空格分隔多个关键词。</p><ol id="sx-res" class="sx-res"></ol><script src="../../assets/search.js" defer></script>'''
    return [('search', '站内搜索', 'サイト内検索', ui)]

# ---------- 索引 ----------
TAG = re.compile(r'<script.*?</script>|<style.*?</style>|<[^>]+>', re.S)
def plain(s): return re.sub(r'\s+', ' ', H.unescape(TAG.sub(' ', s))).strip()
def build_index(TOPICS, out='assets/search.json', skip=('search',)):
    I = []
    for t in TOPICS:
        if t['slug'] in skip: continue
        u = f'topics/{t["slug"]}/'
        I.append(['页', f'{t["n"]} {t["zh"]}', plain(t['ja'] + ' ' + t.get('lead', '')), u])
        kind = {'formulas': '公式', 'pitfalls': '易错', 'constants': '数据', 'terms': '术语', 'tips': '技巧'}.get(t['slug'], '讲解')
        for sid, tt, ja, body in t['sections']:
            if t['slug'] == 'terms': continue
            if t['slug'] == 'tips':
                for m in re.finditer(r'<article class="q tip" id="(tip\d+)"><div class="q-head"><b>(.*?)</b>(.*?)</article>', body, re.S):
                    I.append([kind, detex(plain(m.group(2))), detex(plain(m.group(3)))[:700], u + '#' + m.group(1)])
                continue
            I.append([kind, f'{t["zh"]} · {tt}', plain(ja + ' ' + body)[:900], u + '#' + sid])
        for k, p in enumerate(t['problems']):
            I.append(['题', f'{t["zh"]} 问 {k+1}', plain(p['q'] + ' ' + ' / '.join(p['opts']))[:600], u + f'#p{k+1}'])
        for k, e in enumerate(t['examples']):
            I.append(['题', f'{t["zh"]} 例题 {k+1} {plain(e[0])}', plain(e[1])[:500], u + '#examples'])
        for row in t['terms']:
            I.append(['术语', f'{row[0]}　{row[1]}', f'{row[2]} · {t["zh"]}', u + '#terms'])
    open(out, 'w').write(json.dumps(I, ensure_ascii=False, separators=(',', ':')))
    return len(I)

# ---------- 快速解题技巧 ----------
# TIPS = [dict(slug, t=标题, ja, when, steps=[...], ex=html, chk=[(python表达式, 期望值), ...], links=[(slug, anc)], save, fail, top=0/名次), ...]
import math as _m
def tip_check(TIPS):
    n = 0; ns = {k: getattr(_m, k) for k in dir(_m) if not k.startswith('_')}
    ns.update(comb=_m.comb, perm=_m.perm, Fr=__import__('fractions').Fraction)
    for i, tp in enumerate(TIPS):
        for e, want in tp.get('chk', []):
            v = eval(e, ns); n += 1
            assert abs(float(v) - float(want)) <= 1e-9 + 0.006 * abs(float(want)), ('TIP CHECK FAIL', tp['t'], e, v, want)
    return n
def _tlink(by, slug, anc):
    t = by[slug]
    if anc.startswith('p') and anc[1:].isdigit():
        if t.get('problems'): assert int(anc[1:]) <= len(t['problems']), (slug, anc)
        return f'<a href="../{slug}/#{anc}">{esc(t["zh"])} 问 {anc[1:]}</a>'
    assert any(s[0] == anc for s in t['sections']) or anc in ('practice', 'examples'), (slug, anc)
    return f'<a href="../{slug}/#{anc}">{esc(t["zh"])} · ' + next((s[1] for s in t['sections'] if s[0] == anc), {'practice': '练习', 'examples': '例题'}.get(anc, anc)) + '</a>'
def tips_sections(TOP, TIPS, weight):
    """weight: slug -> (数值, 标签)；按频度从高到低排列专题"""
    by = {t['slug']: t for t in TOP}; tip_check(TIPS)
    for i, tp in enumerate(TIPS): tp['id'] = f'tip{i+1}'
    order = sorted({tp['slug'] for tp in TIPS}, key=lambda s: (-weight.get(s, (0, ''))[0], by[s]['n']))
    def art(i, tp):
        st = ''.join(f'<li>{s}</li>' for s in tp['steps'])
        L = '　'.join(_tlink(by, s, a) for s, a in tp['links'])
        star = f'<span class="tip-top">TOP {tp["top"]}</span>' if tp.get('top') else ''
        return (f'<article class="q tip" id="{tp["id"]}"><div class="q-head"><b>{tp["t"]}</b>{star}<span class="origin" lang="ja">{tp["ja"]}</span></div>'
                f'<p><span class="tag ok">何时用</span> {tp["when"]}</p><ol class="tip-steps">{st}</ol>'
                f'<div class="box"><p><strong>例</strong>　{tp["ex"]}</p></div>'
                f'<p class="tip-save"><span class="tag ok">⏱ 省时</span> {tp["save"]}</p><p class="pit-x"><span class="tag bad">⚠ 失效</span> {tp["fail"]}</p>'
                + (f'<p class="more">相关：{L}</p>' if L else '') + '</article>')
    tops = sorted([tp for tp in TIPS if tp.get('top')], key=lambda tp: tp['top'])
    rows = ''.join(f'<li><a href="#{tp["id"]}"><b>{tp["t"]}</b></a> <span class="jp-sub" style="display:inline">— {by[tp["slug"]]["zh"]} · {tp["when"]}</span></li>' for tp in tops)
    secs = [('top10', '最值得掌握的 10 招', '最優先の10テクニック', f'<p>综合<b>过去问出题频度</b>（该专题题数越多越优先）和<b>可用范围</b>挑出。先把这 10 招练熟。</p><ol class="tip-top10">{rows}</ol>')]
    for s in order:
        w = weight.get(s, (0, ''))
        arts = ''.join(art(i, tp) for i, tp in enumerate(TIPS) if tp['slug'] == s)
        secs.append(('t-' + s, f'{by[s]["n"]} {by[s]["zh"]}', f'{by[s]["ja"]}　{w[1]}', arts + f'<p class="more"><a href="../{s}/">→ 回到 {esc(by[s]["zh"])} 讲解与练习</a></p>'))
    return secs
def tip_backsec(slug, TIPS, base='../tips/'):
    T = [tp for tp in TIPS if tp['slug'] == slug or any(l[0] == slug for l in tp['links'])]
    if not T: return None
    li = ''.join(f'<li><a href="{base}#{tp["id"]}">{tp["t"]}</a> — {tp["when"]}</li>' for tp in T)
    return ('tips', '快速解题技巧', '速解テクニック', f'<ul class="tip-back">{li}</ul><p class="more"><a href="{base}">→ 全部快速解题技巧（最值得掌握的 10 招）</a></p>')
_G = {'alpha': 'α', 'beta': 'β', 'theta': 'θ', 'lambda': 'λ', 'mu': 'μ', 'pi': 'π', 'Delta': 'Δ', 'varepsilon': 'ε', 'rho': 'ρ', 'omega': 'ω', 'Phi': 'Φ', 'sqrt': '√', 'times': '×', 'cdot': '·', 'le': '≤', 'ge': '≥', 'to': '→', 'parallel': '∥', 'prime': '′', 'circ': '°', 'propto': '∝', 'infty': '∞', 'pm': '±', 'nmid': '∤', 'vec': ''}
def detex(s):
    """搜索索引用：把 $…$ 中的 LaTeX 变成可读的纯文本"""
    def f(m):
        x = m.group(1)
        x = re.sub(r'\\[td]?frac\{([^{}]*)\}\{([^{}]*)\}', r'(\1)/(\2)', x); x = re.sub(r'\\[td]?frac(\d)(\d)', r'\1/\2', x)
        x = re.sub(r'\\(?:ce|mathrm|text|B|boxed|left|right)\b', '', x)
        x = re.sub(r'\\([A-Za-z]+)', lambda k: _G.get(k.group(1), k.group(1)), x)
        x = x.replace('\\,', ' ').replace('{', '').replace('}', '').replace('^2', '²').replace('^3', '³').replace('^′', '′')
        return x
    return re.sub(r'\$\$?(.+?)\$\$?', f, s)
