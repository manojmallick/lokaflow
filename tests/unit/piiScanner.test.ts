// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// NOTE: All PII data in this file is SYNTHETIC. No real personal data.

import { describe, it, expect } from "vitest";
import { PIIScanner } from "../../src/router/piiScanner.js";

const scanner = new PIIScanner();

describe("PIIScanner", () => {
  describe("clean text — no PII", () => {
    it("ordinary technical question has no PII", async () => {
      const result = await scanner.scan("How do I implement a binary search tree in TypeScript?");
      expect(result.containsPii).toBe(false);
      expect(result.typesFound).toHaveLength(0);
    });

    it("empty string has no PII", async () => {
      const result = await scanner.scan("");
      expect(result.containsPii).toBe(false);
    });

    it("code snippet has no PII", async () => {
      const result = await scanner.scan("const sum = (a: number, b: number): number => a + b;");
      expect(result.containsPii).toBe(false);
    });
  });

  describe("email detection", () => {
    it("detects standard email", async () => {
      const result = await scanner.scan("Contact me at test.user@example.com for details.");
      expect(result.containsPii).toBe(true);
      expect(result.typesFound).toContain("email");
    });

    it("detects email with plus tag", async () => {
      const result = await scanner.scan("Send to alice+work@company.nl");
      expect(result.containsPii).toBe(true);
      expect(result.typesFound).toContain("email");
    });
  });

  describe("Dutch IBAN detection", () => {
    it("detects Dutch IBAN (NL prefix)", async () => {
      const result = await scanner.scan("Transfer to NL91ABNA0417164300 before Friday.");
      expect(result.containsPii).toBe(true);
      expect(result.typesFound.some((t) => t.includes("iban"))).toBe(true);
    });
  });

  describe("BSN detection", () => {
    it("detects valid BSN (Elfproef 11-check)", async () => {
      // 111222333 passes Elfproef: 9*1+8*1+7*1+6*2+5*2+4*2+3*3+2*3+(-1)*3 = 9+8+7+12+10+8+9+6-3=66, 66%11≠0
      // Use a known valid BSN: 123456782
      // 9*1+8*2+7*3+6*4+5*5+4*6+3*7+2*8+(-1)*2 = 9+16+21+24+25+24+21+16-2 = 154, 154%11=0 ✓
      const result = await scanner.scan("Mijn BSN is 123456782, bewaar dit veilig.");
      expect(result.containsPii).toBe(true);
      expect(result.typesFound).toContain("bsn");
    });
  });

  describe("phone number detection", () => {
    it("detects Dutch mobile number", async () => {
      const result = await scanner.scan("Call me on 06-12345678 tonight.");
      expect(result.containsPii).toBe(true);
      expect(result.typesFound).toContain("phone");
    });

    it("detects international format", async () => {
      const result = await scanner.scan("International: +31612345678");
      expect(result.containsPii).toBe(true);
      expect(result.typesFound).toContain("phone");
    });
  });

  describe("IP address detection", () => {
    it("detects IPv4 address", async () => {
      const result = await scanner.scan("Server is at 192.168.1.100");
      expect(result.containsPii).toBe(true);
      expect(result.typesFound).toContain("ip_address");
    });
  });

  describe("scanSync()", () => {
    it("works synchronously without NER", () => {
      const result = scanner.scanSync("Email: synthetic@test.example.com");
      expect(result.containsPii).toBe(true);
      expect(result.typesFound).toContain("email");
    });

    it("clean text returns no PII sync", () => {
      const result = scanner.scanSync("function add(a, b) { return a + b; }");
      expect(result.containsPii).toBe(false);
    });
  });

  describe("multiple PII types in one text", () => {
    it("detects multiple types", async () => {
      const result = await scanner.scan("Contact: synthetic@example.com or call 06-12345678");
      expect(result.containsPii).toBe(true);
      expect(result.typesFound.length).toBeGreaterThanOrEqual(2);
      expect(result.typesFound).toContain("email");
    });

    it("counts field is populated", async () => {
      const result = await scanner.scan("test@example.com and other@example.org");
      expect(result.counts["email"]).toBe(2);
    });
  });
});
