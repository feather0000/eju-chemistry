"""EJU 站点的正式地址与预览开关。

默认 EJU_ENV=prod：给正式站用，不加「测试版」横幅，也不写 noindex。
EJU_ENV=preview：给 PR / 本地预览构建用，写入 noindex、robots.txt Disallow，
并在页顶加一条指向正式站的横幅。SITE_BASE 可覆盖本构建自称的来源（一般不必改；
canonical 和 og:url 始终指向正式站，免得预览页被当成正式地址分享出去）。

不要把 preview 构建的 HTML 提交到 main。四站 GitHub Pages 的源都是 main。
"""
from __future__ import annotations

import os
import re

PROD = {
    'physics': 'https://eju.feather0.com/',
    'chemistry': 'https://chemistry.eju.feather0.com/',
    'biology': 'https://biology.eju.feather0.com/',
    'calculus': 'https://math.eju.feather0.com/',
}
HUB = 'https://eju.feather0.com/'
# 物理课程首页在总入口域名下的 /physics/，专题仍在域名根路径 /topics/。
COURSE_HOME = {
    'physics': 'physics/',
    'chemistry': '',
    'biology': '',
    'calculus': '',
}

_PV_RE = re.compile(r'<!--eju-pv-->.*?<!--/eju-pv-->', re.S)


def _norm(url):
    url = (url or '').strip()
    if url and not url.endswith('/'):
        url += '/'
    return url


def load(site):
    if site not in PROD:
        raise SystemExit(f'unknown EJU site {site!r}')
    env = os.environ.get('EJU_ENV', 'prod').strip().lower() or 'prod'
    if env not in ('prod', 'preview'):
        print(f'warning: EJU_ENV={env!r} is not prod or preview; using prod')
        env = 'prod'
    prod_url = PROD[site]
    site_base = _norm(os.environ.get('SITE_BASE', '')) or prod_url
    return type('Cfg', (), {
        'site': site,
        'env': env,
        'preview': env == 'preview',
        'prod_url': prod_url,
        'site_url': prod_url,  # og / canonical
        'site_base': site_base,
        'site_path': '/',
        'hub': HUB,
        'course_home': COURSE_HOME[site],
    })()


def canonical(cfg, path):
    path = path or ''
    if path.startswith('/'):
        path = path[1:]
    return cfg.prod_url + path


def extra_meta(cfg, path):
    s = f'<link rel="canonical" href="{canonical(cfg, path)}">'
    if cfg.preview:
        s += '<meta name="robots" content="noindex, nofollow">'
    return s


def banner(cfg, path=''):
    if not cfg.preview:
        return ''
    href = canonical(cfg, path)
    return (
        '<!--eju-pv--><aside class="eju-pv" role="note">'
        '<p>测试版 / プレビュー　这是预览页，不是正式站。'
        f'<a href="{href}">打开正式版</a></p></aside><!--/eju-pv-->'
    )


def with_banner(cfg, html, path=''):
    html = _PV_RE.sub('', html)
    b = banner(cfg, path)
    if not b:
        return html
    return re.sub(r'(<body\b[^>]*>)', r'\1' + b, html, count=1, flags=re.I)


def write_robots(cfg, path='robots.txt'):
    if cfg.preview:
        open(path, 'w').write('User-agent: *\nDisallow: /\n')
    else:
        open(path, 'w').write('User-agent: *\nAllow: /\n')
