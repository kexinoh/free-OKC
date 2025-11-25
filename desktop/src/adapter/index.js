/**
 * OKCVM Desktop Adapter
 * 
 * 提供桌面端特有功能的适配层，使现有 Web 前端能够无缝运行在 Tauri 环境中。
 */

import NativeBridge from './native-bridge.js';
import FileSystem from './file-system.js';
import Notifications from './notifications.js';
import Shortcuts from './shortcuts.js';
import Theme from './theme.js';
import Updater from './updater.js';

/**
 * 初始化桌面适配层
 */
export async function initDesktopAdapter() {
    if (!NativeBridge.isDesktop()) {
        console.log('[OKCVM] Running in web mode');
        return;
    }

    console.log('[OKCVM] Initializing desktop adapter...');

    try {
        // 等待后端就绪
        const backendUrl = await NativeBridge.getBackendUrl();
        console.log('[OKCVM] Backend URL:', backendUrl);

        // 初始化主题同步
        await Theme.init();

        // 初始化快捷键
        await Shortcuts.init();

        // 请求通知权限
        await Notifications.requestPermission();

        // 检查更新
        if (await Updater.shouldCheckUpdate()) {
            Updater.checkForUpdates();
        }

        // 设置全局配置
        window.__OKCVM_CONFIG__ = {
            isDesktop: true,
            backendUrl,
            version: await NativeBridge.invoke('get_app_version'),
        };

        console.log('[OKCVM] Desktop adapter initialized', window.__OKCVM_CONFIG__);
    } catch (error) {
        console.error('[OKCVM] Failed to initialize desktop adapter:', error);
    }
}

// 导出所有模块
export {
    NativeBridge,
    FileSystem,
    Notifications,
    Shortcuts,
    Theme,
    Updater,
};

// 自动初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDesktopAdapter);
} else {
    initDesktopAdapter();
}

// 导出为全局对象
window.OKCVM = {
    NativeBridge,
    FileSystem,
    Notifications,
    Shortcuts,
    Theme,
    Updater,
    isDesktop: NativeBridge.isDesktop,
};

export default {
    NativeBridge,
    FileSystem,
    Notifications,
    Shortcuts,
    Theme,
    Updater,
    initDesktopAdapter,
};
