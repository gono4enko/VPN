import type { VpnProfile } from "@workspace/db/schema";

export function buildStreamSettings(profile: VpnProfile) {
  const base: Record<string, unknown> = {
    network: profile.transportType === "h2" ? "http" : profile.transportType,
    security: profile.security || "reality",
  };

  if (base.security === "reality") {
    base.realitySettings = {
      serverName: profile.sni || "",
      fingerprint: profile.fingerprint || "random",
      publicKey: profile.publicKey || "",
      shortId: profile.shortId || "",
    };
  } else if (base.security === "tls") {
    base.tlsSettings = {
      serverName: profile.sni || "",
      fingerprint: profile.fingerprint || "random",
    };
  }

  switch (profile.transportType) {
    case "ws":
      base.wsSettings = {
        path: profile.transportPath || "/",
        headers: {
          Host: profile.transportHost || profile.sni || "",
        },
      };
      break;
    case "grpc":
      base.grpcSettings = {
        serviceName: profile.transportPath || "grpc",
        multiMode: true,
      };
      break;
    case "h2":
      base.httpSettings = {
        host: [profile.transportHost || profile.sni || ""],
        path: profile.transportPath || "/",
      };
      break;
    case "tcp":
    default:
      base.tcpSettings = {
        header: { type: "none" },
      };
      break;
  }

  return base;
}

export function buildFragmentOutbound(profile: VpnProfile) {
  if (!profile.fragmentEnabled) return null;

  return {
    tag: "fragment",
    protocol: "freedom",
    settings: {
      fragment: {
        packets: "tlshello",
        length: profile.fragmentLength || "100-200",
        interval: profile.fragmentInterval || "10-20",
      },
    },
  };
}

export function buildXrayConfig(profile: VpnProfile) {
  const streamSettings = buildStreamSettings(profile);

  const proxyOutbound: Record<string, unknown> = {
    tag: "proxy",
    protocol: profile.protocol || "vless",
    settings: {
      vnext: [
        {
          address: profile.address,
          port: profile.port,
          users: [
            {
              id: profile.uuid || "",
              flow: profile.flow || "",
              encryption: "none",
            },
          ],
        },
      ],
    },
    streamSettings,
  };

  const fragmentOutbound = buildFragmentOutbound(profile);

  if (fragmentOutbound) {
    proxyOutbound.proxySettings = { tag: "fragment" };
  }

  const outbounds: Record<string, unknown>[] = [proxyOutbound];
  if (fragmentOutbound) {
    outbounds.push(fragmentOutbound);
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

  return {
    log: {
      loglevel: "warning",
    },
    inbounds: [
      {
        tag: "socks-in",
        port: 10808,
        listen: "127.0.0.1",
        protocol: "socks",
        settings: {
          udp: true,
        },
      },
      {
        tag: "http-in",
        port: 10809,
        listen: "127.0.0.1",
        protocol: "http",
      },
    ],
    outbounds,
    routing: {
      domainStrategy: "IPIfNonMatch",
      rules: [
        {
          type: "field",
          outboundTag: "direct",
          domain: ["geosite:private"],
        },
        {
          type: "field",
          outboundTag: "block",
          domain: ["geosite:category-ads-all"],
        },
      ],
    },
  };
}
