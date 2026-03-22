import React from 'react';
import { Layout } from '@/components/layout';
import { useGetServerConfig, useRestartServer, getGetServerStatusQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { CyberCard, CyberButton, CyberInput } from '@/components/ui/cyber';
import { CyberTooltip } from '@/components/ui/tooltip';
import { Settings2, RefreshCw, Cpu, Network } from 'lucide-react';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useGetServerConfig();
  const restartMutation = useRestartServer();

  const handleRestart = async () => {
    if(confirm("Инициировать холодную перезагрузку ядра Xray? Соединения будут временно разорваны.")) {
      await restartMutation.mutateAsync();
      queryClient.invalidateQueries({ queryKey: getGetServerStatusQueryKey() });
      alert("Сигнал перезапуска отправлен.");
    }
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
    </Layout>
  );
}
