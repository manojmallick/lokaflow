// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.

/** Typed error hierarchy for LokaFlow™. */

export class LokaFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LokaFlowError";
  }
}

export class ProviderError extends LokaFlowError {
  constructor(
    message: string,
    public readonly provider: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export class ProviderUnavailableError extends ProviderError {
  constructor(provider: string, cause?: string) {
    super(`Provider '${provider}' is unavailable${cause ? `: ${cause}` : ""}`, provider);
    this.name = "ProviderUnavailableError";
  }
}

export class BudgetExceededError extends LokaFlowError {
  constructor(
    public readonly period: "daily" | "monthly",
    public readonly limitEur: number,
    public readonly currentEur: number,
  ) {
    super(
      `Budget cap exceeded: ${period} limit €${limitEur.toFixed(2)}, ` +
        `current spend €${currentEur.toFixed(2)}`,
    );
    this.name = "BudgetExceededError";
  }
}

export class PIIDetectedError extends LokaFlowError {
  constructor(public readonly types: string[]) {
    super(`PII detected and action is 'block': ${types.join(", ")}`);
    this.name = "PIIDetectedError";
  }
}

export class ConfigurationError extends LokaFlowError {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export class CommercialLicenseRequiredError extends LokaFlowError {
  constructor(feature: string) {
    super(
      `'${feature}' requires a commercial license. ` +
        `Individual use is always free. See https://lokaflow.com/pricing`,
    );
    this.name = "CommercialLicenseRequiredError";
  }
}
