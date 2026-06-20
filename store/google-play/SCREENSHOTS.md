# Play Store screenshots — capture guide

## Important: Google Play allows a MAXIMUM of 8 phone screenshots
(minimum 2). So pick the best 8 from the list below. I've ordered them best
first; the last two are alternates if you want to swap.

## Specs
- Format: PNG or JPEG, portrait.
- Recommended size: 1080 x 1920 (9:16). Play accepts 320 to 3840 px per side.
- No device frame needed (Play shows them plainly). You can add frames/captions
  later with a tool if you want them prettier.

## Before you capture
1. Make sure the DEMO account has sample data: log in as demo@yardao.com /
   Awesome1 and confirm there are vehicles, bookings and stock showing. If it
   looks empty, run the demo seed SQL first (Block A + B from earlier) so the
   shots look alive.
2. Use LIGHT mode for clarity (it photographs better for store listings).
3. Use a clean device: full battery/signal look is fine on the emulator.

## How to capture in the Android emulator (easiest)
- Open the app in the emulator, navigate to the screen.
- Click the camera icon in the emulator's side toolbar (Take screenshot), or
  run: adb exec-out screencap -p > shot.png
- Save each into this folder as screenshot-01.png ... screenshot-08.png.

## The shot list (best, "suggestive" set, in order)

1. Yard dashboard (pipeline view) - THE hero shot.
   Columns of vehicles with the status counts (Ready / Pending / Repairs /
   On hire). This sells the whole product in one image.

2. Vehicle detail.
   Tap a vehicle: clean header (reg + make/model), status, insurance, docs.
   Shows the polish.

3. Check-in.
   The check-in screen with the mileage field and condition/damage map.
   Demonstrates the core daily action.

4. Service bookings.
   The calendar or "today" view with a few bookings on it.

5. Create / edit a booking.
   The booking form with vehicle, date, time, mechanic. Shows scheduling depth.

6. Stock and parts.
   The parts list with stock levels (and the scan action if visible).

7. Invoice.
   A created or viewed invoice with parts + labour totals. Shows you can bill.

8. Zao assistant.
   The assistant panel mid-command (e.g. "Book HN74 for tyres on Friday").
   A great differentiator shot.

Alternates (swap in if you prefer):
9. Notifications / bell with an MOT or booking alert visible.
10. Fleet list or MOT compliance view (the alerts).

## Tip
Lead with shots 1, 2, 3 - the first 2 to 3 are what most people actually see in
search results, so put the strongest there.

## (Optional) nicer marketing screenshots
If you want device frames + a caption strip on each (looks more premium),
capture the raw shots first, then we can run them through a framing step. Ask
me and I'll prep that once the raw PNGs exist.
