from okcvm import spec


def test_system_prompt_loads():
    prompt = spec.load_system_prompt()
    assert "You are Kimi" in prompt


def test_tool_specs_contains_shell():
    tools = spec.load_tool_specs()
    names = {tool.name for tool in tools}
    assert "mshtools-shell" in names
