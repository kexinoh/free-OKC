/**
 * Shortcuts - 键盘快捷键管理
 */

import NativeBridge from './native-bridge.js';

/**
 * Shortcuts API
 */
const Shortcuts = {
    _listeners: new Map(),

    /**
     * 初始化快捷键监听
     */
    async init() {
        // 监听来自主进程的快捷键事件
        if (NativeBridge.isDesktop()) {
            NativeBridge.listen('shortcut', (action) => {
                this._emit(action);
            });
        }

        // 监听自定义 DOM 事件（由 preload 脚本触发）
        window.addEventListener('okcvm:new-chat', () => this._emit('new-chat'));
        window.addEventListener('okcvm:open-preferences', () => this._emit('open-preferences'));
        window.addEventListener('okcvm:check-update', () => this._emit('check-update'));

        // 注册本地键盘事件（Web 模式和 WebView 内部快捷键）
        document.addEventListener('keydown', (e) => this._handleKeyDown(e));

        console.log('[Shortcuts] Initialized');
    },

    /**
     * 处理键盘事件
     */
    _handleKeyDown(e) {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const modifier = isMac ? e.metaKey : e.ctrlKey;

        // Cmd/Ctrl + Enter - 发送消息
        if (modifier && e.key === 'Enter') {
            this._emit('send-message');
            return;
        }

        // Cmd/Ctrl + K - 聚焦搜索/命令
        if (modifier && e.key === 'k') {
            e.preventDefault();
            this._emit('focus-search');
            return;
        }

        // Cmd/Ctrl + N - 新建对话
        if (modifier && e.key === 'n' && !e.shiftKey) {
            e.preventDefault();
            this._emit('new-chat');
            return;
        }

        // Cmd/Ctrl + , - 打开设置
        if (modifier && e.key === ',') {
            e.preventDefault();
            this._emit('open-preferences');
            return;
        }

        // Escape - 关闭模态框/取消
        if (e.key === 'Escape') {
            this._emit('escape');
            return;
        }

        // Cmd/Ctrl + Shift + E - 编辑最后一条消息
        if (modifier && e.shiftKey && e.key === 'E') {
            e.preventDefault();
            this._emit('edit-last-message');
            return;
        }
    },

    /**
     * 注册快捷键监听器
     * @param {string} action - 动作名称
     * @param {function} callback - 回调函数
     * @returns {function} 取消监听的函数
     */
    on(action, callback) {
        if (!this._listeners.has(action)) {
            this._listeners.set(action, new Set());
        }
        this._listeners.get(action).add(callback);

        return () => {
            this._listeners.get(action)?.delete(callback);
        };
    },

    /**
     * 触发事件
     */
    _emit(action) {
        const listeners = this._listeners.get(action);
        if (listeners) {
            listeners.forEach((callback) => {
                try {
                    callback();
                } catch (error) {
                    console.error(`[Shortcuts] Error in ${action} handler:`, error);
                }
            });
        }
    },

    /**
     * 获取快捷键描述
     * @param {string} action - 动作名称
     * @returns {string}
     */
    getShortcutLabel(action) {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const cmdKey = isMac ? '⌘' : 'Ctrl';

        const shortcuts = {
            'toggle-window': `${cmdKey}+Shift+K`,
            'new-chat': `${cmdKey}+Shift+N`,
            'send-message': `${cmdKey}+Enter`,
            'focus-search': `${cmdKey}+K`,
            'open-preferences': `${cmdKey}+,`,
            'edit-last-message': `${cmdKey}+Shift+E`,
            'escape': 'Esc',
        };

        return shortcuts[action] || '';
    },
};

export default Shortcuts;
