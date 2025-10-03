WELCOME_MESSAGE = "你好，我是 OK Computer。告诉我你的想法，我可以同步生成网页与 PPT 预览。"

STUDIO_HTML = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>灵感孵化室</title>
  <style>
    body { margin: 0; font-family: 'Inter', system-ui; background: #0f172a; color: white; }
    main { min-height: 100vh; display: grid; place-items: center; padding: 40px; }
    .card { max-width: 720px; background: rgba(15, 23, 42, 0.65); border-radius: 24px; padding: 40px; border: 1px solid rgba(148, 163, 184, 0.25); box-shadow: 0 24px 60px -35px rgba(15, 23, 42, 0.9); }
    h1 { margin-top: 0; font-size: clamp(36px, 8vw, 64px); }
    p { line-height: 1.8; }
  </style>
</head>
<body>
  <main>
    <article class="card">
      <h1>灵感孵化室</h1>
      <p>在这里你可以快速验证创意、生成视觉稿，并将思考沉淀为可用的网页或演示文档。试着提出一个需求吧！</p>
    </article>
  </main>
</body>
</html>"""

RESUME_HTML = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>个人简历 - 李想</title>
  <style>
    :root { font-family: 'Inter', system-ui; color: #1f2933; background: #f7f9ff; }
    body { margin: 0; padding: 40px 24px; display: flex; justify-content: center; }
    .resume { width: min(900px, 100%); background: white; border-radius: 24px; padding: 40px; box-shadow: 0 18px 45px -30px rgba(79,70,229,.4); border: 1px solid rgba(79,70,229,.1); display: grid; gap: 32px; }
    header { display: flex; align-items: center; gap: 24px; }
    header img { width: 96px; height: 96px; border-radius: 24px; object-fit: cover; }
    header h1 { margin: 0 0 8px; font-size: 28px; }
    .section h2 { margin: 0 0 16px; font-size: 20px; position: relative; padding-left: 16px; }
    .section h2::before { content: ''; width: 6px; height: 24px; border-radius: 6px; background: linear-gradient(135deg, #4f46e5, #7c3aed); position: absolute; left: 0; top: 6px; }
    ul { margin: 0; padding-left: 20px; display: grid; gap: 12px; line-height: 1.6; }
    .columns { display: grid; gap: 24px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; background: rgba(79, 70, 229, .08); color: #4338ca; font-size: 14px; }
  </style>
</head>
<body>
  <article class="resume">
    <header>
      <img src="https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400" alt="头像" />
      <div>
        <h1>李想 · 产品设计师</h1>
        <p>5年互联网产品设计经验，专注体验优化与多模态交互创新。</p>
        <div class="badge">📍 上海 · 可远程</div>
      </div>
    </header>
    <section class="section">
      <h2>核心技能</h2>
      <div class="columns">
        <ul>
          <li>以用户为中心的体验策略与落地执行</li>
          <li>复杂信息的结构化与信息架构设计</li>
          <li>多模态交互与生成式 AI 设计流程</li>
        </ul>
        <ul>
          <li>Figma / Framer / Principle 动效原型</li>
          <li>Webflow / Tailwind CSS 前端实现能力</li>
          <li>跨职能协作与敏捷迭代管理</li>
        </ul>
      </div>
    </section>
    <section class="section">
      <h2>项目案例</h2>
      <ul>
        <li><strong>OK Learning</strong> · 面向高校的个性化学习平台，负责从0到1的交互设计与设计系统搭建。</li>
        <li><strong>Moonshot Studio</strong> · 多模态创意工作台，设计智能排版模块，生成效率提升 180%。</li>
        <li><strong>Insight Lens</strong> · 数据洞察可视化仪表盘，优化工作流程，使分析产出速度提升 40%。</li>
      </ul>
    </section>
    <section class="section">
      <h2>教育与认证</h2>
      <ul>
        <li>中国美术学院 · 视觉传达设计 · 本科</li>
        <li>Google UX Certificate · 2023</li>
        <li>Adobe XD Creative Jam · 金奖</li>
      </ul>
    </section>
  </article>
</body>
</html>"""

EVENT_HTML = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>创意马拉松 - 灵感即刻点燃</title>
  <style>
    body { margin: 0; font-family: 'Inter', system-ui; background: radial-gradient(circle at top, #fde68a, #f472b6 55%, #312e81); color: #0f172a; }
    .hero { min-height: 100vh; padding: 60px 24px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: white; gap: 24px; }
    h1 { font-size: clamp(42px, 8vw, 72px); margin: 0; letter-spacing: 0.04em; text-transform: uppercase; }
    .meta { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; text-transform: uppercase; font-size: 14px; letter-spacing: 0.12em; }
    .cta { margin-top: 12px; display: inline-flex; gap: 12px; }
    .cta a { padding: 14px 26px; border-radius: 999px; background: rgba(15, 23, 42, 0.9); color: #fef3c7; text-decoration: none; font-weight: 600; box-shadow: 0 18px 30px -20px rgba(15, 23, 42, 0.6); }
    footer { position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); color: rgba(255, 255, 255, 0.8); }
  </style>
</head>
<body>
  <div class="hero">
    <div class="meta">Moonshot × 创新营 · 08.18 - 08.20 · 上海</div>
    <h1>Creative Hackathon 2025</h1>
    <p>集结 120 位设计师与开发者，48 小时共创多模态未来体验。</p>
    <div class="cta">
      <a href="#">立即报名</a>
      <a href="#" class="cta-secondary">下载日程</a>
    </div>
  </div>
  <footer>合作伙伴：Moonshot AI · Figma · Notion</footer>
</body>
</html>"""
