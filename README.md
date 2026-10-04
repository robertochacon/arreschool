# ArreSchool — gestión de colegios, multi-tenant

**ArreSchool** es una plataforma SaaS para administrar colegios. Empieza por la
educación **inicial / preescolar**, y el modelo ya está preparado para primaria y
secundaria (nivel educativo por grado, nota numérica junto a la escala
cualitativa, varios docentes por sección).

Cada colegio es un **tenant**: Colegio A, Colegio B y Colegio C comparten la base
de datos, pero los estudiantes, docentes, pagos y notas de uno **nunca** aparecen
en otro. Eso no lo garantiza la interfaz: lo garantiza Postgres (RLS por fila,
claves foráneas compuestas por `tenant_id` y triggers), y lo comprueba un test
automático (`npm run test:db`).

```
            ARRESCHOOL

      ┌── Estudiantes ──┐
      │                 │
Académico             Familias
      │                 │
      └──── Finanzas ────┘
```

| Área | Qué incluye |
|---|---|
| **Estudiantes** | Ficha con datos médicos y foto, matrícula automática, documentos (acta, vacunas…), historial por año, inscripciones |
| **Académico** | Años escolares, cortes de evaluación, grados, secciones, docentes, asistencia diaria (funciona sin conexión), competencias e indicadores, evaluaciones L/EP/I, anecdotario y boletines |
| **Finanzas** | Conceptos, cargos (también masivos por mes), pagos con reparto automático, recibos numerados por colegio, anulaciones con motivo, saldo a favor y cuentas por cobrar |
| **Familias** | Padres y tutores compartidos entre hermanos: quién recoge, contacto de emergencia, responsable de pagos |
| **Alrededor** | Comunicados por colegio/grado/sección, reportes, panel, equipo con roles |

Nombres de producto: **ArreSchool Admin** (Dirección y Secretaría), **ArreSchool
Teacher** (docentes: asistencia y evaluaciones de sus secciones), **ArreSchool
Pay** (finanzas), **ArreSchool Reports** y, próximamente, **ArreSchool Family**
(portal de familias; el modelo ya reserva `guardians.user_id`).

### Flujo de un colegio

```
Crear colegio → año académico → grados → secciones → docentes
→ estudiantes → padres/tutores → inscribir → asignar sección
→ asistencia → evaluar → boletines → cargos → pagos → recibos
```

El panel muestra «Primeros pasos» con este orden mientras falte algo: un colegio
pequeño puede empezar sin ayuda técnica.

### Roles

| Rol | Puede |
|---|---|
| Dirección (`owner`) | Todo, incluido el plan y el equipo |
| Administración (`admin`) | Todo lo operativo |
| Secretaría (`secretary`) | Estudiantes, familias, inscripciones, asistencia, comunicados y caja (cobrar) |
| Docente (`teacher`) | Lee lo académico; escribe asistencia, evaluaciones y observaciones **solo de sus secciones**. No ve finanzas |
| Finanzas (`accountant`) | Conceptos, cargos, pagos y anulaciones |

La matriz vive en la base (`auth_can_*()`, migración 0013) y se replica en
`src/lib/permissions.ts` solo para no enseñar botones que fallarían.

---

## 1. Arranque

Necesitas Node 20+, una cuenta en [Supabase](https://supabase.com) y el
[CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase`).

```bash
npm install
npm run test:db                  # aplica las migraciones en un Postgres en memoria
                                 # y prueba el aislamiento entre colegios

cp .env.example .env             # VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY

supabase login
supabase link --project-ref TU_PROJECT_REF
supabase db push                 # aplica supabase/migrations/0001…0018
supabase functions deploy welcome

npm run icons                    # íconos PWA + favicon desde public/logo.png
npm run dev
```

Regístrate en `/registro` y crea tu colegio: `setup_tenant()` arma el colegio, tu
perfil de Dirección (`owner`) y una suscripción `basic` en prueba de 30 días. **No
hay datos de demostración** (`supabase/seed.sql` explica por qué).

- **URLs de retorno.** `supabase/config.toml` ya declara las de `localhost`. Al
  desplegar, añade el origen real y aplica con `SMTP_PASSWORD="re_..." supabase config push`.
- **Correo propio.** Sin SMTP, Supabase usa su remitente compartido, limitado a
  unos pocos correos por hora. Las plantillas están en `supabase/templates/`.

---

## 2. Origen y decisiones de arquitectura

ArreSchool nace de `saas-starter` (React + Supabase con RLS, planes, super-admin y
PWA offline). Se conservó todo su andamiaje de plataforma y se sustituyó la
entidad de ejemplo `items` por el dominio escolar, **con migraciones nuevas**
(0012–0018) en lugar de reescribir las del starter.

- **Sin servidor intermedio.** No hay API propia (ni Hono ni Express): el
  navegador habla con PostgREST con el JWT del usuario, y toda regla que importa
  vive en Postgres. El "tenant del contexto" es `auth_tenant_id()`, que sale del
  token (`auth.uid()` → `profiles.tenant_id`).
- **El cliente nunca manda el tenant.** Cada tabla tiene `tenant_id default
  auth_tenant_id()` y el trigger `enforce_tenant_row()` rechaza cualquier otro
  valor en INSERT y UPDATE.
- **Claves foráneas compuestas.** Las tablas exponen `unique (tenant_id, id)` y
  sus hijas las referencian con `(tenant_id, x_id)`: es imposible inscribir al
  estudiante de otro colegio o aplicar un pago a un cargo ajeno, aunque una RPC
  o una Edge Function se equivocaran.
- **Historial fiable.** La asistencia, las notas y los boletines cuelgan de la
  inscripción (estudiante + año) y guardan la sección de ese momento. Un año
  cerrado es inmutable; el boletín publicado es una foto congelada (`snapshot`).
- **Dinero inmutable.** Los pagos no se editan ni se borran: se anulan con
  motivo. El cobro, el reparto entre cargos y el número de recibo se hacen en una
  sola RPC transaccional con bloqueo por cuenta de estudiante.

---

## 3. La arquitectura en una pantalla

```
  NAVEGADOR
  ┌──────────────────────────────────────────────────────────┐
  │  features/ y components/                                 │
  │  Solo props y hooks. NUNCA importan `supabase`.          │
  ├──────────────────────────────────────────────────────────┤
  │  src/hooks/*.ts   — TanStack Query                       │
  │  Única capa que habla con la base. Cache, invalidación,   │
  │  estado optimista, cola offline.                         │
  └───────────────────────────┬──────────────────────────────┘
                              │ supabase-js  (JWT del usuario)
                              ▼
  ┌──────────────────────────────────────────────────────────┐
  │  PostgREST      /rest/v1/<tabla>      /rest/v1/rpc/<fn>  │
  └───────────────────────────┬──────────────────────────────┘
                              ▼
  POSTGRES
  ┌──────────────────────────────────────────────────────────┐
  │  RLS       qué filas existen para ti                     │
  │            tenant_id = auth_tenant_id()                  │
  │  TRIGGERS  invariantes que el cliente no puede saltarse   │
  │            topes de plan, consistencia, campos inmutables │
  │  RPC       casos de uso que no caben en un SELECT         │
  │            setup_tenant, accept_invite, admin_*           │
  └───────────────────────────▲──────────────────────────────┘
                              │ service_role
  ┌──────────────────────────────────────────────────────────┐
  │  EDGE FUNCTIONS (Deno) — correo, terceros, secretos       │
  └──────────────────────────────────────────────────────────┘
```

Cuatro decisiones lo explican casi todo:

1. **La lógica vive en la base.** Los topes de plan, la consistencia entre tablas
   y los campos inmutables son triggers y funciones `security definer`, no
   validaciones del formulario. El cliente es sustituible: alguien puede llamar a
   PostgREST con `curl` y la anon key. Si la regla no está en Postgres, no existe.
2. **Aislamiento por fila, no por conexión.** Un solo Postgres, un solo esquema;
   `tenant_id` en cada tabla y una política RLS idéntica en todas
   (`tenant_id = auth_tenant_id()`). No hay "base por cliente" ni un `WHERE` que
   se te pueda olvidar en una consulta.
3. **Las Edge Functions son la válvula de escape,** no la capa de negocio. Solo
   se usan para lo que Postgres no puede hacer: hablar con terceros y guardar
   secretos. Hoy solo hay una (`welcome`).
4. **La frontera de confianza es el prefijo `VITE_`.** Todo lo que lo lleva acaba
   dentro de `dist/` y es público — la anon key incluida, que es pública por
   diseño porque sin RLS no protegería nada. Los secretos de verdad viven en
   `supabase secrets set` y solo los ven las Edge Functions.

---

## 4. Añadir una tabla al dominio

Cinco pasos, en este orden. El molde vivo es cualquier tabla de 0013–0017.

1. **Migración nueva** (`0019_…sql`), con `tenant_id uuid not null default
   public.auth_tenant_id() references public.tenants(id) on delete cascade`,
   `constraint …_tenant_id_key unique (tenant_id, id)` y FKs compuestas
   `(tenant_id, x_id)` hacia sus padres. Luego, en una línea:

   ```sql
   select public.setup_tenant_table('mi_tabla', 'true', 'public.auth_can_manage_students()');
   ```

   Eso deja RLS por tenant con el predicado de rol de lectura y de escritura,
   `revoke` a `anon`, lectura del super-admin, `enforce_tenant_row`, bloqueo por
   suspensión y `updated_at`.
2. **Purga:** añade la tabla, en orden hijo→padre, a `admin_delete_tenant`
   (versión vigente en 0018). Con FKs `restrict`, una tabla fuera de sitio deja
   el colegio inborrable.
3. **Test:** amplía `supabase/tests/isolation.test.mjs` y pasa `npm run test:db`.
4. **Tipo** en `src/types/db.ts` (snake_case, igual que la columna) y **hook** en
   `src/hooks/<área>.ts`: `if (error) throw error` en cada llamada, sin
   `tenant_id` en filtros ni escrituras, e invalidar todo lo que la mutación deja
   desfasado (casi siempre también `['dashboard']`).
5. **Pantalla** en `src/features/<área>/` con las primitivas de
   `src/components/ui/`, ruta en `src/App.tsx` y entrada en `NAV` de
   `src/components/Layout.tsx` (con `permission` si no es para todo el colegio).
   Regla móvil: tabla en `lg:` y `DataList`/`ActionMenu` abajo, revisado a 360 px.

---

## 5. El primer super-admin

El panel `/admin` (ver todos los colegios, cambiar planes, suspender, borrar) lo
abre quien esté en `platform_admins` (el equipo de ArreSchool, no los colegios). Esa tabla **no se puede escribir desde el
cliente** —RLS sin políticas de escritura— y la RPC que da de alta a los demás
exige ya ser super-admin. Al primero hay que darlo de alta desde fuera:

1. Crea la cuenta en **Auth → Users → Add user** (marca *Auto Confirm User*) o
   regístrate por la app **sin crear colegio**.
2. Abre `scripts/grant-platform-admin.sql`, cambia el correo y ejecútalo en el
   **SQL Editor** de Supabase. Es idempotente y trae dos consultas de
   verificación.

> Un super-admin **no puede tener colegio**. Las políticas de lectura
> cross-tenant exigen `auth_is_platform_admin() and auth_tenant_id() is null`: con
> `tenant_id`, el panel se queda ciego. Usa una cuenta aparte de la que uses como
> cliente.

---

## 6. Despliegue

El repo trae los dos destinos listos.

| | GitHub Pages | Vercel / Netlify |
|---|---|---|
| Archivo | `.github/workflows/deploy.yml` | `vercel.json` |
| `VITE_BASE` | `/mi-repo/` en *project page*; `/` en dominio propio o *user page* | `/` |
| `VITE_ROUTER` | vacío → **HashRouter** | `browser` → URLs limpias |
| URL | `…/#/estudiantes` | `…/estudiantes` |

**`VITE_BASE`, `VITE_ROUTER` y el dominio se cortan juntos.** Los dos errores que
dejan la app en blanco o en 404:

- `VITE_BASE=/mi-repo/` con un dominio propio: los `<script>` apuntan a
  `/mi-repo/assets/…`, que ahí no existe. Pantalla en blanco, sin error visible.
- `VITE_ROUTER=browser` en GitHub Pages: la portada carga, pero recargar en
  `/estudiantes` devuelve el 404 de Pages. Pages no sabe reescribir a `index.html`;
  por eso el HashRouter es el valor por defecto.

En Pages: **Settings → Pages → Source: GitHub Actions**, y los `VITE_*` como
*secrets* del repositorio (son públicos igual; van ahí solo para no fijar tu
proyecto Supabase en el código).

Y en los dos casos, añade el origen desplegado a `additional_redirect_urls` de
`supabase/config.toml` y haz `supabase config push`.

---

## 7. Variables de entorno

**Frontend** — `.env`, prefijo `VITE_`, **acaban dentro de `dist/` y son públicas**:

| Variable | Obligatoria | Para qué |
|---|---|---|
| `VITE_SUPABASE_URL` | sí | Project URL de Supabase |
| `VITE_SUPABASE_ANON_KEY` | sí | Clave `anon` (pública por diseño; **nunca** la `service_role`) |
| `VITE_APP_NAME` | no | Nombre visible; si falta, el de `src/lib/constants.ts` |
| `VITE_PUBLIC_URL` | recomendada | URL del sitio desplegado, para los enlaces que salen de la app |
| `VITE_BASE` | no | Prefijo del build. Por defecto `/` |
| `VITE_ROUTER` | no | `browser` para URLs limpias; vacío = HashRouter |

**Servidor** — `supabase secrets set …`, nunca con prefijo `VITE_`:

| Variable | Para qué |
|---|---|
| `RESEND_API_KEY` | Envío del correo de bienvenida. Sin ella la función responde `{ sent: false }` y el registro sigue funcionando |
| `WELCOME_FROM` | Remitente de ese correo, formato `ArreSchool <hola@tudominio.com>`. **Ponla en producción:** el valor por defecto es `ArreSchool <onboarding@resend.dev>`, el remitente de pruebas de Resend, que **solo entrega a la dirección dueña de la cuenta** — a cualquier otra falla, y la función traga el error y responde 200 |
| `PUBLIC_SITE_URL` | Dominio que enlaza ese correo |
| `SMTP_PASSWORD` | Correos de autenticación. Se pasa **al `config push`**, no a `secrets set` |

> El dominio de `WELCOME_FROM` tiene que estar **verificado en Resend**
> (*Domains → Add domain* y sus registros DNS). Sirve el mismo remitente que uses
> para el SMTP de autenticación.

> ⚠️ Nunca hagas `supabase config push` sin `SMTP_PASSWORD` (ni sin las dos
> variables de Google si lo tienes activo) en el entorno: el push sincroniza el
> archivo completo y dejaría esas credenciales vacías, tumbando todos los correos
> de autenticación.

---

## 8. Trampas ya pagadas

Están en `ARQUITECTURA.md` §12 con detalle. El resumen y el porqué:

1. **`clsx` tiene que ir en el chunk `vendor`** (`vite.config.ts` → `manualChunks`).
   Si cae en un chunk que el service worker no precachea, la app no llega ni a
   montar React: pantalla en blanco, sin error en pantalla.
2. **Los chunks *lazy* van con `CacheFirst`.** Tras un deploy, el `index.html`
   cacheado pide chunks que ya no existen. Mitigado además por `lazyWithRetry`
   (una recarga, una sola vez, con guard en `sessionStorage`) y el `ErrorBoundary`.
3. **Inputs a 16 px en móvil** (`src/index.css`, con `!important`). Por debajo,
   iOS hace zoom al enfocar y no vuelve. El `!important` es obligatorio: en
   Tailwind 3 la clase `text-sm` gana al selector de elemento. Y **nunca**
   `maximum-scale=1`: rompe la accesibilidad.
4. **`base` y dominio se cortan juntos** — ver §6.
5. **`statement_timeout`**: PostgREST lo hoistea y `authenticated` trae 8 s. Una
   RPC pesada (la purga de un colegio) fija su propio `set local statement_timeout`
   dentro de la función, o muere a mitad.
6. **Storage no se borra por SQL.** Borrar la fila deja el blob huérfano
   ocupando espacio para siempre. `admin_delete_tenant` devuelve las rutas y el
   cliente las vacía con la API (`removeTenantFiles`).
7. **Los triggers que reaccionan al DELETE rompen una purga**: un colegio
   suspendido no se podría borrar. De ahí la marca de transacción
   `arreschool.purging_tenant`.
8. **Tabla nueva ⇒ `revoke` explícito** — ver §4.2.
9. **No cambies el `buster` del persister** (`arreschool-v1`, en `src/main.tsx`) en
   un deploy: descarta la cola de mutaciones offline **sin subirla**.
10. **El guard de sesión de la cola offline va DENTRO del `mutationFn`**
    (`src/lib/offline.ts`). `QueryClient.mount()` se suscribe por su cuenta a
    `focusManager` y `onlineManager` y llama a `resumePausedMutations()`, que
    reanuda TODA la cola sin mirar quién está conectado: cualquier comprobación
    puesta fuera se la salta la propia librería. El camino de ejecución de la
    mutación es el único punto que no se puede esquivar.

---

## 9. Lo que no trae

| Falta | Dónde encajaría |
|---|---|
| **Pasarela de pago** | Edge Function + tabla de órdenes. El precio lo fija el servidor, acreditar tiene que ser idempotente y el webhook verificar la firma contra el cuerpo crudo. `plan_requests` es el hueco: hoy el super-admin aprueba a mano |
| **Tests de interfaz** | Vitest + Testing Library para hooks y pantallas. La base sí tiene test (`npm run test:db`: aislamiento, roles, finanzas, cierre de año y purga) |
| **ArreSchool Family** | Portal de familias: `guardians.user_id` ya existe; faltan el rol y las políticas de lectura por hijo |
| **i18n** | Todos los textos están en el JSX en español. Extraerlos a `react-intl`/`i18next` es mecánico pero toca cada pantalla |
| **Realtime** | `supabase.channel()` en la capa de hooks, invalidando la clave de cache correspondiente. Nunca en un componente |
| **Búsqueda y paginación de servidor** | Estudiantes y familias se paginan en el cliente (caben en memoria y funciona sin conexión); cargos y pagos ya filtran en el servidor. Con colegios grandes, `range()` + índices |
| **Borrado de la propia cuenta por el usuario** | Existe `admin_delete_tenant` para el super-admin; falta el equivalente auto-servicio |

---

## 10. Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | `tsc -b` + build a `dist/` |
| `npm run lint` | Solo tipos (`tsc -b --noEmit`) |
| `npm run icons` | Íconos PWA y favicon desde `public/logo.png` |
| `npm run test:db` | Migraciones en Postgres en memoria (PGlite) + test de aislamiento entre colegios, roles y finanzas |
| `npm run db:check` | Solo comprueba que todas las migraciones aplican |
| `npm run preview` | Sirve el `dist/` ya construido |
| `npm run db:push` | `supabase db push` — migraciones al proyecto enlazado |
| `npm run db:start` | `supabase start` — Supabase local con Docker |
| `npm run db:reset` | `supabase db reset` — recrea la base local desde cero |
| `npm run types:gen` | Tipos de la base local a `src/types/supabase.ts`. Solo de consulta: `src/types/db.ts`, el que importa la app, se escribe a mano |
| `supabase functions deploy welcome` | Despliega la Edge Function |

---

Documentación complementaria: **`ARQUITECTURA.md`** (el contrato: nombres de
tablas, firmas de RPC, claves de cache) y **`CLAUDE.md`** (convenciones para
trabajar en este repo).
