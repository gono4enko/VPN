import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/layout';
import {
  useGetServerConfig,
  useRestartServer,
  getGetServerStatusQueryKey,
  useGetAntiDpiSettings,
  useUpdateAntiDpiSettings,
  getGetAntiDpiSettingsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { CyberCard, CyberButton, CyberInput } from '@/components/ui/cyber';
import { CyberTooltip } from '@/components/ui/tooltip';
import { Settings2, RefreshCw, Cpu, Network, Shield, Shuffle, Fingerprint, Layers } from 'lucide-react';

const TRANSPORT_LABELS: Record<string, string> = {
  tcp: 'TCP',
  ws: 'WebSocket',
  grpc: 'gRPC',
  h2: 'HTTP/2',
};

const FINGERPRINT_LABELS: Record<string, string> = {
  chrome: 'Chrome',
  firefox: 'Firefox',
  safari: 'Safari',
  edge: 'Edge',
  ios: 'iOS',
  android: 'Android',
  random: 'Случайный',
  randomized: 'Рандомизированный',
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useGetServerConfig();
  const { data: antiDpi, isLoading: antiDpiLoading } = useGetAntiDpiSettings();
  const restartMutation = useRestartServer();
  const updateAntiDpiMutation = useUpdateAntiDpiSettings();

  const [fragmentEnabled, setFragmentEnabled] = useState(true);
  const [fragmentLength, setFragmentLength] = useState("100-200");
  const [fragmentInterval, setFragmentInterval] = useState("10-20");
  const [fingerprintRotation, setFingerprintRotation] = useState(true);
  const [fingerprintInterval, setFingerprintInterval] = useState(360);
  const [fingerprintList, setFingerprintList] = useState<string[]>(["chrome", "firefox", "safari", "edge", "random"]);
  const [transportPriority, setTransportPriority] = useState<string[]>(["tcp", "ws", "grpc", "h2"]);
  const [autoFallback, setAutoFallback] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (antiDpi) {
      setFragmentEnabled(antiDpi.fragmentEnabled);
      setFragmentLength(antiDpi.fragmentLength);
      setFragmentInterval(antiDpi.fragmentInterval);
      setFingerprintRotation(antiDpi.fingerprintRotation);
      setFingerprintInterval(antiDpi.fingerprintInterval);
      setFingerprintList(antiDpi.fingerprintList);
      setTransportPriority(antiDpi.transportPriority);
      setAutoFallback(antiDpi.autoFallback);
    }
  }, [antiDpi]);

  const handleRestart = async () => {
    if(confirm("Инициировать холодную перезагрузку ядра Xray? Соединения будут временно разорваны.")) {
      await restartMutation.mutateAsync();
      queryClient.invalidateQueries({ queryKey: getGetServerStatusQueryKey() });
      alert("Сигнал перезапуска отправлен.");
    }
  };

  const handleSaveAntiDpi = async () => {
    await updateAntiDpiMutation.mutateAsync({
      data: {
        fragmentEnabled,
        fragmentLength,
        fragmentInterval,
        fingerprintRotation,
        fingerprintInterval,
        fingerprintList,
        transportPriority,
        autoFallback,
      },
    });
    queryClient.invalidateQueries({ queryKey: getGetAntiDpiSettingsQueryKey() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const toggleFingerprint = (fp: string) => {
    setFingerprintList(prev =>
      prev.includes(fp) ? prev.filter(f => f !== fp) : [...prev, fp]
    );
  };

  const moveTransport = (idx: number, direction: 'up' | 'down') => {
    const newPriority = [...transportPriority];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= newPriority.length) return;
    [newPriority[idx], newPriority[targetIdx]] = [newPriority[targetIdx], newPriority[idx]];
    setTransportPriority(newPriority);
  };

  return (
    <Layout>
      <div className="mb-8">
        <h2 className="text-3xl font-display font-bold text-foreground uppercase tracking-widest flex items-center gap-3">
          <Settings2 className="w-8 h-8 text-primary" /> Конфиг_Системы
        </h2>
        <p className="text-muted-foreground font-mono text-sm mt-1">Параметры окружения ядра</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <CyberCard className="p-6">
          <h3 className="text-xl font-display uppercase font-bold text-primary mb-6 flex items-center gap-2 border-b border-primary/20 pb-4">
            <Network className="w-5 h-5" /> Входящая Матрица (Только чтение)
          </h3>
          
          {isLoading ? (
            <div className="animate-pulse text-primary font-mono">Дешифровка конфигурации...</div>
          ) : (
            <div className="space-y-4 font-mono text-sm">
              <div className="space-y-1">
                <CyberTooltip text="IP-адрес сервера для входящих подключений">
                  <label className="text-muted-foreground text-xs uppercase tracking-wider">IP Сервера</label>
                </CyberTooltip>
                <CyberInput readOnly value={config?.officeIp || ''} className="opacity-70 bg-transparent" />
              </div>
              <div className="space-y-1">
                <CyberTooltip text="Порт для входящих VLESS-подключений">
                  <label className="text-muted-foreground text-xs uppercase tracking-wider">Порт Сервера</label>
                </CyberTooltip>
                <CyberInput readOnly value={config?.officePort || ''} className="opacity-70 bg-transparent" />
              </div>
              <div className="space-y-1">
                <CyberTooltip text="Маска SNI для маскировки трафика">
                  <label className="text-muted-foreground text-xs uppercase tracking-wider">Маска SNI</label>
                </CyberTooltip>
                <CyberInput readOnly value={config?.officeSni || ''} className="opacity-70 bg-transparent" />
              </div>
            </div>
          )}
        </CyberCard>

        <div className="space-y-8">
          <CyberCard className="p-6">
            <h3 className="text-xl font-display uppercase font-bold text-accent mb-6 flex items-center gap-2 border-b border-accent/20 pb-4">
              <Cpu className="w-5 h-5" /> Логика Автоматизации
            </h3>
            
            {isLoading ? (
              <div className="animate-pulse text-accent font-mono">Дешифровка конфигурации...</div>
            ) : (
              <div className="space-y-4 font-mono text-sm">
                <div className="flex items-center justify-between p-3 bg-background/50 border border-primary/20">
                  <CyberTooltip text="Автоматическое переключение на быстрейший профиль при превышении порога задержки">
                    <span className="text-foreground">Авто-переключение</span>
                  </CyberTooltip>
                  <span className={`px-2 py-1 text-xs border ${config?.autoSwitch ? 'text-primary border-primary bg-primary/10' : 'text-muted-foreground border-muted-foreground'}`}>
                    {config?.autoSwitch ? 'ВКЛЮЧЕНО' : 'ВЫКЛЮЧЕНО'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground p-3 border-b border-primary/10">
                  <CyberTooltip text="Интервал проверки задержки профилей в миллисекундах">
                    <span>Интервал проверки</span>
                  </CyberTooltip>
                  <span className="text-foreground">{config?.autoSwitchInterval} мс</span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground p-3">
                  <CyberTooltip text="Порог задержки для автоматического переключения в миллисекундах">
                    <span>Порог задержки</span>
                  </CyberTooltip>
                  <span className="text-foreground">{config?.autoSwitchThreshold} мс</span>
                </div>
                <p className="text-xs text-muted-foreground/50 mt-4 italic">
                  // Параметры заблокированы переменными окружения на хост-контейнере.
                </p>
              </div>
            )}
          </CyberCard>

          <CyberCard className="p-6 border-destructive/30">
            <h3 className="text-xl font-display uppercase font-bold text-destructive mb-4">Критические Директивы</h3>
            <p className="text-muted-foreground font-mono text-sm mb-6">Выполняет жёсткий перезапуск бинарного файла Xray. Активный трафик будет прерван.</p>
            <CyberTooltip text="Принудительно перезапустить ядро Xray — все активные подключения будут сброшены">
              <CyberButton variant="destructive" className="w-full" onClick={handleRestart} disabled={restartMutation.isPending}>
                <RefreshCw className={`w-4 h-4 ${restartMutation.isPending ? 'animate-spin' : ''}`} />
                {restartMutation.isPending ? 'Выполнение...' : 'Перезагрузить ядро'}
              </CyberButton>
            </CyberTooltip>
          </CyberCard>
        </div>
      </div>

      <div className="mt-10 mb-8">
        <h2 className="text-3xl font-display font-bold text-foreground uppercase tracking-widest flex items-center gap-3">
          <Shield className="w-8 h-8 text-accent" /> Анти-DPI
        </h2>
        <p className="text-muted-foreground font-mono text-sm mt-1">Обход ТСПУ: фрагментация, транспорты, ротация отпечатков</p>
      </div>

      {antiDpiLoading ? (
        <div className="animate-pulse text-primary font-mono">Загрузка настроек Anti-DPI...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <CyberCard className="p-6">
            <h3 className="text-xl font-display uppercase font-bold text-primary mb-6 flex items-center gap-2 border-b border-primary/20 pb-4">
              <Layers className="w-5 h-5" /> Фрагментация TLS
            </h3>
            <div className="space-y-4 font-mono text-sm">
              <div className="flex items-center justify-between p-3 bg-background/50 border border-primary/20">
                <span className="text-foreground">Фрагментация ClientHello</span>
                <button
                  onClick={() => setFragmentEnabled(!fragmentEnabled)}
                  className={`px-3 py-1 text-xs border transition-colors ${
                    fragmentEnabled
                      ? 'text-primary border-primary bg-primary/10'
                      : 'text-muted-foreground border-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {fragmentEnabled ? 'ВКЛ' : 'ВЫКЛ'}
                </button>
              </div>
              <div className="space-y-1">
                <label className="text-muted-foreground text-xs uppercase tracking-wider">Длина фрагмента (байты)</label>
                <CyberInput
                  value={fragmentLength}
                  onChange={e => setFragmentLength(e.target.value)}
                  placeholder="100-200"
                  disabled={!fragmentEnabled}
                  className={!fragmentEnabled ? 'opacity-40' : ''}
                />
                <p className="text-muted-foreground/50 text-xs">Формат: мин-макс (например, 100-200)</p>
              </div>
              <div className="space-y-1">
                <label className="text-muted-foreground text-xs uppercase tracking-wider">Интервал (мс)</label>
                <CyberInput
                  value={fragmentInterval}
                  onChange={e => setFragmentInterval(e.target.value)}
                  placeholder="10-20"
                  disabled={!fragmentEnabled}
                  className={!fragmentEnabled ? 'opacity-40' : ''}
                />
                <p className="text-muted-foreground/50 text-xs">Задержка между фрагментами: мин-макс</p>
              </div>
            </div>
          </CyberCard>

          <CyberCard className="p-6">
            <h3 className="text-xl font-display uppercase font-bold text-accent mb-6 flex items-center gap-2 border-b border-accent/20 pb-4">
              <Shuffle className="w-5 h-5" /> Приоритет транспортов
            </h3>
            <div className="space-y-4 font-mono text-sm">
              <div className="flex items-center justify-between p-3 bg-background/50 border border-primary/20 mb-2">
                <span className="text-foreground">Авто-фоллбэк транспорта</span>
                <button
                  onClick={() => setAutoFallback(!autoFallback)}
                  className={`px-3 py-1 text-xs border transition-colors ${
                    autoFallback
                      ? 'text-primary border-primary bg-primary/10'
                      : 'text-muted-foreground border-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {autoFallback ? 'ВКЛ' : 'ВЫКЛ'}
                </button>
              </div>
              <p className="text-muted-foreground/50 text-xs mb-2">Перетащите для изменения порядка приоритета:</p>
              <div className="space-y-2">
                {transportPriority.map((t, idx) => (
                  <div key={t} className="flex items-center justify-between p-3 border border-primary/20 bg-background/30">
                    <div className="flex items-center gap-3">
                      <span className="text-primary text-xs font-bold w-5">{idx + 1}.</span>
                      <span className="text-foreground">{TRANSPORT_LABELS[t] || t.toUpperCase()}</span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => moveTransport(idx, 'up')}
                        disabled={idx === 0}
                        className={`px-2 py-1 text-xs border ${idx === 0 ? 'opacity-30 border-muted-foreground' : 'border-primary/50 text-primary hover:bg-primary/10'}`}
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => moveTransport(idx, 'down')}
                        disabled={idx === transportPriority.length - 1}
                        className={`px-2 py-1 text-xs border ${idx === transportPriority.length - 1 ? 'opacity-30 border-muted-foreground' : 'border-primary/50 text-primary hover:bg-primary/10'}`}
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CyberCard>

          <CyberCard className="p-6 lg:col-span-2">
            <h3 className="text-xl font-display uppercase font-bold text-primary mb-6 flex items-center gap-2 border-b border-primary/20 pb-4">
              <Fingerprint className="w-5 h-5" /> Ротация отпечатков uTLS
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-sm">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-background/50 border border-primary/20">
                  <span className="text-foreground">Авто-ротация</span>
                  <button
                    onClick={() => setFingerprintRotation(!fingerprintRotation)}
                    className={`px-3 py-1 text-xs border transition-colors ${
                      fingerprintRotation
                        ? 'text-primary border-primary bg-primary/10'
                        : 'text-muted-foreground border-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    {fingerprintRotation ? 'ВКЛ' : 'ВЫКЛ'}
                  </button>
                </div>
                <div className="space-y-1">
                  <label className="text-muted-foreground text-xs uppercase tracking-wider">Интервал ротации (мин)</label>
                  <CyberInput
                    type="number"
                    value={fingerprintInterval}
                    onChange={e => setFingerprintInterval(Number(e.target.value))}
                    disabled={!fingerprintRotation}
                    className={!fingerprintRotation ? 'opacity-40' : ''}
                  />
                  <p className="text-muted-foreground/50 text-xs">По умолчанию: 360 мин (6 часов)</p>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-muted-foreground text-xs uppercase tracking-wider">Список отпечатков для ротации</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(FINGERPRINT_LABELS).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => toggleFingerprint(key)}
                      disabled={!fingerprintRotation}
                      className={`p-2 text-xs border transition-colors text-left ${
                        fingerprintList.includes(key)
                          ? 'border-primary text-primary bg-primary/10'
                          : 'border-muted-foreground/30 text-muted-foreground hover:border-primary/50'
                      } ${!fingerprintRotation ? 'opacity-40' : ''}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CyberCard>

          <div className="lg:col-span-2">
            <CyberButton
              className="w-full"
              onClick={handleSaveAntiDpi}
              disabled={updateAntiDpiMutation.isPending}
            >
              {updateAntiDpiMutation.isPending ? 'Сохранение...' : saved ? '✓ Сохранено' : 'Сохранить настройки Anti-DPI'}
            </CyberButton>
          </div>
        </div>
      )}
    </Layout>
  );
}
