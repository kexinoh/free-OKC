from okcvm import ToolRegistry, VirtualMachine


def test_vm_history_tracks_invocations():
    registry = ToolRegistry.from_default_spec()
    vm = VirtualMachine(system_prompt="prompt", registry=registry)

    result = vm.call_tool("mshtools-todo_read")
    assert vm.last_result() is result

    history = vm.get_history()
    assert history
    described = vm.describe_history()
    assert described[-1]["name"] == "mshtools-todo_read"
