import { describe, it, expect } from "vitest";
import { validateBundle, isConformant } from "okf-ts";
import {
  buildOKFv02JsonBundle,
  serializeOKFv02JsonBundle,
  normalizeAnnotationDocKey,
  type OKFDocumentAnnotation,
} from "../okfJsonBundleExporter";

const COMPLEX_MARKDOWN_FIXTURE = `# Urban Primary Healthcare Digital Transformation

The Ministry of Health and Family Welfare (MoHFW) and the World Health Organization partnered to modernize Urban Primary Health Care Services Delivery Project (UPHCSDP) clinics using TypeScript, GraphQL, and PostgreSQL telemetry pipelines.

Read the [WHO Digital Health Guideline](https://www.who.int/health-topics/digital-health) and jump to [Clinical Readiness Metrics](#clinical-readiness-metrics) for complete benchmarks.

## Infrastructure & Interoperability Architecture

All diagnostic nodes communicate over HTTPS and OAuth 2.0 to synchronize Fast Healthcare Interoperability Resources (FHIR) records across municipal centers.

### Telemetry & API Gateway

\`\`\`typescript
export async function syncClinicTelemetry(clinicId: string): Promise<boolean> {
  return Boolean(clinicId);
}
\`\`\`

> "Standardizing FHIR APIs reduced reporting latency from 14 days to under 45ms across 32 municipal clinics." — **[Lead Health Architect, MoHFW]**

## Clinical Readiness Metrics

Facility readiness improved by 84.5% across 120 beds with an average sync latency of 42ms.

| Indicator | Baseline | Target | Status |
| :--- | :---: | :---: | :--- |
| EHR Uptime | 72.0% | 99.9% | Verified |
| Sync Latency | 450ms | 45ms | Achieved |

See [Infrastructure & Interoperability Architecture](./infrastructure-interoperability-architecture.md) for gateway specifications.
`;

describe("OKF v0.2 JSON Bundle Exporter — Conformance & Structural Metadata", () => {
  it("builds a strictly conformant OKF v0.2 JSON bundle validated by okf-ts with zero errors", () => {
    const userAnnotations: OKFDocumentAnnotation[] = [
      {
        id: "ann_review_1",
        kind: "claim-check",
        source: "user",
        targetSection: "Clinical Readiness Metrics",
        anchorText: "84.5% across 120 beds",
        comment: "Cross-checked against Q4 municipal facility audit dataset.",
        author: "human:epidemiologist",
        createdAt: "2026-03-15T10:00:00.000Z",
        tags: ["verified-metric"],
      },
    ];

    const bundle = buildOKFv02JsonBundle(COMPLEX_MARKDOWN_FIXTURE, {
      sourceFileName: "urban-primary-care-brief.pdf",
      annotations: userAnnotations,
      includeAutomatedAnnotations: true,
      includeRawMarkdown: true,
    });

    // 1. Official okf-ts v0.2 validation
    const directIssues = validateBundle(bundle);
    const errors = directIssues.filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
    expect(isConformant(directIssues)).toBe(true);

    expect(bundle.okf_spec).toBe("0.2");
    expect(bundle.version).toBe("0.2.0");
    expect(bundle.$schema).toBe("https://okf.dev/schemas/v0.2/bundle.json");
    expect(bundle.conformance.isConformant).toBe(true);
    expect(bundle.conformance.errorCount).toBe(0);
    expect(bundle.conformance.trustTiers["human-reviewed"]).toBeGreaterThan(0);

    // 2. Generated Markdown preservation
    expect(bundle.source_document.fileName).toBe("urban-primary-care-brief.pdf");
    expect(bundle.source_document.rawMarkdown).toContain(
      "# Urban Primary Healthcare Digital Transformation"
    );
    expect(bundle.concepts.length).toBeGreaterThanOrEqual(3);

    // 3. Annotations (user + automated quote, table, and code block annotations)
    const { annotations } = bundle.structural_metadata;
    expect(annotations.userCount).toBe(1);
    expect(annotations.automatedCount).toBeGreaterThanOrEqual(3);
    expect(annotations.items.some((a) => a.id === "ann_review_1" && a.kind === "claim-check")).toBe(
      true
    );

    const quoteAnnotation = annotations.items.find((a) => a.kind === "callout-quote");
    expect(quoteAnnotation).toBeDefined();
    expect(quoteAnnotation?.speakerAttribution).toContain("Lead Health Architect, MoHFW");

    const tableAnnotation = annotations.items.find((a) => a.kind === "table-structure");
    expect(tableAnnotation).toBeDefined();
    expect(tableAnnotation?.comment).toContain("4 columns × 2 rows");

    const codeAnnotation = annotations.items.find((a) => a.kind === "code-artifact");
    expect(codeAnnotation).toBeDefined();
    expect(codeAnnotation?.tags).toContain("typescript");

    // Verify user annotation is attached to the matching concept's structural_metadata
    const metricsConcept = bundle.concepts.find((c) =>
      String(c.metadata.title).toLowerCase().includes("clinical readiness metrics")
    );
    expect(metricsConcept).toBeDefined();
    const metricsStructMeta = metricsConcept?.metadata.structural_metadata as {
      annotations: OKFDocumentAnnotation[];
    };
    expect(metricsStructMeta.annotations.some((a) => a.id === "ann_review_1")).toBe(true);
  });

  it("extracts typed entities (organizations, concepts, technologies, protocols, metrics) with section provenance", () => {
    const bundle = buildOKFv02JsonBundle(COMPLEX_MARKDOWN_FIXTURE, {
      sourceFileName: "urban-primary-care-brief.md",
    });

    const { entities } = bundle.structural_metadata;
    expect(entities.totalUniqueEntities).toBeGreaterThan(5);

    const entityNames = entities.items.map((e) => e.name);
    expect(
      entityNames.some(
        (n) =>
          n.includes("World Health Organization") ||
          n.includes("Ministry of Health and Family Welfare")
      )
    ).toBe(true);
    expect(entities.byType.organization?.length).toBeGreaterThanOrEqual(1);

    // Technical/protocol/technology entities
    expect(
      entities.items.some(
        (e) =>
          e.name.toLowerCase() === "typescript" &&
          (e.entityType === "technology" || e.entityType === "concept")
      )
    ).toBe(true);
    expect(
      entities.items.some(
        (e) => e.entityType === "protocol" || e.name.toUpperCase().includes("HTTPS")
      )
    ).toBe(true);
    expect(entities.byType.metric?.length).toBeGreaterThanOrEqual(1);

    // Every concept-matched entity tracks sectionHeadings & conceptPaths
    const tsEntity = entities.items.find((e) => e.name.toLowerCase() === "typescript");
    expect(tsEntity?.conceptPaths.length).toBeGreaterThanOrEqual(1);
    expect(tsEntity?.sectionHeadings.length).toBeGreaterThanOrEqual(1);
  });

  it("preserves nested H1 -> H2 -> H3 section hierarchy and internal/external/semantic links", () => {
    const bundle = buildOKFv02JsonBundle(COMPLEX_MARKDOWN_FIXTURE, {
      sourceFileName: "architecture.md",
    });

    const { hierarchy, links } = bundle.structural_metadata;
    expect(hierarchy.maxDepth).toBe(3);
    expect(hierarchy.totalSections).toBe(4);
    expect(hierarchy.tree.length).toBe(1);

    const h1Root = hierarchy.tree[0];
    expect(h1Root.depth).toBe(1);
    expect(h1Root.title).toBe("Urban Primary Healthcare Digital Transformation");
    expect(h1Root.children.length).toBe(2);

    const infraH2 = h1Root.children.find((c) =>
      c.title.includes("Infrastructure & Interoperability Architecture")
    );
    expect(infraH2).toBeDefined();
    expect(infraH2?.depth).toBe(2);
    expect(infraH2?.children.length).toBe(1);
    expect(infraH2?.children[0].depth).toBe(3);
    expect(infraH2?.children[0].title).toBe("Telemetry & API Gateway");
    expect(infraH2?.children[0].breadcrumbPath).toBe(
      "Urban Primary Healthcare Digital Transformation > Infrastructure & Interoperability Architecture > Telemetry & API Gateway"
    );

    // External & internal links
    expect(
      links.externalLinks.some(
        (l) => l.url === "https://www.who.int/health-topics/digital-health" && l.kind === "external_url"
      )
    ).toBe(true);
    expect(
      links.internalLinks.some(
        (l) => l.url === "#clinical-readiness-metrics" && l.kind === "internal_anchor"
      )
    ).toBe(true);
    expect(
      links.internalLinks.some(
        (l) =>
          l.url.endsWith("infrastructure-interoperability-architecture.md") &&
          l.kind === "relative_concept"
      )
    ).toBe(true);
    expect(links.conceptGraph.nodes.length).toBe(bundle.concepts.length);
  });

  it("supports omitting rawMarkdown and round-trips cleanly via serializeOKFv02JsonBundle", () => {
    const compactBundle = buildOKFv02JsonBundle("# Summary\n\nConcise report.", {
      sourceFileName: "Summary Report.pdf",
      includeRawMarkdown: false,
      includeAutomatedAnnotations: false,
    });

    expect(compactBundle.source_document.rawMarkdown).toBeUndefined();
    expect(compactBundle.structural_metadata.annotations.automatedCount).toBe(0);
    expect(normalizeAnnotationDocKey("Summary Report.pdf")).toBe(
      "okf_doc_annotations_v1:summary report.pdf"
    );

    const serialized = serializeOKFv02JsonBundle(compactBundle, false);
    const parsed = JSON.parse(serialized);
    expect(parsed.okf_spec).toBe("0.2");
    expect(parsed.conformance.isConformant).toBe(true);
  });
});
