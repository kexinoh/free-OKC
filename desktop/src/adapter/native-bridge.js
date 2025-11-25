/**
 * Native Bridge - Electron API 封装层
 * 
 * 提供统一的接口访问 Electron 原生 API，自动检测运行环境。
 */

// 检测是否在 Electron 环境中
const isElectron = () => typeof window !== 'undefined' && !!window.__ELECTRON__;

/**
 * Native Bridge API
 */
const NativeBridge = {
    /**
     * 检测是否在桌面模式
     */
    isDesktop: isElectron,

    /**
     * 调用主进程方法
     * @param {string} channel - 频道名称
     * @param {...any} args - 参数
     * @returns {Promise<any>}
     */
    async invoke(channel, ...args) {
        if (!isElectron()) {
            throw new Error('Not in Electron environment');
        }
        return window.electronAPI.invoke(channel, ...args);
    },

    /**
     * 获取后端 URL
     * @returns {Promise<string>}
     */
    async getBackendUrl() {
        if (isElectron()) {
            try {
                return await this.invoke('get-backend-url') || '';
            } catch (error) {
                console.warn('[NativeBridge] Failed to get backend URL:', error);
                return '';
            }
        }
        // Web 模式使用相对路径
        return '';
    },

    /**
     * 获取后端状态
     * @returns {Promise<object>}
     */
    async getBackendStatus() {
        if (!isElectron()) {
            return { status: 'running', port: null };
        }
        return await this.invoke('get-backend-status');
    },

    /**
     * 监听原生事件
     * @param {string} event - 事件名称
     * @param {function} callback - 回调函数
     * @returns {function} 取消监听的函数
     */
    listen(event, callback) {
        if (!isElectron()) {
            return () => {}; // 返回空的取消函数
        }
        return window.electronAPI.on(event, callback);
    },

    /**
     * 一次性监听事件
     * @param {string} event - 事件名称
     * @param {function} callback - 回调函数
     */
    once(event, callback) {
        if (!isElectron()) return;
        window.electronAPI.once(event, callback);
    },

    /**
     * 显示消息对话框
     * @param {string} title - 标题
     * @param {string} message - 消息内容
     */
    async showMessage(title, message) {
        if (!isElectron()) {
            alert(`${title}\n\n${message}`);
            return;
        }
        await this.invoke('show-message-box', {
            type: 'info',
            title,
            message,
            buttons: ['确定'],
        });
    },

    /**
     * 显示确认对话框
     * @param {string} title - 标题
     * @param {string} message - 消息内容
     * @returns {Promise<boolean>}
     */
    async showConfirm(title, message) {
        if (!isElectron()) {
            return confirm(`${title}\n\n${message}`);
        }
        const result = await this.invoke('show-message-box', {
            type: 'question',
            title,
            message,
            buttons: ['取消', '确定'],
            defaultId: 1,
            cancelId: 0,
        });
        return result.response === 1;
    },

    /**
     * 显示询问对话框
     * @param {string} title - 标题
     * @param {string} message - 消息内容
     * @returns {Promise<boolean>}
     */
    async showAsk(title, message) {
        return this.showConfirm(title, message);
    },

    /**
     * 显示错误对话框
     * @param {string} title - 标题
     * @param {string} message - 消息内容
     */
    async showError(title, message) {
        if (!isElectron()) {
            alert(`${title}\n\n${message}`);
            return;
        }
        await this.invoke('show-message-box', {
            type: 'error',
            title,
            message,
            buttons: ['确定'],
        });
    },

    /**
     * 在浏览器中打开链接
     * @param {string} url - URL
     */
    async openExternal(url) {
        if (isElectron()) {
            await this.invoke('open-external', url);
        } else {
            window.open(url, '_blank');
        }
    },

    /**
     * 在文件管理器中显示文件
     * @param {string} path - 文件路径
     */
    async showItemInFolder(path) {
        if (isElectron()) {
            await this.invoke('show-item-in-folder', path);
        }
    },

    /**
     * 获取平台信息
     * @returns {string}
     */
    getPlatform() {
        if (isElectron()) {
            return window.electronAPI.platform;
        }
        return 'web';
    },

    /**
     * 获取版本信息
     * @returns {object}
     */
    getVersions() {
        if (isElectron()) {
            return window.electronAPI.versions;
        }
        return {};
    },
};

export default NativeBridge;
