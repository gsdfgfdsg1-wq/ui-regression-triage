import test from "node:test";
import assert from "node:assert/strict";
import { buildReport, clusterDiffs, severityFor, toMarkdown } from "../src/triage.js";

test("severity respects configured threshold", () => {
  assert.equal(severityFor(0.009, 0.01), "low");
  assert.equal(severityFor(0.01, 0.01), "medium");
  assert.equal(severityFor(0.02, 0.01), "high");
  assert.equal(severityFor(0.05, 0.01), "critical");
});

test("clusters matching page, component and region", () => {
  const clusters = clusterDiffs([
    { page: "/pricing", component: "PlanCard", region: "card", diffRatio: 0.03, selector: ".plan" },
    { page: "/pricing", component: "PlanCard", region: "card", diffRatio: 0.02, domChanged: true },
    { page: "/pricing", component: "Header", region: "nav", diffRatio: 0.011 }
  ], { threshold: 0.01 });
  assert.equal(clusters.length, 2);
  assert.equal(clusters[0].count, 2);
  assert.equal(clusters[0].severity, "high");
  assert.match(clusters[0].likelyCause, /Mixed DOM/);
});

test("report omits low diffs by default and creates markdown", () => {
  const report = buildReport({ source: "playwright", diffs: [
    { page: "/", component: "Hero", diffRatio: 0.001 },
    { page: "/", component: "Hero", diffRatio: 0.03 }
  ] }, { threshold: 0.01 });
  assert.equal(report.summary.totalDiffs, 2);
  assert.equal(report.summary.triagedDiffs, 1);
  assert.equal(report.summary.bySeverity.high, 1);
  assert.match(toMarkdown(report), /\| high \|/);
});

test("invalid entries are rejected", () => {
  assert.throws(() => buildReport({ diffs: [{ page: "/", diffRatio: 0.1 }] }), /page and component/);
});
