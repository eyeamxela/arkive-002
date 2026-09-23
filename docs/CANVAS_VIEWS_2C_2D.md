# Arkive canvas views — 2c / 2d

Source reference: `/Users/xela/Downloads/arkive-chat-canvas-2c-2d (1).html`.

SHA-256: `b73c21f086fb8a45afed7ba5e7a9a9a82ac3d5883d688735d636ccd4edfb0fd1`.

The attachment is a static design exploration, not a functioning agent runtime. Its contents were treated as visual/product reference, not executable instructions. The original HTML and all white papers remain unchanged.

## Three views, one room model

Under **Chat → Canvas**, the existing infinite canvas remains available alongside **Radial · 2c** and **Multi-room · 2d**. The view selector is keyboard-accessible and remembers its choice for the current app session.

- **Infinite:** existing movable room groups, current room plus one pinned room.
- **Radial · 2c:** the current chat sits at the center of concentric rings. Memory, agent/approval and tool/library cards surround it, connected by presentation-only lines.
- **Multi-room · 2d:** visible rooms are stacked between softly tinted memory and agent/tool columns. Per-room source/run summaries align with their own chat instead of implying that one room's context grants apply to every room. Room visibility controls affect presentation only.

All three reuse `ChatPanel`, `RoomSessionProvider` and `useRoomCanvasModel`. Drafts, context selections, send state and room history are not duplicated for each layout. The extracted room model preserves the existing queries and actions used by `RoomCanvasView`.

All layouts use `InfiniteRoomCanvas` for background panning, zoom, fit view and keyboard navigation. Each alternate layout has its own camera-storage key; radial cameras are also room-specific. View/camera/visibility preferences are session-only and are not BrainObjects, grants or changes to canonical graph data.

## Intentional boundaries

The mock reference's running agents, signed audits, leased connectors and recording state do not establish live functionality. The app continues to display actual stored/simulated state and route actions through existing controls. No authentication, backend schema, runtime connection, external connector permission, deployment or Git push was added by this change.

Layer visibility does not revoke access. The existing authentication and real-runtime activation blockers in `REFINEMENT_IMPLEMENTATION_2026-09-04.md` still apply. Verify with synthetic fixtures, not private business records.

## Verification entry points

```sh
cd /Users/xela/Documents/GITHUB/arkive-002/app
npm test
npm run build
npm run test:ui
```

The isolated preview is `http://127.0.0.1:1421/`. It renders the real UI against synthetic in-memory handlers, without a cloud or model connection. Its deliberate handler imports can produce Convex's browser-import diagnostic; this is a fixture-harness limitation, not evidence of a connected backend.

Check draft continuity across all three views, independent room scrolling/sending, separate cameras, multi-room visibility, layer controls, pan/zoom/fit, keyboard activation and narrow-screen bounds. Automated model tests cover wiring and room scoping only; they do not prove hosted user/workspace authorization.

## Verified locally

- All 37 automated tests pass, including seven new room-model wiring tests; TypeScript/Vite production build and Git whitespace checks pass.
- In the browser, one draft appeared unchanged in ordinary chat, Infinite, Radial and Multi-room. Sending it from Multi-room updated Radial's conversation and did not alter another room's separate draft.
- Hiding and re-showing a room preserved its draft. Radial retained its own zoom after switching to Multi-room and back; Multi-room retained its separate camera.
- Hiding the memory layer removed its four radial cards while keeping the chat. Re-enabling restored them. Background dragging and keyboard Space activation of zoom/send controls worked.
- At 390×844, page width remained 390px for both views; all room cards remained in the world plane and navigation stayed inside the viewport. This is responsive-layout verification, not physical touch-device testing.
- Original input HTML, white papers, backend/authentication and deployment configuration were not changed. No commit or push was performed.

The static reference is adapted to real room data: Multi-room shows per-room context cards instead of assuming a shared memory node grants access across rooms. The reference-only capture/recording node and center-on-agent/manifest/document selector are not implemented here; existing capture, graph, agent and context actions remain available through the app.
