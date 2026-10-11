import { describe, it, expect } from "vitest";
import {
  AgentStreamingParser,
  cleanWriteContent,
  parseEditContent,
  validateFilePath,
  applyFileEdit,
} from "./agent-parser.server";

describe("AgentStreamingParser", () => {
  it("handles basic tags and plain text plan & summary", () => {
    const parser = new AgentStreamingParser();
    const input = [
      "Here is my short plan for building the app.\n",
      "<dl-status>Setting up project</dl-status>\n",
      '<dl-write path="index.html">\n',
      "<!DOCTYPE html>\n<html><body><h1>Hello World</h1></body></html>\n",
      "</dl-write>\n",
      "<dl-notes>\nSite has index.html with teal theme.\n</dl-notes>\n",
      "Built the site. Try clicking the header!\n",
    ];

    for (const chunk of input) {
      parser.feed(chunk);
    }
    const result = parser.finish();

    expect(result.plan).toContain("Here is my short plan");
    expect(result.summary).toContain("Built the site");
    expect(result.truncated).toBeUndefined();

    const writeEvent = result.events.find((e) => e.type === "write");
    expect(writeEvent).toBeDefined();
    if (writeEvent && writeEvent.type === "write") {
      expect(writeEvent.path).toBe("index.html");
      expect(writeEvent.content).toBe(
        "<!DOCTYPE html>\n<html><body><h1>Hello World</h1></body></html>",
      );
    }

    const statusEvent = result.events.find((e) => e.type === "status");
    expect(statusEvent).toEqual({
      type: "status",
      status: "Setting up project",
    });

    const notesEvent = result.events.find((e) => e.type === "notes");
    expect(notesEvent).toEqual({
      type: "notes",
      notes: "Site has index.html with teal theme.",
    });
  });

  it("handles tags split across fine-grained chunks", () => {
    const parser = new AgentStreamingParser();
    const chunks = [
      "<dl-",
      "status>B",
      "uilding hero",
      "</dl-status>\n",
      "<dl-write ",
      'path="st',
      'yle.css">',
      "\nbody { margin: ",
      "0; }\n",
      "</dl-wr",
      "ite>\n",
      '<dl-ask options="Yes | No">Re',
      "place site?</dl-ask>",
    ];

    for (const chunk of chunks) {
      parser.feed(chunk);
    }
    const result = parser.finish();

    const status = result.events.find((e) => e.type === "status");
    expect(status).toEqual({ type: "status", status: "Building hero" });

    const write = result.events.find((e) => e.type === "write");
    expect(write).toEqual({
      type: "write",
      path: "style.css",
      content: "body { margin: 0; }",
    });

    const ask = result.events.find((e) => e.type === "ask");
    expect(ask).toEqual({
      type: "ask",
      question: "Replace site?",
      options: ["Yes", "No"],
    });
  });

  it("handles nested HTML and script/style tags inside dl-write content without early termination", () => {
    const parser = new AgentStreamingParser();
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <style>
    dl { display: flex; }
    .card { padding: 1rem; }
  </style>
  <script>
    if (a < 5) {
      console.log("<div>closing tag test</div>");
    }
  </script>
</head>
<body>
  <div class="card">
    <dl-status>not a real tag inside write</dl-status>
    <p>Nested content</p>
  </div>
</body>
</html>`;

    parser.feed(`<dl-write path="index.html">\n${htmlContent}\n</dl-write>`);
    const result = parser.finish();

    const write = result.events.find((e) => e.type === "write");
    expect(write).toBeDefined();
    if (write && write.type === "write") {
      expect(write.path).toBe("index.html");
      expect(write.content).toBe(htmlContent);
    }
  });

  it("strips wrapping markdown code fences inside dl-write", () => {
    const parser = new AgentStreamingParser();
    const wrappedContent =
      '<dl-write path="app.js">\n```javascript\nconsole.log("Hello");\n```\n</dl-write>';

    parser.feed(wrappedContent);
    const result = parser.finish();

    const write = result.events.find((e) => e.type === "write");
    expect(write).toBeDefined();
    if (write && write.type === "write") {
      expect(write.content).toBe('console.log("Hello");');
    }
  });

  it("detects truncation when dl-write is cut off mid-stream", () => {
    const parser = new AgentStreamingParser();
    parser.feed(
      '<dl-status>Writing file</dl-status>\n<dl-write path="large.js">\nfunction run() {\n  const x = 1;',
    );
    const result = parser.finish();

    // Partial write should NOT be emitted as a write event
    const writes = result.events.filter((e) => e.type === "write");
    expect(writes).toHaveLength(0);

    // Truncation info must be returned
    expect(result.truncated).toBeDefined();
    expect(result.truncated?.tag).toBe("write");
    expect(result.truncated?.path).toBe("large.js");
  });

  it("detects truncation when dl-edit is cut off mid-stream", () => {
    const parser = new AgentStreamingParser();
    parser.feed('<dl-edit path="style.css"><dl-old>color: red;</dl-old><dl-new>color: bl');
    const result = parser.finish();

    const edits = result.events.filter((e) => e.type === "edit");
    expect(edits).toHaveLength(0);

    expect(result.truncated).toBeDefined();
    expect(result.truncated?.tag).toBe("edit");
    expect(result.truncated?.path).toBe("style.css");
  });

  it("handles dl-edit, dl-delete, and dl-read correctly", () => {
    const parser = new AgentStreamingParser();
    const input = `
<dl-read path="config.json"/>
<dl-edit path="app.js"><dl-old>const v = 1;</dl-old><dl-new>const v = 2;</dl-new></dl-edit>
<dl-delete path="unused.txt"/>
`;
    parser.feed(input);
    const result = parser.finish();

    const read = result.events.find((e) => e.type === "read");
    expect(read).toEqual({ type: "read", path: "config.json" });

    const edit = result.events.find((e) => e.type === "edit");
    expect(edit).toEqual({
      type: "edit",
      path: "app.js",
      oldText: "const v = 1;",
      newText: "const v = 2;",
    });

    const del = result.events.find((e) => e.type === "delete");
    expect(del).toEqual({ type: "delete", path: "unused.txt" });
  });

  it("validates file paths according to strict sandbox rules", () => {
    expect(validateFilePath("index.html").valid).toBe(true);
    expect(validateFilePath("src/components/ui/button.js").valid).toBe(true);
    expect(validateFilePath("assets/logo.svg").valid).toBe(true);
    expect(validateFilePath("app/src/main/java/com/example/app/MainActivity.kt").valid).toBe(true);
    expect(validateFilePath("build.gradle.kts").valid).toBe(true);
    expect(validateFilePath(".gitignore").valid).toBe(true);
    expect(validateFilePath("Dockerfile").valid).toBe(true);
    expect(validateFilePath("LICENSE").valid).toBe(true);
    expect(validateFilePath(".env.example").valid).toBe(true);

    // Invalid cases
    expect(validateFilePath("/index.html").valid).toBe(false);
    expect(validateFilePath("../secret.txt").valid).toBe(false);
    expect(validateFilePath("1/2/3/4/5/6/7/8/9/10/11/12/13/deep.html").valid).toBe(false); // depth > 12
    expect(validateFilePath("evil.exe").valid).toBe(false); // unapproved extension
    expect(validateFilePath("").valid).toBe(false);
    expect(validateFilePath("x".repeat(301) + ".html").valid).toBe(false); // > 300 chars
  });

  it("automatically repairs unclosed CSS braces and Kotlin/Gradle delimiters", () => {
    // CSS missing closing braces
    const brokenCss = `.pricing-card {
  border: 1px solid red;

.pricing-card.pro {
  color: blue;
`;
    const cleanCss = cleanWriteContent(brokenCss, "style.css");
    const openBraces = (cleanCss.match(/\{/g) || []).length;
    const closeBraces = (cleanCss.match(/\}/g) || []).length;
    expect(openBraces).toBe(closeBraces);
    expect(cleanCss).toContain("}");

    // Gradle Kotlin DSL unclosed block
    const brokenGradle = `plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.kotlin.android)
`;
    const cleanGradle = cleanWriteContent(brokenGradle, "build.gradle.kts");
    const openGradle = (cleanGradle.match(/\{/g) || []).length;
    const closeGradle = (cleanGradle.match(/\}/g) || []).length;
    expect(openGradle).toBe(closeGradle);
  });

  it("applies file edit only when dl-old matches exactly once", () => {
    const original = "const title = 'Old';\nconsole.log(title);";

    // Successful single match
    const edit1 = applyFileEdit(original, "const title = 'Old';", "const title = 'New';");
    expect(edit1.success).toBe(true);
    expect(edit1.result).toBe("const title = 'New';\nconsole.log(title);");

    // Zero matches
    const edit2 = applyFileEdit(original, "does not exist", "foo");
    expect(edit2.success).toBe(false);
    expect(edit2.error).toContain("dl-old did not occur");

    // Multiple matches
    const multiple = "foo bar foo";
    const edit3 = applyFileEdit(multiple, "foo", "baz");
    expect(edit3.success).toBe(false);
    expect(edit3.error).toContain("must match exactly once");
  });

  it("applies file edit resiliently across different indentation and whitespace", () => {
    // 4 spaces in original, 0 or 2 spaces in dl-old
    const fileWithIndent = `function test() {
    const x = 1;
    const y = 2;
    return x + y;
}`;

    const oldWithoutIndent = `const x = 1;
const y = 2;`;

    const newWithoutIndent = `const x = 10;
const y = 20;`;

    const res = applyFileEdit(fileWithIndent, oldWithoutIndent, newWithoutIndent);
    expect(res.success).toBe(true);
    expect(res.result).toContain("    const x = 10;");
    expect(res.result).toContain("    const y = 20;");

    // Boundary newlines around tags
    const withExtraNewlines = `
    const x = 10;
    const y = 20;
`;
    const res2 = applyFileEdit(res.result!, withExtraNewlines, "    const z = 100;");
    expect(res2.success).toBe(true);
    expect(res2.result).toContain("    const z = 100;");
  });

  it("parses dl-plan and dl-step tags correctly", () => {
    const parser = new AgentStreamingParser();
    const chunks = [
      "I will build the portfolio site.\n",
      "<dl-plan>\n",
      "<dl-step>HTML Structure | Scaffold index.html with layout</dl-step>\n",
      "<dl-step>Styles | Add Tailwind or CSS styling</dl-step>\n",
      "<dl-step>Interactivity | Add light/dark theme toggle and mobile menu</dl-step>\n",
      "</dl-plan>\n",
    ];

    for (const chunk of chunks) {
      parser.feed(chunk);
    }
    const result = parser.finish();

    expect(result.plan).toContain("I will build the portfolio site.");
    const planEvent = result.events.find((e) => e.type === "plan");
    expect(planEvent).toBeDefined();
    if (planEvent && planEvent.type === "plan") {
      expect(planEvent.steps).toHaveLength(3);
      expect(planEvent.steps[0]).toEqual({
        title: "HTML Structure",
        description: "Scaffold index.html with layout",
      });
      expect(planEvent.steps[1]).toEqual({
        title: "Styles",
        description: "Add Tailwind or CSS styling",
      });
      expect(planEvent.steps[2]).toEqual({
        title: "Interactivity",
        description: "Add light/dark theme toggle and mobile menu",
      });
    }

    const stepEvents = result.events.filter((e) => e.type === "step");
    expect(stepEvents).toHaveLength(3);
  });
});
