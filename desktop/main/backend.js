/**
 * Backend Manager - Python 后端进程管理
 */

const { spawn } = require('child_process');
const path = require('path');
const { app } = require('electron');
const EventEmitter = require('events');
const http = require('http');
const net = require('net');

class BackendManager extends EventEmitter {
    constructor(options = {}) {
        super();
        this.process = null;
        this.port = null;
        this.status = 'stopped';
        this.isDev = options.isDev || false;
        this.dataDir = options.dataDir || app.getPath('userData');
        this.startupTimeout = options.startupTimeout || 30000;
        this.healthCheckInterval = options.healthCheckInterval || 5000;
        this.healthCheckTimer = null;
    }

    /**
     * 查找可用端口
     */
    async findAvailablePort(startPort = 8000, endPort = 9000) {
        for (let port = startPort; port <= endPort; port++) {
            const available = await this.isPortAvailable(port);
            if (available) {
                return port;
            }
        }
        throw new Error('No available port found');
    }

    /**
     * 检查端口是否可用
     */
    isPortAvailable(port) {
        return new Promise((resolve) => {
            const server = net.createServer();
            server.once('error', () => resolve(false));
            server.once('listening', () => {
                server.close();
                resolve(true);
            });
            server.listen(port, '127.0.0.1');
        });
    }

    /**
     * 获取后端可执行文件路径
     */
    getBackendPath() {
        if (this.isDev) {
            // 开发模式：使用 Python 直接运行
            return null; // 返回 null 表示使用 Python 脚本
        }

        // 生产模式：使用打包的可执行文件
        const platform = process.platform;
        const ext = platform === 'win32' ? '.exe' : '';
        const binaryName = `okcvm-server${ext}`;

        if (app.isPackaged) {
            return path.join(process.resourcesPath, 'backend', binaryName);
        }

        // 开发模式下的打包文件位置
        return path.join(__dirname, '..', 'backend-bundle', 'dist', binaryName);
    }

    /**
     * 启动后端服务
     */
    async start() {
        if (this.status === 'running') {
            console.log('Backend already running');
            return this.port;
        }

        this.status = 'starting';
        this.emit('starting');

        try {
            // 查找可用端口
            this.port = await this.findAvailablePort();
            console.log(`Starting backend on port ${this.port}`);

            // 启动进程
            const backendPath = this.getBackendPath();
            const args = [
                '--host', '127.0.0.1',
                '--port', this.port.toString(),
                '--data-dir', this.dataDir,
            ];

            if (this.isDev || !backendPath) {
                // 开发模式：使用 Python 运行
                const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
                const mainPy = path.join(__dirname, '..', '..', 'main.py');
                this.process = spawn(pythonPath, [mainPy, ...args], {
                    cwd: path.join(__dirname, '..', '..'),
                    stdio: ['ignore', 'pipe', 'pipe'],
                    env: { ...process.env, PYTHONUNBUFFERED: '1' },
                });
            } else {
                // 生产模式：运行打包的可执行文件
                this.process = spawn(backendPath, args, {
                    stdio: ['ignore', 'pipe', 'pipe'],
                    env: { ...process.env },
                });
            }

            // 处理输出
            this.process.stdout.on('data', (data) => {
                console.log(`[Backend] ${data.toString().trim()}`);
            });

            this.process.stderr.on('data', (data) => {
                console.error(`[Backend Error] ${data.toString().trim()}`);
            });

            // 进程退出处理
            this.process.on('close', (code) => {
                console.log(`Backend process exited with code ${code}`);
                this.status = 'stopped';
                this.process = null;
                this.stopHealthCheck();
                this.emit('stopped', code);
            });

            this.process.on('error', (error) => {
                console.error('Backend process error:', error);
                this.status = 'error';
                this.emit('error', error);
            });

            // 等待后端就绪
            await this.waitForReady();

            this.status = 'running';
            this.startHealthCheck();
            this.emit('ready', this.port);

            return this.port;
        } catch (error) {
            this.status = 'error';
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * 等待后端就绪
     */
    waitForReady() {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const checkInterval = 500;

            const check = async () => {
                if (Date.now() - startTime > this.startupTimeout) {
                    reject(new Error('Backend startup timeout'));
                    return;
                }

                try {
                    const healthy = await this.checkHealth();
                    if (healthy) {
                        resolve();
                        return;
                    }
                } catch (error) {
                    // 忽略连接错误，继续等待
                }

                setTimeout(check, checkInterval);
            };

            check();
        });
    }

    /**
     * 健康检查
     */
    checkHealth() {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: '127.0.0.1',
                port: this.port,
                path: '/api/health',
                method: 'GET',
                timeout: 3000,
            };

            const req = http.request(options, (res) => {
                if (res.statusCode === 200) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Health check timeout'));
            });

            req.end();
        });
    }

    /**
     * 启动健康检查定时器
     */
    startHealthCheck() {
        this.stopHealthCheck();
        
        this.healthCheckTimer = setInterval(async () => {
            try {
                const healthy = await this.checkHealth();
                if (!healthy && this.status === 'running') {
                    console.warn('Backend health check failed');
                    this.emit('unhealthy');
                }
            } catch (error) {
                if (this.status === 'running') {
                    console.error('Backend health check error:', error.message);
                    this.emit('unhealthy');
                }
            }
        }, this.healthCheckInterval);
    }

    /**
     * 停止健康检查定时器
     */
    stopHealthCheck() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
    }

    /**
     * 停止后端服务
     */
    async stop() {
        if (!this.process) {
            return;
        }

        console.log('Stopping backend...');
        this.status = 'stopping';
        this.emit('stopping');
        this.stopHealthCheck();

        return new Promise((resolve) => {
            // 设置超时强制终止
            const timeout = setTimeout(() => {
                console.log('Force killing backend process');
                this.process?.kill('SIGKILL');
            }, 5000);

            this.process.once('close', () => {
                clearTimeout(timeout);
                this.process = null;
                this.status = 'stopped';
                resolve();
            });

            // 发送终止信号
            if (process.platform === 'win32') {
                this.process.kill();
            } else {
                this.process.kill('SIGTERM');
            }
        });
    }

    /**
     * 重启后端服务
     */
    async restart() {
        console.log('Restarting backend...');
        await this.stop();
        
        // 等待一小段时间确保资源释放
        await new Promise((resolve) => setTimeout(resolve, 1000));
        
        return this.start();
    }

    /**
     * 获取后端 URL
     */
    getUrl() {
        if (this.port && this.status === 'running') {
            return `http://127.0.0.1:${this.port}`;
        }
        return null;
    }

    /**
     * 获取后端端口
     */
    getPort() {
        return this.port;
    }

    /**
     * 获取后端状态
     */
    getStatus() {
        return {
            status: this.status,
            port: this.port,
            pid: this.process?.pid || null,
            url: this.getUrl(),
        };
    }
}

module.exports = BackendManager;
