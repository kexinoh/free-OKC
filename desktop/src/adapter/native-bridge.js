/**
 * Native Bridge - Tauri API 封装层
 * 
 * 提供统一的接口访问 Tauri 原生 API，自动检测运行环境。
 */

// 检测是否在 Tauri 环境中
const isTauri = () => typeof window !== 'undefined' && !!window.__TAURI__;

// 缓存 Tauri API 模块
let tauriModules = null;

/**
 * 懒加载 Tauri 模块
 */
async function loadTauriModules() {
    if (!isTauri() || tauriModules) return tauriModules;

    try {
        const [
            { invoke },
            { listen, emit },
            { open, save, message, ask, confirm },
            { sendNotification, isPermissionGranted, requestPermission },
        ] = await Promise.all([
            import('@tauri-apps/api/tauri'),
            import('@tauri-apps/api/event'),
            import('@tauri-apps/api/dialog'),
            import('@tauri-apps/api/notification'),
        ]);

        tauriModules = {
            invoke,
            event: { listen, emit },
            dialog: { open, save, message, ask, confirm },
            notification: { sendNotification, isPermissionGranted, requestPermission },
        };

        return tauriModules;
    } catch (error) {
        console.error('[NativeBridge] Failed to load Tauri modules:', error);
        return null;
    }
}

// 预加载模块
if (isTauri()) {
    loadTauriModules();
}

/**
 * Native Bridge API
 */
const NativeBridge = {
    /**
     * 检测是否在桌面模式
     */
    isDesktop: isTauri,

    /**
     * 调用 Rust 命令
     * @param {string} cmd - 命令名称
     * @param {object} args - 命令参数
     * @returns {Promise<any>}
     */
    async invoke(cmd, args = {}) {
        if (!isTauri()) {
            throw new Error('Not in Tauri environment');
        }
        const modules = await loadTauriModules();
        return modules.invoke(cmd, args);
    },

    /**
     * 获取后端 URL
     * @returns {Promise<string>}
     */
    async getBackendUrl() {
        if (isTauri()) {
            try {
                return await this.invoke('get_backend_url');
            } catch (error) {
                console.warn('[NativeBridge] Failed to get backend URL:', error);
                // 后端可能还在启动中，返回空字符串使用相对路径
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
        if (!isTauri()) {
            return { status: 'running', port: null };
        }
        return await this.invoke('get_backend_status');
    },

    /**
     * 监听原生事件
     * @param {string} event - 事件名称
     * @param {function} callback - 回调函数
     * @returns {Promise<function>} 取消监听的函数
     */
    async listen(event, callback) {
        if (!isTauri()) {
            return () => {}; // 返回空的取消函数
        }
        const modules = await loadTauriModules();
        return modules.event.listen(event, (e) => callback(e.payload));
    },

    /**
     * 发送事件到 Rust
     * @param {string} event - 事件名称
     * @param {any} payload - 事件数据
     */
    async emit(event, payload) {
        if (!isTauri()) return;
        const modules = await loadTauriModules();
        await modules.event.emit(event, payload);
    },

    /**
     * 显示消息对话框
     * @param {string} title - 标题
     * @param {string} message - 消息内容
     */
    async showMessage(title, message) {
        if (!isTauri()) {
            alert(`${title}\n\n${message}`);
            return;
        }
        const modules = await loadTauriModules();
        await modules.dialog.message(message, { title });
    },

    /**
     * 显示确认对话框
     * @param {string} title - 标题
     * @param {string} message - 消息内容
     * @returns {Promise<boolean>}
     */
    async showConfirm(title, message) {
        if (!isTauri()) {
            return confirm(`${title}\n\n${message}`);
        }
        const modules = await loadTauriModules();
        return await modules.dialog.confirm(message, { title });
    },

    /**
     * 显示询问对话框
     * @param {string} title - 标题
     * @param {string} message - 消息内容
     * @returns {Promise<boolean>}
     */
    async showAsk(title, message) {
        if (!isTauri()) {
            return confirm(`${title}\n\n${message}`);
        }
        const modules = await loadTauriModules();
        return await modules.dialog.ask(message, { title });
    },
};

export default NativeBridge;
