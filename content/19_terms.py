from _x import *
TOP = others(17)
S, N = term_sections(TOP, 'chemistry')
TOPIC=dict(n=19,slug='terms',area='速查',zh='中日术语对照',ja='用語カード・単語テスト',sub=f'{N} 个术语，卡片与自测',
lead='汇总各专题的“术语对照”。可按专题筛选；自测模式支持日→中、中→日、洗牌，进度保存在本机浏览器。支持时可用日语朗读。',
hero=[],sections=S,examples=[],problems=[],terms=[])
