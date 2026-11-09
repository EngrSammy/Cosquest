/* mote_lib.c — the library API. See mote_lib.h.
 *
 * This is the same generation loop the CLI runs, wrapped so a host application
 * drives it: replay the prompt tokens, then sample the rest, handing each
 * decoded piece to the caller's callback.
 */
#include "mote_lib.h"

#include "model.h"
#include "tokenizer.h"
#include "bpe.h"
#include "sampler.h"
#include "grammar.h"
#include "intent.h"

#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Two tokenizer schemes coexist: the original SentencePiece-style one (TinyStories
 * / Llama) and byte-level BPE (Qwen). A tokenizer file/blob starting with "MTOK" is
 * the BPE format; anything else is the legacy format. */
struct mote {
    Transformer t;
    int         is_bpe;
    Tokenizer   tk;      /* legacy path */
    BPETokenizer *bpe;   /* Qwen path   */
    Sampler     s;
    /* Prefix KV cache: the token at position i currently held in the KV cache
     * (prompt + generated). Next turn skips the forward passes for the shared
     * prefix (fixed system prompt + unchanged history). Transparent + safe. */
    int        *kv_tokens;
    int         kv_count;
};

static int blob_is_mtok(const void *b, size_t n)
{
    return n >= 4 && memcmp(b, "MTOK", 4) == 0;
}
static int file_is_mtok(const char *path)
{
    FILE *f = fopen(path, "rb");
    if (!f) return 0;
    char m[4] = {0};
    size_t r = fread(m, 1, 4, f);
    fclose(f);
    return r == 4 && memcmp(m, "MTOK", 4) == 0;
}

mote *mote_create(const void *model, size_t model_len,
                  const void *tok, size_t tok_len)
{
    if (!model || !tok)
        return NULL;

    mote *m = calloc(1, sizeof(*m));
    if (!m)
        return NULL;

    /* Any failure here leaves mote_last_error() set, which is what the host
     * shows. Returning NULL without freeing would leak a model's worth of
     * scratch on a device already short of memory. */
    if (build_transformer_from_blob(&m->t, model, model_len) != 0) {
        free(m);
        return NULL;
    }
    m->kv_tokens = calloc((size_t)m->t.config.seq_len, sizeof(int));
    m->kv_count = 0;
    if (blob_is_mtok(tok, tok_len)) {
        m->is_bpe = 1;
        m->bpe = bpe_load_from_blob(tok, tok_len, /*own=*/0);
        if (!m->bpe) { mote_fail("the tokenizer could not be parsed"); mote_free(m); return NULL; }
    } else if (build_tokenizer_from_blob(&m->tk, tok, tok_len,
                                         m->t.config.vocab_size) != 0) {
        mote_free(m);
        return NULL;
    }
    /* defaults; overridden per call by mote_generate */
    build_sampler(&m->s, m->t.config.vocab_size, 1.0f, 0.9f, 1);
    return m;
}

mote *mote_create_from_files(const char *model_path, const char *tok_path)
{
    if (!model_path || !tok_path)
        return NULL;

    mote *m = calloc(1, sizeof(*m));
    if (!m)
        return NULL;

    if (build_transformer(&m->t, model_path) != 0) {   /* mmaps the checkpoint */
        free(m);
        return NULL;
    }
    m->kv_tokens = calloc((size_t)m->t.config.seq_len, sizeof(int));
    m->kv_count = 0;
    if (file_is_mtok(tok_path)) {
        m->is_bpe = 1;
        m->bpe = bpe_load(tok_path);
        if (!m->bpe) { mote_fail("couldn't load tokenizer %s", tok_path); mote_free(m); return NULL; }
    } else if (build_tokenizer(&m->tk, tok_path, m->t.config.vocab_size) != 0) {
        mote_free(m);
        return NULL;
    }
    build_sampler(&m->s, m->t.config.vocab_size, 1.0f, 0.9f, 1);
    return m;
}

void mote_get_info(const mote *m, mote_info_t *out)
{
    if (!m || !out)
        return;
    const Config *c = &m->t.config;
    out->dim = c->dim;
    out->hidden_dim = c->hidden_dim;
    out->n_layers = c->n_layers;
    out->n_heads = c->n_heads;
    out->n_kv_heads = c->n_kv_heads;
    out->vocab_size = c->vocab_size;
    out->seq_len = c->seq_len;
    out->quantized = m->t.quantized;
    out->qbits = m->t.qbits;
}

/* Repetition penalty over a sliding window of the tokens generated so far in
 * THIS response. Before sampling, every token in the window has its logit
 * pushed away from being picked again (divided if positive, multiplied if
 * negative). This is what stops a small model from re-answering itself
 * verbatim.
 *
 * Only generated tokens are penalized, never the prompt. Penalizing the prompt
 * suppresses exactly the words a short answer needs to echo ("what is your
 * name?" needs "name"), and under greedy decoding the argmax can then fall all
 * the way through to the end-of-turn token: the model goes silent. */
#define REPEAT_WINDOW 64

typedef struct {
    int ids[REPEAT_WINDOW];
    int n, head;
} RecentTokens;

static void recent_push(RecentTokens *r, int id)
{
    r->ids[r->head] = id;
    r->head = (r->head + 1) % REPEAT_WINDOW;
    if (r->n < REPEAT_WINDOW) r->n++;
}

static void penalize_repeats(const RecentTokens *r, float *logits, float penalty)
{
    if (penalty <= 1.0f)
        return;
    for (int i = 0; i < r->n; i++) {
        int id = r->ids[i];
        logits[id] = logits[id] > 0 ? logits[id] / penalty : logits[id] * penalty;
    }
}

/* A compiled grammar plus the two tables it needs at run time: the vocabulary
 * as raw bytes (borrowed from whichever tokenizer this engine carries) and the
 * per-step allow flags, allocated once so a step costs no allocation. */
struct mote_grammar {
    Grammar       *g;
    GrammarToken  *vocab;
    unsigned char *allow;
    int            vocab_size;
};

/* Project the tokenizer's vocabulary into raw byte strings for the grammar.
 *
 * Anything the grammar must never emit is given a length of 0: the special
 * tokens, whose text would otherwise be perfectly legal inside a JSON string,
 * and the padding slots a model's vocab_size can carry beyond the tokenizer's. */
static void grammar_vocab_view(const mote *m, GrammarToken *v, int n)
{
    for (int id = 0; id < n; id++) {
        v[id].bytes = "";
        v[id].len = 0;
    }
    if (m->is_bpe) {
        int tv = bpe_vocab_size(m->bpe);
        for (int id = 0; id < n && id < tv; id++) {
            if (bpe_is_special(m->bpe, id))
                continue;
            int len;
            const char *b = bpe_decode(m->bpe, id, &len);
            v[id].bytes = b;
            v[id].len = len;
        }
        return;
    }
    /* legacy tokenizer: ids 0..2 are unk/bos/eos, and raw bytes are spelled
     * "<0xNN>" in the vocab, so they are mapped back to the byte itself */
    for (int id = 3; id < n && id < m->tk.vocab_size; id++) {
        const char *piece = m->tk.vocab[id];
        unsigned char byte;
        if (sscanf(piece, "<0x%02hhX>", &byte) == 1)
            piece = (const char *)m->tk.byte_pieces + byte * 2;
        v[id].bytes = piece;
        v[id].len = (int)strlen(piece);
    }
}

mote_grammar *mote_grammar_compile(const mote *m, const char *schema_json,
                                   char *err, size_t err_len)
{
    if (!m) {
        if (err && err_len) snprintf(err, err_len, "no engine");
        return NULL;
    }
    Grammar *g = grammar_compile(schema_json, err, err_len);
    if (!g)
        return NULL;

    mote_grammar *mg = calloc(1, sizeof(*mg));
    if (!mg) { grammar_free(g); return NULL; }
    mg->g = g;
    mg->vocab_size = m->t.config.vocab_size;
    mg->vocab = calloc((size_t)mg->vocab_size, sizeof(GrammarToken));
    mg->allow = calloc((size_t)mg->vocab_size, 1);
    if (!mg->vocab || !mg->allow) { mote_grammar_free(mg); return NULL; }

    grammar_vocab_view(m, mg->vocab, mg->vocab_size);
    grammar_bind_vocab(g, mg->vocab, mg->vocab_size);
    return mg;
}

void mote_grammar_free(mote_grammar *mg)
{
    if (!mg)
        return;
    grammar_free(mg->g);
    free(mg->vocab);
    free(mg->allow);
    free(mg);
}

/* The document may be cut short by the token budget rather than by a closing
 * brace. Rather than hand back something unparseable, walk the machine to its
 * end and emit those bytes as one last piece. They are not fed through the
 * transformer, so they never enter the KV cache: the next turn simply finds the
 * shared prefix ending sooner and recomputes from there, which is correct. */
static void grammar_close_out(mote_grammar *mg,
                              int (*on_token)(const char *piece, void *user),
                              void *user)
{
    if (!mg || grammar_done(mg->g))
        return;
    char tail[256];
    if (grammar_finish(mg->g, tail, sizeof(tail)) > 0 && on_token)
        on_token(tail, user);
}

/* How much of the document did the model actually choose, and how much would
 * closing out invent? Token count is the wrong measure: a one-token budget still
 * yields two sampled tokens here, and grammar_finish then supplies the rest,
 * including an empty value for a required field. A well-formed tool call with a
 * blank argument is worse than no tool call at all.
 *
 * So account in bytes. If the completion has to write more of the document than
 * the model produced, the result is mostly invention and the caller gets an
 * error instead. The threshold is a judgement, not a theorem: it catches the
 * starved-budget case cleanly and leaves an ordinary run that needs only a
 * closing brace or two untouched. */
static int grammar_close_out_len(mote_grammar *mg)
{
    if (!mg || grammar_done(mg->g))
        return 0;
    return grammar_finish_len(mg->g);
}

int mote_generate(mote *m, const char *prompt, const mote_params *p,
                  int (*on_token)(const char *piece, void *user), void *user)
{
    return mote_generate_constrained(m, prompt, p, NULL, on_token, user);
}

int mote_generate_constrained(mote *m, const char *prompt, const mote_params *p,
                              mote_grammar *G,
                              int (*on_token)(const char *piece, void *user),
                              void *user)
{
    if (!m)
        return 0;
    if (!prompt)
        prompt = "";

    /* apply this call's sampling settings */
    m->s.temperature = p ? p->temperature : 1.0f;
    m->s.topp        = p ? p->topp : 0.9f;
    float repeat_penalty = p ? p->repeat_penalty : 0.0f;
    if (p && p->seed)
        m->s.rng = p->seed;

    /* max_tokens caps NEW tokens; the context budget is prompt + max_tokens,
     * never past the model's context. (Counting the prompt against the cap is
     * a trap: once the conversation history outgrows it, the loop spends the
     * whole budget replaying the prompt and generates nothing at all.) */
    int max_new = (p && p->max_tokens > 0) ? p->max_tokens : m->t.config.seq_len;

    /* every call starts a new document */
    if (G)
        grammar_reset(G->g);
    int aborted = 0;   /* the caller asked to stop; do not tidy up after them */
    long model_bytes = 0;   /* bytes the model itself chose, under a grammar */

    /* ---- byte-level BPE path (Qwen): encode the prompt, replay it, then sample.
     * Only generated tokens are emitted (the prompt is not echoed), and generation
     * stops at the end-of-turn token. ---- */
    if (m->is_bpe) {
        int cap = (int)strlen(prompt) + 8;
        int *toks = malloc((size_t)cap * sizeof(int));
        if (!toks) return 0;
        int n_prompt = bpe_encode(m->bpe, prompt, toks, cap);
        if (n_prompt < 1) { free(toks); return 0; }
        int eos = bpe_eos(m->bpe);

        long steps = (long)n_prompt + max_new;
        if (steps > m->t.config.seq_len)
            steps = m->t.config.seq_len;

        /* Prefix KV cache: reuse the KV for the longest prompt prefix shared
         * with the previous turn; reprocess at least the final prompt token so
         * there are fresh logits. Reused KV is bit-identical to recomputing, so
         * output is unchanged — purely a speed win. */
        int start = 0;
        if (m->kv_tokens) {
            int max_common = n_prompt < m->kv_count ? n_prompt : m->kv_count;
            while (start < max_common && toks[start] == m->kv_tokens[start])
                start++;
            if (start > n_prompt - 1) start = n_prompt - 1;
        }

        int token = toks[start], pos = start, generated = 0;
        char piecebuf[64];
        RecentTokens recent = { {0}, 0, 0 };
        while (pos < steps) {
            if (m->kv_tokens && pos < m->t.config.seq_len)
                m->kv_tokens[pos] = token;
            float *logits = forward(&m->t, token, pos);
            pos++;
            int next;
            if (pos < n_prompt) {
                next = toks[pos];            /* still replaying the prompt */
            } else if (G) {
                /* The mask is rebuilt every step because what is legal depends
                 * on how far into the document the model already is. No
                 * turn-ender guard is needed here: the special tokens are not in
                 * the grammar's vocabulary at all, so they cannot be drawn.
                 *
                 * The repetition penalty is deliberately not applied under a
                 * grammar. It exists to stop a small model re-answering itself,
                 * but structured output repeats by design — every field brings
                 * another quote, colon and comma — so penalizing what was just
                 * seen would fight the schema instead of the looping. The
                 * grammar already bounds the document, which is what the
                 * penalty was standing in for. */
                if (grammar_mask(G->g, G->allow) == 0) break;
                next = sample_constrained(&m->s, logits, G->allow);
                grammar_accept(G->g, next);
                int len; const char *piece = bpe_decode(m->bpe, next, &len);
                if (len >= (int)sizeof(piecebuf)) len = sizeof(piecebuf) - 1;
                memcpy(piecebuf, piece, len); piecebuf[len] = '\0';
                generated++;
                model_bytes += len;
                recent_push(&recent, next);
                if (on_token && !on_token(piecebuf, user)) { aborted = 1; break; }
                if (grammar_done(G->g)) break;   /* the object closed: done */
            } else {
                penalize_repeats(&recent, logits, repeat_penalty);
                next = sample(&m->s, logits);
                /* an empty reply is never the right answer: while nothing has
                 * been said, a sampled turn-ender is suppressed and redrawn.
                 * (Under greedy this is an exact re-argmax; under temperature,
                 * sample() has already softmaxed the buffer, so the redraw
                 * renormalizes — order is preserved, the banned token drops
                 * to zero, close enough for a guard that rarely fires.) */
                while (generated == 0 && (next == eos || bpe_is_special(m->bpe, next))) {
                    logits[next] = -1e30f;
                    next = sample(&m->s, logits);
                }
                /* any special token (eos, end-of-turn, a fake new turn) ends
                 * the assistant's turn */
                if (next == eos || bpe_is_special(m->bpe, next)) break;
                int len; const char *piece = bpe_decode(m->bpe, next, &len);
                if (len >= (int)sizeof(piecebuf)) len = sizeof(piecebuf) - 1;
                memcpy(piecebuf, piece, len); piecebuf[len] = '\0';
                generated++;
                recent_push(&recent, next);
                if (on_token && !on_token(piecebuf, user)) break;
            }
            token = next;
        }
        if (m->kv_tokens) m->kv_count = pos;   /* KV now valid for [0, pos) */
        free(toks);
        if (G && grammar_close_out_len(G) > model_bytes)
            return MOTE_ERR_GRAMMAR_UNSTARTED;
        if (G && !aborted)
            grammar_close_out(G, on_token, user);
        return generated;
    }

    int *prompt_tokens = malloc((strlen(prompt) + 3) * sizeof(int));
    if (!prompt_tokens)
        return 0;
    int n_prompt = 0;
    encode(&m->tk, prompt, /*bos=*/1, /*eos=*/0, prompt_tokens, &n_prompt);
    if (n_prompt < 1) {
        free(prompt_tokens);
        return 0;
    }

    long steps = (long)n_prompt + max_new;
    if (steps > m->t.config.seq_len)
        steps = m->t.config.seq_len;

    int token = prompt_tokens[0];
    int pos = 0, generated = 0;
    RecentTokens recent = { {0}, 0, 0 };
    while (pos < steps) {
        float *logits = forward(&m->t, token, pos);

        int next;
        if (pos < n_prompt - 1) {
            next = prompt_tokens[pos + 1];
        } else {
            if (G) {
                /* no repetition penalty under a grammar; see the note above */
                if (grammar_mask(G->g, G->allow) == 0) break;
                next = sample_constrained(&m->s, logits, G->allow);
                grammar_accept(G->g, next);
            } else {
                penalize_repeats(&recent, logits, repeat_penalty);
                next = sample(&m->s, logits);
            }
            recent_push(&recent, next);
        }
        pos++;

        if (next == 1)   /* BOS marks the end for these models */
            break;

        const char *piece = decode(&m->tk, token, next);
        if (G && piece && pos >= n_prompt) model_bytes += (long)strlen(piece);
        token = next;
        generated++;
        /* This path has always echoed the prompt back as it replays it. Under a
         * grammar it must not: the promise is that the callback sees the
         * document and nothing else, and the prompt is not part of it. */
        int emit = !G || pos >= n_prompt;
        if (piece && emit && on_token && !on_token(piece, user)) {
            aborted = 1;
            break;   /* caller asked to stop */
        }
        if (G && grammar_done(G->g))
            break;
    }

    free(prompt_tokens);
    if (G && grammar_close_out_len(G) > model_bytes)
        return MOTE_ERR_GRAMMAR_UNSTARTED;
    if (G && !aborted)
        grammar_close_out(G, on_token, user);
    return generated;
}

int mote_embed(mote *m, const char *text, float *out)
{
    if (!m || !text || !out)
        return 0;
    int dim = m->t.config.dim;

    /* tokenize with whichever tokenizer this model carries */
    int cap = (int)strlen(text) + 8;
    int *toks = malloc((size_t)cap * sizeof(int));
    if (!toks)
        return 0;
    int n;
    if (m->is_bpe) {
        n = bpe_encode(m->bpe, text, toks, cap);
    } else {
        n = 0;
        encode(&m->tk, text, /*bos=*/1, /*eos=*/0, toks, &n);
    }
    if (n < 1) { free(toks); return 0; }
    if (n > m->t.config.seq_len) n = m->t.config.seq_len;

    /* Embedding reuses the shared forward pass, which writes the KV cache at
     * positions [0, n) — the same slots the generation prefix cache relies on.
     * Save those slots, run the embed, then restore them, so an embed call is
     * invisible to the next generate() (its cached prefix survives intact). */
    int kv_dim = (m->t.config.dim * m->t.config.n_kv_heads) / m->t.config.n_heads;
    long L = m->t.config.n_layers, seqlen = m->t.config.seq_len;
    size_t slot = (size_t)L * n * kv_dim;
    float *ksave = malloc(slot * sizeof(float));
    float *vsave = malloc(slot * sizeof(float));
    if (ksave && vsave) {
        for (long l = 0; l < L; l++) {
            memcpy(ksave + (size_t)l * n * kv_dim,
                   m->t.state.key_cache + (size_t)l * seqlen * kv_dim, (size_t)n * kv_dim * sizeof(float));
            memcpy(vsave + (size_t)l * n * kv_dim,
                   m->t.state.value_cache + (size_t)l * seqlen * kv_dim, (size_t)n * kv_dim * sizeof(float));
        }
    }

    /* run the text through and mean-pool the final hidden state at every
     * position. forward() leaves that state (post final norm) in state.x. */
    for (int i = 0; i < dim; i++)
        out[i] = 0.0f;
    for (int pos = 0; pos < n; pos++) {
        forward(&m->t, toks[pos], pos);
        const float *h = m->t.state.x;
        for (int i = 0; i < dim; i++)
            out[i] += h[i];
    }
    free(toks);

    if (ksave && vsave) {
        for (long l = 0; l < L; l++) {
            memcpy(m->t.state.key_cache + (size_t)l * seqlen * kv_dim,
                   ksave + (size_t)l * n * kv_dim, (size_t)n * kv_dim * sizeof(float));
            memcpy(m->t.state.value_cache + (size_t)l * seqlen * kv_dim,
                   vsave + (size_t)l * n * kv_dim, (size_t)n * kv_dim * sizeof(float));
        }
    }
    free(ksave);
    free(vsave);

    /* L2-normalize so retrieval is a plain dot product */
    float ss = 0.0f;
    for (int i = 0; i < dim; i++)
        ss += out[i] * out[i];
    float inv = ss > 0.0f ? 1.0f / sqrtf(ss) : 0.0f;
    for (int i = 0; i < dim; i++)
        out[i] *= inv;
    return dim;
}

/* ---- intent matching ----
 *
 * All the work happened at build time. What is left is one embed of the
 * utterance and a dot product per stored phrasing, which is why this path costs
 * roughly what a single token of generation costs, once, instead of a hundred
 * of them.
 */

/* Open a registry whose length is only known from its own header. The header is
 * fixed-size and the first field is a magic number, so the worst a non-registry
 * can do is fail that check; a registry that claims a length longer than it has
 * is caught by intent_open's own bounds arithmetic against that same claim,
 * which is as far as trust can be pushed without a size from the caller. */
static int intent_open_selfsized(const void *registry, IntentRegistry *r)
{
    if (!registry || ((uintptr_t)registry & 3u) != 0)
        return 0;
    const unsigned char *b = (const unsigned char *)registry;
    if (memcmp(b, INTENT_MAGIC, 4) != 0)
        return 0;
    size_t total = (size_t)b[28] | ((size_t)b[29] << 8) |
                   ((size_t)b[30] << 16) | ((size_t)b[31] << 24);
    if (total < INTENT_HEADER_LEN)
        return 0;
    return intent_open(registry, total, r);
}

int mote_intent_check(const void *registry, size_t len)
{
    IntentRegistry r;
    if (!intent_open(registry, len, &r))
        return MOTE_ERR_INTENT_REGISTRY;
    return r.n_commands;
}

const char *mote_intent_id(const void *registry, int index)
{
    IntentRegistry r;
    if (!intent_open_selfsized(registry, &r))
        return NULL;
    if (index < 0 || index >= r.n_commands)
        return NULL;
    return r.commands[index].id;
}

int mote_intent_dim(const void *registry)
{
    IntentRegistry r;
    if (!intent_open_selfsized(registry, &r))
        return MOTE_ERR_INTENT_REGISTRY;
    return r.dim;
}

/* Score every command, then order them. Shared by rank and match so the two can
 * never disagree about who won. */
static int intent_ranked(mote *m, const void *registry, const char *utterance,
                         mote_intent_hit *out, int max_out)
{
    IntentRegistry r;
    if (!m || !utterance || !out || max_out < 1)
        return MOTE_ERR_INTENT_REGISTRY;
    if (!intent_open_selfsized(registry, &r))
        return MOTE_ERR_INTENT_REGISTRY;
    /* a registry built against another model is not slightly wrong, it is
     * comparing unrelated coordinate systems */
    if (r.dim != m->t.config.dim)
        return MOTE_ERR_INTENT_REGISTRY;

    float *q = malloc((size_t)r.dim * sizeof(float));
    float *scores = malloc((size_t)r.n_commands * sizeof(float));
    if (!q || !scores) { free(q); free(scores); return MOTE_ERR_INTENT_EMBED; }

    if (mote_embed(m, utterance, q) != r.dim) {
        free(q); free(scores);
        return MOTE_ERR_INTENT_EMBED;
    }
    intent_prepare_query(&r, q);
    intent_score(&r, q, scores, NULL);

    /* selection sort into the caller's buffer: n_commands is a few dozen, and a
     * partial sort of the top max_out is all that is asked for anyway */
    int n = r.n_commands < max_out ? r.n_commands : max_out;
    for (int i = 0; i < n; i++) {
        int best = -1;
        for (int c = 0; c < r.n_commands; c++) {
            if (scores[c] == -3.0f)          /* already taken */
                continue;
            if (best < 0 || scores[c] > scores[best])
                best = c;
        }
        out[i].command = best;
        out[i].score = scores[best];
        scores[best] = -3.0f;                /* below any cosine, and unique */
    }
    free(q);
    free(scores);
    return n;
}

int mote_intent_rank(mote *m, const void *registry, const char *utterance,
                     mote_intent_hit *out, int max_out)
{
    return intent_ranked(m, registry, utterance, out, max_out);
}

int mote_intent_match(mote *m, const void *registry, const char *utterance,
                      float *score_out)
{
    mote_intent_hit top[2];
    int n = intent_ranked(m, registry, utterance, top, 2);
    if (n < 1)
        return n;                            /* pass the sentinel through */
    if (score_out)
        *score_out = top[0].score;

    /* Both floors, and the margin one is not optional. Out-of-domain speech is
     * caught by the absolute score; a command confused with its own opposite is
     * not, because both of them score well. See tools/intent_test.c. */
    if (top[0].score < MOTE_INTENT_MIN_SCORE)
        return MOTE_ERR_INTENT_NO_MATCH;
    if (n > 1 && top[0].score - top[1].score < MOTE_INTENT_MIN_MARGIN)
        return MOTE_ERR_INTENT_NO_MATCH;
    return top[0].command;
}

void mote_free(mote *m)
{
    if (!m)
        return;
    free_sampler(&m->s);
    if (m->is_bpe)
        bpe_free(m->bpe);
    else
        free_tokenizer(&m->tk);
    free_transformer(&m->t);
    free(m);
}
