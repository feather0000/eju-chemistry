/* Lazy KaTeX: render formulas only near the viewport / when a <details> opens,
   plus small idle-time slices, so no multi-second long task blocks the page. */
(function(){
  var orig=window.renderMathInElement; if(!orig||orig.__lazy) return;
  var RE=/\$|\\\(|\\\[|\\begin\{/;
  var SKIP=/^(SCRIPT|STYLE|TEXTAREA|PRE|CODE|OPTION|NOSCRIPT)$/;
  /* Stash the contents of closed solutions so they are not in the live DOM
     (fewer nodes = cheaper style/layout for every interaction). */
  var stash=new Map();
  function park(el){if(stash.has(el)||!el.firstChild)return;var f=document.createDocumentFragment(),keep=el.nodeName==='DETAILS'?el.querySelector(':scope>summary'):null;
    Array.prototype.slice.call(el.childNodes).forEach(function(c){if(c!==keep)f.appendChild(c);});stash.set(el,f);}
  var ready=new WeakSet();
  function prep(f,opts){if(ready.has(f))return;ready.add(f);var tmp=document.createElement('div');tmp.appendChild(f);try{orig(tmp,opts);}catch(e){}while(tmp.firstChild)f.appendChild(tmp.firstChild);}
  function unpark(el,opts){var f=stash.get(el);if(!f)return;stash.delete(el);prep(f,opts);el.appendChild(f);}
  /* pre-render parked solutions off-DOM during idle time, so opening one is just an append */
  function idlePrep(opts){var list=Array.from(stash.values()),i=0,ric=window.requestIdleCallback||function(f){return setTimeout(function(){f({timeRemaining:function(){return 8}})},60)};
    function step(dl){while(i<list.length&&dl.timeRemaining()>3){prep(list[i++],opts);}if(i<list.length)ric(step);}
    setTimeout(function(){ric(step);},800);}
  function setupStash(opts){
    document.querySelectorAll('svg.chart,canvas,input[type=range]').forEach(function(e){var p=e.parentElement;if(p&&p!==document.body&&!p.matches('main,section,article'))p.classList.add('cbox');});
    var ds=document.querySelectorAll('details:not([open])');
    ds.forEach(function(d){if(d.closest('.eju-site-nav'))return;park(d);});
    var hs=document.querySelectorAll('.toggle-ans + [hidden], .toggle-ans ~ .ans[hidden], .answer[hidden], .sol[hidden]');
    var mo=new MutationObserver(function(ms){ms.forEach(function(m){if(!m.target.hidden)unpark(m.target,opts);});});
    hs.forEach(function(h){park(h);mo.observe(h,{attributes:true,attributeFilter:['hidden']});});
    document.addEventListener('click',function(e){var s=e.target.closest&&e.target.closest('summary');if(s&&s.parentNode&&stash.has(s.parentNode))unpark(s.parentNode,opts);},true);
    document.addEventListener('toggle',function(e){if(e.target.open)unpark(e.target,opts);},true);
    window.addEventListener('beforeprint',function(){stash.forEach(function(f,el){unpark(el,opts);});});
    function hash(){var id=decodeURIComponent(location.hash.slice(1));if(!id||document.getElementById(id))return;stash.forEach(function(f,el){if(f.querySelector('#'+CSS.escape(id))){unpark(el,opts);if(el.nodeName==='DETAILS')el.open=true;else el.hidden=false;document.getElementById(id).scrollIntoView();}});}
    idlePrep(opts);
    window.addEventListener('hashchange',hash);setTimeout(hash,0);
  }
  function lazy(root,opts){
    setupStash(opts);
    var todo=[],seen=new Set();
    var w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:function(n){
      if(!RE.test(n.nodeValue))return 2;
      for(var p=n.parentNode;p&&p!==root;p=p.parentNode){if(SKIP.test(p.nodeName)||(p.classList&&p.classList.contains('katex')))return 2;}
      return 1;}});
    var tn=[],n;while((n=w.nextNode()))tn.push(n);
    for(var ti=0;ti<tn.length;ti++){n=tn[ti];var el=n.parentNode;
      // render at the nearest block so delimiters split across inline tags still match
      while(el!==root&&el.parentNode&&/^(SPAN|B|STRONG|EM|I|SUB|SUP|A|SMALL|MARK|U|LABEL)$/.test(el.nodeName))el=el.parentNode;
      if(el.getElementsByTagName('*').length>150){ /* big container: render just this text node */
        var sp=document.createElement('span');sp.className='lk-t';n.parentNode.insertBefore(sp,n);sp.appendChild(n);el=sp;}
      if(!seen.has(el)){seen.add(el);todo.push(el);}}
    // drop elements contained in another queued element
    todo=todo.filter(function(e){for(var p=e.parentNode;p;p=p.parentNode)if(seen.has(p))return false;return true;});
    var done=new WeakSet();
    function go(el){if(done.has(el))return;done.add(el);io&&io.unobserve(el);try{orig(el,opts);}catch(e){}}
    var q=[],pumping=false;
    function pump(){var t=performance.now();while(q.length&&performance.now()-t<6){if(navigator.scheduling&&navigator.scheduling.isInputPending&&navigator.scheduling.isInputPending())break;go(q.shift());}
      if(q.length)setTimeout(pump,0);else pumping=false;}
    var io='IntersectionObserver' in window?new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting&&!done.has(e.target))q.push(e.target);});
      /* nearest-to-viewport first */
      q.sort(function(a,b){return Math.abs(a.getBoundingClientRect().top)-Math.abs(b.getBoundingClientRect().top);});
      if(!pumping&&q.length){pumping=true;setTimeout(pump,0);}},{rootMargin:'1200px 0px'}):null;
    if(!io){todo.forEach(go);return;}
    todo.forEach(function(e){io.observe(e);});
    document.addEventListener('toggle',function(ev){var d=ev.target;if(d.open)todo.forEach(function(e){if(d.contains(e))go(e);});},true);
    // render whatever is still pending in small idle slices (keeps find-in-page/print correct)
    var i=0,ric=window.requestIdleCallback||function(f){return setTimeout(function(){f({timeRemaining:function(){return 8}})},50)};
    function idle(dl){while(i<todo.length&&dl.timeRemaining()>4){go(todo[i++]);}if(i<todo.length)ric(idle,{timeout:2000});}
    setTimeout(function(){ric(idle,{timeout:2000});},1500);
    window.addEventListener('beforeprint',function(){todo.forEach(go);});
  }
  var wrap=function(el,opts){ if(el===document.body||el===document.documentElement) return lazy(el,opts); return orig(el,opts); };
  wrap.__lazy=true; window.renderMathInElement=wrap;
})();
