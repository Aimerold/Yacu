export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

/**
 * Normalise ce que l'utilisateur tape : minuscules, sans accents,
 * espaces remplacés par « _ », caractères non autorisés retirés, 20 maximum.
 */
export function normalizeUsername(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, USERNAME_MAX_LENGTH);
}

/** Message d'erreur précis, ou null si le nom d'utilisateur est valide. */
export function usernameError(value: string): string | null {
  if (value.length < USERNAME_MIN_LENGTH) {
    return `Le nom d'utilisateur doit contenir au moins ${USERNAME_MIN_LENGTH} caractères.`;
  }

  if (value.length > USERNAME_MAX_LENGTH) {
    return `Le nom d'utilisateur ne peut pas dépasser ${USERNAME_MAX_LENGTH} caractères.`;
  }

  if (!USERNAME_PATTERN.test(value)) {
    return "Utilise uniquement des lettres minuscules, des chiffres et _ (sans espace ni accent).";
  }

  return null;
}