/* mote_lib.h — mote as a library.
 *
 * The CLI is one way to drive the engine; this is the other. It bundles the
 * transformer, tokenizer, and sampler behind one opaque handle, loads them from
 * memory (so it works the same on a laptop, a phone, or a chip), and streams
 * generated text back through a callback instead of printing to a terminal.
 *
 * This is the surface an iOS app or an MCU firmware links against.
 */
#ifndef MOTE_LIB_H
#define MOTE_LIB_H

#include <stddef.h>

/* mote_last_error(): when a create returns NULL, this says why. Included here
 * rather than left to the caller because this header is the whole surface a
 * host links against — the iOS bridging header includes only this file. */
#include "error.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct mote mote;

typedef struct {
    float temperature;          /* 0 = greedy / deterministic          */
    float topp;                 /* nucleus sampling; <=0 or >=1 = off  */
    float repeat_penalty;       /* >1 discourages recently seen tokens
                                   (1.1 is gentle); <=1 = off. Small
                                   models loop verbatim without this,
                                   especially when greedy.             */
    unsigned long long seed;    /* 0 = leave the current seed          */
    int   max_tokens;           /* cap on NEW tokens generated after the
                                   prompt; 0 = up to the context limit  */
} mote_params;

/* A model's shape, for showing what is actually running. */
typedef struct {
    int dim, hidden_dim, n_layers, n_heads, n_kv_heads, vocab_size, seq_len;
    int quantized;              /* 1 if the model is weight-quantized  */
    int qbits;                  /* weight width when quantized: 8 or 4 */
} mote_info_t;

void mote_get_info(const mote *m, mote_info_t *out);

/* Create an engine from a model blob and a tokenizer blob already in memory.
 * The caller may free both blobs after this returns... except the model, which
 * must stay alive for the engine's lifetime (its weights are used in place).
 * Returns NULL on failure. */
mote *mote_create(const void *model, size_t model_len,
                  const void *tokenizer, size_t tokenizer_len);

/* Convenience: create from files on disk. On iOS the bundled model and
 * tokenizer have real paths, and this uses mmap, so there is no large copy and
 * no pointer-lifetime concern. (The from-blob path above is for flash on an
 * MCU, where there is no filesystem.) */
mote *mote_create_from_files(const char *model_path, const char *tokenizer_path);

/* Generate a continuation of `prompt`. For each decoded piece of text, calls
 * on_token(piece, user); return 0 from it to stop early, non-zero to continue.
 * Returns the number of tokens generated. */
int mote_generate(mote *m, const char *prompt, const mote_params *params,
                  int (*on_token)(const char *piece, void *user), void *user);

/* Embed a text as a single vector: the model's final hidden states, mean-pooled
 * over the text's tokens and L2-normalized, written to out[dim] (dim from
 * mote_get_info). The model doubles as its own embedding model, which is what
 * makes an on-device memory layer possible with nothing extra to ship: store
 * the vector next to what was said, and later retrieve by dot product.
 * Returns dim, or 0 on failure. */
int mote_embed(mote *m, const char *text, float *out);

/* ---- constrained decoding ------------------------------------------------
 *
 * The reason a small model is unreliable at tool calls is not that it cannot
 * write JSON, it is that nothing stops it writing something else. Sampling sees
 * the whole vocabulary at every step, so a stray brace, an invented key or an
 * enum value the caller never defined are all merely unlikely.
 *
 * A grammar removes the possibility instead of lowering the odds. A schema is
 * compiled once into a byte-level state machine; at each step the machine is
 * run over every token's bytes and the ones that could not continue a valid
 * document have their logits pushed out of reach before the draw. What comes
 * back is the schema's JSON or nothing at all.
 *
 * Because the machine works on token bytes it needs the engine's vocabulary,
 * which is why compiling takes the handle it will be used with, and why the
 * grammar has to be freed before that handle is.
 */
typedef struct mote_grammar mote_grammar;

/* Negative returns from mote_generate_constrained. Token counts are >= 0, so a
 * caller that only ever checked for 0 keeps working. */
#define MOTE_ERR_GRAMMAR_UNSTARTED (-1)

/* Compile a JSON schema. What is admitted is what a tool call needs: one flat
 * object; properties typed "string" (optionally with "enum", "minLength",
 * "maxLength"), "number", "integer" or "boolean"; and "required". Keys come out
 * in the order the schema lists them, optional keys may be skipped, and the
 * output is compact JSON with no whitespace — whitespace is left out on purpose,
 * since permitting it also permits a model to emit spaces until the token budget
 * is gone. Nested objects and arrays are rejected here rather than half-enforced
 * later. On failure returns NULL and writes the reason into err (may be NULL). */
mote_grammar *mote_grammar_compile(const mote *m, const char *schema_json,
                                   char *err, size_t err_len);

void mote_grammar_free(mote_grammar *g);

/* Generate under a grammar. With g == NULL this is mote_generate exactly.
 *
 * Generation ends when the object closes, so the callback sees the document and
 * nothing after it. If the token budget runs out first, the shortest completion
 * the schema allows is appended, which is what lets a caller treat the whole
 * stream as parseable rather than checking for a truncated tail.
 *
 * One case is refused rather than completed. If finishing would have to write
 * more of the document than the model itself chose, the result is mostly
 * invention: a well-formed tool call with values nobody picked, which is worse
 * than no tool call at all. That returns MOTE_ERR_GRAMMAR_UNSTARTED.
 *
 * Because generation streams, the callback may already have seen a partial
 * document by then. On any negative return, discard what you received; it is not
 * a document and it is not the model's answer. Check for this whenever
 * max_tokens is tight. */
int mote_generate_constrained(mote *m, const char *prompt, const mote_params *params,
                              mote_grammar *g,
                              int (*on_token)(const char *piece, void *user),
                              void *user);

/* ---- intent matching -----------------------------------------------------
 *
 * Generation is the wrong tool for most of what anyone says to a room. "lights
 * off" has one meaning, the device knew every meaning it supports before it
 * shipped, and spending a hundred forward passes to write out a tool call for
 * one of them buys nothing. So the supported commands are embedded once, at
 * build time, into a registry (tools/intent_build.c compiles a plain-text list
 * of phrasings into a blob or a C header); at run time the utterance is embedded
 * with one forward pass and compared to them by dot product. Nothing is
 * sampled, nothing is decoded, and no vector is computed on device except the
 * one for what was just said — which is the whole point of compiling, and the
 * reason this works on a chip where generation would not.
 *
 * What comes back is an index into the registry, not text, so the host acts on
 * it directly. Anything the registry does not confidently cover returns
 * MOTE_ERR_INTENT_NO_MATCH, and it is the caller's job to escalate that
 * somewhere with a bigger model rather than to guess.
 *
 * Read the numbers in tools/intent_test.c before trusting this with anything
 * physical. Mean-pooled embeddings from a small decoder are much better at
 * topic than at polarity, and "lights on" versus "lights off" is pure polarity.
 * The thresholds below are measured, not chosen, and they are the reason the
 * no-match sentinel exists at all.
 */

/* More negative returns, continuing the convention above: token counts and
 * command indices are >= 0, so every failure is a distinct negative. */
#define MOTE_ERR_INTENT_NO_MATCH  (-2)   /* nothing scored high enough        */
#define MOTE_ERR_INTENT_REGISTRY  (-3)   /* not a registry, or the wrong dim  */
#define MOTE_ERR_INTENT_EMBED     (-4)   /* the utterance did not embed       */

/* The two floors a match has to clear, taken from the measured frontier in
 * tools/intent_test.c: the lowest pair at which nothing on that set produces a
 * wrong action. They are not round numbers because they were not chosen.
 *
 * The absolute floor rejects out-of-domain speech; the margin floor rejects the
 * case an absolute floor cannot see, where two commands both score well because
 * they share vocabulary and one of them wins by accident. A physical device
 * should do nothing when the top two candidates are indistinguishable, because
 * acting on a coin flip is worse than asking again.
 *
 * Be clear about what a floor of 0.88 means, because it is the finding and not
 * a detail. A registry phrasing scores 1.000 against itself, so a floor this
 * high admits only utterances already close to verbatim in the registry: on the
 * measured set it acts on 19 of 44 in-domain utterances and refuses the rest.
 * Every held-out paraphrase that a lower floor would have caught is also a
 * paraphrase that, at that lower floor, lets a wrong action through. This is a
 * safe gate over a lookup table, not a working intent classifier, and the 57%
 * it refuses all have to be escalated. See the verdict at the top of
 * tools/intent_test.c before building anything on top of it. */
#define MOTE_INTENT_MIN_SCORE   0.88f
#define MOTE_INTENT_MIN_MARGIN  0.04f

/* Validate a registry blob and report how many commands it holds. Returns the
 * command count, or MOTE_ERR_INTENT_REGISTRY if the blob is not a registry, is
 * truncated, is a version this build does not know, or is not 4-byte aligned
 * (its vectors are read in place). Call this once at load; the match functions
 * below re-check cheaply but do not report why. */
int mote_intent_check(const void *registry, size_t len);

/* The id the registry gives command `index`, as written in the source registry
 * file, or NULL if the index is out of range. This is what the host switches
 * on, so it is worth keeping stable across rebuilds. */
const char *mote_intent_id(const void *registry, int index);

/* The vector width a registry was built at. It must equal the model's dim: a
 * registry compiled against a different model is meaningless rather than merely
 * inaccurate, so mismatches are refused instead of coerced. */
int mote_intent_dim(const void *registry);

/* Match an utterance against a registry. Returns a command index, or one of the
 * negative sentinels above. If score_out is given it receives the winning score
 * even when the answer is no-match, because a caller tuning thresholds needs to
 * see the near misses.
 *
 * Cost is one forward pass over the utterance plus a dot product per stored
 * phrasing, and no allocation that outlives the call. The registry is not
 * modified and may live in flash.
 *
 * `registry` is trusted to be a whole blob: its length comes from its own
 * header, which is what lets a baked-in C array be passed with no size
 * alongside it. Use mote_intent_check when the length is known from elsewhere,
 * such as a file on disk. */
int mote_intent_match(mote *m, const void *registry, const char *utterance,
                      float *score_out);

/* The full ranking behind that decision: up to max_out commands, best first,
 * with their scores. Returns how many were written, or a negative sentinel.
 * No threshold is applied — this is the diagnostic view, and it is what makes
 * the margin between first and second place visible to a caller that wants to
 * make its own call. */
typedef struct {
    int   command;
    float score;
} mote_intent_hit;

int mote_intent_rank(mote *m, const void *registry, const char *utterance,
                     mote_intent_hit *out, int max_out);

void mote_free(mote *m);

#ifdef __cplusplus
}
#endif

#endif /* MOTE_LIB_H */
