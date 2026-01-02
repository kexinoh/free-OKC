# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['D:\\pycharm\\free-OKC\\src\\okcvm\\server.py'],
    pathex=['D:\\pycharm\\free-OKC\\src'],
    binaries=[],
    datas=[('D:\\pycharm\\free-OKC\\spec', 'spec'), ('D:\\pycharm\\free-OKC\\frontend', 'frontend')],
    hiddenimports=['okcvm', 'okcvm.api', 'okcvm.api.main', 'okcvm.api.models', 'okcvm.tools', 'okcvm.tools.shell', 'okcvm.tools.files', 'okcvm.tools.browser', 'okcvm.tools.deployment', 'okcvm.tools.slides', 'okcvm.tools.search', 'okcvm.tools.media', 'okcvm.tools.todo', 'okcvm.tools.ipython', 'okcvm.tools.data_sources', 'okcvm.storage', 'okcvm.storage.conversations', 'uvicorn.logging', 'uvicorn.protocols.http', 'uvicorn.protocols.http.auto', 'uvicorn.protocols.http.h11_impl', 'uvicorn.protocols.http.httptools_impl', 'uvicorn.protocols.websockets', 'uvicorn.protocols.websockets.auto', 'uvicorn.protocols.websockets.websockets_impl', 'uvicorn.protocols.websockets.wsproto_impl', 'uvicorn.lifespan', 'uvicorn.lifespan.on', 'uvicorn.lifespan.off', 'sqlalchemy.dialects.sqlite', 'langchain', 'langchain_openai', 'langchain_core', 'engineio.async_drivers.threading', 'httptools', 'websockets', 'watchfiles', 'httpx', 'anyio', 'yaml', 'dotenv', 'multipart', 'python_multipart'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=['D:\\pycharm\\free-OKC\\desktop\\backend-bundle\\runtime-hooks\\pyi_rth_okcvm.py'],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
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
