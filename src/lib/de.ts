/**
 * All user-visible texts (German). Code, identifiers and comments are English.
 * Keeping texts here makes a later translation a matter of adding a second file.
 */
export const de = {
  appName: "PhotoFinance",
  nav: {
    overview: "Übersicht",
    finance: "Finanzen",
    jobs: "Jobplanung",
    equipment: "Equipment",
    rentals: "Leihen",
    settings: "Einstellungen",
  },
  common: {
    loading: "Wird geladen …",
    error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    signOut: "Abmelden",
    notAvailableYet: "Dieser Bereich ist noch nicht verfügbar.",
    notAvailableHint: "Die Datenbank dafür ist bereits vorbereitet. Die Oberfläche folgt in einer der nächsten Phasen.",
  },
  config: {
    missingTitle: "Konfiguration fehlt",
    missingText:
      "VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY sind nicht gesetzt. Lege eine Datei .env.local an (siehe .env.example).",
  },
  auth: {
    loginTitle: "Anmelden",
    registerTitle: "Registrieren",
    resetTitle: "Neues Passwort festlegen",
    forgotTitle: "Passwort festlegen oder zurücksetzen",
    email: "E-Mail-Adresse",
    password: "Passwort",
    newPassword: "Neues Passwort",
    fullName: "Vor- und Nachname",
    submitLogin: "Anmelden",
    submitRegister: "Registrierung anfordern",
    submitReset: "Passwort speichern",
    submitForgot: "Link senden",
    toRegister: "Noch kein Konto? Registrieren",
    toLogin: "Bereits registriert? Anmelden",
    toForgot: "Passwort vergessen oder noch nicht gesetzt?",
    registerHint:
      "Gib deinen echten Namen und deine E-Mail-Adresse an. Wir senden dir einen Bestätigungslink. Danach prüft ein Administrator deine Anfrage.",
    registerSent: "Fast geschafft: Wir haben dir einen Link per E-Mail geschickt. Öffne ihn, um deine Adresse zu bestätigen.",
    forgotSent: "Wenn ein Konto mit dieser Adresse existiert, ist ein Link zum Festlegen des Passworts unterwegs.",
    resetDone: "Dein Passwort wurde gespeichert.",
    invalidCredentials: "E-Mail-Adresse oder Passwort stimmen nicht.",
    nameRequired: "Bitte gib deinen Vor- und Nachnamen an.",
    emailInvalid: "Bitte gib eine gültige E-Mail-Adresse an.",
    passwordTooShort: "Das Passwort muss mindestens 10 Zeichen lang sein.",
    pendingTitle: "Freigabe ausstehend",
    pendingText:
      "Dein Konto wurde angelegt und wartet auf die Freigabe durch einen Administrator. Sobald es freigeschaltet ist, kannst du die App nutzen.",
    blockedTitle: "Zugang gesperrt",
    blockedText: "Dein Zugang wurde gesperrt. Bitte wende dich an den Administrator.",
    recheck: "Status erneut prüfen",
  },
  overview: {
    title: "Übersicht",
    intro: "Termine, Gesamtbudget, Monatsbilanz und Finanzdiagramm folgen in den nächsten Phasen.",
  },
} as const;
