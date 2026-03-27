import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCatalogRef,
  buildShardConfigs,
  decodeCursor,
  encodeCursor,
  mergeAndDedupeRows,
  normalizeCompanyRow,
  normalizeProspectRow,
  parseCatalogRef,
} from "../search/lib.js";

const makeJwt = (payload) => {
  const encode = (value) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.signature`;
};

test("buildShardConfigs only iterates up to SHARD_COUNT and skips blank slots", () => {
  const env = {
    SHARD_COUNT: "4",
    SUPABASE_URL_1: "https://alpha.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY_1: makeJwt({ ref: "alpha" }),
    SUPABASE_URL_2: "",
    SUPABASE_SERVICE_ROLE_KEY_2: "",
    SUPABASE_URL_3: "",
    SUPABASE_SERVICE_ROLE_KEY_3: "",
    SUPABASE_URL_4: "",
    SUPABASE_SERVICE_ROLE_KEY_4: "",
    SUPABASE_URL_5: "https://should-not-be-read.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY_5: makeJwt({ ref: "should-not-be-read" }),
  };

  const shards = buildShardConfigs(env);

  assert.equal(shards.length, 4);
  assert.equal(shards[0].status, "active");
  assert.equal(shards[0].index, 1);
  assert.equal(shards[1].status, "inactive");
  assert.equal(shards[2].status, "inactive");
  assert.equal(shards[3].status, "inactive");
});

test("buildShardConfigs marks mismatched project refs invalid", () => {
  const env = {
    SHARD_COUNT: "1",
    SUPABASE_URL_1: "https://alpha.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY_1: makeJwt({ ref: "beta" }),
  };

  const [shard] = buildShardConfigs(env);

  assert.equal(shard.status, "invalid");
  assert.match(shard.reason, /alpha/);
  assert.match(shard.reason, /beta/);
});

test("catalog refs round-trip cleanly", () => {
  const catalogRef = buildCatalogRef(7, "prospect", "abc-123");

  assert.equal(catalogRef, "s7:prospect:abc-123");
  assert.deepEqual(parseCatalogRef(catalogRef), {
    shardIndex: 7,
    entity: "prospect",
    sourceId: "abc-123",
  });
});

test("cursor encoding round-trips search pagination state", () => {
  const value = {
    mode: "prospects",
    pageSize: 25,
    offsets: {
      "1": 25,
      "2": 50,
    },
  };

  assert.deepEqual(decodeCursor(encodeCursor(value)), value);
});

test("mergeAndDedupeRows keeps the higher quality prospect match", () => {
  const merged = mergeAndDedupeRows("prospects", [
    {
      catalogRef: "s1:prospect:1",
      sourceShard: 1,
      rowUsage: 2,
      sourceRecordId: "1",
      fullName: "Casey Lane",
      email: "casey@example.com",
      phone: null,
      headline: null,
      jobTitle: "CFO",
      jobLevel: null,
      jobFunction: null,
      companyName: "Northwind",
      companyDomain: null,
      country: "United States",
      region: null,
      industry: null,
      subIndustry: null,
      employeeSize: null,
      naics: null,
      linkedin: null,
    },
    {
      catalogRef: "s2:prospect:2",
      sourceShard: 2,
      sourceRecordId: "2",
      fullName: "Casey Lane",
      email: "casey@example.com",
      phone: "555-0101",
      headline: null,
      jobTitle: "Chief Financial Officer",
      jobLevel: "Executive",
      jobFunction: "Finance",
      companyName: "Northwind",
      companyDomain: "northwind.com",
      country: "United States",
      region: "North America",
      industry: "Software",
      subIndustry: null,
      employeeSize: null,
      naics: null,
      linkedin: null,
    },
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].catalogRef, "s2:prospect:2");
  assert.equal(merged[0].phone, "555-0101");
  assert.equal(merged[0].jobLevel, "Executive");
  assert.deepEqual(merged[0].rowUsageByShard, {
    "1": 2,
    "2": 1,
  });
});

test("normalizeProspectRow repairs mojibake display text and linkedin urls", () => {
  const schema = {
    prospectIdColumn: "sr_no",
    prospectFields: {
      fullName: ["full_name"],
      firstName: ["first_name"],
      lastName: ["last_name"],
      email: ["email_address"],
      phone: ["phone_number"],
      headline: ["job_title"],
      jobTitle: ["job_title"],
      jobLevel: ["job_level"],
      jobFunction: ["job_function"],
      companyName: ["company_name"],
      companyDomain: ["domain"],
      country: ["country"],
      region: ["region"],
      industry: ["industry_type"],
      subIndustry: ["sub_industry"],
      employeeSize: ["employee_size"],
      naics: ["naics_code"],
      linkedin: ["contact_link"],
    },
  };

  const row = normalizeProspectRow(
    {
      sr_no: 7360843,
      first_name: "Joan",
      last_name: "Andrs",
      email_address: "joan@laasesoria.net",
      phone_number: 34974474385,
      job_title: "CEO",
      job_level: "C Level",
      job_function: "Operations",
      company_name: "\"La Asesoria\"\u00c2\u20ac\u2039 Pous-Buis\u00e3\u00a1N Asesores, S.L. |Asesores En Fraga Y Lleida",
      domain: "laasesoria.net",
      country: "Spain",
      region: "Europe",
      industry_type: "Banking/Accounting/Financial",
      sub_industry: "Accounting",
      employee_size: "1-10 employees",
      naics_code: "-",
      contact_link: "http://www.https://www.linkedin.com/in/joanpous",
    },
    1,
    schema,
  );

  assert.equal(row.companyName, "\"La Asesoria\" Pous-Buis\u00e1n Asesores, S.L. | Asesores En Fraga Y Lleida");
  assert.equal(row.linkedin, "https://www.linkedin.com/in/joanpous");
});

test("normalizeCompanyRow trims decorative prefixes and repairs mojibake", () => {
  const schema = {
    companyIdColumn: "company_id",
    companyFields: {
      name: ["company_name"],
      domain: ["domain"],
      country: ["country"],
      region: ["region"],
      industry: ["industry_type"],
      subIndustry: ["sub_industry"],
      employeeSize: ["employee_size"],
      naics: ["naics_code"],
      prospectCount: ["prospect_count"],
    },
  };

  const prefixed = normalizeCompanyRow(
    {
      company_id: "1",
      company_name: "|= Eedi",
      domain: "eedi.com",
      prospect_count: 7,
    },
    1,
    schema,
  );

  const mojibake = normalizeCompanyRow(
    {
      company_id: "2",
      company_name: "\u00c3\u00a0Bac Consultors Del Vall\u00e3\u00a8S, Slu",
      domain: "abac-consultors.com",
      prospect_count: 3,
    },
    2,
    schema,
  );

  assert.equal(prefixed.companyName, "Eedi");
  assert.equal(mojibake.companyName, "\u00e0Bac Consultors Del Vall\u00e8s, Slu");
});
