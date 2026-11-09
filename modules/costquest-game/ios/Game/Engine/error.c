#include "error.h"

#include <stdarg.h>
#include <stdio.h>

static char g_error[256];

const char *mote_last_error(void)
{
    return g_error[0] ? g_error : NULL;
}

void mote_clear_error(void)
{
    g_error[0] = '\0';
}

int mote_fail(const char *fmt, ...)
{
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(g_error, sizeof(g_error), fmt, ap);
    va_end(ap);
    /* Still print it. The CLI has nowhere else to look, and under emscripten
     * this is what reaches the host's printErr hook. */
    fprintf(stderr, "mote: %s\n", g_error);
    return -1;
}
