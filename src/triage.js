const DEFAULT_THRESHOLD = 0.01;

export function normalizeDiff(raw, index = 0) {
  if (!raw || typeof raw !== "object") throw new TypeError("Each diff entry must be an object.");
  if (!raw.page || !raw.component) throw new TypeError("Each diff entry requires page and component.");
  const ratio = Number(raw.diffRatio ?? raw.diff_ratio ?? 0);
  if (!Number.isFinite(ratio) || ratio < 0) throw new TypeError("diffRatio must be a non-negative number.");
  return {
    id: raw.id ?? `diff-${index + 1}`,
    page: String(raw.page),
    component: String(raw.component),
    diffRatio: ratio,
    region: raw.region ? String(raw.region) : "full-page",
    selector: raw.selector ? String(raw.selector) : null,
    baseline: raw.baseline ? String(raw.baseline) : null,
    actual: raw.actual ? String(raw.actual) : null,
    diff: raw.diff ? String(raw.diff) : null,
    domChanged: Boolean(raw.domChanged ?? raw.dom_changed),
    domSummary: raw.domSummary ?? raw.dom_summary ?? null,
    metadata: raw.metadata && typeof raw.metadata === "object" ? raw.metadata : {}
  };
}

export function severityFor(diffRatio, threshold = DEFAULT_THRESHOLD) {
  if (diffRatio >= threshold * 5) return "critical";
  if (diffRatio >= threshold * 2) return "high";
  if (diffRatio >= threshold) return "medium";
  return "low";
}

export function inferLikelyCause(items) {
  const domChanged = items.filter((item) => item.domChanged).length;
  const regions = new Set(items.map((item) => item.region));
  if (domChanged === items.length) return "DOM structure changed in every affected capture.";
  if (domChanged > 0) return "Mixed DOM and visual changes; inspect selectors before approving a new baseline.";
  if (regions.size === 1 && regions.has("full-page")) return "Likely global styling, font, viewport, or rendering-environment change.";
  return "Likely component-level styling or state change.";
}

export function clusterDiffs(rawDiffs, options = {}) {
  if (!Array.isArray(rawDiffs)) throw new TypeError("Input must contain a diffs array.");
  const threshold = Number(options.threshold ?? DEFAULT_THRESHOLD);
  if (!Number.isFinite(threshold) || threshold < 0) throw new TypeError("threshold must be a non-negative number.");
  const includeLow = Boolean(options.includeLow);
  const clusters = new Map();

  rawDiffs.map(normalizeDiff).forEach((item) => {
    const severity = severityFor(item.diffRatio, threshold);
    if (!includeLow && severity === "low") return;
    const key = `${item.page}::${item.component}::${item.region}`;
    const existing = clusters.get(key) ?? {
      id: key,
      page: item.page,
      component: item.component,
      region: item.region,
      severity,
      maxDiffRatio: item.diffRatio,
      totalDiffRatio: 0,
      count: 0,
      domChangedCount: 0,
      selectors: new Set(),
      items: []
    };
    existing.count += 1;
    existing.totalDiffRatio += item.diffRatio;
    existing.maxDiffRatio = Math.max(existing.maxDiffRatio, item.diffRatio);
    existing.domChangedCount += item.domChanged ? 1 : 0;
    if (item.selector) existing.selectors.add(item.selector);
    existing.items.push({ ...item, severity });
    if (["critical", "high", "medium", "low"].indexOf(severity) < ["critical", "high", "medium", "low"].indexOf(existing.severity)) existing.severity = severity;
    clusters.set(key, existing);
  });

  return [...clusters.values()]
    .map((cluster) => ({
      ...cluster,
      selectors: [...cluster.selectors].sort(),
      averageDiffRatio: cluster.count ? cluster.totalDiffRatio / cluster.count : 0,
      likelyCause: inferLikelyCause(cluster.items)
    }))
    .sort((a, b) => b.maxDiffRatio - a.maxDiffRatio || b.count - a.count);
}

export function buildReport(rawInput, options = {}) {
  const input = Array.isArray(rawInput) ? { diffs: rawInput } : rawInput;
  if (!input || typeof input !== "object") throw new TypeError("Input must be an object or a diffs array.");
  const threshold = Number(options.threshold ?? input.threshold ?? DEFAULT_THRESHOLD);
  const clusters = clusterDiffs(input.diffs ?? [], { threshold, includeLow: options.includeLow });
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  clusters.forEach((cluster) => { counts[cluster.severity] += cluster.count; });
  return {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    threshold,
    source: input.source ?? "unknown",
    summary: {
      totalDiffs: (input.diffs ?? []).length,
      triagedDiffs: clusters.reduce((sum, cluster) => sum + cluster.count, 0),
      clusters: clusters.length,
      bySeverity: counts,
      needsReview: clusters.some((cluster) => ["critical", "high", "medium"].includes(cluster.severity))
    },
    clusters
  };
}

export function toMarkdown(report) {
  const lines = [
    "## Visual regression triage",
    "",
    `- Source: \`${report.source}\``,
    `- Threshold: \`${report.threshold}\``,
    `- ${report.summary.triagedDiffs} triaged diff(s) in ${report.summary.clusters} cluster(s)`,
    "",
    "| Severity | Page | Component | Region | Diffs | Max ratio |",
    "| --- | --- | --- | --- | ---: | ---: |"
  ];
  report.clusters.forEach((cluster) => lines.push(`| ${cluster.severity} | ${cluster.page} | ${cluster.component} | ${cluster.region} | ${cluster.count} | ${cluster.maxDiffRatio.toFixed(4)} |`));
  return lines.join("\n");
}
