# main.py (Advanced Application Runner)

import importlib
import sys
from pathlib import Path
from typing import Optional

import typer
from dotenv import load_dotenv
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

# --- Bootstrap & Path Configuration ---
# 确保 'src' 目录在 Python 路径中，这是最先要做的事
try:
    project_root = Path(__file__).resolve().parent
    src_path = project_root / "src"
    sys.path.insert(0, str(src_path))
    from okcvm.config import get_config, load_config_from_yaml, reset_config
    from okcvm.logging_utils import get_logger, setup_logging
    from okcvm.registry import ToolRegistry
except ImportError as e:
    print(f"FATAL: Could not bootstrap the application. Ensure 'src' directory exists and is valid: {e}")
    sys.exit(1)

# --- CLI Application Setup ---
cli = typer.Typer(
    name="OKCVM Runner",
    help=Panel("🚀 OK Computer Virtual Machine - Command-Line Interface 🚀", 
               title="[bold green]Welcome[/bold green]", 
               expand=False)
)
console = Console()
setup_logging()
logger = get_logger(__name__)

# --- Helper Functions ---
def _ensure_dependencies():
    """Checks if essential packages are installed."""
    required = ["fastapi", "uvicorn", "langchain", "typer", "yaml"]
    missing = []
    for package in required:
        try:
            importlib.import_module(package)
        except ImportError:
            missing.append(package)
    if missing:
        console.print(f"[bold red]Error: Missing required packages: {', '.join(missing)}[/bold red]")
        console.print("Please install them using: [cyan]pip install -r requirements.txt[/cyan] (or via pyproject.toml)")
        raise typer.Exit(code=1)

def _load_environment_and_config(config_path: Path) -> None:
    """Load environment variables and apply the layered YAML configuration."""

    dotenv_path = project_root / ".env"
    if dotenv_path.exists():
        load_dotenv(dotenv_path, override=True)
        console.print("[green]✓[/green] Loaded environment variables from [cyan].env[/cyan] file.")

    # Reset runtime config so freshly loaded env vars are taken into account.
    reset_config()

    if not config_path.exists():
        console.print(f"[yellow]Warning: Config file not found at {config_path}. Using environment defaults.[/yellow]")
        return

    console.print(f"🔧 Loading configuration from [cyan]{config_path}[/cyan]...")
    load_config_from_yaml(config_path)
    console.print("[green]✓[/green] Configuration loaded and applied.")

# --- CLI Commands ---

@cli.command()
def run(
    host: str = typer.Option("0.0.0.0", "--host", "-h", help="Server host."),
    port: int = typer.Option(8000, "--port", "-p", help="Server port."),
    config: Path = typer.Option(lambda: project_root / "config.yaml", "--config", "-c", help="Path to config.yaml."),
    reload: bool = typer.Option(False, "--reload", help="Enable auto-reload for development."),
):
    """
    🚀 Starts the OKCVM FastAPI server.
    """
    _ensure_dependencies()
    _load_environment_and_config(config)

    console.print(Panel(f"Starting Uvicorn server at [bold cyan]http://{host}:{port}[/bold cyan]",
                        title="[green]Server Startup[/green]",
                        padding=(1, 2)))
    if reload:
        console.print("[yellow]🔄 Auto-reload enabled.[/yellow]")

    logger.info("Launching server on %s:%s (reload=%s)", host, port, reload)

    # 必须用字符串导入路径，Uvicorn reload 才能工作
    import uvicorn
    uvicorn.run("okcvm.api.main:app", host=host, port=port, reload=reload, log_level="info")

@cli.command(name="config:check")
def check_config(
    config: Path = typer.Option(lambda: project_root / "config.yaml", "--config", "-c", help="Path to config.yaml.")
):
    """
    🔍 Validates and displays the current configuration.
    """
    _load_environment_and_config(config)
    
    cfg = get_config()
    table = Table(title="OKCVM Effective Configuration")
    table.add_column("Endpoint", style="cyan", no_wrap=True)
    table.add_column("Model", style="magenta")
    table.add_column("Base URL", style="green")
    table.add_column("API Key Status", justify="right", style="yellow")

    def key_status(key: Optional[str]) -> str:
        return "[green]Set[/green]" if key else "[red]Not Set[/red]"

    if cfg.chat:
        table.add_row("Chat", cfg.chat.model, cfg.chat.base_url, key_status(cfg.chat.api_key))
    else:
        table.add_row("Chat", "[dim]Not Configured[/dim]", "", "")

    console.print(table)

@cli.command(name="tools:list")
def list_tools():
    """
    🛠️ Lists all registered tools available to the VM.
    """
    console.print(Panel("[bold cyan]Available Tools[/bold cyan]"))
    try:
        registry = ToolRegistry.from_default_spec()
        tools = registry.get_langchain_tools()
        if not tools:
            console.print("[yellow]No tools are registered.[/yellow]")
            return

        for tool in tools:
            console.print(f"  - [bold green]{tool.name}[/bold green]: {tool.description}")

    except Exception as e:
        console.print(f"[bold red]Error loading tools: {e}[/bold red]")


if __name__ == "__main__":
    try:
        cli()
    except typer.Exit:
        # Typer's graceful exit, do nothing
        pass
    except Exception as e:
        console.print(f"\n[bold red]An unexpected error occurred:[/bold red]")
        console.print_exception(show_locals=False)
        logger.exception("Unhandled exception in CLI")
