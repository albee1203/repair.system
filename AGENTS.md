# Repository Guidelines

## Project Structure

The workspace contains `報修需求筆記.txt`, the Traditional Chinese requirements brief for a demo repair request tracker. Keep the brief in UTF-8. Update it when fields, allowed values, or access rules change. The planned deliverables include an Excel field reference with sample data, a six-slide PowerPoint proposal, a Word user guide, a web form and list, and Supabase table and access rules. Source code, tests, and assets have yet to be added.

## Development and Naming

Read the brief locally with `Get-Content -Encoding utf8 -LiteralPath '報修需求筆記.txt'` in PowerShell. Build, lint, and test commands will depend on the implementation. When adding tooling, document the exact setup and verification commands here.

Use the brief’s Traditional Chinese labels in the UI and examples, including `緊急程度` and `處理狀態`. Use consistent identifiers across the form, database, and sample data. Generate the registration timestamp automatically. Keep login, status updates, and notifications outside the initial demo scope.

## Testing and Data Access

Once the form and list exist, submit a fictional request and verify that it appears with the expected values and a generated timestamp. Check the category, urgency, and status options against the brief. Test Supabase access with the same public credentials used by the browser. With row-level security enabled, anonymous users must be able to insert and read records, while update and delete operations must fail. Use fictional names and locations in all sample records. Keep privileged credentials out of frontend code and shared artifacts.

## Commits and Pull Requests

The current workspace has no Git history. If Git is initialized, use short, action-oriented commit subjects such as `Document anonymous access rules`. In pull requests, summarize the change, record the checks performed, and link the relevant issue when available. Include screenshots for visible changes and describe any Supabase policy changes.
