package expo.modules.costquestgame

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

// The iOS game's view slot, kept on Android only so the module's default view
// name still resolves. The Android game is the React Native one
// (components/game/GameRoot), which does not mount this; Unity's view is
// CostQuestUnityView.
@SuppressLint("ViewConstructor")
class CostQuestGameView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  init {
    setBackgroundColor(Color.parseColor("#14061A"))
  }
}
