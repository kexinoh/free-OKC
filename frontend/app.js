const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const statusPill = document.getElementById('status-pill');
const modelLogList = document.getElementById('model-log');
const modelLogEmpty = document.getElementById('model-log-empty');
const webPreviewFrame = document.getElementById('web-preview-frame');
const webPreviewEmpty = document.getElementById('web-preview-empty');
const openWebPreviewButton = document.getElementById('open-web-preview');
const pptPreviewContainer = document.getElementById('ppt-preview');
const pptPreviewEmpty = document.getElementById('ppt-preview-empty');
const togglePptModeButton = document.getElementById('toggle-ppt-mode');
const modelLogTemplate = document.getElementById('model-log-item-template');
const pptSlideTemplate = document.getElementById('ppt-slide-template');

let currentWebPreview = null;
let currentPptSlides = [];
let isCarouselMode = false;
const modelLogs = [];

function addMessage(role, text) {
  const message = document.createElement('article');
  message.className = `message ${role}`;

  const header = document.createElement('header');
  const name = document.createElement('strong');
  name.textContent = role === 'user' ? '用户' : 'OK Computer';
  const time = document.createElement('time');
  time.dateTime = new Date().toISOString();
  time.textContent = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  header.append(name, time);

  const body = document.createElement('p');
  body.textContent = text;

  message.append(header, body);
  chatMessages.appendChild(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function logModelInvocation(meta) {
  modelLogs.unshift(meta);
  const limit = 6;
  if (modelLogs.length > limit) {
    modelLogs.length = limit;
  }

  modelLogList.innerHTML = '';
  modelLogs.forEach((log) => {
    const clone = modelLogTemplate.content.cloneNode(true);
    clone.querySelector('.model-name').textContent = log.model;
    clone.querySelector('.model-time').textContent = log.timestamp;
    clone.querySelector('.model-summary').textContent = log.summary;
    clone.querySelector('.meta-input').textContent = log.tokensIn;
    clone.querySelector('.meta-output').textContent = log.tokensOut;
    clone.querySelector('.meta-latency').textContent = log.latency;
    modelLogList.appendChild(clone);
  });

  modelLogEmpty.hidden = modelLogs.length > 0;
}

function updateWebPreview(preview) {
  currentWebPreview = preview;
  if (preview) {
    webPreviewFrame.srcdoc = preview.html;
    webPreviewFrame.hidden = false;
    webPreviewEmpty.hidden = true;
    openWebPreviewButton.disabled = false;
  } else {
    webPreviewFrame.srcdoc = '';
    webPreviewFrame.hidden = true;
    webPreviewEmpty.hidden = false;
    openWebPreviewButton.disabled = true;
  }
}

function updatePptPreview(slides) {
  currentPptSlides = slides || [];
  pptPreviewContainer.innerHTML = '';

  if (currentPptSlides.length === 0) {
    pptPreviewEmpty.hidden = false;
    pptPreviewContainer.hidden = true;
    togglePptModeButton.disabled = true;
    return;
  }

  pptPreviewEmpty.hidden = true;
  pptPreviewContainer.hidden = false;
  togglePptModeButton.disabled = false;

  currentPptSlides.forEach((slide) => {
    const clone = pptSlideTemplate.content.cloneNode(true);
    clone.querySelector('h3').textContent = slide.title;
    const list = clone.querySelector('ul');
    slide.bullets.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    });
    pptPreviewContainer.appendChild(clone);
  });
}

function togglePptMode() {
  isCarouselMode = !isCarouselMode;
  pptPreviewContainer.classList.toggle('carousel', isCarouselMode);
  togglePptModeButton.textContent = isCarouselMode ? '堆叠模式' : '幻灯模式';
}

togglePptModeButton.addEventListener('click', togglePptMode);

openWebPreviewButton.addEventListener('click', () => {
  if (!currentWebPreview) return;
  const blob = new Blob([currentWebPreview.html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

function simulateModelResponse(message) {
  const lower = message.toLowerCase();
  const now = new Date();
  const baseMeta = {
    model: 'OKC-Creator-v1.5',
    timestamp: now.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    tokensIn: `${randomBetween(120, 320)} tokens`,
    tokensOut: `${randomBetween(180, 420)} tokens`,
    latency: `${(Math.random() * 1.2 + 1).toFixed(2)} s`,
    summary: '智能创作助手响应请求',
  };

  if (lower.includes('简历') || lower.includes('resume')) {
    const resumeHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>个人简历 - 李想</title>
  <style>
    :root {
      font-family: 'Inter', system-ui;
      color: #1f2933;
      background: #f7f9ff;
    }
    body {
      margin: 0;
      padding: 40px 24px;
      display: flex;
      justify-content: center;
    }
    .resume {
      width: min(900px, 100%);
      background: white;
      border-radius: 24px;
      padding: 40px;
      box-shadow: 0 18px 45px -30px rgba(79,70,229,.4);
      border: 1px solid rgba(79,70,229,.1);
      display: grid;
      gap: 32px;
    }
    header {
      display: flex;
      align-items: center;
      gap: 24px;
    }
    header img {
      width: 96px;
      height: 96px;
      border-radius: 24px;
      object-fit: cover;
    }
    header h1 {
      margin: 0 0 8px;
      font-size: 28px;
    }
    .section h2 {
      margin: 0 0 16px;
      font-size: 20px;
      position: relative;
      padding-left: 16px;
    }
    .section h2::before {
      content: '';
      width: 6px;
      height: 24px;
      border-radius: 6px;
      background: linear-gradient(135deg, #4f46e5, #7c3aed);
      position: absolute;
      left: 0;
      top: 6px;
    }
    ul {
      margin: 0;
      padding-left: 20px;
      display: grid;
      gap: 12px;
      line-height: 1.6;
    }
    .columns {
      display: grid;
      gap: 24px;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 999px;
      background: rgba(79, 70, 229, .08);
      color: #4338ca;
      font-size: 14px;
    }
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
</html>`;

    const slides = [
      {
        title: '个人简历 · 李想',
        bullets: ['产品设计师｜5年经验', '亮点：AI 体验创新 / 多端设计系统', '联系方式：lixiang.design@example.com'],
      },
      {
        title: '技能概览',
        bullets: ['体验策略 · 信息架构 · 设计系统', '多模态交互原型（Figma / Framer）', '团队协作与敏捷交付'],
      },
      {
        title: '代表项目',
        bullets: ['OK Learning：个性化学习平台', 'Moonshot Studio：智能排版模块', 'Insight Lens：数据洞察仪表盘'],
      },
    ];

    return {
      reply:
        '当然可以！我已经为你生成了一份清爽的个人简历网页，同时准备了三页摘要版 PPT，方便用于面试或路演展示。',
      meta: {
        ...baseMeta,
        summary: '生成个人简历网页与三页幻灯片摘要',
      },
      webPreview: { html: resumeHtml },
      pptSlides: slides,
    };
  }

  if (lower.includes('活动') || lower.includes('海报')) {
    const landingHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>创意马拉松 - 灵感即刻点燃</title>
  <style>
    body {
      margin: 0;
      font-family: 'Inter', system-ui;
      background: radial-gradient(circle at top, #fde68a, #f472b6 55%, #312e81);
      color: #0f172a;
    }
    .hero {
      min-height: 100vh;
      padding: 60px 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      color: white;
      gap: 24px;
    }
    h1 {
      font-size: clamp(42px, 8vw, 72px);
      margin: 0;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .meta {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
      text-transform: uppercase;
      font-size: 14px;
      letter-spacing: 0.12em;
    }
    .cta {
      margin-top: 12px;
      display: inline-flex;
      gap: 12px;
    }
    .cta a {
      padding: 14px 26px;
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.9);
      color: #fef3c7;
      text-decoration: none;
      font-weight: 600;
      box-shadow: 0 18px 30px -20px rgba(15, 23, 42, 0.6);
    }
    footer {
      position: absolute;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      color: rgba(255, 255, 255, 0.8);
    }
  </style>
</head>
<body>
  <div class="hero">
    <div class="meta">Moonshot × 创新营 · 08.18 - 08.20 · 上海</div>
    <h1>Creative Hackathon 2025</h1>
    <p>集结 120 位设计师与开发者，48 小时共创多模态未来体验。</p>
    <div class="cta">
      <a href="#">立即报名</a>
      <a href="#" style="background: transparent; border: 2px solid rgba(255,255,255,.7); color: white;">下载日程</a>
    </div>
  </div>
  <footer>合作伙伴：Moonshot AI · Figma · Notion</footer>
</body>
</html>`;

    const slides = [
      {
        title: 'Creative Hackathon 2025',
        bullets: ['48 小时创意马拉松', '地点：上海 · 西岸 AI 创新中心', '主办：Moonshot AI × 创新营'],
      },
      {
        title: '活动亮点',
        bullets: ['多模态工作坊 × 6 场', 'Moonshot 专家一对一辅导', 'Demo Day 投融资评审'],
      },
      {
        title: '时间安排',
        bullets: ['Day 0｜报到 & 热身', 'Day 1｜洞察探索 & 快速原型', 'Day 2｜打磨 Demo & 终极路演'],
      },
    ];

    return {
      reply:
        '已为“创意马拉松”准备活动海报式网页与宣传 PPT 提纲，你可以直接用于招募或发布活动页面。',
      meta: {
        ...baseMeta,
        model: 'OKC-Visual-v2',
        summary: '输出活动海报网页与宣传幻灯片',
      },
      webPreview: { html: landingHtml },
      pptSlides: slides,
    };
  }

  const conceptHtml = `<!DOCTYPE html>
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
</html>`;

  const slides = [
    {
      title: '灵感孵化室能力',
      bullets: ['网页 / PPT 一体生成', '模型调用透明可追踪', '可视化实时预览'],
    },
    {
      title: '示例需求',
      bullets: ['品牌落地页', '产品发布会演示', '活动招募物料'],
    },
  ];

  return {
    reply:
      '我已经准备好随时协助。描述你的创意需求，我会同步展示网页与幻灯片的预览。',
    meta: baseMeta,
    webPreview: { html: conceptHtml },
    pptSlides: slides,
  };
}

function setStatus(text, busy = false) {
  statusPill.textContent = text;
  statusPill.dataset.busy = busy ? 'true' : 'false';
}

function handleUserSubmit(event) {
  event.preventDefault();
  const value = userInput.value.trim();
  if (!value) return;

  addMessage('user', value);
  setStatus('创意生成中…', true);
  chatForm.querySelector('button').disabled = true;
  userInput.disabled = true;

  setTimeout(() => {
    const response = simulateModelResponse(value);
    addMessage('assistant', response.reply);
    logModelInvocation(response.meta);
    updateWebPreview(response.webPreview);
    updatePptPreview(response.pptSlides);

    setStatus('待命中…');
    chatForm.querySelector('button').disabled = false;
    userInput.disabled = false;
    userInput.value = '';
    userInput.focus();
  }, 600 + Math.random() * 600);
}

chatForm.addEventListener('submit', handleUserSubmit);

function seedConversation() {
  addMessage('assistant', '你好，我是 OK Computer。告诉我你的想法，我可以同步生成网页与 PPT 预览。');
  const response = simulateModelResponse('');
  logModelInvocation({
    ...response.meta,
    summary: '工作台初始化完成',
  });
  updateWebPreview(response.webPreview);
  updatePptPreview(response.pptSlides);
  setStatus('待命中…');
}

document.addEventListener('DOMContentLoaded', seedConversation);
