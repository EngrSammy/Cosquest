/* intent.c — the compiled registry format. See intent.h.
 *
 * Read side and write side in one file because they describe the same layout
 * and a layout described twice drifts. Nothing here allocates: the reader is a
 * set of pointers into the caller's blob, and the writer fills a buffer the
 * caller sized with intent_blob_size.
 */
#include "intent.h"

#include <math.h>
#include <stdint.h>
#include <string.h>

/* The command table is memcpy'd in and out as a struct, so its size has to be
 * the same everywhere. char[32] plus two u32 is 40 bytes with align 4 on every
 * ABI mote targets; the assert is here so a hostile one fails to build rather
 * than writing a file nobody else can read. */
_Static_assert(sizeof(IntentCommand) == INTENT_ID_MAX + 8,
               "IntentCommand must be packed as written");

/* The header is eight u32 slots of meaning followed by eight reserved ones. It
 * is read field by field rather than as a struct so a compiler's padding rules
 * cannot change the file format. */
static unsigned int rd_u32(const unsigned char *p)
{
    return (unsigned int)p[0] | ((unsigned int)p[1] << 8) |
           ((unsigned int)p[2] << 16) | ((unsigned int)p[3] << 24);
}

static void wr_u32(unsigned char *p, unsigned int v)
{
    p[0] = (unsigned char)(v & 0xff);
    p[1] = (unsigned char)((v >> 8) & 0xff);
    p[2] = (unsigned char)((v >> 16) & 0xff);
    p[3] = (unsigned char)((v >> 24) & 0xff);
}

int intent_open(const void *blob, size_t len, IntentRegistry *out)
{
    if (!blob || !out || len < INTENT_HEADER_LEN)
        return 0;
    /* the float arrays are used in place, so alignment is a correctness
     * requirement, not a performance one. An mmap'd file is page-aligned and
     * the generated C header declares _Alignas(4); anything else is a caller
     * bug and is refused rather than dereferenced. */
    if (((uintptr_t)blob & 3u) != 0)
        return 0;

    const unsigned char *b = (const unsigned char *)blob;
    if (memcmp(b, INTENT_MAGIC, 4) != 0)
        return 0;
    if (rd_u32(b + 4) != INTENT_VERSION)
        return 0;

    unsigned int dim   = rd_u32(b + 8);
    unsigned int ncmd  = rd_u32(b + 12);
    unsigned int nphr  = rd_u32(b + 16);
    unsigned int flags = rd_u32(b + 20);
    unsigned int hlen  = rd_u32(b + 24);
    unsigned int total = rd_u32(b + 28);

    if (dim == 0 || ncmd == 0 || nphr == 0 || hlen < INTENT_HEADER_LEN)
        return 0;
    if (total > len)                       /* truncated */
        return 0;

    size_t off = hlen;
    size_t mean_bytes = (size_t)dim * sizeof(float);
    size_t cmd_bytes  = (size_t)ncmd * sizeof(IntentCommand);
    size_t cent_bytes = (size_t)ncmd * dim * sizeof(float);
    size_t phr_bytes  = (size_t)nphr * dim * sizeof(float);
    if (off + mean_bytes + cmd_bytes + cent_bytes + phr_bytes > len)
        return 0;

    out->dim         = (int)dim;
    out->n_commands  = (int)ncmd;
    out->n_phrasings = (int)nphr;
    out->centered    = (flags & INTENT_CENTERED) ? 1 : 0;
    out->mean        = (const float *)(const void *)(b + off);
    off += mean_bytes;
    out->commands    = (const IntentCommand *)(const void *)(b + off);
    off += cmd_bytes;
    out->centroids   = (const float *)(const void *)(b + off);
    off += cent_bytes;
    out->phrasings   = (const float *)(const void *)(b + off);

    /* every phrasing span must land inside the phrasing block, or a malformed
     * registry reads past the end of the mapping at match time */
    for (unsigned int i = 0; i < ncmd; i++) {
        const IntentCommand *c = &out->commands[i];
        if (c->count == 0 || (size_t)c->first + c->count > nphr)
            return 0;
        if (c->id[INTENT_ID_MAX - 1] != '\0')   /* ids must be terminated */
            return 0;
    }
    return 1;
}

void intent_prepare_query(const IntentRegistry *r, float *q)
{
    if (!r || !q || !r->centered)
        return;
    int dim = r->dim;
    float ss = 0.0f;
    for (int i = 0; i < dim; i++) {
        q[i] -= r->mean[i];
        ss += q[i] * q[i];
    }
    float inv = ss > 0.0f ? 1.0f / sqrtf(ss) : 0.0f;
    for (int i = 0; i < dim; i++)
        q[i] *= inv;
}

/* Both vectors are unit length, so cosine is the plain dot product; this is the
 * only arithmetic the match actually performs. */
static float dot(const float *a, const float *b, int n)
{
    float s = 0.0f;
    for (int i = 0; i < n; i++)
        s += a[i] * b[i];
    return s;
}

void intent_score(const IntentRegistry *r, const float *q, float *scores, int *best)
{
    if (!r || !q || !scores)
        return;
    int dim = r->dim;
    for (int i = 0; i < r->n_commands; i++) {
        const IntentCommand *c = &r->commands[i];
        float top = -2.0f;                  /* below any cosine */
        int   arg = (int)c->first;
        for (unsigned int k = 0; k < c->count; k++) {
            float s = dot(q, r->phrasings + (size_t)(c->first + k) * dim, dim);
            if (s > top) { top = s; arg = (int)(c->first + k); }
        }
        scores[i] = top;
        if (best) best[i] = arg;
    }
}

void intent_score_centroids(const IntentRegistry *r, const float *q, float *scores)
{
    if (!r || !q || !scores)
        return;
    for (int i = 0; i < r->n_commands; i++)
        scores[i] = dot(q, r->centroids + (size_t)i * r->dim, r->dim);
}

/* ---- writing ---- */

size_t intent_blob_size(const IntentBuild *b)
{
    if (!b)
        return 0;
    return (size_t)INTENT_HEADER_LEN
         + (size_t)b->dim * sizeof(float)
         + (size_t)b->n_commands * sizeof(IntentCommand)
         + (size_t)b->n_commands * b->dim * sizeof(float)
         + (size_t)b->n_phrasings * b->dim * sizeof(float);
}

size_t intent_pack(const IntentBuild *b, void *dst, size_t cap)
{
    size_t need = intent_blob_size(b);
    if (!b || !dst || cap < need || need == 0)
        return 0;
    for (int i = 0; i < b->n_commands; i++)
        if (strlen(b->ids[i]) >= INTENT_ID_MAX)
            return 0;

    unsigned char *p = (unsigned char *)dst;
    memset(p, 0, need);
    memcpy(p, INTENT_MAGIC, 4);
    wr_u32(p + 4,  INTENT_VERSION);
    wr_u32(p + 8,  (unsigned int)b->dim);
    wr_u32(p + 12, (unsigned int)b->n_commands);
    wr_u32(p + 16, (unsigned int)b->n_phrasings);
    wr_u32(p + 20, b->centered ? INTENT_CENTERED : 0u);
    wr_u32(p + 24, INTENT_HEADER_LEN);
    wr_u32(p + 28, (unsigned int)need);

    size_t off = INTENT_HEADER_LEN;
    size_t mean_bytes = (size_t)b->dim * sizeof(float);
    if (b->mean)
        memcpy(p + off, b->mean, mean_bytes);   /* else left as zeros */
    off += mean_bytes;

    IntentCommand *cmds = (IntentCommand *)(void *)(p + off);
    for (int i = 0; i < b->n_commands; i++) {
        memset(&cmds[i], 0, sizeof(cmds[i]));
        /* length was checked above, so this always leaves a terminator */
        memcpy(cmds[i].id, b->ids[i], strlen(b->ids[i]));
        cmds[i].first = (unsigned int)b->first[i];
        cmds[i].count = (unsigned int)b->count[i];
    }
    off += (size_t)b->n_commands * sizeof(IntentCommand);

    memcpy(p + off, b->centroids, (size_t)b->n_commands * b->dim * sizeof(float));
    off += (size_t)b->n_commands * b->dim * sizeof(float);
    memcpy(p + off, b->phrasings, (size_t)b->n_phrasings * b->dim * sizeof(float));
    return need;
}
