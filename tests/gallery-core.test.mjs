import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const core = require("../gallery-core.js");

test("hides file-name titles", () => {
  assert.equal(core.displayTitle("DSC04035", "Austria"), "");
  assert.equal(core.displayTitle("Dsc04030 Enhanced Nr", "Austria"), "");
  assert.equal(core.displayTitle("IMG 5283", "Austria"), "");
  assert.equal(core.displayTitle("IMG_7682", "PhD Hooding Ceremony"), "");
  assert.equal(core.displayTitle("Dsc04445 Pano Enhanced Nr", "Austria"), "");
  assert.equal(core.displayTitle("Dsc04274 2", "Austria"), "");
  assert.equal(core.displayTitle("DJI_0012", "HKUST Campus (DJI View)"), "");
  assert.equal(core.displayTitle("", "Austria"), "");
});

test("keeps real titles and strips the group prefix", () => {
  assert.equal(core.displayTitle("Austria Field Photo I", "Austria"), "Field Photo I");
  assert.equal(
    core.displayTitle("Travelling and Study in Wales · IMG 1465", "Travelling and Study in Wales"),
    ""
  );
  assert.equal(core.displayTitle("PhD hooding ceremony", "PhD Hooding Ceremony"), ""); // identical to group: redundant
  assert.equal(core.displayTitle("Sunset over Trieste", "Trieste, Italy"), "Sunset over Trieste");
  assert.equal(core.displayTitle("HKUST Campus (DJI View): Library", "HKUST Campus (DJI View)"), "Library");
});

test("stripGroupPrefix escapes regex characters in group names", () => {
  assert.equal(core.stripGroupPrefix("HKUST Campus (DJI View) - Atrium", "HKUST Campus (DJI View)"), "Atrium");
  assert.equal(core.stripGroupPrefix("Other title", ""), "Other title");
});
