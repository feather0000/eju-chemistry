# shared: merge past-exam bank frequency + extra content into a TOPIC
import json,os
_D=json.load(open(os.path.join(os.path.dirname(__file__),'bank_freq.json'),encoding='utf-8'))
_RANK=sorted(_D['topics'],key=lambda c:-_D['topics'][c]['count'])
def stars(n): return '★★★' if n>=60 else ('★★' if n>=30 else '★')
def freq_html(codes,focus,subj):
    T=_D['topics'];mx=T[_RANK[0]]['count'];tot=sum(T[c]['count'] for c in codes)
    rows=''
    for c in codes:
        v=T[c];w=round(100*v['count']/mx)
        rows+=(f'<tr><td><b>{c}</b> {v["name"]}</td><td class="num">{v["count"]}</td><td class="num">{_RANK.index(c)+1}/{len(_RANK)}</td>'
               f'<td><span class="fbar" style="width:{w}%"></span></td></tr>')
    ty=''.join(f'<li>{x}</li>' for c in codes for x in T[c]['types'][:6])
    return (f'<p>据《{_D["source"]}》统计（共 {_D["total"]} 个题组），本页对应原题册专题合计 <b>{tot}</b> 题，'
            f'约占全部的 <b>{100*tot/_D["total"]:.1f}%</b>，重要度 <b class="stars">{stars(tot)}</b>。</p>'
            f'<div class="tw"><table class="freq"><tr><th>原题册专题</th><th>题数</th><th>频度排名</th><th></th></tr>{rows}</table></div>'
            f'<p><strong>常见题型</strong>（按原题册题型摘要整理）：</p><ul class="types">{ty}</ul>'
            +(f'<div class="box"><p><strong>备考重点</strong>　{focus}</p></div>' if focus else ''))
def extend(t,B):
    b=B.get(t['slug'])
    if not b: return t
    tot=sum(_D['topics'][c]['count'] for c in b['codes'])
    t['bank']=dict(codes=b['codes'],n=tot,stars=stars(tot))
    t['sections']=[('freq','出题频度','出題頻度（2005–2025 过去问统计）',freq_html(b['codes'],b.get('focus',''),''))]+list(t['sections'])
    for s in b.get('sections',[]):
        if isinstance(s,tuple) and len(s)==5:  # (after_id, id,title,jp,body)
            ids=[x[0] for x in t['sections']]; i=ids.index(s[0])+1 if s[0] in ids else len(ids); t['sections'].insert(i,s[1:])
        else: t['sections'].append(s)
    for k,s in enumerate(t['sections']):
        if s[0] in b.get('append',{}): t['sections'][k]=(s[0],s[1],s[2],s[3]+b['append'][s[0]])
    t['problems']=list(t['problems'])+[dict(p,new=True) for p in b.get('problems',[])]
    t['examples']=list(t['examples'])+list(b.get('examples',[]))
    have={x[1] for x in t['terms']}
    t['terms']=list(t['terms'])+[x for x in b.get('terms',[]) if x[1] not in have]
    return t
