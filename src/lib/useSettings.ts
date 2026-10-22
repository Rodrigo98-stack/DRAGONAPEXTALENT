import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { DEFAULT_WEIGHTS, type MatchWeights } from './matching';

export type Settings = {
  activation_fee: number;
  job_daily_rate: number;
  pix_base_payload: string;
  pix_receiver_name: string;
  matching_weights: MatchWeights;
};

// Valores do documento de especificação; o banco sempre prevalece quando conectado.
const FALLBACK: Settings = {
  activation_fee: 0.15, job_daily_rate: 1, pix_base_payload: '', pix_receiver_name: '', matching_weights: DEFAULT_WEIGHTS,
};

let cache: Promise<Settings> | null = null;

export function loadSettings(force = false): Promise<Settings> {
  if (!supabase) return Promise.resolve(FALLBACK);
  if (!cache || force) {
    cache = Promise.resolve(supabase.from('settings').select('key,value')).then(({ data }) => {
      const map = Object.fromEntries((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
      return {
        activation_fee: Number(map.activation_fee ?? FALLBACK.activation_fee),
        job_daily_rate: Number(map.job_daily_rate ?? FALLBACK.job_daily_rate),
        pix_base_payload: String(map.pix_base_payload ?? ''),
        pix_receiver_name: String(map.pix_receiver_name ?? ''),
        matching_weights: { ...DEFAULT_WEIGHTS, ...((map.matching_weights as object) ?? {}) },
      };
    });
  }
  return cache;
}

export function useSettings() {
  const [s, setS] = useState<Settings>(FALLBACK);
  useEffect(() => { loadSettings().then(setS); }, []);
  return s;
}
