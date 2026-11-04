def T(head,rows,cap=''):
    h=''.join(f'<th>{x}</th>' for x in head)
    r=''.join('<tr>'+''.join(f'<td>{c}</td>' for c in row)+'</tr>' for row in rows)
    return (f'<p class="cap">{cap}</p>' if cap else '')+f'<div class="tw"><table><tr>{h}</tr>{r}</table></div>'
def SRC(t): return f'<p class="src" style="font-size:.85em;opacity:.75">出处：{t}</p>'
# water saturated vapor pressure, kPa (CRC Handbook, ITS-90)
VP=[(0,0.6113),(5,0.8726),(10,1.2282),(15,1.7058),(20,2.3393),(25,3.1699),(27,3.567),(30,4.2470),(35,5.6290),(37,6.280),(40,7.3849),(45,9.5950),(50,12.352),(55,15.762),(60,19.946),(65,25.042),(70,31.201),(75,38.595),(80,47.414),(85,57.867),(90,70.182),(95,84.608),(100,101.42)]
def mm(k): return k*760/101.325
