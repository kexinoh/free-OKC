from pathlib import Path

from okcvm import ToolRegistry


def test_slides_generator_returns_preview(tmp_path):
    registry = ToolRegistry.from_default_spec()
    html = """
    <html>
      <body>
        <section class=\"ppt-slide\">
          <h2>Overview</h2>
          <p>Intro paragraph</p>
          <ul>
            <li>First point</li>
            <li>Second point</li>
          </ul>
        </section>
        <section class=\"ppt-slide\">
          <p>Next steps</p>
          <p>Timeline</p>
        </section>
      </body>
    </html>
    """

    output_path = tmp_path / "deck.pptx"
    result = registry.call(
        "mshtools-slides_generator",
        content=html,
        output_path=str(output_path),
    )

    assert result.success
    data = result.data
    assert data["path"] == str(output_path)
    assert Path(data["path"]).is_file()

    slides = data["slides"]
    assert len(slides) == 2

    assert slides[0] == {
        "title": "Overview",
        "bullets": ["Intro paragraph", "First point", "Second point"],
    }
    assert slides[1] == {
        "title": "Slide 2",
        "bullets": ["Next steps", "Timeline"],
    }
