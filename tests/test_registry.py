from okcvm import ToolRegistry


def test_registry_initializes_with_defaults():
    registry = ToolRegistry.from_default_spec()
    described = registry.described_tools()
    names = {entry["name"] for entry in described}
    assert "mshtools-shell" in names
    assert "mshtools-browser_click" in names


def test_shell_command_runs():
    registry = ToolRegistry.from_default_spec()
    result = registry.call("mshtools-shell", command="echo okcvm")
    assert result.success
    assert "okcvm" in (result.output or "")
