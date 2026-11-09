import type { Backend } from './api';
import { createLocalBackend } from './local';
import { createSupabaseBackend } from './supabase';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const backend: Backend = url && key ? createSupabaseBackend(url, key) : createLocalBackend();
