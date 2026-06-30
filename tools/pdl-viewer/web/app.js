import { parse as parseYaml, stringify as stringifyYaml } from "./vendor/yaml/index.js";
import {
  convertToGraphJson,
  buildAdjacency,
  shortestPath
} from "./graph-utils.js";

const state = {
  graph: null,
  network: null,
  nodesData: null,
  edgesData: null,
  raw: null,
  conflictMode: false,
  savedNodeTypeSelection: null,
  focus: null,
  focusMode: "filter",
  nodeById: new Map(),
  edgeById: new Map(),
  showRawDetails: false,
  selectedNodeId: null,
  selectedNodeType: null,
  supplyMode: "off",
  supplyAdjacency: { upstream: new Map(), downstream: new Map() },
  supplyDim: true,
  rawText: null,
  fileName: null,
  yamlSearch: {
    matches: [],
    index: -1,
    term: ""
  },
  analysis: {
    path: null,
    pathHighlight: false,
    filteredNodes: [],
    filteredEdges: [],
    pathMessage: null,
    nodeLookup: new Map(),
    labelLookup: new Map()
  },
  validation: {
    errors: [],
    warnings: [],
    items: [],
    shaclFindings: [],
    errorNodeIds: new Set(),
    errorEdgeIds: new Set(),
    warningNodeIds: new Set(),
    warningEdgeIds: new Set(),
    schema: null,
    validator: null
  },
  uiState: {
    pending: null,
    applying: false,
    graphScale: 1,
    zoomRaf: null,
    layoutRaf: null,
    renderedNodeIds: new Set(),
    renderedEdgeIds: new Set(),
    ontologyInitialized: false,
    ontoCardsInitialized: false
  }
};

const UNKNOWN_VALUE = "ohne Angabe";

const colors = {
  entity: { background: "#16a34a", border: "#14532d" },
  supply_chain: { background: "#f59e0b", border: "#92400e" },
  substitution: { background: "#2563eb", border: "#1e3a8a" },
  event: { background: "#dc2626", border: "#7f1d1d" },
  cascade: { background: "#7c3aed", border: "#4c1d95" },
  timeline_entry: { background: "#0ea5e9", border: "#0c4a6e" }
};

const edgeColors = {
  contains: "#64748b",
  supply_flow: "#0f766e",
  dependency: "#f97316",
  dependency_substitution: "#3b82f6",
  substitution_ref: "#1d4ed8",
  substitution_for: "#2563eb",
  substitution_by: "#1e40af",
  activation: "#0f766e",
  side_effect: "#f43f5e",
  dependency_overlap: "#64748b",
  triggers: "#ef4444",
  causes: "#9333ea",
  cascade_origin: "#4f46e5",
  sequence: "#0ea5e9",
  affects: "#22c55e"
};

// ── Ontologie-Daten (statisch, aus pdl-ontology.ttl extrahiert) ──────────────
const ONTOLOGY_DATA = {
  coypu: [
    { id: "coy:Company",             label: "coy:Company",             comment: "Unternehmen / Produzent" },
    { id: "coy:Commodity",           label: "coy:Commodity",           comment: "Rohstoff / Produkt" },
    { id: "coy:Infrastructure",      label: "coy:Infrastructure",      comment: "Infrastruktur-Objekt" },
    { id: "coy:Region",              label: "coy:Region",              comment: "Geographische Region" },
    { id: "coy:Event",               label: "coy:Event",               comment: "Ereignis" },
    { id: "coy:Disaster",            label: "coy:Disaster",            comment: "Naturkatastrophe / Störung" },
    { id: "coy:SocioPoliticalEvent", label: "coy:SocioPoliticalEvent", comment: "Geopolitisches Ereignis" },
    { id: "coy:SupplyChainObject",   label: "coy:SupplyChainObject",   comment: "Lieferketten-Objekt (Basis)" }
  ],
  pdl_inherited: [
    { id: "pdl:Manufacturer",         label: "pdl:Manufacturer",         parent: "coy:Company",           rel: "subClassOf",      comment: "Produzent / Hersteller im PDL-Szenario" },
    { id: "pdl:Commodity",            label: "pdl:Commodity",            parent: "coy:Commodity",          rel: "subClassOf",      comment: "Rohstoff oder Vorprodukt" },
    { id: "pdl:Infrastructure",       label: "pdl:Infrastructure",       parent: "coy:Infrastructure",     rel: "subClassOf",      comment: "Physische Infrastruktur" },
    { id: "pdl:Region",               label: "pdl:Region",               parent: "coy:Region",             rel: "subClassOf",      comment: "Region im Lieferkettennetzwerk" },
    { id: "pdl:Event",                label: "pdl:Event",                parent: "coy:Event",              rel: "equivalentClass", comment: "PDL-Ereignis (äquivalent zu coy:Event)" },
    { id: "pdl:Event_NaturalDisaster",label: "pdl:Event_NaturalDisaster",parent: "coy:Disaster",           rel: "subClassOf",      comment: "Naturkatastrophe" },
    { id: "pdl:Event_Geopolitical",   label: "pdl:Event_Geopolitical",   parent: "coy:SocioPoliticalEvent",rel: "subClassOf",      comment: "Geopolitisches Ereignis" },
    { id: "pdl:Substitution",         label: "pdl:Substitution",         parent: "coy:SupplyChainObject",  rel: "subClassOf",      comment: "Substituierungsstrategie (v1.1)" }
  ],
  pdl_new: [
    { id: "pdl:Scenario",                   label: "pdl:Scenario",                   comment: "Container für Disruptionsszenarien" },
    { id: "pdl:Entity",                     label: "pdl:Entity",                     comment: "Basis aller Netzknoten" },
    { id: "pdl:Service",                    label: "pdl:Service",                    comment: "Dienstleistung im Netzwerk" },
    { id: "pdl:SupplyChain",                label: "pdl:SupplyChain",                comment: "Lieferkette mit Stufen und Abhängigkeiten" },
    { id: "pdl:SupplyChainConnection",      label: "pdl:SupplyChainConnection",      comment: "Verbindung zwischen Lieferketten" },
    { id: "pdl:Dependency",                 label: "pdl:Dependency",                 comment: "Abhängigkeit zwischen Entitäten" },
    { id: "pdl:Cascade",                    label: "pdl:Cascade",                    comment: "Kaskaden-Effekt mit Zeitlinie" },
    { id: "pdl:TimelineEntry",              label: "pdl:TimelineEntry",              comment: "Zeitlinieneintrag in einer Kaskade" },
    { id: "pdl:Event_MarketShock",          label: "pdl:Event_MarketShock",          comment: "Marktschock / Preisstoß" },
    { id: "pdl:Event_InfrastructureFailure",label: "pdl:Event_InfrastructureFailure",comment: "Infrastrukturausfall" },
    { id: "pdl:Event_Regulatory",           label: "pdl:Event_Regulatory",           comment: "Regulatorisches Ereignis" },
    { id: "pdl:Event_Pandemic",             label: "pdl:Event_Pandemic",             comment: "Pandemie / Gesundheitskrise" },
    { id: "pdl:Event_CyberAttack",          label: "pdl:Event_CyberAttack",          comment: "Cyberangriff" },
    { id: "pdl:ActivationCondition",        label: "pdl:ActivationCondition",        comment: "Aktivierungsbedingung für Substitution" },
    { id: "pdl:SubstitutionSideEffect",     label: "pdl:SubstitutionSideEffect",     comment: "Nebeneffekt einer Substitution" }
  ],
  pdl_enum: [
    { id: "pdl:SubstitutionType",      label: "pdl:SubstitutionType",      values: ["product","supplier","route","technology","buffer","mode"] },
    { id: "pdl:SubstitutionDirection", label: "pdl:SubstitutionDirection", values: ["supply","demand"] },
    { id: "pdl:Criticality",           label: "pdl:Criticality",           values: ["high","medium","low"] },
    { id: "pdl:Severity",              label: "pdl:Severity",              values: ["critical","high","medium","low"] },
    { id: "pdl:DependencyType",        label: "pdl:DependencyType",        values: ["energy","input","logistics","data","substitution","demand"] }
  ]
};

const pathHighlightPalette = {
  background: "#e0e7ff",
  border: "#4338ca",
  edge: "#4338ca"
};

const warningPalette = {
  background: "#fef3c7",
  border: "#f59e0b",
  edge: "#f59e0b"
};

const errorPalette = {
  background: "#fee2e2",
  border: "#dc2626",
  edge: "#dc2626"
};

const DURATION_PATTERN = /^[0-9]+[dhwmy]$/;
const PERCENT_PATTERN = /^[+-]?[0-9]+%$/;
const CRITICALITY_VALUES = new Set(["high", "medium", "low"]);
const DEPENDENCY_TYPE_VALUES = new Set(["energy", "input", "logistics", "data", "substitution", "demand"]);
const SEVERITY_VALUES = new Set(["critical", "high", "medium", "low"]);
const PRESET_SCENARIO_FILES = [
  "s1-soja.pdl.yaml",
  "s2-halbleiter.pdl.yaml",
  "s3-pharma.pdl.yaml",
  "s4-duengemittel-adblue.pdl.yaml",
  "s5-wasseraufbereitung.pdl.yaml",
  "s6-rechenzentren.pdl.yaml",
  "s7-seltene-erden.pdl.yaml",
  "s8-seefracht.pdl.yaml",
  "s9-unterwasserkabel.pdl.yaml"
];

const elements = {
  fileInput: document.getElementById("fileInput"),
  exampleScenarioSelect: document.getElementById("exampleScenarioSelect"),
  exampleBtn: document.getElementById("exampleBtn"),
  status: document.getElementById("status"),
  fileLabel: document.getElementById("fileLabel"),
  tabGraph: document.getElementById("tabGraph"),
  tabYaml: document.getElementById("tabYaml"),
  tabOntology: document.getElementById("tabOntology"),
  tabAbout: document.getElementById("tabAbout"),
  graphView: document.getElementById("graphView"),
  yamlView: document.getElementById("yamlView"),
  ontologyView: document.getElementById("ontologyView"),
  ontoTabGraph: document.getElementById("ontoTabGraph"),
  ontoTabCards: document.getElementById("ontoTabCards"),
  ontoCardsView: document.getElementById("ontoCardsView"),
  ontoCardsGrid: document.getElementById("ontoCardsGrid"),
  aboutView: document.getElementById("aboutView"),
  yamlTree: document.getElementById("yamlTree"),
  yamlStatus: document.getElementById("yamlStatus"),
  yamlSearch: document.getElementById("yamlSearch"),
  yamlSearchPanel: document.getElementById("yamlSearchPanel"),
  yamlSearchCount: document.getElementById("yamlSearchCount"),
  yamlSearchList: document.getElementById("yamlSearchList"),
  yamlSearchPrev: document.getElementById("yamlSearchPrev"),
  yamlSearchNext: document.getElementById("yamlSearchNext"),
  ontologyStats: document.getElementById("ontologyStats"),
  ontologyImpactStats: document.getElementById("ontologyImpactStats"),
  yamlExpand: document.getElementById("yamlExpand"),
  yamlCollapse: document.getElementById("yamlCollapse"),
  validationStatus: document.getElementById("validationStatus"),
  validationList: document.getElementById("validationList"),
  validationRun: document.getElementById("validationRun"),
  nodeTypeFilters: document.getElementById("nodeTypeFilters"),
  edgeTypeFilters: document.getElementById("edgeTypeFilters"),
  sectorFilterBlock: document.getElementById("sectorFilterBlock"),
  sectorFilters: document.getElementById("sectorFilters"),
  locationFilterBlock: document.getElementById("locationFilterBlock"),
  locationFilters: document.getElementById("locationFilters"),
  criticalityFilterBlock: document.getElementById("criticalityFilterBlock"),
  criticalityFilters: document.getElementById("criticalityFilters"),
  entitySubtypeBlock: document.getElementById("entitySubtypeBlock"),
  entitySubtypeFilters: document.getElementById("entitySubtypeFilters"),
  eventSubtypeBlock: document.getElementById("eventSubtypeBlock"),
  eventSubtypeFilters: document.getElementById("eventSubtypeFilters"),
  conflictMode: document.getElementById("conflictMode"),
  focusLabel: document.getElementById("focusLabel"),
  focusHighlight: document.getElementById("focusHighlight"),
  focusReset: document.getElementById("focusReset"),
  searchInput: document.getElementById("searchInput"),
  stats: document.getElementById("stats"),
  detailsType: document.getElementById("detailsType"),
  detailsTitle: document.getElementById("detailsTitle"),
  detailsContent: document.getElementById("detailsContent"),
  detailsRaw: document.getElementById("detailsRaw"),
  detailsToggle: document.getElementById("detailsToggle"),
  supplyStatus: document.getElementById("supplyStatus"),
  supplyDim: document.getElementById("supplyDim"),
  legend: document.getElementById("legend"),
  graph: document.getElementById("graph"),
  graphScenarioTitle: document.getElementById("graphScenarioTitle"),
  fitBtn: document.getElementById("fitBtn"),
  stabilizeBtn: document.getElementById("stabilizeBtn"),
  exportJson: document.getElementById("exportJson"),
  exportYaml: document.getElementById("exportYaml"),
  exportPng: document.getElementById("exportPng"),
  exportStatus: document.getElementById("exportStatus"),
  analysisStart: document.getElementById("analysisStart"),
  analysisTarget: document.getElementById("analysisTarget"),
  analysisFind: document.getElementById("analysisFind"),
  analysisToggle: document.getElementById("analysisToggle"),
  analysisClear: document.getElementById("analysisClear"),
  analysisResult: document.getElementById("analysisResult"),
  analysisPresets: document.getElementById("analysisPresets"),
  nodeOptions: document.getElementById("nodeOptions"),
  analysisMenuToggle: document.getElementById("analysisMenuToggle"),
  analysisMenu: document.getElementById("analysisMenu"),
  tutorialBtn: document.getElementById("tutorialBtn"),
  tutorialOverlay: document.getElementById("tutorialOverlay"),
  tutorialClose: document.getElementById("tutorialClose"),
  tutorialPrev: document.getElementById("tutorialPrev"),
  tutorialNext: document.getElementById("tutorialNext"),
  tutorialTitle: document.getElementById("tutorialTitle"),
  tutorialBody: document.getElementById("tutorialBody"),
  tutorialStep: document.getElementById("tutorialStep"),
  splashScreen: document.getElementById("splashScreen"),
  splashStartBtn: document.getElementById("splashStartBtn")
};

const LOCATION_FLAG_BY_KEY = {
  germany: "DE",
  brazil: "BR",
  argentina: "AR",
  "united states": "US",
  netherlands: "NL",
  taiwan: "TW",
  "south korea": "KR",
  china: "CN",
  india: "IN",
  egypt: "EG",
  panama: "PA",
  singapore: "SG",
  "south africa": "ZA",
  myanmar: "MM",
  australia: "AU",
  malaysia: "MY",
  "united kingdom": "GB"
};

function countryCodeToFlag(code) {
  if (!code || code.length !== 2) return "";
  const upper = code.toUpperCase();
  return String.fromCodePoint(...Array.from(upper).map((char) => 127397 + char.charCodeAt(0)));
}

const EVENT_BADGE_BY_SUBTYPE = {
  infrastructure_failure: "🏭",
  market_shock: "📉",
  regulatory: "⚖️",
  natural_disaster: "🌪️",
  geopolitical: "🛡️",
  pandemic: "🦠",
  cyber_attack: "💻"
};

const KG_NODE_BADGE = "KG";
const KG_FIELD_LABELS = {
  baci_export_value_kusd: "Exportwert (kUSD)",
  baci_export_volume_t_year: "Exportvolumen (t/Jahr)",
  baci_capacity_t_day: "Kapazität (t/Tag)",
  baci_year: "Jahr",
  baci_country: "Land",
  baci_hs4_codes: "HS4-Codes",
  baci_coverage_formula: "Coverage-Formel",
  wpi_locode: "LOCODE",
  wpi_repair_class: "Repair-Klasse",
  wpi_port_size: "Portgröße",
  wpi_capacity_factor: "Kapazitätsfaktor",
  wpi_kg_uri: "WPI URI",
  wpi_note: "WPI Hinweis",
  exiobase_uri: "EXIOBASE URI",
  exiobase_type: "EXIOBASE Typ",
  exiobase_oilseed_coeff_total: "Oilseed-Koeffizient",
  exiobase_top_supplier: "Top Supplier",
  exiobase_parametrizer: "Parametrizer",
  exiobase_note: "EXIOBASE Hinweis",
  origin: "Origin",
  country: "Land",
  hs4: "HS4",
  intervention_type: "Intervention",
  direction: "Richtung",
  p_red_per_year: "p (pro Jahr)",
  extracted: "Extrahiert"
};

function getEventBadge(subtype) {
  if (!subtype || typeof subtype !== "string") return "";
  return EVENT_BADGE_BY_SUBTYPE[subtype] || "⚠️";
}

function getLocationBadge(location) {
  if (!location || typeof location !== "string") return "";
  const key = location.trim().toLowerCase();
  if (key === "eu" || key === "europe") return "🇪🇺";
  if (key === "global" || key === "eurasia") return "🌍";
  if (key === "atlantic" || key === "indian ocean" || key === "baltic sea") return "🌊";
  const code = LOCATION_FLAG_BY_KEY[key];
  if (!code) return "📍";
  return countryCodeToFlag(code) || "📍";
}

function isRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function hasRecordEntries(value) {
  return isRecord(value) && Object.keys(value).length > 0;
}

function hasRenderableValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function filterRows(rows) {
  return rows.filter(([, value]) => hasRenderableValue(value));
}

function formatKgFieldLabel(key) {
  if (KG_FIELD_LABELS[key]) return KG_FIELD_LABELS[key];
  return key.replace(/_/g, " ");
}

function buildRowsFromKeys(source, keys) {
  if (!isRecord(source)) return [];
  return filterRows(keys.map((key) => [formatKgFieldLabel(key), source[key]]));
}

function buildRowsByPrefix(source, prefix) {
  if (!isRecord(source)) return [];
  return filterRows(
    Object.keys(source)
      .filter((key) => key.startsWith(prefix))
      .sort()
      .map((key) => [formatKgFieldLabel(key), source[key]])
  );
}

function hasKnowledgeGraphData(nodeOrData) {
  const data = nodeOrData?.data && isRecord(nodeOrData.data) ? nodeOrData.data : nodeOrData;
  if (!isRecord(data)) return false;
  return hasRecordEntries(data._kg_source) || hasRecordEntries(data.extra);
}

function getKnowledgeGraphSourceKinds(data) {
  if (!isRecord(data)) return [];
  const kinds = [];
  const source = hasRecordEntries(data._kg_source) ? data._kg_source : null;
  const extra = hasRecordEntries(data.extra) ? data.extra : null;

  if (extra && Object.keys(extra).some((key) => key.startsWith("baci_"))) {
    kinds.push("BACI");
  }
  if (source) {
    if (Object.keys(source).some((key) => key.startsWith("wpi_"))) kinds.push("WPI");
    if (Object.keys(source).some((key) => key.startsWith("exiobase_"))) kinds.push("EXIOBASE");
    if (
      source.origin && String(source.origin).toLowerCase().includes("gta")
      || source.intervention_type
      || source.hs4
    ) {
      kinds.push("GTA");
    }
    if (Object.keys(source).some((key) => key.startsWith("baci_")) && !kinds.includes("BACI")) {
      kinds.push("BACI");
    }
  }

  return kinds;
}

function buildKnowledgeGraphSections(data) {
  if (!isRecord(data)) return [];

  const sections = [];
  const sourceKinds = getKnowledgeGraphSourceKinds(data);
  if (sourceKinds.length) {
    sections.push(renderSection("KG-Quelle", [["Datentyp", sourceKinds.join(", ")]]));
  }

  const extra = hasRecordEntries(data.extra) ? data.extra : null;
  const source = hasRecordEntries(data._kg_source) ? data._kg_source : null;

  if (extra) {
    const baciRows = buildRowsFromKeys(extra, [
      "baci_country",
      "baci_year",
      "baci_export_value_kusd",
      "baci_export_volume_t_year",
      "baci_capacity_t_day",
      "baci_hs4_codes"
    ]);
    if (baciRows.length) {
      sections.push(renderSection("KG-Quelle · BACI", baciRows));
    }
  }

  if (source) {
    const consumedKeys = new Set();
    const consume = (keys) => keys.forEach((key) => consumedKeys.add(key));

    const wpiKeys = [
      "wpi_locode",
      "wpi_port_size",
      "wpi_repair_class",
      "wpi_capacity_factor",
      "wpi_kg_uri",
      "wpi_note"
    ];
    const wpiRows = buildRowsFromKeys(source, wpiKeys);
    if (wpiRows.length) {
      sections.push(renderSection("KG-Quelle · WPI", wpiRows));
      consume(wpiKeys);
    }

    const exiobaseKeys = [
      "exiobase_uri",
      "exiobase_type",
      "exiobase_oilseed_coeff_total",
      "exiobase_top_supplier",
      "exiobase_parametrizer",
      "exiobase_note"
    ];
    const exiobaseRows = buildRowsFromKeys(source, exiobaseKeys);
    if (exiobaseRows.length) {
      sections.push(renderSection("KG-Quelle · EXIOBASE", exiobaseRows));
      consume(exiobaseKeys);
    }

    const gtaKeys = [
      "origin",
      "country",
      "hs4",
      "intervention_type",
      "direction",
      "p_red_per_year",
      "extracted"
    ];
    const gtaRows = buildRowsFromKeys(source, gtaKeys);
    if (gtaRows.length) {
      sections.push(renderSection("KG-Quelle · GTA", gtaRows));
      consume(gtaKeys);
    }

    const baciDerivedRows = buildRowsByPrefix(source, "baci_");
    if (baciDerivedRows.length) {
      sections.push(renderSection("KG-Quelle · BACI (abgeleitet)", baciDerivedRows));
      Object.keys(source).forEach((key) => {
        if (key.startsWith("baci_")) consumedKeys.add(key);
      });
    }

    const otherRows = filterRows(
      Object.keys(source)
        .filter((key) => !consumedKeys.has(key))
        .sort()
        .map((key) => [formatKgFieldLabel(key), source[key]])
    );
    if (otherRows.length) {
      sections.push(renderSection("KG-Quelle · Weitere Felder", otherRows));
    }
  }

  return sections.filter(Boolean);
}

function addVisualStyles(graph) {
  const entityIds = new Set(
    graph.nodes.filter((node) => node.type === "entity").map((node) => node.id)
  );
  const entityDegree = new Map();
  entityIds.forEach((id) => entityDegree.set(id, 0));

  graph.edges.forEach((edge) => {
    if (entityIds.has(edge.from)) {
      entityDegree.set(edge.from, (entityDegree.get(edge.from) || 0) + 1);
    }
    if (entityIds.has(edge.to)) {
      entityDegree.set(edge.to, (entityDegree.get(edge.to) || 0) + 1);
    }
  });

  const logDegrees = Array.from(entityDegree.values(), (degree) => Math.log1p(degree));
  const minLogDegree = logDegrees.length ? Math.min(...logDegrees) : 0;
  const maxLogDegree = logDegrees.length ? Math.max(...logDegrees) : 0;
  const entityMinSize = 16;
  const entityMaxSize = 28;

  function getEntitySize(nodeId) {
    const degree = entityDegree.get(nodeId) || 0;
    const logDegree = Math.log1p(degree);
    if (maxLogDegree === minLogDegree) {
      return (entityMinSize + entityMaxSize) / 2;
    }
    const normalized = (logDegree - minLogDegree) / (maxLogDegree - minLogDegree);
    return entityMinSize + normalized * (entityMaxSize - entityMinSize);
  }

  graph.nodes = graph.nodes.map((node) => {
    const palette = colors[node.type] || colors.entity;
    const isScenario = node.type === "scenario";
    const isTimeline = node.type === "timeline_entry";
    const hasKgData = hasKnowledgeGraphData(node);
    const nodeLabel = node.label || node.id;
    const locationBadge = getLocationBadge(node.data?.location);
    const eventBadge = node.type === "event" ? getEventBadge(node.subtype) : "";
    const kgBadge = hasKgData ? KG_NODE_BADGE : "";
    const badgePrefix = [eventBadge, locationBadge, kgBadge].filter(Boolean).join(" ");
    const baseLabel = badgePrefix ? badgePrefix + " " + nodeLabel : nodeLabel;
    const nodeColor = hasKgData ? { ...palette, border: "#1d4ed8" } : palette;
    const styled = {
      ...node,
      label: baseLabel,
      _baseLabel: baseLabel,
      shape: isScenario ? "box" : "dot",
      size: isScenario
        ? 26
        : isTimeline
          ? 10
          : node.type === "entity"
            ? getEntitySize(node.id)
            : node.type === "event"
              ? 9.8
              : 14,
      color: nodeColor,
      font: {
        color: "#0b1220",
        face: "Space Grotesk",
        size: badgePrefix ? 17 : 15
      },
      borderWidth: isScenario ? 2 : hasKgData ? 2 : 1,
      shadow: hasKgData
        ? {
            enabled: true,
            color: "rgba(29, 78, 216, 0.22)",
            size: 14,
            x: 0,
            y: 0
          }
        : undefined,
      title: buildTooltip(node)
    };
    styled._style = {
      color: styled.color,
      font: styled.font,
      borderWidth: styled.borderWidth,
      size: styled.size
    };
    return styled;
  });

  graph.edges = graph.edges.map((edge) => {
    const color = edgeColors[edge.type] || "#334155";
    const styled = {
      ...edge,
      arrows: "to",
      color: { color, highlight: color },
      width: edge.type === "supply_flow" ? 2 : 1,
      dashes: edge.type === "dependency" || edge.type === "dependency_overlap",
      font: {
        color: "#0b1220",
        face: "Space Grotesk",
        size: 13
      }
    };
    styled._style = {
      color: styled.color,
      width: styled.width,
      dashes: styled.dashes,
      font: styled.font
    };
    return styled;
  });
}

function buildTooltip(node) {
  const lines = [
    String(node.label || node.id),
    "Typ: " + node.type
  ];
  if (node.subtype) {
    lines.push("Subtyp: " + node.subtype);
  }
  if (node.data?.sector) {
    lines.push("Sektor: " + node.data.sector);
  }
  if (node.data?.location) {
    lines.push("Ort: " + node.data.location);
  }
  if (node.type === "substitution") {
    if (node.data?.from) lines.push("Von: " + node.data.from);
    if (node.data?.to) lines.push("Nach: " + node.data.to);
    if (node.data?.coverage !== undefined) lines.push("Coverage: " + node.data.coverage);
  }
  if (hasKnowledgeGraphData(node)) {
    const kinds = getKnowledgeGraphSourceKinds(node.data);
    lines.push("KG: " + (kinds.length ? kinds.join(", ") : "angereichert"));
  }
  return lines.join("\n");
}

function getNodeSector(node) {
  return node.data?.sector ?? node.data?.impact?.sector ?? null;
}

function getNodeLocation(node) {
  return node.data?.location ?? null;
}

function getNodeCriticality(node) {
  return node.data?.criticality ?? null;
}

function setsEqual(left, right) {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function findNodeTypeInput(type) {
  const inputs = Array.from(elements.nodeTypeFilters?.querySelectorAll("input[type=checkbox]") || []);
  return inputs.find((input) => input.value === type) || null;
}

function toggleNodeTypeFromLegend(type) {
  const input = findNodeTypeInput(type);
  if (!input || input.disabled) return;
  input.checked = !input.checked;
  applyFilters();
}

function updateLegendState() {
  const items = elements.legend?.querySelectorAll(".legend-item") || [];
  items.forEach((item) => {
    const type = item.dataset.type;
    const input = findNodeTypeInput(type);
    const isActive = input ? input.checked : true;
    item.classList.toggle("inactive", !isActive);
    const button = item.querySelector("button");
    if (button) button.disabled = Boolean(input && input.disabled);
  });
}

function renderLegend() {
  elements.legend.innerHTML = "";
  Object.entries(colors).forEach(([type, palette]) => {
    const li = document.createElement("li");
    li.className = "legend-item";
    li.dataset.type = type;
    li.innerHTML = `<button class="legend-button" type="button"><span><span class="swatch" style="background:${palette.background};border:1px solid ${palette.border}"></span>${type}</span></button>`;
    const button = li.querySelector("button");
    button?.addEventListener("click", () => toggleNodeTypeFromLegend(type));
    elements.legend.appendChild(li);
  });
  const kgLi = document.createElement("li");
  kgLi.className = "legend-item static";
  kgLi.innerHTML = `<div class="legend-button"><span><span class="legend-icon-badge">KG</span>KG-angereicherte Knoten</span></div>`;
  elements.legend.appendChild(kgLi);
  updateLegendState();
}

function createCheckboxList(container, values, labelMap = {}) {
  container.innerHTML = "";
  values.forEach((value) => {
    const label = document.createElement("label");
    label.className = "filter-item";
    label.innerHTML = `<input type="checkbox" value="${value}" checked /> ${labelMap[value] || value}`;
    container.appendChild(label);
  });
}

function gatherFilters(container) {
  return new Set(
    Array.from(container.querySelectorAll("input[type=checkbox]")
    ).filter((input) => input.checked).map((input) => input.value)
  );
}

function setNodeTypeSelection(values) {
  elements.nodeTypeFilters.querySelectorAll("input[type=checkbox]").forEach((input) => {
    input.checked = values.has(input.value);
    input.disabled = false;
  });
}

function setConflictMode(enabled) {
  const conflictTypes = new Set(["event", "cascade", "timeline_entry"]);
  state.conflictMode = enabled;

  if (enabled) {
    state.savedNodeTypeSelection = gatherFilters(elements.nodeTypeFilters);
    elements.nodeTypeFilters.querySelectorAll("input[type=checkbox]").forEach((input) => {
      const shouldShow = conflictTypes.has(input.value);
      input.checked = shouldShow;
      input.disabled = !shouldShow;
    });
  } else {
    if (state.savedNodeTypeSelection) {
      setNodeTypeSelection(state.savedNodeTypeSelection);
    }
    elements.nodeTypeFilters.querySelectorAll("input[type=checkbox]").forEach((input) => {
      input.disabled = false;
    });
  }
}

function setFocusEvent(eventNode) {
  if (!state.raw) return;
  const eventId = eventNode.id.replace("event:", "");
  const cascades = (state.raw.cascades || []).filter((cascade) => {
    if (cascade.origin === eventId) return true;
    return (cascade.timeline || []).some((entry) => entry.event === eventId);
  });
  const cascadeIds = new Set(cascades.map((cascade) => cascade.id));
  const originIds = new Set(cascades.map((cascade) => cascade.origin).filter(Boolean));
  const eventIds = new Set([eventId, ...originIds]);
  cascades.forEach((cascade) => {
    (cascade.timeline || []).forEach((entry) => {
      if (entry.event) eventIds.add(entry.event);
    });
  });
  state.focus = {
    eventId,
    cascadeIds,
    originIds,
    eventIds,
    label: eventNode.label || eventId
  };
}

function clearFocus() {
  state.focus = null;
  updateFocusUI();
}

function updateFocusUI() {
  if (!elements.focusLabel || !elements.focusReset) return;
  if (!state.focus) {
    elements.focusLabel.textContent = "Pfad-Fokus: aus";
    elements.focusReset.disabled = true;
    return;
  }
  const cascadeCount = state.focus.cascadeIds.size;
  elements.focusLabel.textContent = `Pfad-Fokus: ${state.focus.label} (${cascadeCount} Kaskade${cascadeCount === 1 ? "" : "n"})`;
  elements.focusReset.disabled = false;
}

function isNodeInFocus(node, focus) {
  if (!focus) return false;
  if (node.type === "cascade") {
    return focus.cascadeIds.has(node.data?.id || node.id.replace("cascade:", ""));
  }
  if (node.type === "timeline_entry") {
    return focus.cascadeIds.has(node.data?.cascade_id);
  }
  if (node.type === "event") {
    const id = node.id.replace("event:", "");
    return focus.eventIds.has(id);
  }
  return false;
}

function dimNode(node) {
  return {
    ...node,
    color: {
      background: "rgba(15, 23, 42, 0.08)",
      border: "rgba(15, 23, 42, 0.22)"
    },
    font: {
      ...node.font,
      color: "rgba(15, 23, 42, 0.35)"
    },
    borderWidth: 1,
    size: Math.max(8, (node.size || 12) - 2)
  };
}

function dimEdge(edge) {
  return {
    ...edge,
    color: { color: "rgba(15, 23, 42, 0.18)", highlight: "rgba(15, 23, 42, 0.25)" },
    width: 1,
    dashes: true,
    font: {
      ...edge.font,
      color: "rgba(15, 23, 42, 0.35)"
    }
  };
}

function highlightNode(node) {
  return {
    ...node,
    borderWidth: (node.borderWidth || 1) + 3,
    size: (node.size || 12) + 4,
    color: {
      background: "#fff7ed",
      border: "#f97316",
      highlight: { background: "#ffedd5", border: "#fb923c" },
      hover: { background: "#ffedd5", border: "#fb923c" }
    },
    shadow: {
      enabled: true,
      color: "rgba(249, 115, 22, 0.75)",
      size: 26,
      x: 0,
      y: 0
    }
  };
}

function highlightEdge(edge) {
  return {
    ...edge,
    width: (edge.width || 1) + 3,
    color: { color: "#f97316", highlight: "#fb923c" },
    shadow: {
      enabled: true,
      color: "rgba(249, 115, 22, 0.7)",
      size: 20,
      x: 0,
      y: 0
    }
  };
}

function highlightPathNode(node) {
  return {
    ...node,
    borderWidth: (node.borderWidth || 1) + 2,
    color: {
      ...node.color,
      border: pathHighlightPalette.border
    },
    shadow: {
      enabled: true,
      color: "rgba(67, 56, 202, 0.45)",
      size: 22,
      x: 0,
      y: 0
    }
  };
}

function highlightPathEdge(edge) {
  return {
    ...edge,
    width: (edge.width || 1) + 2,
    color: { color: pathHighlightPalette.edge, highlight: pathHighlightPalette.edge }
  };
}

function applyWarningNode(node) {
  return {
    ...node,
    borderWidth: (node.borderWidth || 1) + 1,
    color: {
      ...node.color,
      border: warningPalette.border
    }
  };
}

function applyErrorNode(node) {
  return {
    ...node,
    borderWidth: (node.borderWidth || 1) + 2,
    color: {
      ...node.color,
      border: errorPalette.border
    }
  };
}

function applyWarningEdge(edge) {
  return {
    ...edge,
    width: (edge.width || 1) + 1,
    color: { color: warningPalette.edge, highlight: warningPalette.edge },
    dashes: true
  };
}

function applyErrorEdge(edge) {
  return {
    ...edge,
    width: (edge.width || 1) + 2,
    color: { color: errorPalette.edge, highlight: errorPalette.edge },
    dashes: true
  };
}

function scheduleApplyFilters() {
  if (state.uiState.zoomRaf) return;
  state.uiState.zoomRaf = requestAnimationFrame(() => {
    state.uiState.zoomRaf = null;
    applyFilters();
  });
}

function scheduleLayoutStabilization(iterations = 140) {
  if (!state.network) return;
  if (state.uiState.layoutRaf) return;
  state.uiState.layoutRaf = requestAnimationFrame(() => {
    state.uiState.layoutRaf = null;
    stabilizeNetworkLayout(iterations);
  });
}

function getLabelThreshold(nodeType) {
  if (nodeType === "scenario") return 0;
  if (nodeType === "entity" || nodeType === "event") return 0.35;
  if (nodeType === "substitution") return 0.45;
  if (nodeType === "cascade" || nodeType === "supply_chain") return 0.55;
  return 0.75;
}

function applyLabelDensity(nodes) {
  const scale = state.uiState.graphScale || 1;
  return nodes.map((node) => {
    const baseLabel = node._baseLabel || node.label || node.id;
    const shouldShow = node.id === state.selectedNodeId || scale >= getLabelThreshold(node.type);
    return {
      ...node,
      label: shouldShow ? baseLabel : ""
    };
  });
}

function getTopConnectedNodeIds(nodes, edges, limit = 3) {
  if (!nodes.length || limit <= 0) return [];

  const degree = new Map(nodes.map((node) => [node.id, 0]));
  edges.forEach((edge) => {
    if (degree.has(edge.from)) degree.set(edge.from, (degree.get(edge.from) || 0) + 1);
    if (degree.has(edge.to)) degree.set(edge.to, (degree.get(edge.to) || 0) + 1);
  });

  const typeRank = {
    entity: 0,
    event: 1,
    substitution: 2,
    cascade: 3,
    supply_chain: 4,
    timeline_entry: 5,
    scenario: 6
  };

  const ranked = nodes
    .filter((node) => node.type !== "scenario")
    .map((node) => ({
      id: node.id,
      type: node.type,
      degree: degree.get(node.id) || 0
    }));

  const candidates = ranked.length
    ? ranked
    : nodes.map((node) => ({ id: node.id, type: node.type, degree: degree.get(node.id) || 0 }));

  candidates.sort((a, b) => {
    if (b.degree !== a.degree) return b.degree - a.degree;
    const rankA = typeRank[a.type] ?? 99;
    const rankB = typeRank[b.type] ?? 99;
    if (rankA !== rankB) return rankA - rankB;
    return a.id.localeCompare(b.id);
  });

  return candidates.slice(0, limit).map((entry) => entry.id);
}
function applyFilters() {
  if (!state.graph) return;
  const nodeTypes = gatherFilters(elements.nodeTypeFilters);
  const edgeTypes = gatherFilters(elements.edgeTypeFilters);
  const sectorFilters = gatherFilters(elements.sectorFilters);
  const locationFilters = gatherFilters(elements.locationFilters);
  const criticalityFilters = gatherFilters(elements.criticalityFilters);
  const entitySubtypes = gatherFilters(elements.entitySubtypeFilters);
  const eventSubtypes = gatherFilters(elements.eventSubtypeFilters);
  const sectorInputs = elements.sectorFilters.querySelectorAll("input");
  const locationInputs = elements.locationFilters.querySelectorAll("input");
  const criticalityInputs = elements.criticalityFilters.querySelectorAll("input");
  const entitySubtypeInputs = elements.entitySubtypeFilters.querySelectorAll("input");
  const eventSubtypeInputs = elements.eventSubtypeFilters.querySelectorAll("input");
  const searchTerm = (elements.searchInput?.value || "").trim().toLowerCase();

  const filteredNodes = state.graph.nodes.filter((node) => {
    if (!nodeTypes.has(node.type)) return false;
    if (node.type === "entity" && entitySubtypeInputs.length && node.subtype) {
      if (!entitySubtypes.has(node.subtype)) return false;
    }
    if (node.type === "event" && eventSubtypeInputs.length && node.subtype) {
      if (!eventSubtypes.has(node.subtype)) return false;
    }
    if (sectorInputs.length) {
      const sector = getNodeSector(node) ?? UNKNOWN_VALUE;
      if (!sectorFilters.has(sector)) return false;
    }
    if (locationInputs.length) {
      const location = getNodeLocation(node) ?? UNKNOWN_VALUE;
      if (!locationFilters.has(location)) return false;
    }
    if (criticalityInputs.length) {
      const criticality = getNodeCriticality(node) ?? UNKNOWN_VALUE;
      if (!criticalityFilters.has(criticality)) return false;
    }
    if (searchTerm) {
      const hay = `${node.label ?? ""} ${node.id ?? ""}`.toLowerCase();
      if (!hay.includes(searchTerm)) return false;
    }
    return true;
  });
  const nodeIds = new Set(filteredNodes.map((node) => node.id));
  const filteredEdges = state.graph.edges.filter((edge) => {
    if (!edgeTypes.has(edge.type)) return false;
    return nodeIds.has(edge.from) && nodeIds.has(edge.to);
  });

  const nextNodeIds = new Set(filteredNodes.map((node) => node.id));
  const nextEdgeIds = new Set(filteredEdges.map((edge) => edge.id));
  const topologyChanged =
    !setsEqual(state.uiState.renderedNodeIds, nextNodeIds) ||
    !setsEqual(state.uiState.renderedEdgeIds, nextEdgeIds);

  state.analysis.filteredNodes = filteredNodes;
  state.analysis.filteredEdges = filteredEdges;

  const nodesToRender = filteredNodes.map((node) => ({ ...node }));
  const edgesToRender = filteredEdges.map((edge) => ({ ...edge }));

  const supplyHighlight = getSupplyHighlight();
  const applySupplyDim = supplyHighlight && state.supplyDim;
  let finalNodes = supplyHighlight
    ? nodesToRender.map((node) => {
        if (supplyHighlight.nodeIds.has(node.id)) return highlightSupplyNode(node);
        return applySupplyDim ? dimNode(node) : node;
      })
    : nodesToRender;
  let finalEdges = supplyHighlight
    ? edgesToRender.map((edge) => {
        if (supplyHighlight.edgeIds.has(edge.id)) return highlightSupplyEdge(edge);
        return applySupplyDim ? dimEdge(edge) : edge;
      })
    : edgesToRender;

  if (state.validation.errorNodeIds.size) {
    finalNodes = finalNodes.map((node) =>
      state.validation.errorNodeIds.has(node.id) ? applyErrorNode(node) : node
    );
  }
  if (state.validation.errorEdgeIds.size) {
    finalEdges = finalEdges.map((edge) =>
      state.validation.errorEdgeIds.has(edge.id) ? applyErrorEdge(edge) : edge
    );
  }

  if (state.validation.warningNodeIds.size) {
    finalNodes = finalNodes.map((node) =>
      state.validation.warningNodeIds.has(node.id) ? applyWarningNode(node) : node
    );
  }
  if (state.validation.warningEdgeIds.size) {
    finalEdges = finalEdges.map((edge) =>
      state.validation.warningEdgeIds.has(edge.id) ? applyWarningEdge(edge) : edge
    );
  }

  if (state.analysis.pathHighlight && state.analysis.path) {
    finalNodes = finalNodes.map((node) =>
      state.analysis.path.nodeIds.has(node.id) ? highlightPathNode(node) : node
    );
    finalEdges = finalEdges.map((edge) =>
      state.analysis.path.edgeIds.has(edge.id) ? highlightPathEdge(edge) : edge
    );
  }

  const medalIcons = ["🥇", "🥈", "🥉"];
  const topNodeIds = getTopConnectedNodeIds(finalNodes, finalEdges, medalIcons.length);
  if (topNodeIds.length) {
    const medalByNodeId = new Map(topNodeIds.map((id, index) => [id, medalIcons[index]]));
    finalNodes = finalNodes.map((node) => {
      const medal = medalByNodeId.get(node.id);
      if (!medal) return node;
      const baseLabel = node._baseLabel || node.label || node.id;
      return {
        ...node,
        _baseLabel: medal + " " + baseLabel
      };
    });
  }

  finalNodes = applyLabelDensity(finalNodes);

  const currentPositions = state.network
    ? state.network.getPositions(finalNodes.map((node) => node.id))
    : {};
  finalNodes = finalNodes.map((node) => {
    const pos = currentPositions[node.id];
    return pos ? { ...node, x: pos.x, y: pos.y } : node;
  });

  state.nodesData.clear();
  state.edgesData.clear();
  state.nodesData.add(finalNodes);
  state.edgesData.add(finalEdges);

  updatePathVisibility(nodeIds, new Set(filteredEdges.map((edge) => edge.id)));
  updateStats(state.analysis.filteredNodes, state.analysis.filteredEdges);
  updateLegendState();

  state.uiState.renderedNodeIds = nextNodeIds;
  state.uiState.renderedEdgeIds = nextEdgeIds;
  if (topologyChanged) {
    scheduleLayoutStabilization(140);
  }

  updateUrlState();
}

function buildImpactSummary(nodes) {
  const impacts = {
    supply: [],
    demand: [],
    price: [],
    duration: []
  };
  nodes.forEach((node) => {
    if (node.type !== "event") return;
    const impact = node.data?.impact_parsed;
    if (!impact) return;
    if (impact.supply_decimal !== null && impact.supply_decimal !== undefined) impacts.supply.push(impact.supply_decimal);
    if (impact.demand_decimal !== null && impact.demand_decimal !== undefined) impacts.demand.push(impact.demand_decimal);
    if (impact.price_decimal !== null && impact.price_decimal !== undefined) impacts.price.push(impact.price_decimal);
    if (impact.duration_days !== null && impact.duration_days !== undefined) impacts.duration.push(impact.duration_days);
  });

  const avg = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);
  const formatPct = (value) => {
    if (value === null || value === undefined) return null;
    const pct = value * 100;
    const rounded = Math.round(pct * 10) / 10;
    const sign = rounded > 0 ? "+" : "";
    return `${sign}${rounded}%`;
  };
  const formatDays = (value) => {
    if (value === null || value === undefined) return null;
    const rounded = Math.round(value * 10) / 10;
    return `${rounded}d`;
  };

  const supply = formatPct(avg(impacts.supply));
  const demand = formatPct(avg(impacts.demand));
  const price = formatPct(avg(impacts.price));
  const duration = formatDays(avg(impacts.duration));

  const parts = [];
  if (supply) parts.push(`Supply ${supply}`);
  if (demand) parts.push(`Demand ${demand}`);
  if (price) parts.push(`Preis ${price}`);
  if (duration) parts.push(`Dauer ${duration}`);
  return parts.length ? parts.join(" · ") : null;
}

function updateStats(nodes = [], edges = []) {
  if (!state.graph) {
    elements.stats.textContent = "";
    return;
  }
  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  const typeCounts = new Map();
  const subtypeCounts = new Map();
  const nodeIdSet = new Set(nodes.map((node) => node.id));

  nodes.forEach((node) => {
    typeCounts.set(node.type, (typeCounts.get(node.type) || 0) + 1);
    if (node.subtype) {
      const key = `${node.type}:${node.subtype}`;
      subtypeCounts.set(key, (subtypeCounts.get(key) || 0) + 1);
    }
  });

  const degree = new Map();
  edges.forEach((edge) => {
    degree.set(edge.from, (degree.get(edge.from) || 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) || 0) + 1);
  });
  const topDegree = Array.from(degree.entries())
    .filter(([id]) => nodeIdSet.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => `${getNodeLabelById(id)} (${count})`);

  const impactSummary = buildImpactSummary(nodes);
  const subtypeList = Array.from(subtypeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([key, count]) => {
      const [type, subtype] = key.split(":");
      return `${type}.${subtype} (${count})`;
    });

  elements.stats.innerHTML = `
    <div>Knoten: <strong>${nodeCount}</strong></div>
    <div>Kanten: <strong>${edgeCount}</strong></div>
    <div class="stat-title">Typen</div>
    <ul>${Array.from(typeCounts.entries())
      .map(([type, count]) => `<li>${type}: ${count}</li>`)
      .join("")}</ul>
    ${subtypeList.length ? `<div class="stat-title">Subtypen</div><ul>${subtypeList.map((item) => `<li>${item}</li>`).join("")}</ul>` : ""}
    <div class="stat-title">Top Grad</div>
    <ul>${topDegree.length ? topDegree.map((item) => `<li>${item}</li>`).join("") : "<li>—</li>"}</ul>
    <div class="stat-title">Impact</div>
    <div>${impactSummary || "—"}</div>
  `;
}

function countByType(type) {
  if (!state.graph) return 0;
  return state.graph.nodes.filter((node) => node.type === type).length;
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.style.color = isError ? "#b91c1c" : "#4b5563";
}

function setGraphScenarioTitle(scenario) {
  if (!elements.graphScenarioTitle) return;
  const title = scenario?.name || scenario?.title || scenario?.id || "";
  if (!title) {
    elements.graphScenarioTitle.textContent = "";
    elements.graphScenarioTitle.classList.add("hidden");
    return;
  }
  elements.graphScenarioTitle.textContent = title;
  elements.graphScenarioTitle.classList.remove("hidden");
}

function setDetails(payload) {
  elements.detailsRaw.textContent = payload;
}

function renderDetailsEmpty() {
  elements.detailsType.textContent = "—";
  elements.detailsTitle.textContent = "Klick auf einen Knoten oder eine Kante";
  elements.detailsContent.innerHTML = "<p class=\"details-empty\">Wähle ein Element im Graphen aus, um Details zu sehen.</p>";
  elements.detailsRaw.textContent = "";
  elements.detailsRaw.classList.add("hidden");
  state.showRawDetails = false;
  elements.detailsToggle.textContent = "JSON";
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function renderRows(rows) {
  if (!rows.length) return "";
  return `<div class="details-rows">${rows
    .map(([label, value]) => `<div class="detail-row"><span>${label}</span><span>${formatValue(value)}</span></div>`)
    .join("")}</div>`;
}

function renderSection(title, rows) {
  if (!rows.length) return "";
  return `<div class="details-section"><h4>${title}</h4>${renderRows(rows)}</div>`;
}

function renderExplanation(text) {
  if (!text) return "";
  return `<div class="details-explanation">${text}</div>`;
}

function normalizeKey(value) {
  return value ? value.trim().toLowerCase() : "";
}

function updateNodeOptions() {
  if (!elements.nodeOptions || !state.graph) return;
  elements.nodeOptions.innerHTML = "";
  state.analysis.nodeLookup = new Map();
  state.analysis.labelLookup = new Map();
  state.graph.nodes.forEach((node) => {
    state.analysis.nodeLookup.set(node.id, node);
    const labelKey = normalizeKey(node.label || "");
    if (labelKey && !state.analysis.labelLookup.has(labelKey)) {
      state.analysis.labelLookup.set(labelKey, node.id);
    }
    const idKey = normalizeKey(node.id);
    if (idKey && !state.analysis.labelLookup.has(idKey)) {
      state.analysis.labelLookup.set(idKey, node.id);
    }
    const option = document.createElement("option");
    option.value = node.id;
    option.label = node.label ? `${node.label} (${node.id})` : node.id;
    elements.nodeOptions.appendChild(option);
  });
}

function renderAnalysisPresets(presets) {
  if (!elements.analysisPresets) return;
  elements.analysisPresets.innerHTML = "";
  if (!presets.length) {
    const empty = document.createElement("span");
    empty.className = "status";
    empty.textContent = "Keine Presets verfügbar.";
    elements.analysisPresets.appendChild(empty);
    return;
  }
  presets.forEach((preset) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = preset.label;
    button.addEventListener("click", () => {
      if (elements.analysisStart) elements.analysisStart.value = preset.startId;
      if (elements.analysisTarget) elements.analysisTarget.value = preset.targetId;
      runPathAnalysis();
    });
    elements.analysisPresets.appendChild(button);
  });
}

function updateAnalysisPresets() {
  if (!state.graph) return;
  const presets = [];
  const nodes = state.graph.nodes;
  const edges = state.graph.edges;
  const degree = new Map();
  edges.forEach((edge) => {
    degree.set(edge.from, (degree.get(edge.from) || 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) || 0) + 1);
  });

  const ranked = nodes
    .map((node) => ({ id: node.id, label: getNodeLabelById(node.id), score: degree.get(node.id) || 0, type: node.type }))
    .sort((a, b) => b.score - a.score);
  const topCandidates = ranked.slice(0, 8);
  let topPair = null;
  for (let i = 0; i < topCandidates.length && !topPair; i += 1) {
    for (let j = 0; j < topCandidates.length && !topPair; j += 1) {
      if (i === j) continue;
      const start = topCandidates[i].id;
      const target = topCandidates[j].id;
      if (shortestPath(start, target, edges, { directed: true })) {
        topPair = { start, target, label: `Top Grad: ${topCandidates[i].label} → ${topCandidates[j].label}` };
      }
    }
  }
  if (topPair) {
    presets.push({
      label: topPair.label,
      startId: topPair.start,
      targetId: topPair.target
    });
  }

  const firstTrigger = (state.raw?.events || []).find((event) => event.trigger?.target);
  if (firstTrigger) {
    const startId = `event:${firstTrigger.id}`;
    const targetId = `entity:${firstTrigger.trigger.target}`;
    if (shortestPath(startId, targetId, edges, { directed: true })) {
      presets.push({
        label: `Trigger: ${firstTrigger.id} → ${firstTrigger.trigger.target}`,
        startId,
        targetId
      });
    }
  }

  const cascade = (state.raw?.cascades || []).find((c) => c.origin && c.timeline?.length);
  if (cascade) {
    const lastIndex = cascade.timeline.length - 1;
    const startId = `event:${cascade.origin}`;
    const targetId = `timeline:${cascade.id}-${lastIndex}`;
    if (shortestPath(startId, targetId, edges, { directed: true })) {
      presets.push({
        label: `Cascade: ${cascade.origin} → Schritt ${lastIndex + 1}`,
        startId,
        targetId
      });
    }
  }

  renderAnalysisPresets(presets.slice(0, 3));
}

function resolveNodeInput(value) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (state.analysis.nodeLookup.has(trimmed)) return trimmed;
  const key = normalizeKey(trimmed);
  return state.analysis.labelLookup.get(key) || null;
}

function setAnalysisResult(message, isError = false) {
  if (!elements.analysisResult) return;
  elements.analysisResult.textContent = message;
  elements.analysisResult.style.color = isError ? "#b91c1c" : "#4b5563";
}

function updatePathControls() {
  if (!elements.analysisToggle || !elements.analysisClear) return;
  const hasPath = Boolean(state.analysis.path);
  elements.analysisToggle.disabled = !hasPath;
  elements.analysisClear.disabled = !hasPath;
  if (!hasPath) {
    elements.analysisToggle.textContent = "Pfad hervorheben";
    return;
  }
  elements.analysisToggle.textContent = state.analysis.pathHighlight ? "Hervorhebung aus" : "Pfad hervorheben";
}

function updatePathVisibility(visibleNodeIds, visibleEdgeIds) {
  if (!state.analysis.path) return;
  const totalNodes = state.analysis.path.nodeIds.size;
  const totalEdges = state.analysis.path.edgeIds.size;
  const visibleNodes = Array.from(state.analysis.path.nodeIds).filter((id) => visibleNodeIds.has(id)).length;
  const visibleEdges = Array.from(state.analysis.path.edgeIds).filter((id) => visibleEdgeIds.has(id)).length;
  const visibilityNote =
    visibleNodes !== totalNodes || visibleEdges !== totalEdges
      ? `Sichtbar: ${visibleNodes}/${totalNodes} Knoten, ${visibleEdges}/${totalEdges} Kanten`
      : "Pfad vollständig sichtbar";
  const highlightNote = state.analysis.pathHighlight ? "Hervorhebung aktiv" : "Hervorhebung aus";
  const base = state.analysis.pathMessage || "Pfad gefunden";
  setAnalysisResult(`${base} · ${visibilityNote} · ${highlightNote}`);
}

function runPathAnalysis() {
  if (!state.graph) return;
  const startValue = elements.analysisStart?.value || "";
  const targetValue = elements.analysisTarget?.value || "";
  const startId = resolveNodeInput(startValue);
  const targetId = resolveNodeInput(targetValue);

  if (!startId || !targetId) {
    setAnalysisResult("Bitte gültigen Start- und Zielknoten wählen.", true);
    return;
  }

  const result = shortestPath(startId, targetId, state.graph.edges, { directed: true });
  if (!result) {
    state.analysis.path = null;
    state.analysis.pathHighlight = false;
    updatePathControls();
    setAnalysisResult("Kein gerichteter Pfad gefunden.", true);
    applyFilters();
    return;
  }

  state.analysis.path = {
    nodeIds: new Set(result.nodePath),
    edgeIds: new Set(result.edgePath),
    nodePath: result.nodePath,
    edgePath: result.edgePath
  };
  state.analysis.pathHighlight = true;
  state.analysis.pathMessage = `Pfad gefunden (${result.edgePath.length} Kanten): ${result.nodePath
    .map((id) => getNodeLabelById(id))
    .join(" → ")}`;
  updatePathControls();
  applyFilters();
}

function clearPathAnalysis() {
  state.analysis.path = null;
  state.analysis.pathHighlight = false;
  state.analysis.pathMessage = null;
  updatePathControls();
  setAnalysisResult("Noch keine Analyse.");
  applyFilters();
}

function togglePathHighlight() {
  if (!state.analysis.path) return;
  state.analysis.pathHighlight = !state.analysis.pathHighlight;
  updatePathControls();
  applyFilters();
}

function setValidationStatus(message, isError = false) {
  if (!elements.validationStatus) return;
  elements.validationStatus.textContent = message;
  elements.validationStatus.style.color = isError ? "#b91c1c" : "#4b5563";
}

function focusValidationNode(nodeId) {
  if (!nodeId) return false;
  const node = state.nodeById.get(nodeId);
  if (!node) return false;

  setActiveTab("graph");
  state.selectedNodeId = node.id;
  state.selectedNodeType = node.type;
  updateSupplyUI();
  renderDetailsSelection(node);
  applyFilters();

  const visible = state.nodesData?.get(node.id);
  if (visible && state.network) {
    state.network.selectNodes([node.id]);
    state.network.focus(node.id, { scale: 1.12, animation: true });
    return true;
  }
  return false;
}

function focusValidationEdge(edgeId) {
  if (!edgeId) return false;
  const edge = state.edgeById.get(edgeId);
  if (!edge) return false;

  setActiveTab("graph");
  state.selectedNodeId = null;
  state.selectedNodeType = null;
  updateSupplyUI();
  renderDetailsSelection(edge);
  applyFilters();

  if (!state.network) return true;
  const visible = state.edgesData?.get(edge.id);
  if (visible) {
    state.network.unselectAll();
    state.network.selectEdges([edge.id]);
    if (state.nodesData?.get(edge.from)) {
      state.network.focus(edge.from, { scale: 1.06, animation: true });
    } else if (state.nodesData?.get(edge.to)) {
      state.network.focus(edge.to, { scale: 1.06, animation: true });
    }
    return true;
  }
  return false;
}

function focusValidationItem(item) {
  if (!item) return;
  const edgeFocused = item.edgeId ? focusValidationEdge(item.edgeId) : false;
  const nodeFocused = !edgeFocused && item.nodeId ? focusValidationNode(item.nodeId) : false;
  if (!edgeFocused && !nodeFocused) {
    setValidationStatus("Eintrag hat keinen sichtbaren Graph-Bezug (evtl. durch Filter ausgeblendet).");
  }
}

function renderValidation() {
  if (!elements.validationList || !elements.validationStatus) return;
  elements.validationList.innerHTML = "";
  const items = state.validation.items || [];
  if (!items.length) {
    setValidationStatus("Validierung: ok (Schema, Semantik, SHACL)");
    return;
  }

  const errors = items.filter((item) => item.level === "error").length;
  const warnings = items.filter((item) => item.level !== "error").length;
  const shaclIssues = items.filter((item) => item.source === "shacl").length;
  setValidationStatus(
    `Validierung: ${errors} Fehler, ${warnings} Warnungen${shaclIssues ? ` · SHACL ${shaclIssues}` : ""}`,
    errors > 0
  );

  items.forEach((item) => {
    const sourceLabel = item.source === "schema" ? "Schema" : item.source === "shacl" ? "SHACL" : "Semantik";
    const levelLabel = item.level === "error" ? "Fehler" : "Warnung";
    const target =
      item.nodeId
        ? `Knoten: ${getNodeLabelById(item.nodeId)}`
        : item.edgeId
          ? `Kante: ${item.edgeId}`
          : null;
    const meta = [item.path ? `Pfad: ${item.path}` : null, target].filter(Boolean).join(" · ");

    const li = document.createElement("li");
    li.className = item.level === "error" ? "error" : "warn";
    if (item.source === "shacl") li.classList.add("shacl");

    const button = document.createElement("button");
    button.type = "button";
    button.className = "validation-item-btn";
    button.disabled = !item.nodeId && !item.edgeId;

    const head = document.createElement("span");
    head.className = "validation-item-head";
    head.textContent = `${sourceLabel} · ${levelLabel}`;
    button.appendChild(head);

    const text = document.createElement("span");
    text.className = "validation-item-text";
    text.textContent = item.message;
    button.appendChild(text);

    if (meta) {
      const metaLine = document.createElement("span");
      metaLine.className = "validation-item-meta";
      metaLine.textContent = meta;
      button.appendChild(metaLine);
    }

    if (!button.disabled) {
      button.addEventListener("click", () => focusValidationItem(item));
    }

    li.appendChild(button);
    elements.validationList.appendChild(li);
  });
}

async function loadSchema() {
  if (state.validation.schema) return state.validation.schema;
  const candidates = [
    new URL("../schemas/pdl-schema.json", window.location.href).toString(),
    new URL("./schemas/pdl-schema.json", window.location.href).toString(),
    new URL("../../schemas/pdl-schema.json", window.location.href).toString()
  ];
  for (const url of candidates) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        state.validation.schema = await response.json();
        return state.validation.schema;
      }
    } catch (error) {
      console.warn("Schema fetch failed", error);
    }
  }
  return null;
}

async function ensureValidator() {
  if (state.validation.validator) return state.validation.validator;
  if (!window.Ajv) return null;
  const schema = await loadSchema();
  if (!schema) return null;
  const ajv = new window.Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
  if (window.ajvFormats) {
    window.ajvFormats(ajv);
  }
  state.validation.validator = ajv.compile(schema);
  return state.validation.validator;
}

function extractEventIdsFromTrigger(triggerExpression) {
  if (!triggerExpression || typeof triggerExpression !== "string") return [];
  const ids = new Set();
  const pattern = /\b([a-z][a-z0-9_]*)\.active\b/g;
  let match = pattern.exec(triggerExpression);
  while (match) {
    ids.add(match[1]);
    match = pattern.exec(triggerExpression);
  }
  return Array.from(ids);
}

function makeValidationItem({
  source = "semantic",
  level = "warn",
  message,
  path = null,
  nodeId = null,
  edgeId = null
}) {
  return { source, level, message, path, nodeId, edgeId };
}

function checkReferences(pdl) {
  const issues = [];
  const entityIds = new Set((pdl.entities || []).map((entity) => entity.id));
  const eventIds = new Set((pdl.events || []).map((event) => event.id));
  const substitutionIds = new Set((pdl.substitutions || []).map((item) => item.id));

  (pdl.supply_chains || []).forEach((chain, chainIdx) => {
    (chain.stages || []).forEach((stage, idx) => {
      const [from, to] = stage;
      if (!entityIds.has(from) || !entityIds.has(to)) {
        issues.push({
          message: `Supply-Chain ${chain.id}: Stage ${idx + 1} verweist auf unbekannte Entity.`,
          path: `supply_chains[${chainIdx}].stages[${idx}]`,
          nodeId: `chain:${chain.id}`,
          edgeId: `edge:${chain.id}-stage-${idx}`
        });
      }
    });
    (chain.dependencies || []).forEach((dep, idx) => {
      if (!entityIds.has(dep.from) || !entityIds.has(dep.to)) {
        issues.push({
          message: `Supply-Chain ${chain.id}: Dependency ${idx + 1} verweist auf unbekannte Entity.`,
          path: `supply_chains[${chainIdx}].dependencies[${idx}]`,
          nodeId: `chain:${chain.id}`,
          edgeId: `edge:${chain.id}-dep-${idx}`
        });
      }
      if (dep.substitution_ref && !substitutionIds.has(dep.substitution_ref)) {
        issues.push({
          message: `Supply-Chain ${chain.id}: Dependency ${idx + 1} hat unbekannte substitution_ref ${dep.substitution_ref}.`,
          path: `supply_chains[${chainIdx}].dependencies[${idx}].substitution_ref`,
          nodeId: `chain:${chain.id}`,
          edgeId: `edge:${chain.id}-dep-sub-${idx}`
        });
      }
    });
  });

  (pdl.events || []).forEach((event, eventIdx) => {
    if (event.trigger?.target && !entityIds.has(event.trigger.target)) {
      issues.push({
        message: `Event ${event.id}: Trigger-Target ${event.trigger.target} existiert nicht.`,
        path: `events[${eventIdx}].trigger.target`,
        nodeId: `event:${event.id}`,
        edgeId: `edge:${event.id}-trigger`
      });
    }
    (event.causes || []).forEach((causeId, idx) => {
      if (!eventIds.has(causeId)) {
        issues.push({
          message: `Event ${event.id}: Cause ${causeId} existiert nicht.`,
          path: `events[${eventIdx}].causes[${idx}]`,
          nodeId: `event:${event.id}`,
          edgeId: `edge:${event.id}-causes-${idx}`
        });
      }
    });
    if (event.substitution_ref && !substitutionIds.has(event.substitution_ref)) {
      issues.push({
        message: `Event ${event.id}: substitution_ref ${event.substitution_ref} existiert nicht.`,
        path: `events[${eventIdx}].substitution_ref`,
        nodeId: `event:${event.id}`,
        edgeId: `edge:${event.id}-substitution-ref`
      });
    }
  });

  (pdl.substitutions || []).forEach((substitution, subIdx) => {
    if (substitution.from && !entityIds.has(substitution.from)) {
      issues.push({
        message: `Substitution ${substitution.id}: from ${substitution.from} existiert nicht.`,
        path: `substitutions[${subIdx}].from`,
        nodeId: `substitution:${substitution.id}`,
        edgeId: `edge:${substitution.id}-for`
      });
    }

    if (substitution.to && !entityIds.has(substitution.to)) {
      issues.push({
        message: `Substitution ${substitution.id}: to ${substitution.to} existiert nicht.`,
        path: `substitutions[${subIdx}].to`,
        nodeId: `substitution:${substitution.id}`,
        edgeId: `edge:${substitution.id}-by`
      });
    }

    const triggerEvents = extractEventIdsFromTrigger(substitution.activation?.trigger);
    triggerEvents.forEach((eventId, idx) => {
      if (!eventIds.has(eventId)) {
        issues.push({
          message: `Substitution ${substitution.id}: activation.trigger referenziert unbekanntes Event ${eventId}.`,
          path: `substitutions[${subIdx}].activation.trigger`,
          nodeId: `substitution:${substitution.id}`,
          edgeId: `edge:${substitution.id}-activation-${idx}`
        });
      }
    });

    (substitution.side_effects || []).forEach((sideEffect, idx) => {
      if (sideEffect.target && !entityIds.has(sideEffect.target)) {
        issues.push({
          message: `Substitution ${substitution.id}: side_effect target ${sideEffect.target} existiert nicht.`,
          path: `substitutions[${subIdx}].side_effects[${idx}].target`,
          nodeId: `substitution:${substitution.id}`,
          edgeId: `edge:${substitution.id}-side-effect-${idx}`
        });
      }
    });

    (substitution.dependency_overlap || []).forEach((entityId, idx) => {
      if (!entityIds.has(entityId)) {
        issues.push({
          message: `Substitution ${substitution.id}: dependency_overlap ${entityId} existiert nicht.`,
          path: `substitutions[${subIdx}].dependency_overlap[${idx}]`,
          nodeId: `substitution:${substitution.id}`,
          edgeId: `edge:${substitution.id}-overlap-${idx}`
        });
      }
    });
  });

  (pdl.cascades || []).forEach((cascade, cascadeIdx) => {
    if (cascade.origin && !eventIds.has(cascade.origin)) {
      issues.push({
        message: `Cascade ${cascade.id}: Origin ${cascade.origin} existiert nicht.`,
        path: `cascades[${cascadeIdx}].origin`,
        nodeId: `cascade:${cascade.id}`,
        edgeId: `edge:${cascade.id}-origin`
      });
    }
    (cascade.timeline || []).forEach((entry, idx) => {
      const timelineNodeId = `timeline:${cascade.id}-${idx}`;
      if (entry.event && !eventIds.has(entry.event)) {
        issues.push({
          message: `Cascade ${cascade.id}: Timeline-Event ${entry.event} existiert nicht.`,
          path: `cascades[${cascadeIdx}].timeline[${idx}].event`,
          nodeId: timelineNodeId,
          edgeId: `edge:${cascade.id}-seq-${idx}`
        });
      }
      (entry.affects || []).forEach((entityId) => {
        if (!entityIds.has(entityId)) {
          issues.push({
            message: `Cascade ${cascade.id}: Affects ${entityId} existiert nicht.`,
            path: `cascades[${cascadeIdx}].timeline[${idx}].affects`,
            nodeId: timelineNodeId,
            edgeId: `edge:${cascade.id}-${idx}-affects-${entityId}`
          });
        }
      });
    });
  });

  return issues;
}

function checkShaclConstraints(pdl) {
  const findings = [];
  const entityIds = new Set((pdl.entities || []).map((entity) => entity.id));
  const eventIds = new Set((pdl.events || []).map((event) => event.id));
  const substitutionIds = new Set((pdl.substitutions || []).map((item) => item.id));

  const addFinding = ({
    message,
    path,
    nodeId = null,
    edgeId = null,
    level = "error"
  }) => {
    findings.push(
      makeValidationItem({
        source: "shacl",
        level,
        message,
        path,
        nodeId,
        edgeId
      })
    );
  };

  if (!CRITICALITY_VALUES.has(pdl?.scenario?.criticality)) {
    addFinding({
      message: "Scenario criticality muss high, medium oder low sein.",
      path: "scenario.criticality",
      level: "error"
    });
  }

  (pdl.entities || []).forEach((entity, entityIdx) => {
    const nodeId = `entity:${entity.id}`;
    if (entity.vulnerability !== undefined && (typeof entity.vulnerability !== "number" || entity.vulnerability < 0 || entity.vulnerability > 1)) {
      addFinding({
        message: `Entity ${entity.id}: vulnerability muss im Bereich [0, 1] liegen.`,
        path: `entities[${entityIdx}].vulnerability`,
        nodeId
      });
    }
    if (entity.substitution_potential !== undefined && (typeof entity.substitution_potential !== "number" || entity.substitution_potential < 0 || entity.substitution_potential > 1)) {
      addFinding({
        message: `Entity ${entity.id}: substitution_potential muss im Bereich [0, 1] liegen.`,
        path: `entities[${entityIdx}].substitution_potential`,
        nodeId
      });
    }
  });

  (pdl.supply_chains || []).forEach((chain, chainIdx) => {
    const chainNodeId = `chain:${chain.id}`;
    (chain.dependencies || []).forEach((dep, depIdx) => {
      const depEdgeId = `edge:${chain.id}-dep-${depIdx}`;
      if (!dep.from || !entityIds.has(dep.from)) {
        addFinding({
          message: `Dependency ${chain.id}/${depIdx + 1}: fromEntity muss auf eine vorhandene Entity zeigen.`,
          path: `supply_chains[${chainIdx}].dependencies[${depIdx}].from`,
          nodeId: chainNodeId,
          edgeId: depEdgeId
        });
      }
      if (!dep.to || !entityIds.has(dep.to)) {
        addFinding({
          message: `Dependency ${chain.id}/${depIdx + 1}: toEntity muss auf eine vorhandene Entity zeigen.`,
          path: `supply_chains[${chainIdx}].dependencies[${depIdx}].to`,
          nodeId: chainNodeId,
          edgeId: depEdgeId
        });
      }
      if (!DEPENDENCY_TYPE_VALUES.has(dep.type)) {
        addFinding({
          message: `Dependency ${chain.id}/${depIdx + 1}: type muss eine erlaubte DependencyType-Ausprägung sein.`,
          path: `supply_chains[${chainIdx}].dependencies[${depIdx}].type`,
          nodeId: chainNodeId,
          edgeId: depEdgeId
        });
      }
      if (dep.criticality !== undefined && !CRITICALITY_VALUES.has(dep.criticality)) {
        addFinding({
          message: `Dependency ${chain.id}/${depIdx + 1}: criticality muss high, medium oder low sein.`,
          path: `supply_chains[${chainIdx}].dependencies[${depIdx}].criticality`,
          nodeId: chainNodeId,
          edgeId: depEdgeId
        });
      }
      if (dep.substitution_ref && !substitutionIds.has(dep.substitution_ref)) {
        addFinding({
          message: `Dependency ${chain.id}/${depIdx + 1}: substitution_ref muss auf eine vorhandene Substitution zeigen.`,
          path: `supply_chains[${chainIdx}].dependencies[${depIdx}].substitution_ref`,
          nodeId: chainNodeId,
          edgeId: `edge:${chain.id}-dep-sub-${depIdx}`
        });
      }
    });
  });

  (pdl.events || []).forEach((event, eventIdx) => {
    const eventNodeId = `event:${event.id}`;
    const triggerPath = `events[${eventIdx}].trigger`;

    if (!event.trigger?.target) {
      addFinding({
        message: `Event ${event.id}: trigger.target ist erforderlich.`,
        path: `${triggerPath}.target`,
        nodeId: eventNodeId
      });
    } else if (!entityIds.has(event.trigger.target)) {
      addFinding({
        message: `Event ${event.id}: trigger.target muss auf eine vorhandene Entity zeigen.`,
        path: `${triggerPath}.target`,
        nodeId: eventNodeId,
        edgeId: `edge:${event.id}-trigger`
      });
    }

    if (event.trigger?.probability !== undefined) {
      const probability = event.trigger.probability;
      if (typeof probability !== "number" || probability < 0 || probability > 1) {
        addFinding({
          message: `Event ${event.id}: trigger.probability muss im Bereich [0, 1] liegen.`,
          path: `${triggerPath}.probability`,
          nodeId: eventNodeId
        });
      }
    }

    const impact = event.impact || {};
    if (impact.supply !== undefined && !PERCENT_PATTERN.test(String(impact.supply))) {
      addFinding({
        message: `Event ${event.id}: impact.supply muss als Prozentwert formatiert sein (z. B. -30%).`,
        path: `events[${eventIdx}].impact.supply`,
        nodeId: eventNodeId
      });
    }
    if (impact.demand !== undefined && !PERCENT_PATTERN.test(String(impact.demand))) {
      addFinding({
        message: `Event ${event.id}: impact.demand muss als Prozentwert formatiert sein (z. B. +15%).`,
        path: `events[${eventIdx}].impact.demand`,
        nodeId: eventNodeId
      });
    }
    if (impact.price !== undefined && !PERCENT_PATTERN.test(String(impact.price))) {
      addFinding({
        message: `Event ${event.id}: impact.price muss als Prozentwert formatiert sein (z. B. +25%).`,
        path: `events[${eventIdx}].impact.price`,
        nodeId: eventNodeId
      });
    }
    if (impact.duration !== undefined && !DURATION_PATTERN.test(String(impact.duration))) {
      addFinding({
        message: `Event ${event.id}: impact.duration muss dem Format 14d/2w/6m entsprechen.`,
        path: `events[${eventIdx}].impact.duration`,
        nodeId: eventNodeId
      });
    }

    (event.causes || []).forEach((causeId, causeIdx) => {
      if (!eventIds.has(causeId)) {
        addFinding({
          message: `Event ${event.id}: causes[${causeIdx}] verweist auf ein unbekanntes Event.`,
          path: `events[${eventIdx}].causes[${causeIdx}]`,
          nodeId: eventNodeId,
          edgeId: `edge:${event.id}-causes-${causeIdx}`
        });
      }
    });

    if (event.substitution_ref && !substitutionIds.has(event.substitution_ref)) {
      addFinding({
        message: `Event ${event.id}: substitution_ref muss auf eine vorhandene Substitution zeigen.`,
        path: `events[${eventIdx}].substitution_ref`,
        nodeId: eventNodeId,
        edgeId: `edge:${event.id}-substitution-ref`
      });
    }
  });

  (pdl.substitutions || []).forEach((substitution, subIdx) => {
    const substitutionNodeId = `substitution:${substitution.id}`;
    if (!substitution.from || !entityIds.has(substitution.from)) {
      addFinding({
        message: `Substitution ${substitution.id}: substitutionFor muss auf eine vorhandene Entity zeigen.`,
        path: `substitutions[${subIdx}].from`,
        nodeId: substitutionNodeId,
        edgeId: `edge:${substitution.id}-for`
      });
    }
    if (!substitution.to || !entityIds.has(substitution.to)) {
      addFinding({
        message: `Substitution ${substitution.id}: substitutionBy muss auf eine vorhandene Entity zeigen.`,
        path: `substitutions[${subIdx}].to`,
        nodeId: substitutionNodeId,
        edgeId: `edge:${substitution.id}-by`
      });
    }
    if (substitution.from && substitution.to && substitution.from === substitution.to) {
      addFinding({
        message: `Substitution ${substitution.id}: substitutionFor und substitutionBy müssen unterschiedliche Entities sein.`,
        path: `substitutions[${subIdx}]`,
        nodeId: substitutionNodeId
      });
    }
    if (substitution.coverage !== undefined && (typeof substitution.coverage !== "number" || substitution.coverage < 0 || substitution.coverage > 1)) {
      addFinding({
        message: `Substitution ${substitution.id}: coverage muss im Bereich [0, 1] liegen.`,
        path: `substitutions[${subIdx}].coverage`,
        nodeId: substitutionNodeId
      });
    }
    if (substitution.ramp_up && !DURATION_PATTERN.test(String(substitution.ramp_up))) {
      addFinding({
        message: `Substitution ${substitution.id}: ramp_up muss dem Format 14d/2w/6m entsprechen.`,
        path: `substitutions[${subIdx}].ramp_up`,
        nodeId: substitutionNodeId
      });
    }
    if (substitution.duration_max && !DURATION_PATTERN.test(String(substitution.duration_max))) {
      addFinding({
        message: `Substitution ${substitution.id}: duration_max muss dem Format 14d/2w/6m entsprechen.`,
        path: `substitutions[${subIdx}].duration_max`,
        nodeId: substitutionNodeId
      });
    }

    const activation = substitution.activation || {};
    if (activation.threshold?.price_increase !== undefined) {
      const value = activation.threshold.price_increase;
      if (typeof value !== "number" || value < 0 || value > 1) {
        addFinding({
          message: `Substitution ${substitution.id}: activation.threshold.price_increase muss im Bereich [0, 1] liegen.`,
          path: `substitutions[${subIdx}].activation.threshold.price_increase`,
          nodeId: substitutionNodeId
        });
      }
    }
    if (activation.threshold?.supply_drop !== undefined) {
      const value = activation.threshold.supply_drop;
      if (typeof value !== "number" || value < 0 || value > 1) {
        addFinding({
          message: `Substitution ${substitution.id}: activation.threshold.supply_drop muss im Bereich [0, 1] liegen.`,
          path: `substitutions[${subIdx}].activation.threshold.supply_drop`,
          nodeId: substitutionNodeId
        });
      }
    }
    if (activation.threshold?.duration_min && !DURATION_PATTERN.test(String(activation.threshold.duration_min))) {
      addFinding({
        message: `Substitution ${substitution.id}: activation.threshold.duration_min muss dem Format 14d/2w/6m entsprechen.`,
        path: `substitutions[${subIdx}].activation.threshold.duration_min`,
        nodeId: substitutionNodeId
      });
    }

    const activationEvents = extractEventIdsFromTrigger(activation.trigger);
    activationEvents.forEach((eventId, activationIdx) => {
      if (!eventIds.has(eventId)) {
        addFinding({
          message: `Substitution ${substitution.id}: activation.trigger verweist auf unbekanntes Event ${eventId}.`,
          path: `substitutions[${subIdx}].activation.trigger`,
          nodeId: substitutionNodeId,
          edgeId: `edge:${substitution.id}-activation-${activationIdx}`
        });
      }
    });

    (substitution.dependency_overlap || []).forEach((entityId, overlapIdx) => {
      if (!entityIds.has(entityId)) {
        addFinding({
          message: `Substitution ${substitution.id}: dependency_overlap[${overlapIdx}] verweist auf unbekannte Entity.`,
          path: `substitutions[${subIdx}].dependency_overlap[${overlapIdx}]`,
          nodeId: substitutionNodeId,
          edgeId: `edge:${substitution.id}-overlap-${overlapIdx}`
        });
      }
    });

    (substitution.side_effects || []).forEach((effect, effectIdx) => {
      if (effect.target && !entityIds.has(effect.target)) {
        addFinding({
          message: `Substitution ${substitution.id}: side_effect target muss auf eine vorhandene Entity zeigen.`,
          path: `substitutions[${subIdx}].side_effects[${effectIdx}].target`,
          nodeId: substitutionNodeId,
          edgeId: `edge:${substitution.id}-side-effect-${effectIdx}`
        });
      }
    });
  });

  (pdl.cascades || []).forEach((cascade, cascadeIdx) => {
    const cascadeNodeId = `cascade:${cascade.id}`;
    if (!cascade.origin || !eventIds.has(cascade.origin)) {
      addFinding({
        message: `Cascade ${cascade.id}: originEvent muss auf ein vorhandenes Event zeigen.`,
        path: `cascades[${cascadeIdx}].origin`,
        nodeId: cascadeNodeId,
        edgeId: `edge:${cascade.id}-origin`
      });
    }
    if (cascade.probability !== undefined && (typeof cascade.probability !== "number" || cascade.probability < 0 || cascade.probability > 1)) {
      addFinding({
        message: `Cascade ${cascade.id}: probability muss im Bereich [0, 1] liegen.`,
        path: `cascades[${cascadeIdx}].probability`,
        nodeId: cascadeNodeId
      });
    }
    if (cascade.validation?.confidence !== undefined) {
      const confidence = cascade.validation.confidence;
      if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
        addFinding({
          message: `Cascade ${cascade.id}: validation.confidence muss im Bereich [0, 1] liegen.`,
          path: `cascades[${cascadeIdx}].validation.confidence`,
          nodeId: cascadeNodeId
        });
      }
    }

    (cascade.timeline || []).forEach((entry, entryIdx) => {
      const timelineNodeId = `timeline:${cascade.id}-${entryIdx}`;
      if (!entry.at || !DURATION_PATTERN.test(String(entry.at))) {
        addFinding({
          message: `Cascade ${cascade.id}: timeline[${entryIdx}] benötigt ein at im Format 14d/2w/6m.`,
          path: `cascades[${cascadeIdx}].timeline[${entryIdx}].at`,
          nodeId: timelineNodeId,
          edgeId: `edge:${cascade.id}-seq-${entryIdx}`
        });
      }
      if (!entry.event || !eventIds.has(entry.event)) {
        addFinding({
          message: `Cascade ${cascade.id}: timeline[${entryIdx}].event muss auf ein vorhandenes Event zeigen.`,
          path: `cascades[${cascadeIdx}].timeline[${entryIdx}].event`,
          nodeId: timelineNodeId,
          edgeId: `edge:${cascade.id}-seq-${entryIdx}`
        });
      }
      if (entry.impact?.severity !== undefined && !SEVERITY_VALUES.has(entry.impact.severity)) {
        addFinding({
          message: `Cascade ${cascade.id}: timeline[${entryIdx}].impact.severity muss critical/high/medium/low sein.`,
          path: `cascades[${cascadeIdx}].timeline[${entryIdx}].impact.severity`,
          nodeId: timelineNodeId
        });
      }
      (entry.affects || []).forEach((entityId) => {
        if (!entityIds.has(entityId)) {
          addFinding({
            message: `Cascade ${cascade.id}: timeline[${entryIdx}].affects verweist auf unbekannte Entity ${entityId}.`,
            path: `cascades[${cascadeIdx}].timeline[${entryIdx}].affects`,
            nodeId: timelineNodeId,
            edgeId: `edge:${cascade.id}-${entryIdx}-affects-${entityId}`
          });
        }
      });
    });
  });

  return findings;
}

async function validatePdl(pdl) {
  const errors = [];
  const warnings = [];
  const items = [];
  const shaclFindings = [];
  const errorNodeIds = new Set();
  const errorEdgeIds = new Set();
  const warningNodeIds = new Set();
  const warningEdgeIds = new Set();
  const validator = await ensureValidator();

  if (validator) {
    const valid = validator(pdl);
    if (!valid && validator.errors) {
      validator.errors.forEach((error) => {
        const path = error.instancePath || "/";
        const message = `Schema ${path}: ${error.message || "ungültig"}`;
        errors.push(message);
        items.push(makeValidationItem({
          source: "schema",
          level: "error",
          message,
          path
        }));
      });
    }
  } else {
    const message = "Schema-Validierung nicht verfügbar.";
    warnings.push(message);
    items.push(makeValidationItem({
      source: "schema",
      level: "warn",
      message
    }));
  }

  const refIssues = checkReferences(pdl);
  refIssues.forEach((issue) => {
    warnings.push(issue.message);
    items.push(makeValidationItem({
      source: "semantic",
      level: "warn",
      message: issue.message,
      path: issue.path,
      nodeId: issue.nodeId,
      edgeId: issue.edgeId
    }));
    if (issue.nodeId) warningNodeIds.add(issue.nodeId);
    if (issue.edgeId) warningEdgeIds.add(issue.edgeId);
  });

  checkShaclConstraints(pdl).forEach((finding) => {
    shaclFindings.push(finding);
    items.push(finding);
    if (finding.level === "error") {
      errors.push(`[SHACL] ${finding.message}`);
      if (finding.nodeId) errorNodeIds.add(finding.nodeId);
      if (finding.edgeId) errorEdgeIds.add(finding.edgeId);
      return;
    }
    warnings.push(`[SHACL] ${finding.message}`);
    if (finding.nodeId) warningNodeIds.add(finding.nodeId);
    if (finding.edgeId) warningEdgeIds.add(finding.edgeId);
  });

  return {
    errors,
    warnings,
    items,
    shaclFindings,
    errorNodeIds,
    errorEdgeIds,
    warningNodeIds,
    warningEdgeIds
  };
}

function applyValidationResult(validation) {
  state.validation.errors = validation.errors || [];
  state.validation.warnings = validation.warnings || [];
  state.validation.items = validation.items || [];
  state.validation.shaclFindings = validation.shaclFindings || [];
  state.validation.errorNodeIds = validation.errorNodeIds || new Set();
  state.validation.errorEdgeIds = validation.errorEdgeIds || new Set();
  state.validation.warningNodeIds = validation.warningNodeIds || new Set();
  state.validation.warningEdgeIds = validation.warningEdgeIds || new Set();
  renderValidation();
}

async function revalidateCurrentData() {
  if (!state.raw) {
    setValidationStatus("Keine Daten geladen.");
    return;
  }
  setValidationStatus("Validierung läuft...");
  try {
    const validation = await validatePdl(state.raw);
    applyValidationResult(validation);
    if (state.graph) {
      applyFilters();
    }
  } catch (error) {
    setValidationStatus(`Validierung fehlgeschlagen: ${error.message}`, true);
  }
}

function updateUrlState() {
  if (!state.graph || state.uiState.applying) return;
  const payload = {
    conflictMode: state.conflictMode,
    search: elements.searchInput?.value || "",
    filters: {
      nodeTypes: Array.from(gatherFilters(elements.nodeTypeFilters)),
      edgeTypes: Array.from(gatherFilters(elements.edgeTypeFilters)),
      sectors: Array.from(gatherFilters(elements.sectorFilters)),
      locations: Array.from(gatherFilters(elements.locationFilters)),
      criticalities: Array.from(gatherFilters(elements.criticalityFilters)),
      entitySubtypes: Array.from(gatherFilters(elements.entitySubtypeFilters)),
      eventSubtypes: Array.from(gatherFilters(elements.eventSubtypeFilters))
    }
  };
  const encoded = encodeURIComponent(JSON.stringify(payload));
  history.replaceState(null, "", `#state=${encoded}`);
}

function readUrlState() {
  const hash = window.location.hash || "";
  if (!hash.startsWith("#state=")) return null;
  const raw = hash.slice("#state=".length);
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch (error) {
    console.warn("Could not parse URL state", error);
    return null;
  }
}

function applySelection(container, values) {
  if (!container || values === undefined || values === null) return;
  const set = new Set(values);
  container.querySelectorAll("input[type=checkbox]").forEach((input) => {
    input.checked = set.has(input.value);
  });
}

function applyPendingUiState() {
  const pending = state.uiState.pending;
  if (!pending) return;
  state.uiState.applying = true;
  if (typeof pending.conflictMode === "boolean") {
    elements.conflictMode.checked = pending.conflictMode;
    setConflictMode(pending.conflictMode);
  }
  if (typeof pending.search === "string") {
    if (elements.searchInput) elements.searchInput.value = pending.search;
  }
  if (pending.filters) {
    applySelection(elements.nodeTypeFilters, pending.filters.nodeTypes);
    applySelection(elements.edgeTypeFilters, pending.filters.edgeTypes);
    applySelection(elements.sectorFilters, pending.filters.sectors);
    applySelection(elements.locationFilters, pending.filters.locations);
    applySelection(elements.criticalityFilters, pending.filters.criticalities);
    applySelection(elements.entitySubtypeFilters, pending.filters.entitySubtypes);
    applySelection(elements.eventSubtypeFilters, pending.filters.eventSubtypes);
  }
  state.uiState.pending = null;
  state.uiState.applying = false;
}

function setExportStatus(message, isError = false) {
  if (!elements.exportStatus) return;
  elements.exportStatus.textContent = message;
  elements.exportStatus.style.color = isError ? "#b91c1c" : "#4b5563";
}

function stripNodeForExport(node) {
  return {
    id: node.id,
    type: node.type,
    subtype: node.subtype,
    label: node.label,
    data: node.data
  };
}

function stripEdgeForExport(edge) {
  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    type: edge.type,
    data: edge.data
  };
}

function downloadBlob(filename, blob) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function buildFilteredExportPayload() {
  return {
    metadata: {
      ...state.graph?.metadata,
      exported_at: new Date().toISOString(),
      filtered: true
    },
    nodes: state.analysis.filteredNodes.map(stripNodeForExport),
    edges: state.analysis.filteredEdges.map(stripEdgeForExport)
  };
}

function exportFilteredJson() {
  if (!state.analysis.filteredNodes.length) {
    setExportStatus("Kein Graph geladen.", true);
    return;
  }
  const baseName = state.fileName ? state.fileName.replace(/\.[^/.]+$/, "") : "graph";
  const payload = buildFilteredExportPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  downloadBlob(`${baseName}-filtered.json`, blob);
  setExportStatus("JSON-Export erstellt.");
}

function exportFilteredYaml() {
  if (!state.analysis.filteredNodes.length) {
    setExportStatus("Kein Graph geladen.", true);
    return;
  }
  const baseName = state.fileName ? state.fileName.replace(/\.[^/.]+$/, "") : "graph";
  const payload = buildFilteredExportPayload();
  const yamlText = stringifyYaml(payload, null, {
    indent: 2,
    lineWidth: 0,
    sortMapEntries: false
  });
  const blob = new Blob([yamlText], { type: "application/x-yaml" });
  downloadBlob(`${baseName}-filtered.yaml`, blob);
  setExportStatus("YAML-Export erstellt.");
}

function exportPng() {
  if (!state.network) {
    setExportStatus("Kein Graph geladen.", true);
    return;
  }
  const canvas = state.network?.canvas?.frame?.canvas;
  if (!canvas) {
    setExportStatus("PNG-Export nicht verfügbar.", true);
    return;
  }
  const dataUrl = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `${state.fileName ? state.fileName.replace(/\.[^/.]+$/, "") : "graph"}.png`;
  link.click();
  setExportStatus("PNG-Export erstellt.");
}

function setActiveTab(tab) {
  const isGraph = tab === "graph";
  const isYaml = tab === "yaml";
  const isOntology = tab === "ontology";
  const isAbout = tab === "about";

  elements.graphView.classList.toggle("active", isGraph);
  elements.yamlView.classList.toggle("active", isYaml);
  elements.ontologyView.classList.toggle("active", isOntology);
  elements.aboutView.classList.toggle("active", isAbout);

  elements.tabGraph.classList.toggle("active", isGraph);
  elements.tabYaml.classList.toggle("active", isYaml);
  elements.tabOntology.classList.toggle("active", isOntology);
  elements.tabAbout.classList.toggle("active", isAbout);

  if (isOntology && !state.uiState.ontologyInitialized) {
    initOntologyTab();
    state.uiState.ontologyInitialized = true;
  }
}

// ── Ontologie-Tab ─────────────────────────────────────────────────────────────

const ONTO_COLORS = {
  coypu:     { background: "#94a3b8", border: "#64748b", font: "#1e293b" },
  inherited: { background: "#0ea5e9", border: "#0369a1", font: "#ffffff" },
  equiv:     { background: "#14b8a6", border: "#0f766e", font: "#ffffff" },
  new:       { background: "#f59e0b", border: "#b45309", font: "#1e293b" },
  enum:      { background: "#7c3aed", border: "#5b21b6", font: "#ffffff" }
};

let _ontoNodesDS = null;
let _ontoEdgesDS = null;
let _ontoNetwork = null;

function initOntologyTab() {
  const container = document.getElementById("ontoNetwork");
  if (!container) return;

  const nodes = [];
  const edges = [];

  ONTOLOGY_DATA.coypu.forEach(cls => {
    nodes.push({
      id: cls.id, label: cls.label,
      color: ONTO_COLORS.coypu, font: { color: ONTO_COLORS.coypu.font },
      group: "coypu", title: cls.comment || cls.id
    });
  });

  ONTOLOGY_DATA.pdl_inherited.forEach(cls => {
    const isEquiv = cls.rel === "equivalentClass";
    const grp = isEquiv ? "equiv" : "inherited";
    nodes.push({
      id: cls.id, label: cls.label,
      color: ONTO_COLORS[grp], font: { color: ONTO_COLORS[grp].font },
      group: grp, title: cls.comment || cls.id
    });
    edges.push({
      id: `${cls.id}-->${cls.parent}`,
      from: cls.id, to: cls.parent,
      label: cls.rel,
      dashes: !isEquiv,
      color: { color: isEquiv ? "#0f766e" : "#94a3b8" },
      font: { size: 10, color: "#64748b", align: "middle" },
      arrows: { to: { enabled: true, scaleFactor: 0.6 } }
    });
  });

  ONTOLOGY_DATA.pdl_new.forEach(cls => {
    nodes.push({
      id: cls.id, label: cls.label,
      color: ONTO_COLORS.new, font: { color: ONTO_COLORS.new.font },
      group: "new", title: cls.comment || cls.id
    });
  });

  ONTOLOGY_DATA.pdl_enum.forEach(cls => {
    nodes.push({
      id: cls.id, label: cls.label,
      color: ONTO_COLORS.enum, font: { color: ONTO_COLORS.enum.font },
      group: "enum", shape: "diamond",
      title: cls.values ? `Werte: ${cls.values.join(", ")}` : cls.id
    });
  });

  _ontoNodesDS = new vis.DataSet(nodes);
  _ontoEdgesDS = new vis.DataSet(edges);

  const options = {
    physics: { solver: "repulsion", repulsion: { nodeDistance: 140 }, stabilization: { iterations: 150 } },
    layout: { randomSeed: 42 },
    nodes: { shape: "box", borderWidth: 2, borderWidthSelected: 3, margin: { top: 8, bottom: 8, left: 10, right: 10 }, font: { size: 12, face: "Space Grotesk, system-ui, sans-serif" } },
    edges: { width: 1.5, selectionWidth: 2 },
    interaction: { hover: true, tooltipDelay: 200 }
  };

  _ontoNetwork = new vis.Network(container, { nodes: _ontoNodesDS, edges: _ontoEdgesDS }, options);
  _ontoNetwork.on("click", (params) => {
    if (params.nodes.length > 0) showOntologyDetails(params.nodes[0]);
  });
  _ontoNetwork.once("stabilized", () => {
    _ontoNetwork.redraw();
    _ontoNetwork.fit();
  });

  document.querySelectorAll(".onto-filter").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".onto-filter").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      applyOntoFilter(btn.dataset.filter);
    });
  });

  renderOntoStats();
}

function applyOntoFilter(filter) {
  if (!_ontoNodesDS) return;
  const all = [
    ...ONTOLOGY_DATA.coypu.map(c => ({ id: c.id, group: "coypu" })),
    ...ONTOLOGY_DATA.pdl_inherited.map(c => ({ id: c.id, group: c.rel === "equivalentClass" ? "equiv" : "inherited" })),
    ...ONTOLOGY_DATA.pdl_new.map(c => ({ id: c.id, group: "new" })),
    ...ONTOLOGY_DATA.pdl_enum.map(c => ({ id: c.id, group: "enum" }))
  ];
  const visibleGroups = {
    all:       ["coypu", "inherited", "equiv", "new", "enum"],
    coypu:     ["coypu"],
    inherited: ["inherited", "equiv"],
    new:       ["new", "enum"]
  }[filter] || ["coypu", "inherited", "equiv", "new", "enum"];

  const updates = all.map(n => ({ id: n.id, hidden: !visibleGroups.includes(n.group) }));
  _ontoNodesDS.update(updates);

  const hiddenIds = new Set(updates.filter(u => u.hidden).map(u => u.id));
  _ontoEdgesDS.update(_ontoEdgesDS.get().map(e => ({
    id: e.id, hidden: hiddenIds.has(e.from) || hiddenIds.has(e.to)
  })));

  // Cards synchron filtern
  const visibleGroupsForCards = visibleGroups;

  if (elements.ontoCardsGrid) {
    elements.ontoCardsGrid.querySelectorAll(".onto-card").forEach(card => {
      card.style.display = visibleGroupsForCards.includes(card.dataset.group) ? "" : "none";
    });
  }
}

function _makeEl(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

function showOntologyDetails(nodeId) {
  const detailsEmpty = document.getElementById("ontoDetailsEmpty");
  const detailsContent = document.getElementById("ontoDetailsContent");
  if (!detailsEmpty || !detailsContent) return;

  let cls = null;
  let category = null;
  const checks = [
    { list: ONTOLOGY_DATA.coypu,         cat: "CoyPu-Basisklasse" },
    { list: ONTOLOGY_DATA.pdl_inherited, cat: "PDL geerbt" },
    { list: ONTOLOGY_DATA.pdl_new,       cat: "PDL-Neuerung" },
    { list: ONTOLOGY_DATA.pdl_enum,      cat: "PDL-Enumeration" }
  ];
  for (const check of checks) {
    cls = check.list.find(c => c.id === nodeId);
    if (cls) { category = check.cat; break; }
  }
  if (!cls) return;

  const grpKey = category === "CoyPu-Basisklasse" ? "coypu"
    : category === "PDL geerbt" ? (cls.rel === "equivalentClass" ? "equiv" : "inherited")
    : category === "PDL-Enumeration" ? "enum" : "new";

  const badgeClass = {
    coypu: "onto-badge-coypu", inherited: "onto-badge-inherited",
    equiv: "onto-badge-equiv", new: "onto-badge-new", enum: "onto-badge-enum"
  }[grpKey];

  const frag = document.createDocumentFragment();

  const typeP = _makeEl("p", "details-type");
  typeP.appendChild(_makeEl("span", `onto-badge ${badgeClass}`, category));
  frag.appendChild(typeP);
  frag.appendChild(_makeEl("h3", "details-title onto-details-title", cls.label));

  const dl = _makeEl("dl", "onto-dl");
  const addRow = (dtText, ddNodes) => {
    dl.appendChild(_makeEl("dt", null, dtText));
    const dd = _makeEl("dd");
    if (typeof ddNodes === "string") {
      dd.textContent = ddNodes;
    } else {
      ddNodes.forEach(n => dd.appendChild(n));
    }
    dl.appendChild(dd);
  };

  addRow("IRI", [_makeEl("code", null, cls.id)]);
  if (cls.rel)     addRow("Relation",     [_makeEl("code", null, cls.rel)]);
  if (cls.parent)  addRow("Elternklasse", [_makeEl("code", null, cls.parent)]);
  if (cls.comment) addRow("Beschreibung", cls.comment);
  if (cls.values) {
    const codes = cls.values.flatMap((v, i) =>
      i < cls.values.length - 1
        ? [_makeEl("code", null, v), document.createTextNode(" ")]
        : [_makeEl("code", null, v)]
    );
    addRow("Werte", codes);
  }
  frag.appendChild(dl);

  detailsEmpty.style.display = "none";
  detailsContent.style.display = "block";
  detailsContent.replaceChildren(frag);
}

function renderOntoStats() {
  const el = document.getElementById("ontoStats");
  if (!el) return;
  const inherited = ONTOLOGY_DATA.pdl_inherited.filter(c => c.rel === "subClassOf").length;
  const equiv = ONTOLOGY_DATA.pdl_inherited.filter(c => c.rel === "equivalentClass").length;
  const totalPdl = ONTOLOGY_DATA.pdl_inherited.length + ONTOLOGY_DATA.pdl_new.length + ONTOLOGY_DATA.pdl_enum.length;
  const rows = [
    ["CoyPu-Basisklassen",      ONTOLOGY_DATA.coypu.length],
    ["PDL geerbt (subClassOf)", inherited],
    ["PDL equivalentClass",     equiv],
    ["PDL-Neuerungen",          ONTOLOGY_DATA.pdl_new.length],
    ["PDL-Enumerationen",       ONTOLOGY_DATA.pdl_enum.length],
    ["Gesamt PDL-Klassen",      totalPdl]
  ];
  el.replaceChildren();
  rows.forEach(([label, count], i) => {
    const li = _makeEl("li");
    if (i === 5) {
      li.style.borderTop = "1px solid var(--stroke)";
      li.style.paddingTop = "4px";
      li.style.fontWeight = "600";
    }
    li.appendChild(_makeEl("span", "onto-stat-label", label));
    li.appendChild(_makeEl("span", "onto-stat-val", String(count)));
    el.appendChild(li);
  });
}

function setOntoSubTab(tab) {
  const isGraph = tab === "graph";
  const isCards = tab === "cards";

  const netEl = document.getElementById("ontoNetwork");
  if (netEl) netEl.style.display = isGraph ? "block" : "none";
  if (elements.ontoCardsView) elements.ontoCardsView.style.display = isCards ? "block" : "none";

  if (elements.ontoTabGraph) elements.ontoTabGraph.classList.toggle("active", isGraph);
  if (elements.ontoTabCards) elements.ontoTabCards.classList.toggle("active", isCards);

  if (isCards && !state.uiState.ontoCardsInitialized) {
    initOntoCards();
    state.uiState.ontoCardsInitialized = true;
  }

  if (isGraph && _ontoNetwork) {
    setTimeout(() => { _ontoNetwork.redraw(); _ontoNetwork.fit(); }, 50);
  }
}

function initOntoCards() {
  const grid = elements.ontoCardsGrid;
  if (!grid) return;

  const allClasses = [
    ...ONTOLOGY_DATA.coypu.map(c => ({ ...c, group: "coypu", groupLabel: "CoyPu-Basisklasse" })),
    ...ONTOLOGY_DATA.pdl_inherited.map(c => ({ ...c, group: c.rel === "equivalentClass" ? "equiv" : "inherited", groupLabel: "PDL geerbt" })),
    ...ONTOLOGY_DATA.pdl_new.map(c => ({ ...c, group: "new", groupLabel: "PDL-Neuerung" })),
    ...ONTOLOGY_DATA.pdl_enum.map(c => ({ ...c, group: "enum", groupLabel: "PDL-Enumeration" }))
  ];

  grid.replaceChildren();

  allClasses.forEach(cls => {
    const card = document.createElement("article");
    card.className = "onto-card";
    card.dataset.id = cls.id;
    card.dataset.group = cls.group;

    const header = document.createElement("div");
    header.className = "onto-card-header";

    const meta = document.createElement("div");
    meta.className = "onto-card-meta";

    const labelEl = document.createElement("div");
    labelEl.className = "onto-card-label";

    const dot = document.createElement("span");
    dot.className = `onto-dot onto-dot-${cls.group}`;
    labelEl.appendChild(dot);
    labelEl.appendChild(document.createTextNode(cls.label));

    const badgeEl = document.createElement("div");
    badgeEl.className = "onto-card-badge-small";
    badgeEl.textContent = cls.groupLabel;

    meta.appendChild(labelEl);
    meta.appendChild(badgeEl);

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "onto-card-toggle";
    toggleBtn.type = "button";
    toggleBtn.textContent = "+";
    toggleBtn.setAttribute("aria-label", "Details ein-/ausblenden");

    header.appendChild(meta);
    header.appendChild(toggleBtn);

    const body = document.createElement("div");
    body.className = "onto-card-body";

    const dl = document.createElement("dl");
    dl.className = "onto-card-dl";

    const addRow = (dtText, ddNodes) => {
      const dt = document.createElement("dt");
      dt.textContent = dtText;
      const dd = document.createElement("dd");
      if (typeof ddNodes === "string") {
        dd.textContent = ddNodes;
      } else {
        ddNodes.forEach(n => dd.appendChild(n));
      }
      dl.appendChild(dt);
      dl.appendChild(dd);
    };

    const makeCode = text => {
      const c = document.createElement("code");
      c.textContent = text;
      return c;
    };

    addRow("IRI", [makeCode(cls.id)]);
    if (cls.rel)     addRow("Relation",     [makeCode(cls.rel)]);
    if (cls.parent)  addRow("Elternklasse", [makeCode(cls.parent)]);
    if (cls.comment) addRow("Beschreibung", cls.comment);
    if (cls.values) {
      const codes = cls.values.flatMap((v, i) =>
        i < cls.values.length - 1
          ? [makeCode(v), document.createTextNode(" ")]
          : [makeCode(v)]
      );
      addRow("Werte", codes);
    }

    body.appendChild(dl);
    card.appendChild(header);
    card.appendChild(body);

    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleOntoCard(card, toggleBtn);
    });

    card.addEventListener("click", () => {
      showOntologyDetails(cls.id);
    });

    grid.appendChild(card);
  });
}

function toggleOntoCard(card, btn) {
  const expanded = card.classList.toggle("expanded");
  btn.textContent = expanded ? "−" : "+";
  btn.setAttribute("aria-expanded", String(expanded));
}

// ─────────────────────────────────────────────────────────────────────────────

function updateFileLabel() {
  elements.fileLabel.textContent = state.fileName
    ? `Geladen: ${state.fileName}`
    : "Keine Datei geladen";
}

function formatYamlScalar(value) {
  if (value === null) return "null";
  if (value === undefined) return "—";
  if (typeof value === "string") return `"${value}"`;
  return String(value);
}

function describeYamlValue(value) {
  if (Array.isArray(value)) return `Array (${value.length})`;
  if (value && typeof value === "object") return `Objekt (${Object.keys(value).length})`;
  return null;
}

function formatYamlPath(pathSegments) {
  return pathSegments.reduce((acc, segment) => {
    if (!acc) return segment;
    return segment.startsWith("[") ? `${acc}${segment}` : `${acc}.${segment}`;
  }, "");
}

function resolveYamlNodeId(value, context) {
  if (!value || typeof value !== "object") return null;
  const id = value.id;
  if (id && context.rootKey === "entities") return `entity:${id}`;
  if (id && context.rootKey === "events") return `event:${id}`;
  if (id && context.rootKey === "cascades") return `cascade:${id}`;
  if (id && context.rootKey === "supply_chains") return `chain:${id}`;
  if (id && context.rootKey === "substitutions") return `substitution:${id}`;
  if (
    context.rootKey === "cascades" &&
    context.parentKey === "timeline" &&
    typeof context.index === "number" &&
    context.cascadeId
  ) {
    return `timeline:${context.cascadeId}-${context.index}`;
  }
  return null;
}

function buildYamlNode(key, value, depth = 0, context = {}) {
  const currentContext = {
    rootKey: context.rootKey,
    parentKey: context.parentKey ?? null,
    index: context.index ?? null,
    cascadeId: context.cascadeId ?? null,
    pathSegments: context.pathSegments || []
  };
  const pathSegments = [...currentContext.pathSegments, key];
  const pathLabel = formatYamlPath(pathSegments);
  const isObject = value && typeof value === "object";
  const rawValue = isObject ? "" : value === undefined ? "" : String(value);
  const searchText = `${key} ${rawValue} ${pathLabel}`.toLowerCase();

  if (isObject) {
    const details = document.createElement("details");
    details.open = depth < 1;
    details.dataset.searchText = searchText;
    details.dataset.yamlPath = pathLabel;

    const summary = document.createElement("summary");

    const keySpan = document.createElement("span");
    keySpan.className = "yaml-key";
    keySpan.textContent = key;
    summary.appendChild(keySpan);

    const meta = describeYamlValue(value);
    if (meta) {
      const metaSpan = document.createElement("span");
      metaSpan.className = "yaml-meta";
      metaSpan.textContent = meta;
      summary.appendChild(metaSpan);
    }

    details.appendChild(summary);

    const children = document.createElement("div");
    children.className = "yaml-children";

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        const nextContext = {
          ...currentContext,
          parentKey: key,
          index,
          cascadeId: currentContext.cascadeId,
          pathSegments
        };
        children.appendChild(buildYamlNode(`[${index}]`, item, depth + 1, nextContext));
      });
    } else {
      Object.entries(value).forEach(([childKey, childValue]) => {
        const cascadeId =
          currentContext.rootKey === "cascades" && value.id ? value.id : currentContext.cascadeId;
        const nextContext = {
          ...currentContext,
          parentKey: key,
          index: null,
          cascadeId,
          pathSegments
        };
        children.appendChild(buildYamlNode(childKey, childValue, depth + 1, nextContext));
      });
    }

    details.appendChild(children);
    return details;
  }

  const leaf = document.createElement("div");
  leaf.className = "yaml-leaf";
  leaf.dataset.searchText = searchText;
  leaf.dataset.yamlPath = pathLabel;

  const keySpan = document.createElement("span");
  keySpan.className = "yaml-key";
  keySpan.textContent = key;
  leaf.appendChild(keySpan);

  const sepSpan = document.createElement("span");
  sepSpan.className = "yaml-sep";
  sepSpan.textContent = ":";
  leaf.appendChild(sepSpan);

  const valueSpan = document.createElement("span");
  valueSpan.className = "yaml-value";
  valueSpan.textContent = formatYamlScalar(value);
  leaf.appendChild(valueSpan);

  return leaf;
}

function renderYamlSearchList() {
  if (!elements.yamlSearchList) return;
  elements.yamlSearchList.innerHTML = "";

  state.yamlSearch.matches.forEach((item, index) => {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "yaml-search-item";
    button.classList.toggle("active", index === state.yamlSearch.index);

    const path = document.createElement("span");
    path.className = "yaml-search-item-path";
    path.textContent = item.dataset.yamlPath || "(ohne Pfad)";

    const snippet = document.createElement("span");
    snippet.className = "yaml-search-item-snippet";
    snippet.textContent = (item.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120);

    button.appendChild(path);
    button.appendChild(snippet);
    button.addEventListener("click", () => setYamlSearchSelection(index));

    li.appendChild(button);
    elements.yamlSearchList.appendChild(li);
  });
}

function updateYamlSearchPanel() {
  if (!elements.yamlSearchPanel) return;
  const hasTerm = Boolean(state.yamlSearch.term);
  const total = state.yamlSearch.matches.length;
  elements.yamlSearchPanel.classList.toggle("hidden", !hasTerm);

  if (elements.yamlSearchCount) {
    elements.yamlSearchCount.textContent = total
      ? `Treffer ${state.yamlSearch.index + 1} / ${total}`
      : "0 Treffer";
  }

  if (elements.yamlSearchPrev) elements.yamlSearchPrev.disabled = total < 2;
  if (elements.yamlSearchNext) elements.yamlSearchNext.disabled = total < 2;

  renderYamlSearchList();
}

function revealYamlItem(item) {
  let parent = item?.parentElement;
  while (parent && parent !== elements.yamlTree) {
    if (parent.tagName === "DETAILS") {
      parent.open = true;
      parent.classList.remove("yaml-hidden");
    }
    parent = parent.parentElement;
  }
}

function setYamlSearchSelection(index, { scroll = true } = {}) {
  const matches = state.yamlSearch.matches;
  if (!matches.length) return;

  const total = matches.length;
  const wrapped = ((index % total) + total) % total;
  state.yamlSearch.index = wrapped;

  matches.forEach((item, i) => {
    item.classList.toggle("yaml-match-current", i === wrapped);
  });

  const current = matches[wrapped];
  revealYamlItem(current);
  if (scroll) {
    current.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  updateYamlSearchPanel();
}

function clearYamlHighlights() {
  if (!elements.yamlTree) return;
  elements.yamlTree.querySelectorAll(".yaml-highlight").forEach((el) => {
    el.classList.remove("yaml-highlight");
  });
  elements.yamlTree.querySelectorAll(".yaml-hidden").forEach((el) => {
    el.classList.remove("yaml-hidden");
  });
  elements.yamlTree.querySelectorAll(".yaml-match-current").forEach((el) => {
    el.classList.remove("yaml-match-current");
  });
}

function focusNextYamlMatch(step = 1) {
  const total = state.yamlSearch.matches.length;
  if (!total) return;
  const start = state.yamlSearch.index >= 0 ? state.yamlSearch.index : 0;
  setYamlSearchSelection(start + step);
}

function applyYamlSearch(query) {
  if (!elements.yamlTree) return;
  const term = query.trim().toLowerCase();
  state.yamlSearch.term = term;
  clearYamlHighlights();

  if (!term) {
    state.yamlSearch.matches = [];
    state.yamlSearch.index = -1;
    updateYamlSearchPanel();
    return;
  }

  const items = Array.from(elements.yamlTree.querySelectorAll("[data-search-text]"));
  const matches = items.filter((item) => (item.dataset.searchText || "").includes(term));
  const visible = new Set(matches);

  matches.forEach((item) => {
    item.classList.add("yaml-highlight");
    let parent = item.parentElement;
    while (parent && parent !== elements.yamlTree) {
      if (parent.matches && parent.matches("[data-search-text]")) {
        visible.add(parent);
      }
      if (parent.tagName === "DETAILS") {
        parent.open = true;
      }
      parent = parent.parentElement;
    }
  });

  items.forEach((item) => {
    if (!visible.has(item)) {
      item.classList.add("yaml-hidden");
    }
  });

  state.yamlSearch.matches = matches;
  state.yamlSearch.index = matches.length ? 0 : -1;

  if (matches.length) {
    setYamlSearchSelection(0, { scroll: false });
  } else {
    updateYamlSearchPanel();
  }
}

function appendOntologyStat(list, label, value, note = "") {
  const item = document.createElement("li");
  item.className = "ontology-stat-item";

  const labelEl = document.createElement("span");
  labelEl.className = "ontology-stat-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("span");
  valueEl.className = "ontology-stat-value";
  valueEl.textContent = String(value);

  item.appendChild(labelEl);
  item.appendChild(valueEl);

  if (note) {
    const noteEl = document.createElement("span");
    noteEl.className = "ontology-stat-note";
    noteEl.textContent = note;
    item.appendChild(noteEl);
  }

  list.appendChild(item);
}

function renderOntologyOverview(data) {
  if (!elements.ontologyStats || !elements.ontologyImpactStats) return;

  elements.ontologyStats.innerHTML = "";
  elements.ontologyImpactStats.innerHTML = "";

  if (!data) {
    appendOntologyStat(elements.ontologyStats, "Status", "Keine Datei geladen");
    appendOntologyStat(elements.ontologyImpactStats, "Hinweis", "Lade ein YAML für Metriken");
    return;
  }

  const entities = Array.isArray(data.entities) ? data.entities : [];
  const chains = Array.isArray(data.supply_chains) ? data.supply_chains : [];
  const events = Array.isArray(data.events) ? data.events : [];
  const substitutions = Array.isArray(data.substitutions) ? data.substitutions : [];
  const cascades = Array.isArray(data.cascades) ? data.cascades : [];

  const entityTypes = new Set(entities.map((item) => item.type).filter(Boolean));
  const eventTypes = new Set(events.map((item) => item.type).filter(Boolean));
  const substitutionTypes = new Set(substitutions.map((item) => item.type).filter(Boolean));

  const stageCount = chains.reduce((sum, chain) => sum + ((chain.stages || []).length), 0);
  const dependencyCount = chains.reduce((sum, chain) => sum + ((chain.dependencies || []).length), 0);
  const timelineCount = cascades.reduce((sum, cascade) => sum + ((cascade.timeline || []).length), 0);

  appendOntologyStat(elements.ontologyStats, "Entities", entities.length, `${entityTypes.size} Typen`);
  appendOntologyStat(elements.ontologyStats, "Supply Chains", chains.length, `${stageCount} Stages`);
  appendOntologyStat(elements.ontologyStats, "Dependencies", dependencyCount);
  appendOntologyStat(elements.ontologyStats, "Events", events.length, `${eventTypes.size} Typen`);
  appendOntologyStat(elements.ontologyStats, "Substitutions", substitutions.length, `${substitutionTypes.size} Typen`);
  appendOntologyStat(elements.ontologyStats, "Cascades", cascades.length, `${timelineCount} Timeline-Einträge`);

  const eventsWithTarget = events.filter((event) => event.trigger?.target).length;
  const eventsWithCauses = events.filter((event) => Array.isArray(event.causes) && event.causes.length > 0).length;
  const eventsWithSubRef = events.filter((event) => event.substitution_ref).length;
  const impactSupply = events.filter((event) => event.impact?.supply !== undefined).length;
  const impactDemand = events.filter((event) => event.impact?.demand !== undefined).length;
  const impactPrice = events.filter((event) => event.impact?.price !== undefined).length;
  const impactDuration = events.filter((event) => event.impact?.duration !== undefined).length;
  const substitutionsWithActivation = substitutions.filter((item) => item.activation?.trigger).length;
  const substitutionsWithOverlap = substitutions.filter((item) => (item.dependency_overlap || []).length > 0).length;
  const sideEffectCount = substitutions.reduce(
    (sum, item) => sum + ((item.side_effects || []).length),
    0
  );

  appendOntologyStat(elements.ontologyImpactStats, "Trigger mit Ziel", eventsWithTarget);
  appendOntologyStat(elements.ontologyImpactStats, "Events mit Causes", eventsWithCauses);
  appendOntologyStat(elements.ontologyImpactStats, "Events mit Sub-Ref", eventsWithSubRef);
  appendOntologyStat(elements.ontologyImpactStats, "Impact Supply", impactSupply);
  appendOntologyStat(elements.ontologyImpactStats, "Impact Demand", impactDemand);
  appendOntologyStat(elements.ontologyImpactStats, "Impact Price", impactPrice);
  appendOntologyStat(elements.ontologyImpactStats, "Impact Duration", impactDuration);
  appendOntologyStat(elements.ontologyImpactStats, "Substitution Trigger", substitutionsWithActivation);
  appendOntologyStat(elements.ontologyImpactStats, "Dependency Overlap", substitutionsWithOverlap);
  appendOntologyStat(elements.ontologyImpactStats, "Side Effects", sideEffectCount);
}
function renderYamlTree(data) {
  renderOntologyOverview(data);
  if (!elements.yamlTree) return;
  elements.yamlTree.innerHTML = "";
  if (!data) {
    elements.yamlTree.innerHTML = "<p class=\"details-empty\">Noch keine Datei geladen.</p>";
    if (elements.yamlSearch) elements.yamlSearch.value = "";
    state.yamlSearch.matches = [];
    state.yamlSearch.index = -1;
    state.yamlSearch.term = "";
    updateYamlSearchPanel();
    return;
  }

  const container = document.createElement("div");
  Object.entries(data).forEach(([key, value]) => {
    container.appendChild(buildYamlNode(key, value, 0, { rootKey: key, pathSegments: [] }));
  });
  elements.yamlTree.appendChild(container);

  if (elements.yamlSearch && elements.yamlSearch.value) {
    applyYamlSearch(elements.yamlSearch.value);
  } else {
    clearYamlHighlights();
    state.yamlSearch.matches = [];
    state.yamlSearch.index = -1;
    state.yamlSearch.term = "";
    updateYamlSearchPanel();
  }
}

function setAllYamlDetails(open) {
  if (!elements.yamlTree) return;
  elements.yamlTree.querySelectorAll("details").forEach((details) => {
    details.open = open;
  });
}

function focusNodeFromYaml(nodeId) {
  if (!nodeId) return;
  const node = state.nodeById.get(nodeId);
  if (!node) {
    if (elements.yamlStatus) {
      elements.yamlStatus.textContent = "Passender Graph-Knoten nicht gefunden.";
    }
    return;
  }

  setActiveTab("graph");
  state.selectedNodeId = node.id;
  state.selectedNodeType = node.type;
  updateSupplyUI();
  renderDetailsSelection(node);
  applyFilters();

  const visible = state.nodesData.get(node.id);
  if (visible && state.network) {
    state.network.selectNodes([node.id]);
    state.network.focus(node.id, { scale: 1.1, animation: true });
  } else if (elements.yamlStatus) {
    elements.yamlStatus.textContent = "Knoten ist durch Filter ausgeblendet.";
  }
}

function getNodeLabelById(id) {
  const node = state.nodeById.get(id);
  return node ? node.label || node.id : id;
}

function getEventLabelById(id) {
  const node = state.nodeById.get(`event:${id}`);
  return node ? node.label || id : id;
}

function formatImpactPhrase(metric, value) {
  if (!value) return null;
  const sign = value.trim().startsWith("-") ? "reduziert" : value.trim().startsWith("+") ? "erhöht" : "verändert";
  const clean = value.replace("+", "").trim();
  const label = metric === "supply" ? "Supply" : metric === "demand" ? "Demand" : "Preis";
  return `${sign} ${label} um ${clean}`;
}

function formatDurationLabel(duration) {
  if (!duration) return null;
  const match = duration.match(/^(\d+)([dhwmy])$/);
  if (!match) return duration;
  const value = Number.parseInt(match[1], 10);
  const unit = match[2];
  const unitLabel = unit === "h"
    ? "Stunden"
    : unit === "d"
      ? "Tage"
      : unit === "w"
        ? "Wochen"
        : unit === "m"
          ? "Monate"
          : "Jahre";
  return `${value} ${unitLabel}`;
}

function buildEventExplanation(node) {
  const eventId = node.id.replace("event:", "");
  const impact = node.data?.impact;
  const causes = node.data?.causes || [];

  const phrases = [];
  if (impact) {
    const impactParts = [
      formatImpactPhrase("supply", impact.supply),
      formatImpactPhrase("demand", impact.demand),
      formatImpactPhrase("price", impact.price)
    ].filter(Boolean);
    if (impactParts.length) {
      phrases.push(impactParts.join(" und "));
    }
    const duration = formatDurationLabel(impact.duration);
    if (duration) {
      const lastIndex = phrases.length - 1;
      if (lastIndex >= 0) {
        phrases[lastIndex] = `${phrases[lastIndex]} für ${duration}`;
      } else {
        phrases.push(`wirkt für ${duration}`);
      }
    }
  }

  if (causes.length) {
    const labels = causes.map((id) => getEventLabelById(id));
    const list = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} und ${labels[labels.length - 1]}`;
    phrases.push(`triggert ${list}`);
  }

  if (!phrases.length) return null;
  return `${eventId} ${phrases.join(" und ")}.`;
}

function buildCascadeExplanation(node) {
  const cascadeId = node.id.replace("cascade:", "");
  const raw = state.raw?.cascades?.find((c) => c.id === cascadeId);
  if (!raw) return null;
  const steps = raw.timeline || [];
  const stepCount = steps.length;
  const first = steps[0]?.event ? getEventLabelById(steps[0].event) : null;
  const last = steps[stepCount - 1]?.event ? getEventLabelById(steps[stepCount - 1].event) : null;
  const origin = raw.origin ? getEventLabelById(raw.origin) : null;
  const duration = steps.length
    ? formatDurationLabel(steps[stepCount - 1]?.at)
    : null;

  const parts = [];
  if (origin) parts.push(`startet mit ${origin}`);
  if (stepCount) parts.push(`umfasst ${stepCount} Schritte`);
  if (first && last && first !== last) {
    parts.push(`verläuft von ${first} bis ${last}`);
  }
  if (duration) parts.push(`Dauer bis zum letzten Schritt: ${duration}`);
  if (raw.probability !== undefined && raw.probability !== null) {
    parts.push(`Wahrscheinlichkeit ${raw.probability}`);
  }

  if (!parts.length) return null;
  return `${node.label || cascadeId} ${parts.join(", ")}.`;
}

function updateSupplyUI() {
  const buttons = document.querySelectorAll("[data-supply]");
  const isEntity = state.selectedNodeType === "entity";
  const label = state.selectedNodeId ? getNodeLabelById(state.selectedNodeId) : null;

  if (!isEntity || !state.selectedNodeId) {
    state.supplyMode = "off";
    elements.supplyStatus.textContent = isEntity
      ? "Kein Entity ausgewählt."
      : "Supply-Fokus nur für Entities verfügbar.";
  } else {
    elements.supplyStatus.textContent = `Entity: ${label}`;
  }

  buttons.forEach((button) => {
    const mode = button.dataset.supply;
    const shouldDisable = !isEntity || !state.selectedNodeId;
    button.disabled = shouldDisable && mode !== "off";
    button.classList.toggle("active", state.supplyMode === mode);
  });

  if (elements.supplyDim) {
    elements.supplyDim.disabled = !isEntity || !state.selectedNodeId;
  }
}

function collectSupply(startId, direction) {
  const adjacency = state.supplyAdjacency[direction];
  const nodeIds = new Set([startId]);
  const edgeIds = new Set();
  const queue = [startId];

  while (queue.length) {
    const current = queue.shift();
    const nextItems = adjacency.get(current) || [];
    nextItems.forEach(({ node, edgeId }) => {
      edgeIds.add(edgeId);
      if (!nodeIds.has(node)) {
        nodeIds.add(node);
        queue.push(node);
      }
    });
  }

  return { nodeIds, edgeIds };
}

function getSupplyHighlight() {
  if (state.supplyMode === "off") return null;
  if (state.selectedNodeType !== "entity" || !state.selectedNodeId) return null;

  let combinedNodes = new Set([state.selectedNodeId]);
  let combinedEdges = new Set();

  const merge = (result) => {
    result.nodeIds.forEach((id) => combinedNodes.add(id));
    result.edgeIds.forEach((id) => combinedEdges.add(id));
  };

  if (state.supplyMode === "upstream" || state.supplyMode === "both") {
    merge(collectSupply(state.selectedNodeId, "upstream"));
  }
  if (state.supplyMode === "downstream" || state.supplyMode === "both") {
    merge(collectSupply(state.selectedNodeId, "downstream"));
  }

  return { nodeIds: combinedNodes, edgeIds: combinedEdges };
}

function highlightSupplyNode(node) {
  return {
    ...node,
    borderWidth: (node.borderWidth || 1) + 2,
    color: {
      background: "#e0f2f1",
      border: "#0f766e",
      highlight: { background: "#ccfbf1", border: "#14b8a6" },
      hover: { background: "#ccfbf1", border: "#14b8a6" }
    }
  };
}

function highlightSupplyEdge(edge) {
  return {
    ...edge,
    width: (edge.width || 1) + 2,
    color: { color: "#0f766e", highlight: "#14b8a6" }
  };
}

function renderNodeDetails(node) {
  const rows = [
    ["ID", node.id],
    ["Typ", node.type],
    ["Subtyp", node.subtype],
    ["Sector", getNodeSector(node)],
    ["Location", getNodeLocation(node)],
    ["Criticality", getNodeCriticality(node)],
    ["Vulnerability", node.data?.vulnerability]
  ];

  if (node.type === "substitution") {
    rows.push(
      ["From", node.data?.from],
      ["To", node.data?.to],
      ["Coverage", node.data?.coverage],
      ["Ramp Up", node.data?.ramp_up],
      ["Duration Max", node.data?.duration_max],
      ["Reversible", node.data?.reversible]
    );
  }

  const impactRaw = node.data?.impact ?? null;
  const impactParsed = node.data?.impact_parsed ?? null;
  const trigger = node.data?.trigger;
  const timeline = node.type === "timeline_entry" ? node.data : null;
  const cascadeRaw =
    node.type === "cascade"
      ? state.raw?.cascades?.find((cascade) => cascade.id === node.id.replace("cascade:", ""))
      : null;
  const explanation =
    node.type === "event"
      ? buildEventExplanation(node)
      : node.type === "cascade"
        ? buildCascadeExplanation(node)
        : null;
  const hasKgData = hasKnowledgeGraphData(node);
  const kgKinds = getKnowledgeGraphSourceKinds(node.data);
  const kgSections = buildKnowledgeGraphSections(node.data);
  const detailChips = [
    hasKgData
      ? `<div class="detail-chip kg">KG-angereichert${kgKinds.length ? ` · ${kgKinds.join(", ")}` : ""}</div>`
      : "",
    state.validation.errorNodeIds.has(node.id)
      ? "<div class=\"detail-chip error\">Validierungsfehler</div>"
      : "",
    state.validation.warningNodeIds.has(node.id)
      ? "<div class=\"detail-chip warn\">Validierungswarnung</div>"
      : ""
  ].filter(Boolean).join("");

  const impactRows = [];
  if (impactRaw) {
    impactRows.push(
      ["Supply", impactRaw.supply],
      ["Demand", impactRaw.demand],
      ["Price", impactRaw.price],
      ["Duration", impactRaw.duration]
    );
  }
  if (impactParsed && impactParsed.duration_days !== undefined) {
    impactRows.push(["Duration Days", impactParsed.duration_days]);
  }

  const sections = [
    detailChips,
    renderExplanation(explanation),
    renderSection("Basisdaten", rows),
    renderSection("Trigger", trigger ? [
      ["Target", trigger.target ? getNodeLabelById(`entity:${trigger.target}`) : null],
      ["Probability", trigger.probability],
      ["Condition", trigger.condition]
    ] : []),
    renderSection("Impact", impactRows),
    renderSection(
      "Timeline",
      cascadeRaw
        ? (cascadeRaw.timeline || []).map((entry) => [
            entry.at,
            `${getEventLabelById(entry.event)}${entry.affects?.length ? ` (affects: ${entry.affects.join(", ")})` : ""}`
          ])
        : timeline
          ? [
              ["Cascade", timeline.cascade_id],
              ["Event", timeline.event],
              ["At", timeline.at],
              ["Affects", timeline.affects]
            ]
          : []
    ),
    ...kgSections
  ].filter(Boolean).join("");

  elements.detailsType.textContent = node.type;
  elements.detailsTitle.textContent = node.label || node.id;
  elements.detailsContent.innerHTML = sections || "<p class=\"details-empty\">Keine Detaildaten vorhanden.</p>";
  setDetails(JSON.stringify(node.data ?? node, null, 2));
}

function renderEdgeDetails(edge) {
  const rows = [
    ["ID", edge.id],
    ["Typ", edge.type],
    ["Von", getNodeLabelById(edge.from)],
    ["Zu", getNodeLabelById(edge.to)]
  ];
  const dataRows = edge.data ? Object.entries(edge.data) : [];
  const detailChips = [
    state.validation.errorEdgeIds.has(edge.id)
      ? "<div class=\"detail-chip error\">Validierungsfehler</div>"
      : "",
    state.validation.warningEdgeIds.has(edge.id)
      ? "<div class=\"detail-chip warn\">Validierungswarnung</div>"
      : ""
  ].filter(Boolean).join("");
  const content = [
    detailChips,
    renderSection("Verbindung", rows),
    renderSection("Metadaten", dataRows)
  ].filter(Boolean).join("");

  elements.detailsType.textContent = "edge";
  elements.detailsTitle.textContent = edge.type || edge.id;
  elements.detailsContent.innerHTML = content || "<p class=\"details-empty\">Keine Detaildaten vorhanden.</p>";
  setDetails(JSON.stringify(edge.data ?? edge, null, 2));
}

function renderDetailsSelection(item) {
  if (!item) {
    renderDetailsEmpty();
    return;
  }
  if (item.from && item.to) {
    renderEdgeDetails(item);
  } else {
    renderNodeDetails(item);
  }
  if (state.showRawDetails) {
    elements.detailsRaw.classList.remove("hidden");
  } else {
    elements.detailsRaw.classList.add("hidden");
  }
}

function stabilizeNetworkLayout(iterations = 200) {
  if (!state.network) return;
  state.network.setOptions({
    physics: {
      enabled: true,
      stabilization: { iterations },
      barnesHut: { gravitationalConstant: -20000, springLength: 140 }
    }
  });

  const disablePhysics = () => {
    state.network.setOptions({ physics: { enabled: false } });
    state.network.off("stabilizationIterationsDone", disablePhysics);
  };

  state.network.on("stabilizationIterationsDone", disablePhysics);
  state.network.stabilize(iterations);
}

function buildNetwork(graph) {
  addVisualStyles(graph);
  state.graph = graph;
  state.focus = null;
  state.selectedNodeId = null;
  state.selectedNodeType = null;
  state.supplyMode = "off";
  state.supplyAdjacency = { upstream: new Map(), downstream: new Map() };
  state.analysis.path = null;
  state.analysis.pathHighlight = false;
  state.analysis.pathMessage = null;
  updatePathControls();
  setAnalysisResult("Noch keine Analyse.");
  setExportStatus("");
  state.nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  state.edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));

  const supplyEdges = graph.edges.filter((edge) => edge.type === "supply_flow");
  state.supplyAdjacency.downstream = buildAdjacency(supplyEdges, { directed: true });
  const reversedSupply = supplyEdges.map((edge) => ({ ...edge, from: edge.to, to: edge.from }));
  state.supplyAdjacency.upstream = buildAdjacency(reversedSupply, { directed: true });

  updateSupplyUI();

  const nodeTypes = Array.from(new Set(graph.nodes.map((node) => node.type))).sort();
  const edgeTypes = Array.from(new Set(graph.edges.map((edge) => edge.type))).sort();
  const entitySubtypes = Array.from(
    new Set(graph.nodes.filter((n) => n.type === "entity" && n.subtype).map((n) => n.subtype))
  ).sort();
  const eventSubtypes = Array.from(
    new Set(graph.nodes.filter((n) => n.type === "event" && n.subtype).map((n) => n.subtype))
  ).sort();
  const rawSectors = graph.nodes.map((n) => getNodeSector(n));
  const rawLocations = graph.nodes.map((n) => getNodeLocation(n));
  const rawCriticalities = graph.nodes.map((n) => getNodeCriticality(n));

  const sectors = Array.from(new Set(rawSectors.filter(Boolean))).sort();
  const locations = Array.from(new Set(rawLocations.filter(Boolean))).sort();
  const criticalities = Array.from(new Set(rawCriticalities.filter(Boolean))).sort();

  const missingSector = rawSectors.some((value) => !value);
  const missingLocation = rawLocations.some((value) => !value);
  const missingCriticality = rawCriticalities.some((value) => !value);

  if (missingSector) sectors.push(UNKNOWN_VALUE);
  if (missingLocation) locations.push(UNKNOWN_VALUE);
  if (missingCriticality) criticalities.push(UNKNOWN_VALUE);

  createCheckboxList(elements.nodeTypeFilters, nodeTypes);
  createCheckboxList(elements.edgeTypeFilters, edgeTypes);

  // On each newly loaded file, default to entity + event node types.
  state.conflictMode = false;
  state.savedNodeTypeSelection = null;
  elements.conflictMode.checked = false;
  setConflictMode(false);

  const defaultNodeTypes = new Set(["entity", "event"]);
  const activeDefaultTypes = new Set(nodeTypes.filter((type) => defaultNodeTypes.has(type)));
  if (activeDefaultTypes.size) {
    setNodeTypeSelection(activeDefaultTypes);
  }

  if (sectors.length) {
    elements.sectorFilterBlock.classList.remove("hidden");
    createCheckboxList(elements.sectorFilters, sectors);
  } else {
    elements.sectorFilterBlock.classList.add("hidden");
  }

  if (locations.length) {
    elements.locationFilterBlock.classList.remove("hidden");
    createCheckboxList(elements.locationFilters, locations);
  } else {
    elements.locationFilterBlock.classList.add("hidden");
  }

  if (criticalities.length) {
    elements.criticalityFilterBlock.classList.remove("hidden");
    createCheckboxList(elements.criticalityFilters, criticalities);
  } else {
    elements.criticalityFilterBlock.classList.add("hidden");
  }

  if (entitySubtypes.length) {
    elements.entitySubtypeBlock.classList.remove("hidden");
    createCheckboxList(elements.entitySubtypeFilters, entitySubtypes);
  } else {
    elements.entitySubtypeBlock.classList.add("hidden");
  }

  if (eventSubtypes.length) {
    elements.eventSubtypeBlock.classList.remove("hidden");
    createCheckboxList(elements.eventSubtypeFilters, eventSubtypes);
  } else {
    elements.eventSubtypeBlock.classList.add("hidden");
  }

  updateNodeOptions();
  updateAnalysisPresets();

  state.nodesData = new vis.DataSet(graph.nodes);
  state.edgesData = new vis.DataSet(graph.edges);

  if (!state.network) {
    const options = {
      interaction: { hover: true, navigationButtons: true },
      physics: {
        enabled: true,
        stabilization: { iterations: 200 },
        barnesHut: { gravitationalConstant: -20000, springLength: 140 }
      },
      nodes: { shape: "dot" },
      edges: { smooth: { type: "dynamic" } }
    };
    state.network = new vis.Network(
      elements.graph,
      { nodes: state.nodesData, edges: state.edgesData },
      options
    );
    state.uiState.graphScale = state.network.getScale();

    state.network.on("zoom", (params) => {
      if (!params || typeof params.scale !== "number") return;
      const previousScale = state.uiState.graphScale || params.scale;
      state.uiState.graphScale = params.scale;
      if (Math.abs(previousScale - params.scale) > 0.02) {
        scheduleApplyFilters();
      }
    });

    state.network.on("click", (params) => {
      if (params.nodes.length) {
        const node = state.nodesData.get(params.nodes[0]);
        state.selectedNodeId = node.id;
        state.selectedNodeType = node.type;
        updateSupplyUI();
        renderDetailsSelection(node);
        applyFilters();
        return;
      }
      if (params.edges.length) {
        const edge = state.edgesData.get(params.edges[0]);
        state.selectedNodeId = null;
        state.selectedNodeType = null;
        updateSupplyUI();
        renderDetailsSelection(edge);
        applyFilters();
        return;
      }
      const hadSupplyFocus = state.supplyMode !== "off";
      state.selectedNodeId = null;
      state.selectedNodeType = null;
      updateSupplyUI();
      renderDetailsEmpty();
      if (hadSupplyFocus) applyFilters();
    });
  } else {
    state.network.setData({ nodes: state.nodesData, edges: state.edgesData });
    state.uiState.graphScale = state.network.getScale();
  }

  wireFilterEvents();
  applyPendingUiState();
  applyFilters();
  renderLegend();
  renderDetailsEmpty();
}

function wireFilterEvents() {
  const inputs = document.querySelectorAll(".filter-list input");
  inputs.forEach((input) => {
    input.addEventListener("change", applyFilters);
  });
}

function wireActionButtons() {
  document.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.dataset.target;
      const action = button.dataset.action;
      const container = document.getElementById(targetId);
      if (!container) return;
      const check = action === "select-all";
      container.querySelectorAll("input[type=checkbox]").forEach((input) => {
        input.checked = check;
      });
      applyFilters();
    });
  });
}

async function loadYamlText(name, text) {
  try {
    setValidationStatus("Validierung läuft...");
    const pdl = parseYaml(text);
    const graph = convertToGraphJson(pdl);
    const validation = await validatePdl(pdl);
    buildNetwork(graph);
    applyValidationResult(validation);
    applyFilters();
    setStatus(`Geladen: ${name}`);
    state.raw = pdl;
    state.rawText = text;
    state.fileName = name;
    updateFileLabel();
    setGraphScenarioTitle(pdl?.scenario);
    renderYamlTree(pdl);
    if (elements.yamlStatus) {
      elements.yamlStatus.textContent = `Geladen: ${name}`;
    }
  } catch (error) {
    console.error(error);
    setStatus(`Fehler beim Parsen: ${error.message}`, true);
    state.raw = null;
    state.rawText = null;
    state.fileName = null;
    updateFileLabel();
    setGraphScenarioTitle(null);
    renderYamlTree(null);
    state.validation.errors = [];
    state.validation.warnings = [];
    state.validation.items = [];
    state.validation.shaclFindings = [];
    state.validation.errorNodeIds = new Set();
    state.validation.errorEdgeIds = new Set();
    state.validation.warningNodeIds = new Set();
    state.validation.warningEdgeIds = new Set();
    setValidationStatus("Validierung: fehlgeschlagen", true);
    if (elements.validationList) {
      elements.validationList.innerHTML = "";
    }
    if (elements.yamlStatus) {
      elements.yamlStatus.textContent = `Fehler beim Parsen: ${error.message}`;
    }
  }
}

function handleFileUpload(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => loadYamlText(file.name, reader.result);
  reader.onerror = () => setStatus("Fehler beim Lesen der Datei.", true);
  reader.readAsText(file);
}

function normalizePresetScenarioFile(fileName) {
  return PRESET_SCENARIO_FILES.includes(fileName) ? fileName : PRESET_SCENARIO_FILES[0];
}

function populatePresetScenarioSelect(selectElement) {
  if (!selectElement) return;
  const currentValue = normalizePresetScenarioFile(selectElement.value);
  selectElement.innerHTML = "";
  PRESET_SCENARIO_FILES.forEach((fileName) => {
    const option = document.createElement("option");
    option.value = fileName;
    option.textContent = fileName;
    selectElement.appendChild(option);
  });
  selectElement.value = currentValue;
}

function setPresetScenarioSelection(fileName) {
  const normalized = normalizePresetScenarioFile(fileName);
  if (elements.exampleScenarioSelect) {
    elements.exampleScenarioSelect.value = normalized;
  }
  return normalized;
}

function initializePresetScenarioSelect() {
  populatePresetScenarioSelect(elements.exampleScenarioSelect);
  setPresetScenarioSelection(PRESET_SCENARIO_FILES[0]);
}

function getSelectedPresetScenarioFile() {
  if (elements.exampleScenarioSelect) {
    return normalizePresetScenarioFile(elements.exampleScenarioSelect.value);
  }
  return PRESET_SCENARIO_FILES[0];
}

function buildScenarioCandidates(fileName) {
  return [
    new URL(`./examples/${fileName}`, window.location.href).toString(),
    new URL(`../scenarios/${fileName}`, window.location.href).toString(),
    new URL(`./scenarios/${fileName}`, window.location.href).toString()
  ];
}

async function loadExample(fileName = getSelectedPresetScenarioFile()) {
  const candidates = buildScenarioCandidates(fileName);
  try {
    let lastError = null;
    for (const url of candidates) {
      const response = await fetch(url);
      if (response.ok) {
        const text = await response.text();
        await loadYamlText(fileName, text);
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    }
    throw lastError || new Error("Unbekannter Fehler");
  } catch (error) {
    setStatus(
      `Szenario "${fileName}" konnte nicht geladen werden. Starte den Webserver im Repo-Root (z. B. \`python3 -m http.server 8000\`) oder lade die Datei über den Upload.`,
      true
    );
  }
}

function wireUI() {
  state.uiState.pending = readUrlState();
  initializePresetScenarioSelect();
  setGraphScenarioTitle(null);
  elements.supplyDim.checked = state.supplyDim;
  updateFileLabel();
  setActiveTab("graph");
  if (elements.analysisMenuToggle && elements.analysisMenu) {
    elements.analysisMenuToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      elements.analysisMenu.classList.toggle("hidden");
    });
    document.addEventListener("click", (event) => {
      if (elements.analysisMenu.classList.contains("hidden")) return;
      const isInside = elements.analysisMenu.contains(event.target) || elements.analysisMenuToggle.contains(event.target);
      if (!isInside) {
        elements.analysisMenu.classList.add("hidden");
      }
    });
  }
  elements.fileInput.addEventListener("change", (event) => {
    handleFileUpload(event.target.files[0]);
  });
  if (elements.exampleScenarioSelect) {
    elements.exampleScenarioSelect.addEventListener("change", (event) => {
      setPresetScenarioSelection(event.target.value);
    });
  }
  elements.exampleBtn.addEventListener("click", () => {
    loadExample(getSelectedPresetScenarioFile());
  });
  if (elements.searchInput) elements.searchInput.addEventListener("input", applyFilters);
  elements.conflictMode.addEventListener("change", (event) => {
    setConflictMode(event.target.checked);
    applyFilters();
  });
  elements.fitBtn.addEventListener("click", () => {
    if (state.network) state.network.fit({ animation: true });
  });
  elements.stabilizeBtn.addEventListener("click", () => {
    stabilizeNetworkLayout(200);
  });
  if (elements.exportJson) {
    elements.exportJson.addEventListener("click", exportFilteredJson);
  }
  if (elements.exportYaml) {
    elements.exportYaml.addEventListener("click", exportFilteredYaml);
  }
  if (elements.exportPng) {
    elements.exportPng.addEventListener("click", exportPng);
  }
  if (elements.validationRun) {
    elements.validationRun.addEventListener("click", revalidateCurrentData);
  }

  elements.detailsToggle.addEventListener("click", () => {
    state.showRawDetails = !state.showRawDetails;
    elements.detailsRaw.classList.toggle("hidden", !state.showRawDetails);
    elements.detailsToggle.textContent = state.showRawDetails ? "Übersicht" : "JSON";
  });

  elements.supplyDim.addEventListener("change", (event) => {
    state.supplyDim = event.target.checked;
    applyFilters();
  });

  elements.tabGraph.addEventListener("click", () => setActiveTab("graph"));
  elements.tabYaml.addEventListener("click", () => setActiveTab("yaml"));
  elements.tabOntology.addEventListener("click", () => setActiveTab("ontology"));
  if (elements.ontoTabGraph) {
    elements.ontoTabGraph.addEventListener("click", () => setOntoSubTab("graph"));
  }
  if (elements.ontoTabCards) {
    elements.ontoTabCards.addEventListener("click", () => setOntoSubTab("cards"));
  }
  elements.tabAbout.addEventListener("click", () => setActiveTab("about"));
  elements.yamlExpand.addEventListener("click", () => setAllYamlDetails(true));
  elements.yamlCollapse.addEventListener("click", () => setAllYamlDetails(false));
  if (elements.yamlSearch) {
    elements.yamlSearch.addEventListener("input", (event) => {
      applyYamlSearch(event.target.value);
    });
    elements.yamlSearch.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        focusNextYamlMatch(event.shiftKey ? -1 : 1);
      }
    });
  }
  if (elements.yamlSearchPrev) {
    elements.yamlSearchPrev.addEventListener("click", () => focusNextYamlMatch(-1));
  }
  if (elements.yamlSearchNext) {
    elements.yamlSearchNext.addEventListener("click", () => focusNextYamlMatch(1));
  }

  document.querySelectorAll("[data-supply]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.supply;
      if (mode === state.supplyMode) {
        state.supplyMode = "off";
      } else {
        state.supplyMode = mode;
      }
      updateSupplyUI();
      applyFilters();
    });
  });

  if (elements.analysisFind) {
    elements.analysisFind.addEventListener("click", runPathAnalysis);
  }
  if (elements.analysisToggle) {
    elements.analysisToggle.addEventListener("click", togglePathHighlight);
  }
  if (elements.analysisClear) {
    elements.analysisClear.addEventListener("click", clearPathAnalysis);
  }
  if (elements.analysisStart) {
    elements.analysisStart.addEventListener("keydown", (event) => {
      if (event.key === "Enter") runPathAnalysis();
    });
  }
  if (elements.analysisTarget) {
    elements.analysisTarget.addEventListener("keydown", (event) => {
      if (event.key === "Enter") runPathAnalysis();
    });
  }

  wireActionButtons();
  renderLegend();
  renderOntologyOverview(state.raw);
}

const TUTORIAL_STEPS = [
  {
    title: "Entities — Bausteine des Netzwerks",
    content: `
      <div class="tutorial-illustration">
        <svg viewBox="0 0 400 120" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="60" r="22" fill="#16a34a" opacity="0.85"/>
          <text x="50" y="65" text-anchor="middle" font-size="9" fill="#fff" font-weight="600">Mfr</text>
          <circle cx="130" cy="60" r="22" fill="#16a34a" opacity="0.85"/>
          <text x="130" y="65" text-anchor="middle" font-size="9" fill="#fff" font-weight="600">Commodity</text>
          <circle cx="210" cy="60" r="22" fill="#16a34a" opacity="0.85"/>
          <text x="210" y="65" text-anchor="middle" font-size="9" fill="#fff" font-weight="600">Infra</text>
          <circle cx="290" cy="60" r="22" fill="#16a34a" opacity="0.85"/>
          <text x="290" y="65" text-anchor="middle" font-size="9" fill="#fff" font-weight="600">Service</text>
          <circle cx="370" cy="60" r="22" fill="#16a34a" opacity="0.85"/>
          <text x="370" y="65" text-anchor="middle" font-size="9" fill="#fff" font-weight="600">Region</text>
          <text x="50" y="100" text-anchor="middle" font-size="8" fill="#4b5563">manufacturer</text>
          <text x="130" y="100" text-anchor="middle" font-size="8" fill="#4b5563">commodity</text>
          <text x="210" y="100" text-anchor="middle" font-size="8" fill="#4b5563">infrastructure</text>
          <text x="290" y="100" text-anchor="middle" font-size="8" fill="#4b5563">service</text>
          <text x="370" y="100" text-anchor="middle" font-size="8" fill="#4b5563">region</text>
        </svg>
      </div>
      <h3>Entities</h3>
      <p>Entities sind die Knoten im Lieferkettennetzwerk. Sie repräsentieren alle Akteure und Ressourcen: Hersteller, Rohstoffe, Infrastruktur, Dienstleistungen und Regionen.</p>
      <div class="tutorial-concept">Jedes Entity hat eine <strong>vulnerability</strong> (0–1), die angibt, wie anfällig es für Störungen ist. Höhere Werte bedeuten größere Verwundbarkeit.</div>
    `
  },
  {
    title: "Supply Chains — Wertschöpfungsketten",
    content: `
      <div class="tutorial-illustration">
        <svg viewBox="0 0 400 100" xmlns="http://www.w3.org/2000/svg">
          <defs><marker id="arrowAmber" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#f59e0b"/></marker></defs>
          <circle cx="60" cy="50" r="20" fill="#f59e0b" opacity="0.85"/>
          <text x="60" y="54" text-anchor="middle" font-size="11" fill="#fff" font-weight="600">A</text>
          <circle cx="200" cy="50" r="20" fill="#f59e0b" opacity="0.85"/>
          <text x="200" y="54" text-anchor="middle" font-size="11" fill="#fff" font-weight="600">B</text>
          <circle cx="340" cy="50" r="20" fill="#f59e0b" opacity="0.85"/>
          <text x="340" y="54" text-anchor="middle" font-size="11" fill="#fff" font-weight="600">C</text>
          <line x1="82" y1="50" x2="178" y2="50" stroke="#f59e0b" stroke-width="2.5" marker-end="url(#arrowAmber)"/>
          <line x1="222" y1="50" x2="318" y2="50" stroke="#f59e0b" stroke-width="2.5" marker-end="url(#arrowAmber)"/>
          <line x1="80" y1="72" x2="320" y2="72" stroke="#f97316" stroke-width="1.5" stroke-dasharray="6 4"/>
          <text x="200" y="90" text-anchor="middle" font-size="9" fill="#f97316">dependency</text>
        </svg>
      </div>
      <h3>Supply Chains</h3>
      <p>Supply Chains verbinden Entities zu Wertschöpfungsketten. Der Warenfluss verläuft entlang der <strong>stages</strong> von Stufe zu Stufe.</p>
      <div class="tutorial-concept"><strong>stages</strong> definieren den Warenfluss (A → B → C). <strong>dependencies</strong> (gestrichelt) markieren kritische Abhängigkeiten zwischen Entities.</div>
    `
  },
  {
    title: "Events — Störungsereignisse",
    content: `
      <div class="tutorial-illustration">
        <svg viewBox="0 0 400 120" xmlns="http://www.w3.org/2000/svg">
          <defs><marker id="arrowRed" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#dc2626"/></marker></defs>
          <polygon points="60,15 72,45 90,45 76,62 82,90 60,74 38,90 44,62 30,45 48,45" fill="#dc2626" opacity="0.9"/>
          <text x="60" y="58" text-anchor="middle" font-size="9" fill="#fff" font-weight="700">Event</text>
          <circle cx="180" cy="52" r="16" fill="#16a34a" opacity="0.7"/>
          <text x="180" y="56" text-anchor="middle" font-size="9" fill="#fff">target</text>
          <line x1="85" y1="52" x2="162" y2="52" stroke="#dc2626" stroke-width="2" marker-end="url(#arrowRed)"/>
          <text x="124" y="44" text-anchor="middle" font-size="8" fill="#dc2626">trigger</text>
          <circle cx="300" cy="28" r="12" fill="#dc2626" opacity="0.6"/>
          <text x="300" y="32" text-anchor="middle" font-size="7" fill="#fff">E1</text>
          <circle cx="300" cy="58" r="12" fill="#dc2626" opacity="0.6"/>
          <text x="300" y="62" text-anchor="middle" font-size="7" fill="#fff">E2</text>
          <circle cx="300" cy="88" r="12" fill="#dc2626" opacity="0.6"/>
          <text x="300" y="92" text-anchor="middle" font-size="7" fill="#fff">E3</text>
          <line x1="85" y1="40" x2="286" y2="28" stroke="#9333ea" stroke-width="1.5" marker-end="url(#arrowRed)"/>
          <line x1="85" y1="52" x2="286" y2="58" stroke="#9333ea" stroke-width="1.5" marker-end="url(#arrowRed)"/>
          <line x1="85" y1="64" x2="286" y2="88" stroke="#9333ea" stroke-width="1.5" marker-end="url(#arrowRed)"/>
          <text x="220" y="108" text-anchor="middle" font-size="8" fill="#9333ea">causes</text>
        </svg>
      </div>
      <h3>Events</h3>
      <p>Events modellieren Störungen: Naturkatastrophen, Marktschocks, Infrastrukturausfälle. Sie sind der Motor der Simulation.</p>
      <div class="tutorial-concept">Jedes Event hat einen <strong>trigger</strong> (Auslöser → Ziel-Entity), einen <strong>impact</strong> (Supply/Demand/Preis-Änderung) und <strong>causes</strong> (Folgeereignisse, die es auslöst).</div>
    `
  },
  {
    title: "Cascades — Zeitliche Kaskaden",
    content: `
      <div class="tutorial-illustration">
        <svg viewBox="0 0 400 130" xmlns="http://www.w3.org/2000/svg">
          <defs><marker id="arrowBlue" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#7c3aed"/></marker></defs>
          <line x1="60" y1="20" x2="60" y2="115" stroke="#7c3aed" stroke-width="2" opacity="0.3"/>
          <circle cx="60" cy="25" r="6" fill="#7c3aed"/>
          <text x="78" y="29" font-size="9" fill="#4b5563">0d</text>
          <circle cx="60" cy="65" r="6" fill="#7c3aed"/>
          <text x="78" y="69" font-size="9" fill="#4b5563">14d</text>
          <circle cx="60" cy="110" r="6" fill="#7c3aed"/>
          <text x="78" y="114" font-size="9" fill="#4b5563">45d</text>
          <rect x="120" y="12" width="80" height="26" rx="8" fill="#dc2626" opacity="0.8"/>
          <text x="160" y="29" text-anchor="middle" font-size="9" fill="#fff">Dürre</text>
          <rect x="120" y="52" width="80" height="26" rx="8" fill="#dc2626" opacity="0.8"/>
          <text x="160" y="69" text-anchor="middle" font-size="9" fill="#fff">Ernteausfall</text>
          <rect x="120" y="97" width="80" height="26" rx="8" fill="#dc2626" opacity="0.8"/>
          <text x="160" y="114" text-anchor="middle" font-size="9" fill="#fff">Preisschock</text>
          <line x1="202" y1="25" x2="260" y2="25" stroke="#22c55e" stroke-width="1.5" marker-end="url(#arrowBlue)"/>
          <circle cx="280" cy="25" r="12" fill="#16a34a" opacity="0.5"/>
          <text x="280" y="29" text-anchor="middle" font-size="7" fill="#fff">E1</text>
          <line x1="202" y1="65" x2="260" y2="65" stroke="#22c55e" stroke-width="1.5" marker-end="url(#arrowBlue)"/>
          <circle cx="280" cy="65" r="12" fill="#16a34a" opacity="0.5"/>
          <text x="280" y="69" text-anchor="middle" font-size="7" fill="#fff">E2</text>
          <line x1="202" y1="110" x2="260" y2="110" stroke="#22c55e" stroke-width="1.5" marker-end="url(#arrowBlue)"/>
          <circle cx="280" cy="110" r="12" fill="#16a34a" opacity="0.5"/>
          <text x="280" y="114" text-anchor="middle" font-size="7" fill="#fff">E3</text>
          <text x="320" y="30" font-size="8" fill="#22c55e">affects</text>
        </svg>
      </div>
      <h3>Cascades</h3>
      <p>Cascades ordnen Events in eine chronologische Abfolge. Die Timeline zeigt, wann welches Event eintritt und welche Entities betroffen sind.</p>
      <div class="tutorial-concept">Jeder Zeitpunkt in der <strong>timeline</strong> hat ein <strong>at</strong> (Zeitversatz, z.B. 14d), ein <strong>event</strong> und eine Liste von <strong>affects</strong> (betroffene Entities).</div>
    `
  },
  {
    title: "Feedback-Loops — Verstärkende Rückkopplung",
    content: `
      <div class="tutorial-illustration">
        <svg viewBox="0 0 400 130" xmlns="http://www.w3.org/2000/svg">
          <defs><marker id="arrowLoop" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#dc2626"/></marker></defs>
          <circle cx="100" cy="40" r="24" fill="#dc2626" opacity="0.8"/>
          <text x="100" y="38" text-anchor="middle" font-size="8" fill="#fff">Zahlungs-</text>
          <text x="100" y="48" text-anchor="middle" font-size="8" fill="#fff">ausfall</text>
          <circle cx="300" cy="40" r="24" fill="#dc2626" opacity="0.8"/>
          <text x="300" y="38" text-anchor="middle" font-size="8" fill="#fff">Diesel-</text>
          <text x="300" y="48" text-anchor="middle" font-size="8" fill="#fff">mangel</text>
          <circle cx="200" cy="110" r="24" fill="#dc2626" opacity="0.8"/>
          <text x="200" y="108" text-anchor="middle" font-size="8" fill="#fff">Rechen-</text>
          <text x="200" y="118" text-anchor="middle" font-size="8" fill="#fff">zentrum</text>
          <line x1="126" y1="40" x2="274" y2="40" stroke="#dc2626" stroke-width="2" marker-end="url(#arrowLoop)"/>
          <line x1="288" y1="62" x2="218" y2="92" stroke="#dc2626" stroke-width="2" marker-end="url(#arrowLoop)"/>
          <line x1="178" y1="100" x2="112" y2="62" stroke="#dc2626" stroke-width="2" marker-end="url(#arrowLoop)"/>
          <text x="200" y="18" text-anchor="middle" font-size="10" fill="#dc2626" font-weight="600">Feedback-Loop</text>
        </svg>
      </div>
      <h3>Feedback-Loops</h3>
      <p>Feedback-Loops entstehen, wenn nachgelagerte Störungen vorgelagerte Systeme verschlechtern — ein sich selbst verstärkender Kreislauf.</p>
      <div class="tutorial-concept"><strong>Beispiel:</strong> Zahlungsausfall → Diesel-Beschaffung blockiert → Rechenzentren fallen schneller aus → weitere Zahlungsausfälle. Die Schleife verstärkt sich mit jeder Runde.</div>
    `
  },
  {
    title: "Dashboard bedienen",
    content: `
      <div class="tutorial-illustration">
        <svg viewBox="0 0 400 120" xmlns="http://www.w3.org/2000/svg">
          <rect x="10" y="8" width="380" height="104" rx="12" fill="#f6f1e8" stroke="#e2e8f0" stroke-width="1.5"/>
          <rect x="18" y="16" width="100" height="88" rx="8" fill="#fff" stroke="#e2e8f0"/>
          <text x="68" y="36" text-anchor="middle" font-size="9" fill="#4b5563" font-weight="600">Filter</text>
          <rect x="30" y="44" width="60" height="6" rx="3" fill="#e2e8f0"/>
          <rect x="30" y="56" width="50" height="6" rx="3" fill="#e2e8f0"/>
          <rect x="30" y="68" width="55" height="6" rx="3" fill="#e2e8f0"/>
          <rect x="30" y="80" width="45" height="6" rx="3" fill="#2563eb" opacity="0.3"/>
          <rect x="126" y="16" width="148" height="88" rx="8" fill="#fff" stroke="#e2e8f0"/>
          <text x="200" y="36" text-anchor="middle" font-size="9" fill="#4b5563" font-weight="600">Graph</text>
          <circle cx="170" cy="62" r="8" fill="#16a34a" opacity="0.6"/><circle cx="200" cy="52" r="6" fill="#f59e0b" opacity="0.6"/><circle cx="220" cy="72" r="7" fill="#dc2626" opacity="0.6"/><circle cx="190" cy="82" r="5" fill="#7c3aed" opacity="0.6"/>
          <line x1="178" y1="62" x2="194" y2="54" stroke="#64748b" stroke-width="1"/><line x1="206" y1="54" x2="214" y2="68" stroke="#ef4444" stroke-width="1"/><line x1="195" y1="80" x2="214" y2="74" stroke="#0ea5e9" stroke-width="1"/>
          <rect x="282" y="16" width="100" height="88" rx="8" fill="#fff" stroke="#e2e8f0"/>
          <text x="332" y="36" text-anchor="middle" font-size="9" fill="#4b5563" font-weight="600">Details</text>
          <rect x="294" y="44" width="76" height="6" rx="3" fill="#e2e8f0"/>
          <rect x="294" y="56" width="60" height="6" rx="3" fill="#e2e8f0"/>
          <rect x="294" y="68" width="70" height="6" rx="3" fill="#f97316" opacity="0.3"/>
          <rect x="294" y="80" width="50" height="6" rx="3" fill="#e2e8f0"/>
        </svg>
      </div>
      <h3>Dashboard bedienen</h3>
      <p>So nutzt du den PDL-Viewer effektiv:</p>
      <div class="tutorial-concept">
        <strong>1.</strong> Lade ein Szenario (YAML) über den Upload oder das Beispiel.<br>
        <strong>2.</strong> Filtere nach Knoten-/Kantentyp, Sektor oder Location.<br>
        <strong>3.</strong> Klicke auf einen Knoten für Details und Erklärungen.<br>
        <strong>4.</strong> Nutze <strong>Supply-Chain-Fokus</strong> für Upstream/Downstream-Analyse.<br>
        <strong>5.</strong> Öffne das <strong>Analyse</strong>-Menü für Pfadanalyse zwischen Knoten.
      </div>
    `
  }
];

const tutorialState = { step: 0, open: false };
const TUTORIAL_SEEN_KEY = "pdl-tutorial-seen";
const SPLASH_AUTO_HIDE_MS = 4200;
const SPLASH_FADE_MS = 280;

function openTutorial() {
  tutorialState.step = 0;
  tutorialState.open = true;
  elements.tutorialOverlay.classList.remove("hidden");
  setTutorialStep(0);
}

function closeTutorial() {
  tutorialState.open = false;
  elements.tutorialOverlay.classList.add("hidden");
  localStorage.setItem(TUTORIAL_SEEN_KEY, "1");
}

function setTutorialStep(n) {
  tutorialState.step = n;
  const step = TUTORIAL_STEPS[n];
  elements.tutorialTitle.textContent = step.title;
  // Tutorial content is static/hardcoded, not user-provided
  elements.tutorialBody.innerHTML = step.content;
  elements.tutorialStep.textContent = `${n + 1} / ${TUTORIAL_STEPS.length}`;
  elements.tutorialPrev.style.visibility = n === 0 ? "hidden" : "visible";
  elements.tutorialNext.textContent = n === TUTORIAL_STEPS.length - 1 ? "Fertig" : "Weiter";

  const dots = elements.tutorialOverlay.querySelectorAll(".tutorial-dot");
  dots.forEach((dot, i) => {
    dot.classList.toggle("active", i === n);
    dot.classList.toggle("completed", i < n);
  });
}

function nextStep() {
  if (tutorialState.step < TUTORIAL_STEPS.length - 1) {
    setTutorialStep(tutorialState.step + 1);
  } else {
    closeTutorial();
  }
}

function prevStep() {
  if (tutorialState.step > 0) {
    setTutorialStep(tutorialState.step - 1);
  }
}

function shouldOpenTutorialOnLoad() {
  return !localStorage.getItem(TUTORIAL_SEEN_KEY);
}

function initSplashScreen() {
  if (!elements.splashScreen) {
    if (shouldOpenTutorialOnLoad()) openTutorial();
    return;
  }

  const shouldOpenTutorial = shouldOpenTutorialOnLoad();
  let closed = false;
  let autoTimer = null;

  document.body.classList.add("splash-open");

  const finishSplash = () => {
    if (closed) return;
    closed = true;

    if (autoTimer) {
      window.clearTimeout(autoTimer);
      autoTimer = null;
    }
    document.removeEventListener("keydown", onSplashKeydown);

    elements.splashScreen.classList.add("is-leaving");

    window.setTimeout(() => {
      elements.splashScreen.classList.add("hidden");
      elements.splashScreen.setAttribute("aria-hidden", "true");
      document.body.classList.remove("splash-open");

      if (shouldOpenTutorial) {
        openTutorial();
      }
    }, SPLASH_FADE_MS);
  };

  const onSplashKeydown = (event) => {
    if (event.key === "Escape") {
      finishSplash();
    }
  };

  document.addEventListener("keydown", onSplashKeydown);
  elements.splashStartBtn?.addEventListener("click", finishSplash);

  autoTimer = window.setTimeout(() => {
    finishSplash();
  }, SPLASH_AUTO_HIDE_MS);
}

wireUI();

elements.tutorialBtn.addEventListener("click", openTutorial);
elements.tutorialClose.addEventListener("click", closeTutorial);
elements.tutorialPrev.addEventListener("click", prevStep);
elements.tutorialNext.addEventListener("click", nextStep);
elements.tutorialOverlay.addEventListener("click", (e) => {
  if (e.target === elements.tutorialOverlay) closeTutorial();
});

initSplashScreen();
