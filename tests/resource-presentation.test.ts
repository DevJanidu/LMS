import { describe, expect, it } from "vitest";
import { fileFormat, libraryPages, resourceHref, youtubeId } from "@/components/resources/resourcePresentation";
import type { Resource } from "@/types";

const resource: Resource = { id: "file-id", userId: "user", subjectId: "subject", type: "file", title: "Course notes", createdAt: "2026-10-11T00:00:00Z" };

describe("library presentation", () => {
  it("recognizes supported YouTube URLs without accepting lookalike domains", () => {
    for (const url of ["https://youtu.be/dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"]) expect(youtubeId(url)).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtube.com.attacker.example/watch?v=dQw4w9WgXcQ")).toBeUndefined();
    expect(youtubeId("https://youtu.be/not-an-id")).toBeUndefined();
  });
  it("keeps files on their private download endpoint and only opens web URLs", () => {
    expect(resourceHref(resource)).toBe("/api/files/file-id");
    expect(resourceHref({ ...resource, type: "link", url: "javascript:alert(1)" })).toBeUndefined();
    expect(resourceHref({ ...resource, type: "link", url: "https://example.com/notes" })).toBe("https://example.com/notes");
  });
  it("derives file badges from metadata even when the title has no extension", () => {
    expect(fileFormat({ ...resource, mimeType: "application/pdf" })).toBe("PDF");
    expect(fileFormat({ ...resource, title: "Lecture.PPTX" })).toBe("PPTX");
    expect(fileFormat(resource)).toBeUndefined();
  });
  it("keeps first, last and nearby pages available for large libraries", () => {
    expect(libraryPages(1, 1)).toEqual([1]);
    expect(libraryPages(1, 5)).toEqual([1, 2, 3, 5]);
    expect(libraryPages(50, 100)).toEqual([1, 48, 49, 50, 51, 52, 100]);
    expect(libraryPages(100, 100)).toEqual([1, 98, 99, 100]);
  });
});
