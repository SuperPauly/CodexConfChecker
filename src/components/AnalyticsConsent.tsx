import { useEffect, useState } from "react";

import { loadGoogleAnalytics, normalizeMeasurementId } from "../analytics/google";

export const ANALYTICS_CONSENT_KEY = "codex-config-checker.analytics-consent";

type Consent = "granted" | "denied" | undefined;

function readConsent(): Consent {
  try {
    const value = localStorage.getItem(ANALYTICS_CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : undefined;
  } catch {
    return undefined;
  }
}

function saveConsent(value: Exclude<Consent, undefined>) {
  try {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, value);
  } catch {
    // Consent still applies for this page even when storage is unavailable.
  }
}

export function AnalyticsConsent({ measurementId }: { readonly measurementId?: string }) {
  const normalizedId = normalizeMeasurementId(measurementId);
  const [consent, setConsent] = useState<Consent>(() => readConsent());

  useEffect(() => {
    if (normalizedId && consent === "granted") loadGoogleAnalytics(normalizedId);
  }, [consent, normalizedId]);

  if (!normalizedId || consent) return null;

  const choose = (value: Exclude<Consent, undefined>) => {
    saveConsent(value);
    setConsent(value);
  };

  return (
    <aside aria-labelledby="analytics-consent-title" className="analytics-consent" role="region">
      <div>
        <strong id="analytics-consent-title">Visitor analytics</strong>
        <p>Allow anonymous page visit metrics to help improve this tool. Configuration files and validation results are never sent.</p>
      </div>
      <div className="analytics-consent-actions">
        <button className="button button-primary" onClick={() => choose("granted")} type="button">Allow analytics</button>
        <button className="button button-secondary" onClick={() => choose("denied")} type="button">No thanks</button>
      </div>
    </aside>
  );
}
