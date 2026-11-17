# 首页知识导图（星图／图鉴式，内联 SVG）的共用生成器：化学・生物・数学三站各放一份，内容相同（母版在 /workspace/eju-polish-work/homemap.py）。
# 移植自物理站 build.py 的 _map() / _fml()（提交 aa3473e），改成参数化：各站只传章、专题、代表式、联系和插图函数。
# 中心是科目名，内圈各章（扇区角按专题数分配），外圈各章专题；树干、树枝是填充的锥形三次贝塞尔，虚线联系走中心同心的「轨道」弧。
# 外圈专题较密时，专题框沿径向外推一档，并用一条细引线连回星点。末尾做几何检查（框、插图、标签、树枝、弧互不压，不出图框），
# 不过就 SystemExit，免得画出压字的图。颜色全用 CSS 变量（--mp-1…--mp-6，见各站首页样式块）。
import math, html, os
DEBUG = os.environ.get('HOMEMAP_DEBUG')
E = html.escape


def tw(s, fs):  # 文字宽度估计：CJK 一字一 em，其余约 .58 em
    return sum(fs if ord(ch) > 0x2E7F else fs * .58 for ch in s)


# —— 公式 → <text>/<tspan> ——
# 记法：_x / ^x 下标、上标（多字用 {…}）；紧跟在下标后的上标会叠在下标正上方；拉丁、希腊字母默认斜体，
# sin cos tan log lim gcd Cov 等函数名自动直立；` 切换直立／斜体（化学式整段用 ` 包起来，元素符号直立）；~x 粗体（向量）。
# 上下标用 dy 升降（Firefox 不认 tspan 上的 baseline-shift），之后归位。
_LET = set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZαβγδεθλμνπρσφωΦℓ')
_FN = ('sin', 'cos', 'tan', 'log', 'lim', 'gcd', 'Cov', 'exp')
_SUB = dict(zip('0123456789+-−=()aeinrx', '₀₁₂₃₄₅₆₇₈₉₊₋₋₌₍₎ₐₑᵢₙᵣₓ'))
_SUP = dict(zip('0123456789+-−=()nabx', '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁻⁼⁽⁾ⁿᵃᵇˣ'))


def _segs(s):
    """→ [(字符, 层 0/-1/+1, 斜体, 粗体, 叠放)]；叠放 = 该上标紧跟在下标之后，要退回到下标起点"""
    out, i, rom, after_sub = [], 0, False, False
    def chars(t, lv, stack=False):
        nonlocal rom
        j = 0
        while j < len(t):
            c = t[j]
            if c == '`': rom = not rom; j += 1; continue
            if c == '~': out.append((t[j + 1], lv, not rom, True, stack)); j += 2; stack = False; continue
            w = next((f for f in _FN if t.startswith(f, j)), None) if not rom else None
            if w: out.extend((ch, lv, False, False, stack and k == 0) for k, ch in enumerate(w)); j += len(w); stack = False; continue
            if 0x300 <= ord(c) < 0x370 and out: out.append((c,) + out[-1][1:4] + (False,)); j += 1; continue  # 组合附加符随前一字
            out.append((c, lv, c in _LET and not rom, False, stack)); j += 1; stack = False
    while i < len(s):
        c = s[i]
        if c in '_^':
            if s[i + 1] == '{': k = s.index('}', i); g = s[i + 2:k]; i = k + 1
            else: g = s[i + 1]; i += 2
            chars(g, -1 if c == '_' else 1, c == '^' and after_sub)
            after_sub = c == '_'
            continue
        k = i
        while k < len(s) and s[k] not in '_^': k += 1
        chars(s[i:k], 0); i = k; after_sub = False
    return out


def fml(s, x, y, ff=16, fsub=11):
    """返回 (<text>…</text>, 宽度 em)；ff 为公式字号，fsub 为上下标字号（与 CSS 的 .mp-f / .mp-fs 一致）"""
    runs = []
    for c, lv, it, bd, st in _segs(s):
        if runs and runs[-1][1:4] == [lv, it, bd] and not st: runs[-1][0] += c
        else: runs.append([c, lv, it, bd, st])
    def em(t, lv):
        return sum(0 if 0x300 <= ord(c) < 0x370 else 1.0 if ord(c) > 0x2E7F else .28 if c == ' ' else (.4 if lv else .56) for c in t)
    out, cur, w, sub_px, sub_em, plv = [], 0, 0, 0, 0, 0
    for t, lv, it, bd, st in runs:
        want = {-1: round(.25 * ff, 1), 1: round(-.4 * ff, 1)}.get(lv, 0)
        cls = ' '.join(c for c, on in (('mp-fi', it), ('mp-fb', bd), ('mp-fs', lv != 0)) if on)
        dx = -sub_px if st else 0
        out.append('<tspan' + (f' class="{cls}"' if cls else '') + (f' dx="{dx:g}"' if dx else '') + (f' dy="{want - cur:g}"' if want != cur else '') + f'>{E(t)}</tspan>')
        cur = want; e = em(t, lv)
        if st: w += max(0, e - sub_em); sub_px = sub_em = 0
        else:
            w += e
            if lv == -1:
                if plv != -1: sub_px = sub_em = 0
                sub_px = round(sub_px + sum(fsub * (.5 if ord(c) < 0x2E80 else 1) for c in t if not 0x300 <= ord(c) < 0x370), 1); sub_em += e
            elif lv == 0: sub_px = sub_em = 0
        plv = lv
    return f'<text class="mp-f" x="{x:.1f}" y="{y:.1f}" text-anchor="middle">{"".join(out)}</text>', w


def plain(s):
    """公式的无障碍读法：去掉标记，上下标尽量换成 Unicode 上下标字符"""
    out, i = '', 0
    s = s.replace('`', '').replace('~', '')
    while i < len(s):
        c = s[i]
        if c in '_^':
            if s[i + 1] == '{': k = s.index('}', i); g = s[i + 2:k]; i = k + 1
            else: g = s[i + 1]; i += 2
            m = _SUB if c == '_' else _SUP
            out += ''.join(m[ch] for ch in g) if all(ch in m for ch in g) else ('_' if c == '_' else '^') + g
            continue
        out += c; i += 1
    return out


# —— 线描插图：(x, y) 是左上角，s 是边长；只有细线，个别小点实心。body(P) 里用 P(u, v) 取单位正方形内的点 ——
def ico(x, y, s, body):
    return f'<g class="mp-ic mp-d" aria-hidden="true">{body(lambda u, v: f"{x + u * s:.1f} {y + v * s:.1f}", lambda r: f"{r * s:.1f}")}</g>'


def render(C):
    W, H, CX, CY = C['W'], C['H'], C['CX'], C['CY']
    R0, R1, R2, NR, IS = C['R0'], C['R1'], C['R2'], C['NR'], C['IS']
    FN, FF, FSUB, FL, BH, GAP = C['FN'], C['FF'], C['FSUB'], C['FL'], C['BH'], C['GAP']
    LANES = C.get('LANES') or [R2 - 24, R2 - 43, R2 - 62]  # 联系弧走的同心轨道（外→内），都在章节点外缘与专题环之间
    LIM = min(CX, W - CX, CY) - 34  # 外圈刻度
    rad = math.radians
    def pol(r, a): return (CX + r * math.sin(rad(a)), CY - r * math.cos(rad(a)))
    def ang(p): return math.degrees(math.atan2(p[0] - CX, CY - p[1])) % 360
    def f(p): return f'{p[0]:.1f} {p[1]:.1f}'
    def bez(p, t): return tuple((1 - t) ** 3 * p[0][i] + 3 * (1 - t) ** 2 * t * p[1][i] + 3 * (1 - t) * t * t * p[2][i] + t ** 3 * p[3][i] for i in (0, 1))
    def samp(p, n=80): return [bez(p, i / n) for i in range(n + 1)]
    def line(a, b, n=30): return [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n + 1)]
    def taper(p, h0, h1):  # 锥形树枝：两条近似偏移的三次曲线在尖端收拢成填充路径（Tiller–Hanson 近似）
        def nrm(a, b):
            dx, dy = b[0] - a[0], b[1] - a[1]; l = math.hypot(dx, dy) or 1; return (-dy / l, dx / l)
        n0, n3 = nrm(p[0], p[1] if p[1] != p[0] else p[3]), nrm(p[2], p[3]); hs = [h0, h0 + (h1 - h0) / 3, h0 + 2 * (h1 - h0) / 3, h1]; ns = [n0, n0, n3, n3]
        L = [(q[0] + n[0] * h, q[1] + n[1] * h) for q, n, h in zip(p, ns, hs)]; R = [(q[0] - n[0] * h, q[1] - n[1] * h) for q, n, h in zip(p, ns, hs)]
        return f'M{f(L[0])}C{f(L[1])} {f(L[2])} {f(L[3])}L{f(R[3])}C{f(R[2])} {f(R[1])} {f(R[0])}Z'
    CH = C['chapters']
    cols = [c['topics'] for c in CH]
    TT = {t['slug']: t for ts in cols for t in ts}
    # 扇区：权重 = max(专题数, 最小值) + 间隔；第 1 章的扇区中心在 start 角（0° 朝上，顺时针），其余顺时针排开
    wt = [max(len(ts), C.get('MINSEC', 1.5)) + C.get('PAD', .4) for ts in cols]; unit = 360 / sum(wt)
    a0 = C['start'] - wt[0] * unit / 2; sec = []
    for w in wt: sec.append((a0, a0 + w * unit)); a0 += w * unit
    chA = [(s + e) / 2 for s, e in sec]
    tA, tC, box, star, twig, lead = {}, {}, {}, {}, {}, {}
    for c, ts in enumerate(cols):
        for i, t in enumerate(ts): tA[t['slug']] = chA[c] + (i - (len(ts) - 1) / 2) * unit; tC[t['slug']] = c
    def rhit(a, b, m=0): return a[0] - m < b[0] + b[2] and b[0] - m < a[0] + a[2] and a[1] - m < b[1] + b[3] and b[1] - m < a[1] + a[3]
    def pin(p, r, m=0): return r[0] - m < p[0] < r[0] + r[2] + m and r[1] - m < p[1] < r[1] + r[3] + m
    # 专题框：沿径向放在星点外侧（矩形支撑函数），框宽按题名和公式宽度；与已放的框相压时沿径向外推一档，引线连回星点
    for sl in sorted(tA, key=lambda s: tA[s] % 360):
        t = TT[sl]; a = tA[sl]; P = pol(R2, a); star[sl] = P
        w = max(tw(t['label'], FN), fml(t['f'], 0, 0, FF, FSUB)[1] * FF) + 30
        u = (math.sin(rad(a)), -math.cos(rad(a))); sup = abs(u[0]) * w / 2 + abs(u[1]) * BH / 2
        tin = min(w / 2 / abs(u[0]) if abs(u[0]) > 1e-9 else 1e9, BH / 2 / abs(u[1]) if abs(u[1]) > 1e-9 else 1e9)
        for k in range(10):
            d = GAP + sup + k * (BH * .5 + 6)
            r = (P[0] + u[0] * d - w / 2, P[1] + u[1] * d - BH / 2, w, BH)
            if not any(rhit(r, b, 8) for b in box.values()): break
        else: raise SystemExit(f'导图：{sl} 的专题框放不下')
        box[sl] = r
        if DEBUG: print(f'  box {sl:24s} a={a % 360:6.1f} push={k} w={w:5.1f} far={max(math.hypot(px - CX, py - CY) for px in (r[0], r[0] + w) for py in (r[1], r[1] + BH)):5.1f}/{LIM}')
        if k: lead[sl] = (pol(R2 + 5, a), (P[0] + u[0] * (d - tin), P[1] + u[1] * (d - tin)))
        c = tC[sl]; Q = pol(R1, chA[c]); da = a - chA[c]
        twig[sl] = (Q, pol(R1 + .32 * (R2 - R1), chA[c] + .55 * da), pol(R2 - .5 * (R2 - R1), a), P)
    chP = [pol(R1, a) for a in chA]
    trunk = [(pol(0, a), pol(.4 * R1, a - 7), pol(.72 * R1, a - 2), pol(R1, a)) for a in chA]
    # 几何对象：每样东西 = (种类, 归属, 形状)；形状是矩形或采样点
    curves = [('trunk', c, samp(p)) for c, p in enumerate(trunk)] + [('twig', sl, samp(p)) for sl, p in twig.items()] + [('twig', sl, line(*p)) for sl, p in lead.items()]
    rects = [('box', sl, b) for sl, b in box.items()] + [('node', c, (p[0] - NR, p[1] - NR, 2 * NR, 2 * NR)) for c, p in enumerate(chP)] + [('root', None, (CX - R0, CY - R0, 2 * R0, 2 * R0))]
    # 插图：放在内圈（中心圆与章环之间），本章树干旁。先给每章列出不压框、节点、树干树枝的候选位置（离树干约 24° 的优先），
    # 再回溯挑一组互不相压的组合；找不到就报错
    cand = []
    for c, a in enumerate(chA):
        cs, why = [], set()
        for r, da in [(R1 * r, s * da) for da in sorted(range(12, 44, 2), key=lambda d: abs(d - 24)) for s in (1, -1) for r in (.635, .587, .683, .54, .73)]:
            p = pol(r, a + da); rc = (p[0] - IS / 2, p[1] - IS / 2, IS, IS)
            hit = next((o[:2] for o in rects if rhit(rc, o[2], 8)), None) or next((('curve', o) for k, o, pts in curves if any(pin(q, rc, 7) for q in pts)), None)
            if hit: why.add(str(hit)); continue
            cs.append(rc)
        if not cs: raise SystemExit(f'导图：第 {c + 1} 章的插图放不下（被 {sorted(why)} 挡住）')
        cand.append(cs)
    pick = {}
    def dfs(order):
        if not order: return True
        c = order[0]
        for rc in cand[c]:
            if any(rhit(rc, q, 8) for q in pick.values()): continue
            pick[c] = rc
            if dfs(order[1:]): return True
            del pick[c]
        return False
    if not dfs(sorted(range(len(chA)), key=lambda c: len(cand[c]))): raise SystemExit('导图：各章插图互相挤压，找不到一组放得下的位置')
    icon = {c: ('icon', c, rc) for c, rc in pick.items()}
    rects += [icon[c] for c in sorted(icon)]
    # 联系弧：两端星点 → 平滑转入某条同心轨道 → 沿圆弧走 → 转出到另一端。短的先挑外轨道；标签沿弧写（textPath），挑没有树枝穿过的一段
    xl, lanes_used, labels = [], {r: [] for r in LANES}, []
    def lab_hits(rl, lo, hi, pts):  # 标签所占的环形扇区里有没有点
        for q in pts:
            r = math.hypot(q[0] - CX, q[1] - CY)
            if rl - 11 < r < rl + 11 and (ang(q) - lo) % 360 < (hi - lo) % 360: return True
        return False
    XL = [tuple(x[:3]) for x in C['xlinks']]  # (slug, slug, 弧上标签[, 图注里的全称])
    FULL = {(x[0], x[1]): x[3] if len(x) > 3 else x[2] for x in C['xlinks']}
    for a, b, s in XL:
        if a not in tA or b not in tA: raise SystemExit(f'导图：联系 {a}–{b} 的端点不在图上')
    order = sorted(XL, key=lambda x: min((tA[x[1]] - tA[x[0]]) % 360, (tA[x[0]] - tA[x[1]]) % 360))
    tree = [q for _, _, ps in curves for q in ps]
    def windows(x, others):  # 某条弧上可放标签的起始角，按离弧中点的远近排（尽量避开左右两侧，那里字会竖起来）
        a, b, s, ta, span, rl, dl, lw = x[:8]
        lo_, hi_ = ta + dl / 2 + .5, ta + span - dl / 2 - .5 - lw; mid = ta + span / 2 - lw / 2
        for lo in sorted([lo_ + (hi_ - lo_) * i / 40 for i in range(41)], key=lambda v: abs(v - mid) + 25 * (abs(math.sin(rad(v + lw / 2))) > .8)):
            if not lab_hits(rl, lo % 360, (lo + lw) % 360, others): yield lo
    for a, b, s in order:  # 第一步：分轨道（短弧优先占外轨；同一轨道只许首尾相接；要留得下标签且那段没有树枝）
        if (tA[b] - tA[a]) % 360 > 180: a, b = b, a
        ta, span = tA[a], (tA[b] - tA[a]) % 360
        for rl in LANES:
            if any(((s2 - ta) % 360 < span - .5) or ((ta - s2) % 360 < (e2 - s2) % 360 - .5) for s2, e2 in lanes_used[rl]): continue
            dl = math.degrees((R2 - rl) * .75 / rl); lw = math.degrees((tw(s, FL) + 8) / rl)
            if span - dl < lw + 1: continue
            A, B = star[a], star[b]; Qa, Qb = pol(rl, ta + dl), pol(rl, ta + span - dl)
            ca = (A, pol(R2 - .55 * (R2 - rl), ta), pol(rl, ta + .5 * dl), Qa); cb = (Qb, pol(rl, ta + span - .5 * dl), pol(R2 - .55 * (R2 - rl), ta + span), B)
            pts = samp(ca, 40) + [pol(rl, ta + dl + (span - 2 * dl) * i / 120) for i in range(121)] + samp(cb, 40)
            x = [a, b, s, ta, span, rl, dl, lw, f'M{f(A)}C{f(ca[1])} {f(ca[2])} {f(Qa)}A{rl} {rl} 0 {1 if span - 2 * dl > 180 else 0} 1 {f(Qb)}C{f(cb[1])} {f(cb[2])} {f(B)}', pts]
            if next(windows(x, tree), None) is None: continue
            lanes_used[rl].append((ta % 360, (ta + span) % 360)); xl.append(x); break
        else: raise SystemExit(f'导图：{a}–{b} 的联系弧找不到轨道')
    for x in sorted(xl, key=lambda x: x[4] - x[6]):  # 第二步：所有弧定下后再放标签（避开树枝、别的弧、已放的标签）
        others = tree + [q for y in xl if y is not x for q in y[9]]
        for lo in windows(x, others):
            if any(abs(L[0] - x[5]) < 25 and ((lo - L[1]) % 360 < (L[2] - L[1]) % 360 + 2 or (L[1] - lo) % 360 < x[7] + 2) for L in labels): continue  # 相邻轨道的标签不上下叠
            labels.append((x[5], lo % 360, (lo + x[7]) % 360, x[2], x[0], x[1])); break
        else: raise SystemExit(f'导图：放不下联系标签「{x[2]}」')
    xl = [(x[0], x[1], x[2], x[8], x[5], x[9]) for x in xl]
    if not (R1 + NR + 2 < LANES[-1] - 11 and LANES[0] + 11 < R2 - 5): raise SystemExit('导图：联系标签的环带会压到章节点或星点')
    # 总检查：框与框、框/节点/插图与所有曲线、框不出图框
    allpts = [(k, o, q) for k, o, ps in curves for q in ps] + [('xl', (x[0], x[1]), q) for x in xl for q in x[5]]
    inner = (40, 40, W - 80, H - 130)
    for i, (k1, o1, r1) in enumerate(rects):
        if not pin((r1[0], r1[1]), inner) or not pin((r1[0] + r1[2], r1[1] + r1[3]), inner): raise SystemExit(f'导图：{k1} {o1} 超出图框')
        for k2, o2, r2 in rects[i + 1:]:
            if rhit(r1, r2, 6): raise SystemExit(f'导图：{k1} {o1} 与 {k2} {o2} 重叠')
        for k, o, q in allpts:
            own = (k1 == 'box' and o == o1) or (k1 == 'node' and k in ('trunk', 'twig') and (o == o1 or (k == 'twig' and tC[o] == o1))) or (k1 == 'root' and k == 'trunk')
            if not own and pin(q, r1, 2 if k == 'xl' else 3): raise SystemExit(f'导图：{k} {o} 穿过 {k1} {o1}')
    far = [(k, o, [q for q in ps if all(math.hypot(q[0] - p[0], q[1] - p[1]) > NR + 2 for p in chP + [(CX, CY)])]) for k, o, ps in curves]
    for i, (k1, o1, p1) in enumerate(far):  # 节点之外，树干、树枝、引线互不相碰（同一专题的树枝与引线在星点相接，不算）
        for k2, o2, p2 in far[i + 1:]:
            if o1 == o2 and k1 == k2 == 'twig': continue
            if any(abs(q[0] - p[0]) < 3 and abs(q[1] - p[1]) < 3 for q in p1 for p in p2): raise SystemExit(f'导图：{k1} {o1} 与 {k2} {o2} 相碰')
    for _, sl, ps in (c for c in curves if c[0] == 'twig'):  # 联系弧不得长段贴着树枝走
        for x in xl:
            if sl in x[:2]: continue
            run, prev = 0, None
            for q in x[5]:  # 弧与树枝相距 < 3 的连续长度；正交穿过约 6–8，顺着走会远超 16
                close = any(math.hypot(q[0] - p[0], q[1] - p[1]) < 3 for p in ps)
                run = run + math.hypot(q[0] - prev[0], q[1] - prev[1]) if close and prev else 0
                prev = q if close else None
                if run > 16: raise SystemExit(f'导图：{x[0]}–{x[1]} 的弧贴着 {sl} 的树枝走')
    for sl, b in box.items():  # 专题框不越过外圈刻度环的外线
        if any(math.hypot(px - CX, py - CY) > LIM for px in (b[0], b[0] + b[2]) for py in (b[1], b[1] + b[3])): raise SystemExit(f'导图：{sl} 的专题框压到外圈刻度')
    # 输出
    S = C['subject']
    out = [f'<svg class="mp-svg" viewBox="0 0 {W} {H}" aria-labelledby="mp-svgt"><title id="mp-svgt">{E(S)}知识导图</title>', '<g class="mp-grid" aria-hidden="true">']
    out.append(''.join(f'<circle cx="{CX}" cy="{CY}" r="{r:g}"/>' for r in (R0 + 30, round((R0 + R1) / 2 + 27), R1, round((R1 + R2) / 2 + 2), R2, R2 + 72, R2 + 142) if r < LIM - 20)
               + f'<circle class="mp-lim" cx="{CX}" cy="{CY}" r="{LIM}"/><circle class="mp-lim" cx="{CX}" cy="{CY}" r="{LIM - 9}"/>')
    out.append('<path d="' + ''.join(f'M{f(pol(R0 + 8, a))}L{f(pol(LIM - 9, a))}' for a in range(0, 360, 30)) + ''.join(f'M{f(pol(LIM - 9, a))}L{f(pol(LIM - (0 if a % 30 == 0 else 4 if a % 10 else 1.5), a))}' for a in range(0, 360, 5)) + '"/></g>')
    m1, m2 = 14, 21
    out.append(f'<g class="mp-frame" aria-hidden="true"><rect x="{m1}" y="{m1}" width="{W - 2 * m1}" height="{H - 2 * m1}"/><rect class="mp-thin" x="{m2}" y="{m2}" width="{W - 2 * m2}" height="{H - 2 * m2}"/><path class="mp-thin" d="'
               + ''.join(f'M{x0 + sx * 30} {y0 + sy * 54}V{y0 + sy * 30}H{x0 + sx * 54}' for x0, y0, sx, sy in ((0, 0, 1, 1), (W, 0, -1, 1), (0, H, 1, -1), (W, H, -1, -1))) + '"/>'
               + ''.join(f'<rect class="mp-cn" x="{x0 - 5}" y="{y0 - 5}" width="10" height="10"/><rect class="mp-cnd" x="{x0 - 2}" y="{y0 - 2}" width="4" height="4"/>' for x0 in ((m1 + m2) / 2, W - (m1 + m2) / 2) for y0 in ((m1 + m2) / 2, H - (m1 + m2) / 2)))
    cy2 = H - 64; ja = C['cap_ja']; zh = f'{S}知识体系　{len(CH)} 章 · {len(tA)} 个专题'; hw = tw(ja, 19) * 1.2 / 2 + 22
    out.append(f'<path class="mp-thin" d="M{CX - hw - 70:.0f} {cy2 - 6}H{CX - hw:.0f}M{CX - hw - 70:.0f} {cy2 - 2}H{CX - hw:.0f}M{CX + hw:.0f} {cy2 - 6}H{CX + hw + 70:.0f}M{CX + hw:.0f} {cy2 - 2}H{CX + hw + 70:.0f}"/>'
               f'<text class="mp-cap" x="{CX}" y="{cy2}" text-anchor="middle" lang="ja">{ja}</text><text class="mp-cap2" x="{CX}" y="{cy2 + 26}" text-anchor="middle">{E(zh)}</text></g>')
    out.append('<defs>' + ''.join(  # 标签路径：上半圈顺时针、下半圈逆时针，文字始终正着读；半径错开半个字高让字居中压在弧上
        (lambda rl, lo, hi, flip: f'<path id="mp-lp{i}" d="M{f(pol(rl + (5 if flip else -5), hi if flip else lo))}A{rl + (5 if flip else -5)} {rl + (5 if flip else -5)} 0 0 {0 if flip else 1} {f(pol(rl + (5 if flip else -5), lo if flip else hi))}"/>')
        (L[0], L[1], L[2], 90 < (L[1] + ((L[2] - L[1]) % 360) / 2) % 360 < 270) for i, L in enumerate(labels)) + '</defs>')
    lab_of = {(L[4], L[5]): i for i, L in enumerate(labels)}
    out.append('<g class="mp-xls" aria-hidden="true">' + ''.join(
        f'<g class="mp-d mp-xl" data-a="{a}" data-b="{b}"><path d="{d}"/><text><textPath href="#mp-lp{lab_of[(a, b)]}" startOffset="50%" text-anchor="middle">{E(s)}</textPath></text></g>' for a, b, s, d, rl, _ in xl) + '</g>')
    for c, (ch, ts) in enumerate(zip(CH, cols)):
        k = c + 1; ix = icon[c][2]
        out.append(f'<g class="mp-br mp-c{k}">')
        out.append(f'<path class="mp-d mp-tr" data-ch="{k}" aria-hidden="true" d="{taper(trunk[c], 3.2, 1.7)}"/>')
        out += [f'<path class="mp-d mp-tw" data-ch="{k}" data-slug="{t["slug"]}" aria-hidden="true" d="{taper(twig[t["slug"]], 1.6, .35)}"/>' for t in ts]
        out.append(ch['icon'](ix[0], ix[1], IS).replace('<g class="mp-ic mp-d"', f'<g class="mp-ic mp-d" data-ch="{k}"', 1))
        p = chP[c]; sh = ch['short']; fch = min(C.get('FCH', 22), round((2 * NR - 22) / len(sh), 1))
        out.append(f'<a class="mp-d mp-chn" data-ch="{k}" href="#ch-{k}" aria-label="第 {k} 章 {E(ch["name"])}，{len(ts)} 个专题"><title lang="ja">第 {k} 章 · {E(ch["ja"])}</title>'
                   f'<circle class="mp-nb" cx="{p[0]:.1f}" cy="{p[1]:.1f}" r="{NR}"/><circle class="mp-nr" cx="{p[0]:.1f}" cy="{p[1]:.1f}" r="{NR - 4}"/>'
                   f'<text class="mp-chk" x="{p[0]:.1f}" y="{p[1] - 11:.1f}" text-anchor="middle">第 {k} 章</text><text class="mp-ch" x="{p[0]:.1f}" y="{p[1] + 16:.1f}" text-anchor="middle"'
                   + (f' style="font-size:{fch:g}px"' if fch < C.get('FCH', 22) else '') + f'>{E(sh)}</text></a>')
        for t in ts:
            sl = t['slug']; bx, by, bw, bh = box[sl]; P = star[sl]
            ld = f'<path class="mp-ld" d="M{f(lead[sl][0])}L{f(lead[sl][1])}"/>' if sl in lead else ''
            out.append(f'<a class="mp-d mp-tn" data-ch="{k}" data-slug="{sl}" href="{t["href"]}" aria-label="{E(t["num"])} {E(t["zh"])}：{E(plain(t["f"]))}"><title lang="ja">{E(t["ja"])}</title>'
                       f'<circle class="mp-star" cx="{P[0]:.1f}" cy="{P[1]:.1f}" r="3.4"/>{ld}<rect class="mp-box" x="{bx:.1f}" y="{by:.1f}" width="{bw:.1f}" height="{bh}"/>'
                       f'<text class="mp-t" x="{bx + bw / 2:.1f}" y="{by + BH * .43:.1f}" text-anchor="middle">{E(t["label"])}</text>{fml(t["f"], bx + bw / 2, by + BH * .81, FF, FSUB)[0]}</a>')
        out.append('</g>')
    out.append(f'<a class="mp-root" href="#chapters" aria-label="{E(S)}：回到目次"><title lang="ja">{E(C.get("subject_ja", S))}</title><circle class="mp-rb" cx="{CX}" cy="{CY}" r="{R0}"/><circle class="mp-rr" cx="{CX}" cy="{CY}" r="{R0 - 5}"/>'
               f'<text class="mp-rt" x="{CX + 4}" y="{CY + 10}" text-anchor="middle">{E(S)}</text></a></svg>')
    legend = ''.join(f'<li><a href="{TT[a]["href"]}">{E(TT[a]["zh"])}</a> — <a href="{TT[b]["href"]}">{E(TT[b]["zh"])}</a>：{E(FULL[(a, b)])}</li>' for a, b, s in XL)
    stats = dict(boxes=len(box), leaders=len(lead), links=len(xl), lanes={r: len(v) for r, v in lanes_used.items()},
                 labels=[(L[3], round(L[0]), round(L[1]), round(L[2])) for L in labels], sectors=[(round(s), round(e)) for s, e in sec])
    return ''.join(out), legend, stats
