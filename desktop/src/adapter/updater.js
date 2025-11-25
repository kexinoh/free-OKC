/**
 * Updater - 自动更新管理
 */

import NativeBridge from './native-bridge.js';

/**
 * Updater API
 */
const Updater = {
    _lastCheckTime: 0,
    _checkInterval: 24 * 60 * 60 * 1000, // 24 小时

    /**
     * 检查是否应该检查更新
     * @returns {Promise<boolean>}
     */
    async shouldCheckUpdate() {
        if (!NativeBridge.isDesktop()) {
            return false;
        }

        // 获取上次检查时间
        const lastCheck = localStorage.getItem('okcvm-last-update-check');
        if (lastCheck) {
            this._lastCheckTime = parseInt(lastCheck, 10);
        }

        const now = Date.now();
        return now - this._lastCheckTime > this._checkInterval;
    },

    /**
     * 检查更新
     * @returns {Promise<object|null>}
     */
    async checkForUpdates() {
        if (!NativeBridge.isDesktop()) {
            console.log('[Updater] Not in desktop mode');
            return null;
        }

        try {
            const { checkUpdate } = await import('@tauri-apps/api/updater');
            const update = await checkUpdate();

            // 记录检查时间
            this._lastCheckTime = Date.now();
            localStorage.setItem('okcvm-last-update-check', this._lastCheckTime.toString());

            if (update.shouldUpdate) {
                console.log('[Updater] Update available:', update.manifest);
                return {
                    available: true,
                    version: update.manifest?.version,
                    notes: update.manifest?.body,
                    date: update.manifest?.date,
                };
            }

            console.log('[Updater] No update available');
            return { available: false };
        } catch (error) {
            console.error('[Updater] Failed to check for updates:', error);
            return null;
        }
    },

    /**
     * 安装更新
     * @returns {Promise<boolean>}
     */
    async installUpdate() {
        if (!NativeBridge.isDesktop()) {
            return false;
        }

        try {
            const { installUpdate } = await import('@tauri-apps/api/updater');
            await installUpdate();

            // 安装后需要重启
            const { relaunch } = await import('@tauri-apps/api/process');
            await relaunch();

            return true;
        } catch (error) {
            console.error('[Updater] Failed to install update:', error);
            return false;
        }
    },

    /**
     * 获取当前版本
     * @returns {Promise<string>}
     */
    async getCurrentVersion() {
        if (NativeBridge.isDesktop()) {
            try {
                return await NativeBridge.invoke('get_app_version');
            } catch {
                return 'unknown';
            }
        }
        return 'web';
    },

    /**
     * 设置检查间隔
     * @param {number} interval - 间隔（毫秒）
     */
    setCheckInterval(interval) {
        this._checkInterval = interval;
    },
};

export default Updater;
