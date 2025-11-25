"""
OKCVM PyInstaller Runtime Hook

在应用启动时设置必要的运行环境。
"""

import os
import sys


def _setup_environment():
    """设置运行环境"""
    # 获取打包后的资源目录
    if getattr(sys, 'frozen', False):
        # PyInstaller 打包环境
        bundle_dir = sys._MEIPASS
    else:
        # 开发环境
        bundle_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 设置环境变量
    os.environ['OKCVM_BUNDLE_DIR'] = bundle_dir
    os.environ['OKCVM_SPEC_DIR'] = os.path.join(bundle_dir, 'spec')
    os.environ['OKCVM_FRONTEND_DIR'] = os.path.join(bundle_dir, 'frontend')
    
    # 设置为桌面模式
    os.environ['OKCVM_DESKTOP_MODE'] = '1'
    
    # 确保可以找到模块
    if bundle_dir not in sys.path:
        sys.path.insert(0, bundle_dir)
    
    # 设置默认数据目录（如果未指定）
    if 'OKCVM_DATA_DIR' not in os.environ:
        # 使用平台特定的数据目录
        if sys.platform == 'darwin':
            data_dir = os.path.expanduser('~/Library/Application Support/OKCVM')
        elif sys.platform == 'win32':
            data_dir = os.path.join(os.environ.get('APPDATA', '.'), 'OKCVM')
        else:
            data_dir = os.path.expanduser('~/.local/share/okcvm')
        
        os.environ['OKCVM_DATA_DIR'] = data_dir
        
        # 确保目录存在
        os.makedirs(data_dir, exist_ok=True)


# 在导入时执行
_setup_environment()
