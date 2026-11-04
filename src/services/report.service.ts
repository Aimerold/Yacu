import { supabase } from '@/lib/supabase';

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'inappropriate'
  | 'impersonation'
  | 'other';

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam ou publicité' },
  { value: 'harassment', label: 'Harcèlement ou menaces' },
  { value: 'inappropriate', label: 'Contenu inapproprié' },
  { value: 'impersonation', label: "Usurpation d'identité" },
  { value: 'other', label: 'Autre' },
];

/** Signale un utilisateur. */
export async function reportUser(params: {
  reportedUserId: string;
  reason: ReportReason;
  details?: string;
}): Promise<void> {
  const details = params.details?.trim();

  const { error } = await supabase.from('reports').insert({
    reported_user_id: params.reportedUserId,
    reason: params.reason,
    details: details ? details : null,
  });

  if (error) throw new Error(error.message);
}