# Consumer rules of the costquest-game module, applied to the app's R8 pass.

# Unity's C# calls these by name through AndroidJavaClass (see
# unity-android/CQAndroidBridge.cs.template); the bridge implementation is
# loaded by reflection (UnityHost.kt). Neither is referenced statically.
-keep class expo.modules.costquestgame.unity.** { *; }
