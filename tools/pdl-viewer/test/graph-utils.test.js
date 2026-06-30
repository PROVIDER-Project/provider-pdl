import test from "node:test";
import assert from "node:assert/strict";
import {
  parseDurationToDays,
  parsePercentage,
  convertToGraphJson,
  shortestPath
} from "../web/graph-utils.js";

test("parseDurationToDays parses supported units", () => {
  assert.equal(parseDurationToDays("90d"), 90);
  assert.equal(parseDurationToDays("2w"), 14);
  assert.equal(parseDurationToDays("6m"), 180);
  assert.equal(parseDurationToDays("0d"), 0);
  assert.equal(parseDurationToDays("3x"), null);
});

test("parsePercentage parses signed percentages", () => {
  assert.equal(parsePercentage("-40%"), -0.4);
  assert.equal(parsePercentage("+60%"), 0.6);
  assert.equal(parsePercentage("10%"), 0.1);
  assert.equal(parsePercentage("10"), null);
});

test("convertToGraphJson builds nodes and edges including substitutions", () => {
  const pdl = {
    pdl_version: "1.1",
    scenario: { id: "s1", name: "Test" },
    entities: [
      { id: "a", type: "manufacturer", name: "Alpha" },
      { id: "b", type: "commodity", name: "Beta" }
    ],
    supply_chains: [
      {
        id: "c1",
        name: "Chain",
        stages: [["a", "b"]],
        dependencies: [
          {
            from: "a",
            to: "b",
            type: "substitution",
            criticality: "high",
            substitution_ref: "sub1"
          }
        ]
      }
    ],
    substitutions: [
      {
        id: "sub1",
        from: "a",
        to: "b",
        type: "product",
        coverage: 0.4,
        ramp_up: "10d",
        duration_max: "20d",
        activation: { trigger: "e2.active" },
        side_effects: [{ type: "price_pressure", target: "b", magnitude: 0.2 }],
        dependency_overlap: ["a"]
      }
    ],
    events: [
      {
        id: "e1",
        type: "natural_disaster",
        name: "Storm",
        trigger: { target: "a", probability: 0.5 },
        causes: ["e2"],
        impact: { supply: "-10%", duration: "5d" },
        substitution_ref: "sub1"
      },
      {
        id: "e2",
        type: "market_shock",
        name: "Shock"
      }
    ],
    cascades: [
      {
        id: "csc",
        origin: "e1",
        timeline: [{ at: "1d", event: "e2", affects: ["b"] }]
      }
    ]
  };

  const graph = convertToGraphJson(pdl);
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const edgeIds = new Set(graph.edges.map((edge) => edge.id));

  assert.equal(graph.nodes.length, 8);
  assert.equal(graph.edges.length, 14);
  assert.ok(nodeIds.has("entity:a"));
  assert.ok(nodeIds.has("event:e1"));
  assert.ok(nodeIds.has("substitution:sub1"));
  assert.ok(nodeIds.has("cascade:csc"));
  assert.ok(nodeIds.has("timeline:csc-0"));

  assert.ok(edgeIds.has("edge:c1-stage-0"));
  assert.ok(edgeIds.has("edge:c1-dep-sub-0"));
  assert.ok(edgeIds.has("edge:e1-trigger"));
  assert.ok(edgeIds.has("edge:e1-substitution-ref"));
  assert.ok(edgeIds.has("edge:sub1-for"));
  assert.ok(edgeIds.has("edge:sub1-by"));
  assert.ok(edgeIds.has("edge:sub1-activation-0"));
  assert.ok(edgeIds.has("edge:sub1-side-effect-0"));
  assert.ok(edgeIds.has("edge:sub1-overlap-0"));

  const eventNode = graph.nodes.find((node) => node.id === "event:e1");
  assert.equal(eventNode.data.impact_parsed.duration_days, 5);

  const substitutionNode = graph.nodes.find((node) => node.id === "substitution:sub1");
  assert.equal(substitutionNode.data.ramp_up_days, 10);
  assert.equal(substitutionNode.data.duration_max_days, 20);
});

test("shortestPath finds directed path", () => {
  const edges = [
    { id: "e1", from: "a", to: "b" },
    { id: "e2", from: "b", to: "c" },
    { id: "e3", from: "a", to: "d" }
  ];
  const result = shortestPath("a", "c", edges, { directed: true });
  assert.deepEqual(result.nodePath, ["a", "b", "c"]);
  assert.deepEqual(result.edgePath, ["e1", "e2"]);
  assert.equal(shortestPath("c", "a", edges, { directed: true }), null);
});
