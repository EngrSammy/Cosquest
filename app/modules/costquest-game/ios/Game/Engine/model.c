/* model.c — load a checkpoint and stand up the transformer.
 *
 * Two formats, one loader. The first int32 of the file decides: mote's magic
 * means a quantized .mq checkpoint, anything else is a legacy fp32 .bin (whose
 * first int is `dim`). Both are memory-mapped; the weight pointers, float or
 * QTensor, are just offsets into that one mapping.
 */
#include "model.h"

#include "error.h"

#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <unistd.h>

/* ---- fp32 layout ----
 * Returns the end of the payload, so the caller can check the file actually
 * contains it. Without that check a truncated checkpoint maps cleanly, reports
 * a plausible shape, and generates <unk> forever. */
static float *map_weights_fp32(Weights *w, const Config *p, float *ptr, int shared)
{
    int head_size = p->dim / p->n_heads;
    unsigned long long n_layers = p->n_layers;

    w->token_embedding = ptr; ptr += (unsigned long long)p->vocab_size * p->dim;
    w->rms_att = ptr;         ptr += n_layers * p->dim;
    w->wq = ptr;              ptr += n_layers * p->dim * (p->n_heads * head_size);
    w->wk = ptr;              ptr += n_layers * p->dim * (p->n_kv_heads * head_size);
    w->wv = ptr;              ptr += n_layers * p->dim * (p->n_kv_heads * head_size);
    w->wo = ptr;              ptr += n_layers * (p->n_heads * head_size) * p->dim;
    w->rms_ffn = ptr;         ptr += n_layers * p->dim;
    w->w1 = ptr;              ptr += n_layers * p->dim * p->hidden_dim;
    w->w2 = ptr;              ptr += n_layers * p->hidden_dim * p->dim;
    w->w3 = ptr;              ptr += n_layers * p->dim * p->hidden_dim;
    w->rms_final = ptr;       ptr += p->dim;
    ptr += p->seq_len * head_size / 2;   /* skip old RoPE tables */
    ptr += p->seq_len * head_size / 2;
    w->wcls = shared ? w->token_embedding : ptr;
    if (!shared)
        ptr += (unsigned long long)p->vocab_size * p->dim;
    return ptr;
}

/* ---- quantized layout ---- */
static char *map_qtensor(QTensor *qt, char *p, long size, int gs, int bits)
{
    qt->q = (int8_t *)p;
    p += bits == 4 ? size / 2 : size;   /* int4 packs two weights per byte */
    qt->s = (float *)p;
    p += (size / gs) * (long)sizeof(float);
    return p;
}

/* Returns the end of the payload; see map_weights_fp32 for why that matters. */
static char *map_weights_quant(Weights *w, const Config *p, int gs, int bits,
                               int shared, int has_qkv_bias, int has_qk_norm,
                               char *base)
{
    long L = p->n_layers, D = p->dim, HD = p->hidden_dim;
    int head_size = p->dim / p->n_heads;
    long kv = (long)(p->n_kv_heads * head_size);

    /* norms stay fp32, first in the payload */
    w->rms_att = (float *)base;   base += L * D * sizeof(float);
    w->rms_ffn = (float *)base;   base += L * D * sizeof(float);
    w->rms_final = (float *)base; base += D * sizeof(float);

    /* optional fp32 attention biases, right after the norms */
    if (has_qkv_bias) {
        w->bq = (float *)base; base += L * D * sizeof(float);
        w->bk = (float *)base; base += L * kv * sizeof(float);
        w->bv = (float *)base; base += L * kv * sizeof(float);
    } else {
        w->bq = w->bk = w->bv = NULL;
    }

    /* optional per-head QK-norm gains (Qwen3), after the biases. Both are
     * (layer, head_size) — one gain per head-dim position, shared across heads. */
    if (has_qk_norm) {
        w->q_norm = (float *)base; base += L * head_size * sizeof(float);
        w->k_norm = (float *)base; base += L * head_size * sizeof(float);
    } else {
        w->q_norm = w->k_norm = NULL;
    }

    base = map_qtensor(&w->q_tokens, base, (long)p->vocab_size * D, gs, bits);
    base = map_qtensor(&w->q_wq, base, L * D * D, gs, bits);
    base = map_qtensor(&w->q_wk, base, L * D * kv, gs, bits);
    base = map_qtensor(&w->q_wv, base, L * D * kv, gs, bits);
    base = map_qtensor(&w->q_wo, base, L * D * D, gs, bits);
    base = map_qtensor(&w->q_w1, base, L * D * HD, gs, bits);
    base = map_qtensor(&w->q_w2, base, L * HD * D, gs, bits);
    base = map_qtensor(&w->q_w3, base, L * D * HD, gs, bits);
    if (shared)
        w->q_wcls = w->q_tokens;
    else
        base = map_qtensor(&w->q_wcls, base, (long)p->vocab_size * D, gs, bits);
    return base;
}

static int alloc_state(RunState *s, const Config *p, int quantized, int gs)
{
    int kv_dim = (p->dim * p->n_kv_heads) / p->n_heads;
    s->x   = calloc(p->dim, sizeof(float));
    s->xb  = calloc(p->dim, sizeof(float));
    s->xb2 = calloc(p->dim, sizeof(float));
    s->hb  = calloc(p->hidden_dim, sizeof(float));
    s->hb2 = calloc(p->hidden_dim, sizeof(float));
    s->q   = calloc(p->dim, sizeof(float));
    s->att = calloc((size_t)p->n_heads * p->seq_len, sizeof(float));
    s->logits = calloc(p->vocab_size, sizeof(float));
    s->key_cache   = calloc((size_t)p->n_layers * p->seq_len * kv_dim, sizeof(float));
    s->value_cache = calloc((size_t)p->n_layers * p->seq_len * kv_dim, sizeof(float));

    /* scratch to hold whichever activation feeds a matmul, quantized. Sized to
     * the widest activation (hidden_dim >= dim). */
    if (quantized) {
        int w = p->hidden_dim > p->dim ? p->hidden_dim : p->dim;
        s->xq.q = calloc(w, sizeof(int8_t));
        s->xq.s = calloc(w / gs, sizeof(float));
    } else {
        s->xq.q = NULL;
        s->xq.s = NULL;
    }

    if (!s->x || !s->xb || !s->xb2 || !s->hb || !s->hb2 || !s->q || !s->att ||
        !s->logits || !s->key_cache || !s->value_cache)
        return mote_fail("out of memory allocating run state");
    return 0;
}

static void free_state(RunState *s)
{
    free(s->x); free(s->xb); free(s->xb2);
    free(s->hb); free(s->hb2); free(s->q);
    free(s->att); free(s->logits);
    free(s->key_cache); free(s->value_cache);
    free(s->xq.q); free(s->xq.s);
}

static int map_file(Transformer *t, const char *path)
{
    t->fd = open(path, O_RDONLY);
    if (t->fd == -1)
        return mote_fail("open() failed on %s (errno %d)", path, errno);
    off_t sz = lseek(t->fd, 0, SEEK_END);
    t->file_size = sz;
    t->data = mmap(NULL, sz, PROT_READ, MAP_PRIVATE, t->fd, 0);
    if (t->data == MAP_FAILED)
        return mote_fail("mmap failed for %lld bytes (errno %d)",
                         (long long)sz, errno);
    return 0;
}

/* Portable core: parse a model blob already in memory and wire up the
 * transformer. No files, no mmap, no platform calls. This is exactly what runs
 * on a microcontroller (blob in flash) or inside an iOS app (blob in the
 * bundle); the desktop path just mmaps a file and calls in here. */
static int init_from_blob(Transformer *t, const uint8_t *base, size_t size)
{
    int32_t magic;
    const char *end;

    /* The header itself must be present before any field in it is trusted. */
    if (size < MQ_HEADER)
        return mote_fail("file is %llu bytes, too small to be a model",
                         (unsigned long long)size);
    memcpy(&magic, base, sizeof(magic));

    if (magic == MQ_MAGIC) {
        t->quantized = 1;
        const int32_t *h = (const int32_t *)base;
        /* h[0]=magic, h[1]=version, h[2..8]=Config, h[9]=gs, h[10]=shared,
         * h[11]=has_qkv_bias, h[12]=rope_theta bits, h[13]=rms_eps bits (v2),
         * h[14]=weight bits (v3; 0 means int8), h[15]=has_qk_norm (v4). */
        if (h[1] < 1 || h[1] > MQ_VERSION)
            return mote_fail("unsupported .mq version %d", h[1]);
        t->config = *(const Config *)(h + 2);
        t->gs = h[9];
        int shared = h[10];
        t->has_qkv_bias = (h[1] >= 2) ? h[11] : 0;
        t->qbits = (h[1] >= 3 && h[14]) ? h[14] : 8;
        t->has_qk_norm = (h[1] >= 4) ? h[15] : 0;
        if (t->qbits != 8 && t->qbits != 4)
            return mote_fail("unsupported weight width %d bits", t->qbits);
        /* rope_theta / eps live in the header as float bits; 0 means "unset",
         * so a v1 file (or a writer that left them blank) gets Llama defaults. */
        float rope_theta, rms_eps;
        memcpy(&rope_theta, &h[12], sizeof(float));
        memcpy(&rms_eps, &h[13], sizeof(float));
        t->rope_theta = (rope_theta > 0.0f) ? rope_theta : 10000.0f;
        t->rms_eps    = (rms_eps > 0.0f)    ? rms_eps    : 1e-5f;
        if (t->gs <= 0 || (t->config.dim % t->gs) || (t->config.hidden_dim % t->gs)
            || (t->qbits == 4 && t->gs % 2))
            return mote_fail("bad group size %d for this model", t->gs);
        end = map_weights_quant(&t->weights, &t->config, t->gs, t->qbits, shared,
                                t->has_qkv_bias, t->has_qk_norm, (char *)base + MQ_HEADER);
    } else {
        t->quantized = 0;
        t->gs = 0;
        t->qbits = 0;
        t->config = *(const Config *)base;
        int shared = t->config.vocab_size > 0;
        t->config.vocab_size = abs(t->config.vocab_size);
        t->has_qkv_bias = 0;
        t->has_qk_norm = 0;
        t->rope_theta = 10000.0f;
        t->rms_eps = 1e-5f;
        float *weights_ptr = (float *)base + sizeof(Config) / sizeof(float);
        end = (const char *)map_weights_fp32(&t->weights, &t->config, weights_ptr, shared);
    }

    /* The weight pointers above are arithmetic only — nothing has been read yet.
     * Check the file is big enough to hold what the header claims before any of
     * them is dereferenced. A truncated checkpoint otherwise loads without
     * complaint and generates <unk> forever, and on a device that garbage model
     * then gets cached as if it were good. */
    {
        unsigned long long need = (unsigned long long)(end - (const char *)base);
        if ((unsigned long long)size < need)
            return mote_fail("model is truncated — header describes %llu bytes, "
                             "file has %llu", need, (unsigned long long)size);
    }

    return alloc_state(&t->state, &t->config, t->quantized, t->gs);
}

int build_transformer_from_blob(Transformer *t, const void *blob, size_t size)
{
    mote_clear_error();
    /* the caller owns the blob; we neither map nor free it */
    t->data = NULL;
    t->fd = -1;
    t->file_size = (ssize_t)size;
    return init_from_blob(t, (const uint8_t *)blob, size);
}

int build_transformer(Transformer *t, const char *path)
{
    mote_clear_error();
    /* desktop convenience: mmap the checkpoint, then hand the bytes to the
     * portable core. free_transformer unmaps because we own t->data and t->fd. */
    if (map_file(t, path) != 0)
        return -1;
    return init_from_blob(t, (const uint8_t *)t->data, (size_t)t->file_size);
}

void free_transformer(Transformer *t)
{
    if (t->data != MAP_FAILED && t->data != NULL)
        munmap(t->data, t->file_size);
    if (t->fd != -1)
        close(t->fd);
    free_state(&t->state);
}
