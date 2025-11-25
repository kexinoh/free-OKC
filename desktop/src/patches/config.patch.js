/**
 * Config Patch - 为现有 config.js 提供桌面模式增强
 */

import NativeBridge from '../adapter/native-bridge.js';

/**
 * 获取桌面端特定配置
 */
export async function getDesktopConfig() {
    if (!NativeBridge.isDesktop()) {
        return null;
    }
    
    try {
        const config = await NativeBridge.invoke('get_app_config');
        return config;
    } catch (error) {
        console.error('[Config Patch] Failed to get desktop config:', error);
        return null;
    }
}

/**
 * 保存桌面端配置
 */
export async function saveDesktopConfig(config) {
    if (!NativeBridge.isDesktop()) {
        return false;
    }
    
    try {
        await NativeBridge.invoke('set_app_config', { config });
        return true;
    } catch (error) {
        console.error('[Config Patch] Failed to save desktop config:', error);
        return false;
    }
}

/**
 * 获取数据目录
 */
export async function getDataDir() {
    if (!NativeBridge.isDesktop()) {
        return null;
    }
    
    try {
        return await NativeBridge.invoke('get_data_dir');
    } catch (error) {
        console.error('[Config Patch] Failed to get data dir:', error);
        return null;
    }
}

/**
 * 获取应用版本
 */
export async function getAppVersion() {
    if (NativeBridge.isDesktop()) {
        try {
            return await NativeBridge.invoke('get_app_version');
        } catch {
            return 'unknown';
        }
    }
    return 'web';
}

/**
 * 注入到全局
 */
export function injectConfigEnhancements() {
    if (typeof window === 'undefined') return;
    
    window.__OKCVM_CONFIG_PATCHES__ = {
        getDesktopConfig,
        saveDesktopConfig,
        getDataDir,
        getAppVersion,
    };
    
    console.log('[Patches] Config enhancements injected');
}

// 自动注入
injectConfigEnhancements();

export default {
    getDesktopConfig,
    saveDesktopConfig,
    getDataDir,
    getAppVersion,
    injectConfigEnhancements,
};
