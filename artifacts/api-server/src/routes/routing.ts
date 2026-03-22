import { Router, type IRouter } from "express";
import { eq, desc, asc } from "drizzle-orm";
import { db, routingRulesTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/routing/rules", async (_req, res): Promise<void> => {
  const rules = await db.select().from(routingRulesTable).orderBy(asc(routingRulesTable.priority), desc(routingRulesTable.createdAt));
  res.json(rules.map(r => ({
    id: r.id,
    ruleType: r.ruleType,
    value: r.value,
    action: r.action,
    description: r.description,
    enabled: r.enabled,
    priority: r.priority,
    category: r.category,
    createdAt: r.createdAt.toISOString(),
  })));
});

router.post("/routing/rules", async (req, res): Promise<void> => {
  const { ruleType, value, action, description, priority, category } = req.body;

  if (!value || !ruleType || !action) {
    res.status(400).json({ error: "ruleType, value и action обязательны" });
    return;
  }

  if (!["domain", "ip", "cidr", "regexp"].includes(ruleType)) {
    res.status(400).json({ error: "ruleType должен быть: domain, ip, cidr, regexp" });
    return;
  }

  if (!["direct", "proxy", "block"].includes(action)) {
    res.status(400).json({ error: "action должен быть: direct, proxy, block" });
    return;
  }

  const [rule] = await db.insert(routingRulesTable).values({
    ruleType,
    value: value.trim(),
    action,
    description: description || "",
    priority: priority ?? 0,
    category: category || "custom",
    enabled: true,
  }).returning();

  res.status(201).json({
    id: rule.id,
    ruleType: rule.ruleType,
    value: rule.value,
    action: rule.action,
    description: rule.description,
    enabled: rule.enabled,
    priority: rule.priority,
    category: rule.category,
    createdAt: rule.createdAt.toISOString(),
  });
});

router.post("/routing/rules/batch", async (req, res): Promise<void> => {
  const { rules } = req.body;

  if (!Array.isArray(rules) || rules.length === 0) {
    res.status(400).json({ error: "rules должен быть непустым массивом" });
    return;
  }

  const validRules = rules.filter((r: { ruleType?: string; value?: string; action?: string }) =>
    r.ruleType && r.value && r.action &&
    ["domain", "ip", "cidr", "regexp"].includes(r.ruleType) &&
    ["direct", "proxy", "block"].includes(r.action)
  );

  if (validRules.length === 0) {
    res.status(400).json({ error: "Нет валидных правил" });
    return;
  }

  const inserted = await db.insert(routingRulesTable).values(
    validRules.map((r: { ruleType: string; value: string; action: string; description?: string; priority?: number; category?: string }) => ({
      ruleType: r.ruleType,
      value: r.value.trim(),
      action: r.action,
      description: r.description || "",
      priority: r.priority ?? 0,
      category: r.category || "custom",
      enabled: true,
    }))
  ).returning();

  res.status(201).json({ imported: inserted.length });
});

router.put("/routing/rules/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Неверный ID" });
    return;
  }

  const { ruleType, value, action, description, priority, category, enabled } = req.body;

  const updateData: Record<string, unknown> = {};
  if (ruleType !== undefined) {
    if (!["domain", "ip", "cidr", "regexp"].includes(ruleType)) {
      res.status(400).json({ error: "ruleType должен быть: domain, ip, cidr, regexp" });
      return;
    }
    updateData.ruleType = ruleType;
  }
  if (value !== undefined) updateData.value = String(value).trim();
  if (action !== undefined) {
    if (!["direct", "proxy", "block"].includes(action)) {
      res.status(400).json({ error: "action должен быть: direct, proxy, block" });
      return;
    }
    updateData.action = action;
  }
  if (description !== undefined) updateData.description = String(description);
  if (priority !== undefined) updateData.priority = Math.max(0, Math.min(9999, parseInt(priority) || 0));
  if (category !== undefined) updateData.category = String(category);
  if (enabled !== undefined) updateData.enabled = Boolean(enabled);

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: "Нет полей для обновления" });
    return;
  }

  const [updated] = await db.update(routingRulesTable).set(updateData).where(eq(routingRulesTable.id, id)).returning();

  if (!updated) {
    res.status(404).json({ error: "Правило не найдено" });
    return;
  }

  res.json({
    id: updated.id,
    ruleType: updated.ruleType,
    value: updated.value,
    action: updated.action,
    description: updated.description,
    enabled: updated.enabled,
    priority: updated.priority,
    category: updated.category,
    createdAt: updated.createdAt.toISOString(),
  });
});

router.delete("/routing/rules/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [deleted] = await db.delete(routingRulesTable).where(eq(routingRulesTable.id, id)).returning();

  if (!deleted) {
    res.status(404).json({ error: "Правило не найдено" });
    return;
  }

  res.json({ message: "Правило удалено" });
});

router.post("/routing/rules/:id/toggle", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const existing = await db.select().from(routingRulesTable).where(eq(routingRulesTable.id, id));

  if (existing.length === 0) {
    res.status(404).json({ error: "Правило не найдено" });
    return;
  }

  const [updated] = await db.update(routingRulesTable).set({ enabled: !existing[0].enabled }).where(eq(routingRulesTable.id, id)).returning();

  res.json({
    id: updated.id,
    ruleType: updated.ruleType,
    value: updated.value,
    action: updated.action,
    description: updated.description,
    enabled: updated.enabled,
    priority: updated.priority,
    category: updated.category,
    createdAt: updated.createdAt.toISOString(),
  });
});

router.delete("/routing/rules/category/:category", async (req, res): Promise<void> => {
  const category = req.params.category;
  const deleted = await db.delete(routingRulesTable).where(eq(routingRulesTable.category, category)).returning();
  res.json({ deleted: deleted.length });
});

router.get("/routing/presets", async (_req, res): Promise<void> => {
  res.json([
    {
      id: "ru-direct",
      name: "Российские сайты (напрямую)",
      description: "Популярные российские сервисы: VK, Яндекс, Mail.ru, Сбер, Госуслуги и др.",
      count: 25,
      action: "direct",
    },
    {
      id: "streaming-proxy",
      name: "Стриминговые сервисы (через VPN)",
      description: "Netflix, YouTube, Spotify, Disney+, Twitch и другие стриминговые платформы",
      count: 15,
      action: "proxy",
    },
    {
      id: "social-proxy",
      name: "Социальные сети (через VPN)",
      description: "Instagram, Twitter/X, Facebook, LinkedIn, Telegram web",
      count: 12,
      action: "proxy",
    },
    {
      id: "ads-block",
      name: "Рекламные трекеры (блокировать)",
      description: "Основные рекламные и трекинговые домены",
      count: 20,
      action: "block",
    },
    {
      id: "gaming-direct",
      name: "Игровые платформы (напрямую)",
      description: "Steam, Epic Games, Battle.net и другие игровые сервисы",
      count: 10,
      action: "direct",
    },
  ]);
});

const PRESETS: Record<string, Array<{ ruleType: string; value: string; action: string; description: string }>> = {
  "ru-direct": [
    { ruleType: "domain", value: "vk.com", action: "direct", description: "ВКонтакте" },
    { ruleType: "domain", value: "vk.ru", action: "direct", description: "ВКонтакте" },
    { ruleType: "domain", value: "mail.ru", action: "direct", description: "Mail.ru" },
    { ruleType: "domain", value: "yandex.ru", action: "direct", description: "Яндекс" },
    { ruleType: "domain", value: "yandex.com", action: "direct", description: "Яндекс" },
    { ruleType: "domain", value: "ya.ru", action: "direct", description: "Яндекс" },
    { ruleType: "domain", value: "sberbank.ru", action: "direct", description: "Сбербанк" },
    { ruleType: "domain", value: "sber.ru", action: "direct", description: "Сбер" },
    { ruleType: "domain", value: "tinkoff.ru", action: "direct", description: "Тинькофф" },
    { ruleType: "domain", value: "gosuslugi.ru", action: "direct", description: "Госуслуги" },
    { ruleType: "domain", value: "mos.ru", action: "direct", description: "Портал Москвы" },
    { ruleType: "domain", value: "nalog.gov.ru", action: "direct", description: "Налоговая" },
    { ruleType: "domain", value: "wildberries.ru", action: "direct", description: "Wildberries" },
    { ruleType: "domain", value: "ozon.ru", action: "direct", description: "Ozon" },
    { ruleType: "domain", value: "avito.ru", action: "direct", description: "Авито" },
    { ruleType: "domain", value: "kinopoisk.ru", action: "direct", description: "Кинопоиск" },
    { ruleType: "domain", value: "rutube.ru", action: "direct", description: "Rutube" },
    { ruleType: "domain", value: "ok.ru", action: "direct", description: "Одноклассники" },
    { ruleType: "domain", value: "dzen.ru", action: "direct", description: "Дзен" },
    { ruleType: "domain", value: "2gis.ru", action: "direct", description: "2ГИС" },
    { ruleType: "domain", value: "hh.ru", action: "direct", description: "HeadHunter" },
    { ruleType: "domain", value: "ria.ru", action: "direct", description: "РИА Новости" },
    { ruleType: "domain", value: "rbc.ru", action: "direct", description: "РБК" },
    { ruleType: "domain", value: "lenta.ru", action: "direct", description: "Лента.ру" },
    { ruleType: "domain", value: "habr.com", action: "direct", description: "Хабр" },
  ],
  "streaming-proxy": [
    { ruleType: "domain", value: "netflix.com", action: "proxy", description: "Netflix" },
    { ruleType: "domain", value: "youtube.com", action: "proxy", description: "YouTube" },
    { ruleType: "domain", value: "googlevideo.com", action: "proxy", description: "YouTube CDN" },
    { ruleType: "domain", value: "ytimg.com", action: "proxy", description: "YouTube Images" },
    { ruleType: "domain", value: "spotify.com", action: "proxy", description: "Spotify" },
    { ruleType: "domain", value: "scdn.co", action: "proxy", description: "Spotify CDN" },
    { ruleType: "domain", value: "disneyplus.com", action: "proxy", description: "Disney+" },
    { ruleType: "domain", value: "hbomax.com", action: "proxy", description: "HBO Max" },
    { ruleType: "domain", value: "twitch.tv", action: "proxy", description: "Twitch" },
    { ruleType: "domain", value: "ttvnw.net", action: "proxy", description: "Twitch CDN" },
    { ruleType: "domain", value: "hulu.com", action: "proxy", description: "Hulu" },
    { ruleType: "domain", value: "crunchyroll.com", action: "proxy", description: "Crunchyroll" },
    { ruleType: "domain", value: "primevideo.com", action: "proxy", description: "Prime Video" },
    { ruleType: "domain", value: "deezer.com", action: "proxy", description: "Deezer" },
    { ruleType: "domain", value: "soundcloud.com", action: "proxy", description: "SoundCloud" },
  ],
  "social-proxy": [
    { ruleType: "domain", value: "instagram.com", action: "proxy", description: "Instagram" },
    { ruleType: "domain", value: "cdninstagram.com", action: "proxy", description: "Instagram CDN" },
    { ruleType: "domain", value: "twitter.com", action: "proxy", description: "Twitter/X" },
    { ruleType: "domain", value: "x.com", action: "proxy", description: "X" },
    { ruleType: "domain", value: "twimg.com", action: "proxy", description: "Twitter CDN" },
    { ruleType: "domain", value: "facebook.com", action: "proxy", description: "Facebook" },
    { ruleType: "domain", value: "fbcdn.net", action: "proxy", description: "Facebook CDN" },
    { ruleType: "domain", value: "linkedin.com", action: "proxy", description: "LinkedIn" },
    { ruleType: "domain", value: "web.telegram.org", action: "proxy", description: "Telegram Web" },
    { ruleType: "domain", value: "t.me", action: "proxy", description: "Telegram Links" },
    { ruleType: "domain", value: "threads.net", action: "proxy", description: "Threads" },
    { ruleType: "domain", value: "reddit.com", action: "proxy", description: "Reddit" },
  ],
  "ads-block": [
    { ruleType: "domain", value: "doubleclick.net", action: "block", description: "Google Ads" },
    { ruleType: "domain", value: "googlesyndication.com", action: "block", description: "Google Ads" },
    { ruleType: "domain", value: "googleadservices.com", action: "block", description: "Google Ads" },
    { ruleType: "domain", value: "adnxs.com", action: "block", description: "AppNexus" },
    { ruleType: "domain", value: "facebook.net", action: "block", description: "Facebook Tracker" },
    { ruleType: "domain", value: "analytics.google.com", action: "block", description: "Google Analytics" },
    { ruleType: "domain", value: "mc.yandex.ru", action: "block", description: "Яндекс.Метрика" },
    { ruleType: "domain", value: "top-fwz1.mail.ru", action: "block", description: "Mail.ru Tracker" },
    { ruleType: "domain", value: "ad.mail.ru", action: "block", description: "Mail.ru Ads" },
    { ruleType: "domain", value: "an.yandex.ru", action: "block", description: "Яндекс.Директ" },
    { ruleType: "domain", value: "ads.adfox.ru", action: "block", description: "AdFox" },
    { ruleType: "domain", value: "criteo.com", action: "block", description: "Criteo" },
    { ruleType: "domain", value: "moatads.com", action: "block", description: "Moat" },
    { ruleType: "domain", value: "scorecardresearch.com", action: "block", description: "ComScore" },
    { ruleType: "domain", value: "mixpanel.com", action: "block", description: "Mixpanel" },
    { ruleType: "domain", value: "amplitude.com", action: "block", description: "Amplitude" },
    { ruleType: "domain", value: "hotjar.com", action: "block", description: "Hotjar" },
    { ruleType: "domain", value: "segment.io", action: "block", description: "Segment" },
    { ruleType: "domain", value: "adjust.com", action: "block", description: "Adjust" },
    { ruleType: "domain", value: "appsflyer.com", action: "block", description: "AppsFlyer" },
  ],
  "gaming-direct": [
    { ruleType: "domain", value: "steampowered.com", action: "direct", description: "Steam" },
    { ruleType: "domain", value: "steamcommunity.com", action: "direct", description: "Steam Community" },
    { ruleType: "domain", value: "steamcdn-a.akamaihd.net", action: "direct", description: "Steam CDN" },
    { ruleType: "domain", value: "epicgames.com", action: "direct", description: "Epic Games" },
    { ruleType: "domain", value: "unrealengine.com", action: "direct", description: "Unreal Engine" },
    { ruleType: "domain", value: "battle.net", action: "direct", description: "Battle.net" },
    { ruleType: "domain", value: "blizzard.com", action: "direct", description: "Blizzard" },
    { ruleType: "domain", value: "riotgames.com", action: "direct", description: "Riot Games" },
    { ruleType: "domain", value: "ea.com", action: "direct", description: "EA Games" },
    { ruleType: "domain", value: "ubisoft.com", action: "direct", description: "Ubisoft" },
  ],
};

router.post("/routing/presets/:presetId/import", async (req, res): Promise<void> => {
  const presetId = req.params.presetId;
  const preset = PRESETS[presetId];

  if (!preset) {
    res.status(404).json({ error: "Пресет не найден" });
    return;
  }

  await db.delete(routingRulesTable).where(eq(routingRulesTable.category, presetId));

  const inserted = await db.insert(routingRulesTable).values(
    preset.map(r => ({
      ruleType: r.ruleType,
      value: r.value,
      action: r.action,
      description: r.description,
      category: presetId,
      enabled: true,
      priority: 0,
    }))
  ).returning();

  res.status(201).json({ imported: inserted.length, presetId });
});

router.get("/routing/export", async (_req, res): Promise<void> => {
  const rules = await db.select().from(routingRulesTable).orderBy(asc(routingRulesTable.priority));
  res.json({
    version: 1,
    exportedAt: new Date().toISOString(),
    rules: rules.map(r => ({
      ruleType: r.ruleType,
      value: r.value,
      action: r.action,
      description: r.description,
      category: r.category,
      priority: r.priority,
    })),
  });
});

router.get("/routing/stats", async (_req, res): Promise<void> => {
  const rules = await db.select().from(routingRulesTable);
  const total = rules.length;
  const enabled = rules.filter(r => r.enabled).length;
  const byAction = {
    direct: rules.filter(r => r.action === "direct").length,
    proxy: rules.filter(r => r.action === "proxy").length,
    block: rules.filter(r => r.action === "block").length,
  };
  const byType = {
    domain: rules.filter(r => r.ruleType === "domain").length,
    ip: rules.filter(r => r.ruleType === "ip").length,
    cidr: rules.filter(r => r.ruleType === "cidr").length,
    regexp: rules.filter(r => r.ruleType === "regexp").length,
  };
  res.json({ total, enabled, disabled: total - enabled, byAction, byType });
});

export default router;
