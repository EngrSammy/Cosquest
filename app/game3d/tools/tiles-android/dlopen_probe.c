/* dlopen probe: checks that the GDExtension .so loads on a real bionic and that
 * its entry symbol resolves (does not call it: that needs a running engine).
 * adb push probe + .so to /data/local/tmp, then: ./probe ./libGodot3DTiles...so */
#include <dlfcn.h>
#include <stdio.h>
int main(int argc, char **argv) {
  const char *p = argc > 1 ? argv[1] : "./libGodot3DTiles.android.template_release.x86_64.so";
  void *h = dlopen(p, RTLD_NOW | RTLD_LOCAL);
  if (!h) { printf("DLOPEN FAILED: %s\n", dlerror()); return 1; }
  void *s = dlsym(h, "test_cesium_init");
  printf("dlopen OK, test_cesium_init=%p\n", s);
  return s ? 0 : 2;
}
