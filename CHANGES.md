# 真实化互动（realism-rollout）

把 eju-physics 真实化框架中适用的共享工具移植到化学站，并为 5 个互动 demo 加上更接近实验器材的画面和可抓取操作。`assets/chem.js` 的公式导出未改。缓存参数改为 `demos.js?v=2`。

## 移植与新增的共享 API（`window.EJUDemo`，见 `demos_src/demos.src.0.js`）

### 交互（从物理站移植）
- `d.grab(o)`：可直接抓取的物体，命中半径适合手指；松手速度取约 100 ms 平均，停住再松手视为放下。
- `d.grabVel()`、`d.dragging(o)`；`spec.aspect` 可为函数；`seg.set`；`Map.dx` / `Map.dy`。

### 通用绘图（从物理站移植的子集）
`drawBall`、`drawBlock`、`wood` / `woodPattern`、`shadow`、`trail`、`approach`（尊重 `prefers-reduced-motion`）、`hint`、`glow`、`sprite` / `ballSprite` / `blit`、`wire`、`drawMeter`、`shade` / `alpha` / `mix`、`rrect`、`clamp`、`FONT`、`D.reduced()`。

### 化学实验器材（本站新增）
| API | 说明 |
|---|---|
| `D.glass(c, path, o)` | 玻璃器皿：外形路径、液面（可带波纹与弯月面高光）、玻璃高光 |
| `D.drawFlask(c, x, yb, w, h, o)` | 锥形瓶（默认）或烧杯（`kind: 'beaker'`），可设液深与颜色 |
| `D.drawCylinder(c, x, yb, w, h, hg, o)` | 竖直活塞气缸，可画气体、底部液体、内部分子、外壁刻度 |
| `D.drawThermo(c, x, yTop, yBot, frac, o)` | 玻璃温度计，返回液柱顶端（可抓） |
| `D.drawHeater(c, x, y, w, h, heat, o)` | 加热/冷却台，heat ∈ [−1, 1] |
| `D.drawStopcock(c, x, y, r, ang, o)` | 旋塞，把手与管平行为全开，返回把手末端 |
| `D.bench(c, x0, x1, y, dp)` | 木质实验台面 |
| `D.molecules(n)` | 盒内分子运动（碰壁反射）；压缩盒子时保持像素速率 |

全部只用 Canvas 2D，无新的外部依赖；深浅色主题都适配。

## 五个 demo
- **titr（中和滴定）**：滴定管（刻度与读数）、可转的旋塞（竖直=全开，稍开=逐滴）、锥形瓶在搅拌器上，溶液颜色随 pH 和指示剂变化。也可拖滴定曲线上的点。按钮可“加 1 滴（0.05 mL）”或关闭旋塞、重新装液。
- **gas（理想气体）**：活塞气缸、压力计、可拖的温度计液柱，筒内分子运动。上下拖活塞或拖 p–V 等温线上的点改体积（等温，玻意耳定律）；拖温度计改温度。
- **vapor（饱和蒸气压）**：密闭活塞容器里有放大显示的液态水和蒸气分子；压力计读的是实际水蒸气分压。可拖活塞改容器体积、拖温度计或曲线上的点改温度。
- **lechat（勒夏特列）**：活塞容器中用缓存小球表示 N₂O₄ / NO₂，颜色随平衡移动；侧接 Ar 钢瓶和可转阀门。推活塞改压强（筒壁为体积的对数刻度），拖温度计改温度，转阀门通入 Ar。压缩时颜色先因浓度增大变深，随后平衡左移又略变浅。
- **faraday（法拉第定律）**：电解槽、电极、电源与可拖的旋钮（调电流）、电流表；槽内同时标出两极生成量。也可拖质量–时间图上的点改时间。按“通电（计时）”开始电解（动画 1 s = 120 s）。

几何或化学模型不适合“抛掷”的地方，都是拖到新位置后按原公式更新。`chem.js` 与 `tests/test_chem.js` 未改。

## 如何验证
```
python3 build.py && python3 verify.py
```
应看到化学方程式配平检查通过、demo 公式检查 0 失败、topic/hub demo 数 5/5。
