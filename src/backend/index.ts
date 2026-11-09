import type { Backend } from './api';
import { createSupabaseBackend } from './supabase';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined;

/** Solo Supabase. Sin configuración la app muestra cómo arreglarlo (ver App). */
export const configMissing = !url || !key;

export const backend: Backend = configMissing
  ? (new Proxy({}, { get: () => { throw new Error('Falta configurar Supabase'); } }) as Backend)
  : createSupabaseBackend(url!, key!);
