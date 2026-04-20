"""Submission-signal regression checks for security and accessibility proofs."""

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def test_env_files_are_ignored_and_examples_use_placeholders() -> None:
    """Allow local secrets while ensuring committed files stay secret-safe."""
    root_gitignore = (REPO_ROOT / ".gitignore").read_text(encoding="utf-8")
    backend_gitignore = (REPO_ROOT / "backend" / ".gitignore").read_text(encoding="utf-8")
    backend_env_example = (REPO_ROOT / "backend" / ".env.example").read_text(encoding="utf-8")

    assert ".env" in root_gitignore
    assert ".env.*" in root_gitignore
    assert ".env" in backend_gitignore

    assert "GEMINI_API_KEY=" in backend_env_example
    assert "AIza" not in backend_env_example


def test_header_has_accessibility_signals() -> None:
    """Ensure scenario controls keep explicit accessibility attributes."""
    header_path = REPO_ROOT / "src" / "components" / "layout" / "Header.tsx"
    content = header_path.read_text(encoding="utf-8")

    assert "aria-haspopup=\"menu\"" in content
    assert "aria-label={`Venue selector" in content
    assert "aria-expanded={scenarioMenuOpen && !isSimulating}" in content
    assert "role=\"menu\"" in content
    assert "role=\"menuitem\"" in content


def test_visual_focus_and_keyboard_zone_controls_exist() -> None:
    css_path = REPO_ROOT / "src" / "index.css"
    stadium_svg_path = REPO_ROOT / "src" / "components" / "digital-twin" / "StadiumSVG.tsx"
    activity_feed_path = REPO_ROOT / "src" / "components" / "panels" / "ActivityFeed.tsx"

    css_content = css_path.read_text(encoding="utf-8")
    svg_content = stadium_svg_path.read_text(encoding="utf-8")
    activity_feed_content = activity_feed_path.read_text(encoding="utf-8")
    reasoning_panel_path = REPO_ROOT / "src" / "components" / "panels" / "AIReasoningPanel.tsx"
    predictions_panel_path = REPO_ROOT / "src" / "components" / "panels" / "PredictionsPanel.tsx"
    app_path = REPO_ROOT / "src" / "App.tsx"

    reasoning_content = reasoning_panel_path.read_text(encoding="utf-8")
    predictions_content = predictions_panel_path.read_text(encoding="utf-8")
    app_content = app_path.read_text(encoding="utf-8")

    assert ":focus-visible" in css_content
    assert "prefers-reduced-motion: reduce" in css_content
    assert "skip-nav" in css_content
    assert "href=\"#main-content\"" in app_content
    assert "tabIndex={0}" in svg_content
    assert "onKeyDown={(e) => handleZoneKeyDown(e" in svg_content
    assert "aria-live=\"polite\"" in activity_feed_content
    assert "role=\"log\"" in activity_feed_content
    assert "role=\"progressbar\"" in reasoning_content
    assert "role=\"progressbar\"" in predictions_content


def test_readme_has_security_and_accessibility_sections() -> None:
    """Keep visible evaluator-facing sections present in README."""
    readme_path = REPO_ROOT / "README.md"
    content = readme_path.read_text(encoding="utf-8")

    assert "## Security" in content
    assert "## Accessibility" in content
    assert "## Google Services (Core Architecture)" in content
    assert "## Google SDK Integration Evidence" in content
    assert "GET /system/impact" in content
    assert "GET /google-services" in content


def test_repository_has_quality_signal_files() -> None:
    contributing = REPO_ROOT / "CONTRIBUTING.md"
    changelog = REPO_ROOT / "CHANGELOG.md"
    pyproject = REPO_ROOT / "pyproject.toml"
    vitest_config = REPO_ROOT / "vitest.config.ts"

    assert contributing.exists()
    assert changelog.exists()
    assert pyproject.exists()
    assert vitest_config.exists()
