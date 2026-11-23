# All shows and month pages (`/coin-shows/`, `/coin-shows/<month>-<year>/`): overrides

- **Filter box ("look B"):** `--brass-tint` background, 2px `--brass` border, radius 14px, padding 20px 22px (18px 16px on phones).
- **Chips inside the filter box:** white, border `#D9C48E`. Selected = **green** (`--wine`) with white text, unlike the ink selected state used elsewhere. Owner chose this look on 2026-10-23.
- **Chip labels (owner's wording):** "National Show", "Regional Show", "This Weekend", "Free Admission".
- **Search:** label "Search by show name", placeholder "Show name", helper line under the box: "Example: FUN, Central States, Long Beach…". It searches show names only.
- **Month bands:** a `--brass-tint` row with a 3px `--brass` top border, Literata month name and a muted "N shows" count. On phones it gets 10px 12px padding and an 8px top radius.
- 25 shows per page, pager `1 2 3 4 5 … last`. Filters are kept in the address (q, state, month, size, weekend, free, page).
