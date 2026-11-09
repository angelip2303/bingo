/** Usuario = identidad: sin tildes ni mayúsculas para compararlo, tal cual para mostrarlo. */
export function usernameKey(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, '.');
}

export function validateUsername(name: string): string | null {
  const k = usernameKey(name);
  if (k.length < 3) return 'El nombre necesita al menos 3 caracteres';
  if (k.length > 20) return 'Máximo 20 caracteres';
  if (!/^[a-z0-9._-]+$/.test(k)) return 'Solo letras, números, espacios, punto y guion';
  return null;
}
