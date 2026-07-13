"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const demoData = require("./demo-data.js");

const DATA_DIR = path.join(os.homedir(), ".openclaw", "data");
const STORE_PATH = path.join(DATA_DIR, "dorothy-web-features.json");

function emptyStore() {
  return {
    projects: [],
    browserActions: [],
    sharedItems: [],
    documents: [],
  };
}

function readStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    return { ...emptyStore(), ...parsed };
  } catch {
    return emptyStore();
  }
}

function writeStore(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temporary = `${STORE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(store, null, 2), "utf8");
  fs.renameSync(temporary, STORE_PATH);
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function listProjects() {
  if (demoData.DEMO_MODE) return demoData.demoProjects();
  return readStore().projects
    .slice()
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function createProject(input) {
  const name = String(input.name || "").trim().slice(0, 120);
  if (!name) throw new Error("Project name is required");
  const now = new Date().toISOString();
  const project = {
    id: createId("project"),
    name,
    description: String(input.description || "").trim().slice(0, 2000),
    status: "active",
    notes: [],
    links: [],
    createdAt: now,
    updatedAt: now,
  };
  const store = readStore();
  store.projects.unshift(project);
  writeStore(store);
  return project;
}

function updateProject(id, input) {
  const store = readStore();
  const project = store.projects.find(item => item.id === id);
  if (!project) throw new Error("Project not found");
  if (input.name !== undefined) {
    const name = String(input.name || "").trim().slice(0, 120);
    if (!name) throw new Error("Project name is required");
    project.name = name;
  }
  if (input.description !== undefined) {
    project.description = String(input.description || "").trim().slice(0, 2000);
  }
  if (input.status !== undefined && ["active", "paused", "done"].includes(input.status)) {
    project.status = input.status;
  }
  if (input.note) {
    project.notes.unshift({
      id: createId("note"),
      text: String(input.note).trim().slice(0, 5000),
      createdAt: new Date().toISOString(),
    });
    project.notes = project.notes.slice(0, 100);
  }
  project.updatedAt = new Date().toISOString();
  writeStore(store);
  return project;
}

function listBrowserActions() {
  if (demoData.DEMO_MODE) return demoData.demoBrowserActions();
  return readStore().browserActions
    .slice(0, 50)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function classifyBrowserAction(instruction) {
  const text = String(instruction || "").toLowerCase();
  const risky = /\b(click|πάτα|συμπλήρω|fill|send|στείλε|submit|download|κατέβασε|login|σύνδεση|αγόρασε|purchase|delete|διέγραψε|upload|ανέβασε)\b/i.test(text);
  return {
    risk: risky ? "confirmation" : "read-only",
    requiresConfirmation: risky,
    summary: risky
      ? "This action may change data or submit information."
      : "This action is limited to opening, reading, or summarizing.",
  };
}

function createBrowserAction(input) {
  const instruction = String(input.instruction || "").trim().slice(0, 4000);
  if (!instruction) throw new Error("Instruction is required");
  const classification = classifyBrowserAction(instruction);
  const action = {
    id: createId("browser"),
    instruction,
    url: String(input.url || "").trim().slice(0, 2000),
    status: "preview",
    ...classification,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    result: "",
  };
  const store = readStore();
  store.browserActions.unshift(action);
  store.browserActions = store.browserActions.slice(0, 100);
  writeStore(store);
  return action;
}

function updateBrowserAction(id, input) {
  const store = readStore();
  const action = store.browserActions.find(item => item.id === id);
  if (!action) throw new Error("Browser action not found");
  Object.assign(action, input, { updatedAt: new Date().toISOString() });
  writeStore(store);
  return action;
}

function addSharedItem(input) {
  const item = {
    id: createId("share"),
    title: String(input.title || "").trim().slice(0, 300),
    text: String(input.text || "").trim().slice(0, 20000),
    url: String(input.url || "").trim().slice(0, 4000),
    fileName: String(input.fileName || "").trim().slice(0, 300),
    filePath: String(input.filePath || "").trim().slice(0, 4000),
    createdAt: new Date().toISOString(),
  };
  const store = readStore();
  store.sharedItems.unshift(item);
  store.sharedItems = store.sharedItems.slice(0, 100);
  writeStore(store);
  return item;
}

function listSharedItems() {
  return readStore().sharedItems.slice(0, 50);
}

function addDocument(input) {
  const item = {
    id: createId("document"),
    ...input,
    createdAt: new Date().toISOString(),
  };
  const store = readStore();
  store.documents.unshift(item);
  store.documents = store.documents.slice(0, 200);
  writeStore(store);
  return item;
}

function listDocuments() {
  return readStore().documents.slice(0, 100);
}

module.exports = {
  addDocument,
  addSharedItem,
  classifyBrowserAction,
  createBrowserAction,
  createProject,
  listBrowserActions,
  listDocuments,
  listProjects,
  listSharedItems,
  updateBrowserAction,
  updateProject,
};
