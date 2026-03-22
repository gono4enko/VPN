import React, { useState } from 'react';
import { Layout } from '@/components/layout';
import {
  useGetRoutingRules,
  useCreateRoutingRule,
  useUpdateRoutingRule,
  useDeleteRoutingRule,
  useToggleRoutingRule,
  useGetRoutingPresets,
  useImportRoutingPreset,
  useDeleteRulesByCategory,
  useGetRoutingStats,
  useExportRoutingRules,
  getGetRoutingRulesQueryKey,
  getGetRoutingStatsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { CyberCard, CyberButton, CyberBadge, CyberInput, Modal } from '@/components/ui/cyber';
import { CyberTooltip } from '@/components/ui/tooltip';
import {
  Shield, Plus, Trash2, ToggleLeft, ToggleRight, Download, Upload,
  Globe, Wifi, Ban, Filter, Search, Package, ChevronDown, ChevronUp, Edit2
} from 'lucide-react';

const ACTION_LABELS: Record<string, string> = { direct: 'НАПРЯМУЮ', proxy: 'ЧЕРЕЗ VPN', block: 'БЛОКИРОВАТЬ' };
const ACTION_COLORS: Record<string, 'green' | 'default' | 'red'> = { direct: 'green', proxy: 'default', block: 'red' };
const ACTION_ICONS: Record<string, React.ReactNode> = {
  direct: <Wifi className="w-3 h-3" />,
  proxy: <Shield className="w-3 h-3" />,
  block: <Ban className="w-3 h-3" />,
};
const TYPE_LABELS: Record<string, string> = { domain: 'Домен', ip: 'IP', cidr: 'CIDR', regexp: 'RegExp' };

export default function RoutingPage() {
  const queryClient = useQueryClient();
  const { data: rules, isLoading } = useGetRoutingRules({ query: { refetchInterval: 5000 } as never });
  const { data: presets } = useGetRoutingPresets();
  const { data: stats } = useGetRoutingStats({ query: { refetchInterval: 5000 } as never });

  const createMutation = useCreateRoutingRule();
  const updateMutation = useUpdateRoutingRule();
  const deleteMutation = useDeleteRoutingRule();
  const toggleMutation = useToggleRoutingRule();
  const importPresetMutation = useImportRoutingPreset();
  const deleteCategoryMutation = useDeleteRulesByCategory();
  const { refetch: exportRules } = useExportRoutingRules({ query: { enabled: false } as never });

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isPresetsOpen, setIsPresetsOpen] = useState(false);
  const [editRule, setEditRule] = useState<{ id: number; ruleType: string; value: string; action: string; description: string; priority: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ ruleType: 'domain', value: '', action: 'direct', description: '', priority: 0 });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetRoutingRulesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRoutingStatsQueryKey() });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMutation.mutateAsync({ data: form as never });
    setForm({ ruleType: 'domain', value: '', action: 'direct', description: '', priority: 0 });
    setIsAddOpen(false);
    invalidate();
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRule) return;
    await updateMutation.mutateAsync({ id: editRule.id, data: editRule as never });
    setEditRule(null);
    invalidate();
  };

  const handleDelete = async (id: number) => {
    await deleteMutation.mutateAsync({ id });
    invalidate();
  };

  const handleToggle = async (id: number) => {
    await toggleMutation.mutateAsync({ id });
    invalidate();
  };

  const handleImportPreset = async (presetId: string) => {
    await importPresetMutation.mutateAsync({ presetId });
    invalidate();
  };

  const handleDeleteCategory = async (category: string) => {
    await deleteCategoryMutation.mutateAsync({ category });
    invalidate();
  };

  const handleExport = async () => {
    const result = await exportRules();
    if (result.data) {
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'routing-rules.json';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const filteredRules = (rules || []).filter(r => {
    if (filterAction !== 'all' && r.action !== filterAction) return false;
    if (searchQuery && !r.value.toLowerCase().includes(searchQuery.toLowerCase()) && !r.description?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const groupedRules = filteredRules.reduce((acc, rule) => {
    const cat = rule.category || 'custom';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(rule);
    return acc;
  }, {} as Record<string, typeof filteredRules>);

  const CATEGORY_NAMES: Record<string, string> = {
    custom: 'Пользовательские',
    'ru-direct': 'Российские сайты',
    'streaming-proxy': 'Стриминг',
    'social-proxy': 'Социальные сети',
    'ads-block': 'Рекламные трекеры',
    'gaming-direct': 'Игровые платформы',
  };

  return (
    <Layout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground uppercase tracking-widest">Маршруты_Обхода</h2>
          <p className="text-muted-foreground font-mono text-sm mt-1">Правила маршрутизации трафика</p>
        </div>
        <div className="flex gap-3">
          <CyberTooltip text="Импортировать готовый набор правил">
            <CyberButton variant="outline" onClick={() => setIsPresetsOpen(true)}>
              <Package className="w-4 h-4" /> Пресеты
            </CyberButton>
          </CyberTooltip>
          <CyberTooltip text="Экспортировать все правила в JSON">
            <CyberButton variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4" /> Экспорт
            </CyberButton>
          </CyberTooltip>
          <CyberButton onClick={() => setIsAddOpen(true)}>
            <Plus className="w-4 h-4" /> Добавить правило
          </CyberButton>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          <CyberCard className="p-4 text-center">
            <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Всего</p>
            <p className="text-2xl font-bold font-display text-foreground">{stats.total}</p>
          </CyberCard>
          <CyberCard className="p-4 text-center">
            <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Активны</p>
            <p className="text-2xl font-bold font-display text-green-400">{stats.enabled}</p>
          </CyberCard>
          <CyberCard className="p-4 text-center">
            <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Выкл</p>
            <p className="text-2xl font-bold font-display text-red-400">{stats.disabled}</p>
          </CyberCard>
          <CyberCard className="p-4 text-center">
            <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Напрямую</p>
            <p className="text-2xl font-bold font-display text-green-400">{stats.byAction?.direct || 0}</p>
          </CyberCard>
          <CyberCard className="p-4 text-center">
            <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Через VPN</p>
            <p className="text-2xl font-bold font-display text-primary">{stats.byAction?.proxy || 0}</p>
          </CyberCard>
          <CyberCard className="p-4 text-center">
            <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Блок</p>
            <p className="text-2xl font-bold font-display text-red-400">{stats.byAction?.block || 0}</p>
          </CyberCard>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <CyberInput
            placeholder="Поиск по домену, IP или описанию..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          {['all', 'direct', 'proxy', 'block'].map(action => (
            <CyberButton
              key={action}
              size="sm"
              variant={filterAction === action ? 'default' : 'outline'}
              onClick={() => setFilterAction(action)}
            >
              {action === 'all' ? <Filter className="w-3 h-3 mr-1" /> : ACTION_ICONS[action]}
              <span className="ml-1">{action === 'all' ? 'Все' : ACTION_LABELS[action]}</span>
            </CyberButton>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-primary font-mono animate-pulse">Загрузка матрицы маршрутов...</div>
      ) : filteredRules.length === 0 ? (
        <CyberCard className="p-12 text-center">
          <Globe className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground font-mono">Нет правил маршрутизации</p>
          <p className="text-muted-foreground/70 font-mono text-sm mt-2">Добавьте правила вручную или импортируйте пресет</p>
        </CyberCard>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedRules).map(([category, catRules]) => (
            <CyberCard key={category} className="overflow-hidden">
              <div
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="font-display uppercase tracking-wider text-foreground font-bold">
                    {CATEGORY_NAMES[category] || category}
                  </span>
                  <CyberBadge variant="muted">{catRules.length}</CyberBadge>
                </div>
                <div className="flex items-center gap-3">
                  {category !== 'custom' && (
                    <CyberTooltip text="Удалить все правила в этой категории">
                      <CyberButton
                        size="sm"
                        variant="destructive"
                        onClick={(e) => { e.stopPropagation(); handleDeleteCategory(category); }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </CyberButton>
                    </CyberTooltip>
                  )}
                  {expandedCategories.has(category) ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </div>

              {expandedCategories.has(category) && (
                <div className="border-t border-primary/10">
                  <table className="w-full">
                    <thead>
                      <tr className="text-xs font-mono text-muted-foreground uppercase border-b border-primary/10">
                        <th className="text-left p-3 w-8"></th>
                        <th className="text-left p-3">Тип</th>
                        <th className="text-left p-3">Значение</th>
                        <th className="text-left p-3">Действие</th>
                        <th className="text-left p-3">Описание</th>
                        <th className="text-right p-3">Управление</th>
                      </tr>
                    </thead>
                    <tbody>
                      {catRules.map(rule => (
                        <tr key={rule.id} className={`border-b border-primary/5 hover:bg-white/5 transition-colors ${!rule.enabled ? 'opacity-40' : ''}`}>
                          <td className="p-3">
                            <button onClick={() => handleToggle(rule.id)} className="text-muted-foreground hover:text-primary">
                              {rule.enabled ? <ToggleRight className="w-5 h-5 text-primary" /> : <ToggleLeft className="w-5 h-5" />}
                            </button>
                          </td>
                          <td className="p-3">
                            <span className="font-mono text-xs text-muted-foreground">{TYPE_LABELS[rule.ruleType] || rule.ruleType}</span>
                          </td>
                          <td className="p-3">
                            <span className="font-mono text-sm text-foreground">{rule.value}</span>
                          </td>
                          <td className="p-3">
                            <CyberBadge variant={ACTION_COLORS[rule.action] || 'muted'}>
                              <span className="flex items-center gap-1">{ACTION_ICONS[rule.action]} {ACTION_LABELS[rule.action]}</span>
                            </CyberBadge>
                          </td>
                          <td className="p-3">
                            <span className="font-mono text-xs text-muted-foreground">{rule.description}</span>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex justify-end gap-2">
                              <CyberTooltip text="Редактировать правило">
                                <button
                                  onClick={() => setEditRule({ id: rule.id, ruleType: rule.ruleType, value: rule.value, action: rule.action, description: rule.description || '', priority: rule.priority })}
                                  className="text-muted-foreground hover:text-primary"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                              </CyberTooltip>
                              <CyberTooltip text="Удалить правило">
                                <button onClick={() => handleDelete(rule.id)} className="text-muted-foreground hover:text-red-400">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </CyberTooltip>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CyberCard>
          ))}
        </div>
      )}

      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Новое правило маршрутизации" className="max-w-lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-mono text-muted-foreground">Тип</label>
              <select
                value={form.ruleType}
                onChange={e => setForm({ ...form, ruleType: e.target.value })}
                className="w-full bg-background border border-primary/30 text-foreground px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none"
              >
                <option value="domain">Домен</option>
                <option value="ip">IP-адрес</option>
                <option value="cidr">CIDR (подсеть)</option>
                <option value="regexp">RegExp</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-mono text-muted-foreground">Действие</label>
              <select
                value={form.action}
                onChange={e => setForm({ ...form, action: e.target.value })}
                className="w-full bg-background border border-primary/30 text-foreground px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none"
              >
                <option value="direct">Напрямую</option>
                <option value="proxy">Через VPN</option>
                <option value="block">Блокировать</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-mono text-muted-foreground">Значение</label>
            <CyberInput
              placeholder={form.ruleType === 'domain' ? 'example.com' : form.ruleType === 'ip' ? '192.168.1.1' : form.ruleType === 'cidr' ? '10.0.0.0/8' : '.*\\.example\\.com'}
              value={form.value}
              onChange={e => setForm({ ...form, value: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-mono text-muted-foreground">Описание</label>
            <CyberInput
              placeholder="Краткое описание правила"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <CyberButton type="submit" className="w-full" disabled={createMutation.isPending}>
            Создать правило
          </CyberButton>
        </form>
      </Modal>

      {editRule && (
        <Modal isOpen={true} onClose={() => setEditRule(null)} title="Редактировать правило" className="max-w-lg">
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-mono text-muted-foreground">Тип</label>
                <select
                  value={editRule.ruleType}
                  onChange={e => setEditRule({ ...editRule, ruleType: e.target.value })}
                  className="w-full bg-background border border-primary/30 text-foreground px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none"
                >
                  <option value="domain">Домен</option>
                  <option value="ip">IP-адрес</option>
                  <option value="cidr">CIDR (подсеть)</option>
                  <option value="regexp">RegExp</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-mono text-muted-foreground">Действие</label>
                <select
                  value={editRule.action}
                  onChange={e => setEditRule({ ...editRule, action: e.target.value })}
                  className="w-full bg-background border border-primary/30 text-foreground px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none"
                >
                  <option value="direct">Напрямую</option>
                  <option value="proxy">Через VPN</option>
                  <option value="block">Блокировать</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-mono text-muted-foreground">Значение</label>
              <CyberInput value={editRule.value} onChange={e => setEditRule({ ...editRule, value: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-mono text-muted-foreground">Описание</label>
              <CyberInput value={editRule.description} onChange={e => setEditRule({ ...editRule, description: e.target.value })} />
            </div>
            <CyberButton type="submit" className="w-full" disabled={updateMutation.isPending}>
              Сохранить
            </CyberButton>
          </form>
        </Modal>
      )}

      <Modal isOpen={isPresetsOpen} onClose={() => setIsPresetsOpen(false)} title="Пресеты маршрутизации" className="max-w-2xl">
        <div className="space-y-4">
          {presets?.map(preset => {
            const existingCategory = Object.keys(groupedRules).includes(preset.id);
            return (
              <CyberCard key={preset.id} className="p-4 flex items-center justify-between">
                <div className="flex-1 mr-4">
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="font-display font-bold uppercase tracking-wider">{preset.name}</h4>
                    <CyberBadge variant={ACTION_COLORS[preset.action] || 'muted'}>
                      {ACTION_LABELS[preset.action]}
                    </CyberBadge>
                    <CyberBadge variant="muted">{preset.count} правил</CyberBadge>
                  </div>
                  <p className="text-xs font-mono text-muted-foreground">{preset.description}</p>
                </div>
                <div className="flex gap-2">
                  {existingCategory && (
                    <CyberTooltip text="Удалить все правила этого пресета">
                      <CyberButton size="sm" variant="destructive" onClick={() => handleDeleteCategory(preset.id)}>
                        <Trash2 className="w-3 h-3" />
                      </CyberButton>
                    </CyberTooltip>
                  )}
                  <CyberTooltip text="Импортировать этот пресет">
                    <CyberButton
                      size="sm"
                      onClick={() => handleImportPreset(preset.id)}
                      disabled={importPresetMutation.isPending}
                    >
                      <Upload className="w-3 h-3 mr-1" /> {existingCategory ? 'Обновить' : 'Импорт'}
                    </CyberButton>
                  </CyberTooltip>
                </div>
              </CyberCard>
            );
          })}
        </div>
      </Modal>
    </Layout>
  );
}
