# ExamOfficer Implementation Roadmap

This roadmap is sequenced to reduce risk and preserve the existing code. It is not a claim that the work is already complete.

## Phase 0 — Audit and safety baseline

- [x] Inspect the current default branch, frontend package, Tauri configuration, React screens, and Rust SQLite commands.
- [x] Record current scope and product decisions.
- [ ] Create a local copy/branch before feature work.
- [ ] Run the frontend build on the developer's Windows machine and record the result.
- [ ] Run the Tauri desktop app and verify saved data after restart.
- [ ] Identify the actual SQLite data location on Windows and confirm existing user data is preserved.
- [ ] Add tests and a reproducible build/check workflow.

**Exit gate:** Existing school/class/subject/student workflows have been verified locally; no destructive schema changes are made without migration and backup.

## Phase 1 — Data integrity and foundation (Windows + Android baseline)

- Set up an early Android build/install smoke test alongside Windows verification; record any platform blockers before adding camera or document workflows.
- Introduce explicit schema versioning and migrations.
- Review deletion rules and relationships so deleting a class/student cannot silently destroy relevant marks or historical reports.
- Add school abbreviation/ID fields if needed and optional safe student-ID generation with uniqueness checks.
- Improve validation and clear user-facing errors.
- Fix the stale School Setup storage disclaimer after verifying persistence.
- Add test fixtures and tests for uniqueness, invalid input, and persistence.

**Exit gate:** Existing records survive upgrade and restart; IDs remain unique; schema migration is repeatable.

## Phase 2 — Marks engine

- Design the mark-record and import-batch schema.
- Implement manual score entry by class and subject.
- Validate score, maximum score, optional assessment label, date, and source.
- Record provenance and review status.
- Add duplicate-batch detection and review UI.
- Add test cases for repeated imports, same scores on different dates, missing values, and ambiguous identity.

**Exit gate:** A mark can be entered once, retrieved after restart, and linked to the correct student/subject without duplicate corruption.

## Phase 3 — Objective assessment and marking

- Create answer-key configuration and scoring rules.
- Implement deterministic scoring independent of image recognition.
- Design a standard printable answer sheet with a stable student ID and clear response marks.
- Add image import, image quality checks, and structured response detection as a separate layer.
- Require confirmation for ambiguous answers or identity matches.
- Add test images for clear, rotated, blurred, blank, and partially marked sheets.

**Exit gate:** Correct test sheets yield expected scores; ambiguous sheets are flagged; no uncertain result is silently committed.

## Phase 4 — Grading, attendance, reports

- Add configurable grading boundaries and validation.
- Define explicit aggregation rules rather than hardcoding assumptions.
- Record attendance with dates/periods and a documented calculation denominator.
- Build printable reports from saved data.
- Test missing marks, zero marks, boundary grades, absent students, and totals.

**Exit gate:** Hand-calculated test fixtures match the app's results and reports.

## Phase 5 — Backup, restore, and optional PIN

- Add a versioned structured backup format with integrity validation.
- Export a readable PDF summary.
- Implement safe restore with preview/confirmation and failure rollback.
- Test backups containing all related records and restore into a clean test database.
- Add optional PIN setup/unlock with salted hash and a documented reset/recovery path.
- Decide whether encryption is needed for backups and implement it before making any encryption claims.

**Exit gate:** A test backup restores the same school, classes, subjects, students, marks, settings, and attendance; malformed files do not corrupt live data.

## Phase 6 — Android device-specific workflow validation

Android is a first-release target, so basic build feasibility is checked in Phase 1. This phase completes the device-specific workflows after the shared core is ready.

- Complete Tauri Android prerequisites and build configuration.
- Test local SQLite persistence, app lifecycle, rotation, and small-screen layouts.
- Validate document selection, camera/gallery access, image import, and export/save destinations.
- Test offline operation and Android permission denial/retry behavior.
- Add installation and troubleshooting instructions.

**Exit gate:** A build installs on a real Android device and passes the supported workflow checklist.

## Phase 7 — Release readiness and selling

- Replace starter README content with accurate product documentation.
- Add screenshots/demo using fictional student records only.
- Create Windows installer/release instructions and Android distribution plan.
- Add versioning, changelog, issue-reporting instructions, and privacy/backup guidance.
- Publish only features that have passed acceptance checks.
- Run a pilot with a small number of schools and collect structured feedback.

**Exit gate:** A fresh user can install, set up a school, use supported workflows, back up, restore, and understand limitations without developer intervention.

## First implementation priorities

1. Verify current local build and persistence.
2. Fix documentation that misrepresents current persistence.
3. Agree the mark data model and migration strategy in code.
4. Implement manual marks before OCR, because the same storage/calculation rules should power every input method.
5. Add objective scoring before scanning; prove the scoring engine independently.
6. Add backup/restore before using real school records.
7. Validate Android once the core data and file workflows are stable.

## Required test checklist before a pilot

- [ ] Existing database upgrades without losing records.
- [ ] Student IDs are unique and manual IDs are accepted.
- [ ] Objective answer key produces known expected scores.
- [ ] Marks link to the correct student and subject.
- [ ] Re-importing the same batch is detected.
- [ ] Same score on a genuinely different assessment remains allowed.
- [ ] Uncertain scan/identity match requires confirmation.
- [ ] Grading boundaries and aggregates match hand calculations.
- [ ] Attendance totals use the documented denominator.
- [ ] Reports handle missing marks and zero scores distinctly.
- [ ] PDF export opens and is readable.
- [ ] Structured backup restores the database and relationships.
- [ ] Invalid backup is rejected without corrupting live data.
- [ ] Optional PIN behavior is verified and documented.
- [ ] Offline operation is confirmed.
- [ ] Windows workflow passes on a clean test profile.
- [ ] Android build/install smoke test is completed early, and full supported workflows pass on a real device before Android is advertised as supported.
