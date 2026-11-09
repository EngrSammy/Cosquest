# User workflow preferences

## Fast code export

Whenever the user asks to pull, extract, collect, or copy code lines or source files from this repository into a document, use this workflow by default unless the user explicitly requests otherwise:

- Treat the request as fast mode and target completion in under two minutes.
- Batch-read all requested repository files.
- Create a basic native Google Doc directly through the Google Drive or Google Docs connector.
- Use minimal formatting: a title, filename headings, and monospace source code.
- Do not create an intermediate DOCX or PDF.
- Skip rendering and visual QA.
- Verify that every requested filename is present in the created Google Doc.
- Return the Google Docs link immediately after the completeness check.
- If the Google connector is unavailable or permission is missing, report that immediately instead of attempting a slower document workflow.
