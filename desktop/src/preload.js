/**
 * Preload Script
 * 
 * 在前端加载前执行，设置全局配置和初始化桌面适配层。
 * 这个脚本应该在 index.html 中最先加载。
 */

(async function preload() {
    'use strict';
    
    // 检测 Tauri 环境
    const isTauri = typeof window !== 'undefined' && !!window.__TAURI__;
    
    console.log('[Preload] Starting...', { isTauri });
    
    if (isTauri) {
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
        // 动态导入 Tauri API
        const { invoke } = await import('@tauri-apps/api/tauri');
        const { listen } = await import('@tauri-apps/api/event');
        
        // 等待后端就绪
        let backendUrl = '';
        try {
            backendUrl = await invoke('get_backend_url');
            console.log('[Preload] Backend URL:', backendUrl);
        } catch (error) {
            console.warn('[Preload] Backend not ready yet, will retry...');
            
            // 监听后端就绪事件
            await new Promise((resolve) => {
                listen('backend-ready', (event) => {
                    backendUrl = `http://127.0.0.1:${event.payload}`;
                    console.log('[Preload] Backend ready:', backendUrl);
                    resolve();
                });
                
                // 超时后继续
                setTimeout(resolve, 10000);
            });
        }
        
        // 获取应用版本
        let version = '0.0.0';
        try {
            version = await invoke('get_app_version');
        } catch {}
        
        // 设置全局配置
        window.__OKCVM_CONFIG__ = {
            isDesktop: true,
            backendUrl,
            version,
            platform: getPlatform(),
        };
        
        // 监听后端状态变化
        listen('backend-stopped', () => {
            console.warn('[Preload] Backend stopped');
            window.dispatchEvent(new CustomEvent('okcvm:backend-stopped'));
        });
        
        listen('backend-error', (event) => {
            console.error('[Preload] Backend error:', event.payload);
            window.dispatchEvent(new CustomEvent('okcvm:backend-error', { 
                detail: event.payload 
            }));
        });
        
        // 监听托盘菜单事件
        listen('new-chat', () => {
            window.dispatchEvent(new CustomEvent('okcvm:new-chat'));
        });
        
        listen('open-preferences', () => {
            window.dispatchEvent(new CustomEvent('okcvm:open-preferences'));
        });
        
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
 * 全局辅助函数
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
