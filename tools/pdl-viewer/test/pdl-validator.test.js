import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const scenarioPath = resolve(__dirname, '../scenarios/s1-soja.pdl.yaml');
const scenarioContent = readFileSync(scenarioPath, 'utf-8');
const scenario = parseYaml(scenarioContent);

describe('PDL Validator - Scenario Structure', () => {
  describe('PDL Version', () => {
    it('should have a valid PDL version', () => {
      assert.ok(scenario.pdl_version, 'pdl_version is required');
      assert.strictEqual(scenario.pdl_version, '1.1', 'pdl_version must be 1.1');
    });
  });

  describe('Scenario Metadata', () => {
    it('should have required scenario fields', () => {
      assert.ok(scenario.scenario, 'scenario is required');
      assert.ok(scenario.scenario.id, 'scenario.id is required');
      assert.ok(scenario.scenario.name, 'scenario.name is required');
      assert.ok(scenario.scenario.sector, 'scenario.sector is required');
      assert.ok(scenario.scenario.criticality, 'scenario.criticality is required');
    });

    it('should have valid scenario ID format', () => {
      assert.match(scenario.scenario.id, /^[a-z][a-z0-9_]*$/, 'scenario.id must be lowercase with underscores');
    });

    it('should have valid criticality level', () => {
      assert.ok(['high', 'medium', 'low'].includes(scenario.scenario.criticality),
        'criticality must be high, medium, or low');
    });
  });

  describe('Entities', () => {
    it('should have entities array', () => {
      assert.ok(Array.isArray(scenario.entities), 'entities must be an array');
      assert.ok(scenario.entities.length > 0, 'entities array should not be empty');
    });

    it('should have required entity fields', () => {
      for (const entity of scenario.entities) {
        assert.ok(entity.id, `entity must have id: ${JSON.stringify(entity)}`);
        assert.ok(entity.type, `entity must have type: ${entity.id}`);
        assert.ok(entity.name, `entity must have name: ${entity.id}`);
        assert.ok(entity.sector, `entity must have sector: ${entity.id}`);
      }
    });

    it('should have valid entity ID formats', () => {
      for (const entity of scenario.entities) {
        assert.match(entity.id, /^[a-z][a-z0-9_]*$/,
          `entity.id must be lowercase with underscores: ${entity.id}`);
      }
    });

    it('should have valid entity types', () => {
      const validTypes = ['manufacturer', 'commodity', 'infrastructure', 'service', 'region'];
      for (const entity of scenario.entities) {
        assert.ok(validTypes.includes(entity.type),
          `entity type must be one of ${validTypes.join(', ')}: ${entity.id} has ${entity.type}`);
      }
    });

    it('should have vulnerability scores in valid range', () => {
      for (const entity of scenario.entities) {
        if (entity.vulnerability !== undefined) {
          assert.ok(entity.vulnerability >= 0 && entity.vulnerability <= 1,
            `vulnerability must be 0-1: ${entity.id} has ${entity.vulnerability}`);
        }
      }
    });

    it('should have unique entity IDs', () => {
      const ids = scenario.entities.map((e) => e.id);
      const uniqueIds = new Set(ids);
      assert.strictEqual(ids.length, uniqueIds.size, 'entity IDs must be unique');
    });
  });

  describe('Supply Chains', () => {
    it('should have supply_chains array', () => {
      assert.ok(Array.isArray(scenario.supply_chains), 'supply_chains must be an array');
    });

    it('should have required supply chain fields', () => {
      for (const chain of scenario.supply_chains) {
        assert.ok(chain.id, 'supply chain must have id');
      }
    });

    it('should have valid stage references', () => {
      const entityIds = new Set(scenario.entities.map((e) => e.id));

      for (const chain of scenario.supply_chains) {
        if (chain.stages) {
          for (const stage of chain.stages) {
            assert.ok(Array.isArray(stage) && stage.length === 2,
              `stage must be [from, to] pair: ${chain.id}`);
            const [from, to] = stage;
            assert.ok(entityIds.has(from),
              `stage 'from' must reference existing entity: ${from} in ${chain.id}`);
            assert.ok(entityIds.has(to),
              `stage 'to' must reference existing entity: ${to} in ${chain.id}`);
          }
        }
      }
    });

    it('should have valid dependency references', () => {
      const entityIds = new Set(scenario.entities.map((e) => e.id));
      const substitutionIds = new Set((scenario.substitutions || []).map((s) => s.id));

      for (const chain of scenario.supply_chains) {
        if (chain.dependencies) {
          for (const dep of chain.dependencies) {
            assert.ok(dep.from, `dependency must have 'from': ${chain.id}`);
            assert.ok(dep.to, `dependency must have 'to': ${chain.id}`);
            assert.ok(dep.type, `dependency must have 'type': ${chain.id}`);
            assert.ok(entityIds.has(dep.from),
              `dependency 'from' must reference existing entity: ${dep.from} in ${chain.id}`);
            assert.ok(entityIds.has(dep.to),
              `dependency 'to' must reference existing entity: ${dep.to} in ${chain.id}`);
            if (dep.substitution_ref) {
              assert.ok(substitutionIds.has(dep.substitution_ref),
                `dependency substitution_ref must reference existing substitution: ${dep.substitution_ref} in ${chain.id}`);
            }
          }
        }
      }
    });
  });

  describe('Substitutions', () => {
    it('should have substitutions array', () => {
      assert.ok(Array.isArray(scenario.substitutions), 'substitutions must be an array');
      assert.ok(scenario.substitutions.length > 0, 'substitutions should not be empty');
    });

    it('should have required substitution fields', () => {
      for (const substitution of scenario.substitutions) {
        assert.ok(substitution.id, 'substitution must have id');
        assert.ok(substitution.from, `substitution must have from: ${substitution.id}`);
        assert.ok(substitution.to, `substitution must have to: ${substitution.id}`);
        assert.ok(substitution.type, `substitution must have type: ${substitution.id}`);
      }
    });

    it('should reference existing entities', () => {
      const entityIds = new Set(scenario.entities.map((e) => e.id));
      for (const substitution of scenario.substitutions) {
        assert.ok(entityIds.has(substitution.from),
          `substitution.from must reference existing entity: ${substitution.id} -> ${substitution.from}`);
        assert.ok(entityIds.has(substitution.to),
          `substitution.to must reference existing entity: ${substitution.id} -> ${substitution.to}`);
      }
    });

    it('should have valid side effect and overlap references', () => {
      const entityIds = new Set(scenario.entities.map((e) => e.id));
      for (const substitution of scenario.substitutions) {
        for (const effect of substitution.side_effects || []) {
          if (effect.target) {
            assert.ok(entityIds.has(effect.target),
              `side_effect target must reference entity: ${substitution.id} -> ${effect.target}`);
          }
        }
        for (const overlap of substitution.dependency_overlap || []) {
          assert.ok(entityIds.has(overlap),
            `dependency_overlap must reference entity: ${substitution.id} -> ${overlap}`);
        }
      }
    });
  });

  describe('Events', () => {
    it('should have events array', () => {
      assert.ok(Array.isArray(scenario.events), 'events must be an array');
    });

    it('should have required event fields', () => {
      for (const event of scenario.events) {
        assert.ok(event.id, 'event must have id');
        assert.ok(event.name, `event must have name: ${event.id}`);
        assert.ok(event.type, `event must have type: ${event.id}`);
        assert.ok(event.trigger, `event must have trigger: ${event.id}`);
      }
    });

    it('should have valid event types', () => {
      const validTypes = [
        'natural_disaster',
        'market_shock',
        'infrastructure_failure',
        'regulatory',
        'geopolitical',
        'pandemic',
        'cyber_attack'
      ];
      for (const event of scenario.events) {
        assert.ok(validTypes.includes(event.type),
          `event type must be valid: ${event.id} has ${event.type}`);
      }
    });

    it('should have valid trigger target references', () => {
      const entityIds = new Set(scenario.entities.map((e) => e.id));

      for (const event of scenario.events) {
        assert.ok(event.trigger.target, `event trigger must have target: ${event.id}`);
        assert.ok(entityIds.has(event.trigger.target),
          `trigger target must reference existing entity: ${event.trigger.target} in ${event.id}`);
      }
    });

    it('should have valid trigger probability range', () => {
      for (const event of scenario.events) {
        if (event.trigger.probability !== undefined) {
          assert.ok(event.trigger.probability >= 0 && event.trigger.probability <= 1,
            `trigger probability must be 0-1: ${event.id} has ${event.trigger.probability}`);
        }
      }
    });

    it('should have valid impact duration format', () => {
      for (const event of scenario.events) {
        if (event.impact && event.impact.duration) {
          assert.match(event.impact.duration, /^[0-9]+[dhwmy]$/,
            `impact duration must match format: ${event.id} has ${event.impact.duration}`);
        }
      }
    });

    it('should have valid impact percentage format', () => {
      for (const event of scenario.events) {
        if (event.impact) {
          for (const field of ['supply', 'demand', 'price']) {
            if (event.impact[field]) {
              assert.match(event.impact[field], /^[+-]?[0-9]+%$/,
                `impact.${field} must be percentage: ${event.id} has ${event.impact[field]}`);
            }
          }
        }
      }
    });

    it('should have valid causes and substitution references', () => {
      const eventIds = new Set(scenario.events.map((e) => e.id));
      const substitutionIds = new Set((scenario.substitutions || []).map((s) => s.id));

      for (const event of scenario.events) {
        if (event.causes) {
          for (const causedId of event.causes) {
            assert.ok(eventIds.has(causedId),
              `causes must reference existing events: ${causedId} in ${event.id}`);
          }
        }
        if (event.substitution_ref) {
          assert.ok(substitutionIds.has(event.substitution_ref),
            `substitution_ref must reference existing substitution: ${event.id} -> ${event.substitution_ref}`);
        }
      }
    });
  });

  describe('Cascades', () => {
    it('should have cascades array', () => {
      assert.ok(Array.isArray(scenario.cascades), 'cascades must be an array');
    });

    it('should have required cascade fields', () => {
      for (const cascade of scenario.cascades) {
        assert.ok(cascade.id, 'cascade must have id');
        assert.ok(cascade.origin, `cascade must have origin: ${cascade.id}`);
        assert.ok(cascade.timeline, `cascade must have timeline: ${cascade.id}`);
      }
    });

    it('should have valid origin and timeline references', () => {
      const eventIds = new Set(scenario.events.map((e) => e.id));
      const entityIds = new Set(scenario.entities.map((e) => e.id));

      for (const cascade of scenario.cascades) {
        assert.ok(eventIds.has(cascade.origin),
          `cascade origin must reference existing event: ${cascade.origin} in ${cascade.id}`);

        for (const entry of cascade.timeline) {
          assert.ok(entry.at, `timeline entry must have 'at': ${cascade.id}`);
          assert.ok(entry.event, `timeline entry must have 'event': ${cascade.id}`);
          assert.match(entry.at, /^[0-9]+[dhwmy]$/,
            `timeline 'at' must be duration format: ${entry.at} in ${cascade.id}`);
          assert.ok(eventIds.has(entry.event),
            `timeline event must reference existing event: ${entry.event} in ${cascade.id}`);

          for (const affectedId of entry.affects || []) {
            assert.ok(entityIds.has(affectedId),
              `affects must reference existing entity: ${affectedId} in ${cascade.id}`);
          }
        }
      }
    });
  });
});

describe('PDL Validator - Sample Scenario Statistics', () => {
  it('should have expected number of entities', () => {
    assert.strictEqual(scenario.entities.length, 20, 'should have 20 entities');
  });

  it('should have expected number of supply chains', () => {
    assert.strictEqual(scenario.supply_chains.length, 5, 'should have 5 supply chains');
  });

  it('should have expected number of substitutions', () => {
    assert.strictEqual((scenario.substitutions || []).length, 6, 'should have 6 substitutions');
  });

  it('should have expected number of events', () => {
    assert.strictEqual(scenario.events.length, 18, 'should have 18 events');
  });

  it('should have expected number of cascades', () => {
    assert.strictEqual(scenario.cascades.length, 3, 'should have 3 cascades');
  });
});
