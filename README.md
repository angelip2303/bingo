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
cp .env.example .env.local   # y rellena la URL y la clave publishable de Supabase
npm run dev
npm test
```

## Supabase

El esquema vive en `supabase/migrations/` y se aplica con la CLI:

```bash
npx supabase login                         # una vez, abre el navegador
npx supabase link --project-ref <ref>      # el ref está en la URL del proyecto
npx supabase db push                       # aplica las migraciones pendientes
```

### Cómo se persiste

- **Una fila → escritura directa a la tabla.** La protegen RLS (quién) y restricciones/triggers (qué es válido): cartón, votos, eventos nuevos, fase y silbato de la sala.
- **Varias escrituras que van juntas → una función de Postgres** (una transacción, todo o nada): `create_room`, `join_room`, `claim_item`, `resolve_claim`, `set_happened`, `finish_room`.
- **La base de datos garantiza la coherencia**, no el cliente: todo lo de una sala apunta a cosas de esa sala (FKs compuestas) y `check_card` valida cada cartón.
- **Huecos del cartón = `null`** en la app y en la base de datos; no hay valores centinela.
- **Se guarda el estado completo, no cambios sueltos**: el cartón entero en cada guardado. Es idempotente, así que se puede agrupar y reintentar sin miedo, y mover/rellenar/barajar no necesitan casos especiales. Con el mismo cartón en dos dispositivos a la vez, gana el último guardado.
- **Edición en el cliente → `useAutosave`** (`src/lib/autosave.ts`): una petición a la vez, gana el último valor, reintenta si falla y guarda al salir.

En el dashboard: **Authentication → Sign In / Providers → Allow anonymous sign-ins** activado.
No hay registro: cada uno pone su nombre. El mismo nombre en el ordenador y en el móvil es el mismo jugador.

Para la app: **Project Settings → API Keys**, copia la URL y la clave **publishable** a `.env.local` (ver `.env.example`).
La clave publishable es pública por diseño; la seguridad la ponen las políticas RLS de las migraciones.

## Despliegue (GitHub Pages)

1. En el repo: **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables**: crea `VITE_SUPABASE_URL` y `VITE_SUPABASE_KEY` (la clave publishable).
3. Cada push a `main` despliega.
