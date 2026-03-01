// © 2026 LearnHubPlay BV. All rights reserved.
// Licensed under BUSL 1.1 — see LICENSE for details.
//
// packages/mesh/src/power/wol.ts
// WolSender — Wake-on-LAN magic packet implementation.
// RFC 2287: 6 bytes 0xFF + MAC address repeated 16 times = 102 bytes, sent via UDP broadcast.

import { createSocket } from "dgram";

/**
 * Build a Wake-on-LAN magic packet for the given MAC address.
 * Format: [0xFF × 6] + [MAC × 16] = 102 bytes.
 */
export function buildMagicPacket(macAddress: string): Buffer {
    // Normalise separators and validate
    const mac = macAddress.replaceAll(/[:\-]/g, "");
    if (mac.length !== 12 || !/^[\da-f]+$/i.test(mac)) {
        throw new Error(`Invalid MAC address: "${macAddress}"`);
    }

    const macBuffer = Buffer.from(mac, "hex");
    const packet = Buffer.alloc(102);

    // 6 bytes of 0xFF (sync stream)
    packet.fill(0xff, 0, 6);

    // MAC address repeated 16 times
    for (let i = 0; i < 16; i++) {
        macBuffer.copy(packet, 6 + i * 6);
    }

    return packet;
}

/**
 * Send a Wake-on-LAN magic packet to the given MAC address.
 * Uses UDP broadcast on port 9 (standard WoL port).
 */
export async function sendWol(
    macAddress: string,
    broadcastIp = "255.255.255.255",
    port = 9,
): Promise<void> {
    const packet = buildMagicPacket(macAddress);

    return new Promise((resolve, reject) => {
        const socket = createSocket("udp4");

        socket.bind(() => {
            socket.setBroadcast(true);
            socket.send(packet, 0, packet.length, port, broadcastIp, (err) => {
                socket.close();
                if (err) reject(err);
                else resolve();
            });
        });

        socket.on("error", (err) => {
            socket.close();
            reject(err);
        });
    });
}
