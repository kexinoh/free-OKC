"""FastAPI application exposing OKCVM with a local web UI."""

from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import spec
from .config import MediaConfig, ModelEndpointConfig, configure, get_config
from .registry import ToolRegistry
from .vm import VirtualMachine

FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"


def _ensure_frontend() -> None:
    if not FRONTEND_DIR.exists():  # pragma: no cover - developer misconfiguration
        raise RuntimeError(
            "The frontend directory could not be located. Expected path: "
            f"{FRONTEND_DIR}"
        )


_ensure_frontend()


class EndpointConfigPayload(BaseModel):
    """Incoming configuration payload for a single model endpoint."""

    model: Optional[str] = Field(default=None, description="Model identifier")
    base_url: Optional[str] = Field(default=None, description="Endpoint base URL")
    api_key: Optional[str] = Field(default=None, description="Provider API key")

    def to_model(self) -> ModelEndpointConfig | None:
        model = (self.model or "").strip() if self.model is not None else None
        base_url = (self.base_url or "").strip() if self.base_url is not None else None
        api_key = (self.api_key or "").strip() if self.api_key is not None else None
        if not model or not base_url:
            return None
        return ModelEndpointConfig(model=model, base_url=base_url, api_key=api_key or None)


class ConfigUpdatePayload(BaseModel):
    chat: Optional[EndpointConfigPayload] = None
    image: Optional[EndpointConfigPayload] = None
    speech: Optional[EndpointConfigPayload] = None
    sound_effects: Optional[EndpointConfigPayload] = None
    asr: Optional[EndpointConfigPayload] = None


class ChatRequest(BaseModel):
    message: str = Field(..., description="User utterance to process")


def _describe_endpoint(config: ModelEndpointConfig | None) -> Optional[Dict[str, object]]:
    if config is None:
        return None
    description = config.describe()
    description["model"] = config.model
    description["base_url"] = config.base_url
    return description


def _build_media_config(payload: ConfigUpdatePayload) -> MediaConfig:
    return MediaConfig(
        image=payload.image.to_model() if payload.image else None,
        speech=payload.speech.to_model() if payload.speech else None,
        sound_effects=payload.sound_effects.to_model() if payload.sound_effects else None,
        asr=payload.asr.to_model() if payload.asr else None,
    )


@dataclass
class _DemoResponse:
    reply: str
    meta_model: str
    summary: str
    web_html: Optional[str]
    ppt_slides: List[Dict[str, object]]


class SessionState:
    """In-memory session manager for the demo orchestration flow."""

    def __init__(self) -> None:
        self.registry = ToolRegistry.from_default_spec()
        self.vm = VirtualMachine(
            system_prompt=spec.load_system_prompt(),
            registry=self.registry,
        )
        self._rng = random.Random()
        self.history: List[Dict[str, str]] = []

    def reset(self) -> None:
        self.history.clear()
        self.vm.reset_history()

    def _meta(self, model: str, summary: str) -> Dict[str, str]:
        now = datetime.now()
        return {
            "model": model,
            "timestamp": now.strftime("%H:%M:%S"),
            "tokensIn": f"{self._rng.randint(120, 320)} tokens",
            "tokensOut": f"{self._rng.randint(180, 420)} tokens",
            "latency": f"{self._rng.uniform(1.0, 2.2):.2f} s",
            "summary": summary,
        }

    def _demo_response(self, message: str) -> _DemoResponse:
        lowered = message.lower()
        if "简历" in lowered or "resume" in lowered:
            html = _RESUME_HTML
            slides = [
                {
                    "title": "个人简历 · 李想",
                    "bullets": [
                        "产品设计师｜5年经验",
                        "亮点：AI 体验创新 / 多端设计系统",
                        "联系方式：lixiang.design@example.com",
                    ],
                },
                {
                    "title": "技能概览",
                    "bullets": [
                        "体验策略 · 信息架构 · 设计系统",
                        "多模态交互原型（Figma / Framer）",
                        "团队协作与敏捷交付",
                    ],
                },
                {
                    "title": "代表项目",
                    "bullets": [
                        "OK Learning：个性化学习平台",
                        "Moonshot Studio：智能排版模块",
                        "Insight Lens：数据洞察仪表盘",
                    ],
                },
            ]
            return _DemoResponse(
                reply=(
                    "当然可以！我已经为你生成了一份清爽的个人简历网页，同时准备了三页摘要版 PPT，"
                    "方便用于面试或路演展示。"
                ),
                meta_model="OKC-Creator-v1.5",
                summary="生成个人简历网页与三页幻灯片摘要",
                web_html=html,
                ppt_slides=slides,
            )

        if "活动" in lowered or "海报" in lowered or "hackathon" in lowered:
            html = _EVENT_HTML
            slides = [
                {
                    "title": "Creative Hackathon 2025",
                    "bullets": [
                        "48 小时创意马拉松",
                        "地点：上海 · 西岸 AI 创新中心",
                        "主办：Moonshot AI × 创新营",
                    ],
                },
                {
                    "title": "活动亮点",
                    "bullets": [
                        "多模态工作坊 × 6 场",
                        "Moonshot 专家一对一辅导",
                        "Demo Day 投融资评审",
                    ],
                },
                {
                    "title": "时间安排",
                    "bullets": [
                        "Day 0｜报到 & 热身",
                        "Day 1｜洞察探索 & 快速原型",
                        "Day 2｜打磨 Demo & 终极路演",
                    ],
                },
            ]
            return _DemoResponse(
                reply="已为“创意马拉松”准备活动海报式网页与宣传 PPT 提纲，你可以直接用于招募或发布活动页面。",
                meta_model="OKC-Visual-v2",
                summary="输出活动海报网页与宣传幻灯片",
                web_html=html,
                ppt_slides=slides,
            )

        slides = [
            {
                "title": "灵感孵化室能力",
                "bullets": [
                    "网页 / PPT 一体生成",
                    "模型调用透明可追踪",
                    "可视化实时预览",
                ],
            },
            {
                "title": "示例需求",
                "bullets": [
                    "品牌落地页",
                    "产品发布会演示",
                    "活动招募物料",
                ],
            },
        ]
        return _DemoResponse(
            reply="我已经准备好随时协助。描述你的创意需求，我会同步展示网页与幻灯片的预览。",
            meta_model="OKC-Creator-v1.5",
            summary="工作台初始化完成",
            web_html=_STUDIO_HTML,
            ppt_slides=slides,
        )

    def respond(self, message: str) -> Dict[str, object]:
        self.history.append({"role": "user", "content": message})
        response = self._demo_response(message)
        self.history.append({"role": "assistant", "content": response.reply})
        meta = self._meta(response.meta_model, response.summary)
        return {
            "reply": response.reply,
            "meta": meta,
            "web_preview": {"html": response.web_html} if response.web_html else None,
            "ppt_slides": response.ppt_slides,
            "vm_history": self.vm.describe_history(limit=25),
        }

    def boot(self) -> Dict[str, object]:
        self.reset()
        meta = self._meta("OKC-Creator-v1.5", "工作台初始化完成")
        self.history.append({"role": "assistant", "content": _WELCOME_MESSAGE})
        return {
            "reply": _WELCOME_MESSAGE,
            "meta": meta,
            "web_preview": {"html": _STUDIO_HTML},
            "ppt_slides": [
                {
                    "title": "灵感孵化室能力",
                    "bullets": [
                        "网页 / PPT 一体生成",
                        "模型调用透明可追踪",
                        "可视化实时预览",
                    ],
                },
                {
                    "title": "示例需求",
                    "bullets": [
                        "品牌落地页",
                        "产品发布会演示",
                        "活动招募物料",
                    ],
                },
            ],
            "vm": self.vm.describe(),
        }


_WELCOME_MESSAGE = "你好，我是 OK Computer。告诉我你的想法，我可以同步生成网页与 PPT 预览。"

_STUDIO_HTML = """<!DOCTYPE html>
<html lang=\"zh-CN\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
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
    <article class=\"card\">
      <h1>灵感孵化室</h1>
      <p>在这里你可以快速验证创意、生成视觉稿，并将思考沉淀为可用的网页或演示文档。试着提出一个需求吧！</p>
    </article>
  </main>
</body>
</html>"""

_RESUME_HTML = """<!DOCTYPE html>
<html lang=\"zh-CN\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
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
  <article class=\"resume\">
    <header>
      <img src=\"https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400\" alt=\"头像\" />
      <div>
        <h1>李想 · 产品设计师</h1>
        <p>5年互联网产品设计经验，专注体验优化与多模态交互创新。</p>
        <div class=\"badge\">📍 上海 · 可远程</div>
      </div>
    </header>

    <section class=\"section\">
      <h2>核心技能</h2>
      <div class=\"columns\">
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

    <section class=\"section\">
      <h2>项目案例</h2>
      <ul>
        <li><strong>OK Learning</strong> · 面向高校的个性化学习平台，负责从0到1的交互设计与设计系统搭建。</li>
        <li><strong>Moonshot Studio</strong> · 多模态创意工作台，设计智能排版模块，生成效率提升 180%。</li>
        <li><strong>Insight Lens</strong> · 数据洞察可视化仪表盘，优化工作流程，使分析产出速度提升 40%。</li>
      </ul>
    </section>

    <section class=\"section\">
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

_EVENT_HTML = """<!DOCTYPE html>
<html lang=\"zh-CN\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
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
  <div class=\"hero\">
    <div class=\"meta\">Moonshot × 创新营 · 08.18 - 08.20 · 上海</div>
    <h1>Creative Hackathon 2025</h1>
    <p>集结 120 位设计师与开发者，48 小时共创多模态未来体验。</p>
    <div class=\"cta\">
      <a href=\"#\">立即报名</a>
      <a href=\"#\" class=\"cta-secondary\">下载日程</a>
    </div>
  </div>
  <footer>合作伙伴：Moonshot AI · Figma · Notion</footer>
</body>
</html>"""


state = SessionState()


def create_app() -> FastAPI:
    app = FastAPI(title="OKCVM Orchestrator", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.mount("/ui", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="ui")

    @app.get("/")
    async def root() -> RedirectResponse:
        return RedirectResponse(url="/ui/")

    @app.get("/api/config")
    async def read_config() -> Dict[str, object]:
        config = get_config()
        return {
            "chat": _describe_endpoint(config.chat),
            "image": _describe_endpoint(config.media.image),
            "speech": _describe_endpoint(config.media.speech),
            "sound_effects": _describe_endpoint(config.media.sound_effects),
            "asr": _describe_endpoint(config.media.asr),
        }

    @app.post("/api/config")
    async def update_config(payload: ConfigUpdatePayload) -> Dict[str, object]:
        try:
            media_config = _build_media_config(payload)
            configure(media=media_config, chat=payload.chat.to_model() if payload.chat else None)
        except Exception as exc:  # pragma: no cover - defensive, FastAPI will map
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return await read_config()

    @app.get("/api/session/info")
    async def session_info() -> Dict[str, object]:
        return state.vm.describe()

    @app.get("/api/session/boot")
    async def session_boot() -> Dict[str, object]:
        return state.boot()

    @app.post("/api/chat")
    async def chat(request: ChatRequest) -> Dict[str, object]:
        return state.respond(request.message)

    return app


app = create_app()


def main() -> None:  # pragma: no cover - convenience entry point
    import uvicorn

    uvicorn.run("okcvm.server:app", host="0.0.0.0", port=8000, reload=False)


if __name__ == "__main__":  # pragma: no cover - script usage
    main()

