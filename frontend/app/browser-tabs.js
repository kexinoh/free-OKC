/**
 * Browser Tabs Module
 *
 * 管理应用内多对话标签页功能
 * 每个标签页对应一个独立的对话会话
 */

import {
    getConversationTabs,
    getActiveTabId,
    createConversationTab,
    closeConversationTab,
    switchConversationTab,
    getTabTitle,
    loadTabsFromStorage,
    getCurrentConversation,
    getConversations,
} from '../conversationState.js';

class BrowserTabsManager {
    constructor() {
        this.tabsContainer = document.getElementById('browser-tabs');
        this.tabList = document.getElementById('browser-tab-list');
        this.newTabBtn = document.getElementById('browser-new-tab');

        // 外部回调函数
        this.onTabSwitch = null;
        this.onNewTab = null;
        this.onTabClose = null;

        this.init();
    }

    init() {
        console.log('[BrowserTabs] Initializing conversation tabs manager...');

        // 确保标签栏始终可见
        this.showTabs();

        // 监听新标签页按钮
        if (this.newTabBtn) {
            this.newTabBtn.addEventListener('click', () => {
                console.log('[BrowserTabs] New tab button clicked');
                this.createNewConversationTab();
            });
        }

        // 设置侧边栏底部按钮事件
        this.setupSidebarButtons();

        console.log('[BrowserTabs] Conversation tabs manager initialized');
    }

    /**
     * 设置回调函数
     */
    setCallbacks({ onTabSwitch, onNewTab, onTabClose }) {
        this.onTabSwitch = onTabSwitch;
        this.onNewTab = onNewTab;
        this.onTabClose = onTabClose;
    }

    setupSidebarButtons() {
        const helpBtn = document.getElementById('help-feedback-btn');
        const helpDropdown = document.getElementById('help-dropdown');
        const settingsBtn = document.getElementById('settings-btn-sidebar');

        // 帮助反馈下拉菜单
        if (helpBtn && helpDropdown) {
            // 点击按钮切换下拉菜单
            helpBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isHidden = helpDropdown.hidden;
                helpDropdown.hidden = !isHidden;
            });

            // 点击外部关闭下拉菜单
            document.addEventListener('click', (e) => {
                if (!helpDropdown.contains(e.target) && e.target !== helpBtn) {
                    helpDropdown.hidden = true;
                    // 移除可能存在的QQ号显示
                    const qqDisplay = helpDropdown.querySelector('.qq-number-display');
                    if (qqDisplay) {
                        qqDisplay.remove();
                    }
                }
            });

            // 处理下拉菜单项点击
            helpDropdown.addEventListener('click', (e) => {
                const item = e.target.closest('.help-dropdown-item');
                if (!item) return;

                const action = item.dataset.action;

                if (action === 'github') {
                    // 用外部浏览器打开 GitHub
                    const githubUrl = 'https://github.com/kexinoh/free-OKC';
                    if (window.electronAPI && window.electronAPI.openExternal) {
                        window.electronAPI.openExternal(githubUrl);
                    } else {
                        window.open(githubUrl, '_blank');
                    }
                    helpDropdown.hidden = true;
                } else if (action === 'qq') {
                    // 显示QQ群号
                    let qqDisplay = helpDropdown.querySelector('.qq-number-display');
                    if (!qqDisplay) {
                        qqDisplay = document.createElement('div');
                        qqDisplay.className = 'qq-number-display';
                        qqDisplay.innerHTML = `
                            <span>QQ群号:</span>
                            <span class="qq-number">1079067473</span>
                            <span class="copy-hint">(点击复制)</span>
                        `;
                        item.after(qqDisplay);

                        // 点击复制QQ号
                        qqDisplay.addEventListener('click', () => {
                            const qqNumber = '1079067473';
                            navigator.clipboard.writeText(qqNumber).then(() => {
                                qqDisplay.querySelector('.copy-hint').textContent = '(已复制!)';
                                setTimeout(() => {
                                    qqDisplay.querySelector('.copy-hint').textContent = '(点击复制)';
                                }, 2000);
                            });
                        });
                    } else {
                        // 如果已存在则移除
                        qqDisplay.remove();
                    }
                }
            });
        }

        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
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
            this.tabsContainer.style.display = '';
        }
    }

    /**
     * 渲染所有标签页
     */
    renderTabs() {
        if (!this.tabList) return;

        const tabs = getConversationTabs();
        const activeTabId = getActiveTabId();

        // 清空现有标签
        this.tabList.innerHTML = '';

        // 渲染每个标签
        tabs.forEach((tab) => {
            const tabBtn = this.createTabElement(tab, tab.id === activeTabId);
            this.tabList.appendChild(tabBtn);
        });

        console.log('[BrowserTabs] Rendered', tabs.length, 'tabs');
    }

    /**
     * 创建标签元素
     */
    createTabElement(tab, isActive) {
        const tabBtn = document.createElement('button');
        tabBtn.type = 'button';
        tabBtn.className = 'browser-tab';
        if (isActive) {
            tabBtn.classList.add('active');
        }
        tabBtn.dataset.tabId = tab.id;
        tabBtn.dataset.conversationId = tab.conversationId;

        const title = getTabTitle(tab.id);
        const displayTitle = title.length > 12 ? title.slice(0, 12) + '...' : title;

        const tabs = getConversationTabs();
        const showCloseBtn = tabs.length > 1;

        tabBtn.innerHTML = `
            <span class="tab-title" title="${this.escapeHtml(title)}">${this.escapeHtml(displayTitle)}</span>
            ${showCloseBtn ? '<span class="tab-close" title="关闭标签页">×</span>' : ''}
        `;

        // 点击标签切换
        tabBtn.addEventListener('click', (e) => {
            if (!e.target.classList.contains('tab-close')) {
                this.switchToTab(tab.id);
            }
        });

        // 关闭标签
        const closeBtn = tabBtn.querySelector('.tab-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeTab(tab.id);
            });
        }

        return tabBtn;
    }

    /**
     * 创建新对话标签页
     */
    async createNewConversationTab() {
        console.log('[BrowserTabs] Creating new conversation tab');

        const tab = createConversationTab();

        // 渲染标签
        this.renderTabs();

        // 触发回调
        if (typeof this.onNewTab === 'function') {
            await this.onNewTab(tab);
        }

        return tab;
    }

    /**
     * 切换到指定标签
     */
    async switchToTab(tabId) {
        if (!tabId) return;

        const currentActiveTabId = getActiveTabId();
        if (currentActiveTabId === tabId) return;

        console.log('[BrowserTabs] Switching to tab:', tabId);

        const tab = switchConversationTab(tabId);
        if (!tab) return;

        // 更新标签样式
        this.renderTabs();

        // 触发回调
        if (typeof this.onTabSwitch === 'function') {
            await this.onTabSwitch(tab);
        }
    }

    /**
     * 关闭标签
     */
    async closeTab(tabId) {
        if (!tabId) return;

        const tabs = getConversationTabs();

        // 如果只有一个标签，不允许关闭（保持至少一个标签）
        if (tabs.length <= 1) {
            console.log('[BrowserTabs] Cannot close the last tab');
            return;
        }

        console.log('[BrowserTabs] Closing tab:', tabId);

        const wasActive = getActiveTabId() === tabId;
        const removed = closeConversationTab(tabId);

        if (!removed) return;

        // 渲染标签
        this.renderTabs();

        // 如果关闭的是活动标签，需要触发切换回调
        if (wasActive && typeof this.onTabSwitch === 'function') {
            const newActiveTab = getConversationTabs().find(t => t.id === getActiveTabId());
            if (newActiveTab) {
                await this.onTabSwitch(newActiveTab);
            }
        }

        // 触发关闭回调
        if (typeof this.onTabClose === 'function') {
            await this.onTabClose(removed);
        }
    }

    /**
     * 更新指定标签的标题
     */
    updateTabTitle(tabId) {
        if (!tabId || !this.tabList) return;

        const tabBtn = this.tabList.querySelector(`[data-tab-id="${tabId}"]`);
        if (!tabBtn) return;

        const titleSpan = tabBtn.querySelector('.tab-title');
        if (!titleSpan) return;

        const title = getTabTitle(tabId);
        const displayTitle = title.length > 12 ? title.slice(0, 12) + '...' : title;

        titleSpan.textContent = displayTitle;
        titleSpan.title = title;
    }

    /**
     * 更新当前活动标签的标题
     */
    updateActiveTabTitle() {
        const activeTabId = getActiveTabId();
        if (activeTabId) {
            this.updateTabTitle(activeTabId);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 模块级别的日志
console.log('[BrowserTabs] Module loaded');

// 初始化
let browserTabsManager = null;

function initBrowserTabs() {
    console.log('[BrowserTabs] initBrowserTabs() called');

    // 防止重复初始化
    if (browserTabsManager) {
        console.warn('[BrowserTabs] Already initialized, skipping...');
        return browserTabsManager;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            try {
                browserTabsManager = new BrowserTabsManager();
            } catch (error) {
                console.error('[BrowserTabs] Error creating manager:', error);
            }
        });
    } else {
        try {
            browserTabsManager = new BrowserTabsManager();
        } catch (error) {
            console.error('[BrowserTabs] Error creating manager:', error);
        }
    }

    return browserTabsManager;
}

function getBrowserTabsManager() {
    return browserTabsManager;
}

// 导出
export { BrowserTabsManager, initBrowserTabs, getBrowserTabsManager };
