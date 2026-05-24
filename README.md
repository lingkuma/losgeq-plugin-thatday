# That Day

[中文说明](README.zh-CN.md)

That Day is a Logseq plugin for adding date labels to your daily journal notes.
It reads the date from the current journal page and inserts it as either a page
link or a tag, so blocks in your daily calendar can be connected back to the day
they belong to.

## What It Does

- Adds the current journal date at the editing cursor.
- Supports both page links like `[[2026-05-24]]` and tags like `#2026-05-24`.
- Can append the date label to every top-level block on the current journal page.
- Skips blocks that already contain the same date label.

## Slash Commands

| Command | Result |
| --- | --- |
| `/day` | Insert the current journal date as `[[YYYY-MM-DD]]`. |
| `/day#` | Insert the current journal date as `#YYYY-MM-DD`. |
| `/insert all day` | Add `[[YYYY-MM-DD]]` to top-level blocks on the current journal page. |
| `/insert all day#` | Add `#YYYY-MM-DD` to top-level blocks on the current journal page. |

## Use Case

If you use Logseq's daily journal as a daily calendar, this plugin helps you tag
entries with the date of that day. It is useful when you want tasks, notes, or
events to keep a clear time label that can be searched, queried, and reviewed
later.

## Development

```sh
npm install
npm run dev
```

Build the plugin:

```sh
npm run build
```
