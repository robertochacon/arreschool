import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Store, Ticket } from 'lucide-react'
import { AuthLayout } from './AuthLayout'
import { Field, Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { useToast } from '@/components/ui/toast'
import { errorMessage } from '@/lib/errors'
import { APP_NAME } from '@/lib/constants'
import { cn } from '@/lib/cn'

/**
 * Primeros pasos: la cuenta ya existe pero todavía no tiene colegio.
 *
 * Son los dos únicos caminos que crean un `profile` —la RLS no permite ningún
 * otro—: crear un colegio propio (`setup_tenant`) o entrar en uno ajeno con un
 * código de invitación (`accept_invite`).
 */
export function OnboardingPage() {
  const [mode, setMode] = useState<'create' | 'join'>('create')

  return (
    // Sin «Inicio» y con «Cerrar sesión»: aquí hay sesión pero todavía no hay
    // colegio, así que la app no tiene menú y esta es la única salida.
    <AuthLayout
      backToHome={false}
      showSignOut
      title="Configura tu acceso"
      subtitle="Crea tu colegio o únete a uno con un código"
    >
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        <ModeTab
          active={mode === 'create'}
          onClick={() => setMode('create')}
          icon={<Store className="h-4 w-4" />}
        >
          Crear colegio
        </ModeTab>
        <ModeTab
          active={mode === 'join'}
          onClick={() => setMode('join')}
          icon={<Ticket className="h-4 w-4" />}
        >
          Unirme con código
        </ModeTab>
      </div>

      {mode === 'create' ? <CreateForm /> : <JoinForm />}
    </AuthLayout>
  )
}

function ModeTab({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors',
        active ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

const createSchema = z.object({
  name: z.string().trim().min(2, 'Escribe el nombre de tu colegio'),
  fullName: z.string().trim(),
  whatsapp: z.string().trim(),
})

type CreateValues = z.infer<typeof createSchema>

function CreateForm() {
  const navigate = useNavigate()
  const toast = useToast()
  const { user, refresh } = useAuth()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: '',
      // Quien llegó por Google ya dio su nombre: pedirlo otra vez sobra.
      fullName: (user?.user_metadata?.full_name as string | undefined) ?? '',
      whatsapp: '',
    },
  })

  const submit = handleSubmit(async (values) => {
    // `setup_tenant` es idempotente y crea colegio + perfil (owner) +
    // suscripción en una sola transacción: si algo falla, no queda a medias.
    const { error } = await supabase.rpc('setup_tenant', {
      p_name: values.name.trim(),
      p_full_name: values.fullName.trim() || null,
      p_whatsapp: values.whatsapp.trim() || null,
    })
    if (error) {
      toast.error(errorMessage(error, 'No pudimos crear el colegio'))
      return
    }
    // Bienvenida para quien llegó por Google: ahí no hay `signUp` que la dispare
    // (RegisterPage la manda tras crear la cuenta con correo). Este es el momento
    // equivalente —la cuenta pasa a existir de verdad— y además no se repite:
    // por aquí solo se pasa una vez. Sin esperar y sin avisar si falla, igual
    // que en el registro: es cortesía, no un requisito.
    if (user?.app_metadata?.provider === 'google') {
      void supabase.functions.invoke('welcome').catch(() => {})
    }
    // Recarga el contexto ANTES de navegar: el guard de primeros pasos mira
    // `profile.tenant_id` y sin esto rebotaría de vuelta aquí.
    await refresh()
    toast.success(`¡Todo listo! Bienvenida a ${APP_NAME}`)
    navigate('/')
  })

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Nombre de tu colegio" required error={errors.name?.message}>
        <div className="relative">
          <Store className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Ej. Colegio Mis Primeros Pasos" className="pl-9" {...register('name')} />
        </div>
      </Field>
      <Field label="Tu nombre" error={errors.fullName?.message}>
        <Input placeholder="Ej. María Pérez" autoComplete="name" {...register('fullName')} />
      </Field>
      <Field
        label="WhatsApp"
        hint="Con código de país. Ej. 18095551234"
        error={errors.whatsapp?.message}
      >
        <Input inputMode="tel" placeholder="18095551234" {...register('whatsapp')} />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
        Empezar
      </Button>
    </form>
  )
}

const joinSchema = z.object({
  code: z.string().trim().min(6, 'El código no parece completo'),
})

type JoinValues = z.infer<typeof joinSchema>

function JoinForm() {
  const navigate = useNavigate()
  const toast = useToast()
  const { refresh } = useAuth()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<JoinValues>({ resolver: zodResolver(joinSchema), defaultValues: { code: '' } })

  const submit = handleSubmit(async (values) => {
    // El canje es atómico dentro de `accept_invite`: dos personas con el mismo
    // código no pueden entrar las dos, y el error ya viene en español.
    const { error } = await supabase.rpc('accept_invite', { p_code: values.code.trim() })
    if (error) {
      toast.error(errorMessage(error, 'Código inválido o vencido'))
      return
    }
    await refresh()
    toast.success('¡Te uniste al equipo!')
    navigate('/')
  })

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field
        label="Código de invitación"
        required
        hint="Te lo comparte quien administra la cuenta"
        error={errors.code?.message}
      >
        <div className="relative">
          <Ticket className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Ej. a1b2c3d4e5f6"
            autoCapitalize="none"
            spellCheck={false}
            className="pl-9 font-mono"
            {...register('code')}
          />
        </div>
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
        Unirme
      </Button>
    </form>
  )
}
