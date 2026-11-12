/** Renders draft text with each [ID] citation as a link to its evidence record. */
export function CitedText({ text }: { text: string }) {
  const parts = text.split(/(\[[A-Z]{3}-\d{3}(?:\s*,\s*[A-Z]{3}-\d{3})*\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\[(.*)\]$/);
        if (!m) return <span key={i}>{part}</span>;
        const ids = m[1].split(/\s*,\s*/);
        return (
          <span key={i} className="cite-group">
            [
            {ids.map((id, j) => (
              <span key={id}>
                {j > 0 && ", "}
                <a href={`#${id}`} className="cite">
                  {id}
                </a>
              </span>
            ))}
            ]
          </span>
        );
      })}
    </>
  );
}
