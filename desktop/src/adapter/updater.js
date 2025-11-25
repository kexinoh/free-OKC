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
    _updateInfo: null,

    /**
     * 初始化更新器
     */
    async init() {
        if (!NativeBridge.isDesktop()) {
            return;
        }

        // 监听更新可用事件
        window.addEventListener('okcvm:update-available', (e) => {
            this._updateInfo = e.detail;
            console.log('[Updater] Update available:', this._updateInfo);
        });

        // 监听更新下载完成事件
        window.addEventListener('okcvm:update-downloaded', (e) => {
            this._updateInfo = { ...this._updateInfo, downloaded: true };
            console.log('[Updater] Update downloaded');
        });
    },

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
            const result = await NativeBridge.invoke('check-for-updates');

            // 记录检查时间
            this._lastCheckTime = Date.now();
            localStorage.setItem('okcvm-last-update-check', this._lastCheckTime.toString());

            if (result.available) {
                this._updateInfo = result;
                console.log('[Updater] Update available:', result);
                return {
                    available: true,
                    version: result.version,
                    notes: result.notes,
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
     * 下载更新
     * @returns {Promise<boolean>}
     */
    async downloadUpdate() {
        if (!NativeBridge.isDesktop()) {
            return false;
        }

        try {
            const result = await NativeBridge.invoke('download-update');
            return result;
        } catch (error) {
            console.error('[Updater] Failed to download update:', error);
            return false;
        }
    },

    /**
     * 安装更新并重启
     * @returns {Promise<boolean>}
     */
    async installUpdate() {
        if (!NativeBridge.isDesktop()) {
            return false;
        }

        try {
            await NativeBridge.invoke('install-update');
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
                return await NativeBridge.invoke('get-app-version');
            } catch {
                return 'unknown';
            }
        }
        return 'web';
    },

    /**
     * 获取更新信息
     * @returns {object|null}
     */
    getUpdateInfo() {
        return this._updateInfo;
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
