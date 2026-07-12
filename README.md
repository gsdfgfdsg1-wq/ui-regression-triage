# ui-regression-triage

Turn noisy Playwright, Cypress, or Storybook visual-regression output into grouped review work. `ui-regression-triage` reads a portable JSON manifest, clusters matching failures by page, component, and region, then writes a static HTML report, JSON artifact, and GitHub-ready Markdown summary.

## Why

Screenshot diffs often arrive as dozens of browser-specific failures with little context. This CLI reduces review noise by grouping related captures, applying a diff-ratio threshold, preserving selectors and image paths, and calling out whether DOM structure changed.

## Quick start

Requires Node.js 20 or later.

```bash
npx ui-regression-triage \
  --input examples/diffs.json \
  --output triage-report \
  --threshold 0.01 \
  --fail-on high
```

Open `triage-report/report.html` locally and publish `triage-report/pr-comment.md` as a pull request comment. The command exits with code `1` when a cluster meets or exceeds `--fail-on`, making it suitable for CI.

## Input manifest

```json
{
  "source": "playwright",
  "threshold": 0.01,
  "diffs": [
    {
      "id": "pricing-chromium",
      "page": "/pricing",
      "component": "PlanCard",
      "region": "card",
      "selector": "[data-testid=plan-card]",
      "diffRatio": 0.032,
      "baseline": "artifacts/pricing-baseline.png",
      "actual": "artifacts/pricing-actual.png",
      "diff": "artifacts/pricing-diff.png",
      "domChanged": true,
      "domSummary": "PlanCard gained a CTA wrapper."
    }
  ]
}
```

Required fields are `page` and `component`. `diffRatio` defaults to `0`. Image paths are optional and remain relative to the generated HTML report, so artifact folders can be uploaded together.

## Output

- `report.html`: standalone, accessible review report with expandable capture details.
- `report.json`: normalized clusters for dashboards or automated follow-up.
- `pr-comment.md`: concise Markdown table for GitHub or GitLab pull requests.

## CLI options

```text
--input <file>          JSON manifest to triage (required)
--output <dir>          Report directory, default: triage-report
--threshold <number>    Minimum diff ratio to triage, default: 0.01
--include-low           Keep diffs below the threshold in the report
--fail-on <severity>    Exit 1 at low, medium, high, or critical
```

Severity is relative to the threshold: `medium >= 1x`, `high >= 2x`, and `critical >= 5x`.

## CI example

```yaml
- name: Triage visual diffs
  run: |
    npx ui-regression-triage \
      --input artifacts/visual-diffs.json \
      --output artifacts/triage \
      --fail-on high
```

## Development

```bash
npm test
node src/cli.js --input examples/diffs.json --output /tmp/triage-report
```

This project uses no runtime dependencies. It is intentionally adapter-neutral: export your Playwright, Cypress, or Storybook results to the manifest format above rather than coupling the review layer to one test runner.

## Security and privacy

The tool reads only the supplied manifest and writes local report files. Do not include credentials or production PII in DOM summaries, selectors, or image artifacts.

## License

MIT
