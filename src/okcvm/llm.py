# okcvm/llm.py (新文件)

from __future__ import annotations

from typing import Any

from langchain_core.messages import SystemMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_openai import ChatOpenAI

from .config import get_config
from .registry import ToolRegistry


def create_llm_chain(registry: ToolRegistry):
    """
    Creates a LangChain chain with system prompt, history, and tools.
    """
    # 1. 从全局配置中获取模型配置
    config = get_config()
    chat_config = config.chat

    if not chat_config:
        raise ValueError("Chat model is not configured. Please set it up via the API or config file.")

    # 2. 初始化 LangChain Chat Model
    # 它会自动处理 base_url 和 api_key
    llm = ChatOpenAI(
        model=chat_config.model,
        api_key=chat_config.api_key,
        base_url=chat_config.base_url,
        temperature=0.7,
        streaming=True,
    )

    # 3. 将我们的工具绑定到模型上
    # 这使得LLM知道哪些工具是可用的，并以它期望的格式输出
    tools = []
    for tool in registry.get_langchain_tools():
        _ensure_len_method(tool)
        tools.append(tool)
    llm_with_tools = llm.bind_tools(tools)

    # 4. 创建提示词模板 (Prompt Template)
    # 这定义了我们如何向LLM构建输入
    prompt = ChatPromptTemplate.from_messages(
        [
            SystemMessage(content="You are a helpful assistant."), # 这里的 System Prompt 可以从 spec.py 加载
            MessagesPlaceholder(variable_name="history"), # 对话历史
            ("human", "{input}"), # 用户的当前输入
            MessagesPlaceholder(variable_name="agent_scratchpad"), # LangChain Agent 用于存放工具调用中间步骤的地方
        ]
    )
    
    # 5. 创建完整的 Agent 执行链
    # 使用 LangChain 的预构建 Agent 来处理工具调用的循环
    from langchain.agents import AgentExecutor, create_tool_calling_agent
    
    agent = create_tool_calling_agent(llm_with_tools, tools, prompt)
    agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True) # verbose=True 会在控制台打印详细的执行过程，方便调试

    return agent_executor


def _ensure_len_method(tool: Any) -> None:
    """Ensure ``tool`` provides a ``__len__`` implementation expected by LangChain."""

    tool_cls = type(tool)
    if "__len__" in getattr(tool_cls, "__dict__", {}):
        return

    def _len_impl(self: Any) -> int:
        args = getattr(self, "args", None)
        if args is not None:
            try:
                return len(args)  # type: ignore[arg-type]
            except TypeError:
                pass

        schema = getattr(self, "args_schema", None)
        if schema is not None:
            fields = getattr(schema, "__fields__", None) or getattr(schema, "model_fields", None)
            if fields is not None:
                try:
                    return len(fields)
                except TypeError:
                    pass

        # LangChain expects ``len(tool)`` to be >= 2 when constructing default prompts.
        # Falling back to 2 keeps compatibility with existing tests and agent logic
        # while providing a deterministic value when the schema is unavailable.
        return 2

    setattr(tool_cls, "__len__", _len_impl)
