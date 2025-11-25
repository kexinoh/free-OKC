/**
 * Desktop Adapter Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock window object
const mockWindow = {
    __TAURI__: undefined,
    __OKCVM_CONFIG__: undefined,
};

beforeEach(() => {
    // Reset mocks
    global.window = { ...mockWindow };
    vi.resetModules();
});

describe('NativeBridge', () => {
    describe('isDesktop', () => {
        it('should return false when not in Tauri', async () => {
            global.window.__TAURI__ = undefined;
            const { default: NativeBridge } = await import('../../src/adapter/native-bridge.js');
            expect(NativeBridge.isDesktop()).toBe(false);
        });

        it('should return true when in Tauri', async () => {
            global.window.__TAURI__ = {};
            const { default: NativeBridge } = await import('../../src/adapter/native-bridge.js');
            expect(NativeBridge.isDesktop()).toBe(true);
        });
    });

    describe('invoke', () => {
        it('should throw error when not in Tauri', async () => {
            global.window.__TAURI__ = undefined;
            const { default: NativeBridge } = await import('../../src/adapter/native-bridge.js');
            
            await expect(NativeBridge.invoke('test_command'))
                .rejects.toThrow('Not in Tauri environment');
        });
    });

    describe('getBackendUrl', () => {
        it('should return empty string in web mode', async () => {
            global.window.__TAURI__ = undefined;
            const { default: NativeBridge } = await import('../../src/adapter/native-bridge.js');
            
            const url = await NativeBridge.getBackendUrl();
            expect(url).toBe('');
        });
    });
});

describe('FileSystem', () => {
    describe('selectFiles', () => {
        it('should use HTML input in web mode', async () => {
            global.window.__TAURI__ = undefined;
            
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
    });
});

describe('Theme', () => {
    describe('preference', () => {
        it('should default to system preference', async () => {
            global.window.__TAURI__ = undefined;
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
    });
});

describe('Notifications', () => {
    describe('checkPermission', () => {
        it('should return false when Notification API is not available', async () => {
            global.window.__TAURI__ = undefined;
            global.Notification = undefined;
            
            const { default: Notifications } = await import('../../src/adapter/notifications.js');
            
            const result = await Notifications.checkPermission();
            expect(result).toBe(false);
        });

        it('should return true when permission is granted', async () => {
            global.window.__TAURI__ = undefined;
            global.Notification = {
                permission: 'granted',
            };
            
            const { default: Notifications } = await import('../../src/adapter/notifications.js');
            
            const result = await Notifications.checkPermission();
            expect(result).toBe(true);
        });
    });
});

describe('Shortcuts', () => {
    describe('getShortcutLabel', () => {
        it('should return correct label for toggle-window', async () => {
            global.window.__TAURI__ = undefined;
            global.navigator = { platform: 'MacIntel' };
            global.document = {
                addEventListener: vi.fn(),
            };
            
            const { default: Shortcuts } = await import('../../src/adapter/shortcuts.js');
            
            const label = Shortcuts.getShortcutLabel('toggle-window');
            expect(label).toBe('⌘+Shift+K');
        });

        it('should return Ctrl on non-Mac platforms', async () => {
            global.window.__TAURI__ = undefined;
            global.navigator = { platform: 'Win32' };
            global.document = {
                addEventListener: vi.fn(),
            };
            
            const { default: Shortcuts } = await import('../../src/adapter/shortcuts.js');
            
            const label = Shortcuts.getShortcutLabel('toggle-window');
            expect(label).toBe('Ctrl+Shift+K');
        });
    });
});
