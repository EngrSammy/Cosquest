/* intent.h — a compiled command registry: what the device can be told to do,
 * stored as vectors so recognising it costs no generation.
 *
 * Most of what anyone says to a room is one of a few dozen things. Generating a
 * tool call for "lights off" is absurd: it spends a hundred forward passes
 * deciding between options that were all known before the device shipped. So
 * the options are embedded once, at build time, and at run time the utterance is
 * embedded (one forward pass) and compared against them by dot product. Nothing
 * is sampled, nothing is decoded, and the answer is an index into a table the
 * host wrote itself.
 *
 * This file is only the format and the arithmetic: no model, no tokenizer. The
 * build tool (tools/intent_build.c) needs the writer, the engine needs the
 * reader, and neither should have to know about the other's half.
 *
 * On-disk layout, little-endian IEEE-754 floats — the same assumption the .mq
 * loader already makes, for the same reason: the file is mapped and read in
 * place, never parsed.
 *
 *   0   char  magic[4]      "MINT"
 *   4   u32   version
 *   8   u32   dim                 vector width; must match the model's
 *   12  u32   n_commands
 *   16  u32   n_phrasings         total across all commands
 *   20  u32   flags               bit 0: vectors are mean-centered
 *   24  u32   header_len          64, so a later version can grow the header
 *   28  u32   total_len           whole blob, for a cheap truncation check
 *   32  u32   reserved[8]
 *   64  f32   mean[dim]           zeros when not centered
 *       rec   commands[n_commands]        { char id[32]; u32 first; u32 count; }
 *       f32   centroids[n_commands * dim]
 *       f32   phrasings[n_phrasings * dim]
 *
 * Every vector in the blob is already L2-normalized (and already centered, if
 * the flag is set), because the device should do no vector preparation beyond
 * the one query it was handed.
 */
#ifndef MOTE_INTENT_H
#define MOTE_INTENT_H

#include <stddef.h>

#define INTENT_MAGIC      "MINT"
#define INTENT_VERSION    1
#define INTENT_HEADER_LEN 64
#define INTENT_ID_MAX     32      /* including the terminator */
#define INTENT_CENTERED   0x1u    /* flags bit 0 */

/* One command's entry in the table, laid out exactly as it is stored. */
typedef struct {
    char         id[INTENT_ID_MAX];
    unsigned int first;           /* index of its first phrasing vector */
    unsigned int count;           /* how many phrasings it has          */
} IntentCommand;

/* A registry opened in place. Every pointer aims into the caller's blob, so the
 * blob must outlive this. */
typedef struct {
    int dim, n_commands, n_phrasings;
    int centered;
    const float         *mean;        /* dim                        */
    const IntentCommand *commands;    /* n_commands                 */
    const float         *centroids;   /* n_commands * dim           */
    const float         *phrasings;   /* n_phrasings * dim          */
} IntentRegistry;

/* Validate a blob and fill in the view. Returns 1 on success, 0 if it is not a
 * registry, is truncated, is a version this build does not know, or is not
 * 4-byte aligned — the float arrays are read in place, so an unaligned blob is
 * refused here rather than dereferenced and hoped for. */
int intent_open(const void *blob, size_t len, IntentRegistry *out);

/* Prepare a freshly embedded query for comparison, in place: subtract the
 * registry's mean if it is centered, then re-normalize. Costs one pass over dim
 * floats, which is why centering can be a run-time step instead of a second set
 * of stored vectors.
 *
 * Centering matters more than it looks. Raw mean-pooled embeddings from a
 * decoder-only model all sit in a narrow cone — every pair of unrelated
 * sentences scores around 0.75 — so the useful signal is a thin shell on top of
 * a large shared component. Subtracting the registry's own mean removes that
 * component and spreads the scores over most of [-1, 1], which is the
 * difference between a threshold existing and not. */
void intent_prepare_query(const IntentRegistry *r, float *q);

/* Score every command against a prepared query.
 *
 * scores[i] is the best dot product over command i's phrasings, and best[i] (if
 * given) is which phrasing that was, as an index into the phrasing block. Max
 * over phrasings rather than the centroid: a command's phrasings are genuinely
 * multi-modal — "lights on" and "it's too dark in here" share no words and
 * point in different directions — so their mean lands between the modes, near
 * neither, and is beaten by a neighbouring command's actual phrasing. See
 * intent_score_centroids, which is kept so that claim stays measurable. */
void intent_score(const IntentRegistry *r, const float *q, float *scores, int *best);

/* The same, against the one centroid per command. Cheaper (n_commands dots
 * instead of n_phrasings) and worse; see above. */
void intent_score_centroids(const IntentRegistry *r, const float *q, float *scores);

/* ---- writing (build tool only) ---- */

typedef struct {
    int dim, n_commands, n_phrasings, centered;
    const float *mean;              /* dim; NULL when not centered  */
    const char *const *ids;         /* n_commands                   */
    const int   *first, *count;     /* n_commands                   */
    const float *centroids;         /* n_commands * dim             */
    const float *phrasings;         /* n_phrasings * dim            */
} IntentBuild;

size_t intent_blob_size(const IntentBuild *b);

/* Serialize into dst[0..cap). Returns the number of bytes written, or 0 if cap
 * is too small or an id does not fit in INTENT_ID_MAX. */
size_t intent_pack(const IntentBuild *b, void *dst, size_t cap);

#endif /* MOTE_INTENT_H */
