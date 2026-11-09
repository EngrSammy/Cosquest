package expo.modules.costquestgame.unity

import android.util.Log

/**
 * Unity to the app, on Android. The C# side calls these static methods by
 * name (AndroidJavaClass("expo.modules.costquestgame.unity.CQUnityEvents")
 * .CallStatic(...), see unity-android/CQAndroidBridge.cs.template). They are
 * the Android counterparts of the C callbacks the iOS framework exports from
 * CQNativeBridge.m:
 *
 *   iOS (CQSet...Callback)            Android (this class)           onUnityEvent
 *   CQSetAnchorTappedCallback(id)     anchorTapped(id)               scene "world", kind "anchorTapped", json = id
 *   CQSetCheckpointTappedCallback(id) checkpointTapped(id)           scene "world", kind "checkpointTapped", json = id
 *   CQSetWorldReadyCallback(n)        worldReady(n)                  scene "world", kind "ready", json = "{\"buildings\":n}"
 *   CQSetDuelEventCallback(k, json)   duelEvent(k, json)             scene "duel", kind k, json
 *   CQSetHubEventCallback(k, json)    hubEvent(k, json)              scene "hub", kind k, json
 *   CQSetBattleEventCallback(k, json) battleEvent(k, json)           scene "battle", kind k, json
 *
 * Event kinds from the scenes: ready, sfx, finished, quit (FRAMEWORK_PIN.md).
 *
 * Lives in the main source set, with no Unity types, so it is in every APK
 * and kept by R8 (proguard-rules.pro). Unity calls it on Unity's own thread;
 * the sink (the module's sendEvent) is safe from any thread.
 */
object CQUnityEvents {
  /** Set by the module while it is alive. (scene, kind, json) */
  @Volatile
  var sink: ((String, String, String) -> Unit)? = null

  private fun deliver(scene: String, kind: String?, json: String?) {
    val s = sink
    if (s == null) {
      Log.w("CostQuestUnity", "Unity event $scene/$kind with no module listening")
      return
    }
    s(scene, kind ?: "", json ?: "")
  }

  @JvmStatic fun anchorTapped(id: String?) {
    if (!id.isNullOrEmpty()) deliver("world", "anchorTapped", id)
  }

  @JvmStatic fun checkpointTapped(id: String?) {
    if (!id.isNullOrEmpty()) deliver("world", "checkpointTapped", id)
  }

  @JvmStatic fun worldReady(buildings: Int) = deliver("world", "ready", "{\"buildings\":$buildings}")

  @JvmStatic fun duelEvent(kind: String?, json: String?) = deliver("duel", kind, json)

  @JvmStatic fun hubEvent(kind: String?, json: String?) = deliver("hub", kind, json)

  @JvmStatic fun battleEvent(kind: String?, json: String?) = deliver("battle", kind, json)
}
