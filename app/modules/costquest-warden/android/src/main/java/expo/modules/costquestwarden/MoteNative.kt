package expo.modules.costquestwarden

// The JNI surface of libcostquest_warden.so (src/main/cpp/warden_jni.c).
// Calls are serialised by CostQuestWardenModule on one thread, except stop().
internal object MoteNative {
  /** Whether the native library loaded (it always ships; this guards odd ABIs). */
  val ready: Boolean = try {
    System.loadLibrary("costquest_warden")
    true
  } catch (error: Throwable) {
    false
  }

  /** null when loaded; otherwise why not. */
  @JvmStatic external fun load(modelPath: String, tokenizerPath: String): String?

  /** [dim, hidden_dim, n_layers, n_heads, n_kv_heads, vocab_size, seq_len, quantized, qbits], or null. */
  @JvmStatic external fun info(): IntArray?

  /** UTF-8 bytes of the line; stats = [tokens, first token ns, total ns]. */
  @JvmStatic external fun generate(prompt: String, maxTokens: Int, temperature: Float, seed: Long, stats: LongArray): ByteArray?

  @JvmStatic external fun stop()

  @JvmStatic external fun unload()
}
