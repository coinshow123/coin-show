# Show page (`/show/<slug>/`): overrides

- **Top box:** dark ink panel, white text, cover art on the left (computer) or above (phone).
- Tier tag inside the dark box: NATIONAL gold. REGIONAL uses a light green tag (`#E3EEE8` with dark green text) so it reads on the dark background.
- Quick facts sit in the dark box as a ✓ list, 17px white with gold ticks: dealers listed, admission, auction, countdown.
- **Two buttons only:** gold `Add to calendar ▾` (a `.cal-dd` menu with Google Calendar, Apple Calendar (iPhone, Mac), Outlook) and outline-light `Directions`. The official website is a small cream text link under them.
- The calendar menu is white, radius 10px, `--shadow-pop`, rows 48px tall. Its CSS is scoped to `.cal-dd` so it never touches the dealer page's calendar box.
- **Ended shows:** gold-tint notice "This show has ended" with a link to upcoming shows in the state. No calendar or directions buttons.
- The organizer box (`.promoter-box`) is a gold-tint callout with gold and ghost buttons.
