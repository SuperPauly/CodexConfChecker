declare global {
  interface Window {
    dataLayer?: unknown[][];
    gtag?: (...args: unknown[]) => void;
  }
}

export function normalizeMeasurementId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toUpperCase();
  return /^G-[A-Z0-9]{4,20}$/u.test(normalized) ? normalized : undefined;
}

export function loadGoogleAnalytics(measurementId: string): boolean {
  const normalized = normalizeMeasurementId(measurementId);
  if (!normalized) return false;
  if (document.querySelector(`script[data-ga-measurement-id="${normalized}"]`)) return true;

  window.dataLayer ??= [];
  window.gtag = (...args: unknown[]) => {
    window.dataLayer?.push(args);
  };
  window.gtag("js", new Date());
  window.gtag("config", normalized, { send_page_view: true });

  const script = document.createElement("script");
  script.async = true;
  script.dataset.gaMeasurementId = normalized;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(normalized)}`;
  document.head.append(script);
  return true;
}
