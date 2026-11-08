function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

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

/** Dernière activité : « vu à l'instant », « vu il y a 5 min », « vu hier à 18:30 »… */
export function formatLastSeen(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const minutes = Math.floor((now.getTime() - date.getTime()) / 60000);

  if (minutes < 1) return "vu à l'instant";
  if (minutes < 60) return `vu il y a ${minutes} min`;

  const time = formatMessageTime(iso);

  if (date.toDateString() === now.toDateString()) {
    return `vu aujourd'hui à ${time}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `vu hier à ${time}`;
  }

  return `vu le ${pad(date.getDate())}/${pad(date.getMonth() + 1)} à ${time}`;
}

/** Date d'inscription : « Membre depuis novembre 2026 » */
export function formatMemberSince(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `Membre depuis ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}