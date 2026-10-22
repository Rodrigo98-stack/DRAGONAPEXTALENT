import type { ReactNode } from 'react';
import { useAsync } from '../lib/useAsync';
import { db } from '../lib/supabase';
import { dateTime } from '../lib/format';
import type { Notification } from '../lib/types';
import { Link } from 'react-router-dom';

export function DashboardShell({ eyebrow, title, aside, children }: { eyebrow: string; title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="container-x min-h-screen pb-16 pt-28">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-2 font-display text-4xl sm:text-5xl">{title}</h1>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Notifications({ userId }: { userId: string }) {
  const { data, reload } = useAsync(async () =>
    ((await db().from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(8)).data ?? []) as Notification[], [userId]);
  const markAll = async () => {
    await db().from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId).is('read_at', null);
    reload();
  };
  if (!data?.length) return <p className="text-sm text-white/40">Nenhuma notificação por enquanto.</p>;
  return (
    <div>
      <ul className="divide-y divide-white/5">
        {data.map((n) => (
          <li key={n.id} className="flex gap-3 py-3">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? 'bg-white/15' : 'bg-silver'}`} />
            <div className="min-w-0">
              <div className="text-sm font-medium">{n.link ? <Link to={n.link} className="hover:text-silver-light">{n.title}</Link> : n.title}</div>
              {n.body && <div className="text-xs text-white/50">{n.body}</div>}
              <div className="mt-0.5 text-[11px] text-white/30">{dateTime(n.created_at)}</div>
            </div>
          </li>
        ))}
      </ul>
      {data.some((n) => !n.read_at) && <button onClick={markAll} className="mt-2 text-xs text-silver-light hover:underline">Marcar todas como lidas</button>}
    </div>
  );
}
