from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional

from . import constants, spec
from .registry import ToolRegistry
from .vm import VirtualMachine


@dataclass
class _DemoResponse:
    reply: str
    meta_model: str
    summary: str
    web_html: Optional[str]
    ppt_slides: List[Dict[str, object]]


class SessionState:
    """Manages the state and logic for a user session."""

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
            slides = [
                {"title": "个人简历 · 李想", "bullets": ["产品设计师｜5年经验", "亮点：AI 体验创新 / 多端设计系统", "联系方式：lixiang.design@example.com"]},
                {"title": "技能概览", "bullets": ["体验策略 · 信息架构 · 设计系统", "多模态交互原型（Figma / Framer）", "团队协作与敏捷交付"]},
                {"title": "代表项目", "bullets": ["OK Learning：个性化学习平台", "Moonshot Studio：智能排版模块", "Insight Lens：数据洞察仪表盘"]},
            ]
            return _DemoResponse(
                reply="当然可以！我已经为你生成了一份清爽的个人简历网页，同时准备了三页摘要版 PPT，方便用于面试或路演展示。",
                meta_model="OKC-Creator-v1.5",
                summary="生成个人简历网页与三页幻灯片摘要",
                web_html=constants.RESUME_HTML,
                ppt_slides=slides,
            )

        if "活动" in lowered or "海报" in lowered or "hackathon" in lowered:
            slides = [
                {"title": "Creative Hackathon 2025", "bullets": ["48 小时创意马拉松", "地点：上海 · 西岸 AI 创新中心", "主办：Moonshot AI × 创新营"]},
                {"title": "活动亮点", "bullets": ["多模态工作坊 × 6 场", "Moonshot 专家一对一辅导", "Demo Day 投融资评审"]},
                {"title": "时间安排", "bullets": ["Day 0｜报到 & 热身", "Day 1｜洞察探索 & 快速原型", "Day 2｜打磨 Demo & 终极路演"]},
            ]
            return _DemoResponse(
                reply="已为“创意马拉松”准备活动海报式网页与宣传 PPT 提纲，你可以直接用于招募或发布活动页面。",
                meta_model="OKC-Visual-v2",
                summary="输出活动海报网页与宣传幻灯片",
                web_html=constants.EVENT_HTML,
                ppt_slides=slides,
            )

        slides = [
            {"title": "灵感孵化室能力", "bullets": ["网页 / PPT 一体生成", "模型调用透明可追踪", "可视化实时预览"]},
            {"title": "示例需求", "bullets": ["品牌落地页", "产品发布会演示", "活动招募物料"]},
        ]
        return _DemoResponse(
            reply="我已经准备好随时协助。描述你的创意需求，我会同步展示网页与幻灯片的预览。",
            meta_model="OKC-Creator-v1.5",
            summary="工作台初始化完成",
            web_html=constants.STUDIO_HTML,
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
        self.history.append({"role": "assistant", "content": constants.WELCOME_MESSAGE})
        return {
            "reply": constants.WELCOME_MESSAGE,
            "meta": meta,
            "web_preview": {"html": constants.STUDIO_HTML},
            "ppt_slides": [
                {"title": "灵感孵化室能力", "bullets": ["网页 / PPT 一体生成", "模型调用透明可追踪", "可视化实时预览"]},
                {"title": "示例需求", "bullets": ["品牌落地页", "产品发布会演示", "活动招募物料"]},
            ],
            "vm": self.vm.describe(),
        }
