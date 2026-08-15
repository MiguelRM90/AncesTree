/**
 * Spanish UI strings.
 *
 * Same shape as en.js, key for key. The archive itself is written in whatever
 * language the family used — this only translates the application around it.
 */

export const es = {
  app: {
    name: 'AncesTree',
    tagline: 'Un árbol genealógico que vive en tu propio ordenador.',
  },

  unsupported: {
    title: 'Este navegador no está soportado',
    body:
      'AncesTree guarda tu archivo familiar en una carpeta de tu propio disco, usando la File System Access API. ' +
      'Esa API solo existe en navegadores de escritorio basados en Chromium.',
    supported: 'Usa Chrome, Edge, Opera, Brave o Vivaldi en un ordenador de escritorio.',
    missing: 'Funciones que faltan:',
    fileProtocol:
      'AncesTree no puede ejecutarse desde una URL file://. Sírvelo por http(s) o instálalo como aplicación.',
  },

  welcome: {
    newProject: 'Nueva familia',
    openProject: 'Abrir una carpeta',
    importArchive: 'Importar un ZIP',
    reopen: 'Reabrir',
    pickFolderHint: 'Elige una carpeta vacía. AncesTree creará dentro los archivos del proyecto.',
    defaultName: 'Mi familia',
    deniedFolder: 'No se concedió permiso sobre esa carpeta.',
    missingFolder: 'Esa carpeta ya no está disponible. Vuelve a elegirla.',
  },

  tree: {
    empty: 'Todavía no hay nadie.',
    addFirstPerson: 'Añadir la primera persona',
    focusHint: 'Haz clic en una persona para centrar el árbol en ella. Otro clic para editarla.',
    pinUnion: (couple) => `Mantener resaltados los hijos de ${couple}`,
    saving: 'Guardando…',
    saved: 'Guardado',
    saveError: 'No se pudo guardar. Comprueba que la carpeta siga disponible.',
  },

  toolbar: {
    edit: 'Editar',
    addParent: 'Añadir progenitor',
    addPartner: 'Añadir pareja',
    addChild: 'Añadir hijo',
    addPerson: 'Añadir persona',
    // Etiquetas de los dos menús en los que la barra agrupa sus acciones.
    add: 'Añadir',
    transfer: 'Importar y exportar',
    undo: 'Deshacer',
    redo: 'Rehacer',
    exportZip: 'Exportar ZIP',
    importZip: 'Importar ZIP',
    exportGedcom: 'Exportar GEDCOM',
    importGedcom: 'Importar GEDCOM',
    review: 'Revisar',
    back: 'Atrás',
    backTo: 'Volver a la persona anterior',
    ancestors: 'Arriba',
    descendants: 'Abajo',
    centredOn: 'Centrado en',
    generationsUp: 'Generaciones mostradas por encima de la persona central',
    generationsDown: 'Generaciones mostradas por debajo de la persona central',
    language: 'Idioma',
  },

  archive: {
    exporting: 'Escribiendo el archivo…',
    exported: (n) => `Archivo escrito · ${n} ficheros`,
    importTitle: 'Importar archivo',
    summary: (c) => `${c.persons} personas · ${c.unions} uniones · ${c.media} medios · ${c.files} ficheros`,
    unnamedArchive: 'Archivo sin título',
    chooseStrategy: '¿Cómo hay que incorporar este archivo?',
    mergeHere: 'Fusionar con esta familia',
    mergeHint:
      'Añade lo que falte, cotejando por id. Lo que ya está aquí conserva la versión local.',
    openAsNew: 'Abrir como familia nueva',
    openAsNewHint: 'Se extrae en una carpeta vacía que elijas. No se toca nada de lo existente.',
    merged: (added) =>
      `Importado · ${added.persons} personas, ${added.unions} uniones y ${added.media} medios añadidos`,
    imported: 'Archivo importado',
    damaged: (n) => `${n} ${n === 1 ? 'fichero estaba dañado' : 'ficheros estaban dañados'} y pueden estar incompletos`,
    gedcomWritten: (n) => `GEDCOM escrito · ${n} personas`,
    gedcomLossy: 'GEDCOM no puede con todo lo que registra esta aplicación. El ZIP es la copia fiel.',
    gedcomRead: (c) => `Importadas ${c.persons} personas y ${c.unions} uniones`,
    gedcomWarnings: (n) => `${n} ${n === 1 ? 'línea no se entendió' : 'líneas no se entendieron'}`,
    gedcomEncoding: (enc) =>
      `Codificación declarada ${enc}: los caracteres acentuados pueden haberse aproximado.`,
    gedcomPhotos: 'Un GEDCOM no lleva fotografías, solo las referencias a ellas.',
  },

  editor: {
    title: 'Editar persona',
    firstName: 'Nombre',
    lastName: 'Primer apellido',
    secondLastName: 'Segundo apellido',
    sex: 'Sexo',
    nationality: 'Nacionalidad',
    noNationality: 'Sin registrar',
    birth: 'Nacimiento',
    death: 'Defunción',
    place: 'Lugar',
    notes: 'Notas',
    save: 'Guardar',
    cancel: 'Cancelar',
    remove: 'Eliminar persona',
    confirmRemove: '¿Eliminar a esta persona y todos sus vínculos?',
    materialise:
      'Esto es un hueco por una persona desconocida. Al ponerle nombre pasa a ser real.',
    year: 'Año',
    rangeSeparator: 'y',
    review: 'Revisión',
    noIssues: 'Nada que señalar.',
    showPerson: (name) => `Centrar el árbol en ${name}`,
    photos: 'Fotos',
    addPhotos: 'Añadir fotos',
    noPhotos: 'Todavía no hay fotos.',
    portrait: 'Retrato',
    makePortrait: 'Usar como retrato',
    removePhoto: 'Quitar la foto',
    photoOf: (name) => `Foto de ${name}`,
    exifStripped: 'La ubicación y los datos de cámara se eliminan de las fotos al añadirlas.',
    photosAdded: (n) => `${n} ${n === 1 ? 'foto añadida' : 'fotos añadidas'}`,
    photosReused: (n) => `${n} ya estaban en este archivo`,
    photosFailed: (n) => `${n} no se pudieron leer`,
    dateHint: '12 MAY 1912 · ABT 1885 · BET 1900 AND 1905',
    dateUnrecognised: 'Se conserva tal cual, pero no se entiende como fecha.',
  },

  dateMode: {
    UNKNOWN: 'Desconocida',
    EXACT: 'Fecha exacta',
    MONTH: 'Mes y año',
    YEAR: 'Solo el año',
    ABOUT: 'Hacia un año (ABT)',
    ESTIMATED: 'Estimada (EST)',
    BEFORE: 'Antes de un año (BEF)',
    AFTER: 'Después de un año (AFT)',
    BETWEEN: 'Entre dos años (BET)',
    RAW: 'Texto GEDCOM',
  },

  card: {
    issues: (n) => `${n} ${n === 1 ? 'aviso' : 'avisos'} sobre esta persona`,
    hasNote: 'Tiene una nota escrita',
  },

  notice: {
    dismiss: 'Descartar',
    changeRejected: 'Ese cambio no se guardó',
    changeRejectedDetail: 'Dejaría el árbol en un estado imposible.',
  },

  review: {
    title: 'Revisar el archivo',
    all: 'Todo',
    errors: 'Errores',
    warnings: 'Advertencias',
    notes: 'Notas',
    nothing: 'Nada que revisar aquí.',
    more: (n) => `…y ${n} más.`,
    close: 'Cerrar',
  },

  search: {
    label: 'Buscar una persona',
    placeholder: 'Buscar…',
    noResults: 'Nadie con ese nombre.',
  },

  a11y: {
    tree: 'Árbol genealógico',
    treeHint: 'Usa las flechas para moverte entre personas. Pulsa Intro para centrar el árbol.',
    toolbar: 'Acciones de la familia',
    dateKind: 'Tipo de fecha',
    notifications: 'Notificaciones',
  },

  sex: {
    M: 'Hombre',
    F: 'Mujer',
    U: 'Desconocido',
    X: 'Otro',
  },

  validation: {
    selfParent: 'Una persona no puede ser progenitora de sí misma.',
    selfUnion: 'Una unión necesita dos personas distintas.',
    cycle: 'Este vínculo crearía un bucle en el árbol.',
    duplicateEdge: 'Este vínculo progenitor-hijo ya existe.',
    tooManyBiologicalParents: 'Una persona no puede tener más de dos progenitores biológicos.',
    danglingRef: 'Este registro apunta a algo que ya no existe.',
    deathBeforeBirth: 'La fecha de defunción es anterior a la de nacimiento.',
    implausibleLifespan: 'Más de 120 años de vida: revisa las fechas.',
    parentBornAfterChild: 'Este progenitor nació después que su hijo.',
    parentTooYoung: 'Este progenitor habría sido muy joven.',
    parentTooOld: 'Esta madre habría tenido una edad inusual.',
    childAfterMotherDeath: 'Este hijo nació después de morir su madre.',
    childLongAfterFatherDeath: 'Este hijo nació mucho después de morir su padre.',
    unionEndBeforeStart: 'La unión termina antes de empezar.',
    unionAfterDeath: 'Esta unión empieza después de morir uno de los dos.',
    unionBeforeBirth: 'Esta unión empieza antes de nacer uno de los dos.',
    unionTooYoung: 'Uno de los dos habría sido muy joven.',
    consanguineousUnion: 'Esta pareja comparte un ancestro.',
    commonAncestor: (name, generations) =>
      `Ancestro común: ${name}${generations ? `, ${generations} generaciones atrás` : ''}.`,
    siblingAsParent: 'Alguien figura como progenitor de su propio hermano.',
    missingBirthDate: 'Sin fecha de nacimiento.',
    missingSurname: 'Sin apellido.',
    missingSex: 'Sexo sin registrar.',
    orphanPerson: 'Sin ningún vínculo con nadie más.',
    livingPersonNoDeath: 'Nació hace más de 120 años y no consta su defunción.',
  },
};
