# XState Machines (Chapter / Story / Tutorial)

This document describes the public shape of the main XState machines in `src/machines/`:

`chapterMachine`, `StoryMachine`, and `tutorialMachine`.

---

## `chapterMachine` (`src/machines/chapterMachine.js`)

Role: orchestrates the intro/outro dialogue for a single chapter.

How the app uses it
- `src/components/Chapter.js` mounts the machine with initial state `intro` or `outro` (via `initialState`).
- It sends `RESET_CONTEXT` with `introText`, `outroText`, `scene`, and callback functions.
- It sends `NEXT` when the user advances dialogue.

Events
- `RESET_CONTEXT`
  - `introText`: array of dialogue nodes (default: `[]`)
  - `outroText`: array of dialogue nodes (default: `[]`)
  - `scene`: array describing the scene configuration (default: `[]`)
  - `isOutro`: boolean selecting intro vs outro sequence (default: `false`)
  - `onIntroComplete`: function called when intro ends (default: no-op)
  - `onOutroComplete`: function called when outro ends (default: no-op)
- `NEXT`
  - During `intro.ready` it advances within `introText` until empty, then transitions to `done` and triggers `onIntroComplete`.
  - During `outro.ready` it advances within `outroText` until empty, then transitions to `done` and triggers `onOutroComplete`.

Key context fields
- `currentText`: current dialogue node (taken from either `introText[0]` or `outroText[0]`)
- `cursorMode`: boolean that UI uses to toggle cursor interaction
- `lastText`: accumulated dialogue history (built by the dialogue step actions)

Main states
- `idle`: waits 1000ms, then routes to `intro` or `outro` depending on `context.isOutro`
- `intro.reading` -> `intro.ready`: auto-advance after ~1500ms, enables `cursorMode`
- `intro.ready`: waits for `NEXT`
- `outro.reading` -> `outro.ready`: auto-advance after ~1500ms, enables `cursorMode`
- `outro.ready`: waits for `NEXT`
- `done`: final (machine stops)

---

## `StoryMachine` (`src/machines/storyMachine.js`)

Role: top-level gate for the app UI (auth -> menu/game).

How the app uses it
- `src/components/Story.js` mounts it with `useMachine(StoryMachine)`.
- Once auth + user/organization data is ready, it sends `TOGGLE` to move into `main`.
- `main` currently acts as a placeholder for the game/menu UI (see `src/components/PlayMenu/PlayMenu.js`).

Events
- `TOGGLE`: transitions `ready` -> `main`

States
- `ready`: initial state
- `main`: placeholder state (no transitions currently defined)

---

## `tutorialMachine` (`src/machines/tutorialMachine.js`)

Role: runs the in-game tutorial flow driven by timed step transitions and pose matching.

How the app uses it
- `src/components/Tutorial.js` mounts it with `useMachine(TutorialMachine)`.
- It sends `NEXT` after the pose similarity threshold is reached (while in `running`).
- It calls `props.onComplete()` when the machine reaches `final`.

Data source
- tutorial steps are loaded from `src/scripts/tutorial.toml`:
  - `tutorial.instructions[*].text`
  - `tutorial.transitionText`

Events
- `NEXT`
  - In `running`, advances either to:
    - `transition` (when more steps remain), or
    - `final` (when the last step is complete).

Main states
- `welcome` and `welcome2`: timed intro states that auto-advance
- `running`: waits for pose matching and `NEXT`
- `transition`: shows `transitionText`, then returns to `running`
- `final`: tutorial complete (machine stays in this state)

