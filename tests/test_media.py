import base64
import io

from PIL import Image

from okcvm import ToolRegistry
from okcvm.config import (
    MediaConfig,
    ModelEndpointConfig,
    configure,
    reset_config,
)


def _decode_audio(payload: str) -> bytes:
    return base64.b64decode(payload.encode("ascii"))


def test_generate_image_and_audio():
    reset_config({})
    shared_endpoint = ModelEndpointConfig(
        model="stub-model",
        base_url="https://example.invalid/v1",
        api_key="testing-key",
    )
    configure(
        media=MediaConfig(
            image=shared_endpoint,
            speech=shared_endpoint,
            sound_effects=shared_endpoint,
        )
    )
    registry = ToolRegistry.from_default_spec()

    image_result = registry.call("mshtools-generate_image", prompt="A sunset over the mountains")
    assert image_result.success
    data = base64.b64decode(image_result.data["base64"].encode("ascii"))
    with Image.open(io.BytesIO(data)) as img:
        assert img.size == (1024, 1024)
    assert image_result.data["provider"] == {
        "model": "stub-model",
        "base_url": "https://example.invalid/v1",
        "api_key_present": True,
    }

    voices = registry.call("mshtools-get_available_voices")
    voice_id = voices.data["voices"][0]["voice_id"]

    speech = registry.call("mshtools-generate_speech", text="Hello OKCVM", voice_id=voice_id)
    assert speech.success
    audio_bytes = _decode_audio(speech.data["base64"])
    assert audio_bytes[:4] == b"RIFF"
    assert speech.data["provider"] == {
        "model": "stub-model",
        "base_url": "https://example.invalid/v1",
        "api_key_present": True,
    }

    effect = registry.call("mshtools-generate_sound_effects", description="gentle rain", duration=1.0)
    assert effect.success
    effect_bytes = _decode_audio(effect.data["base64"])
    assert effect_bytes[:4] == b"RIFF"
    assert effect.data["provider"] == {
        "model": "stub-model",
        "base_url": "https://example.invalid/v1",
        "api_key_present": True,
    }
