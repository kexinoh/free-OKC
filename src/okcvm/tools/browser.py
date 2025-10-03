"""基于 Selenium 无头浏览器的浏览器自动化工具。

该模块使用 Selenium 和无头 Chrome 浏览器来提供更强大的网站交互能力，
能够处理 JavaScript 渲染的动态页面。它保持了与原始基于 HTTP 的工具集
相似的接口，以便于上层代理的集成。

功能包括：
* ``browser_visit``: 使用无头 Chrome 访问一个 URL。
* ``browser_state``: 报告当前页面的状态，包括 URL、标题、可交互元素等。
* ``browser_click``: 模拟点击页面上的链接或按钮。
* ``browser_find``: 在当前页面 DOM 中搜索文本。
* ``browser_input``: 向表单输入字段填入文本。
* ``browser_scroll_up`` / ``browser_scroll_down``: 模拟在页面上滚动。

此实现旨在提供一个功能更全、更接近真实用户操作的浏览器环境。
"""

from __future__ import annotations

import atexit
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

# --- Selenium 相关导入 ---
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webelement import WebElement
from webdriver_manager.chrome import ChromeDriverManager
# ---

from .base import Tool, ToolError, ToolResult

USER_AGENT = "OKCVM/1.0 (+https://github.com/free-agent-challenge/free-OKC)"

# --- 数据类保持不变，以确保 API 兼容性 ---

@dataclass
class ElementInfo:
    """描述页面上可点击元素的元数据。"""
    index: int
    tag: str
    text: str
    href: Optional[str]
    attributes: Dict[str, str]
    # 内部使用，存储 Selenium 的 WebElement 对象
    _webelement: WebElement = field(repr=False, default=None)

    def serialize(self) -> Dict[str, Optional[str]]:
        data: Dict[str, Optional[str]] = {
            "index": self.index,
            "tag": self.tag,
            "text": self.text,
            "href": self.href,
        }
        if self.attributes:
            data["attributes"] = dict(self.attributes)
        return data

@dataclass
class InputInfo:
    """描述可接受文本输入的元素的元数据。"""
    index: int
    name: Optional[str]
    input_type: str
    placeholder: Optional[str]
    value: str = ""
    # 内部使用，存储 Selenium 的 WebElement 对象
    _webelement: WebElement = field(repr=False, default=None)

    def serialize(self) -> Dict[str, Optional[str]]:
        # 更新 value，以反映真实浏览器中的状态
        if self._webelement:
            self.value = self._webelement.get_attribute("value") or ""
            
        return {
            "index": self.index,
            "name": self.name,
            "type": self.input_type,
            "placeholder": self.placeholder,
            "value": self.value,
        }

@dataclass
class BrowserSession:
    """浏览器当前状态的表示。"""
    current_url: Optional[str] = None
    title: Optional[str] = None
    html: Optional[str] = None
    scroll_position: int = 0
    clickables: List[ElementInfo] = field(default_factory=list)
    inputs: List[InputInfo] = field(default_factory=list)
    last_find_results: List[Dict[str, str]] = field(default_factory=list)

    def serialize(self) -> Dict[str, object]:
        return {
            "current_url": self.current_url,
            "title": self.title,
            "scroll_position": self.scroll_position,
            "html": self.html,
            "clickable_elements": [item.serialize() for item in self.clickables],
            "inputs": [item.serialize() for item in self.inputs],
            "last_find_results": list(self.last_find_results),
        }

class BrowserSessionManager:
    """管理 Selenium WebDriver 实例和浏览器会话的单例管理器。"""

    def __init__(self) -> None:
        self._session = BrowserSession()
        self._driver: Optional[webdriver.Chrome] = None
        self._mode = "selenium"

    def _init_driver(self) -> webdriver.Chrome:
        if self._mode == "static":
            raise ToolError("浏览器当前处于静态模式，不可用 WebDriver")

        if self._driver is None:
            options = Options()
            options.add_argument("--headless")
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-dev-shm-usage")
            options.add_argument(f"user-agent={USER_AGENT}")
            try:
                service = Service(ChromeDriverManager().install())
                self._driver = webdriver.Chrome(service=service, options=options)
            except Exception as e:
                self._driver = None
                self._mode = "static"
                raise ToolError(
                    f"无法初始化 Chrome WebDriver: {e}。请确保 Chrome 已安装。"
                ) from e
        return self._driver

    def reset(self) -> None:
        if self._driver:
            # 关闭所有窗口和会话
            self._driver.quit()
            self._driver = None
        self._session = BrowserSession()
        # 如果之前降级到静态模式，则保持静态，避免反复尝试失败的 WebDriver 初始化

    @property
    def driver(self) -> webdriver.Chrome:
        return self._init_driver()

    @property
    def session(self) -> BrowserSession:
        return self._session
    
    @session.setter
    def session(self, new_session: BrowserSession):
        self._session = new_session

    def use_static_mode(self) -> bool:
        return self._mode == "static"

    def navigate_static(self, url: str) -> BrowserSession:
        self._mode = "static"
        response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=15)
        response.raise_for_status()
        session = _build_session_from_html(response.text, url, driver=None)
        self._session = session
        return session


_manager = BrowserSessionManager()

# 确保在程序退出时关闭浏览器
atexit.register(_manager.reset)


def reset_session() -> None:
    """重置全局浏览器会话。"""
    _manager.reset()

def _ensure_session_initialized() -> BrowserSession:
    session = _manager.session
    if session.current_url is None:
        raise ToolError("没有活动的浏览器会话。请先调用 browser_visit。")
    return session

def _build_session_from_html(html: str, current_url: str, driver: Optional[webdriver.Chrome]) -> BrowserSession:
    soup = BeautifulSoup(html, "html.parser")
    title_tag = soup.find("title")
    title = None
    if title_tag and title_tag.string:
        title = title_tag.get_text(strip=True)
    elif driver is not None:
        title = driver.title

    clickables: List[ElementInfo] = []
    if driver is not None:
        selenium_clickables = driver.find_elements(
            By.CSS_SELECTOR,
            "a[href], button, input[type=submit], input[type=button]",
        )
        for index, element in enumerate(selenium_clickables):
            tag_name = element.tag_name or "element"
            text = element.text.strip() or element.get_attribute("aria-label") or ""
            href = element.get_attribute("href")
            attrs = {
                key: value
                for key, value in element.get_property("attributes").items()
                if isinstance(value, str)
            }
            clickables.append(
                ElementInfo(
                    index=index,
                    tag=tag_name,
                    text=text,
                    href=href,
                    attributes=attrs,
                    _webelement=element,
                )
            )
    else:
        for index, element in enumerate(
            soup.select("a[href], button, input[type=submit], input[type=button]")
        ):
            tag_name = element.name or "element"
            text = element.get_text(strip=True) or element.get("aria-label", "")
            href = element.get("href")
            absolute_href = urljoin(current_url, href) if href else None
            attrs = {
                key: value for key, value in element.attrs.items() if isinstance(value, str)
            }
            clickables.append(
                ElementInfo(
                    index=index,
                    tag=tag_name,
                    text=text,
                    href=absolute_href,
                    attributes=attrs,
                )
            )

    inputs: List[InputInfo] = []
    if driver is not None:
        selenium_inputs = driver.find_elements(By.CSS_SELECTOR, "input[type=text], input:not([type]), textarea")
        for index, element in enumerate(selenium_inputs):
            input_type = element.get_attribute("type") or (
                "textarea" if element.tag_name == "textarea" else "text"
            )
            inputs.append(
                InputInfo(
                    index=index,
                    name=element.get_attribute("name"),
                    input_type=input_type,
                    placeholder=element.get_attribute("placeholder"),
                    _webelement=element,
                )
            )
    else:
        for index, element in enumerate(
            soup.select("input[type=text], input:not([type]), textarea")
        ):
            input_type = element.get("type") or (
                "textarea" if element.name == "textarea" else "text"
            )
            inputs.append(
                InputInfo(
                    index=index,
                    name=element.get("name"),
                    input_type=input_type,
                    placeholder=element.get("placeholder"),
                    value=element.get("value", ""),
                )
            )

    session = BrowserSession(
        current_url=current_url,
        title=title,
        html=html,
        scroll_position=0,
        clickables=clickables,
        inputs=inputs,
    )
    return session


def _parse_page() -> BrowserSession:
    """根据当前模式解析页面。"""
    if _manager.use_static_mode():
        session = _manager.session
        if not session.current_url or session.html is None:
            raise ToolError("没有活动的浏览器会话。请先调用 browser_visit。")
        refreshed = _build_session_from_html(session.html, session.current_url, driver=None)
        existing_values = {item.index: item.value for item in session.inputs if item.value}
        for input_info in refreshed.inputs:
            if input_info.index in existing_values:
                input_info.value = existing_values[input_info.index]
        refreshed.scroll_position = session.scroll_position
        refreshed.last_find_results = list(session.last_find_results)
        _manager.session = refreshed
        return refreshed

    driver = _manager.driver
    html = driver.page_source
    session = _build_session_from_html(html, driver.current_url, driver)
    session.scroll_position = driver.execute_script("return window.pageYOffset;")
    _manager.session = session
    return session


def _navigate(url: str) -> BrowserSession:
    """使用 WebDriver 导航到指定的 URL。"""
    if _manager.use_static_mode():
        try:
            return _manager.navigate_static(url)
        except Exception as exc:
            raise ToolError(f"导航到 {url} 时出错: {exc}") from exc

    try:
        driver = _manager.driver
        driver.get(url)
        driver.implicitly_wait(5)
        session = _parse_page()
        _manager.session = session
        return session
    except ToolError:
        try:
            return _manager.navigate_static(url)
        except Exception as exc:
            raise ToolError(f"导航到 {url} 时出错: {exc}") from exc
    except Exception as exc:
        try:
            return _manager.navigate_static(url)
        except Exception as fallback_exc:
            raise ToolError(f"导航到 {url} 时出错: {fallback_exc}") from exc

# --- 工具类实现 ---

class BrowserVisitTool(Tool):
    name = "mshtools-browser_visit"

    def call(self, **kwargs) -> ToolResult:
        url = kwargs.get("url")
        if not url:
            raise ToolError("'url' 是必需的")
        if not url.startswith("http://") and not url.startswith("https://"):
            raise ToolError("只支持 http:// 和 https:// 的 URL")

        session = _navigate(url)

        summary = f"已加载 {url}"
        if session.title:
            summary = f"已加载 {session.title} ({url})"
        return ToolResult(success=True, output=summary, data=session.serialize())

class BrowserStateTool(Tool):
    name = "mshtools-browser_state"

    def call(self, **kwargs) -> ToolResult:
        # 重新解析页面以获取最新状态
        session = _parse_page()
        _manager.session = session
        return ToolResult(success=True, output="当前浏览器状态", data=session.serialize())

class BrowserFindTool(Tool):
    name = "mshtools-browser_find"

    def call(self, **kwargs) -> ToolResult:
        term = kwargs.get("text") or kwargs.get("query")
        if not term:
            raise ToolError("'text' 是必需的")
        
        session = _ensure_session_initialized()
        # 直接使用 WebDriver 的页面源码
        soup = BeautifulSoup(session.html or "", "html.parser")
        matches: List[Dict[str, str]] = []
        lower_term = term.lower()
        
        # 查找逻辑保持不变，因为它是在静态 HTML 上操作
        for element in soup.find_all(string=True):
            candidate = element.strip()
            if not candidate:
                continue
            if lower_term in candidate.lower():
                parent = element.parent
                snippet = candidate
                if len(snippet) > 240:
                    snippet = snippet[:237] + "..."
                matches.append(
                    {
                        "text": snippet,
                        "tag": parent.name if parent else "",
                    }
                )
                if len(matches) >= int(kwargs.get("limit", 20)):
                    break

        session.last_find_results = matches
        if matches:
            summary = f"为 '{term}' 找到 {len(matches)} 个匹配项"
        else:
            summary = f"没有找到 '{term}' 的匹配项"
        return ToolResult(success=True, output=summary, data={"matches": matches})


class BrowserClickTool(Tool):
    name = "mshtools-browser_click"

    def call(self, **kwargs) -> ToolResult:
        session = _ensure_session_initialized()
        index = kwargs.get("element_index")
        if index is None:
            raise ToolError("'element_index' 是必需的")
        try:
            index_int = int(index)
        except (TypeError, ValueError) as exc:
            raise ToolError("'element_index' 必须是整数") from exc
        if not 0 <= index_int < len(session.clickables):
            raise ToolError("element_index 超出范围")

        element_info = session.clickables[index_int]
        webelement = element_info._webelement

        if _manager.use_static_mode():
            target_url = element_info.href or session.current_url
            if target_url:
                new_session = _navigate(target_url)
            else:
                new_session = session
            _manager.session = new_session
            summary = f"已点击元素 {index_int} ('{element_info.text[:30]}...')"
            if target_url and target_url != session.current_url:
                summary += f" 并导航到 {target_url}"
            return ToolResult(
                success=True,
                output=summary,
                data=new_session.serialize(),
            )

        if not webelement:
            raise ToolError(
                f"无法找到索引为 {index_int} 的 Selenium 元素。请先调用 browser_state 刷新状态。"
            )

        try:
            webelement.click()
            # 点击后，页面可能已改变，需要重新解析
            new_session = _parse_page()
            _manager.session = new_session
            
            summary = f"已点击元素 {index_int} ('{element_info.text[:30]}...')"
            if new_session.current_url != session.current_url:
                summary += f" 并导航到 {new_session.current_url}"

            return ToolResult(
                success=True,
                output=summary,
                data=new_session.serialize(),
            )
        except Exception as e:
            raise ToolError(f"点击元素 {index_int} 时出错: {e}")


class BrowserInputTool(Tool):
    name = "mshtools-browser_input"

    def call(self, **kwargs) -> ToolResult:
        session = _ensure_session_initialized()
        index = kwargs.get("element_index")
        value = kwargs.get("text") or kwargs.get("value")
        if index is None or value is None:
            raise ToolError("'element_index' 和 'text' 是必需的")
        try:
            index_int = int(index)
        except (TypeError, ValueError) as exc:
            raise ToolError("'element_index' 必须是整数") from exc
        if not 0 <= index_int < len(session.inputs):
            raise ToolError("element_index 超出范围")

        input_info = session.inputs[index_int]
        webelement = input_info._webelement

        if _manager.use_static_mode():
            input_info.value = str(value)
            session.inputs[index_int] = input_info
            _manager.session = session
            summary = f"已向输入框 {index_int} 中填入文本"
            return ToolResult(success=True, output=summary, data=input_info.serialize())

        if not webelement:
            raise ToolError(
                f"无法找到索引为 {index_int} 的 Selenium 元素。请先调用 browser_state 刷新状态。"
            )

        try:
            webelement.clear()
            webelement.send_keys(str(value))
            # 更新会话中的值
            input_info.value = str(value)
            summary = f"已向输入框 {index_int} 中填入文本"
            return ToolResult(success=True, output=summary, data=input_info.serialize())
        except Exception as e:
            raise ToolError(f"向输入框 {index_int} 填入文本时出错: {e}")


class BrowserScrollTool(Tool):
    """滚动工具的基类。"""
    direction: int = 1

    def call(self, **kwargs) -> ToolResult:
        session = _ensure_session_initialized()
        amount = kwargs.get("scroll_amount", 400)
        try:
            amount_int = int(amount)
        except (TypeError, ValueError) as exc:
            raise ToolError("'scroll_amount' 必须是整数") from exc

        if _manager.use_static_mode():
            if self.direction > 0:
                new_scroll_pos = min(session.scroll_position + amount_int, amount_int)
            else:
                new_scroll_pos = max(session.scroll_position - amount_int, 0)
            session.scroll_position = new_scroll_pos
            _manager.session = session
            summary = f"已{'向下' if self.direction > 0 else '向上'}滚动到位置 {new_scroll_pos}"
            return ToolResult(success=True, output=summary, data=session.serialize())

        driver = _manager.driver
        # 使用 JavaScript 执行滚动
        driver.execute_script(f"window.scrollBy(0, {self.direction * amount_int});")

        # 更新滚动位置
        new_scroll_pos = driver.execute_script("return window.pageYOffset;")
        _manager.session.scroll_position = new_scroll_pos
        
        summary = f"已{'向下' if self.direction > 0 else '向上'}滚动到位置 {new_scroll_pos}"
        return ToolResult(success=True, output=summary, data=_manager.session.serialize())

class BrowserScrollDownTool(BrowserScrollTool):
    name = "mshtools-browser_scroll_down"
    direction = 1

class BrowserScrollUpTool(BrowserScrollTool):
    name = "mshtools-browser_scroll_up"
    direction = -1


__all__ = [
    "BrowserVisitTool",
    "BrowserStateTool",
    "BrowserFindTool",
    "BrowserClickTool",
    "BrowserInputTool",
    "BrowserScrollDownTool",
    "BrowserScrollUpTool",
    "reset_session",
]
