# Kurs: Einführung ins Programmieren

**Zielgruppe:** Schülerinnen und Schüler um 15 Jahre, die zum ersten Mal programmieren.
**Umfang:** 7 Kapitel (inkl. Willkommen), 17 Theorieblöcke, 39 Levels. Rund 8–10 Lektionen.
**Sprache der Plattform:** JavaScript-Teilmenge von Dewy, Sprachstufen 1–5.

---

## Aufbau und Prinzipien

| Kapitel | Thema | Sprachstufe | Neue Idee |
|---|---|---|---|
| 0 | Willkommen | – | Dewy, die Lagerhalle, die Plattform |
| 1 | Erste Befehle | 1 | Sequenz: Befehle laufen der Reihe nach |
| 2 | Wiederholen | 2 | `repeat(n)`, verschachtelte Schleifen |
| 3 | Entscheiden | 3 | Sensoren, `if` / `else`, `===` |
| 4 | So lange wie | 4 | `while`, `!`, Variablen, `&&` / `\|\|` |
| 5 | Eigene Befehle | 5 | `function`, Parameter, `return` |
| 6 | Abschlussprojekt | 5 | alles kombiniert |

**Eine Idee pro Block.** Jeder Theorieblock erklärt genau ein Konzept in wenigen Sätzen und einem Codebeispiel. Jedes Level übt genau dieses Konzept. Alles andere im Level ist schon bekannt.

**Wiederholen, dann weiterbauen.** Jedes Kapitel greift die vorherigen wieder auf. Mehrere Levels sind absichtlich **bekannte Levels mit neuem Werkzeug**: dieselbe Lagerhalle, aber jetzt mit Schleife, mit `while` oder mit einer Funktion gelöst. So sehen die SuS, was das neue Konzept bringt.

**Das Speicherlimit ist das wichtigste Lehrmittel.** Die Welt in Dewy ist fest und vollständig sichtbar. Ohne Limit kann man jedes Level mit einer langen Befehlsliste lösen, und Schleifen oder Sensoren wirken überflüssig. Darum hat jedes Level, das ein neues Konzept einführt, ein Speicherlimit, das genau mit dem neuen Konzept reicht. Gezählt wird: jede Anweisung 1, ein Block 1 plus sein Inhalt (`repeat(4) { moveForward(); }` = 2). Die Werte unten sind aus der Musterlösung berechnet.

**Zwillingslevels.** Weil die Welt fest ist, kann das Spiel nicht prüfen, ob ein Programm *allgemein* ist. Darum gibt es ab Kapitel 3 Zwillinge: gleiche Aufgabe, andere Masse. Wer allgemein programmiert hat, kopiert den Code und ist fertig. Wer Felder abgezählt hat, merkt den Unterschied.

**Kapitel-Einstellungen in Dewy:**
- Kapitel 1–5: Items *in Reihenfolge*. Ab Kapitel 2 *gesperrt bis das vorherige Kapitel fertig ist* (Checkpoint, den die Klasse gemeinsam überschreitet).
- Kapitel 6: Items *in beliebiger Reihenfolge*, gesperrt.

### Legende für die Karten

Norden ist oben. `▶ ▼ ◀ ▲` = Dewy und seine Blickrichtung.

| Zeichen | Bedeutung | Zeichen | Bedeutung |
|---|---|---|---|
| `.` | Boden | `Z` | Zielfeld |
| `#` | Wand oder Möbel | `O` | Loch |
| `Kr` `Kb` `Kg` `Ky` | Kiste rot/blau/grün/gelb | `K.` | graue Kiste |
| `Ar` `Ab` `Ag` `Ay` | Abgabestelle in der Farbe | `S` | Schalter |
| `T` | Tür (geschlossen) | `k` | Schlüsselkarte |
| `P` | Druckplatte | `M` | Feld im Bereich einer Kamera (aktiv) |

---

## Kapitel 0 · Willkommen

**Theorie 0.1 · Willkommen bei Dewy** — Der bestehende Einführungstext (`src/lib/server/starter/einfuehrung.md`): Dewy, die Lagerhalle, die wichtigste Regel (*fast alles betrifft das Feld vor Dewy*), Abstürze, der Level-Bildschirm, Regeln für den Code.

---

## Kapitel 1 · Erste Befehle

Sprachstufe 1 · Kein Speicherlimit · Ziel: *Ein Programm ist eine Liste von Befehlen, die von oben nach unten ausgeführt wird.*

### Theorie 1.1 · Fahren und drehen

> Dewy kennt drei Befehle, um sich zu bewegen:
>
> ```js
> moveForward(); // ein Feld vorwärts
> turnLeft();    // eine Vierteldrehung nach links
> turnRight();   // eine Vierteldrehung nach rechts
> ```
>
> Beim Drehen bleibt Dewy auf seinem Feld. *Links* und *rechts* sind immer aus Dewys Sicht gemeint. Schau also zuerst, wohin er gerade blickt.

### Level 1.1 · Geradeaus

- **Idee:** ein Befehl, mehrmals hintereinander.
- **Anleitung:** *Bring Dewy auf das Zielfeld.*
- **Ziel:** Zielfeld erreichen

```
▶ . . Z
```

```js
moveForward();
moveForward();
moveForward();
```

### Level 1.2 · Um die Ecke

- **Idee:** drehen aus Dewys Sicht.
- **Anleitung:** *Dewy muss um die Ecke. Wohin schaut er, und wohin muss er sich drehen?*
- **Ziel:** Zielfeld erreichen

```
▶ . .
# # .
# # Z
```

```js
moveForward();
moveForward();
turnRight();
moveForward();
moveForward();
```

### Level 1.3 · Zickzack

- **Idee:** eine längere Reihenfolge planen, links und rechts gemischt.
- **Anleitung:** *Plane den Weg zuerst mit dem Finger, dann schreib ihn auf.*
- **Ziel:** Zielfeld erreichen

```
▶ . # #
# . . #
# # . .
# # # Z
```

```js
moveForward();
turnRight();
moveForward();
turnLeft();
moveForward();
turnRight();
moveForward();
turnLeft();
moveForward();
turnRight();
moveForward();
```

### Theorie 1.2 · Kisten

> Dewy kann Kisten bewegen. Wie immer geht es um das Feld **vor** ihm.
>
> ```js
> pick(); // Kiste vor Dewy aufheben
> drop(); // getragene Kiste vor Dewy abstellen
> ```
>
> Fährt Dewy mit `moveForward()` in eine Kiste, **schiebt** er sie ein Feld weiter. Landet eine farbige Kiste auf der Abgabestelle mit ihrer Farbe, ist sie abgeliefert, egal ob abgestellt oder hingeschoben.

### Level 1.4 · Abholen

- **Idee:** `pick()` und `drop()` betreffen das Feld vor Dewy.
- **Anleitung:** *Heb die rote Kiste auf und stell sie auf die rote Abgabestelle.*
- **Ziel:** alle Kisten abliefern

```
▶ . . Kr
. . Ar .
```

```js
moveForward();
moveForward();
pick();
turnRight();
drop();
```

### Level 1.5 · Schieben

- **Idee:** Schieben ist auch ein Weg, eine Kiste abzuliefern.
- **Anleitung:** *Diesmal musst du die Kiste nicht aufheben.*
- **Ziel:** alle Kisten abliefern

```
▶ Kb . . Ab
```

```js
moveForward();
moveForward();
moveForward();
```

### Level 1.6 · Zwei Lieferungen

- **Idee:** einen längeren Ablauf in Teile zerlegen. Bereitet Kapitel 2 vor: Die SuS sollen merken, dass sie Teile doppelt schreiben.
- **Anleitung:** *Zwei Kisten, zwei Abgabestellen. Löse zuerst die obere, dann die untere.*
- **Ziel:** alle Kisten abliefern

```
▶ Kr . Ar
. # # #
. Kb . Ab
```

```js
moveForward();
moveForward();
turnLeft();
turnLeft();
moveForward();
moveForward();
turnLeft();
moveForward();
moveForward();
turnLeft();
moveForward();
moveForward();
```

### Theorie 1.3 · Türen und Schalter

> Manche Wege sind versperrt.
>
> - Eine **Schlüsselkarte** hebst du mit `pick()` auf. Dewy steckt sie ein. Vor der passenden Tür öffnet `open()` die Tür.
> - Einen **Schalter** legst du mit `toggle()` um. Dewy muss davor stehen und ihn anschauen. Ein Schalter kann eine Tür, ein Förderband oder eine Kamera steuern.
> - Eine **Druckplatte** wirkt nur, solange etwas darauf steht: Dewy oder eine Kiste.

### Level 1.7 · Schlüsselkarte

- **Idee:** `pick()` für Karten, `open()` für Türen.
- **Anleitung:** *Die Tür ist abgeschlossen. Zum Glück liegt die Karte gleich vor dir.*
- **Ziel:** Zielfeld erreichen

```
▶ k T . Z
```

```js
pick();
moveForward();
open();
moveForward();
moveForward();
moveForward();
```

### Level 1.8 · Schalter

- **Idee:** `toggle()` braucht einen Schalter direkt vor Dewy.
- **Anleitung:** *Der Schalter öffnet die Tür. Dewy muss ihn anschauen, um ihn umzulegen.*
- **Ziel:** Zielfeld erreichen
- **Aufbau:** Schalter verknüpft mit der Tür, Tür anfangs zu.

```
# S # # #
▶ . T . Z
```

```js
moveForward();
turnLeft();
toggle();
turnRight();
moveForward();
moveForward();
moveForward();
```

### Level 1.9 · Kamera

- **Idee:** ein Schalter kann auch eine Kamera ausschalten. Rot = aktiv, grün = aus.
- **Anleitung:** *Die Kamera bewacht den Gang. Fährt Dewy in den roten Bereich, wird er erwischt. Schalte sie zuerst aus.*
- **Ziel:** Zielfeld erreichen
- **Aufbau:** Kamera über dem mittleren `M`, Bereich 3 × 1, verknüpft mit dem Schalter.

```
# S # # # #
▶ . M M M Z
```

```js
moveForward();
turnLeft();
toggle();
turnRight();
moveForward();
moveForward();
moveForward();
moveForward();
```

### Level 1.10 · Druckplatte

- **Idee:** eine Kiste als Gewicht. Wiederholt das Schieben aus 1.5.
- **Anleitung:** *Die Tür ist nur offen, solange etwas auf der Druckplatte steht. Dewy kann nicht gleichzeitig auf der Platte und bei der Tür sein. Was könnte ihm helfen?*
- **Ziel:** Zielfeld erreichen
- **Aufbau:** Druckplatte verknüpft mit der Tür, Tür anfangs zu.

```
▼ . . . .
K. . . . .
P # T # #
. . . . Z
```

```js
moveForward();   // schiebt die graue Kiste auf die Platte
turnLeft();
moveForward();
moveForward();
turnRight();
moveForward();
moveForward();
turnLeft();
moveForward();
moveForward();
```

---

## Kapitel 2 · Wiederholen

Sprachstufe 2 · Gesperrt bis Kapitel 1 fertig · Ziel: *Was sich wiederholt, schreibt man einmal.*

### Theorie 2.1 · repeat

> In Level 1.6 hast du die gleichen Befehle mehrmals geschrieben. Das geht kürzer:
>
> ```js
> repeat(5) {
>     moveForward();
> }
> ```
>
> Alles zwischen `{` und `}` wird fünfmal ausgeführt. Dewys **Speicher** ist ab jetzt begrenzt: Jeder Befehl braucht einen Platz, ein `repeat` einen Platz plus seinen Inhalt. Fünfmal `moveForward();` braucht 5 Plätze, das `repeat` oben nur 2.

### Level 2.1 · Langer Gang

- **Idee:** ein Befehl in einer Schleife.
- **Anleitung:** *Dewys Speicher hat nur 2 Plätze. Neun Befehle passen da nicht hinein.*
- **Ziel:** Zielfeld erreichen · **Speicher:** 2

```
▶ . . . . . . . . Z
```

```js
repeat(9) {
    moveForward();
}
```

### Level 2.2 · Weit schieben

- **Idee:** dieselbe Schleife, andere Wirkung. Wiederholt das Schieben.
- **Anleitung:** *Schieb die Kiste bis zur Abgabestelle.*
- **Ziel:** alle Kisten abliefern · **Speicher:** 2

```
▶ Kb . . . . . Ab
```

```js
repeat(6) {
    moveForward();
}
```

### Level 2.3 · Vorher und nachher

- **Idee:** eine Schleife ist ein Teil der Reihenfolge. Davor und danach geht es normal weiter.
- **Anleitung:** *Dewy schaut in die falsche Richtung. Danach sind es zwei gerade Strecken.*
- **Ziel:** Zielfeld erreichen · **Speicher:** 6

```
▲ . . . . . .
# # # # # # .
# # # # # # .
# # # # # # Z
```

```js
turnRight();
repeat(6) {
    moveForward();
}
turnRight();
repeat(3) {
    moveForward();
}
```

### Theorie 2.2 · Muster finden

> Eine Schleife kann mehrere Befehle enthalten. Der Trick ist, das **Muster** zu finden: Welcher Teil des Weges wiederholt sich genau gleich?
>
> ```js
> repeat(3) {
>     moveForward();
>     turnLeft();
> }
> ```

### Level 2.4 · Treppe

- **Idee:** ein Muster aus mehreren Befehlen.
- **Anleitung:** *Daneben ist überall ein Loch. Finde die Stufe, die sich wiederholt.*
- **Ziel:** Zielfeld erreichen · **Speicher:** 5

```
▶ . O O O
O . . O O
O O . . O
O O O . .
O O O O Z
```

```js
repeat(4) {
    moveForward();
    turnRight();
    moveForward();
    turnLeft();
}
```

### Level 2.5 · Lieferkette

- **Idee:** ein Muster mit Aktionen, nicht nur mit Bewegungen.
- **Anleitung:** *Jede Kiste gehört auf die Abgabestelle gegenüber. Löse zuerst eine Kiste und schau dann, was sich wiederholt.*
- **Ziel:** alle Kisten abliefern · **Speicher:** 8

```
# Kr Kb Kg Ky #
▶ .  .  .  .  #
# Ar Ab Ag Ay #
```

```js
repeat(4) {
    moveForward();
    turnLeft();
    pick();
    turnLeft();
    turnLeft();
    drop();
    turnLeft();
}
```

### Theorie 2.3 · Schleifen in Schleifen

> Eine Schleife darf eine andere Schleife enthalten. Die innere läuft bei jeder Runde der äusseren ganz durch.
>
> ```js
> repeat(2) {         // zweimal ...
>     repeat(3) {     // ... drei Schritte
>         moveForward();
>     }
>     turnRight();
> }
> ```
>
> Dieses Programm macht 6 Schritte und 2 Drehungen.

### Level 2.6 · Rundgang

- **Idee:** eine Schleife in einer Schleife.
- **Anleitung:** *Fahr um das Regal herum. Jede Seite ist gleich lang.*
- **Ziel:** Zielfeld erreichen · **Speicher:** 4

```
▶ . . . .
# # # # .
# # # # .
# # # # .
Z . . . .
```

```js
repeat(3) {
    repeat(4) {
        moveForward();
    }
    turnRight();
}
```

### Level 2.7 · Grosse Treppe

- **Idee:** verschachtelte Schleifen üben. Wiederholt die Treppe aus 2.4.
- **Anleitung:** *Wieder eine Treppe, aber mit langen Stufen. Der Speicher reicht nur, wenn du auch die Stufen mit `repeat` schreibst.*
- **Ziel:** Zielfeld erreichen · **Speicher:** 7
- **Aufbau:** 10 × 10, ringsum Löcher. Weg: 3 nach Osten, 3 nach Süden, dreimal hintereinander. Ziel unten rechts.

```js
repeat(3) {
    repeat(3) {
        moveForward();
    }
    turnRight();
    repeat(3) {
        moveForward();
    }
    turnLeft();
}
```

---

## Kapitel 3 · Entscheiden

Sprachstufe 3 · Gesperrt bis Kapitel 2 fertig · Ziel: *Ein Programm kann auf seine Umgebung reagieren.*

### Theorie 3.1 · Dewy schaut nach

> Dewy hat **Sensoren**. Ein Sensor beantwortet eine Frage mit `true` (ja) oder `false` (nein). Sensoren kosten keine Batterie.
>
> | Sensor | Frage |
> |---|---|
> | `isCrate()` | Steht vor mir eine Kiste? |
> | `isBlocked()` | Würde ich vorwärts abstürzen? |
> | `isDropOff()` | Ist vor mir eine Abgabestelle? |
> | `isDangerous()` | Ist vor mir der Bereich einer aktiven Kamera? |
> | `isGoal()` | Stehe ich auf dem Zielfeld? |
>
> Mit `if` macht Dewy etwas nur dann, wenn die Antwort `true` ist:
>
> ```js
> if (isCrate()) {
>     pick();
> }
> ```

### Level 3.1 · Kisten im Gang

- **Idee:** `if` in einer Schleife. Bei jeder Runde ist die Situation anders.
- **Anleitung:** *Im Gang liegen Kisten. Steht eine vor Dewy, gehört sie auf die Abgabestelle rechts von ihm. Dein Speicher reicht nur für eine Schleife.*
- **Ziel:** alle Kisten abliefern · **Speicher:** 7

```
# #  #  # #  #  # # #
▶ .  Kr . .  Kb . . .
# Ar #  # Ab #  # # #
```

```js
repeat(8) {
    if (isCrate()) {
        pick();
        turnRight();
        drop();
        turnLeft();
    }
    moveForward();
}
```

### Level 3.2 · Kisten im Gang (Zwilling)

- **Idee:** ein allgemeines Programm funktioniert überall.
- **Anleitung:** *Gleiche Aufgabe, andere Lagerhalle. Probier zuerst dein Programm aus dem letzten Level.*
- **Ziel:** alle Kisten abliefern · **Speicher:** 7
- **Aufbau:** wie 3.1, Gang 11 Felder lang, drei Kisten an anderen Stellen, Abgabestellen jeweils schräg davor.
- **Lösung:** dieselbe wie 3.1 mit grösserer Zahl, z.B. `repeat(10)`. Eine zu grosse Zahl schadet nicht: Dewy hört auf, sobald alles abgeliefert ist.

### Theorie 3.2 · Sonst

> Mit `else` sagst du, was Dewy tun soll, wenn die Antwort `false` ist. Genau einer der beiden Teile wird ausgeführt.
>
> ```js
> if (isBlocked()) {
>     turnRight();
> } else {
>     moveForward();
> }
> ```

### Level 3.3 · Spirale

- **Idee:** `if` / `else`. Entweder drehen oder fahren.
- **Anleitung:** *Der Gang ist eine Spirale. Dewy soll vorwärts fahren, und wenn es nicht mehr geht, sich nach rechts drehen.*
- **Ziel:** Zielfeld erreichen · **Speicher:** 4

```
▶ . . . .
# # # # .
. . Z # .
. # # # .
. . . . .
```

```js
repeat(30) {
    if (isBlocked()) {
        turnRight();
    } else {
        moveForward();
    }
}
```

### Theorie 3.3 · Vergleichen

> `crateColor()` sagt dir die Farbe der Kiste, die Dewy **trägt**. Mit `===` vergleichst du zwei Werte:
>
> ```js
> if (crateColor() === "red") {
>     turnLeft();
> }
> ```
>
> Die Farben heissen englisch: `"red"`, `"blue"`, `"green"`, `"yellow"`, `"purple"`, `"pink"`. Achtung: `=` (ein Gleichheitszeichen) ist etwas anderes, du brauchst drei.

### Level 3.4 · Sortieren

- **Idee:** `if` / `else` mit einem Vergleich.
- **Anleitung:** *Rote Kisten gehören nach links, blaue nach rechts. Dewy muss die Kiste zuerst aufheben, bevor er ihre Farbe kennt.*
- **Ziel:** alle Kisten abliefern · **Speicher:** 10

```
#  Kb #
Ar Kr Ab
Ar Kr Ab
Ar Kb Ab
Ar ▲  Ab
```

```js
repeat(4) {
    pick();
    if (crateColor() === "red") {
        turnLeft();
        drop();
        turnRight();
    } else {
        turnRight();
        drop();
        turnLeft();
    }
    moveForward();
}
```

### Level 3.5 · Drei Farben

- **Idee:** `else if` für mehr als zwei Fälle. Wiederholt 3.4.
- **Anleitung:** *Jetzt gibt es auch grüne Kisten. Die gehören nach hinten. Mit `else if` kannst du eine zweite Frage stellen.*
- **Ziel:** alle Kisten abliefern · **Speicher:** 16

```
#  Kg #
Ar .  Ab
#  Ag #
#  Kb #
Ar .  Ab
#  Ag #
#  Kr #
Ar .  Ab
#  Ag #
#  Kg #
Ar ▲  Ab
#  Ag #
```

```js
repeat(4) {
    pick();
    if (crateColor() === "red") {
        turnLeft();
        drop();
        turnRight();
    } else if (crateColor() === "blue") {
        turnRight();
        drop();
        turnLeft();
    } else {
        turnLeft();
        turnLeft();
        drop();
        turnLeft();
        turnLeft();
    }
    repeat(3) {
        moveForward();
    }
}
```

### Level 3.6 · Kameras im Gang

- **Idee:** `if` mit einem anderen Sensor. Wiederholt Schalter und Kameras aus Kapitel 1.
- **Anleitung:** *Vor jeder Kamera hängt links ein Schalter. Schalte eine Kamera nur aus, wenn sie vor dir liegt. Ein `toggle()` ohne Schalter lässt Dewy abstürzen.*
- **Ziel:** Zielfeld erreichen · **Speicher:** 6
- **Aufbau:** zwei Kameras mit Bereich 1 × 1, je mit dem Schalter davor verknüpft.

```
# # S # # # S # # #
▶ . . M . . . M . Z
```

```js
repeat(9) {
    if (isDangerous()) {
        turnLeft();
        toggle();
        turnRight();
    }
    moveForward();
}
```

---

## Kapitel 4 · So lange wie

Sprachstufe 4 · Gesperrt bis Kapitel 3 fertig · Ziel: *Schleifen, die selbst merken, wann sie fertig sind, und Werte, die sich das Programm merkt.*

### Theorie 4.1 · while

> Bei `repeat` musst du vorher wissen, wie oft. `while` wiederholt, **solange** eine Bedingung stimmt:
>
> ```js
> while (!isGoal()) {
>     moveForward();
> }
> ```
>
> Das `!` heisst *nicht*. `!isGoal()` ist also: *Ich stehe noch nicht auf dem Ziel.* Vor jeder Runde fragt Dewy neu nach.

### Level 4.1 · Unbekannter Gang

- **Idee:** `while` mit `!`.
- **Anleitung:** *Fahr bis zum Ziel, ohne die Felder zu zählen.*
- **Ziel:** Zielfeld erreichen · **Speicher:** 2

```
▶ . . . . . . . . . . . Z
```

```js
while (!isGoal()) {
    moveForward();
}
```

### Level 4.2 · Bis zur Wand

- **Idee:** `while` mit einem anderen Sensor, zwei Schleifen hintereinander. Wiederholt 2.3.
- **Anleitung:** *Fahr bis zur Wand, dreh dich, und fahr dann bis zum Ziel.*
- **Ziel:** Zielfeld erreichen · **Speicher:** 5

```
▶ . . . . . . . #
# # # # # # # . #
# # # # # # # . #
# # # # # # # Z #
```

```js
while (!isBlocked()) {
    moveForward();
}
turnRight();
while (!isGoal()) {
    moveForward();
}
```

### Level 4.3 · Bis zur Abgabe

- **Idee:** nach einer `while`-Schleife geht es weiter.
- **Anleitung:** *Heb die Kiste auf und fahr, bis die Abgabestelle vor dir liegt.*
- **Ziel:** alle Kisten abliefern · **Speicher:** 4

```
▶ Kr . . . . . . Ar
```

```js
pick();
while (!isDropOff()) {
    moveForward();
}
drop();
```

### Level 4.4 · Grosse Spirale

- **Idee:** bekanntes Level, neues Werkzeug. Die Spirale aus 3.3, jetzt mit `while`.
- **Anleitung:** *Wie die Spirale vorher, nur grösser. Diesmal musst du nicht raten, wie viele Runden es braucht.*
- **Ziel:** Zielfeld erreichen · **Speicher:** 4
- **Aufbau:** 9 × 9, gleiche Spiralform wie 3.3, im Uhrzeigersinn nach innen, Ziel in der Mitte.

```js
while (!isGoal()) {
    if (isBlocked()) {
        turnRight();
    } else {
        moveForward();
    }
}
```

### Theorie 4.2 · Variablen

> Eine **Variable** ist ein Kästchen mit einem Namen, in dem sich das Programm einen Wert merkt.
>
> ```js
> let schritte = 0;          // neues Kästchen, Inhalt 0
> schritte = schritte + 1;   // Inhalt um 1 erhöhen
> repeat(schritte) { ... }   // Inhalt verwenden
> ```
>
> `let` brauchst du nur einmal, beim Erstellen.

### Level 4.5 · Hin und zurück

- **Idee:** eine Variable als Zähler.
- **Anleitung:** *Hol die Kiste am Ende des Gangs und bring sie zur Abgabestelle neben deinem Start. Zähl auf dem Hinweg mit, wie weit du fährst.*
- **Ziel:** alle Kisten abliefern · **Speicher:** 11

```
# # # #  # # # # # #  #
. . . ▶  . . . . . Kr #
# # # Ar # # # # # #  #
```

```js
let schritte = 0;
while (!isCrate()) {
    moveForward();
    schritte = schritte + 1;
}
pick();
turnLeft();
turnLeft();
repeat(schritte) {
    moveForward();
}
turnLeft();
drop();
```

### Level 4.6 · Hin und zurück (Zwilling)

- **Idee:** der Zähler passt sich an.
- **Anleitung:** *Probier dein Programm aus dem letzten Level.*
- **Ziel:** alle Kisten abliefern · **Speicher:** 11
- **Aufbau:** wie 4.5, aber Kiste deutlich weiter weg und Gang nach Westen länger.
- **Lösung:** dieselbe wie 4.5.

### Theorie 4.3 · Und, oder

> Bedingungen kann man verbinden:
>
> - `a && b`: beides stimmt (*und*)
> - `a || b`: mindestens eins stimmt (*oder*)
>
> ```js
> if (isBlocked() || isDangerous()) {
>     turnRight();
> }
> ```

### Level 4.7 · Kameras als Wände

- **Idee:** `||`. Wiederholt die Spirale aus 3.3 und 4.4.
- **Anleitung:** *Die Spirale von vorhin, aber eine Wand fehlt. Dort wacht eine Kamera. Dewy soll sich auch vor ihr drehen.*
- **Ziel:** Zielfeld erreichen · **Speicher:** 4
- **Aufbau:** wie 3.3. Die Wand in der zweiten Reihe ist links durch eine Kamera ersetzt (Bereich 3 × 1, immer aktiv, kein Schalter).

```
▶ . . . .
M M M # .
. . Z # .
. # # # .
. . . . .
```

```js
while (!isGoal()) {
    if (isBlocked() || isDangerous()) {
        turnRight();
    } else {
        moveForward();
    }
}
```

---

## Kapitel 5 · Eigene Befehle

Sprachstufe 5 · Gesperrt bis Kapitel 4 fertig · Ziel: *Programme in benannte Teile zerlegen.*

### Theorie 5.1 · Funktionen

> Du kannst Dewy neue Befehle beibringen. Eine **Funktion** gibt einer Reihe von Befehlen einen Namen:
>
> ```js
> function umdrehen() {
>     turnLeft();
>     turnLeft();
> }
>
> umdrehen(); // jetzt kennt Dewy diesen Befehl
> ```
>
> Die Funktion selbst tut noch nichts. Erst der Aufruf `umdrehen();` führt sie aus. Verwende für Namen nur Buchstaben ohne Umlaute.

### Level 5.1 · Umdrehen

- **Idee:** eine Funktion schreiben und aufrufen. Bekanntes Level (2.5), neues Werkzeug.
- **Anleitung:** *Die Lieferkette kennst du schon. Schreib eine Funktion `umdrehen()` und lies dein Programm danach laut vor: Ist es verständlicher?*
- **Ziel:** alle Kisten abliefern · kein Speicherlimit
- **Aufbau:** Kopie von 2.5.

```js
function umdrehen() {
    turnLeft();
    turnLeft();
}

repeat(4) {
    moveForward();
    turnLeft();
    pick();
    umdrehen();
    drop();
    turnLeft();
}
```

### Level 5.2 · Liefern

- **Idee:** eine Funktion an mehreren Stellen verwenden spart Speicher. Wiederholt 4.3.
- **Anleitung:** *Drei Lieferungen, jede gleich: aufheben, fahren bis zur Abgabestelle, abstellen. Schreib das einmal als Funktion.*
- **Ziel:** alle Kisten abliefern · **Speicher:** 10

```
▶  Kr . . .  Ar
#  #  # # Kb #
#  #  # # .  #
Ag .  . Kg . #
#  #  # # Ab #
```

```js
function liefern() {
    pick();
    while (!isDropOff()) {
        moveForward();
    }
    drop();
}

liefern();
turnRight();
liefern();
turnRight();
liefern();
```

### Theorie 5.2 · Parameter

> Eine Funktion kann einen Wert mitbekommen, einen **Parameter**. So macht dieselbe Funktion jedes Mal etwas leicht anderes:
>
> ```js
> function gehe(schritte) {
>     repeat(schritte) {
>         moveForward();
>     }
> }
>
> gehe(5);
> gehe(2);
> ```

### Level 5.3 · Schritte nach Mass

- **Idee:** eine Funktion mit Parameter.
- **Anleitung:** *Jede Strecke ist anders lang. Eine Funktion mit Parameter passt für alle.*
- **Ziel:** Zielfeld erreichen · **Speicher:** 12
- **Aufbau:** 13 × 6, ringsum Löcher. Weg: 5 Ost, 3 Süd, 4 Ost, 2 Süd, 3 Ost.

```js
function gehe(schritte) {
    repeat(schritte) {
        moveForward();
    }
}

gehe(5);
turnRight();
gehe(3);
turnLeft();
gehe(4);
turnRight();
gehe(2);
turnLeft();
gehe(3);
```

### Theorie 5.3 · Rückgabewerte

> Eine Funktion kann eine Antwort zurückgeben, mit `return`. So baust du dir eigene Sensoren:
>
> ```js
> function istFrei() {
>     return !isBlocked() && !isDangerous();
> }
>
> if (istFrei()) {
>     moveForward();
> }
> ```

### Level 5.4 · Eigener Sensor

- **Idee:** `return`. Bekanntes Level (4.7), neues Werkzeug.
- **Anleitung:** *Die Kamera-Spirale kennst du. Schreib einen eigenen Sensor `istFrei()` und verwende ihn.*
- **Ziel:** Zielfeld erreichen · kein Speicherlimit
- **Aufbau:** Kopie von 4.7.

```js
function istFrei() {
    return !isBlocked() && !isDangerous();
}

while (!isGoal()) {
    if (istFrei()) {
        moveForward();
    } else {
        turnRight();
    }
}
```

---

## Kapitel 6 · Abschlussprojekt

Sprachstufe 5 · Gesperrt bis Kapitel 5 fertig · **beliebige Reihenfolge** · Ziel: *Konzepte selbst auswählen und kombinieren.* Keine neue Theorie. Die Anleitungen sagen nur, *was* zu tun ist, nicht *womit*.

### Theorie 6.1 · Dein Werkzeugkasten

> Du kennst jetzt alles, was Dewy versteht: Befehle, `repeat`, `if` / `else`, `while`, Variablen und Funktionen. In diesem Kapitel entscheidest du selbst, was passt. Frag dich bei jedem Level: *Was wiederholt sich? Was muss Dewy nachschauen? Welchen Teil kann ich benennen?*

### Level 6.1 · Labyrinth

- **Konzepte:** `while` in `while`, Sensoren.
- **Anleitung:** *Finde den Weg durchs Labyrinth. Tipp: Wer immer mit der rechten Hand an der Wand bleibt, kommt irgendwann an.*
- **Ziel:** Zielfeld erreichen · **Speicher:** 5
- **Aufbau:** 7 × 7 Labyrinth ohne Inseln (alle Wände hängen am Rand), damit die Rechte-Hand-Regel sicher funktioniert.

```js
while (!isGoal()) {
    turnRight();
    while (isBlocked()) {
        turnLeft();
    }
    moveForward();
}
```

### Level 6.2 · Sortierstation

- **Konzepte:** Funktion, `else if`, `while`. Wiederholt 3.5 und 5.2.
- **Anleitung:** *Kisten in drei Farben, jede Abgabestelle am Ende eines eigenen Gangs.*
- **Ziel:** alle Kisten abliefern · **Speicher:** 20
- **Aufbau:** Kisten in einer Reihe wie 3.4. Links, rechts und hinten führt je ein Gang unterschiedlicher Länge zur Abgabestelle der passenden Farbe. Musterlösung: eine Funktion `liefern()` wie in 5.2, danach mit `while (!isBlocked())` zurück zur Reihe.

### Level 6.3 · Sicherheitszone

- **Konzepte:** Karte, Tür, Schalter, `isDangerous()`, `&&`.
- **Anleitung:** *Hol die Schlüsselkarte, ohne von einer Kamera gesehen zu werden, und verlass die Halle durch die Tür.*
- **Ziel:** Zielfeld erreichen · **Batterie:** knapp (nur der direkte Weg reicht)
- **Aufbau:** Mehrere Kameras, nicht alle mit Schalter. Batterie so knapp, dass Umwege nicht gehen. Sensoren kosten nichts, darum lohnt es sich, zuerst nachzuschauen.

### Level 6.4 · Förderband

- **Konzepte:** Planen mit Elementen, die sich selbst bewegen. Wiederholt Druckplatte und graue Kisten.
- **Anleitung:** *Ein Förderband trägt alles bis an sein Ende, auch Dewy. Schieb die graue Kiste aufs Band und nutze es, um die Druckplatte zu erreichen.*
- **Ziel:** Zielfeld erreichen
- **Aufbau:** Frachtband (nur Kisten), das an einer Druckplatte endet. Die Platte öffnet eine Tür. Ein zweites, normales Band bringt Dewy zur Tür.

### Level 6.5 · Grosse Lieferung

- **Konzepte:** alles. Mehrere Funktionen mit Parametern.
- **Anleitung:** *Der letzte Auftrag des Tages: sechs Kisten, drei Farben, eine Tür, ein Schalter. Teile das Problem in Funktionen auf, bevor du losschreibst.*
- **Ziel:** alle Kisten abliefern · **Speicher:** knapp (ca. 25)
- **Aufbau:** frei. Wichtig: Teilaufgaben, die sich wiederholen (z.B. dieselbe Strecke zwischen Lager und Abgabe), damit sich Funktionen mit Parametern lohnen.

---

## Notizen für die Umsetzung

- **Speicherlimits prüfen:** Nach dem Erstellen jedes Level einmal mit der Musterlösung testen. Die Zahl im Speicherzähler muss genau dem Limit entsprechen (oder knapp darunter liegen).
- **Kapitel 6.2–6.5** sind nur skizziert, die Karten entstehen im Designer.
- **Druckbare Karten:** Für die Theorieblöcke 2.1, 3.1 und 4.1 lohnt sich ein eingebautes Bild (`src/lib/assets/builtin/`), z.B. Dewy mit einem Fragezeichen für die Sensoren.
- **Fortschritt beobachten:** Hohe `attempts` bei 2.4, 3.3 und 4.5 sind normal (Muster finden, `else`, Variablen). Hohe Zahlen bei 1.2 deuten meistens auf Verwirrung mit links/rechts hin. Dann hilft es, den Bildschirm zu drehen oder sich wie Dewy hinzustellen.
