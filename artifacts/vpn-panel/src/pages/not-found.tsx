import { AlertCircle } from "lucide-react";
import { CyberCard } from "@/components/ui/cyber";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <CyberCard className="w-full max-w-md mx-4 p-6">
        <div className="flex mb-4 gap-2 items-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <h1 className="text-2xl font-bold font-display text-foreground uppercase tracking-widest">404 Не Найдено</h1>
        </div>
        <p className="mt-4 text-sm font-mono text-muted-foreground">
          Запрошенный маршрут не существует в системе.
        </p>
      </CyberCard>
    </div>
  );
}
