#!/usr/bin/env node

/**
 * PDL to RDF/Turtle Converter
 * Converts PDL YAML files to RDF/Turtle format for Knowledge Graph integration
 *
 * This converter generates RDF that conforms to the PDL Ontology, which extends
 * and aligns with the CoyPu ontology (https://schema.coypu.org/global/2.3).
 *
 * Usage: node pdl-to-rdf.js <pdl-file.yaml> [--output <file.ttl>] [--include-ontology]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// RDF Namespaces
const NAMESPACES = {
  pdl: 'https://provider-project.org/ontology/pdl#',
  pdlr: 'https://provider-project.org/resource/',
  coy: 'https://schema.coypu.org/global#',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  owl: 'http://www.w3.org/2002/07/owl#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  dcterms: 'http://purl.org/dc/terms/',
  geo: 'http://www.w3.org/2003/01/geo/wgs84_pos#',
  prov: 'http://www.w3.org/ns/prov#'
};

// v1.2: Dual-Encoding-Helfer — Rohstring bleibt erhalten, Zahl kommt dazu
function pctToDecimal(s) {            // "-40%" -> -0.4
  const m = /^([+-]?)([0-9]+)%$/.exec(String(s).trim());
  if (!m) return null;
  return (m[1] === '-' ? -1 : 1) * Number(m[2]) / 100;
}
const DUR_FACTOR = { h: 1 / 24, d: 1, w: 7, m: 30, y: 365 };
function durToDays(s) {               // "90d" -> 90, "3w" -> 21
  const m = /^([0-9]+)([dhwmy])$/.exec(String(s).trim());
  if (!m) return null;
  return Math.round(Number(m[1]) * DUR_FACTOR[m[2]] * 1e9) / 1e9;  // Rundung: h=1/24 sonst irrationaler Bruch
}

// v1.2: Event-IDs aus Trigger-Condition ziehen ("a.active AND b.duration > 30d" -> [a, b])
// Unterschied zu extractEventIdsFromTrigger: matcht auch .duration-Referenzen
function conditionEventRefs(cond) {
  if (!cond) return [];
  const ids = new Set();
  const re = /([a-z][a-z0-9_]*)\.(?:active|duration)/g;
  let m;
  while ((m = re.exec(cond)) !== null) ids.add(m[1]);
  return [...ids];
}

// PDL entity type to CoyPu class mapping
const ENTITY_TYPE_TO_COYPU = {
  manufacturer: 'coy:Company',
  commodity: 'coy:Commodity',
  infrastructure: 'coy:Infrastructure',
  service: null, // No direct CoyPu equivalent
  region: 'coy:Region'
};

// PDL event type to CoyPu class mapping
const EVENT_TYPE_TO_COYPU = {
  natural_disaster: 'coy:Disaster',
  market_shock: null,
  infrastructure_failure: null,
  regulatory: null,
  geopolitical: 'coy:SocioPoliticalEvent',
  pandemic: null,
  cyber_attack: null
};

// Dependency type to PDL class mapping
const DEPENDENCY_TYPE_TO_CLASS = {
  energy: 'pdl:DependencyType_energy',
  input: 'pdl:DependencyType_input',
  logistics: 'pdl:DependencyType_logistics',
  data: 'pdl:DependencyType_data',
  substitution: 'pdl:DependencyType_substitution',
  demand: 'pdl:DependencyType_demand'
};

/**
 * Load and parse a YAML file
 */
function loadYamlFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = readFileSync(filePath, 'utf-8');
  return parseYaml(content);
}

/**
 * Escape string for Turtle literal
 */
function escapeTurtleString(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/**
 * Convert ID to valid IRI local name
 */
function toIriLocalName(id) {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Convert PDL entity type to class name (e.g., "manufacturer" -> "Manufacturer")
 */
function toEntityClassName(type) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Convert PDL event type to class name (e.g., "natural_disaster" -> "NaturalDisaster")
 */
function toEventClassName(type) {
  return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

function buildSubstitutionTypeRef(type) {
  if (!type) return null;
  return 'pdl:SubstitutionType_' + type;
}

function buildSubstitutionDirectionRef(direction) {
  if (!direction) return 'pdl:SubstitutionDirection_supply';
  return 'pdl:SubstitutionDirection_' + direction;
}

function buildSideEffectTypeRef(type) {
  if (!type) return null;
  return 'pdl:SideEffectType_' + type;
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

/**
 * Build type declaration with CoyPu mapping if available
 */
function buildEntityTypes(entityType) {
  const pdlClass = `pdl:${toEntityClassName(entityType)}`;
  const coypuClass = ENTITY_TYPE_TO_COYPU[entityType];

  if (coypuClass) {
    return `${pdlClass}, ${coypuClass}`;
  }
  return pdlClass;
}

/**
 * Build event type declaration with CoyPu mapping if available
 */
function buildEventTypes(eventType) {
  const pdlClass = `pdl:Event_${toEventClassName(eventType)}`;
  const coypuClass = EVENT_TYPE_TO_COYPU[eventType];

  if (coypuClass) {
    return `pdl:Event, ${pdlClass}, ${coypuClass}`;
  }
  return `pdl:Event, ${pdlClass}`;
}

/**
 * Convert PDL to RDF/Turtle
 */
function convertToTurtle(pdl, options = {}) {
  const { includeOntology = false } = options;
  const lines = [];

  // Header
  lines.push('# =============================================================================');
  lines.push('# PDL to RDF/Turtle Export');
  lines.push('# =============================================================================');
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push('# Ontology: https://provider-project.org/ontology/pdl');
  lines.push('# Extends: https://schema.coypu.org/global/2.3 (CoyPu Ontology)');
  lines.push('# =============================================================================');
  lines.push('');

  // Prefixes
  for (const [prefix, uri] of Object.entries(NAMESPACES)) {
    lines.push(`@prefix ${prefix}: <${uri}> .`);
  }
  lines.push('');

  // Ontology import declaration
  lines.push('# Ontology Import');
  lines.push('<https://provider-project.org/resource/export> a owl:Ontology ;');
  lines.push('    owl:imports <https://provider-project.org/ontology/pdl> ;');
  lines.push('    owl:imports <https://schema.coypu.org/global/2.3> ;');
  lines.push(`    dcterms:created "${new Date().toISOString().split('T')[0]}"^^xsd:date .`);
  lines.push('');

  // Scenario
  if (pdl.scenario) {
    const scenarioUri = `pdlr:scenario_${toIriLocalName(pdl.scenario.id)}`;
    lines.push('# =============================================================================');
    lines.push(`# Scenario: ${pdl.scenario.name}`);
    lines.push('# =============================================================================');
    lines.push('');
    lines.push(`${scenarioUri} a pdl:Scenario ;`);
    lines.push(`    dcterms:identifier "${escapeTurtleString(pdl.scenario.id)}" ;`);
    lines.push(`    rdfs:label "${escapeTurtleString(pdl.scenario.name)}" ;`);
    lines.push(`    pdl:sector "${escapeTurtleString(pdl.scenario.sector)}" ;`);
    lines.push(`    pdl:criticality pdl:Criticality_${pdl.scenario.criticality} ;`);
    if (pdl.scenario.description) {
      lines.push(`    dcterms:description "${escapeTurtleString(pdl.scenario.description)}" ;`);
    }
    lines.push(`    pdl:pdlVersion "${pdl.pdl_version}" .`);
    lines.push('');
  }

  // Entities
  if (pdl.entities && pdl.entities.length > 0) {
    lines.push('# =============================================================================');
    lines.push('# Entities');
    lines.push('# =============================================================================');
    lines.push('');

    for (const entity of pdl.entities) {
      const entityUri = `pdlr:entity_${toIriLocalName(entity.id)}`;
      const typeDecl = buildEntityTypes(entity.type);

      lines.push(`${entityUri} a ${typeDecl} ;`);
      lines.push(`    dcterms:identifier "${escapeTurtleString(entity.id)}" ;`);
      lines.push(`    rdfs:label "${escapeTurtleString(entity.name)}" ;`);
      lines.push(`    pdl:entityType "${escapeTurtleString(entity.type)}" ;`);
      lines.push(`    pdl:sector "${escapeTurtleString(entity.sector)}" ;`);

      if (entity.location) {
        lines.push(`    pdl:location "${escapeTurtleString(entity.location)}" ;`);
      }

      if (entity.vulnerability !== undefined) {
        lines.push(`    pdl:vulnerability "${entity.vulnerability}"^^xsd:decimal ;`);
      }

      if (entity.substitution_potential !== undefined) {
        lines.push(`    pdl:substitutionPotential "${entity.substitution_potential}"^^xsd:decimal ;`);
      }

      // _kg_source -> prov provenance
      const eks = entity._kg_source;
      if (eks) {
        if (eks.wpi_kg_uri || eks.exiobase_uri) {
          lines.push(`    prov:wasDerivedFrom <${eks.wpi_kg_uri || eks.exiobase_uri}> ;`);
        }
        if (eks.exiobase_parametrizer || eks.baci_coverage_formula) {
          lines.push(`    pdl:kgSourceQuery ${JSON.stringify(eks.exiobase_parametrizer || eks.baci_coverage_formula)} ;`);
        }
        const datasetName = eks.origin || (eks.exiobase_type ? 'EXIOBASE' : null) || (eks.wpi_locode ? 'WPI' : null);
        if (datasetName) {
          lines.push(`    dcterms:source ${JSON.stringify(datasetName)} ;`);
        }
      }

      // Link to scenario
      if (pdl.scenario) {
        lines.push(`    pdl:partOfScenario pdlr:scenario_${toIriLocalName(pdl.scenario.id)} ;`);
      }

      // Remove trailing semicolon and add period
      const lastLine = lines.pop();
      lines.push(lastLine.replace(/ ;$/, ' .'));
      lines.push('');
    }
  }

  // Supply Chains
  if (pdl.supply_chains && pdl.supply_chains.length > 0) {
    lines.push('# =============================================================================');
    lines.push('# Supply Chains');
    lines.push('# =============================================================================');
    lines.push('');

    for (const chain of pdl.supply_chains) {
      const chainUri = `pdlr:chain_${toIriLocalName(chain.id)}`;

      lines.push(`${chainUri} a pdl:SupplyChain ;`);
      lines.push(`    dcterms:identifier "${escapeTurtleString(chain.id)}" ;`);

      if (chain.name) {
        lines.push(`    rdfs:label "${escapeTurtleString(chain.name)}" ;`);
      }

      // Link to scenario
      if (pdl.scenario) {
        lines.push(`    pdl:partOfScenario pdlr:scenario_${toIriLocalName(pdl.scenario.id)} ;`);
      }

      const lastLine = lines.pop();
      lines.push(lastLine.replace(/ ;$/, ' .'));
      lines.push('');

      // Stages as separate connections
      if (chain.stages) {
        chain.stages.forEach((stage, idx) => {
          const [from, to] = stage;
          const connectionUri = `pdlr:connection_${toIriLocalName(chain.id)}_${idx + 1}`;
          const fromUri = `pdlr:entity_${toIriLocalName(from)}`;
          const toUri = `pdlr:entity_${toIriLocalName(to)}`;

          lines.push(`${connectionUri} a pdl:SupplyChainConnection ;`);
          lines.push(`    pdl:sequence ${idx + 1} ;`);
          lines.push(`    pdl:fromEntity ${fromUri} ;`);
          lines.push(`    pdl:toEntity ${toUri} ;`);
          lines.push(`    pdl:belongsToChain ${chainUri} .`);
          lines.push('');

          // Also emit CoyPu-compatible direct supplier/customer relationships
          lines.push(`# CoyPu-compatible supplier relationship`);
          lines.push(`${toUri} coy:hasSupplier ${fromUri} .`);
          lines.push(`${fromUri} coy:hasCustomer ${toUri} .`);
          lines.push('');
        });
      }

      // Dependencies
      if (chain.dependencies) {
        chain.dependencies.forEach((dep, idx) => {
          const depUri = `pdlr:dependency_${toIriLocalName(chain.id)}_${idx + 1}`;
          const fromUri = `pdlr:entity_${toIriLocalName(dep.from)}`;
          const toUri = `pdlr:entity_${toIriLocalName(dep.to)}`;
          const depTypeClass = DEPENDENCY_TYPE_TO_CLASS[dep.type];

          lines.push(`${depUri} a pdl:Dependency ;`);
          lines.push(`    pdl:fromEntity ${fromUri} ;`);
          lines.push(`    pdl:toEntity ${toUri} ;`);
          lines.push(`    pdl:dependencyType "${escapeTurtleString(dep.type)}" ;`);

          if (depTypeClass) {
            lines.push(`    pdl:dependencyTypeRef ${depTypeClass} ;`);
          }

          if (dep.criticality) {
            lines.push(`    pdl:criticality pdl:Criticality_${dep.criticality} ;`);
          }

          if (dep.substitution_ref) {
            lines.push(`    pdl:substitutionRef pdlr:substitution_${toIriLocalName(dep.substitution_ref)} ;`);
          }

          lines.push(`    pdl:belongsToChain ${chainUri} .`);
          lines.push('');

          // Emit direct dependsOn relationship
          lines.push(`# Direct dependency relationship`);
          lines.push(`${fromUri} pdl:dependsOn ${toUri} .`);
          lines.push('');
        });
      }
    }
  }

  // Events
  if (pdl.events && pdl.events.length > 0) {
    lines.push('# =============================================================================');
    lines.push('# Events');
    lines.push('# =============================================================================');
    lines.push('');

    for (const event of pdl.events) {
      const eventUri = `pdlr:event_${toIriLocalName(event.id)}`;
      const typeDecl = buildEventTypes(event.type);

      lines.push(`${eventUri} a ${typeDecl} ;`);
      lines.push(`    dcterms:identifier "${escapeTurtleString(event.id)}" ;`);
      lines.push(`    rdfs:label "${escapeTurtleString(event.name)}" ;`);
      lines.push(`    pdl:eventType "${escapeTurtleString(event.type)}" ;`);

      // Trigger
      if (event.trigger) {
        const targetUri = `pdlr:entity_${toIriLocalName(event.trigger.target)}`;
        lines.push(`    pdl:triggerTarget ${targetUri} ;`);
        // Also emit CoyPu-compatible impact relationship
        lines.push(`    coy:hasImpactOn ${targetUri} ;`);

        if (event.trigger.probability !== undefined) {
          lines.push(`    pdl:triggerProbability "${event.trigger.probability}"^^xsd:decimal ;`);
        }

        if (event.trigger.condition) {
          lines.push(`    pdl:triggerCondition "${escapeTurtleString(event.trigger.condition)}" ;`);
          const condRefs = conditionEventRefs(event.trigger.condition);
          condRefs.forEach((refId) => {
            lines.push(`    pdl:conditionDependsOnEvent pdlr:event_${toIriLocalName(refId)} ;`);
          });
        }
      }

      // Impact
      if (event.impact) {
        if (event.impact.supply) {
          lines.push(`    pdl:impactSupply "${escapeTurtleString(event.impact.supply)}" ;`);
          const supDec = pctToDecimal(event.impact.supply);
          if (supDec !== null) lines.push(`    pdl:impactSupplyDecimal "${supDec}"^^xsd:decimal ;`);
        }
        if (event.impact.demand) {
          lines.push(`    pdl:impactDemand "${escapeTurtleString(event.impact.demand)}" ;`);
          const demDec = pctToDecimal(event.impact.demand);
          if (demDec !== null) lines.push(`    pdl:impactDemandDecimal "${demDec}"^^xsd:decimal ;`);
        }
        if (event.impact.price) {
          lines.push(`    pdl:impactPrice "${escapeTurtleString(event.impact.price)}" ;`);
          const priceDec = pctToDecimal(event.impact.price);
          if (priceDec !== null) lines.push(`    pdl:impactPriceDecimal "${priceDec}"^^xsd:decimal ;`);
        }
        if (event.impact.duration) {
          lines.push(`    pdl:impactDuration "${escapeTurtleString(event.impact.duration)}" ;`);
          const durDays = durToDays(event.impact.duration);
          if (durDays !== null) lines.push(`    pdl:impactDurationDays "${durDays}"^^xsd:decimal ;`);
        }
      }

      // Causes
      if (event.causes && event.causes.length > 0) {
        const causesUris = event.causes.map(c => `pdlr:event_${toIriLocalName(c)}`).join(', ');
        lines.push(`    pdl:causes ${causesUris} ;`);
      }

      // Reference
      if (event.reference) {
        lines.push(`    dcterms:source "${escapeTurtleString(event.reference)}" ;`);
      }

      if (event.substitution_ref) {
        lines.push(`    pdl:substitutionRef pdlr:substitution_${toIriLocalName(event.substitution_ref)} ;`);
      }

      // _kg_source -> prov provenance
      const evks = event._kg_source;
      if (evks) {
        if (evks.wpi_kg_uri || evks.exiobase_uri) {
          lines.push(`    prov:wasDerivedFrom <${evks.wpi_kg_uri || evks.exiobase_uri}> ;`);
        }
        if (evks.exiobase_parametrizer || evks.baci_coverage_formula) {
          lines.push(`    pdl:kgSourceQuery ${JSON.stringify(evks.exiobase_parametrizer || evks.baci_coverage_formula)} ;`);
        }
        const evDataset = evks.origin || (evks.exiobase_type ? 'EXIOBASE' : null) || (evks.wpi_locode ? 'WPI' : null);
        if (evDataset) {
          lines.push(`    dcterms:source ${JSON.stringify(evDataset)} ;`);
        }
      }

      // Link to scenario
      if (pdl.scenario) {
        lines.push(`    pdl:partOfScenario pdlr:scenario_${toIriLocalName(pdl.scenario.id)} ;`);
      }

      const lastLine = lines.pop();
      lines.push(lastLine.replace(/ ;$/, ' .'));
      lines.push('');
    }

    // Emit inverse isImpactedBy relationships for entities
    lines.push('# CoyPu-compatible inverse impact relationships');
    for (const event of pdl.events) {
      if (event.trigger) {
        const eventUri = `pdlr:event_${toIriLocalName(event.id)}`;
        const targetUri = `pdlr:entity_${toIriLocalName(event.trigger.target)}`;
        lines.push(`${targetUri} coy:isImpactedBy ${eventUri} .`);
      }
    }
    lines.push('');
  }


  // Substitutions
  if (pdl.substitutions && pdl.substitutions.length > 0) {
    lines.push('# =============================================================================');
    lines.push('# Substitutions');
    lines.push('# =============================================================================');
    lines.push('');

    for (const substitution of pdl.substitutions) {
      const substitutionUri = `pdlr:substitution_${toIriLocalName(substitution.id)}`;
      const substitutionTypeRef = buildSubstitutionTypeRef(substitution.type);
      const directionRef = buildSubstitutionDirectionRef(substitution.direction);
      const activationUri = substitution.activation
        ? `pdlr:activation_${toIriLocalName(substitution.id)}`
        : null;

      lines.push(`${substitutionUri} a pdl:Substitution ;`);
      lines.push(`    dcterms:identifier "${escapeTurtleString(substitution.id)}" ;`);

      if (substitution.from) {
        lines.push(`    pdl:substitutionFor pdlr:entity_${toIriLocalName(substitution.from)} ;`);
      }
      if (substitution.to) {
        lines.push(`    pdl:substitutionBy pdlr:entity_${toIriLocalName(substitution.to)} ;`);
      }
      if (substitutionTypeRef) {
        lines.push(`    pdl:substitutionTypeRef ${substitutionTypeRef} ;`);
      }
      if (directionRef) {
        lines.push(`    pdl:substitutionDirectionRef ${directionRef} ;`);
      }
      if (substitution.coverage !== undefined) {
        lines.push(`    pdl:coverage "${substitution.coverage}"^^xsd:decimal ;`);
      }
      if (substitution.quality_delta !== undefined) {
        lines.push(`    pdl:qualityDelta "${substitution.quality_delta}"^^xsd:decimal ;`);
      }
      if (substitution.cost_delta !== undefined) {
        lines.push(`    pdl:costDelta "${substitution.cost_delta}"^^xsd:decimal ;`);
      }
      if (substitution.ramp_up) {
        lines.push(`    pdl:rampUp "${escapeTurtleString(substitution.ramp_up)}" ;`);
        const rampDays = durToDays(substitution.ramp_up);
        if (rampDays !== null) lines.push(`    pdl:rampUpDays "${rampDays}"^^xsd:decimal ;`);
      }
      if (substitution.duration_max) {
        lines.push(`    pdl:durationMax "${escapeTurtleString(substitution.duration_max)}" ;`);
      }
      if (substitution.reversible !== undefined) {
        lines.push(`    pdl:reversible "${substitution.reversible}"^^xsd:boolean ;`);
      }
      if (activationUri) {
        lines.push(`    pdl:hasActivationCondition ${activationUri} ;`);
      }

      (substitution.side_effects || []).forEach((_, idx) => {
        lines.push(`    pdl:hasSideEffect pdlr:sideeffect_${toIriLocalName(substitution.id)}_${idx + 1} ;`);
      });

      (substitution.dependency_overlap || []).forEach((entityId) => {
        lines.push(`    pdl:hasDependencyOverlap pdlr:entity_${toIriLocalName(entityId)} ;`);
      });

      if (substitution.reference) {
        lines.push(`    dcterms:source "${escapeTurtleString(substitution.reference)}" ;`);
      }

      // _kg_source -> prov provenance
      const subks = substitution._kg_source;
      if (subks) {
        if (subks.wpi_kg_uri || subks.exiobase_uri) {
          lines.push(`    prov:wasDerivedFrom <${subks.wpi_kg_uri || subks.exiobase_uri}> ;`);
        }
        if (subks.exiobase_parametrizer || subks.baci_coverage_formula) {
          lines.push(`    pdl:kgSourceQuery ${JSON.stringify(subks.exiobase_parametrizer || subks.baci_coverage_formula)} ;`);
        }
        const subDataset = subks.origin || (subks.exiobase_type ? 'EXIOBASE' : null) || (subks.wpi_locode ? 'WPI' : null);
        if (subDataset) {
          lines.push(`    dcterms:source ${JSON.stringify(subDataset)} ;`);
        }
      }

      if (pdl.scenario) {
        lines.push(`    pdl:partOfScenario pdlr:scenario_${toIriLocalName(pdl.scenario.id)} ;`);
      }

      const lastLine = lines.pop();
      lines.push(lastLine.replace(/ ;$/, ' .'));
      lines.push('');

      if (activationUri) {
        lines.push(`${activationUri} a pdl:ActivationCondition ;`);

        if (substitution.activation.trigger) {
          lines.push(`    pdl:activationTrigger "${escapeTurtleString(substitution.activation.trigger)}" ;`);

          const activationEvents = extractEventIdsFromTrigger(substitution.activation.trigger);
          activationEvents.forEach((eventId) => {
            lines.push(`    pdl:activationEvent pdlr:event_${toIriLocalName(eventId)} ;`);
          });
        }

        if (substitution.activation.threshold?.price_increase !== undefined) {
          lines.push(`    pdl:activationThresholdPriceIncrease "${substitution.activation.threshold.price_increase}"^^xsd:decimal ;`);
        }
        if (substitution.activation.threshold?.supply_drop !== undefined) {
          lines.push(`    pdl:activationThresholdSupplyDrop "${substitution.activation.threshold.supply_drop}"^^xsd:decimal ;`);
        }
        if (substitution.activation.threshold?.duration_min) {
          lines.push(`    pdl:activationThresholdDurationMin "${escapeTurtleString(substitution.activation.threshold.duration_min)}" ;`);
        }

        const lastActivationLine = lines.pop();
        lines.push(lastActivationLine.replace(/ ;$/, ' .'));
        lines.push('');
      }

      (substitution.side_effects || []).forEach((effect, idx) => {
        const effectUri = `pdlr:sideeffect_${toIriLocalName(substitution.id)}_${idx + 1}`;
        const effectTypeRef = buildSideEffectTypeRef(effect.type);

        lines.push(`${effectUri} a pdl:SubstitutionSideEffect ;`);

        if (effectTypeRef) {
          lines.push(`    pdl:sideEffectTypeRef ${effectTypeRef} ;`);
        }
        if (effect.target) {
          lines.push(`    pdl:sideEffectTarget pdlr:entity_${toIriLocalName(effect.target)} ;`);
        }
        if (effect.magnitude !== undefined) {
          lines.push(`    pdl:sideEffectMagnitude "${effect.magnitude}"^^xsd:decimal ;`);
        }
        if (effect.description) {
          lines.push(`    rdfs:comment "${escapeTurtleString(effect.description)}" ;`);
        }

        const lastEffectLine = lines.pop();
        lines.push(lastEffectLine.replace(/ ;$/, ' .'));
        lines.push('');
      });
    }
  }
  // Cascades
  if (pdl.cascades && pdl.cascades.length > 0) {
    lines.push('# =============================================================================');
    lines.push('# Cascades');
    lines.push('# =============================================================================');
    lines.push('');

    for (const cascade of pdl.cascades) {
      const cascadeUri = `pdlr:cascade_${toIriLocalName(cascade.id)}`;

      lines.push(`${cascadeUri} a pdl:Cascade ;`);
      lines.push(`    dcterms:identifier "${escapeTurtleString(cascade.id)}" ;`);

      if (cascade.name) {
        lines.push(`    rdfs:label "${escapeTurtleString(cascade.name)}" ;`);
      }

      lines.push(`    pdl:originEvent pdlr:event_${toIriLocalName(cascade.origin)} ;`);

      if (cascade.probability !== undefined) {
        lines.push(`    pdl:probability "${cascade.probability}"^^xsd:decimal ;`);
      }

      // Validation reference
      if (cascade.validation) {
        if (cascade.validation.reference) {
          lines.push(`    dcterms:source "${escapeTurtleString(cascade.validation.reference)}" ;`);
        }
        if (cascade.validation.confidence !== undefined) {
          lines.push(`    pdl:validationConfidence "${cascade.validation.confidence}"^^xsd:decimal ;`);
        }
      }

      // Link to scenario
      if (pdl.scenario) {
        lines.push(`    pdl:partOfScenario pdlr:scenario_${toIriLocalName(pdl.scenario.id)} ;`);
      }

      const lastLine = lines.pop();
      lines.push(lastLine.replace(/ ;$/, ' .'));
      lines.push('');

      // Timeline entries
      if (cascade.timeline) {
        cascade.timeline.forEach((entry, idx) => {
          const entryUri = `pdlr:timeline_${toIriLocalName(cascade.id)}_${idx + 1}`;

          lines.push(`${entryUri} a pdl:TimelineEntry ;`);
          lines.push(`    pdl:sequence ${idx + 1} ;`);
          lines.push(`    pdl:atTime "${escapeTurtleString(entry.at)}" ;`);
          lines.push(`    pdl:timelineEvent pdlr:event_${toIriLocalName(entry.event)} ;`);
          lines.push(`    pdl:belongsToCascade ${cascadeUri} ;`);

          // Impact
          if (entry.impact) {
            if (entry.impact.sector) {
              lines.push(`    pdl:impactSector "${escapeTurtleString(entry.impact.sector)}" ;`);
            }
            if (entry.impact.severity) {
              lines.push(`    pdl:impactSeverity pdl:Severity_${entry.impact.severity} ;`);
            }
          }

          // Affects
          if (entry.affects && entry.affects.length > 0) {
            const affectsUris = entry.affects.map(a => `pdlr:entity_${toIriLocalName(a)}`).join(', ');
            lines.push(`    pdl:affects ${affectsUris} ;`);
          }

          const lastLine = lines.pop();
          lines.push(lastLine.replace(/ ;$/, ' .'));
          lines.push('');
        });
      }
    }
  }

  // Include inline ontology definitions if requested (for standalone use)
  if (includeOntology) {
    lines.push('# =============================================================================');
    lines.push('# Inline Ontology Definitions (for standalone use)');
    lines.push('# =============================================================================');
    lines.push('# Note: For full ontology, import https://provider-project.org/ontology/pdl');
    lines.push('');

    // Classes
    lines.push('# Core Classes');
    lines.push('pdl:Scenario a owl:Class ;');
    lines.push('    rdfs:label "Scenario"@en ;');
    lines.push('    rdfs:comment "Container for supply chain disruption scenarios."@en .');
    lines.push('');

    lines.push('pdl:Entity a owl:Class ;');
    lines.push('    rdfs:label "Entity"@en ;');
    lines.push('    rdfs:comment "Base class for supply chain actors, resources, and infrastructure."@en .');
    lines.push('');

    lines.push('pdl:Manufacturer a owl:Class ;');
    lines.push('    rdfs:subClassOf pdl:Entity, coy:Company ;');
    lines.push('    rdfs:label "Manufacturer"@en .');
    lines.push('');

    lines.push('pdl:Commodity a owl:Class ;');
    lines.push('    rdfs:subClassOf pdl:Entity, coy:Commodity ;');
    lines.push('    rdfs:label "Commodity"@en .');
    lines.push('');

    lines.push('pdl:Infrastructure a owl:Class ;');
    lines.push('    rdfs:subClassOf pdl:Entity, coy:Infrastructure ;');
    lines.push('    rdfs:label "Infrastructure"@en .');
    lines.push('');

    lines.push('pdl:Service a owl:Class ;');
    lines.push('    rdfs:subClassOf pdl:Entity ;');
    lines.push('    rdfs:label "Service"@en .');
    lines.push('');

    lines.push('pdl:Region a owl:Class ;');
    lines.push('    rdfs:subClassOf pdl:Entity, coy:Region ;');
    lines.push('    rdfs:label "Region"@en .');
    lines.push('');

    lines.push('pdl:SupplyChain a owl:Class ;');
    lines.push('    rdfs:label "Supply Chain"@en .');
    lines.push('');

    lines.push('pdl:SupplyChainConnection a owl:Class ;');
    lines.push('    rdfs:label "Supply Chain Connection"@en .');
    lines.push('');

    lines.push('pdl:Dependency a owl:Class ;');
    lines.push('    rdfs:label "Dependency"@en .');
    lines.push('');

    lines.push('pdl:Event a owl:Class ;');
    lines.push('    rdfs:subClassOf coy:Event ;');
    lines.push('    rdfs:label "Event"@en .');
    lines.push('');

    lines.push('pdl:Event_NaturalDisaster a owl:Class ;');
    lines.push('    rdfs:subClassOf pdl:Event, coy:Disaster ;');
    lines.push('    rdfs:label "Natural Disaster Event"@en .');
    lines.push('');

    lines.push('pdl:Event_MarketShock a owl:Class ;');
    lines.push('    rdfs:subClassOf pdl:Event ;');
    lines.push('    rdfs:label "Market Shock Event"@en .');
    lines.push('');

    lines.push('pdl:Event_InfrastructureFailure a owl:Class ;');
    lines.push('    rdfs:subClassOf pdl:Event ;');
    lines.push('    rdfs:label "Infrastructure Failure Event"@en .');
    lines.push('');

    lines.push('pdl:Event_Regulatory a owl:Class ;');
    lines.push('    rdfs:subClassOf pdl:Event ;');
    lines.push('    rdfs:label "Regulatory Event"@en .');
    lines.push('');

    lines.push('pdl:Event_Geopolitical a owl:Class ;');
    lines.push('    rdfs:subClassOf pdl:Event, coy:SocioPoliticalEvent ;');
    lines.push('    rdfs:label "Geopolitical Event"@en .');
    lines.push('');

    lines.push('pdl:Event_Pandemic a owl:Class ;');
    lines.push('    rdfs:subClassOf pdl:Event ;');
    lines.push('    rdfs:label "Pandemic Event"@en .');
    lines.push('');

    lines.push('pdl:Event_CyberAttack a owl:Class ;');
    lines.push('    rdfs:subClassOf pdl:Event ;');
    lines.push('    rdfs:label "Cyber Attack Event"@en .');
    lines.push('');

    lines.push('pdl:Cascade a owl:Class ;');
    lines.push('    rdfs:label "Cascade"@en .');
    lines.push('');

    lines.push('pdl:TimelineEntry a owl:Class ;');
    lines.push('    rdfs:label "Timeline Entry"@en .');
    lines.push('');

    // Enumerations
    lines.push('# Enumerations');
    lines.push('pdl:Criticality a owl:Class ;');
    lines.push('    rdfs:label "Criticality Level"@en .');
    lines.push('pdl:Criticality_high a pdl:Criticality ;');
    lines.push('    rdfs:label "High Criticality"@en .');
    lines.push('pdl:Criticality_medium a pdl:Criticality ;');
    lines.push('    rdfs:label "Medium Criticality"@en .');
    lines.push('pdl:Criticality_low a pdl:Criticality ;');
    lines.push('    rdfs:label "Low Criticality"@en .');
    lines.push('');

    lines.push('pdl:Severity a owl:Class ;');
    lines.push('    rdfs:label "Severity Level"@en .');
    lines.push('pdl:Severity_critical a pdl:Severity ;');
    lines.push('    rdfs:label "Critical Severity"@en .');
    lines.push('pdl:Severity_high a pdl:Severity ;');
    lines.push('    rdfs:label "High Severity"@en .');
    lines.push('pdl:Severity_medium a pdl:Severity ;');
    lines.push('    rdfs:label "Medium Severity"@en .');
    lines.push('pdl:Severity_low a pdl:Severity ;');
    lines.push('    rdfs:label "Low Severity"@en .');
    lines.push('');

    lines.push('pdl:DependencyType a owl:Class ;');
    lines.push('    rdfs:label "Dependency Type"@en .');
    lines.push('pdl:DependencyType_energy a pdl:DependencyType ;');
    lines.push('    rdfs:label "Energy Dependency"@en .');
    lines.push('pdl:DependencyType_input a pdl:DependencyType ;');
    lines.push('    rdfs:label "Input Dependency"@en .');
    lines.push('pdl:DependencyType_logistics a pdl:DependencyType ;');
    lines.push('    rdfs:label "Logistics Dependency"@en .');
    lines.push('pdl:DependencyType_data a pdl:DependencyType ;');
    lines.push('    rdfs:label "Data Dependency"@en .');
    lines.push('pdl:DependencyType_substitution a pdl:DependencyType ;');
    lines.push('    rdfs:label "Substitution Dependency"@en .');
    lines.push('pdl:DependencyType_demand a pdl:DependencyType ;');
    lines.push('    rdfs:label "Demand Dependency"@en .');
  }

  lines.push('');
  lines.push('# =============================================================================');
  lines.push('# End of Export');
  lines.push('# =============================================================================');

  return lines.join('\n');
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
PDL to RDF/Turtle Converter

Converts PDL YAML files to RDF/Turtle format that conforms to the PDL Ontology
and aligns with the CoyPu ontology (https://schema.coypu.org/global/2.3).

Usage: node pdl-to-rdf.js <pdl-file.yaml> [options]

Options:
  --output, -o <file>      Output file (default: stdout)
  --include-ontology       Include inline ontology definitions for standalone use
  --help, -h               Show this help message

Examples:
  node pdl-to-rdf.js scenarios/s1-soja.pdl.yaml
  node pdl-to-rdf.js scenarios/s1-soja.pdl.yaml -o output.ttl
  node pdl-to-rdf.js scenarios/s1-soja.pdl.yaml --include-ontology -o standalone.ttl

Output includes:
  - PDL-native classes and properties (pdl: namespace)
  - CoyPu-compatible type assertions (coy: namespace)
  - CoyPu-compatible relationships (coy:hasSupplier, coy:hasImpactOn, etc.)
`);
    process.exit(0);
  }

  const inputFile = resolve(args[0]);
  let outputFile = null;
  let includeOntology = args.includes('--include-ontology');

  const outputIdx = args.findIndex(a => a === '--output' || a === '-o');
  if (outputIdx !== -1 && args[outputIdx + 1]) {
    outputFile = resolve(args[outputIdx + 1]);
  }

  try {
    const pdl = loadYamlFile(inputFile);
    const turtle = convertToTurtle(pdl, { includeOntology });

    if (outputFile) {
      writeFileSync(outputFile, turtle, 'utf-8');
      console.error(`RDF/Turtle written to: ${outputFile}`);
    } else {
      console.log(turtle);
    }

  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}

// Export for module use
export { convertToTurtle, loadYamlFile, NAMESPACES, ENTITY_TYPE_TO_COYPU, EVENT_TYPE_TO_COYPU };

// Run if called directly
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main();
}
