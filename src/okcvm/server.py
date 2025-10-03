from pathlib import Path
from typing import Optional

import typer
import uvicorn

from okcvm.config import get_config, load_config_from_yaml

cli = typer.Typer(
    name="OKCVM Server",
    help="🚀 Starts the OK Computer Virtual Machine server.",
    add_completion=False
)

def _get_default_config_path() -> Path:
    """Determines the default config path relative to the project root."""
    # This assumes server.py is at src/okcvm/server.py
    # Project root is 3 levels up.
    project_root = Path(__file__).resolve().parents[2]
    return project_root / "config.yaml"

@cli.command()
def main(
    host: str = typer.Option("127.0.0.1", "--host", "-h", help="The host to bind the server to."),
    port: int = typer.Option(8000, "--port", "-p", help="The port to run the server on."),
    config: Optional[Path] = typer.Option(
        None, # Default to None, so we can calculate it dynamically
        "--config",
        "-c",
        help=f"Path to the YAML configuration file. [default: {_get_default_config_path()}]",
        show_default=False, # We show a custom default message
    ),
    reload: bool = typer.Option(
        False, "--reload", help="Enable auto-reload for development."
    ),
):
    """
    Starts the Uvicorn server for the OKCVM FastAPI application.
    """
    # 如果用户没有提供 --config, 则使用默认路径
    config_path = config if config is not None else _get_default_config_path()

    # 在启动服务器之前加载配置
    load_config_from_yaml(config_path)

    cfg = get_config()
    workspace_cfg = cfg.workspace
    workspace_root = workspace_cfg.resolve_path()

    typer.echo(
        typer.style(
            f"Workspace directory resolved to: {workspace_root}",
            fg=typer.colors.BLUE,
        )
    )
    typer.echo(
        f"Update the workspace settings in {config_path} if this path is incorrect."
    )

    if workspace_cfg.confirm_on_start:
        confirmed = typer.confirm(
            "Proceed with using this workspace directory?", default=False
        )
        if not confirmed:
            typer.echo(
                typer.style(
                    "Server start aborted. Please adjust the workspace path in "
                    f"{config_path} before retrying.",
                    fg=typer.colors.RED,
                )
            )
            raise typer.Exit(code=1)

    workspace_cfg.resolve_and_prepare()

    typer.echo(typer.style(f"Starting server on http://{host}:{port}", fg=typer.colors.GREEN, bold=True))
    typer.echo(f"Using configuration: {config_path}")
    if reload:
        typer.echo(typer.style("Auto-reload is enabled.", fg=typer.colors.YELLOW))

    # 注意这里的 app path 变成了字符串形式，这对 uvicorn 的 reload 功能至关重要
    app_path = "okcvm.api.main:app"
    
    uvicorn.run(
        app_path,
        host=host,
        port=port,
        reload=reload,
    )

if __name__ == "__main__":
    cli()
