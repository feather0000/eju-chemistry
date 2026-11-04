import importlib.util,glob,os,math,sys
from math import *
bad=0;n=0;nc=0
for f in sorted(glob.glob('content/[0-9]*.py')):
    s=importlib.util.spec_from_file_location('m',f);m=importlib.util.module_from_spec(s);sys.path.insert(0,'content');s.loader.exec_module(m);t=m.TOPIC
    for k,p in enumerate(t['problems']):
        n+=1
        assert 0<=p['ans']<len(p['opts']),(f,k)
        if p['calc'] is None: nc+=1; continue
        v=eval(p['calc']); vals=p['vals']; c=vals[p['ans']]
        ok=abs(v-c)<=0.02*(abs(c) or 1) and all(abs(x-c)>0.03*(abs(c) or 1) for j,x in enumerate(vals) if j!=p['ans'])
        if not ok: bad+=1; print('FAIL',t['slug'],k+1,v,vals,p['ans'])

from balance import check, ARROW
import glob as G
def ces(txt):
    i=0
    while True:
        i=txt.find('\\ce{',i)
        if i<0: return
        j=i+4;d=1
        while d: d+= {'{':1,'}':-1}.get(txt[j],0); j+=1
        yield txt[i+4:j-1]; i=j
neq=0;skip=0;ebad=0
for f in sorted(G.glob('topics/*/index.html')):
    for e in set(ces(open(f).read())):
        if not ARROW.search(e): continue
        sides=[p for k,p in enumerate(ARROW.split(e)) if k%3==0]
        if any(not x.strip() for x in sides): skip+=1; continue
        neq+=1
        try: ok,_=check(e)
        except Exception as ex: ok=False; print('PARSE',f,e,ex)
        if not ok: ebad+=1; print('UNBALANCED',f,e)
print(f'{neq} chemical equations checked for element+charge balance, {ebad} unbalanced, {skip} partial fragments skipped')
bad+=ebad
import subprocess
r=subprocess.run(['node','tests/test_chem.js'],capture_output=True,text=True);print(r.stdout.strip())
if r.returncode: bad+=1
print(f'{n} problems, {n-nc} numerically verified, {nc} conceptual, {bad} failures'); sys.exit(1 if bad else 0)
