/* error.h — the one place a failed load records why.
 *
 * mote used to die on a bad checkpoint: every load problem was an fprintf to
 * stderr followed by exit(1). That is defensible for a CLI and unacceptable
 * anywhere else. In an app it takes the process down; in WebAssembly it aborts
 * the module, and the host is left holding an exception whose text is
 * "[object Object]" while the real reason goes to a console nobody is reading.
 *
 * So loads report instead of exiting. The reason lands here, the caller returns
 * non-zero, and the host decides what to do about it.
 */
#ifndef MOTE_ERROR_H
#define MOTE_ERROR_H

/* Why the last load failed, or NULL if none has. Points at static storage that
 * stays valid until the next failure. */
const char *mote_last_error(void);

/* Record a reason and return -1, so a caller can write `return mote_fail(...)`.
 * A load runs to completion on one thread before the model is used, so a single
 * static buffer is enough. */
int mote_fail(const char *fmt, ...);

/* Forget any recorded reason. Called at the start of a load so a stale message
 * from an earlier attempt cannot be mistaken for this one's. */
void mote_clear_error(void);

#endif /* MOTE_ERROR_H */
