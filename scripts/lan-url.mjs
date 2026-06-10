/**
 * Prints the URLs at which Reklama will be reachable on the local network.
 *
 * Used by the `dev:lan` / `start:lan` scripts (which bind Next.js to 0.0.0.0).
 * Pure Node, no dependencies — works on macOS, Linux, and Windows.
 *
 * Usage: node scripts/lan-url.mjs [dev|start]
 */
import os from "node:os";

const port = process.env.PORT || "3000";
const mode = process.argv[2] || "";

/** Collect non-internal IPv4 addresses across all interfaces. */
function lanAddresses() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const a of addrs || []) {
      if (a.family === "IPv4" && !a.internal) out.push({ name, address: a.address });
    }
  }
  return out;
}

const addrs = lanAddresses();
const bar = "─".repeat(54);

console.log(`\n┌${bar}┐`);
console.log(`│  Reklama — local network access${mode ? ` (${mode})` : ""}`.padEnd(55) + "│");
console.log(`├${bar}┤`);
console.log(`│  This machine:  http://localhost:${port}`.padEnd(55) + "│");

if (addrs.length === 0) {
  console.log(`│  No LAN interface detected (offline?).`.padEnd(55) + "│");
} else {
  for (const { name, address } of addrs) {
    console.log(`│  On your LAN:   http://${address}:${port}  (${name})`.padEnd(55) + "│");
  }
  console.log(`├${bar}┤`);
  console.log(`│  Open the LAN URL on any device on the same Wi-Fi.`.padEnd(55) + "│");
  console.log(`│  If it won't load, allow the port through your`.padEnd(55) + "│");
  console.log(`│  firewall (in/TCP ${port}).`.padEnd(55) + "│");
}
console.log(`└${bar}┘\n`);
