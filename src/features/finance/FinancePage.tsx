import { useState, type ComponentType } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { Segmented } from '@/components/ui/Segmented'
import { AccountsTab } from './AccountsTab'
import { ChargesTab } from './ChargesTab'
import { PaymentsTab } from './PaymentsTab'
import { ConceptsTab } from './ConceptsTab'

type Tab = 'cuentas' | 'cargos' | 'pagos' | 'conceptos'

const TABS: { value: Tab; label: string }[] = [
  { value: 'cuentas', label: 'Por cobrar' },
  { value: 'cargos', label: 'Cargos' },
  { value: 'pagos', label: 'Pagos' },
  { value: 'conceptos', label: 'Conceptos' },
]

const TAB_VIEW: Record<Tab, ComponentType> = {
  cuentas: AccountsTab,
  cargos: ChargesTab,
  pagos: PaymentsTab,
  conceptos: ConceptsTab,
}

/**
 * ArreSchool Pay: cuentas por cobrar, cargos, pagos y conceptos.
 *
 * La pestaña viaja en la URL (`?tab=pagos`): el panel enlaza directo a la caja,
 * y volver atrás desde un recibo devuelve a la lista de pagos y no al principio.
 */
export function FinancePage() {
  const [params, setParams] = useSearchParams()
  const fromUrl = params.get('tab') as Tab | null
  const [tab, setTabState] = useState<Tab>(fromUrl && fromUrl in TAB_VIEW ? fromUrl : 'cuentas')

  const setTab = (t: Tab) => {
    setTabState(t)
    setParams({ tab: t }, { replace: true })
  }

  const View = TAB_VIEW[tab]

  return (
    <div>
      <PageHeader title="Finanzas" description="Cargos, cobros y recibos del colegio" />
      <Segmented label="Sección de finanzas" value={tab} onChange={setTab} options={TABS} className="mb-5" />
      <View />
    </div>
  )
}
