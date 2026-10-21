# ExamOfficer Roadmap

This roadmap tracks the current development state of ExamOfficer. Status reflects the work known and tested on the `feature/marks-entry-foundation` branch; planned work is not yet implemented unless explicitly marked complete.

## Current foundation

- [x] Student register and class-based organisation.
- [x] Bulk student import from CSV with generated IDs and invalid/duplicate-row reporting.
- [x] Subject catalogue and class-subject assignments.
- [x] Manual marks entry.
- [x] Bulk marks import from CSV.
- [x] Explicit overwrite confirmation when imported marks would replace existing marks.
- [x] Results view with totals, averages, grades, and class positions.
- [x] Configurable grade thresholds and teacher/principal remarks.
- [x] Configurable position-based report remarks.
- [x] Individual report-card view with print / Save as PDF support.
- [x] Frontend production build verified locally with `npm run build`.

## Next priority: Backup and restore

- [ ] Inspect the current SQLite database location and Tauri command boundaries before changing data-handling code.
- [ ] Implement a safe, explicit database backup flow to a user-selected location.
- [ ] Implement restore with clear warnings and confirmation before replacing current data.
- [ ] Validate backup integrity and handle missing, invalid, or incompatible backup files gracefully.
- [ ] Protect against accidental overwrite; preserve the current database until a restore has been validated.
- [ ] Test backup and restore with a disposable test dataset, including a round-trip check that student records, marks, classes, subjects, and settings survive.
- [ ] Document where the live database and backup files are stored, without exposing private school data.

## Results and reporting improvements

- [ ] Test printed and saved PDF report cards across representative students and page lengths.
- [ ] Add a reliable whole-class/batch report-card export workflow.
- [ ] Review report-card content, page breaks, signatures, and school profile details.
- [ ] Add attendance and behaviour/effort assessments if confirmed as required by the school workflow.

## Student data and import safety

- [ ] Improve import preview and field validation for student CSV files.
- [ ] Add spreadsheet-friendly templates and clearer import error reports.
- [ ] Plan PDF/OCR extraction as a later assisted-import feature, with a preview and explicit approval before records are saved.
- [ ] Ensure existing student IDs and admission numbers are preserved during imports and future migrations.
- [ ] Add clearly labelled fictional test-data generation and safe deletion that cannot remove real records.

## Reliability, privacy, and release readiness

- [ ] Review database migrations and recovery behaviour.
- [ ] Test duplicate handling, invalid input, interrupted imports, and restore failure cases.
- [ ] Review local data protection and optional app access controls.
- [ ] Verify backup/restore and core workflows on a clean Windows setup.
- [ ] Assess Android support separately; do not claim Android compatibility until built and tested on a supported device.
- [ ] Prepare user-facing setup, backup, restore, and troubleshooting instructions.

## Working rules

1. Work in small, testable increments.
2. Inspect existing database structures and commands before modifying them.
3. Never silently overwrite existing marks or create duplicate student records.
4. Test data-changing features with disposable data before using real school records.
5. Preserve existing records and IDs unless a deliberate, verified migration is required.
6. Keep pull requests unmerged until the project owner explicitly approves the merge.

## Current checkpoint

The latest reported local verification is a successful `npm run build` after correcting a stray CSS escape in `src/App.css`. The report-card design was then reviewed by the project owner and described as “very ok.” The current implementation branch is `feature/database-backup-restore`. It adds Settings controls for SQLite backup download and restore from a selected `.sqlite`/`.db` file. Restore validates SQLite integrity, checks required tables and foreign-key relationships, and creates a safety copy before replacing the active database. **These changes have not yet been built or tested on the project owner's Windows machine.** Treat the feature as unverified until the frontend build, Rust compile, backup download, invalid-file rejection, and disposable-database round-trip are tested.