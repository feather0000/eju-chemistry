import importlib.util, glob, os, json, html, sys
sys.path.insert(0,"content")
TOPICS=[]
for f in sorted(glob.glob('content/[0-9]*.py')):
    s=importlib.util.spec_from_file_location(os.path.basename(f)[:-3],f); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); TOPICS.append(m.TOPIC)
MARK='①②③④⑤⑥'
def page(t):
    toc=[(sid,tt) for sid,tt,_,_ in t['sections']]+[('examples','例题'),('practice','练习题'),('terms','术语对照')]
    tochtml=''.join(f'<li><a href="#{i}">{k+1} {tt}</a></li>' for k,(i,tt) in enumerate(toc))
    secs=''.join(f'<section id="{sid}"><h2>{tt}</h2><p class="jp-sub">{jp}</p>{body}</section>' for sid,tt,jp,body in t['sections'])
    ex=''.join(f'<article class="q"><div class="q-head"><b>例题 {k+1}　{e[0]}</b></div>{e[1]}<details><summary>解答</summary><div class="ans">{e[2]}</div></details></article>' for k,e in enumerate(t['examples']))
    pr=''
    for k,p in enumerate(t['problems']):
        opts=''.join(f'<li>{MARK[j]} {o}</li>' for j,o in enumerate(p['opts']))
        pr+=(f'<article class="q" id="p{k+1}"><div class="q-head"><b>问 {k+1}</b><span class="origin">原创 · EJU 风格</span></div><p>{p["q"]}</p><ol class="opts">{opts}</ol>'
             f'<details><summary>解答</summary><div class="ans"><p><strong>正解：{MARK[p["ans"]]}</strong></p>{p["sol"]}</div></details></article>')
    terms=''.join(f'<tr><td>{a}</td><td>{b}</td><td class="kana">{c}</td></tr>' for a,b,c in t['terms'])
    hero=''.join(f'$${h}$$' for h in t['hero'])
    return f'''<!DOCTYPE html><html lang="zh-CN"><head><link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>EJU 理科 化学 · {t["n"]} {t["zh"]}</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script><script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/mhchem.min.js"></script><script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"></script><script defer src="../../assets/lazy-katex.js"></script>
<link rel="stylesheet" href="../../assets/site.css"><script>try{{var t=localStorage.getItem('eju-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t)}}catch(e){{}}</script></head><body>
<a class="skip" href="#main">跳到正文</a><div id="cdn-note" hidden>公式库（KaTeX）未能加载，公式将显示为源码。请联网后刷新页面。</div>
<header class="hero"><div class="hero-in"><div class="hero-text"><p class="back"><a href="../../">← 目录</a></p><p class="eyebrow">EJU 理科 化学 · {t["area"]} · {t["ja"]}</p><h1>{t["n"]} {t["zh"]}</h1><p class="lead">{t["lead"]}</p></div><div class="hero-formula" aria-hidden="true">{hero}</div></div></header>
<div class="layout"><nav class="toc" aria-label="目录"><div style="flex:1;min-width:0"><p class="toc-title">目录</p><ol>{tochtml}</ol></div><button class="chip theme-btn" id="theme" type="button">深色</button></nav>
<main id="main">{secs}<section id="examples"><h2>例题</h2><p class="jp-sub">例題</p>{ex}</section>
<section id="practice"><h2>练习题</h2><p class="jp-sub">練習問題（{len(t["problems"])} 题，选择题；原子量 H 1.0, C 12, N 14, O 16, Na 23, Mg 24, Al 27, S 32, Cl 35.5, K 39, Ca 40, Fe 56, Cu 63.5, Ag 108，另有说明除外）</p>{pr}</section>
<section id="terms"><h2>术语对照</h2><p class="jp-sub">用語</p><div class="tw"><table><tr><th>中文</th><th>日本語</th><th>读法</th></tr>{terms}</table></div></section>
<footer>原创讲义与题目，非 JASSO 官方内容。按《日本留学試験 理科シラバス（化学）》编排。</footer></main></div>
<script>(function(){{var b=document.getElementById('theme');function s(t){{document.documentElement.setAttribute('data-theme',t);b.textContent=t==='dark'?'浅色':'深色'}}s(document.documentElement.getAttribute('data-theme')||'light');b.onclick=function(){{var t=document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';s(t);try{{localStorage.setItem('eju-theme',t)}}catch(e){{}}}};
var L=[].slice.call(document.querySelectorAll('nav.toc a'));if('IntersectionObserver'in window){{var io=new IntersectionObserver(function(es){{es.forEach(function(e){{if(e.isIntersecting)L.forEach(function(a){{a.classList.toggle('on',a.getAttribute('href')==='#'+e.target.id)}})}})}},{{rootMargin:'-20% 0px -70% 0px'}});document.querySelectorAll('main section').forEach(function(x){{io.observe(x)}})}}
window.addEventListener('load',function(){{if(!window.renderMathInElement){{document.getElementById('cdn-note').hidden=false;return}}renderMathInElement(document.body,{{delimiters:[{{left:'$$',right:'$$',display:true}},{{left:'$',right:'$',display:false}}],throwOnError:false}})}})}})();</script>
<script src="../../assets/nav.js"></script></body></html>'''
for t in TOPICS:
    os.makedirs(f'topics/{t["slug"]}',exist_ok=True); open(f'topics/{t["slug"]}/index.html','w').write(page(t))
lis=''.join(f'<li><a href="topics/{t["slug"]}/"><span class="n">{t["n"]} · {t["area"]}</span><b>{t["zh"]}</b><small>{t["ja"]} · {len(t["problems"])} 题</small></a></li>' for t in TOPICS)
open('index.html','w').write(f'''<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>EJU 理科 化学 全专题讲解</title>
<style>:root{{--bg:#f8f5ee;--fg:#222;--card:#fffdf8;--line:#ddd6c6;--acc:#1e6b6b}}@media(prefers-color-scheme:dark){{:root{{--bg:#14171e;--fg:#ebe8e0;--card:#1c2029;--line:#363c49;--acc:#79cfcf}}}}
[data-theme=light]{{--bg:#f8f5ee;--fg:#222;--card:#fffdf8;--line:#ddd6c6;--acc:#1e6b6b;color-scheme:light}}[data-theme=dark]{{--bg:#14171e;--fg:#ebe8e0;--card:#1c2029;--line:#363c49;--acc:#79cfcf;color-scheme:dark}}
body{{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,"PingFang SC","Noto Sans CJK SC",sans-serif}}main{{max-width:900px;margin:0 auto;padding:24px max(16px,env(safe-area-inset-right)) 24px max(16px,env(safe-area-inset-left))}}
ol{{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}}li a{{display:flex;flex-direction:column;min-height:44px;padding:12px 14px;background:var(--card);border:1px solid var(--line);border-radius:10px;color:inherit;text-decoration:none}}li a:hover{{border-color:var(--acc)}}
.n{{color:var(--acc);font-weight:700;font-size:13px}}small{{opacity:.7}}a{{color:var(--acc)}}#theme{{font:inherit;min-height:44px;padding:4px 16px;border-radius:22px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer}}</style>
<script>try{{var t=localStorage.getItem('eju-theme');if(t)document.documentElement.setAttribute('data-theme',t)}}catch(e){{}}</script></head><body><main>
<h1>EJU 理科 化学 全专题讲解</h1><p>按 JASSO《日本留学試験 理科シラバス（化学）》编排：物质的构成・物质的状态与变化・化学反应・无机物质・有机化合物・高分子。每页含要点讲解（中文 + 日语术语）、关键公式、原创例题和带解答的 EJU 风格选择题。</p>
<p><button id="theme" type="button">切换深浅色</button></p><ol>{lis}</ol><p><a href="https://feather0000.github.io/eju-calculus/">→ EJU 数学コース2 网站</a>　<a href="https://feather0000.github.io/eju-physics/">→ EJU 理科 物理 网站</a></p></main>
<script>document.getElementById('theme').onclick=function(){{var d=document.documentElement,c=d.getAttribute('data-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'),t=c==='dark'?'light':'dark';d.setAttribute('data-theme',t);try{{localStorage.setItem('eju-theme',t)}}catch(e){{}}}}</script><script src="assets/nav.js"></script></body></html>''')
nav=open('/workspace/eju-pages/assets/nav.js').read().split('\n')
T=[dict(n=t['n'],slug=t['slug'],zh=t['zh'],ja=t['ja'],ready=True) for t in TOPICS]
nav[0]='(function(){var T='+json.dumps(T,ensure_ascii=False)+';'
nav='\n'.join(nav).replace('EJU コース2 全部专题','EJU 化学 全部专题').replace("(t.n==19?'19–20':t.n)","t.n")
open('assets/nav.js','w').write(nav)
print(len(TOPICS),'topics',sum(len(t['problems']) for t in TOPICS),'problems')
