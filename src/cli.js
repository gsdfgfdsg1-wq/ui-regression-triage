#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { buildReport, toMarkdown } from "./triage.js";
import { renderHtml } from "./html.js";

function usage() {
  return `Usage: ui-regression-triage --input diffs.json [options]\n\nOptions:\n  --output <dir>          Report directory (default: triage-report)\n  --threshold <number>    Minimum diff ratio to triage (default: 0.01)\n  --include-low           Include diffs below threshold\n  --fail-on <severity>    Exit 1 at or above: low, medium, high, critical\n  --help                  Show this help`;
}

function parseArgs(argv) {
  const args = { output: "triage-report" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") args.help = true;
    else if (arg === "--include-low") args.includeLow = true;
    else if (["--input", "--output", "--threshold", "--fail-on"].includes(arg)) args[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function shouldFail(report, failOn) {
  if (!failOn) return false;
  const levels = ["low", "medium", "high", "critical"];
  const threshold = levels.indexOf(failOn);
  if (threshold === -1) throw new Error("--fail-on must be low, medium, high, or critical.");
  return report.clusters.some((cluster) => levels.indexOf(cluster.severity) >= threshold);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(usage()); return; }
  if (!args.input) throw new Error("--input is required.\n\n" + usage());
  const raw = JSON.parse(await fs.readFile(args.input, "utf8"));
  const report = buildReport(raw, { threshold: args.threshold, includeLow: args.includeLow });
  await fs.mkdir(args.output, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(args.output, "report.json"), JSON.stringify(report, null, 2) + "\n"),
    fs.writeFile(path.join(args.output, "report.html"), renderHtml(report)),
    fs.writeFile(path.join(args.output, "pr-comment.md"), toMarkdown(report) + "\n")
  ]);
  console.log(`Triaged ${report.summary.triagedDiffs} diff(s) into ${report.summary.clusters} cluster(s).`);
  console.log(`Report: ${path.join(args.output, "report.html")}`);
  if (shouldFail(report, args.failOn)) process.exitCode = 1;
}

main().catch((error) => { console.error(`ui-regression-triage: ${error.message}`); process.exitCode = 2; });
