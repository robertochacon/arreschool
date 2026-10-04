import type { Permission } from '@/lib/permissions'

export interface ManualTopic {
  id: string
  title: string
  description: string
  path: string
  permission?: Permission
  steps: string[]
  tip: string
}

export const MANUAL_TOPICS: ManualTopic[] = [
  {
    id: 'inicio', title: 'Primeros pasos', path: '/',
    description: 'Prepara el colegio y conoce cómo moverte por ArreSchool.',
    steps: [
      'Revisa el nombre y los datos del colegio en Configuración.',
      'Desde Estructura, Dirección prepara el año escolar, los grados, las secciones y los docentes.',
      'Registra a los estudiantes y sus familiares; después realiza sus inscripciones para el año escolar.',
      'Usa el menú lateral para cambiar de módulo. En el celular, abre Más para ver las opciones adicionales.',
    ],
    tip: 'Las opciones disponibles dependen de tu rol. Si necesitas una función que no aparece, consulta a la persona que administra el colegio.',
  },
  {
    id: 'estructura', title: 'Estructura y año escolar', path: '/academico', permission: 'manageAcademics',
    description: 'Organiza los años, grados, secciones y docentes antes de iniciar las clases.',
    steps: [
      'En Estructura → Años, crea el año escolar con sus fechas y actívalo cuando corresponda.',
      'En Grados, registra los niveles que ofrece el colegio y revisa su orden.',
      'En Secciones, crea los grupos del año y asigna su grado, capacidad y docente según corresponda.',
      'En Docentes, registra al personal docente. Revisa también los cortes de evaluación del año.',
    ],
    tip: 'Antes de cerrar un año, revisa las inscripciones y evaluaciones: el cierre impide seguir modificando los registros académicos de ese período.',
  },
  {
    id: 'estudiantes', title: 'Estudiantes y expedientes', path: '/estudiantes',
    description: 'Consulta las fichas de estudiantes y mantén sus datos al día.',
    steps: [
      'Abre Estudiantes y busca a la persona por su nombre o código. Revisa el filtro de estado si no aparece.',
      'Si tienes permiso para gestionar estudiantes, usa la opción de agregar y completa los datos del formulario.',
      'Abre la ficha para consultar sus datos, familiares, documentos e historial.',
      'Revisa los datos antes de guardar una modificación y evita crear una ficha duplicada.',
    ],
    tip: 'Crear la ficha no inscribe automáticamente al estudiante en un año escolar. Ese paso se realiza en Inscripciones.',
  },
  {
    id: 'familias', title: 'Familias y responsables', path: '/familias',
    description: 'Registra los contactos de las familias y su relación con cada estudiante.',
    steps: [
      'En Familias, busca al responsable antes de crear un registro nuevo.',
      'Con permiso de gestión, registra o actualiza sus datos de contacto.',
      'Desde la ficha del estudiante, vincula al familiar e indica su relación y las opciones que correspondan.',
      'Comprueba que el teléfono y el correo estén actualizados para facilitar el contacto con la familia.',
    ],
    tip: 'Un mismo familiar puede estar vinculado a varios estudiantes; reutiliza su registro cuando se trate de hermanos.',
  },
  {
    id: 'inscripciones', title: 'Inscripciones y asignación de sección', path: '/inscripciones', permission: 'manageStudents',
    description: 'Vincula cada estudiante con su año, grado y sección.',
    steps: [
      'En Inscripciones, selecciona el año escolar que vas a trabajar.',
      'Inscribe al estudiante y elige su grado y sección cuando esté disponible.',
      'Revisa las inscripciones sin sección y asigna el grupo correspondiente.',
      'Si cambia la situación del estudiante, actualiza la inscripción con la opción que corresponda, como retiro o repitencia.',
    ],
    tip: 'Si no puedes asignar una sección, revisa su año, grado y capacidad. Los años cerrados no permiten modificar inscripciones.',
  },
  {
    id: 'asistencia', title: 'Pasar y corregir asistencia', path: '/asistencia',
    description: 'Registra la asistencia diaria de los estudiantes de una sección.',
    steps: [
      'Abre Asistencia y selecciona la sección y el día.',
      'Marca a cada estudiante: presente, ausente, tardanza o excusa. Puedes marcar a todos como presentes y luego corregir las excepciones.',
      'Agrega una nota cuando necesites explicar una ausencia u otra situación.',
      'Pulsa Guardar. Para corregir un registro, vuelve a la misma sección y fecha, ajusta la marca y guarda otra vez.',
    ],
    tip: 'Si la lista está vacía, revisa las inscripciones activas y la asignación de sección. Si eres docente y no ves tu grupo, pide a Dirección que revise tu asignación.',
  },
  {
    id: 'evaluaciones', title: 'Evaluaciones y boletines', path: '/evaluaciones',
    description: 'Evalúa los indicadores de cada estudiante y consulta sus boletines.',
    steps: [
      'Abre Evaluaciones y selecciona la sección y el corte del año en curso.',
      'En Calificar, abre al estudiante y completa la evaluación de los indicadores disponibles.',
      'Guarda los cambios y revisa el avance de la lista para identificar evaluaciones pendientes.',
      'En Boletines, genera los boletines si todavía no existen. Abre el del estudiante con Ver o Ver e imprimir y utiliza su opción de impresión cuando lo necesites.',
    ],
    tip: 'Las competencias e indicadores deben estar preparados para el grado. Si faltan o el corte está cerrado, consulta a Dirección.',
  },
  {
    id: 'finanzas', title: 'Cargos, pagos y recibos', path: '/finanzas', permission: 'handleFinance',
    description: 'Consulta deudas, registra cobros y entrega recibos a las familias.',
    steps: [
      'En Finanzas → Por cobrar, consulta los estudiantes con saldo pendiente y abre su cuenta.',
      'En Cargos, revisa los conceptos cobrados, sus montos y fechas de vencimiento; crea el cargo cuando corresponda.',
      'Registra el pago del estudiante, verificando monto, fecha, forma de pago y los cargos a los que se aplica.',
      'En Pagos, consulta el cobro registrado y abre su recibo para imprimirlo.',
    ],
    tip: 'Los conceptos, la generación masiva y las anulaciones requieren permisos de gestión financiera. Revisa los datos antes de confirmar un cobro.',
  },
  {
    id: 'comunicados', title: 'Comunicados del colegio', path: '/comunicados',
    description: 'Consulta avisos y publica información para la audiencia correspondiente.',
    steps: [
      'Abre Comunicados para consultar los avisos disponibles para tu cuenta.',
      'Si tienes habilitada la publicación, crea un comunicado con un título claro y su contenido.',
      'Selecciona la audiencia disponible: todo el colegio, un grado o una sección, según tus permisos.',
      'Revisa el contenido y la audiencia antes de publicar.',
    ],
    tip: 'Una cuenta docente publica para sus secciones. Dirección y Secretaría pueden gestionar comunicados con un alcance mayor.',
  },
  {
    id: 'reportes', title: 'Reportes, exportación y PDF', path: '/reportes',
    description: 'Genera resúmenes y reportes detallados de asistencia, matrícula y finanzas.',
    steps: [
      'Abre Reportes y elige Asistencia, Matrícula, Ingresos o Por cobrar. Las pestañas financieras aparecen según tus permisos.',
      'Selecciona las fechas y la sección para asistencia, el año escolar para matrícula o el rango de fechas para ingresos. Por cobrar muestra los cargos pendientes actuales.',
      'Pulsa Generar reporte detallado para consultar los registros individuales del filtro seleccionado.',
      'Pulsa Exportar CSV (Excel) para descargar el detalle y abrirlo en una hoja de cálculo.',
      'Para guardar el detalle en PDF, genéralo primero, pulsa Imprimir / PDF y selecciona Guardar como PDF en el diálogo del navegador.',
    ],
    tip: 'El detalle de matrícula incluye todos los estados de inscripción; ingresos incluye pagos válidos. Si no hay registros, revisa los filtros y confirma que existen datos para ese período.',
  },
  {
    id: 'configuracion', title: 'Configuración y equipo', path: '/configuracion',
    description: 'Consulta los datos del colegio, el plan y las personas que tienen acceso.',
    steps: [
      'Abre Configuración para consultar los datos del colegio y su plan.',
      'Si tu rol lo permite, actualiza los datos de contacto, la moneda y la información que aparece en recibos y boletines.',
      'La cuenta dueña del colegio puede gestionar el equipo, elegir roles y crear invitaciones.',
      'Comparte el código de invitación con la persona correspondiente y revisa su rol antes de darle acceso.',
    ],
    tip: 'Los permisos dependen del rol de cada persona. La cuenta dueña administra los accesos del equipo.',
  },
  {
    id: 'ayuda', title: 'Mi cuenta y dudas frecuentes', path: '/perfil',
    description: 'Encuentra tu perfil y resuelve situaciones comunes al trabajar.',
    steps: [
      'Pulsa tu avatar en la cabecera y abre Mi perfil para revisar tu cuenta.',
      'Si no encuentras un estudiante o un registro, revisa primero los filtros de estado, año, sección y fecha.',
      'Si falta una opción o aparece una restricción, consulta con la persona que administra el colegio para revisar tu rol.',
      'Si hay un error de conexión, revisa el aviso de la plataforma y vuelve a intentar cuando tengas conexión. Comprueba el resultado antes de repetir un pago.',
      'Al terminar en un dispositivo compartido, abre el menú de tu avatar y pulsa Cerrar sesión.',
    ],
    tip: 'Puedes volver a este manual desde Colegio → Manual de usuario o desde Más en el celular. Busca por palabras como matrícula, recibo o asistencia.',
  },
]

export function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim()
}
