/**
 * Theme - 系统主题同步
 */

import NativeBridge from './native-bridge.js';

/**
 * Theme API
 */
const Theme = {
    _currentTheme: 'light',
    _listeners: new Set(),
    _preference: 'system', // 'system', 'light', 'dark'

    /**
     * 初始化主题系统
     */
    async init() {
        // 加载保存的偏好设置
        const savedPreference = localStorage.getItem('okcvm-theme-preference');
        if (savedPreference) {
            this._preference = savedPreference;
        }

        // 获取当前主题
        this._currentTheme = await this._detectTheme();
        this._applyTheme(this._currentTheme);

        // 监听系统主题变化
        if (NativeBridge.isDesktop()) {
            // 监听来自主进程的主题变化事件
            NativeBridge.listen('theme-changed', (theme) => {
                if (this._preference === 'system') {
                    this._currentTheme = theme;
                    this._applyTheme(theme);
                    this._notifyListeners();
                }
            });

            // 也监听自定义 DOM 事件
            window.addEventListener('okcvm:theme-changed', (e) => {
                if (this._preference === 'system') {
                    this._currentTheme = e.detail.theme;
                    this._applyTheme(e.detail.theme);
                    this._notifyListeners();
                }
            });
        } else {
            // Web 模式监听 prefers-color-scheme
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            mediaQuery.addEventListener('change', (e) => {
                if (this._preference === 'system') {
                    this._currentTheme = e.matches ? 'dark' : 'light';
                    this._applyTheme(this._currentTheme);
                    this._notifyListeners();
                }
            });
        }

        console.log('[Theme] Initialized:', this._currentTheme);
    },

    /**
     * 检测当前主题
     */
    async _detectTheme() {
        if (this._preference !== 'system') {
            return this._preference;
        }

        if (NativeBridge.isDesktop()) {
            try {
                return await NativeBridge.invoke('get-system-theme');
            } catch {
                // 回退到 CSS 媒体查询
            }
        }

        return window.matchMedia('(prefers-color-scheme: dark)').matches 
            ? 'dark' 
            : 'light';
    },

    /**
     * 应用主题到 DOM
     */
    _applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        document.body.classList.toggle('dark-mode', theme === 'dark');
        document.body.classList.toggle('light-mode', theme === 'light');

        // 更新 meta theme-color
        let metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (!metaThemeColor) {
            metaThemeColor = document.createElement('meta');
            metaThemeColor.name = 'theme-color';
            document.head.appendChild(metaThemeColor);
        }
        metaThemeColor.content = theme === 'dark' ? '#1a1a2e' : '#ffffff';
    },

    /**
     * 获取当前主题
     * @returns {string}
     */
    get current() {
        return this._currentTheme;
    },

    /**
     * 获取主题偏好设置
     * @returns {string}
     */
    get preference() {
        return this._preference;
    },

    /**
     * 设置主题偏好
     * @param {'system'|'light'|'dark'} preference
     */
    async setPreference(preference) {
        this._preference = preference;
        localStorage.setItem('okcvm-theme-preference', preference);

        if (preference === 'system') {
            this._currentTheme = await this._detectTheme();
        } else {
            this._currentTheme = preference;
        }

        this._applyTheme(this._currentTheme);
        this._notifyListeners();
    },

    /**
     * 切换主题
     */
    async toggle() {
        const newTheme = this._currentTheme === 'dark' ? 'light' : 'dark';
        await this.setPreference(newTheme);
    },

    /**
     * 订阅主题变化
     * @param {function} callback - 回调函数
     * @returns {function} 取消订阅的函数
     */
    subscribe(callback) {
        this._listeners.add(callback);
        // 立即调用一次
        callback(this._currentTheme);
        return () => this._listeners.delete(callback);
    },

    /**
     * 通知所有监听器
     */
    _notifyListeners() {
        this._listeners.forEach((cb) => {
            try {
                cb(this._currentTheme);
            } catch (error) {
                console.error('[Theme] Error in listener:', error);
            }
        });
    },

    /**
     * 检查是否为深色模式
     * @returns {boolean}
     */
    isDark() {
        return this._currentTheme === 'dark';
    },
};

export default Theme;
