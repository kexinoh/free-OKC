"""Static website deployment helpers."""

from __future__ import annotations

import json
import shutil
import time
from pathlib import Path

from .base import Tool, ToolError, ToolResult


DEPLOY_ROOT = Path.cwd() / "deployments"


def _slugify(name: str) -> str:
    cleaned = [char.lower() if char.isalnum() else "-" for char in name]
    slug = "".join(cleaned).strip("-") or "site"
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug


class DeployWebsiteTool(Tool):
    name = "mshtools-deploy_website"

    def call(self, **kwargs) -> ToolResult:  # type: ignore[override]
        directory = kwargs.get("directory") or kwargs.get("path")
        name = kwargs.get("site_name") or kwargs.get("name")
        force = bool(kwargs.get("force", False))
        if not directory:
            raise ToolError("'directory' is required")
        source = Path(directory).expanduser().resolve()
        if not source.is_dir():
            raise ToolError(f"Directory not found: {source}")
        index = source / "index.html"
        if not index.exists():
            raise ToolError("index.html must exist in the specified directory")

        slug = _slugify(name or source.name)
        target = DEPLOY_ROOT / slug
        if target.exists():
            if not force:
                raise ToolError(
                    f"Deployment target {target} already exists. Pass force=True to overwrite."
                )
            shutil.rmtree(target)

        DEPLOY_ROOT.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source, target)

        manifest = {
            "name": name or source.name,
            "slug": slug,
            "timestamp": int(time.time()),
            "source": str(source),
            "target": str(target),
            "preview_url": f"http://localhost:8000/{slug}/index.html",
        }
        (target / "deployment.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

        output = (
            "Deployment complete. Serve the site with `python -m http.server 8000` "
            f"from {DEPLOY_ROOT} and open /{slug}/index.html"
        )
        return ToolResult(success=True, output=output, data=manifest)


__all__ = ["DeployWebsiteTool"]

