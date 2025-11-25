# -*- mode: python ; coding: utf-8 -*-
"""
OKCVM Server PyInstaller Spec File

这是一个模板文件，实际构建时由 bundle-backend.py 脚本动态生成。
保留此文件作为参考和手动构建的备选方案。
"""

import sys
from pathlib import Path

# 项目路径
WORKSPACE_ROOT = Path(__file__).parent.parent.parent
SRC_DIR = WORKSPACE_ROOT / 'src'
SPEC_DIR = WORKSPACE_ROOT / 'spec'
FRONTEND_DIR = WORKSPACE_ROOT / 'frontend'

block_cipher = None

# 数据文件
datas = [
    (str(SPEC_DIR), 'spec'),
    (str(FRONTEND_DIR), 'frontend'),
]

# 隐式导入
hiddenimports = [
    'okcvm',
    'okcvm.api',
    'okcvm.api.main',
    'okcvm.api.models',
    'okcvm.config',
    'okcvm.constants',
    'okcvm.llm',
    'okcvm.logging_utils',
    'okcvm.registry',
    'okcvm.server',
    'okcvm.session',
    'okcvm.spec',
    'okcvm.streaming',
    'okcvm.vm',
    'okcvm.workspace',
    'okcvm.tools',
    'okcvm.tools.base',
    'okcvm.tools.browser',
    'okcvm.tools.data_sources',
    'okcvm.tools.deployment',
    'okcvm.tools.files',
    'okcvm.tools.ipython',
    'okcvm.tools.media',
    'okcvm.tools.search',
    'okcvm.tools.shell',
    'okcvm.tools.slides',
    'okcvm.tools.stubs',
    'okcvm.tools.todo',
    'okcvm.storage',
    'okcvm.storage.conversations',
    # FastAPI / Uvicorn
    'uvicorn',
    'uvicorn.main',
    'uvicorn.config',
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'uvicorn.lifespan.off',
    'fastapi',
    'starlette',
    'pydantic',
    # 数据库
    'sqlalchemy',
    'sqlalchemy.dialects.sqlite',
    'pymysql',
    # LangChain
    'langchain',
    'langchain_openai',
    'langchain_core',
    # 其他
    'yaml',
    'dotenv',
    'rich',
    'typer',
    'requests',
    'bs4',
    'PIL',
    'numpy',
    'pptx',
]

a = Analysis(
    [str(SRC_DIR / 'okcvm' / 'server.py')],
    pathex=[str(SRC_DIR)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'matplotlib',
        'scipy',
        'pandas',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='okcvm-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
