import { createMakoEdit } from "./dist/index.js";
import { encodeMarker, decodeMarker, stripMarkers } from "./dist/stega.js";

// In-memory store so the test needs no database.
let rows = [], nextId = 1;
const store = {
  async listRows(page) { return rows.filter(r => r.page === page); },
  async insertRow(r) { rows.push({ ...r, id: nextId++ }); },
  async updateRow(id, patch) { const r = rows.find(x => x.id === id); Object.assign(r, patch); },
  async deleteRow(id) { rows = rows.filter(x => x.id !== id); },
};

const PAGES = [{
  slug: "home", path: "/", label: "Home",
  sections: [{ key: "hero", label: "Hero", fields: [
    { key: "headline", label: "Headline", kind: "text", default: "Original headline", maxLength: 20 },
  ]}],
}];

let draft = false;
const c = createMakoEdit({ pages: PAGES, store, revalidate: () => {}, isDraft: async () => draft });

const a = await c.getPageContent("home");
console.log("  1. no rows -> default:      ", a["hero.headline"] === "Original headline" ? "PASS" : "FAIL " + a["hero.headline"]);

await c.saveDraft("home", [{ section: "hero", key: "headline", value: "Edited" }], 1);
const b = await c.getPageContent("home");
console.log("  2. draft not live:          ", b["hero.headline"] === "Original headline" ? "PASS" : "FAIL " + b["hero.headline"]);
console.log("  3. hasDraft true:           ", (await c.hasDraft("home")) ? "PASS" : "FAIL");

draft = true;
const d = await c.getPageContent("home");
console.log("  4. draft mode shows draft:  ", stripMarkers(d["hero.headline"]) === "Edited" ? "PASS" : "FAIL " + stripMarkers(d["hero.headline"]));
console.log("  5. marker decodes to index: ", decodeMarker(d["hero.headline"]) === 0 ? "PASS" : "FAIL");
draft = false;

await c.publishPage("home", 1);
const e = await c.getPageContent("home");
console.log("  6. publish goes live:       ", e["hero.headline"] === "Edited" ? "PASS" : "FAIL " + e["hero.headline"]);

await c.saveDraft("home", [{ section: "hero", key: "headline", value: "This headline is definitely far too long" }], 1);
draft = true;
const f = stripMarkers((await c.getPageContent("home"))["hero.headline"]);
console.log("  7. maxLength enforced (20): ", f.length === 20 ? "PASS" : "FAIL len=" + f.length);
draft = false;

await c.discardPage("home");
const g = await c.getPageContent("home");
console.log("  8. discard keeps published: ", g["hero.headline"] === "Edited" ? "PASS" : "FAIL " + g["hero.headline"]);

await c.saveDraft("home", [{ section: "hero", key: "evil", value: "x" }], 1);
console.log("  9. unknown field ignored:   ", rows.filter(r => r.fieldKey === "evil").length === 0 ? "PASS" : "FAIL");

const marked = encodeMarker("hello", 7);
console.log(" 10. marker round-trip:       ", decodeMarker(marked) === 7 && stripMarkers(marked) === "hello" ? "PASS" : "FAIL");

store.listRows = async () => { throw new Error("db down"); };
const h = await c.getPageContent("home");
console.log(" 11. db down -> defaults:     ", h["hero.headline"] === "Original headline" ? "PASS" : "FAIL " + h["hero.headline"]);
