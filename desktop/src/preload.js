/**
 * Frontend Preload Script
 * 
 * 在前端加载前执行，设置全局配置和初始化桌面适配层。
 * 这个脚本应该在 index.html 中最先加载。
 * 
 * 注意：这是给 Web 前端使用的预加载脚本，不是 Electron preload。
 * Electron 的 preload 脚本在 main/preload.js。
 */

(async function preload() {
    'use strict';
    
    // 检测 Electron 环境
    const isElectron = typeof window !== 'undefined' && !!window.__ELECTRON__;
    
    console.log('[Preload] Starting...', { isElectron });
    
    if (isElectron) {
        await initDesktopMode();
    } else {
        initWebMode();
    }
    
    console.log('[Preload] Complete');
})();

/**
 * 初始化桌面模式
 */
async function initDesktopMode() {
    console.log('[Preload] Initializing desktop mode...');
    
    try {
        // 等待 electronAPI 可用
        if (!window.electronAPI) {
            console.warn('[Preload] electronAPI not available yet');
            return;
        }
        
        // 获取后端 URL
        let backendUrl = '';
        try {
            backendUrl = await window.electronAPI.invoke('get-backend-url');
            console.log('[Preload] Backend URL:', backendUrl);
        } catch (error) {
            console.warn('[Preload] Backend not ready yet:', error.message);
            
            // 监听后端就绪事件
            await new Promise((resolve) => {
                const unlisten = window.electronAPI.on('backend-ready', (port) => {
                    backendUrl = `http://127.0.0.1:${port}`;
                    console.log('[Preload] Backend ready:', backendUrl);
                    unlisten();
                    resolve();
                });
                
                // 超时后继续
                setTimeout(resolve, 10000);
            });
        }
        
        // 获取应用版本
        let version = '0.0.0';
        try {
            version = await window.electronAPI.invoke('get-app-version');
        } catch {}
        
        // 获取系统主题
        let theme = 'light';
        try {
            theme = await window.electronAPI.invoke('get-system-theme');
        } catch {}
        
        // 设置全局配置
        window.__OKCVM_CONFIG__ = {
            isDesktop: true,
            backendUrl,
            version,
            platform: window.electronAPI.platform,
            theme,
        };
        
        console.log('[Preload] Desktop mode initialized', window.__OKCVM_CONFIG__);
        
    } catch (error) {
        console.error('[Preload] Failed to initialize desktop mode:', error);
        // 回退到 Web 模式
        initWebMode();
    }
}

/**
 * 初始化 Web 模式
 */
function initWebMode() {
    console.log('[Preload] Initializing web mode...');
    
    window.__OKCVM_CONFIG__ = {
        isDesktop: false,
        backendUrl: '',
        version: 'web',
        platform: 'web',
    };
    
    console.log('[Preload] Web mode initialized', window.__OKCVM_CONFIG__);
}

/**
 * 获取当前平台
 */
function getPlatform() {
    const userAgent = navigator.userAgent.toLowerCase();
    
    if (userAgent.includes('mac')) return 'macos';
    if (userAgent.includes('win')) return 'windows';
    if (userAgent.includes('linux')) return 'linux';
    
    return 'unknown';
}

/**
 * 全局辅助函数（兼容层）
 */
window.OKCVM = window.OKCVM || {};

window.OKCVM.isDesktop = function() {
    return window.__OKCVM_CONFIG__?.isDesktop ?? false;
};

window.OKCVM.getBackendUrl = function() {
    return window.__OKCVM_CONFIG__?.backendUrl ?? '';
};

window.OKCVM.getVersion = function() {
    return window.__OKCVM_CONFIG__?.version ?? 'unknown';
};
