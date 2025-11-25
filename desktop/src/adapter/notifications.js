/**
 * Notifications - 系统通知适配器
 */

import NativeBridge from './native-bridge.js';

/**
 * Notifications API
 */
const Notifications = {
    _permissionGranted: false,

    /**
     * 检查通知权限
     * @returns {Promise<boolean>}
     */
    async checkPermission() {
        if (NativeBridge.isDesktop()) {
            try {
                const { isPermissionGranted } = await import('@tauri-apps/api/notification');
                this._permissionGranted = await isPermissionGranted();
                return this._permissionGranted;
            } catch {
                return false;
            }
        }

        // Web 模式
        if ('Notification' in window) {
            this._permissionGranted = Notification.permission === 'granted';
            return this._permissionGranted;
        }

        return false;
    },

    /**
     * 请求通知权限
     * @returns {Promise<boolean>}
     */
    async requestPermission() {
        if (NativeBridge.isDesktop()) {
            try {
                const { isPermissionGranted, requestPermission } = 
                    await import('@tauri-apps/api/notification');

                if (await isPermissionGranted()) {
                    this._permissionGranted = true;
                    return true;
                }

                const permission = await requestPermission();
                this._permissionGranted = permission === 'granted';
                return this._permissionGranted;
            } catch (error) {
                console.error('[Notifications] Failed to request permission:', error);
                return false;
            }
        }

        // Web 模式
        if ('Notification' in window) {
            const permission = await Notification.requestPermission();
            this._permissionGranted = permission === 'granted';
            return this._permissionGranted;
        }

        return false;
    },

    /**
     * 发送通知
     * @param {string} title - 标题
     * @param {string} body - 内容
     * @param {object} options - 选项
     */
    async send(title, body, options = {}) {
        if (!this._permissionGranted) {
            console.warn('[Notifications] Permission not granted');
            return;
        }

        if (NativeBridge.isDesktop()) {
            try {
                const { sendNotification } = await import('@tauri-apps/api/notification');
                await sendNotification({
                    title,
                    body,
                    icon: options.icon,
                });
            } catch (error) {
                console.error('[Notifications] Failed to send notification:', error);
            }
            return;
        }

        // Web 模式
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, {
                body,
                icon: options.icon,
            });
        }
    },

    /**
     * 任务完成通知
     * @param {string} taskName - 任务名称
     */
    async notifyTaskComplete(taskName) {
        await this.send('OKCVM', `任务已完成: ${taskName}`);
    },

    /**
     * 错误通知
     * @param {string} message - 错误信息
     */
    async notifyError(message) {
        await this.send('OKCVM 错误', message);
    },

    /**
     * 新消息通知
     * @param {string} preview - 消息预览
     */
    async notifyNewMessage(preview) {
        await this.send('OKCVM', preview || '收到新消息');
    },

    /**
     * 后端状态通知
     * @param {boolean} running - 是否运行中
     */
    async notifyBackendStatus(running) {
        const message = running ? '后端服务已启动' : '后端服务已停止';
        await this.send('OKCVM', message);
    },
};

export default Notifications;
