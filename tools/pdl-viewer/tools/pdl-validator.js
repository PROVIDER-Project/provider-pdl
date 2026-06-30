#!/usr/bin/env node

/**
 * PDL Validator
 * Validates PDL YAML files against the PDL JSON Schema
 *
 * Usage: node pdl-validator.js <pdl-file.yaml> [--verbose]
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Color codes for terminal output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logError(message) {
  log(`ERROR: ${message}`, 'red');
}

function logSuccess(message) {
  log(`SUCCESS: ${message}`, 'green');
}

function loadYamlFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = readFileSync(filePath, 'utf-8');
  try {
    return parseYaml(content);
  } catch (e) {
    throw new Error(`YAML parsing error: ${e.message}`);
  }
}

function loadSchema() {
  const schemaPath = resolve(__dirname, '../schemas/pdl-schema.json');
  if (!existsSync(schemaPath)) {
    throw new Error(`Schema not found: ${schemaPath}`);
  }

  const content = readFileSync(schemaPath, 'utf-8');
  return JSON.parse(content);
}

function extractEventIdsFromTrigger(triggerExpression) {
  if (!triggerExpression || typeof triggerExpression !== 'string') return [];
  const ids = new Set();
  const pattern = /\b([a-z][a-z0-9_]*)\.active\b/g;
  let match = pattern.exec(triggerExpression);
  while (match) {
    ids.add(match[1]);
    match = pattern.exec(triggerExpression);
  }
  return Array.from(ids);
}

function validateEntityReferences(pdl) {
  const errors = [];
  const warnings = [];

  const entityIds = new Set((pdl.entities || []).map((e) => e.id));
  const eventIds = new Set((pdl.events || []).map((e) => e.id));
  const substitutionIds = new Set((pdl.substitutions || []).map((s) => s.id));

  if (pdl.supply_chains) {
    pdl.supply_chains.forEach((chain) => {
      if (chain.stages) {
        chain.stages.forEach((stage, idx) => {
          stage.forEach((entityId) => {
            if (!entityIds.has(entityId)) {
              warnings.push(`Supply chain "${chain.id}" stage ${idx + 1} references unknown entity: "${entityId}"`);
            }
          });
        });
      }

      if (chain.dependencies) {
        chain.dependencies.forEach((dep, idx) => {
          if (!entityIds.has(dep.from)) {
            warnings.push(`Supply chain "${chain.id}" dependency references unknown "from" entity: "${dep.from}"`);
          }
          if (!entityIds.has(dep.to)) {
            warnings.push(`Supply chain "${chain.id}" dependency references unknown "to" entity: "${dep.to}"`);
          }
          if (dep.substitution_ref && !substitutionIds.has(dep.substitution_ref)) {
            warnings.push(`Supply chain "${chain.id}" dependency ${idx + 1} references unknown substitution_ref: "${dep.substitution_ref}"`);
          }
        });
      }
    });
  }

  if (pdl.events) {
    pdl.events.forEach((event) => {
      if (event.trigger && event.trigger.target && !entityIds.has(event.trigger.target)) {
        warnings.push(`Event "${event.id}" trigger references unknown entity: "${event.trigger.target}"`);
      }

      if (event.causes) {
        event.causes.forEach((causeId) => {
          if (!eventIds.has(causeId)) {
            warnings.push(`Event "${event.id}" causes unknown event: "${causeId}"`);
          }
        });
      }

      if (event.substitution_ref && !substitutionIds.has(event.substitution_ref)) {
        warnings.push(`Event "${event.id}" references unknown substitution_ref: "${event.substitution_ref}"`);
      }
    });
  }

  if (pdl.substitutions) {
    pdl.substitutions.forEach((substitution) => {
      if (substitution.from && !entityIds.has(substitution.from)) {
        warnings.push(`Substitution "${substitution.id}" references unknown from entity: "${substitution.from}"`);
      }
      if (substitution.to && !entityIds.has(substitution.to)) {
        warnings.push(`Substitution "${substitution.id}" references unknown to entity: "${substitution.to}"`);
      }

      const triggerEvents = extractEventIdsFromTrigger(substitution.activation?.trigger);
      triggerEvents.forEach((eventId) => {
        if (!eventIds.has(eventId)) {
          warnings.push(`Substitution "${substitution.id}" activation trigger references unknown event: "${eventId}"`);
        }
      });

      (substitution.side_effects || []).forEach((effect, idx) => {
        if (effect.target && !entityIds.has(effect.target)) {
          warnings.push(`Substitution "${substitution.id}" side_effect ${idx + 1} references unknown target entity: "${effect.target}"`);
        }
      });

      (substitution.dependency_overlap || []).forEach((entityId) => {
        if (!entityIds.has(entityId)) {
          warnings.push(`Substitution "${substitution.id}" dependency_overlap references unknown entity: "${entityId}"`);
        }
      });
    });
  }

  if (pdl.cascades) {
    pdl.cascades.forEach((cascade) => {
      if (cascade.origin && !eventIds.has(cascade.origin)) {
        warnings.push(`Cascade "${cascade.id}" references unknown origin event: "${cascade.origin}"`);
      }

      if (cascade.timeline) {
        cascade.timeline.forEach((entry, idx) => {
          if (entry.event && !eventIds.has(entry.event)) {
            warnings.push(`Cascade "${cascade.id}" timeline entry ${idx + 1} references unknown event: "${entry.event}"`);
          }
          if (entry.affects) {
            entry.affects.forEach((entityId) => {
              if (!entityIds.has(entityId)) {
                warnings.push(`Cascade "${cascade.id}" timeline entry ${idx + 1} affects unknown entity: "${entityId}"`);
              }
            });
          }
        });
      }
    });
  }

  return { errors, warnings };
}

function validateTimelineConsistency(pdl) {
  const warnings = [];

  function parseDuration(duration) {
    const match = duration.match(/^(\d+)([dhwmy])$/);
    if (!match) return 0;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    const multipliers = {
      h: 1 / 24,
      d: 1,
      w: 7,
      m: 30,
      y: 365
    };

    return value * (multipliers[unit] || 1);
  }

  if (pdl.cascades) {
    pdl.cascades.forEach((cascade) => {
      if (cascade.timeline && cascade.timeline.length > 1) {
        let lastTime = -1;
        cascade.timeline.forEach((entry, idx) => {
          const currentTime = parseDuration(entry.at);
          if (currentTime < lastTime) {
            warnings.push(`Cascade "${cascade.id}" timeline entry ${idx + 1} (${entry.at}) comes before entry ${idx} (previous was ${lastTime}d)`);
          }
          lastTime = currentTime;
        });
      }
    });
  }

  return { warnings };
}

function validateUniqueIds(pdl) {
  const errors = [];

  function checkDuplicates(items, type) {
    if (!items) return;
    const seen = new Set();
    items.forEach((item) => {
      if (seen.has(item.id)) {
        errors.push(`Duplicate ${type} ID: "${item.id}"`);
      }
      seen.add(item.id);
    });
  }

  checkDuplicates(pdl.entities, 'entity');
  checkDuplicates(pdl.supply_chains, 'supply_chain');
  checkDuplicates(pdl.substitutions, 'substitution');
  checkDuplicates(pdl.events, 'event');
  checkDuplicates(pdl.cascades, 'cascade');

  return { errors };
}

async function validate(filePath, verbose = false) {
  const results = {
    valid: true,
    schemaErrors: [],
    semanticErrors: [],
    warnings: [],
    stats: {}
  };

  try {
    if (verbose) console.log(`INFO: Loading PDL file: ${filePath}`);
    const pdl = loadYamlFile(filePath);

    if (verbose) console.log('INFO: Loading PDL schema...');
    const schema = loadSchema();

    if (verbose) console.log('INFO: Validating against JSON schema...');
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);

    const validateSchema = ajv.compile(schema);
    const schemaValid = validateSchema(pdl);

    if (!schemaValid) {
      results.valid = false;
      results.schemaErrors = validateSchema.errors.map((err) => `${err.instancePath || '/'}: ${err.message}`);
    }

    if (verbose) console.log('INFO: Running semantic validations...');

    const uniqueCheck = validateUniqueIds(pdl);
    if (uniqueCheck.errors.length > 0) {
      results.valid = false;
      results.semanticErrors.push(...uniqueCheck.errors);
    }

    const refCheck = validateEntityReferences(pdl);
    if (refCheck.errors.length > 0) {
      results.valid = false;
      results.semanticErrors.push(...refCheck.errors);
    }
    results.warnings.push(...refCheck.warnings);

    const timelineCheck = validateTimelineConsistency(pdl);
    results.warnings.push(...timelineCheck.warnings);

    results.stats = {
      pdl_version: pdl.pdl_version,
      scenario: pdl.scenario?.name || pdl.scenario?.id,
      entities: pdl.entities?.length || 0,
      supply_chains: pdl.supply_chains?.length || 0,
      substitutions: pdl.substitutions?.length || 0,
      events: pdl.events?.length || 0,
      cascades: pdl.cascades?.length || 0
    };
  } catch (e) {
    results.valid = false;
    results.semanticErrors.push(e.message);
  }

  return results;
}

function formatResults(results) {
  console.log('\n' + colors.bold + '=== PDL Validation Results ===' + colors.reset + '\n');

  if (results.stats.scenario) {
    console.log(`Scenario: ${results.stats.scenario}`);
    console.log(`PDL Version: ${results.stats.pdl_version}`);
    console.log(`Entities: ${results.stats.entities}`);
    console.log(`Supply Chains: ${results.stats.supply_chains}`);
    console.log(`Substitutions: ${results.stats.substitutions}`);
    console.log(`Events: ${results.stats.events}`);
    console.log(`Cascades: ${results.stats.cascades}`);
    console.log('');
  }

  if (results.schemaErrors.length > 0) {
    log('Schema Validation Errors:', 'red');
    results.schemaErrors.forEach((err) => {
      console.log(`  - ${err}`);
    });
    console.log('');
  }

  if (results.semanticErrors.length > 0) {
    log('Semantic Errors:', 'red');
    results.semanticErrors.forEach((err) => {
      console.log(`  - ${err}`);
    });
    console.log('');
  }

  if (results.warnings.length > 0) {
    log('Warnings:', 'yellow');
    results.warnings.forEach((warn) => {
      console.log(`  - ${warn}`);
    });
    console.log('');
  }

  if (results.valid) {
    if (results.warnings.length > 0) {
      logSuccess(`Validation passed with ${results.warnings.length} warning(s)`);
    } else {
      logSuccess('Validation passed - PDL file is valid!');
    }
  } else {
    const totalErrors = results.schemaErrors.length + results.semanticErrors.length;
    logError(`Validation failed with ${totalErrors} error(s)`);
  }

  return results.valid;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
PDL Validator - Validates PDL YAML files against the PDL schema

Usage: node pdl-validator.js <pdl-file.yaml> [options]

Options:
  --verbose, -v    Show detailed validation progress
  --json           Output results as JSON
  --help, -h       Show this help message

Examples:
  node pdl-validator.js scenarios/s1-soja.pdl.yaml
  node pdl-validator.js scenarios/s1-soja.pdl.yaml --verbose
  node pdl-validator.js scenarios/s1-soja.pdl.yaml --json
`);
    process.exit(0);
  }

  const filePath = resolve(args[0]);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const jsonOutput = args.includes('--json');

  try {
    const results = await validate(filePath, verbose);

    if (jsonOutput) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      formatResults(results);
    }

    process.exit(results.valid ? 0 : 1);
  } catch (e) {
    logError(e.message);
    process.exit(1);
  }
}

export { validate, loadYamlFile, loadSchema };

main();
