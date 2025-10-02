import base64
import io

from PIL import Image

from okcvm import ToolRegistry


def _decode_audio(payload: str) -> bytes:
    return base64.b64decode(payload.encode("ascii"))


def test_generate_image_and_audio():
    registry = ToolRegistry.from_default_spec()

    image_result = registry.call("mshtools-generate_image", prompt="A sunset over the mountains")
    assert image_result.success
    data = base64.b64decode(image_result.data["base64"].encode("ascii"))
    with Image.open(io.BytesIO(data)) as img:
        assert img.size == (1024, 1024)

    voices = registry.call("mshtools-get_available_voices")
    voice_id = voices.data["voices"][0]["voice_id"]

    speech = registry.call("mshtools-generate_speech", text="Hello OKCVM", voice_id=voice_id)
    assert speech.success
    audio_bytes = _decode_audio(speech.data["base64"])
    assert audio_bytes[:4] == b"RIFF"

    effect = registry.call("mshtools-generate_sound_effects", description="gentle rain", duration=1.0)
    assert effect.success
    effect_bytes = _decode_audio(effect.data["base64"])
    assert effect_bytes[:4] == b"RIFF"
