import importlib.util, glob, os, json, html, sys
sys.path.insert(0,"content")
open('assets/demos.js','w').write(''.join(open(f).read() for f in ['assets/chem.js']+sorted(glob.glob('demos_src/*.js'))))
DEMOS={
'acid-base':[('titr','中和滴定曲线','中和滴定曲線','切换强酸／弱酸，调浓度和 pK<sub>a</sub>，拖动点看 pH、中和点与指示剂变色范围。')],
'gas':[('gas','理想气体 pV = nRT','理想気体の状態方程式','改变 n、温度，拖动等温线上的点改变体积。'),('vapor','密闭容器中的水与饱和蒸气压','飽和蒸気圧','判断水是否全部气化，读出实际的水蒸气分压。')],
'equilibrium':[('lechat','勒夏特列原理：N₂O₄ ⇌ 2NO₂','ルシャトリエの原理','改变温度、总压，或在定容／定压下加入 Ar，看平衡移动与颜色。')],
'electrolysis':[('faraday','法拉第定律计算器','ファラデーの法則','设定电流、时间与生成物，算出电子、物质的量、质量或气体体积。')],
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
def page(t):
    toc=[(sid,tt) for sid,tt,_,_ in t['sections']]+([('demo','互动演示')] if DEMOS.get(t['slug']) else [])+([('examples','例题')] if t['examples'] else [])+([('practice','练习题')] if t['problems'] else [])+([('terms','术语对照')] if t['terms'] else [])
    tochtml=''.join(f'<li><a href="#{i}">{k+1} {tt}</a></li>' for k,(i,tt) in enumerate(toc))
    secs=''.join(f'<section id="{sid}"><h2>{tt}</h2><p class="jp-sub">{jp}</p>{body}</section>' for sid,tt,jp,body in t['sections'])
    ex=''.join(f'<article class="q"><div class="q-head"><b>例题 {k+1}　{e[0]}</b></div>{e[1]}<details><summary>解答</summary><div class="ans">{e[2]}</div></details></article>' for k,e in enumerate(t['examples']))
    pr=''
    for k,p in enumerate(t['problems']):
        opts=''.join(f'<li>{MARK[j]} {o}</li>' for j,o in enumerate(p['opts']))
        pr+=(f'<article class="q" id="p{k+1}"><div class="q-head"><b>问 {k+1}</b>{'<span class="origin hf">原创 · 过去问高频题型</span>' if p.get("new") else '<span class="origin">原创 · EJU 风格</span>'}</div><p>{p["q"]}</p><ol class="opts">{opts}</ol>'
             f'<details><summary>解答</summary><div class="ans"><p><strong>正解：{MARK[p["ans"]]}</strong></p>{p["sol"]}</div></details></article>')
    terms=''.join(f'<tr><td>{a}</td><td>{b}</td><td class="kana">{c}</td></tr>' for a,b,c in t['terms'])
    hero=''.join(f'$${h}$$' for h in t['hero'])
    EX=f'''<section id="examples"><h2>例题</h2><p class="jp-sub">例題</p>{ex}</section>''' if t['examples'] else ''
    PR=f'''<section id="practice"><h2>练习题</h2><p class="jp-sub">練習問題（{len(t["problems"])} 题，选择题；原子量 H 1.0, C 12, N 14, O 16, Na 23, Mg 24, Al 27, S 32, Cl 35.5, K 39, Ca 40, Fe 56, Cu 63.5, Ag 108，另有说明除外）</p>{pr}</section>''' if t['problems'] else ''
    TE=f'''<section id="terms"><h2>术语对照</h2><p class="jp-sub">用語</p><div class="tw"><table><tr><th>中文</th><th>日本語</th><th>读法</th></tr>{terms}</table></div></section>''' if t['terms'] else ''
    return f'''<!DOCTYPE html><html lang="zh-CN"><head><link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>EJU 理科 化学 · {t["n"]} {t["zh"]}</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script><script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/mhchem.min.js"></script><script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"></script><script defer src="../../assets/lazy-katex.js"></script><script defer src="../../assets/demos.js?v=1"></script>
<link rel="stylesheet" href="../../assets/site.css"><script>try{{var t=localStorage.getItem('eju-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t)}}catch(e){{}}</script></head><body>
<a class="skip" href="#main">跳到正文</a><div id="cdn-note" hidden>公式库（KaTeX）未能加载，公式将显示为源码。请联网后刷新页面。</div>
<header class="hero"><div class="hero-in"><div class="hero-text"><p class="back"><a href="../../">← 目录</a></p><p class="eyebrow">EJU 理科 化学 · {t["area"]} · {t["ja"]}</p><h1>{t["n"]} {t["zh"]}</h1><p class="lead">{t["lead"]}</p></div><div class="hero-formula" aria-hidden="true">{hero}</div></div></header>
<div class="layout"><nav class="toc" aria-label="目录"><div style="flex:1;min-width:0"><p class="toc-title">目录</p><ol>{tochtml}</ol></div><button class="chip theme-btn" id="theme" type="button">深色</button></nav>
<main id="main">{secs}{demosec(t)}{EX}{PR}{TE}
<footer>原创讲义与题目，非 JASSO 官方内容。按《日本留学試験 理科シラバス（化学）》编排。</footer></main></div>
<script>(function(){{var b=document.getElementById('theme');function s(t){{document.documentElement.setAttribute('data-theme',t);b.textContent=t==='dark'?'浅色':'深色'}}s(document.documentElement.getAttribute('data-theme')||'light');b.onclick=function(){{var t=document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';s(t);try{{localStorage.setItem('eju-theme',t)}}catch(e){{}}}};
var L=[].slice.call(document.querySelectorAll('nav.toc a'));if('IntersectionObserver'in window){{var io=new IntersectionObserver(function(es){{es.forEach(function(e){{if(e.isIntersecting)L.forEach(function(a){{a.classList.toggle('on',a.getAttribute('href')==='#'+e.target.id)}})}})}},{{rootMargin:'-20% 0px -70% 0px'}});document.querySelectorAll('main section').forEach(function(x){{io.observe(x)}})}}
window.addEventListener('load',function(){{if(!window.renderMathInElement){{document.getElementById('cdn-note').hidden=false;return}}renderMathInElement(document.body,{{delimiters:[{{left:'$$',right:'$$',display:true}},{{left:'$',right:'$',display:false}}],throwOnError:false}})}})}})();</script>
<script src="../../assets/nav.js"></script></body></html>'''
for t in TOPICS:
    os.makedirs(f'topics/{t["slug"]}',exist_ok=True); open(f'topics/{t["slug"]}/index.html','w').write(page(t))
lis=''.join(f'<li><a href="topics/{t["slug"]}/"><span class="n">{t["n"]} · {t["area"]}</span><b>{t["zh"]}</b><small>{t["ja"]} · {(str(len(t["problems"]))+" 题") if t["problems"] else t.get("sub","常用数据速查")}{(" · 过去问 "+str(t["bank"]["n"])+" 题 "+t["bank"]["stars"]) if t.get("bank") else ""}</small></a></li>' for t in TOPICS)
RANKTBL=''.join(f'<tr><td><a href="topics/{t["slug"]}/">{t["n"]} {t["zh"]}</a></td><td>{" ".join(t["bank"]["codes"])}</td><td style="text-align:right">{t["bank"]["n"]}</td><td>{t["bank"]["stars"]}</td></tr>' for t in sorted([t for t in TOPICS if t.get('bank')],key=lambda t:-t['bank']['n']))
open('index.html','w').write(f'''<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>EJU 理科 化学 全专题讲解</title>
<style>:root{{--bg:#f8f5ee;--fg:#222;--card:#fffdf8;--line:#ddd6c6;--acc:#1e6b6b}}@media(prefers-color-scheme:dark){{:root{{--bg:#14171e;--fg:#ebe8e0;--card:#1c2029;--line:#363c49;--acc:#79cfcf}}}}
[data-theme=light]{{--bg:#f8f5ee;--fg:#222;--card:#fffdf8;--line:#ddd6c6;--acc:#1e6b6b;color-scheme:light}}[data-theme=dark]{{--bg:#14171e;--fg:#ebe8e0;--card:#1c2029;--line:#363c49;--acc:#79cfcf;color-scheme:dark}}
body{{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,"PingFang SC","Noto Sans CJK SC",sans-serif}}main{{max-width:900px;margin:0 auto;padding:24px max(16px,env(safe-area-inset-right)) 24px max(16px,env(safe-area-inset-left))}}
ol{{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}}li a{{display:flex;flex-direction:column;min-height:44px;padding:12px 14px;background:var(--card);border:1px solid var(--line);border-radius:10px;color:inherit;text-decoration:none}}li a:hover{{border-color:var(--acc)}}
.n{{color:var(--acc);font-weight:700;font-size:13px}}small{{opacity:.7}}a{{color:var(--acc)}}#theme{{font:inherit;min-height:44px;padding:4px 16px;border-radius:22px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer}}td,th{{border-bottom:1px solid var(--line);padding:6px 8px}}</style>
<script>try{{var t=localStorage.getItem('eju-theme');if(t)document.documentElement.setAttribute('data-theme',t)}}catch(e){{}}</script></head><body><main>
<h1>EJU 理科 化学 全专题讲解</h1><p>按 JASSO《日本留学試験 理科シラバス（化学）》编排：物质的构成・物质的状态与变化・化学反应・无机物质・有机化合物・高分子。每页含要点讲解（中文 + 日语术语）、关键公式、原创例题和带解答的 EJU 风格选择题。</p>
<p><button id="theme" type="button">切换深浅色</button></p><ol>{lis}</ol><h2>过去问出题频度排行</h2><p>依据 2005–2025 年 38 份 EJU 试卷的按知识点分类原题册统计（各页开头有详细的「出题频度」表）。</p><div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%"><tr><th style="text-align:left">专题页</th><th style="text-align:left">原题册专题</th><th>题数</th><th>重要度</th></tr>{RANKTBL}</table></div><p><a href="https://feather0000.github.io/eju-calculus/">→ EJU 数学コース2 网站</a>　<a href="https://feather0000.github.io/eju-physics/">→ EJU 理科 物理 网站</a>　<a href="https://feather0000.github.io/eju-biology/">→ EJU 理科 生物 网站</a></p></main>
<script>document.getElementById('theme').onclick=function(){{var d=document.documentElement,c=d.getAttribute('data-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'),t=c==='dark'?'light':'dark';d.setAttribute('data-theme',t);try{{localStorage.setItem('eju-theme',t)}}catch(e){{}}}}</script><script src="assets/nav.js"></script></body></html>''')
nav=open('/workspace/eju-pages/assets/nav.js').read().split('\n')
T=[dict(n=t['n'],slug=t['slug'],zh=t['zh'],ja=t['ja'],ready=True) for t in TOPICS]
nav[0]='(function(){var T='+json.dumps(T,ensure_ascii=False)+';'
nav='\n'.join(nav).replace('EJU コース2 全部专题','EJU 化学 全部专题').replace("(t.n==19?'19–20':t.n)","t.n")
open('assets/nav.js','w').write(nav)
print(len(TOPICS),'topics',sum(len(t['problems']) for t in TOPICS),'problems')

from _x import build_index
print('search index entries:',build_index(TOPICS))
