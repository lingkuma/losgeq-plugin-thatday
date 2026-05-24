import '@logseq/libs';

type PageLike = {
  id?: number;
  uuid?: string;
  name?: string;
  originalName?: string;
  journalDay?: number | string;
  'journal-day'?: number | string;
  'original-name'?: string;
  ':block/uuid'?: string;
  ':block/journal-day'?: number | string;
  ':block/original-name'?: string;
  ':block/name'?: string;
};

type BlockLike = {
  uuid?: string;
  content?: string;
  page?: PageLike;
  children?: BlockLike[];
};

type PageTarget = string | { uuid: string };

type ThatDayContext = {
  thatDay: string;
  pageTarget: PageTarget;
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

function pageNameFromPage(page: PageLike | null | undefined): string | null {
  return page?.name ?? page?.[':block/name'] ?? page?.originalName ?? page?.['original-name'] ?? null;
}

function pageTargetFromPage(page: PageLike | null | undefined): PageTarget | null {
  const pageName = pageNameFromPage(page);
  if (pageName) return pageName;

  const uuid = page?.uuid ?? page?.[':block/uuid'];
  return uuid ? { uuid } : null;
}

async function getFullPage(page: PageLike | null | undefined): Promise<PageLike | null> {
  const pageName = pageNameFromPage(page);
  if (pageName) return (await logseq.Editor.getPage(pageName)) as PageLike | null;

  if (typeof page?.id === 'number') {
    return (await logseq.Editor.getPage(page.id)) as PageLike | null;
  }

  const uuid = page?.uuid ?? page?.[':block/uuid'];
  if (uuid) return (await logseq.Editor.getPage({ uuid })) as PageLike | null;

  return null;
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

async function resolvePageContext(page: PageLike | null | undefined): Promise<ThatDayContext | null> {
  const thatDay = dateFromPage(page);
  const pageTarget = pageTargetFromPage(page);

  if (thatDay && pageTarget) {
    return { thatDay, pageTarget };
  }

  const fullPage = await getFullPage(page);
  const fullPageDay = dateFromPage(fullPage);
  const fullPageTarget = pageTargetFromPage(fullPage);

  return fullPageDay && fullPageTarget
    ? { thatDay: fullPageDay, pageTarget: fullPageTarget }
    : null;
}

async function resolveThatDayContext(): Promise<ThatDayContext | null> {
  const currentBlock = (await logseq.Editor.getCurrentBlock()) as BlockLike | null;

  const blockPageContext = await resolvePageContext(currentBlock?.page);
  if (blockPageContext) return blockPageContext;

  const datascriptPage = await getPageFromBlockUuid(currentBlock?.uuid);
  const datascriptPageContext = await resolvePageContext(datascriptPage);
  if (datascriptPageContext) return datascriptPageContext;

  const currentPage = (await logseq.Editor.getCurrentPage()) as (PageLike & BlockLike) | null;
  const currentPageContext = await resolvePageContext(currentPage);
  if (currentPageContext) return currentPageContext;

  return resolvePageContext(currentPage?.page);
}

async function resolveThatDay(): Promise<string | null> {
  return (await resolveThatDayContext())?.thatDay ?? null;
}

function dateLabel(thatDay: string, asTag: boolean): string {
  return asTag ? `#${thatDay}` : `[[${thatDay}]]`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasThatDayLabel(content: string, thatDay: string): boolean {
  const escapedDay = escapeRegExp(thatDay);
  const tagPattern = new RegExp(`(^|\\s)#${escapedDay}(?=$|\\s)`);

  return content.includes(`[[${thatDay}]]`) || tagPattern.test(content);
}

async function appendThatDayToTopLevelBlocks(asTag: boolean): Promise<void> {
  try {
    const context = await resolveThatDayContext();

    if (!context) {
      await logseq.UI.showMsg('Cannot find a date for the current page.', 'warning');
      return;
    }

    const isEditing = await logseq.Editor.checkEditing();
    if (isEditing) {
      await logseq.Editor.exitEditingMode();
    }

    const blocks = (await logseq.Editor.getPageBlocksTree(context.pageTarget)) as BlockLike[];
    const label = dateLabel(context.thatDay, asTag);
    let updatedCount = 0;

    for (const block of blocks) {
      if (!block.uuid || !block.content?.trim() || hasThatDayLabel(block.content, context.thatDay)) {
        continue;
      }

      await logseq.Editor.updateBlock(block.uuid, `${block.content.trimEnd()} ${label}`);
      updatedCount += 1;
    }

    if (updatedCount === 0) {
      await logseq.UI.showMsg('No top-level blocks needed that day.', 'warning');
      return;
    }

    await logseq.UI.showMsg(`Inserted that day into ${updatedCount} top-level block(s).`, 'success');
  } catch (error) {
    console.error(error);
    await logseq.UI.showMsg('Cannot insert that day into top-level blocks.', 'error');
  } finally {
    try {
      await logseq.Editor.restoreEditingCursor();
    } catch (restoreError) {
      console.error(restoreError);
    }
  }
}

async function insertThatDay(asTag: boolean): Promise<void> {
  try {
    const thatDay = await resolveThatDay();

    if (!thatDay) {
      await logseq.UI.showMsg('Cannot find a date for the current page.', 'warning');
      return;
    }

    await logseq.Editor.insertAtEditingCursor(dateLabel(thatDay, asTag));
  } catch (error) {
    console.error(error);
    await logseq.UI.showMsg('Cannot insert that day.', 'error');
  }
}

function main(): void {
  logseq.Editor.registerSlashCommand('day', () => insertThatDay(false));
  logseq.Editor.registerSlashCommand('day#', () => insertThatDay(true));
  logseq.Editor.registerSlashCommand('insert all day', [
    ['editor/clear-current-slash', false],
    ['editor/hook', () => appendThatDayToTopLevelBlocks(false)],
  ]);
  logseq.Editor.registerSlashCommand('insert all day#', [
    ['editor/clear-current-slash', false],
    ['editor/hook', () => appendThatDayToTopLevelBlocks(true)],
  ]);
}

logseq.ready(main).catch(console.error);
