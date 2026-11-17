import importlib.util, glob, os, json, html, sys, math
import mapkids
sys.path.insert(0,"content")
open('assets/demos.js','w').write(''.join(open(f).read() for f in ['assets/chem.js']+sorted(glob.glob('demos_src/*.js'))))
DEMOS={
'acid-base':[('titr','中和滴定曲线','中和滴定曲線','切换强酸／弱酸，调浓度和 pK<sub>a</sub>，拖动点看 pH、中和点与指示剂变色范围；也可转动滴定管旋塞滴加 NaOH。')],
'gas':[('gas','理想气体 pV = nRT','理想気体の状態方程式','改变 n、温度，拖动活塞或等温线上的点改变体积。'),('vapor','密闭容器中的水与饱和蒸气压','飽和蒸気圧','判断水是否全部气化，读出实际的水蒸气分压；可拖活塞或温度计。')],
'equilibrium':[('lechat','勒夏特列原理：N₂O₄ ⇌ 2NO₂','ルシャトリエの原理','改变温度、总压，或在定容／定压下加入 Ar，看平衡移动与颜色；可推活塞、转 Ar 阀门。')],
'electrolysis':[('faraday','法拉第定律计算器','ファラデーの法則','设定电流、时间与生成物，算出电子、物质的量、质量或气体体积；可拖电源旋钮调电流。')],
}
def demosec(t):
    ds=DEMOS.get(t['slug'],[])
    if not ds: return ''
    body=''.join(f'<div class="demo" data-demo="{k}" data-title="{zh}"><h3>{zh}</h3><p class="demo-desc">{jp}　{desc}</p></div>' for k,zh,jp,desc in ds)
    return f'<section id="demo"><h2>互动演示</h2><p class="jp-sub">インタラクティブ・デモ（可拖动・调参数；离开画面自动暂停）</p>{body}</section>'
TOPICS=[]
for f in sorted(glob.glob('content/[0-9]*.py')):
    s=importlib.util.spec_from_file_location(os.path.basename(f)[:-3],f); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); TOPICS.append(m.TOPIC)
MARK='①②③④⑤⑥'
# DEMO-HOOK
from _x import demo_hub
TOPICS = [t for t in TOPICS if t['slug'] != 'demos']
_k = next((i for i, t in enumerate(TOPICS) if not (t.get('bank') or t['problems'])), len(TOPICS))
TOPICS.insert(_k, demo_hub(TOPICS, DEMOS))
# TIPS-HOOK
_TIPS = next((t.get('tips_data') for t in TOPICS if t.get('tips_data')), None)
if _TIPS:
    from _x import tip_backsec
    for t in TOPICS:
        if t.get('bank') or t['problems']:
            t['sections'] = [s for s in t['sections'] if s[0] != 'tips']
            _s = tip_backsec(t['slug'], _TIPS)
            if _s: t['sections'].append(_s)
# THEME-JS：头脚本（首次绘制前定主题并同步 <meta name="color-scheme">）与主题切换（四站同一份）
HEADJS = """<script>(function(){var d=document.documentElement,m=document.querySelector('meta[name="color-scheme"]'),t=null;try{t=localStorage.getItem('eju-theme')}catch(e){}if(t!=='light'&&t!=='dark')t=window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';d.setAttribute('data-theme',t);if(m)m.content=t})()</script>"""
TOGGLEJS = """<script>(function(){var d=document.documentElement,b=document.getElementById('theme');if(!b)return;function s(t){d.setAttribute('data-theme',t);var m=document.querySelector('meta[name="color-scheme"]');if(m)m.content=t;b.textContent=t==='dark'?'浅色':'深色';b.setAttribute('aria-label',t==='dark'?'切换到浅色主题':'切换到深色主题')}s(d.getAttribute('data-theme')==='dark'?'dark':'light');b.onclick=function(){var t=d.getAttribute('data-theme')==='dark'?'light':'dark';s(t);try{localStorage.setItem('eju-theme',t)}catch(e){}};addEventListener('storage',function(e){if(e.key==='eju-theme'&&(e.newValue==='light'||e.newValue==='dark'))s(e.newValue)});var q=window.matchMedia&&matchMedia('(prefers-color-scheme: dark)');if(q&&q.addEventListener)q.addEventListener('change',function(e){var v=null;try{v=localStorage.getItem('eju-theme')}catch(_){}if(v!=='light'&&v!=='dark')s(e.matches?'dark':'light')})})();</script>"""
# SITE-META：每站主色（<html data-site>）、favicon、OG / Twitter 分享卡片（og:image 用绝对 URL）、共用交互脚本
SITE = 'chemistry'; SITE_NAME = 'EJU 理科 化学'; SITE_PATH = '/eju-chemistry/'; SITE_URL = 'https://feather0000.github.io' + SITE_PATH
SITE_DESC = '按 JASSO《日本留学試験 理科シラバス（化学）》编排：物质的构成・物质的状态与变化・化学反应・无机物质・有机化合物・高分子。每页含要点讲解（中文 + 日语术语）、关键公式、原创例题和带解答的 EJU 风格选择题。'
def headmeta(title, desc, path, root):
    t, d = html.escape(title), html.escape(html.unescape(desc))
    return (f'<meta name="description" content="{d}">'
            f'<link rel="icon" href="{root}assets/favicon.svg" type="image/svg+xml"><link rel="icon" href="{root}assets/favicon-32.png" sizes="32x32" type="image/png"><link rel="apple-touch-icon" href="{root}assets/apple-touch-icon.png">\n'
            f'<meta property="og:type" content="website"><meta property="og:site_name" content="{SITE_NAME}"><meta property="og:locale" content="zh_CN"><meta property="og:title" content="{t}"><meta property="og:description" content="{d}"><meta property="og:url" content="{SITE_URL}{path}">'
            f'<meta property="og:image" content="{SITE_URL}assets/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="{SITE_NAME} · 全专题中文讲义">'
            f'<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{t}"><meta name="twitter:description" content="{d}"><meta name="twitter:image" content="{SITE_URL}assets/og.png">\n')
def page(t):
    meta = headmeta(f'{SITE_NAME} · {t["n"]} {t["zh"]}', t["lead"], f'topics/{t["slug"]}/', '../../')
    toc=[(sid,tt) for sid,tt,_,_ in t['sections']]+([('demo','互动演示')] if DEMOS.get(t['slug']) else [])+([('examples','例题')] if t['examples'] else [])+([('practice','练习题')] if t['problems'] else [])+([('terms','术语对照')] if t['terms'] else [])
    tochtml=''.join(f'<li><a href="#{i}">{k+1} {tt}</a></li>' for k,(i,tt) in enumerate(toc))
    secs=''.join(f'<section id="{sid}"><h2>{tt}</h2><p class="jp-sub">{jp}</p>{body}</section>' for sid,tt,jp,body in t['sections'])
    ex=''.join(f'<article class="q"><div class="q-head"><b>例题 {k+1}　{e[0]}</b></div>{e[1]}<details><summary>解答</summary><div class="ans">{e[2]}</div></details></article>' for k,e in enumerate(t['examples']))
    pr=''
    for k,p in enumerate(t['problems']):
        opts=''.join(f'<li>{MARK[j]} {o}</li>' for j,o in enumerate(p['opts']))
        pr+=(f'<article class="q" id="p{k+1}"><div class="q-head"><b>问 {k+1}</b>{'<span class="origin hf">原创 · 过去问高频题型</span>' if p.get("new") else '<span class="origin">原创 · EJU 风格</span>'}</div><p>{p["q"]}</p><ol class="opts">{opts}</ol>'
             f'<details><summary>解答</summary><div class="ans"><p><strong>正解：{MARK[p["ans"]]}</strong></p>{p["sol"]}</div></details></article>')
    terms=''.join(f'<tr><td>{a}</td><td lang="ja">{b}</td><td class="kana" lang="ja">{c}</td></tr>' for a,b,c in t['terms'])
    hero=''.join(f'$${h}$$' for h in t['hero'])
    EX=f'''<section id="examples"><h2>例题</h2><p class="jp-sub">例題</p>{ex}</section>''' if t['examples'] else ''
    PR=f'''<section id="practice"><h2>练习题</h2><p class="jp-sub">練習問題（{len(t["problems"])} 题，选择题；原子量 H 1.0, C 12, N 14, O 16, Na 23, Mg 24, Al 27, S 32, Cl 35.5, K 39, Ca 40, Fe 56, Cu 63.5, Ag 108，另有说明除外）</p>{pr}</section>''' if t['problems'] else ''
    TE=f'''<section id="terms"><h2>术语对照</h2><p class="jp-sub">用語</p><div class="tw"><table><tr><th>中文</th><th>日本語</th><th>读法</th></tr>{terms}</table></div></section>''' if t['terms'] else ''
    return f'''<!DOCTYPE html><html lang="zh-CN" data-site="{SITE}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="color-scheme" content="light dark">
{HEADJS}<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<title>EJU 理科 化学 · {t["n"]} {t["zh"]}</title>{meta}<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" integrity="sha384-nB0miv6/jRmo5UMMR1wu3Gz6NLsoTkbqJghGIsx//Rlm+ZU03BU6SQNC66uf4l5+" crossorigin="anonymous" referrerpolicy="no-referrer">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js" integrity="sha384-7zkQWkzuo3B5mTepMUcHkMB5jZaolc2xDwL6VFqjFALcbeS9Ggm/Yr2r3Dy4lfFg" crossorigin="anonymous" referrerpolicy="no-referrer"></script><script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/mhchem.min.js" integrity="sha384-ifpG+NlgMq0kvOSGqGQxW1mJKpjjMDmZdpKGq3tbvD3WPhyshCEEYClriK/wRVU0" crossorigin="anonymous" referrerpolicy="no-referrer"></script><script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js" integrity="sha384-43gviWU0YVjaDtb/GhzOouOXtZMP/7XUzwPTstBeZFe/+rCMvRwr4yROQP43s0Xk" crossorigin="anonymous" referrerpolicy="no-referrer"></script><script defer src="../../assets/lazy-katex.js"></script><script defer src="../../assets/eju-ux.js"></script><script defer src="../../assets/demos.js?v=2"></script>
<link rel="stylesheet" href="../../assets/site.css"></head><body>
<a class="skip" href="#main">跳到正文</a><div id="cdn-note" hidden>公式库（KaTeX）未能加载，公式将显示为源码。请联网后刷新页面。</div>
<header class="hero"><div class="hero-in"><div class="hero-text"><p class="back"><a href="../../">← 目录</a></p><p class="eyebrow">EJU 理科 化学 · {t["area"]} · {t["ja"]}</p><h1>{t["n"]} {t["zh"]}</h1><p class="lead">{t["lead"]}</p></div><div class="hero-formula" aria-hidden="true">{hero}</div></div></header>
<div class="layout"><nav class="toc" aria-label="目录"><div style="flex:1;min-width:0"><p class="toc-title">目录</p><ol>{tochtml}</ol></div><button class="chip theme-btn" id="theme" type="button">深色</button></nav>
<main id="main">{secs}{demosec(t)}{EX}{PR}{TE}
<footer>原创讲义与题目，非 JASSO 官方内容。按《日本留学試験 理科シラバス（化学）》编排。</footer></main></div>
{TOGGLEJS}<script>(function(){{
var L=[].slice.call(document.querySelectorAll('nav.toc a'));if('IntersectionObserver'in window){{var io=new IntersectionObserver(function(es){{es.forEach(function(e){{if(e.isIntersecting)L.forEach(function(a){{a.classList.toggle('on',a.getAttribute('href')==='#'+e.target.id)}})}})}},{{rootMargin:'-20% 0px -70% 0px'}});document.querySelectorAll('main section').forEach(function(x){{io.observe(x)}})}}
window.addEventListener('load',function(){{if(!window.renderMathInElement){{document.getElementById('cdn-note').hidden=false;return}}renderMathInElement(document.body,{{delimiters:[{{left:'$$',right:'$$',display:true}},{{left:'$',right:'$',display:false}}],throwOnError:false}})}})}})();</script>
<script src="../../assets/nav.js"></script></body></html>'''
for t in TOPICS:
    os.makedirs(f'topics/{t["slug"]}',exist_ok=True); open(f'topics/{t["slug"]}/index.html','w').write(page(t))
# HOME：首页目次（像书的目录：左侧章号，右侧章名与专题，点线引到右侧的题数・过去问・星级）；目次下是知识导图（homemap.py 生成的内联 SVG），
# 之后「附」列资料与工具，「表」是过去问频度表。样式在 site.css 末尾「化学站首页目次」块，只作用于 body.contents / #map
CHAPTERS = [  # 章名、日文名、导图上的短名、提要、所含 area
 ('物质的构成', '物質の構成', '构成', '纯净物与混合物的分离，原子的结构与电子配置，元素周期律，化学键与晶体。', ['物质的构成']),
 ('物质的状态', '物質の状態', '状态', '物质的量与化学方程式的计算，状态变化与气体定律，溶液的浓度、溶解度与依数性。', ['物质的状态']),
 ('化学反应', '化学反応', '反应', '反应焓与赫斯定律，反应速率与化学平衡，酸与碱，氧化还原、电池与电解。', ['化学反应']),
 ('无机物质', '無機物質', '无机', '非金属与金属元素的单质和化合物：性质、制法、工业流程与离子检验。', ['无机物质']),
 ('有机化合物', '有機化合物', '有机', '元素分析与分子式，烃与官能团，醇・醛・羧酸・酯，芳香族化合物。', ['有机化合物']),
 ('高分子化合物', '高分子化合物', '高分子', '加成聚合与缩合聚合，合成高分子，糖类・蛋白质・油脂等天然高分子。', ['高分子化合物']),
]
def _stars(s): return f'<span class="stars" aria-label="重要度 {len(s)}/3">{s}</span>'
def _entry(t, label=None, meta=None):
    if meta is None:
        meta = (f'{len(t["problems"])} 题' if t['problems'] else t.get('sub', '常用数据速查')) + (f'<span class="ct-sep"> · </span>过去问 {t["bank"]["n"]} {_stars(t["bank"]["stars"])}' if t.get('bank') else '')
    return (f'<li><a href="topics/{t["slug"]}/"><span class="ct-n">{t["n"]:02d}</span><span class="ct-t"><span class="ct-zh">{label or t["zh"]}</span>'
            f'<span class="ct-ja" lang="ja">{t["ja"]}</span></span><span class="ct-dots" aria-hidden="true"></span><span class="ct-m">{meta}</span></a></li>')
_parts = []
for k, (name, ja, _, intro, areas) in enumerate(CHAPTERS, 1):
    ts = [t for t in TOPICS if t['area'] in areas]
    nb = sum(t['bank']['n'] for t in ts if t.get('bank'))
    _parts.append(f'<li class="ct-part"><p class="ct-no" aria-hidden="true">{k}</p><div class="ct-body">'
                  f'<h3 id="ch-{k}"><span class="ct-vh">第 {k} 章　</span>{name}<span class="ct-chja" lang="ja">{ja}</span></h3>'
                  f'<p class="ct-intro">{intro}<span class="ct-sum">{len(ts)} 个专题 · 过去问 {nb} 题</span></p>'
                  f'<ol class="ct-list">{"".join(_entry(t) for t in ts)}</ol></div></li>')
_D = next(t for t in TOPICS if t['slug'] == 'demos')
_CH_AREAS = {a for c in CHAPTERS for a in c[4]}
_appx = ''.join(_entry(t, f'互动演示总览（{t["demo_count"]} 个）', '全部演示一览') if t['slug'] == 'demos' else _entry(t)
                for t in TOPICS if t['area'] not in _CH_AREAS)
# MAP：知识导图。每章一色（site.css 的 --mp-1…--mp-6），一幅线描插图；每个专题一条代表式（取自本专题页抬头的式子或 17_formulas），
# 记法见 homemap.fml：` 包起来的部分直立（化学式），其余拉丁字母为斜体变量
XLINKS = [  # (slug, slug, 标签)
 ('atom', 'periodic', '电子配置'), ('bonding', 'periodic', '电负性'), ('mole', 'gas', '摩尔体积'), ('mole', 'solution', '摩尔浓度'),
 ('thermo', 'equilibrium', '平衡移动'), ('acid-base', 'equilibrium', '电离平衡'), ('redox', 'electrolysis', '电子授受'), ('organic', 'polymer', '单体与聚合'),
]
MAPF = {
 'matter': '`Ag^+ + Cl^- → AgCl`',            # 01_matter：Cl⁻ 的检出（沉淀）
 'atom': 'A = Z + N',                          # 02_atom 抬头：质量数 = 质子数 + 中子数
 'periodic': '`Na → Na^+ + e^-`',              # 03_periodic 抬头：电离
 'bonding': '`NH_3 + H^+ → NH_4^+`',           # 04_bonding 抬头：配位键
 'mole': 'n = m/M',                            # 05_mole 抬头 / 17_formulas
 'gas': 'pV = nRT',                            # 06_gas 抬头 / 17_formulas
 'solution': 'Δt = Km',                        # 07_solution 抬头：沸点升高・凝固点降低
 'thermo': 'Q = mcΔT',                         # 17_formulas：反应焓・热量测定
 'equilibrium': 'v = k[`A`]^a[`B`]^b',         # 17_formulas：反应速率式
 'acid-base': '`pH` = −log_{10}[`H`^+]',       # 10_acid_base 抬头 / 17_formulas
 'redox': '`Zn + Cu^{2+} → Zn^{2+} + Cu`',     # 11_redox 抬头：丹尼尔电池
 'electrolysis': 'n(`e`^−) = It/F',            # 12_electrolysis 抬头：法拉第定律
 'inorganic': '`N_2 + 3H_2 ⇌ 2NH_3`',          # 13_inorganic 抬头：哈伯法
 'organic': '`C`_n`H`_{2n+2}',                 # 14_organic 抬头：烷烃通式
 'polymer': '`–[CH_2–CH_2]`_n`–`',             # 15_polymer 抬头：聚乙烯
}
MAPL = {'thermo': '化学反应与热', 'mole': '物质的量', 'periodic': '元素周期律', 'equilibrium': '反应速率与平衡'}
from homemap import ico, render
def _icon_atom(x, y, s):  # 原子・粒子模型：原子核（质子・中子）+ 两层电子壳 + 电子
    c = (x + s / 2, y + s / 2); e = lambda r, a: (c[0] + r * s * math.cos(math.radians(a)), c[1] + r * s * math.sin(math.radians(a)))
    return ico(x, y, s, lambda P, R: f'<circle class="mp-thin" cx="{c[0]:.1f}" cy="{c[1]:.1f}" r="{R(.27)}"/><circle class="mp-thin" cx="{c[0]:.1f}" cy="{c[1]:.1f}" r="{R(.45)}"/>'
               + ''.join(f'<circle cx="{c[0] + dx * s:.1f}" cy="{c[1] + dy * s:.1f}" r="{R(.045)}"/>' for dx, dy in ((-.04, -.03), (.045, -.02), (0, .045)))
               + ''.join(f'<circle class="mp-dot" cx="{px:.1f}" cy="{py:.1f}" r="{R(.035)}"/>' for px, py in (e(.27, -40), e(.27, 140), e(.45, 20), e(.45, 110), e(.45, 200), e(.45, 290))))
def _icon_beaker(x, y, s):  # 烧杯：杯口卷边、刻度线、液面，液中几粒溶质粒子
    return ico(x, y, s, lambda P, R: f'<path d="M{P(.18, .14)}L{P(.24, .2)}L{P(.24, .88)}L{P(.76, .88)}L{P(.76, .14)}"/>'
               f'<path class="mp-thin" d="M{P(.24, .52)}H{x + .76 * s:.1f}M{P(.24, .36)}H{x + .34 * s:.1f}M{P(.24, .44)}H{x + .3 * s:.1f}M{P(.24, .6)}H{x + .3 * s:.1f}M{P(.24, .68)}H{x + .34 * s:.1f}M{P(.24, .76)}H{x + .3 * s:.1f}"/>'
               + ''.join(f'<circle class="mp-dot" cx="{x + u * s:.1f}" cy="{y + v * s:.1f}" r="{R(.024)}"/>' for u, v in ((.44, .62), (.58, .7), (.5, .8), (.66, .6), (.38, .76))))
def _icon_burette(x, y, s):  # 滴定管 + 旋塞 + 液滴 + 锥形瓶
    return ico(x, y, s, lambda P, R: f'<path d="M{P(.45, .02)}V{y + .46 * s:.1f}H{x + .55 * s:.1f}V{y + .02 * s:.1f}"/><path class="mp-thin" d="M{P(.5, .46)}V{y + .56 * s:.1f}M{P(.4, .5)}H{x + .6 * s:.1f}'
               f'M{P(.45, .12)}H{x + .5 * s:.1f}M{P(.45, .22)}H{x + .5 * s:.1f}M{P(.45, .32)}H{x + .5 * s:.1f}"/><circle class="mp-dot" cx="{x + .5 * s:.1f}" cy="{y + .62 * s:.1f}" r="{R(.022)}"/>'
               f'<path d="M{P(.43, .68)}L{P(.43, .76)}L{P(.24, .97)}H{x + .76 * s:.1f}L{P(.57, .76)}L{P(.57, .68)}"/><path class="mp-thin" d="M{P(.31, .89)}H{x + .69 * s:.1f}"/>')
def _icon_crystal(x, y, s):  # 离子晶体（NaCl 型）的立方晶格：前后两面 + 交替的大小离子
    a, b, o = .2, .62, .16
    pts = [(a, b), (a + .42, b), (a + .42, b - .42), (a, b - .42)]
    back = [(u + o, v - o) for u, v in pts]
    return ico(x, y, s, lambda P, R: f'<path d="M{P(*pts[0])}' + ''.join(f'L{P(*q)}' for q in pts[1:]) + 'Z"/>'
               f'<path class="mp-thin" d="M{P(*back[0])}' + ''.join(f'L{P(*q)}' for q in back[1:]) + 'Z' + ''.join(f'M{P(*p)}L{P(*q)}' for p, q in zip(pts, back)) + '"/>'
               + ''.join(f'<circle class="{"mp-dot" if i % 2 else "mp-ion"}" cx="{x + u * s:.1f}" cy="{y + v * s:.1f}" r="{R(.05 if i % 2 == 0 else .03)}"/>' for i, (u, v) in enumerate(pts + back[1:2] + back[3:4] + back[2:3] + back[0:1]))
               + f'<path class="mp-thin" d="M{P(.2, .84)}H{x + .78 * s:.1f}"/>')
def _icon_benzene(x, y, s):  # 苯环：正六边形 + 内切圆（凯库勒式的简写），一个取代基
    c = (.46, .52); h = [(c[0] + .3 * math.cos(math.radians(90 + 60 * i)), c[1] - .3 * math.sin(math.radians(90 + 60 * i))) for i in range(6)]
    return ico(x, y, s, lambda P, R: f'<path d="M{P(*h[0])}' + ''.join(f'L{P(*q)}' for q in h[1:]) + 'Z"/>'
               f'<circle class="mp-thin" cx="{x + c[0] * s:.1f}" cy="{y + c[1] * s:.1f}" r="{R(.18)}"/><path class="mp-thin" d="M{P(*h[0])}L{P(h[0][0], .06)}"/>'
               f'<text class="mp-sub" x="{x + (h[0][0] + .06) * s:.1f}" y="{y + .13 * s:.1f}">OH</text>')
def _icon_chain(x, y, s):  # 高分子：重复单元的折线链 + 方括号与 n
    zz = [(.12 + .1 * i, .55 + (.1 if i % 2 else -.1)) for i in range(8)]
    return ico(x, y, s, lambda P, R: f'<path d="M{P(*zz[0])}' + ''.join(f'L{P(*q)}' for q in zz[1:]) + '"/>'
               f'<path class="mp-thin" d="M{P(.36, .3)}H{x + .31 * s:.1f}V{y + .8 * s:.1f}H{x + .36 * s:.1f}M{P(.62, .3)}H{x + .67 * s:.1f}V{y + .8 * s:.1f}H{x + .62 * s:.1f}"/>'
               + ''.join(f'<circle class="mp-dot" cx="{x + u * s:.1f}" cy="{y + v * s:.1f}" r="{R(.028)}"/>' for u, v in zz[1:-1])
               + f'<text class="mp-it" x="{x + .73 * s:.1f}" y="{y + .86 * s:.1f}">n</text>')
_ICONS = [_icon_atom, _icon_beaker, _icon_burette, _icon_crystal, _icon_benzene, _icon_chain]
_MC = [dict(name=name, ja=ja, short=sh, icon=_ICONS[k],
            topics=[dict(slug=t['slug'], zh=t['zh'], ja=t['ja'], num=f'{t["n"]:02d}', label=MAPL.get(t['slug'], t['zh']), f=MAPF[t['slug']], href=f'topics/{t["slug"]}/')
                    for t in TOPICS if t['area'] in areas and t['problems']])
       for k, (name, ja, sh, _, areas) in enumerate(CHAPTERS)]
MAPSVG, MAPLEGEND, MAPSTAT = render(dict(subject='化学', cap_ja='図　化学の体系', chapters=_MC, xlinks=XLINKS, start=140, MINSEC=2.0,
    W=1160, H=1240, CX=580, CY=598, R0=58, R1=208, R2=348, NR=44, IS=58, FN=17, FF=16, FSUB=11, FL=15, BH=58, GAP=11, FCH=21))
print('map:', MAPSTAT)
def _mapdata():
    chs, tps = {}, {}
    for k, (name, ja, _sh, intro, areas) in enumerate(CHAPTERS, 1):
        chs[str(k)] = {'zh': name, 'ja': ja, 'intro': intro, 'href': f'#ch-{k}'}
        for top in TOPICS:
            if top.get('area') in areas and top.get('problems'):
                tps[top['slug']] = {'zh': top['zh'], 'ja': top['ja'], 'intro': top.get('lead') or '', 'href': f'topics/{top["slug"]}/', 'ch': str(k), 'children': mapkids.kids_from_sections(top.get('sections') or [], top['slug'])}
    s = json.dumps({'subject': '化学', 'chapters': chs, 'topics': tps}, ensure_ascii=False, separators=(',', ':'))
    return s.replace('<', '\\u003c')
MAPDATA = _mapdata()
_nk=sum(len(v.get('children') or []) for v in json.loads(MAPDATA.replace('\\u003c','<')).get('topics',{}).values())
print('map kids:', _nk)

RANKTBL=''.join(f'<tr><td><a href="topics/{t["slug"]}/">{t["n"]} {t["zh"]}</a></td><td>{" ".join(t["bank"]["codes"])}</td><td class="num">{t["bank"]["n"]}</td><td class="stars">{t["bank"]["stars"]}</td></tr>' for t in sorted([t for t in TOPICS if t.get('bank')],key=lambda t:-t['bank']['n']))
_np = sum(len(t['problems']) for t in TOPICS); _nb = sum(t['bank']['n'] for t in TOPICS if t.get('bank')); _nt = sum(1 for t in TOPICS if t['problems'])
_SITES = [('https://feather0000.github.io/eju-calculus/', 'EJU 数学コース2 网站'), ('https://feather0000.github.io/eju-physics/', 'EJU 理科 物理 网站'), ('https://feather0000.github.io/eju-biology/', 'EJU 理科 生物 网站')]
PREFACE = ('这是按 EJU 理科（化学）大纲整理的中文讲义，分物质的构成、物质的状态、化学反应、无机、有机、高分子六章。建议先按章节读讲解和例题，再做练习；'
           '计算题用到的公式、原子量和常数可以随时在附录里查。各页开头的出题频度来自 2005–2025 年试卷的统计，拿不准先看哪一章时可以参考它，也可以直接看本页最后的频度表。')
open('index.html','w').write(f'''<!doctype html><html lang="zh-Hans" data-site="{SITE}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="light dark">
{HEADJS}
<title>EJU 理科 化学 全专题讲解</title>{headmeta(SITE_NAME + " 全专题讲解", SITE_DESC, "", "")}
<link rel="stylesheet" href="assets/site.css"></head><body class="home contents">
<a class="skip" href="#chapters">跳到目次</a>
<div class="ct-wrap">
<header class="ct-head">
<div class="ct-top"><p class="ct-kicker">EJU 理科 · 化学</p><button class="chip theme-btn" id="theme" type="button">深色</button></div>
<h1>化学<br>全专题讲解</h1>
<div class="ct-preface"><p>{PREFACE}</p>
<p class="ct-facts">共 {_nt} 个讲解专题、{_np} 道原创练习题、{_D["demo_count"]} 个互动演示；过去问 {_nb} 题已按专题归类。</p></div>
</header>
<main id="main">
<section id="chapters" aria-labelledby="h-chapters"><h2 id="h-chapters" class="ct-label">目次<span lang="ja">もくじ</span></h2>
<ol class="ct-parts">{"".join(_parts)}</ol></section>
<section id="map" aria-labelledby="h-map"><div class="ct-part"><p class="ct-no ct-no-a" aria-hidden="true">图</p><div class="ct-body">
<h2 id="h-map">知识导图<span class="ct-chja" lang="ja">知識マップ</span></h2>
<p class="ct-intro">中心「化学」分出六章，每章一色，外圈是各章的讲解专题和一条代表式或化学方程式；虚线弧标出专题之间的重要联系。点章节或专题可放大查看简介，再从说明卡进入对应页。</p></div>
<figure class="mp"><p class="mp-hint" id="mp-hint">点节点可放大查看简介。电脑上按住 Ctrl 或 ⌘ 滚动缩放；点进图中后可拖动。触屏用双指缩放。Esc 或「返回」还原。</p>
<div class="mp-scroll" role="region" aria-label="知识导图" aria-describedby="mp-hint">{MAPSVG}</div>
<figcaption id="mp-cap">化学知识导图：中心「化学」分出六章，各章外圈列讲解专题与代表式。虚线弧所示的联系：<ul class="mp-legend">{MAPLEGEND}</ul></figcaption></figure><script type="application/json" id="mp-data">{MAPDATA}</script></div></section>
<section id="appendix" aria-labelledby="h-appendix"><div class="ct-part"><p class="ct-no ct-no-a" aria-hidden="true">附</p><div class="ct-body">
<h2 id="h-appendix">资料・速查・工具<span class="ct-chja" lang="ja">資料・ツール</span></h2>
<p class="ct-intro">考前查原子量和常数、对公式与术语、找易错点；站内搜索覆盖题目、讲解、公式、术语与数据。</p>
<ol class="ct-list">{_appx}</ol></div></div></section>
<section id="ranking" aria-labelledby="h-rank"><div class="ct-part"><p class="ct-no ct-no-a" aria-hidden="true">表</p><div class="ct-body">
<h2 id="h-rank">过去问出题频度<span class="ct-chja" lang="ja">出題頻度</span></h2>
<p class="ct-intro">依据 2005–2025 年 38 份 EJU 试卷的按知识点分类原题册统计，按题数从多到少排列（各页开头另有详细的「出题频度」表）。</p>
<div class="tw"><table><thead><tr><th scope="col">专题页</th><th scope="col">原题册专题</th><th scope="col" class="num">题数</th><th scope="col">重要度</th></tr></thead><tbody>{RANKTBL}</tbody></table></div></div></div></section>
</main>
<footer class="ct-foot"><p class="ct-sites">姊妹站：{"".join(f'<a href="{u}">{a}</a>' for u, a in _SITES)}</p><p>原创讲义与题目，非 JASSO 官方内容。按《日本留学試験 理科シラバス（化学）》编排。</p></footer>
</div>
{TOGGLEJS}<script src="assets/map.js"></script><script src="assets/nav.js"></script></body></html>''')
# 404：GitHub Pages 对任意深度的不存在路径都返回它，所以资源用站点绝对路径
open('404.html','w').write(f'''<!doctype html><html lang="zh-Hans" data-site="{SITE}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="light dark">
{HEADJS}<title>页面不存在 · {SITE_NAME}</title><meta name="robots" content="noindex"><link rel="icon" href="{SITE_PATH}assets/favicon.svg" type="image/svg+xml"><link rel="icon" href="{SITE_PATH}assets/favicon-32.png" sizes="32x32" type="image/png"><link rel="apple-touch-icon" href="{SITE_PATH}assets/apple-touch-icon.png">
<link rel="stylesheet" href="{SITE_PATH}assets/site.css"></head><body class="home nf"><main>
<div class="home-top"><p class="eyebrow">{SITE_NAME}</p><button class="chip theme-btn" id="theme" type="button">深色</button></div>
<p class="nf-code" aria-hidden="true">404</p><h1>页面不存在</h1><p>这个地址没有对应的页面：可能是链接写错了，或者页面已经移动。可以回到首页按专题查找，或用站内搜索。</p>
<p class="home-links"><a href="{SITE_PATH}">← 回到 {SITE_NAME} 首页</a><a href="{SITE_PATH}topics/search/">站内搜索</a></p></main>
{TOGGLEJS}</body></html>''')
nav=open('/workspace/eju-pages/assets/nav.js').read().split('\n')
T=[dict(n=t['n'],slug=t['slug'],zh=t['zh'],ja=t['ja'],ready=True) for t in TOPICS]
nav[0]='(function(){var T='+json.dumps(T,ensure_ascii=False)+';'
nav='\n'.join(nav).replace('EJU コース2 全部专题','EJU 化学 全部专题').replace("(t.n==19?'19–20':t.n)","t.n")
open('assets/nav.js','w').write(nav)
print(len(TOPICS),'topics',sum(len(t['problems']) for t in TOPICS),'problems')

from _x import build_index
print('search index entries:',build_index(TOPICS))
