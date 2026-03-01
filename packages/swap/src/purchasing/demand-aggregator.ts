// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaSwap™ — lokaflow.io

import Database from "better-sqlite3";

export interface MemberDemandPledge {
    memberId: string;
    provider: 'anthropic' | 'openai' | 'google';
    estimatedMonthlyTokens: number;  // estimated usage
    maxPricePerMToken: number;       // member's price ceiling
    commitmentMonths: number;        // 1 | 3 | 6 | 12 (longer = better rates)
}

export interface AggregateDemand {
    provider: string;
    totalMembers: number;
    totalTokensCommitted: number;
    blendedMaxPrice: number;
    tierBreakdown: {
        committed12Month: number;
        committed3Month: number;
        monthly: number;
    };
}

export class DemandAggregator {
    constructor(private db: Database.Database) {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS demand_pledges (
        member_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        estimated_monthly_tokens INTEGER NOT NULL,
        max_price_per_mtoken REAL NOT NULL,
        commitment_months INTEGER NOT NULL,
        PRIMARY KEY (member_id, provider)
      );
    `);
    }

    addPledge(pledge: MemberDemandPledge): void {
        this.db.prepare(`
       INSERT OR REPLACE INTO demand_pledges 
       (member_id, provider, estimated_monthly_tokens, max_price_per_mtoken, commitment_months)
       VALUES (?, ?, ?, ?, ?)
     `).run(
            pledge.memberId, pledge.provider, pledge.estimatedMonthlyTokens,
            pledge.maxPricePerMToken, pledge.commitmentMonths
        );
    }

    getPledges(provider: string): MemberDemandPledge[] {
        return this.db.prepare(`SELECT * FROM demand_pledges WHERE provider = ?`).all(provider).map((r: any) => ({
            memberId: r.member_id,
            provider: r.provider,
            estimatedMonthlyTokens: r.estimated_monthly_tokens,
            maxPricePerMToken: r.max_price_per_mtoken,
            commitmentMonths: r.commitment_months
        }));
    }

    private calculateBlendedMax(pledges: MemberDemandPledge[]): number {
        if (pledges.length === 0) return 0;

        // We calculate a volume-weighted average max price
        let totalValue = 0;
        let totalTokens = 0;

        for (const p of pledges) {
            totalValue += p.estimatedMonthlyTokens * p.maxPricePerMToken;
            totalTokens += p.estimatedMonthlyTokens;
        }

        return totalTokens > 0 ? (totalValue / totalTokens) : 0;
    }

    async getMonthlyDemand(provider: string): Promise<AggregateDemand> {
        const pledges = this.getPledges(provider) || [];

        return {
            provider,
            totalMembers: pledges.length,
            totalTokensCommitted: pledges.reduce((sum, p) => sum + p.estimatedMonthlyTokens, 0),
            blendedMaxPrice: this.calculateBlendedMax(pledges),

            // Tier breakdown for negotiation leverage
            tierBreakdown: {
                committed12Month: pledges.filter(p => p.commitmentMonths >= 12).length,
                committed3Month: pledges.filter(p => p.commitmentMonths >= 3 && p.commitmentMonths < 12).length,
                monthly: pledges.filter(p => p.commitmentMonths === 1).length,
            }
        };
    }
}
