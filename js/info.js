/* About · Privacy · Terms · Accessibility · Credits (in Spanish, the app's language).
 * English versions live in the repository: PRIVACY.md and TERMS.md. */
window.LL = window.LL || {};
(function () {
  const { el, $ } = LL.ui;

  const SECTIONS = [
    ['acerca', 'Acerca de'], ['privacidad', 'Privacidad'], ['terminos', 'Términos de uso'],
    ['voces', 'Voces'], ['accesibilidad', 'Accesibilidad'], ['creditos', 'Créditos'],
  ];

  /** '20261029060718' (UTC) → '29/10/26, 1:07 a. m. (20261029060718)' in the school's time zone. */
  function buildLabel(b) {
    const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(b));
    if (!m) return String(b);
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
    return d.toLocaleString('es-US', { timeZone: 'America/Chicago', dateStyle: 'short', timeStyle: 'short' }) + ' (' + b + ')';
  }

  /** 🔊 Which device voice is used for Spanish and English, with buttons to try them (V127). Helps find
   *  out why a tablet is silent in one language: it may have no voice for it, or only an online one. */
  function voicesPanel() {
    const box = el('section.panel.info-section.voices-panel', { id: 'info-voces' }, el('h2', '🔊 Voces de este aparato'));
    const body = el('div', { style: { display: 'grid', gap: '8px' } });
    box.append(body);
    const draw = () => {
      body.replaceChildren();
      const all = ('speechSynthesis' in window) ? speechSynthesis.getVoices() : [];
      if (!('speechSynthesis' in window)) { body.append(el('p.problem-box', 'Este navegador no tiene voz (speechSynthesis).')); return; }
      const es = all.filter((v) => /^es/i.test(v.lang)), en = all.filter((v) => /^en/i.test(v.lang));
      body.append(el('p', 'Este aparato tiene ' + all.length + ' voces: ' + es.length + ' en español y ' + en.length + ' en inglés.'));
      const row = (label, lang, gender) => {
        const plan = LL.ui.voicePlan(lang, gender);
        const v = plan.voice;
        const name = v ? v.name + ' (' + v.lang + (v.localService ? ', sin internet' : ', necesita internet') + ')' : 'ninguna';
        const ok = v && (lang === 'en' ? /^en/i.test(v.lang) : /^es/i.test(v.lang));
        return el('div.voice-row',
          el('span', el('strong', label + ': '), name, ok ? '' : ' ⚠️'),
          el('button.btn.sm.soft', { type: 'button', onclick: () => LL.ui.speak(lang === 'en' ? 'Hello! Select the color red.' : '¡Hola! ¿Cuántos cerditos puedes contar?', lang, gender) }, '▶️ Probar'));
      };
      body.append(row('Español · mujer', 'es', 'female'), row('Español · hombre', 'es', 'male'), row('Inglés · mujer', 'en', 'female'), row('Inglés · hombre', 'en', 'male'));
      if (!es.length) body.append(el('p.problem-box', '⚠️ Este aparato no tiene voces en español. Agrega una en la configuración del sistema (Chromebook: Configuración → Accesibilidad → Texto a voz → Voces).'));
    };
    draw();
    try { speechSynthesis.addEventListener('voiceschanged', () => { if (box.isConnected) draw(); }); } catch { /* no voices */ }
    return box;
  }

  function render(focusId) {
    const c = LL.config;
    const page = $('#screen-info');
    const ul = (...items) => el('ul', items.map((t) => el('li', t)));
    const sec = (id, title, ...body) => el('section.panel.info-section', { id: 'info-' + id, tabindex: '-1', 'aria-labelledby': 'info-h-' + id }, el('h2', { id: 'info-h-' + id }, title), ...body);
    const contactLine = c.contact
      ? el('p', 'Contacto: ', el('strong', c.contact))
      : el('p', 'Si tienes preguntas, habla con el maestro o la escuela que usa esta página' + (c.owner ? ', o con ' + c.owner : '') + '.');

    page.replaceChildren(el('div.tool-page.info-page',
      el('div', el('h1', 'ℹ️ Información'), el('p.lead', 'Little Learners Activities ' + c.version), c.build ? el('p.small.muted.build-line', 'Versión instalada: ' + buildLabel(c.build)) : null),
      el('nav.info-toc', { 'aria-label': 'Secciones' }, SECTIONS.map(([id, label]) => el('a', { href: '#info-' + id, onclick: (e) => { e.preventDefault(); const t = $('#info-' + id); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); t.focus({ preventScroll: true }); } }, label))),

      sec('acerca', 'Acerca de',
        el('p', 'Little Learners Activities es una herramienta gratuita para que maestros de Pre-K creen quizzes con imágenes y sonido, y para que los niños los respondan en una tableta.'),
        c.owner ? el('p', 'Creado por ', el('strong', c.owner), ', maestro bilingüe de Pre-K.') : null,
        el('p', 'No tiene costo y no tiene anuncios. Los maestros pueden usarla con una cuenta (por invitación) para guardar sus actividades en la nube, o sin cuenta en un solo dispositivo.'),
        contactLine,
        // V127: «Usar sin cuenta» left the sign-in page (it confused visitors); it stays here for special cases.
        LL.cloud && LL.cloud.enabled() && !LL.cloud.signedIn() && !LL.auth.localMode()
          ? el('details.local-mode-box',
            el('summary', 'Avanzado: usar sin cuenta en este dispositivo'),
            el('p.small.muted', 'Abre la app vacía, sin tus actividades de la nube. Todo lo que se cree queda solo en este navegador (no va a la base de datos ni a otras tabletas). Para visitantes, usa mejor «Entrar como invitado».'),
            el('button.btn.ghost', { type: 'button', onclick: () => { LL.auth.setLocalMode(true); LL.app.go('students'); } }, 'Usar sin cuenta, solo en este dispositivo'))
          : null),

      voicesPanel(),

      sec('privacidad', 'Política de privacidad',
        el('p.small.muted', 'Última actualización: ' + c.policyUpdated),
        el('h3', 'En pocas palabras'),
        el('p', 'Little Learners no tiene anuncios, no rastrea a nadie y no vende datos. Si el maestro usa una cuenta, sus actividades se guardan en la nube (Supabase) para usarlas en sus tabletas; si no, todo se queda solo en el navegador del dispositivo.'),
        el('h3', 'Qué se guarda'),
        ul('Del maestro (solo si usa una cuenta): su correo electrónico y una contraseña protegida por Supabase.',
          'Los nombres (o apodos) y el animalito de cada estudiante que el maestro agrega.',
          'Las actividades (quizzes y clasificación rápida) y carpetas que crea el maestro: textos, imágenes y audios.',
          'Los resultados de los quizzes: uno por estudiante, por quiz y por mes (aciertos, total, fecha, minutos y qué respondió en cada pregunta). Si el niño repite el quiz en el mismo mes, se guarda solo el último intento.',
          'Un PIN del maestro, guardado cifrado (no se guarda el número).',
          'Los audios de voz natural creados para las preguntas.'),
        el('h3', 'Dónde se guarda'),
        ul('En el dispositivo: en el «almacenamiento local» del navegador, que la página necesita para funcionar y para trabajar sin internet.',
          'En la nube, solo con cuenta: en Supabase (servidores en EE. UU.). Cada maestro solo puede ver y cambiar lo suyo; la base de datos lo impide para todos los demás.'),
        el('h3', 'Qué NO se hace'),
        ul('No hay cuentas para los niños: ellos solo tocan su animalito.',
          'No se usan cookies de seguimiento, anuncios ni analítica.',
          'No se pide ubicación, cámara ni micrófono.',
          'No se vende ni se comparte información para publicidad.'),
        el('h3', 'Servicios externos'),
        ul('Supabase (supabase.com): inicio de sesión y copia en la nube de las actividades del maestro.',
          'ElevenLabs (elevenlabs.io): si el maestro activa la voz natural, el texto de las preguntas y respuestas se envía a ElevenLabs para convertirlo en audio. No se envían los nombres de los estudiantes.',
          'GitHub Pages (si abres la página desde internet): recibe la visita como cualquier sitio web (por ejemplo, la dirección IP).',
          'La voz del dispositivo (cuando no hay voz natural) la da tu navegador; algunas voces en línea pueden enviar el texto leído al proveedor del navegador.'),
        el('h3', 'Niños y escuelas'),
        el('p', 'La página no pide datos a los niños ni les crea cuentas. Para cuidar su privacidad (COPPA y FERPA en EE. UU.):'),
        ul('Usa solo el primer nombre o un apodo.',
          'No escribas datos personales de los niños en las preguntas.',
          'Los archivos de respaldo incluyen los nombres de los estudiantes: guárdalos en un lugar seguro y sigue las reglas de tu escuela.',
          'Si tu escuela necesita un acuerdo de privacidad con los servicios en la nube, consúltalo antes de usar una cuenta.'),
        el('h3', 'Cómo borrar los datos'),
        ul('Este dispositivo: Maestro → «Ajustes» → «Borrar este dispositivo».',
          'La nube: Maestro → «Ajustes» → «Borrar mis datos de la nube» (también se borran los audios de voz).',
          'Para cerrar una cuenta por completo, pídeselo a quien administra la página.'),
        el('h3', 'Cambios'),
        el('p', 'Si esta política cambia, se actualizará la fecha de arriba.'),
        contactLine),

      sec('terminos', 'Términos de uso',
        el('p.small.muted', 'Última actualización: ' + c.policyUpdated),
        ul('La página es gratuita, sin fines comerciales, y se ofrece «tal cual», sin garantías. Haz respaldos con frecuencia; sin cuenta, si se borran los datos del navegador se pierden las actividades.',
          'Las cuentas de maestro son por invitación. Cuida tu contraseña y no la compartas con los estudiantes; usa el PIN en tabletas compartidas.',
          'El maestro es responsable del contenido que agrega. Usa solo imágenes y audios propios, con permiso o de uso libre, y apropiados para niños.',
          'No la uses para guardar información delicada de estudiantes (calificaciones oficiales, datos médicos, direcciones, etc.).',
          'Estos términos pueden cambiar; la fecha de arriba indica la última versión.'),
        el('p.small.muted', 'Estos textos son una guía clara y honesta, no asesoría legal. Si tu escuela o distrito va a usar la página de forma oficial, conviene que la revisen.')),

      sec('accesibilidad', 'Accesibilidad',
        ul('Botones grandes para dedos pequeños y funciona con pantalla táctil, mouse o teclado (Tab, Enter, Escape).',
          'Colores con buen contraste (meta: WCAG 2.1 nivel AA) y texto que se ajusta al tamaño de la pantalla.',
          'Las preguntas y respuestas se pueden escuchar en voz alta.',
          'Respeta la opción del dispositivo de «reducir movimiento».',
          'Límite conocido: «Clasificación rápida» se juega arrastrando tarjetas y no funciona solo con teclado.'),
        contactLine),

      sec('creditos', 'Créditos y licencias',
        ul('Voces naturales creadas con ElevenLabs (elevenlabs.io), en su plan gratuito y para uso no comercial.',
          'Los emojis se muestran con los emojis propios de cada dispositivo (Apple, Google, Microsoft, etc.); la página no incluye archivos de emojis.',
          'El texto usa las fuentes que ya tiene el dispositivo; no se descargan fuentes.',
          'Los sonidos de acierto y error se generan dentro de la página; no son grabaciones de terceros.',
          'Las imágenes y audios de cada quiz los agrega el maestro que lo crea.')),
    ));
    if (focusId) setTimeout(() => { const t = $('#info-' + focusId); if (t) { t.scrollIntoView({ block: 'start' }); t.focus({ preventScroll: true }); } }, 30);
  }

  LL.info = { render, SECTIONS };
})();
