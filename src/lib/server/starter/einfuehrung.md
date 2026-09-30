Schön, dass du da bist! In diesem Kurs lernst du Programmieren, indem du einem kleinen Roboter hilfst. Dieses erste Kapitel stellt dir Dewy vor, zeigt dir seine Welt und erklärt, wie die Plattform funktioniert.

## Das ist Dewy

![Roboter](/images/builtin-dewy-robot)

Dewy ist ein kleiner Lagerroboter. Er ist fleissig und zuverlässig, aber er denkt nicht selbst. **Dewy macht genau das, was du ihm sagst, nicht mehr und nicht weniger.**

Du sagst es ihm mit Code. Du schreibst Befehle in der Programmiersprache **JavaScript**, und Dewy führt sie der Reihe nach aus, von oben nach unten.

```js
moveForward();
turnRight();
moveForward();
```

Mit diesem kleinen Programm geht Dewy ein Feld nach vorne, dreht sich nach rechts und geht noch ein Feld weiter.

> Wenn Dewy etwas Falsches tut, liegt das nie an Dewy, sondern an den Befehlen. Das ist keine schlechte Nachricht: Es heisst, dass du den Fehler finden und reparieren kannst.

## Dewys Welt: die Lagerhalle

Dewy arbeitet in einer grossen Lagerhalle. Sie besteht aus **Feldern**, wie ein Schachbrett.
![Lagerhalle](/images/builtin-dewy-warehouse)

### Die wichtigste Regel

**Fast alles, was Dewy tut, betrifft das Feld direkt vor ihm.** Wenn er eine Kiste aufheben, eine Tür öffnen oder einen Schalter drücken soll, muss er davor stehen und darauf schauen. Wenn etwas nicht klappt, frag dich zuerst: *Wohin schaut Dewy gerade?*
![Interagieren](/images/builtin-dewy-pickup)

### Was es in der Lagerhalle gibt

![Wände und Möbel](/images/builtin-dewy-walls-furniture)
**Wände und Möbel:** Regale, Paletten, Säulen, Fässer und Pylonen sind im Weg.

![Löcher](/images/builtin-dewy-hole)
**Löcher:** Hier fehlt der Boden, Achtung!

![Zielfeld](/images/builtin-dewy-target)
**Zielfeld:** Manchmal ist Dewys Auftrag einfach, dieses Feld zu erreichen.

![Kisten](/images/builtin-dewy-crates)
**Kisten:** Dewy kann sie vor sich herschieben oder aufheben und woanders abstellen. Er trägt immer nur eine Kiste auf einmal.

![Abgabestellen](/images/builtin-dewy-bays)
**Abgabestellen:** Hierhin gehören die farbigen Kisten, und zwar jede auf die Stelle mit ihrer Farbe. Graue Kisten haben kein Ziel. Mit ihnen kann man zum Beispiel Druckplatten beschweren.

## Wenn etwas schiefgeht

Fährt Dewy gegen eine Wand, in ein Loch oder versucht er etwas, das nicht geht, dann **stürzt er ab**.
Ein Absturz ist kein Weltuntergang, sondern ein Hinweis. Lies die Meldung, schau dir die Zeile mit dem Fehler an, passe deinen Code an und probiere es nochmals. Genau so arbeiten auch echte Programmiererinnen und Programmierer.

## So funktioniert die Plattform

### Der Level-Bildschirm

Wenn du ein Level öffnest, siehst du:

- **Die Lagerhalle** mit Dewy. Hier siehst du, was passiert.
- **Die Anleitung.** Sie erklärt, was Dewy in diesem Level erledigen soll. Lies sie immer zuerst! Mit *Ausblenden* machst du Platz, sobald du sie kennst.
- **Den Code-Editor.** Hier schreibst du dein Programm. Beim Tippen schlägt dir der Editor passende Befehle vor.

## Regeln für deinen Code

Computer sind sehr genau. Ein kleiner Tippfehler, und Dewy versteht dich nicht mehr. Achte auf diese Dinge:

1. **Jeder Befehl steht auf einer eigenen Zeile.**
2. **Am Ende steht ein Semikolon:** `moveForward();`
3. **Gross- und Kleinschreibung zählt:** `turnLeft()` funktioniert, `turnleft()` nicht.
4. **Kommentare** beginnen mit `//`. Dewy ignoriert sie, aber sie helfen dir, deinen Code zu verstehen.

```js
// Zur Kiste fahren und sie aufheben
moveForward();
moveForward();
pick(); // Dewy hat jetzt die Kiste in der Hand
```

## Tipps für unterwegs

- **Erst denken, dann tippen.** Überlege dir den Weg, bevor du Code schreibst. Zeige ruhig mit dem Finger auf dem Bildschirm mit, wohin Dewy fahren soll.
- **Denk wie Dewy.** Beim Drehen ist *links* immer aus Dewys Sicht gemeint, nicht aus deiner.
- **Klein anfangen.** Schreib ein paar Befehle, drück auf Start und schau, ob Dewy dort ankommt, wo du willst. Dann schreib weiter.
- **Einzelschritt nutzen.** Wenn du nicht weisst, wo der Fehler steckt, gehe das Programm Befehl für Befehl durch.
- **Fehler sind normal.** Niemand schreibt beim ersten Versuch perfekten Code.

Bereit? Dann klick auf **Weiter**. Dewy wartet schon auf seinen ersten Auftrag!
