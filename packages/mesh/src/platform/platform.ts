// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/mesh/src/platform/platform.ts
// PlatformInfo — detect OS, network stack capabilities, battery access,
// and pick the appropriate discovery / power backend.

import { platform, arch, release } from "os";
import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";

// ── Types ──────────────────────────────────────────────────────────────────

export type OsFamily = "linux" | "macos" | "windows" | "unknown";
export type DiscoveryBackend = "mdns" | "http" | "both";
export type PowerBackend = "darwin" | "linux-systemd" | "linux-sysfs" | "windows" | "none";
export type BatteryBackend = "darwin-pmset" | "linux-sysfs" | "windows-wmi" | "none";

export interface PlatformCapabilities {
  os: OsFamily;
  arch: string;
  kernelRelease: string;
  supportsRawSockets: boolean;     // needed for mDNS multicast
  supportsMulticastDns: boolean;   // mDNS / Bonjour available
  recommendedDiscovery: DiscoveryBackend;
  recommendedPowerBackend: PowerBackend;
  recommendedBatteryBackend: BatteryBackend;
  isWsl: boolean;
  isContainer: boolean;
  nodeVersion: string;
  pid: number;
}

// ── Detection ──────────────────────────────────────────────────────────────

function detectOs(): OsFamily {
  const p = platform();
  if (p === "darwin") return "macos";
  if (p === "win32") return "windows";
  if (p === "linux") return "linux";
  return "unknown";
}

function detectWsl(): boolean {
  try {
    const r = release().toLowerCase();
    return r.includes("microsoft") || r.includes("wsl");
  } catch {
    return false;
  }
}

function detectContainer(): boolean {
  try {
    if (existsSync("/.dockerenv")) return true;
    const cgroup = readFileSync("/proc/1/cgroup", "utf8");
    return cgroup.includes("docker") || cgroup.includes("containerd");
  } catch {
    return false;
  }
}

function hasBinary(name: string): boolean {
  try {
    execSync(`which ${name}`, { stdio: "ignore" });
    return true;
  } catch {
    try {
      execSync(`where ${name}`, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }
}

function detectDiscoveryBackend(os: OsFamily, isWsl: boolean, isContainer: boolean): DiscoveryBackend {
  // Windows-native, WSL, and Docker containers can't reliably send multicast
  if (os === "windows" || isWsl || isContainer) return "http";
  // macOS and native Linux generally support mDNS
  return "both";
}

function detectPowerBackend(os: OsFamily): PowerBackend {
  if (os === "macos") return "darwin";
  if (os === "windows") return "windows";
  if (os === "linux") {
    return hasBinary("systemctl") ? "linux-systemd" : "linux-sysfs";
  }
  return "none";
}

function detectBatteryBackend(os: OsFamily): BatteryBackend {
  if (os === "macos") return "darwin-pmset";
  if (os === "windows") return "windows-wmi";
  if (os === "linux") {
    return existsSync("/sys/class/power_supply") ? "linux-sysfs" : "none";
  }
  return "none";
}

// ── PlatformInfo ─────────────────────────────────────────────────────────────

/** Singleton capabilities snapshot */
let _cached: PlatformCapabilities | null = null;

export function getPlatformCapabilities(): PlatformCapabilities {
  if (_cached) return _cached;

  const os = detectOs();
  const isWsl = detectWsl();
  const isContainer = detectContainer();

  _cached = {
    os,
    arch: arch(),
    kernelRelease: release(),
    supportsRawSockets: os !== "windows",
    supportsMulticastDns: os !== "windows" && !isWsl && !isContainer,
    recommendedDiscovery: detectDiscoveryBackend(os, isWsl, isContainer),
    recommendedPowerBackend: detectPowerBackend(os),
    recommendedBatteryBackend: detectBatteryBackend(os),
    isWsl,
    isContainer,
    nodeVersion: process.version,
    pid: process.pid,
  };

  return _cached;
}

/** Invalidate cache (useful in tests or after environment changes) */
export function resetPlatformCache(): void {
  _cached = null;
}

/** Human-readable summary */
export function describePlatform(): string {
  const c = getPlatformCapabilities();
  const parts = [
    `OS: ${c.os} (${c.arch})`,
    `Kernel: ${c.kernelRelease}`,
    `Discovery: ${c.recommendedDiscovery}`,
    `Power: ${c.recommendedPowerBackend}`,
    `Battery: ${c.recommendedBatteryBackend}`,
  ];
  if (c.isWsl) parts.push("WSL: yes");
  if (c.isContainer) parts.push("Container: yes");
  return parts.join(" | ");
}
