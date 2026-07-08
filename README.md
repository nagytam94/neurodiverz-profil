# Neurodiverz profil-szűrő

Interaktív, magyar nyelvű **önismereti** kérdőív, amely 14 neurodivergens mintázat
(ADHD, autizmus, diszlexia, diszkalkulia, diszgráfia, diszpraxia/DCD, Tourette/tic,
OCD, szenzoros feldolgozás, fejlődési nyelvi zavar, PDA, hiperlexia, mizofónia és a
kétszeresen kivételes profil) megfigyelhető viselkedésformáira kérdez rá, majd egy
vizuális **neurodiverz profilt** ad — radardiagramokkal, valószínűség-sávokkal,
kombinációs (komorbid) elemzéssel —, amely **PDF-be is exportálható**.

➡️ **Élő verzió:** https://nagytam94.github.io/neurodiverz-profil/

## ⚠️ Fontos

Ez egy **tájékoztatási és önismereti eszköz, NEM diagnosztikai teszt.** A
neurodivergencia megállapításához klinikai szakember (pszichiáter, klinikai
pszichológus, neurológus, logopédus) mélyreható értékelése szükséges. A magas
pontszám nem jelent diagnózist, az alacsony nem zárja ki egy állapot fennállását.

## Jellemzők

- **112 kérdés** (14 állapot × 8), 5-fokú Likert-skála
- **Kor-adaptív:** felnőtt / serdülő önbevallás, illetve gyermekről szülőként
- A kérdések **validált önkitöltős mérőeszközök** nyelvezetére épülnek
  (ASRS, RAADS-R, AQ-50, CAT-Q, EDA-QA, MisoQuest, OCI-R, PUTS, ADC, ARHQ…)
- **Vizuális kiértékelés:** állapot- és domén-radar, valószínűség-sávok, kiemelt
  profilok, kombináció- és differenciál-jelzések
- **PDF-export** a böngésző natív „Nyomtatás → Mentés PDF-be" funkciójával
  (dedikált `@media print` elrendezés; kijelölhető szövegű, színhelyes kimenet)
- **A válaszaid helyben maradnak** — a kitöltés a böngésződ localStorage-ában tárolódik,
  az alkalmazás nem küldi szerverre és nem tartalmaz analytics/követő kódot.
  (A tárhely — GitHub Pages — a szokásos hozzáférési naplót vezetheti, pl. IP-cím;
  a teszt tartalmát ez nem látja.)
- Sötét / világos téma

## Technikai

Tisztán statikus alkalmazás — HTML + CSS + vanilla JavaScript. Egyetlen külső függőség,
lokálisan mellékelve a `vendor/` mappában: [Chart.js](https://www.chartjs.org/) (radardiagramok).
A PDF a böngésző natív nyomtatásával készül, nem kell hozzá külön könyvtár.
Nincs build-lépés: `index.html` közvetlenül megnyitható, vagy bármilyen statikus
tárhelyen (pl. GitHub Pages) kiszolgálható.

A kérdések szakirodalmi alapja egy 14 állapotot lefedő, DSM-5-TR / ICD-11 alapú
tünet- és viselkedés-katalógusból származik.
