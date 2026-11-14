import importlib.util, glob, os, json, html, sys
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
lis=''.join(f'<li><a href="topics/{t["slug"]}/"><span class="n">{t["n"]} · {t["area"]}</span><b>{t["zh"]}</b><small>{t["ja"]} · {(str(len(t["problems"]))+" 题") if t["problems"] else t.get("sub","常用数据速查")}{(" · 过去问 "+str(t["bank"]["n"])+" 题 "+t["bank"]["stars"]) if t.get("bank") else ""}</small></a></li>' for t in TOPICS)
RANKTBL=''.join(f'<tr><td><a href="topics/{t["slug"]}/">{t["n"]} {t["zh"]}</a></td><td>{" ".join(t["bank"]["codes"])}</td><td style="text-align:right">{t["bank"]["n"]}</td><td>{t["bank"]["stars"]}</td></tr>' for t in sorted([t for t in TOPICS if t.get('bank')],key=lambda t:-t['bank']['n']))
open('index.html','w').write(f'''<!doctype html><html lang="zh-Hans" data-site="{SITE}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="light dark">
{HEADJS}<title>EJU 理科 化学 全专题讲解</title>{headmeta(SITE_NAME + " 全专题讲解", SITE_DESC, "", "")}
<link rel="stylesheet" href="assets/site.css"></head><body class="home"><main>
<div class="home-top"><p class="eyebrow">EJU 理科 · 化学</p><button class="chip theme-btn" id="theme" type="button">深色</button></div>
<h1>EJU 理科 化学 全专题讲解</h1><p>按 JASSO《日本留学試験 理科シラバス（化学）》编排：物质的构成・物质的状态与变化・化学反应・无机物质・有机化合物・高分子。每页含要点讲解（中文 + 日语术语）、关键公式、原创例题和带解答的 EJU 风格选择题。</p>
<p class="home-links"><a href="topics/demos/">🎛️ 互动演示总览（{next(t["demo_count"] for t in TOPICS if t["slug"]=="demos")} 个）</a><a href="topics/tips/">⚡ 快速解题技巧</a></p><ol>{lis}</ol><h2>过去问出题频度排行</h2><p>依据 2005–2025 年 38 份 EJU 试卷的按知识点分类原题册统计（各页开头有详细的「出题频度」表）。</p><div class="tw"><table><tr><th>专题页</th><th>原题册专题</th><th style="text-align:right">题数</th><th>重要度</th></tr>{RANKTBL}</table></div><p><a href="https://feather0000.github.io/eju-calculus/">→ EJU 数学コース2 网站</a>　<a href="https://feather0000.github.io/eju-physics/">→ EJU 理科 物理 网站</a>　<a href="https://feather0000.github.io/eju-biology/">→ EJU 理科 生物 网站</a></p></main>
{TOGGLEJS}<script src="assets/nav.js"></script></body></html>''')
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
