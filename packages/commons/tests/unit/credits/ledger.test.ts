// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
// LokaCommons™ — lokaflow.io

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CreditLedger, InsufficientCreditsError } from "../../src/credits/ledger.js";
import { unlinkSync } from "fs";

describe('CreditLedger', () => {
    let ledger: CreditLedger;

    beforeEach(() => {
        ledger = new CreditLedger('./commons.test.db');
    });

    afterEach(() => {
        try { unlinkSync('./commons.test.db'); } catch (e) { }
    });

    it('maintains accurate running balance', async () => {
        await ledger.record({ memberId: 'alice', type: 'governance-grant', amount: 10000, memo: 'onboarding' });
        await ledger.record({ memberId: 'alice', type: 'spend', amount: -1100, memo: 'task abc' });
        await ledger.record({ memberId: 'alice', type: 'earn', amount: 800, memo: 'task def' });

        expect(await ledger.getBalance('alice')).toBe(9700)
    });

    it('rejects spend when balance insufficient', async () => {
        await expect(ledger.record({ memberId: 'bob', type: 'spend', amount: -100, memo: 'fail' }))
            .rejects.toThrow(InsufficientCreditsError);
    });

    it('audit passes on clean ledger', async () => {
        await ledger.record({ memberId: 'alice', type: 'governance-grant', amount: 10000, memo: 'onboarding' });
        const result = await ledger.audit()
        expect(result.passed).toBe(true)
        expect(result.negativBalanceCount).toBe(0)
    });
});
