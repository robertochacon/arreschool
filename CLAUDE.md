# CLAUDE.md — cómo se trabaja en este repo

Instrucciones para un agente que edita este código. Lo obligatorio y por qué;
los detalles (nombres de tablas, firmas de RPC, claves de cache) están en
**`ARQUITECTURA.md`**, que manda sobre este archivo.

## Lo primero

1. Lee `ARQUITECTURA.md` antes de crear cualquier archivo nuevo.
2. Antes de inventar un patrón, **abre el archivo hermano más cercano y cópialo**.
   Moldes: `src/hooks/students.ts` (hooks), `src/features/students/` (listado +
   formulario + ficha) y `supabase/migrations/0014_students_families.sql` (tabla
   del dominio).
3. El producto es **ArreSchool**: SaaS multi-tenant para colegios, donde cada
   tenant es un colegio. Nunca escribas el nombre anterior del proyecto (Nunurd)
   ni hables de "negocio" en la interfaz: es "colegio". El slug de máquina es
   `arreschool` (claves de storage, GUC `arreschool.purging_tenant`).
4. Comentarios y textos de interfaz **en español**. Identificadores en inglés.
5. Comenta el **porqué**, no el qué. Un comentario que repite el código sobra;
   uno que explica una decisión rara ahorra un bug futuro.

## Frontend

**Capa de hooks obligatoria.** Ningún componente importa `supabase`. Toda
lectura o escritura pasa por `src/hooks/*.ts` con TanStack Query. Única
excepción, ya escrita: `src/auth/AuthProvider.tsx` y `src/pages/auth/*` (login,
registro, OAuth, recuperación), que hablan con `supabase.auth`, no con datos.

- Toda llamada `.from()` y `.rpc()` comprueba `error` y lo lanza: `if (error) throw error`.
- Las claves de cache son las de `ARQUITECTURA.md` §7.11. No inventes claves
  nuevas para datos que ya tienen una.
- En `onSuccess` invalida **todo lo que la mutación deja desfasado**, casi siempre
  también `['dashboard']`. Si la fila se borró, `removeQueries`, no `invalidateQueries`:
  volver a pedirla solo gasta una vuelta de red para guardar un `null`.
- UI solo con las primitivas de `src/components/ui/`. Clases con `cn()`
  (`@/lib/cn`). Variantes por **objeto de lookup**, nunca ternarios encadenados.
- `forwardRef` + `...props` en cualquier primitiva que envuelva un elemento HTML.

**Regla móvil (no negociable).** Ningún listado puede exigir scroll horizontal en
el teléfono:

```tsx
<div className="hidden overflow-x-auto lg:block"><table>…</table></div>
<DataList>{rows.map((r) => <DataRow … actions={<ActionMenu items={…} />} />)}</DataList>
```

Revisa cada pantalla a **360 px** antes de darla por hecha. Y los inputs se
quedan a 16 px en móvil (`src/index.css`, con `!important`): por debajo, iOS hace
zoom al enfocar y no vuelve.

**TypeScript.** `strict` con `noUnusedLocals` y `noUnusedParameters`: un import o
un parámetro sin usar **rompe el build**. Nada de `any` salvo en una frontera con
datos crudos, y ahí acotado y con un comentario que diga por qué.

## Base de datos

**La lógica vive en Postgres.** Topes de plan, consistencia entre tablas y campos
inmutables son triggers y funciones `security definer`, no validaciones del
formulario. Cualquiera puede llamar a PostgREST con `curl` y la anon key: si la
regla no está en la base, no existe. La validación del cliente es cortesía, no
seguridad.

**Migraciones**

- Se numeran `NNNN_titulo.sql`, cuatro dígitos, correlativo. La siguiente libre es
  la que toque después de `0018_platform_school.sql`. Un solo hueco por número.
- Cabecera `-- ═══ ArreSchool · NNNN · <título> ═══` y una explicación de **por qué**
  existe la migración.
- Idempotente donde se pueda: `create table if not exists`, `drop policy if exists`,
  `create or replace function`.
- **Nunca se edita una migración ya aplicada.** Si `supabase db push` la corrió en
  un proyecto real, ese archivo es historia: el CLI lleva la cuenta por nombre y
  no la vuelve a ejecutar, así que tu cambio nunca llega al servidor mientras en
  local sí — y las dos bases divergen en silencio. Todo cambio es una migración
  nueva. (Antes del primer despliegue, con la base aún vacía, sí vale editar y
  hacer `supabase db reset`.)

**Tabla nueva del dominio ⇒ siempre así**

1. `tenant_id uuid not null default public.auth_tenant_id() references
   public.tenants(id) on delete cascade` + índice que empiece por `tenant_id`.
   El cliente **nunca** manda `tenant_id`: lo pone el default y
   `enforce_tenant_row()` rechaza cualquier otro.
2. `constraint <tabla>_tenant_id_key unique (tenant_id, id)` y las FKs hacia
   otras tablas del dominio **compuestas**: `foreign key (tenant_id, x_id)
   references public.x (tenant_id, id)`. Es lo que impide por construcción
   referenciar filas de otro colegio. `on delete restrict` para todo lo que sea
   historia (inscripciones, pagos, notas).
3. `select public.setup_tenant_table('<tabla>', '<predicado lectura>',
   '<predicado escritura>');` — RLS, `revoke` a `anon`, 4 políticas por tenant con
   el rol (`auth_can_manage_academics()`, `auth_can_manage_students()`,
   `auth_can_handle_finance()`, `auth_can_manage_finance()`,
   `auth_teaches_section(section_id)`), lectura del super-admin, trigger de
   tenant, bloqueo por suspensión y `updated_at`.
4. Columnas que reflejan dinero o estado calculado: **privilegios por columna**
   (`revoke update … ; grant update (col1, col2) …`), como `charges` en 0016.

Además: añádela a `admin_delete_tenant` (versión vigente en 0018; borra
hijo→padre y una tabla que falte rompe la purga) y amplía
`supabase/tests/isolation.test.mjs`. **`npm run test:db` tiene que pasar** antes
de dar una migración por buena.

**Roles.** `owner`, `admin`, `secretary`, `teacher`, `accountant` (0012). La
matriz está en los `auth_can_*()` de 0013 y su espejo en
`src/lib/permissions.ts`: si cambias uno, cambia el otro en el mismo commit. La
UI oculta lo que el rol no puede hacer (`usePermissions().can(...)`), pero la
seguridad es la de la base.

**Dinero.** Pagos inmutables (solo `void_payment` con motivo), cobro y reparto
solo por `register_payment`. Nunca un UPDATE de `amount_paid`/`status` desde el
cliente.

**Historial.** Asistencia, evaluaciones, observaciones y boletines cuelgan de
`enrollments` y guardan `section_id` del momento (lo pone
`classroom_row_guard`). Un año `closed` es inmutable (`PERIODO_CERRADO`).

**RPC nueva:** `security definer set search_path = public`, guardia de
autorización en la primera línea, `revoke all … from public` + `grant execute …
to authenticated`. Si puede tardar, `set local statement_timeout` dentro: PostgREST
hoistea el suyo y `authenticated` trae 8 s.

## Protocolo de errores de plan

Los triggers que aplican un tope lanzan el mensaje con un prefijo técnico:

```sql
raise exception 'PLAN_LIMIT_STUDENTS: El plan % permite % estudiantes activos. Actualiza tu plan para inscribir más.', v_name, v_max;
```

- Prefijos en uso: `PLAN_LIMIT_STUDENTS`, `PLAN_LIMIT_MEMBERS`. Uno nuevo sigue el
  patrón `PLAN_LIMIT_<RECURSO>`. Marcas de negocio con el mismo protocolo:
  `PERIODO_CERRADO`, `PERIODO_ACTIVO`, `SECCION_LLENA`, `SIN_SECCION`,
  `CORTE_CERRADO`, `BOLETIN_PUBLICADO`, `CARGO_ANULADO`, `CARGO_CON_PAGOS`,
  `MONTO_INVALIDO`, `SIN_PERIODO_ACTIVO`, `CUENTA_SUSPENDIDA`.
- El prefijo existe **para que el código lo reconozca**, no para enseñárselo a
  nadie: `errorMessage()` (`src/lib/errors.ts`) recorta hasta los primeros dos
  puntos y pinta solo el texto amigable.
- Por eso el mensaje va **después de `: `** y en español, con la salida a mano
  ("Actualiza tu plan…"). No pongas ahí un texto técnico: es lo que lee el usuario.
- La UI nunca compone su propio mensaje de tope. Manda el de la base, que conoce
  el número real del plan vigente (`plan_settings`).

## Comandos

```bash
npm run dev                             # desarrollo
npm run lint                            # tsc -b --noEmit  ← pásalo antes de terminar
npm run build                           # tipos + build a dist/
npm run test:db                         # migraciones + aislamiento entre colegios (PGlite)

supabase db push --linked               # aplica migraciones al proyecto enlazado
supabase db reset                       # recrea la base LOCAL desde cero (borra datos)
supabase db query --linked "select …"   # consulta puntual contra el proyecto enlazado
supabase functions deploy welcome       # despliega la Edge Function
supabase config push                    # SIEMPRE con SMTP_PASSWORD en el entorno
```

## Prohibiciones

- No ejecutes `supabase db push`, `config push` ni `functions deploy` sin que te
  lo pidan: escriben en un proyecto real.
- No cambies el `buster` del persister (`arreschool-v1`, `src/main.tsx`): descarta la
  cola de mutaciones offline **sin subirla**.
- No saques `clsx` del chunk `vendor` (`vite.config.ts`): la app no monta y la
  pantalla se queda en blanco antes de React.
- No pongas un secreto detrás de `VITE_`: acaba en `dist/`, que se publica tal
  cual. Los secretos van en `supabase secrets set`.
- Cuidado con los heredocs sin comillas en la shell: un comentario con
  `` `supabase db push` `` entre backticks se EJECUTA. Usa `<<'EOF'`.
- No añadas dependencias sin necesidad. El stack de `ARQUITECTURA.md` §1 está
  cerrado; sin librería de UI, a propósito.
