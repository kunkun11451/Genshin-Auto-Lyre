# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

This project uses `electron-vite` with `npm` for building and development.

- **Start development server:** `npm run dev`
  - Starts the electron-vite development environment.
- **Build the application:** `npm run build`
  - Compiles both main and renderer processes using electron-vite.
- **Preview the build:** `npm run preview`
  - Previews the packaged electron-vite application.
- **Package for Windows:** `npm run pack`
  - Uses `electron-builder` to package the application as a standalone executable (`.zip` format containing the `.exe`). Output goes to the `dist/` folder.

## Architecture & High-Level Structure

This is an Electron application leveraging React for the frontend and Zustand for state management. It allows users to automatically play MIDI files in Genshin Impact (or similar 21-key games).

The application is structured into standard Electron separation of concerns:

- **Main Process (`src/main/`)**:
  - Handles window control, auto-updating (`updater.ts`), and importantly, the low-level keyboard simulation (`keyboard-simulator.ts`) required to send keystrokes to the game.
  - It also manages background tasks like a headless login/download service.
  - Entry point: `index.ts`.

- **Preload Script (`src/preload/index.ts`)**:
  - Bridges the gap between the secure frontend and the Node.js backend. It exposes safe IPC (Inter-Process Communication) methods for the React app to interact with main process functions (like requesting key presses, reading MIDI files from the filesystem, etc.).

- **Renderer Process / Frontend (`src/renderer/`)**:
  - **React UI**: Built with standard React functional components (`src/renderer/components/`). Key UI chunks involve `FileList` (MIDI library), `PlaybackControls`, and a `TrackCanvas` for visualizing the notes.
  - **Core Logic (`src/renderer/core/`)**: Contains the algorithms for parsing MIDI, mapping MIDI notes to the 21-key layout (including black key mapping algorithms), and handling Tone.js for in-app audio previewing.
  - **State Management (`src/renderer/store/`)**: Uses `zustand` to manage global state (e.g., current playing state, selected tracks, settings, multiplayer session context) making it accessible across the React component tree without heavy prop-drilling.

### Key Concepts

- **MIDI Interpretation**: The application reads `.mid` files from a local `midi` folder in the root directory.
- **Audio Preview vs. Automation**: The renderer handles reading the MIDI and can stream audio using `tone` and `@tonejs/midi` to "preview" the song using sampled game instruments. Simultaneously (or alternatively), it calculates the required keystrokes and sends requests via IPC to the main process to physically simulate those keypresses on the OS level.
- **Multiplayer**: Features peer-to-peer capabilities (using `peerjs`) for synchronized ensemble playing.

## Tech Stack Note
- Frontend: React 19, Zustand 5, Tone.js
- Backend: Electron 33
- Tooling: TypeScript, Vite (via electron-vite), electron-builder