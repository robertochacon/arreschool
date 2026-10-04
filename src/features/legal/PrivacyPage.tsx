import {
  Bullets,
  DocLink,
  H3,
  LegalDoc,
  Li,
  MailLink,
  Note,
  P,
  Todo,
  type LegalSection,
} from './LegalDoc'
import { APP_NAME, LEGAL_PATHS } from '@/lib/constants'

/**
 * Política de Privacidad pública (ruta `/privacidad`, sin sesión).
 *
 * Está escrita sobre lo que ArreSchool HACE de verdad: cada dato, cada
 * proveedor y cada almacén salieron de leer el esquema (`supabase/migrations`,
 * incluidas las tablas escolares de 0013-0017), las Edge Functions y el cliente.
 * No es una plantilla de relleno.
 *
 * Lo delicado de este producto es que casi todo el contenido son datos de
 * MENORES, algunos de salud. Por eso la sección "menores" no es la cláusula de
 * relleno de siempre ("no es para menores de 18"): explica quién responde por
 * esos datos (el colegio) y qué hace ArreSchool con ellos (encargo).
 *
 * DOS COSAS ANTES DE PUBLICAR:
 *  1. Rellena todos los <Todo> — son los datos de la empresa que opera
 *     ArreSchool, que el código no puede saber. Aparecen resaltados en la propia página para que no se cuelen.
 *  2. Repasa el documento cada vez que cambies algo que toque datos: un campo
 *     nuevo, otro proveedor de correo, una analítica, una pasarela de cobro. Y
 *     mueve la fecha de UPDATED, que es lo que le dice a la gente que esto se
 *     mantiene.
 */
const UPDATED = '[COMPLETAR: fecha de publicación]'

const SECTIONS: LegalSection[] = [
  {
    id: 'responsable',
    title: 'Quién responde por tus datos',
    body: (
      <>
        <P>
          {APP_NAME} lo opera <Todo>razón social de la empresa</Todo>, con{' '}
          <Todo>identificación fiscal</Todo> y domicilio en <Todo>dirección completa</Todo>,{' '}
          <Todo>país</Todo>. Somos el responsable del tratamiento de los datos que se describen
          aquí.
        </P>
        <P>
          Para cualquier asunto relacionado con tus datos personales, escríbenos a <MailLink />.
          Contestamos en un plazo máximo de <Todo>plazo, p. ej. 15 días hábiles</Todo>.
        </P>
      </>
    ),
  },
  {
    id: 'dos-papeles',
    title: 'Dos tipos de datos, dos papeles distintos',
    body: (
      <>
        <P>
          {APP_NAME} es una plataforma que cada colegio usa para administrar su propia
          información. Eso hace que haya dos grupos de datos y que sobre cada uno mande alguien
          distinto:
        </P>
        <Bullets>
          <Li>
            <strong>Los datos de la cuenta y del colegio como cliente.</strong> Quien abre la
            cuenta y su equipo (dirección, secretaría, docentes, finanzas). De esos datos{' '}
            <strong>respondemos nosotros</strong>: los tratamos para prestar el servicio y cobrar
            el plan.
          </Li>
          <Li>
            <strong>Lo que cada colegio guarda dentro.</strong> Los datos de sus estudiantes, de sus
            familias y de su personal, las asistencias, evaluaciones, boletines, cargos y pagos. Ahí{' '}
            <strong>el responsable es el colegio y nosotros solo somos el encargado</strong>:
            guardamos y procesamos siguiendo sus instrucciones, y es el colegio quien decide qué
            anota, para qué y durante cuánto tiempo.
          </Li>
        </Bullets>
        <Note>
          <strong>Si eres madre, padre o tutor</strong> y tus datos o los de tu hijo o hija están en
          {' '}{APP_NAME}, quien responde por ellos es el colegio. Para consultarlos, corregirlos o
          borrarlos, háblale primero al colegio. Si no responde, escríbenos a <MailLink /> y lo
          contactamos.
        </Note>
      </>
    ),
  },
  {
    id: 'que-guardamos',
    title: 'Qué datos guardamos',
    body: (
      <>
        <H3>De la cuenta</H3>
        <Bullets>
          <Li>
            Correo y contraseña. La contraseña se guarda cifrada de forma irreversible: nadie, ni
            nosotros, la puede leer.
          </Li>
          <Li>Nombre y, si la sube, foto de perfil.</Li>
          <Li>
            Si entras con una cuenta de Google, lo que ese proveedor nos devuelve: correo, nombre y
            foto.
          </Li>
          <Li>El plan contratado, su estado y las fechas de inicio y de renovación.</Li>
        </Bullets>

        <H3>Del colegio</H3>
        <Bullets>
          <Li>
            Lo que se escribe en Configuración: nombre, logo, RNC o registro, nombre de quien dirige,
            teléfono, correo, dirección, moneda y el texto al pie de los recibos.
          </Li>
          <Li>Las personas invitadas al equipo y el rol de cada una.</Li>
          <Li>
            La estructura académica: años escolares, cortes de evaluación, grados, secciones y las
            fichas del personal docente (nombre, documento, contacto, especialidad).
          </Li>
        </Bullets>

        <H3>De los estudiantes y sus familias (por encargo del colegio)</H3>
        <Bullets>
          <Li>
            Ficha del estudiante: nombre, matrícula, fecha de nacimiento, sexo, documento de
            identidad, nacionalidad, dirección, foto y observaciones del colegio.
          </Li>
          <Li>
            <strong>Datos de salud</strong> que el colegio decida registrar: tipo de sangre,
            alergias y notas médicas. Existen para que el personal sepa cómo cuidar al niño o la
            niña; son visibles para el equipo del colegio, no para otras familias.
          </Li>
          <Li>
            Documentos que el colegio suba (acta de nacimiento, tarjeta de vacunas, certificados
            médicos, récords de otros colegios).
          </Li>
          <Li>
            Familia: nombre, documento, teléfonos, correo, ocupación, lugar de trabajo y dirección
            de padres, madres y tutores; parentesco, quién puede recoger al estudiante, quién es
            contacto de emergencia y quién responde por los pagos.
          </Li>
          <Li>
            Historial académico: inscripciones por año, sección, asistencia diaria, evaluaciones por
            indicador, observaciones del personal y boletines emitidos.
          </Li>
          <Li>
            Finanzas: cargos (mensualidades, inscripción, materiales…), pagos recibidos, recibos y
            anulaciones con su motivo.
          </Li>
          <Li>Comunicados que el colegio publica para todo el colegio, un grado o una sección.</Li>
          <Li>
            Una bitácora de actividad: qué acción se hizo, sobre qué, quién la hizo y cuándo. Sirve
            para poder revisar un cambio y para investigar un abuso.
          </Li>
          <Li>Los avisos que la aplicación genera y si se leyeron.</Li>
        </Bullets>

        <H3>Archivos</H3>
        <P>
          Hay dos almacenes con reglas distintas. El logo del colegio y la foto de perfil del
          personal van a uno de <strong>lectura pública</strong>: quien tenga la dirección exacta del
          archivo puede verlo, aunque no tenga cuenta. <strong>Las fotos de los estudiantes y sus
          documentos van siempre al almacén privado</strong>, separado por colegio, y solo se abren
          con enlaces que caducan en minutos.
        </P>

        <H3>Datos técnicos</H3>
        <P>
          Como cualquier sitio web, los servidores por los que pasan las peticiones guardan
          registros técnicos (dirección IP, fecha, página solicitada, tipo de navegador) durante un
          tiempo limitado, por seguridad y para diagnosticar fallos.
        </P>

        <H3>Lo que NO hacemos</H3>
        <Bullets>
          <Li>
            No usamos cookies propias, ni analítica, ni píxeles, ni ninguna herramienta de rastreo o
            publicidad.
          </Li>
          <Li>No vendemos ni alquilamos datos a nadie, ni los cedemos para publicidad.</Li>
          <Li>
            No pedimos ni guardamos números de tarjeta. <Todo>
              si añades una pasarela de cobro, descríbela aquí y en los Términos
            </Todo>
          </Li>
        </Bullets>
      </>
    ),
  },
  {
    id: 'para-que',
    title: 'Para qué los usamos',
    body: (
      <Bullets>
        <Li>
          Para prestar el servicio al colegio: guardar su información, generar listas, boletines,
          recibos y reportes, y mostrar el panel.
        </Li>
        <Li>Para dar acceso a la cuenta y protegerla (inicio de sesión, recuperar contraseña).</Li>
        <Li>Para aplicar los topes del plan contratado y gestionar los cambios de plan.</Li>
        <Li>Para dar soporte cuando alguien nos escribe con un problema.</Li>
        <Li>Para detectar y frenar abusos, fraudes y usos que violen los términos.</Li>
        <Li>
          Para enviar correos operativos: bienvenida, restablecer contraseña y avisos importantes
          del servicio. No mandamos publicidad.
        </Li>
        <Li>Para cumplir obligaciones legales, contables y fiscales.</Li>
      </Bullets>
    ),
  },
  {
    id: 'base-legal',
    title: 'Con qué derecho los tratamos',
    body: (
      <>
        <P>Cada uso se apoya en una base distinta:</P>
        <Bullets>
          <Li>
            <strong>La ejecución del contrato</strong> que se forma al aceptar los términos y usar
            la aplicación: sin tratar estos datos, no hay servicio que prestar.
          </Li>
          <Li>
            <strong>Tu consentimiento</strong>, cuando eres tú quien decide escribir un dato que no
            hace falta para el servicio (una foto de perfil, una dirección, una nota libre).
          </Li>
          <Li>
            <strong>Nuestro interés legítimo</strong> en mantener el servicio seguro y libre de
            abusos: la bitácora de actividad y los registros técnicos existen para eso.
          </Li>
          <Li>
            <strong>Obligaciones legales</strong>, contables y fiscales, que nos obligan a conservar
            ciertos datos aunque cierres la cuenta.
          </Li>
        </Bullets>
        <P>
          La norma que nos aplica es <Todo>ley de protección de datos del país de operación</Todo>.
        </P>
      </>
    ),
  },
  {
    id: 'encargados',
    title: 'Con quién los compartimos',
    body: (
      <>
        <P>
          Solo con los proveedores que hacen falta para que la aplicación funcione. Cada uno actúa
          como <strong>encargado del tratamiento</strong>, recibe lo mínimo para su tarea y está
          obligado por contrato a no usarlo para otra cosa:
        </P>
        <Bullets>
          <Li>
            <strong>Supabase</strong> — base de datos, cuentas y archivos. Es donde vive toda la
            información de la aplicación.
          </Li>
          <Li>
            <strong><Todo>proveedor de correo, p. ej. Resend</Todo></strong> — envío de los correos
            del servicio. Recibe la dirección de destino y el contenido del mensaje.
          </Li>
          <Li>
            <strong><Todo>proveedor de hosting, p. ej. Vercel o GitHub Pages</Todo></strong> —
            publicación del sitio. Sus registros guardan la dirección IP y la página solicitada de
            cada visita.
          </Li>
          <Li>
            <strong>Google Fonts</strong> — la tipografía se descarga de los servidores de Google,
            que reciben la dirección IP del visitante en cada carga de página.
          </Li>
          <Li>
            <strong>Google</strong> — solo si eliges entrar con tu cuenta de Google, y únicamente
            para verificar quién eres.
          </Li>
        </Bullets>
        <P>
          También podemos facilitar información si una autoridad competente la exige por vía legal, o
          en el marco de una venta o fusión de la empresa, avisando antes.
        </P>
        <H3>Los servidores pueden estar fuera del país</H3>
        <P>
          Estos proveedores procesan y almacenan la información en centros de datos que pueden estar
          fuera de <Todo>país</Todo>, principalmente en Estados Unidos y Europa. Al usar {APP_NAME}
          {' '}aceptas esa transferencia, que hacemos amparados en los contratos de servicio y las
          cláusulas de protección de cada proveedor.
        </P>
      </>
    ),
  },
  {
    id: 'quien-accede',
    title: 'Quién puede ver los datos dentro de la aplicación',
    body: (
      <>
        <P>
          Cada colegio está aislado del resto: una cuenta nunca ve los datos de otro colegio.{' '}
          <strong>Ese aislamiento lo impone la base de datos</strong>, no la pantalla, así que
          aunque una consulta pidiera datos ajenos no los devolvería.
        </P>
        <P>
          Con una excepción que preferimos decir de frente:{' '}
          <strong>
            el equipo que opera la plataforma dispone de un panel de administración que puede
            consultar la información de cualquier colegio
          </strong>
          , incluidos sus registros. Lo usamos solo para dar soporte, resolver problemas de cobro y
          frenar abusos. Los <strong>códigos de invitación</strong> quedan fuera de ese panel por
          diseño: quien los tuviera podría entrar a una cuenta ajena.
        </P>
        <P>
          Dentro de cada colegio, el acceso depende del <strong>rol</strong> que la Dirección le da
          a cada persona: una docente ve los datos académicos y escribe asistencia y evaluaciones
          solo de sus secciones, pero no ve los cobros; finanzas y secretaría ven las cuentas;
          Dirección y Administración ven todo. Dar y quitar accesos es cosa del colegio.
        </P>
      </>
    ),
  },
  {
    id: 'dispositivo',
    title: 'Cookies y qué se guarda en tu aparato',
    body: (
      <>
        <P>
          <strong>No usamos cookies</strong> de rastreo, de publicidad ni de analítica; tampoco de
          terceros. Lo que sí hacemos es guardar cosas en el almacenamiento del propio navegador,
          porque la aplicación tiene que funcionar sin conexión:
        </P>
        <Bullets>
          <Li>
            <strong>Tu sesión</strong>, para no pedirte la contraseña cada vez que abres la
            aplicación.
          </Li>
          <Li>
            <strong>Una copia de los datos de tu colegio</strong> (incluidas listas de estudiantes),
            para que puedas consultarlos sin señal. Se guarda en claro en el aparato: quien tenga acceso a un teléfono desbloqueado
            puede llegar a ella.
          </Li>
          <Li>
            <strong>Los cambios que registras sin conexión</strong>, en espera de subir cuando
            vuelvas a tener datos.
          </Li>
          <Li>
            <strong>Partes de la aplicación</strong> guardadas por el navegador para que abra rápido
            y siga funcionando sin red.
          </Li>
        </Bullets>
        <Note>
          Al cerrar sesión se borran tu sesión y la copia local de los datos.{' '}
          <strong>Los cambios pendientes de subir se conservan a propósito</strong>: si se borraran,
          se perdería trabajo que ya diste por guardado. Suben la próxima vez que entres con la misma
          cuenta. Para no dejar rastro en un aparato ajeno, cierra sesión y borra los datos del
          navegador.
        </Note>
      </>
    ),
  },
  {
    id: 'cuanto-tiempo',
    title: 'Cuánto tiempo los guardamos',
    body: (
      <>
        <P>
          Mientras la cuenta del colegio exista. No hay borrado automático: los años anteriores
          se conservan porque son el historial académico y contable del colegio, que suele estar
          obligado a guardarlo.
        </P>
        <Bullets>
          <Li>
            <strong>Para eliminar una cuenta y su colegio, escríbenos a <MailLink /></strong> desde
            el correo de la cuenta. Al eliminarla se borran los registros, la bitácora, los avisos y
            los archivos subidos, y no se puede deshacer.
          </Li>
          <Li>
            De ese borrado <strong>conservamos una constancia mínima</strong>: la fecha, el nombre
            del colegio, el correo de quien era su dueño y el número de registros que tenía. Nada
            del contenido. Lo guardamos por obligaciones contables y para prevenir fraudes, durante{' '}
            <Todo>plazo de conservación, p. ej. 5 años</Todo>.
          </Li>
          <Li>
            Los registros técnicos de los servidores se conservan el tiempo que fije cada proveedor,
            normalmente unas pocas semanas.
          </Li>
        </Bullets>
      </>
    ),
  },
  {
    id: 'derechos',
    title: 'Tus derechos',
    body: (
      <>
        <P>Sobre tus datos personales puedes ejercer, sin coste:</P>
        <Bullets>
          <Li>
            <strong>Acceso</strong>: saber qué datos tuyos tenemos y para qué los usamos.
          </Li>
          <Li>
            <strong>Rectificación</strong>: corregir los que estén mal o incompletos.
          </Li>
          <Li>
            <strong>Supresión</strong>: pedir que se borren, con los límites de abajo.
          </Li>
          <Li>
            <strong>Oposición y limitación</strong>: pedir que dejemos de usarlos para un fin
            concreto, o que los congelemos mientras se resuelve una reclamación.
          </Li>
          <Li>
            <strong>Portabilidad</strong>: recibir en un archivo los datos que nos diste.
          </Li>
          <Li>
            <strong>Retirar el consentimiento</strong> cuando fue esa la base, sin que afecte a lo
            hecho antes.
          </Li>
        </Bullets>
        <P>
          <strong>Si tienes cuenta:</strong> gran parte lo puedes hacer tú desde Mi perfil y
          Configuración. Para lo demás, escríbenos a <MailLink /> desde el correo de la cuenta.{' '}
          <strong>Si tus datos están dentro del colegio de otra persona</strong>, pídeselo a ella,
          que es quien decide sobre ellos; si no obtienes respuesta, escríbenos y la contactamos.
        </P>
        <P>
          Hay límites: no podemos borrar lo que estamos obligados a conservar por ley, ni lo que
          dejaría a un colegio sin el historial que necesita frente a terceros. Si crees que no
          atendimos bien tu solicitud, puedes reclamar ante{' '}
          <Todo>autoridad de control competente</Todo>.
        </P>
      </>
    ),
  },
  {
    id: 'seguridad',
    title: 'Cómo los protegemos',
    body: (
      <>
        <Bullets>
          <Li>Todo viaja cifrado por HTTPS y se almacena cifrado en los servidores del proveedor.</Li>
          <Li>
            El aislamiento entre colegios está impuesto en la base de datos: aunque una pantalla
            tuviera un fallo, la consulta no devolvería datos de otro colegio.
          </Li>
          <Li>Las contraseñas se guardan cifradas de forma irreversible; ni nosotros las vemos.</Li>
          <Li>
            Los códigos de invitación caducan solos y se pueden anular en cualquier momento.
          </Li>
          <Li>
            Los archivos privados se sirven con enlaces temporales, no con direcciones permanentes.
          </Li>
        </Bullets>
        <P>
          Aun así, ningún sistema es infalible. Usa una contraseña que no repitas en otros sitios,
          no la compartas y no dejes la sesión abierta en un aparato ajeno. Si sospechas que alguien
          entró a tu cuenta, cámbiala y escríbenos.
        </P>
      </>
    ),
  },
  {
    id: 'menores',
    title: 'Datos de menores de edad',
    body: (
      <>
        <P>
          Las cuentas de {APP_NAME} son para el personal de los colegios, siempre mayor de edad. Pero
          la mayoría de los datos que un colegio guarda son de <strong>sus estudiantes, que son
          menores</strong>. Por eso:
        </P>
        <Bullets>
          <Li>
            <strong>El colegio es el responsable</strong> de esos datos y quien debe contar con la
            autorización de los padres, madres o tutores para registrarlos, incluidos los datos de
            salud y las fotos. Al usar {APP_NAME}, el colegio declara que la tiene.
          </Li>
          <Li>
            <strong>{APP_NAME} solo los trata por encargo</strong> del colegio, para prestarle el
            servicio. No los usamos para nada más, no creamos perfiles de los niños, no los usamos
            para publicidad ni para entrenar sistemas, y no se los damos a nadie fuera de los
            proveedores descritos arriba.
          </Li>
          <Li>
            Las <strong>fotos y documentos</strong> de estudiantes se guardan en almacenamiento
            privado y se abren con enlaces temporales; los <strong>datos de salud</strong> solo los
            ve el equipo del colegio.
          </Li>
          <Li>
            Si eres madre, padre o tutor y quieres acceder, corregir o borrar datos de tu hijo o
            hija, pídeselo al colegio. Si no obtienes respuesta, escríbenos a <MailLink />.
          </Li>
        </Bullets>
      </>
    ),
  },
  {
    id: 'cambios',
    title: 'Cambios en esta política',
    body: (
      <>
        <P>
          Si cambiamos algo, actualizamos la fecha del inicio de esta página. Cuando el cambio sea
          importante —un proveedor nuevo, un uso distinto de los datos— avisamos dentro de la
          aplicación o por correo antes de que entre en vigor.
        </P>
        <P>
          Esta política se complementa con los{' '}
          <DocLink to={LEGAL_PATHS.terms}>Términos del Servicio</DocLink>.
        </P>
      </>
    ),
  },
]

export function PrivacyPage() {
  return (
    <LegalDoc
      title="Política de Privacidad"
      updated={UPDATED}
      lead={
        <>
          Esta página explica, sin rodeos, qué datos guarda {APP_NAME}, para qué, con quién los
          comparte y cómo puedes controlarlos. Está escrita sobre lo que la aplicación hace de
          verdad. Si algo no te queda claro, escríbenos a <MailLink /> y te lo explicamos.
        </>
      }
      sections={SECTIONS}
    />
  )
}
