# Release Workbook Formula Contracts (v1.3)

Docs-only artifact. Reflects the canonical formula contracts shipped in the
v1.3 specs. Formulas are review signals only — no formula releases a seed lot.

## Seed_Production_Tracking

- **L Viability % Tested** (row r):
  `=IF(OR(Nr="",Nr=0,Qr=""),"",Qr/Nr)`
- **Viable Seed Ratio** (helper, row r):
  `=IF(OR(Jr="",Jr=0,Kr=""),"",Kr/Jr)`
- **W Quality Flag** (row r):
  `=IF(Lr="","Missing Test",IF(Nr<25,"Hold",IF(Nr<50,"Needs Review",IF(Lr<0.7,"Hold",IF(Lr<0.85,"Needs Review","Pass")))))`
  Outputs: Pass / Needs Review / Hold / Missing Test.

## Commercial_Release_Review_Traceability

- **AC Review Status suggestion** (row r):
  `=IF(ABr>0,"Needs Review",IF(Mr<25,"Hold",IF(Lr<0.7,"Hold",IF(Mr<50,"Needs Review",IF(AND(Lr>=0.85,ABr=0),"Release Candidate","Needs Review")))))`
  Outputs at most `Release Candidate`. **Never outputs `Released`.**
- `AD Human Release Decision` is **manual-only**.
- `AB Missing Evidence Count` is operator-counted (or a documented helper formula).

## Safety

> Formulas provide review signals only. Human Release Decision is manual. No formula releases a seed lot. Action Queue text is draft-only and grower-review-only.
