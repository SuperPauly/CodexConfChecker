import { afterEach, describe, expect, it } from "vitest";

import { loadGoogleAnalytics, normalizeMeasurementId } from "./google";

describe("Google Analytics loader", () => {
  afterEach(() => {
    document.querySelectorAll("script[data-ga-measurement-id]").forEach((script) => script.remove());
    delete window.dataLayer;
    delete window.gtag;
  });

  it("accepts GA4 measurement IDs and rejects malformed values", () => {
    expect(normalizeMeasurementId(" g-ab12cd34 ")).toBe("G-AB12CD34");
    expect(normalizeMeasurementId("UA-123-4")).toBeUndefined();
    expect(normalizeMeasurementId("G-<script>")).toBeUndefined();
    expect(normalizeMeasurementId(undefined)).toBeUndefined();
  });

  it("loads one Google tag and configures a standard page view", () => {
    expect(loadGoogleAnalytics("G-AB12CD34")).toBe(true);
    expect(loadGoogleAnalytics("G-AB12CD34")).toBe(true);

    const scripts = document.querySelectorAll("script[data-ga-measurement-id]");
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toHaveAttribute(
      "src",
      "https://www.googletagmanager.com/gtag/js?id=G-AB12CD34",
    );
    expect(window.dataLayer?.some((entry) => entry[0] === "config" && entry[1] === "G-AB12CD34")).toBe(true);
  });

  it("does not load anything for an invalid identifier", () => {
    expect(loadGoogleAnalytics("not-valid")).toBe(false);
    expect(document.querySelector("script[data-ga-measurement-id]")).toBeNull();
    expect(window.dataLayer).toBeUndefined();
  });
});
