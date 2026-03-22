import type { VpnUser, VpnProfile } from "@workspace/db/schema";
import { getRealityPrivateKey, getRealityShortId } from "./reality-keys";
import { buildStreamSettings, buildFragmentOutbound } from "./xray-config";

const LISTEN_PORT = parseInt(process.env.XRAY_LISTEN_PORT || "8443", 10);
const XRAY_STATS_PORT = 10085;
const REALITY_DEST = process.env.REALITY_DEST || "www.microsoft.com:443";
const REALITY_SERVER_NAMES = (process.env.REALITY_SERVER_NAMES || "www.microsoft.com,microsoft.com").split(",").map(s => s.trim());

export function buildServerXrayConfig(users: VpnUser[], activeProfile?: VpnProfile | null) {
  const activeUsers = users.filter(u => u.status === "active");

  const clients = activeUsers.map(user => ({
    id: user.uuid,
    flow: user.flow || "xtls-rprx-vision",
  }));

  if (clients.length === 0) {
    clients.push({
      id: "00000000-0000-0000-0000-000000000000",
      flow: "xtls-rprx-vision",
    });
  }

  const privateKey = getRealityPrivateKey();
  const shortId = getRealityShortId();

  const [destHost, destPortStr] = REALITY_DEST.split(":");
  const destPort = parseInt(destPortStr || "443", 10);

  const outbounds: Record<string, unknown>[] = [];
  let defaultOutboundTag = "direct";

  if (activeProfile) {
    const streamSettings = buildStreamSettings(activeProfile);

    const proxyOutbound: Record<string, unknown> = {
      tag: "proxy",
      protocol: activeProfile.protocol || "vless",
      settings: {
        vnext: [
          {
            address: activeProfile.address,
            port: activeProfile.port,
            users: [
              {
                id: activeProfile.uuid || "",
                flow: activeProfile.flow || "",
                encryption: "none",
              },
            ],
          },
        ],
      },
      streamSettings,
    };

    const fragmentOutbound = buildFragmentOutbound(activeProfile);
    if (fragmentOutbound) {
      proxyOutbound.proxySettings = { tag: "fragment" };
    }

    outbounds.push(proxyOutbound);
    if (fragmentOutbound) {
      outbounds.push(fragmentOutbound);
    }

    defaultOutboundTag = "proxy";
  }

  outbounds.push({
    tag: "direct",
    protocol: "freedom",
    settings: {},
  });

  outbounds.push({
    tag: "block",
    protocol: "blackhole",
    settings: {
      response: { type: "http" },
    },
  });

  const rules: Record<string, unknown>[] = [
    {
      type: "field",
      inboundTag: ["api-in"],
      outboundTag: "api",
    },
    {
      type: "field",
      outboundTag: "block",
      domain: ["geosite:category-ads-all"],
    },
  ];

  if (activeProfile) {
    rules.push({
      type: "field",
      inboundTag: ["vless-reality-in"],
      outboundTag: "proxy",
    });
  }

  return {
    log: {
      loglevel: "warning",
    },
    stats: {},
    api: {
      tag: "api",
      services: ["StatsService"],
    },
    policy: {
      levels: {
        "0": {
          statsUserUplink: true,
          statsUserDownlink: true,
        },
      },
      system: {
        statsInboundUplink: true,
        statsInboundDownlink: true,
        statsOutboundUplink: true,
        statsOutboundDownlink: true,
      },
    },
    inbounds: [
      {
        tag: "vless-reality-in",
        port: LISTEN_PORT,
        listen: "0.0.0.0",
        protocol: "vless",
        settings: {
          clients,
          decryption: "none",
        },
        streamSettings: {
          network: "tcp",
          security: "reality",
          realitySettings: {
            show: false,
            dest: `${destHost}:${destPort}`,
            xver: 0,
            serverNames: REALITY_SERVER_NAMES,
            privateKey,
            shortIds: [shortId, ""],
          },
        },
        sniffing: {
          enabled: true,
          destOverride: ["http", "tls", "quic"],
        },
      },
      {
        tag: "api-in",
        port: XRAY_STATS_PORT,
        listen: "127.0.0.1",
        protocol: "dokodemo-door",
        settings: {
          address: "127.0.0.1",
        },
      },
    ],
    outbounds,
    routing: {
      domainStrategy: "IPIfNonMatch",
      rules,
    },
  };
}
