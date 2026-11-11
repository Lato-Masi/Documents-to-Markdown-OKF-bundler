// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import OKFJsonBundleExporterPanel from "../OKFJsonBundleExporterPanel";

const SAMPLE_MD = `# Municipal Clinical Readiness Report

The World Health Organization and Ministry of Health evaluated PostgreSQL and HTTPS telemetry across regional facilities.

Read [WHO Guidelines](https://www.who.int) or jump to [Readiness Metrics](#readiness-metrics).

## Readiness Metrics

> "Digitized reporting cut delays by 78% across pilot clinics." — **[Clinical Director, MoH]**

| Metric | Value |
| :--- | :---: |
| Uptime | 99.5% |
`;

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(URL, "createObjectURL", {
    writable: true,
    configurable: true,
    value: vi.fn(() => "blob:mock-okf-json-url"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    writable: true,
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("OKFJsonBundleExporterPanel — Interactive Annotations, Metadata Views & Download", () => {
  it("renders OKF v0.2 conformance status, supports adding and deleting user annotations, and persists to localStorage", () => {
    render(
      <OKFJsonBundleExporterPanel
        markdown={SAMPLE_MD}
        sourceFileName="clinical-readiness.pdf"
      />
    );

    expect(screen.getByText(/OKF v0\.2 Conformant \(0 errors\)/i)).toBeTruthy();

    // Automated quote + table annotations are listed initially
    expect(screen.getByText(/callout-quote/i)).toBeTruthy();
    expect(screen.getByText(/table-structure/i)).toBeTruthy();

    // Add a user annotation
    const noteInput = screen.getByPlaceholderText(
      /Add clinical, editorial, or verification note/i
    );
    const anchorInput = screen.getByPlaceholderText(
      /Exact phrase or figure metric from section/i
    );

    fireEvent.change(anchorInput, { target: { value: "99.5%" } });
    fireEvent.change(noteInput, {
      target: { value: "Verified against hospital uptime logs." },
    });

    const addBtn = screen.getByRole("button", { name: /Add Annotation/i });
    fireEvent.click(addBtn);

    expect(screen.getByText("Verified against hospital uptime logs.")).toBeTruthy();

    // Persisted in localStorage
    const storedRaw = window.localStorage.getItem(
      "okf_doc_annotations_v1:clinical-readiness.pdf"
    );
    expect(storedRaw).toBeTruthy();
    expect(storedRaw).toContain("Verified against hospital uptime logs.");

    // Delete user annotation
    const removeBtn = screen.getByTitle("Remove annotation");
    fireEvent.click(removeBtn);
    expect(screen.queryByText("Verified against hospital uptime logs.")).toBeNull();
  });

  it("switches across Entities, Hierarchy & Links, and OKF v0.2 JSON Source tabs and downloads .okf.json", () => {
    render(
      <OKFJsonBundleExporterPanel
        markdown={SAMPLE_MD}
        sourceFileName="clinical-readiness.pdf"
      />
    );

    // Switch to Entities tab
    fireEvent.click(screen.getByRole("button", { name: /^Entities \(/i }));
    expect(screen.getByPlaceholderText(/Filter entities or sections/i)).toBeTruthy();
    expect(screen.getByText(/World Health Organization/i)).toBeTruthy();

    // Filter entities by search input
    fireEvent.change(screen.getByPlaceholderText(/Filter entities or sections/i), {
      target: { value: "PostgreSQL" },
    });
    expect(screen.getByText("PostgreSQL")).toBeTruthy();

    // Switch to Hierarchy & Links tab
    fireEvent.click(screen.getByRole("button", { name: /^Hierarchy & Links/i }));
    expect(screen.getByText("Document Section Hierarchy")).toBeTruthy();
    expect(screen.getByText("Structural & Semantic Links")).toBeTruthy();
    expect(screen.getByText("https://www.who.int")).toBeTruthy();

    // Switch to JSON Source tab & verify rawMarkdown toggle
    fireEvent.click(screen.getByRole("button", { name: /OKF v0\.2 JSON Source/i }));
    expect(screen.getByText(/"okf_spec": "0\.2"/)).toBeTruthy();
    expect(screen.getByText(/"rawMarkdown":/)).toBeTruthy();

    const includeRawCheckbox = screen.getByLabelText(/Include Raw Markdown/i);
    fireEvent.click(includeRawCheckbox);
    expect(screen.queryByText(/"rawMarkdown":/)).toBeNull();

    // Trigger Download OKF (.json)
    const downloadBtn = screen.getByRole("button", { name: /Download OKF \(\.json\)/i });
    fireEvent.click(downloadBtn);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
