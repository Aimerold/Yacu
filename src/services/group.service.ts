
import { supabase } from '@/lib/supabase';

export type CreateGroupResult = {
  conversationId: string;
};

/**
 * Crée un groupe et ajoute les membres sélectionnés.
 */
export async function createGroup(
  name: string,
  memberIds: string[]
): Promise<CreateGroupResult> {
  const trimmedName = name.trim();

  if (trimmedName.length < 2) {
    throw new Error(
      'Le nom du groupe doit contenir au moins 2 caractères.'
    );
  }

  const uniqueMemberIds = [...new Set(memberIds.filter(Boolean))];

  if (uniqueMemberIds.length === 0) {
    throw new Error('Sélectionne au moins un membre.');
  }

  const { data, error } = await supabase.rpc('create_group', {
    p_name: trimmedName,
    p_member_ids: uniqueMemberIds,
  });

  if (error) {
    console.error('Erreur création groupe :', error);
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Impossible de créer le groupe.');
  }

  return {
    conversationId: data as string,
  };
}
