/* sampler.h — turn a row of logits into the next token.
 *
 * Temperature 0 is greedy (argmax). Otherwise the logits are softmaxed and a
 * token is drawn, either from the full distribution or, with top-p, from the
 * smallest set of most-likely tokens whose mass clears p.
 */
#ifndef MOTE_SAMPLER_H
#define MOTE_SAMPLER_H

typedef struct {
    float prob;
    int index;
} ProbIndex;

typedef struct {
    int vocab_size;
    ProbIndex *probindex;      /* scratch for top-p                    */
    float temperature;
    float topp;
    unsigned long long rng;    /* xorshift state                       */
} Sampler;

void build_sampler(Sampler *s, int vocab_size, float temperature,
                   float topp, unsigned long long seed);
void free_sampler(Sampler *s);

/* Consumes (and may reorder) the logits buffer; returns the chosen token id. */
int sample(Sampler *s, float *logits);

/* The same draw, restricted to the tokens `allow` marks (allow[id] != 0). This
 * is the hook constrained decoding hangs off: a grammar decides what is legal
 * next, the masked-out logits are pushed below anything reachable, and the draw
 * proceeds exactly as it would have otherwise. Passing NULL is sample(), byte
 * for byte, so the unconstrained path costs one branch and nothing else. The
 * caller must ensure at least one token is allowed. */
int sample_constrained(Sampler *s, float *logits, const unsigned char *allow);

#endif /* MOTE_SAMPLER_H */
