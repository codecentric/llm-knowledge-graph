# Slack-Export – Kanal #projekt-shop-regeln
**Zeitraum:** 2024-02-12 bis 2024-02-14

---

**Sarah (Product Owner)** – Mo, 12. Feb, 10:14  
Hey, ich wollte kurz die Rabattlogik festhalten bevor wir die nächste Iteration starten.
Grundregel: Ein Warenkorb darf nie mehr als einen prozentualen Rabatt gleichzeitig haben.
Gutscheincode und ein laufendes Sale-Angebot schließen sich also aus – Sale hat Vorrang.

**Marco (Entwicklung)** – Mo, 12. Feb, 10:31  
Gilt das auch für automatisch angewendete Treuerabatte? Die laufen ja separat.

**Sarah (Product Owner)** – Mo, 12. Feb, 10:45  
Guter Punkt. Treuerabatte sind davon ausgenommen, die können mit allem kombiniert werden.
Aber: max. 10 % Treuerabatt, egal wie viele Punkte jemand hat.

**Lena (Finance)** – Mo, 12. Feb, 11:02  
Ich hätte noch eine Ergänzung: Auf Lebensmittel und digitale Produkte darf generell kein
Rabatt angewendet werden, auch kein Treuerabatt. Das ist steuerlich relevant.

**Sarah (Product Owner)** – Mo, 12. Feb, 11:09  
Ja, das hatte ich fast vergessen. Lena hat recht. Digitale Produkte und Lebensmittel = rabattfrei.

**Marco (Entwicklung)** – Di, 13. Feb, 09:17  
Was ist mit Bundles? Wenn ein Bundle ein digitales Produkt enthält, aber auch physische – gilt
dann die ganze Bundle-Regel oder nur für den digitalen Anteil?

**Sarah (Product Owner)** – Di, 13. Feb, 10:05  
Das weiß ich ehrlich gesagt noch nicht. Muss ich mit Lena klären. Erstmal offen lassen.

**Lena (Finance)** – Di, 13. Feb, 14:38  
Ich sag kurz Bescheid: Bundles mit gemischten Inhalten sind komplett rabattfrei, wenn der
digitale Anteil mehr als 50 % des Bruttopreises ausmacht. Sonst gelten die normalen Regeln.

**Marco (Entwicklung)** – Mi, 14. Feb, 08:52  
Alles klar, ich baue das so ein. Noch eine Frage: Gutscheincodes – gibt es eine maximale
Anzahl pro Bestellung oder kann ein Kunde theoretisch mehrere einlösen?

**Sarah (Product Owner)** – Mi, 14. Feb, 09:20  
Pro Bestellung genau ein Gutscheincode. Keine Ausnahmen.

**Marco (Entwicklung)** – Mi, 14. Feb, 09:24  
👍

---
*Export erstellt von: Lena Fischer, 2024-02-15*
