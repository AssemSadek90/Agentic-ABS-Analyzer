// Render the .mmd sources to SVG + PNG via the Kroki API using node's fetch
// (curl is broken in this environment; node networking works). Run from here:
//   node render.mjs
import { readFileSync, writeFileSync } from "node:fs"

const jobs = [
  ["system-architecture", "svg"],
  ["system-architecture", "png"],
  ["erd", "svg"],
  ["erd", "png"]
]

const render = async (name, fmt) => {
  const src = readFileSync(`${name}.mmd`, "utf8")
  const res = await fetch(`https://kroki.io/mermaid/${fmt}`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: src
  })
  const buf = Buffer.from(await res.arrayBuffer())
  if (!res.ok) {
    console.error(`FAIL ${name}.${fmt} -> HTTP ${res.status}: ${buf.toString("utf8").slice(0, 500)}`)
    return
  }
  writeFileSync(`${name}.${fmt}`, buf)
  const head = fmt === "svg" ? buf.toString("utf8", 0, 30).replace(/\n/g, " ") : "PNG"
  console.log(`OK   ${name}.${fmt}  ${buf.length} bytes  [${head}]`)
}

for (const [n, f] of jobs) {
  try {
    await render(n, f)
  } catch (e) {
    console.error(`ERR  ${n}.${f}:`, e.message)
  }
}
