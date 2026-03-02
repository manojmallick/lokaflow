// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/mesh/src/power/windows.ts
// Windows-specific power management — Wake-on-LAN, sleep, and battery via
// native Windows APIs (powercfg, WMI, netsh).

import { execSync, spawn } from "child_process";
import { promisify } from "util";
import { exec } from "child_process";

const execAsync = promisify(exec);

// ── Types ──────────────────────────────────────────────────────────────────

export interface WindowsBatteryStatus {
  level: number; // 0–100
  isCharging: boolean;
  isPresent: boolean;
  estimatedMinutes?: number;
  health?: "good" | "degraded" | "unknown";
}

export interface WindowsPowerScheme {
  guid: string;
  name: string;
  active: boolean;
}

// ── Wake-on-LAN ────────────────────────────────────────────────────────────

/**
 * Send a Wake-on-LAN magic packet on Windows using native socket.
 * Falls back to `netsh` / ncat if raw socket fails.
 */
export async function windowsWakeOnLan(
  mac: string,
  broadcastIp = "255.255.255.255",
): Promise<void> {
  // Build magic packet (6x FF + 16x MAC)
  const macBytes = mac
    .replace(/[:-]/g, "")
    .match(/.{2}/g)!
    .map((h) => parseInt(h, 16));
  if (macBytes.length !== 6) throw new Error(`Invalid MAC address: ${mac}`);

  const packet = Buffer.alloc(102);
  // 6 bytes of FF
  packet.fill(0xff, 0, 6);
  // 16 repetitions of the MAC address
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 6; j++) {
      packet[6 + i * 6 + j] = macBytes[j]!;
    }
  }

  // Attempt to send via Node.js dgram
  const dgram = await import("dgram");
  return new Promise<void>((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    socket.once("error", (err) => {
      socket.close();
      reject(err);
    });
    socket.bind(() => {
      socket.setBroadcast(true);
      socket.send(packet, 9, packet.length, 9, broadcastIp, (err) => {
        socket.close();
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

// ── Sleep ─────────────────────────────────────────────────────────────────

/** Put the Windows machine to sleep immediately */
export async function windowsSleep(): Promise<void> {
  // `powercfg /hibernate off` then `rundll32.exe powrprof.dll,SetSuspendState 0,1,0`
  // The safest cross-version approach is PsShutdown or native rundll32
  await execAsync(
    `powershell -Command "Add-Type -Assembly System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState([System.Windows.Forms.PowerState]::Suspend, $true, $false)"`,
  );
}

/** Hibernate the Windows machine */
export async function windowsHibernate(): Promise<void> {
  await execAsync(`shutdown /h`);
}

/** Lock the Windows workstation screen (does not suspend) */
export async function windowsLockScreen(): Promise<void> {
  await execAsync(`rundll32.exe user32.dll,LockWorkStation`);
}

/** Shut down Windows */
export async function windowsShutdown(delaySeconds = 0): Promise<void> {
  await execAsync(`shutdown /s /t ${delaySeconds}`);
}

// ── Power scheme ──────────────────────────────────────────────────────────

/** List all power schemes */
export async function listPowerSchemes(): Promise<WindowsPowerScheme[]> {
  const { stdout } = await execAsync("powercfg /list");
  const schemes: WindowsPowerScheme[] = [];

  for (const line of stdout.split("\n")) {
    const m = line.match(/GUID:\s*([0-9a-f-]+)\s*\((.+?)\)\s*(\*)?$/i);
    if (m) {
      schemes.push({
        guid: m[1]!.trim(),
        name: m[2]!.trim(),
        active: Boolean(m[3]),
      });
    }
  }

  return schemes;
}

/** Activate a power scheme by GUID */
export async function activatePowerScheme(guid: string): Promise<void> {
  await execAsync(`powercfg /setactive ${guid}`);
}

// Well-known scheme GUIDs
export const POWER_SCHEME = {
  balanced: "381b4222-f694-41f0-9685-ff5bb260df2e",
  highPerformance: "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c",
  powersaver: "a1841308-3541-4fab-bc81-f71556f20b4a",
} as const;

/** Switch to High Performance mode (for intensive mesh tasks) */
export async function setHighPerformance(): Promise<void> {
  await activatePowerScheme(POWER_SCHEME.highPerformance);
}

/** Switch to Balanced mode */
export async function setBalanced(): Promise<void> {
  await activatePowerScheme(POWER_SCHEME.balanced);
}

// ── Battery ───────────────────────────────────────────────────────────────

/** Read battery status via PowerShell WMI */
export async function getWindowsBatteryStatus(): Promise<WindowsBatteryStatus> {
  try {
    const script = [
      `$b = Get-WmiObject -Class Win32_Battery`,
      `if ($b) {`,
      `  Write-Output "present=1"`,
      `  Write-Output "level=$($b.EstimatedChargeRemaining)"`,
      `  $charging = $b.BatteryStatus -eq 2`,
      `  Write-Output "charging=$($charging.ToString().ToLower())"`,
      `  Write-Output "minutes=$($b.EstimatedRunTime)"`,
      `} else { Write-Output "present=0" }`,
    ].join("; ");

    const { stdout } = await execAsync(`powershell -Command "${script}"`);
    const lines: Record<string, string> = {};
    for (const line of stdout.split("\n")) {
      const [k, v] = line.trim().split("=");
      if (k && v !== undefined) lines[k] = v;
    }

    if (lines["present"] === "0") {
      return { level: -1, isCharging: true, isPresent: false };
    }

    const level = parseInt(lines["level"] ?? "100", 10);
    const isCharging = lines["charging"] === "true";
    const mins = parseInt(lines["minutes"] ?? "0", 10);

    return {
      level: isNaN(level) ? 100 : level,
      isCharging,
      isPresent: true,
      ...(!isNaN(mins) && { estimatedMinutes: mins }),
      health: (level > 20 ? "good" : "degraded") as "good" | "degraded",
    };
  } catch {
    // No battery or WMI not available
    return { level: -1, isCharging: true, isPresent: false };
  }
}

// ── Prevent sleep helper ───────────────────────────────────────────────────

/** Keep system awake by preventing sleep via powercfg overrides */
export async function preventSleep(durationSeconds: number): Promise<void> {
  // Use powercfg /requestsoverride to mark process as requiring system power
  const pidStr = process.pid.toString();
  try {
    await execAsync(`powercfg /requestsoverride process node.exe system`);
  } catch {
    // Fallback: start a background PowerShell keep-alive
    spawn(
      "powershell",
      [
        "-Command",
        `$h = Add-Type -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);' -Name 'Kernel32' -Namespace 'Win32' -PassThru; $h::SetThreadExecutionState(0x80000003); Start-Sleep ${durationSeconds}; $h::SetThreadExecutionState(0x80000000)`,
      ],
      { detached: true, stdio: "ignore" },
    ).unref();
  }
}
