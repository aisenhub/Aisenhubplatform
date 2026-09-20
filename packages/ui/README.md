# UI - @kit/ui

This package is responsible for managing the UI components and styles across the app.

This package contains two sets of components:

- `Shadcn UI`: upstream primitives kept replaceable by the shadcn CLI.
- `Upstream-adapted`: reviewed wrappers and project additions. The historical `src/makerkit/` directory name is retained for source provenance; new project-specific behavior follows this package's `AGENTS.md` rules.

## Installing a Shadcn UI component

Read this package's `AGENTS.md` before adding or wrapping a primitive so upstream-replaceable files remain separate from Aisenhub behavior.