/*
 * HoMM3 tolerant GZip decompress/compress for browser WASM.
 * Decompress: ignores footer CRC mismatch (matches SharpZipLib fork behavior).
 * Compress: writes standard RFC1952 GZip with valid CRC.
 */
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <zlib.h>

#define GZIP_MAGIC1 0x1f
#define GZIP_MAGIC2 0x8b
#define GZIP_METHOD_DEFLATE 8

static uint32_t crc32_gzip(const uint8_t *data, size_t len) {
  return (uint32_t)crc32(0L, data, (uInt)len);
}

static int parse_gzip_header(const uint8_t *in, size_t in_len, size_t *header_len) {
  if (in_len < 10) return -1;
  if (in[0] != GZIP_MAGIC1 || in[1] != GZIP_MAGIC2) return -2;
  if (in[2] != GZIP_METHOD_DEFLATE) return -3;
  uint8_t flags = in[3];
  if (flags & 0xE0) return -4;
  size_t pos = 10;
  if (flags & 0x04) {
    if (pos + 2 > in_len) return -5;
    uint16_t xlen = in[pos] | (in[pos + 1] << 8);
    pos += 2 + xlen;
  }
  if (flags & 0x08) {
    while (pos < in_len && in[pos]) pos++;
    pos++;
  }
  if (flags & 0x10) {
    while (pos < in_len && in[pos]) pos++;
    pos++;
  }
  if (flags & 0x02) pos += 2;
  if (pos > in_len) return -6;
  *header_len = pos;
  return 0;
}

/* Returns allocated buffer; caller frees with free(). Sets *out_len. */
uint8_t *homm3_gzip_decompress(const uint8_t *in, size_t in_len, size_t *out_len) {
  size_t header_len = 0;
  if (parse_gzip_header(in, in_len, &header_len) != 0) return NULL;
  if (in_len < header_len + 8) return NULL;

  size_t deflate_len = in_len - header_len - 8;
  const uint8_t *deflate_data = in + header_len;

  z_stream strm = {0};
  strm.next_in = (Bytef *)deflate_data;
  strm.avail_in = (uInt)deflate_len;

  if (inflateInit2(&strm, -MAX_WBITS) != Z_OK) return NULL;

  size_t cap = deflate_len * 4 + 65536;
  uint8_t *out = (uint8_t *)malloc(cap);
  if (!out) {
    inflateEnd(&strm);
    return NULL;
  }

  size_t total = 0;
  int ret;
  do {
    if (total + 32768 > cap) {
      cap *= 2;
      uint8_t *n = (uint8_t *)realloc(out, cap);
      if (!n) {
        free(out);
        inflateEnd(&strm);
        return NULL;
      }
      out = n;
    }
    strm.next_out = out + total;
    strm.avail_out = (uInt)(cap - total);
    ret = inflate(&strm, Z_NO_FLUSH);
    total = cap - strm.avail_out;
    if (ret == Z_STREAM_ERROR || ret == Z_DATA_ERROR || ret == Z_MEM_ERROR) {
      free(out);
      inflateEnd(&strm);
      return NULL;
    }
  } while (ret != Z_STREAM_END);

  inflateEnd(&strm);

  /* Validate ISIZE from footer; ignore CRC mismatch */
  uint32_t isize =
      (uint32_t)in[in_len - 4] | ((uint32_t)in[in_len - 3] << 8) |
      ((uint32_t)in[in_len - 2] << 16) | ((uint32_t)in[in_len - 1] << 24);
  if (isize != (uint32_t)(total & 0xffffffffUL)) {
    free(out);
    return NULL;
  }

  *out_len = total;
  return out;
}

uint8_t *homm3_gzip_compress(const uint8_t *in, size_t in_len, size_t *out_len) {
  uLong bound = compressBound((uLong)in_len);
  size_t cap = 10 + bound + 8;
  uint8_t *out = (uint8_t *)malloc(cap);
  if (!out) return NULL;

  out[0] = GZIP_MAGIC1;
  out[1] = GZIP_MAGIC2;
  out[2] = GZIP_METHOD_DEFLATE;
  out[3] = 0;
  out[4] = 0;
  out[5] = 0;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0xFF;

  z_stream strm = {0};
  strm.next_in = (Bytef *)in;
  strm.avail_in = (uInt)in_len;
  strm.next_out = out + 10;
  strm.avail_out = (uInt)bound;

  if (deflateInit2(&strm, Z_DEFAULT_COMPRESSION, Z_DEFLATED, -MAX_WBITS, 8, Z_DEFAULT_STRATEGY) != Z_OK) {
    free(out);
    return NULL;
  }

  if (deflate(&strm, Z_FINISH) != Z_STREAM_END) {
    deflateEnd(&strm);
    free(out);
    return NULL;
  }
  size_t deflated = strm.total_out;
  deflateEnd(&strm);

  uint32_t crc = crc32_gzip(in, in_len);
  uint32_t isize = (uint32_t)(in_len & 0xffffffffUL);
  size_t footer = 10 + deflated;
  out[footer + 0] = (uint8_t)(crc & 0xff);
  out[footer + 1] = (uint8_t)((crc >> 8) & 0xff);
  out[footer + 2] = (uint8_t)((crc >> 16) & 0xff);
  out[footer + 3] = (uint8_t)((crc >> 24) & 0xff);
  out[footer + 4] = (uint8_t)(isize & 0xff);
  out[footer + 5] = (uint8_t)((isize >> 8) & 0xff);
  out[footer + 6] = (uint8_t)((isize >> 16) & 0xff);
  out[footer + 7] = (uint8_t)((isize >> 24) & 0xff);

  *out_len = footer + 8;
  return out;
}

void homm3_free(void *p) { free(p); }
