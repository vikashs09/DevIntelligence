import test from "node:test";
import assert from "node:assert/strict";
import { canRole } from "../src/middleware/permissions.js";

test("legacy leader retains owner permissions", () => {
  assert.equal(canRole("leader", "project.delete"), true);
  assert.equal(canRole("leader", "audit.view"), true);
});

test("legacy manager receives permitted project and task operations", () => {
  assert.equal(canRole("manager", "project.create"), true);
  assert.equal(canRole("manager", "project.delete"), true);
  assert.equal(canRole("manager", "task.assign"), true);
});

test("developer cannot manage members or view audit logs", () => {
  assert.equal(canRole("developer", "task.update"), true);
  assert.equal(canRole("developer", "members.remove"), false);
  assert.equal(canRole("developer", "audit.view"), false);
});

test("viewer is read-only", () => {
  assert.equal(canRole("viewer", "task.view"), true);
  assert.equal(canRole("viewer", "task.update"), false);
  assert.equal(canRole("viewer", "project.create"), false);
});
