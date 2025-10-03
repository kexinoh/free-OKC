from __future__ import annotations

from typing import Any, Dict, List

from langchain_core.messages import AIMessage, HumanMessage

from . import spec
from .llm import create_llm_chain # 导入我们新的 chain 创建函数
from .registry import ToolRegistry
from .tools.base import ToolResult


class VirtualMachine:
    """Orchestrates LLM interactions and tool usage using LangChain."""

    def __init__(
        self,
        system_prompt: str,
        registry: ToolRegistry,
    ) -> None:
        self.system_prompt = system_prompt
        self.registry = registry
        # 注意：history现在需要遵循LangChain的BaseMessage格式
        self.history: List[Dict[str, Any]] = []
        self._chain = None # 延迟初始化 chain
        self._last_tool_result: ToolResult | None = None
        print("VirtualMachine initialized.")

    @property
    def chain(self):
        """Lazy-loads the LangChain agent executor."""
        if self._chain is None:
            print("Creating LangChain agent executor for the first time...")
            self._chain = create_llm_chain(self.registry)
            print("LangChain agent executor created successfully.")
        return self._chain

    def reset_history(self) -> None:
        """Clears the conversation history."""
        self.history.clear()
        self._last_tool_result = None
        print("VM history has been reset.")

    def execute(self, utterance: str) -> Dict[str, Any]:
        """
        Processes a user utterance using the LangChain agent.
        Handles LLM calls and tool executions.
        """
        print(f"VM executing with utterance: '{utterance}'")
        
        # 将历史转换为 LangChain 格式
        langchain_history = [
            HumanMessage(content=msg["content"]) if msg["role"] == "user"
            else AIMessage(content=msg["content"])
            for msg in self.history
        ]
        
        # 调用 LangChain Agent Executor
        try:
            response = self.chain.invoke({
                "input": utterance,
                "history": langchain_history
            })
        except Exception as e:
            # 捕获并返回错误信息，防止服务崩溃
            print(f"Error invoking LangChain agent: {e}")
            return {
                "reply": f"An error occurred: {e}",
                "tool_calls": [],
            }
        
        # 从 Agent 的响应中提取最终答复
        final_reply = response.get("output", "I'm not sure how to respond to that.")
        
        # 更新我们的内部历史记录
        self.history.append({"role": "user", "content": utterance})
        self.history.append({"role": "assistant", "content": final_reply})
        
        # 从LangChain的中间步骤提取工具调用信息（可选，但对于调试很有用）
        tool_calls_info = []
        if "intermediate_steps" in response:
            for step in response["intermediate_steps"]:
                action, observation = step
                tool_calls_info.append({
                    "tool_name": action.tool,
                    "tool_input": action.tool_input,
                    "tool_output": observation
                })

        return {
            "reply": final_reply,
            "tool_calls": tool_calls_info,
        }

    def call_tool(self, name: str, **kwargs: Any) -> ToolResult:
        """Invoke a tool directly through the registry."""

        result = self.registry.call(name, **kwargs)
        self._last_tool_result = result
        self.history.append(
            {
                "role": "tool",
                "name": name,
                "input": kwargs,
                "success": result.success,
                "output": result.output,
                "data": result.data,
            }
        )
        return result

    def last_result(self) -> ToolResult | None:
        """Return the most recent tool call result."""

        return self._last_tool_result

    def get_history(self) -> List[Dict[str, Any]]:
        """Return a shallow copy of the internal history."""

        return list(self.history)

    def describe(self) -> Dict[str, object]:
        return {
            "system_prompt": self.system_prompt,
            "tools": [tool.name for tool in self.registry.get_langchain_tools()],
            "history_length": len(self.history),
        }

    def describe_history(self, limit: int = 25) -> List[Dict[str, object]]:
        return self.history[-limit:]
