import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { convertToTurtle, loadYamlFile } from "../tools/pdl-to-rdf.js";
import { detectInputKind, validateDataAgainstShapes } from "../tools/pdl-shacl-validator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const scenarioPath = resolve(__dirname, "../scenarios/s1-soja.pdl.yaml");
const shapesPath = resolve(__dirname, "../shapes/pdl.shacl.ttl");

describe("PDL SHACL Validator", () => {
  it("detects supported input kinds by extension", () => {
    assert.equal(detectInputKind("scenario.yaml"), "pdl-yaml");
    assert.equal(detectInputKind("scenario.yml"), "pdl-yaml");
    assert.equal(detectInputKind("graph.ttl"), "turtle");
    assert.equal(detectInputKind("graph.turtle"), "turtle");
  });

  it("conforms for the bundled soja scenario", async () => {
    const pdl = loadYamlFile(scenarioPath);
    const dataTurtle = convertToTurtle(pdl);
    const shapesTurtle = readFileSync(shapesPath, "utf-8");

    const report = await validateDataAgainstShapes(dataTurtle, shapesTurtle);
    assert.equal(report.conforms, true);
    assert.equal(report.results.length, 0);
  });

  it("reports a violation for invalid criticality value", async () => {
    const pdl = loadYamlFile(scenarioPath);
    const dataTurtle = convertToTurtle(pdl).replace(
      /pdl:criticality pdl:Criticality_[a-z]+/,
      "pdl:criticality pdl:Criticality_extreme"
    );
    const shapesTurtle = readFileSync(shapesPath, "utf-8");

    const report = await validateDataAgainstShapes(dataTurtle, shapesTurtle);
    assert.equal(report.conforms, false);
    assert.ok(report.results.length > 0);
    assert.ok(report.results.some((result) => result.path?.endsWith("#criticality")));
  });
});
