export function isPiAddress(value) {
  if (typeof value !== 'string' || !/^G[A-Z2-7]{55}$/.test(value)) return false;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = [];
  let bits = 0, buffer = 0;
  for (const char of value) {
    buffer = (buffer << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((buffer >> bits) & 255); }
  }
  if (bytes.length !== 35 || bytes[0] !== 48) return false;
  let crc = 0;
  for (const byte of bytes.slice(0,33)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = ((crc << 1) ^ ((crc & 0x8000) ? 0x1021 : 0)) & 0xffff;
  }
  return bytes[33] === (crc & 255) && bytes[34] === (crc >> 8);
}
