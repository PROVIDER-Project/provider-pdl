import { describe, it } from "node:test";
import assert from "node:assert";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { loadScenario } from "../src/adapters/scenarioLoader.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("Scenario Loader", () => {
  it("loads PDL files with version 1.0", () => {
    const sourcePath = resolve(__dirname, "../scenarios/s1-soja.pdl.yaml");
    const source = parseYaml(readFileSync(sourcePath, "utf-8"));
    source.pdl_version = "1.0";

    const tempDir = mkdtempSync(join(tmpdir(), "pdl-loader-test-"));
    const tempFile = join(tempDir, "scenario-1.0.pdl.yaml");

    try {
      writeFileSync(tempFile, stringifyYaml(source), "utf-8");
      const loaded = loadScenario(tempFile);
      assert.strictEqual(loaded.source, "pdl");
      assert.strictEqual(loaded.pdl_version, "1.0");
      assert.strictEqual(loaded.id, source.scenario.id);
      assert.ok(Array.isArray(loaded.nodes));
      assert.ok(Array.isArray(loaded.edges));
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
