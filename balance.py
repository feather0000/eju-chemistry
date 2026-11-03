import re
from collections import Counter
def strip_state(t): return re.sub(r'\((s|l|g|aq)\)','',t)
def parse_formula(f):
    f=f.replace('{','').replace('}','')
    charge=0
    m=re.search(r'\^?(\d*)([+-])$',f)
    # charge forms: Na+, Cl-, Mg^2+, SO4^2-, e-
    if f=='e-': return Counter(),-1
    m=re.match(r'^(.*?)\^(\d*)([+-])$',f) or re.match(r'^(.*?[A-Za-z\)\]])(\d*)([+-]+)$',f) if ('^' in f or f[-1] in '+-') else None
    if m:
        body=m.group(1); n=m.group(2); sgn=m.group(3)
        if '^' in f: q=int(n or 1)
        else:
            q=len(sgn); body=body+n  # e.g. NO3- : digits belong to body
        charge=q if sgn[0]=='+' else -q; f=body
    parts=re.split(r'[.·*]',f)
    tot=Counter()
    for part in parts:
        mm=re.match(r'^(\d+)(.*)$',part); k=1
        if mm and parts.index(part)>0: k=int(mm.group(1)); part=mm.group(2)
        tot+=atoms(part,k)
    return tot,charge
def atoms(s,k=1):
    c=Counter(); i=0; stack=[Counter()]
    toks=re.findall(r'[A-Z][a-z]?|\d+|[()\[\]]',s)
    if ''.join(toks)!=s: raise ValueError('bad formula '+s)
    j=0
    while j<len(toks):
        t=toks[j]
        if t in '([': stack.append(Counter())
        elif t in ')]':
            g=stack.pop(); n=1
            if j+1<len(toks) and toks[j+1].isdigit(): n=int(toks[j+1]); j+=1
            for e in g: stack[-1][e]+=g[e]*n
        elif t.isdigit(): raise ValueError('stray num '+s)
        else:
            n=1
            if j+1<len(toks) and toks[j+1].isdigit(): n=int(toks[j+1]); j+=1
            stack[-1][t]+=n
        j+=1
    for e in stack[0]: c[e]=stack[0][e]*k
    return c
def side(s):
    tot=Counter(); q=0
    for term in re.split(r'\s\+\s',s.strip()):
        term=term.strip()
        term=re.sub(r'\s+(v|\^)$','',term)
        m=re.match(r'^(\d+(?:/\d+)?)\s*(.*)$',term)
        k=1
        if m and m.group(2) and not m.group(2)[0].isdigit() and not (m.group(2).startswith('^')):
            k=eval(m.group(1)); term=m.group(2)
        a,ch=parse_formula(strip_state(term).replace(' ',''))
        for e in a: tot[e]+=a[e]*k
        q+=ch*k
    return tot,q
ARROW=re.compile(r'\s(->|<=>|<-)(\[[^\]]*\])*\s')
def check(eq):
    eq=re.sub(r'\$[^$]*\$','',eq)
    parts=ARROW.split(eq)
    sides=[p for i,p in enumerate(parts) if i%3==0]
    res=[side(s) for s in sides]
    ok=all(abs(sum(res[0][0].values())-0)>=0 for _ in [0]) and all(+(r[0])==+(res[0][0]) and abs(r[1]-res[0][1])<1e-9 for r in res[1:])
    return ok,res
