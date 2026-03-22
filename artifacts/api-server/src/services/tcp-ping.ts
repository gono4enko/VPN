import net from "node:net";

export interface PingResult {
  reachable: boolean;
  latencyMs: number;
  tlsEstimateMs: number | null;
}

export function tcpPing(host: string, port: number, timeoutMs = 5000): Promise<PingResult> {
  return new Promise((resolve) => {
    const start = performance.now();
    const socket = new net.Socket();

    socket.setTimeout(timeoutMs);

    socket.on("connect", () => {
      const latencyMs = Math.round(performance.now() - start);
      const tlsEstimateMs = Math.round(latencyMs * 1.8);
      socket.destroy();
      resolve({ reachable: true, latencyMs, tlsEstimateMs });
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve({ reachable: false, latencyMs: timeoutMs, tlsEstimateMs: null });
    });

    socket.on("error", () => {
      socket.destroy();
      resolve({ reachable: false, latencyMs: Math.round(performance.now() - start), tlsEstimateMs: null });
    });

    socket.connect(port, host);
  });
}

export async function pingAllProfiles(profiles: { id: number; address: string; port: number }[]): Promise<Map<number, PingResult>> {
  const results = new Map<number, PingResult>();
  const promises = profiles.map(async (p) => {
    const result = await tcpPing(p.address, p.port);
    results.set(p.id, result);
  });
  await Promise.all(promises);
  return results;
}
