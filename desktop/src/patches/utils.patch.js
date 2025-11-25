/**
 * Utils Patch - 为现有 utils.js 提供桌面模式增强
 * 
 * 这个文件在桌面模式下被加载，覆盖部分 utils.js 的功能以支持原生特性。
 */

import NativeBridge from '../adapter/native-bridge.js';
import FileSystem from '../adapter/file-system.js';

/**
 * 获取基础 URL
 * 覆盖原有的相对路径逻辑，在桌面模式下使用动态后端 URL
 */
export async function getBaseUrl() {
    return await NativeBridge.getBackendUrl();
}

/**
 * 增强的 fetchJson
 * 在桌面模式下自动添加后端 URL 前缀
 */
export async function fetchJsonEnhanced(url, options = {}) {
    let fullUrl = url;
    
    if (NativeBridge.isDesktop() && !url.startsWith('http')) {
        const baseUrl = await getBaseUrl();
        fullUrl = `${baseUrl}${url}`;
    }
    
    const response = await fetch(fullUrl, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });
    
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json();
}

/**
 * 增强的文件上传
 * 在桌面模式下支持原生文件选择器
 */
export async function selectAndUploadFiles(options = {}) {
    const files = await FileSystem.selectFiles(options);
    
    if (files.length === 0) {
        return [];
    }
    
    // 转换为 FormData 格式
    const formData = new FormData();
    files.forEach((file, index) => {
        const blob = new Blob([file.content]);
        formData.append('files', blob, file.name);
    });
    
    // 上传到后端
    const baseUrl = await getBaseUrl();
    const response = await fetch(`${baseUrl}/api/session/files`, {
        method: 'POST',
        body: formData,
    });
    
    if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
    }
    
    return response.json();
}

/**
 * 下载文件（增强版）
 * 在桌面模式下使用原生保存对话框
 */
export async function downloadFile(content, filename) {
    if (NativeBridge.isDesktop()) {
        return await FileSystem.saveFile(content, filename);
    }
    
    // Web 模式：创建下载链接
    const blob = new Blob([content]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    return filename;
}

/**
 * 注入增强函数到全局
 */
export function injectEnhancements() {
    if (typeof window === 'undefined') return;
    
    window.__OKCVM_PATCHES__ = {
        getBaseUrl,
        fetchJsonEnhanced,
        selectAndUploadFiles,
        downloadFile,
    };
    
    console.log('[Patches] Utils enhancements injected');
}

// 自动注入
injectEnhancements();

export default {
    getBaseUrl,
    fetchJsonEnhanced,
    selectAndUploadFiles,
    downloadFile,
    injectEnhancements,
};
