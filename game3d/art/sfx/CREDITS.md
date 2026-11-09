# Fight audio credits (app/game3d/art/sfx)

Every file here is CC0 1.0 (public domain dedication): free for commercial use, no attribution
required. Credit is given anyway. Licence texts sit beside the files (`License_*.txt`).
Downloaded 1 Nov 2026; the licence was read on each source page that day.

| File(s) | Source | Licence | Change |
|---|---|---|---|
| knifeSlice, knifeSlice2, drawKnife1, drawKnife2, chop, cloth1, handleCoins | Kenney "RPG Audio", https://kenney.nl/assets/rpg-audio | CC0 1.0 (`License_Kenney_RPGAudio.txt`) | none (cq 233) |
| impactPunch_medium_000..003, impactPunch_heavy_000..003, impactMetal_heavy_000, impactBell_heavy_000, impactPlate_medium_000, impactGlass_heavy_000, impactSoft_heavy_000/001, impactMining_000 | Kenney "Impact Sounds", https://kenney.nl/assets/impact-sounds | CC0 1.0 (`License_Kenney_ImpactSounds.txt`) | none (cq 233; _002/_003 and impactSoft_heavy_001 added by look-fight) |
| impactGeneric_light_000..002 ("crack": the bright contact layer), impactGlass_light_000/001 (the crit's extra crack) | Kenney "Impact Sounds", as above | CC0 1.0 | none (look-fight) |
| ko_boom | Kenney "Impact Sounds" impactPunch_heavy_004 + impactMining_001 | CC0 1.0 | look-fight: pitched down (x0.62 / x0.55), mixed, low-passed at 2.2 kHz, faded; mono Vorbis |
| ko_chime (jingles_PIZZI16, a rising fifth) | Kenney "Music Jingles", https://kenney.nl/assets/music-jingles | CC0 1.0 (`License_Kenney_MusicJingles.txt`) | renamed |
| sting_victory (jingles_STEEL10, rising D E F# G) | Kenney "Music Jingles", as above | CC0 1.0 | renamed |
| sting_defeat (jingles_STEEL07, falling F E D# D) | Kenney "Music Jingles", as above | CC0 1.0 | renamed |
| guardian_grunt | the project's own, synthesised by `tools/fx/make_grunt.py` (numpy: a glottal buzz, three formants, a growl) | CC0 1.0 (ours) | made by look-fight |
| music_battle ("Battle Theme A") | cynicmusic, OpenGameArt, https://opengameart.org/content/battle-theme-a | CC0 1.0 (the page's licence field: "CC0") | loudness normalised to -16 LUFS integrated (EBU R128, ffmpeg loudnorm, true peak -1.5 dBTP), Vorbis q1, looped in sfx.gd |

Mix (sfx.gd): effects peak under -3 dBFS through the per-cue volumes; the music plays 9 dB under
its -16 LUFS file level on the "Music" bus and ducks a further 6 dB under the KO. `sound: false`
in the fight config mutes the effects and the music (the app sends it while a CosQuest call holds
the audio); `music: false` mutes the music only. UI button taps make no sound in the fight; only
game events do.
