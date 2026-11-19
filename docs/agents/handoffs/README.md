# Per-task handoff entries

Each task's handoff entry lives in its own file here: `docs/agents/handoffs/<TASK-ID>.md`.
A pull request then changes only its own task's file, so two tasks cannot collide in the
same lines. Before this directory existed, every task edited `docs/agents/HANDOFF_LOG.md`,
and pull requests were removed from the merge queue for conflicts in that one file.

## Rules

- **New task:** create `<TASK-ID>.md` before the first push. Use the field list in the
  Template section of `docs/agents/HANDOFF_LOG.md`.
- **Existing task with a block in `HANDOFF_LOG.md`:** at its next update, copy the block
  into `<TASK-ID>.md` and update it there. Do not edit or delete the old block. The file
  here wins over a block with the same task id.
- **Closing a task:** set `status: CLOSED` and record the reason and final SHA in the
  task's file. Leave the file in place.
- **Do not edit `HANDOFF_LOG.md`** except to change its rules or template.

## Reading

`HANDOFF_LOG.md` plus this directory is the handoff log. Reading the log for
`SENTINEL_ACK` or `open_handoffs_checked` means reading `HANDOFF_LOG.md` and the entries
here whose TASK line reads `status: OPEN`. Closed entries are history; open one only when a
task needs it. Use the deploy-branch copies:

```bash
git grep -lE '^TASK .*status: OPEN' origin/verdant-grow-diary -- docs/agents/handoffs/
```

## File shape

Start the file with a `# <TASK-ID>` heading, then put the template's fields in one `text`
code block, beginning with the `TASK <TASK-ID>  priority: ...  status: OPEN` line.
