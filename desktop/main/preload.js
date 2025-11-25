/**
 * Electron Preload Script
 * 
 * 在渲染进程中暴露安全的 API 给前端使用。
 * 使用 contextBridge 实现安全的进程间通信。
 */

const { contextBridge, ipcRenderer } = require('electron');

// 验证 IPC 频道白名单
const validChannels = {
    invoke: [
        'get-backend-url',
        'get-backend-status',
        'restart-backend',
        'stop-backend',
        'get-app-version',
        'get-data-dir',
        'get-app-config',
        'set-app-config',
        'get-system-theme',
        'show-open-dialog',
        'show-save-dialog',
        'show-message-box',
        'read-file',
        'write-file',
        'get-file-info',
        'check-for-updates',
        'download-update',
        'install-update',
        'open-external',
        'show-item-in-folder',
        'window-minimize',
        'window-maximize',
        'window-close',
        'window-hide',
        'window-show',
    ],
    on: [
        'shortcut',
        'theme-changed',
        'backend-status',
        'backend-ready',
        'backend-stopped',
        'backend-error',
        'update-available',
        'update-downloaded',
        'notification',
    ],
};

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
    // 调用主进程方法
    invoke: (channel, ...args) => {
        if (validChannels.invoke.includes(channel)) {
            return ipcRenderer.invoke(channel, ...args);
        }
        throw new Error(`Invalid invoke channel: ${channel}`);
    },

    // 监听主进程事件
    on: (channel, callback) => {
        if (validChannels.on.includes(channel)) {
            const subscription = (event, ...args) => callback(...args);
            ipcRenderer.on(channel, subscription);
            return () => ipcRenderer.removeListener(channel, subscription);
        }
        throw new Error(`Invalid on channel: ${channel}`);
    },

    // 一次性监听
    once: (channel, callback) => {
        if (validChannels.on.includes(channel)) {
            ipcRenderer.once(channel, (event, ...args) => callback(...args));
        } else {
            throw new Error(`Invalid once channel: ${channel}`);
        }
    },

    // 移除监听器
    removeAllListeners: (channel) => {
        if (validChannels.on.includes(channel)) {
            ipcRenderer.removeAllListeners(channel);
        }
    },

    // 平台信息
    platform: process.platform,
    
    // 版本信息
    versions: {
        node: process.versions.node,
        chrome: process.versions.chrome,
        electron: process.versions.electron,
    },
});

// 暴露环境检测
contextBridge.exposeInMainWorld('__ELECTRON__', true);

// 页面加载完成后初始化
window.addEventListener('DOMContentLoaded', async () => {
    console.log('[Preload] DOM loaded, initializing...');

    try {
        // 获取后端 URL
        let backendUrl = '';
        try {
            backendUrl = await ipcRenderer.invoke('get-backend-url');
        } catch (error) {
            console.warn('[Preload] Backend not ready:', error.message);
        }

        // 获取应用版本
        const version = await ipcRenderer.invoke('get-app-version');

        // 获取系统主题
        const theme = await ipcRenderer.invoke('get-system-theme');

        // 设置全局配置
        window.__OKCVM_CONFIG__ = {
            isDesktop: true,
            backendUrl,
            version,
            platform: process.platform,
            theme,
        };

        console.log('[Preload] Initialized:', window.__OKCVM_CONFIG__);

        // 监听后端就绪事件
        ipcRenderer.on('backend-ready', (event, port) => {
            window.__OKCVM_CONFIG__.backendUrl = `http://127.0.0.1:${port}`;
            window.dispatchEvent(new CustomEvent('okcvm:backend-ready', { 
                detail: { port, url: window.__OKCVM_CONFIG__.backendUrl } 
            }));
        });

        // 监听后端停止事件
        ipcRenderer.on('backend-stopped', (event, code) => {
            window.dispatchEvent(new CustomEvent('okcvm:backend-stopped', { 
                detail: { code } 
            }));
        });

        // 监听主题变化
        ipcRenderer.on('theme-changed', (event, newTheme) => {
            window.__OKCVM_CONFIG__.theme = newTheme;
            window.dispatchEvent(new CustomEvent('okcvm:theme-changed', { 
                detail: { theme: newTheme } 
            }));
        });

        // 监听快捷键
        ipcRenderer.on('shortcut', (event, action) => {
            window.dispatchEvent(new CustomEvent(`okcvm:${action}`));
        });

        // 监听更新事件
        ipcRenderer.on('update-available', (event, info) => {
            window.dispatchEvent(new CustomEvent('okcvm:update-available', { 
                detail: info 
            }));
        });

        ipcRenderer.on('update-downloaded', (event, info) => {
            window.dispatchEvent(new CustomEvent('okcvm:update-downloaded', { 
                detail: info 
            }));
        });

        // 监听通知
        ipcRenderer.on('notification', (event, { title, body }) => {
            if (Notification.permission === 'granted') {
                new Notification(title, { body });
            }
        });

    } catch (error) {
        console.error('[Preload] Initialization failed:', error);
    }
});

// 全局辅助函数
contextBridge.exposeInMainWorld('OKCVM', {
    isDesktop: () => true,
    getBackendUrl: () => window.__OKCVM_CONFIG__?.backendUrl || '',
    getVersion: () => window.__OKCVM_CONFIG__?.version || 'unknown',
    getPlatform: () => window.__OKCVM_CONFIG__?.platform || 'unknown',
});
