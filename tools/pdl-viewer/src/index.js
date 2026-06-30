#!/usr/bin/env node

/**
 * PROVIDER Domain Language (PDL) CLI
 *
 * Main entry point for loading and simulating PDL scenarios.
 */

import { loadScenario, getScenarioMetadata } from './adapters/scenarioLoader.js';
import { resolve } from 'path';

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
PROVIDER Domain Language (PDL) CLI

Usage: node src/index.js --scenario <file.pdl.yaml> [options]

Options:
  --scenario, -s <file>    Load a PDL scenario file
  --info                   Show scenario metadata only
  --json                   Output as JSON
  --help, -h               Show this help message

Examples:
  node src/index.js --scenario scenarios/s1-soja.pdl.yaml
  node src/index.js -s scenarios/s1-soja.pdl.yaml --info
  node src/index.js -s scenarios/s1-soja.pdl.yaml --json
`);
  process.exit(0);
}

// Parse arguments
const scenarioIdx = args.findIndex(a => a === '--scenario' || a === '-s');
const scenarioFile = scenarioIdx !== -1 ? args[scenarioIdx + 1] : null;
const infoOnly = args.includes('--info');
const jsonOutput = args.includes('--json');

if (!scenarioFile) {
  console.error('Error: No scenario file specified. Use --scenario <file>');
  process.exit(1);
}

try {
  const resolvedPath = resolve(scenarioFile);

  if (infoOnly) {
    const metadata = getScenarioMetadata(resolvedPath);
    if (jsonOutput) {
      console.log(JSON.stringify(metadata, null, 2));
    } else {
      console.log('Scenario Metadata:');
      console.log(`  ID: ${metadata.id}`);
      console.log(`  Name: ${metadata.name}`);
      console.log(`  Sector: ${metadata.sector}`);
      console.log(`  Criticality: ${metadata.criticality}`);
      console.log(`  Format: ${metadata.format}`);
      if (metadata.pdl_version) {
        console.log(`  PDL Version: ${metadata.pdl_version}`);
      }
      console.log(`  Entities: ${metadata.entityCount}`);
      console.log(`  Events: ${metadata.eventCount}`);
      console.log(`  Substitutions: ${metadata.substitutionCount || 0}`);
      console.log(`  Cascades: ${metadata.cascadeCount}`);
      if (metadata.description) {
        console.log(`  Description: ${metadata.description}`);
      }
    }
  } else {
    const scenario = loadScenario(resolvedPath);

    if (jsonOutput) {
      console.log(JSON.stringify(scenario, null, 2));
    } else {
      console.log(`Loaded scenario: ${scenario.name} (${scenario.id})`);
      console.log(`  Sector: ${scenario.sector}`);
      console.log(`  Criticality: ${scenario.criticality}`);
      console.log(`  Nodes: ${scenario.nodes.length}`);
      console.log(`  Edges: ${scenario.edges.length}`);
      console.log(`  Events: ${scenario.events.length}`);
      console.log(`  Substitutions: ${scenario.substitutions?.length || 0}`);
      console.log(`  Cascades: ${scenario.cascades.length}`);
      console.log('');
      console.log('Scenario ready for simulation.');
    }
  }

} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exit(1);
}
