# Devpost fields: Touch Grass

**Name:** Touch Grass
**Tagline (≤140):** A bedtime pop-up storybook on your tray table. Pinch the page to turn it, and the world pops up. Breathe with Pip to calm down. Hands only.
**Track:** Entertainment
**Division:** New Experience
**Project link:** https://fozagtx.github.io/touch-grass/
**Code:** https://github.com/fozagtx/touch-grass
**Target launch date:** December 2026 (playable today in the Meta Quest Browser)

## Description
### Inspiration
Bedtime stories are the oldest interactive entertainment there is: a child turns the page, points at the owl and makes the noise. Pop-up books made that physical. VR can do what paper never could and let the pop-up actually come alive, without screens full of buttons and without a controller in a sleepy hand.

### What it does
A storybook opens on your tray table. Pinch the glowing corner to turn the page, and that page's world rises out of the book: Pip's house on Hush Hill, Whisper Wood with Old Owl, a river of sleeping stars, the moon caught in a cloud. Each page has one gentle hands-on moment. Say hello to Pip, wake the five stars one at a time (each one plays a note of a lullaby), and tickle the cloud until it drifts off the moon. Then comes a calm breathing page for anyone feeling anxious at bedtime: pinch and hold while you breathe in (a moon-orb slowly grows), let go while you breathe out, and each full breath sends a star into the sky. On the last page you pinch the moon to say goodnight, the room slowly dims, and Pip curls up. The whole story takes about three minutes, which makes it a wind-down ritual.

### How we built it
- WebXR with three.js and no build step, hosted on GitHub Pages, so it launches instantly in the Meta Quest Browser.
- WebXR Hand Input: we read the thumb and index fingertip joints each frame and detect a pinch with hysteresis (on under 2 cm, off over 3.5 cm), then hit-test the pinch point against story objects and the page corner.
- Every pop-up piece scales in with an ease-out-back curve and a short stagger, so the scene unfolds like paper engineering.
- All art is procedural geometry and all sound is synthesised in Web Audio, so there are no external assets.
- A `local` reference space places the book 45 cm in front of your head. It's built for a bed, a couch or an airplane seat.

### What's next
Pip visits real places around the world, with each pop-up matching that place's real time of day and weather. More stories, a parent-reads-aloud mode where a second person joins as narrator, players building their own pop-up pages, and a nightly "one new page" ritual so there's a reason to come back.

## Hand interactions
Pinch is the only verb, and pinch-and-hold paces your breathing. Pinch the corner to turn the page, pinch a character to make it react, pinch the moon to say goodnight. No controller is needed at any point. What excites us is VR as something calm and close, a story you hold in your lap.
