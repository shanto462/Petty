# macOS Desktop Pets vs Chrome Extension - COMPLETE Analysis

## Comprehensive Analysis Date: 2025-11-07

This is a complete behavioral comparison between the original macOS Desktop Pets application and the Chrome Extension implementation, based on analysis of ALL 47 Swift source files.

---

## EXECUTIVE SUMMARY

**macOS App Features**: ~50+ features across 13 capabilities, random events, settings system, multi-screen support
**Chrome Extension**: ~15 features across 6 capabilities, basic settings
**Feature Gap**: ~35+ missing features
**Core Behavior Differences**: 8 critical issues

---

## 1. COMPLETE CAPABILITIES LIST

### macOS Capabilities (13 Total)

| Capability | Status | Priority | Complexity | Used By |
|------------|--------|----------|------------|---------|
| AnimatedSprite | ✅ Implemented | High | Medium | All pets |
| AnimationsProvider | ✅ Implemented | High | Medium | All pets |
| AnimationsScheduler | ✅ Implemented | High | Medium | Most pets |
| AutoRespawn | ❌ **MISSING** | Medium | Low | All pets |
| BounceOnLateralCollisions | ✅ Implemented | High | Medium | Most pets |
| FlipHorizontallyWhenGoingLeft | ✅ Implemented | Medium | Low | Most pets |
| GetsAngryWhenMeetingOtherCats | ✅ Implemented | Low | Medium | Cats only |
| LeavesPoopStains | ❌ **MISSING** | Low | Medium | poop.json |
| LinearMovement | ✅ Implemented | High | High | Moving pets |
| PetsSpritesProvider | ✅ Implemented | High | Low | All pets |
| Rotating | ❌ **MISSING** | Low | Low | Many pets |
| SleepingPlace | ❌ **MISSING** | Medium | High | cat_house, gazebo |
| WallCrawler | ❌ **MISSING** | Medium | High | snail, snail_nicky |

---

## 2. MISSING CAPABILITIES - DETAILED

### A. AutoRespawn
**What it does**: Automatically respawns pets after certain events (death, removal, off-screen)
**Implementation**: Not specified in source, likely simple respawn logic
**Priority**: Medium
**Complexity**: Low
**Required for**: Proper pet lifecycle management

### B. LeavesPoopStains (Extends LeavesTracesWhileWalking)
**What it does**:
```swift
// From LeavesTracesWhileWalking.swift and LeavesPoopStains.swift
- Spawns ephemeral "poopstain" entities while moving
- Timing: Every 4 seconds while in .move state
- Stain lifespan: 17 frames at 4fps = ~4.25 seconds
- Position: Spawned at pet's current location
- Z-index: -100 (below pets)
```

**Used by**: poop.json
**Implementation Requirements**:
- Ephemeral entity support
- Trace spawning system
- Auto-cleanup after expiration
- Poopstain species with animation

**Priority**: Low (fun feature)
**Complexity**: Medium

### C. Rotating
**What it does**: Rotates sprite during animations or movements
**Used by**: betta, mushroom, poop, snail (and many others)
**Priority**: Low
**Complexity**: Low
**Note**: May be CSS transform rotation

### D. SleepingPlace ⭐
**What it does**:
```swift
// From SleepingPlace.swift
- Pet becomes 2x larger (bed, gazebo)
- Detects overlapping pets with area > 100px²
- Triggers "sleep" animation on overlapping pet
- Sleep duration: 25-75 random loops
- Positions sleeping pet at bed center-bottom
- 120 second cooldown between sleep events
```

**Used by**: cat_house.json, gazebo.json
**Compatible with**: Any pet with "sleep" animation (12 species have it)
**Priority**: Medium (interactive and entertaining)
**Complexity**: High
**Implementation Requirements**:
- Collision area calculation
- Pet positioning system
- Animation override capability
- Sleep animation for compatible species

### E. WallCrawler ⭐
**What it does**:
```swift
// From PetEntity.swift
- Disables gravity for the pet
- Special initial spawn: Bottom of screen (y = worldBounds.height - frame.height)
- Allows walking on walls/ceiling
- Changes movement physics entirely
```

**Used by**: snail.json, snail_nicky.json
**Priority**: Medium (unique behavior)
**Complexity**: High
**Implementation Requirements**:
- Gravity toggle per pet
- Custom physics for wall movement
- Collision detection with page edges
**Note**: May be less useful in browser context vs desktop

---

## 3. MISSING RANDOM EVENTS

### A. UFO Abduction 🛸 (HIGHEST PRIORITY)

**Implementation Details**:
```swift
// From UfoAbduction.swift
Schedule: Random 0-5 hour intervals
Requires: AppState.randomEvents == true

Steps:
1. Select random non-ephemeral pet (speed != 0)
2. Spawn UFO at screen top-left
3. UFO seeks pet to position above it (-50px offset)
4. When captured:
   - Paralyze pet (disable gravity, set direction up, speed = 1.2x)
   - UFO plays "abduction" animation (3x height capture ray)
   - Pet shrinks from current size to 5x5px over 1.1 seconds
5. After animation (1.25s):
   - Remove captured pet
   - UFO flies away diagonally up-right
6. After 10 seconds:
   - Respawn original pet at random position
```

**UFO Species**:
```json
{
  "id": "ufo",
  "capabilities": ["AnimatedSprite", "AnimationsProvider", "LinearMovement", "PetsSpritesProvider"],
  "movementPath": "front",
  "dragPath": "front",
  "speed": 2
}
```

**Required Infrastructure**:
- Seeker capability (path-finding)
- ShapeShifter capability (scaling over time)
- Random event scheduler
- Ephemeral entity system
- Animation: "abduction" (size: 1x3, position: entityTopLeft)

**Priority**: High (most entertaining feature!)
**Complexity**: Very High

### B. Fantozzi Rainy Cloud ☁️

**Implementation Details**:
```swift
// From FantozziCloud.swift
Schedule: Random 0-5 hour intervals
Requires: AppState.randomEvents == true

Steps:
1. Select random non-ephemeral pet
2. Spawn cloud at pet's position
3. Cloud is 2x normal size
4. Cloud seeks and stays above pet (yOffset = cloud height - pet height)
5. Auto-adjust speed to match pet movement
6. Duration: Random 60-120 seconds
7. Cloud despawns automatically
```

**Fantozzi Species**:
```json
{
  "id": "fantozzi",
  "capabilities": ["AnimatedSprite", "AnimationsProvider", "LinearMovement", "PetsSpritesProvider"],
  "movementPath": "front",
  "dragPath": "front",
  "speed": 2,
  "zIndex": 200
}
```

**Required Infrastructure**:
- Seeker capability with auto-speed-adjust
- Random event scheduler

**Priority**: Medium
**Complexity**: High

### C. Random Platform Jumper

**Implementation**: N/A for Chrome Extension (requires window detection)
**Note**: Desktop-only feature, not applicable to browser

---

## 4. SETTINGS SYSTEM

### macOS AppState Settings

| Setting | Type | Range/Values | Default | Chrome Ext |
|---------|------|--------------|---------|------------|
| petSize | CGFloat | 30-350px | 75px | ❌ Fixed 64px |
| speedMultiplier | CGFloat | 0.25x - 2.0x | 1.0x | ❌ Missing |
| gravityEnabled | Bool | true/false | true | ❌ Missing |
| desktopInteractions | Bool | true/false | true | ❌ N/A |
| randomEvents | Bool | true/false | true | ❌ Missing |
| selectedSpecies | [String] | Array of IDs | ["cat"] | ✅ Partial |
| names | [String:String] | Custom names | {} | ❌ Missing |
| disabledScreens | [String] | Screen IDs | [] | ❌ N/A |

**Persistence**: All settings auto-saved via @AppStorage to UserDefaults
**Live Updates**: Settings changes propagate to all pets in real-time via Combine publishers

---

## 5. BEHAVIORAL DIFFERENCES

### A. Speed Calculation ⚠️ CRITICAL

**macOS**:
```swift
// PetEntity.swift
baseSpeed = 30.0
speedMultiplier = (petSize / 75.0) * baseSpeed * species.speed * settings.speedMultiplier

// Example: 75px cat with speed=1.0, settings=1.0
// = (75/75) * 30 * 1.0 * 1.0 = 30 points/sec

// Example: 150px cat with speed=1.0, settings=1.0
// = (150/75) * 30 * 1.0 * 1.0 = 60 points/sec (2x faster)
```

**Chrome Extension**:
```javascript
// config.js
BASE_SPEED = 0.8
speed = species.speed * BASE_SPEED

// Example: cat with speed=1.0
// = 1.0 * 0.8 = 0.8 (units unclear)
```

**Issues**:
1. No size-based scaling (larger pets should move faster)
2. No user speed multiplier control
3. Different base units entirely
4. Physics update rate unclear (macOS uses 60fps physics)

**Fix Required**: Implement full speed calculation with size scaling

### B. Initial Pet Positioning ⚠️ CRITICAL

**macOS**:
```swift
// PetEntity.swift
func setInitialPosition() {
    let randomX = worldBounds.width * .random(in: 0.2...0.8)  // 20-80% width
    let randomY: CGFloat

    if capability(for: WallCrawler.self) != nil {
        randomY = worldBounds.height - frame.height  // Bottom for crawlers
    } else {
        randomY = worldBounds.height * .random(in: 0.1..<0.5)  // 10-50% height
    }
    frame.origin = CGPoint(x: randomX, y: randomY)
}

func setInitialDirection() {
    direction = .init(dx: 1, dy: 0)  // ALWAYS starts moving right
}
```

**Chrome Extension**:
```javascript
// pet.js constructor
this.position = {
  x: Math.random() * (window.innerWidth - 100),
  y: 0  // Always spawns at top
};
this.direction = 1;  // Right
```

**Issues**:
1. Pets spawn at TOP (y=0) instead of mid-screen
2. No spawn variation for special types (WallCrawler)
3. Falls from top every time (looks unnatural)

**Fix Required**: Spawn at 10-50% screen height, not at top

### C. Animation Loop System ⚠️ CRITICAL

**macOS Animation Completion**:
```swift
// Yage framework (game engine)
// Animations play exactly N loops before completion
state = .action(action: .angry, loops: 4)  // Plays angry animation 4 times

// Example from cat.json:
"animations": [
  { "id": "eat", "requiredLoops": 10 },    // Must loop 10 times
  { "id": "sleep", "requiredLoops": 50 },  // Must loop 50 times
  { "id": "idle", "requiredLoops": 2 }     // Must loop 2 times
]
```

**Chrome Extension**:
```javascript
// pet.js - uses FIXED duration
const ANGRY_ANIMATION_DURATION = 3000;  // 3 seconds fixed

// Should be:
// duration = (requiredLoops * framesPerLoop * 1000) / fps
```

**Issues**:
1. ignores `requiredLoops` from JSON
2. Uses fixed duration instead of loop count
3. May not properly detect animation completion
4. Different species have different natural loop counts

**Fix Required**: Honor `requiredLoops` from animation JSON

### D. Pet Size System

**macOS**:
```swift
// PetSize.swift
static let defaultSize: CGFloat = 75
static let minSize: CGFloat = 30
static let maxSize: CGFloat = 350

// User can adjust in settings UI
// Affects: speed calculation, sprite scaling, collision area
```

**Chrome Extension**:
```javascript
// config.js
const DISPLAY = {
  PET_SIZE: 64  // Fixed, no variation
};
```

**Issue**: No size variation or user control
**Priority**: Medium
**Fix**: Add petSize setting with 30-350 range

### E. Angry Cats Behavior

**macOS**:
```swift
// GetsAngryWhenMeetingOtherCats.swift
// Uses actual collision detection
guard isTouchingAnotherCat(accordingTo: collisions) else { return }

private func isTouchingAnotherCat(accordingTo collisions: Collisions) -> Bool {
    collisions.contains {
        $0.other?.species.id.hasPrefix("cat") == true
    }
}

// When angry:
subject.set(state: .action(action: .angry, loops: 4))  // 4 loops
isEnabled = false
DispatchQueue.main.asyncAfter(deadline: .now() + 30) { isEnabled = true }
```

**Chrome Extension**:
```javascript
// pet.js
// Uses proximity detection (100px range)
checkAngryInteraction() {
  const nearbyPets = this.petManager.getPetsNear(this.position, 100);
  const nearbyCats = nearbyPets.filter(p => p.tags.includes('cats'));

  if (nearbyCats.length > 0) {
    this.setAnimation('angry');
    setTimeout(() => { /* 3000ms */ }, 3000);
    setTimeout(() => { this.isAngry = false; }, 30000);
  }
}
```

**Differences**:
- macOS: Actual collision detection
- Chrome: 100px proximity (may trigger before visual contact)
- macOS: 4 animation loops
- Chrome: 3000ms fixed duration
**Status**: Different but functional

### F. Mouse Dragging

**macOS**:
```swift
// MouseDraggable.swift
func mouseDragged(currentDelta delta: CGSize) {
    let newFrame = subject.frame.offset(x: delta.width, y: delta.height)
    subject.frame.origin = nearestPosition(for: newFrame, in: subject.worldBounds)
}

private func nearestPosition(for rect: CGRect, in bounds: CGRect) -> CGPoint {
    CGPoint(
        x: min(max(rect.minX, 0), bounds.width - rect.width),
        y: min(max(rect.minY, 0), bounds.height - rect.height)
    )
}

// State management:
mouseDragStarted() { subject?.set(state: .drag); movement?.isEnabled = false }
mouseDragEnded() { subject.set(state: .move); movement?.isEnabled = true }
```

**Chrome Extension**:
```javascript
// pet.js
onMouseDown(e) {
  this.isDragging = true;
  this.dragOffset = {
    x: e.clientX - this.position.x,
    y: e.clientY - this.position.y
  };
  this.velocity = { x: 0, y: 0 };
  this.setAnimation(this.dragPath);
}

onMouseMove(e) {
  if (!this.isDragging) return;
  this.position.x = e.clientX - this.dragOffset.x;
  this.position.y = e.clientY - this.dragOffset.y;
  // No boundary clamping!
}
```

**Issue**: Chrome version lacks boundary constraints - can drag off-screen
**Fix**: Add min/max clamping like macOS

### G. Physics Update Rate

**macOS**:
```swift
// Uses Yage game engine
// Fixed 60 FPS physics tick
// Separate from rendering framerate
```

**Chrome Extension**:
```javascript
// background.js
const PHYSICS = {
  UPDATE_INTERVAL: 16  // ~60fps
};
```

**Status**: Similar (16ms = ~60fps), ✅ OK

### H. Sprite Animation FPS

**macOS**:
```swift
// Each species has its own FPS
// From species JSON:
"fps": 10,  // cat
"fps": 1,   // snail (slow motion!)
"fps": 4,   // poopstain
"fps": 0.5  // cat_house (very slow)
```

**Chrome Extension**:
```javascript
// sprite-animator.js
const rawFps = speciesData.fps || 10;
this.fps = Math.min(30, Math.max(3, rawFps));  // Clamped 3-30
```

**Issue**: Clamps FPS to 3-30, breaking slow-motion species (fps < 3) and very slow decorations (fps < 1)
**Examples Broken**:
- snail: fps=1 → clamped to 3 (3x too fast!)
- cat_house: fps=0.5 → clamped to 3 (6x too fast!)

**Fix**: Remove or adjust clamping to allow 0.1-60 range

---

## 6. MISSING INFRASTRUCTURE

### A. Random Event Scheduler ⭐

**macOS Implementation**:
```swift
// ScreenEnvironment.swift
func scheduleRandomly(withinHours range: Range<Int>, action: @escaping () -> Void) {
    let hours = TimeInterval(range.randomElement() ?? 2)
    let minutes = TimeInterval((0..<60).randomElement() ?? 30)
    let delay = hours * 3600 + minutes * 60
    DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: action)
}

// Usage:
scheduleRandomly(withinHours: 0..<5) {
    guard AppState.global.randomEvents else { return }
    self.scheduleUfoAbductionNow()
}
```

**Chrome Extension**: ❌ Not implemented
**Priority**: High (required for UFO and Cloud events)
**Complexity**: Medium

### B. Seeker Capability (Path-Finding)

**What it does**:
```swift
// Used by UFO, Cloud, Platform Jumper
// Seeks target entity, follows to specific position
// Auto-adjusts speed to match target
// Completion callback when captured/arrived

seeker.follow(target, to: .above, offset: distance) { captureState in
    guard case .captured = captureState else { return }
    // Do something when reached
}
```

**Chrome Extension**: ❌ Not implemented
**Priority**: High (required for UFO and Cloud)
**Complexity**: High
**Implementation**: Needs vector math, collision detection, state machine

### C. ShapeShifter Capability (Scaling)

**What it does**:
```swift
// Used by UFO abduction to shrink pet
shape.scaleLinearly(to: CGSize(width: 5, height: 5), duracy: 1.1)
// Smoothly scales entity from current size to target over duration
```

**Chrome Extension**: ❌ Not implemented
**Priority**: Medium (required for UFO visual effect)
**Complexity**: Medium
**Implementation**: CSS transform scale with requestAnimationFrame

### D. Ephemeral Entities

**What it does**:
- Temporary entities that don't persist
- Auto-cleanup when removed
- Used for: UFO, cloud, poop stains, traces
- Property: `entity.isEphemeral = true`

**Chrome Extension**: May have basic support but not fully utilized
**Priority**: Medium
**Complexity**: Low

### E. Multi-Screen Support

**macOS**:
```swift
// DesktopEnvironment.swift
worlds = NSScreen.screens
    .filter { settings.isEnabled(screen: $0) }
    .map { ScreenEnvironment(for: $0) }

// Each screen has its own World with pets
// Settings allow enabling/disabling specific screens
```

**Chrome Extension**: N/A (single browser window)
**Note**: Could potentially support multiple browser windows

---

## 7. UI & UX FEATURES

### A. Status Bar Menu (macOS)

**Features**:
- Menu bar icon
- Quick actions:
  - Show main window
  - Hide all pets
  - Show all pets
  - Quit app
- Always accessible
- Launch at login option

**Chrome Extension**: ✅ Has popup UI
**Difference**: Chrome popup requires click, macOS always visible in menu bar

### B. Tag-Based Filtering

**macOS Tags** (from species JSON):
```
all, cats, dinos, water, jungle, forest, birds, dogs,
bear, farm, plants, pokèmon, memes, aliens, decorations,
emoji, slow motion, other
```

**Features**:
- Filter pets by category
- "All" shows everything
- Filters update dynamically as species are added/removed

**Chrome Extension**: ❌ Not implemented (shows all species)
**Priority**: Low
**Complexity**: Low

### C. Custom Pet Naming

**macOS**:
```swift
// Can rename any species
AppState.global.rename(species: "cat", to: "Mr. Whiskers")
// Name persists in settings
// Displayed in UI instead of default name
```

**Chrome Extension**: ❌ Not implemented
**Priority**: Low
**Complexity**: Low

### D. Custom Pet Import/Export

**macOS Features**:
1. **Import**: Drag & drop JSON + PNG files
2. **Validation**:
   - Valid JSON structure
   - Required animations present (movementPath, dragPath)
   - Assets exist for required animations
   - Species doesn't already exist
3. **Export**: Export custom pets to share
4. **Storage**: Custom pets stored in Documents directory

**Chrome Extension**: ❌ Not implemented
**Priority**: Low (nice-to-have)
**Complexity**: Medium

### E. Right-Click Context Menu

**macOS**:
```swift
// ShowMenuOnRightClick.swift
menu items:
- Show Main Window (open settings)
- Hide All Pets (temporarily hide)
```

**Chrome Extension**: ❌ Not implemented
**Priority**: Low
**Complexity**: Low
**Implementation**: Could use browser contextMenus API (limited)

---

## 8. SPECIES DETAILS

### Total Species Count
- **macOS**: 43 species in Resources/Species/
- **Chrome Extension**: 43 species (same assets!)

### Special Species

#### Sleeping Places (2)
- **cat_house**: speed=0, zIndex=100, SleepingPlace capability
- **gazebo**: speed=0, zIndex=-100, SleepingPlace capability

#### Wall Crawlers (2)
- **snail**: fps=1, speed=0.2, WallCrawler
- **snail_nicky**: fps=1, speed=0.2, WallCrawler

#### Poop Emoji (1)
- **poop**: LeavesPoopStains capability

#### Flying Pets (3+)
- **betta**: movementPath="fly" (Random Platform Jumper compatible)
- Others with fly movement

### Species with Sleep Animation (12)
- Cats: cat, cat_black, cat_blue, cat_gray, cat_house, cat_white
- Dogs: german
- Others: sloth, sloth_swag, koala, panda, hedgehog
- Can be put to sleep by cat_house or gazebo

---

## 9. ASSETS STRUCTURE

**Naming Convention**:
```
{speciesId}_{animationPath}-{frameNumber}.png

Examples:
cat_walk-0.png
cat_walk-1.png
cat_walk-2.png
cat_drag-0.png
cat_eat-0.png
cat_sleep-0.png
```

**Asset Loading**:
```swift
// PetsAssetsProviderImpl.swift
// Groups assets by key: "cat_walk"
// Returns sorted frames: [...-0, ...-1, ...-2]
// Supports custom assets in Documents directory
```

**Chrome Extension**: ✅ Same structure, properly implemented

---

## 10. CRITICAL FIXES NEEDED (Priority Order)

### 🔴 CRITICAL (Must Fix)

1. **Initial Pet Positioning**
   - Current: Spawns at top (y=0), falls down
   - Fix: Spawn at random 10-50% height, 20-80% width
   - Impact: Visual polish, matches macOS behavior

2. **Animation Loop Completion**
   - Current: Fixed 3000ms duration for angry
   - Fix: Honor `requiredLoops` from JSON, calculate duration as `(loops * frames) / fps`
   - Impact: All timed animations broken without this

3. **Speed Calculation**
   - Current: Simple `species.speed * 0.8`
   - Fix: `(petSize / 75) * 30 * species.speed * speedMultiplier`
   - Impact: Physics feels wrong, no size variation

4. **FPS Clamping**
   - Current: Clamps to 3-30, breaks slow species
   - Fix: Allow 0.1-60 range
   - Impact: Snail (fps=1) runs 3x too fast, decorations broken

### 🟡 HIGH PRIORITY (Should Fix)

5. **Add Settings System**
   - petSize: 30-350 (default 75)
   - speedMultiplier: 0.25-2.0 (default 1.0)
   - gravityEnabled: boolean (default true)
   - randomEvents: boolean (default true)

6. **Implement UFO Abduction**
   - Requires: Seeker, ShapeShifter, Random Scheduler, Ephemeral entities
   - High entertainment value
   - Most requested feature

7. **Add Boundary Clamping to Drag**
   - Prevent dragging off-screen
   - Simple fix, big UX improvement

### 🟢 MEDIUM PRIORITY (Nice to Have)

8. **Implement SleepingPlace Capability**
   - Enables cat_house and gazebo
   - Interactive feature
   - Requires collision area calculation

9. **Implement WallCrawler Capability**
   - Enables snail species
   - Unique behavior
   - Requires gravity toggle per-pet

10. **Add Random Event Scheduler**
    - Foundation for UFO and Cloud
    - Enables future random events

11. **Implement Seeker Capability**
    - Required for UFO and Cloud
    - Path-finding system
    - Complex but reusable

### 🔵 LOW PRIORITY (Polish)

12. **LeavesPoopStains Capability**
    - Fun but not essential
    - Requires ephemeral traces

13. **Rotating Capability**
    - Sprite rotation during animations
    - CSS transform

14. **AutoRespawn Capability**
    - Better pet lifecycle

15. **Tag Filtering UI**
    - Filter by category
    - UX improvement

16. **Custom Pet Naming**
    - Personalization feature

---

## 11. WHAT'S WORKING WELL ✅

The Chrome Extension DOES implement correctly:

### Core Features
- ✅ Basic physics engine (gravity, friction, bounce)
- ✅ AnimatedSprite with frame loading
- ✅ AnimationsScheduler with random delays
- ✅ BounceOnLateralCollisions
- ✅ FlipHorizontallyWhenGoingLeft
- ✅ GetsAngryWhenMeetingOtherCats (proximity-based)
- ✅ Mouse dragging (needs boundary fix)
- ✅ Multiple simultaneous pets
- ✅ Popup UI for pet selection
- ✅ Chrome storage for persistence

### Code Quality
- ✅ Centralized configuration (config.js)
- ✅ Species-based architecture
- ✅ Singleton pattern (SpeciesManager)
- ✅ Memory leak prevention (destroy methods)
- ✅ Parallel species loading (performance)
- ✅ Clean separation of concerns
- ✅ IIFE wrapping (prevents redeclaration)

---

## 12. IMPLEMENTATION ROADMAP

### Phase 1: Critical Fixes (1-2 days)
```
✅ Fix const redeclaration errors (DONE)
⬜ Fix initial positioning (spawn at mid-screen, not top)
⬜ Fix animation loop system (honor requiredLoops)
⬜ Fix speed calculation (add size scaling)
⬜ Fix FPS clamping (allow 0.1-60)
⬜ Add drag boundary constraints
```

### Phase 2: Settings System (2-3 days)
```
⬜ Add chrome.storage schema for settings
⬜ Implement petSize setting (30-350)
⬜ Implement speedMultiplier (0.25-2.0)
⬜ Implement gravityEnabled toggle
⬜ Implement randomEvents toggle
⬜ Add settings UI to popup
⬜ Propagate setting changes to all pets
```

### Phase 3: Infrastructure (3-5 days)
```
⬜ Implement Random Event Scheduler
⬜ Implement Ephemeral Entity system
⬜ Implement Seeker capability (path-finding)
⬜ Implement ShapeShifter capability (scaling)
```

### Phase 4: Major Features (5-7 days)
```
⬜ Implement UFO Abduction event
⬜ Implement SleepingPlace capability
⬜ Implement WallCrawler capability
⬜ Implement Fantozzi Cloud event
```

### Phase 5: Polish (2-3 days)
```
⬜ Implement LeavesPoopStains
⬜ Implement Rotating capability
⬜ Implement AutoRespawn
⬜ Add tag filtering
⬜ Add custom naming
```

**Total Estimated Time**: 13-20 days for complete feature parity

---

## 13. NOT APPLICABLE FOR CHROME EXTENSION

These macOS features don't translate to browser context:

- ❌ **Window Collision Detection** - macOS-specific (NSWindow tracking)
- ❌ **Random Platform Jumper** - Requires window title bars
- ❌ **Multi-Screen Support** - Browser has single viewport (could support multi-window though)
- ❌ **Launch at Login** - Browser extension auto-loads
- ❌ **Menu Bar Icon** - No menu bar in browser (has popup instead)

---

## 14. TESTING CHECKLIST

Before considering feature-complete, test:

### Core Behavior
- [ ] Pets spawn at mid-screen (10-50% height), not top
- [ ] Pets always start moving right
- [ ] Speed scales with pet size
- [ ] Animation loops complete properly (e.g., angry plays 4 times)
- [ ] Snail moves slowly (fps=1, not clamped to 3)
- [ ] Dragging respects boundaries (can't drag off-screen)

### Settings
- [ ] Pet size adjustment (30-350) affects speed and sprite
- [ ] Speed multiplier (0.25-2.0) affects all pets
- [ ] Gravity toggle stops all falling
- [ ] Random events toggle prevents UFO/cloud

### Capabilities
- [ ] SleepingPlace: Cat sleeps when dragged to cat_house
- [ ] WallCrawler: Snail crawls on edges without falling
- [ ] LeavesPoopStains: Poop emoji leaves trail

### Random Events
- [ ] UFO appears randomly (0-5 hours)
- [ ] UFO captures random pet
- [ ] Pet shrinks during abduction
- [ ] Pet respawns after 10 seconds
- [ ] Cloud follows random pet for 60-120s

### Edge Cases
- [ ] Multiple pets don't interfere with each other
- [ ] Removing pets cleans up properly (no memory leaks)
- [ ] Extension reload doesn't break anything
- [ ] Works across different screen sizes

---

## CONCLUSION

The Chrome Extension has a **solid foundation** (~30% feature complete) with core pet behavior working well. However, it's missing ~70% of the macOS app's features, particularly:

1. **8 Critical behavioral differences** that make it feel "off"
2. **7 Missing capabilities** that limit pet variety
3. **2 Major random events** that provide entertainment
4. **Complete settings system** for user control
5. **Advanced features** like sleeping places, wall crawling, poop trails

**Recommended Priority**: Fix critical behaviors first (Phase 1), then add settings system (Phase 2), then work on major features.

**Most Bang for Buck**: UFO Abduction - highest entertainment value for effort invested.
