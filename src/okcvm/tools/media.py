"""Audio and image generation helpers."""

from __future__ import annotations

import base64
import hashlib
import io
import math
from dataclasses import dataclass
from typing import Dict, List

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .base import Tool, ToolError, ToolResult


def _hash_colour(prompt: str) -> tuple[int, int, int]:
    digest = hashlib.sha256(prompt.encode("utf-8")).digest()
    return digest[0], digest[8], digest[16]


def _wrap_text(text: str, max_chars: int = 24) -> List[str]:
    words = text.split()
    lines: List[str] = []
    current: List[str] = []
    for word in words:
        current.append(word)
        if len(" ".join(current)) >= max_chars:
            lines.append(" ".join(current))
            current = []
    if current:
        lines.append(" ".join(current))
    return lines or [text]


def _image_from_prompt(prompt: str) -> bytes:
    colour = _hash_colour(prompt)
    image = Image.new("RGB", (1024, 1024), color=colour)
    draw = ImageDraw.Draw(image)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", size=48)
    except OSError:  # pragma: no cover - font availability differs by platform
        font = ImageFont.load_default()
    lines = _wrap_text(prompt, 20)
    text = "\n".join(lines[:12])
    draw.multiline_text((80, 80), text, fill=(255, 255, 255), font=font, spacing=8)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _encode_wav(samples: np.ndarray, sample_rate: int = 22_050) -> bytes:
    import wave

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        int_samples = np.clip(samples * 32767, -32768, 32767).astype(np.int16)
        wav.writeframes(int_samples.tobytes())
    return buffer.getvalue()


def _tone_for_char(char: str, base: float) -> float:
    if char.isspace():
        return 0.0
    return base + (ord(char.lower()) % 12) * 20.0


def _synth_speech(text: str, voice: "Voice") -> bytes:
    duration_per_char = 0.09
    sample_rate = 22_050
    total_duration = max(0.5, len(text) * duration_per_char)
    t = np.linspace(0, total_duration, int(sample_rate * total_duration), endpoint=False)
    signal = np.zeros_like(t)
    base_freq = voice.base_frequency
    for index, char in enumerate(text):
        freq = _tone_for_char(char, base_freq)
        if freq == 0:
            continue
        phase = index / len(text)
        signal += np.sin(2 * math.pi * freq * t + phase)
    # Apply an envelope to avoid clicks
    envelope = np.linspace(0, 1, len(signal))
    envelope = np.minimum(envelope, envelope[::-1])
    signal *= envelope
    signal /= np.max(np.abs(signal)) or 1
    return _encode_wav(signal, sample_rate=sample_rate)


def _synth_effect(description: str, duration: float) -> bytes:
    sample_rate = 22_050
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    signal = np.zeros_like(t)
    keywords = {
        "rain": lambda tt: np.random.default_rng(123).normal(0, 0.2, tt.shape),
        "ocean": lambda tt: np.sin(2 * math.pi * 80 * tt) * 0.4,
        "wind": lambda tt: np.random.default_rng(321).normal(0, 0.15, tt.shape).cumsum(),
        "beep": lambda tt: np.sin(2 * math.pi * 880 * tt),
        "rumble": lambda tt: np.sin(2 * math.pi * 45 * tt) * 0.6,
    }
    matched = False
    for key, generator in keywords.items():
        if key in description.lower():
            signal += generator(t)
            matched = True
    if not matched:
        rng = np.random.default_rng(int(hashlib.sha1(description.encode("utf-8")).hexdigest(), 16) % (2**32))
        signal += rng.normal(0, 0.25, t.shape)
    signal /= np.max(np.abs(signal)) or 1
    return _encode_wav(signal, sample_rate=sample_rate)


@dataclass
class Voice:
    voice_id: str
    name: str
    description: str
    language: str
    base_frequency: float

    def serialize(self) -> Dict[str, str | float]:
        return {
            "voice_id": self.voice_id,
            "name": self.name,
            "description": self.description,
            "language": self.language,
        }


VOICES: Dict[str, Voice] = {
    "voice_alloy": Voice(
        voice_id="voice_alloy",
        name="Alloy",
        description="Balanced voice suited for general narration.",
        language="en-US",
        base_frequency=160.0,
    ),
    "voice_breeze": Voice(
        voice_id="voice_breeze",
        name="Breeze",
        description="Soft, airy delivery ideal for storytelling.",
        language="en-GB",
        base_frequency=180.0,
    ),
    "voice_thunder": Voice(
        voice_id="voice_thunder",
        name="Thunder",
        description="Deep baritone voice for authoritative statements.",
        language="en-US",
        base_frequency=110.0,
    ),
}


class GenerateImageTool(Tool):
    name = "mshtools-generate_image"

    def call(self, **kwargs) -> ToolResult:  # type: ignore[override]
        prompt = kwargs.get("prompt") or kwargs.get("description")
        if not prompt:
            raise ToolError("'prompt' is required")
        data = _image_from_prompt(str(prompt))
        encoded = base64.b64encode(data).decode("ascii")
        return ToolResult(
            success=True,
            output="Generated synthetic image",
            data={"base64": encoded, "mime": "image/png"},
        )


class GetAvailableVoicesTool(Tool):
    name = "mshtools-get_available_voices"

    def call(self, **kwargs) -> ToolResult:  # type: ignore[override]
        voices = [voice.serialize() for voice in VOICES.values()]
        return ToolResult(success=True, output=f"Found {len(voices)} voices", data={"voices": voices})


class GenerateSpeechTool(Tool):
    name = "mshtools-generate_speech"

    def call(self, **kwargs) -> ToolResult:  # type: ignore[override]
        text = kwargs.get("text") or kwargs.get("content")
        voice_id = kwargs.get("voice_id") or kwargs.get("voice")
        if not text:
            raise ToolError("'text' is required")
        if not voice_id:
            raise ToolError("'voice_id' is required")
        voice = VOICES.get(str(voice_id))
        if not voice:
            raise ToolError(f"Unknown voice_id '{voice_id}'")
        audio = _synth_speech(str(text), voice)
        encoded = base64.b64encode(audio).decode("ascii")
        return ToolResult(
            success=True,
            output="Generated speech audio",
            data={"base64": encoded, "mime": "audio/wav", "voice": voice.serialize()},
        )


class GenerateSoundEffectsTool(Tool):
    name = "mshtools-generate_sound_effects"

    def call(self, **kwargs) -> ToolResult:  # type: ignore[override]
        description = kwargs.get("description") or kwargs.get("prompt")
        if not description:
            raise ToolError("'description' is required")
        duration = float(kwargs.get("duration", 3.0))
        if not 0.5 <= duration <= 22.0:
            raise ToolError("duration must be between 0.5 and 22 seconds")
        audio = _synth_effect(str(description), duration)
        encoded = base64.b64encode(audio).decode("ascii")
        return ToolResult(
            success=True,
            output="Generated synthetic sound effect",
            data={"base64": encoded, "mime": "audio/wav", "duration": duration},
        )


__all__ = [
    "GenerateImageTool",
    "GetAvailableVoicesTool",
    "GenerateSpeechTool",
    "GenerateSoundEffectsTool",
]

