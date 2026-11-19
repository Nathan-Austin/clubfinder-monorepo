# Who Clubfindr is for: personas

Written 2026-11-19 with the owner. Not a specification: a set of people to argue with when a
design, a fix or a priority is being decided. When a change helps one of them and hurts none,
it is probably right; when it helps nobody here, ask why we are doing it.

The one sentence the product exists for, in the owner's words: **help people get to where they
will actually enjoy being.** Anyone can find a list of bars and clubs. The failure Clubfindr
fixes is the night where you queued, paid, walked in and the music was wrong: hard techno when you
like melodic techno, a flat house floor when you wanted something upbeat, a bar whose playlist
kills the conversation. The product is right when the person on the dance floor or at the bar
thinks "yes, this".

How the product maps to these people today: customers have the app (Home, Discover, Search,
Tilki with its Bars and Clubs modes and the date, Profile) and the web (`/` for visitors,
`/users-home` → `/clubs` for club events and `/barfindr` for venue nights). Venues have the app's
Overview, Events, Music and Venue tabs and the web `/bars` dashboard. Promoters have
`/promoter-home`. Taste is a profile of favourite artists (3-5 at sign-up, Last.fm import, bare
genre picks), weighted and matched against clusters of genres (`$lib/server/genreMatching`,
KNOWN_ISSUES 32). Covered cities: `data_collection/live_cities.txt`.

---

## Customers

### 1. Lena, the local regular — "the right floor, not the right club"

Berlin, 31, goes out two or three weekends a month, knows the scene. Her taste is specific: she
loves melodic, minimal and dub techno, deep and organic house; she cannot stand hard or
industrial techno, and big-room or "business" house bores her. She has paid 20 euros and queued
an hour to find the main floor doing 150 bpm and the second floor doing nothing she wanted.

**What she wants.** On a Friday afternoon: "which night, and which room, will be *my* kind of
techno tonight?" She wants a short, confident list, each with a reason she can check
("Melodic techno, Deep house · Panorama floor"), ordered by how much of the night is hers. She
would rather see three good matches than fifteen vague ones.

**How she uses it today.** The app's Tilki → Clubs on tonight's date, or `/users-home` → Find
events → `/clubs`. Her profile is built from artists she named and a Last.fm import, so her
genres include both "techno" sub-clusters' neighbours.

**Where today falls short, and what it means for us.**
- There is no way to say *no*. Her profile has only likes, and "techno" as an umbrella reaches
  all four techno sub-clusters, including "Dark and Industrial Techno" where hard techno lives.
  The cluster tree already tells minimal from hard, so a negative pick (a genre or a sub-cluster
  to steer away from, weighted below zero or excluded) would fix her night without a new
  taxonomy. Not built; the matcher has no exclusions besides Uncategorized.
- A club night is one event with one genre list. A two-floor night with a hard floor and a
  melodic floor reads as one mixed event and scores half-right for her. Line-ups per floor or
  room (the scrape has artist lists per event, often with stage names) is the data model gap
  behind the owner's own bad nights. Open design question, section "Open questions".
- Energy is not a genre. "Upbeat house" versus "dull house" is partly sub-cluster (Modern House
  versus Deep/Tech House) and partly tempo and mood that no genre tag carries. An energy or
  mood axis on nights (from the venue or promoter, three or five words) is cheaper than trying
  to infer it.
- **Rule for us:** every result she sees must say *why* it matched, in genres she recognises.
  A score without a reason is a guess she cannot check before she pays.

### 2. Tomasz, the weekend visitor — "somewhere good tonight, in a city I don't know"

Kraków, 27, in Amsterdam for three nights with one friend. Not a regular anywhere. Likes
upbeat, funky, disco-leaning house and some afro house; happy in a bar with good music and a
drink before deciding whether to go on to a club. He has no idea which neighbourhoods matter,
and he does not want a Reddit thread or a tourist listicle.

**What he wants.** Install, say what he likes in under a minute, be in the right city without
typing it, and get "tonight, near here, bars first". If a club comes out of it, fine, but the
first ask is a bar where the music is his.

**How he uses it today.** Downloads the app on the tram. Sign-up, e-mail code, straight into
the artist picker (since 2026-11-19), names four artists, the app proposes Amsterdam from his
location (he has no saved city), accepts. Discover and Tilki → Bars for tonight.

**Where today falls short, and what it means for us.**
- Every minute of sign-up costs him. The 3-5 artists step is good; anything added before the
  first results (city confirmation dialogues, policy screens, a second login) is a reason to
  close the app. The 2026-11-19 "straight in after verifying" change exists for him. Measure
  sign-up to first result; keep it under a minute.
- He is the person a wrong city hurts most (KNOWN_ISSUES 67 was found on a phone, but a
  visitor would never find the setting). The location proposal must be visible and one tap.
- He will trust the first list he gets. If it is empty ("There are no events in Amsterdam on
  this date yet", the data gap of 2026-11-18) he concludes the app is dead, not that the scrape
  broke. An empty list should say what we *do* have (bars with nights, nearby cities, another
  date) rather than only what we do not.
- Distance matters more to him than to Lena. Coarse location is enough (we are on
  `Accuracy.Low`), but "how far" has to be on the card.
- **Rule for us:** the visitor path is the one to protect. Never put an account, a saved city
  or a profile between a new person and their first result.

### 3. Priya and her friends — "we want a drink first, somewhere that's not awful"

London, 34, Thursday after work, five people, mixed tastes (she likes soul, funk and disco; one
friend is indie rock; one is "anything but techno"). They want a bar for a couple of hours where
the music is good enough that everyone is happy, maybe live music, not so loud they cannot talk.
A club later is a maybe for two of them.

**What she wants.** One pick she can send in the group chat that nobody vetoes. She is choosing
*for a group*, on her phone, in a hurry, while walking.

**How she uses it today.** Tilki → Bars, today's date, maybe the Live music chip. She reads the
top card's genres and the venue's events and sends the name.

**Where today falls short, and what it means for us.**
- Matching is for one person. There is no "we are five, here is roughly what we like" and no
  way to combine profiles. A lightweight version is a temporary list of genres for tonight
  (`docs/tonights-vibe-proposal.md`), which she could fill with the group's words in thirty
  seconds; a heavier one is sharing a night with friends and letting them thumbs it.
- Bars are about vibe at least as much as genre: live music, DJ or playlist, loud or
  conversational, smoking inside (the registration asks this already), outdoor space, late
  licence. Live music became an attribute on 2026-11-19; the others are candidates for the same
  treatment (a small, fixed set, filterable, never genres).
- A venue card she will forward needs to stand alone: name, what is on tonight, genres, how
  far, a link that opens for someone without the app (KNOWN_ISSUES 88 is exactly this failure
  for QR codes).
- "Anything but techno" is a real preference from a real person; see Lena's negative pick.
- **Rule for us:** a result must be forwardable and vetoable: a friend must be able to say
  "no, not that" from the card alone.

### 4. Marcus, the explorer with wide taste — "I contain multitudes"

Barcelona, 38, listens to everything: a rock side (indie, post-punk), a disco and soul side, a
latin side, and a smaller electronic side. His Last.fm import gave him 32 genres. He goes out
to discover, not to confirm, and is the most likely person to try a night he has never heard of.

**What he wants.** Suggestions that take one side of him seriously at a time: "your indie
side, tonight: this" rather than a middling score that averages him out.

**How he uses it today.** Discover and Search, `/clubs` by date. His results are ordered by a
single similarity across all 32 genres.

**Where today falls short, and what it means for us.**
- Measured 2026-11-11 (ROADMAP section 2): scoring each side of his taste separately lifts the
  indie night from 0.09 to 1.0 and the latin night from 0.14 to 0.67. One profile flattens him.
  The open decision is granularity (cluster or sub-cluster) and that a side must be chosen from
  his taste alone, never from the night. He is the persona for that decision.
- Saved mixes (`tonights-vibe-proposal.md`) are sides he names himself; that may be the better
  first step, because he knows his sides and we do not have to guess them.
- Diversity in a list matters to him more than to Lena: the MMR pass that keeps results varied
  is right for him and should not be weakened for her. Both need to hold.
- **Rule for us:** a wide profile is not a vague profile. Never let breadth read as weak
  interest.

### 5. Sam, the guest who will not sign up — "just show me"

Paris, 22, found the website, is not installing anything and is not making an account for a
night out. Picks a few genres from the picker on `/`, lets the browser guess the city, searches
tonight.

**Where today falls short, and what it means for us.**
- Everything Sam does is cookies with a one-hour life: the city, the date, the picked genres.
  "Change the vibe" and "Change Date" must keep what was picked; losing a guest's genres on the
  way back is the kind of bug that ends the visit (KNOWN_ISSUES 24 had one).
- Sam is who the home page's location guess exists for; it must never leak into a logged-in
  user's saved city (fixed 2026-11-18 on `/users-home`).
- The conversion offer is "save this so you do not pick it again", after results, never
  before.
- **Rule for us:** the web visitor path is a product, not a funnel. It has to work complete,
  with no account.

---

## Venues and the people who run nights

### 6. Dana, the bar manager — "find me the people who'll love it here"

Rotterdam, runs a 60-seat bar with a DJ on Fridays (deep and soulful house) and a live band
night every second Thursday. Does everything from her phone between shifts. Has no marketing
budget and no time; wants to be found by people who will like the place and stay for a second
drink, and would like to know whether the app brings anyone.

**How she uses it today.** The app's venue side: Overview (tonight's visitors, next event,
check-in code), Events (her nights, recurring, live music switch), Music ("genres you play",
the artists she plays), Venue (profile, QR codes). Or the web `/bars` dashboard.

**Where today falls short, and what it means for us.**
- Her time is the constraint. Describing the bar must take five minutes once (genres, a few
  artists, the smoking and live-music facts) and a repeating night must be entered once (done
  2026-11-19: recurring dates, cancel one date). Every field we add is a field she skips, so
  default well and ask for little.
- She needs proof it works: check-ins by QR code per night and matched visitors, not a tile
  that says 0 (ROADMAP "real venue insights"). Until there is data, say "no check-ins yet"
  rather than a number.
- Genres she types must be accepted or corrected *while she types*, not refused after Save
  (the inline amber chips decided 2026-11-19). A refusal with no way forward loses the whole
  form on a phone.
- Her customers are Priya's group: the vibe attributes (loud or quiet, live or DJ, outdoor)
  are hers to declare, and the fewer the better.
- **Rule for us:** on the venue side, assume a phone, a noisy room and two minutes. Nothing
  may take longer than that or be lost on a refusal.

### 7. Kemal, the club booker — "three floors, three crowds"

Berlin, books a club with a main floor, a second room and a garden in summer. Different line-ups
per floor, sometimes different promoters per floor. He knows exactly who each floor is for and
is frustrated when the club is described as one genre; the hard-techno main floor scares off the
people who would love the second room, and the other way round.

**How he uses it today.** Mostly not: club events come from the scrape (Resident Advisor and
the like) with the line-up's artists and the genres Spotify knows for them; he has no account
and no control over how his night is described. If he registers as a venue he becomes a "bar"
in our model, with venue nights that `/barfindr` and Tilki → Bars show.

**Where today falls short, and what it means for us.**
- The scraped event is the whole night. His three floors are one genre list, which is Lena's
  problem from the other side. Floors or rooms on an event (name, line-up, genres), whether
  scraped where the source lists stages or declared by a venue that claims its scraped events,
  is the single change that serves Lena, Kemal and the owner's own bad nights at once.
- About half the scraped artists have genres (KNOWN_ISSUES 92): a night of unknown artists
  matches nobody. He would fill the gap himself in a minute if he could claim the event.
- He wants to reach the right crowd for each floor, not more people. A match should be able
  to say "the second room is yours", which needs floors.
- **Rule for us:** a night is not one genre list. Design events so that rooms can be added
  without starting over.

### 8. Jo, the promoter — "it's my night, wherever it is"

London, runs a monthly disco and boogie night that moves between venues, and a weekly small
house party at the same bar. Jo's identity is the night and its residents, not the building.
Wants the night found by people who like that music, wherever it happens, and wants to know how
many came because of it.

**How they use it today.** `/promoter-home`: creates events with a venue, date, genres and a
line-up (promoter auth fixed 2026-11-14, KNOWN_ISSUES 51, 61-63).

**Where today falls short, and what it means for us.**
- Promoter events sit beside scraped events and venue nights, and the same night can exist as
  two or three records (scraped from RA, entered by Jo, entered by the bar). De-duplication by
  venue, date and name, with the richest description winning, is what keeps a customer from
  seeing the same night twice with different genres.
- Jo's residents are the best genre signal we have for the night; a line-up should pull its
  genres from the catalogue the way the taste profile does (`taste_artists`).
- Jo is the second person after Dana who needs a check-in count per night.
- **Rule for us:** events belong to nights, nights have owners (a venue, a promoter, or the
  scrape), and one night should resolve to one record.

### 9. The operator — "is the data fresh and is it right?"

The owner, running the scrape at 02:00, the Spotify artist step, the deploy. Not a customer
persona, but every persona above fails first through data: the Clubs side was empty for three
months before anyone noticed (2026-11-18).

**What matters.** Counts that would have caught that: events per city per day, upcoming
artists without genres per city (the 2026-11-18 tiering), and a visible "last successful run".
A customer-facing empty state that names the gap, so a tester notices.

---

## What these people agree on

1. **Say why.** Every match shows the genres (and, once we have them, the room and the
   attributes) that produced it. No bare scores.
2. **Dislikes are first-class.** Lena, Priya's friend and Kemal's crowds all need "not that".
   The cluster tree can already express it; the profile and the matcher cannot yet.
3. **A night is not one genre list.** Rooms and floors, a small fixed set of vibe attributes
   (live music is the first), and later an energy or mood word.
4. **Breadth is not vagueness.** Marcus's sides and the owner's own "I like techno, not hard
   techno" are the same problem: score against the relevant part of a person, not their average.
5. **First result in a minute, no account required for the web.** Tomasz and Sam.
6. **Phone, noise, two minutes** on the venue side. Dana and Kemal.
7. **One night, one record, one owner.** Jo.
8. **Empty is a message, not a blank.** Every empty state says what we do have.

## Open questions these personas raise (not decided)

- **Negative taste.** A per-genre "avoid" on the profile (and in Tonight's vibe): exclude the
  sub-cluster, or weight it negatively? Exclusion is simpler to explain ("never show me hard
  techno"); a weight lets a mixed night still appear lower.
- **Rooms and floors on events.** Scraped where the source lists stages; declared by venues
  and promoters otherwise. Match per room and show the room in the reason. Needs a schema
  decision (`event_rooms`?) before any UI.
- **Vibe attributes for bars.** Which three to five after live music: DJ or playlist, loud or
  conversational, outdoor, late, smoking (already a registration field).
- **Energy.** A three-word scale per night declared by the owner of the night, or nothing.
- **Groups.** Tonight's vibe filled with a group's words, or shared nights with vetoes.
- **Claiming scraped events.** Letting a registered venue or promoter own and correct a
  scraped night, which also solves duplicates.

When one of these comes up, start from the persona it serves and the rule it follows above.
