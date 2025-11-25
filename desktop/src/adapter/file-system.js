/**
 * File System - 文件系统操作适配器
 * 
 * 在桌面模式下使用原生文件对话框，Web 模式下使用 HTML input。
 */

import NativeBridge from './native-bridge.js';

/**
 * 文件类型过滤器预设
 */
export const FileFilters = {
    all: [{ name: 'All Files', extensions: ['*'] }],
    documents: [
        { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf'] },
        { name: 'All Files', extensions: ['*'] },
    ],
    images: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] },
        { name: 'All Files', extensions: ['*'] },
    ],
    code: [
        { name: 'Code Files', extensions: ['js', 'ts', 'py', 'java', 'cpp', 'c', 'h', 'rs', 'go'] },
        { name: 'All Files', extensions: ['*'] },
    ],
    data: [
        { name: 'Data Files', extensions: ['json', 'yaml', 'yml', 'xml', 'csv', 'toml'] },
        { name: 'All Files', extensions: ['*'] },
    ],
};

/**
 * File System API
 */
const FileSystem = {
    /**
     * 选择文件（桌面模式使用原生对话框）
     * @param {object} options - 选项
     * @param {boolean} options.multiple - 是否允许多选
     * @param {Array} options.filters - 文件类型过滤器
     * @param {string} options.accept - Web 模式的 accept 属性
     * @returns {Promise<Array<{name: string, path: string, content: Uint8Array, size: number}>>}
     */
    async selectFiles(options = {}) {
        const { multiple = true, filters = FileFilters.all, accept = '*' } = options;

        if (NativeBridge.isDesktop()) {
            return await this._selectFilesNative(multiple, filters);
        }
        return await this._selectFilesWeb(multiple, accept);
    },

    /**
     * 原生文件选择
     */
    async _selectFilesNative(multiple, filters) {
        try {
            const { open } = await import('@tauri-apps/api/dialog');
            const selected = await open({
                multiple,
                filters,
                directory: false,
            });

            if (!selected) return [];

            const paths = Array.isArray(selected) ? selected : [selected];

            // 读取文件内容
            const files = await Promise.all(
                paths.map(async (path) => {
                    const content = await NativeBridge.invoke('read_local_file', { path });
                    const name = path.split(/[/\\]/).pop();
                    return {
                        name,
                        path,
                        content: new Uint8Array(content),
                        size: content.length,
                    };
                })
            );

            return files;
        } catch (error) {
            console.error('[FileSystem] Native file selection failed:', error);
            throw error;
        }
    },

    /**
     * Web 文件选择
     */
    async _selectFilesWeb(multiple, accept) {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = multiple;
            input.accept = accept;

            input.onchange = async () => {
                const files = Array.from(input.files || []);
                const results = await Promise.all(
                    files.map(async (file) => {
                        const content = await file.arrayBuffer();
                        return {
                            name: file.name,
                            path: file.name, // Web 模式没有真实路径
                            content: new Uint8Array(content),
                            size: file.size,
                        };
                    })
                );
                resolve(results);
            };

            input.oncancel = () => resolve([]);
            input.click();
        });
    },

    /**
     * 选择目录
     * @returns {Promise<string|null>}
     */
    async selectDirectory() {
        if (!NativeBridge.isDesktop()) {
            console.warn('[FileSystem] Directory selection not supported in web mode');
            return null;
        }

        const { open } = await import('@tauri-apps/api/dialog');
        const selected = await open({
            directory: true,
            multiple: false,
        });

        return selected || null;
    },

    /**
     * 保存文件
     * @param {Uint8Array|string} content - 文件内容
     * @param {string} defaultName - 默认文件名
     * @param {Array} filters - 文件类型过滤器
     * @returns {Promise<string|null>} 保存的路径
     */
    async saveFile(content, defaultName, filters = FileFilters.all) {
        if (NativeBridge.isDesktop()) {
            return await this._saveFileNative(content, defaultName, filters);
        }
        return await this._saveFileWeb(content, defaultName);
    },

    /**
     * 原生保存文件
     */
    async _saveFileNative(content, defaultName, filters) {
        try {
            const { save } = await import('@tauri-apps/api/dialog');
            const path = await save({
                defaultPath: defaultName,
                filters,
            });

            if (!path) return null;

            // 转换内容为字节数组
            const data = typeof content === 'string' 
                ? new TextEncoder().encode(content) 
                : content;

            await NativeBridge.invoke('write_local_file', {
                path,
                data: Array.from(data),
            });

            return path;
        } catch (error) {
            console.error('[FileSystem] Native file save failed:', error);
            throw error;
        }
    },

    /**
     * Web 保存文件（下载）
     */
    async _saveFileWeb(content, defaultName) {
        const blob = typeof content === 'string' 
            ? new Blob([content], { type: 'text/plain' }) 
            : new Blob([content]);

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        return defaultName;
    },

    /**
     * 读取本地文件
     * @param {string} path - 文件路径
     * @returns {Promise<Uint8Array>}
     */
    async readFile(path) {
        if (!NativeBridge.isDesktop()) {
            throw new Error('Cannot read local files in web mode');
        }

        const content = await NativeBridge.invoke('read_local_file', { path });
        return new Uint8Array(content);
    },

    /**
     * 写入本地文件
     * @param {string} path - 文件路径
     * @param {Uint8Array|string} content - 文件内容
     * @returns {Promise<boolean>}
     */
    async writeFile(path, content) {
        if (!NativeBridge.isDesktop()) {
            throw new Error('Cannot write local files in web mode');
        }

        const data = typeof content === 'string' 
            ? new TextEncoder().encode(content) 
            : content;

        return await NativeBridge.invoke('write_local_file', {
            path,
            data: Array.from(data),
        });
    },

    /**
     * 获取文件信息
     * @param {string} path - 文件路径
     * @returns {Promise<object>}
     */
    async getFileInfo(path) {
        if (!NativeBridge.isDesktop()) {
            throw new Error('Cannot get file info in web mode');
        }

        return await NativeBridge.invoke('get_file_info', { path });
    },

    /**
     * 设置拖放处理
     * @param {HTMLElement} element - 目标元素
     * @param {function} onDrop - 拖放回调
     * @returns {function} 清理函数
     */
    setupDragDrop(element, onDrop) {
        const handleDragOver = (e) => {
            e.preventDefault();
            e.stopPropagation();
            element.classList.add('drag-over');
        };

        const handleDragLeave = (e) => {
            e.preventDefault();
            e.stopPropagation();
            element.classList.remove('drag-over');
        };

        const handleDrop = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            element.classList.remove('drag-over');

            const files = Array.from(e.dataTransfer?.files || []);
            const results = await Promise.all(
                files.map(async (file) => ({
                    name: file.name,
                    path: file.name,
                    content: new Uint8Array(await file.arrayBuffer()),
                    size: file.size,
                }))
            );

            onDrop(results);
        };

        element.addEventListener('dragover', handleDragOver);
        element.addEventListener('dragleave', handleDragLeave);
        element.addEventListener('drop', handleDrop);

        // Tauri 原生拖放
        let unlistenTauri = null;
        if (NativeBridge.isDesktop()) {
            NativeBridge.listen('tauri://file-drop', async (paths) => {
                if (!Array.isArray(paths)) return;

                const files = await Promise.all(
                    paths.map(async (path) => {
                        const content = await NativeBridge.invoke('read_local_file', { path });
                        return {
                            name: path.split(/[/\\]/).pop(),
                            path,
                            content: new Uint8Array(content),
                            size: content.length,
                        };
                    })
                );

                onDrop(files);
            }).then((unlisten) => {
                unlistenTauri = unlisten;
            });
        }

        // 返回清理函数
        return () => {
            element.removeEventListener('dragover', handleDragOver);
            element.removeEventListener('dragleave', handleDragLeave);
            element.removeEventListener('drop', handleDrop);
            if (unlistenTauri) unlistenTauri();
        };
    },
};

export default FileSystem;
