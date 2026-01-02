/**
 * Logger Module - 日志写入文件
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class Logger {
    constructor() {
        this.logDir = null;
        this.logFile = null;
        this.stream = null;
        this.initialized = false;
    }

    /**
     * 初始化日志系统
     */
    init() {
        if (this.initialized) return;

        try {
            // 日志目录: %APPDATA%/OKCVM/logs/
            this.logDir = path.join(app.getPath('userData'), 'logs');
            
            // 确保目录存在
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true });
            }

            // 创建日志文件名 (包含日期)
            const date = new Date().toISOString().split('T')[0];
            this.logFile = path.join(this.logDir, `okcvm-${date}.log`);

            // 创建写入流
            this.stream = fs.createWriteStream(this.logFile, { flags: 'a' });
            this.initialized = true;

            this.info('='.repeat(60));
            this.info(`OKCVM Desktop Starting - ${new Date().toISOString()}`);
            this.info(`App Version: ${app.getVersion()}`);
            this.info(`Electron: ${process.versions.electron}`);
            this.info(`Platform: ${process.platform} ${process.arch}`);
            this.info(`User Data: ${app.getPath('userData')}`);
            this.info(`Is Packaged: ${app.isPackaged}`);
            this.info('='.repeat(60));
        } catch (error) {
            console.error('Failed to initialize logger:', error);
        }
    }

    /**
     * 格式化日志消息
     */
    format(level, message) {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    }

    /**
     * 写入日志
     */
    write(level, message) {
        const formatted = this.format(level, message);
        
        // 输出到控制台
        console.log(formatted);
        
        // 写入文件
        if (this.stream) {
            this.stream.write(formatted + '\n');
        }
    }

    /**
     * 信息日志
     */
    info(message) {
        this.write('info', message);
    }

    /**
     * 警告日志
     */
    warn(message) {
        this.write('warn', message);
    }

    /**
     * 错误日志
     */
    error(message) {
        this.write('error', message);
    }

    /**
     * 调试日志
     */
    debug(message) {
        this.write('debug', message);
    }

    /**
     * 获取日志目录
     */
    getLogDir() {
        return this.logDir;
    }

    /**
     * 获取当前日志文件路径
     */
    getLogFile() {
        return this.logFile;
    }

    /**
     * 关闭日志流
     */
    close() {
        if (this.stream) {
            this.stream.end();
            this.stream = null;
        }
    }
}

// 单例模式
const logger = new Logger();

module.exports = logger;
