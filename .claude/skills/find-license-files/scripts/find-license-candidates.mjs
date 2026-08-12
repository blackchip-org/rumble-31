#!/usr/bin/env node
// Walks a directory tree and prints JSON-line candidates that look like
// dedicated license files (by filename convention or by license-text
// signature phrases in their content). Deterministic file-finding only —
// naming and curation is left to the caller.
//
// Usage: node find-license-candidates.mjs [rootDir]

import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = process.argv[2] || process.cwd();

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".claude",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".cache",
  ".turbo",
  ".venv",
  "venv",
]);

const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp",
  "woff", "woff2", "ttf", "otf", "eot",
  "mp3", "mp4", "wav", "ogg", "webm",
  "pdf", "zip", "gz", "tar", "wasm", "node",
]);

const FILENAME_PATTERN = /(^|[._-])(license|licence|copying|notice|ofl)([._-]|$)/i;

const CONTENT_SIGNATURES = [
  "permission is hereby granted, free of charge",
  "gnu general public license",
  "gnu lesser general public license",
  "apache license",
  "mozilla public license",
  "sil open font license",
  "redistribution and use in source and binary forms",
  "creative commons",
  "the mit license",
  "bsd 3-clause",
  "bsd 2-clause",
  "unlicense",
];

const MAX_CONTENT_SCAN_BYTES = 200_000;

// Best-effort SPDX-style identifier from license text. Ordered most- to
// least-specific since some licenses' boilerplate overlaps (e.g. OFL and
// MIT both use "Permission is hereby granted, free of charge...").
function detectLicenseType(lower) {
  if (lower.includes("sil open font license")) {
    return lower.includes("version 1.1") ? "OFL-1.1" : "OFL";
  }
  if (lower.includes("gnu affero general public license")) {
    return lower.includes("version 3") ? "AGPL-3.0" : "AGPL";
  }
  if (lower.includes("gnu lesser general public license")) {
    if (lower.includes("version 3")) return "LGPL-3.0";
    if (lower.includes("version 2.1")) return "LGPL-2.1";
    return "LGPL";
  }
  if (lower.includes("gnu general public license")) {
    if (lower.includes("version 3")) return "GPL-3.0";
    if (lower.includes("version 2")) return "GPL-2.0";
    return "GPL";
  }
  if (lower.includes("mozilla public license")) {
    return lower.includes("2.0") ? "MPL-2.0" : "MPL";
  }
  if (lower.includes("apache license")) {
    return lower.includes("version 2.0") ? "Apache-2.0" : "Apache";
  }
  if (lower.includes("bsd 3-clause")) return "BSD-3-Clause";
  if (lower.includes("bsd 2-clause")) return "BSD-2-Clause";
  if (
    lower.includes("the unlicense") ||
    lower.includes("this is free and unencumbered software")
  ) {
    return "Unlicense";
  }
  if (lower.includes("creative commons")) {
    if (lower.includes("cc0")) return "CC0-1.0";
    if (lower.includes("attribution-sharealike")) return "CC-BY-SA-4.0";
    if (lower.includes("attribution 4.0")) return "CC-BY-4.0";
    return "CC";
  }
  if (
    lower.includes("the mit license") ||
    (lower.includes("permission is hereby granted, free of charge") &&
      lower.includes("without restriction"))
  ) {
    return "MIT";
  }
  return null;
}

function extensionOf(name) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function looksBinary(buf) {
  const len = Math.min(buf.length, 8000);
  for (let i = 0; i < len; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

function walk(dir, candidates) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), candidates);
      continue;
    }
    if (!entry.isFile()) continue;

    const fullPath = join(dir, entry.name);
    const ext = extensionOf(entry.name);
    const filenameMatch = FILENAME_PATTERN.test(entry.name);

    if (BINARY_EXTENSIONS.has(ext)) {
      continue;
    }

    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    let matchedBy = null;
    let snippet = "";
    let detectedType = null;

    if (filenameMatch) {
      matchedBy = "filename";
    }

    if (stat.size <= MAX_CONTENT_SCAN_BYTES) {
      let buf;
      try {
        buf = readFileSync(fullPath);
      } catch {
        buf = null;
      }
      if (buf && !looksBinary(buf)) {
        const text = buf.toString("utf8");
        const lower = text.toLowerCase();
        if (!matchedBy) {
          const hit = CONTENT_SIGNATURES.find((sig) => lower.includes(sig));
          if (hit) matchedBy = "content";
        }
        if (matchedBy) {
          snippet = text.slice(0, 300).trim();
          detectedType = detectLicenseType(lower);
        }
      }
    }

    if (matchedBy) {
      candidates.push({
        path: relative(root, fullPath).split(sep).join("/"),
        size: stat.size,
        matchedBy,
        detectedType,
        snippet,
      });
    }
  }
}

const candidates = [];
walk(root, candidates);
candidates.sort((a, b) => a.path.localeCompare(b.path));
process.stdout.write(JSON.stringify(candidates, null, 2) + "\n");
