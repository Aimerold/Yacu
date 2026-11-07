import { supabase } from '@/lib/supabase';
import { unregisterStoredPushToken } from '@/lib/notifications';

export const PASSWORD_MIN_LENGTH = 8;

/** Erreur dont le message est destiné à l'utilisateur. */
export class AccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountError';
    Object.setPrototypeOf(this, AccountError.prototype);
  }
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isRateLimited(error: { status?: number; message: string }): boolean {
  const message = error.message.toLowerCase();

  return (
    error.status === 429 ||
    message.includes('security purposes') ||
    message.includes('rate limit')
  );
}

function passwordUpdateError(message: string): AccountError {
  const text = message.toLowerCase();

  if (text.includes('different from the old')) {
    return new AccountError(
      "Le nouveau mot de passe doit être différent de l'ancien."
    );
  }

  if (
    text.includes('weak') ||
    text.includes('at least') ||
    text.includes('characters')
  ) {
    return new AccountError(
      `Mot de passe trop faible. Utilise au moins ${PASSWORD_MIN_LENGTH} caractères.`
    );
  }

  return new AccountError('Impossible de modifier le mot de passe. Réessaie.');
}

/** Adresse e-mail de l'utilisateur connecté (lue dans la session locale). */
export async function getCurrentEmail(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Envoie un code de réinitialisation par e-mail.
 * Le résultat est identique que le compte existe ou non (pas de fuite d'information).
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(
    normalizeEmail(email)
  );

  if (!error) return;

  if (isRateLimited(error)) {
    throw new AccountError('Trop de demandes. Réessaie dans quelques minutes.');
  }

  throw new AccountError(
    "Impossible d'envoyer le code. Vérifie ta connexion et réessaie."
  );
}

/** Vérifie le code reçu par e-mail, puis définit le nouveau mot de passe. */
export async function resetPasswordWithCode(params: {
  email: string;
  code: string;
  newPassword: string;
}): Promise<void> {
  const { error: verifyError } = await supabase.auth.verifyOtp({
    email: normalizeEmail(params.email),
    token: params.code.trim(),
    type: 'recovery',
  });

  if (verifyError) {
    throw new AccountError('Code invalide ou expiré.');
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: params.newPassword,
  });

  if (updateError) {
    // On ne laisse pas de session ouverte si le mot de passe n'a pas pu être changé.
    await supabase.auth.signOut();
    throw passwordUpdateError(updateError.message);
  }
}

/** Vérifie le code de confirmation d'e-mail reçu à l'inscription (ouvre la session). */
export async function verifySignupCode(params: {
  email: string;
  code: string;
}): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    email: normalizeEmail(params.email),
    token: params.code.trim(),
    type: 'signup',
  });

  if (error) {
    throw new AccountError('Code invalide ou expiré.');
  }
}

/** Renvoie le code de confirmation d'e-mail. */
export async function resendSignupCode(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: normalizeEmail(email),
  });

  if (!error) return;

  if (isRateLimited(error)) {
    throw new AccountError('Trop de demandes. Réessaie dans quelques minutes.');
  }

  throw new AccountError(
    "Impossible d'envoyer le code. Vérifie ta connexion et réessaie."
  );
}

/** Change le mot de passe après vérification de l'ancien. */
export async function changePassword(params: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const email = await getCurrentEmail();

  if (!email) {
    throw new AccountError('Session invalide. Reconnecte-toi.');
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: params.currentPassword,
  });

  if (signInError) {
    throw new AccountError('Mot de passe actuel incorrect.');
  }

  const { error } = await supabase.auth.updateUser({
    password: params.newPassword,
  });

  if (error) throw passwordUpdateError(error.message);
}

/**
 * Déconnecte l'utilisateur.
 * Retire d'abord le jeton de notification de cet appareil (la session est encore
 * valide), sans jamais retarder la déconnexion de plus de 3 secondes.
 */
export async function signOut(): Promise<void> {
  await Promise.race([
    unregisterStoredPushToken(),
    new Promise<void>((resolve) => setTimeout(resolve, 3000)),
  ]);

  const { error } = await supabase.auth.signOut();

  if (error) throw new Error(error.message);
}

/**
 * Supprime définitivement le compte (Edge Function `delete-account`).
 * Le mot de passe est revérifié côté serveur.
 */
export async function deleteMyAccount(password: string): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', {
    body: { password },
  });

  if (error) {
    let code = '';
    const context = (error as { context?: unknown }).context;

    if (context instanceof Response) {
      try {
        const body = (await context.json()) as { error?: string };
        code = body.error ?? '';
      } catch {
        // Réponse illisible : message générique ci-dessous.
      }
    }

    if (code === 'invalid_password') {
      throw new AccountError('Mot de passe incorrect.');
    }

    throw new AccountError(
      'Suppression impossible pour le moment. Réessaie plus tard.'
    );
  }

  // Le compte n'existe plus : on efface la session locale.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
}