/* cq 061: write one prepared evdev packet to a touchscreen, printing CLOCK_REALTIME
 * right before and right after the write() (seconds, ns precision).
 * Build: $NDK/toolchains/llvm/prebuilt/linux-x86_64/bin/x86_64-linux-android29-clang -O2 -static -o inject inject.c
 * Use (root): inject /dev/input/event2 packet.bin */
#include <fcntl.h>
#include <stdio.h>
#include <time.h>
#include <unistd.h>

static double now(void) {
  struct timespec ts;
  clock_gettime(CLOCK_REALTIME, &ts);
  return ts.tv_sec + ts.tv_nsec / 1e9;
}

int main(int argc, char **argv) {
  if (argc != 3) { fprintf(stderr, "usage: inject DEVICE PACKET\n"); return 2; }
  char buf[4096];
  int p = open(argv[2], O_RDONLY);
  if (p < 0) { perror(argv[2]); return 1; }
  ssize_t n = read(p, buf, sizeof buf);
  close(p);
  int d = open(argv[1], O_WRONLY);
  if (d < 0 || n <= 0) { perror(argv[1]); return 1; }
  double a = now();
  ssize_t w = write(d, buf, (size_t)n);
  double b = now();
  close(d);
  printf("%.6f %.6f\n", a, b);
  return w == n ? 0 : 1;
}
