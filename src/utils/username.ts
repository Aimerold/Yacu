export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

/** Même normalisation que celle déjà utilisée à l'inscription. */
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

/** Retourne le message d'erreur, ou null lorsque le username est valide. */
export function validateUsername(value: string): string | null {
  const username = normalizeUsername(value);

  if (!username) {
    return "Saisis un nom d'utilisateur.";
  }

  if (username.length < USERNAME_MIN_LENGTH) {
    return `Le nom d'utilisateur doit contenir au moins ${USERNAME_MIN_LENGTH} caractères.`;
  }

  if (username.length > USERNAME_MAX_LENGTH) {
    return `Le nom d'utilisateur ne peut pas dépasser ${USERNAME_MAX_LENGTH} caractères.`;
  }

  if (/\s/.test(username)) {
    return "Le nom d'utilisateur ne doit pas contenir d'espace. Utilise _ pour séparer les mots.";
  }

  if (username.includes('@')) {
    return "Saisis ton nom d'utilisateur sans le symbole @.";
  }

  if (!/^[a-z0-9_]+$/.test(username)) {
    return "Utilise uniquement les lettres de a à z, les chiffres et _. Les accents, points et tirets ne sont pas autorisés.";
  }

  return null;
}