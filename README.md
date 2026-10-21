# ExamOfficer

ExamOfficer is an offline-first school examination management desktop app built with **Tauri, React, TypeScript, and SQLite**. It is being developed to help an authorised school staff member manage student records, marks, results, and report cards from one computer.

> **Development status:** Active development. The current feature branch builds successfully, and core student, marks, results, grading-settings, and report-card workflows have been tested locally. Some roadmap items are not implemented yet. Do not treat this project as production-ready until backup/restore, data-safety checks, and platform testing are completed.

## Current capabilities

- Manage student records and organise students by class.
- Import student records in bulk from CSV, with generated student IDs and invalid/duplicate-row reporting.
- Maintain subjects and class-subject assignments.
- Enter and bulk-import marks from CSV, with explicit confirmation before existing marks are overwritten.
- View results, totals, averages, grades, and class positions.
- Configure grade thresholds and teacher/principal remarks in Settings.
- Configure position-based remarks for report cards.
- View report cards and use the print dialog to print or save an individual report as PDF.
- Store application records locally using SQLite for an offline-oriented workflow.

## Technology

- **Frontend:** React, TypeScript, Vite
- **Desktop shell:** Tauri
- **Database:** SQLite via the Tauri/Rust backend

## Run locally

Install the project dependencies first:

```powershell
npm install
```

Build and type-check the frontend:

```powershell
npm run build
```

Run the desktop application in development mode:

```powershell
npm run tauri dev
```

Rust toolchain and the platform prerequisites required by Tauri must be installed for desktop development. Check the official [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your operating system.

## Data-safety notes

- Keep regular backups of important school records. A dedicated in-app backup/restore workflow is still on the roadmap.
- Confirm import previews and overwrite prompts carefully before importing data.
- Use fictional records for testing where possible.
- Do not assume that Android builds, cross-device sync, or automated whole-class PDF export are available yet.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the current implementation status and planned next steps.

## Project status and contributions

This project is under active development. Test changes against a local copy and preserve existing school data before trying database or import changes. Features marked as planned in the roadmap should not be considered implemented.
