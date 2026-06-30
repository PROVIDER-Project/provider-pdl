#!/usr/bin/env node

/**
 * PDL SHACL Validator
 * Validates RDF/Turtle (or PDL YAML converted to RDF) against SHACL shapes.
 *
 * Usage:
 *   node tools/pdl-shacl-validator.js <input.{yaml|yml|ttl|turtle}> [--shapes <shapes.ttl>] [--json]
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname, extname } from "path";
import { Readable } from "stream";
import { fileURLToPath } from "url";
import rdf from "@zazuko/env-node";
import { rdfParser } from "rdf-parse";
import SHACLValidator from "rdf-validate-shacl";
import { convertToTurtle, loadYamlFile } from "./pdl-to-rdf.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_SHAPES_PATH = resolve(__dirname, "../shapes/pdl.shacl.ttl");
const SH_NS = "http://www.w3.org/ns/shacl#";
const PDL_NS = "https://provider-project.org/ontology/pdl#";
const DCTERMS_NS = "http://purl.org/dc/terms/";

const colors = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
  bold: "\x1b[1m"
};

function colorize(text, color = "reset") {
  return `${colors[color]}${text}${colors.reset}`;
}

function detectInputKind(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".yaml" || ext === ".yml") return "pdl-yaml";
  if (ext === ".ttl" || ext === ".turtle") return "turtle";
  throw new Error(`Unsupported input type: ${ext || "(no extension)"}. Use .yaml/.yml or .ttl/.turtle`);
}

async function parseTurtleToDataset(turtle, baseIRI = "https://provider-project.org/resource/validation/") {
  const quadStream = rdfParser.parse(Readable.from([turtle]), {
    contentType: "text/turtle",
    baseIRI
  });
  return rdf.dataset().import(quadStream);
}

function normalizeMessage(message) {
  if (!message) return null;
  if (Array.isArray(message)) {
    return message
      .map((part) => part?.value || String(part))
      .filter(Boolean)
      .join(" | ");
  }
  return message.value || String(message);
}

function termValue(term) {
  return term?.value || null;
}

function compactIri(value) {
  if (!value) return value;
  if (value.startsWith(SH_NS)) return `sh:${value.slice(SH_NS.length)}`;
  if (value.startsWith(PDL_NS)) return `pdl:${value.slice(PDL_NS.length)}`;
  if (value.startsWith(DCTERMS_NS)) return `dcterms:${value.slice(DCTERMS_NS.length)}`;
  return value;
}

function normalizeResult(result) {
  return {
    message: normalizeMessage(result.message),
    path: termValue(result.path),
    focusNode: termValue(result.focusNode),
    value: termValue(result.value),
    severity: termValue(result.severity),
    sourceShape: termValue(result.sourceShape),
    sourceConstraintComponent: termValue(result.sourceConstraintComponent)
  };
}

async function validateDataAgainstShapes(dataTurtle, shapesTurtle, options = {}) {
  const { maxErrors } = options;
  const dataDataset = await parseTurtleToDataset(dataTurtle);
  const shapesDataset = await parseTurtleToDataset(shapesTurtle, "https://provider-project.org/shapes/");
  const validator = new SHACLValidator(shapesDataset, {
    factory: rdf,
    maxErrors
  });

  const report = await validator.validate(dataDataset);
  const results = report.results.map(normalizeResult);

  return {
    conforms: report.conforms,
    results
  };
}

function loadInputAsTurtle(inputPath) {
  const kind = detectInputKind(inputPath);
  if (kind === "turtle") {
    return {
      kind,
      turtle: readFileSync(inputPath, "utf-8"),
      stats: {}
    };
  }

  const pdl = loadYamlFile(inputPath);
  const turtle = convertToTurtle(pdl);
  return {
    kind,
    turtle,
    stats: {
      pdl_version: pdl.pdl_version || null,
      scenario: pdl.scenario?.name || pdl.scenario?.id || null
    }
  };
}

async function validateFile(inputPath, options = {}) {
  const { shapesPath = DEFAULT_SHAPES_PATH, verbose = false, maxErrors } = options;
  if (!existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }
  if (!existsSync(shapesPath)) {
    throw new Error(`Shapes file not found: ${shapesPath}`);
  }

  const { kind, turtle, stats } = loadInputAsTurtle(inputPath);
  const shapesTurtle = readFileSync(shapesPath, "utf-8");
  if (verbose) {
    console.log(colorize(`INFO: Input type: ${kind}`, "blue"));
    console.log(colorize(`INFO: Shapes: ${shapesPath}`, "blue"));
  }

  const validation = await validateDataAgainstShapes(turtle, shapesTurtle, { maxErrors });
  return {
    valid: validation.conforms,
    conforms: validation.conforms,
    inputType: kind,
    shapesPath,
    stats,
    results: validation.results
  };
}

function formatReport(validation) {
  console.log(`\n${colorize("=== SHACL Validation Results ===", "bold")}\n`);

  if (validation.stats?.scenario) {
    console.log(`Scenario: ${validation.stats.scenario}`);
  }
  if (validation.stats?.pdl_version) {
    console.log(`PDL Version: ${validation.stats.pdl_version}`);
  }
  console.log(`Input Type: ${validation.inputType}`);
  console.log(`Shapes: ${validation.shapesPath}`);
  console.log("");

  if (validation.conforms) {
    console.log(colorize("SUCCESS: SHACL validation passed (data conforms to all shapes).", "green"));
    return true;
  }

  console.log(colorize(`ERROR: SHACL validation failed with ${validation.results.length} violation(s).`, "red"));
  console.log("");

  validation.results.forEach((result, index) => {
    const severity = compactIri(result.severity) || "sh:Violation";
    const component = compactIri(result.sourceConstraintComponent) || "unknown component";

    console.log(`${index + 1}. [${severity}] ${component}`);
    if (result.focusNode) console.log(`   Focus Node: ${compactIri(result.focusNode)}`);
    if (result.path) console.log(`   Path: ${compactIri(result.path)}`);
    if (result.value) console.log(`   Value: ${compactIri(result.value)}`);
    if (result.message) console.log(`   Message: ${result.message}`);
    if (result.sourceShape) console.log(`   Source Shape: ${compactIri(result.sourceShape)}`);
    console.log("");
  });

  return false;
}

function printHelp() {
  console.log(`
PDL SHACL Validator

Validates RDF data generated from PDL against SHACL constraints.
Input can be a PDL YAML file (.yaml/.yml) or RDF Turtle (.ttl/.turtle).

Usage: node tools/pdl-shacl-validator.js <input-file> [options]

Options:
  --shapes, -s <file>      SHACL shapes file (default: shapes/pdl.shacl.ttl)
  --max-errors <n>         Stop after n validation results
  --verbose, -v            Show validation progress details
  --json                   Output validation report as JSON
  --help, -h               Show this help message

Examples:
  node tools/pdl-shacl-validator.js scenarios/s1-soja.pdl.yaml
  node tools/pdl-shacl-validator.js output.ttl --shapes shapes/pdl.shacl.ttl
  node tools/pdl-shacl-validator.js scenarios/s1-soja.pdl.yaml --json
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const inputPath = resolve(args[0]);
  const verbose = args.includes("--verbose") || args.includes("-v");
  const jsonOutput = args.includes("--json");

  let shapesPath = DEFAULT_SHAPES_PATH;
  let maxErrors;

  const shapesIdx = args.findIndex((arg) => arg === "--shapes" || arg === "-s");
  if (shapesIdx !== -1 && args[shapesIdx + 1]) {
    shapesPath = resolve(args[shapesIdx + 1]);
  }

  const maxErrorsIdx = args.findIndex((arg) => arg === "--max-errors");
  if (maxErrorsIdx !== -1 && args[maxErrorsIdx + 1]) {
    const parsed = Number.parseInt(args[maxErrorsIdx + 1], 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      maxErrors = parsed;
    }
  }

  try {
    const validation = await validateFile(inputPath, { shapesPath, verbose, maxErrors });
    if (jsonOutput) {
      console.log(JSON.stringify(validation, null, 2));
    } else {
      formatReport(validation);
    }
    process.exit(validation.conforms ? 0 : 1);
  } catch (error) {
    console.error(colorize(`ERROR: ${error.message}`, "red"));
    process.exit(1);
  }
}

export {
  DEFAULT_SHAPES_PATH,
  detectInputKind,
  parseTurtleToDataset,
  normalizeResult,
  validateDataAgainstShapes,
  loadInputAsTurtle,
  validateFile,
  formatReport
};

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main();
}
