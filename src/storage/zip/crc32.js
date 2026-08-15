/**
 * CRC-32 (IEEE 802.3), required by the ZIP format for every entry.
 *
 * Table-based, computed once at module load. Incremental so a large file can be
 * checksummed by streaming it, without ever holding it in memory.
 */

const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

export class Crc32 {
  #state = 0xffffffff;

  /** @param {Uint8Array} bytes */
  update(bytes) {
    let state = this.#state;
    for (let i = 0; i < bytes.length; i += 1) {
      state = TABLE[(state ^ bytes[i]) & 0xff] ^ (state >>> 8);
    }
    this.#state = state;
    return this;
  }

  get value() {
    return (this.#state ^ 0xffffffff) >>> 0;
  }
}

/** @param {Uint8Array} bytes */
export function crc32(bytes) {
  return new Crc32().update(bytes).value;
}

/** Checksums a Blob by streaming it, so memory stays O(chunk). */
export async function crc32OfBlob(blob) {
  const crc = new Crc32();
  const reader = blob.stream().getReader();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    crc.update(value);
  }

  return crc.value;
}
