const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const platformScript = fs.readFileSync(
  path.resolve(__dirname, "..", "platform.js"),
  "utf8",
);
const contentScript = fs.readFileSync(
  path.resolve(__dirname, "..", "content.js"),
  "utf8",
);

class FakeElement {
  constructor({
    id = "",
    cls = "",
    width = 100,
    height = 36,
  } = {}) {
    this.id = id;
    this.cls = cls;
    this.width = width;
    this.height = height;
    this.isConnected = true;
    this.parentElement = null;
    this.children = [];
    this.style = {};
    this.listeners = {};
  }

  get firstChild() {
    return this.children[0] || null;
  }

  getBoundingClientRect() {
    return { width: this.width, height: this.height };
  }

  matches(selector) {
    const parts = String(selector)
      .split(",")
      .map((part) => part.trim());
    return parts.some((part) => {
      if (part.startsWith("#")) return this.id === part.slice(1);
      if (part.startsWith(".")) {
        return this.cls.split(/\s+/).includes(part.slice(1));
      }
      return false;
    });
  }

  querySelector(selector) {
    for (const child of this.children) {
      if (child.matches(selector)) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }

  querySelectorAll(selector) {
    const matches = [];
    for (const child of this.children) {
      if (child.matches(selector)) matches.push(child);
      matches.push(...child.querySelectorAll(selector));
    }
    return matches;
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  setAttribute(name, value) {
    this[name] = value;
  }

  appendChild(child) {
    child.parentElement?.removeChild(child);
    this.children.push(child);
    child.parentElement = this;
    child.isConnected = true;
    return child;
  }

  insertBefore(child, before) {
    child.parentElement?.removeChild(child);
    const index = before ? this.children.indexOf(before) : -1;
    if (index >= 0) this.children.splice(index, 0, child);
    else this.children.push(child);
    child.parentElement = this;
    child.isConnected = true;
    return child;
  }

  removeChild(child) {
    this.children = this.children.filter((candidate) => candidate !== child);
    child.parentElement = null;
  }

  remove() {
    this.parentElement?.removeChild(this);
    this.isConnected = false;
  }
}

function createHarness() {
  const toolbars = [];
  const elements = [];
  const windowListeners = {};
  const observers = [];
  const timers = new Map();
  let nextTimerId = 1;

  const document = {
    readyState: "loading",
    body: new FakeElement(),
    addEventListener() {},
    querySelectorAll(selector) {
      if (selector === ".video-toolbar") return toolbars;
      if (selector === "#bili-digest-button") {
        return elements.filter(
          (element) => element.id === "bili-digest-button" && element.isConnected,
        );
      }
      return [];
    },
    querySelector() {
      return null;
    },
    getElementById(id) {
      return elements.find((element) => element.id === id && element.isConnected);
    },
    createElement() {
      const element = new FakeElement();
      elements.push(element);
      return element;
    },
  };

  const reloadState = { count: 0 };

  const context = vm.createContext({
    console,
    document,
    window: {
      location: {
        href: "https://www.bilibili.com/video/BV1Fg411D7Jy",
        reload: () => {
          reloadState.count++;
        },
      },
      addEventListener(type, listener) {
        windowListeners[type] = listener;
      },
      getComputedStyle(element) {
        return {
          display: element.display || "flex",
          visibility: element.visibility || "visible",
          position: element.position || "relative",
        };
      },
    },
    chrome: {
      runtime: {
        onMessage: { addListener() {} },
        async sendMessage() {
          return { success: true };
        },
      },
    },
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        observers.push(this);
      }
      observe() {}
    },
    setTimeout(callback) {
      const id = nextTimerId++;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    setInterval() {
      return nextTimerId++;
    },
    clearInterval() {},
  });

  vm.runInContext(platformScript, context);
  vm.runInContext(contentScript, context);

  return {
    context,
    toolbars,
    elements,
    windowListeners,
    observers,
    reloadState,
    flushTimers() {
      const callbacks = Array.from(timers.values());
      timers.clear();
      callbacks.forEach((callback) => callback());
    },
  };
}

function createToolbar({ width, height }) {
  const toolbar = new FakeElement({ cls: "video-toolbar", width, height });
  const right = new FakeElement({ cls: "toolbar-right", width, height });
  toolbar.appendChild(right);
  return { toolbar, right };
}

test("Digest button skips a hidden responsive toolbar", () => {
  const harness = createHarness();
  const hidden = createToolbar({ width: 0, height: 0 });
  const visible = createToolbar({ width: 389, height: 36 });
  harness.toolbars.push(hidden.toolbar, visible.toolbar);

  assert.equal(harness.context.findDigestButtonHost(), visible.right);
  assert.equal(harness.context.injectDigestButton(), true);
  assert.equal(hidden.right.children.length, 0);
  assert.equal(visible.right.children.length, 1);
  assert.equal(visible.right.children[0].id, "bili-digest-button");
  assert.match(visible.right.children[0].style.cssText, /background:\s*#00a1d6/);
});

test("Digest button replaces stale instances and removes duplicates", () => {
  const harness = createHarness();
  const stale = createToolbar({ width: 0, height: 0 });
  const visible = createToolbar({ width: 500, height: 36 });
  harness.toolbars.push(stale.toolbar, visible.toolbar);

  const staleButton = new FakeElement();
  staleButton.id = "bili-digest-button";
  const duplicateButton = new FakeElement();
  duplicateButton.id = "bili-digest-button";
  harness.elements.push(staleButton, duplicateButton);
  stale.right.appendChild(staleButton);
  stale.right.appendChild(duplicateButton);

  assert.equal(harness.context.injectDigestButton(), true);
  assert.equal(stale.right.children.length, 0);
  assert.equal(visible.right.children.length, 1);
  assert.notEqual(visible.right.children[0], staleButton);
  assert.equal(visible.right.children[0].id, "bili-digest-button");
  assert.equal(staleButton.isConnected, false);
  assert.equal(duplicateButton.isConnected, false);
});

test("resize reconciliation follows the newly visible toolbar", () => {
  const harness = createHarness();
  const first = createToolbar({ width: 500, height: 36 });
  const second = createToolbar({ width: 0, height: 0 });
  harness.toolbars.push(first.toolbar, second.toolbar);

  harness.context.injectDigestButton();
  harness.context.setupDigestButtonResizeListener();
  first.toolbar.width = 0;
  first.toolbar.height = 0;
  first.right.width = 0;
  first.right.height = 0;
  second.toolbar.width = 389;
  second.toolbar.height = 36;
  second.right.width = 389;
  second.right.height = 36;

  harness.windowListeners.resize();
  harness.flushTimers();

  assert.equal(first.right.children.length, 0);
  assert.equal(second.right.children.length, 1);
  assert.equal(second.right.children[0].id, "bili-digest-button");
});

test("DOM mutation reconciliation repairs a replaced toolbar", () => {
  const harness = createHarness();
  const old = createToolbar({ width: 500, height: 36 });
  const fresh = createToolbar({ width: 0, height: 0 });
  harness.toolbars.push(old.toolbar, fresh.toolbar);

  harness.context.injectDigestButton();
  harness.context.setupButtonObserver();
  old.toolbar.width = 0;
  old.toolbar.height = 0;
  old.right.width = 0;
  old.right.height = 0;
  fresh.toolbar.width = 500;
  fresh.toolbar.height = 36;
  fresh.right.width = 500;
  fresh.right.height = 36;

  harness.observers[0].callback([]);
  harness.flushTimers();

  assert.equal(old.right.children.length, 0);
  assert.equal(fresh.right.children.length, 1);
  assert.equal(fresh.right.children[0].id, "bili-digest-button");
});

test("Digest button reloads the page when the extension context was invalidated", async () => {
  const harness = createHarness();
  const toolbar = createToolbar({ width: 500, height: 36 });
  harness.toolbars.push(toolbar.toolbar);
  harness.context.injectDigestButton();

  const button = toolbar.right.children.find((child) => child.id === "bili-digest-button");
  assert.ok(button, "digest button should be injected");

  // Simulate the extension being reloaded while the content script is still
  // alive in the page: sendMessage throws the Chrome-specific error.
  harness.context.chrome.runtime.sendMessage = async () => {
    throw new Error("Extension context invalidated");
  };

  const event = {
    preventDefault() {},
    stopPropagation() {},
  };

  // Fire the click but do not await it: the handler deliberately returns a
  // never-settling promise after triggering the page reload.
  button.listeners.click(event);
  // Let the rejected-sendMessage microtask run so the reload() call happens.
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(harness.reloadState.count, 1, "page should reload to recover a fresh context");
});
