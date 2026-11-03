def P(q,opts,ans,sol,calc=None,vals=None):
    return dict(q=q,opts=opts,ans=ans,sol=sol,calc=calc,vals=vals)
def F(*rows):
    return '<div class="formula-grid">'+''.join(f'<div>$${r}$$</div>' for r in rows)+'</div>'
def B(title,body,kind=''):
    return f'<div class="box {kind}"><p><strong>{title}</strong>　{body}</p></div>'
def CE(*rows):
    return '<div class="formula-grid">'+''.join(f'<div>$$\\ce{{{r}}}$$</div>' for r in rows)+'</div>'
