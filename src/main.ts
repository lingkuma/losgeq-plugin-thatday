import '@logseq/libs';

type PageLike = {
  id?: number;
  name?: string;
  originalName?: string;
  journalDay?: number | string;
  'journal-day'?: number | string;
  'original-name'?: string;
  ':block/journal-day'?: number | string;
  ':block/original-name'?: string;
  ':block/name'?: string;
};

type BlockLike = {
  uuid?: string;
  page?: PageLike;
};

type DatascriptQuery = (query: string, ...inputs: unknown[]) => Promise<unknown>;

type LogseqWithDB = typeof logseq & {
  DB?: {
    datascriptQuery?: DatascriptQuery;
  };
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
    formatJournalDay(page?.['journal-day']) ??
    formatJournalDay(page?.[':block/journal-day']) ??
    dateFromPageName(page?.originalName) ??
    dateFromPageName(page?.['original-name']) ??
    dateFromPageName(page?.[':block/original-name']) ??
    dateFromPageName(page?.name) ??
    dateFromPageName(page?.[':block/name'])
  );
}

function toEdnUuid(uuid: string): string {
  return `#uuid "${uuid}"`;
}

function pageFromDatascriptResult(result: unknown): PageLike | null {
  if (!Array.isArray(result)) return null;

  const firstRow = result[0];
  if (!Array.isArray(firstRow)) return null;

  const page = firstRow[0];

  return page && typeof page === 'object' ? (page as PageLike) : null;
}

async function getPageFromBlockUuid(blockUuid: string | undefined): Promise<PageLike | null> {
  if (!blockUuid) return null;

  const datascriptQuery = (logseq as LogseqWithDB).DB?.datascriptQuery;
  if (!datascriptQuery) return null;

  const result = await datascriptQuery(
    `[:find (pull ?p [*])
      :in $ ?block-uuid
      :where
      [?b :block/uuid ?block-uuid]
      [?b :block/page ?p]]`,
    toEdnUuid(blockUuid),
  );

  return pageFromDatascriptResult(result);
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

  const datascriptPage = await getPageFromBlockUuid(currentBlock?.uuid);
  const datascriptPageDate = dateFromPage(datascriptPage);

  if (datascriptPageDate) return datascriptPageDate;

  const currentPage = (await logseq.Editor.getCurrentPage()) as PageLike | null;

  return dateFromPage(currentPage);
}

async function insertThatDay(asTag: boolean): Promise<void> {
  try {
    const thatDay = await resolveThatDay();

    if (!thatDay) {
      await logseq.UI.showMsg('Cannot find a date for the current page.', 'warning');
      return;
    }

    await logseq.Editor.insertAtEditingCursor(asTag ? `#${thatDay}` : `[[${thatDay}]]`);
  } catch (error) {
    console.error(error);
    await logseq.UI.showMsg('Cannot insert that day.', 'error');
  }
}

function main(): void {
  logseq.Editor.registerSlashCommand('day', () => insertThatDay(false));
  logseq.Editor.registerSlashCommand('day#', () => insertThatDay(true));
}

logseq.ready(main).catch(console.error);
