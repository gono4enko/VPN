import net from "node:net";
import tls from "node:tls";

export interface PingResult {
  ping: number | null;
  downloadSpeed: number | null;
  isOnline: boolean;
}

export async function tcpPing(host: string, port: number, timeoutMs = 5000): Promise<PingResult> {
  return new Promise((resolve) => {
    const start = performance.now();
    const socket = new net.Socket();

    socket.setTimeout(timeoutMs);

    socket.on("connect", () => {
      const connectTime = Math.round(performance.now() - start);
      socket.destroy();
      resolve({ ping: connectTime, downloadSpeed: null, isOnline: true });
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve({ ping: null, downloadSpeed: null, isOnline: false });
    });

    socket.on("error", () => {
      socket.destroy();
      resolve({ ping: null, downloadSpeed: null, isOnline: false });
    });

    socket.connect(port, host);
  });
}

export async function tlsProbe(host: string, port: number, sni?: string, timeoutMs = 5000): Promise<PingResult> {
  return new Promise((resolve) => {
    const start = performance.now();

    const socket = tls.connect(
      {
        host,
        port,
        servername: sni || host,
        rejectUnauthorized: false,
        timeout: timeoutMs,
      },
      () => {
        const handshakeTime = Math.round(performance.now() - start);
        const estimatedSpeed = handshakeTime > 0 ? Math.round((1500 * 8 * 1000) / handshakeTime / 1024) : null;
        socket.destroy();
        resolve({
          ping: handshakeTime,
          downloadSpeed: estimatedSpeed,
          isOnline: true,
        });
      }
    );

    socket.setTimeout(timeoutMs);

    socket.on("timeout", () => {
      socket.destroy();
      resolve({ ping: null, downloadSpeed: null, isOnline: false });
    });

    socket.on("error", () => {
      socket.destroy();
      resolve({ ping: null, downloadSpeed: null, isOnline: false });
    });
  });
}

export async function measureNode(
  address: string,
  port: number,
  security?: string,
  sni?: string
): Promise<PingResult> {
  if (security === "reality" || security === "tls" || port === 443) {
    return tlsProbe(address, port, sni);
  }
  return tcpPing(address, port);
}
