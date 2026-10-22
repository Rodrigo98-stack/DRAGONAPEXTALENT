import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Toast = { id: number; kind: 'ok' | 'error' | 'info'; text: string };
const Ctx = createContext<(kind: Toast['kind'], text: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 5000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="fixed bottom-4 right-4 z-[90] flex w-[min(92vw,380px)] flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className={`card animate-rise px-4 py-3 text-sm shadow-2xl ${
            t.kind === 'ok' ? 'border-emerald-400/30' : t.kind === 'error' ? 'border-red-400/40' : 'border-silver/40'}`}>
            <span className="mr-2">{t.kind === 'ok' ? '✓' : t.kind === 'error' ? '!' : '◆'}</span>{t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
