const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const lookup = new Uint8Array(256);

for (let i = 0; i < ALPHABET.length; i += 1) {
  lookup[ALPHABET.charCodeAt(i)] = i;
}

/** Convertit une chaîne base64 (avec ou sans préfixe data:) en ArrayBuffer. */
export function base64ToArrayBuffer(input: string): ArrayBuffer {
  const base64 = input.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');

  let end = base64.length;
  while (end > 0 && base64[end - 1] === '=') end -= 1;

  const byteLength = Math.floor((end * 3) / 4);
  const buffer = new ArrayBuffer(byteLength);
  const bytes = new Uint8Array(buffer);

  let position = 0;

  for (let i = 0; i < end; i += 4) {
    const a = lookup[base64.charCodeAt(i)];
    const b = lookup[base64.charCodeAt(i + 1)];
    const c = i + 2 < end ? lookup[base64.charCodeAt(i + 2)] : 0;
    const d = i + 3 < end ? lookup[base64.charCodeAt(i + 3)] : 0;

    if (position < byteLength) bytes[position++] = (a << 2) | (b >> 4);
    if (position < byteLength) bytes[position++] = ((b & 15) << 4) | (c >> 2);
    if (position < byteLength) bytes[position++] = ((c & 3) << 6) | d;
  }

  return buffer;
}