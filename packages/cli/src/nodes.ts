import { Command } from "commander";
import chalk from "chalk";
import { resolveMeshConfigPath } from "./utils/meshConfig.js";

function stateColor(state: string): string {
    switch (state) {
        case "online":     return chalk.green(state.padEnd(12));
        case "busy":       return chalk.cyan(state.padEnd(12));
        case "light_sleep":
        case "deep_sleep": return chalk.yellow(state.padEnd(12));
        case "waking":     return chalk.blue(state.padEnd(12));
        default:           return chalk.red((state || "unknown").padEnd(12));
    }
}

export const nodesCommand = new Command("nodes")
    .description("Discover and manage LokaMesh local cluster")
    .option("--wake <node>", "Send WoL packet to a sleeping node by ID")
    .action(async (options) => {
        try {
            const configPath = resolveMeshConfigPath();
            if (!configPath) return;

            const { LokaMesh } = await import("@lokaflow/mesh");
            const mesh = new LokaMesh({ configPath });

            if (options.wake) {
                console.log(chalk.yellow(`[LokaMesh] Waking node '${options.wake}'...`));
                await mesh.start();
                const woken = await mesh.wake(options.wake);
                if (woken) {
                    console.log(chalk.green(`  WoL packet sent to ${options.wake}`));
                } else {
                    console.error(chalk.red(`  Node '${options.wake}' not found or has no MAC address configured.`));
                }
                await mesh.stop();
                return;
            }

            console.log(chalk.blue("[LokaMesh] Scanning for online nodes..."));
            await mesh.start();

            // Allow health checks to complete
            await new Promise((r) => setTimeout(r, 2000));

            const status = mesh.nodes();

            console.log(
                chalk.bold("\n  ID                  Name                Role           State           IP                 RAM"),
            );
            console.log(chalk.gray("  ─────────────────── ─────────────────── ────────────── ────────────── ─────────────────── ───"));

            for (const node of status.nodes) {
                const id    = node.id.padEnd(20);
                const name  = node.name.padEnd(20);
                const role  = node.role.padEnd(15);
                const ip    = (node.ip ?? "unknown").padEnd(20);
                const ram   = `${node.capabilities.ramGb}GB`;
                console.log(`  ${id}${name}${role}${stateColor(node.state)}${ip}${ram}`);
            }

            console.log(
                chalk.bold(
                    `\n  Online: ${chalk.green(status.onlineCount)}  ` +
                    `Sleeping: ${chalk.yellow(status.sleepingCount)}  ` +
                    `Unreachable: ${chalk.red(status.unreachableCount)}`,
                ),
            );

            await mesh.stop();
        } catch (e) {
            console.error(chalk.red("Failed to load LokaMesh"), e);
        }
    });
