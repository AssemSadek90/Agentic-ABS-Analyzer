import { Fragment } from "react"

// Minimal, safe renderer for assistant text (§S.5: the model is instructed to
// emit plain text with simple dashes for lists and no tables/headings). Handles
// paragraphs, dash/bullet lists, and **bold** inline. No HTML injection — every
// node is a real React element.

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return <Fragment key={i}>{part}</Fragment>
  })
}

const isBullet = (line: string): boolean => /^\s*[-*]\s+/.test(line)
const stripBullet = (line: string): string => line.replace(/^\s*[-*]\s+/, "")

export function MarkdownLite({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/)
  return (
    <div className="space-y-2.5 text-sm leading-relaxed text-foreground">
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter((l) => l.trim() !== "")
        if (lines.length === 0) return null
        if (lines.every(isBullet)) {
          return (
            <ul key={bi} className="ml-4 list-disc space-y-1">
              {lines.map((line, li) => (
                <li key={li}>{renderInline(stripBullet(line))}</li>
              ))}
            </ul>
          )
        }
        return (
          <p key={bi} className="whitespace-pre-wrap">
            {lines.map((line, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {renderInline(line)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}
