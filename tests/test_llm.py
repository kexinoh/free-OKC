import copy
import os
import sys
import types

import pytest

pytest.importorskip("langchain_openai")
pytest.importorskip("langchain_core")

import okcvm.config as config_mod
from okcvm import ToolRegistry
from okcvm.config import ModelEndpointConfig
from okcvm.llm import create_llm_chain


@pytest.fixture(autouse=True)
def restore_config_state():
    original = config_mod.get_config()
    try:
        yield
    finally:
        with config_mod._config_lock:  # type: ignore[attr-defined]
            config_mod._config = config_mod.AppConfig(  # type: ignore[attr-defined]
                chat=copy.deepcopy(original.chat),
                media=copy.deepcopy(original.media),
            )


def test_create_llm_chain_uses_config(monkeypatch):
    class DummyTool:
        def __init__(self, name):
            self.name = name
            self.description = "dummy"

    def fake_get_langchain_tools(self):  # noqa: ANN001
        return [DummyTool("tool-a"), DummyTool("tool-b")]

    monkeypatch.setattr(ToolRegistry, "get_langchain_tools", fake_get_langchain_tools, raising=False)

    captured = {}

    class DummyChat:
        def __init__(self, **kwargs):
            captured["chat_kwargs"] = kwargs

        def bind_tools(self, tools):  # noqa: ANN001
            captured["bound_tools"] = tools
            return ("bound", tools)

    dummy_agents = types.ModuleType("langchain.agents")

    def fake_create_agent(llm_with_tools, tools, prompt):  # noqa: ANN001
        captured["llm_with_tools"] = llm_with_tools
        captured["agent_tools"] = tools
        captured["prompt"] = prompt
        return {"agent": "ok"}

    class DummyExecutor:
        def __init__(self, agent, tools, verbose):  # noqa: ANN001
            captured["executor_agent"] = agent
            captured["executor_tools"] = tools
            captured["executor_verbose"] = verbose

        def invoke(self, payload):  # pragma: no cover - not used in this test
            return payload

    dummy_agents.create_tool_calling_agent = fake_create_agent
    dummy_agents.AgentExecutor = DummyExecutor
    monkeypatch.setitem(sys.modules, "langchain.agents", dummy_agents)
    import okcvm.llm as llm_mod

    monkeypatch.setattr(llm_mod, "ChatOpenAI", DummyChat)

    config_mod.configure(
        chat=ModelEndpointConfig(
            model="gpt-sim",
            base_url="https://chat.sim",
            api_key="sk-sim",
        )
    )

    registry = ToolRegistry.from_default_spec()
    chain = create_llm_chain(registry)

    assert captured["chat_kwargs"] == {
        "model": "gpt-sim",
        "api_key": "sk-sim",
        "base_url": "https://chat.sim",
        "temperature": 0.7,
        "streaming": True,
    }
    assert len(captured["bound_tools"][1]) == 2
    assert captured["executor_verbose"] is True
    assert isinstance(chain, DummyExecutor)


@pytest.mark.requires_api
@pytest.mark.skipif(
    not (
        os.getenv("OKCVM_CHAT_MODEL")
        and os.getenv("OKCVM_CHAT_BASE_URL")
        and os.getenv("OKCVM_CHAT_API_KEY")
    ),
    reason="Requires OKCVM_CHAT_* environment variables for live API call.",
)
def test_create_llm_chain_with_live_api(monkeypatch):
    monkeypatch.setattr(ToolRegistry, "get_langchain_tools", lambda self: [], raising=False)

    config_mod.configure(
        chat=ModelEndpointConfig(
            model=os.environ["OKCVM_CHAT_MODEL"],
            base_url=os.environ["OKCVM_CHAT_BASE_URL"],
            api_key=os.environ["OKCVM_CHAT_API_KEY"],
        )
    )

    registry = ToolRegistry.from_default_spec()
    chain = create_llm_chain(registry)
    response = chain.invoke({"input": "Say 'integration test' and nothing else.", "history": []})
    assert "integration test" in response.get("output", "").lower()
