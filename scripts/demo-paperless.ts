// Demo-Server fuer die README-Bilder (`scripts/shots.ts`): ein Minimal-paperless auf
// 127.0.0.1, das nur die vier Routen spricht, die das Plugin benutzt, mit erfundenen,
// generischen Dokumenten. Grund: die echte Test-Instanz haelt private Unterlagen — was in
// einem Bild lesbar ist, geht mit dem Repo um die Welt (Skill readme-shots, „Beispieldaten:
// generisch und englisch"). Dieser Server ist ausdruecklich KEIN Test des Plugins gegen
// paperless (das leistet `scripts/paperless-lab.ts` gegen die echte Instanz), sondern
// Bildmaterial.

import { createServer, type Server } from "node:http";

export const DEMO_TOKEN = "demo-token";

export interface DemoDocument {
  id: number;
  title: string;
  lines: string[];
}

export const DEMO_DOCUMENTS: DemoDocument[] = [
  {
    id: 101,
    title: "Acme Consulting — Service Agreement",
    lines: [
      "Service Agreement",
      "between Acme Consulting Ltd. (the Provider)",
      "and Jane Doe (the Client)",
      "",
      "1. Scope. The Provider delivers twelve hours of advisory work per month.",
      "2. Term. This agreement runs from 1 January 2026 for twelve months",
      "   and renews once unless cancelled in writing.",
      "3. Fees. The monthly fee is EUR 1,200, payable within 14 days.",
      "4. Confidentiality. Both parties keep the content of this agreement",
      "   and all shared material confidential.",
      "",
      "Signed at Springfield, 15 December 2025",
    ],
  },
  { id: 102, title: "Home insurance policy 2026", lines: ["Home insurance policy 2026", "Policy no. 000-000-0000", "Sum insured: EUR 250,000"] },
  { id: 103, title: "Invoice 2026-014 — Acme Consulting", lines: ["Invoice 2026-014", "Advisory work, March 2026", "Total: EUR 1,200.00"] },
  { id: 104, title: "Warranty certificate — laptop 2026", lines: ["Warranty certificate", "Valid for 36 months from purchase", "Serial: ABC123"] },
  { id: 105, title: "Tax return 2026 — draft", lines: ["Tax return 2026 (draft)", "Income, deductions, notes"] },
  { id: 106, title: "Bicycle repair receipt", lines: ["Repair receipt", "Brake pads, chain, labour", "Total: EUR 64.50"] },
];

/** Ein gueltiges Ein-Seiten-PDF (A4, Helvetica) — von Hand geschrieben, keine Abhaengigkeit. */
export function makePdf(lines: string[]): Buffer {
  const esc = (s: string): string => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  // Nur Latin-1: „—" u. ae. wuerden in WinAnsi nicht als ein Byte landen.
  const ascii = (s: string): string => s.replace(/—/g, "-");
  const text = lines
    .map((l, i) => `BT /F1 ${i === 0 ? 20 : 12} Tf 60 ${770 - i * (i === 0 ? 40 : 22)} Td (${esc(ascii(l))}) Tj ET`)
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

export interface DemoServer {
  url: string;
  close(): Promise<void>;
}

export async function startDemoServer(port: number): Promise<DemoServer> {
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    if (req.headers.authorization !== `Token ${DEMO_TOKEN}`) {
      res.writeHead(401, { "content-type": "application/json" }).end('{"detail":"Invalid token."}');
      return;
    }
    const json = (body: unknown): void => {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
    };
    if (url.pathname === "/api/documents/") {
      const q = (url.searchParams.get("query") ?? "").toLowerCase();
      const hits = DEMO_DOCUMENTS.filter((d) => d.title.toLowerCase().includes(q));
      json({ count: hits.length, results: hits.map((d) => ({ id: d.id, title: d.title })) });
      return;
    }
    const m = /^\/api\/documents\/(\d+)\/(preview\/|download\/)?$/.exec(url.pathname);
    const doc = m ? DEMO_DOCUMENTS.find((d) => d.id === Number(m[1])) : undefined;
    if (!m || !doc) {
      res.writeHead(404, { "content-type": "application/json" }).end('{"detail":"Not found."}');
      return;
    }
    if (m[2]) {
      res.writeHead(200, { "content-type": "application/pdf" }).end(makePdf(doc.lines));
      return;
    }
    json({ id: doc.id, title: doc.title, created: "2026-01-01", versions: [{ id: doc.id, is_root: true, checksum: `demo-${doc.id}` }] });
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
