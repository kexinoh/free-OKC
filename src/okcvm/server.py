"""Server entry point for running the OKCVM application."""

# pragma: no cover - convenience entry point
def main() -> None:
    """Starts the Uvicorn server."""
    import uvicorn
    uvicorn.run("okcvm.api.main:app", host="0.0.0.0", port=8000, reload=False)

if __name__ == "__main__":
    main()
