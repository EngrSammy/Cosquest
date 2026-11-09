/* warden_jni.c: the mote engine behind JNI, for CostQuestWardenModule.kt.
 *
 * One engine per process (the model is hundreds of MB, mapped from disk), and
 * one generation at a time; the Kotlin side serialises calls on one thread.
 * A line is the whole job, as on iOS (Warden/WardenVoice.swift write()):
 * generation stops at the first newline or <|im_end|>, or when stop() is
 * called from another thread (checked between tokens).
 */
#include <jni.h>
#include <stdatomic.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "mote_lib.h"

static mote *g_engine = NULL;
static atomic_int g_stop = 0;

typedef struct {
    char *text;
    size_t len, cap;
    int tokens;
    long long first_ns;
} sink_t;

static long long now_ns(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (long long)ts.tv_sec * 1000000000LL + ts.tv_nsec;
}

static int on_piece(const char *piece, void *user) {
    sink_t *s = (sink_t *)user;
    if (!piece) return 0;
    if (s->tokens == 0) s->first_ns = now_ns();
    s->tokens++;
    size_t n = strlen(piece);
    if (s->len + n + 1 > s->cap) {
        size_t cap = (s->cap ? s->cap * 2 : 256);
        while (cap < s->len + n + 1) cap *= 2;
        char *grown = realloc(s->text, cap);
        if (!grown) return 0;
        s->text = grown;
        s->cap = cap;
    }
    memcpy(s->text + s->len, piece, n);
    s->len += n;
    s->text[s->len] = '\0';
    if (atomic_load(&g_stop)) return 0;
    if (strchr(piece, '\n') || strstr(s->text, "<|im_end|>")) return 0;
    return 1;
}

JNIEXPORT jstring JNICALL
Java_expo_modules_costquestwarden_MoteNative_load(JNIEnv *env, jclass cls, jstring model, jstring tokenizer) {
    (void)cls;
    if (g_engine) {
        mote_free(g_engine);
        g_engine = NULL;
    }
    const char *m = (*env)->GetStringUTFChars(env, model, NULL);
    const char *t = (*env)->GetStringUTFChars(env, tokenizer, NULL);
    g_engine = mote_create_from_files(m, t);
    (*env)->ReleaseStringUTFChars(env, model, m);
    (*env)->ReleaseStringUTFChars(env, tokenizer, t);
    if (!g_engine) {
        const char *why = mote_last_error();
        return (*env)->NewStringUTF(env, why ? why : "the model did not load");
    }
    return NULL; /* loaded */
}

/* [dim, hidden_dim, n_layers, n_heads, n_kv_heads, vocab_size, seq_len, quantized, qbits] */
JNIEXPORT jintArray JNICALL
Java_expo_modules_costquestwarden_MoteNative_info(JNIEnv *env, jclass cls) {
    (void)cls;
    if (!g_engine) return NULL;
    mote_info_t i;
    mote_get_info(g_engine, &i);
    jint values[9] = {i.dim, i.hidden_dim, i.n_layers, i.n_heads, i.n_kv_heads, i.vocab_size, i.seq_len, i.quantized, i.qbits};
    jintArray out = (*env)->NewIntArray(env, 9);
    (*env)->SetIntArrayRegion(env, out, 0, 9, values);
    return out;
}

/* Returns the text as UTF-8 bytes (NewStringUTF takes modified UTF-8, which an
 * emoji is not); stats gets [tokens, first_token_ns_after_start, total_ns]. */
JNIEXPORT jbyteArray JNICALL
Java_expo_modules_costquestwarden_MoteNative_generate(JNIEnv *env, jclass cls, jstring prompt, jint max_tokens,
                                                      jfloat temperature, jlong seed, jlongArray stats) {
    (void)cls;
    if (!g_engine) return NULL;
    atomic_store(&g_stop, 0);
    const char *p = (*env)->GetStringUTFChars(env, prompt, NULL);
    mote_params params;
    memset(&params, 0, sizeof params);
    params.temperature = temperature;
    params.topp = 0.9f;
    params.repeat_penalty = 1.1f;
    params.seed = (unsigned long long)seed;
    params.max_tokens = max_tokens;
    sink_t s = {0};
    long long start = now_ns();
    mote_generate(g_engine, p, &params, on_piece, &s);
    long long end = now_ns();
    (*env)->ReleaseStringUTFChars(env, prompt, p);
    if (stats && (*env)->GetArrayLength(env, stats) >= 3) {
        jlong values[3] = {s.tokens, s.tokens ? s.first_ns - start : 0, end - start};
        (*env)->SetLongArrayRegion(env, stats, 0, 3, values);
    }
    jbyteArray out = (*env)->NewByteArray(env, (jsize)s.len);
    if (out && s.len) (*env)->SetByteArrayRegion(env, out, 0, (jsize)s.len, (const jbyte *)s.text);
    free(s.text);
    return out;
}

JNIEXPORT void JNICALL
Java_expo_modules_costquestwarden_MoteNative_stop(JNIEnv *env, jclass cls) {
    (void)env;
    (void)cls;
    atomic_store(&g_stop, 1);
}

JNIEXPORT void JNICALL
Java_expo_modules_costquestwarden_MoteNative_unload(JNIEnv *env, jclass cls) {
    (void)env;
    (void)cls;
    if (g_engine) {
        mote_free(g_engine);
        g_engine = NULL;
    }
}
