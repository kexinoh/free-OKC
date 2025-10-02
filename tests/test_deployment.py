from pathlib import Path

from okcvm import ToolRegistry


def test_deploy_website(tmp_path):
    site = tmp_path / "site"
    site.mkdir()
    (site / "index.html").write_text("<html><body><h1>OKCVM</h1></body></html>", encoding="utf-8")
    (site / "styles.css").write_text("body { font-family: sans-serif; }")

    registry = ToolRegistry.from_default_spec()
    result = registry.call("mshtools-deploy_website", directory=str(site), site_name="Demo", force=True)
    assert result.success
    target = Path(result.data["target"])
    assert target.exists()
    manifest = target / "deployment.json"
    assert manifest.exists()
