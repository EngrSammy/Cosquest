/* grammar.h — constrained decoding: which tokens may come next.
 *
 * Sampling normally chooses from the entire vocabulary, so a small model asked
 * for a tool call produces valid JSON only because valid JSON is likely. That is
 * not the same as guaranteed, and the failures are the expensive kind: a missing
 * brace, a key the caller never defined, an enum value invented on the spot.
 *
 * This module closes that gap. A JSON schema is compiled into a byte-level state
 * machine; at every decoding step the machine is run over each token's raw bytes
 * and the token is allowed only if all of its bytes are legal continuations. The
 * sampler then draws from the allowed set alone (see sample_constrained). A
 * malformed document is not improbable, it is unreachable.
 *
 * Deliberate limits, because a general CFG engine is not what tool calls need:
 * one flat object, keys in the order the schema lists them, values of type
 * string / number / integer / boolean / string-enum, compact output with no
 * whitespace. Nested objects and arrays are not admitted by the machine, so a
 * schema asking for one is rejected at compile time rather than half-enforced.
 */
#ifndef MOTE_GRAMMAR_H
#define MOTE_GRAMMAR_H

#include <stddef.h>

typedef struct Grammar Grammar;

/* One vocabulary entry, as the raw bytes the token decodes to. A `len` of 0
 * marks a slot the grammar may never emit: a special token like <|im_end|>, or
 * a padding id with no string behind it. Special tokens have to be excluded
 * here rather than filtered later, because inside a JSON string almost any byte
 * is legal and the machine would otherwise happily accept "<|im_end|>" as
 * ordinary text. */
typedef struct {
    const char *bytes;
    int         len;
} GrammarToken;

/* Compile a schema. Returns NULL on failure, with a reason in `err` (which may
 * be NULL if the caller does not want one). */
Grammar *grammar_compile(const char *schema_json, char *err, size_t err_len);

/* Point the grammar at the vocabulary it will mask. The table is borrowed, not
 * copied: it must outlive the grammar. Called once, because the per-first-byte
 * index built here is what keeps a 150k-token mask affordable per step. */
void grammar_bind_vocab(Grammar *g, const GrammarToken *vocab, int vocab_size);

/* Back to the start of a fresh document. */
void grammar_reset(Grammar *g);

/* Mark every token that may legally come next in allow[0..vocab_size), and
 * return how many there are. A count of 0 means the document is finished (or,
 * with a vocabulary too coarse to spell the remaining bytes, stuck). */
int grammar_mask(Grammar *g, unsigned char *allow);

/* Advance the machine over a chosen token. Returns 0 and leaves the state
 * untouched if the token is not legal here, which should not happen when the
 * caller sampled under grammar_mask. */
int grammar_accept(Grammar *g, int id);

int grammar_done(const Grammar *g);

/* Write the shortest byte string that completes the document from where the
 * machine currently stands, advancing the machine to done. This is what makes
 * the guarantee unconditional: a caller that runs out of token budget mid-object
 * still ends up with a whole document instead of a truncated one. Returns the
 * number of bytes written (0 if already done, or if `cap` is too small). */
int grammar_finish(Grammar *g, char *out, size_t cap);

/* The byte cost of grammar_finish from where the machine stands, without moving
 * it. 0 if already done, or if no completion is reachable. */
int grammar_finish_len(const Grammar *g);

void grammar_free(Grammar *g);

#endif /* MOTE_GRAMMAR_H */
