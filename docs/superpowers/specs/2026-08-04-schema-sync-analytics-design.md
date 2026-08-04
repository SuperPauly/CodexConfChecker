# Schema Freshness And Visitor Analytics Design

## Goal

Show exactly when each bundled Codex schema was last copied from the corresponding OpenAI release, and provide optional Google Analytics 4 visitor metrics without sending configuration contents or validation details.

## Schema freshness

Each stable and alpha manifest entry gains a required `syncedAt` ISO 8601 timestamp. The synchronization script compares each downloaded channel with its previous tag and SHA256 digest. A changed channel receives the current synchronization time. An unchanged channel preserves its previous `syncedAt`; old manifests fall back to their existing `generatedAt` value during the first migration.

The schema selector displays `Last synced` beneath each release version using the visitor's local date and time. The `time` element retains the exact ISO timestamp for accessibility and inspection. This describes the last successful repository update, not merely the last scheduled check.

## Visitor analytics

Google Analytics 4 is optional. The Pages build reads the non sensitive repository variable `GA_MEASUREMENT_ID` and exposes it as `VITE_GA_MEASUREMENT_ID`. When missing or invalid, analytics is completely disabled.

When configured, the site presents a compact consent notice. Google scripts are not loaded until the visitor chooses Allow analytics. Declining is remembered locally. Analytics receives standard page view information only. TOML, JSON, YAML, schemas, diagnostics, filenames, formatting results, and editor contents are never included.

## User interface

The existing schema radio cards remain structurally unchanged. The version and sync time form a compact metadata stack. The consent notice uses the active Rainglow tokens and collapses cleanly on narrow screens.

## Testing

Script tests cover independent timestamps and migration from the previous manifest format. Parser tests reject missing or malformed channel timestamps. Component tests verify both visible timestamps. Analytics tests verify disabled, declined, and accepted states, including that no Google script loads before consent. Workflow tests verify the repository variable reaches the Vite build.

