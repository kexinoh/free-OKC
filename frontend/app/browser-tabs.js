/**
 * Browser Tabs Module
 * 
 * 管理应用内浏览器标签页功能
 */

class BrowserTabsManager {
    constructor() {
        this.tabs = new Map();
        this.activeTabId = 'main';
        this.tabCounter = 0;

        this.tabsContainer = document.getElementById('browser-tabs');
        this.tabList = document.getElementById('browser-tab-list');
        this.newTabBtn = document.getElementById('browser-new-tab');
        this.appMain = document.querySelector('.app-main');
        this.appHeader = document.querySelector('.app-header');

        this.init();
    }

    init() {
        console.log('[BrowserTabs] 🚀 Initializing browser tabs manager...');
        console.log('[BrowserTabs] 🔍 Environment check:', {
            hasElectronAPI: !!window.electronAPI,
            hasWindow: typeof window !== 'undefined',
            isElectron: !!window.__ELECTRON__,
            readyState: document.readyState
        });

        // 确保标签栏始终可见
        this.showTabs();

        // 为主页标签绑定点击事件
        this.setupMainTabListener();

        // 监听新标签页按钮
        if (this.newTabBtn) {
            this.newTabBtn.addEventListener('click', () => {
                console.log('[BrowserTabs] New tab button clicked');
                this.createTab('about:blank', '新标签页');
            });
        }

        // 监听来自Electron的打开标签页事件（通过两种方式）
        // 方式1: 通过 electronAPI（如果可用）
        if (window.electronAPI) {
            console.log('[BrowserTabs] 📡 Setting up electronAPI listener...');
            try {
                const unlisten = window.electronAPI.on('open-browser-tab', (url) => {
                    console.log('[BrowserTabs] ✅ Received open-browser-tab via electronAPI:', url);
                    this.createTab(url);
                    this.showTabs();
                });
                console.log('[BrowserTabs] ✅ electronAPI listener set up successfully, unlisten:', typeof unlisten);
            } catch (error) {
                console.error('[BrowserTabs] ❌ Error setting up electronAPI listener:', error);
            }
        } else {
            console.warn('[BrowserTabs] ⚠️ electronAPI not available');
        }

        // 方式2: 已移除自定义事件监听器，避免重复创建tab
        // 现在只使用 electronAPI.on('open-browser-tab') 一种方式

        // 隐藏主标签的关闭按钮
        this.hideMainTabCloseButton();

        // 设置侧边栏底部按钮事件
        this.setupSidebarButtons();

        console.log('[BrowserTabs] ✅ Browser tabs manager initialized');

        // 🔥 创建全局测试函数
        window.testBrowserTab = (url = 'https://www.google.com') => {
            console.log('[BrowserTabs] 🧪 Manual test triggered for URL:', url);
            this.createTab(url);
            this.showTabs();
        };
        console.log('[BrowserTabs] 🧪 Global test function created: window.testBrowserTab(url)');
    }

    setupMainTabListener() {
        const mainTab = this.tabList?.querySelector('[data-tab="main"]');
        if (mainTab) {
            mainTab.addEventListener('click', (e) => {
                // 主页标签没有关闭按钮，所以直接切换
                console.log('[BrowserTabs] Main tab clicked');
                this.switchTab('main');
            });
            console.log('[BrowserTabs] ✅ Main tab listener attached');
        } else {
            console.warn('[BrowserTabs] ⚠️ Main tab not found in DOM');
        }
    }

    hideMainTabCloseButton() {
        const mainTab = this.tabList.querySelector('[data-tab="main"]');
        if (mainTab) {
            const mainCloseBtn = mainTab.querySelector('.tab-close');
            if (mainCloseBtn) {
                mainCloseBtn.style.display = 'none';
            }
        }
    }

    setupSidebarButtons() {
        const helpBtn = document.getElementById('help-feedback-btn');
        const settingsBtn = document.getElementById('settings-btn-sidebar');

        if (helpBtn) {
            helpBtn.addEventListener('click', () => {
                // 打开帮助页面或显示帮助对话框
                this.createTab('https://github.com/your-project/help', '帮助');
                this.showTabs();
            });
        }

        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                // 触发设置面板
                const settingsToggle = document.getElementById('settings-toggle');
                if (settingsToggle) {
                    settingsToggle.click();
                }
            });
        }
    }

    showTabs() {
        if (this.tabsContainer) {
            this.tabsContainer.hidden = false;
            this.tabsContainer.style.display = ''; // 确保没有 display:none
            console.log('[BrowserTabs] Tabs container shown');
        }
    }

    createTab(url, title = '加载中...') {
        const tabId = `tab-${++this.tabCounter}`;

        // 创建标签按钮
        const tabBtn = document.createElement('button');
        tabBtn.type = 'button';
        tabBtn.className = 'browser-tab';
        tabBtn.dataset.tab = tabId;
        tabBtn.innerHTML = `
            <span class="tab-title">${this.escapeHtml(title)}</span>
            <span class="tab-close" title="关闭标签页">×</span>
        `;

        // 确保主标签的关闭按钮隐藏
        this.hideMainTabCloseButton();

        // 点击标签切换
        tabBtn.addEventListener('click', (e) => {
            if (!e.target.classList.contains('tab-close')) {
                this.switchTab(tabId);
            }
        });

        // 关闭标签
        tabBtn.querySelector('.tab-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeTab(tabId);
        });

        this.tabList.appendChild(tabBtn);

        // 创建 webview 容器
        let browserContainer = document.getElementById('browser-container');
        if (!browserContainer) {
            browserContainer = document.createElement('div');
            browserContainer.className = 'browser-container';
            browserContainer.id = 'browser-container';
            this.appMain?.parentNode?.insertBefore(browserContainer, this.appMain.nextSibling);
        }

        // 创建 webview
        const webview = document.createElement('webview');
        webview.id = `webview-${tabId}`;
        webview.src = url;
        webview.style.display = 'none';
        webview.setAttribute('allowpopups', '');

        // 监听标题变化
        webview.addEventListener('page-title-updated', (e) => {
            const titleSpan = tabBtn.querySelector('.tab-title');
            if (titleSpan) {
                titleSpan.textContent = e.title || url;
            }
        });

        // 监听 webview 内的新窗口打开请求
        webview.addEventListener('new-window', (e) => {
            e.preventDefault();
            // 在新标签页中打开链接
            this.createTab(e.url, '加载中...');
        });

        browserContainer.appendChild(webview);
        browserContainer.hidden = false;

        // 存储标签信息
        this.tabs.set(tabId, { tabBtn, webview, url });

        // 切换到新标签
        this.switchTab(tabId);

        return tabId;
    }

    switchTab(tabId) {
        // 隐藏当前标签的 webview
        const currentTab = this.tabs.get(this.activeTabId);
        if (currentTab?.webview) {
            currentTab.webview.style.display = 'none';
        }

        // 更新标签样式
        this.tabList.querySelectorAll('.browser-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        // 显示目标标签
        if (tabId === 'main') {
            // 显示主页内容
            if (this.appMain) this.appMain.style.display = '';
            if (this.appHeader) this.appHeader.style.display = '';
            const browserContainer = document.getElementById('browser-container');
            if (browserContainer) browserContainer.hidden = true;
        } else {
            const tab = this.tabs.get(tabId);
            if (tab?.webview) {
                // 隐藏主页内容
                if (this.appMain) this.appMain.style.display = 'none';
                if (this.appHeader) this.appHeader.style.display = 'none';

                const browserContainer = document.getElementById('browser-container');
                if (browserContainer) browserContainer.hidden = false;

                tab.webview.style.display = '';
            }
        }

        this.activeTabId = tabId;
    }

    closeTab(tabId) {
        // 禁止关闭主标签
        if (tabId === 'main') {
            console.warn('Cannot close the main tab');
            return;
        }

        const tab = this.tabs.get(tabId);
        if (!tab) return;

        // 移除 DOM 元素
        tab.tabBtn.remove();
        tab.webview.remove();

        // 从 Map 中移除
        this.tabs.delete(tabId);

        // 如果关闭的是当前标签，切换到主页
        if (this.activeTabId === tabId) {
            this.switchTab('main');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 🔥 模块级别的日志
console.log('[BrowserTabs] 📦 Module loaded, class defined');

// 初始化
let browserTabsManager = null;

function initBrowserTabs() {
    console.log('[BrowserTabs] 🎬 initBrowserTabs() called');

    // 防止重复初始化
    if (browserTabsManager) {
        console.warn('[BrowserTabs] ⚠️ Already initialized, skipping...');
        return browserTabsManager;
    }

    console.log('[BrowserTabs] 🔍 document.readyState:', document.readyState);

    if (document.readyState === 'loading') {
        console.log('[BrowserTabs] ⏳ Document loading, waiting for DOMContentLoaded...');
        document.addEventListener('DOMContentLoaded', () => {
            console.log('[BrowserTabs] 📍 DOMContentLoaded fired, creating manager...');
            try {
                browserTabsManager = new BrowserTabsManager();
                console.log('[BrowserTabs] ✅ Manager created successfully');
            } catch (error) {
                console.error('[BrowserTabs] ❌ Error creating manager:', error);
            }
        });
    } else {
        console.log('[BrowserTabs] ✅ Document ready, creating manager immediately...');
        try {
            browserTabsManager = new BrowserTabsManager();
            console.log('[BrowserTabs] ✅ Manager created successfully');
        } catch (error) {
            console.error('[BrowserTabs] ❌ Error creating manager:', error);
        }
    }
}

// 导出
console.log('[BrowserTabs] 📤 Exporting module functions');
export { BrowserTabsManager, initBrowserTabs, browserTabsManager };
