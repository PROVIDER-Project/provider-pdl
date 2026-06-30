/**
 * Scenario Loader with PDL Support
 *
 * Loads scenarios from PDL YAML files and converts them to the internal
 * simulation format. Supports both legacy JSON and new PDL formats.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Parse duration string to simulation ticks (1 tick = 1 day)
 */
function parseDuration(duration) {
  if (!duration) return null;

  const match = duration.match(/^(\d+)([dhwmy])$/);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers = {
    'h': 1/24,
    'd': 1,
    'w': 7,
    'm': 30,
    'y': 365
  };

  return Math.round(value * (multipliers[unit] || 1));
}

/**
 * Parse percentage string to decimal multiplier
 */
function parsePercentage(pct) {
  if (!pct) return null;

  const match = pct.match(/^([+-]?\d+)%$/);
  if (!match) return null;

  return parseInt(match[1], 10) / 100;
}

/**
 * Load and validate a PDL file
 */
function loadPdlFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Scenario file not found: ${filePath}`);
  }

  const content = readFileSync(filePath, 'utf-8');
  const pdl = parseYaml(content);

  // Optional: validate against schema
  const schemaPath = resolve(__dirname, '../../schemas/pdl-schema.json');
  if (existsSync(schemaPath)) {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);

    const validate = ajv.compile(schema);
    if (!validate(pdl)) {
      const errors = validate.errors.map(e => `${e.instancePath}: ${e.message}`).join('; ');
      throw new Error(`PDL validation failed: ${errors}`);
    }
  }

  return pdl;
}

/**
 * Convert PDL to internal simulation format
 */
function convertPdlToSimulation(pdl) {
  const simulation = {
    id: pdl.scenario.id,
    name: pdl.scenario.name,
    sector: pdl.scenario.sector,
    criticality: pdl.scenario.criticality,
    description: pdl.scenario.description,

    // Network graph
    nodes: [],
    edges: [],

    // Simulation parameters
    substitutions: [],
    events: [],
    cascades: [],

    // Metadata
    pdl_version: pdl.pdl_version,
    source: 'pdl'
  };

  // Convert entities to nodes
  const nodeIndex = {};
  if (pdl.entities) {
    for (const entity of pdl.entities) {
      const node = {
        id: entity.id,
        type: entity.type,
        name: entity.name,
        sector: entity.sector,
        location: entity.location,
        vulnerability: entity.vulnerability || 0.5,
        state: {
          supply: 1.0,
          demand: 1.0,
          price: 1.0,
          active: true
        }
      };
      simulation.nodes.push(node);
      nodeIndex[entity.id] = node;
    }
  }

  // Convert supply chains to edges
  if (pdl.supply_chains) {
    for (const chain of pdl.supply_chains) {
      // Stages
      if (chain.stages) {
        chain.stages.forEach((stage, idx) => {
          const [from, to] = stage;
          simulation.edges.push({
            id: `${chain.id}_stage_${idx}`,
            source: from,
            target: to,
            type: 'supply_flow',
            chain: chain.id,
            weight: 1.0
          });
        });
      }

      // Dependencies
      if (chain.dependencies) {
        chain.dependencies.forEach((dep, idx) => {
          simulation.edges.push({
            id: `${chain.id}_dep_${idx}`,
            source: dep.from,
            target: dep.to,
            type: 'dependency',
            dependency_type: dep.type,
            criticality: dep.criticality,
            substitution_ref: dep.substitution_ref,
            weight: dep.criticality === 'high' ? 1.0 : dep.criticality === 'medium' ? 0.6 : 0.3
          });
        });
      }
    }
  }

  // Convert events
  if (pdl.events) {
    for (const event of pdl.events) {
      const simEvent = {
        id: event.id,
        name: event.name,
        type: event.type,
        target: event.trigger?.target,
        probability: event.trigger?.probability || 0,
        condition: event.trigger?.condition,
        impact: {
          supply: parsePercentage(event.impact?.supply) || 0,
          demand: parsePercentage(event.impact?.demand) || 0,
          price: parsePercentage(event.impact?.price) || 0,
          duration: parseDuration(event.impact?.duration) || 30
        },
        causes: event.causes || [],
        substitution_ref: event.substitution_ref,
        reference: event.reference
      };
      simulation.events.push(simEvent);
    }
  }

  // Convert substitutions
  if (pdl.substitutions) {
    for (const substitution of pdl.substitutions) {
      const simSubstitution = {
        id: substitution.id,
        from: substitution.from,
        to: substitution.to,
        type: substitution.type,
        direction: substitution.direction || 'supply',
        coverage: substitution.coverage || 0,
        quality_delta: substitution.quality_delta || 0,
        cost_delta: substitution.cost_delta || 0,
        ramp_up: substitution.ramp_up,
        ramp_up_days: parseDuration(substitution.ramp_up) || 0,
        duration_max: substitution.duration_max,
        duration_max_days: parseDuration(substitution.duration_max),
        reversible: substitution.reversible,
        activation: {
          trigger: substitution.activation?.trigger,
          threshold: substitution.activation?.threshold || null
        },
        side_effects: substitution.side_effects || [],
        dependency_overlap: substitution.dependency_overlap || [],
        reference: substitution.reference
      };
      simulation.substitutions.push(simSubstitution);
    }
  }

  // Convert cascades
  if (pdl.cascades) {
    for (const cascade of pdl.cascades) {
      const simCascade = {
        id: cascade.id,
        name: cascade.name,
        origin: cascade.origin,
        probability: cascade.probability || 1.0,
        timeline: (cascade.timeline || []).map(entry => ({
          tick: parseDuration(entry.at) || 0,
          event: entry.event,
          sector: entry.impact?.sector,
          severity: entry.impact?.severity,
          affects: entry.affects || []
        })).sort((a, b) => a.tick - b.tick),
        validation: cascade.validation
      };
      simulation.cascades.push(simCascade);
    }
  }

  return simulation;
}

/**
 * Load a scenario file (auto-detects PDL vs JSON)
 */
export function loadScenario(filePath) {
  const resolvedPath = resolve(filePath);
  const ext = extname(resolvedPath).toLowerCase();

  // PDL format
  if (ext === '.yaml' || ext === '.yml' || filePath.includes('.pdl.')) {
    const pdl = loadPdlFile(resolvedPath);
    return convertPdlToSimulation(pdl);
  }

  // Legacy JSON format
  if (ext === '.json') {
    const content = readFileSync(resolvedPath, 'utf-8');
    const data = JSON.parse(content);
    data.source = 'json';
    return data;
  }

  throw new Error(`Unsupported scenario file format: ${ext}`);
}

/**
 * Load multiple scenarios from a directory
 */
export function loadScenariosFromDirectory(dirPath) {
  const { readdirSync } = require('fs');
  const { join } = require('path');

  const scenarios = [];
  const files = readdirSync(dirPath);

  for (const file of files) {
    if (file.endsWith('.pdl.yaml') || file.endsWith('.pdl.yml') || file.endsWith('.json')) {
      try {
        const scenario = loadScenario(join(dirPath, file));
        scenarios.push(scenario);
      } catch (e) {
        console.warn(`Failed to load scenario ${file}: ${e.message}`);
      }
    }
  }

  return scenarios;
}

/**
 * Get scenario metadata without full conversion
 */
export function getScenarioMetadata(filePath) {
  const resolvedPath = resolve(filePath);
  const ext = extname(resolvedPath).toLowerCase();

  if (ext === '.yaml' || ext === '.yml' || filePath.includes('.pdl.')) {
    const content = readFileSync(resolvedPath, 'utf-8');
    const pdl = parseYaml(content);
    return {
      id: pdl.scenario?.id,
      name: pdl.scenario?.name,
      sector: pdl.scenario?.sector,
      criticality: pdl.scenario?.criticality,
      description: pdl.scenario?.description,
      entityCount: pdl.entities?.length || 0,
      eventCount: pdl.events?.length || 0,
      substitutionCount: pdl.substitutions?.length || 0,
      cascadeCount: pdl.cascades?.length || 0,
      format: 'pdl',
      pdl_version: pdl.pdl_version
    };
  }

  if (ext === '.json') {
    const content = readFileSync(resolvedPath, 'utf-8');
    const data = JSON.parse(content);
    return {
      id: data.id,
      name: data.name,
      sector: data.sector,
      criticality: data.criticality,
      description: data.description,
      entityCount: data.nodes?.length || 0,
      eventCount: data.events?.length || 0,
      substitutionCount: data.substitutions?.length || 0,
      cascadeCount: data.cascades?.length || 0,
      format: 'json'
    };
  }

  throw new Error(`Unsupported scenario file format: ${ext}`);
}

// Export utility functions
export { parseDuration, parsePercentage, loadPdlFile, convertPdlToSimulation };
