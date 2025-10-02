from okcvm import ToolRegistry


class _StubResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


def test_get_data_source_desc_and_data(monkeypatch):
    registry = ToolRegistry.from_default_spec()

    desc = registry.call("mshtools-get_data_source_desc", data_source="yahoo_finance")
    assert desc.success
    assert "quote" in desc.data["apis"]

    payload = {
        "quoteResponse": {
            "result": [
                {
                    "symbol": "AAPL",
                    "shortName": "Apple Inc.",
                    "currency": "USD",
                    "regularMarketPrice": 100.0,
                    "regularMarketChangePercent": 1.5,
                }
            ]
        }
    }

    def fake_get(*args, **kwargs):
        return _StubResponse(payload)

    monkeypatch.setattr("okcvm.tools.data_sources.requests.get", fake_get)

    data = registry.call(
        "mshtools-get_data_source",
        data_source="yahoo_finance",
        api="quote",
        parameters={"symbol": "AAPL"},
    )
    assert data.success
    assert data.data["symbol"] == "AAPL"
