const PAGE_SIZE = 40;
const PAGE_MAX = 100;

function readPage(query) {
  const asked = query && query.page != null && String(query.page) !== "";
  if (!asked) return { asked: false };
  let pageSize = Math.floor(Number(query.pageSize));
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = PAGE_SIZE;
  if (pageSize > PAGE_MAX) pageSize = PAGE_MAX;
  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  return { asked: true, page, pageSize };
}

function finishPage(total, request) {
  const count = Number(total) || 0;
  if (!request || !request.asked) {
    return { total: count, page: 1, pageSize: count || 1, pages: 1, offset: 0, limit: count || 1 };
  }
  const pages = Math.max(1, Math.ceil(count / request.pageSize));
  const page = Math.min(request.page, pages);
  return {
    total: count,
    page,
    pageSize: request.pageSize,
    pages,
    offset: (page - 1) * request.pageSize,
    limit: request.pageSize
  };
}

function slicePage(rows, query) {
  const list = rows || [];
  const window = finishPage(list.length, readPage(query));
  return {
    rows: list.slice(window.offset, window.offset + window.limit),
    total: window.total,
    page: window.page,
    pageSize: window.pageSize,
    pages: window.pages
  };
}

function pageFields(window) {
  return { total: window.total, page: window.page, pageSize: window.pageSize, pages: window.pages };
}

module.exports = { PAGE_SIZE, readPage, finishPage, slicePage, pageFields };
