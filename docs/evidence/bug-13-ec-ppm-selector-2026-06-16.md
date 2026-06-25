# Bug #13 — EC/PPM Selector Evidence

Status: Captured — PASS

Evidence source:
Authenticated operator recording reviewed on 2026-06-16.

Screenshot:
`docs/evidence/bug-13-ec-ppm-selector.png`

Route inspected:
Tents → tent / plant context → Quick Log → Feeding → Add more details → EC unit selector

Visible labels:
- EC mS/cm
- EC µS/cm
- PPM 500 scale
- PPM 700 scale

Review:
The EC unit selector is visibly open. `EC µS/cm` is visually distinct from `EC mS/cm`. `PPM 500 scale` is visually distinct from `PPM 700 scale`.

Safety:
No auth bypass was used. No seeded account or committed credential was added. No fake-live data was introduced. No runtime behavior changed.

Bug #13 verdict:
CLOSE — visual evidence confirms selector works.

Gate verdict:
GATE CLEARED.

Slice 2 status:
May be considered separately.
