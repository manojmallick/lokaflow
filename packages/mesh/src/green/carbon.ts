// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/mesh/src/green/carbon.ts
// ElectricityMapsClient — fetches real-time carbon intensity for a given zone.
// Free tier: 5 req/min, 100 req/day.  Falls back to EU average if no key / offline.

const EU_AVERAGE_G_CO2_PER_KWH = 295; // gCO₂/kWh EU average 2024

interface CarbonResponse {
    zone: string;
    carbonIntensity: number; // gCO₂/kWh
    datetime: string;
    updatedAt: string;
}

export class ElectricityMapsClient {
    private cachedIntensity: number | null = null;
    private cacheExpiry = 0;
    /** Cache for 15 min — avoids burning the 100 req/day free limit */
    private readonly cacheTtlMs = 15 * 60 * 1_000;

    constructor(
        private readonly apiKey: string,
        private readonly zone: string = "NL",
    ) { }

    /**
     * Returns current carbon intensity in gCO₂/kWh.
     * Returns EU average if no API key or request fails.
     */
    async getCarbonIntensity(): Promise<number> {
        if (Date.now() < this.cacheExpiry && this.cachedIntensity !== null) {
            return this.cachedIntensity;
        }

        if (!this.apiKey) return EU_AVERAGE_G_CO2_PER_KWH;

        try {
            const res = await fetch(
                `https://api.electricitymap.org/v3/carbon-intensity/latest?zone=${this.zone}`,
                {
                    headers: { "auth-token": this.apiKey },
                    signal: AbortSignal.timeout(5_000),
                },
            );

            if (!res.ok) return this.cachedIntensity ?? EU_AVERAGE_G_CO2_PER_KWH;

            const data = (await res.json()) as CarbonResponse;
            this.cachedIntensity = data.carbonIntensity;
            this.cacheExpiry = Date.now() + this.cacheTtlMs;
            return data.carbonIntensity;
        } catch {
            return this.cachedIntensity ?? EU_AVERAGE_G_CO2_PER_KWH;
        }
    }
}

// ── GreenReport ──────────────────────────────────────────────────────────────

export interface GreenMetrics {
    /** kWh consumed by local inference */
    localKwh: number;
    /** gCO₂ emitted by local inference */
    localCo2Grams: number;
    /** kWh that would have been used if routed to cloud */
    cloudEquivalentKwh: number;
    /** gCO₂ saved by running locally instead of cloud datacentre */
    co2SavedGrams: number;
    /** Carbon intensity used for calculation */
    carbonIntensityGCo2PerKwh: number;
}

/** Cloud datacentre energy: ~2.5× more efficient than generic hardware but with PUE overhead */
const CLOUD_CO2_PER_TOKEN_GRAMS = 0.000_004_3; // gCO₂ per output token (EU cloud avg estimate)

export class GreenReport {
    constructor(private readonly client: ElectricityMapsClient) { }

    async calculate(
        localWattsUsed: number,
        inferenceSeconds: number,
        cloudTokensReplaced: number,
    ): Promise<GreenMetrics> {
        const carbonIntensity = await this.client.getCarbonIntensity();

        const localKwh = (localWattsUsed * inferenceSeconds) / 3_600_000;
        const localCo2Grams = localKwh * carbonIntensity;

        const cloudEquivalentKwh = cloudTokensReplaced * (CLOUD_CO2_PER_TOKEN_GRAMS / carbonIntensity);
        const cloudCo2Grams = cloudTokensReplaced * CLOUD_CO2_PER_TOKEN_GRAMS;
        const co2SavedGrams = Math.max(0, cloudCo2Grams - localCo2Grams);

        return {
            localKwh,
            localCo2Grams,
            cloudEquivalentKwh,
            co2SavedGrams,
            carbonIntensityGCo2PerKwh: carbonIntensity,
        };
    }

    formatReport(metrics: GreenMetrics): string {
        const lines = [
            "  LokaFlow™ Green Report",
            "  ══════════════════════════════════",
            `  Carbon intensity:  ${metrics.carbonIntensityGCo2PerKwh} gCO₂/kWh`,
            `  Local energy used: ${(metrics.localKwh * 1000).toFixed(2)} Wh`,
            `  Local CO₂:         ${metrics.localCo2Grams.toFixed(1)} g`,
            `  CO₂ saved vs cloud: ${metrics.co2SavedGrams.toFixed(1)} g`,
            "",
            `  🌱 ${metrics.co2SavedGrams.toFixed(1)} gCO₂ saved by running locally.`,
        ];
        return lines.join("\n");
    }
}
