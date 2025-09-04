import React, { useEffect, useMemo, useState } from "react";

const DEFAULT_PAGE_SIZE = 20;

const COVER = (id, size = "M") =>
  id ? `https://covers.openlibrary.org/b/id/${id}-${size}.jpg` : null;

const formatAuthors = (arr) => (arr && arr.length ? arr.join(", ") : "Unknown");

const getLocal = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
};
const setLocal = (key, val) => {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
};

export default function App() {
  const [mode, setMode] = useState("title"); // title | author | subject | isbn | all
  const [query, setQuery] = useState("");

  // Filters
  const [lang, setLang] = useState(""); // e.g. 'eng', 'hin'
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [ebooksOnly, setEbooksOnly] = useState(false);

  // Sorting & paging
  const [sort, setSort] = useState("relevance"); // relevance | newest | oldest | editions
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Data
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [docs, setDocs] = useState([]);
  const [numFound, setNumFound] = useState(0);

  // Details modal
  const [openWork, setOpenWork] = useState(null); // doc object
  const [workDetails, setWorkDetails] = useState(null);
  const [workLoading, setWorkLoading] = useState(false);

  // Reading list
  const [readingList, setReadingList] = useState(() =>
    getLocal("readingList", [])
  );

  useEffect(() => setLocal("readingList", readingList), [readingList]);

  const totalPages = useMemo(
    () => (numFound ? Math.ceil(numFound / pageSize) : 0),
    [numFound, pageSize]
  );

  function makeUrl() {
    const base = new URL("https://openlibrary.org/search.json");
    const q = query.trim();
    if (!q) return null;

    // Map search mode to parameters
    if (mode === "title") base.searchParams.set("title", q);
    else if (mode === "author") base.searchParams.set("author", q);
    else if (mode === "subject") base.searchParams.set("subject", q);
    else if (mode === "isbn") base.searchParams.set("isbn", q);
    else base.searchParams.set("q", q); // 'all'

    // Filters
    if (lang.trim()) base.searchParams.set("language", lang.trim());
    if (yearFrom) base.searchParams.set("first_publish_year", `${yearFrom}-${yearTo || yearFrom}`);
    if (ebooksOnly) base.searchParams.set("has_fulltext", "true");

    // Paging
    base.searchParams.set("page", String(page));
    base.searchParams.set("limit", String(pageSize));

    // Sort hints (OpenLibrary primarily returns relevance; we’ll sort client-side for extras)
    return base.toString();
  }

  async function fetchBooks(e) {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError("");
    try {
      const url = makeUrl();
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Client-side sorts:
      let list = data.docs || [];
      if (sort === "newest") {
        list = [...list].sort(
          (a, b) => (b.first_publish_year || 0) - (a.first_publish_year || 0)
        );
      } else if (sort === "oldest") {
        list = [...list].sort(
          (a, b) => (a.first_publish_year || 0) - (b.first_publish_year || 0)
        );
      } else if (sort === "editions") {
        list = [...list].sort(
          (a, b) => (b.edition_count || 0) - (a.edition_count || 0)
        );
      }
      setDocs(list);
      setNumFound(data.numFound || list.length);
    } catch (err) {
      setError("Failed to fetch books. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // refetch when page/pageSize changes (only if there’s a query)
    if (query.trim()) fetchBooks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  function toggleSave(book) {
    const exists = readingList.some((b) => b.key === book.key);
    if (exists) {
      setReadingList((r) => r.filter((b) => b.key !== book.key));
    } else {
      // store minimal info
      setReadingList((r) => [
        ...r,
        {
          key: book.key,
          title: book.title,
          author_name: book.author_name,
          cover_i: book.cover_i,
          first_publish_year: book.first_publish_year,
        },
      ]);
    }
  }

  function exportList() {
    const blob = new Blob([JSON.stringify(readingList, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reading-list.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetFilters() {
    setLang("");
    setYearFrom("");
    setYearTo("");
    setEbooksOnly(false);
    setSort("relevance");
    setPage(1);
    setPageSize(DEFAULT_PAGE_SIZE);
  }

  async function openDetails(doc) {
    setOpenWork(doc);
    setWorkDetails(null);
    if (!doc?.key) return;

    setWorkLoading(true);
    try {
      // doc.key is like "/works/OLxxxxW"
      const res = await fetch(`https://openlibrary.org${doc.key}.json`);
      if (res.ok) {
        const data = await res.json();
        setWorkDetails(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setWorkLoading(false);
    }
  }

  return (
    <div className="app">
      <header className="header">
        <h1>📚 Book Finder</h1>
        <p className="sub">Find books fast with the Open Library API</p>
      </header>

      {/* Search & Controls */}
      <form className="controls" onSubmit={fetchBooks}>
        <div className="row">
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="title">Title</option>
            <option value="author">Author</option>
            <option value="subject">Subject/Genre</option>
            <option value="isbn">ISBN</option>
            <option value="all">All terms</option>
          </select>

          <input
            type="text"
            placeholder={`Search by ${mode}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setPage(1)}
          />

          <button className="primary" type="submit" disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        <details className="filters">
          <summary>Filters & sorting</summary>
          <div className="filters-grid">
            <label>
              Language code
              <input
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                placeholder="e.g., eng, hin"
              />
            </label>

            <label>
              Year from
              <input
                type="number"
                value={yearFrom}
                onChange={(e) => setYearFrom(e.target.value)}
                placeholder="e.g., 1990"
              />
            </label>

            <label>
              Year to
              <input
                type="number"
                value={yearTo}
                onChange={(e) => setYearTo(e.target.value)}
                placeholder="e.g., 2024"
              />
            </label>

            <label className="checkbox">
              <input
                type="checkbox"
                checked={ebooksOnly}
                onChange={(e) => setEbooksOnly(e.target.checked)}
              />
              Ebooks only
            </label>

            <label>
              Sort by
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="relevance">Relevance</option>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="editions">Edition count</option>
              </select>
            </label>

            <label>
              Results per page
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                <option>10</option>
                <option>20</option>
                <option>40</option>
              </select>
            </label>

            <button type="button" className="ghost" onClick={resetFilters}>
              Reset filters
            </button>
          </div>
        </details>
      </form>

      {/* Status */}
      {error && <div className="error">{error}</div>}
      {!!numFound && query && !loading && (
        <div className="meta">
          Found <b>{numFound.toLocaleString()}</b> results
          {totalPages > 1 ? ` — page ${page} of ${totalPages}` : ""}
        </div>
      )}

      {/* Results grid */}
      <section className="grid">
        {docs.map((d) => (
          <article key={d.key} className="card">
            <div className="cover">
              {COVER(d.cover_i) ? (
                <img src={COVER(d.cover_i)} alt={d.title} />
              ) : (
                <div className="no-cover">No cover</div>
              )}
            </div>

            <div className="card-body">
              <h3 title={d.title}>{d.title}</h3>
              <p className="muted">{formatAuthors(d.author_name)}</p>
              <p className="meta-line">
                {d.first_publish_year ? `First published: ${d.first_publish_year}` : "—"}
                {d.edition_count ? ` • Editions: ${d.edition_count}` : ""}
              </p>

              <div className="tags">
                {(d.subject?.slice(0, 3) || []).map((s) => (
                  <span key={s} className="tag">
                    {s}
                  </span>
                ))}
              </div>

              <div className="actions">
                <button className="secondary" onClick={() => openDetails(d)}>
                  Details
                </button>
                <button
                  className={
                    readingList.some((b) => b.key === d.key)
                      ? "saved"
                      : "primary"
                  }
                  onClick={() => toggleSave(d)}
                >
                  {readingList.some((b) => b.key === d.key)
                    ? "Remove"
                    : "Save"}
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pager">
          <button
            className="ghost"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ← Prev
          </button>
          <span>
            Page <b>{page}</b> / {totalPages}
          </span>
          <button
            className="ghost"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next →
          </button>
        </div>
      )}

      {/* Reading list */}
      <aside className="reading">
        <div className="reading-header">
          <h2>Reading List ({readingList.length})</h2>
          <div className="reading-actions">
            <button className="ghost" onClick={exportList} disabled={!readingList.length}>
              Export JSON
            </button>
            <button
              className="ghost danger"
              onClick={() => setReadingList([])}
              disabled={!readingList.length}
            >
              Clear
            </button>
          </div>
        </div>
        <div className="reading-list">
          {readingList.map((b) => (
            <div className="reading-item" key={b.key}>
              {COVER(b.cover_i, "S") ? (
                <img src={COVER(b.cover_i, "S")} alt={b.title} />
              ) : (
                <div className="tiny-no-cover">—</div>
              )}
              <div className="reading-info">
                <div className="title" title={b.title}>
                  {b.title}
                </div>
                <div className="muted small">{formatAuthors(b.author_name)}</div>
              </div>
              <button className="link danger" onClick={() => toggleSave(b)}>
                Remove
              </button>
            </div>
          ))}
          {!readingList.length && <div className="muted">No saved books yet.</div>}
        </div>
      </aside>

      {/* Details modal */}
      {openWork && (
        <div className="modal-backdrop" onClick={() => setOpenWork(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{openWork.title}</h3>
              <button className="link" onClick={() => setOpenWork(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p className="muted">{formatAuthors(openWork.author_name)}</p>
              <p className="meta-line">
                {openWork.first_publish_year
                  ? `First published: ${openWork.first_publish_year}`
                  : ""}
                {openWork.edition_count ? ` • Editions: ${openWork.edition_count}` : ""}
              </p>

              {workLoading && <p>Loading details…</p>}
              {workDetails?.description && (
                <p className="desc">
                  {typeof workDetails.description === "string"
                    ? workDetails.description
                    : workDetails.description?.value}
                </p>
              )}

              <div className="tags">
                {(openWork.subject?.slice(0, 8) || []).map((s) => (
                  <span className="tag" key={s}>
                    {s}
                  </span>
                ))}
              </div>

              <a
                className="link"
                href={`https://openlibrary.org${openWork.key}`}
                target="_blank"
                rel="noreferrer"
              >
                View on Open Library ↗
              </a>
            </div>
          </div>
        </div>
      )}

      <footer className="footer">
        <span>Built with React + Open Library API</span>
      </footer>
    </div>
  );
}

