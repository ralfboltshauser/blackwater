import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  GUIDE_ARTICLES,
  GUIDE_ARTICLES_BY_ID,
  GUIDE_CATEGORIES,
  guideArticle,
  type GuideArticleId,
} from "./guide-content";

export function GuideLibrary({
  initialArticleId,
  onClose,
}: {
  initialArticleId: GuideArticleId;
  onClose: () => void;
}) {
  const [articleId, setArticleId] = useState(initialArticleId);
  const [query, setQuery] = useState("");
  const [contentsOpen, setContentsOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const article = guideArticle(articleId);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return GUIDE_ARTICLES;
    return GUIDE_ARTICLES.filter((candidate) =>
      [
        candidate.title,
        candidate.summary,
        candidate.category,
        ...candidate.keywords,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [query]);

  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      if (!controls.length) return;
      const first = controls[0]!;
      const last = controls.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [onClose]);

  const openArticle = (id: GuideArticleId) => {
    setArticleId(id);
    setContentsOpen(false);
    articleRef.current?.scrollTo({ top: 0 });
  };

  return createPortal(
    <div
      ref={dialogRef}
      className="guide-library"
      role="dialog"
      aria-modal="true"
      aria-label="Blackwater field guide"
    >
      <header className="guide-library__header">
        <div className="guide-library__brand">
          <span aria-hidden="true">⌬</span>
          <div>
            <small>Blackwater</small>
            <b>Field guide</b>
          </div>
        </div>
        <button
          className="guide-library__contents"
          aria-expanded={contentsOpen}
          onClick={() => setContentsOpen((open) => !open)}
        >
          Contents
        </button>
        <label className="guide-library__search">
          <span className="sr-only">Search field guide</span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m15.5 15.5 5 5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search rules, assets, orders…"
          />
          {query && (
            <button
              aria-label="Clear guide search"
              onClick={() => setQuery("")}
            >
              ×
            </button>
          )}
        </label>
        <button
          ref={closeRef}
          className="icon-button"
          aria-label="Close field guide"
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <div className="guide-library__body">
        <aside className={contentsOpen ? "is-open" : ""}>
          <div className="guide-library__index-head">
            <span>{query ? "Search results" : "Contents"}</span>
            <small>{filtered.length} articles</small>
          </div>
          {GUIDE_CATEGORIES.map((category) => {
            const articles = filtered.filter(
              (candidate) => candidate.category === category,
            );
            if (!articles.length) return null;
            return (
              <section key={category}>
                <h2>{category}</h2>
                {articles.map((candidate) => (
                  <button
                    key={candidate.id}
                    className={candidate.id === article.id ? "is-active" : ""}
                    aria-current={
                      candidate.id === article.id ? "page" : undefined
                    }
                    onClick={() => openArticle(candidate.id)}
                  >
                    <span aria-hidden="true">{candidate.glyph}</span>
                    <span>
                      <b>{candidate.title}</b>
                      <small>{candidate.summary}</small>
                    </span>
                  </button>
                ))}
              </section>
            );
          })}
          {filtered.length === 0 && (
            <div className="guide-library__empty">
              <b>No matching article</b>
              <p>Try an order name, resource, asset, or Charter.</p>
              <button className="button-secondary" onClick={() => setQuery("")}>
                Clear search
              </button>
            </div>
          )}
        </aside>

        <article ref={articleRef} className="guide-article">
          <header>
            <div className="guide-article__glyph" aria-hidden="true">
              {article.glyph}
            </div>
            <div>
              <p className="eyebrow">{article.category} · Reference article</p>
              <h1>{article.title}</h1>
              <p>{article.summary}</p>
            </div>
          </header>
          <div className="guide-article__sections">
            {article.sections.map((section, index) => (
              <section key={`${section.title}-${index}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h2>{section.title}</h2>
                  {section.body?.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                  {section.steps && (
                    <ol>
                      {section.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  )}
                  {section.note && <aside>{section.note}</aside>}
                </div>
              </section>
            ))}
          </div>
          {article.related && (
            <footer>
              <span>Continue reading</span>
              <div>
                {article.related
                  .map((id) => GUIDE_ARTICLES_BY_ID.get(id))
                  .filter((related) => related !== undefined)
                  .map((related) => (
                    <button
                      key={related.id}
                      onClick={() => openArticle(related.id)}
                    >
                      <span aria-hidden="true">{related.glyph}</span>
                      <b>{related.title}</b>
                      <small>Read article →</small>
                    </button>
                  ))}
              </div>
            </footer>
          )}
        </article>
      </div>
    </div>,
    document.body,
  );
}
