# IWILLBUILD Starter Packs

Starter packs are the ready-to-use content seeded into every new company on first login. This directory is the **human-editable master copy**. The app reads from `src/server/seed/starter-packs/` at runtime.

---

## Directory structure

```
content/starter-packs/
└── default/
    ├── manifest.json                  ← controls what loads and where
    ├── README.md                      ← this file
    │
    ├── source-docx/                   ← EDITABLE MASTER DOCUMENTS
    │   ├── swms/                      ← MLCH-01 … MLCH-12 SWMS templates
    │   ├── policies/                  ← PP-000 … PP-017 policies & procedures
    │   └── forms/                     ← Austen form templates (prestart, toolbox, etc.)
    │
    ├── generated-json/                ← JSON consumed by the app (generated from DOCX)
    │   ├── forms.json                 ← form template definitions
    │   ├── safety.json                ← SWMS templates + safety plan
    │   └── project.json               ← sample project
    │
    ├── cost-guide/
    │   └── cost-guide.json            ← 27 cost guide line items
    │
    ├── stakeholders.json              ← sample customer + subcontractor
    └── fleet.json                     ← sample vehicle
```

---

## How it works

1. When a new company is created, `seedStarterPack(companyId)` is called automatically.
2. The seeder reads JSON from `src/server/seed/starter-packs/default/`.
3. Each section is idempotent — it skips rows that already exist by name/title.
4. The `companies.starter_pack_loaded` flag prevents double-seeding.
5. Owner Console → Starter Pack tab shows the seed status for any company.

---

## Editing starter pack content

### To change form templates, SWMS, or cost guide items:

1. Edit the JSON file in `generated-json/` or `cost-guide/` here.
2. Copy the updated file to the matching `appFile` path in `manifest.json`:
   ```
   cp content/starter-packs/default/generated-json/forms.json \
      src/server/seed/starter-packs/default/forms.json
   ```
3. The change takes effect for all **new** companies from that point on.
4. To re-seed an existing company, reset `starter_pack_loaded = 0` in the DB and call the seed endpoint.

### To add a new SWMS or policy from a DOCX:

1. Place the DOCX in `source-docx/swms/` or `source-docx/policies/`.
2. Extract the content and add a new entry to `generated-json/safety.json`.
3. Copy to `src/server/seed/starter-packs/default/safety.json`.

---

## Rules

- **Do not edit generated JSON unless you intend to change what gets seeded.** The DOCX files in `source-docx/` are the authoritative master documents.
- **Do not delete DOCX files.** They are the source of truth for safety content.
- **Do not edit `src/server/seed/` directly** unless you also update the matching file here — keep them in sync.
- The app never reads from `content/` at runtime. Only `src/server/seed/` is read.

---

## Source DOCX inventory

### SWMS (source-docx/swms/)
| File | Topic |
|------|-------|
| MLCH-01 | Manual Handling & Housekeeping |
| MLCH-02 | Working Near Underground Services |
| MLCH-03 | Working On or Near Exposed Live Parts |
| MLCH-04 | Moving Powered Plant |
| MLCH-05 | Excavations in a Live Substation |
| MLCH-06 | Vacuum Excavation |
| MLCH-07 | Traffic Management / Working Near Roads |
| MLCH-08 | Silica Dust Exposure |
| MLCH-09 | Use of Power Tools |
| MLCH-10 | Delivery, Loading & Unloading |
| MLCH-11 | Environmental Controls & Spill Response |
| MLCH-12 | Heat Stress, Remote Conditions & Fitness for Work |

### Policies & Procedures (source-docx/policies/)
| File | Topic |
|------|-------|
| PP-000 | Policies & Procedures Register |
| PP-002 | Environmental Policy |
| PP-003 | Drug & Alcohol Policy |
| PP-004 | Fatigue Management Procedure |
| PP-005 | Incident Reporting Procedure |
| PP-006 | Emergency Response Procedure |
| PP-007 | Plant & Equipment Procedure |
| PP-008 | Manual Handling Procedure |
| PP-009 | Excavation & Underground Services Procedure |
| PP-010 | Working Near Electrical Assets Procedure |
| PP-011 | PPE Procedure |
| PP-012 | Training & Competency Procedure |
| PP-013 | Consultation & Communication Procedure |
| PP-014 | Risk Management Procedure |
| PP-015 | Environmental Spill Response Procedure |
| PP-016 | Document Control Procedure |
| PP-017 | Bullying, Harassment & Equal Opportunity Policy |

### Forms (source-docx/forms/)
| File | Topic |
|------|-------|
| Austen_Core_Works_Register | Works register template |
| Austen_Daily_Prestart_SMEAC | Daily prestart / SMEAC briefing |
| Austen_Document_Distribution_Table | Document distribution register |
| Austen_ITC_Civil_Works_Engineer_Checklist | ITC civil works checklist |
| Austen_Toolbox_Talk_Record_Form | Toolbox talk record |
| Austen_WHS_E_Management_Plan | WHS&E management plan title page |
