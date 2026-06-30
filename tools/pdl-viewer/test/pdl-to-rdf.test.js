import { describe, it } from 'node:test';
import assert from 'node:assert';
import { convertToTurtle, ENTITY_TYPE_TO_COYPU, EVENT_TYPE_TO_COYPU } from '../tools/pdl-to-rdf.js';

// Sample PDL data for testing
const samplePdl = {
  pdl_version: '1.1',
  scenario: {
    id: 'test_scenario',
    name: 'Test Scenario',
    sector: 'agriculture',
    criticality: 'high',
    description: 'A test scenario'
  },
  entities: [
    { id: 'farm_1', type: 'manufacturer', name: 'Test Farm', sector: 'agriculture', location: 'Germany', vulnerability: 0.5 },
    { id: 'port_1', type: 'infrastructure', name: 'Test Port', sector: 'logistics', location: 'Netherlands', vulnerability: 0.3 },
    { id: 'region_1', type: 'region', name: 'Test Region', sector: 'agriculture', location: 'Brazil', vulnerability: 0.6 },
    { id: 'commodity_1', type: 'commodity', name: 'Test Commodity', sector: 'energy', vulnerability: 0.7 },
    { id: 'service_1', type: 'service', name: 'Test Service', sector: 'logistics' }
  ],
  supply_chains: [
    {
      id: 'chain_1',
      name: 'Test Chain',
      stages: [
        ['region_1', 'port_1'],
        ['port_1', 'farm_1']
      ],
      dependencies: [
        { from: 'farm_1', to: 'commodity_1', type: 'energy', criticality: 'high' }
      ]
    }
  ],
  events: [
    {
      id: 'drought_1',
      name: 'Test Drought',
      type: 'natural_disaster',
      trigger: { target: 'region_1', probability: 0.2 },
      impact: { supply: '-30%', duration: '60d' },
      causes: ['price_spike_1'],
      reference: 'Historical data'
    },
    {
      id: 'price_spike_1',
      name: 'Price Spike',
      type: 'market_shock',
      trigger: { target: 'farm_1', condition: 'drought_1.active' },
      impact: { price: '+50%', duration: '90d' }
    },
    {
      id: 'conflict_1',
      name: 'Test Conflict',
      type: 'geopolitical',
      trigger: { target: 'port_1', probability: 0.1 },
      impact: { supply: '-20%', duration: '30d' }
    }
  ],
  cascades: [
    {
      id: 'cascade_1',
      name: 'Test Cascade',
      origin: 'drought_1',
      probability: 0.8,
      validation: { reference: 'Test reference', confidence: 0.9 },
      timeline: [
        { at: '0d', event: 'drought_1', impact: { sector: 'agriculture', severity: 'critical' } },
        { at: '14d', event: 'price_spike_1', impact: { sector: 'agriculture', severity: 'high' }, affects: ['farm_1'] }
      ]
    }
  ]
};

describe('PDL to RDF Converter', () => {

  describe('Namespaces', () => {
    it('should include CoyPu namespace prefix', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /@prefix coy: <https:\/\/schema\.coypu\.org\/global#>/);
    });

    it('should include PDL namespace prefix', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /@prefix pdl: <https:\/\/provider-project\.org\/ontology\/pdl#>/);
    });

    it('should include standard RDF namespaces', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /@prefix rdf:/);
      assert.match(turtle, /@prefix rdfs:/);
      assert.match(turtle, /@prefix owl:/);
      assert.match(turtle, /@prefix xsd:/);
    });
  });

  describe('Ontology Imports', () => {
    it('should declare import of PDL ontology', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /owl:imports <https:\/\/provider-project\.org\/ontology\/pdl>/);
    });

    it('should declare import of CoyPu ontology', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /owl:imports <https:\/\/schema\.coypu\.org\/global\/2\.3>/);
    });
  });

  describe('Entity Type Mappings', () => {
    it('should map manufacturer to coy:Company', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /pdlr:entity_farm_1 a pdl:Manufacturer, coy:Company/);
    });

    it('should map infrastructure to coy:Infrastructure', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /pdlr:entity_port_1 a pdl:Infrastructure, coy:Infrastructure/);
    });

    it('should map region to coy:Region', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /pdlr:entity_region_1 a pdl:Region, coy:Region/);
    });

    it('should map commodity to coy:Commodity', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /pdlr:entity_commodity_1 a pdl:Commodity, coy:Commodity/);
    });

    it('should not add CoyPu class for service (no equivalent)', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /pdlr:entity_service_1 a pdl:Service ;/);
      assert.doesNotMatch(turtle, /pdlr:entity_service_1 a pdl:Service, coy:/);
    });
  });

  describe('Event Type Mappings', () => {
    it('should map natural_disaster to coy:Disaster', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /pdlr:event_drought_1 a pdl:Event, pdl:Event_NaturalDisaster, coy:Disaster/);
    });

    it('should map geopolitical to coy:SocioPoliticalEvent', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /pdlr:event_conflict_1 a pdl:Event, pdl:Event_Geopolitical, coy:SocioPoliticalEvent/);
    });

    it('should not add CoyPu class for market_shock (no equivalent)', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /pdlr:event_price_spike_1 a pdl:Event, pdl:Event_MarketShock ;/);
    });
  });

  describe('CoyPu Supplier/Customer Relationships', () => {
    it('should emit coy:hasSupplier for supply chain stages', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /pdlr:entity_port_1 coy:hasSupplier pdlr:entity_region_1/);
      assert.match(turtle, /pdlr:entity_farm_1 coy:hasSupplier pdlr:entity_port_1/);
    });

    it('should emit coy:hasCustomer for supply chain stages', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /pdlr:entity_region_1 coy:hasCustomer pdlr:entity_port_1/);
      assert.match(turtle, /pdlr:entity_port_1 coy:hasCustomer pdlr:entity_farm_1/);
    });
  });

  describe('CoyPu Impact Relationships', () => {
    it('should emit coy:hasImpactOn for events', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /pdlr:event_drought_1[\s\S]*?coy:hasImpactOn pdlr:entity_region_1/);
    });

    it('should emit coy:isImpactedBy for entities', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /pdlr:entity_region_1 coy:isImpactedBy pdlr:event_drought_1/);
    });
  });

  describe('PDL-specific Properties', () => {
    it('should include vulnerability score', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /pdl:vulnerability "0\.5"\^\^xsd:decimal/);
    });

    it('should include trigger probability', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /pdl:triggerProbability "0\.2"\^\^xsd:decimal/);
    });

    it('should include impact values', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /pdl:impactSupply "-30%"/);
      assert.match(turtle, /pdl:impactPrice "\+50%"/);
      assert.match(turtle, /pdl:impactDuration "60d"/);
    });

    it('should include criticality levels', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /pdl:criticality pdl:Criticality_high/);
    });

    it('should include severity levels in timeline', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /pdl:impactSeverity pdl:Severity_critical/);
      assert.match(turtle, /pdl:impactSeverity pdl:Severity_high/);
    });
  });

  describe('Dependencies', () => {
    it('should create Dependency instances', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /pdlr:dependency_chain_1_1 a pdl:Dependency/);
    });

    it('should include dependency type', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /pdl:dependencyType "energy"/);
    });

    it('should include dependency type reference', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /pdl:dependencyTypeRef pdl:DependencyType_energy/);
    });

    it('should emit pdl:dependsOn relationship', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /pdlr:entity_farm_1 pdl:dependsOn pdlr:entity_commodity_1/);
    });
  });

  describe('Cascades and Timeline', () => {
    it('should create Cascade instances', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /pdlr:cascade_cascade_1 a pdl:Cascade/);
    });

    it('should link cascade to origin event', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /pdl:originEvent pdlr:event_drought_1/);
    });

    it('should include cascade probability', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /pdl:probability "0\.8"\^\^xsd:decimal/);
    });

    it('should create TimelineEntry instances', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /pdlr:timeline_cascade_1_1 a pdl:TimelineEntry/);
      assert.match(turtle, /pdlr:timeline_cascade_1_2 a pdl:TimelineEntry/);
    });

    it('should link timeline entries to events', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /pdl:timelineEvent pdlr:event_drought_1/);
    });

    it('should include affects relationships', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.match(turtle, /pdl:affects pdlr:entity_farm_1/);
    });
  });

  describe('Include Ontology Option', () => {
    it('should include ontology definitions when flag is set', () => {
      const turtle = convertToTurtle(samplePdl, { includeOntology: true });
      assert.match(turtle, /pdl:Scenario a owl:Class/);
      assert.match(turtle, /pdl:Manufacturer a owl:Class/);
      assert.match(turtle, /rdfs:subClassOf pdl:Entity, coy:Company/);
    });

    it('should not include ontology definitions by default', () => {
      const turtle = convertToTurtle(samplePdl);
      assert.doesNotMatch(turtle, /pdl:Scenario a owl:Class/);
    });
  });


  describe('Substitutions (PDL v1.1)', () => {
    const pdlWithSubstitution = {
      ...samplePdl,
      supply_chains: [
        {
          ...samplePdl.supply_chains[0],
          dependencies: [
            {
              ...samplePdl.supply_chains[0].dependencies[0],
              substitution_ref: 'sub_1'
            }
          ]
        }
      ],
      events: samplePdl.events.map((event, index) =>
        index === 1 ? { ...event, substitution_ref: 'sub_1' } : event
      ),
      substitutions: [
        {
          id: 'sub_1',
          from: 'commodity_1',
          to: 'service_1',
          type: 'product',
          direction: 'demand',
          coverage: 0.4,
          quality_delta: -0.1,
          cost_delta: 0.2,
          ramp_up: '14d',
          duration_max: '60d',
          reversible: true,
          activation: {
            trigger: 'price_spike_1.active',
            threshold: {
              price_increase: 0.25,
              duration_min: '7d'
            }
          },
          side_effects: [
            {
              type: 'price_pressure',
              target: 'service_1',
              magnitude: 0.15,
              description: 'Higher demand drives price.'
            }
          ],
          dependency_overlap: ['commodity_1'],
          reference: 'Test substitution reference'
        }
      ]
    };

    it('should emit Substitution instances', () => {
      const turtle = convertToTurtle(pdlWithSubstitution);
      assert.match(turtle, /pdlr:substitution_sub_1 a pdl:Substitution/);
      assert.match(turtle, /pdl:substitutionFor pdlr:entity_commodity_1/);
      assert.match(turtle, /pdl:substitutionBy pdlr:entity_service_1/);
      assert.match(turtle, /pdl:substitutionTypeRef pdl:SubstitutionType_product/);
      assert.match(turtle, /pdl:substitutionDirectionRef pdl:SubstitutionDirection_demand/);
    });

    it('should emit substitution quantitative properties', () => {
      const turtle = convertToTurtle(pdlWithSubstitution);
      assert.match(turtle, /pdl:coverage "0\.4"\^\^xsd:decimal/);
      assert.match(turtle, /pdl:qualityDelta "-0\.1"\^\^xsd:decimal/);
      assert.match(turtle, /pdl:costDelta "0\.2"\^\^xsd:decimal/);
      assert.match(turtle, /pdl:rampUp "14d"/);
      assert.match(turtle, /pdl:durationMax "60d"/);
    });

    it('should emit activation condition and thresholds', () => {
      const turtle = convertToTurtle(pdlWithSubstitution);
      assert.match(turtle, /pdlr:activation_sub_1 a pdl:ActivationCondition/);
      assert.match(turtle, /pdl:activationTrigger "price_spike_1\.active"/);
      assert.match(turtle, /pdl:activationEvent pdlr:event_price_spike_1/);
      assert.match(turtle, /pdl:activationThresholdPriceIncrease "0\.25"\^\^xsd:decimal/);
      assert.match(turtle, /pdl:activationThresholdDurationMin "7d"/);
    });

    it('should emit side effects and substitution references', () => {
      const turtle = convertToTurtle(pdlWithSubstitution);
      assert.match(turtle, /pdlr:sideeffect_sub_1_1 a pdl:SubstitutionSideEffect/);
      assert.match(turtle, /pdl:sideEffectTypeRef pdl:SideEffectType_price_pressure/);
      assert.match(turtle, /pdl:sideEffectTarget pdlr:entity_service_1/);
      assert.match(turtle, /pdl:substitutionRef pdlr:substitution_sub_1/);
    });
  });

  describe('Mapping Constants', () => {
    it('should have correct entity type to CoyPu mappings', () => {
      assert.strictEqual(ENTITY_TYPE_TO_COYPU.manufacturer, 'coy:Company');
      assert.strictEqual(ENTITY_TYPE_TO_COYPU.commodity, 'coy:Commodity');
      assert.strictEqual(ENTITY_TYPE_TO_COYPU.infrastructure, 'coy:Infrastructure');
      assert.strictEqual(ENTITY_TYPE_TO_COYPU.region, 'coy:Region');
      assert.strictEqual(ENTITY_TYPE_TO_COYPU.service, null);
    });

    it('should have correct event type to CoyPu mappings', () => {
      assert.strictEqual(EVENT_TYPE_TO_COYPU.natural_disaster, 'coy:Disaster');
      assert.strictEqual(EVENT_TYPE_TO_COYPU.geopolitical, 'coy:SocioPoliticalEvent');
      assert.strictEqual(EVENT_TYPE_TO_COYPU.market_shock, null);
      assert.strictEqual(EVENT_TYPE_TO_COYPU.pandemic, null);
      assert.strictEqual(EVENT_TYPE_TO_COYPU.cyber_attack, null);
    });
  });
});
