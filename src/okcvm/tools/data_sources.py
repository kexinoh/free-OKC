"""Data source metadata and retrieval helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Mapping

import requests

from .base import Tool, ToolError, ToolResult


@dataclass
class DataSource:
    name: str
    description: str
    apis: Mapping[str, Mapping[str, str]]

    def serialize(self) -> Dict[str, object]:
        return {
            "name": self.name,
            "description": self.description,
            "apis": {key: dict(value) for key, value in self.apis.items()},
        }


DATA_SOURCES: Dict[str, DataSource] = {
    "yahoo_finance": DataSource(
        name="yahoo_finance",
        description=(
            "Yahoo Finance provides free market data including quotes, company profiles, "
            "and historical information."
        ),
        apis={
            "quote": {
                "description": "Fetch the latest market quote for one or more tickers.",
                "parameters": {
                    "symbol": "Ticker symbol to query (e.g. AAPL)",
                },
            }
        },
    ),
}


class GetDataSourceDescTool(Tool):
    name = "mshtools-get_data_source_desc"

    def call(self, **kwargs) -> ToolResult:  # type: ignore[override]
        source = kwargs.get("data_source") or kwargs.get("name")
        if not source:
            raise ToolError("'data_source' is required")
        data_source = DATA_SOURCES.get(str(source))
        if not data_source:
            raise ToolError(f"Unknown data source '{source}'")
        return ToolResult(success=True, output=f"Found data source {source}", data=data_source.serialize())


class GetDataSourceTool(Tool):
    name = "mshtools-get_data_source"

    def call(self, **kwargs) -> ToolResult:  # type: ignore[override]
        source_name = kwargs.get("data_source") or kwargs.get("name")
        api_name = kwargs.get("api")
        params = kwargs.get("parameters") or {}
        if not source_name:
            raise ToolError("'data_source' is required")
        if not api_name:
            raise ToolError("'api' is required")
        data_source = DATA_SOURCES.get(str(source_name))
        if not data_source:
            raise ToolError(f"Unknown data source '{source_name}'")
        if api_name not in data_source.apis:
            raise ToolError(f"Data source '{source_name}' has no API named '{api_name}'")

        if source_name == "yahoo_finance" and api_name == "quote":
            symbol = params.get("symbol")
            if not symbol:
                raise ToolError("'symbol' parameter is required for the quote API")
            url = "https://query1.finance.yahoo.com/v7/finance/quote"
            response = requests.get(url, params={"symbols": symbol}, timeout=15)
            response.raise_for_status()
            payload = response.json()
            quotes = payload.get("quoteResponse", {}).get("result", [])
            if not quotes:
                raise ToolError(f"No data returned for symbol '{symbol}'")
            quote = quotes[0]
            data = {
                "symbol": quote.get("symbol"),
                "shortName": quote.get("shortName"),
                "currency": quote.get("currency"),
                "regularMarketPrice": quote.get("regularMarketPrice"),
                "regularMarketChangePercent": quote.get("regularMarketChangePercent"),
            }
            return ToolResult(success=True, output=f"Fetched quote for {symbol}", data=data)

        raise ToolError(f"API '{api_name}' is not implemented for data source '{source_name}'")


__all__ = ["GetDataSourceDescTool", "GetDataSourceTool"]

