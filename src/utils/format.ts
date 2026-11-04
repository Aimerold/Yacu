function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** Heure d'un message : 14:05 */
export function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Date courte pour la liste des conversations : heure, « Hier » ou 03/11 */
export function formatListTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return formatMessageTime(iso);
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Hier';
  }

  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}