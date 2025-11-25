/**
 * Desktop Adapter Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock window object
const mockWindow = {
    __ELECTRON__: undefined,
    __OKCVM_CONFIG__: undefined,
    electronAPI: undefined,
};

beforeEach(() => {
    // Reset mocks
    global.window = { ...mockWindow };
    vi.resetModules();
});

describe('NativeBridge', () => {
    describe('isDesktop', () => {
        it('should return false when not in Electron', async () => {
            global.window.__ELECTRON__ = undefined;
            const { default: NativeBridge } = await import('../../src/adapter/native-bridge.js');
            expect(NativeBridge.isDesktop()).toBe(false);
        });

        it('should return true when in Electron', async () => {
            global.window.__ELECTRON__ = true;
            const { default: NativeBridge } = await import('../../src/adapter/native-bridge.js');
            expect(NativeBridge.isDesktop()).toBe(true);
        });
    });

    describe('invoke', () => {
        it('should throw error when not in Electron', async () => {
            global.window.__ELECTRON__ = undefined;
            const { default: NativeBridge } = await import('../../src/adapter/native-bridge.js');
            
            await expect(NativeBridge.invoke('test-command'))
                .rejects.toThrow('Not in Electron environment');
        });

        it('should call electronAPI.invoke when in Electron', async () => {
            global.window.__ELECTRON__ = true;
            global.window.electronAPI = {
                invoke: vi.fn().mockResolvedValue('result'),
            };
            
            const { default: NativeBridge } = await import('../../src/adapter/native-bridge.js');
            
            const result = await NativeBridge.invoke('test-command', 'arg1');
            expect(global.window.electronAPI.invoke).toHaveBeenCalledWith('test-command', 'arg1');
            expect(result).toBe('result');
        });
    });

    describe('getBackendUrl', () => {
        it('should return empty string in web mode', async () => {
            global.window.__ELECTRON__ = undefined;
            const { default: NativeBridge } = await import('../../src/adapter/native-bridge.js');
            
            const url = await NativeBridge.getBackendUrl();
            expect(url).toBe('');
        });

        it('should invoke get-backend-url in Electron mode', async () => {
            global.window.__ELECTRON__ = true;
            global.window.electronAPI = {
                invoke: vi.fn().mockResolvedValue('http://127.0.0.1:8000'),
            };
            
            const { default: NativeBridge } = await import('../../src/adapter/native-bridge.js');
            
            const url = await NativeBridge.getBackendUrl();
            expect(url).toBe('http://127.0.0.1:8000');
        });
    });

    describe('listen', () => {
        it('should return empty function in web mode', async () => {
            global.window.__ELECTRON__ = undefined;
            const { default: NativeBridge } = await import('../../src/adapter/native-bridge.js');
            
            const unlisten = NativeBridge.listen('test-event', vi.fn());
            expect(typeof unlisten).toBe('function');
        });

        it('should call electronAPI.on in Electron mode', async () => {
            global.window.__ELECTRON__ = true;
            const mockUnlisten = vi.fn();
            global.window.electronAPI = {
                on: vi.fn().mockReturnValue(mockUnlisten),
            };
            
            const { default: NativeBridge } = await import('../../src/adapter/native-bridge.js');
            const callback = vi.fn();
            
            const unlisten = NativeBridge.listen('test-event', callback);
            expect(global.window.electronAPI.on).toHaveBeenCalledWith('test-event', callback);
            expect(unlisten).toBe(mockUnlisten);
        });
    });
});

describe('FileSystem', () => {
    describe('selectFiles', () => {
        it('should use HTML input in web mode', async () => {
            global.window.__ELECTRON__ = undefined;
            
            // Mock document.createElement
            const mockInput = {
                type: '',
                multiple: false,
                accept: '',
                click: vi.fn(),
                onchange: null,
                oncancel: null,
            };
            
            global.document = {
                createElement: vi.fn(() => mockInput),
            };
            
            const { default: FileSystem } = await import('../../src/adapter/file-system.js');
            
            // Start selection (won't complete without user interaction)
            const promise = FileSystem.selectFiles({ multiple: true });
            
            // Verify input was created correctly
            expect(global.document.createElement).toHaveBeenCalledWith('input');
            expect(mockInput.type).toBe('file');
            expect(mockInput.multiple).toBe(true);
            expect(mockInput.click).toHaveBeenCalled();
            
            // Simulate cancel
            mockInput.oncancel?.();
            const result = await promise;
            expect(result).toEqual([]);
        });

        it('should use native dialog in Electron mode', async () => {
            global.window.__ELECTRON__ = true;
            global.window.electronAPI = {
                invoke: vi.fn()
                    .mockResolvedValueOnce({ canceled: true, filePaths: [] }),
            };
            
            const { default: FileSystem } = await import('../../src/adapter/file-system.js');
            
            const result = await FileSystem.selectFiles();
            expect(result).toEqual([]);
            expect(global.window.electronAPI.invoke).toHaveBeenCalledWith(
                'show-open-dialog',
                expect.any(Object)
            );
        });
    });

    describe('selectDirectory', () => {
        it('should return null in web mode', async () => {
            global.window.__ELECTRON__ = undefined;
            global.console = { warn: vi.fn() };
            
            const { default: FileSystem } = await import('../../src/adapter/file-system.js');
            
            const result = await FileSystem.selectDirectory();
            expect(result).toBe(null);
        });
    });
});

describe('Theme', () => {
    describe('preference', () => {
        it('should default to system preference', async () => {
            global.window.__ELECTRON__ = undefined;
            global.localStorage = {
                getItem: vi.fn(() => null),
                setItem: vi.fn(),
            };
            global.window.matchMedia = vi.fn(() => ({
                matches: false,
                addEventListener: vi.fn(),
            }));
            
            const { default: Theme } = await import('../../src/adapter/theme.js');
            
            expect(Theme.preference).toBe('system');
        });

        it('should load saved preference from localStorage', async () => {
            global.window.__ELECTRON__ = undefined;
            global.localStorage = {
                getItem: vi.fn(() => 'dark'),
                setItem: vi.fn(),
            };
            global.window.matchMedia = vi.fn(() => ({
                matches: false,
                addEventListener: vi.fn(),
            }));
            
            const { default: Theme } = await import('../../src/adapter/theme.js');
            await Theme.init();
            
            expect(Theme.preference).toBe('dark');
        });
    });
});

describe('Notifications', () => {
    describe('checkPermission', () => {
        it('should return false when Notification API is not available', async () => {
            global.window.__ELECTRON__ = undefined;
            global.Notification = undefined;
            
            const { default: Notifications } = await import('../../src/adapter/notifications.js');
            
            const result = await Notifications.checkPermission();
            expect(result).toBe(false);
        });

        it('should return true when permission is granted', async () => {
            global.window.__ELECTRON__ = undefined;
            global.Notification = {
                permission: 'granted',
            };
            
            const { default: Notifications } = await import('../../src/adapter/notifications.js');
            
            const result = await Notifications.checkPermission();
            expect(result).toBe(true);
        });
    });

    describe('requestPermission', () => {
        it('should request browser notification permission', async () => {
            global.window.__ELECTRON__ = undefined;
            global.Notification = {
                permission: 'default',
                requestPermission: vi.fn().mockResolvedValue('granted'),
            };
            
            const { default: Notifications } = await import('../../src/adapter/notifications.js');
            
            const result = await Notifications.requestPermission();
            expect(result).toBe(true);
            expect(global.Notification.requestPermission).toHaveBeenCalled();
        });
    });
});

describe('Shortcuts', () => {
    describe('getShortcutLabel', () => {
        it('should return correct label for toggle-window on Mac', async () => {
            global.window.__ELECTRON__ = undefined;
            global.navigator = { platform: 'MacIntel' };
            global.document = {
                addEventListener: vi.fn(),
            };
            
            const { default: Shortcuts } = await import('../../src/adapter/shortcuts.js');
            
            const label = Shortcuts.getShortcutLabel('toggle-window');
            expect(label).toBe('⌘+Shift+K');
        });

        it('should return Ctrl on Windows platforms', async () => {
            global.window.__ELECTRON__ = undefined;
            global.navigator = { platform: 'Win32' };
            global.document = {
                addEventListener: vi.fn(),
            };
            
            const { default: Shortcuts } = await import('../../src/adapter/shortcuts.js');
            
            const label = Shortcuts.getShortcutLabel('toggle-window');
            expect(label).toBe('Ctrl+Shift+K');
        });
    });

    describe('on', () => {
        it('should register and trigger listeners', async () => {
            global.window.__ELECTRON__ = undefined;
            global.navigator = { platform: 'Win32' };
            global.document = {
                addEventListener: vi.fn(),
            };
            global.window.addEventListener = vi.fn();
            
            const { default: Shortcuts } = await import('../../src/adapter/shortcuts.js');
            
            const callback = vi.fn();
            const unlisten = Shortcuts.on('new-chat', callback);
            
            // Manually trigger the event
            Shortcuts._emit('new-chat');
            
            expect(callback).toHaveBeenCalled();
            
            // Test unsubscribe
            unlisten();
            Shortcuts._emit('new-chat');
            expect(callback).toHaveBeenCalledTimes(1);
        });
    });
});

describe('Updater', () => {
    describe('shouldCheckUpdate', () => {
        it('should return false in web mode', async () => {
            global.window.__ELECTRON__ = undefined;
            
            const { default: Updater } = await import('../../src/adapter/updater.js');
            
            const result = await Updater.shouldCheckUpdate();
            expect(result).toBe(false);
        });

        it('should return true when last check was long ago', async () => {
            global.window.__ELECTRON__ = true;
            global.localStorage = {
                getItem: vi.fn(() => '0'),
                setItem: vi.fn(),
            };
            
            const { default: Updater } = await import('../../src/adapter/updater.js');
            
            const result = await Updater.shouldCheckUpdate();
            expect(result).toBe(true);
        });
    });

    describe('getCurrentVersion', () => {
        it('should return "web" in web mode', async () => {
            global.window.__ELECTRON__ = undefined;
            
            const { default: Updater } = await import('../../src/adapter/updater.js');
            
            const version = await Updater.getCurrentVersion();
            expect(version).toBe('web');
        });

        it('should invoke get-app-version in Electron mode', async () => {
            global.window.__ELECTRON__ = true;
            global.window.electronAPI = {
                invoke: vi.fn().mockResolvedValue('1.0.0'),
            };
            
            const { default: Updater } = await import('../../src/adapter/updater.js');
            
            const version = await Updater.getCurrentVersion();
            expect(version).toBe('1.0.0');
        });
    });
});
