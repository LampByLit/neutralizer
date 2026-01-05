# Complete List of Sound Sources in the Game

## Sound Effect Definitions (appEffects.js)
All sound effects are defined as ZzFX sound arrays in `appEffects.js`:

1. **sound_shoot** - Shooting sound (array of 2 variations)
2. **sound_destroyTile** - Tile destruction sound (array of 2 variations)
3. **sound_die** - Death sound (array of 3 variations)
4. **sound_jump** - Jump sound
5. **sound_dodge** - Dodge/roll sound
6. **sound_walk** - Walking/footstep sound
7. **sound_explosion** - Explosion sound (array of 3 variations)
8. **sound_checkpoint** - Checkpoint/item collection sound (array of 2 variations)
9. **sound_rain** - Rain ambient sound
10. **sound_wind** - Wind ambient sound
11. **sound_grenade** - Grenade sound
12. **sound_laser** - Laser weapon sound
13. **sound_computer** - Computer ambient looping sound
14. **sound_computerDestroy** - Computer destruction sound (array of 4 variations)

## Sound Sources by Category

### Player Actions
- **Jumping** (`sound_jump`)
  - Player jumps (appCharacters.js:137)
  - Player throws grenade (appCharacters.js:287)
  - Player uses Jumper weapon (appObjects.js:1771)
  - Player uses Hammer weapon (appObjects.js:1870)
  - Player uses Transporter weapon (appObjects.js:2324)
  - Player uses Ladymaker weapon (appObjects.js:2435)

- **Shooting** (`sound_shoot`)
  - Player melee attack (appCharacters.js:185)
  - Weapon fires bullet (appObjects.js:1236)
  - Enemy shoots (appCharacters.js:2534)
  - Fang weapon fires (appObjects.js:2096)

- **Walking** (`sound_walk`)
  - Player walks on ground (appObjects.js:1305, 1426)
  - Player takes minor fall damage (appCharacters.js:252)
  - Smoker weapon sprays gas (appObjects.js:2015)

- **Dodging** (`sound_dodge`)
  - Player performs dodge/roll (appCharacters.js:174)

- **Death** (`sound_die`)
  - Character dies (appCharacters.js:250, 468)
  - Player takes major fall damage (appCharacters.js:250)

### Weapons & Combat
- **Laser Weapon** (`sound_laser`)
  - Laser weapon fires (appObjects.js:1535)

- **Cannon Weapon** (`sound_explosion`)
  - Cannon weapon fires (appObjects.js:1699) - uses explosion sound at lower volume

- **Grenades** (`sound_grenade`)
  - Grenade explodes (appObjects.js:346, 373, 625)

### Environment & Objects
- **Tile Destruction** (`sound_destroyTile`)
  - Tile is destroyed (appObjects.js:522)
  - Tile destroyed during cascade (appEffects.js:445, 479)
  - Computer tile takes damage (appEffects.js:445)

- **Explosions** (`sound_explosion`)
  - Regular explosion (appEffects.js:206)
  - Nuke explosion (appEffects.js:283)

- **Checkpoints & Items** (`sound_checkpoint`)
  - Checkpoint secured (appObjects.js:578)
  - Item collected (appObjects.js:894, 1090)
  - Weapon equipped (appObjects.js:1133)
  - Girl spawns from transmutation (appObjects.js:2177)
  - Terminal transmutes to girl (appObjects.js:3715)

### Computers
- **Computer Ambient** (`sound_computer`)
  - Looping ambient sound from active computers (appObjects.js:3486-3509)
  - Volume scales with distance to player (0-30 tiles range)

- **Computer Destruction** (`sound_computerDestroy`)
  - Computer tile destroyed (appObjects.js:3754) - random variation from array

### Ambient/Atmospheric
- **Rain** (`sound_rain`)
  - Sky rain particles active (appEffects.js:572)

- **Wind** (`sound_wind`)
  - Sky wind particles active (appEffects.js:572, 574)
  - Random wind gusts (appEffects.js:574)

### Music
- **Title Screen Music**
  - Random intro songs from external URLs (app.js:94-136)
  - Plays when user presses any key on title screen
  - Loops through random songs from introSongs array

### Special NPC Sounds
- **Girl Random Noises** (direct zzfx calls)
  - Random cute noises every 20-45 seconds (appGirls.js:371-383)
  - 3 different noise variations played very quietly (volume 0.08)

## Sound System Architecture

### Audio Engine (engine/engineAudio.js)
- **playSound()** - Plays ZzFX sounds with distance attenuation
- **playMusic()** - Plays ZzFXM music with looping support
- **speak()** - Text-to-speech synthesis
- **createZzfxBuffer()** - Creates looping sound buffers (used for computer sounds)

### Sound Settings
- `soundEnable` - Master audio toggle (default: 1)
- `defaultSoundRange` - Distance where sound taper starts (15 tiles)
- `soundTaperPecent` - Extra range for sound taper (0.5)
- `audioVolume` - Master volume for all audio (0.5)

### Sound Features
- Distance-based volume attenuation
- Sound culling beyond max range
- Random variation selection for sound arrays
- Looping sounds for ambient effects (computers)
- Volume scaling for continuous effects (gas spray, rain/wind)




