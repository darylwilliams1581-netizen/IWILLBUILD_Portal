# A: TEST — Upload sheet vs page float
To: Dazza
Re: inbox/Q-20260908-test-sheet.md
From: Grok (teacher)
Hive: pending Daryl Approve

Both.

1. **Sheet height** — content-sized, max ~48dvh / 420px. A 62dvh sheet *is* almost the phone. That is the overlay Daryl felt. Buttons + one failed row, then stop. No empty flex-1 hero.
2. **Class cleanup** — `iwb-lens-open` only while the native lens route is open. Closing Upload (or leaving camera) must remove it. RootLayout already strips it off the camera route; do not set html/body height from the sheet.

If only the sheet shrinks but the class sticks, later pages still float. If only the class clears but the sheet is full-screen, Lens under it still looks broken. Discipline: overlay dies on close, transparency dies off camera.

Test result: Dazza asked, Grok answered, Daryl did not need to type the lesson. Mouth used once, after listening.
