# Bingo Salvaje

Bingo del debate electoral del 29N para jugar entre amigos desde el móvil. Cada uno prepara su cartón con eventos de un banco común y, durante el debate, canta lo que pasa. Un árbitro valida o saca tarjeta amarilla, y el ranking se actualiza en directo.

## Cómo se juega

1. Alguien **crea la sala** (y es el árbitro). Comparte el código o el enlace.
2. Cada uno rellena su **cartón**: a mano desde el banco de eventos, escribiendo los suyos o con *Rellenar huecos* (reparte entre candidatos).
3. El árbitro pulsa **Empezar partida** y los cartones se bloquean.
4. Cuando pasa algo, tocas la casilla y lo **cantas**. Va al **VAR**: los demás votan *Ha pasado* / *Mentira* y el árbitro **valida** o saca **tarjeta amarilla**. El árbitro también puede **pitar** eventos directamente desde *Eventos*.

Puntos: +1 por casilla, +5 por línea, +3 a la primera línea, +20 por bingo, +10 al primer bingo, +1 por cante validado, −1 por tarjeta amarilla.

## Desarrollo

```bash
npm install
npm run dev      # sin .env.local arranca en modo local de desarrollo (cada pestaña = un jugador)
npm test
```

## Supabase

1. En el proyecto: **Authentication → Sign In / Providers → Allow anonymous sign-ins** activado.
   No hay registro: cada uno pone su nombre. El mismo nombre en el ordenador y en el móvil es el mismo jugador.
2. **SQL Editor** → pega `supabase/schema.sql` → Run.
3. **Project Settings → API**: copia la URL y la clave `anon` / publishable a `.env.local` (ver `.env.example`).

La clave `anon` es pública por diseño; la seguridad la ponen las políticas RLS del esquema.

## Despliegue (GitHub Pages)

1. En el repo: **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables**: crea `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
3. Cada push a `main` despliega.
