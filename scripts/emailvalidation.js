// emailvalidation.js (ESM CLI)
// Run: node emailvalidation.js input.csv
// Output: <input>.results.xlsx (Excel with results appended)

import fs from "fs/promises";
import path from "path";
import axios from "axios";
import * as XLSX from "xlsx";
import { fileURLToPath } from "url";

// Only needed for Node ESM __dirname shim
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** ---- CONFIG ---- **/
const EV3_LICENSE_KEY = "WS73-RYC3-ZFV2"; // using your existing key
const EV3_BASE_URL =
  "http://155.130.19.10/ev3/web.svc/json/ValidateEmailAddress"; // internal endpoint; can switch to public if needed
const CONCURRENCY = 5;
/** ----------------- **/

/** Detect email column key from a row */
function detectEmailKey(row) {
  if (!row || typeof row !== "object") return null;
  const keys = Object.keys(row);
  const preferred = [
    "email",
    "emailid",
    "e-mail",
    "email_id",
    "email address",
    "emailaddress",
  ];
  for (const k of keys) if (preferred.includes(k.toLowerCase())) return k;
  for (const k of keys) if (k.toLowerCase().includes("email")) return k;
  return null;
}

/** Validate a single email via EV3 */
async function validateEmail(email) {
  if (!email) throw new Error("No Email Provided");
  const params = {
    EmailAddress: email,
    AllowCorrections: true,
    Timeout: 2000,
    LicenseKey: EV3_LICENSE_KEY,
  };
  const { data } = await axios.get(EV3_BASE_URL, {
    params,
    timeout: 10000,
    maxRedirects: 3,
    headers: { "User-Agent": "valasys-email-validator/cli" },
  });
  if (!data || !data.ValidateEmailInfo) {
    throw new Error("Unexpected API response");
  }
  return data.ValidateEmailInfo;
}

/** Concurrency-limited mapper */
async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let i = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) break;
      try {
        results[idx] = await mapper(items[idx], idx);
      } catch (e) {
        results[idx] = { __error: e?.message || "Validation Failed" };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

/** Merge API info into a row */
function mergeResult(row, infoOrError, emailIn) {
  if (infoOrError && infoOrError.__error) {
    return { ...row, EmailInput: emailIn, ValidationStatus: "Validation Failed", Error: infoOrError.__error };
  }
  const info = infoOrError || {};
  const join = (v) => (Array.isArray(v) ? v.join(",") : v ?? "");
  return {
    ...row,
    EmailInput: emailIn,
    EmailCorrected: info.EmailCorrected ?? "",
    ValidationStatus: info.IsDeliverable ?? "",
    Score: info.Score ?? "",
    Box: info.Box ?? "",
    Domain: info.Domain ?? "",
    TopLevelDomain: info.TopLevelDomain ?? "",
    TopLevelDomainDescription: info.TopLevelDomainDescription ?? "",
    IsSMTPServerGood: info.IsSMTPServerGood ?? "",
    IsSMTPMailBoxGood: info.IsSMTPMailBoxGood ?? "",
    IsCatchAllDomain: info.IsCatchAllDomain ?? "",
    MXRecord: info.MXRecord ?? "",
    WarningCodes: join(info.WarningCodes),
    WarningDescriptions: join(info.WarningDescriptions),
    NotesCodes: join(info.NotesCodes),
    NotesDescriptions: join(info.NotesDescriptions),
  };
}

/** Load rows from CSV or Excel */
async function loadRows(inputPath) {
  const ext = path.extname(inputPath).toLowerCase();
  const buf = await fs.readFile(inputPath);
  if (ext === ".csv") {
    // Use XLSX to parse CSV as well to keep deps minimal
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    return rows;
  } else if (ext === ".xlsx" || ext === ".xls") {
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    return rows;
  }
  throw new Error("Unsupported input file. Use .csv or .xlsx");
}

/** Save rows to Excel */
async function saveExcel(rows, outPath) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Results");
  const outBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  await fs.writeFile(outPath, outBuf);
}

/** Main CLI */
(async () => {
  try {
    const input = process.argv[2];
    if (!input) {
      console.error("Usage: node emailvalidation.js <input.csv|input.xlsx>");
      process.exit(1);
    }
    const inputPath = path.isAbsolute(input) ? input : path.join(process.cwd(), input);
    const rows = await loadRows(inputPath);
    if (rows.length === 0) throw new Error("The input is empty.");

    const emailKey = detectEmailKey(rows[0]);
    if (!emailKey) {
      throw new Error("Could not detect an email column. Include a header like 'Email' or 'EmailID'.");
    }

    const results = await mapWithConcurrency(
      rows,
      CONCURRENCY,
      async (row) => {
        const email = String(row[emailKey]).trim();
        if (!email) return { __error: "No Email Provided" };
        try {
          return await validateEmail(email);
        } catch (e) {
          return { __error: e?.message || "Validation Failed" };
        }
      }
    );

    const merged = rows.map((row, idx) =>
      mergeResult(row, results[idx], String(row[emailKey]).trim() || "")
    );

    let outPath =
      path.join(path.dirname(inputPath), `${path.basename(inputPath, path.extname(inputPath))}.results.xlsx`);

    try {
      await saveExcel(merged, outPath);
    } catch (err) {
      if (err.code === 'EBUSY') {
        console.warn(`⚠️  Target file is busy/open: ${outPath}`);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        outPath = path.join(path.dirname(inputPath), `${path.basename(inputPath, path.extname(inputPath))}.results.${timestamp}.xlsx`);
        console.log(`🔄 Saving to new filename instead: ${outPath}`);
        await saveExcel(merged, outPath);
      } else {
        throw err;
      }
    }
    console.log(`✅ Done. Wrote: ${outPath}`);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
})();
