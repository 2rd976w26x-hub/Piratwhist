# Player layout requirements (PC + Mobile)

This document is the single source of truth for player seating layout rules on the play board.

## General
- The center table image/pile stays centered in the board and should not be covered by seats or the hand area.
- Player seats are rendered around the center image and must remain visible at common desktop/mobile zoom levels.
- The local player is always the reference for seat placement (local seat = “bottom” in layout logic).

## PC layout (desktop)
- **Hand area (red zone):** Bottom-left of the board. The hand should be docked left, not centered, and occupy roughly the left 55–60% width.
- **Local player (yellow zone):** Bottom-right of the board. The local player seat should be positioned in the reserved right-bottom area.
- **Other players:** All remaining seats must be placed in the remaining space around the center image (top/top-left/top-right/left/right/bottom-left/bottom-right), avoiding the hand area.
- **Overlap rules:** Seats must not overlap the hand area; any seat whose center would land inside the hand zone must be shifted up to clear it.
- **Zoom/resolution:** Layout must remain stable at common desktop widths (≥900px) and browser zoom levels (90–125%).

## Mobile layout
- **Do not modify the existing mobile layout logic.**
- Mobile uses a rectangular grid layout and a centered hand dock above the bottom bar.
- Seat placement is deterministic and must keep all seats within the board container on small screens.
- **Zoom/resolution:** Layout must remain stable on phones and small tablets (≤860px), including iOS Safari with dynamic viewport changes.
