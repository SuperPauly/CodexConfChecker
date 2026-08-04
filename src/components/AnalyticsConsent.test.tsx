import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { ANALYTICS_CONSENT_KEY, AnalyticsConsent } from "./AnalyticsConsent";

describe("AnalyticsConsent", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    document.querySelectorAll("script[data-ga-measurement-id]").forEach((script) => script.remove());
    delete window.dataLayer;
    delete window.gtag;
  });

  it("renders nothing when analytics has not been configured", () => {
    render(<AnalyticsConsent />);
    expect(screen.queryByRole("region", { name: /visitor analytics/i })).not.toBeInTheDocument();
  });

  it("does not load Google before the visitor grants consent", () => {
    render(<AnalyticsConsent measurementId="G-AB12CD34" />);
    expect(screen.getByRole("region", { name: /visitor analytics/i })).toBeVisible();
    expect(document.querySelector("script[data-ga-measurement-id]")).toBeNull();
  });

  it("remembers approval and loads analytics", async () => {
    render(<AnalyticsConsent measurementId="G-AB12CD34" />);

    await userEvent.click(screen.getByRole("button", { name: /allow analytics/i }));

    expect(localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe("granted");
    expect(document.querySelector("script[data-ga-measurement-id='G-AB12CD34']")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /visitor analytics/i })).not.toBeInTheDocument();
  });

  it("remembers a decline without loading Google", async () => {
    const { unmount } = render(<AnalyticsConsent measurementId="G-AB12CD34" />);
    await userEvent.click(screen.getByRole("button", { name: /no thanks/i }));

    expect(localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe("denied");
    expect(document.querySelector("script[data-ga-measurement-id]")).toBeNull();

    unmount();
    render(<AnalyticsConsent measurementId="G-AB12CD34" />);
    expect(screen.queryByRole("region", { name: /visitor analytics/i })).not.toBeInTheDocument();
  });
});
