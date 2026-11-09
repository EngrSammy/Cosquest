/* grammar.c — the schema compiler and the byte-level state machine. See grammar.h.
 *
 * Two halves. The first parses a JSON-schema subset into a flat list of fields
 * (name, type, whether it is required, its enum values). The second is a state
 * machine over bytes: given the state, `step` says whether a byte may come next
 * and where it lands. Everything above it — masking a whole vocabulary, forcing
 * a completion — is a loop over that one function.
 */
#include "grammar.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define G_MAX_FIELDS   64      /* the candidate-key bitmask is 64 bits wide  */
#define G_MAX_ENUMS    64      /* same trick for the candidate enum values   */
#define G_MAX_NAME     64
#define G_STR_DEFAULT 128      /* string bound when the schema gives none    */
#define G_STR_MAX    4096      /* and the ceiling, since the counter is short */
#define G_NUM_DIGITS   24      /* digits per number, so a run cannot go on   */
#define G_EXP_DIGITS    4      /* forever and starve the token budget        */

typedef enum { T_STRING, T_NUMBER, T_INTEGER, T_BOOLEAN, T_ENUM } FieldType;

typedef struct {
    char      name[G_MAX_NAME];
    int       namelen;
    FieldType type;
    int       required;
    int       n_enum;
    char     *enums[G_MAX_ENUMS];
    int       enumlen[G_MAX_ENUMS];
    int       min_len, max_len;   /* string bounds, in bytes */
} Field;

/* Where the machine is. Small and copyable by value, which is the whole point:
 * masking speculatively runs a copy over a candidate token's bytes and throws
 * it away. */
typedef enum {
    S_OPEN,             /* expecting '{'                                    */
    S_KEY_OR_CLOSE,     /* a key, or '}' because nothing is still required   */
    S_KEY,              /* a key, mandatory (we just consumed a comma)       */
    S_KEYBODY,          /* inside a key, narrowing the candidate set         */
    S_COLON,
    S_STR_OPEN, S_STR_BODY, S_STR_ESC, S_STR_HEX,
    S_ENUM_OPEN, S_ENUM_BODY,
    S_LIT,              /* a bare literal: true / false                      */
    S_NUM_SIGN, S_NUM_FIRST, S_NUM_ZERO, S_NUM_INT,
    S_NUM_FRAC_FIRST, S_NUM_FRAC,
    S_NUM_EXP, S_NUM_EXP_FIRST, S_NUM_EXP_INT,
    S_COMMA_OR_CLOSE,
    S_DONE
} GNode;

typedef struct {
    unsigned char      node;
    short              slot;   /* field being filled, or the next to consider */
    unsigned long long cand;   /* live key / enum / literal candidates         */
    short              ci;     /* bytes matched into those candidates          */
    short              n;      /* string length, or digits so far              */
} GState;

struct Grammar {
    Field  fields[G_MAX_FIELDS];
    int    n_fields;

    const GrammarToken *vocab;
    int    vocab_size;
    /* Two side tables, one byte per token, so a whole-vocabulary mask is two
     * sequential passes over ~150KB rather than a scatter through the megabytes
     * of the vocabulary itself. `tlen` is the token's length clamped to 255, or
     * 0 for a token the grammar may never emit; `tfirst` is its first byte. */
    unsigned char *tlen;
    unsigned char *tfirst;

    GState st;
};

static const char *const bool_lits[2] = { "true", "false" };

/* ------------------------------------------------------------------ schema */

typedef struct { const char *p, *end; } JS;

static void js_ws(JS *j)
{
    while (j->p < j->end && (*j->p == ' ' || *j->p == '\t' ||
                             *j->p == '\n' || *j->p == '\r'))
        j->p++;
}
static int js_peek(JS *j)
{
    js_ws(j);
    return j->p < j->end ? (unsigned char)*j->p : -1;
}
static int js_eat(JS *j, char c)
{
    if (js_peek(j) == (unsigned char)c) { j->p++; return 1; }
    return 0;
}

/* Parse a JSON string literal into `out`. The escapes a hand-written schema
 * actually contains are supported; \u is not, because a tool-call key spelled
 * with a surrogate pair is a problem nobody has. */
static int js_string(JS *j, char *out, int cap, int *outlen)
{
    if (!js_eat(j, '"')) return 0;
    int n = 0;
    while (j->p < j->end && *j->p != '"') {
        char c = *j->p++;
        if (c == '\\') {
            if (j->p >= j->end) return 0;
            char e = *j->p++;
            switch (e) {
            case '"':  c = '"';  break;
            case '\\': c = '\\'; break;
            case '/':  c = '/';  break;
            case 'b':  c = '\b'; break;
            case 'f':  c = '\f'; break;
            case 'n':  c = '\n'; break;
            case 'r':  c = '\r'; break;
            case 't':  c = '\t'; break;
            default:   return 0;
            }
        }
        if (n >= cap - 1) return 0;
        out[n++] = c;
    }
    if (j->p >= j->end) return 0;
    j->p++;                       /* closing quote */
    out[n] = '\0';
    if (outlen) *outlen = n;
    return 1;
}

static int js_int(JS *j, int *out)
{
    js_ws(j);
    int sign = 1, got = 0;
    long v = 0;
    if (j->p < j->end && *j->p == '-') { sign = -1; j->p++; }
    while (j->p < j->end && *j->p >= '0' && *j->p <= '9') {
        v = v * 10 + (*j->p++ - '0');
        got = 1;
        if (v > 1000000) v = 1000000;
    }
    if (!got) return 0;
    /* a fractional part is legal JSON but meaningless for a length bound */
    while (j->p < j->end && (*j->p == '.' || (*j->p >= '0' && *j->p <= '9') ||
                             *j->p == 'e' || *j->p == 'E' ||
                             *j->p == '+' || *j->p == '-'))
        j->p++;
    *out = (int)(sign * v);
    return 1;
}

static int js_skip(JS *j)
{
    int c = js_peek(j);
    if (c < 0) return 0;
    if (c == '"') { char t[256]; return js_string(j, t, sizeof(t), NULL); }
    if (c == '{' || c == '[') {
        char open = (char)c, close = c == '{' ? '}' : ']';
        j->p++;
        if (js_eat(j, close)) return 1;
        for (;;) {
            if (open == '{') {
                char t[256];
                if (!js_string(j, t, sizeof(t), NULL)) return 0;
                if (!js_eat(j, ':')) return 0;
            }
            if (!js_skip(j)) return 0;
            if (js_eat(j, ',')) continue;
            return js_eat(j, close);
        }
    }
    /* a bare token: number, true, false, null */
    js_ws(j);
    const char *s = j->p;
    while (j->p < j->end && *j->p != ',' && *j->p != '}' && *j->p != ']' &&
           *j->p != ' ' && *j->p != '\n' && *j->p != '\t' && *j->p != '\r')
        j->p++;
    return j->p > s;
}

static void gerr(char *err, size_t cap, const char *msg, const char *what)
{
    if (!err || cap == 0) return;
    if (what) snprintf(err, cap, "%s: %s", msg, what);
    else      snprintf(err, cap, "%s", msg);
}

/* one member of "properties": its type, and its enum if it has one */
static int parse_prop(JS *j, Field *f, char *err, size_t errcap)
{
    f->type = T_STRING;
    f->min_len = 0;
    f->max_len = G_STR_DEFAULT;
    f->n_enum = 0;
    int saw_type = 0;
    char typebuf[32] = {0};

    if (!js_eat(j, '{')) { gerr(err, errcap, "property is not an object", f->name); return 0; }
    if (!js_eat(j, '}')) {
        for (;;) {
            char key[64];
            if (!js_string(j, key, sizeof(key), NULL)) { gerr(err, errcap, "bad property key in", f->name); return 0; }
            if (!js_eat(j, ':')) { gerr(err, errcap, "expected ':' in", f->name); return 0; }
            if (strcmp(key, "type") == 0) {
                if (!js_string(j, typebuf, sizeof(typebuf), NULL)) { gerr(err, errcap, "bad type in", f->name); return 0; }
                saw_type = 1;
            } else if (strcmp(key, "enum") == 0) {
                if (!js_eat(j, '[')) { gerr(err, errcap, "enum is not an array in", f->name); return 0; }
                for (;;) {
                    char v[G_MAX_NAME];
                    int vlen = 0;
                    if (!js_string(j, v, sizeof(v), &vlen)) { gerr(err, errcap, "enum value is not a string in", f->name); return 0; }
                    if (vlen == 0) { gerr(err, errcap, "empty enum value in", f->name); return 0; }
                    if (f->n_enum >= G_MAX_ENUMS) { gerr(err, errcap, "too many enum values in", f->name); return 0; }
                    /* the machine matches enum bytes literally, so a value that
                     * would need escaping inside a JSON string is unreachable
                     * and better refused now than silently dropped */
                    for (int i = 0; i < vlen; i++) {
                        unsigned char c = (unsigned char)v[i];
                        if (c == '"' || c == '\\' || c < 0x20) {
                            gerr(err, errcap, "enum value needs escaping in", f->name); return 0;
                        }
                    }
                    f->enums[f->n_enum] = malloc((size_t)vlen + 1);
                    if (!f->enums[f->n_enum]) return 0;
                    memcpy(f->enums[f->n_enum], v, (size_t)vlen + 1);
                    f->enumlen[f->n_enum] = vlen;
                    f->n_enum++;
                    if (js_eat(j, ',')) continue;
                    if (!js_eat(j, ']')) { gerr(err, errcap, "unterminated enum in", f->name); return 0; }
                    break;
                }
            } else if (strcmp(key, "maxLength") == 0) {
                if (!js_int(j, &f->max_len)) { gerr(err, errcap, "bad maxLength in", f->name); return 0; }
            } else if (strcmp(key, "minLength") == 0) {
                if (!js_int(j, &f->min_len)) { gerr(err, errcap, "bad minLength in", f->name); return 0; }
            } else if (!js_skip(j)) {
                gerr(err, errcap, "unparsable member in", f->name); return 0;
            }
            if (js_eat(j, ',')) continue;
            if (!js_eat(j, '}')) { gerr(err, errcap, "unterminated property", f->name); return 0; }
            break;
        }
    }

    if (f->n_enum > 0) {
        f->type = T_ENUM;               /* an enum outranks whatever "type" said */
    } else if (saw_type) {
        if      (strcmp(typebuf, "string")  == 0) f->type = T_STRING;
        else if (strcmp(typebuf, "number")  == 0) f->type = T_NUMBER;
        else if (strcmp(typebuf, "integer") == 0) f->type = T_INTEGER;
        else if (strcmp(typebuf, "boolean") == 0) f->type = T_BOOLEAN;
        else { gerr(err, errcap, "unsupported property type", typebuf); return 0; }
    }
    if (f->max_len < 1) f->max_len = G_STR_DEFAULT;
    if (f->max_len > G_STR_MAX) f->max_len = G_STR_MAX;   /* the state's length
                                     counter is a short; a schema asking for more
                                     gets the ceiling rather than an overflow */
    if (f->min_len < 0) f->min_len = 0;
    if (f->min_len > f->max_len) f->min_len = f->max_len;
    return 1;
}

Grammar *grammar_compile(const char *schema_json, char *err, size_t err_len)
{
    if (err && err_len) err[0] = '\0';
    if (!schema_json) { gerr(err, err_len, "no schema", NULL); return NULL; }

    Grammar *g = calloc(1, sizeof(*g));
    if (!g) return NULL;

    JS js = { schema_json, schema_json + strlen(schema_json) };
    JS *j = &js;

    /* "required" may appear before "properties", so the names are collected and
     * matched up at the end rather than resolved where they are read */
    char req[G_MAX_FIELDS][G_MAX_NAME];
    int  n_req = 0;
    int  saw_props = 0;

    if (!js_eat(j, '{')) { gerr(err, err_len, "schema is not an object", NULL); goto fail; }
    if (!js_eat(j, '}')) {
        for (;;) {
            char key[64];
            if (!js_string(j, key, sizeof(key), NULL)) { gerr(err, err_len, "bad schema key", NULL); goto fail; }
            if (!js_eat(j, ':')) { gerr(err, err_len, "expected ':' after schema key", key); goto fail; }

            if (strcmp(key, "properties") == 0) {
                saw_props = 1;
                if (!js_eat(j, '{')) { gerr(err, err_len, "properties is not an object", NULL); goto fail; }
                if (!js_eat(j, '}')) {
                    for (;;) {
                        if (g->n_fields >= G_MAX_FIELDS) { gerr(err, err_len, "too many properties", NULL); goto fail; }
                        Field *f = &g->fields[g->n_fields];
                        if (!js_string(j, f->name, G_MAX_NAME, &f->namelen)) { gerr(err, err_len, "bad property name", NULL); goto fail; }
                        if (f->namelen == 0) { gerr(err, err_len, "empty property name", NULL); goto fail; }
                        for (int i = 0; i < f->namelen; i++) {
                            unsigned char c = (unsigned char)f->name[i];
                            if (c == '"' || c == '\\' || c < 0x20) {
                                gerr(err, err_len, "property name needs escaping", f->name); goto fail;
                            }
                        }
                        for (int i = 0; i < g->n_fields; i++)
                            if (strcmp(g->fields[i].name, f->name) == 0) {
                                gerr(err, err_len, "duplicate property", f->name); goto fail;
                            }
                        if (!js_eat(j, ':')) { gerr(err, err_len, "expected ':' after property", f->name); goto fail; }
                        if (!parse_prop(j, f, err, err_len)) goto fail;
                        g->n_fields++;
                        if (js_eat(j, ',')) continue;
                        if (!js_eat(j, '}')) { gerr(err, err_len, "unterminated properties", NULL); goto fail; }
                        break;
                    }
                }
            } else if (strcmp(key, "required") == 0) {
                if (!js_eat(j, '[')) { gerr(err, err_len, "required is not an array", NULL); goto fail; }
                if (!js_eat(j, ']')) {
                    for (;;) {
                        if (n_req >= G_MAX_FIELDS) { gerr(err, err_len, "too many required names", NULL); goto fail; }
                        if (!js_string(j, req[n_req], G_MAX_NAME, NULL)) { gerr(err, err_len, "bad required name", NULL); goto fail; }
                        n_req++;
                        if (js_eat(j, ',')) continue;
                        if (!js_eat(j, ']')) { gerr(err, err_len, "unterminated required", NULL); goto fail; }
                        break;
                    }
                }
            } else if (strcmp(key, "type") == 0) {
                char t[32];
                if (!js_string(j, t, sizeof(t), NULL)) { gerr(err, err_len, "bad schema type", NULL); goto fail; }
                if (strcmp(t, "object") != 0) { gerr(err, err_len, "only an object schema is supported, not", t); goto fail; }
            } else if (!js_skip(j)) {
                gerr(err, err_len, "unparsable schema member", key); goto fail;
            }

            if (js_eat(j, ',')) continue;
            if (!js_eat(j, '}')) { gerr(err, err_len, "unterminated schema", NULL); goto fail; }
            break;
        }
    }
    if (!saw_props || g->n_fields == 0) { gerr(err, err_len, "schema has no properties", NULL); goto fail; }

    for (int r = 0; r < n_req; r++) {
        int hit = 0;
        for (int i = 0; i < g->n_fields; i++)
            if (strcmp(g->fields[i].name, req[r]) == 0) { g->fields[i].required = 1; hit = 1; }
        if (!hit) { gerr(err, err_len, "required name is not a property", req[r]); goto fail; }
    }

    grammar_reset(g);
    return g;

fail:
    grammar_free(g);
    return NULL;
}

void grammar_free(Grammar *g)
{
    if (!g) return;
    for (int i = 0; i < g->n_fields; i++)
        for (int e = 0; e < g->fields[i].n_enum; e++)
            free(g->fields[i].enums[e]);
    free(g->tlen);
    free(g->tfirst);
    free(g);
}

/* ------------------------------------------------------------------ machine */

/* '}' is legal exactly when nothing from `slot` onwards is still owed */
static int all_optional_from(const Grammar *g, int slot)
{
    for (int i = slot; i < g->n_fields; i++)
        if (g->fields[i].required) return 0;
    return 1;
}

/* Keys are emitted in schema order, so from `slot` the reachable keys are field
 * `slot` and any later field whose skipped predecessors are all optional. */
static unsigned long long key_cand_at(const Grammar *g, int slot)
{
    unsigned long long m = 0;
    for (int i = slot; i < g->n_fields; i++) {
        m |= 1ULL << i;
        if (g->fields[i].required) break;
    }
    return m;
}

static int cand_count(const Grammar *g, const GState *st)
{
    switch (st->node) {
    case S_KEYBODY:  return g->n_fields;
    case S_ENUM_BODY: return g->fields[st->slot].n_enum;
    default:         return 2;                       /* true / false */
    }
}

static const char *cand_str(const Grammar *g, const GState *st, int i, int *len)
{
    switch (st->node) {
    case S_KEYBODY:
        *len = g->fields[i].namelen;
        return g->fields[i].name;
    case S_ENUM_BODY:
        *len = g->fields[st->slot].enumlen[i];
        return g->fields[st->slot].enums[i];
    default:
        *len = i == 0 ? 4 : 5;
        return bool_lits[i];
    }
}

/* narrow the live candidates by one byte */
static int lit_step(const Grammar *g, GState *st, unsigned char c)
{
    unsigned long long next = 0;
    int nc = cand_count(g, st);
    for (int i = 0; i < nc; i++) {
        if (!((st->cand >> i) & 1ULL)) continue;
        int len;
        const char *s = cand_str(g, st, i, &len);
        if (st->ci < len && (unsigned char)s[st->ci] == c)
            next |= 1ULL << i;
    }
    if (!next) return 0;
    st->cand = next;
    st->ci++;
    return 1;
}

/* is some live candidate exactly spelled out? distinct names cannot both be, so
 * the winner is unambiguous even when one is a prefix of another */
static int lit_complete(const Grammar *g, const GState *st, int *which)
{
    int nc = cand_count(g, st);
    for (int i = 0; i < nc; i++) {
        if (!((st->cand >> i) & 1ULL)) continue;
        int len;
        cand_str(g, st, i, &len);
        if (len == st->ci) { if (which) *which = i; return 1; }
    }
    return 0;
}

static int is_digit(unsigned char c) { return c >= '0' && c <= '9'; }
static int is_hex(unsigned char c)
{
    return is_digit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
}

static void enter_value(const Grammar *g, GState *st)
{
    const Field *f = &g->fields[st->slot];
    st->ci = 0;
    st->n  = 0;
    switch (f->type) {
    case T_STRING:  st->node = S_STR_OPEN;  break;
    case T_ENUM:    st->node = S_ENUM_OPEN; break;
    case T_BOOLEAN: st->node = S_LIT; st->cand = 0x3ULL; break;
    default:        st->node = S_NUM_SIGN;  break;
    }
}

static int step(const Grammar *g, GState *st, unsigned char c);

/* A number ends when something that is not part of it arrives, so the byte is
 * handed straight to the state that follows the value. */
static int num_end(const Grammar *g, GState *st, unsigned char c)
{
    st->node = S_COMMA_OR_CLOSE;
    st->slot++;
    return step(g, st, c);
}

/* Advance one byte. Returns 0 if the byte is illegal here, in which case *st is
 * left in an undefined state — every caller works on a copy. */
static int step(const Grammar *g, GState *st, unsigned char c)
{
    switch (st->node) {

    case S_OPEN:
        if (c != '{') return 0;
        st->slot = 0;
        st->node = all_optional_from(g, 0) ? S_KEY_OR_CLOSE : S_KEY;
        return 1;

    case S_KEY_OR_CLOSE:
    case S_KEY:
        if (st->node == S_KEY_OR_CLOSE && c == '}') { st->node = S_DONE; return 1; }
        if (c != '"') return 0;
        st->cand = key_cand_at(g, st->slot);
        if (!st->cand) return 0;
        st->ci = 0;
        st->node = S_KEYBODY;
        return 1;

    case S_KEYBODY:
        if (c == '"') {
            int which;
            if (!lit_complete(g, st, &which)) return 0;
            st->slot = (short)which;
            st->node = S_COLON;
            return 1;
        }
        return lit_step(g, st, c);

    case S_COLON:
        if (c != ':') return 0;
        enter_value(g, st);
        return 1;

    case S_STR_OPEN:
        if (c != '"') return 0;
        st->node = S_STR_BODY;
        st->n = 0;
        return 1;

    case S_STR_BODY: {
        const Field *f = &g->fields[st->slot];
        if (c == '"') {
            if (st->n < f->min_len) return 0;
            st->node = S_COMMA_OR_CLOSE;
            st->slot++;
            return 1;
        }
        if (st->n >= f->max_len) return 0;      /* bound reached: only closing */
        if (c == '\\') { st->node = S_STR_ESC; return 1; }
        if (c < 0x20) return 0;                 /* raw control bytes are not JSON */
        st->n++;
        return 1;
    }

    case S_STR_ESC:
        switch (c) {
        case '"': case '\\': case '/': case 'b':
        case 'f': case 'n':  case 'r':  case 't':
            st->node = S_STR_BODY;
            st->n++;
            return 1;
        case 'u':
            st->node = S_STR_HEX;
            st->ci = 0;
            return 1;
        }
        return 0;

    case S_STR_HEX:
        if (!is_hex(c)) return 0;
        if (++st->ci == 4) { st->node = S_STR_BODY; st->n++; }
        return 1;

    case S_ENUM_OPEN: {
        if (c != '"') return 0;
        int ne = g->fields[st->slot].n_enum;
        st->node = S_ENUM_BODY;
        st->cand = ne >= 64 ? ~0ULL : ((1ULL << ne) - 1ULL);
        st->ci = 0;
        return 1;
    }

    case S_ENUM_BODY:
        if (c == '"') {
            if (!lit_complete(g, st, NULL)) return 0;
            st->node = S_COMMA_OR_CLOSE;
            st->slot++;
            return 1;
        }
        return lit_step(g, st, c);

    case S_LIT:
        if (!lit_step(g, st, c)) return 0;
        if (lit_complete(g, st, NULL)) { st->node = S_COMMA_OR_CLOSE; st->slot++; }
        return 1;

    case S_NUM_SIGN:
    case S_NUM_FIRST:
        if (st->node == S_NUM_SIGN && c == '-') { st->node = S_NUM_FIRST; return 1; }
        if (c == '0') { st->node = S_NUM_ZERO; return 1; }
        if (c >= '1' && c <= '9') { st->node = S_NUM_INT; st->n = 1; return 1; }
        return 0;

    case S_NUM_ZERO:   /* JSON forbids leading zeros, so no digit may follow */
    case S_NUM_INT:
        if (st->node == S_NUM_INT && is_digit(c) && st->n < G_NUM_DIGITS) { st->n++; return 1; }
        if (g->fields[st->slot].type == T_NUMBER) {
            if (c == '.') { st->node = S_NUM_FRAC_FIRST; return 1; }
            if (c == 'e' || c == 'E') { st->node = S_NUM_EXP; return 1; }
        }
        return num_end(g, st, c);

    case S_NUM_FRAC_FIRST:
        if (!is_digit(c)) return 0;
        st->node = S_NUM_FRAC;
        st->n++;
        return 1;

    case S_NUM_FRAC:
        if (is_digit(c) && st->n < G_NUM_DIGITS) { st->n++; return 1; }
        if (c == 'e' || c == 'E') { st->node = S_NUM_EXP; return 1; }
        return num_end(g, st, c);

    case S_NUM_EXP:
    case S_NUM_EXP_FIRST:
        if (st->node == S_NUM_EXP && (c == '+' || c == '-')) { st->node = S_NUM_EXP_FIRST; return 1; }
        if (!is_digit(c)) return 0;
        st->node = S_NUM_EXP_INT;
        st->ci = 1;
        return 1;

    case S_NUM_EXP_INT:
        if (is_digit(c) && st->ci < G_EXP_DIGITS) { st->ci++; return 1; }
        return num_end(g, st, c);

    case S_COMMA_OR_CLOSE:
        if (c == ',') {
            if (st->slot >= g->n_fields) return 0;
            if (!key_cand_at(g, st->slot)) return 0;
            st->node = S_KEY;
            return 1;
        }
        if (c == '}') {
            if (!all_optional_from(g, st->slot)) return 0;
            st->node = S_DONE;
            return 1;
        }
        return 0;

    case S_DONE:
    default:
        return 0;   /* nothing may follow the object */
    }
}

/* ------------------------------------------------------------------- public */

void grammar_reset(Grammar *g)
{
    if (!g) return;
    g->st.node = S_OPEN;
    g->st.slot = 0;
    g->st.cand = 0;
    g->st.ci   = 0;
    g->st.n    = 0;
}

int grammar_done(const Grammar *g)
{
    return g && g->st.node == S_DONE;
}

void grammar_bind_vocab(Grammar *g, const GrammarToken *vocab, int vocab_size)
{
    if (!g) return;
    g->vocab = vocab;
    g->vocab_size = vocab_size;
    free(g->tlen);
    free(g->tfirst);
    size_t n = (size_t)(vocab_size > 0 ? vocab_size : 1);
    g->tlen = malloc(n);
    g->tfirst = malloc(n);
    if (!g->tlen || !g->tfirst) { g->vocab_size = 0; return; }
    for (int id = 0; id < vocab_size; id++) {
        int len = vocab[id].len;
        g->tlen[id] = (unsigned char)(len > 0 && len < 256 ? len : 0);
        g->tfirst[id] = len > 0 ? (unsigned char)vocab[id].bytes[0] : 0;
    }
}

int grammar_mask(Grammar *g, unsigned char *allow)
{
    if (!g || !allow || !g->vocab || !g->tlen) return 0;
    memset(allow, 0, (size_t)g->vocab_size);
    if (g->st.node == S_DONE) return 0;

    /* Which bytes could come next at all? Most states admit only a handful — a
     * quote, a comma, the digits — and answering this once for 256 bytes is what
     * lets the vocabulary pass below reject nearly everything without ever
     * reading the token's bytes. A single-byte token needs no second look: this
     * probe already ran the machine over exactly its one byte. */
    unsigned char first_ok[256];
    for (int b = 0; b < 256; b++) {
        GState probe = g->st;
        first_ok[b] = (unsigned char)(step(g, &probe, (unsigned char)b) ? 1 : 0);
    }

    int n = 0;
    for (int id = 0; id < g->vocab_size; id++) {
        int len = g->tlen[id];
        if (!len || !first_ok[g->tfirst[id]]) continue;
        if (len == 1) { allow[id] = 1; n++; continue; }
        const char *bytes = g->vocab[id].bytes;
        GState s = g->st;
        int ok = 1;
        for (int i = 0; i < len; i++)
            if (!step(g, &s, (unsigned char)bytes[i])) { ok = 0; break; }
        if (ok) { allow[id] = 1; n++; }
    }
    return n;
}

int grammar_accept(Grammar *g, int id)
{
    if (!g || !g->vocab || id < 0 || id >= g->vocab_size) return 0;
    const GrammarToken *t = &g->vocab[id];
    if (t->len <= 0) return 0;
    GState s = g->st;
    for (int i = 0; i < t->len; i++)
        if (!step(g, &s, (unsigned char)t->bytes[i])) return 0;
    g->st = s;
    return 1;
}

/* The byte that walks the machine towards done. Every choice here either closes
 * something or advances a literal by one character, and the field index only
 * ever grows, so the walk terminates. */
static int forced_byte(const Grammar *g, const GState *st, unsigned char *out)
{
    switch (st->node) {
    case S_OPEN:            *out = '{'; return 1;
    case S_KEY_OR_CLOSE:    *out = '}'; return 1;
    case S_KEY:             *out = '"'; return 1;
    case S_KEYBODY:
    case S_ENUM_BODY:
    case S_LIT: {
        if (st->node != S_LIT && lit_complete(g, st, NULL)) { *out = '"'; return 1; }
        int nc = cand_count(g, st);
        for (int i = 0; i < nc; i++) {
            if (!((st->cand >> i) & 1ULL)) continue;
            int len;
            const char *s = cand_str(g, st, i, &len);
            if (st->ci < len) { *out = (unsigned char)s[st->ci]; return 1; }
            *out = '"';
            return 1;
        }
        return 0;
    }
    case S_COLON:           *out = ':'; return 1;
    case S_STR_OPEN:
    case S_ENUM_OPEN:       *out = '"'; return 1;
    case S_STR_BODY:
        *out = st->n < g->fields[st->slot].min_len ? (unsigned char)'x' : (unsigned char)'"';
        return 1;
    case S_STR_ESC:         *out = 'n'; return 1;
    case S_STR_HEX:         *out = '0'; return 1;
    case S_NUM_SIGN:
    case S_NUM_FIRST:
    case S_NUM_FRAC_FIRST:
    case S_NUM_EXP:
    case S_NUM_EXP_FIRST:   *out = '0'; return 1;
    case S_NUM_ZERO:
    case S_NUM_INT:
    case S_NUM_FRAC:
    case S_NUM_EXP_INT:
        /* the number is already well formed, so end it the way the object wants */
        *out = all_optional_from(g, st->slot + 1) ? (unsigned char)'}' : (unsigned char)',';
        return 1;
    case S_COMMA_OR_CLOSE:
        *out = all_optional_from(g, st->slot) ? (unsigned char)'}' : (unsigned char)',';
        return 1;
    default:
        return 0;
    }
}

/* What grammar_finish would cost from here, without moving the machine. The walk
 * runs on a copy of the state, so this is safe to ask mid-document. A caller can
 * then weigh what completing would invent against what the model actually chose. */
int grammar_finish_len(const Grammar *g)
{
    if (!g) return 0;
    GState s = g->st;
    int n = 0;
    for (int guard = 0; guard < 64 * (G_MAX_NAME * 2 + 8); guard++) {
        if (s.node == S_DONE) return n;
        unsigned char c;
        if (!forced_byte(g, &s, &c)) break;
        GState next = s;
        if (!step(g, &next, c)) break;
        s = next;
        n++;
    }
    return s.node == S_DONE ? n : 0;
}

int grammar_finish(Grammar *g, char *out, size_t cap)
{
    if (!g || !out || cap == 0) return 0;
    size_t n = 0;
    /* the bound is slack: a full walk is at most a key, a value and a separator
     * per field, and it is here only so a bug cannot spin forever */
    for (int guard = 0; guard < 64 * (G_MAX_NAME * 2 + 8); guard++) {
        if (g->st.node == S_DONE) { out[n] = '\0'; return (int)n; }
        unsigned char c;
        if (!forced_byte(g, &g->st, &c)) break;
        GState s = g->st;
        if (!step(g, &s, c)) break;
        if (n + 1 >= cap) break;
        g->st = s;
        out[n++] = (char)c;
    }
    out[n] = '\0';
    return g->st.node == S_DONE ? (int)n : 0;
}
