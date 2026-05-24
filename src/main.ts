import '@logseq/libs';

type PageLike = {
  id?: number;
  name?: string;
  originalName?: string;
  journalDay?: number | string;
};

type BlockLike = {
  page?: PageLike;
};

const ISO_DATE_PATTERN = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const JOURNAL_DAY_PATTERN = /^(\d{4})(\d{2})(\d{2})$/;

function formatJournalDay(journalDay: number | string | undefined): string | null {
  if (journalDay == null) return null;

  const value = String(journalDay);
  const match = JOURNAL_DAY_PATTERN.exec(value);

  if (!match) return null;

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function dateFromPageName(pageName: string | undefined): string | null {
  if (!pageName) return null;

  const decodedName = pageName.replace(/_/g, '-');
  const match = ISO_DATE_PATTERN.exec(decodedName);

  if (!match) return null;

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function dateFromPage(page: PageLike | null | undefined): string | null {
  return (
    formatJournalDay(page?.journalDay) ??
    dateFromPageName(page?.originalName) ??
    dateFromPageName(page?.name)
  );
}

async function resolveThatDay(): Promise<string | null> {
  const currentBlock = (await logseq.Editor.getCurrentBlock()) as BlockLike | null;
  const blockPage = currentBlock?.page;
  const blockPageDate = dateFromPage(blockPage);

  if (blockPageDate) return blockPageDate;

  if (blockPage?.name) {
    const fullBlockPage = (await logseq.Editor.getPage(blockPage.name)) as PageLike | null;
    const fullBlockPageDate = dateFromPage(fullBlockPage);

    if (fullBlockPageDate) return fullBlockPageDate;
  }

  const currentPage = (await logseq.Editor.getCurrentPage()) as PageLike | null;

  return dateFromPage(currentPage);
}

async function insertThatDay(asTag: boolean): Promise<void> {
  const thatDay = await resolveThatDay();

  if (!thatDay) {
    await logseq.UI.showMsg('Cannot find a date for the current page.', 'warning');
    return;
  }

  await logseq.Editor.insertAtEditingCursor(asTag ? `#${thatDay}` : `[[${thatDay}]]`);
}

function main(): void {
  logseq.Editor.registerSlashCommand('day', () => insertThatDay(false));
  logseq.Editor.registerSlashCommand('day#', () => insertThatDay(true));
}

logseq.ready(main).catch(console.error);
