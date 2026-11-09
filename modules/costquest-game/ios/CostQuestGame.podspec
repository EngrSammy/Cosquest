# The CostQuest game (ubmids/costquest-ios, copied into Game/ by
# scripts/sync-game-from-ios.sh) as a pod of the CosQuest app.
#
# Unity is out of the build (battle-3d-only, 1 Nov 2026): every fight is the 3D
# Godot fight, and Unity was barred anyway (ToS s17.2). NO_UNITY is set for every
# SDK, so the Game/ sources compile their no-Unity paths; the Unity hosts were
# deleted, and their names stay excluded in case a costquest-ios sync brings them
# back (scripts/sync-game-from-ios.sh). Git history has the Unity build.
unity_files = %w[UnityBridge.swift UnityWorldView.swift UnityDuelHost.swift UnityBattleHost.swift UnityHallHost.swift]

Pod::Spec.new do |s|
  s.name           = 'CostQuestGame'
  s.version        = '0.1.0'
  s.summary        = 'The CostQuest AR game, embedded in the CosQuest app'
  s.description    = 'SwiftUI + RealityKit + ARKit islands of the CostQuest game, hosted by an Expo module.'
  s.license        = { :type => 'Proprietary' }
  s.author         = 'DJMC'
  s.homepage       = 'https://github.com/MCJ-events/COSQUEST'
  s.platforms      = { :ios => '18.0' }
  s.swift_version  = '6.0'
  s.source         = { git: 'https://github.com/MCJ-events/COSQUEST.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = 'Embed/**/*.{h,swift}', 'Game/**/*.{h,c,swift}'
  # The C surface Swift sees (through the pod's own module): the engine's
  # one header, the Unity callback setters and the memory probe. Everything else stays private.
  s.public_header_files = 'Embed/*.h', 'Game/Engine/mote_lib.h', 'Game/Engine/error.h'
  s.exclude_files = unity_files.map { |f| "Game/Unity/#{f}" }

  s.resource_bundles = {
    'CostQuestGame' => ['Resources/Fonts/*.ttf', 'Resources/CostQuestGame.xcassets']
  }

  s.frameworks = 'ARKit', 'RealityKit', 'CoreLocation', 'CoreMotion', 'CoreNFC',
                 'NearbyInteraction', 'Network', 'Speech', 'AVFoundation', 'StoreKit',
                 'SafariServices', 'MapKit', 'Metal', 'CryptoKit', 'CoreHaptics', 'CoreImage'

  settings = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_STRICT_CONCURRENCY' => 'complete',
    # Game/Engine is the mote engine, verbatim. Built for speed in every
    # configuration (costquest-ios project.yml says why), one core kept free.
    'GCC_C_LANGUAGE_STANDARD' => 'c11',
    'GCC_OPTIMIZATION_LEVEL' => '3',
    'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) MOTE_RESERVE_CORES=1',
    'HEADER_SEARCH_PATHS' => '$(inherited) "${PODS_TARGET_SRCROOT}/Game/Engine"',
  }
  settings['SWIFT_ACTIVE_COMPILATION_CONDITIONS'] = '$(inherited) NO_UNITY'
  s.pod_target_xcconfig = settings

end
